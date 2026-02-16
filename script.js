// ============================================================================
// 1. 全局数据 & 配置
// ============================================================================
let notes = [];
let sortMode = 'random'; // 'random' 或 'time'
let currentNote = null; // 当前打开的笔记对象
let searchActive = false;

// ============================================================================
// 2. 工具函数（防抖、洗牌、XSS、相对时间、高亮等）
// ============================================================================

function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

function shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function escapeHTML(str) {
    return str.replace(/[&<>"]/g, function (match) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
        return map[match];
    });
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightKeyword(text, keyword) {
    if (!keyword) return escapeHTML(text);
    const escapedText = escapeHTML(text);
    const escapedKeyword = escapeHTML(keyword);
    const safeKeyword = escapeRegExp(escapedKeyword);
    const regex = new RegExp(`(${safeKeyword})`, 'gi');
    return escapedText.replace(regex, '<mark>$1</mark>');
}

function timeAgo(dateString) {
    const now = new Date();
    const past = new Date(dateString);
    const diff = Math.floor((now - past) / 1000);
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
    if (diff < 172800) return '昨天';
    if (diff < 2592000) return Math.floor(diff / 86400) + '天前';
    return Math.floor(diff / 2592000) + '个月前';
}

// 生成向量
async function generateEmbedding(text) {
    const settings = JSON.parse(localStorage.getItem('mindspark_api_settings') || '{}');
    if (!settings.apiKey) {
        console.warn('未配置 API Key');
        return null;
    }

    let apiUrl;
    if (settings.provider === 'openai') {
        apiUrl = 'https://api.openai.com/v1/embeddings';
    } else if (settings.provider === 'siliconflow') {
        apiUrl = 'https://api.siliconflow.cn/v1/embeddings';
    } else if (settings.provider === 'custom') {
        apiUrl = settings.customUrl;
        if (!apiUrl.endsWith('/embeddings')) apiUrl += '/embeddings';
    } else {
        return null;
    }

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.apiKey}`
            },
            body: JSON.stringify({
                input: text,
                model: settings.model || 'text-embedding-3-small'
            })
        });
        const data = await response.json();
        if (data.data && data.data[0] && data.data[0].embedding) {
            return data.data[0].embedding; // 返回向量数组
        } else {
            console.error('Embedding API 返回格式错误', data);
            return null;
        }
    } catch (error) {
        console.error('调用 Embedding API 失败', error);
        return null;
    }

    if (!response.ok) {
        const errorData = await response.json();
        console.error('API 错误详情:', errorData);
        return null;
    }
}

function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dot += vecA[i] * vecB[i];
        magA += vecA[i] * vecA[i];
        magB += vecB[i] * vecB[i];
    }
    if (magA === 0 || magB === 0) return 0;
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function findSimilarNotes(noteId, topN = 5) {
    const currentNote = notes.find(n => n.id === noteId);
    if (!currentNote || !currentNote.embedding) return [];

    const similarities = notes
        .filter(n => n.id !== noteId && n.embedding) // 只考虑有向量的笔记
        .map(n => ({
            note: n,
            similarity: cosineSimilarity(currentNote.embedding, n.embedding)
        }))
        .filter(item => item.similarity > 0.8) // 阈值可调
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topN);

    return similarities.map(item => item.note);
}

// ============================================================================
// 3. 本地存储读写
// ============================================================================

function saveNotesToLocalStorage() {
    localStorage.setItem('mindspark_notes', JSON.stringify(notes));
}

function loadNotesFromLocalStorage() {
    const stored = localStorage.getItem('mindspark_notes');
    if (stored) {
        notes = JSON.parse(stored);
    } else {
        notes = [
            {
                id: 1,
                content: '这是第一条笔记的内容。你可以写很长，但卡片默认只显示3行。超过部分会被截断，并显示省略号...',
                createdAt: new Date().toISOString()
            },
            {
                id: 2,
                content: '昨天想到的一个点子：也许我们可以用随机排列来制造偶遇感，让旧想法自己跳出来。',
                createdAt: new Date(Date.now() - 86400000).toISOString()
            },
            {
                id: 3,
                content: '三个月前写了一段关于自由意志的思考，现在看起来还是很有意思。人做决定的时候，其实已经决定了。',
                createdAt: new Date(Date.now() - 7776000000).toISOString()
            }
        ];
        saveNotesToLocalStorage();
    }
    renderNotes();
}

// ============================================================================
// 4. DOM 元素引用
// ============================================================================

const inputEl = document.querySelector('.search-input');
const sendBtn = document.querySelector('.search-btn');
const container = document.querySelector('.container');

const modalOverlay = document.getElementById('modalOverlay');
const modalContent = document.getElementById('modalContent');
const modalTime = document.getElementById('modalTime');
const modalCloseBtn = document.getElementById('modalCloseBtn');

const modalEditBtn = document.getElementById('modalEditBtn');
const modalSaveBtn = document.getElementById('modalSaveBtn');
const modalCancelBtn = document.getElementById('modalCancelBtn');
const modalEditTextarea = document.getElementById('modalEditTextarea');

const sortToggles = document.querySelectorAll('.sort-toggle');
const randomIcon = document.querySelector('.sort-toggle[data-mode="random"]');
const timeIcon = document.querySelector('.sort-toggle[data-mode="time"]');
const themeToggle = document.querySelector('.theme-toggle');

const searchIcon = document.getElementById('searchIcon');
const searchBox = document.getElementById('searchBox');
const searchContainer = document.getElementById('searchContainer');
const searchClear = document.getElementById('searchClear');

const welcomeOverlay = document.getElementById('welcomeOverlay');
const welcomeBtn = document.getElementById('welcomeBtn');

const relatedContainer = document.getElementById('relatedNotes');

//设置ai元素
const aiSettingsOverlay = document.getElementById('aiSettingsOverlay');
const openAiSettingsBtn = document.getElementById('openAiSettingsBtn');
const closeAiSettingsBtn = document.getElementById('closeAiSettingsBtn');
const saveApiSettingsBtn = document.getElementById('saveApiSettingsBtn');
const testApiBtn = document.getElementById('testApiBtn');
const apiProvider = document.getElementById('apiProvider');
const customApiUrlGroup = document.getElementById('customApiUrlGroup');
const customApiUrl = document.getElementById('customApiUrl');
const apiKey = document.getElementById('apiKey');
const embeddingModel = document.getElementById('embeddingModel');

// ============================================================================
// 5. 核心渲染函数
// ============================================================================

function renderNotes() {
    let notesListEl = document.querySelector('.notes-list');
    if (!notesListEl) {
        notesListEl = document.createElement('div');
        notesListEl.className = 'notes-list';
        container.appendChild(notesListEl);
    }

    if (notes.length === 0) {
        notesListEl.innerHTML = '<div class="empty-state">写下你脑子里正在转的东西</div>';
        return;
    }

    let sortedNotes = [...notes];
    if (sortMode === 'random') {
        sortedNotes = shuffleArray(sortedNotes);
    } else {
        sortedNotes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    notesListEl.innerHTML = '';
    sortedNotes.forEach((note, index) => {
        const card = document.createElement('div');
        card.className = 'note-card';
        card.dataset.id = note.id;
        // 根据索引设置动画延迟，每个卡片延迟增加 0.05 秒（50ms）
        card.style.animationDelay = `${index * 0.15}s`;
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <div class="note-content" style="flex:1;">${escapeHTML(note.content)}</div>
                <span class="delete-btn" style="color: #888; cursor: pointer; padding: 4px; margin-left: 8px;">✕</span>
            </div>
            <div class="note-time">${timeAgo(note.createdAt)}</div>
        `;
        notesListEl.appendChild(card);
    });
}

