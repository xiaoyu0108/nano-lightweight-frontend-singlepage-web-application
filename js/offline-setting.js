// ============================================================
//  1. IndexedDB 工具
// ============================================================
const DB_NAME = 'MeetSettingsDB';
const DB_VERSION = 2;
// 从 offline.html 打开时带过来的当前会话 id：查找/清空都只作用于这个人（或这个群）
const CURRENT_CHAT = (function () {
  try { return new URLSearchParams(location.search).get('chat') || ''; } catch (e) { return ''; }
})();

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = function(e) {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('rules')) {
        db.createObjectStore('rules', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('stylePresets')) {
        db.createObjectStore('stylePresets', { keyPath: 'id' });
      }
  if (!db.objectStoreNames.contains('cssPresets')) {
    db.createObjectStore('cssPresets', { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains('cotPresets')) {
    db.createObjectStore('cotPresets', { keyPath: 'id' });
  }
      if (!db.objectStoreNames.contains('messages')) {
        db.createObjectStore('messages', { keyPath: 'id' });
      }
    };
    request.onsuccess = e => resolve(e.target.result);
    request.onerror = e => reject(e.target.error);
  });
}

async function getStoreData(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const result = [];
    const cursor = store.openCursor();
    cursor.onsuccess = e => {
      const cur = e.target.result;
      if (cur) {
        result.push(cur.value);
        cur.continue();
      } else {
        resolve(result);
      }
    };
    cursor.onerror = e => reject(e.target.error);
  });
}

async function putStoreData(storeName, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(data);
    req.onsuccess = () => resolve();
    req.onerror = e => reject(e.target.error);
  });
}

async function clearStore(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = e => reject(e.target.error);
  });
}

// ============================================================
//  2. 数据管理
// ============================================================
const SETTINGS_ID = 'main_settings';
const RULES_ID = 'main_rules';
const STYLE_PRESETS_ID = 'style_presets';
const CSS_PRESETS_ID = 'css_presets';
const COT_PRESETS_ID = 'cot_presets';
const MESSAGES_STORE = 'messages';

let settings = { id: SETTINGS_ID, style: '', cot: '', wordCount: '', person: 'auto', customCSS: '', autoSummary: true, memThreshold: 5, nsfw: false, maxTokens: '' };
let ruleGroups = [];
let stylePresets = [];
let cssPresets = [];
let cotPresets = [];

async function loadAllData() {
  try {
    const settingsData = await getStoreData('settings');
    const found = settingsData.find(s => s.id === SETTINGS_ID);
    if (found) settings = found;

    const rulesData = await getStoreData('rules');
    const foundRules = rulesData.find(r => r.id === RULES_ID);
    if (foundRules && foundRules.groups) {
      ruleGroups = foundRules.groups;
    } else {
      ruleGroups = [
        {
          id: 'g1',
          name: '文风规则',
          enabled: true,
          expanded: true,
          rules: [
            { id: 'g1-c1', name: '晋江体', content: '细腻克制、节奏舒缓，重心理与环境描写；遣词考究，善用留白和暗示，情绪层层递进，不直白喊口号；长短句交错，画面感与呼吸感强。', enabled: true },
            { id: 'g1-c2', name: '长佩体', content: '温柔舒展、情感含蓄内敛；重氛围与日常细节，把心动藏在动作和景物里，甜而不腻；语言干净清爽，善用光线、声音、气味等感官描写。', enabled: true },
            { id: 'g1-c3', name: '海棠体', content: '直白热烈、情感外放，语言富有张力与冲击力；善写亲密与情欲张力，节奏快、句子短促有力；大胆热烈但贴合人设，不 OOC。', enabled: true },
          ]
        },
        {
          id: 'g2',
          name: '行为规则',
          enabled: true,
          expanded: false,
          rules: [
            { id: 'g2-c1', name: '去油腻化', content: '禁止霸总式台词，禁止强制性动作。', enabled: true },
            { id: 'g2-c2', name: '保持人设', content: '始终以角色身份回应，不跳出角色。', enabled: true },
          ]
        }
      ];
      await saveRules();
    }

    // 内置文风升级：把旧的简短描述替换为更丰盈的版本（只升级内置的这三条，用户自定义的长文风不动）
    try {
      if (localStorage.getItem('nano_offline_style_v2') !== '1') {
        const STYLE_UP = {
          '晋江体': '细腻克制、节奏舒缓，重心理与环境描写；遣词考究，善用留白和暗示，情绪层层递进，不直白喊口号；长短句交错，画面感与呼吸感强。',
          '长佩体': '温柔舒展、情感含蓄内敛；重氛围与日常细节，把心动藏在动作和景物里，甜而不腻；语言干净清爽，善用光线、声音、气味等感官描写。',
          '海棠体': '直白热烈、情感外放，语言富有张力与冲击力；善写亲密与情欲张力，节奏快、句子短促有力；大胆热烈但贴合人设，不 OOC。'
        };
        let _upgraded = false;
        (ruleGroups || []).forEach(function (g) {
          (g.rules || []).forEach(function (r) {
            if (r && STYLE_UP[r.name] && (!r.content || String(r.content).length < 30)) {
              r.content = STYLE_UP[r.name]; _upgraded = true;
            }
          });
        });
        if (_upgraded) await saveRules();
        try { localStorage.setItem('nano_offline_style_v2', '1'); } catch (e) {}
      }
    } catch (e) {}

    const styleData = await getStoreData('stylePresets');
    const foundStyle = styleData.find(s => s.id === STYLE_PRESETS_ID);
    if (foundStyle && foundStyle.presets) stylePresets = foundStyle.presets;

    const cssData = await getStoreData('cssPresets');
    const foundCss = cssData.find(s => s.id === CSS_PRESETS_ID);
    if (foundCss && foundCss.presets) cssPresets = foundCss.presets;

    const cotData = await getStoreData('cotPresets');
    const foundCot = cotData.find(s => s.id === COT_PRESETS_ID);
    if (foundCot && foundCot.presets) cotPresets = foundCot.presets;

  } catch (e) {
    console.error('加载数据失败:', e);
  }
}

async function saveSettings() {
  await putStoreData('settings', settings);
}

async function saveRules() {
  await putStoreData('rules', { id: RULES_ID, groups: ruleGroups });
}

async function saveStylePresets() {
  await putStoreData('stylePresets', { id: STYLE_PRESETS_ID, presets: stylePresets });
}

async function saveCssPresets() {
  await putStoreData('cssPresets', { id: CSS_PRESETS_ID, presets: cssPresets });
}

async function saveCotPresets() {
  await putStoreData('cotPresets', { id: COT_PRESETS_ID, presets: cotPresets });
}

function generateId() { return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6); }

