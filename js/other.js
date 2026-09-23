// other.js — 保活 / 通知 / 通知声音
(function () {
    'use strict';

    var KEEP_KEY = 'nano_keep_alive';
    var SOUND_KEY = 'nano_notify_sound';

    var keepToggle = document.getElementById('keepAliveToggle');
    var notifyToggle = document.getElementById('notifyToggle');
    var soundSelect = document.getElementById('soundSelect');
    var soundPreview = document.getElementById('soundPreview');

    var _wakeLock = null;

    function post(type, payload) {
        try { if (window.parent !== window) window.parent.postMessage(Object.assign({ type: type }, payload || {}), '*'); } catch (e) {}
    }

    var backBtn = document.getElementById('backBtn');
    if (backBtn) {
        backBtn.addEventListener('click', function () {
            if (window.parent !== window) {
                window.parent.postMessage({ type: 'nanoCloseOverlay' }, '*');
            } else if (history.length > 1) {
                history.back();
            } else {
                location.href = 'more.html';
            }
        });
    }

    function applyKeepAlive(on) {
        try { localStorage.setItem(KEEP_KEY, on ? '1' : '0'); } catch (e) {}
        post('keepAlive', { enabled: !!on });
        if (on && navigator.wakeLock && navigator.wakeLock.request) {
            navigator.wakeLock.request('screen').then(function (s) {
                _wakeLock = s;
                _wakeLock.addEventListener('release', function () { _wakeLock = null; });
            }).catch(function () {});
        } else if (_wakeLock) {
            try { _wakeLock.release(); } catch (e) {}
            _wakeLock = null;
        }
    }

    function applyNotify(on) {
        try { localStorage.setItem('nano_notify_enabled', on ? '1' : '0'); } catch (e) {}
        post('notifySetting', { enabled: !!on });
        if (on) {
            try { if (window.NanoNotify) window.NanoNotify.ensurePermission(); } catch (e) {}
        }
    }

    if (keepToggle) {
        keepToggle.checked = (localStorage.getItem(KEEP_KEY) === '1');
        if (keepToggle.checked) applyKeepAlive(true);
        keepToggle.addEventListener('change', function () { applyKeepAlive(this.checked); });
    }

    if (notifyToggle) {
        notifyToggle.checked = (localStorage.getItem('nano_notify_enabled') === '1');
        if (notifyToggle.checked) {
            try { if (window.NanoNotify) window.NanoNotify.ensurePermission(); } catch (e) {}
        }
        notifyToggle.addEventListener('change', function () { applyNotify(this.checked); });
    }

    function buildSounds() {
        if (!soundSelect || !window.NanoNotify) return;
        soundSelect.innerHTML = '';
        window.NanoNotify.sounds.forEach(function (s) {
            var opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.name;
            soundSelect.appendChild(opt);
        });
        var cur = localStorage.getItem(SOUND_KEY) || 'ding';
        soundSelect.value = cur;
    }
    buildSounds();

    if (soundSelect) {
        soundSelect.addEventListener('change', function () {
            try { localStorage.setItem(SOUND_KEY, this.value); } catch (e) {}
            if (window.NanoNotify) window.NanoNotify.playSound(this.value);
        });
    }
    if (soundPreview) {
        soundPreview.addEventListener('click', function () {
            if (window.NanoNotify) window.NanoNotify.playSound(soundSelect ? soundSelect.value : 'ding');
        });
    }

    // ===== 分应用提示音（私聊 / 群聊 / 一起听 / 一起看 / ins / halo / 朋友圈）=====
    function buildChannelSounds() {
        var box = document.getElementById('channelSoundList');
        if (!box || !window.NanoNotify || !NanoNotify.channels) return;
        box.innerHTML = '';
        NanoNotify.channels.forEach(function (ch) {
            var row = document.createElement('div');
            row.className = 'list-item sound-row';
            var title = document.createElement('span');
            title.className = 'item-title';
            title.textContent = ch.name;
            var ctrl = document.createElement('div');
            ctrl.className = 'sound-controls';
            var sel = document.createElement('select');
            sel.className = 'sound-select';
            var follow = document.createElement('option');
            follow.value = '';
            follow.textContent = '跟随全局';
            sel.appendChild(follow);
            NanoNotify.sounds.forEach(function (s) {
                var o = document.createElement('option');
                o.value = s.id;
                o.textContent = s.name;
                sel.appendChild(o);
            });
            sel.value = NanoNotify.channelSound(ch.id) || '';
            var btn = document.createElement('button');
            btn.className = 'preview-btn';
            btn.textContent = '试听';
            sel.addEventListener('change', function () {
                NanoNotify.setChannelSound(ch.id, this.value);
                NanoNotify.playSound(this.value || NanoNotify.currentSound());
            });
            btn.addEventListener('click', function () {
                NanoNotify.playSound(sel.value || NanoNotify.currentSound());
            });
            ctrl.appendChild(sel);
            ctrl.appendChild(btn);
            row.appendChild(title);
            row.appendChild(ctrl);
            box.appendChild(row);
        });
    }
    buildChannelSounds();

    // ===== 后台运行状态：保活心跳 + 自动消息 / 自动朋友圈倒计时 =====
    var bgStatusEl = document.getElementById('bgStatus');
    function fmtLeft(target) {
        var ms = target - Date.now();
        if (ms <= 0) return '即将生成…';
        var s = Math.round(ms / 1000);
        var m = Math.floor(s / 60);
        s = s % 60;
        return m > 0 ? (m + ' 分 ' + s + ' 秒后') : (s + ' 秒后');
    }
    function renderBgStatus() {
        if (!bgStatusEl) return;
        var parts = [];
        var ka = null, st = null;
        try { ka = JSON.parse(localStorage.getItem('nano_keep_alive_state') || 'null'); } catch (e) {}
        try { st = JSON.parse(localStorage.getItem('nano_auto_status') || 'null'); } catch (e) {}
        if (localStorage.getItem(KEEP_KEY) === '1') {
            if (ka && ka.running && (Date.now() - (ka.at || 0) < 120000)) parts.push('保活：运行中 ✓');
            else if (ka && (Date.now() - (ka.at || 0)) >= 120000) parts.push('保活：可能已被系统挂起（回前台自动恢复）');
            else parts.push('保活：已开启，点一下屏幕让音频解锁');
        } else {
            parts.push('保活：未开启（切后台会停止生成）');
        }
        if (st && st.msg) parts.push(st.msg.on ? ('自动消息：' + fmtLeft(st.msg.nextAt)) : '自动消息：关');
        if (st && st.moment) parts.push(st.moment.on ? ('自动朋友圈：' + fmtLeft(st.moment.nextAt)) : '自动朋友圈：关');
        bgStatusEl.textContent = parts.join(' · ');
    }
    renderBgStatus();
    setInterval(renderBgStatus, 1000);

    // ===== API 悬浮球设置 =====
    var BALL_KEY = 'nanoApiBall';
    var ballToggle = document.getElementById('apiBallToggle');
    var ballSize = document.getElementById('apiBallSize');
    var ballSizeVal = document.getElementById('apiBallSizeVal');
    var ballReset = document.getElementById('apiBallResetPos');
    var ballPickImage = document.getElementById('apiBallPickImage');
    var ballImageInput = document.getElementById('apiBallImageInput');
    var ballImageDesc = document.getElementById('apiBallImageDesc');
    var ballThumb = document.getElementById('apiBallThumb');
    var ballClearImage = document.getElementById('apiBallClearImage');

    function readBallSettings() {
        var s = { enabled: true, size: 52, icon: 'classic', image: null, x: null, y: null };
        try {
            var raw = localStorage.getItem(BALL_KEY);
            if (raw) Object.assign(s, JSON.parse(raw) || {});
        } catch (e) {}
        return s;
    }
    function writeBallSettings(patch) {
        var s = Object.assign(readBallSettings(), patch || {});
        try { localStorage.setItem(BALL_KEY, JSON.stringify(s)); } catch (e) {}
        try { if (window.parent !== window) window.parent.postMessage({ type: 'apiBallSettings', settings: s }, '*'); } catch (e) {}
        try { if (window.ApiBall && window.ApiBall.apply) window.ApiBall.apply(s); } catch (e) {}
        return s;
    }
    function fillSlider(el) {
        if (!el) return;
        var min = parseFloat(el.min) || 0, max = parseFloat(el.max) || 100;
        var val = parseFloat(el.value) || 0;
        var pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
        el.style.setProperty('--pct', pct + '%');
    }
    function renderBallAppearance(s) {
        if (ballImageDesc) ballImageDesc.textContent = s.image ? '已设置自定义图片' : '未设置 · 使用默认 iOS 圆环';
        if (ballClearImage) ballClearImage.style.display = s.image ? '' : 'none';
        if (ballThumb) {
            if (s.image) {
                ballThumb.style.backgroundImage = 'url("' + s.image + '")';
                ballThumb.classList.add('has-image');
            } else {
                ballThumb.style.backgroundImage = '';
                ballThumb.classList.remove('has-image');
            }
        }
    }
    function fileToBallImage(file) {
        return new Promise(function (resolve) {
            try {
                var reader = new FileReader();
                reader.onload = function () {
                    var img = new Image();
                    img.onload = function () {
                        try {
                            var size = 256;
                            var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
                            var side = Math.min(w, h);
                            var sx = (w - side) / 2, sy = (h - side) / 2;
                            var c = document.createElement('canvas');
                            c.width = size; c.height = size;
                            c.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, size, size);
                            resolve(c.toDataURL('image/jpeg', 0.9));
                        } catch (e) { resolve(reader.result); }
                    };
                    img.onerror = function () { resolve(reader.result); };
                    img.src = reader.result;
                };
                reader.onerror = function () { resolve(null); };
                reader.readAsDataURL(file);
            } catch (e) { resolve(null); }
        });
    }

    var bset = readBallSettings();
    if (ballToggle) {
        ballToggle.checked = bset.enabled !== false;
        ballToggle.addEventListener('change', function () { writeBallSettings({ enabled: this.checked }); });
    }
    if (ballSize) {
        ballSize.value = bset.size || 52;
        if (ballSizeVal) ballSizeVal.textContent = ballSize.value;
        fillSlider(ballSize);
        ballSize.addEventListener('input', function () {
            if (ballSizeVal) ballSizeVal.textContent = this.value;
            fillSlider(this);
        });
        ballSize.addEventListener('change', function () { writeBallSettings({ size: parseInt(this.value, 10) || 52 }); });
    }
    renderBallAppearance(bset);

    if (ballPickImage && ballImageInput) {
        ballPickImage.addEventListener('click', function () { ballImageInput.click(); });
        ballImageInput.addEventListener('change', function () {
            var file = this.files && this.files[0];
            this.value = '';
            if (!file) return;
            fileToBallImage(file).then(function (dataUrl) {
                if (!dataUrl) return;
                var s = writeBallSettings({ image: dataUrl });
                renderBallAppearance(s);
            });
        });
    }
    if (ballClearImage) {
        ballClearImage.addEventListener('click', function () {
            var s = writeBallSettings({ image: null });
            renderBallAppearance(s);
        });
    }
    if (ballReset) {
        ballReset.addEventListener('click', function () { writeBallSettings({ x: null, y: null }); });
    }

    if (window.parent !== window) {
        window.parent.postMessage({ type: 'pageLoaded', page: 'other' }, '*');
    }
})();

// ===== 全局底栏位置调节（作用于所有页面的底栏） =====
(function () {
    'use strict';
    var KEY = 'nanoBottomShift';
    var range = document.getElementById('bottomShift');
    var val = document.getElementById('bottomShiftVal');
    var reset = document.getElementById('bottomShiftReset');

    function read() {
        try { return parseInt(localStorage.getItem(KEY) || '0', 10) || 0; } catch (e) { return 0; }
    }
    function render(n) {
        if (range) range.value = String(n);
        if (val) val.textContent = (n > 0 ? '+' : '') + n;
    }
    function apply(n) {
        n = parseInt(n, 10) || 0;
        try { localStorage.setItem(KEY, String(n)); } catch (e) {}
        render(n);
        if (window.__nanoAppearance && window.__nanoAppearance.applyMessage) {
            try { window.__nanoAppearance.applyMessage({ type: 'nanoBottomShift', value: n }); } catch (e) {}
        }
        if (window.parent !== window) {
            try { window.parent.postMessage({ type: 'nanoBottomShift', value: n }, '*'); } catch (e) {}
        }
    }

    render(read());
    if (range) range.addEventListener('input', function () { apply(this.value); });
    if (reset) reset.addEventListener('click', function () { apply(0); });
})();
