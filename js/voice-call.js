// ============================================================
// voice-call.js - 语音电话逻辑（完整版）
// ============================================================
(function() {
    'use strict';

    // ===== DOM 引用 =====
    const chatArea = document.getElementById('chatArea');
    const messageInput = document.getElementById('messageInput');
    const replyBtn = document.getElementById('replyBtn');
    const rerollBtn = document.getElementById('rerollBtn');
    const hangupBtn = document.getElementById('hangupBtn');
    const minimizeBtn = document.getElementById('minimizeBtn');
    const bgBtn = document.getElementById('bgBtn');
    const bgPanel = document.getElementById('bgPanel');
    const bgUploadInput = document.getElementById('bgUploadInput');
    const typingIndicator = document.getElementById('typingIndicator');
    const callStatus = document.getElementById('callStatus');
    const contactName = document.getElementById('contactName');
    const msgMenu = document.getElementById('msgMenu');
    const msBar = document.getElementById('msBar');
    const msCount = document.getElementById('msCount');
    const msCancel = document.getElementById('msCancel');
    const msDeleteBtn = document.getElementById('msDelete');
    const incomingActions = document.getElementById('incomingActions');
    const answerBtn = document.getElementById('answerBtn');
    const declineBtn = document.getElementById('declineBtn');
    const hangupWrapper = document.getElementById('hangupWrapper');

    // ===== 从 URL 获取参数（与 chat_inner 的人设同步） =====
    const urlParams = new URLSearchParams(window.location.search);
    let chatId = urlParams.get('chat');
    let contactNameParam = urlParams.get('name');
    if (!chatId || !contactNameParam) {
        try {
            const info = JSON.parse(sessionStorage.getItem('inner_setting_info') || 'null') ||
                         JSON.parse(sessionStorage.getItem('last_chat_info') || 'null');
            if (info) {
                if (!chatId) chatId = info.chatId || info.id;
                if (!contactNameParam) contactNameParam = info.name || info.chatName;
            }
        } catch (e) {}
    }
    chatId = chatId || 'default';
    contactNameParam = contactNameParam || '对方';
    const lookupName = contactNameParam;

    // ===== 从角色库读取人设 =====
    function getCharacterData() {
        return new Promise(function(resolve) {
            try {
                if (!('indexedDB' in window)) { resolve(null); return; }
                const request = indexedDB.open('nano_characters_db', 1);
                request.onsuccess = function(e) {
                    const db = e.target.result;
                    try {
                        const tx = db.transaction('characters', 'readonly');
                        const getAll = tx.objectStore('characters').getAll();
                        getAll.onsuccess = function() {
                            const chars = getAll.result || [];
                            let char = chars.find(c => c.name === lookupName);
                            if (!char) char = chars.find(c => c.id === chatId);
                            resolve(char || null);
                        };
                        getAll.onerror = function() { resolve(null); };
                    } catch (err) { resolve(null); }
                };
                request.onerror = function() { resolve(null); };
            } catch (e) { resolve(null); }
        });
    }

    let characterData = null;
    let contactAvatar = urlParams.get('avatar') || '';

    function renderContact() {
        try {
            const remark = localStorage.getItem('chat_setting_remark_' + chatId);
            if (remark) {
                try { contactNameParam = JSON.parse(remark); } catch (e) { }
            }
        } catch (e) {}
        if (characterData && characterData.avatar && characterData.avatar.length > 50) {
            contactAvatar = characterData.avatar;
        }
        contactName.textContent = contactNameParam;
        if (contactAvatar && contactAvatar.trim() !== '') {
            const avatarImg = document.getElementById('contactAvatar');
            const avatarSvg = document.getElementById('avatarSvg');
            if (avatarImg) {
                avatarImg.src = contactAvatar;
                avatarImg.style.display = 'block';
                if (avatarSvg) avatarSvg.style.display = 'none';
            }
        }
    }
    renderContact();
    getCharacterData().then(function(char) {
        characterData = char;
        renderContact();
    });

    function buildSystemPrompt() {
        const charName = characterData ? characterData.name : contactNameParam;
        let prompt = '你是' + charName + '，一个真实、有血有肉的人。';
        if (characterData) {
            if (characterData.gender && characterData.gender !== '未知') prompt += '\n- 性别：' + characterData.gender;
            if (characterData.nationality && characterData.nationality !== '未知') prompt += '\n- 国籍：' + characterData.nationality;
            if (characterData.setting) prompt += '\n- 设定：\n' + characterData.setting;
        }
        prompt += '\n\n你正在和用户进行语音通话，保持自然、简洁、真实的回复风格，不要使用 emoji。';
        return prompt;
    }

    // ===== 从 localStorage 读取上次计时 =====
    function getStoredSeconds() {
        try {
            const raw = localStorage.getItem('voice_call_seconds_' + chatId);
            if (raw) {
                return parseInt(raw, 10) || 0;
            }
        } catch (e) {}
        return 0;
    }

    function storeSeconds(seconds) {
        try {
            localStorage.setItem('voice_call_seconds_' + chatId, String(seconds));
        } catch (e) {}
    }

    // ===== 状态 =====
    let isWaiting = false;
    let callSeconds = getStoredSeconds();
    let callTimer = null;
    let messages = [];
    let currentBg = '#f2f2f7';
    let customBg = null;
    let isMinimized = false;
    let isRestoring = false;
    let msgSeq = 0;
    let multiSelectMode = false;
    let selectedIds = [];
    let menuTargetId = null;
    let isIncoming = urlParams.get('incoming') === '1';

    // ===== 接通状态 =====
    let isConnected = false;          // 是否已接通
    let isConnecting = false;         // 是否正在接通中
    let connectTimer = null;          // 接通等待计时器
    let connectStartTime = null;      // 开始接通的时间

    // ===== IndexedDB 存储 =====
    const DB_NAME = 'voice_call_' + chatId + '_db';
    const STORE_NAME = 'messages';
    const BG_STORE = 'settings';
    const DB_VERSION = 1;

    function openDB() {
        return new Promise(function(resolve, reject) {
            try {
                const req = indexedDB.open(DB_NAME, DB_VERSION);
                req.onupgradeneeded = function(e) {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                    }
                    if (!db.objectStoreNames.contains(BG_STORE)) {
                        db.createObjectStore(BG_STORE, { keyPath: 'key' });
                    }
                };
                req.onsuccess = function(e) { resolve(e.target.result); };
                req.onerror = function(e) { reject(e.target.error); };
            } catch (e) { reject(e); }
        });
    }

    function genMsgId() {
        msgSeq++;
        return 'vc_' + Date.now() + '_' + msgSeq;
    }

    function saveMessageObj(obj) {
        return openDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const req = tx.objectStore(STORE_NAME).put(obj);
                req.onsuccess = function() { resolve(req.result); };
                req.onerror = function(e) { reject(e.target.error); };
                tx.oncomplete = function() { db.close(); };
            });
        });
    }

    function deleteMessageById(id) {
        return openDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const req = tx.objectStore(STORE_NAME).delete(id);
                req.onsuccess = function() { resolve(); };
                req.onerror = function(e) { reject(e.target.error); };
                tx.oncomplete = function() { db.close(); };
            });
        });
    }

    function deleteMessagesByIds(ids) {
        return openDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                ids.forEach(function(id) { store.delete(id); });
                tx.oncomplete = function() { resolve(); };
                tx.onerror = function(e) { reject(e); };
            });
        });
    }

    function loadMessages() {
        return openDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const req = store.getAll();
                req.onsuccess = function() {
                    const msgs = req.result || [];
                    db.close();
                    resolve(msgs);
                };
                req.onerror = function(e) { reject(e.target.error); };
            });
        });
    }

    function deleteLastMessage() {
        return openDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                const req = store.getAll();
                req.onsuccess = function() {
                    const msgs = req.result || [];
                    if (msgs.length === 0) { resolve(); return; }
                    const last = msgs[msgs.length - 1];
                    const delReq = store.delete(last.id);
                    delReq.onsuccess = function() { resolve(); };
                    delReq.onerror = function(e) { reject(e.target.error); };
                };
                req.onerror = function(e) { reject(e.target.error); };
                tx.oncomplete = function() { db.close(); };
            });
        });
    }

    function saveBg(bgColor) {
        return openDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                const tx = db.transaction(BG_STORE, 'readwrite');
                const store = tx.objectStore(BG_STORE);
                const req = store.put({ key: 'background', value: bgColor });
                req.onsuccess = function() { resolve(); };
                req.onerror = function(e) { reject(e.target.error); };
                tx.oncomplete = function() { db.close(); };
            });
        });
    }

    function loadBg() {
        return openDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                const tx = db.transaction(BG_STORE, 'readonly');
                const store = tx.objectStore(BG_STORE);
                const req = store.get('background');
                req.onsuccess = function() {
                    const result = req.result;
                    db.close();
                    resolve(result ? result.value : null);
                };
                req.onerror = function(e) { reject(e.target.error); };
            });
        });
    }

    // ===== 更新计时显示 =====
    function updateCallStatus() {
        const m = String(Math.floor(callSeconds / 60)).padStart(2, '0');
        const s = String(callSeconds % 60).padStart(2, '0');
        callStatus.textContent = m + ':' + s;
        storeSeconds(callSeconds);
    }

    // ===== 通话计时器 =====
    function startTimer() {
        if (callTimer) {
            clearInterval(callTimer);
        }
        callTimer = setInterval(function() {
            callSeconds++;
            updateCallStatus();
        }, 1000);
    }

    // ===== 显示/隐藏输入栏 =====
