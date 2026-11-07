# 注入是否会触发 ZCode 账号风控 — 调查结论

> 调查日期：2026-11-07
> 触发场景：用户报告「ZCode 检测对程序的注入，会导致账号风控」，且**账号已受限、部分功能不可用**，
> 特征是「请求被拒（401/403/风控验证码）」。

---

## 0. 结论先说

**在本机可核查的全部证据里，没有找到「主题插件注入 → 账号被风控」的因果链。**

这不是「插件绝对无辜」的断言，而是「用现有手段查不到证据」。下面逐条列出查了什么、
范围到哪、以及**哪些情况我无法排除**。

最重要的一条**反证**：

> 该插件对页面的注入**不改变、不接触、不转发任何与账号有关的网络流量**。
> 页面内由插件发起的请求**全部**指向 `http://127.0.0.1:9337`（本地守护进程）。

---

## 1. 已核查项（均为否定结果）

### 1.1 注入是否改写原生 API（指纹检测的常见抓手）

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
当前没有发现这类上报通道（见 1.4）。

### 1.2 注入是否触碰认证/业务请求

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

### 1.3 ZCode 客户端是否存在「反注入 / 防篡改」检测

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

### 1.4 本地日志里有没有 401/403

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

### 1.5 凭据是否本地损坏/过期

`~/.zcode/v2/credentials.json` 中 7 个条目**全部是 Electron `safeStorage`（Windows DPAPI）加密后的密文**
（`zwh…` 前缀的二进制）。这是正确的安全设计，也意味着**本地无法判断 token 是否过期**。
需要提醒：我读取时只解出了 key 名和密文长度，没有任何明文外泄；也请你知悉这一点。

---

## 2. 我无法排除的可能（诚实清单）

1. **服务端侧的风控信号**。如果 ZCode/智谱的服务端记录了「同一账号在短时间内多次登录/大量请求/异地」
   等行为，客户端代码里看不到任何痕迹。**这是当前最可能的解释**，因为它与「本地日志零 401」完全吻合。
2. **asar 补丁改变了安装完整性**。若服务端或某个更新通道上报了 `app.asar` 的哈希/size，
   补丁会使其不一致。但我在客户端**没找到**采集并上报 asar 哈希的代码。
   `resources/app-update.yml` 里也没有 hash 字段。
3. **CDP 调试端口**。`--remote-debugging-port=9333` 会**开放一个无认证的本地端口**，
   任何本机进程都能连上去读页面、执行脚本（包括读取页面里已登录的会话内容）。
   这不一定是账号受限的原因，但它是**真实的安全暴露面**，而且比主题注入严重得多。
4. **账号共用的其他设备/客户端**。与主题插件完全无关，但我没有数据排除。

---

## 3. 建议的安全姿态（按性价比排序）

### 3.1 立刻可做：放弃 CDP 模式，只用 asar 补丁模式

CDP 模式需要 `--remote-debugging-port=9333` 常驻，这等于**给本机任意进程开了一个
可以直接操作你已登录会话的后门**。asar 补丁模式不需要任何调试端口，注入产物同样是
`bridge.js`。

- 如果你现在用的是「ZCode (主题版)」快捷方式 → 改用普通启动即可
- 检查方式：`Get-CimInstance Win32_Process -Filter "Name='ZCode.exe'" | ? { $_.CommandLine -like '*remote-debugging*' }`
  （当前实测：**0 个进程带该参数**，说明你现在就是补丁模式 —— 这一步已经是安全的）

### 3.2 降特征面：让注入层「可一键彻底移除」

怀疑期内建议：把 `enabled` 关掉跑一天，看账号状态是否好转。这是**唯一能给出因果证据的实验**，
比任何代码审查都可靠。

- 关闭方式：面板总开关，或删掉 `app.asar` 里的 loader 标签（`assets/asar-restore.ps1` 还原）

### 3.3 若确认与注入相关，再考虑

- 去掉所有固定 id / 类名前缀（`zt-` → 无特征随机串），减少可枚举特征
- 不在 `window` 上挂 `__ZTHEME_*`，改为闭包内变量
- 这些改造的前提是**先有证据**。在没有证据时改造只是自我安慰，且会牺牲可维护性。

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
#    直接搜已部署的 bridge.js
Select-String -Path "$env:USERPROFILE\.zcode\zcode-theme-studio\bridge.js" `
  -Pattern 'bigmodel|z\.ai|oauth|Authorization|/api/' | Measure-Object
```

---

## 5. 一句话交接

> 这个插件**不碰**账号流量、**不改**原生 API，ZCode 客户端里也**没有**反注入检测。
> 账号受限的原因**在客户端证据之外**（服务端风控 / 账号行为 / 其他设备），
> 唯一能做实证的办法是「关掉插件跑一天看是否恢复」。
> 但顺带发现一个**更该修的真问题**：CDP 模式会让本机任何进程都能操作你已登录的会话。