// ============================================================
//  3. 常量 & 工具
// ============================================================
const INITIAL_CSS = `/* ============================================================
   线下初始模板（灰粉色系）· 分区 DIY 说明
   ------------------------------------------------------------
   这个模板 = 「线下」页面样式。下面按「顶栏 / 卡片区 / 底栏 / 其它」
   分区写清能改什么、怎么改；把想用的示例取消注释，改完点「应用 CSS」。
   想回到现在这套初始外观：把「模板」切回「初始 CSS」再应用。
   ============================================================ */

/* ── 1. 顶栏 .topbar ──────────────────────────────────────────
   结构：.topbar > .top-btn(#backBtn 返回) + .top-title + .top-btn(#settingsBtn 设置)
   可改：高度 / 背景 / 圆角 / 是否吸顶 / 隐藏按钮 / 换图标 / 铺一张背景图。
   .topbar{height:64px;background:#fff;border-bottom:1px solid #eee;border-radius:0;box-shadow:none}
   .topbar{position:fixed;top:var(--safe-top,0px);left:0;right:0;z-index:30}       // 吸顶
   .top-title{font-family:Georgia,serif;letter-spacing:.22em;color:#c58ea0}        // 标题字体/颜色
   .top-btn{color:#c58ea0}                                                          // 按钮颜色
   #backBtn{display:none}                                                           // 隐藏返回
   #settingsBtn{background:url("https://你的图标.png") center/22px no-repeat}        // 换设置图标
   #settingsBtn svg{opacity:0}                                                      // 换图后隐藏原 svg
   .topbar::before{content:url("https://顶栏图.png");position:absolute;inset:0;z-index:-1;opacity:.35}  // 顶栏铺图覆盖
   */

/* ── 2. 卡片区 .message ───────────────────────────────────────
   一条消息 = article.message，内部元素：
     .message-head > .diary-title      顶部 Diary 条
     .identity-row > button.avatar      头像（点它 = 切换心声）
                     > .nickname        昵称
     .heart-state   心声（.message.show-heart 时才显示）
     .thinking      思维链（.message.show-thinking 时才显示）
     .content[data-role=content]        正文
     .time-row > .clock-icon            时间
     .plot-area > .plot-toggle + .plot-options > .plot-opt   推荐剧情
     .actions > .action(编辑/删除) + .action.more-action      卡片底栏
     .more-menu > [data-action=thinking] / [data-action=select]
   (A) 去掉 Diary 卡片包裹、完全重构：
       .message-head{display:none}
       .message{background:transparent;border:0;box-shadow:none;padding:0}
       .message .content{background:#fff;border-radius:18px;padding:16px;box-shadow:0 6px 20px rgba(0,0,0,.05)}
   (B) 头像单独移出、移到任意地方（.identity-row 已是 relative）：
       .message{position:relative}
       .identity-row .avatar{position:absolute;right:18px;top:-42px;left:auto;width:64px;height:64px}
       // 想钉在屏幕某处：position 改 fixed，left/top 填像素
   (C) 加头像框 / 圆角 / 光环：
       .identity-row .avatar{border:3px solid #e7cdd6;border-radius:20px;box-shadow:0 0 0 4px rgba(231,205,214,.35)}
   (D) 重写卡片样式（颜色/形状/描边）：
       .message{background:#fffdfd;border:1px solid #efe3e6;border-radius:22px;box-shadow:0 8px 24px rgba(120,90,100,.06)}
   (E) 卡片底栏（编辑/删除/更多）移动 / 美化 / 打包：
       .actions{position:absolute;right:14px;bottom:14px;gap:4px;background:#f7f0f2;border-radius:999px;padding:4px 6px}
       .actions .action span{display:none}                    // 只留图标
       .actions .action{color:#b98a9a}
       // 想挪到底部中间：.actions{left:0;right:0;justify-content:center}
   (F) 心声 / 思维链：触发方式 + 单独美化框
       // 默认触发：点头像切换「心声」；「更多 → 显示/隐藏思维链」切换「思维链」。
       .heart-state,.thinking{background:#fff7fa;border:1px solid #f0d7e0;border-radius:14px;padding:10px 12px;color:#a87b8b}
       .message.show-heart .heart-state{display:block}
       .message.show-thinking .thinking{display:block}
       .heart-state::before{content:"♥ ";color:#e08fb0}       // 给心声加小图标/标题
       .message{cursor:pointer}                                 // 让整卡看起来可点
       // 注意：点击「触发逻辑」是 JS，纯 CSS 改不了；要换触发点/新按键需加 JS（可让纳米帮你加）。
   (G) 推荐剧情样式 / 颜色：
       .plot-toggle{background:#f6eef1;color:#a87b8b;border-radius:999px;padding:6px 14px}
       .plot-options{gap:8px}
       .plot-opt{background:#fff;border:1px solid #f0d7e0;border-radius:12px;color:#7a6a70}
       .plot-opt:hover{background:#fbeef3}
   */

/* ── 3. 底栏 .bottom ──────────────────────────────────────────
   结构：.bottom > .composer > .round-btn(#rerollBtn 重roll) + .input + .round-btn.send(#sendBtn)
   可改：整体样式、按钮位置/顺序/颜色/图标、加装饰插件。
   .bottom{background:#fff;border-top:1px solid #eee}
   .composer{background:#f6f2f3;border:0;border-radius:18px;padding:6px 8px}
   .round-btn{color:#b98a9a}
   .round-btn.send{background:#c58ea0;color:#fff}
   .composer{display:flex;flex-direction:row-reverse}          // 调换按钮左右
   #rerollBtn svg{opacity:0}
   #rerollBtn{background:url("https://重roll.png") center/20px no-repeat}   // 换图标
   #sendBtn svg{opacity:0}
   #sendBtn{background:url("https://发送.png") center/20px no-repeat}
   // 加「装饰性」插件（纯 CSS 只能加不可点的装饰；真正的新功能需加 HTML/JS，可让纳米帮你加）：
   .composer::before{content:"";width:36px;height:36px;border-radius:50%;align-self:center;margin-right:6px;background:#eee url("https://图标.png") center/16px no-repeat}
   */

/* ── 4. 其它：颜色 / 图标 / 字体 ──────────────────────────────
   · 全局配色：改最下面的 :root 变量（--page 背景 / --card 卡片 / --ink 文字 / --pink-deep 点缀 …）
   · 整页背景图：body{background:url("https://背景.png") center/cover fixed}
   · 换任意按钮图标：给该按钮加 background-image，并让其 svg 透明度设为 0（见上）
   · 字体：body,.content{font-family:"你的字体",serif}
   */

/* ── 5. 进阶：几个常见需求怎么改 ──────────────────────────────
   (1) 把头像「提出卡片」、独立于卡片之外 / 任意位置：
       卡片 = .message；头像 = .identity-row .avatar。
       .message{position:relative;overflow:visible}                 /* 卡片可定位，别 hidden */
       .identity-row .avatar{position:absolute;left:-22px;top:14px;z-index:5}   /* 挪到卡片外 */
       /* 想完全脱离卡片、钉在屏幕：position 改 fixed，left/top 填像素 */
       .identity-row{padding-left:8px}                              /* 提走后给昵称留点空 */
       /* 注意：聊天滚动区 .chat 是 overflow:auto，会裁掉超出「内边距」的部分；
          想让头像「完全」移到卡片外还看得见，给它留出空间：
          .chat{padding-left:26px;padding-right:26px}  然后把头像 left/top 调小一点即可。 */
       /* 头像框（URL 图片框，最省事）：.identity-row .avatar::after{content:url("https://框.png");position:absolute;inset:-8px;width:calc(100% + 16px);height:calc(100% + 16px);border:0;pointer-events:none} */
   (2) 完全重构「剧情 / 小剧场」切换 tab（.scene-tabs）：
       .scene-tabs{display:flex;gap:8px;padding:10px 16px;background:transparent}
       .scene-tab{border:0;border-radius:999px;padding:8px 18px;background:#efe7e9;color:#7a6a70;font-weight:600}
       .scene-tab.active{background:#c58ea0;color:#fff}
       /* 想换成分段控件 / 下划线 / 竖排：改 .scene-tabs 布局与 .scene-tab 样式即可 */
   (3) 给头像加头像框并完美适配：
       .identity-row .avatar{position:relative;overflow:visible}
       .identity-row .avatar::after{
         content:"";position:absolute;inset:-6px;border-radius:inherit;
         border:2px solid #e7cdd6;pointer-events:none;              /* 框比头像大一圈，且不挡点按 */
       }
       /* 图片框：content:url("https://框.png");width:calc(100% + 12px);height:calc(100% + 12px);border:0 */
   (4) 修改「设置页」的配色：
       设置页不吃这里的美化 CSS（否则会改坏它的按钮）。它自己的变量在 css/offline-setting.css 顶部：
         --paper 背景 / --ink 主文字 / --sub 次要文字 / --line 分割线 / --accent 强调色
       要改设置页颜色，改这几个 :root 变量即可（纯颜色安全；别改它的尺寸/布局）。
   (5) 把顶栏改成「悬浮」又不影响点击的安全写法：
       .topbar{
         position:fixed;top:0;left:0;right:0;z-index:40;
         height:calc(64px + var(--safe-top,0px));padding-top:var(--safe-top,0px);
         display:flex;align-items:center;justify-content:space-between;   /* 必须保留 flex */
         background:rgba(255,255,255,.8);backdrop-filter:blur(20px);
       }
       .topbar .top-title{flex:1;min-width:0;pointer-events:none}          /* 标题不挡点击 */
       .topbar .top-btn{flex:0 0 auto;width:50px;height:50px}              /* 按钮固定尺寸 */
       .chat{padding-top:calc(74px + var(--safe-top,0px))}                  /* 给悬浮顶栏留位 */
       /* 关键：悬浮后务必保留 display:flex 并给按钮固定尺寸；
          否则按钮会被拉成整条，点哪儿都像点到了返回。 */
   */
:root{
  --page:#f5f0f0;
  --card:#f7f2f3;
  --header:#f0eaea;
  --line:#e5ddde;
  --line-strong:#d9cfd0;
  --ink:#3d3536;
  --muted:#b0a2a4;
  --pink:#dcc8cb;
  --pink-deep:#bca8ab;
  --gray-pink:#e8dfe0;
  --shadow:0 5px 18px rgba(80,65,68,.05);
  --danger:#c28388;
}
body{background:var(--page);color:var(--ink)}
.chat{background:var(--page)}
/* 顶栏 */
.topbar{background:rgba(248,243,244,.92);color:var(--ink)}
.top-title{color:var(--ink)}
/* 卡片 */
.message{background:var(--card);border-color:var(--line-strong);box-shadow:var(--shadow)}
.message-head{background:linear-gradient(var(--header),var(--gray-pink));border-bottom:1px solid var(--line)}
.diary-title{color:var(--pink-deep)}
.identity-row{background:transparent;position:relative}
.nickname{color:var(--ink)}
.content{color:var(--ink)}
/* 底栏：重roll / 输入栏 / 发送 */
.bottom{background:var(--header);border-top:1px solid var(--line)}
.composer{background:var(--card);border:1px solid var(--line-strong)}
.input{color:var(--ink)}
.round-btn{color:var(--ink)}
.round-btn.send{background:var(--pink-deep);color:#fff}
/* 场景切换 */
.scene-tabs{background:transparent}
`;