// ============================================================================
// 6. 笔记操作（添加、删除、编辑、模态框）
// ============================================================================

function addNote(content) {
    if (!content.trim()) return;
    const newNote = {
        id: Date.now(),
        content: content,
        createdAt: new Date().toISOString(),
        embedding: null // 初始为空
    };
    notes.push(newNote);
    saveNotesToLocalStorage();
    renderNotes();

    // 异步生成向量（不等待）
    generateEmbedding(content).then(embedding => {
        if (embedding) {
            newNote.embedding = embedding;
            saveNotesToLocalStorage(); // 更新存储
            // 可以选择重新渲染，但没必要
        }
    });
}

function openModal(note) {
    currentNote = note;
    modalContent.textContent = note.content;
    modalTime.textContent = timeAgo(note.createdAt);

    modalContent.style.display = 'block';
    modalEditTextarea.style.display = 'none';
    modalCloseBtn.style.display = 'inline-block';
    modalEditBtn.style.display = 'inline-block';
    modalSaveBtn.style.display = 'none';
    modalCancelBtn.style.display = 'none';
    modalOverlay.classList.add('active');

    // 查找相关笔记
    const related = findSimilarNotes(note.id, 3);
    const relatedList = document.getElementById('relatedNotesList');
    if (related.length > 0) {
        relatedList.innerHTML = related.map(rel =>
            `<div class="related-note-item" data-id="${rel.id}">${escapeHTML(rel.content.substring(0, 50))}…</div>`
        ).join('');
        relatedContainer.style.display = 'block';
    } else {
        relatedContainer.style.display = 'none';
    }
}

