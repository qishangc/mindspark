// ============================================
// MindSpark Lite — Full-featured JS
// ============================================

// --- State ---
let notes = [];
let settings = {};
let sortMode = 'time';
let currentDetailNoteId = null;
let isEditing = false;
let currentSourceType = 'none';
let currentSourceImage = null;
let currentSourceTextValue = '';
let continueThinkingParentId = null;
let displayCount = 20;
let showArchived = false;
const OLD_NOTE_MIN_AGE = 24 * 60 * 60 * 1000;
const THEME_STORAGE_KEY = 'theme';
const desktopApi = window.mindSparkDesktopApi;
const DEFAULT_NOTE_MODAL_TITLE = '新想法';
const CONTINUE_NOTE_MODAL_TITLE = '继续思考';
const DEFAULT_NOTE_PLACEHOLDER = '写点什么...';
const CONTINUE_NOTE_PLACEHOLDER = '把这个想法往前推一步...';
// 当前显示的笔记数量

// --- AI Provider Presets ---
const AI_PROVIDERS = {
    openai: {
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        model: 'text-embedding-3-small'
    },
    gemini: {
        name: 'Google Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        model: 'gemini-embedding-001'
    },
    deepseek: {
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-embedding'
    },
    siliconflow: {
        name: 'SiliconFlow',
        baseUrl: 'https://api.siliconflow.cn/v1',
        model: 'BAAI/bge-m3'
    },
    custom: {
        name: '自定义',
        baseUrl: '',
        model: ''
    }
};

// --- DOM Elements ---
const noteInput = document.getElementById('noteInput');
const list = document.getElementById('noteList');
const empty = document.getElementById('emptyState');
const search = document.getElementById('searchInput');

const unifiedSourceInput = document.getElementById('unifiedSourceInput');
const unifiedSourcePreview = document.getElementById('unifiedSourcePreview');
const unifiedInputWrapper = document.getElementById('unifiedInputWrapper');

// --- Init Theme ---
if (localStorage.getItem(THEME_STORAGE_KEY) === 'dark') {
    document.body.setAttribute('data-theme', 'dark');
    document.getElementById('themeBtn').textContent = '☀️';
} else {
    document.body.removeAttribute('data-theme');
    document.getElementById('themeBtn').textContent = '🌙';
}

// --- Init Settings ---
if (settings.apiBaseUrl) document.getElementById('apiBaseUrl').value = settings.apiBaseUrl;
if (settings.apiKey) document.getElementById('apiKey').value = settings.apiKey;
if (settings.apiModel) document.getElementById('apiModel').value = settings.apiModel;
if (settings.provider) document.getElementById('providerSelect').value = settings.provider;

// ============================================
// Theme
// ============================================
function toggleTheme() {
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    if (isDark) {
        document.body.removeAttribute('data-theme');
        localStorage.setItem(THEME_STORAGE_KEY, 'light');
        document.getElementById('themeBtn').textContent = '🌙';
    } else {
        document.body.setAttribute('data-theme', 'dark');
        localStorage.setItem(THEME_STORAGE_KEY, 'dark');
        document.getElementById('themeBtn').textContent = '☀️';
    }
}

// ============================================
// Toast Notification System
// ============================================
function showToast(message, type = 'info') {
    const logger = type === 'error' ? console.error : console.log;
    logger(`[MindSpark:${type}] ${message}`);
}

// ============================================
// Note Create Modal & Auto-Detect Source
// ============================================

function clearUnifiedSource() {
    currentSourceType = 'none';
    currentSourceImage = null;
    currentSourceTextValue = '';
    if (unifiedSourceInput) unifiedSourceInput.value = '';
    
    if (unifiedSourcePreview) {
        unifiedSourcePreview.style.display = 'none';
        unifiedSourcePreview.innerHTML = '';
    }
    if (unifiedInputWrapper) {
        unifiedInputWrapper.style.display = 'flex';
    }
}

function getNoteById(noteId) {
    return notes.find((note) => String(note.id) === String(noteId));
}

function isDeepNote(note) {
    return Boolean(note && (note.parent_note_id || note.status === 'deep'));
}

function getContinueThinkingParentNote() {
    return continueThinkingParentId ? getNoteById(continueThinkingParentId) : null;
}

function updateNoteModalContext() {
    const title = document.getElementById('noteModalTitle');
    const hint = document.getElementById('noteModalHint');
    const parentNote = getContinueThinkingParentNote();

    if (!title || !hint) return;

    if (!parentNote) {
        title.textContent = DEFAULT_NOTE_MODAL_TITLE;
        hint.style.display = 'none';
        hint.innerHTML = '';
        noteInput.placeholder = DEFAULT_NOTE_PLACEHOLDER;
        return;
    }

    title.textContent = CONTINUE_NOTE_MODAL_TITLE;
    hint.style.display = 'block';
    hint.innerHTML = `延伸自：${escapeHtml(parentNote.content.length > 90 ? parentNote.content.slice(0, 90) + '...' : parentNote.content)}`;
    noteInput.placeholder = CONTINUE_NOTE_PLACEHOLDER;
}

function renderUnifiedPreview(html) {
    if (unifiedInputWrapper) unifiedInputWrapper.style.display = 'none';
    if (unifiedSourcePreview) {
        unifiedSourcePreview.style.display = 'flex';
        unifiedSourcePreview.innerHTML = `
            <div class="preview-chip">
                ${html}
                <span class="preview-chip-close" onclick="clearUnifiedSource()" title="移除来源">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </span>
            </div>
        `;
    }
}

