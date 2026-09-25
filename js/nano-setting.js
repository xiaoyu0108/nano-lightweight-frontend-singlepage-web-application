// nano-setting.js — 纳米专属设置（独立于其他角色）
(function () {
  'use strict';
  var chatId = 'nano_ai';
  try { chatId = new URLSearchParams(location.search).get('chat') || 'nano_ai'; } catch (e) {}

  var DEFAULT_AVATAR = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9ecb"/><stop offset="1" stop-color="#ff4d94"/></linearGradient></defs>' +
    '<rect width="80" height="80" rx="20" fill="url(#g)"/>' +
    '<rect x="18" y="24" width="44" height="34" rx="12" fill="#fff" opacity="0.95"/>' +
    '<circle cx="32" cy="41" r="4.5" fill="#ff4d94"/><circle cx="48" cy="41" r="4.5" fill="#ff4d94"/>' +
    '<rect x="38" y="12" width="4" height="10" rx="2" fill="#fff"/><circle cx="40" cy="11" r="4" fill="#fff"/></svg>');

  function $(id) { return document.getElementById(id); }
  function toast(t) { var el = $('nsToast'); el.textContent = t; el.classList.add('show'); clearTimeout(el._t); el._t = setTimeout(function () { el.classList.remove('show'); }, 1500); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function estimateTokens(s) { s = String(s || ''); if (!s) return 0; var cjk = (s.match(/[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/g) || []).length; return Math.ceil(cjk + (s.length - cjk) / 4); }

  /* ---------- IndexedDB helpers ---------- */
  function openDB(name, version, store, keyPath) {
    return new Promise(function (res, rej) {
      try {
        var r = version ? indexedDB.open(name, version) : indexedDB.open(name);
        r.onupgradeneeded = function (e) { var d = e.target.result; if (store && !d.objectStoreNames.contains(store)) d.createObjectStore(store, keyPath ? { keyPath: keyPath } : undefined); };
        r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
      } catch (e) { rej(e); }
    });
  }
  function dbExists(name) {
    return new Promise(function (res) {
      if (!indexedDB.databases) { res(true); return; }
      indexedDB.databases().then(function (l) { res(!!l && l.some(function (d) { return d && d.name === name; })); }).catch(function () { res(true); });
    });
  }

  /* ---------- 角色记录（头像 / 昵称） ---------- */
  function getChar() {
    return openDB('nano_characters_db', 1, 'characters', 'id').then(function (db) {
      return new Promise(function (res) {
        try { var rq = db.transaction('characters', 'readonly').objectStore('characters').get(chatId); rq.onsuccess = function () { res(rq.result || null); db.close(); }; rq.onerror = function () { res(null); db.close(); }; }
        catch (e) { res(null); }
      });
    }).catch(function () { return null; });
  }
  function saveChar(patch) {
    return openDB('nano_characters_db', 1, 'characters', 'id').then(function (db) {
      return new Promise(function (res) {
        try {
          var tx = db.transaction('characters', 'readwrite'); var store = tx.objectStore('characters');
          var g = store.get(chatId);
          g.onsuccess = function () {
            var rec = g.result || { id: chatId, bindUser: '', isNpc: true, worldbookBindings: [] };
            for (var k in patch) rec[k] = patch[k];
            rec.id = chatId; rec.isNpc = true; rec.nanoAssistant = true;
            store.put(rec);
          };
          tx.oncomplete = function () { db.close(); res(true); }; tx.onerror = function () { db.close(); res(false); };
        } catch (e) { res(false); }
      });
    }).catch(function () { return false; });
  }
  function refreshChatList() { try { window.parent.postMessage({ type: 'homeDataUpdated' }, '*'); } catch (e) {} }

  /* ---------- 消息 ---------- */
  function getMessages() {
    return new Promise(function (res) {
      var key = 'chat_messages_' + chatId;
      if (typeof localforage !== 'undefined') {
        localforage.getItem(key).then(function (v) {
          if (Array.isArray(v)) return res(v);
          try { res(JSON.parse(localStorage.getItem(key) || '[]') || []); } catch (e) { res([]); }
        }).catch(function () { try { res(JSON.parse(localStorage.getItem(key) || '[]') || []); } catch (e) { res([]); } });
      } else { try { res(JSON.parse(localStorage.getItem(key) || '[]') || []); } catch (e) { res([]); } }
    });
  }
  function getMemoryCount() {
    return dbExists('nano_vector_memory_db').then(function (ex) {
      if (!ex) return 0;
      return openDB('nano_vector_memory_db').then(function (db) {
        return new Promise(function (res) {
          try {
            if (!db.objectStoreNames.contains('config')) { db.close(); res(0); return; }
            var rq = db.transaction('config', 'readonly').objectStore('config').get('memlist_' + chatId);
            rq.onsuccess = function () { var v = rq.result; db.close(); var arr = v && (v.value || v); res(Array.isArray(arr) ? arr.length : 0); };
            rq.onerror = function () { db.close(); res(0); };
          } catch (e) { res(0); }
        });
      }).catch(function () { return 0; });
    });
  }

  function renderStats(msgs, memCount) {
    var joined = msgs.map(function (m) { return String((m && m.text) || ''); }).join('');
    $('stMsgs').textContent = msgs.length;
    $('stFloor').textContent = msgs.length;
    $('stTokens').textContent = estimateTokens(joined);
    $('stMemory').textContent = memCount;
  }
  function renderRecords(msgs) {
    var box = $('nsRecords');
    if (!msgs.length) { box.innerHTML = '<div class="ns-empty">还没有聊天记录</div>'; return; }
    var last = msgs.slice(-30);
    box.innerHTML = last.map(function (m) {
      var me = m && m.type === 'right';
      var role = me ? '我' : '纳米';
      var text = String((m && (m.text || '')) || '').slice(0, 300) || '（非文本消息）';
      return '<div class="ns-rec ' + (me ? 'me' : '') + '"><span class="ns-rec-role">' + role + '</span>' + esc(text) + '</div>';
    }).join('');
    box.scrollTop = box.scrollHeight;
  }

  async function loadAll() {
    var char = await getChar();
    if (char) {
      $('nsName').value = char.name || '纳米';
      $('nsAvatar').src = char.avatar || DEFAULT_AVATAR;
    } else {
      $('nsName').value = '纳米';
      $('nsAvatar').src = DEFAULT_AVATAR;
    }
    var msgs = await getMessages();
    var memCount = await getMemoryCount();
    renderStats(msgs, memCount);
    renderRecords(msgs);
  }

  /* ---------- 返回 ---------- */
  function goBack() {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'closeFullscreen' }, '*');
      } else if (history.length > 1) {
        history.back();
      } else {
        location.href = 'chat.html';
      }
    } catch (e) {}
  }
  var nsBackBtn = $('nsBack');
  if (nsBackBtn) nsBackBtn.addEventListener('click', goBack);
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'pageLoaded', page: 'nano_setting' }, '*');
      window.parent.postMessage({ type: 'setTitle', title: '纳米设置' }, '*');
    }
  } catch (e) {}

  /* ---------- 交互 ---------- */
  function compress(file) {
    return new Promise(function (res) {
      var fr = new FileReader();
      fr.onload = function () {
        var img = new Image();
        img.onload = function () {
          try {
            var max = 480, w = img.width, h = img.height;
            if (w > h && w > max) { h = Math.round(h * max / w); w = max; } else if (h >= w && h > max) { w = Math.round(w * max / h); h = max; }
            var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
            cv.getContext('2d').drawImage(img, 0, 0, w, h);
            res(cv.toDataURL('image/jpeg', 0.85));
          } catch (e) { res(fr.result); }
        };
        img.onerror = function () { res(fr.result); }; img.src = fr.result;
      };
      fr.onerror = function () { res(''); }; fr.readAsDataURL(file);
    });
  }
  $('nsAvatarBtn').addEventListener('click', function () { $('nsAvatarFile').value = ''; $('nsAvatarFile').click(); });
  $('nsAvatarFile').addEventListener('change', async function (e) {
    var f = e.target.files[0]; if (!f) return;
    var dataUrl = await compress(f);
    if (!dataUrl) return;
    $('nsAvatar').src = dataUrl;
    await saveChar({ avatar: dataUrl });
    refreshChatList(); toast('头像已更新');
  });
  $('nsAvatarUrlSave').addEventListener('click', async function () {
    var url = $('nsAvatarUrl').value.trim(); if (!url) return;
    $('nsAvatar').src = url;
    await saveChar({ avatar: url });
    refreshChatList(); toast('头像已更新');
  });
  var nameTimer = null;
  $('nsName').addEventListener('input', function () {
    clearTimeout(nameTimer);
    var v = this.value.trim() || '纳米';
    nameTimer = setTimeout(async function () { await saveChar({ name: v }); refreshChatList(); }, 500);
  });

  $('nsDeleteAll').addEventListener('click', async function () {
    if (!confirm('确定删除与纳米的全部聊天记录？此操作不可撤销。')) return;
    var key = 'chat_messages_' + chatId;
    try { if (typeof localforage !== 'undefined') await localforage.removeItem(key); } catch (e) {}
    try { localStorage.removeItem(key); } catch (e) {}
    // 清理纳米记忆
    try {
      if (await dbExists('nano_vector_memory_db')) {
        var db = await openDB('nano_vector_memory_db');
        await new Promise(function (res) {
          try {
            if (!db.objectStoreNames.contains('config')) { db.close(); res(); return; }
            var tx = db.transaction('config', 'readwrite'); var st = tx.objectStore('config');
            st.delete('memlist_' + chatId); st.delete('auxchat_' + chatId);
            tx.oncomplete = function () { db.close(); res(); }; tx.onerror = function () { db.close(); res(); };
          } catch (e) { res(); }
        });
      }
    } catch (e) {}
    try { window.parent.postMessage({ type: 'messagesCleared', chatId: chatId }, '*'); } catch (e) {}
    refreshChatList();
    toast('已删除全部记录');
    loadAll();
  });

  $('nsPrompt').value = (function () { try { return localStorage.getItem('nano_builtin_prompt') || ''; } catch (e) { return ''; } })();
  $('nsPromptSave').addEventListener('click', function () {
    try { localStorage.setItem('nano_builtin_prompt', $('nsPrompt').value); } catch (e) {}
    toast('提示词已保存');
  });

  loadAll();
})();
