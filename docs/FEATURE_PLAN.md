# WinShot feature plan

Date: 22 October 2026

Status: Implementation authorised by the user on 22 October 2026. See the delivery
checkpoint below for what is implemented and what remains.

## Delivery checkpoint: 22 October 2026

Implemented:

- Configurable tray left click: latest save folder (default), capture, record, Gallery,
  Settings, or capture root. Successful saves update a separate durable folder journal,
  including custom Save As paths, pinned saves and comparisons. Older captures provide
  a fallback. Tour is removed from the bottom bar and the About section is removed.

- Navigation: Capture, Record, Gallery, keyboard icon + Keys, and an icon-only Settings
  button with an accessible name and tooltip. The always-recording switch is removed
  from the tray menu; its setting remains in Record.
- Annotation selection, movement, resize handles for shapes/text/brush paths, deletion,
  recolouring, brush thickness, editable text and text size. Numbered markers can be moved
  and recoloured; their marker size remains fixed.
- Undo/Redo with one history entry per drag/resize/stroke and grouped text editing.
- Opening PNG/JPEG/BMP files, native file-drop imports and clipboard-image import. Imports
  create independent editors. Unsaved annotation/crop changes are marked and protected.
- Gallery is a tab in the main window, including when opened from the tray. Date groups, filename
  search, date/media filters, image thumbnails, GIF/MP4 preview, copy/open/edit-image/reveal,
  rename and Recycle Bin controls are included. Files are paginated, 60 per page; thumbnail
  decoding is lazy and limited to two images at a time. Queued offscreen work is cancelled
  and offscreen thumbnails are released. Refresh occurs on focus, on request and
  periodically while visible. Leaving the tab stops its polling and unloads previews.
- Image previews support Ctrl + mouse wheel zoom anchored at the pointer, drag-to-pan,
  Fit and 100%, with bounded panning. Only the selected original loads. Video elements
  are created on demand with no preload, and closing the preview releases the decoder.
- New saves use `YYYY-MM-DD/Images`, `YYYY-MM-DD/Videos`, or `YYYY-MM-DD/GIFs`.
  Gallery file actions and tray recents support these subfolders alongside older layouts.
- Comparison from two selected gallery images or two chosen files: reveal slider,
  difference view, noise tolerance, zoom, dimension notices, swapping, changed-pixel count,
  and PNG exports of differences or side-by-side images. Matching runs in a worker.

Remaining from the original plan:

- Scrolling capture is not implemented.
- Reopening saved MP4/GIF files as editable sessions after temporary session cache expires
  is not implemented. Gallery videos can be previewed or opened in the default player.
- Gallery metadata currently shows filename, date, type and size. Rich duration/dimension
  metadata, video thumbnails and immediate filesystem watching are follow-up work.
- New gallery/comparison controls currently use English. Full translation of those views,
  deeper large-library profiling and broader mixed-DPI manual checks remain.
- Persistent editable project files remain deferred; exported images/videos are flattened.

Validation evidence and the final installer status are recorded in
`docs/FEATURE_CHECKPOINT.md`.

## Agreed scope

1. Improve the editor so annotations can be selected and changed, with Undo/Redo,
   adjustable text size, and importing existing images or clipboard images.
2. Add a capture gallery for screenshots and recordings, organised by day.
3. Add before/after image comparison.
4. Add scrolling screenshots.
5. Use keyboard icon + Keys and an icon-only Settings tab (owner clarification), and
   provide Gallery as its own tab with pan/zoom and bounded media loading.

The proposed order is icons -> editor and imports -> gallery -> comparison -> scrolling
capture. Importing existing media enables the gallery's Edit action. Comparison can reuse
the gallery and image-loading work. Scrolling capture is the largest and most timing-sensitive
feature, so it comes after those foundations.

## Current implementation to build on

- Settings navigation is defined in `src/components/settings/SettingsHeader.tsx`.
  The shared `Segmented` control currently replaces a label when its `icono` option is used.
- Annotations are normalised coordinates held by `EditorApp.tsx` and displayed by
  `CapaAnotaciones.tsx`. Rust paints the final output in `encode/anotacion.rs`.
  The editor currently supports adding annotations, undoing the last mark and clearing all.
- The editor loads internal capture sessions. There is no general file/clipboard import flow.
- The tray reads four recent images. `archivos.rs` scans the save root and dated subfolders,
  includes older captures in the root, and currently limits results to 20 images.
- Recording sessions are temporary cache and can be purged after a day. A permanent gallery
  must use saved media files rather than depend on those sessions surviving.
