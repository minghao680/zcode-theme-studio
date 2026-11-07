# 注入是否会触发 ZCode 账号风控 — 调查结论

> 调查日期：2026-11-07
> 触发场景：用户报告账号受限、部分功能不可用。
> **服务端返回的原文是 `request has been blocked due to unusual activity`**
> —— 这是 API 网关/WAF 的标准拦截措辞，说明拦截发生在**服务端**，不是客户端检测。

---

## 0. 结论先说

分三层，结论不同：

### 0.1 「插件本身在正常使用时会触发风控」——证据不支持

注入层**不碰账号流量、不读凭据、不改原生 API、不杀进程**（逐项证据见 §1）。
它唯一的网络出口是本地 `127.0.0.1:9337`。

### 0.2 「本机这几天的开发行为触发了服务端风控」——**这是当前最强的解释**

`unusual activity` 是服务端行为模型给出的判定，而本机在这几天确实产生了**异常的会话初始化频率**：

| 日期 | 独立主进程数（≈应用重启次数） | `firstIssuance:true` | 说明 |
| --- | --- | --- | --- |
| 2026-11-03 | **3** | 10 | 开发前基线 |
| 2026-11-04 | **31** | 68 | 首次打 asar 补丁 + 反复验证 |
| 2026-11-05 | 9 | 26 | 相对平稳 |
| 2026-11-06 | **40** | 86 | 改动最密集的一天（44 个提交） |
| 2026-11-07 | **3** | 6 | 今天（开发收尾后） |

从 3 次/天 涨到 40 次/天，是 **13 倍**。每一次重启都会在服务端产生一串
`oauth.restoreCachedSession` + `initializeConversationV4` + **`firstIssuance:true`
（身份头首次签发）**。日志实测：86 条身份头解析记录里 `firstIssuance` 为 true 的有 86 条，
false 的 0 条 —— 即**每个新 host 进程都会重新签发一次身份**。

对服务端而言，「同一账号一天内数十次重新握手、每次都签发新身份头」正是典型的
`unusual activity` 触发模式。**这是插件开发过程带来的副作用，不是插件运行时的常态。**

### 0.3 因果链的准确表述

> 不是「插件 → 风控」，而是 **「为开发插件而反复重启 ZCode → 服务端会话/身份高频重建 → 风控」**。
> 插件装好后**日常使用**不会产生这种频率（今天只有 3 次，与基线一致）。


---

## 1. 已核查项（均为否定结果）

### 1.2 注入是否读取凭据

对 `bridge.js` 计数：`localStorage` = 0、`sessionStorage` = 0、`document.cookie` = 0、
`access_token` = 0、`zcodejwttoken` = 0、`Bearer` = 0、`credentials.json` = 0。

→ **插件完全不接触任何凭据载体。**它不知道你的账号是什么，也没有能力知道。

### 1.3 插件是否会杀/重启 ZCode 进程

全仓库搜索 `taskkill` / `Stop-Process` / `ZCode.exe` / `Start-Process`：

命中的只有对 **node 自进程** 的管理（`ui-daemon` 让路、`watcher` 版本感知替换，目标是
`node.exe` 且命令行含 `ui-daemon` / `watch.mjs`）。**没有任何一处针对 `ZCode.exe`。**

特别地：v1.12.x 曾做过「一键重启 ZCode」功能，但已在 v1.12.3 **回退**，现在只剩
`location.reload()`（只重载渲染页面，不重启应用进程）。这一点很关键——它意味着
**插件日常不会制造 §0.2 里那种会话重建**。

### 1.4 注入是否改写原生 API（指纹检测的常见抓手）

对已部署的 `bridge.js`（145 KB）做模式匹配：

| 检测点 | 命中次数 | 含义 |
| --- | --- | --- |
| `Object.defineProperty(window` | 0 | 未劫持全局属性 |
| `window.fetch =` | 0 | 未替换 fetch |
| `XMLHttpRequest.prototype` | 0 | 未改 XHR 原型 |
| `navigator.` | 0 | 未伪造 UA / webdriver 等指纹 |
| `Function.prototype` | 0 | 未做 toString 欺骗 |

插件只做两件事：往 `document.head` 插 `<style>`、往 `body` 插若干 `div`（壁纸层/面板/按钮），
并在 `window` 上挂 `__ZTHEME_*` 系列自有变量。

**残留特征**：`window.__ZTHEME_CONFIG` / `__ZTHEME_APPLY` 等 103 处、`data-zt-*` 属性 61 处、
`#zt-style` / `#zt-wallpaper` 等固定 id。这些是**可枚举的**，如果服务端通过某种方式
（例如 WebContents 远程调试、或未来加入的 DOM 上报）读取，是可以被识别的。
当前没有发现这类上报通道（见 §1.7）。

### 1.5 注入是否触碰认证/业务请求

对 `bridge.js` 提取所有字面量 URL：

