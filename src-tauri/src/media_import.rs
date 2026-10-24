//! Importacion de imagenes existentes como sesiones normales del editor.
use std::{io::Cursor, path::Path};
use image::RgbaImage;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use crate::{error::{AppError, Result}, state::AppState};

const MAX_BYTES: u64 = 100 * 1024 * 1024;

pub fn decode_image(bytes: &[u8]) -> Result<RgbaImage> {
    if bytes.len() as u64 > MAX_BYTES { return Err("Image is too large (100 MB maximum).".into()); }
    let mut reader = image::ImageReader::new(Cursor::new(bytes)).with_guessed_format()?;
    if !matches!(reader.format(), Some(image::ImageFormat::Png | image::ImageFormat::Jpeg | image::ImageFormat::Bmp)) {
        return Err("Choose a PNG or JPEG image.".into());
    }
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(20000);
    limits.max_image_height = Some(20000);
    limits.max_alloc = Some(256 * 1024 * 1024);
    reader.limits(limits);
    Ok(reader.decode()?.into_rgba8())
}

pub fn read_image(path: &Path) -> Result<RgbaImage> {
    if std::fs::metadata(path)?.len() > MAX_BYTES { return Err("Image is too large (100 MB maximum).".into()); }
    decode_image(&std::fs::read(path)?)
}

#[cfg(windows)]
fn clipboard_image() -> Result<RgbaImage> {
    use clipboard_win::{Clipboard, formats, register_format, Getter};
    let _clipboard = Clipboard::new_attempts(10).map_err(|e| AppError::Msg(e.to_string()))?;
    let mut bytes = Vec::new();
    if let Some(format) = register_format("PNG") {
        if formats::RawData(format.get()).read_clipboard(&mut bytes).is_ok() && !bytes.is_empty() {
            return decode_image(&bytes);
        }
    }
    bytes.clear();
    formats::Bitmap.read_clipboard(&mut bytes)
        .map_err(|_| AppError::Msg("The clipboard does not contain an image.".into()))?;
    decode_image(&bytes)
}

#[cfg(not(windows))]
fn clipboard_image() -> Result<RgbaImage> { Err(AppError::Unsupported) }

#[tauri::command]
pub async fn open_image(app: AppHandle, path: Option<String>, clipboard: Option<bool>) -> Result<Option<String>> {
    let image = if clipboard.unwrap_or(false) { clipboard_image()? } else {
        let path = match path {
            Some(path) => std::path::PathBuf::from(path),
            None => {
                let Some(file) = app.dialog().file().add_filter("Images", &["png", "jpg", "jpeg", "bmp"])
                    .blocking_pick_file() else { return Ok(None); };
                file.into_path().map_err(|_| AppError::Msg("Choose a local image file.".into()))?
            }
        };
        read_image(&path)?
    };
    let region = crate::capture::Rect { x: 0, y: 0, width: image.width(), height: image.height() };
    let session = crate::recorder::session_from_image(&app, &image, region)?;
    let id = session.id.clone();
    let dentro = app.clone();
    app.run_on_main_thread(move || {
        if let Err(error) = crate::windows_mgr::open_editor(&dentro, &session.id) {
            eprintln!("[import] {error}");
            dentro.state::<AppState>().sessions.write().remove(&session.id);
            let _ = std::fs::remove_dir_all(session.dir);
        }
    })?;
    Ok(Some(id))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn imported_png_keeps_pixels_and_alpha() {
        let source = RgbaImage::from_pixel(32, 16, image::Rgba([42, 81, 123, 170]));
        let bytes = crate::encode::png::to_bytes(&source).unwrap();
        assert_eq!(decode_image(&bytes).unwrap(), source);
        assert!(decode_image(b"not an image").is_err());
    }
}
