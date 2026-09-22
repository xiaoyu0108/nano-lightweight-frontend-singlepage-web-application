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
        // 结构：顶栏贴安全区（不留空隙），底栏避让底部小白条；可用下面两个变量 DIY
        '.chat-container>.topbar{padding-top:var(--chat-topbar-pad,var(--safe-top,0px)) !important;}' +
        '.multi-select-bar{top:var(--safe-top,0px) !important;}' +
        '.bottom-bar{padding-bottom:var(--chat-bottom-pad,calc(14px + var(--safe-bottom,env(safe-area-inset-bottom,0px)))) !important;}';

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
    }

    // 头像「方圆 / 大小」调节（美化页滑杆生成，作用聊天内页；优先级高于聊天 CSS）
    function applyChatAvatarCss(css) {
        if (!isChatInterior) return;
        applyStyle('nano-beautify-chat-avatar', css || '');
        var c = getEl('nano-beautify-chat');
        if (c && c.parentNode) c.parentNode.appendChild(c);
        var g = getEl('nano-beautify-global');
        if (g && g.parentNode) g.parentNode.appendChild(g);
    }

    function readCss(key) {
        try {
            var v = localStorage.getItem(key);
            return typeof v === 'string' ? v : '';
        } catch (e) { return ''; }
    }

    // 旧版全局模板把底栏排成 space-between（胶囊靠左、电话靠右），这里做一次就地修正
    function migrateGlobalCss(css) {
        if (!css || css.indexOf('.bottom-actions') === -1 || css.indexOf('justify-content: space-between') === -1) return css;
        var fixed = css.replace(/(\.bottom-actions\s*\{[^}]*?)justify-content:\s*space-between;/m, '$1justify-content: center;');
        if (fixed !== css) {
            try {
                localStorage.setItem('beautify_global_v2', fixed);
                localStorage.setItem('beautify_global', fixed);
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
            applyChatCss(readCss('beautify_chat_v2'));
        } catch (e) {}
        try {
            applyChatAvatarCss(readCss('beautify_chat_avatar'));
        } catch (e) {}
        try {
            applyGlobalCss(unlockScrollCss(migrateGlobalCss(readCss('beautify_global_v2'))));
        } catch (e) {}
        var cfg = readFontCfgSync();
        if (cfg) {
            applyFontCfg(cfg);
        } else {
            loadFontCfgFromIDB().then(function(c) { if (c) applyFontCfg(c); });
        }
    }

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
            } else if (data.type === 'beautify:refresh') {
                applySaved();
            }
        },
        applySaved: applySaved
    };

    window.addEventListener('message', function(e) {
        var d = e.data;
        if (d && d.type && window.__nanoAppearance) {
            window.__nanoAppearance.applyMessage(d);
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applySaved);
    } else {
        applySaved();
    }
})();