- Capture, OCR, pinning, H.264/H.265, audio, replay, trimming, crop, export backgrounds,
  annotations and the existing keyboard shortcuts already work and need regression coverage.

`docs/ARQUITECTURA.md` contains historical proposals that differ from today's code. Use the
current source for implementation decisions, while keeping its goal of small independent
modules and a compact interface.

## Phase 0: Settings tab icons

Size: Small.

- Windows keys: a keyboard icon next to the label.
- The app: a settings/gear icon next to the label.
- Keep the current English labels and tab order. Icons supplement the labels.
- Use the existing Lucide icon style, size and selected/unselected colours.
- Add an optional leading-icon mode to the shared control, or an equivalent small header
  adaptation. Preserve existing icon-only controls elsewhere in the app.
- Keep accessible names, keyboard focus and the current selected-state announcement.

Acceptance:

- Both icons and labels fit at the normal settings-window size and Windows display scaling.
- Changing tabs still selects the same settings section.
- Light/dark themes and English, Spanish and Chinese remain legible without clipping.

## Phase 1: Editable annotations and existing-image imports

Size: Large. Deliver as separate editor-state, interaction and import changes.

### Annotation editing

- Add a Select tool, selected-object outline and appropriate handles.
- Select, move, resize and delete individual annotations, including freehand strokes.
- Change the selected object's colour and applicable thickness/text settings.
- Edit existing text and adjust its font size. Keep text placement and export consistent.
- Add Undo/Redo buttons and standard shortcuts: Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z.
- Treat each completed drag, resize, text edit or brush stroke as one undo step.
- A new edit after Undo clears the redo branch. Merely selecting an object does not.
- Clear selection before Escape closes the editor. Delete/Backspace must keep working
  normally when typing in a text field.
- Keep annotations in normalised coordinates so preview resizing, crop and export agree.
- Preserve brush point paths when moving/resizing, numbered-step labels when editing,
  and the existing privacy-mask rendering.

Implementation boundaries:

- Extract selection/hit-testing and undo history into focused editor modules rather than
  growing all interaction logic inside `EditorApp.tsx`.
- Keep the annotation schema shared conceptually between TypeScript and Rust. Any new
  fields need backward-compatible defaults and matching rendering behavior.
- Use the same text metrics/font sizing in preview and final output, allowing for the
  existing native renderer's capabilities.

### Open existing images

- Add Open image, drag-and-drop and Ctrl+V clipboard import.
- Initially support PNG and JPEG, with other formats shown only when decoding is supported.
- Decode and validate the source, then create a normal single-frame editor session.
- Keep the original file intact; use Save as/new output as the default for imported images.
- Report unreadable files, unsupported formats, empty clipboards and oversized images clearly.
- Add a dirty-edit indicator and an unsaved-changes prompt when closing or replacing an
  edited image. Cancel returns to the same work without losing it.

Acceptance:

- Draw an arrow, move/resize it, recolour it, Undo and Redo: preview and saved PNG agree.
- Repeat for text, brush strokes and privacy masks; test overlapping annotations.
- Verify the same edited annotations in saved H.264/H.265 video and GIF output.
- Existing capture shortcuts, crop controls, playback and keyboard text entry still work.
- Opening/pasting an image permits editing without first taking a screenshot.

## Phase 2: Capture gallery

Size: Large.

### Browse and organise

- Provide a Gallery entry in the tray and an accessible entry from Settings > The app.
  Keep gallery browsing in its own view/window rather than adding more settings tabs.
- Show date groups with image thumbnails and recording previews.
- Include PNG/JPEG screenshots, GIFs and MP4 recordings from the chosen save root and
  dated subfolders, including legacy files saved directly in the root.
- Offer filename search, date filtering and Images/Videos/All filtering.
- Show filename, date, dimensions, file size and video duration where available.
- Provide Copy, Open, Edit, Rename, Show in folder and Delete to Recycle Bin.
- Refresh after app saves and external file changes. Handle missing/unavailable folders
  without blocking capture or recording.
- Preserve existing folders and filenames unless the user explicitly renames/deletes an item.

### Reopen for editing

- Reuse Phase 1 imports for saved images.
- Reuse a live internal recording session when it is still available.
- When it is gone, import the saved MP4/GIF into a new editable session with its timing
  and audio preserved where applicable. Probe decoder availability first, including HEVC.
- If a decoder is unavailable, keep playback/open-in-default-app available and explain
  what is needed for editing. Do not silently install or bundle a large dependency.
