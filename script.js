// ============================================
// MindSpark Lite — Full-featured JS
// ============================================

// --- State ---
let notes = JSON.parse(localStorage.getItem('mindspark_notes') || '[]');
let settings = JSON.parse(localStorage.getItem('mindspark_settings') || '{}');
let sortMode = 'time';
let currentDetailNoteId = null;
let isEditing = false;
let currentSourceType = 'none';
let currentSourceImage = null;
let displayCount = 20;
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
        model: 'text-embedding-004'
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
const sourceUrlInput = document.getElementById('sourceUrlInput');
const sourceImageInput = document.getElementById('sourceImageInput');
const sourcePreview = document.getElementById('sourcePreview');
const sourceTextInput = document.getElementById('sourceTextInput');

notes = normalizeNotes(notes);

// --- Init Theme ---
if (localStorage.getItem('theme') === 'dark') {
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
        localStorage.setItem('theme', 'light');
        document.getElementById('themeBtn').textContent = '🌙';
    } else {
        document.body.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
        document.getElementById('themeBtn').textContent = '☀️';
    }
}

// ============================================
// Toast Notification System
// ============================================
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============================================
// Note Create Modal
// ============================================
function setSourceType(type) {
    currentSourceType = type;
    document.querySelectorAll('.source-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.sourceType === type);
    });
    document.getElementById('sourceUrlGroup').style.display = type === 'url' ? 'block' : 'none';
    document.getElementById('sourceImageGroup').style.display = type === 'image' ? 'block' : 'none';
    document.getElementById('sourceTextGroup').style.display = type === 'text' ? 'block' : 'none';
}

function resetSourceInputs() {
    currentSourceImage = null;
    if (sourceUrlInput) sourceUrlInput.value = '';
    if (sourceImageInput) sourceImageInput.value = '';
    if (sourceTextInput) sourceTextInput.value = '';
    if (sourcePreview) {
        sourcePreview.style.display = 'none';
        sourcePreview.innerHTML = '';
    }
    setSourceType('none');
}

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('读取图片失败'));
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
    setSourceType('image');
    sourcePreview.style.display = 'block';
    sourcePreview.innerHTML = `
        <img src="${dataUrl}" alt="source preview">
        <div style="font-size:12px; color:var(--text-secondary);">${escapeHtml(currentSourceImage.meta.name)}</div>
    `;
}

async function handleSourceImageSelect(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
        await setSourceImageFile(file);
    } catch (err) {
        showToast(err.message || '处理图片失败', 'error');
    }
}

async function collectSourceData() {
    if (currentSourceType === 'url') {
        let url = (sourceUrlInput?.value || '').trim();
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
        const text = (sourceTextInput?.value || '').trim();
        if (!text) return { source_type: 'none', source_url: '', source_meta: null };
        return { source_type: 'text', source_url: '', source_meta: { title: text } };
    }

    return { source_type: 'none', source_url: '', source_meta: null };
}

function openNoteModal() {
    const modal = document.getElementById('noteModal');
    modal.classList.add('open');
    noteInput.value = '';
    resetSourceInputs();
    document.getElementById('charCount').textContent = '0 字';
    setTimeout(() => noteInput.focus(), 50);
}

function closeNoteModal() {
    document.getElementById('noteModal').classList.remove('open');
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
            source_type: sourceData.source_type,
            source_url: sourceData.source_url,
            source_meta: sourceData.source_meta
        };

        notes.unshift(note);
        saveNotes();

        closeNoteModal();
        displayCount = 20;
        renderNotes();
        showToast('想法已保存 ✨', 'success');
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
    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    currentDetailNoteId = noteId;
    isEditing = false;

    // Update view count
    note.view_count = (note.view_count || 0) + 1;
    saveNotes();

    // Populate content
    document.getElementById('detailTime').textContent = formatDate(note.created_at);
    document.getElementById('detailViewContent').textContent = note.content;
    document.getElementById('detailViewContent').style.display = 'block';
    document.getElementById('detailEditContent').style.display = 'none';
    renderDetailSource(note);

    // Reset actions
    document.getElementById('detailNormalActions').style.display = 'flex';
    document.getElementById('detailEditActions').style.display = 'none';
    document.getElementById('deleteConfirmGroup').style.display = 'none';
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
    const note = notes.find(n => n.id === currentDetailNoteId);
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