const BUILTIN_CSS = {
  soft: `:root{--page:#f7f4f5;--card:#fffdfd;--header:#fbf6f7;--line:#f1e7e9;--line-strong:#ead9dc;--ink:#40393b;--muted:#b5a8aa;--pink:#f3cdd4;--pink-deep:#e6b3bb;--gray-pink:#f1e6e8}body{background:var(--page)}.chat{background:var(--page)}.message{background:var(--card);border-color:var(--line-strong);box-shadow:0 5px 20px rgba(105,82,100,.06)}.topbar,.bottom{background:rgba(251,246,247,.92)}`,
  minimal: `:root{--page:#f0f1f3;--card:#fff;--header:#f6f7f8;--line:#e6e7ea;--line-strong:#d9dbe0;--ink:#2c2e32;--muted:#96989d;--pink:#e2e3e7;--pink-deep:#c9cbd2;--gray-pink:#eceef0}body{background:var(--page)}.chat{background:var(--page)}.message{background:var(--card);border-color:var(--line-strong);box-shadow:0 3px 14px rgba(30,35,40,.04)}.topbar,.bottom{background:rgba(246,247,248,.95)}`,
  mono: `:root{--page:#e8e8ea;--card:#fbfbfc;--header:#f0f0f2;--line:#e1e1e3;--line-strong:#d2d2d5;--ink:#2b2b2d;--muted:#98989b;--pink:#dedee0;--pink-deep:#c8c8cb;--gray-pink:#efeff0}body{background:var(--page)}.chat{background:var(--page)}.message{background:var(--card);border-color:var(--line-strong);box-shadow:0 3px 12px rgba(20,20,25,.05)}.topbar,.bottom{background:rgba(248,248,249,.96)}`,
  seablue: `:root{--page:#eaf3f9;--card:#fff;--header:#f2f8fc;--line:#dce9f1;--line-strong:#c8d9e6;--ink:#26303a;--muted:#86a0b1;--pink:#d8e8f2;--pink-deep:#b9d2e4;--gray-pink:#e4eef5}body{background:var(--page)}.chat{background:var(--page)}.message{background:var(--card);border-color:var(--line-strong);box-shadow:0 4px 16px rgba(50,90,120,.06)}.topbar,.bottom{background:rgba(244,250,254,.92)}`,
  mint: `:root{--page:#ecf5f0;--card:#fff;--header:#f2f8f5;--line:#deece5;--line-strong:#cddfd5;--ink:#26342c;--muted:#8aa893;--pink:#d6e8de;--pink-deep:#b8d8c7;--gray-pink:#e5efe9}body{background:var(--page)}.chat{background:var(--page)}.message{background:var(--card);border-color:var(--line-strong);box-shadow:0 4px 16px rgba(40,90,70,.06)}.topbar,.bottom{background:rgba(242,248,245,.92)}`,
  free: `/* 线下 · 自由排版（任意移动 / 隐藏文字 / 头像大小位置）
   变量：
     --msg-x / --msg-y      整条消息相对位置偏移
     --msg-width            消息宽度（默认 760px）
     --avatar-size          头像大小
     --avatar-x / --avatar-y 头像相对位置偏移
   隐藏文字：给对应元素加 display:none（把下面的注释取消即可）
*/
.message{
  --msg-x: 0px;
  --msg-y: 0px;
  --msg-width: 760px;
  --avatar-size: 46px;
  --avatar-x: 0px;
  --avatar-y: 0px;
  width: min(var(--msg-width), 100%);
  transform: translate(var(--msg-x), var(--msg-y));
}
.identity-row{ position: relative; }
.message .avatar{
  width: var(--avatar-size);
  height: var(--avatar-size);
  flex: 0 0 var(--avatar-size);
  transform: translate(var(--avatar-x), var(--avatar-y));
}
/* 想隐藏就取消注释：
.diary-title{ display: none; }
.nickname{ display: none; }
.time-row{ display: none; }
.role-label{ display: none; }
*/`
};

function escapeHTML(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c)); }

let toastTimer;
function showToast(t) {
  const x = document.getElementById('toast');
  x.textContent = t;
  x.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => x.classList.remove('show'), 1600);
}

// ============================================================
//  4. 渲染：规则管理
// ============================================================
function renderRules() {
  const container = document.getElementById('ruleContainer');
  if (!ruleGroups.length) {
    container.innerHTML = `<div class="no-result" style="padding:30px 0;">还没有规则组，点击「添加规则组」开始创建</div>`;
    return;
  }

  let html = '';
  ruleGroups.forEach((group, gi) => {
    const isExpanded = group.expanded !== false;
    const isEnabled = group.enabled !== false;
    const childCount = (group.rules || []).length;

    html += `<div class="rule-group-card" data-group-index="${gi}">`;
    html += `
      <div class="rule-group-header ${isExpanded ? 'expanded' : ''}" data-toggle-group="${gi}">
        <span class="drag-handle" data-drag-group="${gi}">⠿</span>
        <span class="expand-icon ${isExpanded ? 'rotated' : ''}">▶</span>
        <span class="group-name">${escapeHTML(group.name)} <span class="group-meta">(${childCount}条)</span></span>
        <div class="group-actions">
          <div class="switch ${isEnabled ? 'on' : ''}" data-toggle-group-switch="${gi}"><i></i></div>
          <button class="primary" data-edit-group="${gi}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 14.66V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5.34"/><polygon points="18 2 22 6 12 16 8 16 8 12 18 2"/></svg></button>
          <button class="danger" data-delete-group="${gi}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></button>
        </div>
      </div>
    `;

    html += `
      <div class="group-edit-panel" id="group-edit-${gi}">
        <div class="field"><label>规则组名称</label><input id="group-edit-name-${gi}" value="${escapeHTML(group.name)}"></div>
        <div class="edit-actions">
          <button class="save" data-group-save="${gi}">保存</button>
          <button class="cancel" data-group-cancel="${gi}">取消</button>
        </div>
      </div>
    `;

    html += `<div class="rule-children ${isExpanded ? 'open' : ''}" id="children-${gi}">`;
    const children = group.rules || [];
    if (children.length) {
      children.forEach((child, ci) => {
        const childEnabled = child.enabled !== false;
        html += `
          <div class="child-item" data-child="${gi}-${ci}">
            <span class="drag-handle" data-drag-child="${gi}-${ci}">⠿</span>
            <div class="child-info">
              <div class="child-name">${escapeHTML(child.name)}</div>
              <div class="child-preview">${escapeHTML((child.content || '').slice(0, 40))}${(child.content || '').length > 40 ? '...' : ''}</div>
            </div>
            <div class="child-actions">
              <div class="switch ${childEnabled ? 'on' : ''}" data-toggle-child="${gi}-${ci}"><i></i></div>
              <button class="primary" data-edit-child="${gi}-${ci}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 14.66V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5.34"/><polygon points="18 2 22 6 12 16 8 16 8 12 18 2"/></svg></button>
              <button class="danger" data-delete-child="${gi}-${ci}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="M6 6 18 18"/></svg></button>
            </div>
          </div>
        `;
        html += `
          <div class="edit-panel" id="child-edit-${gi}-${ci}">
            <div class="field"><label>名称</label><input id="child-edit-name-${gi}-${ci}" value="${escapeHTML(child.name)}"></div>
            <div class="field"><label>内容</label><textarea id="child-edit-content-${gi}-${ci}">${escapeHTML(child.content || '')}</textarea></div>
            <div class="edit-actions">
              <button class="save" data-child-save="${gi}-${ci}">保存</button>
              <button class="cancel" data-child-cancel="${gi}-${ci}">取消</button>
            </div>
          </div>
        `;
      });
    } else {
      html += `<div class="group-empty">暂无子规则，点击下方添加</div>`;
    }
    html += `
      <button class="add-child-btn" data-add-child="${gi}">+ 添加子规则</button>
    `;
    html += `</div></div>`;
  });

  container.innerHTML = html;
  bindRuleEvents();
}