function processUnifiedString(val) {
    if (!val) return;
    currentSourceTextValue = val;
    if (/^https?:\/\//i.test(val)) {
        currentSourceType = 'url';
        renderUnifiedPreview(`<span>🔗 ${escapeHtml(val.length > 35 ? val.substring(0, 35) + '...' : val)}</span>`);
    } else {
        currentSourceType = 'text';
        renderUnifiedPreview(`<span>📝 ${escapeHtml(val.length > 20 ? val.substring(0, 20) + '...' : val)}</span>`);
    }
}

if (unifiedSourceInput) {
    unifiedSourceInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = unifiedSourceInput.value.trim();
            if (val) processUnifiedString(val);
        }
    });

    unifiedSourceInput.addEventListener('blur', (e) => {
        const val = unifiedSourceInput.value.trim();
        if (val) processUnifiedString(val);
    });

    unifiedSourceInput.addEventListener('paste', async (e) => {
        const items = e.clipboardData?.items || [];
        for (const item of items) {
            if (item.type && item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    await setSourceImageFile(file);
                }
                return;
            }
        }
        setTimeout(() => {
            const val = unifiedSourceInput.value.trim();
            if (val) processUnifiedString(val);
        }, 10);
    });
}

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('读取失败'));
        reader.readAsDataURL(file);
    });
}

async function setSourceImageFile(file) {
    if (!file || !file.type.startsWith('image/')) {
        showToast('请选择图片文件', 'error');
        return;
    }
    const dataUrl = await fileToDataUrl(file);
    currentSourceImage = {
        dataUrl,
        meta: {
            name: file.name || 'clipboard-image.png',
            size: file.size || 0,
            mime: file.type || 'image/png'
        }
    };
    currentSourceType = 'image';
    renderUnifiedPreview(`<img src="${dataUrl}" alt="preview"><span>截图</span>`);
}

async function handleUnifiedImageSelect(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
        await setSourceImageFile(file);
    } catch (err) {
        showToast(err.message || '处理图片失败', 'error');
    }
    event.target.value = ''; // reset so same file can be selected again
}

async function collectSourceData() {
    // Flush pending text inputs if the user typed but didn't blur/enter
    if (unifiedSourceInput && unifiedSourceInput.value.trim() && currentSourceType === 'none') {
        processUnifiedString(unifiedSourceInput.value.trim());
    }

    if (currentSourceType === 'url') {
        let url = currentSourceTextValue;
        if (!url) return { source_type: 'none', source_url: '', source_meta: null };
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        return { source_type: 'url', source_url: url, source_meta: null };
    }

    if (currentSourceType === 'image' && currentSourceImage?.dataUrl) {
        return {
            source_type: 'image',
            source_url: currentSourceImage.dataUrl,
            source_meta: currentSourceImage.meta || null
        };
    }

    if (currentSourceType === 'text') {
        if (!currentSourceTextValue) return { source_type: 'none', source_url: '', source_meta: null };
        return { source_type: 'text', source_url: '', source_meta: { title: currentSourceTextValue } };
    }

    return { source_type: 'none', source_url: '', source_meta: null };
}

function openNoteModal(options = {}) {
    const modal = document.getElementById('noteModal');
    continueThinkingParentId = options.parentNoteId ? String(options.parentNoteId) : null;
    updateNoteModalContext();
    modal.classList.add('open');
    noteInput.value = '';
    noteInput.style.height = 'auto';
    clearUnifiedSource();
    document.getElementById('charCount').textContent = '0 字';
    setTimeout(() => noteInput.focus(), 50);
}

function closeNoteModal() {
    document.getElementById('noteModal').classList.remove('open');
    continueThinkingParentId = null;
    updateNoteModalContext();
}

noteInput.addEventListener('input', (e) => {
    document.getElementById('charCount').textContent = `${e.target.value.length} 字`;
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
});

noteInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        saveNote();
    }
});

noteInput.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items || [];
    for (const item of items) {
        if (item.type && item.type.startsWith('image/')) {
            e.preventDefault();
            const file = item.getAsFile();
            if (!file) return;
            try {
                await setSourceImageFile(file);
                showToast('已粘贴图片来源', 'success');
            } catch (err) {
                showToast(err.message || '粘贴图片失败', 'error');
            }
            return;
        }
    }
});

