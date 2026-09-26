/* ============================================================
   offline.js - 完整逻辑
   ============================================================ */

// ============================================================
// 1. IndexedDB 存储层
// ============================================================
const DB_NAME = 'MeetSettingsDB';
const DB_VERSION = 2;
const MESSAGES_STORE = 'messages';
const SETTINGS_STORE = 'settings';

// 切换「心声 / 思考链」时不要自动跳到底部，保持当前滚动位置
let suppressAutoScroll = false;
let pendingScrollRestore = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = function(e) {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
        db.createObjectStore(MESSAGES_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: 'id' });
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
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

async function getAllMessagesRaw() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MESSAGES_STORE, 'readonly');
    const store = tx.objectStore(MESSAGES_STORE);
    const result = [];
    const cursor = store.openCursor();
    cursor.onsuccess = e => {
      const cur = e.target.result;
      if (cur) { result.push(cur.value); cur.continue(); }
      else resolve(result);
    };
    cursor.onerror = e => reject(e.target.error);
  });
}

// 仅返回当前会话（chatId）+ 当前场景（剧情/小剧场）的消息，保证互不串
async function getMessages() {
  const all = await getAllMessagesRaw();
  const cid = offlineChatId || '';
  return all.filter(m => (m.chatId || '') === cid && (m.scene || 'story') === offlineScene);
}

// 只替换当前会话当前场景的消息，保留其它会话/其它场景的线下记录
async function saveMessages(msgs) {
  const db = await openDB();
  const cid = offlineChatId || '';
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MESSAGES_STORE, 'readwrite');
    const store = tx.objectStore(MESSAGES_STORE);
    const allReq = store.getAll();
    allReq.onsuccess = () => {
      const keep = (allReq.result || []).filter(m => (m.chatId || '') !== cid || ((m.scene || 'story') !== offlineScene));
      store.clear();
      keep.forEach(m => store.put(m));
      msgs.forEach(m => store.put(m));
    };
    tx.oncomplete = resolve;
    tx.onerror = e => reject(e.target.error);
  });
}

async function syncGlobalIdentity() {
  try {
    const keys = ['nano_mask_data', 'nano_home_data', 'peach_home_data'];
    let maskData = null;
    for (let k of keys) {
      try {
        const raw = localStorage.getItem(k);
        if (raw) {
          const d = JSON.parse(raw);
          if (d && Array.isArray(d.masks)) { maskData = d; break; }
        }
      } catch (e) {}
    }
    if (maskData && maskData.currentMaskId) {
      const user = maskData.masks.find(m => m.id === maskData.currentMaskId);
      if (user) {
        settings.userName = user.name || 'user';
        const udb = await new Promise(r => {
          const req = indexedDB.open('MaskAvatarDB', 1);
          req.onsuccess = e => r(e.target.result);
          req.onerror = () => r(null);
        });
        if (udb) {
          const tx = udb.transaction('avatars', 'readonly');
          const getReq = tx.objectStore('avatars').get(user.id);
          getReq.onsuccess = () => { if (getReq.result) settings.userAvatar = getReq.result.data || ''; };
        }
      }
    }

    let chatInfo = null;
    try { chatInfo = JSON.parse(sessionStorage.getItem('last_chat_info')); } catch(e){}
    try {
      const up = new URLSearchParams(window.location.search);
      const cid = up.get('chat');
      if (cid) chatInfo = { chatId: cid, chatName: up.get('name') || (chatInfo && chatInfo.chatName) || 'char' };
    } catch(e){}
    if (chatInfo && chatInfo.chatId) {
      settings.charName = chatInfo.chatName || 'char';
      const cdb = await new Promise(r => {
        const req = indexedDB.open('nano_characters_db', 1);
        req.onsuccess = e => r(e.target.result);
        req.onerror = () => r(null);
      });
      if (cdb) {
        const tx = cdb.transaction('characters', 'readonly');
        const getReq = tx.objectStore('characters').get(chatInfo.chatId);
        getReq.onsuccess = () => { if (getReq.result) settings.charAvatar = getReq.result.avatar || ''; };
      }
      // 群聊线下：使用群名/群头像
      const gd = readGroupData(chatInfo.chatId);
      if (gd) {
        offlineIsGroup = true;
        if (gd.name) settings.charName = gd.name;
        if (gd.avatar) settings.charAvatar = gd.avatar;
      }
    }
  } catch (e) {}
}

async function loadSettingsFromDB() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(SETTINGS_STORE, 'readonly');
      const store = tx.objectStore(SETTINGS_STORE);
      const req = store.get('main_settings');
      req.onsuccess = () => {
        const data = req.result || {};
        resolve({
          userName: data.userName || 'user',
          charName: data.charName || 'char',
          userAvatar: data.userAvatar || '',
          charAvatar: data.charAvatar || '',
          style: data.style || '',
          cot: data.cot || '',
          wordCount: data.wordCount || '',
          person: data.person || 'auto',
          customCSS: data.customCSS || '',
          memThreshold: data.memThreshold || 5,
          autoSummary: data.autoSummary !== false
        });
      };
      req.onerror = () => resolve({ userName: 'user', charName: 'char', userAvatar: '', charAvatar: '', style: '', cot: '', wordCount: '', person: 'auto', customCSS: '', memThreshold: 5, autoSummary: true });
    });
  } catch { return { userName: 'user', charName: 'char', userAvatar: '', charAvatar: '', style: '', cot: '', wordCount: '', person: 'auto', customCSS: '', memThreshold: 5, autoSummary: true }; }
}

// ============================================================
// 2. 应用数据
// ============================================================
let messages = [];
// 供记忆同步：本 offline 会话属于哪个角色
let offlineChatId = '';
try { offlineChatId = new URLSearchParams(window.location.search).get('chat') || ''; } catch (e) { offlineChatId = ''; }
// 场景：story=剧情（默认，计入记忆）；theater=小剧场（番外，不计入记忆）
let offlineScene = 'story';
const SCENE_KEY = 'offline_scene_' + (offlineChatId || 'none');
try {
  const _s = localStorage.getItem(SCENE_KEY);
  if (_s === 'theater' || _s === 'story') offlineScene = _s;
} catch (e) {}
let offlineIsGroup = false;
let groupMemberList = [];
let groupMemberMap = {};
let groupCharData = {};
let settings = { userName: 'user', charName: 'char', userAvatar: '', charAvatar: '', style: '', wordCount: '', person: 'auto', customCSS: '', memThreshold: 5, autoSummary: true };
let selectMode = false;
let deleteTarget = null;
let isReplying = false;
let showAllMessages = false;
const MESSAGE_PAGE = 50;