```
http://127.0.0.1:9337
http://127.0.0.1:9337/we/engine.js
http://127.0.0.1:9337/we/media/
http://127.0.0.1:9337/we/renderer.html
http://127.0.0.1:9337/zt/apply
http://127.0.0.1:9337/zt/bing-apply
http://127.0.0.1:9337/zt/bing?n=8
http://127.0.0.1:9337/zt/import?name=
http://127.0.0.1:9337/zt/scene-report
```

对以下字符串计数：`bigmodel` = 0、`z.ai` = 0、`zcode.z` = 0、`/api/` = 0、`oauth` = 0、
`Authorization` = 0。

即：**插件从不参与、不代理、不修改、不重放任何带凭据的请求。**

### 1.6 ZCode 客户端是否存在反注入 / 防篡改检测

从 `app.asar` 提取全部 22 个主进程 bundle（`out/main/*.js`）并搜索：

| 关键字 | 命中 | 实际用途 |
| --- | --- | --- |
| `integrity` | 12 处 | **全部无关**，见下 |
| `tamper` | 1 处 | CUA 助手拖拽前校验**它自己**下载的 helper bundle 是否被篡改 |
| `remote-debugging` | 2 处 | ① 内置 Chrome helper（`--remote-debugging-port=0`，读 localStorage）② **仅未打包开发态**才 `appendSwitch('remote-debugging-port','9229')`，且受 `ZCODE_DISABLE_FIXED_REMOTE_DEBUGGING_PORT` 控制 |
| `findWindowsProcessesReferencingResourceMarkers` | 1 处 | **更新前清理占用文件锁的进程**，与反作弊无关 |

`integrity` 的 12 处逐个看过，分别是：
- 会话分享的 `projection_sha256` / `artifact_set_sha256` 校验（业务功能）
- 下载 artifact 时比对 `content-length` / `sha256`（业务功能）
- SSH 私钥错误信息正则 `/key integrity check failed/`（字符串匹配）
- Playwright 注入脚本的自检（`__toCommonJS(injectedScript_exports)`）
- Chromium 崩溃原因枚举里的 `integrity-failure`（渲染进程崩溃分类）

**没有一处校验 `app.asar` 是否被修改，也没有一处检测渲染进程里是否存在外来 DOM/全局变量。**

### 1.7 本地日志里有没有 401/403

`~/.zcode/v2/logs/` 按天记录：

| 日期 | `[error]` 行数 | 真正的 HTTP 401/403 |
| --- | --- | --- |
| 2026-11-07（当天） | **0** | **0** |
| 2026-11-06 | 113 | 0（严格正则排除时间戳后仍是 0） |
| 2026-11-05 | 99 | 0 |

严格匹配方式：先抹掉形如 `11:11:42.403` 的时间戳，再用
`\b(401|403)\b(?!\d)|Unauthorized|Forbidden|invalid_token|token (has )?expired|AUTH_`
匹配。命中的全是 `BIGMODEL_OAUTH_APP_SECRET source: fallback`（被 `SECRET` 误伤）。

→ **客户端日志里不存在被拒绝的 HTTP 请求记录。**

### 1.8 凭据是否本地损坏/过期

`~/.zcode/v2/credentials.json` 中 7 个条目**全部是 Electron `safeStorage`（Windows DPAPI）加密后的密文**
（`zwh…` 前缀的二进制）。这是正确的安全设计，也意味着**本地无法判断 token 是否过期**。
需要提醒：我读取时只解出了 key 名和密文长度，没有任何明文外泄；也请你知悉这一点。

---

## 2. 仍然无法排除的可能（诚实清单）

按可能性排序：

1. **服务端行为模型的判定（最可能，且已有强证据支持）**
   `request has been blocked due to unusual activity` 是网关措辞，判定完全发生在服务端。
   本机这几天 31 / 40 次的应用重启、68 / 86 次身份头重新签发（§0.2），
   对服务端就是"异常活动"的教科书特征。**客户端日志里查不到 401/403 也正好吻合**——
   因为拦截发生在服务端返回的路上，ZCode 只是把错误原样展示，没写本地日志（已验证：
   在全部日志里搜 `unusual activity` / `has been blocked`，命中数为 0）。

2. **asar 补丁改变安装完整性（低可能）**
   若某通道上报 `app.asar` 的 hash/size，补丁会使其不一致。但已核查：客户端**没有**
   采集并上报 asar 哈希的代码（22 个主进程 bundle 全查过），`app-update.yml` 也无 hash 字段。

3. **账号在其它设备/客户端的使用（无数据，无法排除）**
   与主题插件无关。

4. **CDP 调试端口（真实风险，但非本问题原因）**
   `--remote-debugging-port=9333` 会**开放一个无认证的本地端口**，任何本机进程都能连上去
   读页面、执行脚本，包括读取已登录的会话内容。这是**比主题注入严重得多的安全暴露面**。
   当前实测为 0 个进程带此参数（说明你现在是更安全的补丁模式），但值得写进使用须知。

---

## 3. 建议的安全姿态（按性价比排序）