async function saveNote() {
    const content = noteInput.value.trim();
    if (!content) return;
    const parentNote = getContinueThinkingParentNote();

    const saveBtn = document.getElementById('saveBtn');
    saveBtn.textContent = '保存中...';
    saveBtn.disabled = true;

    try {
        let embedding = null;
        if (settings.apiKey && settings.apiBaseUrl) {
            try {
                embedding = await getEmbedding(content);
            } catch (e) {
                console.error('Embedding failed:', e);
            }
        }

        const sourceData = await collectSourceData();
        const note = {
            id: Date.now().toString(),
            content,
            created_at: new Date().toISOString(),
            embedding,
            view_count: 0,
            status: parentNote ? 'deep' : 'active',
            parent_note_id: parentNote ? parentNote.id : null,
            source_type: sourceData.source_type,
            source_url: sourceData.source_url,
            source_meta: sourceData.source_meta
        };

        await persistCreatedNote(note);

        closeNoteModal();
        displayCount = 20;
        renderNotes();
        showToast(parentNote ? '继续思考已保存' : '想法已保存 ✨', 'success');
    } catch (error) {
        console.error('Save note failed:', error);
        showToast('保存失败，请稍后重试', 'error');
    } finally {
        saveBtn.textContent = '保存 (Ctrl+Enter)';
        saveBtn.disabled = false;
    }
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// ============================================
// Note Detail Modal
// ============================================
function renderDetailSource(note) {
    const container = document.getElementById('detailSource');
    if (!container) return;

    const sourceType = note.source_type || 'none';
    const sourceUrl = note.source_url || '';
    const sourceMeta = note.source_meta || {};

    if (sourceType === 'url' && sourceUrl) {
        container.style.display = 'block';
        container.innerHTML = `
            <div class="detail-source-title">触发源</div>
            <a class="detail-source-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(sourceUrl)}</a>
        `;
        return;
    }

    if (sourceType === 'image' && sourceUrl) {
        const filename = sourceMeta.name ? escapeHtml(sourceMeta.name) : '图片来源';
        container.style.display = 'block';
        container.innerHTML = `
            <div class="detail-source-title">触发源</div>
            <img class="detail-source-image" src="${sourceUrl}" alt="${filename}">
            <div style="margin-top:8px; color:var(--text-secondary); font-size:12px;">${filename}</div>
        `;
        return;
    }

    if (sourceType === 'text' && sourceMeta.title) {
        container.style.display = 'block';
        container.innerHTML = `
            <div class="detail-source-title">触发源</div>
            <div class="detail-source-text">${escapeHtml(sourceMeta.title)}</div>
        `;
        return;
    }

    container.style.display = 'none';
    container.innerHTML = '';
}

function openDetailModal(noteId) {
    const note = getNoteById(noteId);
    if (!note) return;

    currentDetailNoteId = noteId;
    isEditing = false;

    // Update view count
    note.view_count = (note.view_count || 0) + 1;
    persistUpdatedNote(note).catch((error) => {
        console.error('View count update failed:', error);
    });

    // Populate content
    document.getElementById('detailTime').textContent = formatDate(note.created_at);
    document.getElementById('detailViewContent').textContent = note.content;
    document.getElementById('detailViewContent').style.display = 'block';
    document.getElementById('detailEditContent').style.display = 'none';
    renderDetailSource(note);

    // Update archive button icon
    const archiveBtn = document.getElementById('archiveBtn');
    if (archiveBtn) {
        archiveBtn.title = note.archived ? '取消归档' : '归档';
    }

    // Reset actions
    document.getElementById('detailNormalActions').style.display = 'flex';
    document.getElementById('detailEditActions').style.display = 'none';
    document.getElementById('deleteBtn').style.display = '';

    // Render related notes
    renderRelatedNotes(note);

    // Show modal
    document.getElementById('detailModal').classList.add('open');
}

function closeDetailModal() {
    document.getElementById('detailModal').classList.remove('open');
    currentDetailNoteId = null;
    isEditing = false;
}

function startEditNote() {
    const note = getNoteById(currentDetailNoteId);
    if (!note) return;

    isEditing = true;
    const textarea = document.getElementById('detailEditContent');
    textarea.value = note.content;
    textarea.style.display = 'block';
    document.getElementById('detailViewContent').style.display = 'none';
    document.getElementById('detailNormalActions').style.display = 'none';
    document.getElementById('detailEditActions').style.display = 'flex';

    setTimeout(() => {
        textarea.focus();
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    }, 50);
}

function cancelEditNote() {
    isEditing = false;
    document.getElementById('detailEditContent').style.display = 'none';
    document.getElementById('detailViewContent').style.display = 'block';
    document.getElementById('detailNormalActions').style.display = 'flex';
    document.getElementById('detailEditActions').style.display = 'none';
}

function startContinueThinking() {
    const note = getNoteById(currentDetailNoteId);
    if (!note) return;

    closeDetailModal();
    openNoteModal({ parentNoteId: note.id });
}

async function saveEditNote() {
    const note = getNoteById(currentDetailNoteId);
    if (!note) return;

    const newContent = document.getElementById('detailEditContent').value.trim();
    if (!newContent) return;

    const btn = document.getElementById('editSaveBtn');
    btn.textContent = '保存中...';
    btn.disabled = true;

    try {
        const nextNote = {
            ...note,
            content: newContent
        };

        // Re-generate embedding if API is configured
        if (settings.apiKey && settings.apiBaseUrl) {
            try {
                nextNote.embedding = await getEmbedding(newContent);
            } catch (e) {
                console.error('Re-embedding failed:', e);
            }
        }

        const updatedNote = await persistUpdatedNote(nextNote);
        document.getElementById('detailViewContent').textContent = updatedNote.content;
        cancelEditNote();
        renderNotes();
        showToast('修改已保存', 'success');

        // Re-render related notes with new embedding
        renderRelatedNotes(updatedNote);
    } catch (error) {
        console.error('Save edit failed:', error);
        showToast('修改保存失败，请稍后重试', 'error');
    } finally {
        btn.textContent = '完成';
        btn.disabled = false;
    }
}

async function deleteNoteById(targetId) {
    const normalizedTargetId = String(targetId);
    const removedNote = notes.find(n => String(n.id) === normalizedTargetId);
    if (!removedNote) return false;

    try {
        await desktopApi.deleteNote(normalizedTargetId);
    } catch (error) {
        console.error('Delete failed:', error);
        showToast('删除失败，数据未能保存', 'error');
        return false;
    }

    notes = notes.filter(n => String(n.id) !== normalizedTargetId);

    if (String(currentDetailNoteId) === normalizedTargetId) {
        closeDetailModal();
    }
    renderNotes();
    showToast('想法已删除', 'info');
    return true;
}

async function requestDeleteCurrentNote() {
    const note = getNoteById(currentDetailNoteId);
    if (!note) return;
    await deleteNoteById(note.id);
}

async function toggleArchiveNote() {
    const note = getNoteById(currentDetailNoteId);
    if (!note) return;

    try {
        const updatedNote = await persistUpdatedNote({
            ...note,
            archived: !note.archived
        });
        closeDetailModal();
        renderNotes();
        showToast(updatedNote.archived ? '已归档 📦' : '已取消归档', 'info');
    } catch (error) {
        console.error('Archive toggle failed:', error);
        showToast('归档状态更新失败', 'error');
    }
}

function toggleArchiveView() {
    showArchived = !showArchived;
    displayCount = 20;

    const subtitle = document.querySelector('.subtitle');
    const toggleBtn = document.getElementById('archiveToggleBtn');
    const inputTrigger = document.getElementById('note-input-area');
    const drawOldNoteBtn = document.getElementById('drawOldNoteBtn');

    if (showArchived) {
        subtitle.textContent = '归档的想法';
        toggleBtn.style.background = 'var(--accent-color)';
        toggleBtn.style.color = 'var(--accent-text)';
        toggleBtn.style.borderRadius = '10px';
        inputTrigger.style.display = 'none';
        if (drawOldNoteBtn) drawOldNoteBtn.style.display = 'none';
    } else {
        subtitle.textContent = '和自己的想法重逢';
        toggleBtn.style.background = '';
        toggleBtn.style.color = '';
        toggleBtn.style.borderRadius = '';
        inputTrigger.style.display = '';
        if (drawOldNoteBtn) drawOldNoteBtn.style.display = '';
    }

    renderNotes();
}

function renderRelatedNotes(note) {
    const container = document.getElementById('detailRelatedList');
    const section = document.getElementById('detailRelated');
    const continuationNotes = getContinuationNotes(note);
    const continuationIds = new Set(continuationNotes.map((item) => String(item.id)));
    const related = getRelatedNotes(note).filter((item) => !continuationIds.has(String(item.id)));

    if (continuationNotes.length === 0 && related.length === 0) {
        section.style.display = 'block';
        container.innerHTML = '<div style="color:var(--text-secondary); padding:12px; text-align:center;">✨ 这是一个全新的想法，没有找到相似笔记。</div>';
        return;
    }

    section.style.display = 'block';
    const sections = [];

    if (continuationNotes.length > 0) {
        sections.push('<div style="margin:8px 0 10px; color:var(--text-secondary); font-size:12px; font-weight:600;">继续思考链路</div>');
        sections.push(continuationNotes.map((item) => `
            <div class="related-note" onclick="navigateToRelatedNote('${item.id}')">
                <div style="word-break:break-word;">${escapeHtml(item.content.length > 90 ? item.content.slice(0, 90) + '...' : item.content)}</div>
                <div class="related-similarity">${item.relation_label}</div>
            </div>
        `).join(''));
    }

    if (related.length > 0) {
        sections.push('<div style="margin:12px 0 10px; color:var(--text-secondary); font-size:12px; font-weight:600;">语义相关</div>');
        sections.push(related.map((item) => `
            <div class="related-note" onclick="navigateToRelatedNote('${item.id}')">
                <div style="word-break:break-word;">${escapeHtml(item.content.length > 90 ? item.content.slice(0, 90) + '...' : item.content)}</div>
                <div class="related-similarity">相似度 ${(item.similarity * 100).toFixed(0)}%</div>
            </div>
        `).join(''));
    }

    container.innerHTML = sections.join('');
}

function navigateToRelatedNote(noteId) {
    closeDetailModal();
    setTimeout(() => openDetailModal(noteId), 300);
}

// ============================================
// Note Card Delete (in list)
// ============================================
async function deleteNote(id, e) {
    if (e && typeof e.stopPropagation === 'function') {
        e.stopPropagation();
    }
    const note = notes.find(n => String(n.id) === String(id));
    if (!note) return;
    await deleteNoteById(note.id);
}

// ============================================
// Sort
// ============================================
function setSort(mode) {
    sortMode = mode;
    const sortTimeBtn = document.getElementById('sortTimeBtn');
    const sortRandomBtn = document.getElementById('sortRandomBtn');
    sortTimeBtn.style.color = mode === 'time' ? 'var(--accent-color)' : 'var(--text-secondary)';
    sortRandomBtn.style.color = mode === 'random' ? 'var(--accent-color)' : 'var(--text-secondary)';
    sortTimeBtn.classList.toggle('active', mode === 'time');
    sortRandomBtn.classList.toggle('active', mode === 'random');
    displayCount = 20;
    renderNotes();
}

// ============================================
// Settings
// ============================================
function openSettings() {
    try {
        // 重新填充 API 设置（从内存 settings 读取，因为保存时已更新）
        if (settings.apiBaseUrl) document.getElementById('apiBaseUrl').value = settings.apiBaseUrl;
        if (settings.apiKey) document.getElementById('apiKey').value = settings.apiKey;
        if (settings.apiModel) document.getElementById('apiModel').value = settings.apiModel;
        if (settings.provider) document.getElementById('providerSelect').value = settings.provider;

        // 安全调用 onProviderChange
        if (typeof onProviderChange === 'function') {
            onProviderChange();
        }

        document.getElementById('settingsModal').classList.add('open');
    } catch (error) {
        console.error('打开设置出错:', error);
        showToast('打开设置失败，请查看控制台', 'error');
    }
}
function closeSettings() {
    document.getElementById('settingsModal').classList.remove('open');
}

function onProviderChange() {
    const provider = document.getElementById('providerSelect').value;
    const preset = AI_PROVIDERS[provider];
    if (preset && provider !== 'custom') {
        document.getElementById('apiBaseUrl').value = preset.baseUrl;
        document.getElementById('apiModel').value = preset.model;
    }
}

async function testApiConnection() {
    const provider = document.getElementById('providerSelect').value;
    let apiBaseUrl = document.getElementById('apiBaseUrl').value.trim().replace(/\/$/, '');
    const apiKey = document.getElementById('apiKey').value.trim();
    const apiModel = document.getElementById('apiModel').value.trim();

    if (!apiKey) {
        showToast('请先填写 API Key', 'error');
        return;
    }
    if (!apiBaseUrl) {
        // 如果没填，尝试从预设中获取
        const preset = AI_PROVIDERS[provider];
        if (preset && provider !== 'custom') {
            apiBaseUrl = preset.baseUrl;
        } else {
            showToast('请填写 API Base URL', 'error');
            return;
        }
    }

    const testText = '这是一条测试消息';
    const url = `${apiBaseUrl}/embeddings`;

    showToast('测试中...', 'info');
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: apiModel || 'text-embedding-3-small',
                input: testText
            })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || `HTTP ${res.status}`);
        }

        const data = await res.json();
        const dim = data.data[0].embedding.length;
        showToast(`连接成功！向量维度: ${dim}`, 'success');
    } catch (err) {
        showToast(`连接失败: ${err.message}`, 'error');
    }
}

