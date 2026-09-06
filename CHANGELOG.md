# Changelog

All notable changes to Kinglet will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/).

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
