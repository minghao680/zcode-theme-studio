---
name: zcode-theme-studio
description: 深度个性化 ZCode 界面：应用主题预设、实时调色、设置 Wallpaper Engine 动态壁纸（视频/网页/图片可播放，scene 型回退静态预览），调整面板透明度、背景压暗、毛玻璃效果。支持两种生效模式：CDP 注入（主题版快捷方式）与 asar 补丁（普通启动）。当用户想换肤、换壁纸、美化界面、调透明度、开启玻璃效果，或询问当前主题状态时使用。
---

# ZCode Theme Studio

两种生效模式（可并存）：

1. **CDP 注入模式**：ZCode 以 `--remote-debugging-port` 启动（`shortcut_install` 生成快捷方式）。watcher 常驻热更新，功能最全。
2. **asar 补丁模式**（普通启动）：`asar_patch` 一次性打补丁（需管理员 + ZCode 关闭），bridge 3 秒自刷新，`theme_apply` 自动同步。

## 侧栏 UI（v1.4.0+）

打补丁或 CDP 模式下，ZCode 侧栏「插件市场」下方会出现 **「主题工作台」** 入口（图标 + 文字，样式与原生导航项一致）。点击打开面板：

- **配色预设**：8 个预设卡片，点击即时切换（~130ms）
- **壁纸**：本机 WE 壁纸缩略图网格（类型徽标 video/web），点击立即应用
- **调整**：背景压暗 / 面板不透明度 / 侧栏不透明度 / 消息气泡 / 玻璃模糊 五个滑杆，拖动实时预览，松手持久化
- **调色盘**（v1.5.0）：23 个设计令牌分 6 组（背景表面/文字/强调色/边框/状态色/终端），点色块弹出原生取色器——拖动实时预览、松手持久化；右上 × 恢复单项，标题栏「重置全部」清空所有自定义
- **清除壁纸**：一键移除壁纸层

所有改动自动写入配置并同步 bridge，无需对话操作。面板依赖本地端点 `127.0.0.1:9337`（由 `ui-daemon.mjs` 提供，hook 自动拉起）。

## 工具速查

| 工具 | 用途 |
| --- | --- |
| `theme_presets` | 列出 8 个内置预设（carbon-code / cyber-neon / aurora / paper-reading / sakura-pink / forest / amber-warm / starsea-blue） |
| `wallpaper_list` | 扫描本机 Wallpaper Engine 壁纸（Steam 工坊 + 本地项目），返回 id/title/type/playable |
| `theme_apply` | 应用预设/令牌覆盖/壁纸/自定义路径/轮换播放列表/透明度/玻璃效果；即时生效并持久化 |
| `wallpaper_random` | 随机应用一个可播放壁纸（可限定 video/web） |
| `palette_from_wallpaper` | 从壁纸预览提取配色（accent + surfaceTint），`apply:true` 直接作为令牌覆盖应用 |
| `wallpaper_clear` | 移除壁纸层（保留主题配色） |
| `studio_status` | 查看当前配置 + 注入是否生效 + asar 补丁状态 |
| `shortcut_install` | 一键创建带调试端口的『ZCode (主题版)』桌面快捷方式（CDP 模式） |
| `asar_patch` | 一次性给 app.asar 打补丁使普通启动也生效（`{"restore":true}` 恢复备份）；需管理员，ZCode 须关闭 |
| `wallpaper_thumbs` | 复制壁纸缩略图到指定目录（用于在对话中渲染预览网格） |

## 生效模式决策

- 用户想要普通启动生效 → 引导关闭 ZCode 后调 `asar_patch`（弹 UAC 需用户批准），完成后普通双击即生效。
- 用户不想改程序文件 → 用 `shortcut_install` 走 CDP 模式。
- `theme_apply` 返回 `plainLaunch: "patched asar detected"` 说明两种模式都在服务。

## 典型流程

**换主题**：`theme_presets` → 用户选 → `theme_apply {"preset":"aurora"}`。

