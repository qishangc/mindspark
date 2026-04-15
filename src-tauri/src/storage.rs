use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use tauri::{AppHandle, Manager};

use crate::error::AppResult;
use crate::models::{AppSettings, AttachmentWriteResult, ImportResult, LegacyNote, Note, NoteSource};

const NOTES_FILE: &str = "notes.json";
const SETTINGS_FILE: &str = "settings.json";
const ATTACHMENTS_DIR: &str = "attachments";

pub struct StoragePaths {
    pub root: PathBuf,
    pub notes: PathBuf,
    pub settings: PathBuf,
    pub attachments: PathBuf,
}

pub fn storage_paths(app: &AppHandle) -> AppResult<StoragePaths> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data directory: {e}"))?
        .join("data");

    let notes = root.join(NOTES_FILE);
    let settings = root.join(SETTINGS_FILE);
    let attachments = root.join(ATTACHMENTS_DIR);

    Ok(StoragePaths {
        root,
        notes,
        settings,
        attachments,
    })
}

pub fn ensure_storage(app: &AppHandle) -> AppResult<StoragePaths> {
    let paths = storage_paths(app)?;
    fs::create_dir_all(&paths.root).map_err(|e| format!("Failed to create app data directory: {e}"))?;
    fs::create_dir_all(&paths.attachments)
        .map_err(|e| format!("Failed to create attachments directory: {e}"))?;

    if !paths.notes.exists() {
        fs::write(&paths.notes, "[]").map_err(|e| format!("Failed to initialize notes file: {e}"))?;
    }

    if !paths.settings.exists() {
        fs::write(&paths.settings, default_settings_json())
            .map_err(|e| format!("Failed to initialize settings file: {e}"))?;
    }

    Ok(paths)
}

pub fn read_notes(app: &AppHandle) -> AppResult<Vec<Note>> {
    let paths = ensure_storage(app)?;
    let raw = fs::read_to_string(&paths.notes).map_err(|e| format!("Failed to read notes: {e}"))?;
    serde_json::from_str::<Vec<Note>>(&raw).map_err(|e| format!("Failed to parse notes: {e}"))
}

pub fn write_notes(app: &AppHandle, notes: &[Note]) -> AppResult<()> {
    let paths = ensure_storage(app)?;
    let data =
        serde_json::to_string_pretty(notes).map_err(|e| format!("Failed to serialize notes: {e}"))?;
    fs::write(&paths.notes, data).map_err(|e| format!("Failed to write notes: {e}"))
}

pub fn read_settings(app: &AppHandle) -> AppResult<AppSettings> {
    let paths = ensure_storage(app)?;
    let raw = fs::read_to_string(&paths.settings).map_err(|e| format!("Failed to read settings: {e}"))?;
    serde_json::from_str::<AppSettings>(&raw).map_err(|e| format!("Failed to parse settings: {e}"))
}

pub fn write_settings(app: &AppHandle, settings: &AppSettings) -> AppResult<()> {
    let paths = ensure_storage(app)?;
    let data = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Failed to serialize settings: {e}"))?;
    fs::write(&paths.settings, data).map_err(|e| format!("Failed to write settings: {e}"))
}

pub fn write_attachment_from_data_url(
    app: &AppHandle,
    data_url: &str,
    filename_hint: Option<&str>,
) -> AppResult<AttachmentWriteResult> {
    let paths = ensure_storage(app)?;
    let (mime, bytes) = decode_data_url(data_url)?;
    let filename = build_attachment_filename(filename_hint, &mime);
    let target = paths.attachments.join(&filename);
    fs::write(&target, bytes).map_err(|e| format!("Failed to write attachment: {e}"))?;

    Ok(AttachmentWriteResult {
        attachment_path: format!("{ATTACHMENTS_DIR}/{filename}"),
        absolute_path: target.to_string_lossy().into_owned(),
    })
}

pub fn delete_attachment(app: &AppHandle, relative_path: &str) -> AppResult<()> {
    let paths = ensure_storage(app)?;
    let target = resolve_relative_attachment(&paths.attachments, relative_path)?;
    if target.exists() {
        fs::remove_file(target).map_err(|e| format!("Failed to delete attachment: {e}"))?;
    }
    Ok(())
}

pub fn resolve_attachment_path(app: &AppHandle, relative_path: &str) -> AppResult<String> {
    let paths = ensure_storage(app)?;
    let target = resolve_relative_attachment(&paths.attachments, relative_path)?;
    Ok(target.to_string_lossy().into_owned())
}

