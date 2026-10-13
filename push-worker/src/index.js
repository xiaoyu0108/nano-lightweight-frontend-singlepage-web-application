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
    const { pathname } = new URL(request.url);

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
      const system = String(body.system || '');
      const text = String(body.text || '').trim();
      const image = String(body.image || '').trim();
      if (!text && !image) return json({ ok: false, error: 'empty' }, 400);
      const history = await peekTurns(env, chatId);
      let reply = null;
      try { reply = await peekModel(env, system, text, image, history); } catch (e) {}
      if (!reply) return json({ ok: false, error: 'model' }, 502);
      history.push({ user: text || '[图片]', char: reply, ts: Date.now() });
      await peekSave(env, chatId, history);
      return json({ ok: true, reply: reply });
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

    return json({ ok: true, info: 'nano-push alive' });
  },

  // 每 5 分钟触发：到点给 Bark 发提醒 + 处理 KV 里的预约任务
  async scheduled(event, env, ctx) {
    try { await sendBarkReminder(env); } catch (e) {}

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
  for (const sub of subs) {
    try {
      const init = await buildPushPayload(
        { data: JSON.stringify(payload), options: { ttl: 3600 } },
        sub,
        { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC, privateKey: env.VAPID_PRIVATE }
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