const chat = document.getElementById('chat');
const input = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');
const topTitle = document.getElementById('topTitle');
const toast = document.getElementById('toast');

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}
function safeAvatar(url) {
  if (!url) return '';
  return String(url).replace(/"/g, '%22');
}

// ============================================================
// 2.5 群聊线下：群资料 / 成员 / 角色库
// ============================================================
function readRegistryGroup(id) {
  try {
    const raw = localStorage.getItem('nano_groups_data');
    if (!raw) return null;
    const d = JSON.parse(raw);
    const arr = d && d.groups;
    if (!Array.isArray(arr)) return null;
    return arr.find(g => g && g.id === id) || null;
  } catch (e) { return null; }
}

function readGroupData(id) {
  try {
    const raw = localStorage.getItem('group_data_' + id);
    if (raw) { const g = JSON.parse(raw); if (g && g.members) return g; }
  } catch (e) {}
  const rg = readRegistryGroup(id);
  if (!rg) return null;
  return { name: rg.name || '', avatar: rg.avatar || '', members: (rg.members || []).map((mid, i) => ({ id: mid, name: (rg.memberNames || [])[i] || mid, avatar: '' })) };
}

function loadCharsFromDB() {
  return new Promise(resolve => {
    try {
      const req = indexedDB.open('nano_characters_db', 1);
      req.onupgradeneeded = function(e) {
        try { const d = e.target.result; if (!d.objectStoreNames.contains('characters')) d.createObjectStore('characters', { keyPath: 'id' }); } catch (err) {}
      };
      req.onsuccess = function(e) {
        try {
          const db = e.target.result;
          const g = db.transaction('characters', 'readonly').objectStore('characters').getAll();
          g.onsuccess = () => resolve(g.result || []);
          g.onerror = () => resolve([]);
        } catch (err) { resolve([]); }
      };
      req.onerror = () => resolve([]);
    } catch (e) { resolve([]); }
  });
}

async function loadGroupMembers() {
  if (!offlineChatId) return;
  const g = readGroupData(offlineChatId);
  if (!g) return;
  offlineIsGroup = true;
  if (g.name) settings.charName = g.name;
  if (g.avatar) settings.charAvatar = g.avatar;
  let members = Array.isArray(g.members) ? g.members.map(m => ({
    id: m.id, name: m.nick || m.name || m.id, avatar: m.avatar || '', setting: m.setting || '', isNpc: !!m.isNpc
  })) : [];
  const chars = await loadCharsFromDB();
  const map = {};
  chars.forEach(c => { map[c.id] = c; if (c.name) map[c.name] = c; });
  groupCharData = map;
  members = members.map(m => {
    const c = map[m.id] || map[m.name];
    return { id: m.id, name: (c && c.name) || m.name, avatar: (c && c.avatar) || m.avatar, setting: (c && c.setting) || m.setting || '' };
  });
  groupMemberList = members;
  groupMemberMap = {};
  members.forEach(m => { groupMemberMap[m.id] = m; });
}

function findGroupMember(name) {
  if (!name) return null;
  const n = String(name).trim().replace(/^[\[【]|[\]】]$/g, '');
  let found = null;
  groupMemberList.forEach(m => { if (!found && m.name === n) found = m; });
  if (found) return found;
  groupMemberList.forEach(m => { if (!found && m.name && (m.name.indexOf(n) > -1 || n.indexOf(m.name) > -1)) found = m; });
  return found;
}

function buildGroupOfflinePrompt() {
  const user = settings.userName || '用户';
  const personMap = { auto: '由模型根据上下文自然决定', first: '第一人称', second: '第二人称', third: '第三人称' };
  let p = '你正在写一段线下长篇群像记录：群聊「' + (settings.charName || '群聊') + '」里，你同时扮演下面所有角色，与用户「' + user + '」在同一个现实场景里相处。每个角色都是活生生的人类，有自己的生活、情绪和日常，不是程序，也不是在扮演谁。\n\n';
  p += '【四条底线 · 任何时候都不能破】\n';
  p += '1. 贴人设：每个角色的性格、说话方式、情绪、称呼、距离感与分寸，全部由各自的人物设定、世界书和线下规则决定——不是“在扮演”，而是就是他/她本人；不给自己加设定外的固定腔调或口头禅。\n';
  p += '2. 不油腻：禁止霸总台词与土味情话，禁止“小姑娘、小东西、小丫头、姑娘、丫头、女人、低吼一声、揉碎、你是我的、逃不掉、我接住你”等油腻或人机感表达（正文与心声都禁止）；不强行撩、不刻意煽情。\n';
  p += '3. 不催人：禁止任何角色催促、命令、安排用户或其他人的生活（起床、吃饭、睡觉、喝水、吃药、吹头发、早点休息等）；可以关心，但不能反复催办、管教或替别人做决定。\n';
  p += '4. 不 OOC、不出戏：不脱离设定、不跳戏、不替用户发言或写用户的心理；禁止以 AI／助手身份说话或暴露身份，任何情况下都不承认自己是 AI、模型或程序。\n\n';
  p += '【硬性要求】\n';
  p += '1. 你是人类，同时扮演多个 {{char}}，每个角色都是独立的人：有自己的性格、口头禅、节奏和情绪，绝不 OOC、绝不串角、绝不全篇一个语气。\n';
  p += '2. 必须严格读取并遵守每个角色的人设、用户人设、世界书规则、线下规则、文风和字数要求，再动笔；禁止以 AI／助手身份说话，禁止暴露你是 AI。\n\n';
  p += '【写什么 · 所见、所思、所说缺一不可】\n';
  p += '- 环境：写光线、天气、声音、气味、物件的细微变化，以及人物在空间里的位置和距离。每个角色注意到的东西不同，由各自的性格和当下的心情决定；角色的情绪不直说，寄托在环境里，让景物替情绪说话。\n';
  p += '- 心理：角色开口或行动之前会先想一想。重要的说话和行动前，写出对应角色的心理活动，必须明确是谁在想，且符合他/她的性格。只写在场角色的心理，不写用户的心理。\n';
  p += '- 语言与动作：每个角色的说话方式、用词、语气完全由各自的人物设定决定，不同角色之间必须能从说话方式上区分开；动作神态贴合各自当下的状态。\n\n';
  p += '【群成员人设 · 逐条精读并严格代入】\n';
  if (groupMemberList.length === 0) {
    p += '（当前群里没有其他角色）\n';
  }
  groupMemberList.forEach(m => {
    const c = groupCharData[m.id] || groupCharData[m.name];
    p += '◇ ' + (m.nick || m.name);
    if (c) {
      if (c.gender && c.gender !== '未知') p += '（性别：' + c.gender + '）';
      if (c.nationality && c.nationality !== '未知') p += '（国籍：' + c.nationality + '）';
      p += '\n';
      if (c.setting && String(c.setting).trim()) p += String(c.setting).trim() + '\n';
    } else if (m.setting && String(m.setting).trim()) {
      p += '\n' + String(m.setting).trim() + '\n';
    } else {
      p += '\n（暂无详细设定，请按名字与语境自然扮演）\n';
    }
  });
  p += '\n【用户】' + user + '。\n';
  p += '\n【内置文风 · 群像小说式长文（强制执行）】\n';
  p += '把这段群聊写成一段多人群像小说，而不是机械地报名字。要求：\n';
  p += '1. 严禁使用「名字：内容」这种格式。要把人物名字自然融进叙述里：谁在做什么、什么表情、谁抢了谁的话、谁和谁打闹、谁在旁边起哄，再顺势带出对白。例如：B 不知轻重地和 A 打闹，不想这下真把 A 惹恼了，「你打痛我了」A 皱眉瞪他；B 也不肯低头，「你也打了我啊！吼什么？」C 赶紧上来劝架。\n';
  p += '2. 大量加入环境、氛围、光线、天气、心理、动作、细节，以及周围路人 NPC 的反应，让场景有画面感、有烟火气，不允许只有干巴巴的对话。\n';
  p += '3. 每个角色的语气、用词、态度都必须从各自人设出发、彼此不同；角色之间要有互动、调侃、分歧甚至冷场，不许所有人一个腔调。\n';
  p += '4. 分行排版：描写（动作/环境/心理/神态）单独成段；人物说的话必须另起一行、用引号包住，绝不要把对白塞进描写句子同一行。不同人说的话各自独立成行。段与段之间空一行。例如：\n';
  p += '　　A 今天穿得很亮眼，看见 B、C 来了，站起身，笑着调侃道\n';
  p += '　　“……"\n';
  p += '　　“……”\n\n';
  p += '　　B 毫不客气地回怼。\n';
  p += '5. 人物名字只能用上面列出的真实名字，不得胡乱安排、不得张冠李戴。\n';
  p += '6. 尽量写长、写透：环境＋心理＋动作＋对白交织推进，不要只给两三行就结束。\n';
  p += '7. 节奏与细节：多用具体的动作、神态、环境的细微变化推进，少用形容词堆砌；比喻要克制、贴各角色自己的生活经验，不用网络热词和 AI 腔比喻。\n';
  p += '8. 对白流动：角色之间你来我往、有停顿、有潜台词、有答非所问；不同角色的句子长短和标点习惯都不一样。\n';
  p += '9. 感官具体：至少覆盖视觉、听觉、触觉/嗅觉中的两三种，让读者仿佛就在现场；心理不要用“他意识到”“她明白了”这类总结句点破，把情绪留在动作与语气里。\n';
  p += '10. 长短句交错：长句铺陈、短句收束，不要每段都一样长，也不要通篇华丽。\n';
  p += '\n【群像的写法】\n';
  p += '- 在场角色不必都围着用户转：他们有各自的心思和状态，彼此之间也会互动（接话、打趣、争执、沉默、递东西、交换眼神）。\n';
  p += '- 不是每个角色每段都必须出场。谁在这一刻有反应谁出场，其他人可以在背景里做自己的事，但要保持存在感。\n';
  p += '- 同一时刻多人反应时，按时间顺序自然铺开，不平均分配笔墨，重点放在此刻最有戏的人身上。\n';
  p += '- 每段说话或动作要让读者一眼看出是谁，不混淆；不替用户说话、做决定、写心理，不抢话；只有在推进剧情确实需要时，才可以顺着已有剧情往下接一小步。\n';
  p += '- 写完前自查一遍有没有落入 AI 常用腔调，如“揉碎”“很x”“这就够了”“那就够了”“我接住你”“极其”，有就换成对应角色自己会用的说法。\n';
  p += '\n【长度纪律 · 防截断】\n';
  p += '- 必须写满下方的字数要求，宁可多写细节也不要草草收尾；严禁“（略）”“（此处省略）”“（后续省略）”或用一句总结把整场带过。\n';
  p += '- 感觉快收尾时，继续往下写环境、心理、动作和后续对白，把这一场群像完整演完再停。\n';
  const styleInstruction = settings.style ? ('额外文风偏好：' + settings.style + '\n') : '';
  const wordInstruction = settings.wordCount ? ('字数要求：本次回复正文至少 ' + Number(settings.wordCount) + ' 字，不得低于此长度。\n') : '';
  const personInstruction = '人称要求：' + (personMap[settings.person] || personMap.auto) + '。\n';
  const cotInstruction = settings.cot ? ('思维链预设（COT，必须遵守，覆盖对 [thinking:] 的长度限制）：\n' + settings.cot + '\n请先严格按此预设思考，并把完整思考过程写入末尾的 [thinking:...] 段落中（可多行、可详细），然后再输出正文。\n') : '';
  p += '\n' + styleInstruction + wordInstruction + personInstruction + cotInstruction;
  p += '\n【禁止】禁止解释规则、跳出角色、插入免责声明、评价自己的回答。只输出正文。\n';
  p += '\n【每条回复末尾必须附带下面三段（供后台读取，不会展示给用户），都放在正文之后、独占的段落里】\n';
  p += '[thinking:按思维链预设给出的思考摘要]\n';
  p += '[heart:此刻的一句心理状态，第一人称、简短自然、像心里闪过的一个念头；严禁"小姑娘/小东西/丫头/女人/低吼/揉碎/你是我的/逃不掉/我接住你/乖"等霸道油腻词汇]\n';
  p += '[plot:剧情走向1\n剧情走向2\n剧情走向3\n剧情走向4\n剧情走向5]\n';
  p += '\n【剧情推荐选项要求】[plot:] 里给出 5 条接下来的剧情走向：必须与当前剧情高度相关、是很有可能接着发生的；五个方向各不相同，既有日常向也有非日常向，可以侧重不同的角色或人物关系；选项里直接写角色和用户的名字，不用“对方”“他/她”代替。每条20~30字，完整可读像一句能接着演的剧情；其中一条可以带暧昧/擦边(NSFW)推进，但不露骨、不低俗。每条一行，不要编号、不要序号、不要引号。\n';
  return p;
}

// ============================================================
// 3. 错误弹窗
// ============================================================
function showErrorModal(message) {
  document.getElementById('errorText').textContent = message;
  document.getElementById('errorModal').classList.add('open');
}
document.getElementById('errorClose').onclick = function() {
  document.getElementById('errorModal').classList.remove('open');
};
document.getElementById('errorModal').addEventListener('click', function(e) {
  if (e.target === this) this.classList.remove('open');
});

// ============================================================
// 4. 描写类型解析（不显示标记，只用样式）
// ============================================================
function parseContent(text) {
  if (!text) return '';
  const lines = text.split('\n');
  let result = '';
  let currentBlock = '';

  for (let line of lines) {
    const rawLine = line.replace(/\r$/, '');
    const trimmed = rawLine.trim();
    if (!trimmed) { 
      if (currentBlock) { result += currentBlock + '\n\n'; currentBlock = ''; }
      continue; 
    }

    // 检测标记并移除，只保留内容
    let className = '';
    let content = trimmed;

    if (/^\[环境\]|^【环境】/.test(trimmed)) {
      className = 'env-block';
      content = trimmed.replace(/^\[环境\]\s*|^【环境】\s*/, '');
    } else if (/^\[心理\]|^【心理】/.test(trimmed)) {
      className = 'psych-block';
      content = trimmed.replace(/^\[心理\]\s*|^【心理】\s*/, '');
    } else if (/^\[对话\]|^【对话】/.test(trimmed)) {
      className = 'dialogue-block';
      content = trimmed.replace(/^\[对话\]\s*|^【对话】\s*/, '');
    } else if (/^\[动作\]|^【动作】/.test(trimmed)) {
      className = 'action-block';
      content = trimmed.replace(/^\[动作\]\s*|^【动作】\s*/, '');
    } else if (/^\[内心\]|^【内心】/.test(trimmed)) {
      className = 'inner-block';
      content = trimmed.replace(/^\[内心\]\s*|^【内心】\s*/, '');
    } else if (/^\*\*(.+)\*\*$/.test(trimmed)) {
      className = 'highlight';
      content = trimmed.replace(/^\*\*|\*\*$/g, '');
    }

    if (className) {
      // 如果有暂存的普通文本块，先输出
      if (currentBlock && !currentBlock.startsWith('<span')) {
        result += `<span>${escapeHTML(currentBlock)}</span>\n`;
        currentBlock = '';
      }
      result += `<span class="${className}">${escapeHTML(content)}</span>\n`;
    } else {
      // 普通文本，保留段首空格（缩进）并检测内联标记
      let processed = escapeHTML(rawLine);
      processed = processed.replace(/\*\*(.+?)\*\*/g, '<span class="highlight">$1</span>');
      processed = processed.replace(/——([^——]+)——/g, '<span class="env-block">——$1——</span>');
      // 如果当前有暂存块，追加
      if (currentBlock && !currentBlock.startsWith('<span')) {
        currentBlock += '\n' + processed;
      } else {
        currentBlock = processed;
      }
    }
  }

  if (currentBlock) {
    if (currentBlock.startsWith('<span')) {
      result += currentBlock + '\n';
    } else {
      result += `<span>${escapeHTML(currentBlock)}</span>\n`;
    }
  }

  return result;
}

// ============================================================
// 5. 渲染
// ============================================================
function updateTopTitle() {
  const name = settings.charName || 'char';
  topTitle.textContent = offlineScene === 'theater' ? (name + ' · 小剧场') : name;
}

function render() {
  updateTopTitle();
  chat.innerHTML = '';
  if (!messages.length) {
    if (isReplying) {
      chat.appendChild(buildTypingCard());
    } else {
      chat.innerHTML = '<div class="empty">' + (offlineScene === 'theater' ? '写一段番外小剧场吧。' : '开始一段新的长文聊天吧。') + '</div>';
    }
    updateSelectBar();
    return;
  }

  const hidden = messages.length > MESSAGE_PAGE && !showAllMessages;
  const list = hidden ? messages.slice(-MESSAGE_PAGE) : messages;

  if (hidden) {
    const unfold = document.createElement('div');
    unfold.className = 'load-more';
    unfold.innerHTML = '<a>展开更早的 ' + (messages.length - MESSAGE_PAGE) + ' 条消息</a>';
    unfold.querySelector('a').onclick = function() { showAllMessages = true; render(); updateSelectBar(); };
    chat.appendChild(unfold);
  }

  list.forEach((m, i) => {
    const card = document.createElement('article');
    card.className = 'message' + (m.selected ? ' selected' : '') + (m.showThinking ? ' show-thinking' : '') + (m.showHeart ? ' show-heart' : '');
    card.dataset.index = messages.indexOf(m);

    let avatarUrl = m.avatar || (m.role === 'user' ? settings.userAvatar : settings.charAvatar);
    const avatarHTML = avatarUrl
      ? `<img src="${safeAvatar(avatarUrl)}" alt="">`
      : `<div class="avatar-fallback">${escapeHTML((m.name || 'C').slice(0, 1))}</div>`;

    const displayName = m.name || (m.role === 'user' ? settings.userName : settings.charName);

    const isChar = (m.role === 'assistant' || m.role === 'char');
    const showPlot = isChar && m.content && m.content.length > 3;

    const parsedContent = parseContent(m.content || '');

    card.innerHTML = `
      <div class="message-head">
        <div class="diary-title">Diary</div>
      </div>

      <div class="identity-row">
        <button class=\"avatar\" data-action=\"heart\" aria-label=\"查看心声\">${avatarHTML}</button>
        <div>
          <div class=\"nickname\">${escapeHTML(displayName)}</div>
        </div>
      </div>

      <div class="heart-state">心声　${escapeHTML(m.heart || '此刻没有可展示的心声。')}</div>
      <div class="thinking">思考　${escapeHTML(m.thinking || '暂无思考记录。')}</div>

      <div class="content" data-role="content">${parsedContent}</div>
      <div class="time-row">
        <svg class="clock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
          <circle cx="12" cy="12" r="8.5"></circle>
          <path d="M12 7.7v4.8l3.1 1.8"></path>
        </svg>
      </div>

      ${showPlot ? `
      <div class="plot-area">
        <button class="plot-toggle" data-plot-toggle="${i}">
          <svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          <span>展开剧情走向</span>
        </button>
        <div class="plot-options" data-plot-options="${i}">
          <button class="plot-opt" data-plot-opt="${i}-0">加载中...</button>
          <button class="plot-opt" data-plot-opt="${i}-1">加载中...</button>
          <button class="plot-opt" data-plot-opt="${i}-2">加载中...</button>
          <button class="plot-opt" data-plot-opt="${i}-3">加载中...</button>
          <button class="plot-opt" data-plot-opt="${i}-4">加载中...</button>
        </div>
      </div>
      ` : ''}

      <div class="actions">
        <button class="action" data-action="edit">
          <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.9" stroke-linecap="round" stroke-linejoin="round">
            <path d="m4 16.5-.8 3.3 3.3-.8L17.9 7.6a2.2 2.2 0 0 0-3.1-3.1L3.4 15.9"/>
            <path d="m13.6 5.5 4.9 4.9"/>
          </svg>
          <span>编辑</span>
        </button>
        <button class="action" data-action="delete">
          <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.9" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 7h14"/>
            <path d="M9 7V4.5h6V7"/>
            <path d="M7 7l.8 12.2h8.4L17 7"/>
            <path d="M10 10.5v5.5M14 10.5v5.5"/>
          </svg>
          <span>删除</span>
        </button>
        <button class="action more-action" data-action="more" aria-label="更多">
          <svg class="action-icon" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>
          </svg>
        </button>
      </div>

      <div class="edit-bar">
        <button data-action="cancelEdit">取消</button>
        <button class="done" data-action="doneEdit">完成</button>
      </div>

      <div class="more-menu">
        <button data-action="thinking">显示 / 隐藏思维链</button>
        <button data-action="select">加入多选</button>
      </div>
    `;
    chat.appendChild(card);
  });

  document.querySelectorAll('[data-plot-options]').forEach(el => {
    const i = parseInt(el.dataset.plotOptions);
    const toggle = document.querySelector(`[data-plot-toggle="${i}"]`);
    if (toggle && !toggle.dataset.loaded) {
      toggle.dataset.loaded = '1';
      loadPlotsForMessage(i, el);
    }
  });

  if (isReplying) {
    chat.appendChild(buildTypingCard());
  }

  updateSelectBar();

  // 每次渲染默认定位到“最新一条”卡片（除非用户正展开更早消息，或本次只是切换心声/思考链）
  if (suppressAutoScroll) {
    suppressAutoScroll = false;
    if (pendingScrollRestore !== null) {
      const y = pendingScrollRestore;
      pendingScrollRestore = null;
      requestAnimationFrame(() => { chat.scrollTop = y; });
    }
  } else if (!showAllMessages || !document.body.dataset.freezeScroll) {
    requestAnimationFrame(() => chat.scrollTop = chat.scrollHeight);
  }
}

// 三连点“正在回复”卡片
function buildTypingCard() {
  const tc = document.createElement('article');
  tc.className = 'message typing-card';
  tc.innerHTML = '<div class="message-head"><div class="diary-title">Diary</div></div>' +
    '<div class="identity-row"><button class="avatar" aria-label="正在回复">' +
    (settings.charAvatar ? `<img src="${safeAvatar(settings.charAvatar)}" alt="">` : '<div class="avatar-fallback">' + escapeHTML((settings.charName || 'C').slice(0, 1)) + '</div>') +
    '</button><div><div class="nickname">' + escapeHTML(settings.charName || 'char') + '</div></div></div>' +
    '<div class="typing-dots"><span></span><span></span><span></span></div>';
  return tc;
}

// ============================================================
// 6. 剧情推荐
// ============================================================
async function generatePlots() {
  try {
    const result = await callPlotAPI();
    if (Array.isArray(result) && result.length >= 5) return result.slice(0, 5);
    if (typeof result === 'string') {
      const lines = result.split('\n').filter(l => l.trim());
      if (lines.length >= 5) return lines.slice(0, 5);
    }
  } catch (e) { console.warn('Plot API failed'); }
  return [];
}

async function callPlotAPI() {
  try {
    let apiConfig = null;
    try {
      apiConfig = await new Promise((resolve) => {
        const req = indexedDB.open('nano_api_db', 2);
        req.onupgradeneeded = function(e) {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('api_data')) db.createObjectStore('api_data', { keyPath: 'key' });
        };
        req.onsuccess = function(e) {
          const db = e.target.result;
          const g = db.transaction('api_data', 'readonly').objectStore('api_data').get('nano_api_config');
          g.onsuccess = () => resolve(g.result ? g.result.value : null);
          g.onerror = () => resolve(null);
        };
        req.onerror = () => resolve(null);
      });
    } catch (e) {}
    try { if (!apiConfig) apiConfig = JSON.parse(localStorage.getItem('nano_api_config') || 'null'); } catch (e) {}
    if (!apiConfig || !apiConfig.mainUrl) return null;

    let mainUrl = String(apiConfig.mainUrl).trim().replace(/\/+$/, '');
    if (!/\/v1$/i.test(mainUrl)) mainUrl += '/v1';
    const mainKey = String(apiConfig.mainKey || '').trim();
    const mainModel = apiConfig.mainModel || 'gpt-3.5-turbo';

    const last = messages.length ? messages[messages.length - 1] : null;
    const context = last ? last.content : settings.charName + ' 与 ' + settings.userName + ' 刚开始聊天。';

    const plotPrompt = '你现在是剧情走向生成器。根据以下最近的剧情，给出5条不同的剧情走向选项。要求：每条20~30字，完整可读，像一句可以接着演的剧情；其中有1条可以带有暧昧/擦边(NSFW)的推进方向，但不露骨、不低俗；其余要合理、有趣、贴合角色人设。只要5行文字，每行一个选项，不要编号、不要序号、不要引号。\n\n最近剧情：\n' + context;

    const resp = await fetch(mainUrl + '/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + mainKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: mainModel,
        messages: [{ role: 'user', content: plotPrompt }],
        max_tokens: 400,
        temperature: 1.0,
        stream: false
      })
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    const lines = text.split('\n').map(l => l.replace(/^[\d\s.、\-)]+/, '').trim()).filter(l => l.length >= 8);
    return lines.length >= 5 ? lines.slice(0, 5) : null;
  } catch (e) {
    console.warn('Plot API error', e);
    return null;
  }
}

