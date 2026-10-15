// ============================================================
// nano-export.js — 统一的「导出文件」半屏悬浮窗
// ------------------------------------------------------------
// 用法： window.NanoExport.file({ name: 'xx.json', blob: Blob, text: '...' })
//   iOS 独立窗口里 <a download> 会跳进系统「存储到文件」全屏页且退不回；
//   这里统一改成半屏悬浮窗：可复制内容、非 iOS 可下载，不再依赖系统全屏页。
// ============================================================
(function () {
  'use strict';
  if (window.NanoExport) return;

  function isIOS() {
    try {
      return /iP(hone|ad|od)/.test(navigator.platform || '') ||
        ((navigator.userAgent || '').indexOf('Mac') >= 0 && 'ontouchend' in document);
    } catch (e) { return false; }
  }

  var CSS = ''
    + '.nano-export-mask{position:fixed;inset:0;z-index:2147483400;background:rgba(0,0,0,.32);opacity:0;pointer-events:none;transition:opacity .22s;display:flex;align-items:flex-end;justify-content:center;}'
    + '.nano-export-mask.on{opacity:1;pointer-events:auto;}'
    + '.nano-export-card{width:100%;max-width:430px;background:#fff;border-radius:20px 20px 0 0;padding:16px 18px calc(18px + env(safe-area-inset-bottom,0px));transform:translateY(100%);transition:transform .26s cubic-bezier(.2,.9,.3,1);box-shadow:0 -12px 40px rgba(0,0,0,.16);}'
    + '.nano-export-mask.on .nano-export-card{transform:translateY(0);}'
    + '.nano-export-title{font-size:16px;font-weight:700;color:#1c1c1e;text-align:center;}'
    + '.nano-export-name{font-size:12px;color:#8e8e93;text-align:center;margin-top:4px;word-break:break-all;}'
    + '.nano-export-tip{font-size:12px;color:#8e8e93;line-height:1.6;margin:12px 2px 0;}'
    + '.nano-export-actions{display:flex;flex-direction:column;gap:10px;margin-top:16px;}'
    + '.nano-export-btn{height:48px;border:none;border-radius:14px;font-size:15px;font-weight:600;font-family:inherit;cursor:pointer;background:#f2f2f7;color:#1c1c1e;}'
    + '.nano-export-btn.primary{background:#007aff;color:#fff;}'
    + '.nano-export-btn:active{opacity:.85;}'
    + '.nano-export-btn.ghost{background:transparent;color:#8e8e93;}';

  var box = null, nameEl = null, tipEl = null, actEl = null;

  function build() {
    if (box) return;
    if (!document.getElementById('nanoExportStyle')) {
      var st = document.createElement('style');
      st.id = 'nanoExportStyle';
      st.textContent = CSS;
      (document.head || document.documentElement).appendChild(st);
    }
    box = document.createElement('div');
    box.className = 'nano-export-mask';
    box.innerHTML =
      '<div class="nano-export-card" role="dialog" aria-modal="true">' +
      '<div class="nano-export-title">导出文件</div>' +
      '<div class="nano-export-name"></div>' +
      '<div class="nano-export-tip"></div>' +
      '<div class="nano-export-actions"></div>' +
      '</div>';
    (document.body || document.documentElement).appendChild(box);
    nameEl = box.querySelector('.nano-export-name');
    tipEl = box.querySelector('.nano-export-tip');
    actEl = box.querySelector('.nano-export-actions');
    box.addEventListener('click', function (e) { if (e.target === box) close(); });
  }

  function close() { if (box) box.classList.remove('on'); }

  function download(blob, filename) {
    try {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = filename; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} }, 3000);
      return true;
    } catch (e) { return false; }
  }

  function copyText(text, btn) {
    var done = function () {
      var old = btn.textContent;
      btn.textContent = '已复制 ✓';
      setTimeout(function () { btn.textContent = old; }, 1500);
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, done);
        return;
      }
    } catch (e) {}
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    } catch (e) {}
    done();
  }

  // opts: { name, blob, text }
  function file(opts) {
    opts = opts || {};
    var blob = opts.blob || new Blob([opts.text || ''], { type: 'application/json' });
    var filename = opts.name || 'nano-export.json';
    var ios = isIOS();
    build();
    nameEl.textContent = filename;
    tipEl.textContent = ios
      ? '已生成导出内容。点「复制内容」后粘贴到备忘录 / 文件里保存（不再跳进 iOS 全屏的「存储到文件」页）。'
      : '点「下载文件」保存到本地，或「复制内容」粘贴使用。';
    actEl.innerHTML = '';

    var copyBtn = document.createElement('button');
    copyBtn.className = 'nano-export-btn primary';
    copyBtn.textContent = '复制内容';
    copyBtn.addEventListener('click', function () {
      if (opts.text != null) { copyText(String(opts.text), copyBtn); return; }
      try { blob.text().then(function (t) { copyText(t, copyBtn); }, function () { copyText('', copyBtn); }); }
      catch (e) { copyText('', copyBtn); }
    });
    actEl.appendChild(copyBtn);

    if (!ios) {
      var dlBtn = document.createElement('button');
      dlBtn.className = 'nano-export-btn';
      dlBtn.textContent = '下载文件';
      dlBtn.addEventListener('click', function () { if (download(blob, filename)) close(); });
      actEl.appendChild(dlBtn);
    }

    var cancel = document.createElement('button');
    cancel.className = 'nano-export-btn ghost';
    cancel.textContent = '取消';
    cancel.addEventListener('click', close);
    actEl.appendChild(cancel);

    requestAnimationFrame(function () { box.classList.add('on'); });
  }

  window.NanoExport = { file: file, close: close, isIOS: isIOS };
})();