function saveSettings() {
    const provider = document.getElementById('providerSelect').value;
    const apiBaseUrl = document.getElementById('apiBaseUrl').value.trim().replace(/\/$/, '');
    const apiKey = document.getElementById('apiKey').value.trim();
    const apiModel = document.getElementById('apiModel').value.trim();

    settings = { provider, apiBaseUrl, apiKey, apiModel };
    persistSettings();

    closeSettings();
    showToast('配置已保存', 'success');
}

// ============================================
// Global Shortcuts
// ============================================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeNoteModal();
        closeSettings();
        closeDetailModal();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        openNoteModal();
    }
});

// ============================================
// Date Formatting
// ============================================
function formatDate(iso) {
    const date = new Date(iso);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;

    return date.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ============================================
// AI Embedding
// ============================================
async function getEmbedding(text) {
    if (!settings.apiKey) return null;
    const url = `${settings.apiBaseUrl || 'https://api.openai.com/v1'}/embeddings`;

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify({
            model: settings.apiModel || 'text-embedding-3-small',
            input: text.replace(/\n/g, ' ')
        })
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || 'API Error');
    }

    const data = await res.json();
    return data.data[0].embedding;
}

function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dot += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function getRelatedNotes(targetNote) {
    if (!targetNote.embedding) return [];

    // 计算所有候选笔记的相似度
    let candidates = notes
        .filter(n => n.id !== targetNote.id && n.embedding && !n.archived)
        .map(n => ({
            ...n,
            similarity: cosineSimilarity(targetNote.embedding, n.embedding)
        }))
        .filter(c => c.similarity > 0.3);
    // 先过滤掉极低相似度的

    if (candidates.length === 0) return [];

    // 按相似度排序
    candidates.sort((a, b) => b.similarity - a.similarity);

    const top = candidates[0];
    const second = candidates[1]?.similarity || 0;
    const avgFirstThree = candidates.slice(0, 3).reduce((s, c) => s + c.similarity, 0) / Math.min(3, candidates.length);

    // 动态阈值判断
    if (candidates.length === 1 && top.similarity > 0.6) {
        return [top];
        // 只有一条且足够好
    } else if (top.similarity - second > 0.15) {
        return [top];
        // 第一条显著突出
    } else if (avgFirstThree > 0.65) {
        return candidates.slice(0, 3);
        // 前几条整体不错
    }
    return [];
}