function closeModal() {
    modalOverlay.classList.remove('active');
}

function enterEditMode() {
    if (!currentNote) return;
    modalContent.style.display = 'none';
    modalEditTextarea.style.display = 'block';
    modalEditTextarea.value = currentNote.content;
    modalEditTextarea.focus();

    modalCloseBtn.style.display = 'none';
    modalEditBtn.style.display = 'none';
    modalSaveBtn.style.display = 'inline-block';
    modalCancelBtn.style.display = 'inline-block';
}

function saveEdit() {
    if (!currentNote) return;
    const newContent = modalEditTextarea.value.trim();
    if (newContent === '') {
        alert('内容不能为空');
        return;
    }
    currentNote.content = newContent;
    saveNotesToLocalStorage();
    renderNotes();
    closeModal();
}

function cancelEdit() {
    modalContent.style.display = 'block';
    modalEditTextarea.style.display = 'none';
    modalCloseBtn.style.display = 'inline-block';
    modalEditBtn.style.display = 'inline-block';
    modalSaveBtn.style.display = 'none';
    modalCancelBtn.style.display = 'none';
}

// 增强 closeModal：关闭时重置编辑状态
const originalCloseModal = closeModal;
closeModal = function () {
    modalContent.style.display = 'block';
    modalEditTextarea.style.display = 'none';
    modalCloseBtn.style.display = 'inline-block';
    modalEditBtn.style.display = 'inline-block';
    modalSaveBtn.style.display = 'none';
    modalCancelBtn.style.display = 'none';
    originalCloseModal();
};

// ============================================================================
// 7. UI 交互函数（主题、排序图标、搜索）
// ============================================================================

function setTheme(theme) {
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
        themeToggle.textContent = '☀️';
        themeToggle.setAttribute('aria-label', '切换到浅色主题');
    } else {
        document.body.classList.remove('dark-theme');
        themeToggle.textContent = '🌙';
        themeToggle.setAttribute('aria-label', '切换到深色主题');
    }
    localStorage.setItem('mindspark_theme', theme);
}

function updateSortIcons() {
    sortToggles.forEach(icon => {
        const mode = icon.dataset.mode;
        icon.classList.toggle('active', mode === sortMode);
    });
}

// 切换搜索框显示/隐藏
function toggleSearch(show) {
    const shouldShow = show !== undefined ? show : !searchActive;
    if (shouldShow) {
        searchContainer.style.display = 'block';  // 显示容器
        searchBox.focus();
        searchActive = true;
    } else {
        searchContainer.style.display = 'none';
        searchBox.value = '';
        searchClear.style.display = 'none';   // 隐藏清除按钮
        searchActive = false;
        filterNotes('');
    }
}

function filterNotes(keyword) {
    if (keyword === '') {
        renderNotes();
        return;
    }
    const filtered = notes.filter(note =>
        note.content.toLowerCase().includes(keyword)
    );
    renderFilteredNotes(filtered, keyword);
}

