# ZCode Theme Studio — 交接文档

> 面向接手开发的 agent / 开发者。读完这份文档，你应该能：理解架构、知道改哪里、知道怎么验证、知道哪些坑已经踩过。
>
> 最后更新：2026-11-07（v1.13.8）

---

## 0. 一句话概括

给 **ZCode 桌面端**（Electron 应用，非 VSCode fork）做的**深度换肤 + 壁纸插件**：主题预设、23 个设计令牌实时调色、自定义方案、Wallpaper Engine 壁纸（video/image/scene 实时渲染）、本地导入、必应每日、液态玻璃、主题色蒙层。侧栏内置「主题工作台」可视化面板。

- 源码：`G:\VSCode-idea\plugins\zcode-theme-studio`
- 远程：`https://github.com/minghao680/zcode-theme-studio`（分支 `master`）
- 本地测试市场：`G:\VSCode-idea\plugins\marketplace.json`（指向 `./zcode-theme-studio`）
- 当前版本：**1.13.8**，MIT

---

## 1. 当前状态快照

| 项 | 值 |
| --- | --- |
| ZCode 版本 | 3.17.2（Electron 44.7.0） |
| 安装路径 | `C:\Program Files\ZCode` |
| asar 补丁 | **已打**：`out/renderer/index.html` 含 marker，loader 标签恰好 1 个，指向 canonical bridge |
| optin 标记 | `~/.zcode/zcode-theme-studio/asar-patch.optin` 存在（自愈已启用） |
| 运行中进程 | ui-daemon（1 个）+ watch.mjs（1 个），端口 9337 正常返回 200 |
| 当前 material | `frosted`（磨砂玻璃） |
| 当前预设 | `forest`（森林绿） |
| 当前壁纸 | `3350529088`（枫糖 video，fit=cover） |
| 主题蒙层 | `tintMode: clear`（关闭），`veilOpacity: 50` |
| 场景画质 | `sceneRenderDpr: 0.5`、`sceneFps: 30` |
| 面板/侧栏不透明度 | 75 / 75 |

### 关于安装缓存目录（**必读**）

实际被 ZCode 加载的插件代码**不在源码目录**，而在这里：

```
%USERPROFILE%\.zcode\cli\plugins\cache\dev-vscode-idea-plugins\zcode-theme-studio\1.6.0\
```

⚠️ 目录名 `1.6.0` 是历史遗留（首次安装时的版本），**里面 `.zcode-plugin/plugin.json` 的 version 已随每次发版同步更新为 1.13.8**。版本判断读的是文件内容，不是目录名，所以不要"纠正"目录名，否则会打断现有安装。

**改完源码必须做的事**（否则你的改动完全不生效）：

1. 把改动的 `lib/*.mjs`、`hooks/*.mjs`、`ui-daemon.mjs`、`watch.mjs`、`assets/*`、`.zcode-plugin/plugin.json` 复制到上面的 cache 目录
2. 杀掉所有 `ui-daemon.mjs` / `watch.mjs` 的 node 进程
3. 重新拉起 daemon（见 §7.2）
4. 触发一次 `POST /zt/apply` 重建 bridge.js
5. 重启 ZCode（或让页面重载）让新 bridge 执行

`lib/**` 是 ESM 模块，**运行中的 daemon 会缓存旧模块**——只复制文件不重启进程，等于没改。

---

## 2. 运行架构

### 2.1 两种启动模式

| 模式 | 机制 | 何时生效 |
| --- | --- | --- |
| **CDP 注入** | 快捷方式带 `--remote-debugging-port=9333`；`watch.mjs` 常驻持有 DevTools WebSocket，用 `Page.addScriptToEvaluateOnNewDocument` 注册 bootstrap | 每次页面加载自动重放 |
| **asar 补丁** | 改写 `app.asar` 里 `out/renderer/index.html`，插入 `<script src="file:///…/bridge.js">` | 普通双击启动即生效 |

两条路径**最终产物相同**：都让页面执行 `~/.zcode/zcode-theme-studio/bridge.js`。

⚠️ CDP 脚本注册是**会话级**的：WebSocket 一断就失效。所以必须有常驻 watcher 持有连接，不能只在会话开始时注入一次。

### 2.2 进程与数据流

