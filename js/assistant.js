// assistant.js — 内置助手「娜娜」v1
// 只覆盖（美化/世界书等存储），不改源码；可读取源码回答"该怎么改"。
(function () {
  'use strict';
  var KB = window.NANO_ASSISTANT_KB || { about: [], scopes: [], pages: [], commands: [] };

  var msgsEl = document.getElementById('asMsgs');
  var scrollEl = document.getElementById('asScroll');
  var inputEl = document.getElementById('asInput');
  var sendBtn = document.getElementById('asSend');
  var attachBtn = document.getElementById('asAttach');
  var fileEl = document.getElementById('asFile');
  var subEl = document.getElementById('asSub');
  var suggestsEl = document.getElementById('asSuggests');

  /* ---------------- 状态 ---------------- */
  var history = [];        // {role, content}
  var busy = false;
  var readDepth = 0;

  /* ---------------- 工具 ---------------- */
  function toast(t) {
    var el = document.querySelector('.as-toast');
    if (!el) { el = document.createElement('div'); el.className = 'as-toast'; document.body.appendChild(el); }
    el.textContent = t; el.classList.add('show');
    clearTimeout(el._t); el._t = setTimeout(function () { el.classList.remove('show'); }, 1500);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function renderText(t) {
    var s = esc(t);
    // 代码块 ```lang ... ```
    s = s.replace(/```([\s\S]*?)```/g, function (_, code) { return '<pre>' + code.replace(/^\n/, '') + '</pre>'; });
    // 行内代码
    s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    return s;
  }
  function scrollBottom() { try { scrollEl.scrollTop = scrollEl.scrollHeight; } catch (e) {} }

  function addMsg(role, html, opts) {
    opts = opts || {};
    var row = document.createElement('div');
    row.className = 'as-msg ' + (role === 'me' ? 'me' : '');
    var av = document.createElement('div');
    av.className = 'as-avatar';
    av.textContent = role === 'me' ? '我' : '娜';
    var wrap = document.createElement('div');
    wrap.className = 'as-bubble-wrap';
    if (opts.typing) {
      wrap.innerHTML = '<div class="as-bubble"><span class="as-typing"><i></i><i></i><i></i></span></div>';
    } else {
      wrap.innerHTML = '<div class="as-bubble">' + html + '</div>';
    }
    row.appendChild(av); row.appendChild(wrap);
    msgsEl.appendChild(row); scrollBottom();
    return wrap;
  }

  /* ---------------- API 配置 ---------------- */
  function idbOpen(name) {
    return new Promise(function (res, rej) {
      try { var r = indexedDB.open(name); r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }
      catch (e) { rej(e); }
    });
  }
  function idbGet(dbName, store, key) {
    return idbOpen(dbName).then(function (db) {
      return new Promise(function (res) {
        try {
          if (!db.objectStoreNames.contains(store)) { db.close(); res(null); return; }
          var rq = db.transaction(store, 'readonly').objectStore(store).get(key);
          rq.onsuccess = function () { res(rq.result); db.close(); };
          rq.onerror = function () { res(null); db.close(); };
        } catch (e) { res(null); }
      });
    }).catch(function () { return null; });
  }
  async function getApi() {
    var rec = await idbGet('nano_api_db', 'api_data', 'nano_api_config');
    var v = (rec && rec.value && typeof rec.value === 'object') ? rec.value : rec;
    if (!v) { try { var raw = localStorage.getItem('nano_api_config'); if (raw) v = JSON.parse(raw); } catch (e) {} }
    if (!v || !v.mainUrl) return null;
    return { url: v.mainUrl, key: v.mainKey || '', model: v.mainModel || '', temp: v.mainTemp != null ? v.mainTemp : 0.7 };
  }
  function v1base(u) {
    u = String(u || '').trim().replace(/\/+$/, '');
    if (!/\/v1$/.test(u)) u += '/v1';
    return u;
  }

  /* ---------------- 系统提示词 ---------------- */
  function systemPrompt() {
    var lines = [];
    lines.push('你是「娜娜」，Nano 应用内置的美化/装修助手。你熟悉 Nano 的全部前端结构。');
    lines.push('人设：女生，叫娜娜，语气亲切自然、简洁直接，中文回答。');
    lines.push('');
    lines.push('【最重要的规则】');
    lines.push('1. Nano 是纯前端 PWA。你只能"覆盖"样式和写入存储，不能修改部署后的源码文件。');
    lines.push('2. 用户在每个美化页点"恢复默认"即可撤销你的覆盖，因为覆盖只存在浏览器存储里。');
    lines.push('3. 你可以读取源码来回答"我应该怎么改/改哪个文件"，并给出清晰步骤。');
    lines.push('4. 你不能新增页面或改后端逻辑。这类需求要告诉用户：需要开发者改源码并重新部署。');
    lines.push('');
    lines.push('【执行动作的方式】');
    lines.push('当需要真正修改时，在回复里输出一个或多个如下代码块（用户会看到确认按钮，确认后才生效）：');
    lines.push('<action>{"tool":"apply_beautify","args":{"scope":"heart","name":"粉红心声","css":"..."}}</action>');
    lines.push('可用动作：');
    KB.commands.forEach(function (c) { lines.push('- ' + c.tool + ' 参数 ' + JSON.stringify(c.args) + '：' + (c.note || '')); });
    lines.push('');
    lines.push('【可覆盖的范围 scope】');
    KB.scopes.forEach(function (s) {
      lines.push('· ' + s.id + '（' + s.name + '）：' + s.desc);
      lines.push('  存储：' + s.storage);
      if (s.selectors) lines.push('  常用选择器：' + s.selectors.join('  '));
    });
    lines.push('');
    lines.push('【源码文件（需要时可 read_file 读取）】');
    KB.pages.forEach(function (p) { lines.push('· ' + p.file + '（' + p.name + (p.note ? '：' + p.note : '') + '）'); });
    lines.push('');
    lines.push('【存储位置】');
    Object.keys(KB.storage || {}).forEach(function (k) { lines.push('· ' + k + ' = ' + KB.storage[k]); });
    lines.push('');
    lines.push('【世界书条目字段】' + (KB.worldbookEntryFields || []).join(', '));
    lines.push('');
    lines.push('写 CSS 时：直接给完整可用的 CSS；覆盖全局/聊天时无需加 !important（系统会注入），但需要压过源码时可用 !important。');
    lines.push('不确定选择器或结构时，先 read_file 读取对应文件，再动手，不要瞎猜。');
    return lines.join('\n');
  }

  /* ---------------- 调用模型 ---------------- */
  async function callModel(messages) {
    var api = await getApi();
    if (!api) throw new Error('未配置主 API，请到「设置中心 → API」里配置');
    var resp = await fetch(v1base(api.url) + '/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + api.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: api.model,
        messages: messages,
        temperature: api.temp,
        stream: false
      })
    });
    if (!resp.ok) {
      var t = ''; try { t = await resp.text(); } catch (e) {}
      throw new Error('API ' + resp.status + '：' + t.slice(0, 200));
    }
    var data = await resp.json();
    return (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  }

  /* ---------------- 动作解析 ---------------- */
  function parseActions(text) {
    var actions = [];
    var clean = String(text || '').replace(/<action>([\s\S]*?)<\/action>/g, function (_, json) {
      try { var o = JSON.parse(json.trim()); if (o && o.tool) actions.push(o); } catch (e) {}
      return '';
    });
    return { clean: clean.trim(), actions: actions };
  }

  /* ---------------- 主循环 ---------------- */
  async function runModel() {
    if (busy) return;
    busy = true; sendBtn.disabled = true;
    var typingWrap = addMsg('assistant', '', { typing: true });
    try {
      var messages = [{ role: 'system', content: systemPrompt() }].concat(history);
      var reply = await callModel(messages);
      typingWrap.remove();
      history.push({ role: 'assistant', content: reply });
      var parsed = parseActions(reply);
      if (parsed.clean || !parsed.actions.length) addMsg('assistant', renderText(parsed.clean || '（没有内容）'));
      else addMsg('assistant', '好的，我来处理，请确认下面的操作：');

      // read_file 只读，自动执行并继续（最多 3 轮）
      var reads = parsed.actions.filter(function (a) { return a.tool === 'read_file' && a.args && a.args.path; });
      if (reads.length) {
        if (readDepth < 3) {
          readDepth++;
          var out = '';
          for (var i = 0; i < reads.length; i++) {
            var path = reads[i].args.path;
            var txt = await fetchSource(path);
            out += '\n===== ' + path + ' =====\n' + (txt || '（读取失败）') + '\n';
          }
          history.push({ role: 'user', content: '[以下是你请求读取的源码，请基于它继续]\n' + out });
          busy = false; sendBtn.disabled = false;
          return runModel();
        }
      }
      readDepth = 0;

      // 需要写入的动作：出确认卡
      parsed.actions.filter(function (a) { return a.tool !== 'read_file'; }).forEach(function (a) {
        renderActionCard(a);
      });
    } catch (e) {
      try { typingWrap.remove(); } catch (err) {}
      addMsg('assistant', '<span style="color:#ff3b30">' + esc(e.message || '出错了') + '</span>');
    } finally {
      busy = false; sendBtn.disabled = false;
      try { typingWrap.remove(); } catch (e) {}
    }
  }

  async function fetchSource(path) {
    try {
      var r = await fetch(path, { cache: 'no-cache' });
      if (!r.ok) return '';
      var t = await r.text();
      if (t.length > 16000) t = t.slice(0, 16000) + '\n…（已截断）';
      return t;
    } catch (e) { return ''; }
  }

  /* ---------------- 动作确认卡 ---------------- */
  function actionTitle(a) {
    if (a.tool === 'apply_beautify') return '覆盖「' + (a.args.scope || '') + '」美化';
    if (a.tool === 'add_worldbook') return '新增世界书：' + (a.args.name || '');
    if (a.tool === 'open_page') return '打开页面：' + (a.args.url || '');
    return a.tool;
  }
  function actionDesc(a) {
    if (a.tool === 'apply_beautify') return '预设：' + (a.args.name || '未命名') + '\n\n' + String(a.args.css || '').slice(0, 600);
    if (a.tool === 'add_worldbook') return '条目数：' + ((a.args.entries || []).length);
    return JSON.stringify(a.args || {});
  }
  function renderActionCard(a) {
    var wrap = addMsg('assistant', '');
    var card = document.createElement('div');
    card.className = 'as-action';
    card.innerHTML = '<div class="as-action-title">' + esc(actionTitle(a)) + '</div>' +
      '<div class="as-action-desc">' + esc(actionDesc(a)) + '</div>' +
      '<div class="as-action-btns"><button class="skip">取消</button><button class="run">执行</button></div>';
    wrap.querySelector('.as-bubble').appendChild(card);
    card.querySelector('.skip').addEventListener('click', function () { card.remove(); toast('已取消'); });
    card.querySelector('.run').addEventListener('click', async function () {
      try {
        await execAction(a);
        card.innerHTML = '<div class="as-action-title">✓ ' + esc(actionTitle(a)) + ' 已执行</div>';
        toast('已应用');
      } catch (e) { toast('失败：' + (e.message || e)); }
    });
  }

  /* ---------------- 执行动作 ---------------- */
  async function execAction(a) {
    if (a.tool === 'apply_beautify') return applyBeautify(a.args.scope, a.args.name, a.args.css);
    if (a.tool === 'add_worldbook') return addWorldbook(a.args.name, a.args.entries);
    if (a.tool === 'open_page') return openPage(a.args.url);
    throw new Error('未知动作 ' + a.tool);
  }
  function broadcast(target, css) {
    try { window.parent.postMessage({ type: 'beautify:apply', target: target, css: css }, '*'); } catch (e) {}
  }
  function savePreset(category, name, code) {
    try {
      // 不指定版本：跟随美化库当前版本，避免把它升级导致 beautify.js 打不开
      var req = indexedDB.open('BeautifyAppDB');
      req.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains('presets')) d.createObjectStore('presets', { keyPath: 'id', autoIncrement: true });
      };
      req.onsuccess = function () {
        var db = req.result;
        try {
          if (!db.objectStoreNames.contains('presets')) { db.close(); return; }
          var tx = db.transaction('presets', 'readwrite');
          tx.objectStore('presets').put({ category: category, name: name || '娜娜预设', code: code, createdAt: Date.now() });
          tx.oncomplete = function () { db.close(); };
          tx.onerror = function () { db.close(); };
        } catch (e) { try { db.close(); } catch (err) {} }
      };
    } catch (e) {}
  }
  async function applyBeautify(scope, name, css) {
    css = String(css || '');
    if (scope === 'global') {
      localStorage.setItem('beautify_global_v2', css); localStorage.setItem('beautify_global', css);
      savePreset('global', name, css); broadcast('global', css);
    } else if (scope === 'chat') {
      localStorage.setItem('beautify_chat_v2', css); localStorage.setItem('beautify_chat', css);
      savePreset('chat', name, css); broadcast('chat', css);
    } else if (scope === 'chat-avatar') {
      localStorage.setItem('beautify_chat_avatar', css);
      savePreset('chat-avatar', name, css); broadcast('chat-avatar', css);
    } else if (scope === 'heart') {
      localStorage.setItem('nano_voice_applied_css', css);
      // 通知 chat_inner 里的心声立即生效
      try { window.parent.postMessage({ type: 'nanoVoiceCss', css: css }, '*'); } catch (e) {}
    } else if (scope === 'offline') {
      await setOfflineCss(css);
    } else {
      throw new Error('未知 scope：' + scope);
    }
  }
  function dbExists(name) {
    return new Promise(function (res) {
      if (!indexedDB.databases) { res(true); return; }
      indexedDB.databases().then(function (l) { res(!!l && l.some(function (d) { return d && d.name === name; })); }).catch(function () { res(true); });
    });
  }
  async function setOfflineCss(css) {
    if (!(await dbExists('MeetSettingsDB'))) throw new Error('线下设置库还不存在，先打开一次线下模式');
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open('MeetSettingsDB');
      req.onsuccess = function () {
        var db = req.result;
        try {
          if (!db.objectStoreNames.contains('settings')) { db.close(); reject(new Error('settings 表不存在')); return; }
          var tx = db.transaction('settings', 'readwrite');
          var store = tx.objectStore('settings');
          var g = store.get('main_settings');
          g.onsuccess = function () {
            var rec = g.result || { id: 'main_settings' };
            rec.id = 'main_settings'; rec.customCSS = css;
            store.put(rec);
          };
          tx.oncomplete = function () { db.close(); resolve(true); };
          tx.onerror = function () { db.close(); reject(new Error('写入失败')); };
        } catch (e) { try { db.close(); } catch (err) {} reject(e); }
      };
      req.onerror = function () { reject(new Error('打开库失败')); };
    });
  }
  function genId(p) { return p + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6); }
  function normalizeEntry(e) {
    e = e || {};
    return {
      id: genId('e'), enabled: true,
      title: e.title || '', keywords: e.keywords || e.keys || '',
      keywordEnabled: e.keywordEnabled !== false, vectorEnabled: !!e.vectorEnabled,
      permanent: !!e.permanent, position: e.position || 'before_char',
      scanDepth: e.scanDepth || 4, priority: e.priority || 100,
      probability: e.probability || 100, content: e.content || e.text || '',
      collapsed: false
    };
  }
  async function getWorldbookData() {
    var rec = await idbGet('nano_worldbook_db', 'worldbook_data', 'data');
    var v = (rec && rec.value && typeof rec.value === 'object') ? rec.value : rec;
    if (!v || !Array.isArray(v.files)) v = { groups: [{ id: 'g1', name: '默认分组' }], files: [] };
    if (!Array.isArray(v.groups)) v.groups = [{ id: 'g1', name: '默认分组' }];
    return v;
  }
  async function saveWorldbookData(data) {
    // 写 IDB 包装结构
    await new Promise(function (resolve) {
      var req = indexedDB.open('nano_worldbook_db', 1);
      req.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains('worldbook_data')) d.createObjectStore('worldbook_data', { keyPath: 'key' });
      };
      req.onsuccess = function () {
        var db = req.result;
        try {
          var tx = db.transaction('worldbook_data', 'readwrite');
          tx.objectStore('worldbook_data').put({ key: 'data', value: data });
          tx.oncomplete = function () { db.close(); resolve(true); };
          tx.onerror = function () { db.close(); resolve(false); };
        } catch (e) { try { db.close(); } catch (err) {} resolve(false); }
      };
      req.onerror = function () { resolve(false); };
    });
    try { localStorage.setItem('nano_worldbook_data_v5', JSON.stringify(data)); } catch (e) {}
  }
  async function addWorldbook(name, entries) {
    var data = await getWorldbookData();
    var list = (entries || []).map(normalizeEntry);
    var file = {
      id: 'f_' + Date.now(), name: name || '娜娜世界书', entries: list,
      group: null, scope: 'global', boundCharacters: [], size: Math.ceil(JSON.stringify(list).length / 1024) + 'KB', ext: 'json'
    };
    data.files.push(file);
    await saveWorldbookData(data);
    return file;
  }
  function openPage(url) {
    if (!url) throw new Error('缺少 url');
    try { window.parent.postMessage({ type: 'openFullscreen', url: url, title: '', source: 'more', showBack: false }, '*'); }
    catch (e) { window.location.href = url; }
  }

  /* ---------------- 输入/发送 ---------------- */
  function send(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    addMsg('me', renderText(text));
    history.push({ role: 'user', content: text });
    inputEl.value = ''; autoGrow();
    readDepth = 0;
    runModel();
  }
  function autoGrow() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
  }
  sendBtn.addEventListener('click', function () { send(inputEl.value); });
  inputEl.addEventListener('input', autoGrow);
  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(inputEl.value); }
  });
  if (suggestsEl) {
    suggestsEl.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-q]');
      if (b) { send(b.getAttribute('data-q')); suggestsEl.style.display = 'none'; }
    });
  }
  var clearBtn = document.getElementById('asClear');
  if (clearBtn) clearBtn.addEventListener('click', function () {
    history = []; msgsEl.innerHTML = ''; readDepth = 0;
    if (suggestsEl) suggestsEl.style.display = '';
    greet();
  });

  /* ---------------- 附件 ---------------- */
  function loadMammoth() {
    return new Promise(function (resolve) {
      if (window.mammoth) return resolve(true);
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js';
      s.onload = function () { resolve(!!window.mammoth); };
      s.onerror = function () { resolve(false); };
      document.head.appendChild(s);
    });
  }
  async function readFileAsText(file) {
    var lower = file.name.toLowerCase();
    if (lower.endsWith('.docx')) {
      var ok = await loadMammoth();
      if (!ok) throw new Error('docx 解析库加载失败');
      var buf = await file.arrayBuffer();
      var r = await window.mammoth.extractRawText({ arrayBuffer: buf });
      return r.value || '';
    }
    return await file.text();
  }
  if (attachBtn) attachBtn.addEventListener('click', function () { fileEl.value = ''; fileEl.click(); });
  if (fileEl) fileEl.addEventListener('change', async function (e) {
    var file = e.target.files[0];
    if (!file) return;
    try {
      var text = await readFileAsText(file);
      if (text.length > 20000) text = text.slice(0, 20000) + '\n…（已截断）';
      addMsg('me', renderText('[发送文件] ' + file.name + '\n\n' + text.slice(0, 800) + (text.length > 800 ? '\n…' : '')));
      history.push({ role: 'user', content: '我发了一个文件「' + file.name + '」，内容如下：\n' + text + '\n\n请根据这个文件帮我处理（例如整理成世界书条目，或告诉我该怎么用）。' });
      runModel();
    } catch (err) { toast(err.message || '读取失败'); }
  });

  /* ---------------- 初始化 ---------------- */
  function greet() {
    addMsg('assistant', '我是娜娜～我可以帮你<b>覆盖美化样式</b>（全局 / 聊天 / 心声 / 线下）、<b>新增世界书</b>、也能读源码告诉你<b>具体该怎么改</b>。<br>注意：我只做覆盖，不改源代码，你随时能在美化里「恢复默认」。<br><br>想改哪里？也可以直接发我 txt / json / docx 文件。');
  }
  async function init() {
    var api = await getApi();
    if (subEl) subEl.textContent = api ? ('美化 · 世界书 · ' + (api.model || '主 API')) : '未配置主 API';
    greet();
  }
  init();
})();
