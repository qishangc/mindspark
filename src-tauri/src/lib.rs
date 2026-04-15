mod commands;
mod error;
mod models;
mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::desktop_list_notes,
            commands::desktop_create_note,
            commands::desktop_update_note,
            commands::desktop_delete_note,
            commands::desktop_save_all_notes,
            commands::desktop_read_settings,
            commands::desktop_write_settings,
            commands::desktop_import_legacy_json,
            commands::desktop_export_notes_json,
            commands::desktop_export_notes_markdown,
            commands::desktop_write_attachment_from_data_url,
            commands::desktop_delete_attachment,
            commands::desktop_resolve_attachment_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running MindSpark desktop backend");
}