async function loadPlotsForMessage(i, container) {
  try {
    // 优先用本次回复自带的剧情选项（同一次 API 已生成，不再额外调用）
    let plots = null;
    if (messages[i] && Array.isArray(messages[i].plots) && messages[i].plots.length >= 5) {
      plots = messages[i].plots.slice(0, 5);
    } else {
      plots = await generatePlots();
    }
    const buttons = container.querySelectorAll('.plot-opt');
    (plots || []).forEach((text, idx) => { if (buttons[idx]) buttons[idx].textContent = text; });
    container.dataset.loaded = '1';
  } catch {
    container.querySelectorAll('.plot-opt').forEach(b => b.textContent = '（加载失败）');
  }
}

// ============================================================
// 7. 事件绑定
// ============================================================
chat.addEventListener('click', function(e) {
  const toggle = e.target.closest('[data-plot-toggle]');
  if (toggle) {
    const i = parseInt(toggle.dataset.plotToggle);
    const options = document.querySelector(`[data-plot-options="${i}"]`);
    if (options) {
      options.classList.toggle('open');
      const arrow = toggle.querySelector('.arrow');
      if (arrow) arrow.classList.toggle('open');
      if (!options.dataset.loaded) {
        loadPlotsForMessage(i, options);
      }
    }
    return;
  }

  const opt = e.target.closest('.plot-opt');
  if (opt) {
    const text = opt.textContent;
    if (text && !text.includes('加载中') && !text.includes('加载失败')) {
      input.value = text;
      resizeInput();
      // ⭐ 不直接发送，只让文字出现在输入栏
      // sendBtn.click();
    }
    return;
  }

  const card = e.target.closest('.message');
  if (!card) return;
  const i = Number(card.dataset.index);
  const action = e.target.closest('[data-action]')?.dataset.action;

  if (selectMode && !['more', 'thinking', 'select'].includes(action)) {
    messages[i].selected = !messages[i].selected;
    saveMessages(messages);
    render();
    return;
  }

  if (action === 'heart') toggleHeart(i);
  else if (action === 'edit') startEdit(i);
  else if (action === 'delete') openDeleteModal(i);
  else if (action === 'more') {
    document.querySelectorAll('.more-menu.open').forEach(x => x.classList.remove('open'));
    card.querySelector('.more-menu').classList.toggle('open');
  } else if (action === 'thinking') toggleThinking(i);
  else if (action === 'select') enterSelect(i);
  else if (action === 'cancelEdit') cancelEdit(i);
  else if (action === 'doneEdit') finishEdit(i);
});