// ============================================================
//  5. 规则事件绑定
// ============================================================
function bindRuleEvents() {
  document.querySelectorAll('[data-toggle-group]').forEach(el => {
    el.onclick = function(e) {
      if (e.target.closest('.group-actions')) return;
      const gi = parseInt(this.dataset.toggleGroup);
      ruleGroups[gi].expanded = !ruleGroups[gi].expanded;
      saveRules();
      renderRules();
    };
  });

  document.querySelectorAll('[data-toggle-group-switch]').forEach(el => {
    el.onclick = function(e) {
      e.stopPropagation();
      const gi = parseInt(this.dataset.toggleGroupSwitch);
      ruleGroups[gi].enabled = !ruleGroups[gi].enabled;
      saveRules();
      renderRules();
      updateSummary();
    };
  });

  document.querySelectorAll('[data-edit-group]').forEach(el => {
    el.onclick = function(e) {
      e.stopPropagation();
      const gi = parseInt(this.dataset.editGroup);
      const panel = document.getElementById(`group-edit-${gi}`);
      panel.classList.toggle('open');
      if (panel.classList.contains('open')) {
        document.getElementById(`group-edit-name-${gi}`).value = ruleGroups[gi].name;
      }
    };
  });

  document.querySelectorAll('[data-group-save]').forEach(el => {
    el.onclick = function() {
      const gi = parseInt(this.dataset.groupSave);
      const name = document.getElementById(`group-edit-name-${gi}`).value.trim();
      if (!name) { showToast('请输入名称'); return; }
      ruleGroups[gi].name = name;
      saveRules();
      renderRules();
      updateSummary();
      showToast('已更新组名');
    };
  });

  document.querySelectorAll('[data-group-cancel]').forEach(el => {
    el.onclick = function() {
      const gi = parseInt(this.dataset.groupCancel);
      document.getElementById(`group-edit-${gi}`).classList.remove('open');
    };
  });

  document.querySelectorAll('[data-delete-group]').forEach(el => {
    el.onclick = function(e) {
      e.stopPropagation();
      const gi = parseInt(this.dataset.deleteGroup);
      if (!confirm(`删除规则组 "${ruleGroups[gi].name}" 及其所有子规则？`)) return;
      ruleGroups.splice(gi, 1);
      saveRules();
      renderRules();
      updateSummary();
      showToast('已删除');
    };
  });

  document.querySelectorAll('[data-add-child]').forEach(el => {
    el.onclick = function() {
      const gi = parseInt(this.dataset.addChild);
      if (!ruleGroups[gi].rules) ruleGroups[gi].rules = [];
      ruleGroups[gi].rules.push({
        id: generateId(),
        name: '新规则',
        content: '请输入规则内容',
        enabled: true
      });
      saveRules();
      ruleGroups[gi].expanded = true;
      renderRules();
      updateSummary();
      showToast('已添加子规则');
    };
  });

  document.querySelectorAll('[data-toggle-child]').forEach(el => {
    el.onclick = function(e) {
      e.stopPropagation();
      const [gi, ci] = this.dataset.toggleChild.split('-').map(Number);
      ruleGroups[gi].rules[ci].enabled = !ruleGroups[gi].rules[ci].enabled;
      saveRules();
      renderRules();
      updateSummary();
    };
  });

  document.querySelectorAll('[data-edit-child]').forEach(el => {
    el.onclick = function(e) {
      e.stopPropagation();
      const [gi, ci] = this.dataset.editChild.split('-').map(Number);
      const panel = document.getElementById(`child-edit-${gi}-${ci}`);
      const isOpen = panel.classList.contains('open');
      document.querySelectorAll('.edit-panel').forEach(p => p.classList.remove('open'));
      if (!isOpen) {
        panel.classList.add('open');
        document.getElementById(`child-edit-name-${gi}-${ci}`).value = ruleGroups[gi].rules[ci].name;
        document.getElementById(`child-edit-content-${gi}-${ci}`).value = ruleGroups[gi].rules[ci].content || '';
        panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };
  });

  document.querySelectorAll('[data-child-save]').forEach(el => {
    el.onclick = function() {
      const [gi, ci] = this.dataset.childSave.split('-').map(Number);
      const name = document.getElementById(`child-edit-name-${gi}-${ci}`).value.trim();
      const content = document.getElementById(`child-edit-content-${gi}-${ci}`).value.trim();
      if (!name) { showToast('请输入名称'); return; }
      ruleGroups[gi].rules[ci].name = name;
      ruleGroups[gi].rules[ci].content = content;
      saveRules();
      renderRules();
      updateSummary();
      showToast('已保存');
    };
  });

  document.querySelectorAll('[data-child-cancel]').forEach(el => {
    el.onclick = function() {
      const [gi, ci] = this.dataset.childCancel.split('-').map(Number);
      document.getElementById(`child-edit-${gi}-${ci}`).classList.remove('open');
    };
  });

  document.querySelectorAll('[data-delete-child]').forEach(el => {
    el.onclick = function(e) {
      e.stopPropagation();
      const [gi, ci] = this.dataset.deleteChild.split('-').map(Number);
      if (!confirm(`删除子规则 "${ruleGroups[gi].rules[ci].name}"？`)) return;
      ruleGroups[gi].rules.splice(ci, 1);
      saveRules();
      renderRules();
      updateSummary();
      showToast('已删除');
    };
  });

  let dragGroupSrc = null;
  document.querySelectorAll('[data-drag-group]').forEach(el => {
    el.draggable = true;
    el.addEventListener('dragstart', function(e) {
      dragGroupSrc = parseInt(this.dataset.dragGroup);
      this.style.opacity = '0.3';
      e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragend', function() { this.style.opacity = '1'; });
    el.addEventListener('dragover', function(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
    el.addEventListener('drop', function(e) {
      e.preventDefault();
      if (dragGroupSrc !== null && dragGroupSrc !== parseInt(this.dataset.dragGroup)) {
        const from = dragGroupSrc;
        const to = parseInt(this.dataset.dragGroup);
        const [moved] = ruleGroups.splice(from, 1);
        ruleGroups.splice(to, 0, moved);
        saveRules();
        renderRules();
        updateSummary();
        showToast('已移动');
      }
      dragGroupSrc = null;
    });
  });

  let dragChildSrc = null;
  document.querySelectorAll('[data-drag-child]').forEach(el => {
    el.draggable = true;
    el.addEventListener('dragstart', function(e) {
      dragChildSrc = this.dataset.dragChild;
      this.style.opacity = '0.3';
      e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragend', function() { this.style.opacity = '1'; });
    el.addEventListener('dragover', function(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
    el.addEventListener('drop', function(e) {
      e.preventDefault();
      if (!dragChildSrc || dragChildSrc === this.dataset.dragChild) return;
      const [fromGi, fromCi] = dragChildSrc.split('-').map(Number);
      const [toGi, toCi] = this.dataset.dragChild.split('-').map(Number);
      if (fromGi !== toGi) { showToast('不能跨组移动'); return; }
      const [moved] = ruleGroups[fromGi].rules.splice(fromCi, 1);
      ruleGroups[toGi].rules.splice(toCi, 0, moved);
      saveRules();
      renderRules();
      updateSummary();
      showToast('已移动');
      dragChildSrc = null;
    });
  });
}

// ============================================================
//  6. 全局规则操作
// ============================================================
document.getElementById('addGroupBtn').onclick = function() {
  ruleGroups.push({
    id: generateId(),
    name: '新规则组',
    enabled: true,
    expanded: true,
    rules: []
  });
  saveRules();
  renderRules();
  updateSummary();
  showToast('已添加规则组');
};

document.getElementById('expandAllBtn').onclick = function() {
  const allExpanded = ruleGroups.every(g => g.expanded !== false);
  ruleGroups.forEach(g => g.expanded = !allExpanded);
  saveRules();
  renderRules();
  showToast(allExpanded ? '全部折叠' : '全部展开');
};

document.getElementById('enableAllBtn').onclick = function() {
  const allEnabled = ruleGroups.every(g => g.enabled !== false) && ruleGroups.every(g => (g.rules || []).every(r => r.enabled !== false));
  ruleGroups.forEach(g => {
    g.enabled = !allEnabled;
    (g.rules || []).forEach(r => r.enabled = !allEnabled);
  });
  saveRules();
  renderRules();
  updateSummary();
  showToast(allEnabled ? '全部禁用' : '全部启用');
};

document.getElementById('deleteAllBtn').onclick = function() {
  if (!ruleGroups.length) { showToast('没有可清空的内容'); return; }
  if (!confirm('确定清空所有规则组及子规则？此操作不可恢复！')) return;
  ruleGroups = [];
  saveRules();
  renderRules();
  updateSummary();
  showToast('已清空所有规则');
};

// ============================================================
//  7. 导入 / 导出
// ============================================================
document.getElementById('importFile').addEventListener('change', async function(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    let text = '';
    if (file.name.toLowerCase().endsWith('.json')) {
      text = await file.text();
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        const imported = data.map(g => ({
          ...g,
          id: g.id || generateId(),
          enabled: g.enabled !== false,
          expanded: g.expanded !== false,
          rules: (g.rules || []).map(r => ({
            ...r,
            id: r.id || generateId(),
            enabled: r.enabled !== false
          }))
        }));
        ruleGroups = imported;
        saveRules();
        renderRules();
        updateSummary();
        showToast(`导入成功：${ruleGroups.length} 个规则组`);
      } else {
        showToast('JSON 格式错误：需要数组');
      }
    } else if (file.name.toLowerCase().endsWith('.txt') || file.name.toLowerCase().endsWith('.docx')) {
      if (file.name.toLowerCase().endsWith('.docx')) {
        if (!window.mammoth) {
          await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js';
            s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
          });
        }
        const buf = await file.arrayBuffer();
        const result = await window.mammoth.extractRawText({ arrayBuffer: buf });
        text = result.value || '';
      } else {
        text = await file.text();
      }
      const lines = text.split('\n').filter(line => line.trim());
      if (lines.length) {
        const group = {
          id: generateId(),
          name: file.name.replace(/\.[^.]+$/, ''),
          enabled: true,
          expanded: true,
          rules: lines.map(line => ({
            id: generateId(),
            name: line.slice(0, 20) + (line.length > 20 ? '...' : ''),
            content: line.trim(),
            enabled: true
          }))
        };
        ruleGroups.push(group);
        saveRules();
        renderRules();
        updateSummary();
        showToast(`导入成功：${lines.length} 条规则`);
      } else {
        showToast('文件为空');
      }
    } else {
      showToast('不支持的文件格式');
    }
  } catch (err) {
    console.error(err);
    showToast('导入失败：' + err.message);
  }
  e.target.value = '';
});

document.getElementById('exportBtn').onclick = function() {
  if (!ruleGroups.length) { showToast('没有可导出的内容'); return; }
  const data = JSON.stringify(ruleGroups, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'rules-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('导出成功');
};

// ============================================================
//  8. 文风管理
// ============================================================
function populateStylePresets() {
  const sel = document.getElementById('stylePresetSelect');
  sel.innerHTML = '<option value="">-- 选择预设 --</option>' + stylePresets.map((p, i) => `<option value="${i}">${escapeHTML(p.name)}</option>`).join('');
}

document.getElementById('stylePresetSave').onclick = function() {
  const name = document.getElementById('stylePresetName').value.trim();
  const content = document.getElementById('styleText').value.trim();
  if (!name) { showToast('请输入预设名称'); return; }
  stylePresets.push({ name, content });
  saveStylePresets();
  populateStylePresets();
  showToast('文风预设已保存');
};

document.getElementById('stylePresetUpdate').onclick = function() {
  const idx = document.getElementById('stylePresetSelect').value;
  if (idx === '') { showToast('请先选择一个预设'); return; }
  const name = document.getElementById('stylePresetName').value.trim();
  const content = document.getElementById('styleText').value.trim();
  if (!name) { showToast('请输入预设名称'); return; }
  stylePresets[parseInt(idx)] = { name, content };
  saveStylePresets();
  populateStylePresets();
  showToast('文风预设已更新');
};

document.getElementById('stylePresetDelete').onclick = function() {
  const idx = document.getElementById('stylePresetSelect').value;
  if (idx === '') { showToast('请先选择一个预设'); return; }
  if (!confirm('删除此文风预设？')) return;
  stylePresets.splice(parseInt(idx), 1);
  saveStylePresets();
  populateStylePresets();
  showToast('已删除');
};

document.getElementById('stylePresetSelect').onchange = function() {
  const idx = this.value;
  if (idx === '') {
    document.getElementById('styleText').value = settings.style || '';
    document.getElementById('stylePresetName').value = '';
    return;
  }
  const p = stylePresets[parseInt(idx)];
  document.getElementById('styleText').value = p.content || '';
  document.getElementById('stylePresetName').value = p.name || '';
};

// ============================================================
//  8.5 思维链预设（COT）管理
// ============================================================
function populateCotPresets() {
  const sel = document.getElementById('cotPresetSelect');
  if (!sel) return;
  sel.innerHTML = '<option value="">-- 选择预设 --</option>' + cotPresets.map((p, i) => `<option value="${i}">${escapeHTML(p.name)}</option>`).join('');
}

document.getElementById('cotPresetSave').onclick = function() {
  const name = document.getElementById('cotPresetName').value.trim();
  const content = document.getElementById('cotText').value.trim();
  if (!name) { showToast('请输入预设名称'); return; }
  cotPresets.push({ name, content });
  saveCotPresets();
  populateCotPresets();
  showToast('思维链预设已保存');
};

document.getElementById('cotPresetUpdate').onclick = function() {
  const idx = document.getElementById('cotPresetSelect').value;
  if (idx === '') { showToast('请先选择一个预设'); return; }
  const name = document.getElementById('cotPresetName').value.trim();
  const content = document.getElementById('cotText').value.trim();
  if (!name) { showToast('请输入预设名称'); return; }
  cotPresets[parseInt(idx)] = { name, content };
  saveCotPresets();
  populateCotPresets();
  showToast('思维链预设已更新');
};

document.getElementById('cotPresetDelete').onclick = function() {
  const idx = document.getElementById('cotPresetSelect').value;
  if (idx === '') { showToast('请先选择一个预设'); return; }
  if (!confirm('删除此思维链预设？')) return;
  cotPresets.splice(parseInt(idx), 1);
  saveCotPresets();
  populateCotPresets();
  showToast('已删除');
};

document.getElementById('cotPresetSelect').onchange = function() {
  const idx = this.value;
  if (idx === '') {
    document.getElementById('cotText').value = settings.cot || '';
    document.getElementById('cotPresetName').value = '';
    return;
  }
  const p = cotPresets[parseInt(idx)];
  document.getElementById('cotText').value = p.content || '';
  document.getElementById('cotPresetName').value = p.name || '';
};

// ============================================================
//  9. 美化管理
// ============================================================
function populateCssPresets() {
  const sel = document.getElementById('cssPreset');
  const current = sel.value;
  sel.innerHTML = '<option value="initial">初始 CSS</option><option value="soft">Soft Pink</option><option value="minimal">Minimal Gray</option><option value="mono">黑白灰</option><option value="seablue">蓝白</option><option value="mint">清新绿</option><option value="custom">当前 CSS</option>';
  cssPresets.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = 'user-' + i;
    opt.textContent = '📁 ' + p.name;
    sel.appendChild(opt);
  });
  if (current) sel.value = current;
}

document.getElementById('cssPresetSave').onclick = function() {
  const name = document.getElementById('cssPresetName').value.trim();
  const content = document.getElementById('cssText').value.trim();
  if (!name) { showToast('请输入预设名称'); return; }
  cssPresets.push({ name, content });
  saveCssPresets();
  populateCssPresets();
  showToast('CSS预设已保存');
};

document.getElementById('cssPresetUpdate').onclick = function() {
  const sel = document.getElementById('cssPreset');
  const val = sel.value;
  if (!val.startsWith('user-')) { showToast('请选择用户预设进行修改'); return; }
  const idx = parseInt(val.replace('user-', ''));
  const name = document.getElementById('cssPresetName').value.trim();
  const content = document.getElementById('cssText').value.trim();
  if (!name) { showToast('请输入预设名称'); return; }
  cssPresets[idx] = { name, content };
  saveCssPresets();
  populateCssPresets();
  showToast('CSS预设已更新');
};

document.getElementById('cssPresetDelete').onclick = function() {
  const sel = document.getElementById('cssPreset');
  const val = sel.value;
  if (!val.startsWith('user-')) { showToast('请选择用户预设进行删除'); return; }
  const idx = parseInt(val.replace('user-', ''));
  if (!confirm('删除此CSS预设？')) return;
  cssPresets.splice(idx, 1);
  saveCssPresets();
  populateCssPresets();
  showToast('已删除');
};

document.getElementById('cssPreset').onchange = function() {
  const val = this.value;
  if (val === 'initial') { document.getElementById('cssText').value = INITIAL_CSS; document.getElementById('cssPresetName').value = ''; return; }
  if (val === 'soft') { document.getElementById('cssText').value = BUILTIN_CSS.soft; document.getElementById('cssPresetName').value = ''; return; }
  if (val === 'minimal') { document.getElementById('cssText').value = BUILTIN_CSS.minimal; document.getElementById('cssPresetName').value = ''; return; }
  if (val === 'mono') { document.getElementById('cssText').value = BUILTIN_CSS.mono; document.getElementById('cssPresetName').value = ''; return; }
  if (val === 'seablue') { document.getElementById('cssText').value = BUILTIN_CSS.seablue; document.getElementById('cssPresetName').value = ''; return; }
  if (val === 'mint') { document.getElementById('cssText').value = BUILTIN_CSS.mint; document.getElementById('cssPresetName').value = ''; return; }
  if (val === 'free') { document.getElementById('cssText').value = BUILTIN_CSS.free; document.getElementById('cssPresetName').value = ''; return; }
  if (val === 'custom') { document.getElementById('cssText').value = settings.customCSS || ''; document.getElementById('cssPresetName').value = ''; return; }
  if (val.startsWith('user-')) {
    const idx = parseInt(val.replace('user-', ''));
    const p = cssPresets[idx];
    if (p) { document.getElementById('cssText').value = p.content || ''; document.getElementById('cssPresetName').value = p.name || ''; }
  }
};

document.getElementById('clearCssBtn').onclick = function() { document.getElementById('cssText').value = ''; applyCssPreview(''); showToast('已清空CSS'); };
document.getElementById('cssExport').onclick = function() {
  const sel = document.getElementById('cssPreset');
  const val = sel ? sel.value : 'custom';
  let name = document.getElementById('cssPresetName').value.trim() || '线下美化';
  let css = document.getElementById('cssText').value;
  if (val && val.startsWith('user-')) {
    const idx = parseInt(val.replace('user-', ''));
    const p = cssPresets[idx];
    if (p) { name = p.name || name; css = p.content || css; }
  }
  const data = JSON.stringify({ type: 'offline', name: name, css: css }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name.replace(/[\\/:*?"<>|]/g, '_') + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('已导出预设：' + name);
};
document.getElementById('applyCss').onclick = function() {
  settings.customCSS = document.getElementById('cssText').value;
  saveSettings();
  updateSummary();
  // 只在预览 iframe 内套用，绝不注入到设置页本身（否则会改掉设置页自己的按钮/顶栏）
  renderCssPreview(settings.customCSS);
  showToast('CSS已应用');
};

document.getElementById('copyTemplate').onclick = async function() {
  try {
    await navigator.clipboard.writeText(INITIAL_CSS);
    showToast('已复制初始模板到剪贴板');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = INITIAL_CSS;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('已复制初始模板');
  }
};

document.getElementById('restoreCss').onclick = function() {
  document.getElementById('cssText').value = INITIAL_CSS;
  applyCssPreview(INITIAL_CSS);
  showToast('已恢复默认');
};

// ============================================================
//  10. 文档导入
// ============================================================
async function readDocument(file) {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.txt') || lower.endsWith('.css')) return await file.text();
  if (lower.endsWith('.json')) {
    const text = await file.text();
    try {
      const parsed = JSON.parse(text);
      return (typeof parsed === 'string') ? parsed : (parsed.css || parsed.code || text);
    } catch { return text; }
  }
  if (lower.endsWith('.docx')) {
    if (!window.mammoth) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    const buf = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer: buf });
    return result.value || '';
  }
  throw new Error('不支持的文件类型');
}

async function bindDocImport(inputId, textId, nameId) {
  document.getElementById(inputId).addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await readDocument(file);
      document.getElementById(textId).value = text;
      document.getElementById(nameId).textContent = file.name;
      showToast('文档已导入');
    } catch (err) {
      console.error(err);
      showToast('文档读取失败');
    }
  });
}
bindDocImport('styleFile', 'styleText', 'styleFileName');
bindDocImport('cssFile', 'cssText', 'cssFileName');
bindDocImport('cotFile', 'cotText', 'cotFileName');

// ============================================================
//  11. 记录搜索
// ============================================================
async function getMessages() {
  try {
    const data = await getStoreData('messages');
    // 有当前会话时只取该会话的记录，避免“查别人也查到自己/所有人”
    if (!CURRENT_CHAT) return data;
    return data.filter(m => m && ((m.chatId || '') === CURRENT_CHAT));
  } catch { return []; }
}

let searchExpanded = false;

function renderSearch() {
  const q = document.getElementById('recordSearch').value.trim().toLowerCase();
  const box = document.getElementById('recordResults');
  if (!searchExpanded) { box.classList.remove('open'); return; }
  getMessages().then(records => {
    if (!searchExpanded) { box.classList.remove('open'); return; }
    const list = q ? records.filter(m => (m.content || '').toLowerCase().includes(q) || (m.name || '').toLowerCase().includes(q)) : [];
    box.classList.add('open');
    if (!q) { box.innerHTML = '<div class="no-result">输入关键词开始搜索</div>'; return; }
    box.innerHTML = list.length ? list.map((m, idx) =>
      `<div class="result-item" data-msgidx="${idx}">
        <div class="result-role">${escapeHTML(m.name || (m.role === 'user' ? 'user' : 'char'))}</div>
        <div class="result-text">${escapeHTML((m.content || '').slice(0, 200))}${(m.content || '').length > 200 ? '...' : ''}</div>
      </div>`
    ).join('') : '<div class="no-result">没有找到匹配记录</div>';
    
    box.querySelectorAll('.result-item').forEach(el => {
      el.onclick = function() {
        const idx = this.dataset.msgidx;
        localStorage.setItem('offline-scroll-to', idx);
        location.href = 'offline.html';
      };
    });
  });
}

document.getElementById('findRecords').onclick = function() {
  const box = document.getElementById('recordSearchBox');
  const results = document.getElementById('recordResults');
  searchExpanded = !searchExpanded;
  if (searchExpanded) {
    box.classList.add('open');
    results.classList.add('open');
    document.getElementById('recordSearch').focus();
    renderSearch();
  } else {
    box.classList.remove('open');
    results.classList.remove('open');
  }
};

document.getElementById('recordSearch').addEventListener('input', renderSearch);

// ============================================================
//  12. 清空记录
// ============================================================
const modal = document.getElementById('modalBg');
document.getElementById('clearRecords').onclick = function() { modal.classList.add('open'); };
document.getElementById('modalCancel').onclick = function() { modal.classList.remove('open'); };

async function collectOfflineMessageCids() {
  try {
    const db = await memOpenDb('MeetSettingsDB', 1, ['messages']);
    const all = await new Promise(function(resolve) {
      const r = db.transaction('messages', 'readonly').objectStore('messages').getAll();
      r.onsuccess = function() { resolve(r.result || []); };
      r.onerror = function() { resolve([]); };
    });
    const set = {};
    all.forEach(function(m) { if (m && (m.role === 'user' || m.role === 'assistant') && (m.scene || 'story') === 'story') set[m.chatId || 'general'] = true; });
    return Object.keys(set);
  } catch (e) { return []; }
}

async function clearOfflineMemoriesForCids(cids) {
  if (!cids || !cids.length) return;
  try {
    const vdb = await memOpenDb('nano_vector_memory_db', 5, ['config']);
    for (const cid of cids) {
      const rec = await new Promise(function(resolve) {
        const g = vdb.transaction('config', 'readonly').objectStore('config').get('memlist_' + cid);
        g.onsuccess = function() { resolve(g.result ? g.result.value : null); };
        g.onerror = function() { resolve(null); };
      });
      const list = (rec && Array.isArray(rec)) ? rec : [];
      const filtered = list.filter(function(it) { return !(it && it.chatId === cid && it.type === '长期记忆'); });
      await new Promise(function(resolve) {
        vdb.transaction('config', 'readwrite').objectStore('config').put({ key: 'memlist_' + cid, value: filtered });
        resolve();
      });
    }
  } catch (e) { console.warn('清理线下记忆失败', e); }
}

async function deleteMessagesForChat(cid) {
  if (!cid) { await clearStore('messages'); return; }
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');
    const cur = store.openCursor();
    cur.onsuccess = (e) => {
      const c = e.target.result;
      if (c) {
        const v = c.value;
        if (v && (v.chatId || '') === cid) c.delete();
        c.continue();
      } else {
        resolve();
      }
    };
    cur.onerror = () => resolve();
  });
}