// ============================================
// Batch Process Embeddings
// ============================================
async function processAllNotes() {
    const btn = document.getElementById('processBtn');
    const status = document.getElementById('processStatus');
    if (!settings.apiKey) {
        showToast('请先配置 API Key', 'error');
        return;
    }

    btn.disabled = true;
    let count = 0;
    let success = 0;

    const targets = notes.filter(n => !n.embedding);
    status.textContent = `准备处理 ${targets.length} 条笔记...`;

    for (const note of targets) {
        count++;
        status.textContent = `处理中 ${count}/${targets.length}...`;
        try {
            const vec = await getEmbedding(note.content);
            if (vec) {
                note.embedding = vec;
                success++;
            }
            await new Promise(r => setTimeout(r, 200));
        } catch (e) {
            console.error(e);
            status.textContent = `处理中 ${count}/${targets.length}... (出错，继续)`;
        }
    }

    try {
        await persistNotesNow();
    } catch (error) {
        console.error('Batch embedding persist failed:', error);
        showToast('向量已生成，但保存失败', 'error');
    }

    status.textContent = `完成！成功处理 ${success} 条。`;
    btn.disabled = false;
    renderNotes();
    showToast(`成功处理 ${success} 条笔记的向量`, 'success');
}

// ============================================
// Import / Export
// ============================================
function downloadBlob(content, type, filename) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function exportData() {
    desktopApi.exportNotesJson()
        .then((data) => {
            downloadBlob(
                data,
                'application/json',
                `mindspark-notes-${new Date().toISOString().slice(0, 10)}.json`
            );
            showToast('数据已导出', 'success');
        })
        .catch((error) => {
            console.error('Desktop JSON export failed:', error);
            showToast('桌面 JSON 导出失败', 'error');
        });
}

