/* avatar-frame.js — 头像框：URL 粘贴 + 预设切换（线下 / 聊天 / 心声 共用）
   存储：avatar_frame_offline / avatar_frame_chat / avatar_frame_heart（URL 字符串）
   预设：avatar_frame_presets = [{name, url}]
   用法：NanoAvatarFrame.openUI('offline'|'chat'|'heart') */
(function () {
    'use strict';
    var KEYS = { offline: 'avatar_frame_offline', chat: 'avatar_frame_chat', heart: 'avatar_frame_heart' };
    var PRESET_KEY = 'avatar_frame_presets';

    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
    function get(scope) { try { return localStorage.getItem(KEYS[scope]) || ''; } catch (e) { return ''; } }
    function set(scope, url) { try { if (url) localStorage.setItem(KEYS[scope], url); else localStorage.removeItem(KEYS[scope]); } catch (e) {} }
    function getPresets() { try { return JSON.parse(localStorage.getItem(PRESET_KEY) || '[]') || []; } catch (e) { return []; } }
    function savePresets(list) { try { localStorage.setItem(PRESET_KEY, JSON.stringify((list || []).slice(-60))); } catch (e) {} }

    function buildCss(scope, url) {
        url = String(url || '').trim();
        if (!url) return '';
        var u = JSON.stringify(url);
        var common = 'content:url(' + u + ');position:absolute;inset:-6px;width:calc(100% + 12px);height:calc(100% + 12px);pointer-events:none;object-fit:contain;';
        if (scope === 'offline') {
            return '.identity-row .avatar{position:relative;overflow:visible!important}.identity-row .avatar::after{' + common + '}';
        }
        if (scope === 'chat') {
            return '.message-avatar{position:relative;overflow:visible!important}.message-avatar::after{' + common + '}';
        }
        if (scope === 'heart') {
            return '.nano-voice-modal .iv-avatar,.iv-avatar{position:relative;overflow:visible!important}.nano-voice-modal .iv-avatar::after,.iv-avatar::after{' + common + '}';
        }
        return '';
    }
    function apply(scope) {
        try {
            var id = 'nano-frame-' + scope;
            var tag = document.getElementById(id);
            var css = buildCss(scope, get(scope));
            if (!css) { if (tag) tag.textContent = ''; return; }
            if (!tag) { tag = document.createElement('style'); tag.id = id; document.head.appendChild(tag); }
            tag.textContent = css;
        } catch (e) {}
    }
    function applyAllForPage() {
        var p = '';
        try { p = location.pathname || ''; } catch (e) {}
        if (/offline\.html$/i.test(p)) apply('offline');
        if (/chat_inner\.html$/i.test(p)) { apply('chat'); apply('heart'); }
        if (/groups\.html$/i.test(p)) apply('chat');
    }

    function toast(msg) {
        try {
            var t = document.getElementById('nafToast');
            if (!t) {
                t = document.createElement('div'); t.id = 'nafToast';
                t.style.cssText = 'position:fixed;left:50%;bottom:52px;transform:translateX(-50%);background:rgba(20,20,20,.9);color:#fff;padding:9px 16px;border-radius:999px;font-size:13px;z-index:2147483001;opacity:0;transition:opacity .2s;pointer-events:none';
                document.body.appendChild(t);
            }
            t.textContent = msg; t.style.opacity = '1';
            clearTimeout(t._tm); t._tm = setTimeout(function () { t.style.opacity = '0'; }, 1600);
        } catch (e) {}
    }

    function openUI(scope) {
        var label = { offline: '线下', chat: '聊天', heart: '心声' }[scope] || scope;
        var old = document.getElementById('nafModal'); if (old) old.remove();
        var ov = document.createElement('div');
        ov.id = 'nafModal';
        ov.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.42);display:flex;align-items:center;justify-content:center;padding:20px';
        function render() {
            var presets = getPresets();
            ov.innerHTML = '<div style="width:100%;max-width:380px;background:#fff;border-radius:20px;padding:18px;box-shadow:0 20px 60px rgba(0,0,0,.25)">'
                + '<div style="font-size:16px;font-weight:700;margin-bottom:10px">头像框 · ' + label + '</div>'
                + '<div style="font-size:12px;color:#8e8e93;margin-bottom:8px">粘贴图片 URL 作为头像框（PNG 透明底最佳），会套在该场景的头像外侧。</div>'
                + '<input id="nafUrl" placeholder="https://.../frame.png" style="width:100%;height:42px;border:1px solid #ddd;border-radius:10px;padding:0 12px;font-size:14px;box-sizing:border-box" value="' + esc(get(scope)) + '">'
                + '<div style="display:flex;gap:8px;margin-top:10px">'
                + '<select id="nafPreset" style="width:100%;height:42px;border:1px solid #ddd;border-radius:10px;padding:0 8px;font-size:13px;background:#fff;box-sizing:border-box"><option value="">选择预设…</option>'
                + presets.map(function (p, i) { return '<option value="' + i + '">' + esc(p.name || ('预设' + (i + 1))) + '</option>'; }).join('')
                + '</select>'
                + '</div>'
                + '<div style="display:flex;gap:8px;margin-top:8px">'
                + '<button id="nafSave" style="flex:1;height:40px;border:0;border-radius:10px;background:#f2f2f7;font-size:13px;font-weight:600;cursor:pointer">存为预设</button>'
                + '<button id="nafDel" style="flex:1;height:40px;border:0;border-radius:10px;background:#fbe9ea;color:#c98a8a;font-size:13px;font-weight:600;cursor:pointer">删除选中预设</button>'
                + '</div>'
                + '<div style="display:flex;gap:10px;margin-top:14px">'
                + '<button id="nafClear" style="flex:1;height:44px;border:0;border-radius:12px;background:#f2f2f7;font-size:14px;font-weight:600;cursor:pointer">清除</button>'
                + '<button id="nafApply" style="flex:1;height:44px;border:0;border-radius:12px;background:#ff4d94;color:#fff;font-size:14px;font-weight:700;cursor:pointer">应用</button>'
                + '</div>'
                + '<button id="nafClose" style="width:100%;margin-top:8px;height:36px;border:0;background:transparent;color:#8e8e93;font-size:13px;cursor:pointer">关闭</button>'
                + '</div>';
            ov.querySelector('#nafClose').onclick = function () { ov.remove(); };
            ov.querySelector('#nafApply').onclick = function () {
                set(scope, ov.querySelector('#nafUrl').value.trim());
                apply(scope);
                try { applyToPreview(); } catch (e) {}
                toast('已应用头像框');
            };
            ov.querySelector('#nafClear').onclick = function () {
                ov.querySelector('#nafUrl').value = '';
                set(scope, ''); apply(scope);
                try { applyToPreview(); } catch (e) {}
                toast('已清除头像框');
            };
            ov.querySelector('#nafPreset').onchange = function () {
                var p = getPresets()[parseInt(this.value, 10)];
                if (p) ov.querySelector('#nafUrl').value = p.url || '';
            };
            ov.querySelector('#nafSave').onclick = function () {
                var url = ov.querySelector('#nafUrl').value.trim();
                if (!url) { toast('先粘贴一个 URL'); return; }
                var name = window.prompt('给这个头像框起个名字', '头像框 ' + (getPresets().length + 1));
                if (name == null) return;
                var list = getPresets(); list.push({ name: String(name || '').trim() || ('头像框 ' + (list.length + 1)), url: url }); savePresets(list);
                render(); toast('已保存预设');
            };
            ov.querySelector('#nafDel').onclick = function () {
                var idx = parseInt(ov.querySelector('#nafPreset').value, 10);
                if (isNaN(idx)) { toast('先在下拉里选一个预设'); return; }
                var list = getPresets(); list.splice(idx, 1); savePresets(list);
                render(); toast('已删除预设');
            };
        }
        render();
        ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
        document.body.appendChild(ov);
    }

    // 若在设置页打开了线下预览 iframe，把头像框也同步过去
    function applyToPreview() {
        var f = document.getElementById('cssPreviewFrame');
        if (f && f.contentWindow) {
            try { f.contentWindow.postMessage({ type: 'offlinePreviewFrame', css: buildCss('offline', get('offline')) }, '*'); } catch (e) {}
        }
    }

    window.NanoAvatarFrame = {
        get: get, set: set, buildCss: buildCss, apply: apply, applyAllForPage: applyAllForPage,
        getPresets: getPresets, openUI: openUI
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyAllForPage);
    else applyAllForPage();
})();
