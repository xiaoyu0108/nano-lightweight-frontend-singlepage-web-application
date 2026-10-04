/* ============================================
   Nano 心声 · 完整逻辑
   ============================================ */

(function() {
  'use strict';

  const $ = id => document.getElementById(id);

  // ============================================
  // 心声模板 DIY 配方：给 AI 读的说明（「复制模板」会把这段 + 当前 CSS 一起复制）
  // 模板本质是可覆盖的 CSS；以下 id/类名是 JS 写入数据的挂点，只需保留选择器、样式可任意重构。
  // ============================================
  window.NANO_HEART_RECIPE = `【Nano 心声模板 DIY 配方（交给 AI 修改时请一并提供）】
你可以在下面的 CSS 里任意重构「心声」卡片：隐藏任意文字/头像、把头像或名字移到任意位置、重排顶栏 / 内容区 / 底栏，全部通过 CSS 完成。
JS 会写入文本/图片的挂点（请保留这些 id 或类名，只改样式，不要删元素）：
  #ivAvatar / .iv-avatar          头像图片
  .iv-avatar-fallback             头像兜底字母
  #ivSender / .iv-name            发送人昵称
  .iv-caption                     “发送人”小字
  #ivRecipient / .user-name       收件人
  #ivTime                         时间
  #ivSubject / .iv-subject        此刻·印象
  #ivThought / .iv-thought        心声正文
  #ivExtraText / .iv-extra-text   附加文字（默认为空，可设 display:block 显示）
  #ivDecoTop / .iv-deco-top       顶部装饰层（默认隐藏）
  #ivDecoBottom / .iv-deco-bottom 底部装饰层（默认隐藏）
  .iv-sender / .iv-header / .iv-meta / .iv-content / .iv-custom-foot   结构容器
可用的重构手段：
  1) 隐藏：selector{display:none !important}
  2) 任意移动：给元素 position:absolute/fixed; left/top/right/bottom/transform；父级需 position:relative 且 overflow:visible
  3) 重排：父级 display:flex; flex-direction:column/reverse；用 order 调整顺序
  4) 换头像/图片：selector::before{content:url("图片地址")} 或改 background-image
  5) 加文字/角标/水印：selector::after{content:"文案"}
  6) 换字体/颜色/尺寸/圆角/间距：font-family / font-size / color / background / border-radius 任意改
  7) 想“覆盖 HTML”：CSS 无法新增可交互 DOM，但可用 ::before/::after 的 content 加文字/贴图，并把原元素 display:none 后在其位置摆新内容
注意：不要写 <script>；.nano-voice-modal 是卡片本体；.iv-customize 是编辑面板（仅打开美化时出现，勿改其 display）。`;

  // 复制文本到剪贴板（带 execCommand 兜底，兼容 WebView）
  function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    } catch (e) {}
    return new Promise(function (resolve) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      } catch (e) {}
      resolve();
    });
  }

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
严禁“过来让我抱一下 / 让我抱抱 / 过来抱抱 / 来抱一下 / 抱一下 / 抱抱我 / 过来亲一下 / 亲一下 / 摸摸头 / 揉揉头”这类撒娇求抱、索要肢体亲昵的话术。

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
5. 语言风格：平实、口语化，像普通人心里随口想的话；不追求文采，不煽情、不文艺腔
6. 可以有不完整的句子、跳跃的思绪、反问、自我怀疑，越真实越好
7. 严禁出现"小姑娘/小东西/小家伙/小丫头/小可爱/女孩/姑娘/丫头/女人"等油腻称呼与霸总腔
7.1 严禁"过来让我抱一下 / 让我抱抱 / 过来抱抱 / 来抱一下 / 抱一下 / 抱抱我 / 过来亲一下 / 亲一下 / 摸摸头 / 揉揉头"这类撒娇求抱、索要肢体亲昵的话术
8. 严禁催促、命令、安排对方的生活（如催吹头发、起床、睡觉、吃饭、喝水、吃药、早点休息）
9. 严禁替对方说话或预设对方的回答、反应；严禁凭空给对方添加胃病等任何病症，除非设定里明确写了
10. 严禁霸道油腻/霸总网文腔：小姑娘、小东西、小丫头、丫头、女人、这女人、低吼、揉碎、掐腰、红着眼、哑声、眸色一沉、你是我的、逃不掉、宠你、乖、听话、让我好好疼你、我接住你、我等你慢慢说、别怕有我在 等一律禁止；不写占有欲、命令口吻、露骨或性暗示。写完自查一遍，出现即重写。
11. 严禁“过来让我抱一下 / 让我抱抱 / 过来抱抱 / 来抱一下 / 抱一下 / 抱抱我 / 过来亲一下 / 亲一下 / 摸摸头 / 揉揉头”这类撒娇求抱、索要肢体亲昵的话术。
12. 禁止「咯噔文学」：不要用"突然/忽然/猛地/刹那间"制造戏剧化转折，不要写"心里一下子就空了/凉了/明白了""全世界都安静了""原来……""那一刻我懂了""心口一紧"这类一惊一乍、故作深情的句子。平铺直叙地说你此刻真实在想的琐碎念头即可。

