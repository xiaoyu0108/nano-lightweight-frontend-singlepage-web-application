// ============================================================
// online-catchup.js — 「上线补发」
// 打开 App（回到前台）后，从你最近 24 小时聊过、且开启了「主动发消息」的角色里
// 挑 1~2 位，主动给你发一条和上下文强相关的消息（含心声 + 1~3 条气泡）。
// 仅在 App 外壳（index.html）运行。背景：网页被系统挂起后无法真正后台定时发消息，
// 所以把「主动发消息」的补发放在你重新上线的时机完成。
// 关闭：localStorage.setItem('nano_online_catchup','0')
// ============================================================
(function () {
    'use strict';
    if (window.top !== window.self) return;
    if (window.__nanoOnlineCatchupLoaded) return;
    window.__nanoOnlineCatchupLoaded = true;

    var ENABLE_KEY = 'nano_online_catchup';
    var AT_KEY = 'nano_online_catchup_at';
    var DONE_KEY = 'nano_online_catchup_done';
    var MIN_MS = 3 * 3600 * 1000;         // 两次补发至少间隔 3 小时
    var RECENT_MS = 24 * 3600 * 1000;     // 只挑 24 小时内聊过的
    var PER_CHAR_MS = 20 * 3600 * 1000;   // 同一角色 20 小时内不重复补发
    var MAX_CHARS = 2;
    var running = false;

    function enc(s) { return encodeURIComponent(String(s == null ? '' : s)); }
    function enabled() { try { return localStorage.getItem(ENABLE_KEY) !== '0'; } catch (e) { return true; } }
    function readJSON(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } }
    function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
    function apiCfg() { try { return JSON.parse(localStorage.getItem('nano_api_config') || 'null'); } catch (e) { return null; } }
    function ep(raw) { var s = String(raw || '').trim().replace(/\/+$/, ''); if (!s) return ''; if (!/\/v1$/i.test(s)) s += '/v1'; return s + '/chat/completions'; }

    function readChars() {
        return new Promise(function (resolve) {
            var done = false; function fin(v) { if (!done) { done = true; resolve(v); } }
            try {
                var req = indexedDB.open('nano_characters_db');
                req.onerror = function () { fin([]); };
                req.onsuccess = function (e) {
                    try {
                        var db = e.target.result;
                        if (!db.objectStoreNames.contains('characters')) { try { db.close(); } catch (x) {} fin([]); return; }
                        var r = db.transaction('characters', 'readonly').objectStore('characters').getAll();
                        r.onsuccess = function () { var a = r.result || []; try { db.close(); } catch (x) {} fin(a); };
                        r.onerror = function () { try { db.close(); } catch (x) {} fin([]); };
                    } catch (err) { fin([]); }
                };
            } catch (e) { fin([]); }
            setTimeout(function () { fin([]); }, 2500);
        });
    }
    function lastActive(id) { try { return parseInt(localStorage.getItem('nano_last_ai_' + id) || '0', 10) || 0; } catch (e) { return 0; } }
    function autoMsgOn(id) { try { var v = localStorage.getItem('chat_setting_autoMsg_' + id); if (v == null) return false; return JSON.parse(v) === true; } catch (e) { return false; } }

    // 打开该角色的会话并取回人设 / 世界书 / 记忆 / 最近对话 / API 配置
    function fetchContext(info) {
        return new Promise(function (resolve) {
            var done = false, last = null;
            var onMsg = function (e) {
                var d = e && e.data;
                if (!d || d.type !== 'NANO_TAKEOVER_CONTEXT') return;
                last = d.context || null;
                if (last && (last.persona || last.worldbook || last.memory || last.api)) { done = true; window.removeEventListener('message', onMsg); resolve(last); }
            };
            window.addEventListener('message', onMsg);
            var sh = window.__nanoShell;
            if (sh && sh.open) sh.open('chat_inner.html?chat=' + enc(info.id) + '&name=' + enc(info.name), '', 'main');
            var n = 0;
            var ask = function () {
                if (done) return;
                try { if (sh && sh.postToChat) sh.postToChat({ type: 'NANO_TAKEOVER_GET_CONTEXT' }); } catch (e) {}
                n++;
                if (n < 12 && !done) setTimeout(ask, 600);
            };
            setTimeout(ask, 900);
            setTimeout(function () { if (!done) { done = true; window.removeEventListener('message', onMsg); resolve(last); } }, 5500);
        });
    }

    function sysText(info, ctx) {
        var lines = ['你是「' + (info.name || '角色') + '」，现在你想主动联系对方（你正在聊天的那个人）。'];
        if (ctx && ctx.persona) lines.push('\n【你的人设 · 必须严格遵守】\n' + ctx.persona);
        if (ctx && ctx.worldbook) lines.push('\n【世界书】\n' + ctx.worldbook);
        if (ctx && ctx.memory) lines.push('\n【你们的共同记忆】\n' + ctx.memory);
        if (ctx && ctx.recent) lines.push('\n【你们最近的对话】\n' + ctx.recent);
        lines.push('\n【要求】主动发一条消息：必须接住上面最近对话里的话题、情绪或没说完的事，强相关；绝不能是口水话（禁止“在吗/在干嘛/吃了吗/睡了吗”“想你了”却没下文这类没信息量的句子），禁止汇报日常流水账，禁止括号旁白，禁止复述设定。写 1~3 条气泡，每条 1~2 句、口语自然；最后另起一行单独输出心声：[heart:此刻印象||心声独白]（心声 90 字以上、平实口语、禁止煽情浮夸）。只输出气泡与心声，不要任何解释。');
        return lines.join('\n');
    }

    function parseOutput(text) {
        var body = String(text || '');
        var heart = null;
        var hm = body.match(/\[(?:heart|心声)\s*:\s*([\s\S]*?)\]/i);
        if (hm) {
            var hp = String(hm[1] || '').trim();
            var sep = hp.indexOf('||');
            heart = sep !== -1 ? { subject: hp.slice(0, sep).trim(), thought: hp.slice(sep + 2).trim() } : { subject: '', thought: hp };
            body = body.replace(hm[0], '');
        }
        var THINK_W = 'think(?:ing)?|thought|reasoning|analysis|cot|思考|思维链';
        body = body.replace(new RegExp('\\[\\s*(?:' + THINK_W + ')\\s*\\][\\s\\S]*?\\[\\s*\\/\\s*(?:' + THINK_W + ')\\s*\\]', 'gi'), ' ');
        body = body.replace(new RegExp('\\[\\s*\\/?\\s*(?:' + THINK_W + ')\\s*\\]', 'gi'), ' ');
        body = body.replace(/\[[^\]]*\]/g, ' ');
        var bubbles = String(body).split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 3);
        return { bubbles: bubbles, heart: heart };
    }

    var _apiCache = null;
    function readApiConfig() {
        return new Promise(function (resolve) {
            if (_apiCache) { resolve(_apiCache); return; }
            var done = false; function fin(v) { if (!done) { done = true; resolve(v); } }
            try {
                if (!('indexedDB' in window)) { fin(null); return; }
                var req = indexedDB.open('nano_api_db');
                req.onerror = function () { fin(null); };
                req.onsuccess = function (e) {
                    try {
                        var db = e.target.result;
                        if (!db.objectStoreNames.contains('api_data')) { try { db.close(); } catch (x) {} fin(null); return; }
                        var r = db.transaction('api_data', 'readonly').objectStore('api_data').get('nano_api_config');
                        r.onsuccess = function () { var v = r.result ? r.result.value : null; try { db.close(); } catch (x) {} _apiCache = v; fin(v); };
                        r.onerror = function () { try { db.close(); } catch (x) {} fin(null); };
                    } catch (err) { fin(null); }
                };
            } catch (e) { fin(null); }
            setTimeout(function () { fin(null); }, 2500);
        });
    }

    async function callModel(ctx, sys, user) {
        var cfg = (ctx && ctx.api && ctx.api.url && ctx.api.key && ctx.api.model) ? ctx.api : (apiCfg() || await readApiConfig());
        if (!cfg) return null;
        var url = ep(cfg.url || cfg.mainUrl);
        var key = cfg.key || cfg.mainKey;
        var model = cfg.model || cfg.mainModel;
        if (!url || !key || !model) return null;
        try {
            var resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
                body: JSON.stringify({ model: model, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], max_tokens: 900, temperature: 0.9 })
            });
            if (!resp.ok) return null;
            var data = await resp.json();
            return data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        } catch (e) { return null; }
    }

    async function nudge(info) {
        var ctx = (await fetchContext(info)) || {};
        var content = await callModel(ctx, sysText(info, ctx), '（现在主动给对方发一条强相关的消息。）');
        if (!content) return false;
        var out = parseOutput(content);
        if (!out.bubbles.length) return false;
        var sh = window.__nanoShell;
        if (!sh) return false;
        for (var i = 0; i < out.bubbles.length; i++) {
            try {
                if (sh.postToChat) sh.postToChat({ type: 'NANO_CHAR_SAY', chatId: String(info.id), text: String(out.bubbles[i]), heart: out.heart || null });
            } catch (e) {}
            await new Promise(function (r) { setTimeout(r, 500); });
        }
        try { if (window.__nanoAppNotify) window.__nanoAppNotify(info.name || 'TA', String(out.bubbles[0]).slice(0, 60), 'social', { pink: true, target: 'chat:' + info.id }); } catch (e) {}
        return true;
    }

    async function run() {
        if (running || !enabled() || document.hidden) return;
        var last = 0; try { last = parseInt(localStorage.getItem(AT_KEY) || '0', 10) || 0; } catch (e) {}
        if (Date.now() - last < MIN_MS) return;
        running = true;
        try { localStorage.setItem(AT_KEY, String(Date.now())); } catch (e) {}
        try {
            var chars = await readChars();
            var done = readJSON(DONE_KEY, {}) || {};
            var now = Date.now();
            var cand = chars.filter(function (c) {
                return c && c.id && !c.nanoAssistant && autoMsgOn(c.id) &&
                    (now - lastActive(c.id) < RECENT_MS) &&
                    !(done[c.id] && (now - done[c.id] < PER_CHAR_MS));
            });
            if (!cand.length) return;
            cand.sort(function (a, b) { return lastActive(b.id) - lastActive(a.id); });
            var n = Math.min(MAX_CHARS, cand.length);
            n = (Math.random() < 0.5) ? 1 : n;
            var picks = cand.slice(0, Math.max(1, n));
            for (var i = 0; i < picks.length; i++) {
                var ok = await nudge({ id: String(picks[i].id), name: String(picks[i].name || picks[i].id), avatar: picks[i].avatar || '' });
                if (ok) { done[picks[i].id] = Date.now(); writeJSON(DONE_KEY, done); }
                await new Promise(function (r) { setTimeout(r, 1500); });
            }
        } finally { running = false; }
    }

    window.NanoOnlineCatchup = { run: run, enabled: enabled };

    function schedule() { setTimeout(function () { try { run(); } catch (e) {} }, 7000); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule);
    else schedule();
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) setTimeout(function () { try { run(); } catch (e) {} }, 3000);
    });
})();
