/* sw.js — 用于 PWA 安装、通知点击聚焦、静态资源加速。
   缓存策略（解决“每次打开都要好几秒”）：
     · HTML：先联网（保证拿到最新版本），断网时用缓存兜底
     · CSS / JS / 图片 / 图标 / 字体：先用缓存秒开，后台静默更新（stale-while-revalidate）
       —— 改了代码刷新两次即可看到新版；不想等可以给 CACHE 换个版本号
     · 跨域（CDN）请求不拦截，交给浏览器自己的缓存
   注意：Service Worker 无法在应用被关闭后持续运行 AI 生成，
   “后台回复”依赖页面常驻 + 音频保活；真正的“关闭也能收到”需要服务端配合（见 push 事件）。 */
'use strict';

var CACHE = 'nano-static-v1';
var STATIC_RE = /\.(css|js|png|jpg|jpeg|webp|svg|gif|ico|woff2?|ttf|mp3)$/i;

self.addEventListener('install', function (event) {
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
        }).then(function () { return self.clients.claim(); })
    );
});

self.addEventListener('fetch', function (event) {
    var req = event.request;
    if (req.method !== 'GET') return;
    var url;
    try { url = new URL(req.url); } catch (e) { return; }
    if (url.origin !== self.location.origin) return;

    var isHTML = req.mode === 'navigate' || /\.html?$/i.test(url.pathname) || /\/$/.test(url.pathname);
    if (isHTML) {
        // 60 秒内直接用缓存（页面之间切换秒开），超过就联网拿最新，联网失败退回缓存
        event.respondWith(
            caches.open(CACHE).then(function (cache) {
                return cache.match(req).then(function (cached) {
                    var fresh = false;
                    try {
                        var at = parseInt((cached && cached.headers.get('x-nano-at')) || '0', 10);
                        fresh = !!cached && (Date.now() - at < 60000);
                    } catch (e) {}
                    if (fresh) return cached;
                    return fetch(req).then(function (res) {
                        try {
                            var h = new Headers(res.headers);
                            h.set('x-nano-at', String(Date.now()));
                            cache.put(req, new Response(res.clone().body, {
                                status: res.status, statusText: res.statusText, headers: h
                            }));
                        } catch (e) {}
                        return res;
                    }).catch(function () { return cached || caches.match('./index.html'); });
                });
            })
        );
        return;
    }

    if (!STATIC_RE.test(url.pathname)) return;
    event.respondWith(
        caches.open(CACHE).then(function (cache) {
            return cache.match(req).then(function (cached) {
                var network = fetch(req).then(function (res) {
                    try { if (res && res.status === 200) cache.put(req, res.clone()); } catch (e) {}
                    return res;
                }).catch(function () { return cached; });
                return cached || network;
            });
        })
    );
});

// 真正的「应用已关闭也能收到」推送需要服务端配合（Web Push）：
// 服务端拿 VAPID 私钥向这里的订阅端点发 push，下面的 push 事件就会弹系统通知。
// 生成内容仍然发生在客户端（用的是你自己的 API Key），所以服务端只负责“到点提醒”。
self.addEventListener('push', function (event) {
    var data = { title: 'Nano', body: '你有一条新消息', target: '' };
    try {
        if (event.data) {
            try { Object.assign(data, event.data.json()); }
            catch (e) { data.body = event.data.text ? event.data.text() : data.body; }
        }
    } catch (e) {}
    event.waitUntil(
        self.registration.showNotification(data.title || 'Nano', {
            body: data.body || '',
            tag: data.tag || ('nano-push-' + Date.now()),
            data: { target: data.target || '' }
        })
    );
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
            for (var i = 0; i < list.length; i++) {
                var c = list[i];
                if ('focus' in c) {
                    try { c.postMessage({ type: 'notifyOpen', target: (event.notification.data && event.notification.data.target) || '' }); } catch (e) {}
                    return c.focus();
                }
            }
            if (self.clients.openWindow) {
                // 应用已被关闭：把目标带在 URL 上，冷启动后 index.html 会自己跳转
                var t = (event.notification.data && event.notification.data.target) || '';
                return self.clients.openWindow('./index.html' + (t ? ('?open=' + encodeURIComponent(t)) : ''));
            }
        })
    );
});
