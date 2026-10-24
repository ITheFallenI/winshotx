//! Galeria de archivos guardados. La cache del editor no es el historial.
use std::{path::{Path, PathBuf}, hash::{Hash, Hasher}, time::UNIX_EPOCH};
use serde::Serialize;
use tauri::{AppHandle, Manager};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use crate::{error::{AppError, Result}, state::AppState};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GalleryItem { pub path: String, pub name: String, pub day: String, pub bytes: u64, pub modified: u64, pub kind: String }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GalleryPage { pub items: Vec<GalleryItem>, pub total: usize, pub directory: String }

fn media_kind(path: &Path) -> Option<&'static str> {
    match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "png" | "jpg" | "jpeg" | "bmp" => Some("image"),
        "gif" => Some("gif"), "mp4" => Some("video"), _ => None,
    }
}
fn root(app: &AppHandle) -> PathBuf { PathBuf::from(app.state::<AppState>().settings.read().save_directory.clone()) }

pub fn scan(directory: &Path) -> Result<Vec<GalleryItem>> {
    if !directory.exists() { return Ok(Vec::new()); }
    let mut items = Vec::new();
    for (folder, folder_day) in crate::archivos::capture_folders(directory)? {
        let Ok(entries) = std::fs::read_dir(&folder) else { continue; };
        for entry in entries.flatten() {
            if !entry.file_type().is_ok_and(|t| t.is_file()) { continue; }
            let path = entry.path();
            let Some(kind) = media_kind(&path) else { continue; };
            let Ok(meta) = entry.metadata() else { continue; };
            let modified = meta.modified().unwrap_or(UNIX_EPOCH);
            let date: chrono::DateTime<chrono::Local> = modified.into();
            let day = folder_day.clone().unwrap_or_else(|| date.format("%Y-%m-%d").to_string());
            items.push(GalleryItem { path: path.to_string_lossy().into(), name: entry.file_name().to_string_lossy().into(),
                day, bytes: meta.len(), modified: modified.duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64, kind: kind.into() });
        }
    }
    items.sort_by(|a,b| b.modified.cmp(&a.modified).then_with(|| a.path.cmp(&b.path)));
    Ok(items)
}

fn gallery_path(app: &AppHandle, path: &str) -> Result<PathBuf> {
    let path = std::fs::canonicalize(path)?;
    let root = std::fs::canonicalize(root(app))?;
    let relative = path.strip_prefix(root).map_err(|_| AppError::Msg("That file is outside the capture folder.".into()))?;
    if !capture_relative_path(relative) || media_kind(&path).is_none() || !path.is_file() {
        return Err("That file is not a saved capture.".into());
    }
    Ok(path)
}

fn capture_relative_path(relative: &Path) -> bool {
    let parts: Vec<_> = relative.components().collect();
    let dated = || parts[0].as_os_str().to_str().is_some_and(crate::archivos::dated_folder);
    parts.len() == 1 || parts.len() == 2 && dated() || parts.len() == 3 && dated() &&
        parts[1].as_os_str().to_str().is_some_and(crate::archivos::media_folder)
}

fn rename_capture(path: &Path, name: &str) -> Result<PathBuf> {
    if name.is_empty() || name.trim() != name || name.ends_with('.') || name.contains(['<','>',':','"','/','\\','|','?','*','\0']) ||
        Path::new(name).extension().map(|s| s.to_ascii_lowercase()) != path.extension().map(|s| s.to_ascii_lowercase()) {
        return Err("Enter a valid filename and keep the same file extension.".into());
    }
    let target = path.with_file_name(name);
    if target == path { return Ok(target); }
    // Windows ignores case, so `shot.png` -> `Shot.png` finds the file itself: that is a
    // rename, not a collision.
    let same_file = std::fs::canonicalize(&target).is_ok_and(|t| std::fs::canonicalize(path).is_ok_and(|p| p == t));
    if target.exists() && !same_file { return Err("A file with that name already exists.".into()); }
    #[cfg(windows)] unsafe {
        // MoveFileW refuses collisions, including a file created after the exists check.
        windows::Win32::Storage::FileSystem::MoveFileW(
            &windows::core::HSTRING::from(path.to_string_lossy().as_ref()),
            &windows::core::HSTRING::from(target.to_string_lossy().as_ref()))?;
    }
    #[cfg(not(windows))]
    { return Err(AppError::Unsupported); }
    Ok(target)
}

