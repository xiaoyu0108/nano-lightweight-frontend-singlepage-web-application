// ============================================================
// video-call.js — 视频通话
// 复用语音通话的交互：计时、缩小成悬浮球、免提(TTS)、录音转文字、
// 底部输入/回复；新增：本地摄像头、右上角可点击放大/互换的小窗、
// 摄像头开关（关时小窗显示头像）、AI 通过截图“看到”你这边。
// ============================================================
(function () {
    'use strict';

    function q(name) { try { return new URLSearchParams(window.location.search).get(name); } catch (e) { return null; } }

    var chatId = q('chat') || 'default';
    var contactName = q('name') || 'AI 助手';

    // ===== DOM =====
    var $ = function (id) { return document.getElementById(id); };
    var stage = $('vcStage');
    var localBox = $('localBox');
    var localVideo = $('localVideo');
    var localOff = $('localOff');
    var localAvatarImg = $('localAvatarImg');
    var remoteAvatar = $('remoteAvatar');
    var remoteAvatarSvg = $('remoteAvatarSvg');
    var chatArea = $('chatArea');
    var messageInput = $('messageInput');
    var replyBtn = $('replyBtn');
    var rerollBtn = $('rerollBtn');
    var speakerBtn = $('speakerBtn');
    var recordBtn = $('recordBtn');
    var cameraBtn = $('cameraBtn');
    var flipBtn = $('flipBtn');
    var minimizeBtn = $('minimizeBtn');
    var hangupBtn = $('hangupBtn');
    var callStatus = $('callStatus');
    var contactNameEl = $('contactName');
    var visionTag = $('visionTag');
    var toastEl = $('vcToast');

    // ===== 状态 =====
    var messages = [];
    var isWaiting = false;
    var isConnected = false;
    var callSeconds = 0;
    var timer = null;
    var cameraOn = true;
    var facingMode = 'user';
    var speakerOn = true;
    var mediaStream = null;
    var charAvatar = '';
    var charPersona = '';
    var displayName = contactName;
    var lastFrame = '';

    function toast(msg) {
        if (!toastEl) return;
        toastEl.textContent = msg;
        toastEl.classList.add('show');
        clearTimeout(toastEl._t);
        toastEl._t = setTimeout(function () { toastEl.classList.remove('show'); }, 1600);
    }

    // ===== 角色信息（头像/人设）=====
    function loadCharInfo() {
        return new Promise(function (resolve) {
            var done = false;
            function finish() { if (!done) { done = true; resolve(); } }
            try {
                var info = JSON.parse(sessionStorage.getItem('inner_setting_info') || 'null');
                if (info) {
                    charAvatar = info.chatAvatar || info.avatar || '';
                    displayName = info.name || displayName;
                }
            } catch (e) {}
            try {
                var req = indexedDB.open('nano_characters_db', 1);
                req.onupgradeneeded = function (e) {
                    try { var d = e.target.result; if (!d.objectStoreNames.contains('characters')) d.createObjectStore('characters', { keyPath: 'id' }); } catch (err) {}
                };
                req.onsuccess = function () {
                    try {
                        var r = req.result.transaction('characters', 'readonly').objectStore('characters').get(chatId);
                        r.onsuccess = function () {
                            var c = r.result;
                            if (c) {
                                if (c.avatar) charAvatar = c.avatar;
                                if (c.name) displayName = c.name;
                                try { charPersona = JSON.stringify(c).slice(0, 3000); } catch (e) { charPersona = ''; }
                            }
                            finish();
                        };
                        r.onerror = finish;
                    } catch (e) { finish(); }
                };
                req.onerror = finish;
            } catch (e) { finish(); }
        });
    }

    function applyAvatar() {
        contactNameEl.textContent = displayName;
        if (charAvatar) {
            remoteAvatar.src = charAvatar; remoteAvatar.style.display = 'block';
            remoteAvatarSvg.style.display = 'none';
            localAvatarImg.src = charAvatar; localAvatarImg.style.display = 'block';
        }
    }

    // ===== 消息渲染 =====
    function addMessage(text, isUser) {
        messages.push({ text: text, isUser: !!isUser });
        var el = document.createElement('div');
        el.className = 'vc-msg ' + (isUser ? 'user' : 'ai');
        el.textContent = text;
        chatArea.appendChild(el);
        chatArea.scrollTop = chatArea.scrollHeight;
        if (!isUser && speakerOn && window.NanoTTS && text && text.indexOf('出错了') !== 0) {
            try { window.NanoTTS.speak(text); } catch (e) {}
        }
    }

    // ===== Prompt =====
    function buildSystemPrompt() {
        var p = '（这是你和「' + (displayName || '对方') + '」的视频通话。你在通话里自然聊天，口语化、简短，像真人视频通话一样。）\n';
        p += '用户可能开着摄像头，你能“看到”通话画面；结合你看到的画面自然回应，但不要机械地复述画面。\n';
        if (charPersona) p += '\n【你的人设】\n' + charPersona + '\n';
        return p;
    }

    // ===== API 配置（IndexedDB 优先）=====
    function readApiConfig() {
        return new Promise(function (resolve) {
            function fromLS() { try { var raw = localStorage.getItem('nano_api_config'); resolve(raw ? JSON.parse(raw) : null); } catch (e) { resolve(null); } }
            try {
                var req = indexedDB.open('nano_api_db', 2);
                req.onupgradeneeded = function (e) { try { var d = e.target.result; if (!d.objectStoreNames.contains('api_data')) d.createObjectStore('api_data', { keyPath: 'key' }); } catch (err) {} };
                req.onsuccess = function () {
                    try {
                        var r = req.result.transaction('api_data', 'readonly').objectStore('api_data').get('nano_api_config');
                        r.onsuccess = function () { var v = r.result ? r.result.value : null; if (v) resolve(v); else fromLS(); };
                        r.onerror = fromLS;
                    } catch (e) { fromLS(); }
                };
                req.onerror = fromLS;
            } catch (e) { fromLS(); }
        });
    }
    function normalizeCfg(cfg) {
        if (!cfg) return null;
        var url = cfg.mainUrl || (cfg.main && cfg.main.url) || '';
        var key = cfg.mainKey || (cfg.main && cfg.main.key) || '';
        var model = cfg.mainModel || (cfg.main && cfg.main.model) || '';
        if (!url || !key || !model) return null;
        return { mainUrl: url, mainKey: key, mainModel: model };
    }

    // ===== 摄像头 =====
    function startCamera() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            toast('当前环境不支持摄像头');
            setCameraUI(false);
            return;
        }
        navigator.mediaDevices.getUserMedia({ video: { facingMode: facingMode }, audio: false })
            .then(function (stream) {
                mediaStream = stream;
                localVideo.srcObject = stream;
                localVideo.style.display = 'block';
                localOff.style.display = 'none';
                cameraOn = true;
                setCameraUI(true);
                visionTag.style.display = '';
            })
            .catch(function () {
                toast('摄像头不可用或无权限');
                cameraOn = false;
                setCameraUI(false);
                visionTag.style.display = 'none';
            });
    }
    function stopCamera() {
        if (mediaStream) { try { mediaStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} }
        mediaStream = null;
        localVideo.srcObject = null;
        localVideo.style.display = 'none';
        localOff.style.display = 'flex';
        cameraOn = false;
        setCameraUI(false);
        visionTag.style.display = 'none';
    }
    function setCameraUI(on) {
        if (cameraBtn) cameraBtn.classList.toggle('off', !on);
        if (flipBtn) flipBtn.style.display = on ? '' : 'none';
    }
    function captureFrame() {
        if (!cameraOn || !mediaStream || !localVideo.videoWidth) return '';
        try {
            var c = document.createElement('canvas');
            c.width = 320;
            c.height = Math.round(320 * localVideo.videoHeight / localVideo.videoWidth) || 240;
            c.getContext('2d').drawImage(localVideo, 0, 0, c.width, c.height);
            return c.toDataURL('image/jpeg', 0.6);
        } catch (e) { return ''; }
    }

    // ===== 调用 API（带画面）=====
    function callApi(userText) {
        return readApiConfig().then(function (rawCfg) {
            var config = normalizeCfg(rawCfg);
            if (!config) return '请先在 API 页面配置主 API';
            var baseUrl = config.mainUrl.trim();
            if (!baseUrl.endsWith('/v1')) baseUrl = baseUrl.endsWith('/') ? baseUrl + 'v1' : baseUrl + '/v1';

            var msgs = [{ role: 'system', content: buildSystemPrompt() }];
            var slice = messages.slice(-12);
            slice.pop(); // 去掉刚压入的这条（下面用带画面的版本）
            slice.forEach(function (m) {
                if (m.text && m.text.trim()) msgs.push({ role: m.isUser ? 'user' : 'assistant', content: m.text });
            });
            var frame = captureFrame();
            lastFrame = frame;
            if (frame) {
                msgs.push({ role: 'user', content: [{ type: 'text', text: userText || '（看看我这边）' }, { type: 'image_url', image_url: { url: frame } }] });
            } else {
                msgs.push({ role: 'user', content: userText || '（我这边没开摄像头）' });
            }

            return fetch(baseUrl + '/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + config.mainKey.trim(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: config.mainModel, messages: msgs, max_tokens: 500, temperature: 0.85 })
            }).then(function (r) {
                if (!r.ok) return r.json().then(function (e) { throw new Error((e.error && e.error.message) || ('HTTP ' + r.status)); }).catch(function () { throw new Error('HTTP ' + r.status); });
                return r.json();
            }).then(function (data) {
                return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '抱歉，我没收到回复。';
            }).catch(function (err) { return '出错了：' + err.message; });
        });
    }

    function triggerReply() {
        if (isWaiting) return;
        var text = messageInput.value.trim();
        if (text) { addMessage(text, true); messageInput.value = ''; }
        else { messages.push({ text: '', isUser: true }); }
        isWaiting = true;
        replyBtn.classList.add('loading');
        callApi(text).then(function (reply) {
            addMessage(reply, false);
            isWaiting = false;
            replyBtn.classList.remove('loading');
        });
    }

    // ===== 计时 =====
    function updateStatus() {
        var m = String(Math.floor(callSeconds / 60)).padStart(2, '0');
        var s = String(callSeconds % 60).padStart(2, '0');
        callStatus.textContent = m + ':' + s;
    }
    function startTimer() {
        clearInterval(timer);
        timer = setInterval(function () { callSeconds++; updateStatus(); }, 1000);
    }

    // ===== 事件绑定 =====
    localBox.addEventListener('click', function () { stage.classList.toggle('swapped'); });

    cameraBtn.addEventListener('click', function () {
        if (cameraOn) stopCamera(); else startCamera();
    });
    flipBtn.addEventListener('click', function () {
        facingMode = facingMode === 'user' ? 'environment' : 'user';
        stopCamera();
        startCamera();
    });

    speakerBtn.addEventListener('click', function () {
        speakerOn = !speakerOn;
        speakerBtn.classList.toggle('active', speakerOn);
        if (!speakerOn) { try { if (window.NanoTTS) window.NanoTTS.stop(); } catch (e) {} }
    });

    replyBtn.addEventListener('click', triggerReply);
    messageInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') triggerReply(); });

    rerollBtn.addEventListener('click', function () {
        if (isWaiting) return;
        if (messages.length && !messages[messages.length - 1].isUser) {
            messages.pop();
            if (chatArea.lastChild) chatArea.removeChild(chatArea.lastChild);
        }
        triggerReply();
    });

    // 录音转文字
    var recog = null, recording = false;
    function stopRecog() {
        recording = false;
        if (recordBtn) recordBtn.classList.remove('recording');
        try { if (recog) recog.stop(); } catch (e) {}
        recog = null;
    }
    recordBtn.addEventListener('click', function () {
        if (recording) { stopRecog(); return; }
        var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) { toast('当前环境不支持语音识别'); return; }
        try {
            recog = new SR();
            recog.lang = 'zh-CN'; recog.continuous = true; recog.interimResults = true;
            recog.onresult = function (ev) {
                var t = '';
                for (var i = ev.resultIndex; i < ev.results.length; i++) if (ev.results[i].isFinal) t += ev.results[i][0].transcript;
                if (!t) return;
                messageInput.value = (messageInput.value || '') + t;
            };
            recog.onerror = stopRecog;
            recog.onend = stopRecog;
            recog.start();
            recording = true;
            recordBtn.classList.add('recording');
            toast('正在录音，再点一次结束');
        } catch (e) { stopRecog(); toast('录音启动失败'); }
    });

    minimizeBtn.addEventListener('click', function () {
        try { window.parent.postMessage({ type: 'minimizeVoiceCall', seconds: callSeconds }, '*'); } catch (e) {}
    });

    hangupBtn.addEventListener('click', function () {
        clearInterval(timer);
        try {
            if (mediaStream) mediaStream.getTracks().forEach(function (t) { t.stop(); });
            if (window.NanoTTS) window.NanoTTS.stop();
        } catch (e) {}
        if (window.parent !== window) window.parent.postMessage({ type: 'voiceCallEnded' }, '*');
        else history.back();
    });

    // 父页恢复到本通话
    window.addEventListener('message', function (e) {
        var d = e.data;
        if (d && d.type === 'restoreVoiceCall') {
            if (d.seconds !== undefined && d.seconds > 0) { callSeconds = d.seconds; updateStatus(); }
            startTimer();
        }
    });

    // ===== 初始化 =====
    loadCharInfo().then(function () {
        applyAvatar();
        setCameraUI(cameraOn);
        startCamera();
        setTimeout(function () {
            isConnected = true;
            callStatus.textContent = '00:00';
            startTimer();
        }, 1200);
    });
})();