```
[ZCode 渲染进程]
   └─ bridge.js（静态文件，页面加载时执行一次）
        ├─ window.__ZTHEME_CONFIG = <payload>   ← 内联快照
        ├─ BOOTSTRAP（主题引擎）                 ← lib/engine.mjs 导出
        ├─ UI_SOURCE（侧栏面板）                 ← lib/ui.mjs 导出
        └─ refresher：每 3s XHR 读 config-snapshot.json，哈希变化才 __ZTHEME_APPLY

[ui-daemon.mjs]  常驻，监听 127.0.0.1:9337
   ├─ /zt/apply        面板改配置 → 写 config.json → 重建 bridge.js + snapshot → 回传新 payload
   ├─ /zt/import       本地导入（图片/视频，最多 500MB）
   ├─ /zt/bing         必应每日列表（服务端拉取，绕 CORS）
   ├─ /zt/bing-apply   下载必应图 → 注册为导入项 → 应用
   ├─ /zt/scene-report 页面诊断上报（落 endpoint.log）
   └─ /we/*            WebWallGL 引擎、scene.pkg/media/shader（HEAD + Range 206）

[watch.mjs]      常驻（CDP 模式），热应用配置、轮换壁纸、持有 CDP 会话
[hooks/startup.mjs] → 立即退出（<500ms）；spawn startup-worker.mjs (detached)
   └─ startup-worker：确保 daemon + watcher（版本感知）、asar 自愈
```

### 2.3 配置的三份副本

| 路径 | 角色 |
| --- | --- |
| `%USERPROFILE%\.zcode\cli\plugins\data\zcode-theme-studio@dev-vscode-idea-plugins\config.json` | **canonical 真源**（`ZCODE_PLUGIN_DATA`） |
| `%USERPROFILE%\.zcode\zcode-theme-studio\bridge.js` + `config-snapshot.json` | canonical 注入产物（asar loader 指向这里） |
| `%USERPROFILE%\.zcode\zcode-theme-studio.config.json` | **遗留镜像**，server.mjs 只写不读，已过时 → 不要依赖 |

`configPath()` / `resolveConfigPath()` 在**没有 `ZCODE_PLUGIN_DATA` 环境变量**时，会扫描 `plugins/data/zcode-theme-studio@*/config.json` 取 mtime 最新者。**曾经因为回退到遗留镜像导致壁纸被写空**（见 §8）。

---

## 3. 文件地图

```
zcode-theme-studio/
├── .zcode-plugin/plugin.json   插件清单：MCP server 定义、hook、userConfig（版本号在这里）
├── server.mjs                  550 行  MCP server（10 个工具）+ env→config 同步 + 旧版面板兼容
├── inject.mjs                  CDP 一次性注入器（hook 与 MCP 共用）
├── ui-daemon.mjs               106 行  常驻端点守护：重复检测/让路、绑定校验、watchdog
├── watch.mjs                   221 行  CDP 常驻 watcher：热应用、轮换、版本自锁
├── hooks/
│   ├── hooks.json              SessionStart → startup.mjs（timeout 5000ms）
│   ├── startup.mjs             17 行  快速返回，spawn worker 后退出
│   ├── startup-worker.mjs      132 行 detached：daemon/watcher 拉起 + asar 自愈
│   └── selfheal.mjs            55 行  SessionStart 自愈（补丁丢失时重打）
├── lib/
│   ├── engine.mjs              1265 行 ★核心：BOOTSTRAP（页面内引擎）+ buildPayload
│   ├── ui.mjs                  1107 行 ★侧栏面板 UI_SOURCE（模板字符串，全是 ES5）
│   ├── uiendpoint.mjs          500 行 ★9337 端点：apply/import/bing/scene 路由
│   ├── themes.mjs              239 行 ★CSS 生成：令牌、material、菜单、veil、boot gate
│   ├── bridge.mjs              134 行 bridge.js 生成、loader 标签注入/清理、payload 序列化
│   ├── scanner.mjs             172 行 WE 工坊/本地项目扫描 → catalog + wallpaperRef
│   ├── presets.json            8 套预设（每套 6 个核心令牌 + tint 变体）
│   ├── palette.mjs             89 行  宿主侧解析具体 hex（payload.palette）
│   ├── asar.mjs                162 行 asar 读写（header 偏移平移 + integrity 重算）
│   ├── cdp.mjs                 73 行  CDP 连接封装
│   ├── scene-renderer.mjs      148 行 独立场景渲染页（/we/renderer.html，遗留/测试用）
│   ├── sync.mjs                46 行  同步 bridge（server/worker 共用）
│   └── selectors.json          结构选择器（shell / glass 候选）
├── assets/
│   ├── webwallgl/              WebWallGL v3.0.0（MIT，vendored 1.1MB）
│   ├── asar-patch.ps1          补丁脚本（自提权、备份、回读校验、canonical config）
│   ├── asar-restore.ps1        还原
│   ├── patch-wizard.ps1        交互式向导（等待 ZCode 退出→打补丁→校验）
│   └── shortcut-helper.ps1     生成「ZCode (主题版)」快捷方式
├── commands/theme.md           /theme 命令
├── skills/zcode-theme-studio/  SKILL.md（给 agent 的功能说明）
└── README.md                   功能与用法（部分内容已过时，见 §9）
```

