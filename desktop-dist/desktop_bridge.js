(function attachMindSparkDesktopApi() {
    const tauriCore =
        window.__TAURI__ &&
        window.__TAURI__.core
            ? window.__TAURI__.core
            : null;

    const tauriInvoke =
        tauriCore &&
        typeof tauriCore.invoke === 'function'
            ? tauriCore.invoke
            : null;

    const tauriConvertFileSrc =
        tauriCore &&
        typeof tauriCore.convertFileSrc === 'function'
            ? tauriCore.convertFileSrc
            : null;

    async function invoke(command, args) {
        if (!tauriInvoke) {
            throw new Error('Tauri desktop bridge is unavailable in this environment.');
        }

        return tauriInvoke(command, args);
    }

    window.mindSparkDesktopApi = {
        listNotes() {
            return invoke('desktop_list_notes');
        },
        createNote(note) {
            return invoke('desktop_create_note', { note });
        },
        updateNote(note) {
            return invoke('desktop_update_note', { note });
        },
        deleteNote(id) {
            return invoke('desktop_delete_note', { id });
        },
        saveAllNotes(notes) {
            return invoke('desktop_save_all_notes', { notes });
        },
        readSettings() {
            return invoke('desktop_read_settings');
        },
        writeSettings(settings) {
            return invoke('desktop_write_settings', { settings });
        },
        importLegacyJson(json) {
            return invoke('desktop_import_legacy_json', { json });
        },
        exportNotesJson() {
            return invoke('desktop_export_notes_json');
        },
        exportNotesMarkdown() {
            return invoke('desktop_export_notes_markdown');
        },
        writeAttachmentFromDataUrl(dataUrl, filenameHint) {
            return invoke('desktop_write_attachment_from_data_url', {
                dataUrl,
                filenameHint
            });
        },
        deleteAttachment(relativePath) {
            return invoke('desktop_delete_attachment', { relativePath });
        },
        resolveAttachmentPath(relativePath) {
            return invoke('desktop_resolve_attachment_path', { relativePath });
        },
        async resolveAttachmentUrl(relativePath) {
            const absolutePath = await invoke('desktop_resolve_attachment_path', { relativePath });
            if (!absolutePath) return absolutePath;
            return tauriConvertFileSrc ? tauriConvertFileSrc(absolutePath) : absolutePath;
        }
    };
})();
