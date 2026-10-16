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