function renderFilteredNotes(filteredArray, keyword) {
    let notesListEl = document.querySelector('.notes-list');
    if (!notesListEl) {
        notesListEl = document.createElement('div');
        notesListEl.className = 'notes-list';
        container.appendChild(notesListEl);
    }

    if (filteredArray.length === 0) {
        notesListEl.innerHTML = '<div class="empty-state">没有找到相关想法</div>';
        return;
    }

    let sorted = [...filteredArray];
    if (sortMode === 'random') {
        sorted = shuffleArray(sorted);
    } else {
        sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    notesListEl.innerHTML = '';
    sorted.forEach((note, index) => {
        const card = document.createElement('div');
        card.className = 'note-card';
        card.dataset.id = note.id;
        card.style.animationDelay = `${index * 0.15}s`;  // 添加这一行
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <div class="note-content" style="flex:1;">${highlightKeyword(note.content, keyword)}</div>
                <span class="delete-btn" style="color: #888; cursor: pointer; padding: 4px; margin-left: 8px;">✕</span>
            </div>
            <div class="note-time">${timeAgo(note.createdAt)}</div>
        `;
        notesListEl.appendChild(card);
    });
}

// 保存 API 设置到 localStorage
function saveApiSettings() {
    const settings = {
        provider: apiProvider.value,
        customUrl: customApiUrl.value,
        apiKey: apiKey.value,
        model: embeddingModel.value
    };
    localStorage.setItem('mindspark_api_settings', JSON.stringify(settings));
    alert('设置已保存');
}

// 加载 API 设置
function loadApiSettings() {
    const saved = localStorage.getItem('mindspark_api_settings');
    if (saved) {
        const settings = JSON.parse(saved);
        apiProvider.value = settings.provider || 'openai';
        customApiUrl.value = settings.customUrl || '';
        apiKey.value = settings.apiKey || '';
        embeddingModel.value = settings.model || 'text-embedding-3-small';
        customApiUrlGroup.style.display = apiProvider.value === 'custom' ? 'block' : 'none';
    }
}

saveApiSettingsBtn.addEventListener('click', saveApiSettings);

// ============================================================================
// 8. 事件监听
// ============================================================================

sendBtn.addEventListener('click', () => {
    addNote(inputEl.value);
    inputEl.value = '';
});

inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        addNote(inputEl.value);
        inputEl.value = '';
    }
});

container.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.delete-btn');
    if (deleteBtn) {
        e.preventDefault();
        if (!confirm('确定要删除吗？')) return;
        const card = deleteBtn.closest('.note-card');
        if (!card) return;
        const id = Number(card.dataset.id);
        card.classList.add('fade-out');
        setTimeout(() => {
            notes = notes.filter(note => note.id !== id);
            saveNotesToLocalStorage();
            renderNotes();
        }, 300);
        return;
    }

    const card = e.target.closest('.note-card');
    if (!card) return;
    const id = Number(card.dataset.id);
    const note = notes.find(n => n.id === id);
    if (note) openModal(note);
});

modalEditBtn.addEventListener('click', enterEditMode);
modalSaveBtn.addEventListener('click', saveEdit);
modalCancelBtn.addEventListener('click', cancelEdit);
modalCloseBtn.addEventListener('click', closeModal);

modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
});

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
        closeModal();
    }
});

window.addEventListener('keydown', (e) => {
    if (!modalOverlay.classList.contains('active')) return;
    if (modalEditTextarea.style.display !== 'block') return;
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        saveEdit();
    }
});

const debouncedRandom = debounce(() => {
    if (sortMode === 'random') {
        renderNotes();
    } else {
        sortMode = 'random';
        updateSortIcons();
        renderNotes();
    }
}, 150);

if (randomIcon) {
    randomIcon.addEventListener('click', debouncedRandom);
}

if (timeIcon) {
    timeIcon.addEventListener('click', () => {
        if (sortMode === 'time') return;
        sortMode = 'time';
        updateSortIcons();
        renderNotes();
    });
}

themeToggle.addEventListener('click', () => {
    const isDark = document.body.classList.contains('dark-theme');
    setTheme(isDark ? 'light' : 'dark');
});

searchIcon.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSearch();
});

document.addEventListener('click', (e) => {
    if (!searchActive) return;
    if (!searchIcon.contains(e.target) && !searchBox.contains(e.target)) {
        toggleSearch(false);
    }
});

searchBox.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        toggleSearch(false);
    }
});

searchBox.addEventListener('input', (e) => {
    const keyword = e.target.value.trim().toLowerCase();
    filterNotes(keyword);
    //控制清除按钮显示
    if (keyword !== '') {
        searchClear.style.display = 'inline-block';
    } else {
        searchClear.style.display = 'none';
    }
});

// 点击清除按钮：清空输入框，触发过滤，隐藏按钮
searchClear.addEventListener('click', () => {
    searchBox.value = '';
    searchClear.style.display = 'none';
    filterNotes('');           // 恢复完整列表
    searchBox.focus();         // 保持焦点（可选）
});

openAiSettingsBtn.addEventListener('click', () => {
    settingsDropdown.style.display = 'none'; // 关闭设置下拉
    // 加载已保存的配置
    loadApiSettings();
    aiSettingsOverlay.classList.add('active');
});

closeAiSettingsBtn.addEventListener('click', () => {
    aiSettingsOverlay.classList.remove('active');
});

// 切换自定义 API 地址显示
apiProvider.addEventListener('change', () => {
    customApiUrlGroup.style.display = apiProvider.value === 'custom' ? 'block' : 'none';
});

// ============================================================================
// 导入/导出功能
// ============================================================================
const settingsToggle = document.getElementById('settingsToggle');
const settingsDropdown = document.getElementById('settingsDropdown');
const exportJsonBtn = document.getElementById('exportJsonBtn');
const exportMarkdownBtn = document.getElementById('exportMarkdownBtn');
const importJsonBtn = document.getElementById('importJsonBtn');
const importFileInput = document.getElementById('importFileInput');

// 切换下拉菜单显示
settingsToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = settingsDropdown.style.display === 'block';
    settingsDropdown.style.display = isVisible ? 'none' : 'block';
});

// 点击其他地方关闭下拉菜单
document.addEventListener('click', (e) => {
    if (!settingsToggle.contains(e.target) && !settingsDropdown.contains(e.target)) {
        settingsDropdown.style.display = 'none';
    }
});

// 导出 JSON
function downloadJSON() {
    const data = JSON.stringify(notes, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mindspark-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    settingsDropdown.style.display = 'none'; // 关闭下拉
}

// 导出 Markdown
function downloadMarkdown() {
    if (notes.length === 0) {
        alert('没有笔记可导出');
        return;
    }
    const lines = notes.map(note => {
        const date = new Date(note.createdAt).toISOString().slice(0, 10);
        return `## ${date}\n\n${note.content}\n\n---`;
    }).join('\n');
    const blob = new Blob([lines], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mindspark-export-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
    settingsDropdown.style.display = 'none';
}

// 导入 JSON
function importFromJSON(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            if (!Array.isArray(imported)) {
                alert('无效的 JSON 格式：应为笔记数组');
                return;
            }
            // 简单验证：确保每个笔记有 id、content、createdAt
            const valid = imported.every(item =>
                item.id && typeof item.content === 'string' && item.createdAt
            );
            if (!valid) {
                alert('JSON 格式不完整，缺少必要字段（id, content, createdAt）');
                return;
            }
            // 合并到现有笔记（避免 id 冲突？简单起见直接追加，id 可能重复，但 Date.now() 重复概率低）
            // 更安全：生成新 id？但导入的数据应保留原 id，除非冲突。我们直接追加，让用户自己处理。
            notes.push(...imported);
            saveNotesToLocalStorage();
            renderNotes();
            settingsDropdown.style.display = 'none';
            alert(`成功导入 ${imported.length} 条笔记`);
        } catch (err) {
            alert('解析 JSON 失败：' + err.message);
        }
    };
    reader.readAsText(file);
}