pub fn import_legacy_json(app: &AppHandle, raw: &str) -> AppResult<ImportResult> {
    let legacy =
        serde_json::from_str::<Vec<LegacyNote>>(raw).map_err(|e| format!("Invalid legacy JSON: {e}"))?;
    let mut notes = read_notes(app)?;
    let existing_ids: std::collections::HashSet<String> =
        notes.iter().map(|note| note.id.clone()).collect();
    let mut seen_ids = existing_ids;

    let mut imported = 0usize;
    let mut skipped = 0usize;
    let mut attachment_count = 0usize;

    for legacy_note in legacy {
        let Some(content) = legacy_note.content.filter(|content| !content.trim().is_empty()) else {
            skipped += 1;
            continue;
        };

        let id = legacy_note
            .id
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(next_id);

        if seen_ids.contains(&id) {
            skipped += 1;
            continue;
        }

        let created_at = legacy_note.created_at.unwrap_or_else(default_timestamp);
        let mut source = NoteSource {
            r#type: normalize_source_type(legacy_note.source_type.as_deref(), legacy_note.source_url.as_deref()),
            url: None,
            attachment_path: None,
            meta: legacy_note.source_meta,
        };

        if let Some(source_url) = legacy_note.source_url {
            if source_url.starts_with("data:image/") {
                let saved = write_attachment_from_data_url(app, &source_url, Some("legacy-image"))?;
                source.r#type = "image".into();
                source.attachment_path = Some(saved.attachment_path);
                attachment_count += 1;
            } else if source.r#type == "url" {
                source.url = Some(source_url);
            }
        }

        let note = Note {
            id: id.clone(),
            content,
            created_at: created_at.clone(),
            updated_at: created_at,
            parent_note_id: None,
            status: if legacy_note.archived.unwrap_or(false) {
                "archived".into()
            } else {
                "active".into()
            },
            view_count: legacy_note.view_count.unwrap_or(0),
            last_reviewed_at: None,
            snooze_until: None,
            source,
            embedding: legacy_note.embedding,
        };

        notes.push(note);
        seen_ids.insert(id);
        imported += 1;
    }

    notes.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    write_notes(app, &notes)?;

    Ok(ImportResult {
        imported,
        skipped,
        attachment_count,
    })
}

pub fn export_notes_json(app: &AppHandle) -> AppResult<String> {
    let notes = read_notes(app)?;
    serde_json::to_string_pretty(&notes).map_err(|e| format!("Failed to serialize export JSON: {e}"))
}

pub fn export_notes_markdown(app: &AppHandle) -> AppResult<String> {
    let notes = read_notes(app)?;
    let mut chunks = Vec::with_capacity(notes.len());

    for note in notes {
        let date = note.created_at.get(..10).unwrap_or("unknown-date");
        let mut block = format!("## {date}\n\n{}", note.content);

        match note.source.r#type.as_str() {
            "url" => {
                if let Some(url) = note.source.url {
                    block.push_str(&format!("\n\n> 🔗 {url}"));
                }
            }
            "image" => {
                if let Some(path) = note.source.attachment_path {
                    block.push_str(&format!("\n\n> 🖼️ {path}"));
                }
            }
            "text" => {
                if let Some(meta) = note.source.meta {
                    block.push_str(&format!("\n\n> 📝 {}", meta));
                }
            }
            _ => {}
        }

        chunks.push(block);
    }

    Ok(chunks.join("\n\n---\n\n"))
}

fn default_settings_json() -> &'static str {
    r#"{
  "schemaVersion": 1,
  "provider": "custom",
  "apiBaseUrl": "",
  "apiKey": "",
  "apiModel": "",
  "quickCaptureShortcut": null,
  "autostartEnabled": false,
  "dailyReminderEnabled": false
}"#
}

fn default_timestamp() -> String {
    "1970-01-01T00:00:00.000Z".into()
}

fn next_id() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}

fn normalize_source_type(source_type: Option<&str>, source_url: Option<&str>) -> String {
    match source_type.unwrap_or("none") {
        "url" => "url".into(),
        "image" => "image".into(),
        "text" => "text".into(),
        _ => {
            if let Some(url) = source_url {
                if url.starts_with("data:image/") {
                    "image".into()
                } else if url.starts_with("http://") || url.starts_with("https://") {
                    "url".into()
                } else {
                    "none".into()
                }
            } else {
                "none".into()
            }
        }
    }
}

fn resolve_relative_attachment(attachments_dir: &Path, relative_path: &str) -> AppResult<PathBuf> {
    let clean = relative_path.trim().trim_start_matches('/');
    let target = attachments_dir.join(clean.strip_prefix(&format!("{ATTACHMENTS_DIR}/")).unwrap_or(clean));

    if !target.starts_with(attachments_dir) {
        return Err("Attachment path escapes the attachments directory".into());
    }

    Ok(target)
}

fn decode_data_url(data_url: &str) -> AppResult<(String, Vec<u8>)> {
    let Some((header, payload)) = data_url.split_once(',') else {
        return Err("Invalid data URL payload".into());
    };

    if !header.starts_with("data:") || !header.ends_with(";base64") {
        return Err("Only base64 data URLs are supported".into());
    }

    let mime = header
        .trim_start_matches("data:")
        .trim_end_matches(";base64")
        .to_string();

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(payload)
        .map_err(|e| format!("Failed to decode attachment: {e}"))?;

    Ok((mime, bytes))
}

fn build_attachment_filename(filename_hint: Option<&str>, mime: &str) -> String {
    let ext = mime_to_extension(mime);
    let base = filename_hint
        .and_then(|value| Path::new(value).file_stem())
        .and_then(|stem| stem.to_str())
        .map(sanitize_filename)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "attachment".into());

    format!("{}-{}.{}", base, next_id(), ext)
}

fn mime_to_extension(mime: &str) -> &str {
    match mime {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/jpg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => "bin",
    }
}

fn sanitize_filename(input: &str) -> String {
    input
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}
