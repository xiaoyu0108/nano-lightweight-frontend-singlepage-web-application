// nano-assistant-tools.js — 「纳米」共享工具（chat_inner 内使用）
// 只做覆盖（美化/世界书等存储），不改源码。chat-core 在纳米会话里调用它。
(function () {
  'use strict';
  var KB = window.NANO_ASSISTANT_KB || { about: [], scopes: [], pages: [], storage: {}, commands: [], worldbookEntryFields: [] };
  var NANO_ID = 'nano_ai';

  function isNano(chatId) { return String(chatId || '') === NANO_ID; }

  function systemPrompt() {
    var lines = [];
    lines.push('你是「纳米」，Nano 应用内置的美化/装修助手。你熟悉 Nano 的全部前端结构，人设是女生，语气亲切自然、简洁直接，用中文回答。');
    lines.push('');
    lines.push('【最重要的规则】');
    lines.push('1. Nano 是纯前端 PWA。你只能"覆盖"样式和写入存储，不能修改部署后的源码文件。');
    lines.push('2. 用户在每个美化页点"恢复默认"即可撤销你的覆盖，因为覆盖只存在浏览器存储里。');
    lines.push('3. 你可以读取源码来回答"我应该怎么改/改哪个文件"，并给出清晰步骤。');
    lines.push('4. 你不能新增页面或改后端逻辑；这类需求要告诉用户需要开发者改源码并重新部署。');
    lines.push('5. 回复尽量简短：先给结论，再给必要步骤。除非用户要求，不要长篇大论。');
    lines.push('6. 做美化/世界书这类修改时【不要读源码】：知识库里已有足够的选择器，直接用即可，并输出 <action> 块。只有用户明确问"这个功能在哪个文件、源码怎么改"时，才 use read_file。');
    lines.push('7. 需要修改时必须真的输出 <action> 块：只有输出了 <action>，界面才会出现「复制 / 立即执行」按钮。绝不要只说"点击下方按钮 / 已为你改好"却不给 action。如果暂时不确定选择器，就先问清楚，不要假装已经改好。');
    lines.push('8. 用户发来"表情包 / 图片清单"（一般是「名字：图片链接」的形式）并要求加入表情包时，必须用 add_emoji，绝对不要用 add_worldbook。只有用户明确说要"世界书/设定"时才用 add_worldbook。');
    lines.push('9. 每次 apply_beautify 都会自动存成一个「可切换的预设」（在对应美化页里能选），所以 name 要起一个简短好认的名字，方便用户之后切换。');
    lines.push('');
    lines.push('【执行动作的方式】');
    lines.push('需要真正修改时，在回复里输出代码块（用户会看到确认按钮，确认后才生效）：');
    lines.push('<action>{"tool":"apply_beautify","args":{"scope":"heart","name":"粉红心声","css":"..."}}</action>');
    lines.push('可用动作：');
    (KB.commands || []).forEach(function (c) { lines.push('- ' + c.tool + ' 参数 ' + JSON.stringify(c.args) + '：' + (c.note || '')); });
    lines.push('');
    lines.push('【可覆盖的范围 scope】');
    (KB.scopes || []).forEach(function (s) {
      lines.push('· ' + s.id + '（' + s.name + '）：' + s.desc);
      lines.push('  存储：' + s.storage);
      if (s.selectors) lines.push('  常用选择器：' + s.selectors.join('  '));
    });
    lines.push('');
    lines.push('【源码文件（需要时可 read_file 读取，注意每轮最多读一次）】');
    (KB.pages || []).forEach(function (p) { lines.push('· ' + p.file + '（' + p.name + (p.note ? '：' + p.note : '') + '）'); });
    lines.push('');
    lines.push('【存储位置】');
    Object.keys(KB.storage || {}).forEach(function (k) { lines.push('· ' + k + ' = ' + KB.storage[k]); });
    lines.push('');
    lines.push('【世界书条目字段】' + (KB.worldbookEntryFields || []).join(', '));
    lines.push('');
    lines.push('写 CSS 时直接给完整可用的 CSS（用上面的选择器即可，不要为了美化去读源码）。css 字段里可以带换行，直接写多行 CSS 即可。');
    lines.push('每次要修改样式，都必须：①用一两句话说明你要改什么；②输出一个 <action> 块，css 字段放完整可复制的代码。');
    lines.push('用户说“换背景”时：优先用 set_chat_background（有图片用 args.image，只有颜色用 args.color）；需要更复杂的背景样式时才用 scope=chat 的 CSS（改 .chat-container / .message-scroll / body）。');
    try {
      var extra = (localStorage.getItem('nano_builtin_prompt') || '').trim();
      if (extra) lines.push('\n【用户自定义内置要求（必须遵守）】\n' + extra);
    } catch (e) {}
    return lines.join('\n');
  }

  // 模型经常把 CSS 里的换行直接写进 JSON 字符串（非法 JSON），这里做容错修复
  function repairJson(s) {
    s = String(s || '');
    var out = '', inStr = false, esc = false;
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (esc) { out += ch; esc = false; continue; }
      if (ch === '\\') { out += ch; esc = true; continue; }
      if (ch === '"') { inStr = !inStr; out += ch; continue; }
      if (inStr) {
        if (ch === '\n') { out += '\\n'; continue; }
        if (ch === '\r') { continue; }
        if (ch === '\t') { out += '\\t'; continue; }
      }
      out += ch;
    }
    return out.replace(/,\s*([}\]])/g, '$1');
  }
  function firstJsonObject(s) {
    s = String(s || '');
    var start = s.indexOf('{');
    if (start < 0) return null;
    var depth = 0, inStr = false, esc = false;
    for (var i = start; i < s.length; i++) {
      var ch = s[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) return s.slice(start, i + 1); }
    }
    return s.slice(start);
  }
  function normalizeAction(o) {
    if (!o || typeof o !== 'object') return null;
    var tool = o.tool || o.action || o.name;
    if (!tool) return null;
    var args = o.args;
    if (!args || typeof args !== 'object') {
      args = {};
      var skip = { tool: 1, action: 1, name: 1, args: 1 };
      Object.keys(o).forEach(function (k) { if (!skip[k]) args[k] = o[k]; });
    }
    return { tool: String(tool), args: args };
  }
  function parseActionJson(json) {
    var raw = String(json || '').trim()
      .replace(/^```(?:json|xml|javascript)?/i, '').replace(/```$/, '').trim();
    var candidates = [raw, repairJson(raw)];
    var obj = firstJsonObject(raw);
    if (obj) { candidates.push(obj); candidates.push(repairJson(obj)); }
    for (var i = 0; i < candidates.length; i++) {
      try {
        var o = JSON.parse(candidates[i]);
        var n = normalizeAction(o);
        if (n) return n;
      } catch (e) {}
    }
    return null;
  }
  function parseActions(text) {
    var actions = [];
    function push(json) { var o = parseActionJson(json); if (o) actions.push(o); }
    var clean = String(text || '').replace(/<action>([\s\S]*?)<\/action>/g, function (_, json) { push(json); return ''; });
    // 兼容模型用 ```json {...} ``` / ``` {...} ``` 包裹动作的情况
    clean = clean.replace(/```[a-zA-Z]*\s*([\s\S]*?)```/g, function (_, block) {
      if (!/"tool"|'tool'|"action"|'action'/.test(block)) return _;
      var obj = firstJsonObject(block);
      if (obj) { push(obj); return ''; }
      return _;
    });
    return { clean: clean.trim(), actions: actions };
  }

  async function fetchSource(path) {
    try {
      var r = await fetch(path, { cache: 'no-cache' });
      if (!r.ok) return '';
      var t = await r.text();
      if (t.length > 14000) t = t.slice(0, 14000) + '\n…（已截断）';
      return t;
    } catch (e) { return ''; }
  }

  /* ---------- 存储工具 ---------- */
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
  function broadcast(target, css) {
    try { window.parent.postMessage({ type: 'beautify:apply', target: target, css: css }, '*'); } catch (e) {}
  }
  function savePreset(category, name, code) {
    try {
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
          tx.objectStore('presets').put({ category: category, name: name || '纳米预设', code: code, createdAt: Date.now() });
          tx.oncomplete = function () { db.close(); };
          tx.onerror = function () { db.close(); };
        } catch (e) { try { db.close(); } catch (err) {} }
      };
    } catch (e) {}
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
          g.onsuccess = function () { var rec = g.result || { id: 'main_settings' }; rec.id = 'main_settings'; rec.customCSS = css; store.put(rec); };
          tx.oncomplete = function () { db.close(); resolve(true); };
          tx.onerror = function () { db.close(); reject(new Error('写入失败')); };
        } catch (e) { try { db.close(); } catch (err) {} reject(e); }
      };
      req.onerror = function () { reject(new Error('打开库失败')); };
    });
  }
  /* ---------- 表情包：写入 nano_api_db / emoji_data / nano_emoji_data ---------- */
  function openEmojiDB() {
    return new Promise(function (res, rej) {
      try {
        var req = indexedDB.open('nano_api_db', 2);
        req.onupgradeneeded = function (e) {
          var d = e.target.result;
          if (!d.objectStoreNames.contains('api_data')) d.createObjectStore('api_data', { keyPath: 'key' });
          if (!d.objectStoreNames.contains('emoji_data')) d.createObjectStore('emoji_data', { keyPath: 'key' });
          if (!d.objectStoreNames.contains('favorite_data')) d.createObjectStore('favorite_data', { keyPath: 'key' });
        };
        req.onsuccess = function () { res(req.result); };
        req.onerror = function () { rej(req.error); };
      } catch (e) { rej(e); }
    });
  }
  function getEmojiDataRaw() {
    return openEmojiDB().then(function (db) {
      return new Promise(function (res) {
        try {
          if (!db.objectStoreNames.contains('emoji_data')) { db.close(); res(null); return; }
          var rq = db.transaction('emoji_data', 'readonly').objectStore('emoji_data').get('nano_emoji_data');
          rq.onsuccess = function () { db.close(); res(rq.result ? rq.result.value : null); };
          rq.onerror = function () { db.close(); res(null); };
        } catch (e) { res(null); }
      });
    }).catch(function () { return null; });
  }
  function saveEmojiDataRaw(data) {
    try { localStorage.setItem('nano_emoji_data', JSON.stringify(data)); } catch (e) {}
    return openEmojiDB().then(function (db) {
      return new Promise(function (res) {
        try {
          var tx = db.transaction('emoji_data', 'readwrite');
          tx.objectStore('emoji_data').put({ key: 'nano_emoji_data', value: data });
          tx.oncomplete = function () { db.close(); res(true); };
          tx.onerror = function () { db.close(); res(false); };
        } catch (e) { res(false); }
      });
    }).catch(function () { return false; });
  }
  async function addEmoji(groupName, emojis) {
    var data = await getEmojiDataRaw();
    if (!data || !Array.isArray(data.emojiGroups)) data = { emojiGroups: [], balance: 0, favorites: [] };
    var list = (emojis || []).map(function (e) {
      return { name: String((e && e.name) || '').trim(), url: String((e && (e.url || e.src || e.image)) || '').trim() };
    }).filter(function (e) { return e.url; });
    if (!list.length) throw new Error('没有可添加的表情（缺少图片地址）');
    var name = String(groupName || '').trim() || '纳米表情';
    var group = data.emojiGroups.find(function (g) { return g && g.name === name; });
    if (!group) {
      group = { id: 'g' + Date.now() + '_' + Math.random().toString(36).slice(2, 5), name: name, emojis: [] };
      data.emojiGroups.push(group);
    }
    if (!Array.isArray(group.emojis)) group.emojis = [];
    var seen = {};
    group.emojis.forEach(function (e) { if (e && e.url) seen[e.url] = 1; });
    list.forEach(function (e) {
      if (seen[e.url]) return;
      seen[e.url] = 1;
      group.emojis.push({ id: genId('e'), name: e.name || '', url: e.url });
    });
    await saveEmojiDataRaw(data);
    try { window.dispatchEvent(new CustomEvent('nanoEmojiUpdated')); } catch (e) {}
    try { window.parent.postMessage({ type: 'nanoEmojiUpdated' }, '*'); } catch (e) {}
    return group;
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
      id: 'f_' + Date.now(), name: name || '纳米世界书', entries: list,
      group: null, scope: 'global', boundCharacters: [], size: Math.ceil(JSON.stringify(list).length / 1024) + 'KB', ext: 'json'
    };
    data.files.push(file);
    await saveWorldbookData(data);
    return file;
  }
  async function applyBeautify(scope, name, css) {
    css = String(css || '');
    name = String(name || '').trim() || '纳米预设';
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
      savePreset('heart', name, css);
      try { window.parent.postMessage({ type: 'nanoVoiceCss', css: css }, '*'); } catch (e) {}
    } else if (scope === 'offline') {
      await setOfflineCss(css);
      savePreset('offline', name, css);
    } else {
      throw new Error('未知 scope：' + scope);
    }
  }
  function openPage(url) {
    if (!url) throw new Error('缺少 url');
    try { window.parent.postMessage({ type: 'openFullscreen', url: url, title: '', source: 'more', showBack: false }, '*'); }
    catch (e) { window.location.href = url; }
  }
  // 直接更换当前聊天背景（等同聊天设置里的「换背景」）
  async function setChatBackground(color, imageUrl) {
    var chatId = NANO_ID;
    try { chatId = new URLSearchParams(location.search).get('chat') || NANO_ID; } catch (e) {}
    var key = function (s) { return 'chat_setting_' + s + '_' + chatId; };
    color = String(color || '').trim();
    imageUrl = String(imageUrl || '').trim();
    if (imageUrl) {
      try { localStorage.setItem(key('bgType'), JSON.stringify('image')); } catch (e) {}
      try { if (typeof localforage !== 'undefined') await localforage.setItem(key('bgImage'), imageUrl); } catch (e) {}
    } else {
      try { localStorage.setItem(key('bgType'), JSON.stringify('color')); } catch (e) {}
      try { localStorage.setItem(key('bgColor'), JSON.stringify(color || '#ffffff')); } catch (e) {}
      try { if (typeof localforage !== 'undefined') await localforage.removeItem(key('bgImage')); } catch (e) {}
    }
    try {
      window.parent.postMessage({
        type: 'backgroundChanged', chatId: chatId,
        bgType: imageUrl ? 'image' : 'color',
        bgColor: color || '#ffffff',
        bgImage: imageUrl || ''
      }, '*');
    } catch (e) {}
    return true;
  }
  async function execAction(a) {
    if (!a || !a.tool) throw new Error('空动作');
    var args = a.args || {};
    if (a.tool === 'apply_beautify') return applyBeautify(args.scope, args.name, args.css);
    if (a.tool === 'add_worldbook') return addWorldbook(args.name, args.entries);
    if (a.tool === 'add_emoji') return addEmoji(args.group || args.name, args.emojis || args.items);
    if (a.tool === 'set_chat_background') return setChatBackground(args.color, args.image);
    if (a.tool === 'open_page') return openPage(args.url);
    if (a.tool === 'read_file') return null;
    throw new Error('未知动作 ' + a.tool);
  }
  function actionTitle(a) {
    if (a.tool === 'apply_beautify') return '覆盖「' + (a.args.scope || '') + '」美化：' + (a.args.name || '未命名');
    if (a.tool === 'add_worldbook') return '新增世界书：' + (a.args.name || '');
    if (a.tool === 'add_emoji') return '新增表情包分组：' + (a.args.group || a.args.name || '纳米表情') + '（' + (((a.args.emojis || a.args.items || []).length)) + ' 个）';
    if (a.tool === 'set_chat_background') return '更换聊天背景：' + (a.args.image ? '图片' : (a.args.color || '默认'));
    if (a.tool === 'open_page') return '打开页面：' + (a.args.url || '');
    return a.tool;
  }

  window.NanoAssistant = {
    id: NANO_ID,
    isNano: isNano,
    systemPrompt: systemPrompt,
    parseActions: parseActions,
    fetchSource: fetchSource,
    execAction: execAction,
    actionTitle: actionTitle
  };
})();