function showInputArea() {
    const bottomArea = document.querySelector('.bottom-area');
    const rerollBtn = document.getElementById('rerollBtn');
    const messageInput = document.getElementById('messageInput');
    const replyBtn = document.getElementById('replyBtn');
    if (bottomArea) bottomArea.style.display = 'block';
    if (rerollBtn) rerollBtn.style.display = 'flex';
    if (messageInput) messageInput.style.display = 'block';
    if (replyBtn) replyBtn.style.display = 'flex';
}

function hideInputArea() {
    const bottomArea = document.querySelector('.bottom-area');
    const rerollBtn = document.getElementById('rerollBtn');
    const messageInput = document.getElementById('messageInput');
    const replyBtn = document.getElementById('replyBtn');
    if (bottomArea) bottomArea.style.display = 'none';
    if (rerollBtn) rerollBtn.style.display = 'none';
    if (messageInput) messageInput.style.display = 'none';
    if (replyBtn) replyBtn.style.display = 'none';
}

    // ===== 模拟接通（接通等待） =====
    function startConnecting() {
        if (isConnected) return;
        isConnecting = true;
        connectStartTime = Date.now();
        callStatus.textContent = '接通中...';
        hangupBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="white"><path d="M20 15.5c-1.2 0-2.4-.2-3.6-.6-.3-.1-.7 0-1 .2l-2.2 2.2c-2.8-1.4-5.1-3.8-6.6-6.6l2.2-2.2c.3-.3.4-.7.2-1-.4-1.2-.6-2.4-.6-3.6 0-.6-.4-1-1-1H4c-.6 0-1 .4-1 1 0 9.4 7.6 17 17 17 .6 0 1-.4 1-1v-3.5c0-.6-.4-1-1-1z"/></svg>';

        // 模拟 1.5-3 秒后接通
const delay = 1500 + Math.random() * 1500;
if (connectTimer) clearTimeout(connectTimer);
connectTimer = setTimeout(function() {
    if (isConnecting) {
        isConnecting = false;
        isConnected = true;
        callStatus.textContent = '00:00';
        hangupBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="white"><path d="M20 15.5c-1.2 0-2.4-.2-3.6-.6-.3-.1-.7 0-1 .2l-2.2 2.2c-2.8-1.4-5.1-3.8-6.6-6.6l2.2-2.2c.3-.3.4-.7.2-1-.4-1.2-.6-2.4-.6-3.6 0-.6-.4-1-1-1H4c-.6 0-1 .4-1 1 0 9.4 7.6 17 17 17 .6 0 1-.4 1-1v-3.5c0-.6-.4-1-1-1z"/></svg>';
        startTimer();
        // ✅ 改为屏幕中央小字提示
        showToast('通话已接通');
        // ===== 接通后显示输入栏 =====
        showInputArea();
        console.log('[语音电话] 已接通');
    }
}, delay);
    }

    // ===== 屏幕中央小字提示 =====
