// ============================================================
// api-float.js — 全局 API 悬浮球
// 功能：拖动 / 点击展开小型面板；切换 API/Image/TTS 分类与预设；
//       拉取网站模型；保存配置（与 API 页面共用 nano_api_db 配置）。
// 挂载：仅在顶层文档挂载；iframe 内自动跳过（由父级悬浮球覆盖）。
// ============================================================
(function () {
    'use strict';
    if (window.__apiFloatLoaded) return;
    window.__apiFloatLoaded = true;

    // 进程内只挂一次；iframe 内不挂（父页面已提供）
    var isTop = (window.top === window.self);
    var LS_KEY = 'nanoApiBall';
    var API_DB = 'nano_api_db';
    var API_STORE = 'api_data';
    var CONFIG_KEY = 'nano_api_config';
    var PRESET_DATA_KEY = 'nano_api_presets_data';
    var PRESET_LIST_KEY = 'nano_api_preset_list';
    var MODEL_LIST_KEY = 'nano_api_model_lists';
    var ASSIGN_KEY = 'nano_api_assign';

    var ASSIGN_FIELDS = {
        api: ['chatSingle', 'chatGroup', 'chatMusic', 'chatDiscover'],
        image: ['imageSingle', 'imageGroup', 'imageMoments'],
        tts: ['ttsReply', 'ttsRead']
    };

    var CATS = {
        api: { label: 'API', prefix: 'main_', listKey: 'main', selectId: 'mainModelSelect', fields: { url: 'mainUrl', key: 'mainKey', model: 'mainModel', preset: 'mainPreset' } },
        image: { label: 'Image', prefix: 'img_', listKey: 'img', selectId: 'imgModelSelect', fields: { url: 'imgUrl', key: 'imgKey', model: 'imgModel', preset: 'imgPreset' } },
        tts: { label: 'TTS', prefix: 'tts_', listKey: 'tts', selectId: 'ttsModelSelect', fields: { url: 'ttsUrl', key: 'ttsKey', model: 'ttsModel', preset: 'ttsPreset' } }
    };

    var DEFAULT_SETTINGS = { enabled: true, size: 52, icon: 'classic', x: null, y: null };

    // ---------- IndexedDB（与 api.js 同库同表） ----------
    function openDB() {
        return new Promise(function (resolve, reject) {
            try {
                var req = indexedDB.open(API_DB, 2);
                req.onupgradeneeded = function (e) {
                    var db = e.target.result;
                    if (!db.objectStoreNames.contains(API_STORE)) db.createObjectStore(API_STORE, { keyPath: 'key' });
                    if (!db.objectStoreNames.contains('emoji_data')) db.createObjectStore('emoji_data', { keyPath: 'key' });
                };
                req.onsuccess = function (e) { resolve(e.target.result); };
                req.onerror = function (e) { reject(e.target.error); };
                req.onblocked = function () { reject(new Error('blocked')); };
            } catch (e) { reject(e); }
        });
    }
    function idbGet(key) {
        return openDB().then(function (db) {
            return new Promise(function (resolve) {
                try {
                    var r = db.transaction(API_STORE, 'readonly').objectStore(API_STORE).get(key);
                    r.onsuccess = function () { resolve(r.result ? r.result.value : null); try { db.close(); } catch (e) {} };
                    r.onerror = function () { resolve(null); try { db.close(); } catch (e) {} };
                } catch (e) { resolve(null); try { db.close(); } catch (e2) {} }
            });
        }).catch(function () { return null; });
    }
    function idbSet(key, value) {
        return openDB().then(function (db) {
            return new Promise(function (resolve) {
                try {
                    var tx = db.transaction(API_STORE, 'readwrite');
                    tx.objectStore(API_STORE).put({ key: key, value: value });
                    tx.oncomplete = function () { resolve(); try { db.close(); } catch (e) {} };
                    tx.onerror = function () { resolve(); try { db.close(); } catch (e) {} };
                } catch (e) { resolve(); try { db.close(); } catch (e2) {} }
            });
        }).catch(function () {});
    }

    function cleanUrl(u) { return String(u || '').trim().replace(/\s/g, '').replace(/\/+$/, ''); }
    function cleanKey(k) { return String(k || '').trim(); }
    function baseV1(u) {
        var s = cleanUrl(u);
        if (!s) return s;
        return /\/v1$/i.test(s) ? s : (s.replace(/\/$/, '') + '/v1');
    }

    // ---------- 设置 ----------
    function loadSettings() {
        var s = Object.assign({}, DEFAULT_SETTINGS);
        try {
            var raw = localStorage.getItem(LS_KEY);
            if (raw) Object.assign(s, JSON.parse(raw) || {});
        } catch (e) {}
        return s;
    }
    function persistSettings(patch) {
        var s = Object.assign(loadSettings(), patch || {});
        try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) {}
        return s;
    }

    if (!isTop) {
        // iframe 内仅提供读取设置的辅助，不渲染
        window.ApiBall = { getSettings: loadSettings, isTopLevel: false };
        return;
    }

    // ---------- 样式 ----------
    var CSS = ''
        + ':root{--ab-size:52px;}'
        + '.ab-ball{position:fixed;z-index:2147483000;width:var(--ab-size);height:var(--ab-size);border-radius:50%;background:#2c2c2e;box-shadow:0 6px 16px rgba(0,0,0,.22);display:flex;align-items:center;justify-content:center;touch-action:none;cursor:pointer;user-select:none;-webkit-user-select:none;transition:transform .15s;left:0;top:0;overflow:hidden;}'
        + '.ab-ball:active{transform:scale(.94);}'
        + '.ab-ball.ab-hidden{display:none;}'
        + '.ab-ring{width:66%;height:66%;border-radius:50%;background:#8e8e93;box-shadow:inset 0 2px 4px rgba(255,255,255,.25),inset 0 -2px 4px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;}'
        + '.ab-core{width:72%;height:72%;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.18);display:flex;align-items:center;justify-content:center;font-size:calc(var(--ab-size) * 0.34);line-height:1;overflow:hidden;}'
        + '.ab-photo{display:none;position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;border-radius:50%;}'
        + '.ab-ball.ab-image-mode .ab-ring{display:none;}'
        + '.ab-ball.ab-image-mode .ab-photo{display:block;}'
        + '.ab-panel{position:fixed;z-index:2147483001;width:252px;max-width:calc(100vw - 16px);background:rgba(255,255,255,.98);-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);border-radius:18px;box-shadow:0 14px 40px rgba(0,0,0,.2);padding:14px;display:none;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",Arial,sans-serif;color:#000;max-height:72vh;overflow:auto;box-sizing:border-box;}'
        + '.ab-panel.ab-open{display:block;}'
        + '.ab-tabs{display:flex;gap:4px;background:rgba(120,120,128,.14);border-radius:11px;padding:4px;margin-bottom:14px;}'
        + '.ab-tab{flex:1;border:none;background:transparent;font-size:12px;padding:8px 0;border-radius:8px;color:#3a3a3c;cursor:pointer;font-family:inherit;}'
        + '.ab-tab.ab-active{background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.14);font-weight:600;}'
        + '.ab-select{width:100%;font-size:13px;padding:10px 11px;border-radius:11px;border:0.5px solid rgba(60,60,67,.2);background:#fff;color:#000;margin-bottom:12px;box-sizing:border-box;font-family:inherit;-webkit-appearance:none;appearance:none;background-image:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\' viewBox=\'0 0 10 6\'><path d=\'M1 1l4 4 4-4\' fill=\'none\' stroke=\'%238e8e93\' stroke-width=\'1.6\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/></svg>");background-repeat:no-repeat;background-position:right 11px center;padding-right:28px;}'
        + '.ab-select:disabled{opacity:.5;}'
        + '.ab-model-head{display:flex;align-items:center;justify-content:space-between;margin:0 2px 8px;}'
        + '.ab-model-label{font-size:11px;font-weight:600;color:#8e8e93;letter-spacing:.2px;}'
        + '.ab-pull{width:28px;height:28px;border:none;border-radius:50%;background:rgba(0,122,255,.12);color:#007aff;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;}'
        + '.ab-pull:active{background:rgba(0,122,255,.22);}'
        + '.ab-pull svg{width:15px;height:15px;display:block;}'
        + '.ab-pull.ab-spin svg{animation:abspin .8s linear infinite;}'
        + '@keyframes abspin{to{transform:rotate(360deg);}}'
        + '.ab-save{width:100%;border:none;border-radius:12px;background:#007aff;color:#fff;font-size:13px;padding:12px 0;font-weight:600;cursor:pointer;font-family:inherit;margin-top:2px;}'
        + '.ab-save:active{opacity:.85;}'
        + '.ab-status{font-size:11px;color:#8e8e93;min-height:15px;margin-top:10px;text-align:center;line-height:1.4;}'
        + '.ab-bt-cats{display:flex;gap:4px;margin-bottom:10px;}'
        + '.ab-bt-cat{flex:1;border:none;background:rgba(120,120,128,.12);border-radius:8px;padding:8px 0;font-size:12px;color:#3a3a3c;cursor:pointer;font-family:inherit;}'
        + '.ab-bt-cat.ab-active{background:#007aff;color:#fff;font-weight:600;}'
        + '.ab-bt-actions{display:flex;gap:6px;margin-bottom:10px;}'
        + '.ab-bt-btn{flex:1;border:none;border-radius:11px;background:rgba(120,120,128,.12);color:#1c1c1e;font-size:12px;padding:10px 0;font-weight:500;cursor:pointer;font-family:inherit;}'
        + '.ab-bt-btn:active{opacity:.8;}'
        + '.ab-bt-tip{font-size:10px;color:#8e8e93;text-align:center;margin-bottom:8px;line-height:1.4;}';

    function injectCSS() {
        var st = document.createElement('style');
        st.id = 'apiFloatStyle';
        st.textContent = CSS;
        (document.head || document.documentElement).appendChild(st);
    }

    var settings = loadSettings();
    if (!settings.enabled) {
        window.ApiBall = { getSettings: loadSettings, isTopLevel: true };
        return;
    }

    injectCSS();

    // ---------- DOM ----------
    var ball = document.createElement('div');
    ball.className = 'ab-ball';
    ball.innerHTML = '<img class="ab-photo" alt=""><div class="ab-ring"><div class="ab-core" id="abCore"></div></div>';
    var panel = document.createElement('div');
    panel.className = 'ab-panel';
    panel.innerHTML = ''
        + '<div class="ab-tabs">'
        + '<button class="ab-tab" data-cat="api">API</button>'
        + '<button class="ab-tab" data-cat="image">Image</button>'
        + '<button class="ab-tab" data-cat="tts">TTS</button>'
        + '<button class="ab-tab" data-cat="beautify">美化</button>'
        + '</div>'
        + '<div class="ab-api-group">'
        + '<select class="ab-select ab-preset"></select>'
        + '<div class="ab-model-head"><span class="ab-model-label">模型</span>'
        + '<button class="ab-pull" title="拉取模型"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.34 5.66"/><polyline points="20 4 20 11 13 11"/></svg></button></div>'
        + '<select class="ab-select ab-model"></select>'
        + '<button class="ab-save">保存配置</button>'
        + '</div>'
        + '<div class="ab-beauty-group" style="display:none">'
        + '<div class="ab-bt-cats">'
        + '<button class="ab-bt-cat ab-active" data-bt="global">全局美化</button>'
        + '<button class="ab-bt-cat" data-bt="chat">聊天美化</button>'
        + '</div>'
        + '<select class="ab-select ab-bt-preset"></select>'
        + '<div class="ab-bt-actions">'
        + '<button class="ab-bt-btn" data-bt-act="clear">清空</button>'
        + '<button class="ab-bt-btn" data-bt-act="restore">还原初始</button>'
        + '</div>'
        + '<button class="ab-save" data-bt-act="save">应用并保存</button>'
        + '<div class="ab-bt-tip">还原初始会载入内置初始模板</div>'
        + '</div>'
        + '<div class="ab-status"></div>';

    function mount() {
        (document.body || document.documentElement).appendChild(ball);
        (document.body || document.documentElement).appendChild(panel);
        applySettings(settings);
        placeBall(settings.x, settings.y);
        bind();
    }

    var coreEl, photoEl, presetEl, modelEl, statusEl, pullBtn;
    var apiGroup, beautyGroup, beautyPresetEl;
    var beautyCat = 'global';
    var activeCat = 'api';
    var working = { url: '', key: '', model: '', preset: '' };
    var modelCache = [];

    function $(sel, root) { return (root || panel).querySelector(sel); }

    function getBounds() {
        var el = document.querySelector('.app-container') || document.querySelector('.container');
        var r = el ? el.getBoundingClientRect() : null;
        if (r && r.width > 80 && r.height > 120) {
            return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        }
        return { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    }

    function applySettings(s) {
        document.documentElement.style.setProperty('--ab-size', (s.size || 52) + 'px');
        ball.classList.toggle('ab-hidden', s.enabled === false);
        ball.classList.toggle('ab-image-mode', !!s.image);
        photoEl = photoEl || ball.querySelector('.ab-photo');
        if (photoEl) {
            if (s.image) photoEl.src = s.image;
            else photoEl.removeAttribute('src');
        }
        coreEl = coreEl || ball.querySelector('.ab-core');
        coreEl.textContent = (!s.image && s.icon && s.icon !== 'classic') ? s.icon : '';
        panel.style.visibility = 'hidden';
        if (s.x == null || s.y == null) {
            var b = getBounds();
            s.x = b.right - (s.size || 52) - 14;
            s.y = b.bottom - (s.size || 52) - 120;
            persistSettings({ x: s.x, y: s.y });
        }
        placeBall(s.x, s.y);
        if (panel.classList.contains('ab-open')) placePanel();
    }

    function placeBall(x, y) {
        var size = settings.size || 52;
        var b = getBounds();
        var pad = 8;
        x = Math.max(b.left + pad, Math.min(b.right - size - pad, x));
        y = Math.max(b.top + pad, Math.min(b.bottom - size - pad, y));
        ball.style.left = x + 'px';
        ball.style.top = y + 'px';
        settings.x = x; settings.y = y;
    }

    function placePanel() {
        var size = settings.size || 52;
        var pw = panel.offsetWidth || 252, ph = panel.offsetHeight || 190;
        var b = getBounds();
        var bx = parseFloat(ball.style.left) || 0;
        var by = parseFloat(ball.style.top) || 0;
        var left = bx + size / 2 - pw / 2;
        left = Math.max(b.left + 8, Math.min(b.right - pw - 8, left));
        var top = by - ph - 12;
        if (top < b.top + 8) top = Math.min(b.bottom - ph - 8, by + size + 12);
        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
        panel.style.visibility = 'visible';
    }

    // ---------- 交互 ----------
    function bind() {
        coreEl = ball.querySelector('.ab-core');
        presetEl = $('.ab-preset');
        modelEl = $('.ab-model');
        statusEl = $('.ab-status');
        pullBtn = $('.ab-pull');
        apiGroup = panel.querySelector('.ab-api-group');
        beautyGroup = panel.querySelector('.ab-beauty-group');
        beautyPresetEl = panel.querySelector('.ab-bt-preset');

        panel.querySelectorAll('.ab-tab').forEach(function (b) {
            b.addEventListener('click', function () { setCat(b.dataset.cat); });
        });
        panel.querySelectorAll('.ab-bt-cat').forEach(function (b) {
            b.addEventListener('click', function () { setBeautyCat(b.dataset.bt); });
        });
        panel.querySelectorAll('[data-bt-act]').forEach(function (b) {
            b.addEventListener('click', function () {
                var a = b.dataset.btAct;
                if (a === 'clear') doBeautyClear();
                else if (a === 'restore') doBeautyRestore();
                else if (a === 'save') doBeautySave();
            });
        });
        if (beautyPresetEl) beautyPresetEl.addEventListener('change', function () { onBeautyPreset(this.value); });
        panel.querySelectorAll('.ab-tab').forEach(function (b) {
            b.classList.toggle('ab-active', b.dataset.cat === activeCat);
        });
        presetEl.addEventListener('change', function () { onPresetChange(this.value); });
        modelEl.addEventListener('change', function () { working.model = this.value; syncModelText(); });
        pullBtn.addEventListener('click', doPull);
        $('.ab-save').addEventListener('click', doSave);

        // 拖动 + 点击
        var dragging = false, moved = false, startX = 0, startY = 0, offX = 0, offY = 0;
        ball.addEventListener('pointerdown', function (e) {
            if (e.button != null && e.button !== 0) return;
            dragging = true; moved = false;
            startX = e.clientX; startY = e.clientY;
            offX = e.clientX - (parseFloat(ball.style.left) || 0);
            offY = e.clientY - (parseFloat(ball.style.top) || 0);
            try { ball.setPointerCapture(e.pointerId); } catch (err) {}
        });
        ball.addEventListener('pointermove', function (e) {
            if (!dragging) return;
            if (Math.abs(e.clientX - startX) > 4 || Math.abs(e.clientY - startY) > 4) moved = true;
            if (moved) placeBall(e.clientX - offX, e.clientY - offY);
        });
        ball.addEventListener('pointerup', function (e) {
            if (!dragging) return;
            dragging = false;
            try { ball.releasePointerCapture(e.pointerId); } catch (err) {}
            if (moved) { persistSettings({ x: settings.x, y: settings.y }); }
            else { togglePanel(); }
        });
        ball.addEventListener('pointercancel', function () { dragging = false; });

        // 点击面板外收起
        document.addEventListener('pointerdown', function (e) {
            if (!panel.classList.contains('ab-open')) return;
            if (panel.contains(e.target) || ball.contains(e.target)) return;
            closePanel();
        }, true);

        window.addEventListener('resize', function () {
            placeBall(settings.x, settings.y);
            if (panel.classList.contains('ab-open')) placePanel();
        });

        // 设置同步（同源 storage 事件 + 父级消息）
        window.addEventListener('storage', function (e) {
            if (e.key !== LS_KEY) return;
            settings = loadSettings();
            applySettings(settings);
            if (settings.enabled === false) closePanel();
        });
        window.addEventListener('message', function (e) {
            var d = e.data;
            if (d && d.type === 'apiBallSettings') {
                settings = persistSettings(d.settings || {});
                applySettings(settings);
                if (settings.enabled === false) closePanel();
            }
        });
    }

    var panelOpen = false;
    function togglePanel() {
        if (panelOpen) closePanel();
        else openPanel();
    }
    function openPanel() {
        panelOpen = true;
        panel.classList.add('ab-open');
        if (activeCat === 'beautify') {
            loadBeautyPresets();
            placePanel();
            return;
        }
        loadAll().then(placePanel);
        placePanel();
    }
    function closePanel() {
        panelOpen = false;
        panel.classList.remove('ab-open');
    }

    // ---------- 数据 ----------
    function loadAll() {
        return idbGet(CONFIG_KEY).then(function (cfg) {
            cfg = cfg || {};
            return idbGet(PRESET_LIST_KEY).then(function (lists) {
                lists = lists || {};
                return applyCat(cfg, lists, activeCat);
            });
        });
    }

    function setCat(cat) {
        activeCat = cat;
        panel.querySelectorAll('.ab-tab').forEach(function (b) {
            b.classList.toggle('ab-active', b.dataset.cat === cat);
        });
        var isBeauty = (cat === 'beautify');
        if (apiGroup) apiGroup.style.display = isBeauty ? 'none' : '';
        if (beautyGroup) beautyGroup.style.display = isBeauty ? 'block' : 'none';
        if (isBeauty) {
            if (statusEl) statusEl.textContent = '';
            loadBeautyPresets();
            return;
        }
        loadAll();
    }

    function applyCat(cfg, lists, cat) {
        var c = CATS[cat];
        // 预设下拉
        var names = (lists[c.listKey] || []).slice();
        presetEl.innerHTML = '<option value="">默认</option>';
        names.forEach(function (n) {
            var o = document.createElement('option'); o.value = n; o.textContent = n; presetEl.appendChild(o);
        });
        var curPreset = cfg[c.fields.preset] || '';
        presetEl.value = names.indexOf(curPreset) !== -1 ? curPreset : '';

        working.url = cfg[c.fields.url] || '';
        working.key = cfg[c.fields.key] || '';
        working.model = cfg[c.fields.model] || '';
        working.preset = presetEl.value;

        return idbGet(MODEL_LIST_KEY).then(function (all) {
            var models = (all && all[c.selectId]) || [];
            modelCache = models.slice();
            renderModels(models, working.model);
            statusEl.textContent = working.url ? (working.url.replace(/^https?:\/\//, '').slice(0, 26)) : '未配置地址';
        });
    }

    function renderModels(models, selected) {
        modelEl.innerHTML = '<option value="">选择模型…</option>';
        models.forEach(function (m) {
            var o = document.createElement('option'); o.value = m.value; o.textContent = m.text; modelEl.appendChild(o);
        });
        if (selected) {
            var exists = models.some(function (m) { return m.value === selected; });
            if (!exists) {
                var o = document.createElement('option'); o.value = selected; o.textContent = selected; modelEl.appendChild(o);
            }
            modelEl.value = selected;
        } else {
            modelEl.value = '';
        }
    }

    function syncModelText() {
        var opt = modelEl.options[modelEl.selectedIndex];
        working.modelText = opt ? opt.text : working.model;
    }

    function onPresetChange(name) {
        var c = CATS[activeCat];
        working.preset = name || '';
        if (!name) { syncConfigToStore(); return; }
        return idbGet(PRESET_DATA_KEY).then(function (all) {
            var data = (all && all[c.prefix + name]) || null;
            if (!data) { statusEl.textContent = '预设数据丢失'; return; }
            working.url = data.url || '';
            working.key = data.key || '';
            working.model = data.modelValue || data.modelText || '';
            renderModels(modelCache, working.model);
            syncModelText();
            return syncConfigToStore().then(function () {
                statusEl.textContent = '已切换：' + name;
                broadcastReload();
            });
        });
    }

    // 把当前 working 写回 nano_api_config（让 API 页面 / TTS 立即使用）
    function syncConfigToStore() {
        var c = CATS[activeCat];
        return idbGet(CONFIG_KEY).then(function (cfg) {
            cfg = cfg || {};
            cfg[c.fields.url] = cleanUrl(working.url);
            cfg[c.fields.key] = working.key;
            cfg[c.fields.model] = working.model;
            cfg[c.fields.preset] = working.preset;
            return idbSet(CONFIG_KEY, cfg);
        }).then(function () {
            // 同步「分配」：让各功能按所选预设读取（无预设时回退到当前配置）
            return idbGet(ASSIGN_KEY).then(function (assign) {
                assign = assign || {};
                (ASSIGN_FIELDS[activeCat] || []).forEach(function (f) {
                    assign[f] = working.preset || '';
                });
                return idbSet(ASSIGN_KEY, assign);
            });
        });
    }

    function doSave() {
        var c = CATS[activeCat];
        syncModelText();
        syncConfigToStore().then(function () {
            if (!working.preset) { flash('已保存配置'); return; }
            // 同时写回预设数据，后续切换即用这套
            return idbGet(PRESET_DATA_KEY).then(function (all) {
                all = all || {};
                var prev = all[c.prefix + working.preset] || {};
                prev.url = cleanUrl(working.url);
                prev.key = working.key;
                prev.modelValue = working.model;
                prev.modelText = working.modelText || working.model;
                all[c.prefix + working.preset] = prev;
                return idbSet(PRESET_DATA_KEY, all).then(function () {
                    flash('已保存：' + working.preset);
                });
            });
        }).then(function () {
            broadcastReload();
        });
    }

    function doPull() {
        var c = CATS[activeCat];
        var url = cleanUrl(working.url);
        var key = cleanKey(working.key);
        if (!url || !key) { flash('请先在 API 页面填写地址和 Key'); return; }
        pullBtn.classList.add('ab-spin');
        statusEl.textContent = '正在拉取…';

        idbGet(CONFIG_KEY).then(function (cfg) {
            cfg = cfg || {};
            var type = activeCat === 'tts' ? (cfg.ttsType || 'openai') : '';
            var groupId = activeCat === 'tts' ? (cfg.ttsGroupId || '') : '';
            var p;
            if (type === 'minimax') {
                p = fetch(baseV1(url) + '/get_voice?GroupId=' + encodeURIComponent(groupId), { headers: { 'Authorization': 'Bearer ' + key } });
            } else if (type === 'fishaudio') {
                var fishRoot = cleanUrl(url).replace(/\/v1$/i, '');
                p = fetch(fishRoot + '/model?page_size=100', { headers: { 'Authorization': 'Bearer ' + key } });
            } else {
                p = fetch(baseV1(url) + '/models', { headers: { 'Authorization': 'Bearer ' + key } });
            }
            return p.then(function (resp) {
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                return resp.json();
            }).then(function (data) {
                var raw;
                if (type === 'minimax') raw = data.voice_list || data.data || [];
                else if (type === 'fishaudio') raw = data.items || data.data || [];
                else raw = data.data || data.models || [];
                var models = (raw || []).map(function (m) {
                    var name = m.voice_id || m._id || m.id || m.name || m;
                    return { value: name, text: m.voice_name || m.title || m.name || name };
                }).filter(function (m) { return m.value; });
                if (!models.length) throw new Error('未找到模型');
                return idbGet(MODEL_LIST_KEY).then(function (all) {
                    all = all || {};
                    all[c.selectId] = models;
                    return idbSet(MODEL_LIST_KEY, all).then(function () {
                        modelCache = models.slice();
                        renderModels(models, working.model || models[0].value);
                        working.model = modelEl.value;
                        flash('拉取成功 · ' + models.length + ' 个');
                    });
                });
            });
        }).catch(function (e) {
            flash('拉取失败：' + (e && e.message ? e.message : e));
        }).finally(function () {
            pullBtn.classList.remove('ab-spin');
        });
    }

    function flash(msg) {
        statusEl.textContent = msg;
        clearTimeout(flash._t);
        flash._t = setTimeout(function () {
            if (statusEl.textContent === msg) statusEl.textContent = '';
        }, 2600);
    }

    function broadcastReload() {
        try {
            var frames = document.querySelectorAll('iframe');
            for (var i = 0; i < frames.length; i++) {
                try { frames[i].contentWindow.postMessage({ type: 'nanoApiReload' }, '*'); } catch (e) {}
            }
        } catch (e) {}
    }

    // ============================================================
    // 美化 tab：切换预设 / 清空 / 还原初始 / 应用并保存
    // 与美化页共用 BeautifyAppDB(presets, settings) 与 localStorage 键
    // ============================================================
    var BEAUTY_DB = 'BeautifyAppDB';
    var beautyTemplatesReady = null;

    function openBeautyDB() {
        return new Promise(function (resolve, reject) {
            try {
                var req = indexedDB.open(BEAUTY_DB, 1);
                req.onupgradeneeded = function (e) {
                    var d = e.target.result;
                    if (!d.objectStoreNames.contains('presets')) d.createObjectStore('presets', { keyPath: 'id', autoIncrement: true });
                    if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings', { keyPath: 'key' });
                };
                req.onsuccess = function (e) { resolve(e.target.result); };
                req.onerror = function (e) { reject(e.target.error); };
            } catch (e) { reject(e); }
        });
    }
    function bdbAllPresets() {
        return openBeautyDB().then(function (db) {
            return new Promise(function (resolve) {
                try {
                    var r = db.transaction('presets', 'readonly').objectStore('presets').getAll();
                    r.onsuccess = function () { resolve(r.result || []); try { db.close(); } catch (e) {} };
                    r.onerror = function () { resolve([]); try { db.close(); } catch (e) {} };
                } catch (e) { resolve([]); try { db.close(); } catch (e2) {} }
            });
        }).catch(function () { return []; });
    }
    function bdbSet(store, obj) {
        return openBeautyDB().then(function (db) {
            return new Promise(function (resolve) {
                try {
                    var tx = db.transaction(store, 'readwrite');
                    tx.objectStore(store).put(obj);
                    tx.oncomplete = function () { resolve(); try { db.close(); } catch (e) {} };
                    tx.onerror = function () { resolve(); try { db.close(); } catch (e) {} };
                } catch (e) { resolve(); try { db.close(); } catch (e2) {} }
            });
        }).catch(function () {});
    }

    function ensureBeautyScripts() {
        if (beautyTemplatesReady) return beautyTemplatesReady;
        beautyTemplatesReady = new Promise(function (resolve) {
            var pending = 0, done = false;
            function finish() { if (!done && pending <= 0) { done = true; resolve(); } }
            function load(src) {
                pending++;
                var s = document.createElement('script');
                s.src = src; s.async = true;
                s.onload = function () { pending--; finish(); };
                s.onerror = function () { pending--; finish(); };
                (document.head || document.documentElement).appendChild(s);
            }
            if (!window.NANO_GLOBAL_TEMPLATE) load('js/nano-global-template.js');
            if (!window.NANO_CHAT_TEMPLATE) load('js/nano-chat-template.js');
            finish();
        });
        return beautyTemplatesReady;
    }
    function initialTemplate(cat) {
        return cat === 'global' ? (window.NANO_GLOBAL_TEMPLATE || '') : (window.NANO_CHAT_TEMPLATE || '');
    }

    function applyBeautify(cat, css) {
        try {
            localStorage.setItem('beautify_' + cat, css);
            localStorage.setItem('beautify_' + cat + '_v2', css);
            localStorage.setItem('beautify_' + cat + '_time', Date.now());
        } catch (e) {}
        try { if (window.__nanoAppearance) window.__nanoAppearance.applyMessage({ type: 'beautify:apply', target: cat, css: css }); } catch (e) {}
        try {
            var frames = document.querySelectorAll('iframe');
            for (var i = 0; i < frames.length; i++) {
                try { frames[i].contentWindow.postMessage({ type: 'beautify:apply', target: cat, css: css }, '*'); } catch (e) {}
            }
        } catch (e) {}
    }

    function loadBeautyPresets() {
        if (!beautyPresetEl) return;
        bdbAllPresets().then(function (items) {
            var list = (items || []).filter(function (x) { return x && x.category === beautyCat; });
            beautyPresetEl.innerHTML = '';
            if (!list.length) {
                var o0 = document.createElement('option');
                o0.value = ''; o0.textContent = '暂无' + (beautyCat === 'global' ? '全局' : '聊天') + '预设';
                beautyPresetEl.appendChild(o0);
                return;
            }
            var ph = document.createElement('option');
            ph.value = ''; ph.textContent = '切换预设…';
            beautyPresetEl.appendChild(ph);
            list.forEach(function (x) {
                var o = document.createElement('option');
                o.value = x.id; o.textContent = x.name || ('预设 ' + x.id);
                beautyPresetEl.appendChild(o);
            });
        });
    }

    function setBeautyCat(cat) {
        beautyCat = cat;
        panel.querySelectorAll('.ab-bt-cat').forEach(function (b) {
            b.classList.toggle('ab-active', b.dataset.bt === cat);
        });
        loadBeautyPresets();
    }

    function onBeautyPreset(value) {
        var id = Number(value);
        if (!id) return;
        bdbAllPresets().then(function (items) {
            var found = (items || []).find(function (x) { return x.id === id && x.category === beautyCat; });
            if (!found) { flash('预设不存在，请重新选择'); return; }
            var css = found.code || '';
            applyBeautify(beautyCat, css);
            bdbSet('settings', { key: 'applied_' + beautyCat, value: css }).then(function () {
                flash('已切换：' + (found.name || ''));
            });
        });
    }

    function doBeautyClear() {
        applyBeautify(beautyCat, '');
        if (beautyCat === 'chat') {
            try {
                localStorage.removeItem('beautify_chat_avatar');
                localStorage.removeItem('beautify_chat_avatar_cfg');
            } catch (e) {}
            try {
                var frames = document.querySelectorAll('iframe');
                for (var i = 0; i < frames.length; i++) {
                    try { frames[i].contentWindow.postMessage({ type: 'beautify:apply', target: 'chat-avatar', css: '' }, '*'); } catch (e) {}
                }
            } catch (e) {}
        }
        bdbSet('settings', { key: 'applied_' + beautyCat, value: '' }).then(function () {
            flash('已清空' + (beautyCat === 'global' ? '全局' : '聊天') + '美化');
        });
    }

    function doBeautyRestore() {
        ensureBeautyScripts().then(function () {
            var tpl = initialTemplate(beautyCat);
            if (!tpl) { flash('初始模板加载失败'); return; }
            applyBeautify(beautyCat, tpl);
            bdbSet('settings', { key: 'applied_' + beautyCat, value: tpl }).then(function () {
                flash('已还原初始');
            });
        });
    }

    function doBeautySave() {
        var id = Number(beautyPresetEl && beautyPresetEl.value) || 0;
        var p;
        if (id) {
            p = bdbAllPresets().then(function (items) {
                var found = (items || []).find(function (x) { return x.id === id && x.category === beautyCat; });
                var css = found ? (found.code || '') : (localStorage.getItem('beautify_' + beautyCat + '_v2') || '');
                applyBeautify(beautyCat, css);
                return bdbSet('settings', { key: 'applied_' + beautyCat, value: css });
            });
        } else {
            var css2 = localStorage.getItem('beautify_' + beautyCat + '_v2') || '';
            applyBeautify(beautyCat, css2);
            p = bdbSet('settings', { key: 'applied_' + beautyCat, value: css2 });
        }
        p.then(function () { flash('已保存'); });
    }

    window.ApiBall = {
        isTopLevel: true,
        getSettings: loadSettings,
        apply: function (patch) {
            settings = persistSettings(patch || {});
            applySettings(settings);
            if (settings.enabled === false) closePanel();
        },
        open: openPanel,
        close: closePanel
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount);
    } else {
        mount();
    }
})();