document.getElementById('modalConfirm').onclick = async function() {
  let cids;
  if (CURRENT_CHAT) {
    cids = [CURRENT_CHAT];
    await deleteMessagesForChat(CURRENT_CHAT);
  } else {
    cids = await collectOfflineMessageCids();
    await clearStore('messages');
  }
  await clearOfflineMemoriesForCids(cids);
  modal.classList.remove('open');
  document.getElementById('recordResults').classList.remove('open');
  document.getElementById('recordSearchBox').classList.remove('open');
  searchExpanded = false;
  showToast('记录与相关记忆已清空');
};
modal.onclick = function(e) { if (e.target === modal) modal.classList.remove('open'); };

// ============================================================
//  13. 更新摘要 & 填充设置
// ============================================================
function updateSummary() {
  const activeCount = ruleGroups.filter(g => g.enabled !== false).length;
  const totalRules = ruleGroups.reduce((sum, g) => sum + (g.rules || []).length, 0);
  document.getElementById('rulesValue').textContent = ruleGroups.length ? `${activeCount}组/${totalRules}条` : '未设置';
  document.getElementById('styleValue').textContent = settings.style ? settings.style.slice(0, 20) : '未设置';
  const cotValEl = document.getElementById('cotValue');
  if (cotValEl) cotValEl.textContent = settings.cot ? settings.cot.slice(0, 20) : '未设置';
  document.getElementById('cssValue').textContent = settings.customCSS ? '已自定义' : '默认';
  document.getElementById('wordCount').value = settings.wordCount || '';
  document.getElementById('person').value = settings.person || 'auto';
  { const mt = document.getElementById('maxTokens'); if (mt) mt.value = settings.maxTokens || ''; }
  const nsfwSwitch = document.getElementById('nsfwSwitch');
  if (nsfwSwitch) nsfwSwitch.classList.toggle('on', settings.nsfw === true);
}

