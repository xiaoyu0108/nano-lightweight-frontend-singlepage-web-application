// nano-badge.js — 未读红点 / 最近活跃排序 的共享状态
// 约定：
//   nano_chat_activity : { [chatId]: epochMs }   最近一条消息时间（用于排序）
//   nano_unread_counts : { [chatId]: number }    未读条数（用于红点）
(function () {
    'use strict';

    var UNREAD_KEY = 'nano_unread_counts';
    var ACT_KEY = 'nano_chat_activity';

    function readMap(key) {
        try {
            var raw = localStorage.getItem(key);
            var o = raw ? JSON.parse(raw) : {};
            return (o && typeof o === 'object') ? o : {};
        } catch (e) { return {}; }
    }
    function writeMap(key, obj) {
        try { localStorage.setItem(key, JSON.stringify(obj || {})); } catch (e) {}
    }

    var ctx = { chatId: '', foreground: false };
    var lastNotifyAt = {};

    function markRead(chatId) {
        if (!chatId) return;
        var u = readMap(UNREAD_KEY);
        if (u[chatId]) { delete u[chatId]; writeMap(UNREAD_KEY, u); }
    }
    function activity(chatId) {
        if (!chatId) return;
        var a = readMap(ACT_KEY);
        a[chatId] = Date.now();
        writeMap(ACT_KEY, a);
    }
    // 收到角色/群消息：更新活跃时间；若当前不在前台则累加未读并触发通知
    function incoming(chatId, title, text, opts) {
        if (!chatId) return;
        activity(chatId);
        var isForeground = (ctx.foreground && ctx.chatId === chatId);
        if (isForeground) {
            markRead(chatId);
        } else {
            var u = readMap(UNREAD_KEY);
            u[chatId] = (parseInt(u[chatId] || 0, 10) || 0) + 1;
            writeMap(UNREAD_KEY, u);
        }
        if (isForeground) return; // 正在看这个聊天时不再弹通知/响铃
        // 同一会话短时间内只在第一条时通知，避免多行回复刷屏
        var now = Date.now();
        if (lastNotifyAt[chatId] && now - lastNotifyAt[chatId] < 2500) return;
        lastNotifyAt[chatId] = now;
        try {
            if (window.NanoNotify && window.NanoNotify.enabled()) {
                window.NanoNotify.notify(title || '新消息', text || '你有一条新消息', opts || {});
            }
        } catch (e) {}
    }
    function setContext(chatId) {
        ctx.chatId = chatId || '';
        ctx.foreground = true;
        activity(ctx.chatId);
        markRead(ctx.chatId);
    }
    function setForeground(on) { ctx.foreground = !!on; if (on) { activity(ctx.chatId); markRead(ctx.chatId); } }

    window.addEventListener('message', function (e) {
        var d = e.data;
        if (!d || typeof d !== 'object') return;
        if (d.type === 'nanoOverlayOpen') {
            if (d.chatId && d.chatId !== ctx.chatId) {
                ctx.foreground = false;
            } else {
                ctx.foreground = true;
                activity(ctx.chatId);
                markRead(ctx.chatId);
            }
        } else if (d.type === 'nanoOverlayClosed') {
            ctx.foreground = false;
        }
    });

    window.NanoBadge = {
        markRead: markRead,
        activity: activity,
        incoming: incoming,
        setContext: setContext,
        setForeground: setForeground,
        getUnread: function (chatId) { return parseInt(readMap(UNREAD_KEY)[chatId] || 0, 10) || 0; },
        getActivity: function (chatId) { return parseInt(readMap(ACT_KEY)[chatId] || 0, 10) || 0; }
    };
})();
