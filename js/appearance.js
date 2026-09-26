// ============================================================
// appearance.js — 美化应用端（每个 Nano 页面都会加载）
// 功能：
//   1. 全局 CSS（beautify_global）注入到非聊天内页，覆盖 index/chat/API/moments/more 等页面 UI
//   2. 聊天 CSS（beautify_chat）注入到单聊/群聊内页（顶栏/底栏/气泡/转账/礼物/语音/通话卡片/引用等）
//   3. 全局字体（beautify_font）应用到所有 Nano 页面
//   4. 监听来自父框架(beautify)的实时消息，立即生效
// beautify 编辑页自身不加载本文件（由 beautify.js 管理自己的编辑器样式与字体）。
// ============================================================
(function() {
    'use strict';

    var fileName = '';
    try {
        fileName = (window.location.pathname.split('/').pop() || '').split('?')[0];
    } catch (e) {}
    // 以目录/根路径打开时 pathname 末尾为空，其文档其实就是 index.html
    if (!fileName || fileName === '/') fileName = 'index.html';
    // beautify 编辑器页面不走这套自注入（避免用户全局 CSS 把编辑器 UI 弄乱）
    if (fileName === 'beautify.html') return;

    // 聊天内页：单聊(chat_inner) / 群聊(groups) 需要注入「聊天 CSS」
    var isChatInterior = fileName === 'chat_inner.html' ||
        fileName.indexOf('groups') === 0;

    function getEl(id) {
        return document.getElementById(id);
    }

    // 追加/替换一个 <style>；css 为空则移除旧标签
    function applyStyle(id, css) {
        var old = getEl(id);
        if (!css || !String(css).trim()) {
            if (old && old.parentNode) old.parentNode.removeChild(old);
            return;
        }
        if (old) {
            old.textContent = css;
            return;
        }
        var st = document.createElement('style');
        st.id = id;
        st.textContent = css;
        // 放到 body 末尾，保证晚于各页面自身样式（含 body 内的 style），从而能覆盖原 UI
        var host = document.body || document.head || document.documentElement;
        host.appendChild(st);
    }

    // 统一隐藏滚动条（保留滚动能力），避免右侧出现"侧边栏"
    try {
        applyStyle('nano-hide-scrollbar',
            'html,body,*{scrollbar-width:none !important;-ms-overflow-style:none !important;}' +
            'html::-webkit-scrollbar,body::-webkit-scrollbar,*::-webkit-scrollbar{width:0 !important;height:0 !important;display:none !important;}');
    } catch (e) {}

    // 全局 CSS 只作用于：index / chat（列表+内页+群聊） / discover / more
    // 其他功能页保持不动，避免被全局样式误改
    var GLOBAL_TARGET_PAGES = [
        'index.html', 'chat.html', 'chat_inner.html', 'groups.html',
        'group-chat.html', 'discover.html', 'more.html', 'api.html'
    ];
    function isGlobalTargetPage() {
        return GLOBAL_TARGET_PAGES.indexOf(fileName) !== -1;
    }
    function applyGlobalCss(css) {
        if (!isGlobalTargetPage()) return;
        applyStyle('nano-beautify-global', css || '');
        bringAvatarToFront();
    }

    // 头像样式永远放最后，优先级最高（否则头像框会被聊天/全局 CSS 盖掉）
    function bringAvatarToFront() {
        var a = getEl('nano-beautify-chat-avatar');
        if (a && a.parentNode) a.parentNode.appendChild(a);
    }

    // 结构修复：撤回 / 系统提示 / 居中卡片一律居中。
    // 行本身同时带 left/right 与 centered/recalled/sys-notice，若自定义 CSS 把
    // .left/.right 写在居中规则之后会覆盖居中；这里用 !important 兜底，保证永远居中。
    var CHAT_STRUCT_FIX =
        '.message-row.tip-row-wrap,.message-row.centered,.message-row.recalled,' +
        '.message-row.sys-notice{justify-content:center !important;}' +
        '.message-row.tip-row-wrap .message-avatar,.message-row.centered .message-avatar,' +
        '.message-row.recalled .message-avatar,.message-row.sys-notice .message-avatar' +
        '{display:none !important;}' +
        '.message-row.centered .message-content,.message-row.sys-notice .message-content' +
        '{max-width:88%;align-items:center;}' +
        // 撤回消息：外层行、内容盒、气泡全部居中，避免因 left/right 的 align-items 造成偏左
        '.message-row.recalled{flex-direction:row !important;}' +
        '.message-row.recalled .message-content{max-width:100% !important;width:100% !important;' +
        'align-items:center !important;justify-content:center !important;margin:0 auto !important;flex:1 1 auto !important;}' +
        '.message-row.recalled .recall-notice{margin-left:auto !important;margin-right:auto !important;}' +
        // 结构：顶栏贴安全区（不留空隙），底栏避让底部小白条；可用下面两个变量 DIY
        // 注意：不要在这里强制 background:transparent —— 那会盖掉用户在「聊天美化」里设置的
        // 顶栏/底栏背景色（无论加多少 !important 都改不出白底）。背景交给用户 CSS 决定。
        '.chat-container>.topbar{padding-top:var(--chat-topbar-pad,var(--safe-top,0px)) !important;}' +
        '.bottom-bar{padding-bottom:var(--chat-bottom-pad,max(12px,var(--nano-safe-bottom,env(safe-area-inset-bottom,0px)))) !important;}' +
        // 键盘弹出时底部安全区（Home 条）被键盘盖住，不再需要留白，避免输入栏被顶到键盘外看不到字
        'html.keyboard-open .bottom-bar{padding-bottom:8px !important;}';

    function applyChatCss(css) {
        // 聊天 CSS 仅作用于单聊/群聊内页（额外的聊天专用覆盖）
        if (!isChatInterior) return;
        applyStyle('nano-beautify-chat', css || '');
        applyStyle('nano-beautify-chat-fix', CHAT_STRUCT_FIX);
        // 顺序：聊天 CSS -> 结构修复 -> 全局 CSS（全局最后，便于整体覆盖）
        var f = getEl('nano-beautify-chat-fix');
        if (f && f.parentNode) f.parentNode.appendChild(f);
        var g = getEl('nano-beautify-global');
        if (g && g.parentNode) g.parentNode.appendChild(g);
        // 头像样式始终放最后，保证头像框不被聊天/全局 CSS 盖掉
        bringAvatarToFront();
    }

    // 头像「方圆 / 大小」调节（美化页滑杆生成，作用聊天内页；优先级高于聊天 CSS）
    function applyChatAvatarCss(css) {
        if (!isChatInterior) return;
        applyStyle('nano-beautify-chat-avatar', css || '');
        // 头像样式必须放在最后，优先级高于聊天 CSS / 全局 CSS，否则头像框会被后面的样式盖掉
        bringAvatarToFront();
        // 强制一次重排：应用美化模板后 iOS Safari 才会重新合成、显示头像框
        try { void (document.body && document.body.offsetHeight); } catch (e) {}
        applyFrameElements();
    }

    // 头像框不再依赖 ::after（会被模板的 overflow/z-index 裁切或盖住），改为给每个头像
    // 插入一个「真实叠加元素」<span class="nano-avatar-frame">，用行内样式画框。
    function getFrameConfig() {
        try {
            var raw = localStorage.getItem('nano_avatar_frame');
            if (raw) {
                var o = JSON.parse(raw);
                if (o && String(o.url || '').trim()) return o;
            }
        } catch (e) {}
        try {
            var cfg = JSON.parse(localStorage.getItem('beautify_chat_avatar_cfg') || 'null');
            if (cfg && String(cfg.frameUrl || '').trim()) {
                return { url: cfg.frameUrl, scale: cfg.frameScale, radius: cfg.radius, size: cfg.size };
            }
        } catch (e) {}
        // 兜底：从旧的/纳米写入的 CSS 字符串里解析头像框地址
        try {
            var css = localStorage.getItem('beautify_chat_avatar') || '';
            if (/::after/i.test(css)) {
                var m = css.match(/url\(["']?([^"')]+)["']?\)/i);
                if (m && m[1]) {
                    var sm = css.match(/top\s*:\s*(-?\d+)%/i) || css.match(/left\s*:\s*(-?\d+)%/i);
                    return { url: m[1], scale: sm ? Math.abs(parseInt(sm[1], 10)) : 16 };
                }
            }
        } catch (e) {}
        return null;
    }

    // 只用 CSS 负责「方圆 / 大小」；头像框由真实元素负责
    function buildAvatarCssFromCfg() {
        var cfg = null;
        try { cfg = JSON.parse(localStorage.getItem('beautify_chat_avatar_cfg') || 'null'); } catch (e) {}
        if (!cfg) return '';
        var r = (typeof cfg.radius === 'number' ? cfg.radius : 50) + '%';
        var s = (typeof cfg.size === 'number' ? cfg.size : 36) + 'px';
        var avs = [
            'html body.nano-chat-inner .message-avatar',
            'html body.nano-groups .message-avatar',
            'html body.nano-chat-inner .typing-indicator .ti-avatar',
            'html body.nano-groups .typing-indicator .ti-avatar'
        ];
        var avImgs = avs.map(function (x) { return x + ' img'; });
        return avs.join(',') + '{border-radius:' + r + ' !important;width:' + s + ' !important;height:' + s + ' !important;}'
            + avImgs.join(',') + '{border-radius:' + r + ' !important;}';
    }

    // 头像框图片预加载 + 失败重试（避免「转几秒然后空白」）
    var _frameImg = { url: '', ok: false, down: false, tries: 0, work: '' };
    function preloadFrame(url) {
        if (!url) return;
        if (_frameImg.url === url && (_frameImg.ok || _frameImg.down)) return;
        _frameImg = { url: url, ok: false, down: false, tries: 0, work: url };
        var attempt = function () {
            var img = new Image();
            img.decoding = 'async';
            var bust = _frameImg.tries > 0 ? (url + (url.indexOf('?') === -1 ? '?' : '&') + 'nr=' + _frameImg.tries) : url;
            img.onload = function () {
                _frameImg.ok = true;
                _frameImg.work = bust;
                applyFrameElements(true); // 用可用的地址重画一次
            };
            img.onerror = function () {
                _frameImg.tries++;
                if (_frameImg.tries < 3) setTimeout(attempt, 600 * _frameImg.tries);
                else { _frameImg.down = true; }
            };
            try { img.src = bust; } catch (e) {}
        };
        attempt();
    }

    function findFrameChild(node) {
        for (var c = 0; c < node.children.length; c++) {
            if (node.children[c] && node.children[c].className === 'nano-avatar-frame') return node.children[c];
        }
        return null;
    }

    var _frameSig = '';
    function applyFrameElements(force) {
        if (!isChatInterior) return;
        var fc = getFrameConfig();
        var nodes;
        try { nodes = document.querySelectorAll('.message-avatar, .typing-indicator .ti-avatar'); } catch (e) { return; }
        var sig = fc ? (String(fc.url) + '|' + fc.scale + '|' + (_frameImg.url === String(fc.url) ? _frameImg.work : '')) : '';
        var sigChanged = (sig !== _frameSig);
        if (sigChanged) _frameSig = sig;
        if (fc) preloadFrame(String(fc.url));
        var srcUrl = (fc && _frameImg.url === String(fc.url) && _frameImg.work) ? _frameImg.work : (fc ? String(fc.url) : '');
        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            var existing = findFrameChild(node);
            if (!fc) {
                if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
                try { if (node.style.overflow) node.style.removeProperty('overflow'); if (node.style.position) node.style.removeProperty('position'); } catch (e) {}
                continue;
            }
            // 已处理过、配置没变、且节点已有框：直接跳过，避免每次 DOM 变动都重写样式导致卡顿
            if (!force && !sigChanged && existing && existing.dataset.sig === sig) continue;
            var scale = parseInt(fc.scale, 10);
            if (isNaN(scale)) scale = 16;
            scale = Math.max(0, Math.min(60, scale));
            var inset = -scale;
            var url = String(srcUrl).replace(/"/g, '%22').replace(/\)/g, '%29');
            var el = existing || document.createElement('span');
            el.className = 'nano-avatar-frame';
            el.setAttribute('aria-hidden', 'true');
            el.dataset.sig = sig;
            el.style.cssText = 'position:absolute !important;display:block !important;'
                + 'top:' + inset + '% !important;right:' + inset + '% !important;bottom:' + inset + '% !important;left:' + inset + '% !important;'
                + 'background-image:url("' + url + '") !important;background-position:center center !important;'
                + 'background-size:contain !important;background-repeat:no-repeat !important;'
                + 'pointer-events:none !important;z-index:2147483000 !important;';
            if (!existing) node.appendChild(el);
            try {
                node.style.setProperty('overflow', 'visible', 'important');
                node.style.setProperty('position', 'relative', 'important');
            } catch (e) {}
            // 原头像内容保持圆形
            var kids = node.querySelectorAll('img, span');
            for (var k = 0; k < kids.length; k++) {
                if (kids[k] === el) continue;
                try { kids[k].style.setProperty('border-radius', 'inherit', 'important'); } catch (e) {}
            }
        }
    }

    var _avatarObserver = null;
    function watchAvatars() {
        if (!isChatInterior || _avatarObserver || typeof MutationObserver === 'undefined') return;
        var scheduled = false;
        _avatarObserver = new MutationObserver(function () {
            if (scheduled) return;
            scheduled = true;
            setTimeout(function () { scheduled = false; applyFrameElements(); }, 60);
        });
        try { _avatarObserver.observe(document.body || document.documentElement, { childList: true, subtree: true }); } catch (e) {}
    }

    function readCss(key) {
        try {
            var v = localStorage.getItem(key);
            return typeof v === 'string' ? v : '';
        } catch (e) { return ''; }
    }

    // 旧版全局模板的两处安全区问题，就地修正已保存的 CSS：
    //   1) 底栏写死 bottom:28px，iOS 上离底部过高 → 改成随安全区自适应
    //   2) 顶栏 padding 未包含安全区，按钮被灵动岛遮住 → 补上 safe-inset-top
    function migrateGlobalCss(css) {
        if (!css) return css;
        var fixed = css;
        if (fixed.indexOf('.bottom-actions') !== -1 && fixed.indexOf('justify-content: space-between') !== -1) {
            fixed = fixed.replace(/(\.bottom-actions\s*\{[^}]*?)justify-content:\s*space-between;/m, '$1justify-content: center;');
        }
        if (fixed.indexOf('.bottom-actions') !== -1) {
            fixed = fixed.replace(/(\.bottom-actions\s*\{[^}]*?)bottom\s*:[^;]*;/m, '$1bottom: 0;');
        }
        if (fixed.indexOf('.overlay-header') !== -1) {
            fixed = fixed.replace(/(\.overlay-header\s*\{[^}]*?)padding\s*:\s*14px\s+0\s+12px\s+0\s*;/m, '$1padding: calc(14px + var(--safe-inset-top, 0px)) 0 12px 0;');
        }
        if (fixed !== css) {
            try {
                localStorage.setItem('beautify_global_v2', fixed);
                localStorage.setItem('beautify_global', fixed);
            } catch (e) {}
        }
        return fixed;
    }

    // 旧版聊天模板：气泡偏大偏宽、底栏底部留白过多，就地修正已保存的聊天 CSS
    function migrateChatCss(css) {
        if (!css) return css;
        var fixed = css;
        if (fixed.indexOf('.nano-chat-inner .bubble') !== -1) {
            fixed = fixed.replace(/(\.nano-chat-inner\s+\.bubble\s*\{[^}]*?)padding\s*:\s*7px\s+16px\s*;/m, '$1padding: 6px 11px;');
            fixed = fixed.replace(/(\.nano-chat-inner\s+\.bubble\s*\{[^}]*?)border-radius\s*:\s*22px\s*;/m, '$1border-radius: 15px;');
            fixed = fixed.replace(/(\.nano-chat-inner\s+\.bubble\s*\{[^}]*?)font-size\s*:\s*15px\s*;/m, '$1font-size: 14px;');
        }
        if (fixed.indexOf('.nano-chat-inner .message-content') !== -1) {
            fixed = fixed.replace(/(\.nano-chat-inner\s+\.message-content\s*\{[^}]*?)max-width\s*:\s*78%\s*;/m, '$1max-width: 64%;');
        }
        if (fixed !== css) {
            try {
                localStorage.setItem('beautify_chat_v2', fixed);
                localStorage.setItem('beautify_chat', fixed);
            } catch (e) {}
        }
        return fixed;
    }

    // 全局模板里给 index 用的「html,body 锁定滚动」不适合 discover/more 等可滚动页，
    // 这里去掉 html,body 上的 position:fixed / overflow:hidden / top / left，避免这些页面无法滑动。
    // index 自身的 CSS 已经有锁定规则，因此移除后 index 表现不变。
    function unlockScrollCss(css) {
        if (!css) return css;
        return css.replace(/(html\s*,\s*body\s*\{)([\s\S]*?)(\})/gi, function (m, head, body, tail) {
            var cleaned = body
                .replace(/position\s*:\s*fixed\s*;?/gi, '')
                .replace(/overflow(?:-[xy])?\s*:\s*hidden\s*;?/gi, '')
                .replace(/(^|\n)\s*top\s*:\s*0(?:px)?\s*;?/gi, '$1')
                .replace(/(^|\n)\s*left\s*:\s*0(?:px)?\s*;?/gi, '$1');
            return head + cleaned + tail;
        });
    }

    // ---- 字体 ----
    function fontFormatFor(source) {
        var s = String(source || '').toLowerCase();
        if (/\.woff2($|\?)/.test(s)) return 'woff2';
        if (/\.woff($|\?)/.test(s)) return 'woff';
        if (/\.otf($|\?)/.test(s)) return 'opentype';
        return 'truetype';
    }

    var _fontBlobUrl = null;
    function blobUrlFromData(data) {
        try {
            if (!data) return '';
            if (_fontBlobUrl) {
                try { URL.revokeObjectURL(_fontBlobUrl); } catch (e) {}
                _fontBlobUrl = null;
            }
            var blob = (typeof Blob !== 'undefined' && data instanceof Blob) ? data : new Blob([data]);
            _fontBlobUrl = URL.createObjectURL(blob);
            return _fontBlobUrl;
        } catch (e) { return ''; }
    }

    // 从配置里解析出可用的字体 src（文件字体优先用内存/IDB 数据转 blob URL，避免 localStorage 配额）
    function resolveFontSrc(cfg) {
        if (!cfg) return '';
        if (cfg.type === 'file') {
            if (cfg.data) {
                var u = blobUrlFromData(cfg.data);
                if (u) return u;
            }
            if (cfg.base64) {
                var fmt = cfg.format || fontFormatFor(cfg.source || cfg.name) || 'truetype';
                var ext = (fmt === 'woff2') ? 'woff2' : (fmt === 'woff') ? 'woff' : (fmt === 'opentype') ? 'otf' : 'ttf';
                return 'data:font/' + ext + ';base64,' + cfg.base64;
            }
            return '';
        }
        if (cfg.type === 'url' && cfg.source) return String(cfg.source).replace(/"/g, '\\"');
        return '';
    }

    function buildFontCss(cfg) {
        if (!cfg) return '';
        var family = 'NanoBeautifyFont';
        var src = resolveFontSrc(cfg);
        if (!src) return '';
        var size = (cfg.size && cfg.size > 0) ? cfg.size : 16;
        var stack = '"' + family + '",-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Helvetica Neue","PingFang SC",Arial,sans-serif';
        // 全站强制字体：除图标(i)与 svg 外所有元素都换字体，覆盖各页面/各功能自带的 font-family
        // 全站强制字体：除图标(i / svg / .fa-* 图标元素)外所有元素都换字体。
        // 用 :root * 提高优先级，确保能覆盖各页面类选择器自带的 font-family（含 !important）。
        return '@font-face{font-family:"' + family + '";src:url("' + src + '") format("' +
            (cfg.format || fontFormatFor(cfg.source || cfg.name)) + '");font-display:swap;}' +
            'html,body{font-family:' + stack + ' !important;}' +
            '*:not(i):not(svg){font-family:' + stack + ' !important;}' +
            ':root *:not(i):not(svg):not([class*="fa-"]){font-family:' + stack + ' !important;}' +
            ':root{--iv-sans:' + stack + ';--iv-serif:' + stack + ';}' +
            'html{font-size:' + size + 'px;}';
    }

    function applyFontCfg(cfg) {
        applyStyle('nano-beautify-font', buildFontCss(cfg || null));
    }

    // 同步读取（URL 字体存 localStorage；文件字体不走 localStorage，避免超配额）
    function readFontCfgSync() {
        try {
            var raw = localStorage.getItem('beautify_font');
            if (raw) {
                var o = JSON.parse(raw);
                if (o && o.family === 'NanoBeautifyFont' && o.type === 'url' && o.source) return o;
            }
        } catch (e) {}
        return null;
    }

    // 从 beautify 的 IndexedDB 读取已保存字体（文件字体数据较大，用 IDB 持久化）
    function loadFontCfgFromIDB() {
        return new Promise(function(resolve) {
            try {
                var req = indexedDB.open('BeautifyAppDB', 1);
                req.onupgradeneeded = function(e) {
                    try {
                        var d = e.target.result;
                        if (!d.objectStoreNames.contains('presets')) d.createObjectStore('presets', { keyPath: 'id', autoIncrement: true });
                        if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings', { keyPath: 'key' });
                    } catch (e2) {}
                };
                req.onsuccess = function(e) {
                    var db = e.target.result;
                    var get;
                    try { get = db.transaction('settings', 'readonly').objectStore('settings').get('appliedFont'); }
                    catch (e2) { resolve(null); return; }
                    get.onsuccess = function() {
                        var v = get.result ? get.result.value : null;
                        if (v && v.name) {
                            resolve({
                                family: 'NanoBeautifyFont',
                                name: v.name,
                                source: v.source || '',
                                type: v.type || '',
                                size: v.size || 16,
                                format: fontFormatFor(v.source || v.name),
                                data: v.data || null
                            });
                        } else resolve(null);
                    };
                    get.onerror = function() { resolve(null); };
                };
                req.onerror = function() { resolve(null); };
            } catch (e) { resolve(null); }
        });
    }

    // ---- 启动时按已保存配置注入 ----
    // 只读取「用户显式点过 应用」的 v2 键，避免首次进入美化页时默认模板就覆盖全部 UI
    function applySaved() {
        // 先聊天后全局：全局样式永远最后注入，保证“全局”能覆盖所有页面（含聊天）
        try {
            applyChatCss(migrateChatCss(readCss('beautify_chat_v2')));
        } catch (e) {}
        try {
            // 配置里有头像框就用「原始配置重建」（避免美化页存下来的旧 CSS 字符串/旧选择器不生效）；
            // 配置里没有框则沿用已保存的 CSS 字符串。
            var _acfg = null;
            try { _acfg = JSON.parse(localStorage.getItem('beautify_chat_avatar_cfg') || 'null'); } catch (e) {}
            var _avCss = (_acfg && String(_acfg.frameUrl || '').trim())
                ? buildAvatarCssFromCfg()
                : readCss('beautify_chat_avatar');
            applyChatAvatarCss(_avCss);
        } catch (e) {}
        try {
            applyGlobalCss(unlockScrollCss(migrateGlobalCss(readCss('beautify_global_v2'))));
        } catch (e) {}
        try {
            applyBottomShift(readCss('nanoBottomShift'));
        } catch (e) {}
        try {
            applyTopShift(readCss('nanoTopShift'));
        } catch (e) {}
        try {
            applyFlushFix();
        } catch (e) {}
        // 最后再确保头像样式在最后（有些注入会插到它后面）
        try { bringAvatarToFront(); } catch (e) {}
        try { void (document.body && document.body.offsetHeight); } catch (e) {}
        // 给每个头像插入头像框叠加元素（行内 !important），并监听后续新消息
        try { applyFrameElements(); watchAvatars(); } catch (e) {}
        var cfg = readFontCfgSync();
        if (cfg) {
            applyFontCfg(cfg);
        } else {
            loadFontCfgFromIDB().then(function(c) { if (c) applyFontCfg(c); });
        }
    }

    // ---- 全局底栏位置偏移（“其他”页的底栏位置滑杆，作用于所有页面的底栏） ----
    var TOP_SHIFT_SEL = '.top-bar,.navbar,.nav-bar,.memory-topbar,.topbar,.page-topbar,.overlay-header,.status';
    var BOTTOM_SHIFT_SEL = '.bottom-actions,.bottom-bar,footer.bottom,.bottom,' +
        '.dm-composer,.mm-viewer-bar,.comment-input,.chat-input-bar,.ins-emoji-panel';
    function applyShift(kind, px) {
        var key = kind === 'top' ? 'nanoTopShift' : 'nanoBottomShift';
        var v = parseInt(px, 10);
        if (isNaN(v)) { try { v = parseInt(localStorage.getItem(key) || '0', 10) || 0; } catch (e) { v = 0; } }
        var varName = kind === 'top' ? '--nano-top-shift' : '--nano-bottom-shift';
        var sel = kind === 'top' ? TOP_SHIFT_SEL : BOTTOM_SHIFT_SEL;
        applyStyle('nano-' + kind + '-shift',
            ':root{' + varName + ':' + v + 'px;}' +
            sel + '{transform:translateY(var(' + varName + ',0px)) !important;}');
    }
    function applyTopShift(px) { applyShift('top', px); }
    function applyBottomShift(px) { applyShift('bottom', px); }

    // ---- 强制所有底栏贴底（不吃缓存：始终注入，覆盖旧的页面 CSS / 旧预设） ----
    var BOTTOM_FLUSH_FIX =
        'html .bottom-actions,html .nano-index .bottom-actions{bottom:20px !important;padding-bottom:0 !important;}' +
        // 只兜底底部安全区留白，不要强制 background/border/shadow —— 否则用户无法给顶栏/底栏设白底
        'html .bottom-bar,html .nano-chat-inner .bottom-bar,html .nano-groups .bottom-bar{padding-bottom:max(12px,var(--nano-safe-bottom,env(safe-area-inset-bottom,0px))) !important;}' +
        'html.keyboard-open .bottom-bar,html.keyboard-open .nano-chat-inner .bottom-bar,html.keyboard-open .nano-groups .bottom-bar{padding-bottom:8px !important;}' +
        'html footer.bottom{padding-bottom:0 !important;}' +
        'html .bottom{padding-bottom:0 !important;}' +
        'html .dm-composer{padding-bottom:4px !important;}' +
        'html .mm-viewer-bar{padding-bottom:4px !important;}' +
        'html .comment-input,html .chat-input-bar{padding-bottom:4px !important;}';
    function applyFlushFix() { applyStyle('nano-flush-fix', BOTTOM_FLUSH_FIX); }

    // ---- 供父框架 / 其它模块调用的入口 ----
    window.__nanoAppearance = {
        applyMessage: function(data) {
            if (!data || !data.type) return;
            if (data.type === 'beautify:apply') {
                if (data.target === 'global') applyGlobalCss(unlockScrollCss(data.css || ''));
                else if (data.target === 'chat') applyChatCss(data.css || '');
                else if (data.target === 'chat-avatar') applyChatAvatarCss(data.css || '');
            } else if (data.type === 'beautify:font') {
                applyFontCfg(data.cfg || null);
            } else if (data.type === 'nanoTopShift') {
                applyTopShift(data.value);
            } else if (data.type === 'nanoBottomShift') {
                applyBottomShift(data.value);
            } else if (data.type === 'beautify:refresh') {
                applySaved();
            }
        },
        applyTopShift: applyTopShift,
        applyBottomShift: applyBottomShift,
        applySaved: applySaved
    };

    window.addEventListener('message', function(e) {
        var d = e.data;
        if (d && d.type && window.__nanoAppearance) {
            window.__nanoAppearance.applyMessage(d);
        }
    });

    // 页面重新可见 / 从后台恢复时，重读一次已保存美化，确保头像框等样式不丢
    window.addEventListener('pageshow', function() { try { applySaved(); } catch (e) {} });
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden) { try { applySaved(); } catch (e) {} }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applySaved);
    } else {
        applySaved();
    }
})();
