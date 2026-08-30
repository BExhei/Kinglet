<div align="center">

# Kinglet

**Kinglet — Open it, read it — distraction-free.**

![Kinglet](assets/kinglet-logo.png)

A clean, lightweight Markdown (`.md`) and plain-text (`.txt`) reader for Windows, built with Tauri 2 + Vanilla JS. Inspired by [mdreader](https://github.com/habermas-labs/mdreader) — built from scratch, not a fork.

[简体中文](README.md) · English

</div>

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-GPL--3.0-green)
![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-lightgrey)

![Light reading](assets/kinglet-light.png)

![Settings panel (theme · fonts · layout)](assets/kinglet-settings.png)

---

## Features

- **Lightweight** — ~4 MB installer
- Open `.md` / `.txt`, drag & drop, multi-tab
- **Per-file scroll position**
- **Left outline** with click-to-jump and scroll-spy
- **In-page search** `Ctrl+F`
- **Syntax highlighting**
- **KaTeX math formulas**
- **GFM tables**, task lists, footnotes, collapsible blocks
- **GBK/GB18030 auto-detect**, no garbled Chinese
- **6 themes** (white, warm paper, sepia, green, dark, OLED black)
- **Custom fonts** + 4 presets
- **Font size / line height** adjustable
- **Text alignment** 5 options
- **Right-click menu**
- **Print** with no page headers
- **Single instance**
- **Real-time file monitoring** — external edits auto-refresh
- **Auto-update**
- **Local images**
- **Internal links**: `#anchor` in-page; `http(s)` opens browser; local `.md` opens new tab
- Shortcuts: `Ctrl+O` open · `Ctrl+W` close · `Ctrl+Tab` next · `Ctrl+P` print · `Ctrl+F` find · `Ctrl+\` sidebar · `Ctrl+Shift+L` theme · `Ctrl+,` settings
- Default app for `.md` / `.markdown`

---

## Installation

Download the latest `Kinglet_x.x.x_x64-setup.exe` from [Releases](https://github.com/BExhei/Kinglet/releases) and run it — overlay updates are supported.

> Windows SmartScreen may warn (not code-signed). Click "More info" → "Run anyway".

---

## Build & tech stack

Prerequisites: Node.js 18+, Rust (msvc), VS C++ Build Tools.

```bash
git clone https://github.com/BExhei/Kinglet.git
cd kinglet
npm install
npm run tauri:dev        # development mode
npm run tauri:build      # release build → src-tauri/target/release/bundle/nsis/
```

| Layer | Tech |
|---|---|
| Shell | Tauri 2 (Rust) |
| Frontend | Vite + Vanilla JS (ESM) |
| Rendering | `marked` v17 + `DOMPurify` |
| Syntax | `highlight.js` |
| Math | `KaTeX` |
| Plugins | dialog · fs · opener · single-instance · updater |

---

## Security

- `marked` + `DOMPurify` sanitize all rendered HTML
- Strict CSP (`default-src 'self'`)
- File access is **dynamic**: only explicitly opened files are authorized
- `.txt` is not registered as a default app

---

## Fonts

Kinglet embeds no font files, uses system fonts by default, and can load a local font file.

Recommended custom free fonts: **Source Han Serif/Sans** (SIL OFL), **LXGW WenKai** (SIL OFL), **JetBrains Mono** (SIL OFL).

---

## License

[GPL-3.0](LICENSE) © 2026 BExhei