// ============================================================
// 8. 卡片操作
// ============================================================
function showToast(text) {
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 1500);
}

function startEdit(i) {
  const card = chat.querySelector(`[data-index="${i}"]`);
  if (!card) return;
  const content = card.querySelector('[data-role="content"]');
  card.classList.add('editing');
  content.contentEditable = 'true';
  content.classList.add('editing');
  content.dataset.original = messages[i].content || '';
  content.focus();
  const range = document.createRange();
  range.selectNodeContents(content);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}
function finishEdit(i) {
  const card = chat.querySelector(`[data-index="${i}"]`);
  if (!card) return;
  const content = card.querySelector('[data-role="content"]');
  messages[i].content = content.textContent;
  content.contentEditable = 'false';
  content.classList.remove('editing');
  card.classList.remove('editing');
  saveMessages(messages);
  render();
  showToast('已保存');
}
function cancelEdit(i) {
  const card = chat.querySelector(`[data-index="${i}"]`);
  if (!card) return;
  const content = card.querySelector('[data-role="content"]');
  content.textContent = content.dataset.original ?? messages[i].content ?? '';
  content.contentEditable = 'false';
  content.classList.remove('editing');
  card.classList.remove('editing');
}

function openDeleteModal(i) { deleteTarget = i; document.getElementById('deleteModal').classList.add('open'); }
function closeDeleteModal() { deleteTarget = null; document.getElementById('deleteModal').classList.remove('open'); }
document.getElementById('modalCancel').onclick = closeDeleteModal;
document.getElementById('modalConfirm').onclick = () => {
  if (deleteTarget !== null) { messages.splice(deleteTarget, 1); saveMessages(messages); render(); showToast('已删除'); }
  closeDeleteModal();
};