function fillSettings() {
  document.getElementById('styleText').value = settings.style || '';
  const cotTextEl = document.getElementById('cotText');
  if (cotTextEl) cotTextEl.value = settings.cot || '';
  document.getElementById('cssText').value = settings.customCSS || '';
  document.getElementById('wordCount').value = settings.wordCount || '';
  document.getElementById('person').value = settings.person || 'auto';
  const mt = document.getElementById('memThresholdInput');
  if (mt) mt.value = settings.memThreshold || localStorage.getItem('offline_mem_threshold') || '5';
  updateSummary();
  populateStylePresets();
  populateCotPresets();
  populateCssPresets();
}

// ============================================================
//  14. Sheet 控制
// ============================================================
function openSheet(id) { document.getElementById(id).classList.add('open'); }
function closeSheet(id) { document.getElementById(id).classList.remove('open'); }

document.getElementById('rulesOpen').onclick = function() {
  renderRules();
  openSheet('rulesSheet');
};

document.getElementById('styleOpen').onclick = function() {
  document.getElementById('styleText').value = settings.style || '';
  populateStylePresets();
  openSheet('styleSheet');
};

document.getElementById('cotOpen').onclick = function() {
  document.getElementById('cotText').value = settings.cot || '';
  populateCotPresets();
  openSheet('cotSheet');
};