#[cfg(windows)]
fn recycle_capture(path: PathBuf) -> Result<()> {
    std::thread::spawn(move || -> Result<()> {
        use windows::{core::HSTRING, Win32::{System::Com::{CoInitializeEx, CoUninitialize, CoCreateInstance, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED},
            UI::Shell::{IFileOperation, IShellItem, IFileOperationProgressSink, FileOperation, SHCreateItemFromParsingName,
                FOFX_RECYCLEONDELETE, FOFX_ADDUNDORECORD, FOFX_EARLYFAILURE, FOF_NOCONFIRMATION, FOF_WANTNUKEWARNING}}};
        unsafe {
            CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok()?;
            struct ComGuard;
            impl Drop for ComGuard { fn drop(&mut self) { unsafe { CoUninitialize(); } } }
            let _guard = ComGuard;
            let operation: IFileOperation = CoCreateInstance(&FileOperation, None, CLSCTX_INPROC_SERVER)?;
            operation.SetOperationFlags(FOFX_RECYCLEONDELETE | FOFX_ADDUNDORECORD | FOFX_EARLYFAILURE | FOF_NOCONFIRMATION | FOF_WANTNUKEWARNING)?;
            // canonicalize adds the Win32 extended prefix; the Shell parser expects
            // ordinary drive/UNC display names instead.
            let item: IShellItem = SHCreateItemFromParsingName(&HSTRING::from(shell_path(&path)), None)?;
            operation.DeleteItem(&item, None::<&IFileOperationProgressSink>)?;
            operation.PerformOperations()?;
            if operation.GetAnyOperationsAborted()?.as_bool() { return Err("The file was not moved to the Recycle Bin.".into()); }
        }
        Ok(())
    }).join().map_err(|_| AppError::Msg("Recycle Bin operation failed.".into()))?
}

