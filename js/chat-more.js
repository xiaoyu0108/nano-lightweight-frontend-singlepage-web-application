// ============================================================
// 更多菜单（底部 + 号菜单）- 使用 IndexedDB
// ============================================================
(function() {
    'use strict';

    const moreBtn = document.getElementById('moreBtn');
    const moreOverlay = document.getElementById('moreOverlay');
    const IS_NANO = (function () { try { return new URLSearchParams(location.search).get('chat') === 'nano_ai'; } catch (e) { return false; } })();

    // ===== 默认菜单配置（viewBox 0 0 24 24，stroke-width 2.5） =====
    const DEFAULT_MENU_ITEMS = [
        {
            id: 'reroll',
            label: '重roll',
            icon: '<path d="M21 12a9 9 0 1 1-9-9m0 0v6m0-6h-6"/>',
            color: '#007AFF'
        },
        {
            id: 'transfer',
            label: '转账',
            icon: '<path d="M17 3l4 4-4 4"/><path d="M21 7H7"/><path d="M7 21l-4-4 4-4"/><path d="M3 17h14"/>',
            color: '#34C759'
        },
        {
            id: 'image',
            label: '图片',
            icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5-5 5-3-3-5 5"/>',
            color: '#FF9500'
        },
        {
            id: 'gift',
            label: '礼物',
            icon: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
            color: '#FF2D55'
        },
        {
            id: 'voicecall',
            label: '语音电话',
            icon: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
            color: '#5856D6'
        },
        {
            id: 'memory',
            label: '记忆',
            fa: 'fa-brain',
            icon: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
            color: '#00B8A9'
        },
        {
            id: 'offline',
            label: '线下',
            fa: 'fa-map-marker-alt',
            icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
            color: '#5B6CFF'
        },
    ];

    // 旧版本曾加入过「接收/结束一起听」，这里移除，避免老用户菜单里残留
    const REMOVED_MENU_IDS = ['listen-accept', 'listen-end'];

    // ===== IndexedDB 操作 =====
    const DB_NAME = 'nano_chat_menu_db';
    const STORE_NAME = 'menu_items';
    const DB_VERSION = 1;

    function openDB() {
        return new Promise(function(resolve, reject) {
            try {
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onupgradeneeded = function(e) {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    }
                };
                request.onsuccess = function(e) {
                    resolve(e.target.result);
                };
                request.onerror = function(e) {
                    reject(e.target.error);
                };
            } catch (e) {
                reject(e);
            }
        });
    }

    function saveMenuItems(items) {
        return openDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                const clearReq = store.clear();
                clearReq.onsuccess = function() {
                    items.forEach(function(item) {
                        store.put(item);
                    });
                    resolve();
                };
                clearReq.onerror = function(e) {
                    reject(e.target.error);
                };
                tx.oncomplete = function() {
                    db.close();
                };
                tx.onerror = function(e) {
                    reject(e.target.error);
                };
            });
        });
    }

    function loadMenuItems() {
        return openDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const getAll = store.getAll();
                getAll.onsuccess = function() {
                    let items = getAll.result;
                    db.close();
                    if (items && items.length > 0) {
                        // 移除已废弃的菜单项
                        items = items.filter(function(it) {
                            return REMOVED_MENU_IDS.indexOf(it && it.id) === -1;
                        });
                        // 迁移：内置的“记忆/线下”统一使用群聊同款图标
                        items = items.map(function(it) {
                            const d = DEFAULT_MENU_ITEMS.find(function(x) { return x.id === it.id; });
                            if (d && d.fa) { it.fa = d.fa; it.icon = d.icon; it.color = d.color; }
                            return it;
                        });
                        // 补齐新增的内置菜单项（如一起听），保证老用户也能看到
                        const have = {};
                        items.forEach(function(it) { have[it.id] = true; });
                        DEFAULT_MENU_ITEMS.forEach(function(d) {
                            if (!have[d.id]) items.push(d);
                        });
                        saveMenuItems(items).catch(function() {});
                        resolve(items);
                    } else {
                        saveMenuItems(DEFAULT_MENU_ITEMS).then(function() {
                            resolve(DEFAULT_MENU_ITEMS);
                        }).catch(function() {
                            resolve(DEFAULT_MENU_ITEMS);
                        });
                    }
                };
                getAll.onerror = function(e) {
                    db.close();
                    resolve(DEFAULT_MENU_ITEMS);
                };
            });
        }).catch(function() {
            return DEFAULT_MENU_ITEMS;
        });
    }

    // ===== 渲染菜单 =====
    function renderMenu(items) {
        moreOverlay.innerHTML = '';
        // 重roll 始终排第一个
        items = (items || []).slice().sort(function(a, b) {
            if (a && a.id === 'reroll') return -1;
            if (b && b.id === 'reroll') return 1;
            return 0;
        });
        // 纳米助手：加号菜单里加入「发送文件」
        if (IS_NANO && !items.some(function (it) { return it && it.id === 'file'; })) {
            items.push({
                id: 'file', label: '文件',
                icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6"/><path d="M9 17h6"/>',
                color: '#FF4D94'
            });
        }
        items.forEach(function(item) {
            const btn = document.createElement('button');
            btn.className = 'more-item';
            btn.dataset.action = item.id;
            const iconHTML = item.fa
                ? `<i class="fas ${item.fa}"></i>`
                : `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        ${item.icon}
                    </svg>`;
            btn.innerHTML = `
                <span class="mi-icon" style="background:${item.color};color:#fff;">
                    ${iconHTML}
                </span>
                <span class="mi-label">${item.label}</span>
            `;
            btn.addEventListener('click', function(e) {
                handleAction(item.id);
            });
            moreOverlay.appendChild(btn);
        });
    }

    // ===== 纳米助手：发送文件 =====
    function loadMammothForNano() {
        return new Promise(function (res) {
            if (window.mammoth) return res(true);
            var s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js';
            s.onload = function () { res(!!window.mammoth); };
            s.onerror = function () { res(false); };
            document.head.appendChild(s);
        });
    }
    function readNanoFile(file) {
        var lower = file.name.toLowerCase();
        if (lower.endsWith('.docx')) {
            return loadMammothForNano().then(function (ok) {
                if (!ok) throw new Error('docx 解析库加载失败');
                return file.arrayBuffer().then(function (buf) { return window.mammoth.extractRawText({ arrayBuffer: buf }); })
                    .then(function (r) { return (r && r.value) || ''; });
            });
        }
        return file.text();
    }
    function pickFileForNano() {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = '.txt,.json,.docx,.md,.csv';
        input.style.display = 'none';
        input.addEventListener('change', async function () {
            var f = input.files[0];
            if (!f) { input.remove(); return; }
            try {
                var text = await readNanoFile(f);
                if (window.__chat && window.__chat.sendFileContent) window.__chat.sendFileContent(f.name, text);
            } catch (e) {
                try { window.__chat.showAlert('读取失败', String((e && e.message) || e)); } catch (err) {}
            }
            input.remove();
        });
        document.body.appendChild(input);
        input.click();
    }

    // ===== 处理动作 =====
    function handleAction(action) {
        moreOverlay.classList.remove('active');

        switch (action) {
            case 'reroll':
                handleReroll();
                break;
            case 'file':
                pickFileForNano();
                break;
            case 'transfer':
                document.getElementById('transferAmount').value = '';
                document.getElementById('transferNote').value = '';
                document.getElementById('transferPopup').classList.add('active');
                setTimeout(function() {
                    document.getElementById('transferAmount').focus();
                }, 100);
                break;
            case 'gift':
                document.getElementById('giftNameInput').value = '';
                document.getElementById('giftNoteInput').value = '';
                document.getElementById('giftPopup').classList.add('active');
                setTimeout(function() {
                    document.getElementById('giftNameInput').focus();
                }, 100);
                break;
            case 'image':
                document.getElementById('imagePreviewBox').style.display = 'none';
                document.getElementById('imagePreview').src = '';
                document.getElementById('imageTextInput').value = '';
                document.getElementById('imageFileInput').value = '';
                document.getElementById('imagePopup').classList.add('active');
                break;
            case 'voicecall':
                if (window.parent !== window) {
                    // 带上当前 chat 的信息，确保人设/头像/记忆同步
                    let qs = '';
                    try {
                        const sp = new URLSearchParams(window.location.search);
                        const cid = sp.get('chat');
                        const nm = sp.get('name');
                        if (cid) qs += 'chat=' + encodeURIComponent(cid);
                        if (nm) qs += (qs ? '&' : '') + 'name=' + encodeURIComponent(nm);
                    } catch (e) {}
                    window.parent.postMessage({
                        type: 'openFullscreen',
                        url: 'voice-call.html' + (qs ? '?' + qs : ''),
                        title: '语音电话',
                        source: 'chat_inner'
                    }, '*');
                }
                break;
            case 'memory':
                if (window.parent !== window) {
                    let qs = '';
                    try {
                        const sp = new URLSearchParams(window.location.search);
                        const cid = sp.get('chat');
                        const nm = sp.get('name');
                        if (cid) qs += 'chat=' + encodeURIComponent(cid);
                        if (nm) qs += (qs ? '&' : '') + 'name=' + encodeURIComponent(nm);
                    } catch (e) {}
                    window.parent.postMessage({
                        type: 'openFullscreen',
                        url: 'memory.html' + (qs ? '?' + qs : ''),
                        title: '记忆',
                        source: 'chat_inner'
                    }, '*');
                }
                break;
            case 'offline':
                if (window.parent !== window) {
                    let qs2 = '';
                    try {
                        const sp = new URLSearchParams(window.location.search);
                        const cid = sp.get('chat');
                        const nm = sp.get('name');
                        if (cid) qs2 += 'chat=' + encodeURIComponent(cid);
                        if (nm) qs2 += (qs2 ? '&' : '') + 'name=' + encodeURIComponent(nm);
                    } catch (e) {}
                    window.parent.postMessage({
                        type: 'openFullscreen',
                        url: 'offline.html' + (qs2 ? '?' + qs2 : ''),
                        title: '线下',
                        source: 'chat_inner'
                    }, '*');
                } else {
                    window.location.href = 'offline.html';
                }
                break;
            case 'heart':
                window.__chat.showAlert('提示', '心声功能开发中...');
                break;
            case 'emoji':
                if (window.parent !== window) {
                    window.parent.postMessage({
                        type: 'openBottomSheet',
                        url: 'emoji.html'
                    }, '*');
                }
                break;
            case 'recorder':
                window.__chat.showAlert('提示', '语音录制功能开发中...');
                break;
            default:
                console.warn('[More] 未知动作:', action);
        }
    }

    // ===== 重roll =====
    function handleReroll() {
        const chat = window.__chat;
        const messages = chat.messages;

        if (!messages || messages.length === 0) {
            chat.showAlert('提示', '没有可重roll的消息');
            return;
        }

        let lastAIIndex = -1;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].type === 'left' && !messages[i].recalled) {
                lastAIIndex = i;
                break;
            }
        }

        if (lastAIIndex === -1) {
            chat.showAlert('提示', '没有可重roll的消息');
            return;
        }

        let startIndex = lastAIIndex;
        for (let i = lastAIIndex - 1; i >= 0; i--) {
            if (messages[i].type === 'left' && !messages[i].recalled) {
                startIndex = i;
            } else {
                break;
            }
        }

        const idsToRemove = [];
        for (let i = startIndex; i <= lastAIIndex; i++) {
            idsToRemove.push(messages[i].id);
        }

        const remaining = messages.filter(m => !idsToRemove.includes(m.id));
        messages.length = 0;
        messages.push(...remaining);

        chat.renderMessages();
        chat.saveMessages();

        let lastUserMsg = null;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].type === 'right' && !messages[i].recalled) {
                lastUserMsg = messages[i];
                break;
            }
        }

        if (lastUserMsg) {
            setTimeout(function() {
                chat.triggerReply();
            }, 300);
        } else {
            chat.showAlert('提示', '没有找到用户消息');
        }
    }

    // ===== 事件绑定 =====
    moreBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        moreOverlay.classList.toggle('active');
    });

    document.addEventListener('click', function(e) {
        if (!e.target.closest('.more-overlay') && !e.target.closest('.more-btn')) {
            moreOverlay.classList.remove('active');
        }
    });

    moreOverlay.addEventListener('click', function(e) {
        e.stopPropagation();
    });

    // ===== 启动：从 IndexedDB 加载菜单 =====
    loadMenuItems().then(function(items) {
        renderMenu(items);
        console.log('[More] 菜单已加载，共 ' + items.length + ' 项');
    }).catch(function(err) {
        console.error('[More] 加载菜单失败:', err);
        renderMenu(DEFAULT_MENU_ITEMS);
    });

    // ===== 暴露 API =====
    window.__moreMenu = {
        loadMenuItems: loadMenuItems,
        saveMenuItems: saveMenuItems,
        renderMenu: renderMenu,
        DEFAULT_MENU_ITEMS: DEFAULT_MENU_ITEMS
    };

})();