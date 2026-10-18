import { buildPushPayload } from '@block65/webcrypto-web-push';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Push-Token, X-Peek-Token',
};
const json = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

function subId(endpoint) {
  return 'sub:' + btoa(endpoint).replace(/[^a-zA-Z0-9]/g, '').slice(-48);
}

// ===== VAPID：优先用 secrets；没配置就自动生成一对存进 KV，用户不需要自己生成 =====
function b64urlEncode(bytes) {
  let s = '';
  const arr = new Uint8Array(bytes || []);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function b64urlDecode(str) {
  const s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 ? new Array(5 - (s.length % 4)).join('=') : '';
  const raw = atob(s + pad);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
async function ensureVapid(env) {
  if (env.VAPID_PUBLIC && env.VAPID_PRIVATE) {
    return {
      subject: env.VAPID_SUBJECT || 'https://nanopush.nano315.online',
      publicKey: String(env.VAPID_PUBLIC),
      privateKey: String(env.VAPID_PRIVATE)
    };
  }
  try {
    const raw = await env.PUSH_KV.get('vapid:keys');
    if (raw) {
      const o = JSON.parse(raw);
      if (o && o.publicKey && o.privateKey) {
        return {
          subject: o.subject || env.VAPID_SUBJECT || 'https://nanopush.nano315.online',
          publicKey: o.publicKey,
          privateKey: o.privateKey
        };
      }
    }
  } catch (e) {}
  try {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const pub = await crypto.subtle.exportKey('jwk', pair.publicKey);
    const priv = await crypto.subtle.exportKey('jwk', pair.privateKey);
    const x = b64urlDecode(pub.x);
    const y = b64urlDecode(pub.y);
    const point = new Uint8Array(65);
    point[0] = 4;
    point.set(x, 1);
    point.set(y, 33);
    const o = {
      subject: env.VAPID_SUBJECT || 'https://nanopush.nano315.online',
      publicKey: b64urlEncode(point),
      privateKey: String(priv.d || ''),
      createdAt: Date.now()
    };
    if (!o.privateKey) return null;
    await env.PUSH_KV.put('vapid:keys', JSON.stringify(o));
    return o;
  } catch (e) {
    return null;
  }
}

function tokenOk(request, env) {
  // 如果设置了 PUSH_TOKEN secret，则 /schedule 和 /send 必须带 X-Push-Token 头
  if (!env.PUSH_TOKEN) return true;
  return request.headers.get('X-Push-Token') === env.PUSH_TOKEN;
}

// 屏幕速聊（iOS 快捷指令）令牌校验：带了 PEEK_TOKEN 就必须匹配，未设置则放行
function peekOk(request, env, body) {
  if (!env.PEEK_TOKEN) return true;
  const h = request.headers.get('X-Peek-Token');
  let q = '';
  try { q = new URL(request.url).searchParams.get('token') || ''; } catch (e) {}
  const b = body && body.token ? String(body.token) : '';
  return h === env.PEEK_TOKEN || q === env.PEEK_TOKEN || b === env.PEEK_TOKEN;
}

function modelEndpoint(raw) {
  let s = String(raw || '').trim().replace(/\/+$/, '');
  if (!s) return '';
  if (!/\/v1$/i.test(s)) s += '/v1';
  return s + '/chat/completions';
}

async function peekTurns(env, chatId) {
  try { const raw = await env.PUSH_KV.get('peek:' + chatId); return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
}
async function peekSave(env, chatId, turns) {
  try { await env.PUSH_KV.put('peek:' + chatId, JSON.stringify(turns.slice(-40)), { expirationTtl: 60 * 60 * 24 * 7 }); } catch (e) {}
}

// ===== 无后台主动消息 / 朋友圈 =====
// 客户端把「人设 + 设置 + 模型配置」同步上来，Worker 的 cron 到点生成内容并推送；
// 内容先暂存在 KV，App 回到前台后拉取合并，所以不需要网页一直开着。
function autoOk(request, env, body) {
  const tokens = [env.PUSH_TOKEN, env.PEEK_TOKEN].filter(Boolean);
  if (!tokens.length) return true;
  let h = '';
  try { h = request.headers.get('X-Push-Token') || request.headers.get('X-Peek-Token') || ''; } catch (e) {}
  let q = '';
  try { q = new URL(request.url).searchParams.get('token') || ''; } catch (e) {}
  const b = body && body.token ? String(body.token) : '';
  return tokens.indexOf(h) >= 0 || tokens.indexOf(q) >= 0 || tokens.indexOf(b) >= 0;
}
function clampNum(n, min, max, dflt) {
  n = Number(n);
  if (!isFinite(n) || n <= 0) n = dflt;
  return Math.max(min, Math.min(max, n));
}
function sanitizeAutoConfig(body) {
  body = body || {};
  const chars = Array.isArray(body.chars) ? body.chars.slice(0, 30).map(function (c) {
    const av = String((c && c.avatar) || '');
    return {
      id: String((c && c.id) || '').slice(0, 80),
      name: String((c && c.name) || '').slice(0, 40),
      // 头像只在不是超长 dataURL 时保存，避免把配置撑大
      avatar: av.length > 4000 ? '' : av,
      setting: String((c && c.setting) || '').slice(0, 6000),
      isNpc: !!(c && c.isNpc),
      nationality: String((c && c.nationality) || '').slice(0, 40),
      language: String((c && c.language) || '').slice(0, 40),
      foreign: !!(c && c.foreign),
      // 月潮：只有用户开放权限的角色才会带这份数据
      cycle: (function () {
        const cy = c && c.cycle;
        if (!cy || !/^\d{4}-\d{2}-\d{2}$/.test(String(cy.lastStart || ''))) return null;
        return {
          lastStart: String(cy.lastStart),
          nextStart: /^\d{4}-\d{2}-\d{2}$/.test(String(cy.nextStart || '')) ? String(cy.nextStart) : '',
          cycleLength: Math.max(18, Math.min(60, parseInt(cy.cycleLength, 10) || 28)),
          periodLength: Math.max(2, Math.min(14, parseInt(cy.periodLength, 10) || 5)),
          remindDays: Math.max(0, Math.min(14, parseInt(cy.remindDays, 10) || 0))
        };
      })()
    };
  }).filter(function (c) { return c.id && c.name; }) : [];
  const api = body.api && typeof body.api === 'object' ? {
    url: String(body.api.url || '').slice(0, 500),
    key: String(body.api.key || '').slice(0, 500),
    model: String(body.api.model || '').slice(0, 120)
  } : null;
  return {
    enabled: !!(body.enabled || body.msgEnabled || body.momentEnabled),
    msgEnabled: !!body.msgEnabled,
    momentEnabled: !!body.momentEnabled,
    // 客户端设置里最小是 1 小时；这里再兜底，防止旧缓存把 8 当成分钟导致每 8 分钟发一次
    intervalMinutes: clampNum(body.intervalMinutes, 30, 1440, 480),
    momentIntervalHours: clampNum(body.momentIntervalHours, 0.5, 720, 24),
    user: {
      id: String((body.user && body.user.id) || 'default').slice(0, 80),
      name: String((body.user && body.user.name) || '我').slice(0, 40)
    },
    chars: chars,
    api: api,
    updatedAt: Date.now()
  };
}
async function autoChat(env, cfg, messages, maxTokens, temperature) {
  const url = modelEndpoint(env.AUTO_API_URL || env.PEEK_API_URL || (cfg.api && cfg.api.url) || '');
  const key = env.AUTO_API_KEY || env.PEEK_API_KEY || (cfg.api && cfg.api.key) || '';
  const model = env.AUTO_MODEL || env.PEEK_MODEL || (cfg.api && cfg.api.model) || '';
  if (!url || !key || !model) return null;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model: model,
        messages: messages,
        max_tokens: maxTokens || 500,
        temperature: (typeof temperature === 'number' ? temperature : 0.95)
      })
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const c = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    return c ? String(c).trim() : null;
  } catch (e) { return null; }
}
function pickRandom(arr, n) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = copy[i]; copy[i] = copy[j]; copy[j] = t;
  }
  return copy.slice(0, n);
}
function splitAutoBubbles(text) {
  return String(text || '').split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 3);
}
function beijingToday() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}
function parseYmd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return 0;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
function addDaysMs(ms, n) { return ms + n * 86400000; }
function fmtCn(ms) {
  const d = new Date(ms);
  return (d.getUTCMonth() + 1) + '月' + d.getUTCDate() + '日';
}
function autoLangName(c) {
  if (!c) return '';
  const given = String(c.language || '').trim();
  // 外国人即使语言字段是「中文」，主动消息也强制用国籍对应的母语
  if (given && !/中文|汉语|漢語|chinese/i.test(given)) return given;
  const nat = String(c.nationality || '');
  const map = {
    '美国': '英文', '英国': '英文', '澳大利亚': '英文', '加拿大': '英文', '新西兰': '英文', '印度': '英文', '新加坡': '英文',
    '法国': '法文', '德国': '德文', '奥地利': '德文', '西班牙': '西班牙文', '墨西哥': '西班牙文', '阿根廷': '西班牙文',
    '巴西': '葡萄牙文', '葡萄牙': '葡萄牙文', '意大利': '意大利文', '日本': '日文', '韩国': '韩文', '俄罗斯': '俄文',
    '泰国': '泰文', '越南': '越南文', '荷兰': '荷兰文', '瑞典': '瑞典文', '挪威': '挪威文', '丹麦': '丹麦文',
    '芬兰': '芬兰文', '波兰': '波兰文', '土耳其': '土耳其文', '沙特阿拉伯': '阿拉伯文', '阿联酋': '阿拉伯文', '埃及': '阿拉伯文'
  };
  for (const k of Object.keys(map)) if (nat.indexOf(k) > -1) return map[k];
  return '英文';
}
function autoIsForeign(c) {
  if (!c) return false;
  if (c.foreign) return true;
  const nat = String(c.nationality || '').trim();
  return !!(nat && nat !== '未知' && nat !== '未设定' && !/(中国|中國|china|chinese|香港|澳门|澳門|台湾|台灣)/i.test(nat));
}
function autoLangBlock(c) {
  if (!autoIsForeign(c)) return '';
  const lang = autoLangName(c);
  return '【语言 · 最高优先级】你是' + (c.nationality || '外国') + '人，母语是' + lang + '。'
    + '本轮主动消息的正文必须只用' + lang + '写，绝不能用中文当正文；即使人设或上面的说明是中文，也不要改变。'
    + '每行一条气泡，严格按「' + lang + '原文||中文翻译」的格式输出，用 || 分隔；中文只能出现在 || 右边作为翻译，翻译要自然口语化。\n';
}
function cycleBlock(c) {
  const cy = c && c.cycle;
  if (!cy || !cy.lastStart) return '';
  const todayMs = parseYmd(beijingToday());
  let last = parseYmd(cy.lastStart);
  if (!last) return '';
  let next = addDaysMs(last, cy.cycleLength);
  let guard = 0;
  while (next <= todayMs && guard < 400) {
    last = next;
    next = addDaysMs(last, cy.cycleLength);
    guard++;
  }
  const daysUntil = Math.max(0, Math.round((next - todayMs) / 86400000));
  const periodEnd = addDaysMs(last, cy.periodLength - 1);
  const inPeriod = todayMs >= last && todayMs <= periodEnd;
  const periodDay = inPeriod ? Math.round((todayMs - last) / 86400000) + 1 : 0;
  const ovulation = addDaysMs(next, -14 * 86400000);
  const fertileStart = addDaysMs(ovulation, -5 * 86400000);
  const fertileEnd = addDaysMs(ovulation, 86400000);
  let s = '\n\n【月潮 · 她的经期（她只对你开放了这份记录）】\n';
  if (inPeriod) s += '她现在正在经期，今天是第 ' + periodDay + ' 天（预计持续约 ' + cy.periodLength + ' 天）。\n';
  s += '预计下次经期：' + fmtCn(next) + '（还有 ' + daysUntil + ' 天），预计持续 ' + cy.periodLength + ' 天。\n';
  s += '预计排卵日：' + fmtCn(ovulation) + '；排卵期：' + fmtCn(fertileStart) + '–' + fmtCn(fertileEnd) + '。\n';
  s += '这是她自己的私密记录，推算不一定完全准确。你知道就好，不要生硬播报日期或“系统推算”。\n';
  if (cy.remindDays > 0 && daysUntil <= cy.remindDays) {
    s += '【本轮提醒时机】她预计 ' + (daysUntil === 0 ? '今天' : (daysUntil + ' 天后')) + ' 来经期。这一轮必须自然关心她，提醒她注意休息、别太累、备好用品；语气像你本人，不要像提醒机器人，也不要提“记录/推算/提醒设置”。\n';
  }
  return s;
}
async function generateAutoMessages(env, cfg, busyChatId) {
  const pool = cfg.chars.filter(function (c) { return c.id !== busyChatId && !c.isNpc; });
  const source = pool.length >= 2 ? pool : cfg.chars.filter(function (c) { return c.id !== busyChatId; });
  if (!source.length) return [];
  // 每个周期只让 1 个角色发消息：避免一次生成 2~3 条、成倍消耗 API
  const picked = pickRandom(source, 1);
  const out = [];
  const now = Date.now();
  for (const c of picked) {
    const system = '你是「' + c.name + '」，现在主动给「' + cfg.user.name + '」发消息。\n'
      + (c.setting ? ('【你的人设】\n' + c.setting + '\n\n') : '')
      + '现在是 ' + new Date(now + 8 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ') + '（北京时间）。\n'
      + autoLangBlock(c)
      + cycleBlock(c)
      + '要求：像平时微信聊天一样主动说 1~2 句，自然、有生活感，符合你们的关系；不要解释、不要提系统/推送；不要每次都用“睡了吗/在吗”开头。只输出消息正文。';
    const text = await autoChat(env, cfg, [
      { role: 'system', content: system },
      { role: 'user', content: '发一条主动消息。' }
    ], 350, 1.0);
    const bubbles = splitAutoBubbles(text);
    if (!bubbles.length) continue;
    out.push({
      id: 'm_' + now + '_' + c.id,
      chatId: c.id, charId: c.id, name: c.name, avatar: c.avatar || '',
      text: bubbles.join('\n'), bubbles: bubbles, ts: now
    });
  }
  return out;
}
async function generateAutoMoments(env, cfg, busyChatId) {
  const pool = cfg.chars.filter(function (c) { return c.id !== busyChatId && !c.isNpc; });
  const source = pool.length ? pool : cfg.chars.filter(function (c) { return c.id !== busyChatId; });
  if (!source.length) return [];
  const picked = pickRandom(source, Math.min(2 + Math.floor(Math.random() * 2), source.length));
  const names = picked.map(function (c) { return c.name; });
  const sys = '你们是彼此认识的朋友，在同一个朋友圈里。请让以下角色各发一条朋友圈动态：' + names.join('、') + '。\n'
    + '要求：像真人随手发的日常，具体、有细节，不要流水账，不要对任何人说话，不要提问，禁止 AI 腔。\n'
    + '每条动态都要带 1~3 个点赞和 1~3 条评论；点赞/评论者只能从这些名字里选：' + names.join('、') + '，不能是动态作者本人，也不能出现「' + cfg.user.name + '」。\n'
    + '只输出 JSON 数组：[{"author":"名字","text":"动态文案","location":"地点或空","likes":["名字"],"comments":[{"user":"名字","toUser":"","text":"评论"}]}]';
  const content = await autoChat(env, cfg, [
    { role: 'system', content: sys },
    { role: 'user', content: '生成 ' + picked.length + ' 条朋友圈动态。' }
  ], 1400, 1.0);
  if (!content) return [];
  let arr = null;
  const a = content.indexOf('['), b = content.lastIndexOf(']');
  if (a > -1 && b > a) { try { arr = JSON.parse(content.slice(a, b + 1)); } catch (e) {} }
  if (!Array.isArray(arr)) return [];
  const nameSet = {};
  names.forEach(function (n) { nameSet[n] = true; });
  const pickName = function (raw) {
    const n = String(raw == null ? '' : raw).trim();
    if (!n) return '';
    if (nameSet[n]) return n;
    return names.find(function (x) { return x && (x.indexOf(n) > -1 || n.indexOf(x) > -1); }) || '';
  };
  const out = [];
  const now = Date.now();
  const canned = ['这条也太真实了', '哈哈哈哈', '我也想去', '注意休息呀', '好看', '下次带我'];
  arr.slice(0, 4).forEach(function (o, i) {
    if (!o || !o.text) return;
    const au = pickName(o.author) || names[Math.min(i, names.length - 1)];
    if (!au) return;
    const likes = [];
    (Array.isArray(o.likes) ? o.likes : []).forEach(function (raw) {
      const n = pickName(raw);
      if (n && n !== au && likes.indexOf(n) < 0) likes.push(n);
    });
    if (!likes.length) names.forEach(function (n) { if (n !== au && likes.length < 2) likes.push(n); });
    const comments = [];
    (Array.isArray(o.comments) ? o.comments : []).forEach(function (c) {
      if (!c || typeof c !== 'object') return;
      const u = pickName(c.user || c.name || c.author);
      const txt = String(c.text || c.content || '').trim();
      if (!u || !txt) return;
      comments.push({ user: u, toUser: pickName(c.toUser || c.replyTo || c.to), text: txt.slice(0, 120) });
    });
    // 模型漏写评论时也要有互动，不能只发一条光秃秃的动态。
    if (!comments.length) {
      const other = names.find(function (n) { return n !== au; });
      if (other) comments.push({ user: other, toUser: '', text: canned[(i + au.length) % canned.length] });
    }
    const char = picked.find(function (c) { return c.name === au; }) || {};
    out.push({
      id: 'srv_' + now + '_' + i + '_' + Math.random().toString(36).slice(2, 5),
      author: au, avatar: char.avatar || '', text: String(o.text).slice(0, 500),
      images: [], time: new Date(now - (arr.length - 1 - i) * 1800 * 1000).toISOString(),
      location: String(o.location || '').slice(0, 60), likes: likes, comments: comments.slice(0, 8),
      maskId: cfg.user.id
    });
  });
  return out;
}
async function runAutoPush(env) {
  const raw = await env.PUSH_KV.get('auto:config');
  if (!raw) return;
  let cfg;
  try { cfg = JSON.parse(raw); } catch (e) { return; }
  if (!cfg || !cfg.enabled) return;
  let state = {};
  try { const s = await env.PUSH_KV.get('auto:state'); state = s ? JSON.parse(s) : {}; } catch (e) { state = {}; }
  const now = Date.now();
  const subs = await getSubs(env);
  let busyChatId = '';
  try { busyChatId = String(await env.PUSH_KV.get('auto:call:' + cfg.user.id) || ''); } catch (e) {}
  if (cfg.msgEnabled && now >= (Number(state.nextMsgAt) || 0)) {
    const msgs = await generateAutoMessages(env, cfg, busyChatId);
    if (msgs.length) {
      const key = 'auto:msg:' + cfg.user.id;
      let list = [];
      try { const old = await env.PUSH_KV.get(key); list = old ? JSON.parse(old) : []; } catch (e) { list = []; }
      list = list.concat(msgs).slice(-20);
      await env.PUSH_KV.put(key, JSON.stringify(list));
      if (subs.length) {
        for (const m of msgs) {
          await pushAll(subs, {
            title: m.name, body: String(m.bubbles[0] || m.text || '').split('||')[0], target: 'chat:' + m.chatId,
            tag: 'auto-' + m.chatId
          }, env);
        }
      }
    }
    state.nextMsgAt = now + cfg.intervalMinutes * 60 * 1000;
  }
  if (cfg.momentEnabled && now >= (Number(state.nextMomentAt) || 0)) {
    const posts = await generateAutoMoments(env, cfg, busyChatId);
    if (posts.length) {
      const key = 'auto:moments:' + cfg.user.id;
      let list = [];
      try { const old = await env.PUSH_KV.get(key); list = old ? JSON.parse(old) : []; } catch (e) { list = []; }
      list = list.concat(posts).slice(-30);
      await env.PUSH_KV.put(key, JSON.stringify(list));
      if (subs.length) {
        await pushAll(subs, {
          title: '朋友圈', body: posts[0].author + ' 发了新动态', target: 'moments', tag: 'auto-moments'
        }, env);
      }
    }
    state.nextMomentAt = now + cfg.momentIntervalHours * 3600 * 1000;
  }
  await env.PUSH_KV.put('auto:state', JSON.stringify(state));
}

// 用服务端保存的 key 调主模型（Key 不出服务器），支持纯文本与「截图 + 文本」
async function peekModel(env, system, text, image, history) {
  const url = modelEndpoint(env.PEEK_API_URL);
  const key = env.PEEK_API_KEY;
  const model = env.PEEK_MODEL;
  if (!url || !key || !model) return null;
  let content;
  if (image) {
    content = [
      { type: 'text', text: text || '看看我现在屏幕上是什么，用你的人设随口说一句。' },
      { type: 'image_url', image_url: { url: image } }
    ];
  } else {
    content = text || '用你的人设随口说一句。';
  }
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  (history || []).forEach(function (t) {
    if (t.user) messages.push({ role: 'user', content: String(t.user) });
    if (t.char) messages.push({ role: 'assistant', content: String(t.char) });
  });
  messages.push({ role: 'user', content });
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({ model, messages, max_tokens: 900, temperature: 0.9 })
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const c = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  return c ? String(c).trim() : null;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    // ===== 反向代理：把国内可访问的自定义域名转到你的 Vercel 服务（如网易云音乐）=====
    // 需在 Worker 里设置 MUSIC_ORIGIN（例如 https://your-app.vercel.app）
    const __reqUrl = new URL(request.url);
    if (__reqUrl.hostname === 'music.nano315.online') {
      const origin = String(env.MUSIC_ORIGIN || '').replace(/\/+$/, '');
      if (!origin) return new Response('MUSIC_ORIGIN 未设置', { status: 500, headers: CORS });
      const target = origin + __reqUrl.pathname + __reqUrl.search;
      const fwd = new Headers(request.headers);
      fwd.delete('host'); fwd.delete('content-length');
      try {
        const resp = await fetch(target, {
          method: request.method,
          headers: fwd,
          body: (request.method === 'GET' || request.method === 'HEAD') ? undefined : request.body,
          redirect: 'manual'
        });
        const out = new Headers(resp.headers);
        out.set('Access-Control-Allow-Origin', '*');
        return new Response(resp.body, { status: resp.status, headers: out });
      } catch (e) {
        return new Response('proxy error: ' + (e && e.message ? e.message : e), { status: 502, headers: CORS });
      }
    }

    // 允许通过自定义域名路径前缀访问：https://nano315.online/nanoapi/xxx -> /xxx
    let pathname = __reqUrl.pathname;
    if (pathname.indexOf('/nanoapi') === 0) pathname = pathname.slice('/nanoapi'.length) || '/';

    // 公开的 VAPID 公钥：App 里一键开启 Web Push 时读取（私钥永远不返回）
    // 没配置 VAPID_* secrets 时自动生成并存入 KV，用户不需要手动生成。
    if (pathname === '/vapid' && request.method === 'GET') {
      const v = await ensureVapid(env);
      return json({ ok: !!v, key: v ? v.publicKey : '' });
    }

    // 1) 客户端订阅上报
    if (pathname === '/subscribe' && request.method === 'POST') {
      const { subscription } = await request.json();
      if (!subscription || !subscription.endpoint) return json({ ok: false, error: 'no subscription' }, 400);
      await env.PUSH_KV.put(subId(subscription.endpoint), JSON.stringify(subscription));
      return json({ ok: true });
    }

    // 2) 客户端预约提醒（到点后由 cron 推送）
    if (pathname === '/schedule' && request.method === 'POST') {
      if (!tokenOk(request, env)) return json({ ok: false, error: 'unauthorized' }, 401);
      const body = await request.json();
      const items = Array.isArray(body.items) ? body.items : [];
      for (const it of items) {
        if (!it || !it.at) continue;
        const id = 'job:' + Number(it.at) + ':' + Math.random().toString(36).slice(2, 8);
        await env.PUSH_KV.put(id, JSON.stringify(it));
      }
      return json({ ok: true, count: items.length });
    }

    // 3) 取消订阅
    if (pathname === '/unsubscribe' && request.method === 'POST') {
      const { endpoint } = await request.json();
      if (endpoint) await env.PUSH_KV.delete(subId(endpoint));
      return json({ ok: true });
    }

    // 4) 手动测试：给所有订阅者发一条
    if (pathname === '/send' && request.method === 'POST') {
      if (!tokenOk(request, env)) return json({ ok: false, error: 'unauthorized' }, 401);
      const count = await sendAll(env, { title: 'Nano', body: '测试推送：收到就成功了', target: '' });
      return json({ ok: true, count });
    }

    // 5) 屏幕速聊（iOS 快捷指令）：截图/文本 → 服务端用保存的 key 调模型 → 返回角色回复，并暂存轮次供 App 合并
    if (pathname === '/peek' && request.method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch (e) {}
      if (!peekOk(request, env, body)) return json({ ok: false, error: 'unauthorized' }, 401);
      const chatId = String(body.chatId || 'default');
      let system = String(body.system || '');
      // 快捷指令没带 system 时，用 App 最近同步过来的人设（谁当前在用就用谁的）
      if (!system) {
        try {
          system = (await env.PUSH_KV.get('peek:persona:' + chatId)) || (await env.PUSH_KV.get('peek:persona:latest')) || '';
        } catch (e) {}
      }
      const text = String(body.text || '').trim();
      const image = String(body.image || '').trim();
      if (!text && !image) return json({ ok: false, error: 'empty' }, 400);
      const history = await peekTurns(env, chatId);
      let reply = null;
      try { reply = await peekModel(env, system, text, image, history); } catch (e) {}
      if (!reply) return json({ ok: false, error: 'model' }, 502);
      history.push({ user: text || '[图片]', char: reply, ts: Date.now() });
      await peekSave(env, chatId, history);
      // 顺手把这条点评用 Web Push 推到已订阅的主屏 App：
      // 点通知会打开你「添加到主屏幕」的那个 Nano（sw.js 的 notificationclick），而不是 Safari。
      // 需要配置 VAPID_SUBJECT / VAPID_PUBLIC / VAPID_PRIVATE，且 App 已 NanoPush.enable()，否则自动跳过。
      try {
        var __subs = await getSubs(env);
        if (__subs.length) {
          await pushAll(__subs, { title: '窥屏', body: String(reply).slice(0, 120), target: 'chat:' + chatId, tag: 'peek-' + chatId }, env);
        }
      } catch (e) {}
      return json({ ok: true, reply: reply });
    }

    // 5.5) 人设同步：App 切换人设 / 发消息时上传当前角色人设，快捷指令就无需内置人设
    if (pathname === '/peek/persona' && request.method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch (e) {}
      if (!peekOk(request, env, body)) return json({ ok: false, error: 'unauthorized' }, 401);
      const system = String(body.system || '').trim();
      if (!system) return json({ ok: false, error: 'empty' }, 400);
      const chatId = String(body.chatId || 'latest');
      const ttl = 60 * 60 * 24 * 30;
      try {
        await env.PUSH_KV.put('peek:persona:' + chatId, system, { expirationTtl: ttl });
        await env.PUSH_KV.put('peek:persona:latest', system, { expirationTtl: ttl });
      } catch (e) {}
      return json({ ok: true });
    }

    // 6) App 拉取「屏幕速聊」暂存轮次（回到前台后合并进唯一聊天）
    if (pathname === '/peek/pending' && (request.method === 'GET' || request.method === 'POST')) {
      let body = {};
      if (request.method === 'POST') { try { body = await request.json(); } catch (e) {} }
      if (!peekOk(request, env, body)) return json({ ok: false, error: 'unauthorized' }, 401);
      let chatId = String((body && body.chatId) || '');
      if (!chatId) { try { chatId = new URL(request.url).searchParams.get('chatId') || ''; } catch (e) {} }
      if (!chatId) return json({ ok: false, error: 'no chatId' }, 400);
      const turns = await peekTurns(env, chatId);
      return json({ ok: true, turns: turns });
    }

    // 7) App 合并完成后清空暂存
    if (pathname === '/peek/ack' && request.method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch (e) {}
      if (!peekOk(request, env, body)) return json({ ok: false, error: 'unauthorized' }, 401);
      const chatId = String(body.chatId || '');
      if (chatId) await peekSave(env, chatId, []);
      return json({ ok: true });
    }

    // ============ 无后台主动消息 / 朋友圈 ============
    // POST /auto/config  同步开关、间隔、角色人设、模型配置
    if (pathname === '/auto/config' && request.method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch (e) {}
      if (!autoOk(request, env, body)) return json({ ok: false, error: 'unauthorized' }, 401);
      const cfg = sanitizeAutoConfig(body);
      await env.PUSH_KV.put('auto:config', JSON.stringify(cfg));
      const now = Date.now();
      let state = {};
      try { const s = await env.PUSH_KV.get('auto:state'); state = s ? JSON.parse(s) : {}; } catch (e) { state = {}; }
      if (cfg.msgEnabled) {
        if (!state.nextMsgAt || state.msgMins !== cfg.intervalMinutes || body.reset) {
          state.nextMsgAt = now + cfg.intervalMinutes * 60 * 1000;
        }
        state.msgMins = cfg.intervalMinutes;
      } else {
        state.nextMsgAt = 0;
        state.msgMins = cfg.intervalMinutes;
      }
      if (cfg.momentEnabled) {
        if (!state.nextMomentAt || state.momentHours !== cfg.momentIntervalHours || body.reset) {
          state.nextMomentAt = now + cfg.momentIntervalHours * 3600 * 1000;
        }
        state.momentHours = cfg.momentIntervalHours;
      } else {
        state.nextMomentAt = 0;
        state.momentHours = cfg.momentIntervalHours;
      }
      await env.PUSH_KV.put('auto:state', JSON.stringify(state));
      return json({ ok: true, enabled: cfg.enabled, nextMsgAt: state.nextMsgAt || 0, nextMomentAt: state.nextMomentAt || 0 });
    }

    // POST /auto/cycle  只更新角色的月潮权限数据，不动其它主动消息配置
    if (pathname === '/auto/cycle' && request.method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch (e) {}
      if (!autoOk(request, env, body)) return json({ ok: false, error: 'unauthorized' }, 401);
      try {
        const raw = await env.PUSH_KV.get('auto:config');
        if (raw) {
          const cfg = JSON.parse(raw);
          const cycles = body.cycles && typeof body.cycles === 'object' ? body.cycles : {};
          (cfg.chars || []).forEach(function (c) {
            const cy = cycles[c.id];
            c.cycle = (cy && /^\d{4}-\d{2}-\d{2}$/.test(String(cy.lastStart || ''))) ? {
              lastStart: String(cy.lastStart),
              nextStart: /^\d{4}-\d{2}-\d{2}$/.test(String(cy.nextStart || '')) ? String(cy.nextStart) : '',
              cycleLength: Math.max(18, Math.min(60, parseInt(cy.cycleLength, 10) || 28)),
              periodLength: Math.max(2, Math.min(14, parseInt(cy.periodLength, 10) || 5)),
              remindDays: Math.max(0, Math.min(14, parseInt(cy.remindDays, 10) || 0))
            } : null;
          });
          await env.PUSH_KV.put('auto:config', JSON.stringify(cfg));
        }
      } catch (e) {}
      return json({ ok: true });
    }

    // POST /auto/call  正在和某个角色通话时，跳过 TA 的主动消息/朋友圈
    if (pathname === '/auto/call' && request.method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch (e) {}
      if (!autoOk(request, env, body)) return json({ ok: false, error: 'unauthorized' }, 401);
      const userId = String(body.userId || 'default');
      const chatId = String(body.chatId || '');
      const active = !!body.active && !!chatId;
      try {
        if (active) await env.PUSH_KV.put('auto:call:' + userId, chatId, { expirationTtl: 60 * 60 * 3 });
        else await env.PUSH_KV.delete('auto:call:' + userId);
      } catch (e) {}
      return json({ ok: true });
    }

    // GET /auto/pending?userId=  拉取服务端生成、还没合并进 App 的消息/朋友圈
    if (pathname === '/auto/pending') {
      if (!autoOk(request, env, null)) return json({ ok: false, error: 'unauthorized' }, 401);
      const userId = String(new URL(request.url).searchParams.get('userId') || 'default');
      let messages = [], moments = [];
      try { const raw = await env.PUSH_KV.get('auto:msg:' + userId); messages = raw ? JSON.parse(raw) : []; } catch (e) {}
      try { const raw = await env.PUSH_KV.get('auto:moments:' + userId); moments = raw ? JSON.parse(raw) : []; } catch (e) {}
      return json({ ok: true, messages: messages, moments: moments });
    }

    // POST /auto/ack  合并完成后删除已拉取的条目
    if (pathname === '/auto/ack' && request.method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch (e) {}
      if (!autoOk(request, env, body)) return json({ ok: false, error: 'unauthorized' }, 401);
      const userId = String(body.userId || 'default');
      const mIds = Array.isArray(body.messageIds) ? body.messageIds : [];
      const pIds = Array.isArray(body.momentIds) ? body.momentIds : [];
      if (mIds.length) {
        try {
          const key = 'auto:msg:' + userId;
          const raw = await env.PUSH_KV.get(key);
          const list = raw ? JSON.parse(raw) : [];
          await env.PUSH_KV.put(key, JSON.stringify(list.filter(function (x) { return x && mIds.indexOf(x.id) < 0; })));
        } catch (e) {}
      }
      if (pIds.length) {
        try {
          const key = 'auto:moments:' + userId;
          const raw = await env.PUSH_KV.get(key);
          const list = raw ? JSON.parse(raw) : [];
          await env.PUSH_KV.put(key, JSON.stringify(list.filter(function (x) { return x && pIds.indexOf(x.id) < 0; })));
        } catch (e) {}
      }
      return json({ ok: true });
    }

    // ============ 共享集市（所有用户互相可见） ============
    // GET  /market/list          列出全部资源摘要
    if (pathname === '/market/list' && request.method === 'GET') {
      let items = [];
      try { const raw = await env.PUSH_KV.get('market:index'); items = raw ? JSON.parse(raw) : []; } catch (e) { items = []; }
      return json({ ok: true, items: items });
    }

    // GET  /market/item?id=xxx   取单条完整资源（含图片/文件 dataURL）
    if (pathname === '/market/item' && request.method === 'GET') {
      const id = new URL(request.url).searchParams.get('id') || '';
      if (!id) return json({ ok: false, error: 'no id' }, 400);
      const raw = await env.PUSH_KV.get('market:post:' + id);
      if (!raw) return json({ ok: false, error: 'not found' }, 404);
      let rec; try { rec = JSON.parse(raw); } catch (e) { return json({ ok: false }, 500); }
      return json({ ok: true, item: rec.item });
    }

    // POST /market/post          发布：{ item, summary, token }
    if (pathname === '/market/post' && request.method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch (e) {}
      const item = body.item, summary = body.summary, token = String(body.token || '');
      if (!item || !item.id) return json({ ok: false, error: 'no item' }, 400);
      const payload = JSON.stringify({ item: item, tok: token });
      if (payload.length > 24 * 1024 * 1024) return json({ ok: false, error: 'too large' }, 413);
      await env.PUSH_KV.put('market:post:' + item.id, payload);
      let items = [];
      try { const raw = await env.PUSH_KV.get('market:index'); items = raw ? JSON.parse(raw) : []; } catch (e) { items = []; }
      items = items.filter((x) => x && x.id !== item.id);
      if (summary) items.unshift(summary);
      if (items.length > 500) items = items.slice(0, 500);
      await env.PUSH_KV.put('market:index', JSON.stringify(items));
      return json({ ok: true, id: item.id });
    }

    // POST /market/count         计数：{ id, field, delta }
    if (pathname === '/market/count' && request.method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch (e) {}
      const id = String(body.id || ''), field = String(body.field || ''), delta = Number(body.delta) || 0;
      if (!id || ['likes', 'downloads', 'imports'].indexOf(field) < 0) return json({ ok: false, error: 'bad' }, 400);
      const key = 'market:post:' + id;
      const raw = await env.PUSH_KV.get(key);
      if (!raw) return json({ ok: false, error: 'not found' }, 404);
      let rec; try { rec = JSON.parse(raw); } catch (e) { return json({ ok: false }, 500); }
      rec.item[field] = Math.max(0, (Number(rec.item[field]) || 0) + delta);
      await env.PUSH_KV.put(key, JSON.stringify(rec));
      let items = [];
      try { const rawIdx = await env.PUSH_KV.get('market:index'); items = rawIdx ? JSON.parse(rawIdx) : []; } catch (e) { items = []; }
      const s = items.find((x) => x && x.id === id);
      if (s) { s[field] = rec.item[field]; await env.PUSH_KV.put('market:index', JSON.stringify(items)); }
      return json({ ok: true, value: rec.item[field] });
    }

    // POST /market/delete        删除：{ id, token }
    if (pathname === '/market/delete' && request.method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch (e) {}
      const id = String(body.id || ''), token = String(body.token || '');
      const key = 'market:post:' + id;
      const raw = await env.PUSH_KV.get(key);
      if (!raw) return json({ ok: false, error: 'not found' }, 404);
      let rec; try { rec = JSON.parse(raw); } catch (e) { return json({ ok: false }, 500); }
      if (rec.tok && rec.tok !== token) return json({ ok: false, error: 'forbidden' }, 403);
      await env.PUSH_KV.delete(key);
      let items = [];
      try { const rawIdx = await env.PUSH_KV.get('market:index'); items = rawIdx ? JSON.parse(rawIdx) : []; } catch (e) { items = []; }
      items = items.filter((x) => x && x.id !== id);
      await env.PUSH_KV.put('market:index', JSON.stringify(items));
      return json({ ok: true });
    }

    // ============ MCP 代理（绕开跨域，给 Nano 的 MCP app 用） ============
    // POST /mcp/proxy  { url, token?, sessionId?, headers?, method?, body }
    if (pathname === '/mcp/proxy' && request.method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch (e) {}
      if (env.MCP_TOKEN && request.headers.get('X-Mcp-Token') !== env.MCP_TOKEN) {
        return json({ ok: false, error: 'unauthorized' }, 401);
      }
      const target = String(body.url || '');
      if (!/^https:\/\//i.test(target)) return json({ ok: false, error: 'bad url' }, 400);
      const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' };
      if (body.token) headers['Authorization'] = 'Bearer ' + String(body.token);
      if (body.sessionId) headers['Mcp-Session-Id'] = String(body.sessionId);
      if (body.headers && typeof body.headers === 'object') {
        for (const k in body.headers) { if (/^[A-Za-z0-9-]+$/.test(k)) headers[k] = String(body.headers[k]); }
      }
      try {
        const resp = await fetch(target, {
          method: body.method || 'POST',
          headers: headers,
          body: body.body ? JSON.stringify(body.body) : undefined
        });
        const text = await resp.text();
        return json({
          ok: true, status: resp.status,
          contentType: resp.headers.get('content-type') || '',
          sessionId: resp.headers.get('mcp-session-id') || '',
          text: text
        });
      } catch (e) {
        return json({ ok: false, error: 'fetch failed: ' + (e && e.message ? e.message : e) }, 502);
      }
    }

    return json({ ok: true, info: 'nano-push alive' });
  },

  // 每 5 分钟触发：到点给 Bark 发提醒 + 处理 KV 里的预约任务
  async scheduled(event, env, ctx) {
    try { await sendBarkReminder(env); } catch (e) {}
    // 无后台主动消息 / 朋友圈：到点生成并推送
    try { await runAutoPush(env); } catch (e) {}

    const now = Date.now();
    const { keys } = await env.PUSH_KV.list({ prefix: 'job:' });
    if (!keys.length) return;
    const subs = await getSubs(env);
    for (const k of keys) {
      const raw = await env.PUSH_KV.get(k.name);
      if (!raw) continue;
      let job;
      try { job = JSON.parse(raw); } catch (e) { await env.PUSH_KV.delete(k.name); continue; }
      if ((Number(job.at) || 0) > now) continue;
      await env.PUSH_KV.delete(k.name);
      await pushAll(subs, { title: job.title || 'Nano', body: job.body || '', target: job.target || '' }, env);
    }
  }
};

// 到点给 Bark 发一条 iPhone 系统通知（BARK_KEY 未配置则跳过）
async function sendBarkReminder(env) {
  const key = env.BARK_KEY;
  if (!key) return;
  const times = String(env.REMIND_TIMES || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!times.length) return;
  // 换算北京时间
  const bj = new Date(Date.now() + 8 * 3600 * 1000);
  const cur = String(bj.getUTCHours()).padStart(2, '0') + ':' + String(bj.getUTCMinutes()).padStart(2, '0');
  if (!times.includes(cur)) return;
  const text = env.REMIND_TEXT || '有人想你了，点开看看～';
  const base = String(key).indexOf('http') === 0 ? String(key).replace(/\/+$/, '') : ('https://api.day.app/' + encodeURIComponent(key));
  const url = base + '/' + encodeURIComponent('你有一条新消息') + '/' + encodeURIComponent(text) + '?group=Nano&level=passive';
  try { await fetch(url); } catch (e) {}
}

async function getSubs(env) {
  const { keys } = await env.PUSH_KV.list({ prefix: 'sub:' });
  const out = [];
  for (const k of keys) {
    const v = await env.PUSH_KV.get(k.name);
    if (v) { try { out.push(JSON.parse(v)); } catch (e) {} }
  }
  return out;
}

async function pushAll(subs, payload, env) {
  const vapid = await ensureVapid(env);
  if (!vapid) return;
  for (const sub of subs) {
    try {
      const init = await buildPushPayload(
        { data: JSON.stringify(payload), options: { ttl: 3600 } },
        sub,
        { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey }
      );
      await fetch(sub.endpoint, init);
    } catch (e) { /* 单个失败不影响其他 */ }
  }
}

async function sendAll(env, payload) {
  const subs = await getSubs(env);
  await pushAll(subs, payload, env);
  return subs.length;
}
