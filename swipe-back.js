/* ============================================================
   swipe-back.js — iOS 风格「左边缘右滑返回」（基础版，无跟手动画）

   手指从左边缘向右滑 → 等同于点击当前页面自带的返回按钮。
   完全复用页面自己的点击逻辑（element.click()），不使用 history.back()。

   优先级：
     1. 有弹窗/浮层打开 → 先点可见的 [data-close]（关闭按钮统一加 data-close）
     2. 没有弹窗 → 点可见的 [data-back]（页面返回按钮）
     3. 页面自己没有返回按钮（如首页）→ 在 iframe 里时通知主框架点它自己的返回栏

   判定：
     - 起点 clientX < 30
     - 松手时横向位移 > 70px 且 > 纵向位移 * 2
     - touchmove 用 { passive: false }，确认是边缘右滑后 preventDefault()
     - 焦点在 input / textarea / 可编辑元素时不触发
   ============================================================ */
(function () {
    'use strict';

    var EDGE_PX = 30;      // 起点必须落在屏幕左侧 30px 内
    var MIN_X_PX = 70;     // 横向位移阈值
    var X_RATIO = 2;       // 横向位移必须大于纵向位移的 2 倍

    var startX = 0, startY = 0;
    var lastX = 0, lastY = 0;
    var tracking = false;

    function isVisible(el) {
        if (!el || !el.getBoundingClientRect) return false;
        var r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return false;
        var cs = window.getComputedStyle(el);
        if (!cs || cs.display === 'none' || cs.visibility === 'hidden') return false;
        if (parseFloat(cs.opacity || '1') === 0) return false;
        return true;
    }

    // 焦点在输入框里时不抢手势
    function isEditing() {
        var ae = document.activeElement;
        if (!ae) return false;
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return true;
        return !!ae.isContentEditable;
    }

    // 可见的关闭按钮：[data-close]（取 DOM 里最后一个 = 最上层）
    function findClose() {
        var list = document.querySelectorAll('[data-close]');
        var hit = null;
        for (var i = 0; i < list.length; i++) {
            if (isVisible(list[i])) hit = list[i];
        }
        return hit;
    }

    // 可见的返回按钮：[data-back]（取 DOM 里最后一个 = 最上层）
    function findBack() {
        var list = document.querySelectorAll('[data-back]');
        var hit = null;
        for (var i = 0; i < list.length; i++) {
            if (isVisible(list[i])) hit = list[i];
        }
        return hit;
    }

    // 当前最上层的整屏浮层（弹窗/抽屉/sheet…），用于避免“点穿浮层误触返回”
    var LAYER_NAME = /(modal|overlay|popup|sheet|dialog|alert|backdrop|drawer|fullscreen|mask|menu|panel)/i;
    function findLayer() {
        var nodes = document.body ? document.body.querySelectorAll('*') : [];
        var layer = null;
        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            var tag = el.tagName;
            if (tag === 'IFRAME' || tag === 'SCRIPT' || tag === 'STYLE') continue;
            if (!LAYER_NAME.test((el.className || '') + ' ' + (el.id || ''))) continue;
            var cs = window.getComputedStyle(el);
            if (!cs) continue;
            if (cs.display === 'none' || cs.visibility === 'hidden') continue;
            if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
            if (parseFloat(cs.zIndex || '0') < 10) continue;
            var r = el.getBoundingClientRect();
            if (r.width < window.innerWidth * 0.6 || r.height < window.innerHeight * 0.4) continue;
            layer = el;
        }
        return layer;
    }

    function contains(parent, child) {
        return !!(parent && child && (parent === child || parent.contains(child)));
    }

    function trigger() {
        // 1) 先关弹窗
        var close = findClose();
        if (close) { close.click(); return; }

        // 2) 再点本页返回按钮
        var layer = findLayer();
        var back = findBack();
        if (back && (!layer || contains(layer, back))) { back.click(); return; }

        // 有浮层但找不到关闭按钮：什么都不做，避免误触返回
        if (layer) return;

        // 3) 本页没有返回按钮（如首页）：交给主框架的返回栏（index.html 里就是 #overlayBack）
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'swipeBack' }, '*');
            }
        } catch (e) {}
    }

    // ===== 兜住 iOS 系统边缘手势 / 浏览器「返回」=====
    // 不加这层的话：手指停几秒再滑，iOS 会自己执行「返回上一页」（历史后退），
    // 而不是走本页的返回按钮逻辑。这里把历史后退拦下来，改成本页返回按钮逻辑。
    var backGuardBusy = false;
    function installHistoryGuard() {
        try {
            if (!document.querySelector('[data-back]') && !document.querySelector('[data-close]')) return;
            history.pushState({ nanoBackGuard: 1 }, '');
            window.addEventListener('popstate', function () {
                if (backGuardBusy) return;
                backGuardBusy = true;
                setTimeout(function () { backGuardBusy = false; }, 400);
                try { history.pushState({ nanoBackGuard: 1 }, ''); } catch (e) {}
                try { trigger(); } catch (e) {}
            });
        } catch (e) {}
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', installHistoryGuard);
    } else {
        installHistoryGuard();
    }

    document.addEventListener('touchstart', function (e) {
        tracking = false;
        if (!e.touches || e.touches.length !== 1) return;
        var t = e.touches[0];
        if (t.clientX >= EDGE_PX) return;   // 必须从边缘开始
        if (isEditing()) return;
        startX = lastX = t.clientX;
        startY = lastY = t.clientY;
        tracking = true;
    }, { passive: true });

    document.addEventListener('touchmove', function (e) {
        if (!tracking) return;
        if (!e.touches || e.touches.length !== 1) { tracking = false; return; }
        var t = e.touches[0];
        var dx = t.clientX - startX;
        var dy = t.clientY - startY;

        // 不是右滑 / 偏竖直：放弃（不阻止默认行为，保证页面还能正常滚动）
        if (dx <= 0 || Math.abs(dy) > dx) { tracking = false; return; }

        lastX = t.clientX;
        lastY = t.clientY;

        if (dx > 10 && e.cancelable) e.preventDefault();
    }, { passive: false });

    function finish(e) {
        var wasTracking = tracking;
        tracking = false;
        if (!wasTracking) return;
        if (isEditing()) return;

        var dx = lastX - startX;
        var dy = lastY - startY;
        if (dx > MIN_X_PX && dx > Math.abs(dy) * X_RATIO) trigger();
    }

    document.addEventListener('touchend', finish, { passive: true });
    document.addEventListener('touchcancel', function () { tracking = false; }, { passive: true });

    // 便于调试/其它脚本主动触发
    window.__nanoSwipeBack = { trigger: trigger };
})();