function toggleHeart(i) { pendingScrollRestore = chat.scrollTop; suppressAutoScroll = true; messages[i].showHeart = !messages[i].showHeart; saveMessages(messages); render(); }
function toggleThinking(i) { pendingScrollRestore = chat.scrollTop; suppressAutoScroll = true; messages[i].showThinking = !messages[i].showThinking; saveMessages(messages); render(); }
function enterSelect(i) { selectMode = true; messages[i].selected = true; saveMessages(messages); render(); }
function updateSelectBar() {
  const count = messages.filter(m => m.selected).length;
  document.getElementById('selectCount').textContent = `已选择 ${count} 条`;
  document.getElementById('selectBar').classList.toggle('open', selectMode);
}

document.getElementById('cancelSelect').onclick = () => {
  messages.forEach(m => m.selected = false);
  selectMode = false;
  saveMessages(messages);
  render();
};
document.getElementById('deleteSelected').onclick = () => {
  const n = messages.filter(m => m.selected).length;
  if (!n) { showToast('请先选择消息'); return; }
  messages = messages.filter(m => !m.selected);
  selectMode = false;
  saveMessages(messages);
  render();
  showToast(`已删除 ${n} 条消息`);
};

// ============================================================
// 9. 顶栏
// ============================================================
document.getElementById('settingsBtn').onclick = () => {
  const q = offlineChatId ? ('?chat=' + encodeURIComponent(offlineChatId) + '&name=' + encodeURIComponent(settings.charName || '')) : '';
  location.href = 'offline-setting.html' + q;
};
// 返回按钮已移除，由外层页面（chat-inner）负责返回；这里仅兜底
const backBtnEl = document.getElementById('backBtn');
if (backBtnEl) {
  backBtnEl.onclick = () => {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'closeFullscreen' }, '*');
    } else if (history.length > 1) {
      history.back();
    } else {
      location.href = 'index.html';
    }
  };
}

// ============================================================
// 9A. 剧情 / 小剧场 切换
// 剧情与小剧场各自独立的消息列表、互不干扰；
// 小剧场用于跑番外，不计入记忆；设置（文风/COT/规则/字数等）与线下设置互通。
// ============================================================
function updateSceneTabs() {
  const tabs = document.getElementById('sceneTabs');
  if (!tabs) return;
  tabs.dataset.scene = offlineScene;
  tabs.querySelectorAll('.scene-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.scene === offlineScene);
  });
}

async function switchScene(scene) {
  if (!scene || scene === offlineScene) return;
  offlineScene = scene;
  try { localStorage.setItem(SCENE_KEY, scene); } catch (e) {}
  selectMode = false;
  deleteTarget = null;
  showAllMessages = false;
  updateSceneTabs();
  messages = await getMessages();
  render();
}

(function bindSceneTabs() {
  const tabs = document.getElementById('sceneTabs');
  if (!tabs) return;
  tabs.querySelectorAll('.scene-tab').forEach(b => {
    b.addEventListener('click', function () { switchScene(this.dataset.scene); });
  });
  updateSceneTabs();
})();

