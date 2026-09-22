/* sw.js — 用于 PWA 安装、通知点击聚焦。
   刻意不做离线缓存（不做 fetch 拦截缓存），避免更新应用时读到旧文件。
   注意：Service Worker 无法在应用被关闭后持续运行 AI 生成，
   “后台回复”依赖页面常驻 + Wake Lock，真正的后台计算需要服务端配合。 */
'use strict';

self.addEventListener('install', function (event) {
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(self.clients.claim());
});

// 仅透传请求（不缓存），保持可安装性与网络实时性
self.addEventListener('fetch', function (event) {
    // 只处理同源 GET；其余交给浏览器默认行为
    if (event.request.method !== 'GET') return;
    // 不拦截，避免缓存陈旧资源
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
            if (self.clients.openWindow) return self.clients.openWindow('./index.html');
        })
    );
});