### 3.1 立刻可做：放弃 CDP 模式，只用 asar 补丁模式

CDP 模式需要 `--remote-debugging-port=9333` 常驻，这等于**给本机任意进程开了一个
可以直接操作你已登录会话的后门**。asar 补丁模式不需要任何调试端口，注入产物同样是
`bridge.js`。

- 如果你现在用的是「ZCode (主题版)」快捷方式 → 改用普通启动即可
- 检查方式：`Get-CimInstance Win32_Process -Filter "Name='ZCode.exe'" | ? { $_.CommandLine -like '*remote-debugging*' }`
  （当前实测：**0 个进程带该参数**，说明你现在就是补丁模式 —— 这一步已经是安全的）

### 3.2 最该做的一件事：停止高频率重启 ZCode（这才是元凶）

既然证据指向「重启频率 → 服务端风控」，那么恢复正常使用节奏就是最直接的解法：

- **日常使用不需要重启**。改主题/壁纸用面板的**重载按钮**（`location.reload()`，只重载渲染页），
  不要退出应用再启动
- **改插件代码时才需要重启**，且开发应集中批量做，避免一天 30–40 次
- 开发调试优先用「重载按钮」；只有改 `bridge.js` 生成逻辑或 daemon 代码时才重启应用

### 3.3 若想用实验证明因果

关掉插件（面板总开关 / `assets/asar-restore.ps1` 还原 asar）**并保持正常使用节奏**跑一两天。
- 若账号恢复 → 说明确实与插件或其开发期副作用相关
- 若仍受限 → 问题完全在插件之外（找服务端申诉/等待解封）

⚠️ 注意：单纯「关掉插件但仍一天重启 40 次」证明不了任何事——那个变量必须一起控制。

### 3.4 不建议做的（除非有新证据）

- 去掉固定 id / 类名前缀（`zt-` → 随机串）、不挂 `window.__ZTHEME_*`。
  这些改造在**没有证据**支撑时只是自我安慰，且会显著牺牲可维护性。
  而且在 §1 里已经证明插件不碰凭据、不碰认证流量——特征面本来就不在镜头上。

---

## 4. 复现/验证方法（给下一个接手的人）

```powershell
# 1) 是否开着调试端口（最大的安全暴露面）
Get-CimInstance Win32_Process -Filter "Name='ZCode.exe'" |
  Where-Object { $_.CommandLine -like '*remote-debugging*' } |
  Select-Object ProcessId, CommandLine

# 2) 当天有没有真正的 HTTP 失败（先抹时间戳避免误伤）
Get-Content "$env:USERPROFILE\.zcode\v2\logs\$(Get-Date -f yyyy-MM-dd).log" |
  ForEach-Object { $_ -replace '\d\d:\d\d:\d\d\.\d{3}','<TS>' } |
  Select-String -Pattern '\b(401|403)\b(?!\d)|Unauthorized|Forbidden|invalid_token'

# 3) 注入层有没有碰认证流量（应为 0）
Select-String -Path "$env:USERPROFILE\.zcode\zcode-theme-studio\bridge.js" `
  -Pattern 'bigmodel|z\.ai|oauth|Authorization|/api/' | Measure-Object

# 4) 注入层有没有读凭据（应为 0）
Select-String -Path "$env:USERPROFILE\.zcode\zcode-theme-studio\bridge.js" `
  -Pattern 'localStorage|sessionStorage|document\.cookie|access_token|Bearer' | Measure-Object

# 5) 【核心指标】每天的应用重启次数 —— 这是与 unusual activity 相关的变量
foreach ($n in '2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-07') {
  $f = "$env:USERPROFILE\.zcode\v2\logs\$n.log"
  if (-not (Test-Path $f)) { continue }
  $pids = Get-Content $f | Select-String '\[main\] \[spawnHostProcess\]' |
    ForEach-Object { if ($_.Line -match '\[pid:(\d+)\]') { $matches[1] } } | Sort-Object -Unique
  "{0}  重启次数={1}" -f $n, $pids.Count
}

# 6) 服务端拦截原文是否落到本地日志（实测 0，说明只在 UI 展示）
Select-String -Path "$env:USERPROFILE\.zcode\v2\logs\*.log" `
  -Pattern 'unusual activity|has been blocked' | Measure-Object
```

---

## 5. 一句话交接

> **`unusual activity` 是服务端网关的判定，不是客户端检测。**
> 插件本身在正常使用时是无辜的：不碰凭据、不碰认证流量、不改原生 API、不杀进程、
> 唯一出口是本地 9337 端口（§1 逐项实证）。
> 但**为开发它而反复重启 ZCode**（11-04 达 31 次、11-06 达 40 次，基线仅 3 次），
> 每次重启都会重建会话并重新签发身份头，这正好构成服务端眼中的"异常活动"。
> **解法：日常使用别再频繁重启应用**（用面板重载按钮），开发集中批量做。
> 另外 CDP 模式会开放一个无认证的本地端口，能操作你已登录的会话——别用它。