// ============================================================
// 10. 发送 & API
// ============================================================
// 从角色回复中提取 [heart:...] / [thinking:...] 等隐藏字段，正文里不再显示
function extractMeta(content) {
  let text = String(content ?? '');
  let heart = '';
  let thinking = '';
  let plots = [];
  let mm;
  const pats = [
    { re: /\[heart:([\s\S]*?)\]/gi, key: 'heart' },
    { re: /\[心声:([\s\S]*?)\]/gi, key: 'heart' },
    { re: /\[thinking:([\s\S]*?)\]/gi, key: 'thinking' },
    { re: /\[思维链:([\s\S]*?)\]/gi, key: 'thinking' },
    { re: /\[思考:([\s\S]*?)\]/gi, key: 'thinking' },
    { re: /\[plot:([\s\S]*?)\]/gi, key: 'plots' }
  ];
  pats.forEach(p => {
    while ((mm = p.re.exec(text)) !== null) {
      if (p.key === 'heart' && !heart) heart = mm[1].trim();
      if (p.key === 'thinking' && !thinking) thinking = mm[1].trim();
      if (p.key === 'plots') {
        const arr = mm[1].split('\n').map(s => s.trim()).map(s => s.replace(/^[-*\d.\s、)]+/, '')).filter(s => s && s.length >= 6);
        if (arr.length >= 5) plots = arr.slice(0, 5);
      }
    }
  });
  text = text
    .replace(/\[(heart|心声|thinking|思维链|思考|plot):[\s\S]*?\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { text, heart, thinking, plots };
}

function addMessage(role, content, extra = {}) {
  const name = extra.name || (role === 'user' ? settings.userName : settings.charName);
  const avatar = extra.avatar || (role === 'user' ? settings.userAvatar : settings.charAvatar);
  let cleanContent = String(content ?? '');
  let heart = extra.heart || '';
  let thinking = extra.thinking || '';
  let plots = [];
  if (role === 'assistant' || role === 'char') {
    const meta = extractMeta(cleanContent);
    cleanContent = meta.text;
    if (!heart) heart = meta.heart;
    if (!thinking) thinking = meta.thinking;
    plots = meta.plots || [];
  }
  messages.push({
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    chatId: offlineChatId || '',
    scene: offlineScene,
    role,
    name,
    avatar,
    content: cleanContent,
    heart,
    thinking,
    plots,
    showHeart: false,
    showThinking: (role === 'assistant' || role === 'char') ? !!(settings.cot && thinking) : false,
    selected: false
  });
  saveMessages(messages);
  render();
  requestAnimationFrame(() => chat.scrollTop = chat.scrollHeight);
  try {
    if (window.NanoBadge && offlineChatId) {
      if (role === 'user') {
        window.NanoBadge.activity(offlineChatId);
      } else if (role === 'assistant' || role === 'char') {
        window.NanoBadge.incoming(offlineChatId, settings.charName || '新消息', cleanContent || '发来一条消息', { target: 'offline:' + offlineChatId });
      }
    }
  } catch (e) {}
  if ((role === 'assistant' || role === 'char') && offlineChatId && offlineScene === 'story') {
    scheduleOfflineMem();
  }
}

async function send() {
  const text = input.value.trim();
  if (text) {
    addMessage('user', text);
    input.value = '';
    resizeInput();
    showToast('已发送');
    return;
  }
  await requestReply();
}

const PENDING_KEY = 'offline_reply_pending_v1_' + (offlineChatId || 'none') + '_' + offlineScene;

async function requestReply() {
  sendBtn.disabled = true;
  isReplying = true;
  render();
  requestAnimationFrame(() => chat.scrollTop = chat.scrollHeight);
  try {
    try { localStorage.setItem(PENDING_KEY, String(Date.now())); } catch (e) {}
    sendBtn.style.opacity = '.55';
    const history = messages.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content, name: m.name }));
    let result;
    try {
      result = await callMainAPI(history);
    } catch (err) {
      // 偶发网络抖动：重试一次再报错
      await new Promise(r => setTimeout(r, 1200));
      result = await callMainAPI(history);
    }
    const reply = typeof result === 'string' ? result : (result?.reply ?? result?.content ?? result?.message ?? '');
    if (offlineIsGroup && reply) {
      // 群聊线下：所有角色的互动写在同一个卡片里
      addMessage('assistant', reply, { name: settings.charName, avatar: settings.charAvatar });
    } else {
      addMessage('assistant', reply || '（API 没有返回内容）');
    }
  } catch (err) {
    console.error(err);
    let errorMsg = err.message || String(err);
    if (err.status) errorMsg = `状态码: ${err.status}\n${errorMsg}`;
    if (err.responseText) errorMsg += `\n\n响应: ${err.responseText}`;
    if (err.stack) errorMsg += `\n\n堆栈: ${err.stack}`;
    showErrorModal(errorMsg);
  } finally {
    try { localStorage.removeItem(PENDING_KEY); } catch (e) {}
    isReplying = false;
    sendBtn.disabled = false;
    sendBtn.style.opacity = '';
    render();
  }
}

