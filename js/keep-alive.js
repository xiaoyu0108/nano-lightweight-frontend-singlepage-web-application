/* ============================================================
   keep-alive.js — 保活（切 App / 锁屏后让定时生成继续跑）

   原理（iOS PWA 能用的全部手段）：
     1. 音频保活：循环播放一段「听不见但非静音」的极低音，iOS 会为该页面
        维持音频会话，页面不会被立刻挂起 → setInterval / fetch / 自动发消息
        / 自动发朋友圈 得以继续运行。
     2. MediaSession：让锁屏 / 灵动岛显示「Nano 保活中」，同时让音频会话更稳。
     3. Wake Lock：前台时保持屏幕常亮（不影响后台，后台靠音频保活）。
     4. 复活动作：切回前台 / 音频被系统暂停时自动重新播放、重新申请 Wake Lock。

   用法：
     NanoKeepAlive.start()        // 开启（会写入 nano_keep_alive=1）
     NanoKeepAlive.stop()         // 关闭
     NanoKeepAlive.enabled()      // 是否开启
     NanoKeepAlive.isRunning()    // 音频是否真的在播

   注意：
   · 音频必须由「用户手势」解锁后才能播放，所以开启后第一次触摸页面会自动 resume。
   · 子页面（iframe）调用 start() 会转发给主框架，由主框架统一播放，避免多路音频。
   · iOS 不保证永久后台运行：音频被系统掐断后可能被挂起，切回前台会自动恢复。
   ============================================================ */
