<div align="center">

<img src="docs/img/logo.png" alt="winshotx" width="96">

# winshotx (ITheFallenI edition)

[![MIT license](https://img.shields.io/badge/license-MIT-0a9bff?style=flat-square)](LICENSE)
[![Windows 10/11](https://img.shields.io/badge/Windows-10%20%7C%2011-0078d4?style=flat-square&logo=windows&logoColor=white)](#install)
[![Latest release](https://img.shields.io/github/v/release/ITheFallenI/winshotx?style=flat-square&color=22c55e&label=release)](https://github.com/ITheFallenI/winshotx/releases/latest)
[![Tauri 2](https://img.shields.io/badge/Tauri-2-ffc131?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app)

**[⬇ Download the latest setup](https://github.com/ITheFallenI/winshotx/releases/latest)**

</div>

---

A fast, local screenshot and screen recording tool for Windows.

> **Based on [Mun1to/winshotx](https://github.com/Mun1to/winshotx)** by Munir Torres (MIT).
> This fork started from upstream `0.3.6` and goes its own way from here: everything below the
> "What this fork adds" heading is new or changed in this edition. The upstream capture engine,
> recorder and frame editor are still at the core of it.

## Install

Grab `winshotx_<version>_x64-setup.exe` from
[**Releases**](https://github.com/ITheFallenI/winshotx/releases/latest) and run it. It installs for
your user only, so Windows does not ask for administrator rights.

It lives in the system tray. If you cannot see the icon, look behind the `^` arrow on the taskbar.

> This edition does **not** update from upstream. Installing it over the original winshotx keeps
> your settings and captures, and upstream releases will no longer replace it.

## What this fork adds

### Gallery
- A **Gallery** tab (and **Capture gallery** in the tray) for every saved screenshot, GIF and MP4,
  grouped by day.
- Search by filename, filter by date and type, and page through large folders.
- Thumbnails load only when they are on screen, two at a time, so big folders stay light.
- Preview with **Ctrl + mouse wheel** zoom, drag to pan, **Fit** and **100%**. Videos load only when
  opened.
- Copy, open, show in folder, rename, or move to the **Recycle Bin** (restorable).

### Image comparison
- Pick two captures (or any two files) and compare them with a reveal slider or a difference view.
- Adjustable noise tolerance and zoom; export a side-by-side or difference PNG.

### Editable annotations
- Press **0** / **Select annotation** to move, resize, recolour and delete marks after drawing them.
- Edit text and its size after placing it.
- Full **Undo / Redo** (`Ctrl+Z`, `Ctrl+Y` / `Ctrl+Shift+Z`).
- **Freehand brush** (`7`) with thin, medium and thick strokes.
- Closing the editor with unsaved changes asks first.

### Open existing images
- **Open image…** from the tray, Settings or `Ctrl+O` in the editor (PNG, JPEG, BMP).
- `Ctrl+V` pastes an image from the clipboard straight into the editor.
- Drop an image file onto the editor to open it.
- Each image gets its own editor window, so opening another never throws away unsaved work.

### Capture overlay
- **Window spotlight**: the window under the cursor stays bright while the rest of the screen dims,
  with a glowing border and title chip that slide between windows. You can turn it off or pick its
  colour (8 swatches plus a custom colour picker).
- **Highlights the window you can actually see.** Upstream picked the smallest window under the
  cursor, which was often one hidden behind another. Click-through overlays (NVIDIA, Discord, Game
  Bar) are ignored.
- **Multi-monitor:** the magnifier, crosshair and mode bar only appear on the screen the cursor is on.
- **Right-click cancels on release**, so the app underneath no longer gets a stray context menu.
- The overlay reliably takes keyboard focus even when the taskbar or Start menu was in front, so
  `Esc` always works.

### Saving and the tray
- **Dated folders:** captures are saved to `YYYY-MM-DD/Images`, `YYYY-MM-DD/Videos` and
  `YYYY-MM-DD/GIFs` inside your shots folder. Older files are still found by the gallery and tray.
- **Copy and save at once:** in the "copied automatically" profile, every capture can also be saved
  as a PNG without going through the toolbar.
- **Configurable tray left-click:** open the latest save folder (default, including **Save as**
  locations), capture, record, Gallery, Settings or the captures folder. Right-click still opens the
  menu.

### Shortcuts
- **Function keys on their own:** `F1`–`F12` work as shortcuts without Ctrl/Shift/Alt/Win (for
  example `F2` to capture).
- **Clear a shortcut** with its remove button or Delete/Backspace.
- **Shortcuts over admin windows:** an optional helper lets shortcuts work while Task Manager or
  another elevated window is in front. Windows asks for permission once when you turn it on.
- Fixed shortcuts wrongly showing as "taken" after quickly changing settings.

### Recording and export
- Choose **H.264** or **H.265 (HEVC)** before recording; the choice is remembered.
- MP4 exports no longer lose time when the screen stays still. Long still stretches used to cut
  off the end of the video.
- Stopping while paused no longer adds the pause to the end of the recording.
- Exporting a recording with no frames shows an error instead of crashing.
- Faster GIF export read-ahead, lighter audio buffering, and a faster magnifier/colour picker.

### Lighter in the background
- Hidden overlay and settings windows release their memory until they are needed again.

Some of the recording fixes come from contributor pull requests to upstream by
[@wang13zhe](https://github.com/wang13zhe), and they're credited in the commit history.

## What it does (from upstream)

Region capture over a frozen screen with a 6× pixel magnifier and hex colour picker, window
snapping, GIF and MP4 recording through Windows Graphics Capture, system audio, a frame-by-frame
editor with trimming, cropping, aspect presets and export speed, a "last few seconds" replay
buffer, OCR text copy (`T`), pinning (`A`), personal data masking, a capture timer, light and dark
themes, and Spanish, English and Chinese. No account, no cloud and no telemetry.

## Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+2` | Capture a region |
| `Win+Shift+L` | Capture a region straight into the editor |
| `Ctrl+Shift+5` | Record a region · press again to stop |
| `Ctrl+Shift+6` | Keep the last few seconds (when enabled) |
| `Enter` / `Ctrl+S` / `Ctrl+Shift+S` | Copy / save / save as |
| `E` / `A` / `T` / `C` | Editor / pin / copy text / copy colour |
| `G` / `V` / `W` | Record as GIF / video / only the window under the cursor |
| `Ctrl+A` | Whole monitor |
| `Esc` or right-click | Cancel |

Editor: `0` select, `1` arrow, `2` box, `3` text, `4` highlight, `5` numbered step, `6` hide details,
`7` brush, `Ctrl+Z` / `Ctrl+Y` undo/redo, `Ctrl+O` open image, `Ctrl+V` paste image.

Every global shortcut can be changed in Settings.

## Development

```bash
pnpm install          # or: npm install
pnpm tauri dev        # run the app (it lives in the tray)
pnpm tauri build      # NSIS setup in src-tauri/target/release/bundle/nsis
```

Without pnpm on your PATH:

```bash
npx tauri build --config '{"build":{"beforeBuildCommand":"npm run build"}}'
```

Tests:

```bash
npx vitest run        # frontend
cd src-tauri && cargo test --lib
```

Source identifiers and comments are mostly in Spanish, inherited from upstream.
[`docs/TRAMPAS.md`](docs/TRAMPAS.md) lists the Tauri v2 pitfalls on Windows found along the way.

**Updates:** the updater points at this fork's releases, but signed update packages are not
published yet. Updating means downloading the new setup from Releases.

## License

[MIT](LICENSE). Original work © Munir Torres ([Mun1to/winshotx](https://github.com/Mun1to/winshotx)).
Fork changes by [ITheFallenI](https://github.com/ITheFallenI).
