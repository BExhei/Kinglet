# Changelog

All notable changes to Kinglet will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/).

## [1.0.4] - 2026-10-23

### Fixed
- **`.md` 文件图标被误换成软件 logo** — v1.0.3 重做图标时，`.md` 专属文档图标（`src-tauri/icons/md-file.ico`）的源图搞错了（用了软件图标的 `icon.png`，应为 `md-file-src.png`），两个 `.ico` 落到同一份字节，资源管理器里所有 `.md` / `.markdown` 显示成应用 logo。现已重新生成并做逐尺寸像素校验；`.md` 图标（`md-file.ico`）必须与应用图标（`icon.ico`）哈希不同
- **更新弹窗标题显示字面量 `{version}`** — 标题改为固定文案「发现新版本」（版本号本就在标题下单独一行显示）；顺手删掉同段无引用的死字符串 `update_available_body`
- **「检查更新」的提示改用主题化面板** — 「当前已是最新版本」「浏览器模式下无法检查更新」「检查更新失败」「更新失败」原先走系统原生 `alert()`，看着像浏览器警告；现为与更新弹窗同一套样式的居中面板（同一遮罩 / 圆角 / 边框 / 按钮，宽 320px，单按钮「知道了」），Esc、×、点遮罩、按钮均可关闭

## [1.0.3] - 2026-10-22

### Fixed
- **文档内链接跳转（关键）** — 之前点本地 `.md` 链接打不开。三处叠加：拼接路径的正则漏判反斜杠（资源管理器双击 / Ctrl+O / 拖放的路径都是 `\`，目标被拼成 `/xxx.md`）、marked 把中文文件名编码成 `%XX` 后未解码、`../` 相对路径被 Tauri 拒绝
- **点链接不再丢标签页（关键）** — 之前点 `笔记.md#标题`、`.txt`、图片等链接，界面会自己导航回欢迎页，已打开的标签全部消失。现在正文内链接一律由应用接管
- **中文标题锚点** — 页内 `#标题` 按标题文本匹配（原先只按 id 查，中文标题跳不过去）
- **实时文件监控** — `tauri-plugin-fs` 补上 `watch` feature；此前 watch 命令不存在，监控静默退化成 2 秒轮询
- **任务栏图标发糊** — `.ico` 里最大帧排到了第一位（Tauri 只取第一个条目作为窗口图标，之前拿到 16×16 被 Windows 放大到 48px 显示，所以任务栏/Alt+Tab 是糊的）；`make-ico.py` 增加断言防回归

### Added
- **双链跳转** — 支持 `[[笔记]]` / `[[笔记|别名]]` / `[[笔记#标题]]`，按当前文档所在目录解析（可带子目录）
- **链接提示** — 打开失败或点到非 Markdown 文件时，底部轻提示 2 秒后消失；非 Markdown 文件 `Ctrl+单击` 交给系统默认程序打开

## [1.0.2] - 2026-09-06

### Fixed
- **多文件打开** — Windows 资源管理器选中多个 `.md` 文件回车，现在全部打开为标签（之前只打开最后一个）
- **更新可选** — 检查到新版本时弹出自定义对话框，用户选择「更新」或「稍后再说」，不再自动下载安装

## [1.0.1] - 2026-08-31

### Added
- **窗口状态记忆** — 窗口位置、大小、最大化状态关闭后自动保存，下次启动恢复

## [1.0.0] - 2026-08-30

First public release.

### Added
- Local Markdown (`.md`) / plain-text (`.txt`) reader for Windows (Tauri 2 + Vanilla JS).
- Multi-tab with per-file scroll position, left outline with scroll-spy, in-page search `Ctrl+F`.
- Syntax highlighting, KaTeX math, GFM tables / task lists / footnotes / collapsible blocks.
- GBK/GB18030 encoding auto-detection; 6 themes; font presets + custom font; font size / line height.
- "版式" text alignment: 5 modes + follow-document (SVG glyphs).
- Custom right-click menu; print without page headers; single-instance; real-time file monitoring (external edits auto-refresh).
- Local images; auto-update via GitHub Releases; default app for `.md` / `.markdown`.
