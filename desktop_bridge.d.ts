interface MindSparkDesktopNoteSource {
    type: string;
    url?: string | null;
    attachmentPath?: string | null;
    meta?: unknown;
}

interface MindSparkDesktopNote {
    id: string;
    content: string;
    createdAt: string;
    updatedAt: string;
    parentNoteId?: string | null;
    status: string;
    viewCount: number;
    lastReviewedAt?: string | null;
    snoozeUntil?: string | null;
    source: MindSparkDesktopNoteSource;
    embedding?: number[] | null;
}

interface MindSparkDesktopSettings {
    schemaVersion: number;
    provider: string;
    apiBaseUrl: string;
    apiKey: string;
    apiModel: string;
    quickCaptureShortcut?: string | null;
    autostartEnabled?: boolean | null;
    dailyReminderEnabled?: boolean | null;
}

interface MindSparkDesktopAttachmentResult {
    attachmentPath: string;
    absolutePath: string;
}

interface MindSparkDesktopImportResult {
    imported: number;
    skipped: number;
    attachmentCount: number;
}

interface MindSparkDesktopApi {
    listNotes(): Promise<MindSparkDesktopNote[]>;
    createNote(note: MindSparkDesktopNote): Promise<MindSparkDesktopNote>;
    updateNote(note: MindSparkDesktopNote): Promise<MindSparkDesktopNote>;
    deleteNote(id: string): Promise<void>;
    saveAllNotes(notes: MindSparkDesktopNote[]): Promise<void>;
    readSettings(): Promise<MindSparkDesktopSettings>;
    writeSettings(settings: MindSparkDesktopSettings): Promise<MindSparkDesktopSettings>;
    importLegacyJson(json: string): Promise<MindSparkDesktopImportResult>;
    exportNotesJson(): Promise<string>;
    exportNotesMarkdown(): Promise<string>;
    writeAttachmentFromDataUrl(dataUrl: string, filenameHint?: string): Promise<MindSparkDesktopAttachmentResult>;
    deleteAttachment(relativePath: string): Promise<void>;
    resolveAttachmentPath(relativePath: string): Promise<string>;
    resolveAttachmentUrl(relativePath: string): Promise<string>;
}

declare global {
    interface Window {
        mindSparkDesktopApi: MindSparkDesktopApi;
    }
}

export {};