★ = 改功能时 90% 会动的文件。

---

## 4. 核心机制

### 4.1 payload（页面拿到的全部数据）

`buildPayload(cfg, catalog)` in `lib/engine.mjs`。关键字段：

```
enabled, css, wallpaper{id,type,mediaUrl,previewUrl,fit,dim,blur,dimRgb,sceneSrc,mediaBase,rendererUrl,engineUrl}
material('frosted'|'clear'|'solid'), sidebarGlass, glassSidebarBlur, glassPanelBlur, unifySidebar
tintMode('veil'|'clear'), veilOpacity
sceneRenderDpr, sceneFps, sceneAutoQuality
presets[], customPresets[], catalog[], overrides{}, palette{token:hex}
active{preset,fit,dim,blur,surfaceOpacity,sidebarOpacity,bubbleOpacity,material,tintMode,veilOpacity,…}
```

⚠️ **顶层 vs `active` 的坑**：引擎的 `apply()`/`buildVeil()`/`applyShell()` 读 **顶层** `CFG.x`；面板 UI 初始渲染读 `active.x`。两边都要写，否则"配置改了但引擎读不到"（曾导致侧栏材质开关完全失效、蒙层元素从未创建）。改任何新开关时**两个位置都要加**。

### 4.2 主题 CSS（`lib/themes.mjs`）

`buildThemeCss(cfg)` 输出整段 CSS，注入 `<style id="zt-style">`。

- **令牌层**：`:root, html.dark, html { --color-*: … }`，用 `color-mix()` 做半透明
- **壁纸模式**：`--color-background` / `-alt` / `-win-alt` 必须 `transparent`（这三个被全视口壳层使用，给它们上色 = 整窗蒙一层主题色）
- **boot gate**：`html[data-zt-boot]` 下所有表面回退为 100% 不透明，壁纸绘制完成后由引擎移除属性，避免启动时"透明面板叠在深色底上"的雾感
- **material 三态**（填色与模糊必须成对）：
  - `frosted`：surface token 半透明 + 玻璃 blur
  - `clear`：全透明、无模糊（壁纸原样）
  - `solid`：100% 不透明、无模糊
  - 早期把"填色"和"模糊"拆成两个独立开关，产生了"半透明无模糊"的非法组合 → 每个卡片透出不同壁纸 → 一块块色斑。**不要再拆开**
- **菜单/弹层**：`[role='menu'|'listbox'|'dialog']` 与 `[data-radix-popper-content-wrapper] > *` 由 CSS 直接上色（容器一层填充，后代 `background: transparent`，`[role=separator]` 例外并显式着色）
- **玻璃**：`.zt-glass` 只剩 `backdrop-filter`；背景一律由 `--color-sidebar` 决定（曾给玻璃节点加 `background-color !important` 上限，把侧栏不透明度滑杆彻底压死）

### 4.3 页面内引擎（`lib/engine.mjs` 的 `BOOTSTRAP`）

纯 ES5、无模板字符串（因为整个 BOOTSTRAP 本身是一个模板字符串）。执行顺序：

```
DOMContentLoaded → apply()
  ├─ ensureStyle('zt-style', CFG.css)
  ├─ applyOverrideStyle(CFG.overrides)      # 独立 <style id="zt-overrides">，调色盘实时预览走这里
  ├─ 注入 #root{position:relative;z-index:1} + html,body transparent
  ├─ buildWallpaper(CFG.wallpaper)          # 见 §4.4
  ├─ autoDimFor / applyAutoDim              # 依预览图亮度自动加压暗（只增强用户值）
  ├─ applyShell()                           # 玻璃组标记 + shell 透明化
  ├─ tagUserBubbles()                       # 按几何尺寸标记真实消息气泡
  ├─ styleFloatingPanels()                  # 浮层/工具条补实底
  └─ 三次延迟重扫（120/400/1000ms）          # 捕获过渡态的浮层
```

常驻定时器：3s 自愈（缺哪补哪；媒体 key 未变不重建，避免视频闪烁）+ MutationObserver 脏标记驱动气泡重扫。

### 4.4 壁纸三种类型

| type | 渲染 | fit |
| --- | --- | --- |
| `video` | `<video muted loop autoplay>`；contain 时底层加同源模糊副本填黑边 | cover（默认） |
| `image` / `gif` / `web` | 背景图 / iframe | cover |
| `scene` | **进程内** WebWallGL：`canvasHost` + `createScene()`，静态 preview 先行、出帧后 canvas 淡入并移除占位图 | cover |

**scene 挂载的持久重试**（重要）：daemon 可能晚于页面就绪，早期只重试 3 次（约 7.5s）就永久放弃 → 一直停在 preview.gif（200×150 被 cover 放大 8 倍 = 巨大模糊色块，用户报"缩放居中炸了"）。现在是 5s 心跳、最长 10 分钟，且 canvas 丢失后自动重挂。

