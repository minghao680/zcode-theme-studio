---
description: 换主题 / 换壁纸 / 调透明度（zcode-theme-studio）
allowed-tools: mcp__zcode-theme-studio__theme_presets, mcp__zcode-theme-studio__wallpaper_list, mcp__zcode-theme-studio__theme_apply, mcp__zcode-theme-studio__wallpaper_clear, mcp__zcode-theme-studio__studio_status, mcp__zcode-theme-studio__wallpaper_thumbs
---

用户想调整 ZCode 的主题或壁纸。按以下流程操作：

1. 用户参数为空时：先调用 `studio_status` 查看当前状态，再调用 `theme_presets` 列出预设、`wallpaper_list` 列出可用壁纸（各取前 24 个），给用户一个简短的可选项清单。
2. 用户指定了预设/壁纸/参数时：直接调用 `theme_apply` 应用。支持：预设、令牌覆盖（`overrides`）、任意本地媒体（`wallpaperPath`）、轮换播放列表（`rotation`）、dim/blur/fit/透明度/玻璃（`glass.style`: frosted 磨砂 / liquid 液态玻璃；`bubbleOpacity` 控制消息气泡不透明度）。scene/application 类型壁纸会报错，此时询问用户是否用 `forcePreview` 显示静态预览图。
3. 用户想要"和壁纸配套的配色"时：调用 `palette_from_wallpaper`（`apply:true` 自动应用取出的 accent 和 surfaceTint）。
4. 用户想随机换一张时：调用 `wallpaper_random`。
5. 应用成功后用一句话汇报：预设名 + 壁纸名 + 关键参数（透明度/压暗）。
6. 若注入失败（applied=false），提示用户需要用『ZCode (主题版)』快捷方式启动 ZCode，并主动调用 `shortcut_install` 帮用户创建快捷方式。
7. 用户想关闭主题时：`theme_apply {"enabled":false}`（完整拆除注入层）。
8. 用户想浏览壁纸时：调用 `wallpaper_thumbs` 把缩略图复制到会话可视化目录，然后用 HTML 网格展示。

$ARGUMENTS