现在请写出${charName}的心理活动：`;

    if (messageText) {
      prompt += `\n\n（你刚刚发送的消息是："${messageText}"）`;
    }

    return prompt;
}

// 心声手记：不折叠。框够高就完整显示，内容太长时在心声区域内滑动（滚动条已隐藏）
function setupThoughtExpand(el) {
  if (!el || typeof el.setAttribute !== 'function') return;
  el.classList.remove('collapsed', 'expanded');
  el.dataset.full = (el.textContent || '').trim();
}

  // ===== 默认模板（高度可 DIY）=====
  const DEFAULT_CSS = `/* ============================================================
   默认 · 居中大头像（iOS 邮件风）— 这就是「内置美化」的初始样式
   ------------------------------------------------------------
   「还原」= 回到下面这套初始样式；想任意改造，直接在本框里写 CSS 覆盖即可。
   所有元素都能隐藏 / 移动 / 放大缩小 / 换图 / 换字，JS 写入的挂点：
     #ivAvatar(.iv-avatar) 头像 · #ivSender(.iv-name) 昵称 · .iv-caption 发送人小字
     #ivRecipient 收件人 · #ivTime 时间 · #ivSubject(.iv-subject) 此刻印象
     #ivThought(.iv-thought) 心声正文 · #ivExtraText 附加文字
     #ivDecoTop / #ivDecoBottom 顶/底装饰层 · .iv-header/.iv-meta/.iv-content 结构容器
   ---- 常用改法（复制需要的行，改完点「应用 CSS」）----
   ① 隐藏任意文字 / 头像：选择器加 display:none !important;
      例：.nano-voice-modal .iv-caption { display:none !important; }   隐藏“发送人”小字
   ② 头像随意换位置（不只是平移，可放任意角落 / 固定到屏幕）：
      .nano-voice-modal .iv-avatar{ position:absolute !important; left:auto; right:14px; top:-28px; }
      想固定在屏幕某处：把 position 改成 fixed，left/top 填像素或百分比。
      父级 .iv-header 需 position:relative、overflow:visible（默认已满足）。
   ③ 重排顶栏 / 内容区：给容器 display:flex; flex-direction:column/reverse; 用 order 调整先后。
   ④ 头像大小 / 圆角：改 --iv-avatar-size / --iv-avatar-radius（见下）。
   ⑤ 加一行文字：.iv-extra-text{display:block} + .iv-extra-text::before{content:"文案"}
      （换行写 "\\A" 并配 white-space:pre-wrap）。
   ⑥ 加装饰 / 角标 / 水印：.iv-deco-top/.iv-deco-bottom 设 display:block 后
      配 ::before{content:url("图片地址")}；.iv-content::after{content:"Nano";position:absolute;right:16px;bottom:12px;opacity:.35;}
   ⑦ 换字体 / 配色 / 宽度：font-family / color / background / width 任意改。
   想恢复：点「还原」即可回到下面这套初始样式。
   ============================================================ */