场景画质：`renderDpr`（0=自动，否则 0.5~2）、`fps`、`autoQuality` 在 `createScene` 时读取 → **改这些值必须重挂载**（面板在 `change` 事件里清 `__ZTHEME_WP_KEY`）。

### 4.5 侧栏入口与窗口按钮

侧栏「主题工作台」按钮和「重载」按钮都是 **fixed 定位的覆盖层**，**绝不插入 React DOM 树**——外来节点会让 React reconciliation 抛 `removeChild` 并卸载整棵树（曾表现为"只剩壁纸、UI 全没"）。

- 侧栏入口：镜像「插件市场」按钮的 rect，克隆其 class 以获得原生外观；`z-index: 2147482000`（必须显式！否则被 React 层盖住，看得见点不到）
- 重载按钮：`location.reload()`，锚定窗口控件组左侧

### 4.6 诊断通道（没有 CDP 也能排查）

页面把关键事件 `POST /zt/scene-report`（text/plain），daemon 写 `%USERPROFILE%\.zcode\zcode-theme-studio.endpoint.log`：

| stage | 含义 |
| --- | --- |
| `engine-script-append` / `engine-loaded` / `create-ok` / `mounted` | scene 挂载链路 |
| `probe-black` / `probe-no-canvas` / `load-reject` / `engine-timeout` | scene 失败原因 |
| `frames-sample` / `fps-lowered` | 实际帧率 |
| `glass-groups` | `sidebarNodes=N glass=? filter="…" native="…" markedSidebar=? panel=?` |
| `sidebar-geo-found` / `sidebar-geo-miss` / `sidebar-selector-hit` | 侧栏定位 |
| `fullscreen-tints` | 覆盖 ≥80% 视口且仍带不透明背景的元素 |
| `ui-panel-build` | 面板构建异常（`reportUiError`） |

**排查用户现场的第一动作：看这个日志**，不要靠猜。

---

## 5. 配置项速查

`config.json`（canonical）主要字段：

```json
{
  "version": 2,
  "material": "frosted | clear | solid",
  "theme": { "preset": "starsea-blue", "overrides": {} },
  "overrides": {},                       // 顶层与 theme.overrides 双写
  "customPresets": [ { id, name, preset, overrides, glass, surfaceOpacity, … } ],
  "wallpaper": { "id","type","mediaUrl","previewUrl","sceneSrc","mediaBase","rendererUrl","fit","dim","blur","dimRgb" },
  "surfaceOpacity": 75, "sidebarOpacity": 75, "bubbleOpacity": 75,
  "glass": { "enabled": true, "blur": 35, "style": "liquid|frosted" },
  "glassSidebarBlur": null, "glassPanelBlur": null,   // 0/null = 不干预
  "tintMode": "clear|veil", "veilOpacity": 45,
  "sceneRenderDpr": 0.5, "sceneFps": 30, "sceneAutoQuality": true
}
```

遗留字段 `flatSurfaces` / `sidebarGlass` / `unifySidebar` 仍被部分代码读取，但**已由 `material` 接管**；`unifySidebar === false` 会被当作"显式退出统一"，可能导致侧栏用更深的 tint 而与右侧不一致。**建议清理这三个字段**。

---

## 6. 面板 UI（`lib/ui.mjs`）

- 整个面板是 `UI_SOURCE` 模板字符串里的一个 IIFE，纯 ES5
- 区块顺序：配色预设 → 我的方案（快照）→ 壁纸（含「导入本地」「必应每日」）→ 调整（压暗/背景模糊/场景画质/面板/侧栏/气泡/侧栏材质/强度/控件底色→已并入 material/蒙层/蒙层浓度/玻璃模糊）→ 调色盘（23 token，各带 alpha 滑杆）→ 底部动作
- 持久化：`pushConfig(patch)` 入队 → 400ms 批量 `POST /zt/apply` → 用回传的 `payload` 立即 `__ZTHEME_APPLY`
- **实时预览**必须走 `overrides` 或内联样式（`__ZTHEME_APPLY` 复用预生成的 CSS 字符串，改字段不会重建样式表）

⚠️ **`rebuildPanel()` 必须真正移除节点**：`closePanel()` 只设 `data-open=0`，`openPanel()` 见节点存在就早退 → 保存方案后 chip 不出现。

---

## 7. 开发工作流

### 7.1 改代码

1. 改源码目录下的文件
2. `node --check lib/xxx.mjs`（至少语法）
3. 复制到 cache 目录（§1）
4. 重启进程 → 重建 bridge → 重启 ZCode 验证

### 7.2 进程操作