async function saveEditNote() {
    const note = notes.find(n => n.id === currentDetailNoteId);
    if (!note) return;

    const newContent = document.getElementById('detailEditContent').value.trim();
    if (!newContent) return;

    const btn = document.getElementById('editSaveBtn');
    btn.textContent = '保存中...';
    btn.disabled = true;

    try {
        note.content = newContent;

        // Re-generate embedding if API is configured
        if (settings.apiKey && settings.apiBaseUrl) {
            try {
                note.embedding = await getEmbedding(newContent);
            } catch (e) {
                console.error('Re-embedding failed:', e);
            }
        }

        saveNotes();
        document.getElementById('detailViewContent').textContent = newContent;
        cancelEditNote();
        renderNotes();
        showToast('修改已保存', 'success');

        // Re-render related notes with new embedding
        renderRelatedNotes(note);
    } finally {
        btn.textContent = '完成';
        btn.disabled = false;
    }
}

function confirmDeleteNote() {
    document.getElementById('deleteConfirmGroup').style.display = 'flex';
    document.getElementById('deleteBtn').style.display = 'none';
}

function cancelDeleteNote() {
    document.getElementById('deleteConfirmGroup').style.display = 'none';
    document.getElementById('deleteBtn').style.display = '';
}

function executeDeleteNote() {
    notes = notes.filter(n => n.id !== currentDetailNoteId);
    saveNotes();
    closeDetailModal();
    renderNotes();
    showToast('想法已删除', 'info');
}

function renderRelatedNotes(note) {
    const container = document.getElementById('detailRelatedList');
    const section = document.getElementById('detailRelated');
    const related = getRelatedNotes(note);

    if (related.length === 0) {
        // 无关联时显示鼓励性提示
        section.style.display = 'block';
        container.innerHTML = '<div style="color:var(--text-secondary); padding:12px; text-align:center;">✨ 这是一个全新的想法，没有找到相似笔记。</div>';
        return;
    }

    section.style.display = 'block';
    container.innerHTML = related.map(r => `
        <div class="related-note" onclick="navigateToRelatedNote('${r.id}')">
            <div style="word-break:break-word;">${escapeHtml(r.content.length > 90 ? r.content.slice(0, 90) + '...' : r.content)}</div>
            <div class="related-similarity">相似度 ${(r.similarity * 100).toFixed(0)}%</div>
        </div>
    `).join('');
}

function navigateToRelatedNote(noteId) {
    closeDetailModal();
    setTimeout(() => openDetailModal(noteId), 300);
}

// ============================================
// Note Card Delete (in list)
// ============================================
function deleteNote(id, e) {
    e.stopPropagation();
    if (confirm('确定要删除这条想法吗？')) {
        notes = notes.filter(n => n.id !== id);
        saveNotes();
        // 不重置 displayCount，保持当前加载的条数
        renderNotes();
        showToast('想法已删除', 'info');
    }
}

// ============================================
// Sort
// ============================================
function setSort(mode) {
    sortMode = mode;
    document.getElementById('sortTimeBtn').style.color = mode === 'time' ? 'var(--accent)' : 'var(--text-secondary)';
    document.getElementById('sortRandomBtn').style.color = mode === 'random' ? 'var(--accent)' : 'var(--text-secondary)';
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
    localStorage.setItem('mindspark_settings', JSON.stringify(settings));

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
        .filter(n => n.id !== targetNote.id && n.embedding)
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
                saveNotes();
            }
            await new Promise(r => setTimeout(r, 200));
        } catch (e) {
            console.error(e);
            status.textContent = `处理中 ${count}/${targets.length}... (出错，继续)`;
        }
    }

    status.textContent = `完成！成功处理 ${success} 条。`;
    btn.disabled = false;
    renderNotes();
    showToast(`成功处理 ${success} 条笔记的向量`, 'success');
}