.nano-voice-modal {
  --iv-avatar-size: 72px;
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
  width: var(--iv-avatar-size, 72px);
  height: var(--iv-avatar-size, 72px);
  flex: 0 0 var(--iv-avatar-size, 72px);
  background: rgba(240, 240, 245, 0.6);
  border-radius: var(--iv-avatar-radius, 50%);
  border: 1px solid rgba(255, 255, 255, 0.7);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
}
/* 头像居中 + 昵称独立成行（想恢复左对齐就删掉这一段） */
.iv-sender { flex-direction: column; align-items: center; text-align: center; }
.iv-sender-info { flex: none; margin-left: 0; margin-top: 12px; text-align: center; }
.iv-name { white-space: normal; overflow-wrap: anywhere; font-size: 22px; }
.iv-unread { margin-left: 0; margin-top: 10px; }
.iv-meta { grid-template-columns: auto auto; justify-content: center; column-gap: 6px; }
.iv-subject { text-align: center; }
.iv-subject-text { text-align: center; }
.iv-content { min-height: 200px; padding: 20px 24px 26px; }
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

  // ===== 内置模板 2：经典 · 左头像 iOS邮件（旧版默认外观） =====
  const CLASSIC_CSS = `/* 经典 · 左头像 iOS邮件 */
.nano-voice-modal { --iv-avatar-size: 48px; --iv-avatar-radius: 50%; }
.iv-header { padding: 18px 22px 14px; text-align: left; }
.iv-sender { flex-direction: row; align-items: center; }
.iv-sender-info { flex: 1; margin-left: 14px; margin-top: 0; text-align: left; }
.iv-name { font-size: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.iv-unread { margin-left: 12px; margin-top: 0; }
.iv-meta { grid-template-columns: 48px 1fr; justify-content: start; column-gap: 0; }
.iv-subject { text-align: left; }
.iv-subject-text { text-align: left; }
.iv-content { min-height: 240px; padding: 18px 22px 24px; }`;

  // ===== 内置模板 3：极简 · 无边框 =====
  const MINIMAL_CSS = `/* 极简 · 无边框 */
.nano-voice-modal {
  --iv-avatar-size: 56px;
  background: #ffffff;
  border: none;
  box-shadow: 0 12px 44px rgba(0, 0, 0, 0.10);
}
.iv-header, .iv-subject, .iv-content { background: transparent; }
.iv-header { border-bottom: 1px solid rgba(60, 60, 67, 0.08); }
.iv-subject { border-bottom: 1px solid rgba(60, 60, 67, 0.08); }
.iv-thought { font-family: var(--iv-sans); }`;

  // ===== 内置模板 4：自由排版 · 任意移动 / 隐藏文字 / 头像大小位置 =====
  const FREE_CSS = `/* 自由排版 · 任意移动 / 隐藏文字 / 头像大小位置
   改下面这些变量就能自由摆放（px / % / vw 都行）：
     --iv-card-x / --iv-card-y      整张卡片相对居中位置的偏移
     --iv-avatar-size               头像大小
     --iv-avatar-x / --iv-avatar-y  头像相对位置偏移
   隐藏文字：把对应变量设为 none 即可
     --iv-caption-display   “发送人”小字
     --iv-name-display      昵称
     --iv-meta-display      收件人 / 时间信息
     --iv-subject-display   “此刻 · 印象”主题
*/
.nano-voice-modal{
  --iv-card-x: 0px;
  --iv-card-y: 0px;
  --iv-avatar-size: 72px;
  --iv-avatar-x: 0px;
  --iv-avatar-y: 0px;
  --iv-caption-display: block;
  --iv-name-display: block;
  --iv-meta-display: grid;
  --iv-subject-display: block;
  position: relative;
  left: var(--iv-card-x);
  top: var(--iv-card-y);
  overflow: visible;
}
.iv-sender { position: relative; }
.iv-avatar { transform: translate(var(--iv-avatar-x), var(--iv-avatar-y)); }
.iv-caption { display: var(--iv-caption-display); }
.iv-name { display: var(--iv-name-display); }
.iv-meta { display: var(--iv-meta-display); }
.iv-subject { display: var(--iv-subject-display); }`;

  // ===== 内置模板列表（首次自动写入，且在模板管理里不可删除/改名） =====
  const BUILTIN_TEMPLATES = [
    { id: 'default', name: '默认 · 居中大头像', css: DEFAULT_CSS },
    { id: 'builtin_classic', name: '经典 · 左头像 iOS邮件', css: CLASSIC_CSS },
    { id: 'builtin_minimal', name: '极简 · 无边框', css: MINIMAL_CSS },
    { id: 'builtin_free', name: '自由排版 · 可移动/隐藏', css: FREE_CSS }
  ];
  function isBuiltinTemplate(id) {
    return BUILTIN_TEMPLATES.some(function (b) { return b.id === id; });
  }

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
    const byId = {};
    all.forEach(function (t) { byId[t.id] = t; });
    // 内置模板：缺失才补齐，绝不覆盖用户自己保存的模板
    for (var i = 0; i < BUILTIN_TEMPLATES.length; i++) {
      var b = BUILTIN_TEMPLATES[i];
      if (!byId[b.id]) await saveTemplate(b.id, b.name, b.css);
    }
    // 旧版默认模板（狂野草书 / 老 iOS邮件）统一升级为新的「居中大头像」默认模板
    const def = byId['default'];
    if (def) {
      const css = String(def.css || '');
      const isOld = css.indexOf('居中大头像') === -1 ||
        css.indexOf('狂野草书') !== -1 || css.indexOf('Snell Roundhand') !== -1;
      if (isOld) await saveTemplate('default', '默认 · 居中大头像', DEFAULT_CSS);
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
    if (c.hideCaption) css += '.nano-voice-modal .iv-caption{display:none !important;}\n';
    if (c.hideSubject) css += '.nano-voice-modal .iv-subject{display:none !important;}\n';
    if (c.hideMeta) css += '.nano-voice-modal .iv-meta{display:none !important;}\n';
    if (c.hideUnread) css += '.nano-voice-modal .iv-unread{display:none !important;}\n';
    if (c.avatarRight) css += '.iv-sender{flex-direction:row-reverse;}\n.iv-sender-info{margin-left:0;margin-right:14px;text-align:right;}\n.iv-unread{margin-left:0;margin-right:12px;}\n';
    let tag = document.getElementById('nanoVoiceQuickCSS');
    if (!tag) {
      tag = document.createElement('style');
      tag.id = 'nanoVoiceQuickCSS';
      document.body.appendChild(tag);
    }
    tag.textContent = css;
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
    const sc = $('ivShowCaption');
    if (sc) sc.checked = !c.hideCaption;
    const ss = $('ivShowSubject'), sm = $('ivShowMeta');
    if (ss) ss.checked = !c.hideSubject;
    if (sm) sm.checked = !c.hideMeta;
    const hu = $('ivHideUnread');
    if (hu) hu.checked = !!c.hideUnread;
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
      const sc = $('ivShowCaption');
      c.hideCaption = sc ? !sc.checked : false;
      const ss = $('ivShowSubject'), sm = $('ivShowMeta');
      c.hideSubject = ss ? !ss.checked : false;
      c.hideMeta = sm ? !sm.checked : false;
      const hu = $('ivHideUnread');
      c.hideUnread = hu ? !!hu.checked : false;
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
    layer.classList.remove('active', 'customizing');
    const panel = $('ivCustomize');
    if (panel) panel.classList.remove('show');
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

    // 美化面板开关（打开时关掉毛玻璃，iOS 不卡）
    const setCustomizing = function (on) {
      const layer = $('nanoVoiceLayer');
      if (layer) layer.classList.toggle('customizing', !!on);
    };
    $('ivBeautify').addEventListener('click', async function() {
      $('ivCustomize').classList.add('show');
      setCustomizing(true);
      await initDefaultTemplate();
      // 未选中任何模板时，回退到默认模板，并把默认 UI 的 css 代码载入输入框
      const target = currentTemplateId || 'default';
      await renderSelectOnly(target);
    });
    $('ivCustomizeClose').addEventListener('click', function() {
      $('ivCustomize').classList.remove('show');
      setCustomizing(false);
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
      if (isBuiltinTemplate(id)) { alert('内置模板不可修改，请另存为新模板'); return; }

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
      if (isBuiltinTemplate(id)) { alert('内置模板不可删除'); return; }
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

    // 清空：清掉编辑框 + 已应用的覆盖样式，回到初始 UI（快捷 DIY 开关保持不变）
    if ($('ivClearBtn')) $('ivClearBtn').addEventListener('click', function() {
      $('ivCss').value = '';
      const select = $('ivTemplateSelect');
      if (select) select.value = '';
      currentTemplateId = '';
      const styleTag = document.getElementById('nanoVoiceCustomCSS');
      if (styleTag) styleTag.textContent = '';
      saveAppliedCss('');
    });

    // 复制模板：把「DIY 配方 + 当前编辑器/预设的 CSS」一起复制到剪贴板，方便交给 AI 改造
    if ($('ivCopyTemplate')) $('ivCopyTemplate').addEventListener('click', async function() {
      let css = $('ivCss').value || '';
      if (!css) {
        try {
          const all = await getAllTemplates();
          const id = $('ivTemplateSelect').value;
          const tpl = all.find(t => t.id === id) || all.find(t => t.id === 'default');
          if (tpl) css = tpl.css || '';
        } catch (e) {}
      }
      if (!css) css = DEFAULT_CSS;
      const text = (window.NANO_HEART_RECIPE || '') + '\n\n/* ===== 当前心声模板 ===== */\n' + css;
      copyText(text).then(function () {
        alert('已复制「模板 + DIY 配方」，粘贴给 AI 即可任意重构。');
      });
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
      setCustomizing(false);
    });

    // 还原：还原初始 UI，并同步让 CSS 覆盖输入栏恢复为初始 UI 的 css 代码（唯一的重置按钮）
    if ($('ivRestore')) $('ivRestore').addEventListener('click', async function() {
      const styleTag = document.getElementById('nanoVoiceCustomCSS');
      if (styleTag) styleTag.textContent = '';
      saveAppliedCss('');
      document.querySelector('.iv-thought').style.cssText = '';
      document.querySelector('.nano-voice-modal').style.cssText = '';
      // 同步把 CSS 覆盖输入栏恢复为「最新的内置模板」代码（旧版默认模板会升级过来）
      await saveTemplate('default', '默认 · 居中大头像', DEFAULT_CSS);
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
      setCustomizing(false);
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