// ============================================================
// inner-setting.js - 聊天设置页面逻辑
// ============================================================
(function() {
    'use strict';

    function getQueryParam(name) {
        var urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    }

    var chatId = getQueryParam('chat');
    var chatName = getQueryParam('name');
    var chatAvatar = getQueryParam('avatar');


    if (!chatId || !chatName || !chatAvatar) {
        try {
            var info = JSON.parse(sessionStorage.getItem('inner_setting_info') || 'null');
            if (info) {
                if (!chatId) chatId = info.chatId;
                if (!chatName) chatName = info.name;
                if (!chatAvatar) chatAvatar = info.avatar;
            }
        } catch(e) {}
    }
    chatId = chatId || 'default';
    chatName = chatName || '聊天';
    chatAvatar = chatAvatar || '';

    function getStorageKey(suffix) {
        return 'chat_setting_' + suffix + '_' + chatId;
    }

    function getSetting(key, defaultVal) {
        try {
            var val = localStorage.getItem(getStorageKey(key));
            if (val === null) return defaultVal;
            try { return JSON.parse(val); } catch(e) { return val; }
        } catch(e) { return defaultVal; }
    }

    function setSetting(key, val) {
        try {
            localStorage.setItem(getStorageKey(key), JSON.stringify(val));
        } catch(e) {}
        if (typeof localforage !== 'undefined') {
            localforage.setItem(getStorageKey(key), val).catch(function(err) {});
        }
    }

    // ===== DOM 引用 =====
    var displayNickname = document.getElementById('displayNickname');
    var displayUserId = document.getElementById('displayUserId');
    var avatarPlaceholder = document.getElementById('avatarPlaceholder');
    var avatarImage = document.getElementById('avatarImage');

    var remarkPreview = document.getElementById('remarkPreview');
    var remarkInput = document.getElementById('remarkInput');
    var remarkModal = document.getElementById('remarkModal');
    var remarkCancel = document.getElementById('remarkCancel');
    var remarkConfirm = document.getElementById('remarkConfirm');

    var cotPreview = document.getElementById('cotPreview');
    var cotInput = document.getElementById('cotInput');
    var cotModal = document.getElementById('cotModal');
    var cotCancel = document.getElementById('cotCancel');
    var cotConfirm = document.getElementById('cotConfirm');

    var bgDisplay = document.getElementById('bgDisplay');
    var bgPreviewBox = document.getElementById('bgPreviewBox');
    var bgModal = document.getElementById('bgModal');
    var bgUpload = document.getElementById('bgUpload');
    var bgCancel = document.getElementById('bgCancel');
    var bgConfirm = document.getElementById('bgConfirm');
    var bgReset = document.getElementById('bgReset');

    var timeToggle = document.getElementById('timeToggle');
    var timeStatus = document.getElementById('timeStatus');

    var searchInput = document.getElementById('searchInput');
    var searchResults = document.getElementById('searchResults');
    var searchModal = document.getElementById('searchModal');
    var searchClose = document.getElementById('searchClose');

    var promptStatus = document.getElementById('promptStatus');
    var promptInput = document.getElementById('promptInput');
    var promptModal = document.getElementById('promptModal');
    var promptCancel = document.getElementById('promptCancel');
    var promptConfirm = document.getElementById('promptConfirm');

    var faceStatus = document.getElementById('faceStatus');
    var facePreviewBox = document.getElementById('facePreviewBox');
    var faceModal = document.getElementById('faceModal');
    var faceUpload = document.getElementById('faceUpload');
    var faceCancel = document.getElementById('faceCancel');
    var faceConfirm = document.getElementById('faceConfirm');

    var clearModal = document.getElementById('clearModal');
    var clearCancel = document.getElementById('clearCancel');
    var clearConfirm = document.getElementById('clearConfirm');

    // ===== 主动功能 =====
    var autoMsgToggle = document.getElementById('autoMsgToggle');
    var autoMsgStatus = document.getElementById('autoMsgStatus');
    var autoMsgIntervalItem = document.getElementById('autoMsgIntervalItem');
    var autoMsgInterval = document.getElementById('autoMsgInterval');

    var autoMomentToggle = document.getElementById('autoMomentToggle');
    var autoMomentStatus = document.getElementById('autoMomentStatus');
    var autoMomentIntervalItem = document.getElementById('autoMomentIntervalItem');
    var autoMomentInterval = document.getElementById('autoMomentInterval');

    var allowImageToggle = document.getElementById('allowImageToggle');
    var allowImageStatus = document.getElementById('allowImageStatus');

    var allowMomentImageToggle = document.getElementById('allowMomentImageToggle');
    var allowMomentImageStatus = document.getElementById('allowMomentImageStatus');
    var momentImageFreqItem = document.getElementById('momentImageFreqItem');
    var momentImageFreq = document.getElementById('momentImageFreq');

    // ===== 加载信息 =====
    function loadInfo() {
        var remark = getSetting('remark', '');
        if (remark) {
            displayNickname.textContent = remark;
            remarkPreview.textContent = remark;
        } else {
            displayNickname.textContent = chatName || '未知';
            remarkPreview.textContent = '未设置';
        }

        displayUserId.textContent = 'ID: ' + chatId;

        var cotVal = getSetting('cotPrompt', '');
        cotPreview.textContent = cotVal ? (cotVal.length > 8 ? cotVal.slice(0, 8) + '…' : cotVal) : '未设置';

        if (chatAvatar && chatAvatar.trim() !== '') {
            avatarImage.src = chatAvatar;
            avatarImage.style.display = 'block';
            avatarPlaceholder.style.display = 'none';
        } else {
            avatarImage.style.display = 'none';
            avatarPlaceholder.style.display = 'flex';
            avatarPlaceholder.textContent = chatName ? chatName.charAt(0).toUpperCase() : '?';
        }

        var timeAware = getSetting('timeAware', true);
        timeToggle.checked = timeAware;
        timeStatus.textContent = timeAware ? '开启' : '关闭';

        loadBackground();

        var prompt = getSetting('imagePrompt', '');
        promptStatus.textContent = prompt ? shortPromptText(prompt) : '未设置';

        var face = getSetting('faceRef', '');
        if (face) {
            faceStatus.textContent = '已设置';
            facePreviewBox.style.backgroundImage = 'url(' + face + ')';
            facePreviewBox.style.backgroundSize = 'cover';
            facePreviewBox.style.backgroundPosition = 'center';
            facePreviewBox.textContent = '';
        } else {
            faceStatus.textContent = '未设置';
            facePreviewBox.style.backgroundImage = 'none';
            facePreviewBox.textContent = '未上传参考图';
        }

        var autoMsg = getSetting('autoMsg', false);
        autoMsgToggle.checked = autoMsg;
        autoMsgStatus.textContent = autoMsg ? '开启' : '关闭';
        autoMsgIntervalItem.style.display = autoMsg ? 'flex' : 'none';
        var autoMsgIntervalVal = getSetting('autoMsgInterval', 8);
        autoMsgInterval.value = autoMsgIntervalVal;

        var autoMoment = getSetting('autoMoment', false);
        autoMomentToggle.checked = autoMoment;
        autoMomentStatus.textContent = autoMoment ? '开启' : '关闭';
        autoMomentIntervalItem.style.display = autoMoment ? 'flex' : 'none';
        var autoMomentIntervalVal = getSetting('autoMomentInterval', 12);
        autoMomentInterval.value = autoMomentIntervalVal;

        var allowImage = getSetting('allowImage', false);
        allowImageToggle.checked = allowImage;
        allowImageStatus.textContent = allowImage ? '开启' : '关闭';

        var allowMomentImage = getSetting('allowMomentImage', false);
        if (allowMomentImageToggle) {
            allowMomentImageToggle.checked = allowMomentImage;
            allowMomentImageStatus.textContent = allowMomentImage ? '开启' : '关闭';
        }
        if (momentImageFreq) momentImageFreq.value = getSetting('momentImageFreq', 'medium');
        if (momentImageFreqItem) momentImageFreqItem.style.display = allowMomentImage ? 'flex' : 'none';
    }

    function loadBackground() {
        var bgType = getSetting('bgType', 'color');
        var bgColor = getSetting('bgColor', '#ffffff');
        var bgImage = getSetting('bgImage', '');

        function renderBg(img) {
            if (bgType === 'image' && img) {
                bgDisplay.textContent = '自定义图片';
                bgPreviewBox.style.backgroundImage = 'url(' + img + ')';
                bgPreviewBox.style.backgroundSize = 'cover';
                bgPreviewBox.style.backgroundPosition = 'center';
                bgPreviewBox.textContent = '';
            } else {
                bgDisplay.textContent = bgColor === '#ffffff' ? '默认' : '颜色';
                bgPreviewBox.style.backgroundImage = 'none';
                bgPreviewBox.style.backgroundColor = bgColor || '#ffffff';
                bgPreviewBox.textContent = '无预览';
            }
        }

        if (!bgImage && typeof localforage !== 'undefined') {
            localforage.getItem(getStorageKey('bgImage')).then(function(img) {
                renderBg(img || bgImage);
            }).catch(function() { renderBg(bgImage); });
        } else {
            renderBg(bgImage);
        }
    }

    // ===== 思维链预设（COT） =====
    var COT_PRESETS_KEY = 'nano_cot_presets';
    var cotPresetSelect = document.getElementById('cotPresetSelect');
    var cotPresetName = document.getElementById('cotPresetName');
    var cotPresetSave = document.getElementById('cotPresetSave');
    var cotPresetUpdate = document.getElementById('cotPresetUpdate');
    var cotPresetDelete = document.getElementById('cotPresetDelete');
    var cotImportFile = document.getElementById('cotImportFile');
    var cotImportName = document.getElementById('cotImportName');

    function readCotPresets() {
        try {
            var raw = localStorage.getItem(COT_PRESETS_KEY);
            var arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr.filter(function(p){ return p && p.name; }) : [];
        } catch(e) { return []; }
    }
    function writeCotPresets(arr) {
        try { localStorage.setItem(COT_PRESETS_KEY, JSON.stringify((arr || []).slice(0, 200))); } catch(e) {}
    }
    function populateCotPresets() {
        if (!cotPresetSelect) return;
        var presets = readCotPresets();
        cotPresetSelect.innerHTML = '<option value="">-- 选择预设 --</option>' +
            presets.map(function(p, i){ return '<option value="' + i + '">' + String(p.name).replace(/</g,'&lt;') + '</option>'; }).join('');
    }
    function applyPreview(val) {
        cotPreview.textContent = val ? (val.length > 8 ? val.slice(0, 8) + '…' : val) : '未设置';
    }
    function updateCotPreview() { applyPreview(getSetting('cotPrompt', '')); }

    function openCotModal() {
        cotInput.value = getSetting('cotPrompt', '') || '';
        populateCotPresets();
        cotPresetName.value = '';
        if (cotImportName) cotImportName.textContent = '';
        cotModal.classList.add('active');
        setTimeout(function() { cotInput.focus(); }, 150);
    }

    function saveCot() {
        var val = cotInput.value.trim();
        setSetting('cotPrompt', val);
        applyPreview(val);
        if (window.parent !== window) {
            window.parent.postMessage({ type: 'cotChanged', chatId: chatId, cotPrompt: val }, '*');
        }
        cotModal.classList.remove('active');
    }

    if (cotPresetSave) {
        cotPresetSave.addEventListener('click', function() {
            var name = cotPresetName.value.trim();
            if (!name) { alert('请输入预设名称'); return; }
            var arr = readCotPresets();
            arr.push({ name: name, content: cotInput.value.trim() });
            writeCotPresets(arr);
            populateCotPresets();
            cotPresetSelect.value = String(arr.length - 1);
            alert('预设已保存');
        });
    }
    if (cotPresetUpdate) {
        cotPresetUpdate.addEventListener('click', function() {
            var idx = cotPresetSelect.value;
            if (idx === '') { alert('请先选择一个预设'); return; }
            var name = cotPresetName.value.trim();
            if (!name) { alert('请输入预设名称'); return; }
            var arr = readCotPresets();
            arr[parseInt(idx)] = { name: name, content: cotInput.value.trim() };
            writeCotPresets(arr);
            populateCotPresets();
            cotPresetSelect.value = idx;
            alert('预设已更新');
        });
    }
    if (cotPresetDelete) {
        cotPresetDelete.addEventListener('click', function() {
            var idx = cotPresetSelect.value;
            if (idx === '') { alert('请先选择一个预设'); return; }
            if (!confirm('删除此思维链预设？')) return;
            var arr = readCotPresets();
            arr.splice(parseInt(idx), 1);
            writeCotPresets(arr);
            populateCotPresets();
            cotPresetName.value = '';
            alert('已删除');
        });
    }
    if (cotPresetSelect) {
        cotPresetSelect.addEventListener('change', function() {
            var idx = this.value;
            if (idx === '') { cotPresetName.value = ''; return; }
            var p = readCotPresets()[parseInt(idx)];
            if (!p) return;
            cotInput.value = p.content || '';
            cotPresetName.value = p.name || '';
        });
    }
    function loadMammoth() {
        if (window.mammoth) return Promise.resolve();
        return new Promise(function(resolve, reject) {
            var s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js';
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }
    if (cotImportFile) {
        cotImportFile.addEventListener('change', async function(e) {
            var file = e.target.files && e.target.files[0];
            if (!file) return;
            var name = (file.name || '').toLowerCase();
            try {
                if (name.endsWith('.json')) {
                    var txt = await file.text();
                    var data = null;
                    try { data = JSON.parse(txt); } catch(err) { alert('JSON 解析失败'); return; }
                    var incoming = [];
                    if (Array.isArray(data)) incoming = data;
                    else if (data && Array.isArray(data.presets)) incoming = data.presets;
                    else if (data && data.content) incoming = [data];
                    var arr = readCotPresets();
                    var added = 0;
                    incoming.forEach(function(p) {
                        if (!p) return;
                        var nm = String(p.name || p.title || '').trim();
                        var ct = String(p.content || p.prompt || p.text || '').trim();
                        if (!ct) return;
                        if (!nm) nm = '导入预设 ' + (arr.length + 1);
                        arr.push({ name: nm, content: ct });
                        added++;
                    });
                    writeCotPresets(arr);
                    populateCotPresets();
                    if (added) { cotPresetSelect.value = String(arr.length - 1); cotInput.value = arr[arr.length - 1].content; cotPresetName.value = arr[arr.length - 1].name; }
                    if (cotImportName) cotImportName.textContent = file.name + '（' + added + ' 条）';
                } else if (name.endsWith('.txt')) {
                    var text = await file.text();
                    cotInput.value = text;
                    if (cotImportName) cotImportName.textContent = file.name;
                } else if (name.endsWith('.docx')) {
                    await loadMammoth();
                    var buf = await file.arrayBuffer();
                    var result = await window.mammoth.extractRawText({ arrayBuffer: buf });
                    cotInput.value = (result && result.value) || '';
                    if (cotImportName) cotImportName.textContent = file.name;
                } else {
                    alert('不支持的文件类型');
                }
            } catch (err) {
                console.error(err);
                alert('导入失败');
            }
            cotImportFile.value = '';
        });
    }

    // ===== 备注 =====
    function openRemarkModal() {
        var current = getSetting('remark', '');
        remarkInput.value = current || '';
        remarkModal.classList.add('active');
        setTimeout(function() { remarkInput.focus(); }, 150);
    }

    function saveRemark() {
        var val = remarkInput.value.trim();
        setSetting('remark', val);
        if (val) {
            remarkPreview.textContent = val;
            displayNickname.textContent = val;
        } else {
            remarkPreview.textContent = '未设置';
            displayNickname.textContent = chatName || '未知';
        }
        if (window.parent !== window) {
            window.parent.postMessage({
                type: 'remarkChanged',
                chatId: chatId,
                remark: val
            }, '*');
        }
        remarkModal.classList.remove('active');
    }

    // ===== 背景 =====
    function openBgModal() {
        bgModal.classList.add('active');
        // 加载当前背景到预览
        var bgImage = getSetting('bgImage', '');
        var bgColor = getSetting('bgColor', '#ffffff');
        var bgType = getSetting('bgType', 'color');
        if (bgType === 'image' && bgImage) {
            bgPreviewBox.style.backgroundImage = 'url(' + bgImage + ')';
            bgPreviewBox.style.backgroundSize = 'cover';
            bgPreviewBox.style.backgroundPosition = 'center';
            bgPreviewBox.textContent = '';
        } else {
            bgPreviewBox.style.backgroundImage = 'none';
            bgPreviewBox.style.backgroundColor = bgColor || '#ffffff';
            bgPreviewBox.textContent = '无预览';
        }
    }

    function saveBackground() {
        var bgImage = bgPreviewBox.style.backgroundImage;
        if (bgImage && bgImage !== 'none' && bgImage !== '') {
            var url = bgImage.replace(/url\(["']?([^"')]+)["']?\)/, '$1');
            if (url && url.startsWith('data:image')) {
                setSetting('bgType', 'image');
                setSetting('bgImage', url);
                bgDisplay.textContent = '自定义图片';
            }
        } else {
            var color = bgPreviewBox.style.backgroundColor || '#ffffff';
            setSetting('bgType', 'color');
            setSetting('bgColor', color);
            if (typeof localforage !== 'undefined') {
                localforage.removeItem(getStorageKey('bgImage')).catch(function(err) {});
            }
            bgDisplay.textContent = color === '#ffffff' ? '默认' : '颜色';
        }
        if (window.parent !== window) {
            window.parent.postMessage({
                type: 'backgroundChanged',
                chatId: chatId,
                bgType: getSetting('bgType', 'color'),
                bgColor: getSetting('bgColor', '#ffffff'),
                bgImage: getSetting('bgImage', '')
            }, '*');
        }
        bgModal.classList.remove('active');
    }

    function resetBackground() {
        setSetting('bgType', 'color');
        setSetting('bgColor', '#ffffff');
        if (typeof localforage !== 'undefined') {
            localforage.removeItem(getStorageKey('bgImage')).catch(function(err) {});
        }
        bgDisplay.textContent = '默认';
        bgPreviewBox.style.backgroundImage = 'none';
        bgPreviewBox.style.backgroundColor = '#ffffff';
        bgPreviewBox.textContent = '无预览';
        if (window.parent !== window) {
            window.parent.postMessage({
                type: 'backgroundChanged',
                chatId: chatId,
                bgType: 'color',
                bgColor: '#ffffff',
                bgImage: ''
            }, '*');
        }
        bgModal.classList.remove('active');
    }

    // ===== 搜索 =====
    function openSearchModal() {
        searchInput.value = '';
        searchResults.innerHTML = '输入关键词以搜索';
        searchModal.classList.add('active');
        setTimeout(function() { searchInput.focus(); }, 150);
    }

    var searchTimer = null;
    function performSearch() {
        var val = searchInput.value.trim();
        clearTimeout(searchTimer);
        if (!val) {
            searchResults.innerHTML = '输入关键词以搜索';
            return;
        }
        searchTimer = setTimeout(function() {
            try {
                var key = 'chat_messages_' + chatId;
                var messages = [];
                var data = localStorage.getItem(key);
                if (data) {
                    messages = JSON.parse(data);
                }
                if (typeof localforage !== 'undefined') {
                    localforage.getItem(key).then(function(data) {
                        if (data && Array.isArray(data)) {
                            renderSearchResults(data, val);
                        } else if (messages.length > 0) {
                            renderSearchResults(messages, val);
                        } else {
                            searchResults.innerHTML = '没有找到聊天记录';
                        }
                    }).catch(function() {
                        if (messages.length > 0) {
                            renderSearchResults(messages, val);
                        } else {
                            searchResults.innerHTML = '没有找到聊天记录';
                        }
                    });
                } else if (messages.length > 0) {
                    renderSearchResults(messages, val);
                } else {
                    searchResults.innerHTML = '没有找到聊天记录';
                }
            } catch(e) {
                searchResults.innerHTML = '搜索失败，请重试';
            }
        }, 300);
    }

    function renderSearchResults(messages, keyword) {
        var results = messages.filter(function(m) {
            return m.text && m.text.toLowerCase().includes(keyword.toLowerCase());
        });

        if (results.length === 0) {
            searchResults.innerHTML = '没有找到匹配的消息';
            return;
        }

        var html = '';
        results.slice(0, 20).forEach(function(m) {
            var highlighted = m.text.replace(
                new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
                function(match) { return '<strong style="color:#007AFF;">' + match + '</strong>'; }
            );
            var sender = m.type === 'left' ? '对方' : '我';
            html += '<div style="padding:10px;border-bottom:0.5px solid #E5E5EA;text-align:left;font-size:14px;cursor:pointer;" data-msgid="' + m.id + '">' +
                sender + '：' + highlighted +
                '<div style="font-size:11px;color:#8E8E93;margin-top:2px;">' + (m.time || '') + '</div>' +
                '</div>';
        });
        searchResults.innerHTML = html;

        searchResults.querySelectorAll('[data-msgid]').forEach(function(el) {
            el.addEventListener('click', function() {
                var msgId = this.dataset.msgid;
                if (window.parent !== window) {
                    window.parent.postMessage({
                        type: 'jumpToMessage',
                        chatId: chatId,
                        msgId: msgId
                    }, '*');
                }
                searchModal.classList.remove('active');
            });
        });
    }

    // ===== 清空 =====
    function openClearModal() {
        clearModal.classList.add('active');
    }

    // 清空记录时，连同该聊天的记忆一起清掉，避免“记录没了记忆还在”
    function clearChatMemories(cid) {
        try {
            if (!('indexedDB' in window)) return;
            var req = indexedDB.open('nano_vector_memory_db', 5);
            req.onupgradeneeded = function(e) {
                try { var d = e.target.result; if (!d.objectStoreNames.contains('config')) d.createObjectStore('config', { keyPath: 'key' }); } catch(err) {}
            };
            req.onsuccess = function(e) {
                try {
                    var db = e.target.result;
                    db.transaction('config', 'readwrite').objectStore('config').put({ key: 'memlist_' + cid, value: [] });
                } catch(err) {}
            };
        } catch(e) {}
    }

    function confirmClear() {
        var key = 'chat_messages_' + chatId;
        try { localStorage.setItem('chat_cleared_' + chatId, '1'); } catch(e) {}
        clearChatMemories(chatId);
        if (typeof localforage !== 'undefined') {
            localforage.setItem(key, []).then(function() {
                if (window.parent !== window) {
                    window.parent.postMessage({
                        type: 'messagesCleared',
                        chatId: chatId
                    }, '*');
                }
            }).catch(function() {});
        } else {
            localStorage.setItem(key, JSON.stringify([]));
            if (window.parent !== window) {
                window.parent.postMessage({
                    type: 'messagesCleared',
                    chatId: chatId
                }, '*');
            }
        }
        clearModal.classList.remove('active');
    }

    // ===== 生图提示词 =====
    function shortPromptText(s) {
        s = String(s || '').replace(/\s+/g, ' ').trim();
        return s.length > 8 ? (s.slice(0, 8) + '…') : s;
    }
    function openPromptModal() {
        var current = getSetting('imagePrompt', '');
        promptInput.value = current || '';
        promptModal.classList.add('active');
        setTimeout(function() { promptInput.focus(); }, 150);
    }

    function savePrompt() {
        var val = promptInput.value.trim();
        setSetting('imagePrompt', val);
        promptStatus.textContent = val ? shortPromptText(val) : '未设置';
        promptModal.classList.remove('active');
    }

    // ===== 锁脸 =====
    function openFaceModal() {
        faceModal.classList.add('active');
    }

    function saveFace() {
        var bgImage = facePreviewBox.style.backgroundImage;
        if (bgImage && bgImage !== 'none' && bgImage !== '') {
            var url = bgImage.replace(/url\(["']?([^"')]+)["']?\)/, '$1');
            if (url && url.startsWith('data:image')) {
                setSetting('faceRef', url);
                faceStatus.textContent = '已设置';
            }
        } else {
            setSetting('faceRef', '');
            faceStatus.textContent = '未设置';
            facePreviewBox.style.backgroundImage = 'none';
            facePreviewBox.textContent = '未上传参考图';
        }
        faceModal.classList.remove('active');
    }

    // ===== 主动发消息 =====
    function toggleAutoMsg() {
        var enabled = autoMsgToggle.checked;
        setSetting('autoMsg', enabled);
        autoMsgStatus.textContent = enabled ? '开启' : '关闭';
        autoMsgIntervalItem.style.display = enabled ? 'flex' : 'none';
        if (window.parent !== window) {
            window.parent.postMessage({
                type: 'autoMsgChanged',
                chatId: chatId,
                enabled: enabled,
                interval: parseInt(autoMsgInterval.value)
            }, '*');
        }
    }

    function changeAutoMsgInterval() {
        var val = parseInt(autoMsgInterval.value);
        setSetting('autoMsgInterval', val);
        if (window.parent !== window) {
            window.parent.postMessage({
                type: 'autoMsgIntervalChanged',
                chatId: chatId,
                interval: val
            }, '*');
        }
    }

    // ===== 主动发朋友圈 =====
    function toggleAutoMoment() {
        var enabled = autoMomentToggle.checked;
        setSetting('autoMoment', enabled);
        autoMomentStatus.textContent = enabled ? '开启' : '关闭';
        autoMomentIntervalItem.style.display = enabled ? 'flex' : 'none';
        if (window.parent !== window) {
            window.parent.postMessage({
                type: 'autoMomentChanged',
                chatId: chatId,
                enabled: enabled,
                interval: parseInt(autoMomentInterval.value)
            }, '*');
        }
    }

    function changeAutoMomentInterval() {
        var val = parseInt(autoMomentInterval.value);
        setSetting('autoMomentInterval', val);
        if (window.parent !== window) {
            window.parent.postMessage({
                type: 'autoMomentIntervalChanged',
                chatId: chatId,
                interval: val
            }, '*');
        }
    }

    // ===== 允许生图 =====
    function toggleAllowImage() {
        var enabled = allowImageToggle.checked;
        setSetting('allowImage', enabled);
        allowImageStatus.textContent = enabled ? '开启' : '关闭';
        if (window.parent !== window) {
            window.parent.postMessage({
                type: 'allowImageChanged',
                chatId: chatId,
                enabled: enabled
            }, '*');
        }
    }

    // ===== 允许朋友圈生图 =====
    function toggleAllowMomentImage() {
        if (!allowMomentImageToggle) return;
        var enabled = allowMomentImageToggle.checked;
        setSetting('allowMomentImage', enabled);
        allowMomentImageStatus.textContent = enabled ? '开启' : '关闭';
        if (momentImageFreqItem) momentImageFreqItem.style.display = enabled ? 'flex' : 'none';
        if (window.parent !== window) {
            window.parent.postMessage({
                type: 'allowMomentImageChanged',
                chatId: chatId,
                enabled: enabled
            }, '*');
        }
    }

    // ===== 事件绑定 =====
    document.getElementById('remarkItem').addEventListener('click', openRemarkModal);
    remarkCancel.addEventListener('click', function() { remarkModal.classList.remove('active'); });
    remarkConfirm.addEventListener('click', saveRemark);
    remarkInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') saveRemark(); });

    document.getElementById('cotItem').addEventListener('click', openCotModal);
    cotCancel.addEventListener('click', function() { cotModal.classList.remove('active'); });
    cotConfirm.addEventListener('click', saveCot);

    document.getElementById('bgItem').addEventListener('click', openBgModal);
    bgCancel.addEventListener('click', function() { bgModal.classList.remove('active'); });
    bgConfirm.addEventListener('click', saveBackground);
    bgReset.addEventListener('click', resetBackground);
    bgUpload.addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (file) {
            var reader = new FileReader();
            reader.onload = function(ev) {
                bgPreviewBox.style.backgroundImage = 'url(' + ev.target.result + ')';
                bgPreviewBox.style.backgroundSize = 'cover';
                bgPreviewBox.style.backgroundPosition = 'center';
                bgPreviewBox.textContent = '';
            };
            reader.readAsDataURL(file);
        }
        this.value = '';
    });

    timeToggle.addEventListener('change', function(e) {
        var enabled = e.target.checked;
        timeStatus.textContent = enabled ? '开启' : '关闭';
        setSetting('timeAware', enabled);
        if (window.parent !== window) {
            window.parent.postMessage({
                type: 'timeAwareChanged',
                chatId: chatId,
                enabled: enabled
            }, '*');
        }
    });

    // 译文模式：独立气泡 / 与原文同一气泡
    var transToggle = document.getElementById('transSeparateToggle');
    var transStatus = document.getElementById('transStatus');
    function applyTransMode() {
        var sep = true;
        try { sep = localStorage.getItem('nano_trans_separate') !== '0'; } catch (e) {}
        if (transToggle) transToggle.checked = sep;
        if (transStatus) transStatus.textContent = sep ? '分开' : '同一气泡';
    }
    applyTransMode();
    if (transToggle) {
        transToggle.addEventListener('change', function (e) {
            var sep = e.target.checked;
            try { localStorage.setItem('nano_trans_separate', sep ? '1' : '0'); } catch (err) {}
            if (transStatus) transStatus.textContent = sep ? '分开' : '同一气泡';
            // 通知父页面转发给当前会话，立即重渲染
            if (window.parent !== window) {
                try { window.parent.postMessage({ type: 'nanoTransMode', chatId: chatId, separate: sep }, '*'); } catch (err) {}
            }
        });
    }

    document.getElementById('searchItem').addEventListener('click', openSearchModal);
    searchInput.addEventListener('input', performSearch);
    searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); performSearch(); }
    });
    searchClose.addEventListener('click', function() { searchModal.classList.remove('active'); });

    document.getElementById('clearItem').addEventListener('click', openClearModal);
    clearCancel.addEventListener('click', function() { clearModal.classList.remove('active'); });
    clearConfirm.addEventListener('click', confirmClear);

    document.getElementById('promptItem').addEventListener('click', openPromptModal);
    promptCancel.addEventListener('click', function() { promptModal.classList.remove('active'); });
    promptConfirm.addEventListener('click', savePrompt);

    document.getElementById('faceItem').addEventListener('click', openFaceModal);
    faceCancel.addEventListener('click', function() { faceModal.classList.remove('active'); });
    faceConfirm.addEventListener('click', saveFace);
    faceUpload.addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (file) {
            var reader = new FileReader();
            reader.onload = function(ev) {
                facePreviewBox.style.backgroundImage = 'url(' + ev.target.result + ')';
                facePreviewBox.style.backgroundSize = 'cover';
                facePreviewBox.style.backgroundPosition = 'center';
                facePreviewBox.textContent = '';
            };
            reader.readAsDataURL(file);
        }
        this.value = '';
    });

    // ===== 主动功能事件绑定 =====
    autoMsgToggle.addEventListener('change', toggleAutoMsg);
    autoMsgInterval.addEventListener('change', changeAutoMsgInterval);

    autoMomentToggle.addEventListener('change', toggleAutoMoment);
    autoMomentInterval.addEventListener('change', changeAutoMomentInterval);

    allowImageToggle.addEventListener('change', toggleAllowImage);
    if (allowMomentImageToggle) allowMomentImageToggle.addEventListener('change', toggleAllowMomentImage);
    if (momentImageFreq) momentImageFreq.addEventListener('change', function() {
        setSetting('momentImageFreq', this.value);
    });

    window.addEventListener('message', function(event) {
        var data = event.data;
        if (!data) return;
        if (data.type === 'searchResults' && data.chatId === chatId && data.results) {
            renderSearchResults(data.results, data.keyword);
        }
    });

    // 当前楼层：统计线上 / 线下各自已聊的条数
    function countOnlineMessages() {
        return new Promise(function (resolve) {
            var key = 'chat_messages_' + chatId;
            function fromLocal() {
                try { resolve((JSON.parse(localStorage.getItem(key) || '[]') || []).length); }
                catch (e) { resolve(0); }
            }
            if (typeof localforage !== 'undefined') {
                localforage.getItem(key).then(function (data) {
                    if (Array.isArray(data)) resolve(data.length);
                    else fromLocal();
                }).catch(fromLocal);
            } else {
                fromLocal();
            }
        });
    }
    function countOfflineMessages() {
        return new Promise(function (resolve) {
            if (!('indexedDB' in window)) { resolve(0); return; }
            try {
                // 不指定版本：只读统计，绝不抢先建库/建表，避免破坏 offline.js 的表结构
                var req = indexedDB.open('MeetSettingsDB');
                req.onupgradeneeded = function () {};
                req.onsuccess = function (e) {
                    try {
                        var db = e.target.result;
                        if (!db.objectStoreNames.contains('messages')) { resolve(0); try { db.close(); } catch (err) {} return; }
                        var r = db.transaction('messages', 'readonly').objectStore('messages').openCursor();
                        var n = 0;
                        r.onsuccess = function (ev) {
                            var cur = ev.target.result;
                            if (cur) {
                                if ((cur.value && (cur.value.chatId || '')) === chatId) n++;
                                cur.continue();
                            } else {
                                resolve(n);
                                try { db.close(); } catch (err) {}
                            }
                        };
                        r.onerror = function () { resolve(n); try { db.close(); } catch (err) {} };
                    } catch (err) { resolve(0); }
                };
                req.onerror = function () { resolve(0); };
            } catch (e) { resolve(0); }
        });
    }
    function loadFloorCounts() {
        var el = document.getElementById('floorCountText');
        if (!el) return;
        var online = 0, offline = 0;
        function render() { el.textContent = '线上 ' + online + ' · 线下 ' + offline; }
        countOnlineMessages().then(function (n) { online = n; render(); });
        countOfflineMessages().then(function (n) { offline = n; render(); });
    }

    // ===== Token 占用（按字符估算）：线上/线下/记忆库/世界书/社交软件 =====
    var TOKEN_KEYS = { content: 1, text: 1, desc: 1, description: 1, summary: 1, setting: 1, persona: 1, prompt: 1, remark: 1, bio: 1, title: 1, message: 1, memory: 1, detail: 1, keys: 1, foreign: 1, speech: 1, narration: 1 };
    function estimateTokens(s) {
        s = String(s || '');
        if (!s) return 0;
        var cjk = (s.match(/[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
        var other = s.length - cjk;
        return Math.ceil(cjk + other / 4);
    }
    function tokenTextFrom(obj, depth) {
        depth = depth || 0;
        if (obj == null || depth > 8) return '';
        if (typeof obj === 'string') return (obj.length < 4000 && obj.indexOf('data:') !== 0) ? obj + '\n' : '';
        var out = '';
        if (Array.isArray(obj)) {
            for (var i = 0; i < obj.length && i < 4000; i++) out += tokenTextFrom(obj[i], depth + 1);
            return out;
        }
        if (typeof obj === 'object') {
            for (var k in obj) {
                var v = obj[k];
                if (typeof v === 'string') {
                    if (TOKEN_KEYS[k] && v && v.length < 4000 && v.indexOf('data:') !== 0) out += v + '\n';
                } else if (v && typeof v === 'object') {
                    out += tokenTextFrom(v, depth + 1);
                }
            }
        }
        return out;
    }
    function dbExists(name) {
        return new Promise(function (resolve) {
            if (!indexedDB.databases) { resolve(true); return; }
            try {
                indexedDB.databases().then(function (list) {
                    resolve(!!list && list.some(function (d) { return d && d.name === name; }));
                }).catch(function () { resolve(true); });
            } catch (e) { resolve(true); }
        });
    }
    function idbReadStore(dbName, storeName, filterFn) {
        return dbExists(dbName).then(function (exists) {
            if (!exists) return [];
            return new Promise(function (resolve) {
                if (!('indexedDB' in window)) { resolve([]); return; }
                try {
                    // 不指定版本：只读，绝不抢先建库/建表
                    var req = indexedDB.open(dbName);
                    req.onupgradeneeded = function () {};
                    req.onsuccess = function (e) {
                        var db = e.target.result, out = [];
                        try {
                            if (!db.objectStoreNames.contains(storeName)) { db.close(); resolve([]); return; }
                            var r = db.transaction(storeName, 'readonly').objectStore(storeName).openCursor();
                            r.onsuccess = function (ev) {
                                var cur = ev.target.result;
                                if (cur) {
                                    try { if (!filterFn || filterFn(cur.value, cur.key)) out.push({ key: cur.key, value: cur.value }); } catch (err) {}
                                    cur.continue();
                                } else { resolve(out); try { db.close(); } catch (err) {} }
                            };
                            r.onerror = function () { resolve(out); try { db.close(); } catch (err) {} };
                        } catch (err) { resolve([]); try { db.close(); } catch (e2) {} }
                    };
                    req.onerror = function () { resolve([]); };
                } catch (e) { resolve([]); }
            });
        });
    }
    function lfGet(key) {
        return new Promise(function (resolve) {
            if (typeof localforage !== 'undefined') {
                localforage.getItem(key).then(function (v) { resolve(v); }).catch(function () { resolve(null); });
            } else {
                try { resolve(JSON.parse(localStorage.getItem(key) || 'null')); } catch (e) { resolve(null); }
            }
        });
    }
    function matchCharText(obj) {
        var s = '';
        try { s = JSON.stringify(obj); } catch (e) { return false; }
        if (!s) return false;
        if (chatId && s.indexOf(chatId) !== -1) return true;
        if (chatName && s.indexOf(chatName) !== -1) return true;
        return false;
    }
    async function gatherTokenStats() {
        var stats = { online: 0, offline: 0, memory: 0, worldbook: 0, social: 0 };
        try { stats.online = estimateTokens(tokenTextFrom(await lfGet('chat_messages_' + chatId))); } catch (e) {}
        try {
            var off = await idbReadStore('MeetSettingsDB', 'messages', function (v) { return v && (v.chatId || '') === chatId; });
            stats.offline = estimateTokens(tokenTextFrom(off));
        } catch (e) {}
        try {
            var mem = await idbReadStore('nano_vector_memory_db', 'config', function (v, k) { return k === 'memlist_' + chatId || k === 'auxchat_' + chatId; });
            var mem2 = await idbReadStore('nano_vector_memory_db', 'chat_messages', function (v, k) { return k === chatId || (v && v.chatId === chatId); });
            stats.memory = estimateTokens(tokenTextFrom(mem) + tokenTextFrom(mem2));
        } catch (e) {}
        try {
            var wbRows = await idbReadStore('nano_worldbook_db', 'worldbook_data', null);
            var files = [];
            wbRows.forEach(function (row) {
                var val = row.value;
                if (val && val.value && Array.isArray(val.value.files)) val = val.value;
                if (val && Array.isArray(val.files)) {
                    val.files.forEach(function (f) {
                        if (!f) return;
                        var bound = Array.isArray(f.boundCharacters) ? f.boundCharacters : [];
                        if (bound.length === 0 || bound.indexOf(chatId) !== -1) files.push(f);
                    });
                }
            });
            stats.worldbook = estimateTokens(tokenTextFrom(files));
        } catch (e) {}
        try {
            var socialText = '';
            // 朋友圈
            try {
                var mo = JSON.parse(localStorage.getItem('nano_moments_data') || '[]');
                if (Array.isArray(mo)) socialText += tokenTextFrom(mo.filter(matchCharText));
            } catch (e) {}
            // Halo（按角色名匹配聊天记录）
            try {
                var halo = await idbReadStore('nano_halo_db', 'halo_state', null);
                halo.forEach(function (row) {
                    var rec = row.value;
                    var S = rec && rec.value ? rec.value : rec;
                    var log = S && S.chatLog && chatName && S.chatLog[chatName];
                    if (log) socialText += tokenTextFrom(log);
                });
            } catch (e) {}
            // Instagram（匹配到角色的会话）
            try {
                var insRows = await idbReadStore('nano_ins_db', 'state', function (v, k) { return typeof k === 'string' && k.indexOf('nano_ins_chat_') === 0; });
                insRows.forEach(function (row) {
                    var rec = row.value;
                    var st = rec && rec.value ? rec.value : rec;
                    var hist = st && st.chatHistories;
                    if (!hist || typeof hist !== 'object') return;
                    Object.keys(hist).forEach(function (uid) {
                        if (matchCharText(hist[uid])) socialText += tokenTextFrom(hist[uid]);
                    });
                });
            } catch (e) {}
            stats.social = estimateTokens(socialText);
        } catch (e) {}
        return stats;
    }
    function renderTokenChart(stats) {
        var labels = { online: '线上记录', offline: '线下记录', memory: '记忆库', worldbook: '世界书', social: '社交软件' };
        var colors = { online: '#007aff', offline: '#34c759', memory: '#ff9500', worldbook: '#af52de', social: '#ff2d55' };
        var entries = Object.keys(labels).map(function (k) {
            return { k: k, label: labels[k], v: stats[k] || 0, color: colors[k] };
        }).filter(function (e) { return e.v > 0; }).sort(function (a, b) { return b.v - a.v; });
        var total = entries.reduce(function (a, e) { return a + e.v; }, 0);
        var totalEl = document.getElementById('tokenTotal');
        var ring = document.getElementById('tokenRing');
        var legend = document.getElementById('tokenLegend');
        if (totalEl) totalEl.textContent = total ? ('≈' + total.toLocaleString() + ' tokens') : '暂无数据';
        if (ring) {
            var C = 2 * Math.PI * 40;
            var off = 0;
            var html = '<circle cx="50" cy="50" r="40" fill="none" stroke="#eef0f3" stroke-width="12"></circle>';
            if (total) {
                entries.forEach(function (e) {
                    var len = e.v / total * C;
                    html += '<circle cx="50" cy="50" r="40" fill="none" stroke="' + e.color + '" stroke-width="12" stroke-linecap="butt"'
                        + ' stroke-dasharray="' + len.toFixed(3) + ' ' + (C - len).toFixed(3) + '"'
                        + ' stroke-dashoffset="' + (-off).toFixed(3) + '" transform="rotate(-90 50 50)"></circle>';
                    off += len;
                });
                html += '<text x="50" y="47" text-anchor="middle" font-size="13" font-weight="600" fill="#1c1c1e">' + Math.round(total / 1000) + 'k</text>';
                html += '<text x="50" y="60" text-anchor="middle" font-size="7" fill="#8e8e93">tokens</text>';
            }
            ring.innerHTML = html;
        }
        if (legend) {
            legend.innerHTML = total ? entries.map(function (e) {
                return '<div style="display:flex;align-items:center;gap:6px;margin:3px 0;">'
                    + '<span style="width:8px;height:8px;border-radius:50%;flex:none;background:' + e.color + ';"></span>'
                    + '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + e.label + '</span>'
                    + '<span style="color:#8e8e93;flex:none;">' + e.v.toLocaleString() + ' · ' + Math.round(e.v / total * 100) + '%</span>'
                    + '</div>';
            }).join('') : '<div style="color:#8e8e93;">暂无数据</div>';
        }
    }
    function loadTokenChart() {
        gatherTokenStats().then(renderTokenChart).catch(function () { });
    }

    // 自己的返回按钮：收起本页，回到聊天详情页（由主框架恢复 chat_inner）
    var navBackBtn = document.getElementById('navBack');
    if (navBackBtn) {
        navBackBtn.addEventListener('click', function () {
            try { window.parent.postMessage({ type: 'closeFullscreen' }, '*'); } catch (e) {}
        });
    }

    if (window.parent !== window) {
        window.parent.postMessage({ type: 'pageLoaded', page: 'inner_setting' }, '*');
        window.parent.postMessage({ type: 'setTitle', title: '聊天设置' }, '*');
    }

    loadInfo();
    loadFloorCounts();
    loadTokenChart();
    // Token 占用：默认收起，点击展开小卡片
    (function bindTokenToggle() {
        var item = document.getElementById('tokenItem');
        var details = document.getElementById('tokenDetails');
        var chevron = document.getElementById('tokenChevron');
        if (!item || !details) return;
        item.addEventListener('click', function () {
            var open = details.style.display !== 'none';
            details.style.display = open ? 'none' : 'block';
            if (chevron) chevron.style.transform = open ? '' : 'rotate(90deg)';
            if (!open) loadTokenChart();
        });
    })();
    console.log('[Setting] 聊天设置页面已加载，chatId:', chatId);
})();