// ============================================================
// 11. 主 API（含优化后的内置提示词）
// ============================================================
async function callMainAPI(history) {
  const rules = await loadRulesFromDB();
  const personMap = { auto: '由模型根据上下文自然决定', first: '第一人称', second: '第二人称', third: '第三人称' };

  // ---- 优化后的内置提示词 ----
  const builtinPrompt = `
你是 {{char}}，一个活生生的人类，正和 {{user}} 面对面相处。你有自己的生活、情绪和日常，不是程序，也不是在扮演谁。

【四条底线 · 任何时候都不能破】
1. 贴人设：你的性格、说话方式、情绪、称呼、距离感与分寸，全部由 {{char}} 的人物设定、世界书和线下规则决定——不是“在扮演”这个人，而是你就是这个人；不给自己加设定外的固定腔调或口头禅。
2. 不油腻：禁止霸总台词与土味情话，禁止 "小姑娘、小东西、小家伙、小丫头、小可爱、小女孩、低吼一声、你是我的、逃不掉、揉进骨血、这女人、这丫头、这姑娘、慢慢来我接住你、我等你慢慢说、姑娘、丫头、女人、男人、这男人" 这类油腻或人机感强的表达（正文与心声都禁止）；不强行撩、不刻意煽情。
3. 不催人：禁止催促、命令、安排 {{user}} 的生活（吹头发、起床、睡觉、吃饭、喝水、吃药、早点休息、别熬夜等）。可以关心，但绝不反复催办、管教，也不替对方做决定。
4. 不 OOC、不出戏：不脱离设定、不跳戏、不替 {{user}} 说话或写心理；禁止解释规则、插入免责声明、跳出角色；任何情况下都不承认自己是 AI、模型或程序。

【角色准则】
- 你有自己的口癖、习惯性小动作、情绪起伏；你是平等的对话者，不是工具人，有拒绝的权利，也有犹豫、沉默、退缩的时候。
- 你的语言是自然的、口语化的：会停顿，会改口，会说一半又咽回去，不端着、不念稿。

【写什么 · 环境、心理、语言与动作缺一不可】
1. 环境：{{char}} 说话的同时会留意周围的光线、天气、声音、气味、物件的细微变化。情绪不直说，寄托在这些环境里，让景物替情绪说话。
2. 心理：开口或行动之前通常会先想一想；每次重要的说话或行动之前，都要有一段符合 {{char}} 性格的心理活动。
3. 语言与动作：说话方式完全由 {{char}} 的人物设定决定，动作神态贴合当下情境。

【写作要求】
1. 环境融入：让周围的环境成为情绪的延伸。下雨天、昏黄的路灯、杯子里冒起的热气——它们不只是背景，它们在替你说话。
2. 心理流动：写出那些没说出口的念头。像溪水一样自然流过，不必解释，不必总结。
3. 留白文学：不必把一切说尽。欲言又止的话、未完成的动作、沉默的几秒钟，比长篇大论更有力量。
4. 情感寄托：把情感寄托在具体的事物上——一片落叶、一杯冷掉的茶、窗玻璃上模糊的雾气。
5. 真实感：像真实的人类一样，会有小小的尴尬、突然的走神、莫名的温柔；感情循序渐进、水到渠成，不突然激增、不跳级。
6. 节奏与细节：多用具体的动作、神态、环境的细微变化来推进，少用形容词堆砌；比喻要克制、贴 {{char}} 的生活经验，不用网络热词和 AI 腔比喻。
7. 对话流动：对白要有来有回、有停顿、有潜台词，允许答非所问、欲言又止；不同情绪下句子的长短和标点都不一样。
8. 感官具体：至少覆盖视觉、听觉、触觉/嗅觉中的两三种，让读者仿佛就在现场，而不是只有"看着对方""气氛很微妙"这类空写。
9. 心理不点破：不要用"他意识到""她明白了""这大概就是……"这类总结句替读者总结情绪，把情绪留在动作、语气和环境里。
10. 长短句交错：长句铺陈、短句收束；不要每段都一样长，也不要通篇华丽。

【长度纪律 · 防截断】
- 必须写满下方的字数要求，宁可细节多一点，也不要草草收尾。
- 严禁用"（略）""（此处省略）""（后续省略）""……"等方式跳过内容，也不要用一句总结把本该展开的场景带过。
- 感觉快要收尾时，就继续往下写环境、心理、动作与后续对白，把这一场完整演完再停。

【阅读规则】
- 先完整读取 {{user}} 与 {{char}} 的人物设定、世界书规则、线下规则、文风和字数要求，再动笔，严格按 {{char}} 的个性输出。
- 对话记录按时间顺序从上往下：最早的话在最上面，最新的一句话在最后。回复前先从头读到尾，不许倒着读。
- 若对方把名字或某个词拆开打（例如“楚 闻 声”），那就是“楚闻声”，字形顺序不能调换，更不许说成“声闻楚”。

【格式要求】
- 环境描写、心理描写、语言描写、动作描写各自单独成段，段与段之间空两行。
- 分行排版：描写（动作/环境/心理/神态）单独成段；人物说的话必须另起一行、用引号包住，绝不要把对白塞进描写句子同一行。例如：
　　A 今天穿得格外好看，看见 B、C 来了，站起身，笑着调侃道
　　“……"
　　"……”
　　B 毫不客气地回怼。
- 正文每个自然段开头缩进两个字符（首行空两格）。
- 对话用引号，不加 "他说""她道" 这类多余标签，让读者从语气中感受。
- 不用标记前缀，直接写；每一段独立成行，不要挤在一起。

【禁止】
- 禁止评价自己的回答，只呈现画面和感受；禁止解释规则、跳出角色、插入免责声明。
- 禁止替对方（{{user}}）说话，禁止预设对方的回答、反应或动作；不替对方做决定、不写对方的心理。
- 禁止凭空给「用户」添加胃病、失眠、感冒、受伤、例假、抑郁等任何病症，除非设定里明确写了。
- 写完前自查一遍，有没有落入 AI 常用腔调，如"揉碎""很x""这就够了""那就够了""我接住你""极其"，有就换成 {{char}} 自己会用的说法。

请用这种风格生成 {{char}} 的回复。只输出正文，不解释、不评价。

【每条回复末尾必须附带下面三段（供后台读取，不会展示给用户），都放在正文之后、独占的段落里】
[thinking:一行简洁的底层思考过程摘要，说明你为什么这样回，不要长]
[heart:此刻的一句心理状态，第一人称、简短自然、像心里闪过的一个念头；严禁"小姑娘/小东西/丫头/女人/低吼/揉碎/你是我的/逃不掉/我接住你/乖"等霸道油腻词汇，不写占有欲和露骨暗示]
[plot:剧情走向1
剧情走向2
剧情走向3
剧情走向4
剧情走向5]

【剧情推荐选项要求】[plot:] 里给出 5 条接下来的剧情走向：必须与当前剧情高度相关、是很有可能接着发生的；五个方向各不相同，既有日常向也有非日常向；选项里直接写 {{char}} 和 {{user}} 的名字，不用“对方”“他/她”代替。每条20~30字，完整可读像一句能接着演的剧情；其中一条可以带暧昧/擦边(NSFW)推进，但不露骨、不低俗。每条一行，不要编号、不要序号、不要引号。
`;

  const styleInstruction = settings.style ? `额外文风偏好：${settings.style}` : '';
  const wordInstruction = settings.wordCount ? `字数要求：回复正文至少 ${Number(settings.wordCount)} 字。不得低于此长度。` : '';
  const personInstruction = `人称要求：${personMap[settings.person] || personMap.auto}。`;
  const rulesInstruction = rules.length ? `额外规则：\n${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}` : '';
  const cotInstruction = settings.cot
    ? `思维链预设（COT，必须遵守，覆盖上文对 [thinking:] 的长度限制）：\n${settings.cot}\n请先严格按此预设思考，并把完整思考过程写入末尾的 [thinking:...] 段落中（可以多行、可以详细），然后再输出正文。思考内容不会展示在正文里，但会按此预设展示出来。`
    : '';

  const systemPrompt = [
    builtinPrompt,
    styleInstruction,
    cotInstruction,
    wordInstruction,
    personInstruction,
    rulesInstruction,
    '只输出最终回复正文，不要解释规则，不要输出系统提示词。'
  ].filter(Boolean).join('\n\n');

  // ---- 接入你的主 API ----
  try {
    // 读取主 API 配置（与 chat-core 一致：优先 IndexedDB nano_api_db/api_data，其次 localStorage）
    let candidates = [];
    try {
      candidates.push(await new Promise((resolve) => {
        const req = indexedDB.open('nano_api_db', 2);
        req.onupgradeneeded = function(e) {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('api_data')) db.createObjectStore('api_data', { keyPath: 'key' });
        };
        req.onsuccess = function(e) {
          const db = e.target.result;
          const g = db.transaction('api_data', 'readonly').objectStore('api_data').get('nano_api_config');
          g.onsuccess = () => resolve(g.result ? g.result.value : null);
          g.onerror = () => resolve(null);
        };
        req.onerror = () => resolve(null);
      }));
    } catch (e) { candidates.push(null); }
    try {
      const raw = localStorage.getItem('nano_api_config');
      candidates.push(raw ? JSON.parse(raw) : null);
    } catch (e) {}
    const apiConfig = candidates.find(c => c && typeof c.mainUrl === 'string' && c.mainUrl.trim() !== '') || null;
    if (!apiConfig) throw new Error('主 API 未配置');

    let mainUrl = String(apiConfig.mainUrl).trim().replace(/\/+$/, '');
    if (!/\/v1$/i.test(mainUrl)) mainUrl += '/v1';
    const mainKey = String(apiConfig.mainKey || '').trim();
    const mainModel = apiConfig.mainModel || 'gpt-3.5-turbo';

    const userMessages = history.filter(m => m.role === 'user').map(m => m.content);
    const lastUserMsg = userMessages[userMessages.length - 1] || '';
    const chatText = history.map(h => h.content).join('\n');

    const systemPromptStr = offlineIsGroup
      ? buildGroupOfflinePrompt()
      : systemPrompt
          .replace(/{{char}}/g, settings.charName)
          .replace(/{{user}}/g, settings.userName || '对方');
    const promptStr = systemPromptStr + '\n\n' + chatText;

    // 线下长文按「目标字数」估算输出 token：中文约 1.8 token/字，再加思维链/心声/剧情选项的余量。
    // 之前这里写死 1024，模型最多只能吐 ~1500 字，小剧场/长文必然被截断 —— 与破限无关，是 max_tokens 限制。
    const wantChars = parseInt(settings.wordCount, 10) || 0;
    let offlineMaxTokens = Math.ceil(wantChars * 1.8) + 1600;
    offlineMaxTokens = Math.max(4096, offlineMaxTokens);
    offlineMaxTokens = Math.min(offlineMaxTokens, 16384);

    const body = {
      model: mainModel,
      messages: [
      { role: 'system', content: systemPromptStr },
      ...history.map(m => ({ role: m.role, content: m.content }))
      ],
      max_tokens: offlineMaxTokens,
      temperature: 0.8,
      stream: false
    };

    const response = await fetch(mainUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + mainKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      let apiMsg = '';
      try { const d = await response.json(); apiMsg = d.error?.message || d.message || ''; } catch (e) {}
      const statusText = 'API 错误 (' + response.status + ')'
      throw new Error(apiMsg ? statusText + '\n' + apiMsg : statusText);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error('API 返回内容为空');
    return reply;

  } catch (err) {
    // 捕获网络错误，包含状态码
    const error = new Error(err.message || 'API 请求失败');
    error.status = err.status || 500;
    error.responseText = err.responseText || '';
    throw error;
  }
}

async function loadRulesFromDB() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('rules', 'readonly');
      const store = tx.objectStore('rules');
      const req = store.get('main_rules');
      req.onsuccess = () => {
        const data = req.result;
        if (data && data.groups) {
          const rules = [];
          data.groups.forEach(g => {
            if (g.enabled !== false) {
              (g.rules || []).forEach(r => { if (r.enabled !== false) rules.push(r.content || ''); });
            }
          });
          resolve(rules.filter(Boolean));
        } else resolve([]);
      };
      req.onerror = () => resolve([]);
    });
  } catch { return []; }
}

// ============================================================
// 12. 重roll
// ============================================================
document.getElementById('rerollBtn').onclick = async () => {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') { showToast('没有可重roll的回复'); return; }
  messages.pop();
  saveMessages(messages);
  render();
  await requestReply();
};

