// nano-notify.js — 通知中心（系统通知 + 内置提示音，可在「更多 → 其他」里开关与切换）
(function () {
    'use strict';

    var ENABLE_KEY = 'nano_notify_enabled';
    var SOUND_KEY = 'nano_notify_sound';
    var DEFAULT_SOUND = 'ding';

    var SOUNDS = [
        { id: 'ding', name: '清脆' },
        { id: 'drop', name: '水滴' },
        { id: 'pop', name: '气泡' },
        { id: 'chime', name: '和弦' },
        { id: 'tri', name: '三全音' },
        { id: 'none', name: '静音' }
    ];

    function enabled() {
        try { return localStorage.getItem(ENABLE_KEY) === '1'; } catch (e) { return false; }
    }
    function currentSound() {
        try { return localStorage.getItem(SOUND_KEY) || DEFAULT_SOUND; } catch (e) { return DEFAULT_SOUND; }
    }

    // ===== 分应用提示音：每个 App 可以单独指定声音，没设就跟随全局 =====
    var CHANNEL_KEY = 'nano_notify_channel_sounds';
    var CHANNELS = [
        { id: 'chat', name: '私聊' },
        { id: 'group', name: '群聊' },
        { id: 'music', name: '一起听' },
        { id: 'books', name: '一起看' },
        { id: 'ins', name: 'Instagram' },
        { id: 'halo', name: 'Halo' },
        { id: 'moment', name: '朋友圈 / 自动发帖' }
    ];
    function channelMap() {
        try { return JSON.parse(localStorage.getItem(CHANNEL_KEY) || '{}') || {}; } catch (e) { return {}; }
    }
    function channelSound(ch) {
        var m = channelMap();
        return (ch && m[ch]) ? m[ch] : '';
    }
    function setChannelSound(ch, soundId) {
        if (!ch) return;
        var m = channelMap();
        if (soundId) m[ch] = soundId; else delete m[ch];
        try { localStorage.setItem(CHANNEL_KEY, JSON.stringify(m)); } catch (e) {}
    }
    function soundFor(opts) {
        opts = opts || {};
        return channelSound(opts.channel) || opts.sound || currentSound();
    }

    var audioCtx = null;
    function getCtx() {
        try {
            if (!audioCtx) {
                var AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return null;
                audioCtx = new AC();
            }
            if (audioCtx.state === 'suspended') { try { audioCtx.resume(); } catch (e) {} }
            return audioCtx;
        } catch (e) { return null; }
    }

    function tone(ctx, freq, start, dur, type, peak) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(peak || 0.28, ctx.currentTime + start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur + 0.02);
    }

    function playSound(name) {
        name = name || currentSound();
        if (name === 'none') return;
        var ctx = getCtx();
        if (!ctx) return;
        try {
            if (name === 'drop') {
                tone(ctx, 880, 0, 0.16, 'sine', 0.25);
                tone(ctx, 1420, 0.05, 0.18, 'sine', 0.18);
            } else if (name === 'pop') {
                tone(ctx, 420, 0, 0.09, 'triangle', 0.3);
                tone(ctx, 780, 0.05, 0.12, 'triangle', 0.22);
            } else if (name === 'chime') {
                tone(ctx, 660, 0, 0.3, 'sine', 0.2);
                tone(ctx, 990, 0.06, 0.34, 'sine', 0.17);
                tone(ctx, 1320, 0.12, 0.36, 'sine', 0.14);
            } else if (name === 'tri') {
                tone(ctx, 1046, 0, 0.18, 'sine', 0.24);
                tone(ctx, 784, 0.16, 0.26, 'sine', 0.2);
            } else {
                tone(ctx, 1174, 0, 0.16, 'sine', 0.28);
                tone(ctx, 1568, 0.06, 0.2, 'sine', 0.2);
            }
        } catch (e) {}
    }

    function ensurePermission() {
        try {
            if ('Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission();
            }
        } catch (e) {}
    }

    function notify(title, body, opts) {
        opts = opts || {};
        if (!enabled() && !opts.force) return;
        playSound(soundFor(opts));
        var payload = {
            body: String(body || '').slice(0, 120),
            tag: opts.tag || ('nano-' + Date.now()),
            silent: true,
            data: { target: opts.target || '' }
        };
        function legacy() {
            try {
                var n = new Notification(title || 'Nano', payload);
                n.onclick = function () {
                    try { window.focus(); } catch (e) {}
                    try { if (window.parent !== window) window.parent.postMessage({ type: 'notifyOpen', target: opts.target || '' }, '*'); } catch (e) {}
                    try { n.close(); } catch (e) {}
                };
            } catch (e) {}
        }
        try {
            if (!('Notification' in window) || Notification.permission !== 'granted') return;
            // 优先走 Service Worker：应用退到后台/锁屏时也能稳定弹出，点击由 sw.js 带回 target
            if (navigator.serviceWorker && navigator.serviceWorker.ready) {
                var settled = false;
                // SW 未注册时 ready 永不 resolve，加超时兜底改用 new Notification
                var fb = setTimeout(function () {
                    if (settled) return;
                    settled = true;
                    legacy();
                }, 600);
                navigator.serviceWorker.ready.then(function (reg) {
                    if (settled) return;
                    settled = true;
                    clearTimeout(fb);
                    if (reg && reg.showNotification) {
                        try { reg.showNotification(title || 'Nano', payload); return; } catch (e) {}
                    }
                    legacy();
                }).catch(function () {
                    if (settled) return;
                    settled = true;
                    clearTimeout(fb);
                    legacy();
                });
            } else {
                legacy();
            }
        } catch (e) {}
    }

    window.NanoNotify = {
        notify: notify,
        playSound: playSound,
        ensurePermission: ensurePermission,
        enabled: enabled,
        currentSound: currentSound,
        sounds: SOUNDS,
        channels: CHANNELS,
        channelSound: channelSound,
        setChannelSound: setChannelSound,
        soundFor: soundFor
    };
})();
