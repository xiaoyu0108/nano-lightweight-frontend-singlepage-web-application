// ============================================================
// nano-app-bridge.js — 在「应用」iframe 内注入 window.Nano
// 与 app-host.html 通过 postMessage 通信，应用无需关心底层存储细节。
// ============================================================
(function () {
  'use strict';
  if (window.Nano) return;

  var seq = 0;
  var pending = {};

  function call(method, args) {
    return new Promise(function (resolve, reject) {
      var id = 'r' + (++seq) + '_' + Date.now();
      pending[id] = { resolve: resolve, reject: reject };
      try {
        parent.postMessage({ __nanoApp: true, id: id, method: method, args: args || [] }, '*');
      } catch (e) {
        delete pending[id];
        reject(e);
      }
    });
  }

  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || !d.__nanoAppResp || !d.id) return;
    var p = pending[d.id];
    if (!p) return;
    delete pending[d.id];
    if (d.ok) p.resolve(d.result);
    else p.reject(new Error(d.error || '调用失败'));
  });

  var appId = '';
  try { appId = window.__NANO_APP_ID__ || new URLSearchParams(location.search).get('nanoApp') || ''; } catch (e) { appId = window.__NANO_APP_ID__ || ''; }

  window.Nano = {
    version: 1,
    appId: appId,

    ready: function () { return call('ready'); },

    store: {
      get: function (key) { return call('store.get', [key]); },
      set: function (key, value) { return call('store.set', [key, value]); },
      remove: function (key) { return call('store.remove', [key]); }
    },

    characters: function () { return call('characters'); },
    currentUser: function () { return call('currentUser'); },
    persona: function (charId) { return call('persona', [charId]); },

    worldbook: function (charId) { return call('worldbook', [charId]); },
    memory: function (charId) { return call('memory', [charId]); },
    apiConfig: function () { return call('apiConfig'); },

    // 传入 { charIds, messages, system, useCharPersona, useUserPersona, useWorldbook, useMemory, maxTokens, temperature }
    // 返回模型回复文本
    chat: function (opts) { return call('chat', [opts || {}]); },

    openUrl: function (url, title) { return call('openUrl', [url, title]); },
    toast: function (text) { return call('toast', [text]); }
  };
})();
