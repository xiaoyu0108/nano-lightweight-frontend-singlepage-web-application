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
        promptStatus.textContent = prompt || '未设置';

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
    function openPromptModal() {
        var current = getSetting('imagePrompt', '');
        promptInput.value = current || '';
        promptModal.classList.add('active');
        setTimeout(function() { promptInput.focus(); }, 150);
    }

    function savePrompt() {
        var val = promptInput.value.trim();
        setSetting('imagePrompt', val);
        promptStatus.textContent = val || '未设置';
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
    console.log('[Setting] 聊天设置页面已加载，chatId:', chatId);
})();