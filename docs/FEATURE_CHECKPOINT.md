# Feature delivery checkpoint — 22 October 2026

This checkpoint covers the implementation requested after `FEATURE_PLAN.md` was written.

## Implemented

- Removed the decorative capture-frame/X watermark behind the settings panels.

- Configurable tray left click in Settings > Tray icon. Default: open the last successfully
  saved capture's folder, including custom Save As locations. Alternatives: Capture,
  Record, Gallery, Settings and captures root. Save history is separate from settings,
  persists across restart, and ignores temporary pins, imports and failed/cancelled saves.
- Removed Tour from the bottom bar and removed About. The tour retained in Settings
  finishes on the tray action setting instead of the removed About panel.

- Keyboard icon + Keys, icon-only Settings, and a dedicated Gallery tab. Tray Gallery
  opens that tab; the tray no longer contains the always-recording switch.
- Editable annotations and Undo/Redo, including grouped text edits, freehand-path
  transformations, text-size export support and unsaved-change protection.
- Existing-image and clipboard imports; native file drops; separate editor windows.
- Paginated capture gallery, lazy image thumbnails, filtering, file actions and management.
- Image preview Ctrl + wheel zoom, drag panning, Fit and 100%. Offscreen thumbnail work
  is cancelled and thumbnails released; native thumbnail decoding stays capped at two.
  Videos load only on selection, without preload, and release their decoder on close.
- New captures are saved to `YYYY-MM-DD/Images`, `YYYY-MM-DD/Videos`, or `YYYY-MM-DD/GIFs`.
  Gallery and tray recents continue to include older root/day files.
- GIF export read-ahead now schedules both the palette-sampling pass and the full frame
  encoding pass. Previously, rereading after palette sampling exhausted the reader.
- Before/after comparison and difference/side-by-side PNG export.

## Validation

- Watermark removal: frontend build and 44 settings tests passed. Rebuilt and installed
  the EXE installer, verified the watermark SVG is absent in the installed WebView, and
  visually checked `C:\Users\Tyrone\AppData\Local\Temp\winshotx-no-watermark.png`.

- Tray-action update: all 392 frontend tests passed, along with four focused native tests
  for default/legacy preferences, all six saved choices, durable custom folder history,
  fallback handling, and a blocked journal write.
- The new release and installed app both passed actual left-click tray checks for all six
  actions. Explorer opened the latest Images, GIFs, Videos and custom Save As locations,
  plus the capture root when selected. Capture/Record opened their respective overlays;
  Settings and Gallery opened correctly. Failed exports, imports and cancelled overlays
  did not replace save history. Both the chosen action and custom folder survived restart.
  About and the footer Tour control were absent; no page errors were recorded.
  Installed-app evidence: `C:\Users\Tyrone\AppData\Local\Temp\winshotx-tray-actions-1792693531778\result.json`.
  Original preferences and prior save history were restored after the checks.

- Frontend type checking passed.
- Latest full frontend suite: 392 tests passed in 27 files, including tray action selection,
  removal of About and bottom-bar Tour, gallery navigation,
  pending tray requests, cancelled thumbnail queues, video lifecycle and zoom interaction.
- All 18 focused native file/folder and gallery tests passed after adding media folders.
- The GIF read-ahead regression passed for a single frame and 100 frames with sparse
  palette sampling, producing GIFs readable by the GIF decoder.
- All 11 GIF encoder tests also passed (30 focused native checks total for this update).
- The final release and installed executable both passed native WebView checks of the
  five navigation controls, icon-only Settings, tray-to-tab routing with no extra gallery
  window, 60/39 pagination over 99 fixtures, five small visible thumbnails and no grid video
  elements. Ctrl+wheel preserved the image pixel under the pointer without changing browser
  zoom; dragging, Fit and 100% worked. Closing a video removed its source and paused it.
- Actual PNG, JPEG, GIF and MP4 exports landed in the proper daily media folders, appeared
  in Gallery, and saved images appeared in tray recents. Test settings were restored.
  Installed-app evidence: `C:\Users\Tyrone\AppData\Local\Temp\winshotx-gallery-ui-1792692695490\result.json`.
- Added the missing own-window size permission used by the main window at startup; the
  final installed application check reported no unhandled page errors.
- After the final drawing lifecycle fix, the 47 focused editor tests passed again.
- Native encoder suite before the final gallery additions: 136 passed, 16 intentionally
  ignored. Focused image-import, gallery scanning/rename and text-sizing tests also passed.
- Native application check with generated images verified image import, brush movement,
  Undo/Redo, recolour in saved PNG pixels, unsaved-change confirmation, gallery access,
  worker-based comparison of a known 400-pixel change, and difference-PNG pixel values.
- Source images and original settings were preserved/restored by the native checks.
- The final installed release passed the native drawing/import/comparison check three
  times, including immediately drawing after selecting the brush. The complete stroke,
  Undo/Redo, saved recolour pixels and unsaved-change prompt were checked.
- Side-by-side PNG export was checked for its dimensions and expected source pixels.
- Gallery management was checked in the packaged app: rename, collision rejection,
  cancellation preserving the file, and deletion reaching the actual Windows Recycle Bin.
  An unrelated file in the same test folder remained intact.
- Windows Shell rejects the extended `\\?\` prefix returned by canonicalisation. The
  Recycle Bin path adapter handles ordinary drive and UNC paths; three focused gallery
  tests passed after that correction.
- The Windows installer was built and installed successfully. The Downloads copy is
  `C:\Users\Tyrone\Downloads\WinShotX-0.3.6-Windows-x64-Setup.exe`.

## Remaining

Scrolling capture, saved-video reimport/editing after cache expiry, video thumbnails,
duration/dimension metadata, complete gallery/comparison localisation, and broader library
performance/mixed-DPI validation remain. Numbered annotation markers keep their original
fixed size. Exported files do not preserve editable annotation objects across sessions.

No commit or push has been made for this delivery.