```bash
# 看谁在跑
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -like '*ui-daemon*' -or \$_.CommandLine -like '*watch.mjs*' } | Select-Object ProcessId,CommandLine"

# 杀掉全部 daemon/watch
#（用 .dev/reset-processes.mjs，或用上面的命令拿 pid 后 process.kill）

# 拉起（cache 目录里的副本！）
node "<CACHE>\ui-daemon.mjs"   # detached
node "<CACHE>\watch.mjs" --hook

# 重建 bridge（同时返回新 payload）
curl -s -X POST http://127.0.0.1:9337/zt/apply -H "Content-Type: application/json" -d '{"patches":[]}'
```

⚠️ **不要同时起两个 daemon**：`ui-daemon.mjs` 启动时会探测，若已有同版本健康实例就 `standing down` 退出；但版本号不一致时会杀掉旧实例再抢端口，中间的窗口期会让端点请求全部失败。

### 7.3 验证手段（按成本从低到高）

| 手段 | 位置 | 说明 |
| --- | --- | --- |
| **node:vm 跑整份 bridge** | `.dev/bridge-vm2.mjs` | 最小 DOM stub 执行 bridge.js，能精确报出第一处抛错的行号。**最快的语法/运行时验证** |
| 纯函数单测 | `.dev/test-menus.mjs`、`test-floating.mjs`、`test-reload-btn.mjs`、`test-sidebar-glass.mjs`、`test-panel-click.mjs` | 从 `ui.mjs`/`engine.mjs` 里 `extract()` 出函数，喂假 DOM |
| 端点实测 | `curl` | 只验证 config/payload 层，不验证页面渲染 |
| CDP 实操 | 临时实例（`%TEMP%\zcode-asar-test`，带 `--remote-debugging-port` + 独立 `--user-data-dir`） | 能读 DOM/截图。**注意单实例锁**：主实例在跑时，从其它路径启动可能被转交请求后退出 |
| Win32 截图 | PowerShell + `System.Drawing.CopyFromScreen` | 唯一能看用户真实窗口（无 CDP）的手段；注意切换窗口瞬间会抓到过渡帧 |

### 7.4 `.dev/` 目录

`G:\VSCode-idea\plugins\.dev\`（**已 gitignore，不入库**）有 140+ 个脚本，常用的：

- `reset-processes.mjs` — 杀光 daemon/watch 并从 cache 重拉
- `bridge-vm2.mjs` — 最小 stub 执行 bridge，定位抛错
- `test-*.mjs` — 各功能单测
- `mcp-run.mjs` — 通过 MCP 工具名直接调用（验证工具面）
- `probe-*.mjs` / `dpr1-probe.mjs` / `gpu-probe.mjs` — CDP 现场探测
- `shot-*.png` — 历次截图证据

---

## 8. 已知问题（按优先级）

### ✅ 已修（v1.13.8）— 二级菜单打不开

现象：右键菜单/账户菜单里**前几项（界面语言/界面主题/界面模式/界面缩放）点开后没有二级菜单**，后面没有子菜单的项正常。

这个 bug 有**两层**原因，只修第一层不够（v1.13.6 修了一半，用户重启后仍复现）：

**第一层 — 子菜单被清成透明**（v1.13.6 已修）
清空后代的规则命中了嵌套的子菜单：
```css
[role='menu'] *:not([role='separator']), … { background: transparent !important; }
```
子菜单自己也是 `[role='menu']` 且是父菜单后代 → 被刷成透明。
修法：每个逗号段追加 `:not([role='menu']):not([role='listbox']):not([role='dialog'])`。

**第二层 — `backdrop-filter` 破坏 fixed 定位**（v1.13.8 才修好，这才是"弹不出来"的主因）
- Radix 的 `MenuSubContent` **不走 `MenuPortal`**（CLI 已从 ZCode 渲染包 `out/renderer/assets/styles-*.js` 证实），渲染在父菜单 DOM 内部
- 它用 `strategy='fixed'` 定位
- CSS 规范：祖先带 `backdrop-filter` / `filter` / `transform` → **成为 `position:fixed` 后代的 containing block**
- 而主题规则给 `[role='menu']` 挂了 `backdrop-filter: blur(20px) saturate(1.25)`

所以子菜单不再相对视口定位，改为相对父菜单偏移。headless Chrome 实测（1200×800）：

| 条件 | 子菜单 left, top |
| --- | --- |
| 无主题 | 280, 60 |
| 旧规则 | **321, 101**（偏移 +41/+41） |
| 新规则 | 280, 60 |

偏移量 = 父菜单自身的定位偏移。账户菜单在窗口右下角，父菜单离视口原点越远偏移越大 → 子菜单被推出可见区或被父菜单边界裁掉 → **表现为"点了没反应"**。

**最终修法：菜单容器不挂 `backdrop-filter`，只保留不透明填充。** 模糊本来就没有视觉收益——它只采样菜单下面那层，而底色已完全覆盖。

⚠️ **不要给任何 `[role='menu'|'listbox'|'dialog']` 加 `backdrop-filter` / `filter` / `transform`**，会再次触发这个问题。`tests/menu-no-backdrop-filter.mjs` 会挡住这种改动。

**验证**（均入库 `tests/`）：
- `submenu-containing-block.mjs` — 载入真实主题 CSS，断言子菜单位置不变、未被裁剪、仍有底色
- `submenu-containing-block-control.mjs` — **反向对照**：注入旧规则，断言子菜单确实位移（若此对照不 PASS，说明正测试无鉴别力）
- `menu-no-backdrop-filter.mjs` — frosted/solid/clear 三态均断言菜单选择器无 blur

**附带发现**：`data-radix-popper-content-wrapper` 在当前 ZCode 版本（3.17.2）的渲染包里出现 **0 次**，该选择器早已失效（不影响 `[role=menu]` 主规则）。知道就行，别指望它。

### P0 — 侧栏材质/侧栏定位整体失效（`sidebarNodes=0`）

诊断日志实测：

```
sidebar-geo-miss detail: "vw=1707 vh=912 selMissed=#sidebar aside|#sidebar|aside.h-full.overflow-hidden"
glass-groups      detail: "sidebarNodes=0 glass=true filter="blur(40px)" native="" markedSidebar=0 panel=0"
```

即 **`selectors.json` 里的三个 glass 候选一个都不存在**，几何兜底也没命中。后果：侧栏玻璃、侧栏材质开关、侧栏不透明度全部失效（不影响主题色/壁纸）。

需要做的事：**先把 ZCode 侧栏的真实 DOM 结构测出来**。建议在 `styleFloatingPanels`/`applyShell` 里加一次性 dump：遍历 `body *`，输出 `tagName#id.className [left,top,w,h]`（只输出 `left < vw*0.25 && height > vh*0.5` 的节点）到 `/zt/scene-report`，让用户重启一次即可拿到结构，再更新 `selectors.json`。