// 用「真实的线下页面」做实时预览：同一套 offline.html + offline.js，只是走 preview 模式
function renderCssPreview(css) {
  const f = document.getElementById('cssPreviewFrame');
  if (!f) return;
  if (!f.getAttribute('src')) {
    let chat = '';
    try { chat = new URLSearchParams(location.search).get('chat') || ''; } catch (e) {}
    f.setAttribute('src', 'offline.html?preview=1' + (chat ? ('&chat=' + encodeURIComponent(chat)) : ''));
  }
  const send = function () {
    try { f.contentWindow.postMessage({ type: 'offlinePreviewCss', css: String(css || '') }, '*'); } catch (e) {}
  };
  if (f.dataset.ready === '1') send();
  else f.addEventListener('load', function () { f.dataset.ready = '1'; send(); }, { once: true });
}
function applyCssPreview(css) { renderCssPreview(css); }
document.getElementById('beautifyOpen').onclick = function() {
  document.getElementById('cssText').value = settings.customCSS || '';
  populateCssPresets();
  applyCssPreview(settings.customCSS || '');
  openSheet('beautifySheet');
};
(function bindCssPreview() {
  const ta = document.getElementById('cssText');
  if (ta) {
    let t;
    ta.addEventListener('input', function () { clearTimeout(t); const v = this.value; t = setTimeout(function () { applyCssPreview(v); }, 180); });
  }
  const sel = document.getElementById('cssPreset');
  if (sel) sel.addEventListener('change', function () { setTimeout(function () { applyCssPreview(document.getElementById('cssText').value); }, 0); });
})();

// ===== 记忆总结（线下→共享记忆库，与线上互通） =====
const autoSummarySwitch = document.getElementById('autoSummarySwitch');
function setAutoSwitchUI() {
  autoSummarySwitch.classList.toggle('on', settings.autoSummary !== false);
}
autoSummarySwitch.addEventListener('click', function() {
  settings.autoSummary = !autoSummarySwitch.classList.contains('on');
  saveSettings();
  setAutoSwitchUI();
  showToast(settings.autoSummary ? '自动总结已开启' : '自动总结已关闭');
});

