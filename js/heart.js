/* ============================================
   Nano 心声 · 完整逻辑
   ============================================ */

(function() {
  'use strict';

  const $ = id => document.getElementById(id);

  // ============================================
// 提示词定义（放在 heart.js 开头）
// ============================================

// ===== 1. 此刻 · 印象 提示词 =====
function buildImpressionPrompt(charName) {
  return `你是一个人类，此时你是${charName}。

请用一段简洁的文字（20-30字）描写${charName}此刻的样子：
- 位置（比如坐在窗边、靠在沙发上、站在阳台上）
- 穿着（比如白衬衫、灰色卫衣、黑色高领）
- 动作（比如指尖轻叩桌面、托腮、望向窗外）

要求：用第三人称，描写的句子要像电影画面一样有质感，直接写画面。
【严禁】以"男/女/他/她/男人/女人/男的/女的/这男人/这女人"等性别或人称词开头或作前缀（例如绝不能写"男靠在窗边""女穿着衬衫"）。
不要使用关联词（如"因为…所以…"、"虽然…但是…"、"既…又…"等）。
严禁出现"小姑娘/小东西/小家伙/小丫头/小可爱/女孩/姑娘/丫头/女人/这女人/这丫头"等油腻称呼与霸总腔。
严禁霸总网文式的生理特写：低吼、揉碎、掐腰、红着眼、哑声、眸色一沉、危险地眯眼、喉结滚动等；也不要身体部位特写或性暗示。

示例："坐在窗边，白衬衫微敞，指尖轻叩桌面"
示例二："窝在沙发角落，灰色卫衣的帽子压得很低，盯着手机发呆"

现在请写出${charName}此刻的印象：`;
}

// ===== 2. 心声 提示词 =====
function buildThoughtPrompt(charName, userName, messageText) {
  let prompt = `你是一个人类，此时你是${charName}，你在和${userName}对话。

在发送本轮消息的时候，你是怎么想的？心理活动是怎么样的？

要求：
1. 不得霸总油腻，不得使用关联词（如"因为…所以…"、"虽然…但是…"）
2. 不得出现任何关于"AI助手"、"语言模型"、"人工智能"等相关内容
3. 此篇心理描写不得低于90字
4. 用第一人称"我"来写，像在写私人日记
5. 语言风格：细腻、真实、有呼吸感，像普通人内心流淌出来的念头
6. 可以有不完整的句子、跳跃的思绪、反问、自我怀疑，越真实越好
7. 严禁出现"小姑娘/小东西/小家伙/小丫头/小可爱/女孩/姑娘/丫头/女人"等油腻称呼与霸总腔
8. 严禁催促、命令、安排对方的生活（如催吹头发、起床、睡觉、吃饭、喝水、吃药、早点休息）
9. 严禁替对方说话或预设对方的回答、反应；严禁凭空给对方添加胃病等任何病症，除非设定里明确写了
10. 严禁霸道油腻/霸总网文腔：小姑娘、小东西、小丫头、丫头、女人、这女人、低吼、揉碎、掐腰、红着眼、哑声、眸色一沉、你是我的、逃不掉、宠你、乖、听话、让我好好疼你、我接住你、我等你慢慢说、别怕有我在 等一律禁止；不写占有欲、命令口吻、露骨或性暗示。写完自查一遍，出现即重写。

现在请写出${charName}的心理活动：`;

    if (messageText) {
      prompt += `\n\n（你刚刚发送的消息是："${messageText}"）`;
    }

    return prompt;
}

// 心声手记：默认只显示 4 行，超长折叠，点击展开全部
function setupThoughtExpand(el) {
  if (!el || typeof el.setAttribute !== 'function') return;
  const full = (el.textContent || '').trim();
  const lines = full.split(/\n/).length;
  // 「完整显示心声（不折叠）」：快捷 DIY 里勾选后不折叠，换行/加行全部展示
  let fullThought = false;
  try { fullThought = !!(JSON.parse(localStorage.getItem('nano_voice_quick') || '{}') || {}).fullThought; } catch (e) {}
  if (fullThought) {
    el.classList.remove('collapsed', 'expanded');
    el.dataset.full = full;
    return;
  }
  const needCollapse = full.length > 90 || lines > 4;
  if (!needCollapse) {
    el.classList.remove('collapsed');
    return;
  }
  el.dataset.full = full;
  el.classList.add('collapsed');
  if (window.__thoughtExpandHooked) return;
  window.__thoughtExpandHooked = true;
  el.addEventListener('click', function() {
    if (this.classList.contains('collapsed')) {
      this.textContent = this.dataset.full || this.textContent;
      this.classList.remove('collapsed');
      this.classList.add('expanded');
      this.append(' （点击收起）');
    } else {
      this.textContent = this.dataset.full || this.textContent;
      this.classList.add('collapsed');
      this.classList.remove('expanded');
      const lines2 = (this.textContent || '').split(/\n/).length;
      if ((this.textContent || '').length > 90 || lines2 > 4) {
        this.append(' （点击展开）');
      }
    }
  });
}

  // ===== 默认模板（高度可 DIY）=====
  const DEFAULT_CSS = `/* iOS邮件 · 默认模板（高度 DIY）
   ------------------------------------------------------------
   常用「自由 DIY」速查（直接改下面任意值即可，也可整段替换）：
   · 头像大小 / 圆角：改 .nano-voice-modal 上的 --iv-avatar-size / --iv-avatar-radius
   · 头像居中变大：.iv-sender{flex-direction:column;align-items:center;text-align:center}
                    .iv-sender-info{margin-left:0;margin-top:10px;text-align:center}
   · 昵称换行：.iv-sender{flex-wrap:wrap} .iv-sender-info{flex:1 1 100%;margin-left:0;margin-top:8px}
   · 加一行文字：往 .iv-deco-top / .iv-deco-bottom / .iv-extra-text 里用 content 追加，
                 换行用 "\\A" 并配 white-space:pre-wrap；
                 用伪元素时记得先 .iv-deco-top{display:block;padding:8px 22px 0}
   · 加装饰贴图：#ivDecoTop / #ivDecoBottom 在「快捷 DIY」里可直接填 <img src="...">
                 或用 .nano-voice-modal::before{content:url("https://.../sticker.png")}
   · 加角标/水印：.iv-content::after{content:"Nano";position:absolute;right:16px;bottom:12px;opacity:.35}
   ------------------------------------------------------------ */
.nano-voice-modal {
  --iv-avatar-size: 48px;
  --iv-avatar-radius: 50%;
  background: rgba(255, 255, 255, 0.78);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 28px 64px rgba(0, 0, 0, 0.12), 0 8px 20px rgba(0, 0, 0, 0.04);
  color: #1c1c1e;
}
.iv-header {
  background: rgba(255, 255, 255, 0.30);
  border-bottom: 1px solid rgba(60, 60, 67, 0.10);
  border-radius: 20px 20px 0 0;
}
.iv-avatar {
  width: var(--iv-avatar-size, 48px);
  height: var(--iv-avatar-size, 48px);
  flex: 0 0 var(--iv-avatar-size, 48px);
  background: rgba(240, 240, 245, 0.6);
  border-radius: var(--iv-avatar-radius, 50%);
  border: 1px solid rgba(255, 255, 255, 0.7);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
}
/* DIY 装饰层 / 附加文字（默认空不占位；填了内容或加 .on 才显示）。
   注意：若用 CSS 的 ::after/::before 追加装饰，请把 .iv-deco-top / .iv-deco-bottom 设为 display:block。 */
.iv-deco { position: relative; z-index: 6; pointer-events: none; display: none; }
.iv-deco.on { display: block; }
.iv-deco-top.on { padding: 8px 22px 0; }
.iv-deco-bottom.on { padding: 0 22px 10px; }
.iv-deco img { max-width: 100%; height: auto; display: block; margin: 0 auto; }
.iv-extra-text {
  margin-top: 12px; padding-top: 8px;
  border-top: 1px dashed rgba(60, 60, 67, 0.12);
  color: #8e8e93; font-size: 13px; line-height: 1.6;
  white-space: pre-wrap; word-break: break-word;
}
.iv-extra-text:empty { display: none; }
.iv-caption {
  color: #8e8e93;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.2px;
}
.iv-name {
  color: #1c1c1e;
  font-family: "Iowan Old Style", "Baskerville", "Times New Roman", "Songti SC", serif;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 0.2px;
}
.iv-meta-key { color: #8e8e93; font-size: 12px; font-weight: 400; letter-spacing: 0.2px; }
.iv-meta-value { color: #1c1c1e; font-size: 12px; font-weight: 450; }
.iv-meta-value.user-name { color: #007aff; font-weight: 500; }
.iv-subject {
  padding: 14px 22px 12px;
  background: rgba(255, 255, 255, 0.15);
  border-bottom: 1px solid rgba(60, 60, 67, 0.10);
}
.iv-subject-label {
  color: #8e8e93;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 1.8px;
  text-transform: uppercase;
}
.iv-subject-text {
  color: #1c1c1e;
  font-family: "Iowan Old Style", "Baskerville", "Times New Roman", "Songti SC", serif;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.35;
  letter-spacing: 0.3px;
}
.iv-content {
  min-height: 240px;
  padding: 18px 22px 70px 22px;
  background: radial-gradient(circle at 90% 10%, rgba(0, 122, 255, 0.02), transparent 40%), rgba(255, 255, 255, 0.10);
  border-radius: 0 0 20px 20px;
}
.iv-content-label {
  color: #8e8e93;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 1.8px;
  text-transform: uppercase;
  margin-bottom: 12px;
}
.iv-thought {
  color: #1c1c1e;
  font-family: "Iowan Old Style", "Baskerville", "Times New Roman", "Songti SC", serif;
  font-size: 16px;
  font-weight: 400;
  font-style: normal;
  letter-spacing: 0.3px;
  line-height: 1.7;
  transform: none;
  text-shadow: none;
  white-space: pre-wrap; word-break: break-word; padding: 4px 0;
}
.iv-thought.expanded {
  max-height: 48vh;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
  padding-right: 4px;
  overscroll-behavior: contain;
}
.iv-icon-btn {
  background: rgba(255, 255, 255, 0.40);
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 50%;
  color: #1c1c1e;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03), inset 0 1px 1px rgba(255, 255, 255, 0.7);
}`;

  // ===== IndexedDB 工具 =====
  const DB_NAME = 'NanoVoiceDB';
  const STORE_NAME = 'templates';
  let db = null;
  let isInternalChange = false;
  let currentTemplateId = 'default';

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = function(e) {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(STORE_NAME)) {
          d.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = function(e) { resolve(e.target.result); };
      request.onerror = function(e) { reject(e.target.error); };
    });
  }

  async function getAllTemplates() {
    if (!db) db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveTemplate(id, name, css) {
    if (!db) db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put({ id, name, css });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function deleteTemplate(id) {
    if (!db) db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function initDefaultTemplate() {
    const all = await getAllTemplates();
    const hasDefault = all.some(t => t.id === 'default');
    if (!hasDefault) {
      await saveTemplate('default', '默认 · iOS邮件', DEFAULT_CSS);
    } else {
      // 一次性迁移：旧版“默认 · 狂野草书”默认模板统一升级为“默认 · iOS邮件”+ 完整默认样式
      const tpl = all.find(t => t.id === 'default');
      const isOld = tpl && (
        (tpl.name && String(tpl.name).indexOf('狂野草书') !== -1) ||
        (tpl.css && String(tpl.css).indexOf('狂野草书') !== -1) ||
        (tpl.css && String(tpl.css).indexOf('Snell Roundhand') !== -1)
      );
      if (isOld) {
        await saveTemplate('default', '默认 · iOS邮件', DEFAULT_CSS);
      }
    }
  }

  // ===== 渲染下拉列表 =====
  async function renderSelectOnly(selectedId) {
    const all = await getAllTemplates();
    const select = $('ivTemplateSelect');
    const currentVal = selectedId || select.value || currentTemplateId;

    select.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '— 选择预设 —';
    placeholder.disabled = true;
    select.appendChild(placeholder);

    for (const tpl of all) {
      const opt = document.createElement('option');
      opt.value = tpl.id;
      opt.textContent = tpl.name;
      select.appendChild(opt);
    }

    const exists = all.some(t => t.id === currentVal);
    if (exists) {
      select.value = currentVal;
      currentTemplateId = currentVal;
    } else if (all.length > 0) {
      select.value = all[0].id;
      currentTemplateId = all[0].id;
    } else {
      select.value = '';
      currentTemplateId = '';
    }

    const selected = all.find(t => t.id === select.value);
    if (selected) {
      $('ivCss').value = selected.css;
    } else {
      $('ivCss').value = '';
    }
  }

  // ===== 加载指定模板到编辑器 =====
  async function loadTemplateToEditor(id) {
    const all = await getAllTemplates();
    const tpl = all.find(t => t.id === id);
    if (tpl) {
      $('ivCss').value = tpl.css;
      currentTemplateId = id;
      $('ivTemplateName').value = '';
      const select = $('ivTemplateSelect');
      if (select.value !== id) {
        select.value = id;
      }
    }
  }

  // ===== 保存当前编辑器内容到当前选中的模板 =====
  async function saveCurrentToTemplate() {
    const id = $('ivTemplateSelect').value;
    if (!id) return false;
    const all = await getAllTemplates();
    const tpl = all.find(t => t.id === id);
    if (tpl) {
      tpl.css = $('ivCss').value;
      await saveTemplate(tpl.id, tpl.name, tpl.css);
      return true;
    }
    return false;
  }

  // ===== 应用CSS到页面 =====
  function applyCustomCSS(css) {
    const styleTag = document.getElementById('nanoVoiceCustomCSS');
    if (styleTag) {
      styleTag.textContent = css || $('ivCss').value;
    }
  }

  // ===== 已应用的 CSS 持久化（默认外观交给 css/heart.css，不再被默认模板覆盖）=====
  function saveAppliedCss(css) {
    try { localStorage.setItem('nano_voice_applied_css', css || ''); } catch (e) {}
  }
  function loadAppliedCss() {
    try { return localStorage.getItem('nano_voice_applied_css') || ''; } catch (e) { return ''; }
  }

  // ===== 快捷 DIY =====
  function quickCfgGet() {
    try { return JSON.parse(localStorage.getItem('nano_voice_quick') || '{}') || {}; } catch (e) { return {}; }
  }
  function quickCfgSet(o) {
    try { localStorage.setItem('nano_voice_quick', JSON.stringify(o || {})); } catch (e) {}
  }
  function applyQuick() {
    const c = quickCfgGet();
    let css = '';
    if (c.hideAvatar) css += '.nano-voice-modal .iv-avatar{display:none !important;}\n';
    if (c.hideName) css += '.nano-voice-modal .iv-name{display:none !important;}\n';
    if (c.hideSubject) css += '.nano-voice-modal .iv-subject{display:none !important;}\n';
    if (c.hideMeta) css += '.nano-voice-modal .iv-meta{display:none !important;}\n';
    if (c.hideUnread) css += '.nano-voice-modal .iv-unread{display:none !important;}\n';
    if (c.avatarRight) css += '.iv-sender{flex-direction:row-reverse;}\n.iv-sender-info{margin-left:0;margin-right:14px;text-align:right;}\n.iv-unread{margin-left:0;margin-right:12px;}\n';
    // 头像居中 / 放大
    if (c.avatarCenter) css += '.nano-voice-modal .iv-sender{flex-direction:column;align-items:center;text-align:center;}\n' +
      '.nano-voice-modal .iv-sender-info{margin-left:0;margin-top:10px;text-align:center;}\n' +
      '.nano-voice-modal .iv-unread{margin-left:0;margin-top:10px;}\n';
    if (c.avatarSize) {
      const s = Math.max(24, Math.min(200, parseInt(c.avatarSize, 10) || 0));
      if (s) css += '.nano-voice-modal{--iv-avatar-size:' + s + 'px;}\n';
    }
    // 昵称独立成行：把头像下方的信息整块换行显示
    if (c.nameNewline) css += '.nano-voice-modal .iv-sender{flex-wrap:wrap;}\n' +
      '.nano-voice-modal .iv-sender-info{flex:1 1 100%;margin-left:0;margin-top:8px;}\n';
    let tag = document.getElementById('nanoVoiceQuickCSS');
    if (!tag) {
      tag = document.createElement('style');
      tag.id = 'nanoVoiceQuickCSS';
      document.body.appendChild(tag);
    }
    tag.textContent = css;

    // 附加文字 / 顶部·底部装饰（文字或 HTML，如 <img> 贴图）
    const setHtml = function (id, html) {
      const el = document.getElementById(id);
      if (!el) return;
      const has = !!(html && String(html).trim());
      el.innerHTML = has ? String(html) : '';
      el.classList.toggle('on', has);
    };
    setHtml('ivDecoTop', c.decoTopHtml);
    setHtml('ivDecoBottom', c.decoBottomHtml);
    const exEl = document.getElementById('ivExtraText');
    if (exEl) exEl.textContent = c.extraText || '';
    // 自定义「美化 / 取消」按钮文案
    const bf = $('ivBeautify'), ex = $('ivExit');
    if (bf) {
      if (c.beautifyLabel) { if (!bf.dataset.icon) bf.dataset.icon = bf.innerHTML; bf.textContent = c.beautifyLabel; }
      else if (bf.dataset.icon) { bf.innerHTML = bf.dataset.icon; delete bf.dataset.icon; }
    }
    if (ex) {
      if (c.exitLabel) { if (!ex.dataset.icon) ex.dataset.icon = ex.innerHTML; ex.textContent = c.exitLabel; }
      else if (ex.dataset.icon) { ex.innerHTML = ex.dataset.icon; delete ex.dataset.icon; }
    }
    // 内置提示词
    const bp = $('ivBuiltinPrompt');
    if (bp) bp.value = (function () { try { return localStorage.getItem('nano_heart_builtin_prompt') || ''; } catch (e) { return ''; } })();
    // 折叠设置变化后，立刻按新设置重排当前心声（换行/加行是否完整显示）
    const th = $('ivThought');
    if (th && (th.textContent || '').trim()) setupThoughtExpand(th);
    // 面板控件回填
    const sa = $('ivShowAvatar'), sn = $('ivShowName'), ar = $('ivAvatarRight');
    if (sa) sa.checked = !c.hideAvatar;
    if (sn) sn.checked = !c.hideName;
    if (ar) ar.checked = !!c.avatarRight;
    const ss = $('ivShowSubject'), sm = $('ivShowMeta');
    if (ss) ss.checked = !c.hideSubject;
    if (sm) sm.checked = !c.hideMeta;
    const ft = $('ivShowFullThought');
    if (ft) ft.checked = !!c.fullThought;
    const hu = $('ivHideUnread');
    if (hu) hu.checked = !!c.hideUnread;
    const ac = $('ivAvatarCenter'), nn = $('ivNameNewline'), avs = $('ivAvatarSize');
    if (ac) ac.checked = !!c.avatarCenter;
    if (nn) nn.checked = !!c.nameNewline;
    if (avs) avs.value = c.avatarSize || '';
    const exIn = $('ivExtraTextInput'), dtp = $('ivDecoTopHtml'), dbm = $('ivDecoBottomHtml');
    if (exIn) exIn.value = c.extraText || '';
    if (dtp) dtp.value = c.decoTopHtml || '';
    if (dbm) dbm.value = c.decoBottomHtml || '';
    const bl = $('ivBeautifyLabel'), el = $('ivExitLabel');
    if (bl) bl.value = c.beautifyLabel || '';
    if (el) el.value = c.exitLabel || '';
  }
  function bindQuick() {
    const save = async function () {
      const c = quickCfgGet();
      const sa = $('ivShowAvatar'), sn = $('ivShowName'), ar = $('ivAvatarRight');
      c.hideAvatar = sa ? !sa.checked : false;
      c.hideName = sn ? !sn.checked : false;
      c.avatarRight = ar ? !!ar.checked : false;
      const ss = $('ivShowSubject'), sm = $('ivShowMeta');
      c.hideSubject = ss ? !ss.checked : false;
      c.hideMeta = sm ? !sm.checked : false;
      const ft = $('ivShowFullThought');
      c.fullThought = ft ? !!ft.checked : false;
      const hu = $('ivHideUnread');
      c.hideUnread = hu ? !!hu.checked : false;
      const ac = $('ivAvatarCenter'), nn = $('ivNameNewline'), avs = $('ivAvatarSize');
      c.avatarCenter = ac ? !!ac.checked : false;
      c.nameNewline = nn ? !!nn.checked : false;
      c.avatarSize = avs ? avs.value.trim() : '';
      const exIn = $('ivExtraTextInput'), dtp = $('ivDecoTopHtml'), dbm = $('ivDecoBottomHtml');
      c.extraText = exIn ? exIn.value : '';
      c.decoTopHtml = dtp ? dtp.value : '';
      c.decoBottomHtml = dbm ? dbm.value : '';
      const bl = $('ivBeautifyLabel'), el = $('ivExitLabel');
      c.beautifyLabel = bl ? bl.value.trim() : '';
      c.exitLabel = el ? el.value.trim() : '';
      quickCfgSet(c);
      try {
        const bp = $('ivBuiltinPrompt');
        localStorage.setItem('nano_heart_builtin_prompt', bp ? bp.value.trim() : '');
      } catch (e) {}
      applyQuick();
      if (window.console) console.log('[Heart] 快捷 DIY 已保存');
    };
    const qs = $('ivQuickSave');
    if (qs) qs.addEventListener('click', save);
  }

  // ===== 关闭弹窗 =====
  function closeVoice() {
    const layer = $('nanoVoiceLayer');
    layer.classList.remove('active');
    try { window.parent.postMessage({ type: 'NANO_INNER_VOICE_CLOSE' }, '*'); } catch(e) {}
  }

  // ===== 打开弹窗（由 chat-core 调用） =====
  function openVoice(data) {
    const layer = $('nanoVoiceLayer');
    if (!layer) {
      console.warn('[Heart] 未找到 nanoVoiceLayer 元素');
      return;
    }

    // 更新发件人
    const sender = $('ivSender');
    if (sender && data.from) sender.textContent = data.from;

    // 更新收件人
    const recipient = $('ivRecipient');
    if (recipient && data.to) recipient.textContent = data.to;

    // 更新主题（此刻 · 印象）
    const subject = $('ivSubject');
    if (subject) subject.textContent = data.subject || '';

    // 更新心声内容
    const thought = $('ivThought');
    if (thought) {
      thought.textContent = data.message || '';
      setupThoughtExpand(thought);
    }

    // 更新时间
    const time = $('ivTime');
    if (time) {
      if (data.time) {
        time.textContent = data.time;
      } else {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        time.textContent = h + ':' + m;
      }
    }

    // 更新头像
    const avatar = $('ivAvatar');
    const fallback = $('ivAvatarFallback');
    if (data.avatar && avatar) {
      avatar.src = data.avatar;
      avatar.hidden = false;
      if (fallback) fallback.hidden = true;
    } else if (fallback) {
      fallback.hidden = false;
      if (avatar) avatar.hidden = true;
    }

    // 显示弹窗
    layer.classList.add('active');
  }

  // ===== 初始化 =====
  (async function init() {
    await initDefaultTemplate();
    await renderSelectOnly('default');
    const all = await getAllTemplates();
    const defaultTpl = all.find(t => t.id === 'default');
    if (defaultTpl) {
      $('ivCss').value = defaultTpl.css;
    }
    // 默认外观交给 css/heart.css；仅当用户自定义过才注入覆盖 CSS，
    // 这样直接改 css/heart.css 也能生效（不再被默认模板强制覆盖）
    const appliedCss = loadAppliedCss();
    if (appliedCss) applyCustomCSS(appliedCss);
    applyQuick();
    bindQuick();

    // ===== 事件绑定 =====
    $('ivExit').addEventListener('click', closeVoice);
    $('nanoVoiceLayer').addEventListener('click', function(e) {
      if (e.target === this) closeVoice();
    });

    // 美化面板开关
    $('ivBeautify').addEventListener('click', async function() {
      $('ivCustomize').classList.add('show');
      await initDefaultTemplate();
      // 未选中任何模板时，回退到默认模板，并把默认 UI 的 css 代码载入输入框
      const target = currentTemplateId || 'default';
      await renderSelectOnly(target);
    });
    $('ivCustomizeClose').addEventListener('click', function() {
      $('ivCustomize').classList.remove('show');
    });

    // 下拉切换
    $('ivTemplateSelect').addEventListener('change', async function() {
      if (isInternalChange) return;
      const id = this.value;
      if (!id) {
        $('ivCss').value = '';
        currentTemplateId = '';
        return;
      }
      await loadTemplateToEditor(id);
    });

    // 保存模板
    $('ivSaveTemplate').addEventListener('click', async function() {
      const name = $('ivTemplateName').value.trim();
      if (!name) { alert('请输入模板名称'); return; }
      const css = $('ivCss').value;
      const id = 'tpl_' + Date.now();
      await saveTemplate(id, name, css);
      isInternalChange = true;
      await renderSelectOnly(id);
      isInternalChange = false;
      $('ivTemplateName').value = '';
    });

    // 修改模板
    $('ivRenameTemplate').addEventListener('click', async function() {
      const id = $('ivTemplateSelect').value;
      if (!id) { alert('请先选择一个预设'); return; }
      if (id === 'default') { alert('默认模板不可修改'); return; }

      const all = await getAllTemplates();
      const tpl = all.find(t => t.id === id);
      if (!tpl) return;

      const newName = $('ivTemplateName').value.trim();
      const newCss = $('ivCss').value;

      const nameChanged = newName && newName !== tpl.name;
      const cssChanged = newCss !== tpl.css;

      if (!nameChanged && !cssChanged) {
        alert('没有检测到任何修改');
        return;
      }

      let msg = '确定要更新 "' + tpl.name + '" 吗？\n';
      if (nameChanged) msg += '• 名称: "' + tpl.name + '" → "' + newName + '"\n';
      if (cssChanged) msg += '• CSS 代码已修改';
      if (!confirm(msg)) return;

      const finalName = nameChanged ? newName : tpl.name;
      const finalCss = cssChanged ? newCss : tpl.css;
      await saveTemplate(id, finalName, finalCss);

      isInternalChange = true;
      await renderSelectOnly(id);
      isInternalChange = false;
      $('ivTemplateName').value = '';
    });

    // 删除模板
    $('ivDeleteTemplate').addEventListener('click', async function() {
      const id = $('ivTemplateSelect').value;
      if (!id) { alert('请先选择一个预设'); return; }
      if (id === 'default') { alert('默认模板不可删除'); return; }
      const all = await getAllTemplates();
      const tpl = all.find(t => t.id === id);
      if (!tpl) return;
      if (confirm(`确定要删除 "${tpl.name}" 吗？`)) {
        await deleteTemplate(id);
        const defaultTpl = all.find(t => t.id === 'default');
        if (defaultTpl) {
          isInternalChange = true;
          await renderSelectOnly('default');
          isInternalChange = false;
          $('ivCss').value = defaultTpl.css;
          currentTemplateId = 'default';
        }
        $('ivTemplateName').value = '';
      }
    });

    // 清空
    $('ivClearBtn').addEventListener('click', function() {
      $('ivCss').value = '';
      const select = $('ivTemplateSelect');
      if (select) select.value = '';
      currentTemplateId = '';
    });

    // 应用 CSS
    $('ivApply').addEventListener('click', async function() {
      const css = $('ivCss').value;
      applyCustomCSS(css);
      saveAppliedCss(css);
      const id = $('ivTemplateSelect').value;
      if (id) {
        await saveCurrentToTemplate();
      }
      $('ivCustomize').classList.remove('show');
    });

    // 恢复默认：还原初始 UI，并同步让 CSS 覆盖输入栏恢复为初始 UI 的 css 代码
    $('ivReset').addEventListener('click', async function() {
      const styleTag = document.getElementById('nanoVoiceCustomCSS');
      if (styleTag) styleTag.textContent = '';
      saveAppliedCss('');
      document.querySelector('.iv-thought').style.cssText = '';
      document.querySelector('.nano-voice-modal').style.cssText = '';
      // 同步把 CSS 覆盖输入栏恢复为「最新的内置 DIY 模板」代码（旧版默认模板会升级过来）
      await saveTemplate('default', '默认 · iOS邮件', DEFAULT_CSS);
      const all = await getAllTemplates();
      const defaultTpl = all.find(t => t.id === 'default');
      if (defaultTpl) {
        $('ivCss').value = defaultTpl.css;
        currentTemplateId = 'default';
        isInternalChange = true;
        await renderSelectOnly('default');
        isInternalChange = false;
      }
      $('ivCustomize').classList.remove('show');
    });

    // 导入功能
    $('ivImportBtn').addEventListener('click', function() { $('ivFileInput').click(); });
    // 娜娜助手下发心声 CSS：立即应用并持久化；若它同时写了预设，刷新下拉并选中
    window.addEventListener('message', function (e) {
      var d = e.data;
      if (d && d.type === 'nanoVoiceCss') {
        applyCustomCSS(d.css || '');
        saveAppliedCss(d.css || '');
        try {
          (async function () {
            await initDefaultTemplate();
            var target = currentTemplateId || 'default';
            if (d.name) {
              var all = await getAllTemplates();
              var hit = all.find(function (t) { return t.name === d.name; });
              if (hit) target = hit.id;
            }
            await renderSelectOnly(target);
          })();
        } catch (err) {}
      }
    });
    // 导出当前选中的预设（分享图标）
    $('ivExportBtn').addEventListener('click', async function() {
      const id = $('ivTemplateSelect').value;
      let name = ($('ivTemplateName').value.trim()) || '心声美化';
      let css = $('ivCss').value;
      if (id) {
        try {
          const all = await getAllTemplates();
          const tpl = all.find(t => t.id === id);
          if (tpl) { name = tpl.name || name; css = tpl.css || css; }
        } catch (e) {}
      }
      try {
        const blob = new Blob([JSON.stringify({ type: 'heart', name: name, css: css }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = String(name).replace(/[\\/:*?"<>|]/g, '_') + '.json';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      } catch (e) { alert('导出失败'); }
    });
    $('ivFileInput').addEventListener('change', function(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(e) {
        try {
          const content = e.target.result;
          if (file.name.endsWith('.json')) {
            const json = JSON.parse(content);
            if (json.css) $('ivCss').value = json.css;
          } else {
            $('ivCss').value = content;
          }
          const select = $('ivTemplateSelect');
          if (select) select.value = '';
          currentTemplateId = '';
        } catch (error) { alert('导入失败，请检查文件格式'); }
      };
      reader.readAsText(file);
      event.target.value = '';
    });

    // ===== 外部消息 =====
    window.addEventListener('message', function(event) {
      const data = event.data || {};
      if (data.type !== 'NANO_INNER_VOICE_UPDATE') return;
      if (typeof data.senderName === 'string') $('ivSender').textContent = data.senderName;
      if (typeof data.recipient === 'string') $('ivRecipient').textContent = data.recipient;
      if (typeof data.subject === 'string') $('ivSubject').textContent = data.subject;
      if (typeof data.thought === 'string') {                                               
        $('ivThought').textContent = data.thought;                                          
        setupThoughtExpand($('ivThought'));                                                 
        $('ivTime').textContent = '刚刚';                                                     
      }
      if (typeof data.avatar === 'string' && data.avatar) {
        $('ivAvatar').src = data.avatar;
        $('ivAvatar').hidden = false;
        $('ivAvatarFallback').hidden = true;
      }
    });

    // ===== URL参数 =====
    const params = new URLSearchParams(location.search);
    if (params.get('sender')) $('ivSender').textContent = params.get('sender');
    if (params.get('to')) $('ivRecipient').textContent = params.get('to');
    if (params.get('subject')) $('ivSubject').textContent = params.get('subject');
    if (params.get('thought')) {                                                             
      $('ivThought').textContent = params.get('thought');                                   
      setupThoughtExpand($('ivThought'));                                                   
      $('ivTime').textContent = '刚刚';                                                       
    }
  })();

  // ===== 暴露全局 API =====
  window.__heart = {
    open: openVoice,
    close: closeVoice,
    getPrompt: function(charName, userName, messageText) {
      return buildThoughtPrompt(charName || '角色', userName || '用户', messageText || '');
    },
    getImpressionPrompt: function(charName) {
      return buildImpressionPrompt(charName || '角色');
    },
    // 更新数据（不打开弹窗）
    update: function(data) {
      if (data.from) {
        const el = $('ivSender');
        if (el) el.textContent = data.from;
      }
      if (data.message) {                                                                    
        const el = $('ivThought');                                                           
        if (el) { el.textContent = data.message; setupThoughtExpand(el); }                   
      }
      if (data.time) {
        const el = $('ivTime');
        if (el) el.textContent = data.time;
      }
      if (data.subject) {
        const el = $('ivSubject');
        if (el) el.textContent = data.subject;
      }
      if (data.to) {
        const el = $('ivRecipient');
        if (el) el.textContent = data.to;
      }
      if (data.avatar) {
        const avatar = $('ivAvatar');
        const fallback = $('ivAvatarFallback');
        if (avatar) {
          avatar.src = data.avatar;
          avatar.hidden = false;
          if (fallback) fallback.hidden = true;
        }
      }
    }
  };

  console.log('[Heart] 全局 API 已注册 ✅');
})();