// ============================================================
// nano-tts.js - 全局 TTS：读取「API → TTS」配置，把文字合成语音并播放
// 用法：
//   window.NanoTTS.speak('你好呀')        -> Promise<boolean>
//   window.NanoTTS.stop()                 -> 停止当前播放
//   window.NanoTTS.isConfigured(cb)       -> cb(boolean)
// 支持的接口类型：openai(/audio/speech)、minimax(/t2a_v2)、fishaudio(/v1/tts)、custom(同 openai)
// 配置来源：nano_api_db / api_data / nano_api_config 里的
//   ttsUrl / ttsKey / ttsModel / ttsType / ttsGroupId / ttsVoice(可选)
// ============================================================
(function () {
    'use strict';

    var currentAudio = null;
    var currentUrl = '';

    function parseLocalConfig() {
        try {
            var raw = localStorage.getItem('nano_api_config');
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    function getConfig() {
        return new Promise(function (resolve) {
            try {
                if (!('indexedDB' in window)) { resolve(parseLocalConfig()); return; }
                var req = indexedDB.open('nano_api_db', 2);
                req.onupgradeneeded = function (e) {
                    try {
                        var db = e.target.result;
                        if (!db.objectStoreNames.contains('api_data')) db.createObjectStore('api_data', { keyPath: 'key' });
                        if (!db.objectStoreNames.contains('emoji_data')) db.createObjectStore('emoji_data', { keyPath: 'key' });
                    } catch (err) {}
                };
                req.onsuccess = function (e) {
                    try {
                        var db = e.target.result;
                        var g = db.transaction('api_data', 'readonly').objectStore('api_data').get('nano_api_config');
                        g.onsuccess = function () { resolve((g.result && g.result.value) || parseLocalConfig()); };
                        g.onerror = function () { resolve(parseLocalConfig()); };
                    } catch (err) { resolve(parseLocalConfig()); }
                };
                req.onerror = function () { resolve(parseLocalConfig()); };
            } catch (err) { resolve(parseLocalConfig()); }
        });
    }

    function cleanUrl(u) { return String(u == null ? '' : u).trim().replace(/\/+$/, ''); }
    function toV1(u) {
        var s = cleanUrl(u);
        if (!s) return s;
        if (!/\/v1$/i.test(s)) s += '/v1';
        return s;
    }
    function isConfigured(cfg) {
        cfg = cfg || {};
        return !!(cleanUrl(cfg.ttsUrl) && cfg.ttsKey && cfg.ttsModel);
    }
    function hexToBytes(hex) {
        var h = String(hex || '').replace(/[^0-9a-fA-F]/g, '');
        if (!h || h.length % 2) return null;
        var m = h.match(/.{1,2}/g) || [];
        var a = new Uint8Array(m.length);
        for (var i = 0; i < m.length; i++) a[i] = parseInt(m[i], 16);
        return a;
    }

    async function synth(text, cfg) {
        var base = toV1(cfg.ttsUrl);
        var type = cfg.ttsType || 'openai';
        if (type === 'minimax') {
            var mmUrl = base + '/t2a_v2' + (cfg.ttsGroupId ? ('?GroupId=' + encodeURIComponent(cfg.ttsGroupId)) : '');
            var mmBody = {
                model: cfg.ttsModel,
                text: text,
                stream: false,
                voice_setting: { voice_id: cfg.ttsModel, speed: 1, vol: 1, pitch: 0 },
                audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3' }
            };
            var mmResp = await fetch(mmUrl, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + cfg.ttsKey, 'Content-Type': 'application/json' },
                body: JSON.stringify(mmBody)
            });
            if (!mmResp.ok) {
                var mmMsg = 'HTTP ' + mmResp.status;
                try { var mmData = await mmResp.json(); mmMsg = (mmData.base_resp && mmData.base_resp.status_msg) || (mmData.error && mmData.error.message) || mmMsg; } catch (e) {}
                throw new Error(mmMsg);
            }
            var mmJson = await mmResp.json();
            var audioHex = mmJson && mmJson.data && mmJson.data.audio;
            if (audioHex) {
                var bytes = hexToBytes(audioHex);
                if (bytes) return new Blob([bytes], { type: 'audio/mpeg' });
            }
            if (mmJson && mmJson.audio_file) {
                var af = await fetch(mmJson.audio_file);
                return await af.blob();
            }
            throw new Error('TTS 未返回音频');
        }
        if (type === 'fishaudio') {
            // Fish Audio：POST {host}/v1/tts，reference_id 即所选音色（模型）id
            var fishRoot = base.replace(/\/v1$/i, '');
            var fishResp = await fetch(fishRoot + '/v1/tts', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + cfg.ttsKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: text,
                    reference_id: cfg.ttsVoice || cfg.ttsModel,
                    format: 'mp3',
                    mp3_bitrate: 128,
                    chunk_length: 200,
                    normalize: true
                })
            });
            if (!fishResp.ok) {
                var fMsg = 'HTTP ' + fishResp.status;
                try { var fData = await fishResp.json(); fMsg = fData.message || (fData.error && fData.error.message) || fMsg; } catch (e) {}
                throw new Error(fMsg);
            }
            return await fishResp.blob();
        }
        // openai / custom
        var body = {
            model: cfg.ttsModel,
            input: text,
            voice: cfg.ttsVoice || 'alloy',
            response_format: 'mp3'
        };
        var resp = await fetch(base + '/audio/speech', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + cfg.ttsKey, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!resp.ok) {
            var msg = 'HTTP ' + resp.status;
            try { var d = await resp.json(); msg = (d.error && d.error.message) || d.message || msg; } catch (e) {}
            throw new Error(msg);
        }
        return await resp.blob();
    }

    function playBlob(blob) {
        return new Promise(function (resolve, reject) {
            try {
                stop();
                var url = URL.createObjectURL(blob);
                currentUrl = url;
                var audio = new Audio(url);
                currentAudio = audio;
                audio.onended = function () {
                    try { URL.revokeObjectURL(url); } catch (e) {}
                    if (currentUrl === url) currentUrl = '';
                    if (currentAudio === audio) currentAudio = null;
                    resolve(true);
                };
                audio.onerror = function () {
                    try { URL.revokeObjectURL(url); } catch (e) {}
                    if (currentUrl === url) currentUrl = '';
                    if (currentAudio === audio) currentAudio = null;
                    reject(new Error('音频播放失败'));
                };
                var p = audio.play();
                if (p && typeof p.catch === 'function') p.catch(reject);
            } catch (e) { reject(e); }
        });
    }

    function stop() {
        if (currentAudio) {
            try { currentAudio.pause(); } catch (e) {}
            currentAudio = null;
        }
        if (currentUrl) {
            try { URL.revokeObjectURL(currentUrl); } catch (e) {}
            currentUrl = '';
        }
    }

    async function speak(text, opts) {
        opts = opts || {};
        var t = String(text == null ? '' : text).trim();
        if (!t) return false;
        var cfg = await getConfig();
        if (opts.config) cfg = Object.assign({}, cfg, opts.config);
        if (!isConfigured(cfg)) return false;
        var blob = await synth(t, cfg);
        return await playBlob(blob);
    }

    window.NanoTTS = {
        speak: function (text, opts) { return speak(text, opts).catch(function (e) { console.warn('[TTS] 失败:', e && e.message ? e.message : e); return false; }); },
        stop: stop,
        isConfigured: function (cb) {
            getConfig().then(function (cfg) { try { cb(isConfigured(cfg)); } catch (e) {} });
        }
    };
})();
