// ============================================================
// screen-share.js — 「让 TA 看你真实的屏幕」（掌心窗）
// 用 getDisplayMedia 采集屏幕 → 定时截帧 → 交给能识图的模型
// → TA 以人设实时短评。桌面 Chrome/Edge、安卓 Chrome 可用；
// iOS Safari 不支持屏幕采集。
// 入口：查手机 → 设置 → 让 TA 看我的真实屏幕（测试）
// ============================================================
(function () {
    'use strict';

    var INTERVAL = 30000; // 每 30 秒看一帧，省调用/token
    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function enc(s) { return encodeURIComponent(String(s == null ? '' : s)); }
    function escHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); }
    function shell() { return window.__nanoShell || null; }
    function splitBy(t) { var p = String(t || '').split('||'); return { main: (p[0] || '').trim(), sub: (p[1] || '').trim() }; }
    function firstJson(text) {
        var s = String(text || ''), fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fence) s = fence[1];
        var i = s.indexOf('{'); if (i === -1) return null;
        var d = 0, inStr = false, esc = false;
        for (var k = i; k < s.length; k++) {
            var ch = s[k];
            if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
            if (ch === '"') inStr = true; else if (ch === '{') d++; else if (ch === '}') { d--; if (d === 0) { try { return JSON.parse(s.slice(i, k + 1)); } catch (e) { return null; } } }
        }
        return null;
    }

    var SS = { active: false, info: null, cfg: null, ctx: {}, stream: null, panel: null, log: null, statusEl: null, video: null, lastAt: 0, busy: false, timer: null, comments: [], cardPosted: false };
    // 面板放在外壳（index.html）里，切到别的页面也会一直显示；点评同时收集成一张卡片
    function postCard() {
        if (SS.cardPosted || !SS.info || !SS.comments.length) return;
        SS.cardPosted = true;
        try {
            var s = shell(); if (!s || !s.postToChat) return;
            var detail = '（' + (SS.info.name || 'TA') + ' 看了你的屏幕）\n' + SS.comments.map(function (b) {
                var p = splitBy(b); return '　' + p.main + (p.sub ? ('（' + p.sub + '）') : '');
            }).join('\n');
            s.postToChat({
                type: 'NANO_TAKEOVER_CARD',
                chatId: String(SS.info.id),
                title: (SS.info.name || 'TA') + ' 看了你的屏幕',
                summary: '共 ' + SS.comments.length + ' 条点评',
                detail: detail,
                log: [{ name: '屏幕', bubbles: SS.comments.slice() }],
                startedAt: Date.now()
            });
        } catch (e) {}
    }

    /* ---------------- API ---------------- */
    function parseLocal() { try { var raw = localStorage.getItem('nano_api_config'); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
    function getApiConfig() {
        return new Promise(function (resolve) {
            var done = false;
            var local = parseLocal();
            function finish(v) { if (done) return; done = true; resolve(v); }
            try {
                if (!('indexedDB' in window)) { finish(local); return; }
                var req = indexedDB.open('nano_api_db');
                req.onupgradeneeded = function (e) { try { var db = e.target.result;
                    if (!db.objectStoreNames.contains('api_data')) db.createObjectStore('api_data', { keyPath: 'key' });
                    if (!db.objectStoreNames.contains('emoji_data')) db.createObjectStore('emoji_data', { keyPath: 'key' });
                } catch (err) {} };
                req.onblocked = function () { finish(local); };
                req.onerror = function () { finish(local); };
                req.onsuccess = function (e) { try {
                    var db = e.target.result;
                    if (!db.objectStoreNames.contains('api_data')) { try { db.close(); } catch (err) {} finish(local); return; }
                    var g = db.transaction('api_data', 'readonly').objectStore('api_data').get('nano_api_config');
                    g.onsuccess = function () { var v = (g.result && g.result.value) || local; try { db.close(); } catch (err) {} finish(v); };
                    g.onerror = function () { try { db.close(); } catch (err) {} finish(local); };
                } catch (err) { finish(local); } };
            } catch (err) { finish(local); }
            setTimeout(function () { finish(local); }, 4000);
        });
    }
    function apiEndpoint(raw) { var s = String(raw || '').trim().replace(/\/+$/, ''); if (!s) return ''; if (!/\/v1$/i.test(s)) s += '/v1'; return s + '/chat/completions'; }

    /* ---------------- 人设上下文 ---------------- */
    function requestContext(info) {
        return new Promise(function (resolve) {
            var done = false, last = null;
            var onMsg = function (e) {
                var d = e && e.data;
                if (!d || d.type !== 'NANO_TAKEOVER_CONTEXT') return;
                last = d.context || null;
                if (last && (last.persona || last.worldbook || last.memory || last.api)) { done = true; window.removeEventListener('message', onMsg); resolve(last); }
            };
            window.addEventListener('message', onMsg);
            var s = shell();
            if (s && s.open) s.open('chat_inner.html?chat=' + enc(info.id) + '&name=' + enc(info.name), '', 'main');
            var tries = 0;
            var ask = function () {
                if (done) return;
                var sh = shell();
                if (sh && sh.postToChat) { try { sh.postToChat({ type: 'NANO_TAKEOVER_GET_CONTEXT' }); } catch (e) {} }
                tries++;
                if (tries < 8 && !done) setTimeout(ask, 500);
            };
            setTimeout(ask, 700);
            setTimeout(function () { if (!done) { done = true; window.removeEventListener('message', onMsg); resolve(last); } }, 4500);
        });
    }
    function systemText() {
        var ctx = SS.ctx || {}, name = (SS.info && SS.info.name) || '角色';
        var lines = ['你是「' + name + '」，现在你能看到用户真实手机/电脑屏幕的画面（用户主动共享给你看）。'];
        if (ctx.persona) lines.push('\n【你的人物设定 · 必须严格遵守】\n' + ctx.persona);
        if (ctx.worldbook) lines.push('\n【世界书设定】\n' + ctx.worldbook);
        if (ctx.memory) lines.push('\n【你和用户的共同记忆】\n' + ctx.memory);
        if (ctx.foreign) lines.push('\n【语言】你是外国角色：每条先写母语原文，再紧跟中文翻译，用 || 分隔。');
        lines.push('\n【要求】像就在 TA 旁边看着一样，用你的人设随口点评当前画面：可以吐槽、惊讶、关心、吃醋、好奇。每次 1-2 条短气泡，口语、有细节、别像旁白。全程贴合人设，不要油腻。只输出 JSON：{"bubbles":["..."]}');
        return lines.join('\n');
    }

    /* ---------------- UI ---------------- */
    function injectCss() {
        if (document.getElementById('ssCss')) return;
        var st = document.createElement('style'); st.id = 'ssCss';
        st.textContent = [
            '.ss-panel{position:fixed;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:100400;width:min(80vw,300px);',
            'background:linear-gradient(180deg,#fff7fb,#fffdf4);border-radius:18px;box-shadow:0 14px 44px rgba(150,90,110,.32);overflow:hidden;',
            'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",Arial,sans-serif}',
            '.ss-head{display:flex;align-items:center;gap:8px;padding:10px 12px}',
            '.ss-ava{width:28px;height:28px;border-radius:50%;background:#ffe1ea no-repeat center/cover;flex:none;display:grid;place-items:center;color:#b23a5b;font-size:12px}',
            '.ss-name{font-size:13px;font-weight:700;color:#b23a5b}',
            '.ss-status{font-size:10px;color:#b08a97;margin-top:1px}',
            '.ss-stop{margin-left:auto;border:0;background:#ffe1ea;color:#b23a5b;border-radius:12px;padding:6px 10px;font-size:11px;font-weight:700}',
            '.ss-video{width:100%;max-height:140px;object-fit:cover;display:block;background:#111}',
            '.ss-log{padding:8px 12px 12px;max-height:150px;overflow-y:auto;display:flex;flex-direction:column;gap:6px}',
            '.ss-bub{background:#fff3cf;color:#7a5c12;border-radius:999px;padding:7px 13px;font-size:13px;line-height:1.5;align-self:flex-start;max-width:94%}',
            '.ss-bub .zh{display:block;font-size:10.5px;color:#b09a55}',
            '.ss-line{font-size:11px;color:#b08a97}',
            '.ss-line.err{color:#d76a7a}',
            '.ss-confirm{position:fixed;inset:0;z-index:100450;background:rgba(60,40,50,.4);display:grid;place-items:center;padding:24px}',
            '.ss-dialog{width:min(86vw,320px);background:linear-gradient(180deg,#fff7fb,#fffdf4);border-radius:20px;padding:20px 18px 14px;text-align:center;color:#5a4a52;box-shadow:0 20px 60px rgba(120,70,90,.28)}',
            '.ss-dialog h3{margin:0 0 6px;font-size:16px;color:#b23a5b}',
            '.ss-dialog p{margin:0 0 16px;font-size:12.5px;color:#a98b96;line-height:1.6}',
            '.ss-actions{display:flex;gap:10px}',
            '.ss-actions button{flex:1;height:42px;border:0;border-radius:13px;font-size:14px;font-weight:700}',
            '.ss-cancel{background:#f4eef0;color:#8a7078}.ss-ok{background:#ffb8cf;color:#7a1f3c}'
        ].join('');
        document.head.appendChild(st);
    }
    function buildPanel(info) {
        injectCss();
        var el = document.createElement('div'); el.className = 'ss-panel';
        el.innerHTML =
            '<div class="ss-head">' +
                '<div class="ss-ava"' + (info.avatar ? (' style="background-image:url(\'' + escHtml(info.avatar) + '\')"') : '') + '>' + (info.avatar ? '' : escHtml(String(info.name || '?').slice(0, 1))) + '</div>' +
                '<div><div class="ss-name">' + escHtml(info.name || 'TA') + ' 在看你的屏幕</div><div class="ss-status">连接中…</div></div>' +
                '<button class="ss-stop">停止</button>' +
            '</div>' +
            '<video class="ss-video" autoplay muted playsinline></video>' +
            '<div class="ss-log"></div>';
        document.body.appendChild(el);
        SS.panel = el; SS.log = el.querySelector('.ss-log'); SS.statusEl = el.querySelector('.ss-status');
        SS.video = el.querySelector('video');
        el.querySelector('.ss-stop').onclick = function () { stop(); };
    }
    function setStatus(t) { if (SS.statusEl) SS.statusEl.textContent = String(t || ''); }
    function addLine(text, isErr) {
        if (!SS.log) return;
        var d = document.createElement('div'); d.className = 'ss-line' + (isErr ? ' err' : ''); d.textContent = String(text || '');
        SS.log.appendChild(d); SS.log.scrollTop = SS.log.scrollHeight;
    }
    function addBubble(text) {
        if (!SS.log) return;
        SS.comments.push(String(text || ''));
        var p = splitBy(text);
        var d = document.createElement('div'); d.className = 'ss-bub';
        d.innerHTML = '<span>' + escHtml(p.main) + '</span>' + (p.sub ? ('<span class="zh">' + escHtml(p.sub) + '</span>') : '');
        SS.log.appendChild(d); SS.log.scrollTop = SS.log.scrollHeight;
        // 同时弹一条系统通知，切到别的真实 App、看不到小窗时也能看到 TA 的点评
        try {
            if (window.NanoNotify && SS.info) {
                window.NanoNotify.notify(SS.info.name || 'TA', p.main || String(text || ''), { icon: SS.info.avatar || '', channel: 'chat' });
            }
        } catch (e) {}
    }

    /* ---------------- 采集 ---------------- */
    function grab() {
        var v = SS.video; if (!v || !v.videoWidth) return '';
        var w = 720, h = Math.round(v.videoHeight * (w / v.videoWidth));
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        try { c.getContext('2d').drawImage(v, 0, 0, w, h); } catch (e) { return ''; }
        return c.toDataURL('image/jpeg', 0.6);
    }

    async function captureAndComment() {
        if (!SS.active || SS.busy) return;
        SS.busy = true;
        try {
            var dataURL = grab();
            if (!dataURL) { SS.busy = false; return; }
            setStatus('正在看…');
            var cfg = SS.cfg || {};
            var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
            var timer = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 45000) : null;
            var resp;
            try {
                resp = await fetch(apiEndpoint(cfg.mainUrl), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.mainKey },
                    body: JSON.stringify({
                        model: cfg.mainModel,
                        messages: [
                            { role: 'system', content: systemText() },
                            { role: 'user', content: [
                                { type: 'text', text: '这是用户此刻真实屏幕的一张截图。用你的人设点评这个画面（1-2 条短气泡）。只输出 JSON：{"bubbles":["..."]}' },
                                { type: 'image_url', image_url: { url: dataURL } }
                            ] }
                        ],
                        max_tokens: 220,
                        temperature: (typeof cfg.mainTemp === 'number' ? cfg.mainTemp : 0.85)
                    }),
                    signal: ctrl ? ctrl.signal : undefined
                });
            } finally { if (timer) clearTimeout(timer); }
            if (!resp.ok) {
                var m = 'HTTP ' + resp.status;
                try { var d = await resp.json(); m = (d.error && d.error.message) || d.message || m; } catch (e) {}
                addLine('这一步失败：' + m, true); SS.busy = false; setStatus('出错（模型需支持识图）'); return;
            }
            var data = await resp.json();
            var content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
            var parsed = firstJson(content) || {};
            var bubbles = Array.isArray(parsed.bubbles) ? parsed.bubbles : (parsed.bubbles ? [parsed.bubbles] : []);
            if (!bubbles.length && content) bubbles = [String(content).replace(/[{}"\[\]]/g, ' ').trim().slice(0, 120)];
            bubbles.filter(Boolean).slice(0, 2).forEach(addBubble);
            if (bubbles.length) {
                try { var s = shell(); if (s && s.postToChat) s.postToChat({ type: 'NANO_CHAR_SAY', chatId: String(SS.info.id), text: String(bubbles[0]) }); } catch (e) {}
                setStatus('刚刚点评了一句');
            } else setStatus('在看…');
        } catch (e) {
            addLine('出错：' + ((e && e.message) || e), true); setStatus('出错');
        }
        SS.busy = false;
    }

    function tick() {
        if (!SS.active) return;
        if (Date.now() - SS.lastAt < INTERVAL) return;
        SS.lastAt = Date.now();
        captureAndComment();
    }

    /* ---------------- 启动 / 停止 ---------------- */
    function start(info) {
        if (SS.active) return;
        info = info || {}; info.id = String(info.id || info.charId || ''); info.name = String(info.name || info.charName || 'TA');
        if (!info.id) return;
        // 不做系统限制：支持就让你用，不行会在点击「开始共享」后提示
        // getDisplayMedia 需要「用户手势」，这里用一个确认按钮把点击交给浏览器
        injectCss();
        var el = document.createElement('div'); el.className = 'ss-confirm';
        el.innerHTML = '<div class="ss-dialog"><h3>让「' + escHtml(info.name) + '」看你真实的屏幕？</h3>' +
            '<p>会请求你的屏幕共享权限（建议选「整个屏幕」，这样你切换窗口 TA 也能看到），TA 会定时截帧并用你配置的「能识图的模型」点评。可随时停止。</p>' +
            '<div class="ss-actions"><button class="ss-cancel">取消</button><button class="ss-ok">开始共享</button></div></div>';
        document.body.appendChild(el);
        el.querySelector('.ss-cancel').onclick = function () { try { el.remove(); } catch (e) {} };
        el.querySelector('.ss-ok').onclick = function () { try { el.remove(); } catch (e) {} doStart(info); };
    }

    async function doStart(info) {
        var stream;
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) throw new Error('unsupported');
            stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 2 }, audio: false });
        } catch (e) {
            var msg = (e && e.name === 'NotAllowedError') ? '你取消了共享，或没有授权。' : '这个浏览器暂时不支持屏幕共享（iOS Safari 通常不支持；可换电脑 Chrome/Edge 或安卓 Chrome 试试）。';
            try { alert(msg); } catch (err) {}
            return;
        }
        SS.active = true; SS.info = info; SS.stream = stream; SS.lastAt = Date.now();
        SS.comments = []; SS.cardPosted = false;
        buildPanel(info);
        try { SS.video.srcObject = stream; } catch (e) {}
        setStatus('正在读取人设与 API…');
        SS.ctx = (await requestContext(info)) || {};
        if (SS.ctx.api && SS.ctx.api.url && SS.ctx.api.key && SS.ctx.api.model) {
            SS.cfg = { mainUrl: SS.ctx.api.url, mainKey: SS.ctx.api.key, mainModel: SS.ctx.api.model, mainTemp: SS.ctx.api.temp };
        }
        if (!SS.cfg) SS.cfg = await getApiConfig();
        if (!SS.cfg || !SS.cfg.mainUrl || !SS.cfg.mainKey || !SS.cfg.mainModel) { setStatus('主 API 未配置'); addLine('主 API 未配置，无法点评。', true); }
        setStatus('盯着你的屏幕…');
        addLine('（TA 开始看你的屏幕了）');
        try {
            stream.getVideoTracks()[0].addEventListener('ended', function () {
                setStatus('共享已结束（点评已收进聊天卡片）');
                if (SS.timer) { clearInterval(SS.timer); SS.timer = null; }
                postCard();
            });
        } catch (e) {}
        SS.lastAt = 0;
        setTimeout(captureAndComment, 2500);
        SS.timer = setInterval(tick, 3000);
    }
    function stop() {
        if (!SS.active) return;
        postCard();
        SS.active = false;
        try { if (SS.timer) clearInterval(SS.timer); } catch (e) {}
        SS.timer = null;
        try { if (SS.stream) SS.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} }); } catch (e) {}
        try { if (SS.video) SS.video.srcObject = null; } catch (e) {}
        try { if (SS.panel) SS.panel.remove(); } catch (e) {}
        SS.panel = null; SS.log = null; SS.statusEl = null; SS.video = null; SS.stream = null;
    }

    window.ScreenShare = { version: '20261003g', start: start, stop: stop, isActive: function () { return SS.active; } };

    window.addEventListener('message', function (e) {
        var d = e && e.data;
        if (!d) return;
        if (d.type === 'startScreenShare') start({ id: d.charId, name: d.charName, avatar: d.avatar });
    });
})();