function showToast(text) {
    // 移除已有 toast
    const oldToast = document.querySelector('.call-toast');
    if (oldToast) oldToast.remove();
    
    const toast = document.createElement('div');
    toast.className = 'call-toast';
    toast.textContent = text;
    document.body.appendChild(toast);
    
    // 2.5 秒后自动消失
    setTimeout(function() {
        if (toast.parentNode) toast.remove();
    }, 2500);
}

    // ===== 更新分隔线 =====
    function makeDateDividerText(d) {
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        return d.getFullYear() + '年' +
               String(d.getMonth() + 1).padStart(2, '0') + '月' +
               String(d.getDate()).padStart(2, '0') + '日 星期' + weekdays[d.getDay()];
    }

    // ===== 创建消息元素 =====
    function createMessageEl(msg) {
        const el = document.createElement('div');
        el.className = 'message ' + (msg.isUser ? 'msg-user' : 'msg-api');
        el.dataset.id = msg.id;

        const check = document.createElement('div');
        check.className = 'msg-select';
        check.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>';
        el.appendChild(check);

        const textSpan = document.createElement('span');
        textSpan.className = 'msg-text';
        if (msg.recalled) {
            el.classList.add('recalled');
            textSpan.textContent = msg.isUser ? '你撤回了一条消息' : (contactNameParam + ' 撤回了一条消息');
        } else {
            textSpan.textContent = msg.text;
        }
        el.appendChild(textSpan);

        if (multiSelectMode) el.classList.add('multi-select-on');
        if (selectedIds.indexOf(msg.id) !== -1) {
            el.classList.add('selected');
            if (check) check.classList.add('checked');
        }

        el.addEventListener('dblclick', function(e) {
            if (multiSelectMode) return;
            e.stopPropagation();
            openMsgMenu(e, msg.id);
        });
        el.addEventListener('click', function(e) {
            if (multiSelectMode) {
                e.stopPropagation();
                toggleSelect(msg.id, el);
            }
        });
        return el;
    }

    // ===== 渲染消息 =====
    function renderMessages(msgList) {
        const children = chatArea.children;
        const toRemove = [];
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (child !== typingIndicator) {
                toRemove.push(child);
            }
        }
        toRemove.forEach(function(el) { el.remove(); });

        msgList.sort(function(a, b) { return a.time - b.time; });

        let lastDate = null;
        msgList.forEach(function(msg) {
            const d = new Date(msg.time);
            const dateKey = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
            if (dateKey !== lastDate) {
                const div = document.createElement('div');
                div.className = 'time-divider';
                div.textContent = makeDateDividerText(d);
                chatArea.insertBefore(div, typingIndicator);
                lastDate = dateKey;
            }
            const el = createMessageEl(msg);
            chatArea.insertBefore(el, typingIndicator);
        });
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    // ===== 添加消息 =====
    function addMessage(text, isUser) {
        const msg = { id: genMsgId(), text: text, isUser: isUser, time: Date.now(), recalled: false };
        messages.push(msg);
        saveMessageObj(msg);

        const now = new Date();
        let hasToday = false;
        const dividers = chatArea.querySelectorAll('.time-divider');
        dividers.forEach(function(d) {
            if (d.textContent.includes(now.getFullYear() + '年')) hasToday = true;
        });

        if (!hasToday) {
            const div = document.createElement('div');
            div.className = 'time-divider';
            div.textContent = makeDateDividerText(now);
            chatArea.insertBefore(div, typingIndicator);
        }

        const el = createMessageEl(msg);
        chatArea.insertBefore(el, typingIndicator);
        chatArea.scrollTop = chatArea.scrollHeight;

        // 角色在通话里说的话：若配置了 TTS，就合成语音播出来
        if (!isUser && window.NanoTTS && text && text.indexOf('出错了') !== 0) {
            try { window.NanoTTS.speak(text); } catch (e) {}
        }
    }

    // ===== 消息操作菜单 & 多选 =====
    function openMsgMenu(e, msgId) {
        menuTargetId = msgId;
        msgMenu.classList.add('active');
        // 测量菜单尺寸并限制在屏幕内，避免短消息靠边时菜单被截断
        msgMenu.style.visibility = 'hidden';
        const rect = msgMenu.getBoundingClientRect();
        const menuW = rect.width;
        const menuH = rect.height;
        const margin = 8;
        let left = e.clientX;
        let top = e.clientY;
        if (left + menuW > window.innerWidth - margin) {
            left = window.innerWidth - menuW - margin;
        }
        if (top + menuH > window.innerHeight - margin) {
            top = window.innerHeight - menuH - margin;
        }
        if (left < margin) left = margin;
        if (top < margin) top = margin;
        msgMenu.style.left = left + 'px';
        msgMenu.style.top = top + 'px';
        msgMenu.style.visibility = '';
    }

    function closeMsgMenu() {
        msgMenu.classList.remove('active');
        menuTargetId = null;
    }

    function findMsg(id) {
        return messages.find(function(m) { return m.id === id; });
    }

    function deleteMsgById(id) {
        messages = messages.filter(function(m) { return m.id !== id; });
        deleteMessageById(id);
        renderMessages(messages);
    }

    function recallMsg(id) {
        const idx = messages.findIndex(function(m) { return m.id === id; });
        if (idx === -1) return;
        const msg = messages[idx];
        msg.recalled = true;
        msg.text = '';
        messages[idx] = msg;
        saveMessageObj(msg);
        renderMessages(messages);
    }

    function editMsg(id) {
        const msg = findMsg(id);
        if (!msg || msg.recalled) return;
        const newText = prompt('编辑消息', msg.text);
        if (newText === null) return;
        msg.text = newText;
        saveMessageObj(msg);
        renderMessages(messages);
    }

    function enterMultiSelect(firstId) {
        multiSelectMode = true;
        selectedIds = [];
        if (firstId) selectedIds.push(firstId);
        msBar.classList.add('active');
        closeMsgMenu();
        renderMessages(messages);
        updateMsCount();
    }

    function exitMultiSelect() {
        multiSelectMode = false;
        selectedIds = [];
        msBar.classList.remove('active');
        renderMessages(messages);
    }

    function toggleSelect(id, el) {
        const idx = selectedIds.indexOf(id);
        if (idx === -1) {
            selectedIds.push(id);
            el.classList.add('selected');
            const c = el.querySelector('.msg-select');
            if (c) c.classList.add('checked');
        } else {
            selectedIds.splice(idx, 1);
            el.classList.remove('selected');
            const c = el.querySelector('.msg-select');
            if (c) c.classList.remove('checked');
        }
        updateMsCount();
    }

    function updateMsCount() {
        if (msCount) msCount.textContent = '已选 ' + selectedIds.length + ' 条';
    }

    function batchDeleteSelected() {
        if (selectedIds.length === 0) return;
        messages = messages.filter(function(m) { return selectedIds.indexOf(m.id) === -1; });
        deleteMessagesByIds(selectedIds.slice());
        selectedIds = [];
        renderMessages(messages);
        exitMultiSelect();
    }

    // ===== 打字指示器 =====
    function showTyping() {
        typingIndicator.classList.add('active');
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    function hideTyping() {
        typingIndicator.classList.remove('active');
    }

    // ===== 读取 API 配置 =====
    function getApiConfig() {
        try {
            const raw = localStorage.getItem('nano_api_config');
            if (raw) {
                const config = JSON.parse(raw);
                if (config.mainUrl && config.mainKey && config.mainModel) return config;
            }
        } catch (e) {}
        return null;
    }

    // ===== 获取本轮所有用户消息 =====
    function getUserMessagesForTurn() {
        const userMsgs = [];
        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            if (!msg.isUser) break;
            userMsgs.unshift(msg.text);
        }
        return userMsgs;
    }

    // ===== 读取聊天详情页记忆 =====
    function loadChatInnerMemory() {
        return new Promise(function(resolve) {
            try {
                if (typeof localforage !== 'undefined') {
                    localforage.getItem('chat_messages_' + chatId).then(function(data) {
                        if (data && Array.isArray(data) && data.length > 0) resolve(data);
                        else resolve([]);
                    }).catch(function() { resolve([]); });
                } else {
                    try {
                        const data = JSON.parse(localStorage.getItem('chat_messages_' + chatId) || '[]');
                        resolve(Array.isArray(data) ? data : []);
                    } catch (e) { resolve([]); }
                }
            } catch (e) { resolve([]); }
        });
    }

    function callApi(userMessages, history) {
        const config = getApiConfig();
        if (!config) {
            return Promise.resolve('请先在 API 页面配置主 API');
        }

        return loadChatInnerMemory().then(function(chatMemory) {
            try {
                let baseUrl = config.mainUrl.trim();
                if (!baseUrl.endsWith('/v1')) {
                    baseUrl = baseUrl.endsWith('/') ? baseUrl + 'v1' : baseUrl + '/v1';
                }
                const key = config.mainKey.trim();
                const model = config.mainModel;

                const historyMessages = [];
                historyMessages.push({ role: 'system', content: buildSystemPrompt() });

                const memorySlice = (chatMemory || []).slice(-10);
                memorySlice.forEach(function(m) {
                    if (!m.recalled && m.text && m.text.trim()) {
                        historyMessages.push({
                            role: m.type === 'right' ? 'user' : 'assistant',
                            content: m.text
                        });
                    }
                });

                let skipCount = userMessages.length;
                let historyCount = 0;
                for (let i = history.length - 1; i >= 0 && historyCount < 8; i--) {
                    const msg = history[i];
                    if (skipCount > 0 && msg.isUser) {
                        skipCount--;
                        continue;
                    }
                    historyMessages.push({
                        role: msg.isUser ? 'user' : 'assistant',
                        content: msg.text
                    });
                    historyCount++;
                }

                const combinedUserMsg = userMessages.join('\n');
                historyMessages.push({ role: 'user', content: combinedUserMsg });

                return fetch(baseUrl + '/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Bearer ' + key,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: historyMessages,
                        max_tokens: 500,
                        temperature: 0.85
                    })
                }).then(function(response) {
                    if (!response.ok) {
                        return response.json().then(function(errData) {
                            throw new Error(errData.error?.message || 'HTTP ' + response.status);
                        }).catch(function() {
                            throw new Error('HTTP ' + response.status);
                        });
                    }
                    return response.json();
                }).then(function(data) {
                    return data.choices?.[0]?.message?.content || '抱歉，我没有收到回复。';
                });
            } catch (error) {
                return '出错了：' + error.message;
            }
        });
    }

    // ===== 发送用户消息（仅发送，不调用 API） =====
    function sendUserMessage() {
        const text = messageInput.value.trim();
        if (!text || isWaiting) return;
        addMessage(text, true);
        messageInput.value = '';
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    // ===== 点击回复按钮 - 调用 API =====
    function triggerReply() {
        if (isWaiting) return;

        const userMsgs = getUserMessagesForTurn();

        isWaiting = true;
        replyBtn.classList.add('loading');
        showTyping();

        callApi(userMsgs, messages).then(function(reply) {
            hideTyping();
            addMessage(reply, false);
            isWaiting = false;
            replyBtn.classList.remove('loading');
        }).catch(function(err) {
            hideTyping();
            addMessage('出错了：' + err.message, false);
            isWaiting = false;
            replyBtn.classList.remove('loading');
        });
    }

    // ===== 重roll =====
    function handleReroll() {
        if (isWaiting) return;

        let lastAIIndex = -1;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (!messages[i].isUser) {
                lastAIIndex = i;
                break;
            }
        }

        if (lastAIIndex === -1) {
            triggerReply();
            return;
        }

        const allMsgs = chatArea.querySelectorAll('.message.msg-api');
        if (allMsgs.length > 0) {
            const last = allMsgs[allMsgs.length - 1];
            if (last) last.remove();
        }
        const aiMsg = messages[lastAIIndex];
        messages = messages.filter(function(m, idx) {
            return idx !== lastAIIndex;
        });
        if (aiMsg && aiMsg.id) {
            deleteMessageById(aiMsg.id);
        }

        triggerReply();
    }

    // ===== 背景切换 =====
    function setBg(color) {
        currentBg = color;
        customBg = null;
        document.body.style.background = color;
        document.body.style.backgroundImage = 'none';
        saveBg(color);

        document.querySelectorAll('.bg-option').forEach(function(el) {
            if (el.tagName !== 'LABEL') {
                el.classList.toggle('active', el.dataset.bg === color);
            }
        });
    }

    function setCustomBg(imageData) {
        customBg = imageData;
        document.body.style.backgroundImage = 'url(' + imageData + ')';
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
        document.body.style.backgroundRepeat = 'no-repeat';
        document.body.style.backgroundColor = 'transparent';
        saveBg(imageData);

        document.querySelectorAll('.bg-option').forEach(function(el) {
            if (el.tagName !== 'LABEL') {
                el.classList.remove('active');
            }
        });
    }

    // ===== 同步计时 =====
    function syncTimeFromParent(seconds) {
        if (seconds !== undefined && seconds > 0) {
            callSeconds = seconds;
            updateCallStatus();
        }
    }

    // ===== 发送语音通话卡片 =====
    function sendVoiceCallCard(missed) {
        var messagesForCard = [];
        for (var i = 0; i < messages.length; i++) {
            var m = messages[i];
            // 跳过系统消息（如"📞 通话已接通"）
            if (!m.recalled && m.text && m.text.trim() && !m.text.includes('📞 通话已接通')) {
                messagesForCard.push({
                    text: m.text,
                    isUser: m.isUser
                });
            }
        }

        var callId = 'call_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

        if (window.parent !== window) {
            window.parent.postMessage({
                type: 'NANO_VOICE_CALL_CARD',
                chatId: chatId,
                callId: callId,
                duration: missed ? 0 : callSeconds,
                missed: missed || false,
                incoming: isIncoming,
                messages: messagesForCard
            }, '*');
            console.log('[语音电话] 已发送通话卡片，类型:', missed ? '未接通' : '已接通', '来电:', isIncoming, '消息数:', messagesForCard.length);
        }
    }

    // ===== 来电界面 =====
    function startIncomingUI() {
        if (incomingActions) incomingActions.classList.add('active');
        if (hangupWrapper) hangupWrapper.style.display = 'none';
    }

    function stopIncomingUI() {
        if (incomingActions) incomingActions.classList.remove('active');
        if (hangupWrapper) hangupWrapper.style.display = '';
    }

    // ===== 初始化 =====
    function init() {
    updateCallStatus();

    loadBg().then(function(bg) {
        if (bg) {
            if (bg.startsWith('data:image') || bg.startsWith('http')) {
                customBg = bg;
                document.body.style.backgroundImage = 'url(' + bg + ')';
                document.body.style.backgroundSize = 'cover';
                document.body.style.backgroundPosition = 'center';
                document.body.style.backgroundRepeat = 'no-repeat';
                document.body.style.backgroundColor = 'transparent';
                document.querySelectorAll('.bg-option').forEach(function(el) {
                    if (el.tagName !== 'LABEL') el.classList.remove('active');
                });
            } else {
                setBg(bg);
            }
        }
    });

    // ===== 每次新建通话，不加载旧消息 =====
    messages = [];
    renderMessages([]);
    // ===== 初始隐藏输入栏 =====
    hideInputArea();
    if (isIncoming) {
        // AI 主动来电：显示接听/挂断界面，等待用户应答
        callStatus.textContent = '等待你接通...';
        startIncomingUI();
    } else {
        startConnecting();
    }
}
init();

    // ===== 事件绑定 =====
    messageInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendUserMessage();
        }
    });

    replyBtn.addEventListener('click', triggerReply);
    rerollBtn.addEventListener('click', handleReroll);

    // ===== 挂断按钮 =====
    hangupBtn.addEventListener('click', function() {
        // 停止计时器
        clearInterval(callTimer);
        callTimer = null;

        // 清除接通等待定时器
        if (connectTimer) {
            clearTimeout(connectTimer);
            connectTimer = null;
        }

        var missed = !isConnected && isConnecting;

        // ===== 发送语音通话卡片 =====
        sendVoiceCallCard(missed);

        // 清除存储的计时
        try {
            localStorage.removeItem('voice_call_seconds_' + chatId);
        } catch (e) {}

        if (window.parent !== window) {
            window.parent.postMessage({ type: 'voiceCallEnded' }, '*');
        } else {
            history.back();
        }
    });

    // ===== 来电接听 / 拒接 =====
    if (answerBtn) {
        answerBtn.addEventListener('click', function() {
            if (isConnecting || isConnected) return;
            stopIncomingUI();
            startConnecting();
        });
    }
    if (declineBtn) {
        declineBtn.addEventListener('click', function() {
            if (isConnecting || isConnected) return;
            // 拒接 -> 记为未接，发送通话卡片并结束
            sendVoiceCallCard(true);
            try { localStorage.removeItem('voice_call_seconds_' + chatId); } catch (e) {}
            if (window.parent !== window) {
                window.parent.postMessage({ type: 'voiceCallEnded' }, '*');
            } else {
                history.back();
            }
        });
    }

    // ===== 缩小按钮 =====
    minimizeBtn.addEventListener('click', function() {
        isMinimized = true;
        if (window.parent !== window) {
            window.parent.postMessage({
                type: 'minimizeVoiceCall',
                seconds: callSeconds
            }, '*');
        }
    });

    // ===== 背景面板 =====
    bgBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        bgPanel.classList.toggle('active');
        this.classList.toggle('active');
    });

    document.addEventListener('click', function(e) {
        if (!e.target.closest('.bg-panel') && !e.target.closest('.btn-bg')) {
            bgPanel.classList.remove('active');
            bgBtn.classList.remove('active');
        }
        if (!e.target.closest('.msg-menu')) {
            closeMsgMenu();
        }
    });

    // ===== 消息菜单 & 多选 =====
    document.querySelectorAll('.msg-menu-item').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const action = this.dataset.action;
            const msg = findMsg(menuTargetId);
            closeMsgMenu();
            if (!msg) return;
            if (action === 'delete') {
                deleteMsgById(msg.id);
            } else if (action === 'recall') {
                recallMsg(msg.id);
            } else if (action === 'edit') {
                editMsg(msg.id);
            } else if (action === 'multiselect') {
                enterMultiSelect(msg.id);
            }
        });
    });

    if (msCancel) {
        msCancel.addEventListener('click', function() {
            exitMultiSelect();
        });
    }
    if (msDeleteBtn) {
        msDeleteBtn.addEventListener('click', function() {
            batchDeleteSelected();
        });
    }

    document.querySelectorAll('.bg-option:not(.bg-upload)').forEach(function(el) {
        el.addEventListener('click', function() {
            setBg(this.dataset.bg);
            bgPanel.classList.remove('active');
            bgBtn.classList.remove('active');
        });
    });

    bgUploadInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(evt) {
            setCustomBg(evt.target.result);
            bgPanel.classList.remove('active');
            bgBtn.classList.remove('active');
        };
        reader.readAsDataURL(file);
        this.value = '';
    });

    // ===== 监听父页面消息 =====
    window.addEventListener('message', function(event) {
        const data = event.data;
        if (!data) return;

        if (data.type === 'restoreVoiceCall') {
            isMinimized = false;
            isRestoring = true;
            if (data.seconds !== undefined && data.seconds > 0) {
                callSeconds = data.seconds;
                updateCallStatus();
            }
            isRestoring = false;
        }
    });

    // ===== 页面可见性变化 =====
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden) {
            updateCallStatus();
        }
    });

    // ===== 暴露 API =====
    window.__voiceCall = {
        addMessage: addMessage,
        sendUserMessage: sendUserMessage,
        triggerReply: triggerReply,
        handleReroll: handleReroll,
        setBg: setBg,
        setCustomBg: setCustomBg,
        get messages() { return messages; },
        getCallSeconds: function() { return callSeconds; },
        syncTime: syncTimeFromParent,
        isConnected: function() { return isConnected; },
        isConnecting: function() { return isConnecting; }
    };

    console.log('[语音电话] 已加载，消息数:', messages.length, '计时:', callSeconds);
})();