//! The actual last successful save location, independent of a currently open settings form.
use std::path::{Path, PathBuf};
use parking_lot::Mutex;
use tauri::{AppHandle, Manager};

pub struct LatestSave {
    folder: Mutex<Option<PathBuf>>,
    file: PathBuf,
}

impl LatestSave {
    pub fn load(file: PathBuf) -> Self {
        let folder = std::fs::read(&file).ok().and_then(|raw| serde_json::from_slice::<PathBuf>(&raw).ok())
            .filter(|folder| folder.is_absolute());
        Self { folder: Mutex::new(folder), file }
    }

    pub fn remember_file(&self, path: &Path) -> std::io::Result<()> {
        let absolute = if path.is_absolute() { path.to_path_buf() } else { std::env::current_dir()?.join(path) };
        let Some(parent) = absolute.parent() else { return Ok(()); };
        let mut latest = self.folder.lock();
        *latest = Some(parent.to_path_buf());
        if let Some(dir) = self.file.parent() { std::fs::create_dir_all(dir)?; }
        let pending = self.file.with_extension("tmp");
        let bytes = serde_json::to_vec(parent).map_err(std::io::Error::other)?;
        std::fs::write(&pending, bytes)?;
        std::fs::rename(pending, &self.file)?;
        Ok(())
    }

    pub fn folder(&self, captures: &Path) -> PathBuf {
        if let Some(folder) = self.folder.lock().clone().filter(|folder| folder.is_dir()) { return folder; }
        // Existing captures predate the save journal. Include images, GIFs and videos.
        crate::gallery::scan(captures).ok().and_then(|items| items.first()
            .and_then(|item| Path::new(&item.path).parent().map(Path::to_path_buf)))
            .unwrap_or_else(|| captures.to_path_buf())
    }
}

/// Updating history must never turn a successful capture into a failed one.
pub fn remember(app: &AppHandle, path: &Path) {
    if let Some(latest) = app.try_state::<LatestSave>() {
        if let Err(error) = latest.remember_file(path) { eprintln!("[last-save] {error}"); }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn custom_save_location_survives_restart_and_a_settings_root_change() {
        let root = std::env::temp_dir().join(format!("winshotx-last-save-{}", uuid::Uuid::new_v4()));
        let captures = root.join("captures");
        let custom = root.join("project");
        std::fs::create_dir_all(&custom).unwrap();
        let file = root.join("state/latest.json");
        let tracker = LatestSave::load(file.clone());
        tracker.remember_file(&custom.join("image.png")).unwrap();
        assert_eq!(LatestSave::load(file.clone()).folder(&captures), custom);
        let newer = root.join("another-project");
        std::fs::create_dir_all(&newer).unwrap();
        tracker.remember_file(&newer.join("video.mp4")).unwrap();
        assert_eq!(LatestSave::load(file).folder(&captures), newer);
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn missing_or_corrupt_history_falls_back_to_latest_existing_media_then_root() {
        let root = std::env::temp_dir().join(format!("winshotx-last-fallback-{}", uuid::Uuid::new_v4()));
        let folder = root.join("2026-10-22/Videos");
        std::fs::create_dir_all(&folder).unwrap();
        std::fs::write(folder.join("clip.mp4"), b"test").unwrap();
        let file = root.join("latest.json");
        std::fs::write(&file, b"corrupt").unwrap();
        let tracker = LatestSave::load(file);
        assert_eq!(tracker.folder(&root), folder);
        std::fs::remove_file(folder.join("clip.mp4")).unwrap();
        assert_eq!(tracker.folder(&root), root);
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn journal_write_failure_keeps_the_successful_save_in_memory() {
        let root = std::env::temp_dir().join(format!("winshotx-last-blocked-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let blocker = root.join("not-a-directory");
        std::fs::write(&blocker, b"keep").unwrap();
        let tracker = LatestSave::load(blocker.join("latest.json"));
        assert!(tracker.remember_file(&root.join("shot.png")).is_err());
        assert_eq!(tracker.folder(&root.join("other")), root);
        std::fs::remove_dir_all(root).unwrap();
    }
}