**换壁纸**：`wallpaper_list` → 用户选 → `theme_apply {"wallpaperId":"<id>"}`（id 支持唯一前缀/标题子串，如 "2875828"）。
- video/web/image 类型可直接播放；scene/application 型必须加 `"forcePreview":true`（显示 preview.gif/jpg）。
- **任意本地媒体**：`theme_apply {"wallpaperPath":"D:/pics/xx.mp4"}`（支持 mp4/webm/html/jpg/png/gif/webp，不限于 WE 内容）。
- 亮色壁纸建议 `dim: 20~35`；文字难读时提高 `dim`、调低 `surfaceOpacity`（面板更透）或调高它（面板更实）。浅色预设（paper-reading）自动用白色磨砂层。

**播放列表轮换**：`theme_apply {"rotation":{"enabled":true,"ids":["id1","id2"],"intervalSec":600}}`——watcher 每 10 分钟切换（最小 30s），不可播放项自动跳过；轮换为内存态，配置文件保留基础壁纸。

**取色配色**：`palette_from_wallpaper {"wallpaperId":"<id>","apply":true}`——从壁纸提取 accent（自动提饱和度）与深色 surfaceTint 并应用。

**微调**：`theme_apply` 支持增量参数（dim/blur/fit/surfaceOpacity/sidebarOpacity/bubbleOpacity/glass），可随时叠加；`clearOverrides:true` 清空令牌覆盖。

**液态玻璃**：`theme_apply {"glass":{"style":"liquid","blur":20}}`——Apple 风格液态玻璃（高饱和 backdrop-filter + 顶部高光内阴影 + 渐变光泽），用户消息气泡同步获得液态质感；`"style":"frosted"` 为普通磨砂。`bubbleOpacity`（30-100，默认 78）单独控制消息气泡的不透明度，亮色壁纸上偏小时更通透、偏大时更易读。

**关闭**：`theme_apply {"enabled":false}` 完整拆除注入层（壁纸/样式/玻璃全部还原）。

**预览网格**：`wallpaper_thumbs {"outDir":"<会话可视化目录>","max":24}` 后用 HTML 表格/网格渲染 file:// 图片卡片，展示标题与类型徽标（video/web/scene-静态）。

## 失败排查

- `injection.reason: "cdp-unreachable"` → CDP 模式需要主题版快捷方式；或直接走 asar 模式（`asar_patch`）。
- 壁纸黑屏 → 文件路径失效（壁纸被删）：重跑 `wallpaper_list` 刷新。
- 设置页改了但没生效 → 需要新开会话（server 启动时才同步）；或该项最近被对话内调参覆盖，再改一次设置页即可覆盖回来。
- asar_patch 报权限拒绝 → ZCode 以管理员身份重启后再执行；ZCode 运行中会拒绝补丁（必须关闭）。
- asar 补丁后主题失效 → ZCode 大版本更新会重装 app.asar：重新 `asar_patch`（bridge.js 还在，秒补）。
- ZCode 大版本更新后选择器错乱 → `lib/selectors.json` 需要适配（令牌层通常不受影响）。

## 配置存储（两个入口，职责分明）

1. **插件设置页**（位置：设置 → 插件管理 → zcode-theme-studio → 设置）：manifest `userConfig` 渲染，分五组——① 连接（调试端口/总开关）② 壁纸（工坊目录/Steam 库/默认壁纸/适配/压暗/模糊）③ 主题（预设/三档不透明度）④ 效果（玻璃开关/风格/模糊）⑤ 轮换（开关/间隔）。**修改在下次会话生效**（MCP server 启动时播种/检测变更覆盖）。
2. **对话内调参**（theme_apply 等工具）：即时生效，写入插件数据目录 `config.json`（镜像于 `~/.zcode/zcode-theme-studio.config.json`），并自动同步到 bridge（asar 模式）。设置页未改动对应项时，对话调参是最终值；设置页改了某项，下次会话以设置页为准。

SessionStart 钩子在每次会话启动时自动拉起 watcher（CDP 模式）；asar 模式无需 watcher。