function exportMarkdown() {
    desktopApi.exportNotesMarkdown()
        .then((markdown) => {
            if (!markdown) {
                showToast('没有笔记可导出', 'info');
                return;
            }
            downloadBlob(
                markdown,
                'text/markdown',
                `mindspark-export-${new Date().toISOString().slice(0, 10)}.md`
            );
            showToast('Markdown 导出成功', 'success');
        })
        .catch((error) => {
            console.error('Desktop markdown export failed:', error);
            showToast('桌面 Markdown 导出失败', 'error');
        });
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const rawText = e.target.result;
            const data = JSON.parse(rawText);
            if (!Array.isArray(data)) throw new Error('Invalid format');

            await desktopApi.importLegacyJson(rawText);
            notes = await loadInitialNotes();
            renderNotes();
            showToast(`成功导入 ${data.length} 条桌面数据`, 'success');
        } catch (err) {
            console.error('Import failed:', err);
            showToast('导入失败，请确认文件格式和桌面数据目录可用', 'error');
        }
        event.target.value = '';
    };
    reader.readAsText(file);
}

function importMdFiles(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    let count = 0;
    let processed = 0;
    const total = files.length;

    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            processed++;
            const content = e.target.result.trim();
            if (content) {
                const note = {
                    id: (Date.now() + count).toString(),
                    content,
                    created_at: new Date().toISOString(),
                    embedding: null,
                    view_count: 0,
                    source_type: 'none',
                    source_url: '',
                    source_meta: null
                };
                notes.unshift(note);
                count++;
            }
            if (processed === total) {
                saveNotes();
                renderNotes();
                showToast(`成功导入 ${count} 个 MD 文件`, 'success');
            }
        };
        reader.readAsText(file);
    });

    event.target.value = '';
}

function getSourceBadge(note) {
    if (note.source_type === 'url' && note.source_url) return '🔗 链接';
    if (note.source_type === 'image' && note.source_url) return '🖼️ 图片';
    if (note.source_type === 'text' && note.source_meta?.title) return '📝 ' + (note.source_meta.title.length > 10 ? note.source_meta.title.slice(0, 10) + '...' : note.source_meta.title);
    return '';
}

function getStatusBadge(note) {
    if (isDeepNote(note) && !note.archived) return '继续思考';
    return '';
}

function isOldNote(note) {
    const createdAt = new Date(note.created_at).getTime();
    if (Number.isNaN(createdAt)) return false;
    return Date.now() - createdAt >= OLD_NOTE_MIN_AGE;
}

function getOldNoteCandidates() {
    return notes.filter(note => !note.archived && isOldNote(note));
}

function drawRandomOldNote() {
    if (showArchived) {
        showToast('请先回到想法列表，再抽旧想法', 'info');
        return;
    }

    const candidates = getOldNoteCandidates();
    if (candidates.length === 0) {
        showToast('还没有可抽取的旧想法，等这些想法沉淀一天再来', 'info');
        return;
    }

    const note = candidates[Math.floor(Math.random() * candidates.length)];
    openDetailModal(note.id);
    showToast('抽到一条旧想法', 'success');
}