#[cfg(windows)]
fn shell_path(path: &Path) -> String {
    let text = path.to_string_lossy();
    if let Some(unc) = text.strip_prefix(r"\\?\UNC\") { format!(r"\\{unc}") }
    else { text.strip_prefix(r"\\?\").unwrap_or(&text).to_string() }
}

#[tauri::command]
pub async fn gallery_manage(app: AppHandle, path: String, operation: String, name: Option<String>) -> Result<Option<String>> {
    let path = gallery_path(&app, &path)?;
    match operation.as_str() {
        "rename" => Ok(Some(rename_capture(&path, &name.ok_or("Enter a filename.")?)?.to_string_lossy().into())),
        "recycle" => {
            #[cfg(windows)] { recycle_capture(path)?; Ok(None) }
            #[cfg(not(windows))] { Err(AppError::Unsupported) }
        }
        _ => Err("Unknown gallery operation.".into()),
    }
}

#[tauri::command]
pub async fn gallery_list(app: AppHandle, query: String, kind: String, day: String, offset: usize, limit: usize) -> Result<GalleryPage> {
    let directory = root(&app);
    let query = query.to_lowercase();
    let mut items = scan(&directory)?;
    items.retain(|i| i.name.to_lowercase().contains(&query) && (day.is_empty() || i.day == day) &&
        (kind == "all" || kind == "images" && i.kind == "image" || kind == "videos" && i.kind != "image"));
    let total = items.len();
    let items: Vec<_> = items.into_iter().skip(offset).take(limit.clamp(1, 60)).collect();
    for item in &items { app.asset_protocol_scope().allow_file(&item.path)?; }
    Ok(GalleryPage { items, total, directory: directory.to_string_lossy().into() })
}

#[tauri::command]
pub async fn gallery_thumbnail(app: AppHandle, path: String) -> Result<String> {
    let path = gallery_path(&app, &path)?;
    let meta = std::fs::metadata(&path)?;
    let mut hash = std::collections::hash_map::DefaultHasher::new();
    path.hash(&mut hash); meta.len().hash(&mut hash); meta.modified()?.hash(&mut hash);
    let dir = app.state::<AppState>().temp_root.join("gallery-thumbnails");
    std::fs::create_dir_all(&dir)?;
    let dest = dir.join(format!("{:x}.png", hash.finish()));
    if !dest.exists() {
        let image = crate::media_import::read_image(&path)?;
        let thumbnail = image::imageops::thumbnail(&image, 320, 180);
        thumbnail.save(&dest)?;
    }
    app.asset_protocol_scope().allow_file(&dest)?;
    Ok(dest.to_string_lossy().into())
}

#[tauri::command]
pub async fn gallery_action(app: AppHandle, path: String, action: String) -> Result<()> {
    let path = gallery_path(&app, &path)?;
    match action.as_str() {
        "open" => app.opener().open_path(path.to_string_lossy(), None::<&str>).map_err(|e| AppError::Msg(e.to_string()))?,
        "copy" => if media_kind(&path) == Some("image") {
            let image = crate::media_import::read_image(&path)?;
            crate::platform::clipboard::copy_image(&image, &crate::encode::png::to_bytes(&image)?)?;
        } else { crate::platform::clipboard::copy_files(&[&path])?; },
        "reveal" => crate::platform::reveal(&path)?,
        _ => return Err("Unknown gallery action.".into()),
    }
    Ok(())
}

#[tauri::command]
pub async fn gallery_choose_images(app: AppHandle) -> Result<Vec<String>> {
    let Some(files) = app.dialog().file().add_filter("Images", &["png", "jpg", "jpeg", "bmp"]).blocking_pick_files() else { return Ok(Vec::new()); };
    if files.len() != 2 { return Err("Select exactly two images to compare.".into()); }
    let mut paths = Vec::new();
    for file in files { let path = file.into_path().map_err(|_| AppError::Msg("Choose local image files.".into()))?;
        app.asset_protocol_scope().allow_file(&path)?; paths.push(path.to_string_lossy().into()); }
    Ok(paths)
}

#[tauri::command]
pub async fn save_comparison(app: AppHandle, bytes: Vec<u8>) -> Result<String> {
    let image = crate::media_import::decode_image(&bytes)?;
    let destination = crate::archivos::destino(&root(&app), "png")?;
    image.save(&destination)?;
    crate::last_saved::remember(&app, &destination);
    Ok(destination.to_string_lossy().into())
}

pub fn show(app: &AppHandle) -> Result<()> {
    GALLERY_REQUESTED.store(true, Ordering::SeqCst);
    crate::windows_mgr::show_settings(app)
}
// Keep the request until React subscribes, including a first opening during startup.
static GALLERY_REQUESTED: AtomicBool = AtomicBool::new(false);
#[tauri::command]
pub fn take_gallery_request() -> bool { GALLERY_REQUESTED.swap(false, Ordering::SeqCst) }
#[tauri::command]
pub async fn open_gallery(app: AppHandle) -> Result<()> {
    let inside = app.clone(); app.run_on_main_thread(move || { if let Err(e) = show(&inside) { eprintln!("[gallery] {e}"); } })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(windows)]
    #[test]
    fn shell_paths_keep_drive_and_unc_names_without_extended_prefix() {
        assert_eq!(shell_path(Path::new(r"\\?\C:\shots\photo.png")), r"C:\shots\photo.png");
        assert_eq!(shell_path(Path::new(r"\\?\UNC\server\shots\photo.png")), r"\\server\shots\photo.png");
    }
    #[test]
    fn rename_rejects_collisions_and_directory_traversal() {
        let dir = std::env::temp_dir().join(format!("winshotx-rename-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("before.png");
        std::fs::write(&path, b"original").unwrap();
        std::fs::write(dir.join("taken.png"), b"keep").unwrap();
        assert!(rename_capture(&path,"taken.png").is_err());
        assert!(rename_capture(&path,"../outside.png").is_err());
        assert!(rename_capture(&path,"changed.jpg").is_err());
        assert!(rename_capture(&path,"bad?.png").is_err());
        assert_eq!(std::fs::read(dir.join("taken.png")).unwrap(), b"keep");
        let moved = rename_capture(&path,"renamed.png").unwrap();
        assert_eq!(std::fs::read(&moved).unwrap(), b"original");
        assert!(!path.exists());
        #[cfg(windows)] {
            let recased = rename_capture(&moved, "Renamed.png").unwrap();
            assert_eq!(std::fs::read(&recased).unwrap(), b"original");
            assert!(std::fs::read_dir(&dir).unwrap().flatten().any(|e| e.file_name() == "Renamed.png"));
        }
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn scans_daily_and_legacy_media_without_unrelated_folders() {
        let dir = std::env::temp_dir().join(format!("winshotx-gallery-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(dir.join("2026-10-22")).unwrap();
        std::fs::create_dir_all(dir.join("other")).unwrap();
        for folder in ["2026-10-22/Images", "2026-10-22/Videos", "2026-10-22/GIFs", "2026-10-22/Images/private", "2026-10-22/other", "Images"] {
            std::fs::create_dir_all(dir.join(folder)).unwrap();
        }
        for path in ["a.PNG", "2026-10-22/b.mp4", "2026-10-22/c.gif", "2026-10-22/Images/d.png", "2026-10-22/Videos/e.mp4", "2026-10-22/GIFs/f.gif",
            "other/private.png", "notes.txt", "2026-10-22/Images/private/no.png", "2026-10-22/other/no.png", "Images/no.png"] {
            std::fs::write(dir.join(path), b"x").unwrap();
        }
        let items = scan(&dir).unwrap();
        assert_eq!(items.len(), 6);
        assert!(items.iter().any(|i| i.name == "b.mp4" && i.day == "2026-10-22" && i.kind == "video"));
        for (name, kind) in [("d.png", "image"), ("e.mp4", "video"), ("f.gif", "gif")] {
            assert!(items.iter().any(|i| i.name == name && i.day == "2026-10-22" && i.kind == kind));
        }
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn file_actions_accept_only_root_dates_and_known_media_subfolders() {
        for path in ["old.png", "2026-10-22/old.png", "2026-10-22/Images/new.png", "2026-10-22/Videos/new.mp4", "2026-10-22/GIFs/new.gif"] {
            assert!(capture_relative_path(Path::new(path)), "{path}");
        }
        for path in ["other/private.png", "Images/private.png", "2026-10-22/other/private.png", "2026-10-22/Images/deeper/private.png", "2026-02-30/Images/private.png"] {
            assert!(!capture_relative_path(Path::new(path)), "{path}");
        }
    }
}
