use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSource {
    pub r#type: String,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub attachment_path: Option<String>,
    #[serde(default)]
    pub meta: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub parent_note_id: Option<String>,
    pub status: String,
    #[serde(default)]
    pub view_count: u32,
    #[serde(default)]
    pub last_reviewed_at: Option<String>,
    #[serde(default)]
    pub snooze_until: Option<String>,
    pub source: NoteSource,
    #[serde(default)]
    pub embedding: Option<Vec<f32>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub schema_version: u32,
    pub provider: String,
    pub api_base_url: String,
    pub api_key: String,
    pub api_model: String,
    #[serde(default)]
    pub quick_capture_shortcut: Option<String>,
    #[serde(default)]
    pub autostart_enabled: Option<bool>,
    #[serde(default)]
    pub daily_reminder_enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentWriteResult {
    pub attachment_path: String,
    pub absolute_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub imported: usize,
    pub skipped: usize,
    pub attachment_count: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LegacyNote {
    pub id: Option<String>,
    pub content: Option<String>,
    pub created_at: Option<String>,
    #[serde(default)]
    pub embedding: Option<Vec<f32>>,
    #[serde(default)]
    pub view_count: Option<u32>,
    #[serde(default)]
    pub source_type: Option<String>,
    #[serde(default)]
    pub source_url: Option<String>,
    #[serde(default)]
    pub source_meta: Option<serde_json::Value>,
    #[serde(default)]
    pub archived: Option<bool>,
}
