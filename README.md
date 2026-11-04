# zcode-theme-studio

ZCode 桌面端深度个性化插件：主题预设 + 实时令牌调色 + 取色配色 + 播放列表轮换 + 液态玻璃 + Wallpaper Engine / 任意本地媒体壁纸。**双启动模式**：CDP 注入（主题版快捷方式）或 asar 补丁（普通启动，一次授权永久生效）。**v1.4.0 起侧栏内置「主题工作台」面板**（插件市场下方），可视化换肤换壁纸调参。

## 侧栏 UI

ZCode 侧栏「插件市场」正下方注入 **主题工作台** 导航项（复制原生按钮样式），点击打开面板：

| 区块 | 能力 |
| --- | --- |
| 配色预设 | 8 个预设卡片（色点标识），点击即时切换 |
| 壁纸 | WE 壁纸缩略图网格 + 类型徽标，点击立即应用 |
| 调整 | 压暗 / 面板 / 侧栏 / 气泡 / 玻璃模糊 五滑杆，实时预览 + 松手持久化 |
| **调色盘** | 23 个设计令牌分 6 组（背景表面/文字/强调色/边框/状态色/终端），原生取色器实时预览、松手持久化，单项 × 重置 + 全部重置 |
| 清空 | 一键移除壁纸层 |

调色盘实现要点：令牌显示色由宿主在 `buildPayload` 阶段解析成具体 hex（`payload.palette`）——壁纸模式下计算样式是 `color-mix()`/透明，页面无法自行还原。overrides 以独立 `<style id="zt-overrides">` 层应用，因此取色器拖动可即时预览而不需重建整套 CSS。

实现：`lib/ui.mjs`（面板源码，内联进 bridge.js）+ `lib/uiendpoint.mjs` + `ui-daemon.mjs`（127.0.0.1:9337 持久化端点，hook 自动拉起）。面板改动 → 端点写配置 + 重建 bridge → 返回新 payload → 面板立即 apply（~130ms）。

## 两种生效模式

| | CDP 注入模式 | asar 补丁模式（1.3.0+） |
| --- | --- | --- |
| 启动方式 | 『ZCode (Themed)』快捷方式 | **普通双击启动** |
| 一次性设置 | shortcut_install | asar_patch（需管理员，ZCode 关闭时执行） |
| 即时生效 | ✅（watcher 常驻热更新） | ✅（bridge 3 秒自刷新 + theme_apply 自动同步） |
| scene 预览/轮换/取色 | 全部可用 | 全部可用（取色经 CDP 时需 CDP 模式；普通模式跳过） |
| 回滚 | 删快捷方式 | asar_patch {"restore":true}（自动备份） |

asar 模式原理：一次性把一行 loader 注入 `app.asar/out/renderer/index.html`（自动备份 + 写入后回读校验），主题引擎本体放在用户可写的 bridge.js，升级主题引擎无需重新打补丁。

## 组件

- `server.mjs` — MCP stdio 服务器（零依赖）：`theme_presets` / `wallpaper_list` / `theme_apply`（含自定义路径、轮换、clearOverrides）/ `wallpaper_random` / `palette_from_wallpaper` / `wallpaper_clear` / `studio_status` / `shortcut_install` / **`asar_patch`（1.3.0，含 restore）** / `wallpaper_thumbs`
- `watch.mjs` — 常驻 watcher（CDP 模式）：维持 CDP 会话使注入跨 reload / 自导航存活，监听配置文件热更新，执行播放列表轮换（内存态），disable 时完整拆除注入层；`--hook` 模式由 SessionStart 钩子按需拉起（自锁单实例）
- `inject.mjs` — 一次性注入器（状态查询 / 截图 / 兜底）
- `lib/engine.mjs` — 共享注入引擎：bootstrap 源码（teardown / DOMContentLoaded 延迟 / 白色磨砂 dim）+ payload 构建
- `lib/bridge.mjs` — bridge 生成器（asar 模式）：index.html loader 标记 + 独立 bridge.js（3 秒自刷新配置）
- `lib/asar.mjs` — 最小 asar 补丁器：append + header offset 平移策略，entry integrity 重算，roundtrip 校验，一次性备份
- `lib/sync.mjs` — bridge 同步器：theme_apply/设置页变更自动刷新 bridge.js
- `lib/scanner.mjs` — 扫描 Steam 多库工坊（431960）+ WE 本地项目
- `lib/themes.mjs` + `lib/presets.json` — 8 个预设主题；令牌优先策略（dsh-theme 风格）
- `lib/palette.mjs` — CDP canvas 取色（HSL 饱和度提升 + 深色 tint 强制）
- `lib/ui.mjs` — 侧栏面板源码（预设/壁纸网格/滑杆，内联进 bridge）
- `lib/uiendpoint.mjs` + `ui-daemon.mjs` — 面板持久化端点（127.0.0.1:9337，自锁常驻）
- `lib/selectors.json` — 结构选择器（feature-detect，ZCode 更新后在此适配）
- `assets/shortcut-helper.ps1` — 生成『ZCode (Themed).lnk』（带 `--remote-debugging-port`）
- `assets/asar-patch.ps1` / `asar-restore.ps1` — asar 补丁/恢复（自动 UAC 提权）

## 壁纸类型支持

| 类型 | 效果 |
| --- | --- |
| video | `<video muted loop autoplay>` 全程播放（file:// 直载） |
| web | `<iframe>` 真渲染（WE 专有 JS API 调用会静默失败，不影响渲染） |
| image / gif | cover / contain（contain 带模糊填充） |
| scene / application / combo | WE 专有格式，回退 preview.gif/jpg 静态预览（`forcePreview: true`） |
| 任意本地媒体 | `wallpaperPath` 参数：mp4/webm/html/jpg/png/gif/webp |

## 设置页

**位置：设置 → 插件管理 → zcode-theme-studio → 设置**（由 manifest `userConfig` 渲染，官方校验通过）。

五组分类（title 前缀约定，userConfig schema 为 strict 模式无原生分组字段）：

| 组 | 字段 |
| --- | --- |
| ① 连接 | 调试端口（number）· 总开关（boolean） |
| ② 壁纸 | WE 工坊目录（directory）· 本地项目目录（directory）· Steam 库根目录 · 默认壁纸 ID · 适配模式 · 背景压暗 · 背景模糊 |
| ③ 主题 | 预设 · 面板/侧栏/消息气泡三档不透明度（number） |
| ④ 效果 | 玻璃开关（boolean）· 玻璃风格 liquid/frosted · 玻璃模糊 |
| ⑤ 轮换 | 启用播放列表（boolean）· 间隔秒 |

同步语义：server 启动时播种（首次）+ 变更检测覆盖（env 值 ≠ 上次记录值视为设置页修改）；空串默认值不参与；对话内 `theme_apply` 即时生效且在设置页未改动对应项时保持为最终值。

## 已知限制

- 必须用带调试端口的快捷方式启动 ZCode（CDP 仅绑定 127.0.0.1）
- CDP 脚本注册是会话级的 → 必须保持 watch.mjs 存活（钩子自动拉起）
- ZCode 大版本更新若改 DOM 结构，需更新 `lib/selectors.json`（令牌层通常不受影响）
- CDP `Page.captureScreenshot` 对 GPU 视频表面会截到黑帧——用 Windows 屏幕截图验证视觉效果
- 轮换状态在 watcher 内存中，watcher 重启后从配置基础壁纸重新计时