// ============================================
// Render Notes
// ============================================
function renderNotes() {
    const query = search.value.toLowerCase();
    let displayNotes = notes.filter(n => {
        const matchArchive = showArchived ? !!n.archived : !n.archived;
        const matchQuery = n.content.toLowerCase().includes(query);
        return matchArchive && matchQuery;
    });

    if (sortMode === 'random' && !query) {
        displayNotes = [...displayNotes].sort(() => Math.random() - 0.5);
    } else {
        displayNotes.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    // 分页切片
    const notesToShow = displayNotes.slice(0, displayCount);

    list.innerHTML = '';
    if (displayNotes.length === 0) {
        empty.style.display = 'block';
        document.getElementById('noteStats').textContent = '';
        // 隐藏加载更多按钮（如果存在）
        hideLoadMoreButton();
        return;
    }
    empty.style.display = 'none';

    notesToShow.forEach((note, index) => {
        const div = document.createElement('div');
        div.className = 'note-card';
        div.style.animationDelay = `${index * 0.05}s`;

        div.innerHTML = `
            <div class="note-content">${escapeHtml(note.content)}</div>
            <div class="note-meta">
                <div class="note-meta-left">
                    <span>${formatDate(note.created_at)}</span>
                    ${getStatusBadge(note) ? `<span class="source-badge">${getStatusBadge(note)}</span>` : ''}
                    ${getSourceBadge(note) ? `<span class="source-badge">${getSourceBadge(note)}</span>` : ''}
                </div>
                <button class="delete-btn" type="button">删除</button>
            </div>
        `;

        const deleteBtn = div.querySelector('.delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => deleteNote(note.id, e));
        }

        div.onclick = (e) => {
            if (e.target.closest('.delete-btn')) return;
            openDetailModal(note.id);
        };

        list.appendChild(div);
    });

    // 统计信息
    const stats = document.getElementById('noteStats');
    const activeNotes = notes.filter(n => !n.archived);
    const archivedNotes = notes.filter(n => n.archived);
    const totalNotes = activeNotes.length;
    const embeddedCount = activeNotes.filter(n => n.embedding).length;
    let statsText = `共 ${totalNotes} 条想法`;
    if (embeddedCount > 0) statsText += ` · ${embeddedCount} 条已嵌入向量`;
    if (archivedNotes.length > 0) statsText += ` · ${archivedNotes.length} 条已归档`;
    stats.textContent = statsText;

    // 控制加载更多按钮
    updateLoadMoreButton(displayNotes.length);
}

function updateLoadMoreButton(totalFilteredCount) {
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (!loadMoreBtn) return;
    if (displayCount < totalFilteredCount) {
        loadMoreBtn.style.display = 'inline-block';
    } else {
        loadMoreBtn.style.display = 'none';
    }
}

function hideLoadMoreButton() {
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
}

function loadMoreNotes() {
    displayCount += 20;
    renderNotes();
}

// ============================================
// Utilities
// ============================================
function normalizeNote(note) {
    const normalized = { ...note };
    normalized.id = String(normalized.id);
    normalized.parent_note_id = normalized.parent_note_id ? String(normalized.parent_note_id) : null;
    const sourceUrl = typeof normalized.source_url === 'string' ? normalized.source_url : '';
    let sourceType = normalized.source_type;

    if (sourceType !== 'url' && sourceType !== 'image' && sourceType !== 'text') {
        sourceType = sourceUrl.startsWith('data:image/') ? 'image' : (sourceUrl ? 'url' : 'none');
    }

    normalized.source_type = sourceType;
    normalized.source_url = sourceUrl;
    normalized.source_meta = normalized.source_meta && typeof normalized.source_meta === 'object'
        ? normalized.source_meta
        : null;
    if (typeof normalized.archived !== 'boolean') normalized.archived = normalized.status === 'archived';
    normalized.status = normalized.archived
        ? 'archived'
        : (normalized.parent_note_id || normalized.status === 'deep' ? 'deep' : 'active');
    return normalized;
}

function normalizeNotes(rawNotes) {
    if (!Array.isArray(rawNotes)) return [];
    return rawNotes
        .filter(n => n && n.content && n.created_at)
        .map(normalizeNote);
}

function applySettingsToForm() {
    if (settings.apiBaseUrl) document.getElementById('apiBaseUrl').value = settings.apiBaseUrl;
    if (settings.apiKey) document.getElementById('apiKey').value = settings.apiKey;
    if (settings.apiModel) document.getElementById('apiModel').value = settings.apiModel;
    if (settings.provider) document.getElementById('providerSelect').value = settings.provider;
}

function upsertNoteInState(note) {
    const normalized = normalizeNote(note);
    const index = notes.findIndex(current => String(current.id) === String(normalized.id));
    if (index === -1) {
        notes.unshift(normalized);
    } else {
        notes[index] = normalized;
    }
    return normalized;
}

async function deserializeDesktopNotes(desktopNotes) {
    if (!Array.isArray(desktopNotes)) return [];

    const mapped = await Promise.all(desktopNotes.map(async (note) => {
        const source = note.source || {};
        let sourceUrl = '';
        let sourceMeta = source.meta || null;

        if (source.type === 'url') {
            sourceUrl = source.url || '';
        } else if (source.type === 'image') {
            if (source.attachmentPath && typeof desktopApi.resolveAttachmentUrl === 'function') {
                try {
                    sourceUrl = await desktopApi.resolveAttachmentUrl(source.attachmentPath);
                } catch (error) {
                    console.error('Failed to resolve attachment URL:', error);
                    sourceUrl = '';
                }
            }
        }

        return {
            id: note.id,
            content: note.content,
            created_at: note.createdAt,
            updated_at: note.updatedAt || note.createdAt,
            embedding: note.embedding || null,
            view_count: note.viewCount || 0,
            source_type: source.type || 'none',
            source_url: sourceUrl,
            source_meta: sourceMeta,
            source_path: source.attachmentPath || '',
            archived: note.status === 'archived',
            status: note.status || (note.status === 'archived' ? 'archived' : 'active'),
            last_reviewed_at: note.lastReviewedAt || null,
            snooze_until: note.snoozeUntil || null,
            parent_note_id: note.parentNoteId || null
        };
    }));

    return normalizeNotes(mapped);
}

function getContinuationNotes(targetNote) {
    const targetId = String(targetNote.id);
    const linked = [];
    const seen = new Set();
    const parentId = targetNote.parent_note_id ? String(targetNote.parent_note_id) : null;

    if (parentId) {
        const parent = getNoteById(parentId);
        if (parent && !parent.archived) {
            linked.push({
                ...parent,
                relation_label: '延伸自'
            });
            seen.add(String(parent.id));
        }
    }

    notes
        .filter((note) => !note.archived && String(note.id) !== targetId && String(note.parent_note_id || '') === targetId)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .forEach((note) => {
            if (seen.has(String(note.id))) return;
            linked.push({
                ...note,
                relation_label: '继续思考'
            });
            seen.add(String(note.id));
        });

    return linked;
}

async function deserializeDesktopNote(desktopNote) {
    if (!desktopNote) return null;
    const [note] = await deserializeDesktopNotes([desktopNote]);
    return note || null;
}

async function serializeNoteForDesktop(note) {
    const normalized = normalizeNote(note);
    const desktopNote = {
        id: normalized.id,
        content: normalized.content,
        createdAt: normalized.created_at,
        updatedAt: normalized.updated_at || normalized.created_at,
        parentNoteId: normalized.parent_note_id || null,
        status: normalized.archived ? 'archived' : (normalized.parent_note_id || normalized.status === 'deep' ? 'deep' : 'active'),
        viewCount: normalized.view_count || 0,
        lastReviewedAt: normalized.last_reviewed_at || null,
        snoozeUntil: normalized.snooze_until || null,
        source: {
            type: normalized.source_type || 'none',
            url: '',
            attachmentPath: '',
            meta: normalized.source_meta || null
        },
        embedding: normalized.embedding || null
    };

    if (desktopNote.source.type === 'url') {
        desktopNote.source.url = normalized.source_url || '';
    } else if (desktopNote.source.type === 'image') {
        if (normalized.source_path) {
            desktopNote.source.attachmentPath = normalized.source_path;
        } else if (
            normalized.source_url &&
            normalized.source_url.startsWith('data:image/') &&
            typeof desktopApi.writeAttachmentFromDataUrl === 'function'
        ) {
            const result = await desktopApi.writeAttachmentFromDataUrl(
                normalized.source_url,
                normalized.source_meta?.name || 'attachment'
            );
            desktopNote.source.attachmentPath = result.attachmentPath;
            note.source_path = result.attachmentPath;
            if (typeof desktopApi.resolveAttachmentUrl === 'function') {
                note.source_url = await desktopApi.resolveAttachmentUrl(result.attachmentPath);
            }
        }
    }

    return desktopNote;
}

async function persistCreatedNote(note) {
    const normalized = normalizeNote(note);
    const createdDesktopNote = await desktopApi.createNote(await serializeNoteForDesktop(normalized));
    const createdNote = await deserializeDesktopNote(createdDesktopNote);
    const finalNote = createdNote || normalized;
    notes.unshift(finalNote);
    return finalNote;
}

async function persistUpdatedNote(note) {
    const normalized = normalizeNote(note);
    const updatedDesktopNote = await desktopApi.updateNote(await serializeNoteForDesktop(normalized));
    const updatedNote = await deserializeDesktopNote(updatedDesktopNote);
    return upsertNoteInState(updatedNote || normalized);
}

async function serializeNotesForDesktop(rawNotes) {
    return Promise.all(rawNotes.map((note) => serializeNoteForDesktop(note)));
}

async function loadInitialNotes() {
    const desktopNotes = await desktopApi.listNotes();
    return deserializeDesktopNotes(desktopNotes);
}

async function loadInitialSettings() {
    const desktopSettings = await desktopApi.readSettings();
    return {
        provider: desktopSettings.provider || 'custom',
        apiBaseUrl: desktopSettings.apiBaseUrl || '',
        apiKey: desktopSettings.apiKey || '',
        apiModel: desktopSettings.apiModel || ''
    };
}

async function persistSettings() {
    const payload = {
        schemaVersion: 1,
        provider: settings.provider || 'custom',
        apiBaseUrl: settings.apiBaseUrl || '',
        apiKey: settings.apiKey || '',
        apiModel: settings.apiModel || '',
        quickCaptureShortcut: null,
        autostartEnabled: false,
        dailyReminderEnabled: false
    };

    try {
        await desktopApi.writeSettings(payload);
    } catch (error) {
        console.error('Failed to persist desktop settings:', error);
        showToast('桌面设置保存失败', 'error');
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function saveNotes() {
    persistNotesNow().catch((error) => {
        console.error('Failed to persist desktop notes:', error);
        showToast('桌面数据保存失败', 'error');
    });
}

async function persistNotesNow() {
    const serialized = await serializeNotesForDesktop(notes);
    await desktopApi.saveAllNotes(serialized);
}

async function initApp() {
    try {
        if (!desktopApi) {
            throw new Error('MindSpark desktop bridge is unavailable.');
        }
        [notes, settings] = await Promise.all([
            loadInitialNotes(),
            loadInitialSettings()
        ]);
        applySettingsToForm();
    } catch (error) {
        console.error('App initialization failed:', error);
        showToast('桌面运行环境不可用，无法加载数据', 'error');
    }

    renderNotes();
}

// ============================================
// Init
// ============================================
const debouncedRender = debounce(() => {
    displayCount = 20;
    renderNotes();
}, 300);
search.addEventListener('input', debouncedRender);

initApp();