- A flattened saved image/video cannot recover its previous individual annotation objects
  or original click/keyboard metadata. Reopening permits new edits over the saved result.

Implementation boundaries:

- Create a paginated media-list API; do not expand the tray's small recent-image API into
  a full synchronous scan on every opening.
- Load thumbnails and video metadata in the background with bounded concurrency and a
  rebuildable thumbnail cache. Virtualise the list/grid for large folders.
- Keep native window operations on the main thread and scanning/decoding off that thread.
- Grant asset access only for files actually returned to the interface.
- Use path/size/modified-time information to invalidate stale previews after rename or
  external replacement. Deletion should close/reconcile any dependent preview safely.

Acceptance:

- A mixed folder with thousands of captures scrolls smoothly without decoding every file.
- Daily folders and older root files both appear, including saved recordings.
- Rename, external deletion, duplicate names and a changed save directory update correctly.
- A saved H.264/H.265 clip can be reopened after restarting the app and clearing session
  cache when a compatible decoder is available.
- Deleting uses the Recycle Bin; an interrupted/failed operation does not lose another file.

## Phase 3: Before/after comparison

Size: Medium. Depends on image imports and gallery selection.

- Select two images in the gallery and choose Compare, or open two files directly.
- Provide a draggable before/after divider with clear image labels.
- Add a difference view highlighting changed pixels, with linked pan and zoom.
- Show dimension mismatches explicitly. Compare at original pixel scale by default;
  fit-to-view changes presentation without silently resizing the comparison inputs.
- Provide a noise-tolerance control for small compression/anti-aliasing differences.
- Allow swapping Before/After and exporting a side-by-side image or difference image.
- Start with still images. Comparing video timelines is outside this phase.

Acceptance:

- Identical images show no changes; a known one-pixel change is detected at zero tolerance.
- Different dimensions, transparency and JPEG noise produce understandable results.
- Large game screenshots remain responsive while panning, zooming and moving the divider.
- Exported comparison images agree with the displayed mode and preserve the source files.

## Phase 4: Scrolling screenshots

Size: Large; highest capture/compatibility risk.

- Add Scrolling capture to the tray/capture choices as a separate capture mode.
- Let the user select the scrollable content area and start vertical capture.
- Offer automatic scrolling within the selected target and manual scrolling as a fallback.
- Capture live frames while scrolling; use the frozen capture overlay only for selection.
- Detect overlap, align segments and assemble a single full-resolution image.
- Preview the assembled result, offer trimming of duplicated headers/footers, then open
  it in the normal editor for annotation, copying and saving.
- Provide visible progress, Stop/Finish and Escape to cancel, plus a maximum height/time
  limit so an infinite page cannot fill the disk or memory.
- Stop safely if the target disappears, focus moves to another app, or the content stops
  making progress. Never send scrolling input into an unrelated window.
- Report uncertain alignment and allow retry/manual trimming rather than silently saving
  an obviously broken stitch.

Implementation boundaries:

- Put orchestration and overlap/stitching in separate native modules. Reuse the existing
  capture backend and image-session import path.
- Keep Windows input/window calls on the appropriate thread; perform matching and image
  assembly in background work with bounded memory and cancellable temporary storage.
- Start with vertical scrolling. Horizontal and two-dimensional scrolling are later work.

Acceptance:

- Capture representative long browser pages, document views and chat lists, including
  sticky headers, repeated rows, animated content and a target on a secondary monitor.
- Check 100%, 125% and 150% display scaling and mixed-DPI monitors.
- Verify no duplicated/missing lines at joins in the supported cases; unsupported layouts
  produce a clear warning or a usable manual fallback.
- Cancel, target closure and disk-limit cases clean up temporary data and restore input state.

## Delivery and validation

- Implementation is authorised. Complete and validate the remaining work in focused stages.
- Use focused frontend and native tests for real interaction/data failure cases, plus native
  Windows checks of preview/export agreement. Compile success alone is insufficient.
- Exercise first-open behavior and repeated use so the tray/menu timing regression stays fixed.
- Check saved preferences, unassigned shortcuts, dated saving and existing recordings for
  compatibility. Add sensible defaults for any new persisted settings.
- Package/install only after the relevant checks pass, and identify the exact features
  included in that build. Avoid repeating unrelated full test runs after an unchanged pass.

## Deferred scope

Persistent editable project files, OCR-indexed gallery search, cloud uploads, background
removal, new codecs, video-to-video comparison, extra annotation shapes and custom capture
workflows are separate proposals. They are not part of these five agreed items.