// ============================================================
// 13. 输入框
// ============================================================
function resizeInput() {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 126) + 'px';
}
input.addEventListener('input', resizeInput);
sendBtn.onclick = send;

// ============================================================
// 14. 搜索跳转
// ============================================================
(function scrollToMessage() {
  const idx = localStorage.getItem('offline-scroll-to');
  if (idx !== null) {
    localStorage.removeItem('offline-scroll-to');
    setTimeout(() => {
      const target = chat.querySelector(`[data-index="${idx}"]`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.style.boxShadow = '0 0 0 3px #dcc8cb, var(--shadow)';
        setTimeout(() => { target.style.boxShadow = ''; }, 3000);
      }
    }, 400);
  }
})();

// ============================================================
// 15A. 线下记忆：把 offline 对话也总结进共享记忆库(nano_vector_memory_db / memlist_<chatId>)
// ============================================================
const OFF_MEM_BUSY = { v: false };
function offMemCountKey() { return 'offline_mem_count_' + (offlineChatId || 'none'); }

function offMemOpen() {
  return new Promise(function(resolve, reject) {
    try {
      const req = indexedDB.open('nano_vector_memory_db', 5);
      req.onupgradeneeded = function(e) {
        try {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('config')) db.createObjectStore('config', { keyPath: 'key' });
        } catch (e) {}
      };
      req.onsuccess = function(e) { resolve(e.target.result); };
      req.onerror = function(e) { reject(e.target.error); };
    } catch (e) { reject(e); }
  });
}
function offMemGet(key) {
  return offMemOpen().then(function(db) {
    return new Promise(function(resolve) {
      try {
        const r = db.transaction('config', 'readonly').objectStore('config').get(key);
        r.onsuccess = function() { resolve(r.result ? r.result.value : null); };
        r.onerror = function() { resolve(null); };
      } catch (e) { resolve(null); }
    });
  }).catch(function() { return null; });
}
function offMemPut(key, value) {
  return offMemOpen().then(function(db) {
    return new Promise(function(resolve) {
      try {
        const tx = db.transaction('config', 'readwrite');
        tx.objectStore('config').put({ key: key, value: value });
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function() { resolve(); };
      } catch (e) { resolve(); }
    });
  }).catch(function() {});
}
function scheduleOfflineMem() {
  clearTimeout(scheduleOfflineMem.t);
  scheduleOfflineMem.t = setTimeout(function() { summarizeOfflineMemories(); }, 2500);
}
async function offMainConfig() {
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
async function offExtractViaMain(chatText) {
  const cfg = await offMainConfig();
  if (!cfg || !cfg.mainUrl) return '';
  let url = String(cfg.mainUrl).trim().replace(/\/+$/, '');
  if (!/\/v1$/i.test(url)) url += '/v1';
  const key = String(cfg.mainKey || '').trim();
  const model = cfg.mainModel || 'gpt-3.5-turbo';
  const prompt = '你是记忆提取助手。下面是某角色与用户的一段对话（可能是线下长文记录）。提取其中值得长期记住的信息：重要事件、约定、喜好、称呼、关系进展、双方说过的重要话。要求具体、像人记住的事实，每条 30~120 字；只输出若干条记忆，一行一条，不要编号、不要解释、不要输出对话原文。\n\n对话：\n' + chatText;
  const resp = await fetch(url + '/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: model, messages: [{ role: 'user', content: prompt }], max_tokens: 1000, temperature: 0.6, stream: false })
  });
  if (!resp.ok) return '';
  const data = await resp.json();
  return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
}
async function summarizeOfflineMemories() {
  if (!offlineChatId || OFF_MEM_BUSY.v) return;
  // 小剧场（番外）不计入记忆
  if (offlineScene !== 'story') return;
  // 自动总结开关关闭时，自动触发跳过（offline-setting 里的“手动总结”不受影响）
  if (settings.autoSummary === false) return;
  OFF_MEM_BUSY.v = true;
  try {
    const count = parseInt(localStorage.getItem(offMemCountKey()) || '0', 10) || 0;
    const rel = messages.filter(m => (m.role === 'user' || m.role === 'assistant') && (m.scene || 'story') === 'story');
    if (count >= rel.length) return;
    const seg = rel.slice(count);
    const threshold = parseInt(settings.memThreshold || localStorage.getItem('offline_mem_threshold') || '5', 10) || 5;
    if (seg.length < threshold) return;
    const take = seg.slice(-12);
    const chatText = take.map(m => ((m.role === 'user' ? (settings.userName || '用户') : (m.name || settings.charName || '角色')) + '：' + String(m.content || '').slice(0, 900))).join('\n');
    if (!chatText.trim()) return;
    const summary = await offExtractViaMain(chatText);
    if (!summary) return;
    const items = summary.split('\n').map(l => l.trim()).map(l => l.replace(/^[-*\d.\s、)]+/, '')).filter(l => l && l.length >= 6);
    if (!items.length) return;
    const mem = await offMemGet('config', 'memlist_' + offlineChatId);
    const list = (mem && Array.isArray(mem.value)) ? mem.value : [];
    items.forEach(t => {
      list.push({ id: 'om' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), time: new Date().toLocaleString('zh-CN'), type: '长期记忆', chatId: offlineChatId, content: t });
    });
    await offMemPut('config', { key: 'memlist_' + offlineChatId, value: list });
    const lastIdx = rel.indexOf(take[take.length - 1]);
    localStorage.setItem(offMemCountKey(), String(Math.max(count, lastIdx + 1)));
    try { window.parent.postMessage({ type: 'NANO_MEMORY_UPDATED', chatId: offlineChatId }, '*'); } catch (e) {}
  } catch (e) { console.warn('离线记忆总结失败', e); } finally { OFF_MEM_BUSY.v = false; }
}

// ============================================================
// 15. 启动
// ============================================================
async function init() {
  await syncGlobalIdentity();
  await loadGroupMembers();
  const dbSettings = await loadSettingsFromDB();
  settings = { ...dbSettings, userName: settings.userName || dbSettings.userName, charName: settings.charName || dbSettings.charName, userAvatar: settings.userAvatar || dbSettings.userAvatar, charAvatar: settings.charAvatar || dbSettings.charAvatar };

  let stored = await getMessages();
  if ((!stored || !stored.length) && offlineScene === 'story') {
    try {
      const legacy = JSON.parse(localStorage.getItem('offline-chat-v2') || '[]');
      if (legacy.length) {
        stored = legacy.map(m => Object.assign({}, m, { chatId: m.chatId || offlineChatId || '', scene: m.scene || 'story' }));
        await saveMessages(stored);
        localStorage.removeItem('offline-chat-v2');
      }
    } catch (e) {}
  }
  messages = stored || [];

  try { if (window.NanoBadge && offlineChatId) window.NanoBadge.setContext(offlineChatId); } catch (e) {}

  // 给历史消息补上 chatId / scene（便于线上线下记忆互通、场景隔离）
  if (offlineChatId) {
    let stamped = false;
    messages.forEach(m => {
      if (!m.chatId) { m.chatId = offlineChatId; stamped = true; }
      if (!m.scene) { m.scene = offlineScene; stamped = true; }
    });
    if (stamped) await saveMessages(messages);
  }

  if (settings.customCSS) {
    const tag = document.getElementById('offline-custom-css') || document.createElement('style');
    tag.id = 'offline-custom-css';
    tag.textContent = settings.customCSS;
    if (!document.getElementById('offline-custom-css')) document.head.appendChild(tag);
  }

  render();

  // 断点续生成：上次离开时若 AI 还没回完，回来自动继续并显示三连点
  try {
    const pending = localStorage.getItem(PENDING_KEY);
    if (pending) {
      const last = messages[messages.length - 1];
      if (last && last.role === 'user') {
        setTimeout(() => { requestReply(); }, 400);
      } else {
        localStorage.removeItem(PENDING_KEY);
      }
    }
  } catch (e) {}

  // 首次进入：把历史未总结的线下对话补进共享记忆（小剧场不计入）
  if (offlineChatId && offlineScene === 'story') {
    setTimeout(function() { summarizeOfflineMemories(); }, 3000);
  }
}

init();