### P1 — 重载按钮：点击已实测可用，仅日志证据偏少

v1.13.0 起的重载按钮（`location.reload()`）定位正常，`.dev/test-reload-btn.mjs` 三场景全 PASS（含"点击触发 reload"）。
诊断日志里只有 3 条 `reload-btn` 记录（`matched=true left=1500`、`matched=false left=1604/1611`），**不足以证明用户侧点击一定生效**，但也没有反证。

若再报"点了没反应"：先加 `pointerdown` 上报确认 handler 是否触发（而不是只报定位结果）；未触发再考虑 `z-index` 提到 `2147483647` 与 `pointer-events` 自测。

⚠️ 另注：后台窗口会被 Chromium 节流 3s 轮询刷新器，**改完配置不聚焦窗口可能迟迟不生效**——这不是 bug，别误判成注入失败。

### P1 — 菜单尺寸判据与浮层扫描的遗留风险

`styleFloatingPanels()` 现在**跳过菜单表面**（交给 CSS），但仍会对其它 fixed/absolute 元素上色。判据为：`z-index >= 10`、面积 ≤ 40% 视口、长宽 ≤ 90%、当前半透明。历史上多次误伤（侧栏、聊天列、文件资源管理器按钮、`zt-nav-item`）。改动这个函数时**必须**跑 `.dev/test-floating.mjs`（8 个场景 + 回滚）。

### P2 — README 与实际功能不一致

README 仍写着"场景型默认 contain"、"scene 回退预览"，但现在的默认是 **cover**、且 scene 是实时渲染。需要重写功能表。

### P2 — 遗留配置字段

`flatSurfaces` / `sidebarGlass` / `unifySidebar` 与 `material` 语义重叠，建议做一次迁移：读旧字段推导 `material`，然后删除。

---

## 9. 血泪教训（改代码前务必读）

### 9.1 字符串/模板相关

1. **`String.replace` 的 `$'` 污染**：替换串含 `$'` 会把"匹配点之后的全文"插入，导致文件大段重复。**结构化代码插入一律用替换函数** `s.replace(x, () => code)`。
2. **模板字符串吃反斜杠**：`BOOTSTRAP` / `UI_SOURCE` 本身是模板字符串，里面的 `\\.` 输出到页面变成 `\.`，正则字面量 `/\/+$/` 会变成注释 `//+$`。规则：**模板内不用正则字面量**，用 `new RegExp('...')`；需要输出反斜杠就写 `\\\\`。
3. **模板字符串里不能出现反引号**（哪怕在注释里）——会提前闭合模板，报 `Unexpected identifier`。写注释时用 `'role=menu'` 这种单引号形式。
4. **patch 脚本要归一化 CRLF**：`git checkout` 会换行尾，锚点匹配 `\n` 会失败。读文件先 `.split('\r\n').join('\n')`。