// 绑定导出按钮
exportJsonBtn.addEventListener('click', downloadJSON);
exportMarkdownBtn.addEventListener('click', downloadMarkdown);

// 绑定导入按钮：触发文件选择
importJsonBtn.addEventListener('click', () => {
    importFileInput.click();
});

// 文件选择后处理
importFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    importFromJSON(file);
    importFileInput.value = ''; // 允许再次选择同一个文件
});

// 新增 Markdown 文件输入元素
const importMarkdownFileInput = document.getElementById('importMarkdownFileInput');
const importMarkdownBtn = document.getElementById('importMarkdownBtn');

// 导入 Markdown
function importFromMarkdown(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const content = e.target.result;
            // 按 --- 分割笔记（导出的格式是每个笔记后跟 ---）
            const noteBlocks = content.split(/\n---\n/).filter(block => block.trim() !== '');

            const importedNotes = noteBlocks.map(block => {
                // 预期格式：## YYYY-MM-DD\n\n内容
                const lines = block.split('\n');
                // 第一行应该是 ## 日期
                const firstLine = lines[0].trim();
                let createdAt;
                const dateMatch = firstLine.match(/^##\s*(\d{4}-\d{2}-\d{2})/);
                if (dateMatch) {
                    createdAt = new Date(dateMatch[1]).toISOString();
                } else {
                    // 如果没有日期，使用当前时间
                    createdAt = new Date().toISOString();
                }
                // 剩余部分作为内容（可能包含换行）
                const content = lines.slice(1).join('\n').trim();
                return {
                    id: Date.now() + Math.floor(Math.random() * 1000),
                    content: content,
                    createdAt: createdAt
                };
            });

            // 追加到现有笔记
            notes.push(...importedNotes);
            saveNotesToLocalStorage();
            renderNotes();
            settingsDropdown.style.display = 'none';
            alert(`成功导入 ${importedNotes.length} 条笔记`);
        } catch (err) {
            alert('解析 Markdown 失败：' + err.message);
        }
    };
    reader.readAsText(file);
}