(function () {
    'use strict';

    var KEY = 'nano_keep_alive';
    var audioEl = null;
    var audioUrl = '';
    var wakeLock = null;
    var unlocked = false;
    var restarting = false;
    var mediaSet = false;

    function enabled() {
        try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
    }
    function setFlag(on) {
        try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
    }

    // 生成一段极短、听不见但非静音的 WAV（20Hz、±1/128 振幅），避免被判定为静音而掐断会话
    function wavUrl() {
        if (audioUrl) return audioUrl;
        try {
            var rate = 8000, seconds = 10, n = rate * seconds;
            var buf = new ArrayBuffer(44 + n);
            var dv = new DataView(buf);
            function put(off, s) { for (var i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); }
            put(0, 'RIFF'); dv.setUint32(4, 36 + n, true); put(8, 'WAVE');
            put(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
            dv.setUint32(24, rate, true); dv.setUint32(28, rate, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
            put(36, 'data'); dv.setUint32(40, n, true);
            for (var j = 0; j < n; j++) {
                var v = 128 + Math.round(Math.sin(2 * Math.PI * 20 * j / rate));
                dv.setUint8(44 + j, Math.max(0, Math.min(255, v)));
            }
            audioUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
        } catch (e) { audioUrl = ''; }
        return audioUrl;
    }

    function ensureAudio() {
        if (audioEl) return audioEl;
        try {
            audioEl = document.createElement('audio');
            audioEl.setAttribute('playsinline', '');
            audioEl.setAttribute('webkit-playsinline', '');
            audioEl.setAttribute('aria-hidden', 'true');
            audioEl.loop = true;
            audioEl.preload = 'auto';
            audioEl.volume = 0.04;              // 几乎听不见，但不能是 0
            audioEl.src = wavUrl();
            audioEl.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
            (document.body || document.documentElement).appendChild(audioEl);
            // 只处理「真的停了」的情况；不要监听 suspend/stalled（缓冲时也会触发，
            // 会导致反复 play/pause，灵动岛/状态一闪一闪）
            ['pause', 'ended'].forEach(function (ev) {
                audioEl.addEventListener(ev, function () {
                    if (!enabled() || restarting) return;
                    restarting = true;
                    setTimeout(function () {
                        restarting = false;
                        if (!enabled() || !audioEl.paused) return;
                        try { audioEl.play().catch(function () {}); } catch (e) {}
                    }, 1200);
                });
            });
        } catch (e) {}
        return audioEl;
    }

    function setMediaSession() {
        try {
            if (!navigator.mediaSession || typeof window.MediaMetadata !== 'function') return;
            try { navigator.mediaSession.playbackState = 'playing'; } catch (e) {}
            if (mediaSet) return;                 // 只设一次，避免元数据反复刷新导致灵动岛闪烁
            mediaSet = true;
            navigator.mediaSession.metadata = new window.MediaMetadata({
                title: 'Nano 保活中',
                artist: '定时生成 / 自动消息继续运行',
                album: 'Nano',
                artwork: [
                    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
                ]
            });
            // 锁屏 / 灵动岛上的按钮：暂停不生效，播放会立刻续上
            try { navigator.mediaSession.setActionHandler('pause', function () {}); } catch (e) {}
            try { navigator.mediaSession.setActionHandler('play', function () { play(); }); } catch (e) {}
        } catch (e) {}
    }

    function requestWakeLock() {
        try {
            if (!enabled() || !navigator.wakeLock || !navigator.wakeLock.request) return;
            navigator.wakeLock.request('screen').then(function (s) {
                wakeLock = s;
                try { s.addEventListener('release', function () { wakeLock = null; }); } catch (e) {}
            }).catch(function () {});
        } catch (e) {}
    }
    function releaseWakeLock() {
        try { if (wakeLock) wakeLock.release(); } catch (e) {}
        wakeLock = null;
    }

    function play() {
        var a = ensureAudio();
        if (!a) return;
        // iOS 17+：声明为 playback 音频会话，系统更不容易把页面挂起
        try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
        try {
            var p = a.play();
            if (p && p.catch) p.catch(function () {});
        } catch (e) {}
    }

    function isRunning() {
        try { return !!(audioEl && !audioEl.paused); } catch (e) { return false; }
    }

    // 主框架内部使用：真正开始播放
    var beatTimer = null;
    function writeState(running) {
        try { localStorage.setItem('nano_keep_alive_state', JSON.stringify({ running: !!running, at: Date.now() })); } catch (e) {}
    }
    function startBeat() {
        writeState(isRunning());
        if (beatTimer) return;
        // 每 20 秒写一次心跳：其它页面据此判断保活是否真的在跑
        beatTimer = setInterval(function () { writeState(isRunning()); }, 20000);
    }
    function stopBeat() {
        if (beatTimer) { clearInterval(beatTimer); beatTimer = null; }
        writeState(false);
    }

    function enableLocal() {
        setFlag(true);
        play();
        setMediaSession();
        requestWakeLock();
        startBeat();
    }

    function start() {
        setFlag(true);
        if (window.parent !== window) {
            // 子页面：交给主框架统一播放，避免多份音频
            try { window.parent.postMessage({ type: 'keepAlive', enabled: true }, '*'); } catch (e) {}
            return;
        }
        enableLocal();
    }

    function stop() {
        setFlag(false);
        stopBeat();
        releaseWakeLock();
        try {
            if (navigator.mediaSession) navigator.mediaSession.playbackState = 'paused';
        } catch (e) {}
        try { if (audioEl) audioEl.pause(); } catch (e) {}
        if (window.parent !== window) {
            try { window.parent.postMessage({ type: 'keepAlive', enabled: false }, '*'); } catch (e) {}
        }
    }

    // iOS 要求音频由用户手势解锁：开启保活后第一次触摸自动续播
    function bindUnlock() {
        if (unlocked) return;
        unlocked = true;
        var handler = function () {
            if (enabled()) { play(); setMediaSession(); if (window.parent === window) startBeat(); }
            document.removeEventListener('touchend', handler, true);
            document.removeEventListener('click', handler, true);
        };
        document.addEventListener('touchend', handler, true);
        document.addEventListener('click', handler, true);
    }

    // 切回前台 / 页面可见性变化时恢复
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible' && enabled() && window.parent === window) {
            play();
            setMediaSession();
            requestWakeLock();
        }
    });
    window.addEventListener('pageshow', function () {
        if (enabled() && window.parent === window) { play(); }
    });

    window.NanoKeepAlive = {
        enabled: enabled,
        isRunning: isRunning,
        start: start,
        stop: stop,
        // 主框架消息处理用
        apply: function (on) { on ? enableLocal() : stop(); },
        unlockAudio: bindUnlock
    };

    // 页面加载时若已开启：主框架自动续播，并对首次触摸做解锁
    if (enabled()) {
        bindUnlock();
        if (window.parent === window) {
            try { enableLocal(); } catch (e) {}
        }
    }
})();