### 9.2 选择器 / CSS

5. **不要用 Tailwind 属性子串选择器**：`[class*='rounded-tr-']` 会命中巨大的布局容器（任意值变体类名里含该子串），`backdrop-filter` 一打上去整块区域变雾。要用**几何测量 + data 属性标记**。
6. **`''.indexOf('zt-') === 0` 为 true**：空 id 元素会被误判为"自家 UI"。必须 `id.length > 0 &&`。
7. **逗号选择器拆分陷阱**：`[role=menu], [role=listbox] *` 按逗号拆开后，前两段匹配**容器自身**。后代组合器必须在每个逗号段重复。
8. **全屏 `backdrop-filter` 是性能杀手**：盖在动画 canvas 上会让 Chromium 每帧重采样整屏。`.zt-veil` 已移除它，**不要加回来**。
8.5. **`backdrop-filter` / `filter` / `transform` 会创建 containing block**：给任何容器挂上它，其内部 `position:fixed` 后代就不再相对视口定位。Radix 菜单用 `strategy='fixed'`，而 `MenuSubContent` 不走 portal、渲染在父菜单内部 → **给父菜单加模糊 = 子菜单错位/被裁**。这就是"二级菜单弹不出来"的真凶（见 §8）。给"整块 UI"上滤镜前，先问它里面有没有 fixed 定位的东西。
9. **玻璃节点的背景只能来自 `--color-sidebar`**：给它加 `background-color !important` 会彻底压死不透明度滑杆。
10. **`fit` 只改 backing 尺寸不改布局**：scene 的 `renderDpr` 变化时保持 `fit: cover` 才能"变软但仍铺满"。
10.5. **"看不见"和"没打开"要分开验证**：本 bug 有两层（透明 + 错位），只修透明会让症状从"完全不可见"变成"看起来没反应"。诊断浮层问题时，先量 `getBoundingClientRect()` 判断它到底在不在正确位置，再谈颜色/透明度。**能用 headless Chrome 复现就别靠推理**——这次 5 分钟就量出了 +41/+41 的偏移。

### 9.3 状态与生命周期

11. **payload 顶层与 `active` 双写**：只写一个 = 引擎读不到（蒙层从不创建、侧栏开关失效）。
12. **`__ZTHEME_APPLY` 复用预生成 CSS**：改字段不会重建样式表，实时预览必须走 `overrides` / 内联样式。
13. **粘性 `<style>` 是万恶之源**：带 `!important` 的 live 预览样式表一旦不删除，会永久压住后续所有设置（侧栏开关变成单向）。
14. **`closePanel` 只隐藏不移除节点**，`openPanel` 见节点存在就早退 → rebuild 必须 `removeChild`。
15. **`buildDim` 必须要求壁纸层存在**：壁纸未绘制时压暗层会盖在主题背景上 = "整窗蒙一层色"。
16. **浮层晚于首次 apply 挂载**（点击才出现）→ 任何"扫描 DOM 找浮层"的方案都有时间窗，**能写 CSS 就别写 JS**。
17. **apply 链路里任何一处抛错都会中断后续步骤**：`applyAutoDim(null)` 曾让 `w.dim` 抛 TypeError，导致 glass/透明化/UI 注册全部跳过，表现为"只剩主题色"。**可选功能必须能容忍 null**，高风险步骤要隔离 try/catch。

### 9.4 进程 / 部署

18. **ESM 模块会缓存**：复制新文件到 cache 后，必须重启 daemon 才生效。
19. **daemon 重复启动 = 服务空档**：无条件 `killOthers()` 会在端口上留下几秒空窗，此时所有端点请求失败（面板点击、场景资源全部 502/连接拒绝）。
20. **ZCode 有单实例锁**：杀掉进程再 `Start-Process`，新进程会把请求转交给已运行实例然后退出 → 窗口永不重新初始化。**要"重启界面"只能用 `location.reload()`，不要试图重启进程**。
21. **asar 补丁判定要数标签**：只查 marker 会放过"marker 在 + 坏的 `file%3A` 双标签"的坏状态。必须 `loader 标签数 === 1` 且 URL 精确匹配。
22. **`optin` 文件是纯时间字符串**：早期用 `JSON.parse` 读，必然抛错 → 自愈永远 return（死码）。
23. **PowerShell 里内联 node -e 的 JS 会被转义吃掉**：写临时 `.mjs` 文件再执行。

### 9.5 调试