// ============================================
// Import / Export
// ============================================
function exportData() {
    const data = JSON.stringify(notes, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mindspark-notes-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('数据已导出', 'success');
}

function exportMarkdown() {
    if (notes.length === 0) {
        showToast('没有笔记可导出', 'info');
        return;
    }
    const lines = [];
    let invalidCount = 0;
    notes.forEach(note => {
        let dateStr;
        try {
            const date = new Date(note.created_at);
            if (isNaN(date.getTime())) throw new Error('Invalid date');
            dateStr = date.toISOString().slice(0, 10);
        } catch (e) {
            // 无效日期，使用当前日期并计数
            dateStr = new Date().toISOString().slice(0, 10);
            invalidCount++;
        }
        let sourceLine = '';
        if (note.source_type === 'url' && note.source_url) {
            sourceLine = `\n> 🔗 [${note.source_url}](${note.source_url})`;
        } else if (note.source_type === 'image') {
            const name = (note.source_meta && note.source_meta.name) || '图片';
            sourceLine = `\n> 📸 ${name}`;
        } else if (note.source_type === 'text' && note.source_meta?.title) {
            sourceLine = `\n> 📝 ${note.source_meta.title}`;
        }
        lines.push(`## ${dateStr}\n\n${note.content}${sourceLine}\n\n---`);
    });
    if (invalidCount > 0) {
        console.warn(`导出 MD 时发现 ${invalidCount} 条笔记日期无效，已使用当前日期代替。`);
        showToast(`${invalidCount} 条笔记日期无效，已用今日日期`, 'info');
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mindspark-export-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Markdown 导出成功', 'success');
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!Array.isArray(data)) throw new Error('Invalid format');
            const existingIds = new Set(notes.map(n => n.id));
            let count = 0;
            data.forEach(n => {
                if (!existingIds.has(n.id)) {
                    if (n.content && n.created_at) {
                        notes.push(normalizeNote(n));
                        existingIds.add(n.id);
                        count++;
                    }
                }
            });
            saveNotes();
            renderNotes();
            showToast(`成功导入 ${count} 条笔记！`, 'success');
        } catch (err) {
            showToast('导入失败：文件格式错误', 'error');
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

// ============================================
// Onboarding
// ============================================
const ONBOARDING_STEPS = [
    {
        title: '欢迎来到 MindSpark',
        content: '在这里，你只需要专注记录想法。其余的关联与回顾，交给系统处理。'
    },
    {
        title: '写下此刻想法',
        content: '点击顶部的输入框或按 Ctrl+N 开启专注写作模式。随时记录灵光一闪。'
    },
    {
        title: '用搜索回想',
        content: '输入关键词搜索你的想法。配置 AI 后，还能通过语义向量找到相似的内容。'
    },
    {
        title: '和自己重逢',
        content: '在设置里配置 AI 与提醒，让过去的你持续和现在的你对话。开始吧！'
    }
];

let onboardingStep = 0;

function initOnboarding() {
    if (localStorage.getItem('mindspark_onboarding_completed')) return;
    setTimeout(() => {
        showOnboardingStep(0);
        document.getElementById('onboardingModal').classList.add('open');
    }, 800);
}

function showOnboardingStep(idx) {
    onboardingStep = idx;
    const step = ONBOARDING_STEPS[idx];
    document.getElementById('onboardingTitle').textContent = step.title;
    document.getElementById('onboardingContent').textContent = step.content;

    // Dots
    const dotsContainer = document.getElementById('onboardingDots');
    dotsContainer.innerHTML = ONBOARDING_STEPS.map((_, i) =>
        `<div class="onboarding-dot${i === idx ? ' active' : ''}" style="width:${i === idx ? '20px' : '8px'};"></div>`
    ).join('');

    // Button text
    document.getElementById('onboardingNextBtn').textContent =
        idx === ONBOARDING_STEPS.length - 1 ? '开始使用' : '下一步';
}

function nextOnboardingStep() {
    if (onboardingStep < ONBOARDING_STEPS.length - 1) {
        showOnboardingStep(onboardingStep + 1);
    } else {
        skipOnboarding();
    }
}

function skipOnboarding() {
    document.getElementById('onboardingModal').classList.remove('open');
    localStorage.setItem('mindspark_onboarding_completed', 'true');
}

function getSourceBadge(note) {
    if (note.source_type === 'url' && note.source_url) return '🔗 链接';
    if (note.source_type === 'image' && note.source_url) return '🖼️ 图片';
    if (note.source_type === 'text' && note.source_meta?.title) return '📝 ' + (note.source_meta.title.length > 10 ? note.source_meta.title.slice(0, 10) + '...' : note.source_meta.title);
    return '';
}


// ============================================
// Render Notes
// ============================================
function renderNotes() {
    const query = search.value.toLowerCase();
    let displayNotes = notes.filter(n => n.content.toLowerCase().includes(query));

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
                    ${getSourceBadge(note) ? `<span class="source-badge">${getSourceBadge(note)}</span>` : ''}
                </div>
                <button class="delete-btn" onclick="deleteNote('${note.id}', event)">删除</button>
            </div>
        `;

        div.onclick = (e) => {
            if (e.target.closest('.delete-btn')) return;
            openDetailModal(note.id);
        };

        list.appendChild(div);
    });

    // 统计信息
    const stats = document.getElementById('noteStats');
    const totalNotes = notes.length;
    const embeddedCount = notes.filter(n => n.embedding).length;
    stats.textContent = `共 ${totalNotes} 条想法${embeddedCount > 0 ? ` · ${embeddedCount} 条已嵌入向量` : ''}`;

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
    return normalized;
}

function normalizeNotes(rawNotes) {
    if (!Array.isArray(rawNotes)) return [];
    return rawNotes
        .filter(n => n && n.content && n.created_at)
        .map(normalizeNote);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function saveNotes() {
    localStorage.setItem('mindspark_notes', JSON.stringify(notes));
}

// ============================================
// Init
// ============================================
const debouncedRender = debounce(() => {
    displayCount = 20;
    renderNotes();
}, 300);
search.addEventListener('input', debouncedRender);

renderNotes();
initOnboarding();
