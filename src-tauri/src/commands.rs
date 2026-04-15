use tauri::AppHandle;

use crate::error::AppResult;
use crate::models::{AppSettings, AttachmentWriteResult, ImportResult, Note};
use crate::storage;

#[tauri::command]
pub fn desktop_list_notes(app: AppHandle) -> AppResult<Vec<Note>> {
    storage::read_notes(&app)
}

#[tauri::command]
pub fn desktop_create_note(app: AppHandle, note: Note) -> AppResult<Note> {
    let mut notes = storage::read_notes(&app)?;
    if notes.iter().any(|current| current.id == note.id) {
        return Err("A note with this id already exists".into());
    }

    notes.push(note.clone());
    notes.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    storage::write_notes(&app, &notes)?;
    Ok(note)
}

#[tauri::command]
pub fn desktop_update_note(app: AppHandle, note: Note) -> AppResult<Note> {
    let mut notes = storage::read_notes(&app)?;
    let Some(index) = notes.iter().position(|current| current.id == note.id) else {
        return Err("Note not found".into());
    };

    notes[index] = note.clone();
    notes.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    storage::write_notes(&app, &notes)?;
    Ok(note)
}

#[tauri::command]
pub fn desktop_delete_note(app: AppHandle, id: String) -> AppResult<()> {
    let mut notes = storage::read_notes(&app)?;
    let Some(index) = notes.iter().position(|current| current.id == id) else {
        return Ok(());
    };

    if let Some(path) = notes[index].source.attachment_path.clone() {
        let _ = storage::delete_attachment(&app, &path);
    }

    notes.remove(index);
    storage::write_notes(&app, &notes)
}

#[tauri::command]
pub fn desktop_save_all_notes(app: AppHandle, notes: Vec<Note>) -> AppResult<()> {
    storage::write_notes(&app, &notes)
}

#[tauri::command]
pub fn desktop_read_settings(app: AppHandle) -> AppResult<AppSettings> {
    storage::read_settings(&app)
}

#[tauri::command]
pub fn desktop_write_settings(app: AppHandle, settings: AppSettings) -> AppResult<AppSettings> {
    storage::write_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
pub fn desktop_import_legacy_json(app: AppHandle, json: String) -> AppResult<ImportResult> {
    storage::import_legacy_json(&app, &json)
}

#[tauri::command]
pub fn desktop_export_notes_json(app: AppHandle) -> AppResult<String> {
    storage::export_notes_json(&app)
}

#[tauri::command]
pub fn desktop_export_notes_markdown(app: AppHandle) -> AppResult<String> {
    storage::export_notes_markdown(&app)
}

#[tauri::command]
pub fn desktop_write_attachment_from_data_url(
    app: AppHandle,
    data_url: String,
    filename_hint: Option<String>,
) -> AppResult<AttachmentWriteResult> {
    storage::write_attachment_from_data_url(&app, &data_url, filename_hint.as_deref())
}

#[tauri::command]
pub fn desktop_delete_attachment(app: AppHandle, relative_path: String) -> AppResult<()> {
    storage::delete_attachment(&app, &relative_path)
}

#[tauri::command]
pub fn desktop_resolve_attachment_path(app: AppHandle, relative_path: String) -> AppResult<String> {
    storage::resolve_attachment_path(&app, &relative_path)
}