24. **没有 CDP 的用户窗口**：不要靠静态推理，把诊断埋进页面 `POST /zt/scene-report`，让用户重启一次换现场数据。
25. **最小复现 > 读代码**：一个 300×40 的 stub 元素 + 插桩，5 分钟能定位到"被 `data-zt-glass` 跳过"，比反复审代码快得多。
26. **截图可能骗人**：切换窗口瞬间会抓到过渡帧（曾看到"UI 全消失"其实是过渡）；连拍两张再下结论。

---

## 10. 下一步建议（按价值排序）

1. ~~修二级菜单~~ **已于 v1.13.8 修复并验证**（见 §8，含两层根因）
2. ~~把 `.dev/test-*.mjs` 迁进 `tests/`~~ **已入库 7 个**（见 §11.1）；剩余 `.dev/` 脚本可按需迁移
3. **侧栏定位不稳定**（P0，最高优先）：冷启动常 `sidebarNodes=0`，热态又变 3。三层选择器 + 几何兜底的历史命中率是 0（`sidebar-geo-found` 从未出现）。建议：① 加一次性 DOM dump 拿到真实结构后修 `selectors.json`；② 给 `applyShell` 加"选择器未命中时延迟重试"，而不是当下就报 miss
4. 重写 README + 清理遗留配置字段（`flatSurfaces` / `sidebarGlass` / `unifySidebar` 已被 `material` 接管，见 P2）
5. 删除或重写已失效的 `.dev/test-menus.mjs`、`test-sidebar-glass.mjs`
6. scene 画质的"自动"档可以考虑按 `frames-sample` 自适应降 `renderDpr`（现在只降 fps）

---

## 11. 环境依赖

| 依赖 | 说明 |
| --- | --- |
| Node.js | v24（`node:net`/ESM/`AbortSignal.timeout` 都用到了） |
| PowerShell | 5.1+（asar 补丁、进程管理） |
| ZCode | 3.17.2（Electron 44.7.0），路径 `C:\Program Files\ZCode` |
| Wallpaper Engine | Steam 库，appid `431960`；本机在 `G:\SteamLibrary` |
| 权限 | asar 写需要管理员（脚本会自提权；本机 UAC 已设默认不提醒） |

插件用到的 ZCode 内部约定（改动时注意）：

- 页面入口：`app.asar/out/renderer/index.html`（`file:///…/index.html`）
- 渲染进程有 `window.zcode`（业务 API，**没有**退出/重启能力）
- 主题靠 `html.dark` + body 上的 CSS 自定义属性（约 479 个 token）
- `#root{position:relative}` + 壁纸层 `z-index:0` + `#root{z-index:1}` 是分层基础

---

## 12. 快速自检清单（接手后第一天）

- [ ] `git log --oneline -5` 确认版本与最近改动
- [ ] 读 `%USERPROFILE%\.zcode\zcode-theme-studio.endpoint.log` 最后 30 行，看有没有报错/未命中
- [ ] `curl -X POST 127.0.0.1:9337/zt/apply -d '{"patches":[]}'` 返回 200
- [ ] 确认只有 1 个 daemon、1 个 watcher
- [ ] 确认 cache 目录里 `.zcode-plugin/plugin.json` 版本 == 源码版本
- [ ] 跑 `node tests/*.mjs`，**7 个全 PASS**（v1.13.8 起已入库，不再依赖 `.dev/`）
- [ ] 跑 `.dev/bridge-vm2.mjs`，应输出 `OK: bridge ran clean in VM`
- [ ] 需要 Chromium 的两个测试（`submenu-containing-block*.mjs`）在没装 Chrome/Edge 时会 SKIP，不算失败

### 11.1 `tests/` 目录（v1.13.8 起，已入库）

| 文件 | 守护什么 |
| --- | --- |
| `submenu-nesting.mjs` | 嵌套子菜单不被"清空后代"规则刷透明；分隔线仍例外 |
| `submenu-containing-block.mjs` | 真实主题 CSS 不干扰子菜单的 fixed 锚定（需 Chromium） |
| `submenu-containing-block-control.mjs` | **反向对照**：旧规则确实会位移子菜单（防正测试失去鉴别力，需 Chromium） |
| `menu-no-backdrop-filter.mjs` | frosted/solid/clear 三态，菜单选择器一律无 blur |
| `sidebar-dedupe.mjs` | 侧栏只画最外层节点，不叠多重模糊 |
| `pwsh-e2e.mjs` | 进程查询命令真的跑在 PowerShell 7 上 |
| `pwsh-fallback.mjs` | 没有 pwsh 7 时正确回退 5.1 |

⚠️ `.dev/test-menus.mjs` 与 `test-sidebar-glass.mjs` **已失效**（断言的是 v1.13.4 / v1.11.0 的旧实现），会假失败，别被误导。待重写或删除。

---

*本文档由上一任开发者（agent）编写。凡是标"已知问题"的，都有现场日志或截图证据；凡是标"建议"的，都还没实现。请优先修 P0，再谈新功能。*