// 绑定导入 Markdown 按钮
importMarkdownBtn.addEventListener('click', () => {
    importMarkdownFileInput.click();
});

// 处理 Markdown 文件选择
importMarkdownFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    importFromMarkdown(file);
    importMarkdownFileInput.value = ''; // 允许重新选择同一文件
});

relatedContainer.addEventListener('click', (e) => {
    const item = e.target.closest('.related-note-item');
    if (!item) return;
    const id = Number(item.dataset.id);
    const note = notes.find(n => n.id === id);
    if (note) openModal(note);
});

testApiBtn.addEventListener('click', async () => {
    // 直接从表单获取当前输入的值
    const settings = {
        provider: apiProvider.value,
        customUrl: customApiUrl.value,
        apiKey: apiKey.value,
        model: embeddingModel.value
    };

    // 如果没有输入 API Key，提示
    if (!settings.apiKey) {
        alert('请先填写 API Key');
        return;
    }

    const testText = '这是一条测试文本';
    try {
        // 临时调用一个测试函数（可复用 generateEmbedding 但传入 settings）
        const embedding = await testEmbedding(testText, settings);
        if (embedding) {
            alert('连接成功！向量维度：' + embedding.length);
        } else {
            alert('连接失败，请查看控制台详细错误 (F12)');
        }
    } catch (error) {
        alert('连接异常：' + error.message);
    }
});

// 新增测试用的嵌入函数（与 generateEmbedding 类似，但接受 settings 参数）
async function testEmbedding(text, settings) {
    let apiUrl;
    if (settings.provider === 'openai') {
        apiUrl = 'https://api.openai.com/v1/embeddings';
    } else if (settings.provider === 'siliconflow') {
        apiUrl = 'https://api.siliconflow.cn/v1/embeddings';
    } else if (settings.provider === 'custom') {
        apiUrl = settings.customUrl;
        if (!apiUrl.endsWith('/embeddings')) apiUrl += '/embeddings';
    } else {
        return null;
    }

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.apiKey}`
            },
            body: JSON.stringify({
                input: text,
                model: settings.model || 'text-embedding-3-small'
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('API 错误详情:', errorData);
            return null;
        }

        const data = await response.json();
        if (data.data && data.data[0] && data.data[0].embedding) {
            return data.data[0].embedding;
        } else {
            console.error('Embedding API 返回格式错误', data);
            return null;
        }
    } catch (error) {
        console.error('调用 Embedding API 失败', error);
        return null;
    }
}

// ============================================================================
// 9. 初始化
// ============================================================================

loadNotesFromLocalStorage();

// ============ 首次使用引导 ============

function checkFirstVisit() {
    const hasVisited = localStorage.getItem('mindspark_hasVisited');
    if (!hasVisited) {
        welcomeOverlay.classList.add('active');
    }
}

welcomeBtn.addEventListener('click', () => {
    welcomeOverlay.classList.remove('active');
    localStorage.setItem('mindspark_hasVisited', 'true');
});

// 调用检查（放在初始化最后）
checkFirstVisit();

const savedTheme = localStorage.getItem('mindspark_theme') || 'light';
setTheme(savedTheme);
updateSortIcons();