// ===== 成人向尺度（线下 NSFW） =====
const nsfwSwitch = document.getElementById('nsfwSwitch');
if (nsfwSwitch) {
  nsfwSwitch.addEventListener('click', function() {
    settings.nsfw = !nsfwSwitch.classList.contains('on');
    saveSettings();
    nsfwSwitch.classList.toggle('on', settings.nsfw);
    showToast(settings.nsfw ? '成人向尺度已开启' : '成人向尺度已关闭');
  });
}
document.getElementById('memorySummaryOpen').onclick = function() {
  const inp = document.getElementById('memThresholdInput');
  inp.value = settings.memThreshold || localStorage.getItem('offline_mem_threshold') || '5';
  setAutoSwitchUI();
  openSheet('memorySheet');
};
document.getElementById('memThresholdSave').onclick = function() {
  const v = parseInt(document.getElementById('memThresholdInput').value, 10) || 5;
  settings.memThreshold = v;
  try { localStorage.setItem('offline_mem_threshold', String(v)); } catch (e) {}
  saveSettings();
  showToast('总结阈值已设为 ' + v + ' 条');
};

function memOpenDb(name, version, stores) {
  return new Promise(function(resolve, reject) {
    try {
      const req = indexedDB.open(name, version);
      req.onupgradeneeded = function(e) {
        const db = e.target.result;
        (stores || []).forEach(function(store) { if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: 'key' }); });
      };
      req.onsuccess = function(e) { resolve(e.target.result); };
      req.onerror = function(e) { reject(e.target.error); };
    } catch (e) { reject(e); }
  });
}
async function memConfig() {
  try {
    const raw = await new Promise(function(resolve) {
      try {
        const req = indexedDB.open('nano_api_db', 2);
        req.onupgradeneeded = function(e) { const db = e.target.result; if (!db.objectStoreNames.contains('api_data')) db.createObjectStore('api_data', { keyPath: 'key' }); };
        req.onsuccess = function(e) { const db = e.target.result; const g = db.transaction('api_data', 'readonly').objectStore('api_data').get('nano_api_config'); g.onsuccess = () => resolve(g.result ? g.result.value : null); g.onerror = () => resolve(null); };
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
    if (!raw) { const ls = localStorage.getItem('nano_api_config'); if (ls) return JSON.parse(ls); return null; }
    return raw;
  } catch (e) { return null; }
}
async function memExtract(text) {
  const cfg = await memConfig();
  if (!cfg || !cfg.mainUrl) return '';
  let url = String(cfg.mainUrl).trim().replace(/\/+$/, '');
  if (!/\/v1$/i.test(url)) url += '/v1';
  const key = String(cfg.mainKey || '').trim();
  const model = cfg.mainModel || 'gpt-3.5-turbo';
  const prompt = '你是记忆提取助手。从角色与用户的一段对话中，提取值得长期记住的信息（重要事件、约定、喜好、称呼、关系进展、重要的话）。每条30~120字，只输出若干条记忆，一行一条，不要编号、不要解释、不要输出原文。\n\n对话：\n' + text;
  const resp = await fetch(url + '/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: model, messages: [{ role: 'user', content: prompt }], max_tokens: 1000, temperature: 0.6, stream: false })
  });
  if (!resp.ok) return '';
  const data = await resp.json();
  return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
}
document.getElementById('summarizeOfflineMemoryBtn').onclick = async function() {
  const btn = this;
  btn.disabled = true; btn.style.opacity = '.55';
  try {
    const db = await memOpenDb('MeetSettingsDB', 1, ['messages']);
    const all = await new Promise(function(resolve) {
      const r = db.transaction('messages', 'readonly').objectStore('messages').getAll();
      r.onsuccess = function() { resolve(r.result || []); };
      r.onerror = function() { resolve([]); };
    });
    const groups = {};
    all.forEach(m => { if (m && (m.role === 'user' || m.role === 'assistant') && (m.scene || 'story') === 'story') { const cid = m.chatId || 'general'; (groups[cid] = groups[cid] || []).push(m); } });
    let cids = Object.keys(groups);
    if (CURRENT_CHAT) cids = cids.filter(c => c === CURRENT_CHAT);
    if (!cids.length) { showToast('没有可总结的线下对话'); return; }
    let count = 0;
    for (const cid of cids) {
      const msgs = groups[cid];
      if (msgs.length < 1) continue;
      const text = msgs.slice(-14).map(m => ((m.role === 'user' ? (m.name || '用户') : (m.name || '角色')) + '：' + String(m.content || '').slice(0, 900))).join('\n');
      const summary = await memExtract(text);
      if (!summary) continue;
      const items = summary.split('\n').map(l => l.trim()).map(l => l.replace(/^[-*\d.\s、)]+/, '')).filter(l => l && l.length >= 6);
      if (!items.length) continue;
      const vdb = await memOpenDb('nano_vector_memory_db', 5, ['config']);
      const rec = await new Promise((resolve) => {
        const g = vdb.transaction('config', 'readonly').objectStore('config').get('memlist_' + cid);
        g.onsuccess = () => resolve(g.result ? g.result.value : null);
        g.onerror = () => resolve(null);
      });
      const list = (rec && Array.isArray(rec)) ? rec : [];
      items.forEach(t => { list.push({ id: 'om' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), time: new Date().toLocaleString('zh-CN'), type: '长期记忆', chatId: cid, content: t }); });
      await new Promise((resolve) => {
        vdb.transaction('config', 'readwrite').objectStore('config').put({ key: 'memlist_' + cid, value: list });
        resolve();
      });
      count += items.length;
    }
    showToast(count ? ('已总结 ' + count + ' 条记忆') : '没有提取到记忆');
  } catch (e) { console.error(e); showToast('总结失败：' + (e.message || e)); } finally {
    btn.disabled = false; btn.style.opacity = '';
  }
};

document.querySelectorAll('[data-close]').forEach(b => b.onclick = function() {
  var what = this.dataset.close;
  // 思维链预设弹窗：点「完成」也要落库，否则编辑了 COT 但只关弹窗、未点页面「保存」会静默丢失
  if (what === 'cotSheet') {
    try {
      var cotEl = document.getElementById('cotText');
      if (cotEl) settings.cot = cotEl.value.trim();
      saveSettings();
      updateSummary();
    } catch (e) {}
  }
  closeSheet(what);
});
document.querySelectorAll('.sheet-backdrop').forEach(b => b.addEventListener('click', function(e) { if (e.target === this) closeSheet(this.id); }));

// ============================================================
//  15. 保存 & 返回
// ============================================================
document.getElementById('saveBtn').onclick = function() {
  { const mt = document.getElementById('maxTokens'); if (mt) settings.maxTokens = mt.value; }
  settings.style = document.getElementById('styleText').value.trim();
  settings.cot = document.getElementById('cotText').value.trim();
  settings.customCSS = document.getElementById('cssText').value;
  settings.wordCount = document.getElementById('wordCount').value;
  settings.person = document.getElementById('person').value;
  settings.memThreshold = parseInt(document.getElementById('memThresholdInput').value, 10) || 5;
  saveSettings();
  updateSummary();
  showToast('设置已保存');
};

document.getElementById('backBtn').onclick = function() {
  // 返回到「线下模式聊天」（同一个 iframe 内的 offline.html），而不是退出到线上聊天详情
  var q = '';
  try {
    var p = new URLSearchParams(location.search);
    var cid = p.get('chat');
    var nm = p.get('name');
    if (cid) q += 'chat=' + encodeURIComponent(cid);
    if (nm) q += (q ? '&' : '') + 'name=' + encodeURIComponent(nm);
  } catch (e) {}
  location.href = 'offline.html' + (q ? '?' + q : '');
};

// ============================================================
//  16. 启动
// ============================================================
(async function init() {
  await loadAllData();
  fillSettings();
  renderRules();
  // 重新进入设置页时把已保存的配色渲染进预览 iframe（不影响设置页本身）
  renderCssPreview(settings.customCSS || '');
})();