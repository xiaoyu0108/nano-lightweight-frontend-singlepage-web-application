// ===== beautify.js =====
"use strict";

/* ============================================================
   内置模板 - 全局CSS
   ============================================================ */
const GLOBAL_TEMPLATE_OLD = `/* ===== 全局美化模板 ===== 
   内置 index 框架 + chat 列表页 CSS，可直接修改覆盖所有页面的配色/按钮/底栏/API/More 等 UI。
   注意：全局样式在聊天内页也会生效，且优先生效。
*/

:root {
            --safe-inset-top: var(--safe-top, env(safe-area-inset-top, 0px));
        }
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif;
            -webkit-tap-highlight-color: transparent;
        }

        /* 注意：这里不要写 position:fixed / overflow:hidden / top / left，
           否则 discover / more 等可滚动页会被锁死无法滑动。
           index 的滚动锁定已由 index.html 自身的样式负责。 */
        html, body {
            width: 100%;
            height: 100%;
            margin: 0;
            padding: 0;
            background: #ffffff;
        }

        .app-container {
            width: 100%;
            height: 100%;
            max-width: 430px;
            margin: 0 auto;
            background: #ffffff;
            padding: 0 16px 0 16px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            border: none;
            position: relative;
        }

        .app-container > .top-bar {
            position: absolute;
            top: 14px;
            left: 16px;
            right: 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            z-index: 20;
            pointer-events: none;
        }
        .app-container > .top-bar.hidden {
            display: none !important;
        }
        .app-container > .top-bar>* {
            pointer-events: auto;
        }
        .app-container > .top-bar .spacer {
            flex: 1;
        }

        .menu-btn, .add-btn {
            width: 38px;
            height: 38px;
            border-radius: 38px;
            background: rgba(0, 0, 0, 0.03);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
            border: 0.5px solid rgba(0, 0, 0, 0.04);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 17px;
            color: #1c1c1e;
            cursor: pointer;
            transition: all 0.15s;
            flex-shrink: 0;
            background: #ffffff;
        }
        .menu-btn:active, .add-btn:active {
            transform: scale(0.88);
            background: rgba(0, 0, 0, 0.05);
        }
        .add-btn {
            color: #007aff;
            font-size: 20px;
        }

        .iframe-container {
            flex: 1;
            display: none;
            flex-direction: column;
            overflow: hidden;
            min-height: 0;
            border-radius: 16px;
            background: transparent;
            position: relative;
        }
        .iframe-container.active {
            display: flex;
        }
        .iframe-container iframe {
            width: 100%;
            height: 100%;
            border: none;
            background: transparent;
        }

        .bottom-actions {
            position: absolute;
            bottom: 28px;
            left: 16px;
            right: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            z-index: 20;
            pointer-events: none;
            background: transparent;
        }
        .bottom-actions.hidden {
            display: none !important;
        }
        .bottom-actions>* {
            pointer-events: auto;
        }

        .capsule-group {
            display: flex;
            background: rgba(255, 255, 255, 0.35);
            backdrop-filter: blur(30px) saturate(240%);
            -webkit-backdrop-filter: blur(30px) saturate(240%);
            border-radius: 50px;
            padding: 5px 8px;
            border: 0.5px solid rgba(255, 255, 255, 0.45);
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
            gap: 2px;
        }

        .capsule-btn {
            width: 50px;
            height: 40px;
            border-radius: 40px;
            background: transparent;
            border: none;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            color: #8e8e93;
            cursor: pointer;
            transition: all 0.15s;
        }
        .capsule-btn:active {
            transform: scale(0.88);
            background: rgba(0, 122, 255, 0.08);
        }
        .capsule-btn.active-btn {
            background: rgba(0, 122, 255, 0.15);
            color: #007aff;
            box-shadow: none;
        }

        .circle-more {
            width: 52px;
            height: 52px;
            border-radius: 52px;
            background: #ffffff;
            border: 0.5px solid rgba(0, 0, 0, 0.04);
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            color: #8e8e93;
            cursor: pointer;
            transition: all 0.15s;
        }
        .circle-more:active {
            transform: scale(0.88);
            background: rgba(0, 122, 255, 0.08);
        }
        .circle-more.active-btn {
            background: rgba(0, 122, 255, 0.15);
            color: #007aff;
            box-shadow: none;
        }

        .fullscreen-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: #ffffff;
            z-index: 100;
            display: none;
            flex-direction: column;
            overflow: hidden;
            border: none;
            padding: 0 16px 0 16px;
        }
        .fullscreen-overlay.active {
            display: flex;
        }
        .fullscreen-overlay.no-header .overlay-header {
            display: none;
        }

        .overlay-inner {
            width: 100%;
            max-width: 430px;
            margin: 0 auto;
            height: 100%;
            display: flex;
            flex-direction: column;
        }

        .overlay-header {
            display: flex;
            justify-content: flex-start;
            align-items: center;
            padding: 14px 0 12px 0;
            flex-shrink: 0;
            position: relative;
        }
        .overlay-header .back-btn {
            width: 38px;
            height: 38px;
            border-radius: 38px;
            background: rgba(0, 0, 0, 0.03);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
            border: 0.5px solid rgba(0, 0, 0, 0.04);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 17px;
            color: #1c1c1e;
            cursor: pointer;
            transition: all 0.15s;
            background: #ffffff;
            flex-shrink: 0;
        }
        .overlay-header .back-btn:active {
            transform: scale(0.88);
            background: rgba(0, 0, 0, 0.05);
        }
        .overlay-header .back-btn.hidden {
            display: none !important;
        }
        .overlay-header .overlay-title {
            flex: 1;
            text-align: center;
            font-size: 17px;
            font-weight: 600;
            color: #1c1c1e;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .overlay-header .placeholder {
            width: 38px;
            flex-shrink: 0;
        }

        .overlay-content {
            flex: 1;
            overflow: hidden;
            min-height: 0;
            border-radius: 16px;
            background: transparent;
            position: relative;
        }
        .overlay-content iframe {
            width: 100%;
            height: 100%;
            border: none;
            background: transparent;
        }
        #voiceCallFrame {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            border: none;
            background: transparent;
            display: none;
        }
        #chatInnerFrame {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            border: none;
            background: transparent;
            display: none;
        }
        #musicFrame {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            border: none;
            background: transparent;
            display: none;
        }

        /* ===== 语音悬浮球 - 白色底色 + 绿色电话 ===== */
        .voice-float-ball {
            position: fixed;
            width: 64px;
            height: 64px;
            border-radius: 50%;
            background: #ffffff;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04);
            cursor: grab;
            z-index: 99999;
            display: none;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            user-select: none;
            -webkit-user-select: none;
            touch-action: none;
            transition: transform 0.15s, box-shadow 0.15s;
        }

        .voice-float-ball:active {
            cursor: grabbing;
            transform: scale(0.92);
        }

        .voice-float-ball .ball-icon {
            width: 24px;
            height: 24px;
            stroke: #34c759;
            stroke-width: 2.5;
            fill: none;
            stroke-linecap: round;
            stroke-linejoin: round;
            pointer-events: none;
        }

        .voice-float-ball .ball-time {
            font-size: 10px;
            color: #1c1c1e;
            font-weight: 600;
            letter-spacing: 0.5px;
            margin-top: 1px;
            pointer-events: none;
        }

        .voice-float-ball.dragging {
            transition: none;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(0, 0, 0, 0.06);
        }

        /* ===== 手机/窄屏：去掉手机壳式左右白边，页面保持原布局高度 ===== */
        @media (max-width: 520px) {
            .app-container {
                padding: 0;
            }
            .fullscreen-overlay {
                padding: 0;
            }
            .overlay-inner {
                max-width: none;
            }
            .overlay-content {
                border-radius: 0;
            }
        }

/* ================= chat 列表页 (/css/chat.css) ================= */
/* Nano 品牌 */
.nano-brand {
    font-family: "Georgia", "Times New Roman", serif;
    font-size: 34px;
    font-weight: 700;
    letter-spacing: 3px;
    padding: 18px 0 10px 0;
    flex-shrink: 0;
    text-align: left;
    background: linear-gradient(180deg, #ffffff 0%, #b8b8c0 40%, #6c6c70 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    filter: drop-shadow(0 1px 3px rgba(0,0,0,0.03));
    margin-left: -4px;
}

/* 状态栏 */
.user-status-wrapper {
    position: relative;
    flex-shrink: 0;
    margin: 0 0 12px 0;
}
.user-status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px 8px 8px;
    background: #ffffff;
    border-radius: 16px;
    cursor: pointer;
    transition: background 0.15s;
    min-height: 44px;
    width: 100%;
    border: 0.5px solid rgba(0, 0, 0, 0.03);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.02);
}
.user-status-bar:active { background: #f5f5f7; }

.user-status-bar .left {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
}
.user-status-bar .left .user-avatar {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    overflow: hidden;
    background: #e8e8ec;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 500;
    color: #8e8e93;
    border: 0.5px solid rgba(0, 0, 0, 0.04);
}
.user-status-bar .left .user-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.user-status-bar .left .user-name {
    font-size: 15px;
    font-weight: 600;
    color: #1c1c1e;
    letter-spacing: -0.3px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.user-status-bar .left .user-name .placeholder {
    color: #aeaeb2;
    font-weight: 400;
}
.user-status-bar .right {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #aeaeb2;
    font-size: 12px;
    font-weight: 400;
    flex-shrink: 0;
}
.user-status-bar .right .char-count {
    color: #1c1c1e;
    font-weight: 600;
    font-size: 14px;
}
.user-status-bar .right .arrow {
    font-size: 12px;
    color: #8e8e93;
    transition: transform 0.25s ease;
    margin-left: 2px;
}
.user-status-bar .right .arrow.open {
    transform: rotate(180deg);
}

/* 下拉菜单 */
.user-dropdown {
    display: none;
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    background: #ffffff;
    border-radius: 14px;
    border: 0.5px solid rgba(0, 0, 0, 0.04);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
    z-index: 50;
    max-height: 200px;
    overflow-y: auto;
    padding: 6px 6px;
}
.user-dropdown::-webkit-scrollbar { width: 0; }
.user-dropdown.show { display: block; }
.user-dropdown .dropdown-item {
    display: flex;
    align-items: center;
    padding: 10px 12px;
    gap: 10px;
    cursor: pointer;
    transition: background 0.1s;
    border-radius: 10px;
}
.user-dropdown .dropdown-item:active { background: #f5f5f7; }
.user-dropdown .dropdown-item .d-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: #f0f0f3;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 500;
    color: #8e8e93;
    flex-shrink: 0;
    overflow: hidden;
}
.user-dropdown .dropdown-item .d-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.user-dropdown .dropdown-item .d-name {
    flex: 1;
    font-size: 14px;
    color: #1c1c1e;
    font-weight: 500;
}
.user-dropdown .dropdown-item .d-check {
    color: #34c759;
    font-size: 14px;
}
.user-dropdown .dropdown-item .d-check.hidden {
    visibility: hidden;
}

/* 头像行 */
.avatar-row {
    display: flex;
    gap: 10px;
    padding: 4px 0 14px 0;
    flex-shrink: 0;
    overflow-x: auto;
    overflow-y: visible;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    flex-wrap: nowrap;
}
.avatar-row::-webkit-scrollbar { display: none; }

.avatar-item {
    width: 56px;
    height: 56px;
    min-width: 56px;
    border-radius: 56px;
    background: #f0f0f3;
    border: 0.5px solid rgba(0, 0, 0, 0.04);
    box-shadow: none;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    font-weight: 500;
    color: #8e8e93;
    cursor: pointer;
    flex-shrink: 0;
    overflow: hidden;
    transition: all 0.1s;
    position: relative;
}
.avatar-add {
    background: #f0f0f3;
    border: 0.5px solid rgba(0, 0, 0, 0.04);
    color: #aeaeb2;
    font-size: 26px;
    cursor: default;
    opacity: 0.6;
}
.avatar-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    position: relative;
    z-index: 2;
}
.avatar-item.has-image {
    background: transparent !important;
}

/* 搜索框 */
.search-wrap {
    padding: 0 0 8px 0;
    flex-shrink: 0;
}
.search-box {
    background: #f5f5f7;
    border-radius: 28px;
    padding: 6px 14px;
    border: 0.5px solid rgba(0, 0, 0, 0.02);
    box-shadow: none;
    display: flex;
    align-items: center;
    gap: 6px;
}
.search-box i {
    color: #aeaeb2;
    font-size: 14px;
    cursor: pointer;
}
.search-box input {
    background: transparent;
    border: none;
    outline: none;
    flex: 1;
    font-size: 15px;
    font-weight: 400;
    color: #1c1c1e;
    letter-spacing: -0.2px;
    padding: 4px 0;
    min-width: 0;
    width: 100%;
}
.search-box input::placeholder {
    color: #aeaeb2;
    font-weight: 400;
}
.search-clear {
    color: #aeaeb2;
    font-size: 14px;
    cursor: pointer;
    padding: 2px 2px;
    opacity: 0.5;
    transition: 0.1s;
    display: flex;
    align-items: center;
}
.search-clear:hover { opacity: 0.9; }
.search-clear.hidden { display: none; }

/* Tab 切换 */
.tabs-switch {
    display: flex;
    justify-content: center;
    padding: 2px 0 10px 0;
    flex-shrink: 0;
}
.tab-group {
    display: flex;
    background: #f5f5f7;
    border-radius: 30px;
    padding: 3px;
    border: 0.5px solid rgba(0, 0, 0, 0.02);
    box-shadow: none;
}
.tab-btn {
    padding: 5px 22px;
    border-radius: 30px;
    font-size: 15px;
    font-weight: 500;
    color: #8e8e93;
    cursor: pointer;
    transition: all 0.15s;
    background: transparent;
    border: none;
    letter-spacing: -0.2px;
}
.tab-btn.active {
    background: #ffffff;
    box-shadow: 0 2px 8px rgba(0,0,0,0.04);
    color: #1c1c1e;
    font-weight: 600;
}
.tab-btn:active { transform: scale(0.94); }

/* 聊天列表 */
.chat-list {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 4px 0 8px 0;
    overflow-y: auto;
    min-height: 0;
    scrollbar-width: thin;
    scrollbar-color: rgba(0,0,0,0.02) transparent;
}
.chat-list::-webkit-scrollbar {
    width: 3px;
}
.chat-list::-webkit-scrollbar-thumb {
    background: rgba(0,0,0,0.03);
    border-radius: 20px;
}

.chat-item {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 12px;
    background: transparent;
    backdrop-filter: none;
    border-radius: 0;
    border: none;
    border-bottom: 0.5px solid rgba(0, 0, 0, 0.04);
    box-shadow: none;
    transition: background 0.08s;
    cursor: pointer;
    flex-shrink: 0;
}
.chat-item:last-child { border-bottom: none; }
.chat-item:active { background: #f5f5f7; }
.chat-item.hidden-item { display: none; }

.chat-avatar {
    width: 48px;
    height: 48px;
    border-radius: 48px;
    background: #f0f0f3;
    flex-shrink: 0;
    overflow: hidden;
    border: 0.5px solid rgba(0,0,0,0.04);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    font-weight: 500;
    color: #8e8e93;
}
.chat-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.chat-info {
    flex: 1;
    min-width: 0;
}
.chat-name {
    font-size: 15px;
    font-weight: 600;
    color: #1c1c1e;
    letter-spacing: -0.2px;
    display: flex;
    align-items: baseline;
    gap: 6px;
}
.chat-name span {
    font-weight: 400;
    font-size: 12px;
    color: #aeaeb2;
}
.chat-msg {
    font-size: 13px;
    color: #aeaeb2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 140px;
    margin-top: 2px;
}
.chat-time {
        font-size: 11px;
        color: #aeaeb2;
        white-space: nowrap;
        padding-left: 8px;
    }
    .chat-unread {
        min-width: 20px;
        height: 20px;
        padding: 0 6px;
        border-radius: 10px;
        background: #ff3b30;
        color: #fff;
        font-size: 12px;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        margin-left: 6px;
        box-sizing: border-box;
    }

.no-result {
    display: none;
    text-align: center;
    padding: 40px 0;
    color: #aeaeb2;
    font-size: 15px;
}
.no-result.active { display: block; }

/* ===== 聊天卡片左滑：置顶 / 删除 ===== */
.chat-item-wrap {
    position: relative;
    overflow: hidden;
    background: #fff;
    border-bottom: 0.5px solid rgba(0, 0, 0, 0.04);
    flex-shrink: 0;
}
.chat-item-wrap:last-child {
    border-bottom: none;
}
.chat-swipe-actions {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    display: flex;
    width: 148px;
    transform: translateX(148px);
    transition: transform 0.18s ease;
}
.chat-item-wrap.swiped .chat-swipe-actions {
    transform: translateX(0);
}
.chat-swipe-actions .chat-swipe-btn {
    flex: 1;
    border: none;
    color: #fff;
    font-size: 15px;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
}
.chat-swipe-actions .chat-swipe-btn:active {
    opacity: 0.8;
}
.chat-swipe-actions .pin {
    background: #ffcc00;
    color: #3c3c3c;
}
.chat-swipe-actions .del {
    background: #ff3b30;
}
.chat-swipe-front {
    position: relative;
    z-index: 1;
    background: #fff;
    transition: transform 0.18s ease;
}
.chat-item-wrap.swiped .chat-swipe-front {
    transform: translateX(-148px);
}
.chat-item-wrap.swiped .chat-item:active {
    background: #f5f5f7;
}
.chat-item-wrap .chat-item {
    border-bottom: none;
}


/* ===== 群聊创建弹窗 ===== */
.group-modal {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.05);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    align-items: center;
    justify-content: center;
    z-index: 999;
}
.group-modal.active { display: flex; }
.group-modal-card {
    width: 340px;
    max-height: 80vh;
    background: rgba(255, 255, 255, 0.85);
    backdrop-filter: blur(50px);
    -webkit-backdrop-filter: blur(50px);
    border-radius: 24px;
    padding: 24px 20px 18px;
    box-shadow: 0 30px 60px rgba(0,0,0,0.08);
    border: 0.5px solid rgba(255, 255, 255, 0.3);
    overflow-y: auto;
}
.group-modal-card h4 {
    font-weight: 600;
    font-size: 18px;
    color: #1c1c1e;
    text-align: center;
    margin-bottom: 4px;
}
.group-modal-card .sub-title {
    font-size: 13px;
    color: #aeaeb2;
    text-align: center;
    margin-bottom: 16px;
}

.group-form-group {
    margin-bottom: 14px;
}
.group-form-group label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: #8e8e93;
    margin-bottom: 4px;
}
.group-form-group input {
    width: 100%;
    padding: 10px 14px;
    border-radius: 12px;
    border: 0.5px solid rgba(0, 0, 0, 0.04);
    font-size: 15px;
    background: rgba(255, 255, 255, 0.4);
    backdrop-filter: blur(6px);
    outline: none;
    transition: all 0.2s;
    color: #1c1c1e;
}
.group-form-group input:focus {
    border-color: rgba(0, 0, 0, 0.12);
    background: rgba(255, 255, 255, 0.6);
}

.group-avatar-picker {
    display: flex;
    justify-content: center;
    margin-bottom: 14px;
}
.group-avatar-picker .g-avatar {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    background: #f0f0f3;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    font-weight: 500;
    color: #8e8e93;
    cursor: pointer;
    overflow: hidden;
    border: 0.5px solid rgba(0, 0, 0, 0.04);
    transition: background 0.15s;
    position: relative;
}
.group-avatar-picker .g-avatar:active { background: #e8e8ec; }
.group-avatar-picker .g-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.group-avatar-picker .g-avatar .hint {
    position: absolute;
    bottom: 2px;
    right: 2px;
    background: rgba(0,0,0,0.10);
    color: white;
    font-size: 8px;
    padding: 2px 6px;
    border-radius: 4px;
    backdrop-filter: blur(4px);
}

.group-member-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 10px 0 14px 0;
    max-height: 150px;
    overflow-y: auto;
}
.group-member-list::-webkit-scrollbar { width: 0; }
.group-member-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    border-radius: 10px;
    background: rgba(0,0,0,0.02);
}
.group-member-item .gm-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: #f0f0f3;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 500;
    color: #8e8e93;
    flex-shrink: 0;
    overflow: hidden;
}
.group-member-item .gm-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.group-member-item .gm-name {
    flex: 1;
    font-size: 14px;
    color: #1c1c1e;
}
.group-member-item .gm-remove {
    color: #aeaeb2;
    cursor: pointer;
    padding: 4px 6px;
    font-size: 14px;
}
.group-member-item .gm-remove:active { color: #ff3b30; }

.group-add-member-row {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-bottom: 10px;
}
.group-add-member-row select {
    flex: 1;
    padding: 8px 12px;
    border-radius: 10px;
    border: 0.5px solid rgba(0, 0, 0, 0.04);
    font-size: 14px;
    background: rgba(255, 255, 255, 0.4);
    outline: none;
    color: #1c1c1e;
}
.group-add-member-row .btn-add-member {
    padding: 8px 16px;
    border: none;
    border-radius: 10px;
    background: #007aff;
    color: white;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
}
.group-add-member-row .btn-add-member:active {
    transform: scale(0.94);
    opacity: 0.8;
}

.group-modal-actions {
    display: flex;
    gap: 10px;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 0.5px solid rgba(0, 0, 0, 0.04);
}
.group-modal-actions button {
    flex: 1;
    padding: 12px 0;
    border-radius: 14px;
    font-size: 16px;
    font-weight: 600;
    border: none;
    cursor: pointer;
    transition: 0.1s;
}
.group-modal-actions button:active { transform: scale(0.96); }
.group-modal-actions .btn-add {
    background: #007aff;
    color: #fff;
}
.group-modal-actions .btn-add:active { background: #0055b3; }
.group-modal-actions .btn-cancel {
    background: rgba(255, 255, 255, 0.9);
    color: #007aff;
    border: 0.5px solid rgba(0, 0, 0, 0.04);
}
.group-modal-actions .btn-cancel:active { background: rgba(230, 230, 230, 0.9); }

/* ===== iOS 风格弹窗 ===== */
.ios-modal {
    display: none;
    position: fixed;
    top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.05);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    align-items: center;
    justify-content: center;
    z-index: 999;
}
.ios-modal.active { display: flex; }
.ios-modal-card {
    width: 320px;
    background: rgba(255, 255, 255, 0.85);
    backdrop-filter: blur(50px);
    -webkit-backdrop-filter: blur(50px);
    border-radius: 24px;
    padding: 24px 20px 18px;
    box-shadow: 0 30px 60px rgba(0,0,0,0.1);
    border: 1px solid rgba(255,255,255,0.4);
    text-align: center;
}
.ios-modal-card h4 {
    font-weight: 600;
    font-size: 18px;
    color: #1c1c1e;
    margin-bottom: 16px;
}
.ios-modal-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.ios-modal-actions button {
    background: rgba(255,255,255,0.9);
    border: none;
    padding: 16px 0;
    border-radius: 14px;
    font-size: 17px;
    font-weight: 500;
    color: #007aff;
    cursor: pointer;
    transition: 0.1s;
    border: 0.5px solid rgba(0,0,0,0.04);
}
.ios-modal-actions button:active {
    background: rgba(230,230,230,0.9);
    transform: scale(0.96);
}
.ios-modal-actions .cancel-btn {
    background: #007aff;
    color: #ffffff;
    font-weight: 600;
    border: none;
}
.ios-modal-actions .cancel-btn:active { background: #0055b3; }

.url-input-wrap {
    background: rgba(0,0,0,0.04);
    border-radius: 12px;
    padding: 4px 16px;
    margin: 12px 0 4px;
    display: flex;
    align-items: center;
}
.url-input-wrap input {
    background: transparent;
    border: none;
    outline: none;
    width: 100%;
    padding: 12px 0;
    font-size: 15px;
    color: #1c1c1e;
}
.url-input-wrap input::placeholder { color: #8e8e93; }
.url-submit-btn {
    background: #007aff;
    color: white;
    border: none;
    padding: 12px 0;
    border-radius: 14px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    width: 100%;
    margin-top: 8px;
}
.url-submit-btn:active {
    transform: scale(0.96);
    opacity: 0.8;
}

.modal-option {
    width: 100%;
    padding: 14px 0;
    border: none;
    background: none;
    font-size: 16px;
    color: #007aff;
    cursor: pointer;
    border-radius: 12px;
    transition: background 0.15s;
    text-align: center;
    font-weight: 500;
}
.modal-option:active { background: rgba(0,0,0,0.04); }
.modal-option.danger { color: #ff3b30; }
.modal-divider {
    height: 0.5px;
    background: rgba(0,0,0,0.04);
    margin: 4px 0;
}
.modal-actions {
    display: flex;
    gap: 10px;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 0.5px solid rgba(0,0,0,0.04);
}
.modal-btn {
    flex: 1;
    padding: 11px 0;
    border: none;
    border-radius: 40px;
    font-size: 15px;
    font-weight: 500;
    background: rgba(255,255,255,0.5);
    color: #1c1c1e;
    cursor: pointer;
    transition: all 0.15s;
    border: 0.5px solid rgba(255,255,255,0.1);
    text-align: center;
}
.modal-btn:active { transform: scale(0.96); }
.modal-btn.primary {
    background: #007aff;
    color: white;
    border: none;
}
.file-input-hidden { display: none; }

/* ===== API 页面 ===== */
.api-card {
  background: rgba(255,255,255,0.2);
  backdrop-filter: blur(20px);
  border-radius: 20px;
  padding: 16px;
  margin-bottom: 14px;
  border: 0.5px solid rgba(255,255,255,0.15);
}
.api-card-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
.api-card-title { font-size:16px; font-weight:600; color:#1c1c1e; }
.form-control {
  width:100%; height:44px; padding:10px 14px; border-radius:12px;
  border:0.5px solid rgba(0,0,0,0.06); background:rgba(255,255,255,0.4);
  backdrop-filter: blur(8px); font-size:15px; color:#1c1c1e; outline:none;
}
.form-control:focus { border-color:#007aff; }
.form-label { font-size:13px; font-weight:500; color:#6c6c70; margin-bottom:4px; display:block; }
/* ===== More 页面 ===== */
.list-group { background:#ffffff; border-radius:12px; margin-bottom:6px; overflow:hidden; border:0.5px solid rgba(0,0,0,0.04); }
.list-item { display:flex; align-items:center; padding:12px 14px; background:#ffffff; cursor:pointer; gap:14px; }
.list-item:active { background:#f2f2f7; }
.list-item:not(:last-child) { border-bottom:0.5px solid rgba(0,0,0,0.04); }
.item-title { font-size:16px; font-weight:400; flex:1; color:#1c1c1e; }
.profile-card { display:flex; align-items:center; background:#ffffff; border-radius:12px; padding:14px 16px; margin-bottom:20px; cursor:pointer; border:0.5px solid rgba(0,0,0,0.04); }
.profile-avatar { width:60px; height:60px; border-radius:50%; background:#e5e5ea; display:flex; justify-content:center; align-items:center; margin-right:16px; overflow:hidden; flex-shrink:0; }
.profile-name { font-size:18px; font-weight:500; margin-bottom:2px; }
.profile-desc { font-size:12px; color:#8e8e93; }
.search-box { background:#f5f5f7; border-radius:28px; padding:6px 14px; display:flex; align-items:center; gap:6px; }
.search-box input { background:transparent; border:none; outline:none; flex:1; font-size:15px; color:#1c1c1e; padding:4px 0; }
.search-box input::placeholder { color:#aeaeb2; }
.ios-switch { appearance:none; width:44px; height:27px; border-radius:13.5px; background:#d1d1d6; position:relative; outline:none; cursor:pointer; transition:background .3s; flex-shrink:0; }
.ios-switch:checked { background:#34c759; }
.container { max-width:430px; margin:0 auto; padding:0 16px 40px; overflow-y:auto; background:#ffffff; }`;

/* ============================================================
   新版「全局美化」初始模板
   ------------------------------------------------------------
   实际内容见 js/nano-global-template.js（挂载到 window.NANO_GLOBAL_TEMPLATE）。
   该文件按页面作用域（body.nano-index / .nano-chat / .nano-api /
   .nano-discover / .nano-more）分区，并附完整 HTML 结构说明与 DIY 配方。
   若该文件未加载，则回退到上面的旧模板 GLOBAL_TEMPLATE_OLD，功能不缺失。
   ============================================================ */
const GLOBAL_TEMPLATE = (typeof window !== 'undefined' && window.NANO_GLOBAL_TEMPLATE)
  ? window.NANO_GLOBAL_TEMPLATE
  : GLOBAL_TEMPLATE_OLD;

/* ============================================================
   内置模板 - 聊天CSS
   ============================================================ */
const CHAT_TEMPLATE_OLD = `/* ===== 聊天美化模板 ===== */
.chat-container {
  width: 100%;
  height: 100%;
  max-width: 430px;
  margin: 0 auto;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}
.topbar {
  position: relative;
  z-index: 30;
  width: 100%;
  flex-shrink: 0;
  /* 想贴顶不预留间距：把 --chat-topbar-pad 改成 0，例如 .topbar{--chat-topbar-pad:0} */
  padding: var(--chat-topbar-pad, calc(14px + var(--safe-top,0px))) 12px 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.back-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255,255,255,0.65);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: 0.5px solid rgba(255,255,255,0.5);
}
.back-btn:active { transform: scale(.88); }
.topbar-title {
  font-size: 17px;
  font-weight: 600;
  color: #1c1c1e;
  padding: 6px 20px;
  background: rgba(255,255,255,0.65);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 30px;
  border: 0.5px solid rgba(255,255,255,0.5);
  text-align: center;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.topbar-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  overflow: hidden;
  background: rgba(255,255,255,0.65);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 0.5px solid rgba(255,255,255,0.5);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  font-weight: 500;
  color: #8e8e93;
}
/* 想隐藏头像或换成其它图标，可在美化里自行加：
   .topbar-avatar img, .topbar-avatar > span { display: none; }
   .topbar-avatar::after { content: "…"; }  */
.topbar-avatar img { width:100%; height:100%; object-fit:cover; }
.message-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 8px 14px 14px 14px;
}
.message-scroll::-webkit-scrollbar { width:0; }
.message-row {
  display: flex;
  align-items: flex-start;
  margin-bottom: 6px;
  width: 100%;
  padding: 2px 0;
}
.message-row.left { justify-content: flex-start; }
.message-row.right { justify-content: flex-end; }
.message-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  flex-shrink: 0;
  overflow: hidden;
  background: #e8e8ec;
  border: 0.5px solid rgba(0,0,0,0.04);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 500;
  color: #8e8e93;
  margin-top: 2px;
  cursor: pointer;
}
.message-avatar:active { transform: scale(.92); }
.message-row.left .message-avatar { margin-right: 8px; }
.message-row.right .message-avatar { margin-left: 8px; order:2; }
.message-avatar img { width:100%; height:100%; object-fit:cover; }
.message-content {
  max-width: 78%;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.message-row.right .message-content { align-items: flex-end; }
.bubble {
  position: relative;
  width: max-content;
  padding: 7px 16px;
  border-radius: 22px;
  font-size: 15px;
  line-height: 1.25;
  overflow-wrap: break-word;
}
.bubble.other {
  background: #dedede;
  color: #111;
}
.bubble.other::after {
  content: "";
  position: absolute;
  left: -6px;
  bottom: 5px;
  width: 17px;
  height: 17px;
  background: #dedede;
  clip-path: polygon(100% 0,100% 100%,0 100%);
}
.bubble.me {
  background: #007aff;
  color: #fff;
  margin-left: auto;
}
.bubble.me::after {
  content: "";
  position: absolute;
  right: -6px;
  bottom: 5px;
  width: 17px;
  height: 17px;
  background: #007aff;
  clip-path: polygon(0 0,100% 100%,0 100%);
}
.bubble.grouped::after { display:none; }
.voice-bubble {
  position: relative;
  height: 28px;
  border-radius: 18px;
  min-width: 52px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  gap: 4px;
  cursor: pointer;
}
.voice-bubble.right {
  align-self: flex-end;
  background: #007aff;
  color: #fff;
  flex-direction: row-reverse;
}
.voice-bubble.left {
  align-self: flex-start;
  background: #dedede;
  color: #111;
}
.voice-bubble .voice-wave {
  display: flex;
  align-items: center;
  gap: 1.5px;
  height: 20px;
}
.voice-bubble .voice-wave .bar {
  width: 2.5px;
  border-radius: 2px;
  background: currentColor;
  height: 6px;
  opacity: .6;
  transition: height .15s;
}
.voice-bubble .voice-wave .bar.active { height:16px; opacity:1; }
.image-bubble {
  max-width: 140px;
  border-radius: 16px;
  overflow: hidden;
  line-height: 0;
}
.image-bubble.right { align-self:flex-end; }
.image-bubble.left { align-self:flex-start; }
.image-bubble img { width:100%; display:block; }

/* ===== 角色名 + 等级/头衔（群聊气泡上方） ===== */
.msg-name-line {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 4px;
  font-size: 11px;
  line-height: 1.3;
  white-space: nowrap;
  flex-wrap: wrap;
}
.msg-name-line .n-badge {
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  padding: 1px 7px;
  border-radius: 9px;
  color: #fff;
  font-weight: 600;
  line-height: 1.5;
}
.msg-name-line .n-badge .n-title-inner { font-weight: 500; font-size: 10px; margin-left: 4px; }
.msg-name-line .n-name { color: #8e8e93; font-weight: 400; font-size: 11px; }

/* ===== 引用（在气泡外部下方，气泡内不含引用） =====
   小拐角来自 .quote-block 里 .quote-fold 的 svg，可以隐藏或替换：
   隐藏：  .quote-block .quote-fold { display: none; }
   换图标：替换该 svg 的 path，或用伪元素： .quote-block .quote-fold::before { content: "“"; } */
.quote-block {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  border-radius: 10px;
  padding: 6px 10px;
  margin-top: 5px;
  font-size: 12.5px;
  line-height: 1.4;
  overflow: hidden;
  background: #ffffff;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
  color: #8e8e93;
  max-width: 100%;
}
.quote-block.right { align-self: flex-end; }
.quote-block.left { align-self: flex-start; }
.quote-block .quote-fold { width: 15px; height: 15px; flex-shrink: 0; margin-top: 1px; opacity: 0.55; display: flex; }
.quote-block .quote-fold svg { width: 15px; height: 15px; }
.quote-block .quote-name { font-weight: 600; opacity: 0.75; margin-right: 3px; font-size: 12px; flex-shrink: 0; color: #6e6e73; }
.quote-block .quote-text { opacity: 0.9; color: #6e6e73; word-break: break-word; white-space: pre-wrap; }

/* ===== 翻译（完全可自定义） =====
   默认：原文在上、译文在下，同一个气泡内。
   想改成“只要译文 / 独立第二个气泡 / 引用式布局”等都可以直接覆盖本段，
   例如：.bubble .translation-text { border: 0; padding: 0; margin: 0; font-size: 15px; } */
.bubble .translation-text {
  display: block;
  margin-top: 4px;
  padding-top: 4px;
  border-top: 0.5px solid rgba(128,128,128,0.2);
  font-size: 14px;
  opacity: 0.8;
  color: inherit;
}
.bubble.me .translation-text { border-top-color: rgba(255,255,255,0.2); }

/* ===== 卡片通用（转账 / 礼物 / 语音通话 / 群红包 / 群公告 / 群接龙 等共用） ===== */
.bubble-card {
  position: relative;
  width: 240px;
  border-radius: 16px;
  overflow: hidden;
  font-size: 14px;
}
.bubble-card.right { align-self: flex-end; }
.bubble-card.left { align-self: flex-start; }
.bubble-card .card-main { display: flex; align-items: center; gap: 10px; padding: 12px; }
.bubble-card .icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.bubble-card .icon-wrap svg { width: 18px; height: 18px; }
.bubble-card .card-title { font-size: 17px; font-weight: 600; line-height: 1.3; }
.bubble-card .card-sub { font-size: 12px; opacity: 0.85; margin-top: 3px; }
.bubble-card .card-footer {
  padding: 8px 12px;
  font-size: 12px;
  opacity: 0.9;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.bubble-card .card-footer .card-footer-text { flex: 1; }
.bubble-card .card-footer .card-actions { display: flex; gap: 6px; }
.bubble-card .card-btn {
  border: none;
  border-radius: 10px;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  background: rgba(255,255,255,0.9);
  color: inherit;
}
.bubble-card .card-btn.return-btn { background: rgba(0,0,0,0.14); }

/* 转账 */
.bubble-card.transfer { background: #F7A24E; color: #fff; }
.bubble-card.transfer .icon-wrap { background: rgba(255,255,255,0.25); }
.bubble-card.transfer .card-footer { border-top: 1px solid rgba(255,255,255,0.25); }
.bubble-card.transfer.claimed,
.bubble-card.transfer.response { background: #DCDCDC; color: #8a8a8a; }

/* 礼物 */
.bubble-card.gift { background: #FF6FA0; color: #fff; }
.bubble-card.gift .icon-wrap { background: rgba(255,255,255,0.25); }
.bubble-card.gift .card-footer { border-top: 1px solid rgba(255,255,255,0.25); }
.bubble-card.gift.claimed,
.bubble-card.gift.response { background: #DCDCDC; color: #8a8a8a; }

/* 语音通话 / 未接来电 */
.bubble-card.call { background: #fff; color: #1c1c1e; border: 1px solid rgba(0,0,0,0.06); }
.bubble-card.call .icon-wrap { background: rgba(0,122,255,0.1); }
.bubble-card.call.missed .icon-wrap { background: rgba(255,59,48,0.1); }
.bubble-card.call .card-title { color: #111; }
.bubble-card.call.missed .card-title { color: #FF3B30; }
.bubble-card.call .card-sub { color: #999; }

/* 群红包 */
.bubble-card.redpacket { background: linear-gradient(135deg,#fa5151,#e6353d); color: #fff; }
.bubble-card.redpacket .icon-wrap { background: rgba(255,255,255,0.25); }
.bubble-card.redpacket .card-footer { border-top: 1px solid rgba(255,255,255,0.2); }
.bubble-card.redpacket.opened { background: #d8d8dc; color: #8a8a8a; }

/* 群公告 */
.bubble-card.notice { background: #fff; color: #1c1c1e; border: 1px solid rgba(0,0,0,0.06); }
.bubble-card.notice .icon-wrap { background: rgba(240,165,0,0.15); }
.bubble-card.notice .icon-wrap svg { stroke: #f0a500; }
.bubble-card.notice .card-footer { border-top: 1px solid rgba(0,0,0,0.06); color: #8e8e93; }
.bubble-card.notice .card-btn { background: rgba(0,122,255,0.1); color: #007aff; }
.bubble-card.notice .card-btn.confirmed { background: rgba(52,199,89,0.15); color: #34c759; }

/* 群接龙 */
.bubble-card.chain { background: #fff; color: #1c1c1e; border: 1px solid rgba(0,0,0,0.06); width: 260px; }
.bubble-card.chain .icon-wrap { background: rgba(0,122,255,0.12); }
.bubble-card.chain .icon-wrap svg { stroke: #007aff; }
.bubble-card.chain .chain-list { padding: 8px 14px; border-top: 1px solid rgba(0,0,0,0.06); max-height: 180px; overflow-y: auto; }
.bubble-card.chain .chain-item { font-size: 13px; color: #1c1c1e; padding: 4px 0; }
.bubble-card.chain .chain-item .idx { color: #8e8e93; margin-right: 6px; }
.bubble-card.chain .chain-footer { padding: 8px 14px; border-top: 1px solid rgba(0,0,0,0.06); }
.bubble-card.chain .chain-btn {
  width: 100%;
  border: none;
  border-radius: 10px;
  padding: 8px 0;
  background: #007aff;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.bottom-bar {
  position: relative;
  z-index: 30;
  width: 100%;
  flex-shrink: 0;
  padding: 6px 14px calc(10px + 0px);
  display: flex;
  align-items: center;
  gap: 8px;
}
.input-shell {
  flex: 1;
  min-width: 0;
  padding: 2px 6px 2px 14px;
  background: rgba(255,255,255,0.5);
  backdrop-filter: blur(20px);
  border-radius: 30px;
  border: 0.5px solid rgba(255,255,255,0.5);
  min-height: 42px;
  display: flex;
  align-items: center;
}
.input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 16px;
  color: #1c1c1e;
  padding: 6px 2px;
  min-width: 0;
}
.input::placeholder { color: #aeaeb2; }
.send-btn {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: #007aff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #fff;
  font-size: 17px;
  box-shadow: 0 4px 16px rgba(0,122,255,.3);
}
.send-btn:active { transform:scale(.88); background:#0055b3; }
.message-row.recalled .bubble {
  background:transparent !important;
  color:#8e8e93 !important;
  font-style:italic;
  padding:4px 8px;
  border-radius:0;
  font-size:13px;
}
.message-row.recalled .bubble::before,
.message-row.recalled .bubble::after { display:none !important; }`;

/* ============================================================
   新版「聊天美化」初始模板
   ------------------------------------------------------------
   实际内容见 js/nano-chat-template.js（挂载到 window.NANO_CHAT_TEMPLATE）。
   该文件按分区（顶栏 / 消息区 / 头像 / 气泡 / 语音 / 翻译 / 引用 /
   卡片 / 居中框 / 底部 dock / 群聊 / 弹层）编写，并附 HTML 结构说明、
   JS 钩子与 DIY 配方。若该文件未加载则回退到 CHAT_TEMPLATE_OLD。
   ============================================================ */
const CHAT_TEMPLATE = (typeof window !== 'undefined' && window.NANO_CHAT_TEMPLATE)
  ? window.NANO_CHAT_TEMPLATE
  : CHAT_TEMPLATE_OLD;

/* ============================================================
   IndexedDB
   ============================================================ */
const DB_NAME = "BeautifyAppDB";
const DB_VER = 1;
let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains("presets")) {
        d.createObjectStore("presets", { keyPath: "id", autoIncrement: true });
      }
      if (!d.objectStoreNames.contains("settings")) {
        d.createObjectStore("settings", { keyPath: "key" });
      }
    };
    req.onsuccess = () => { db = req.result; resolve(); };
    req.onerror = () => reject(req.error);
  });
}

function storeGet(store, key) {
  return new Promise((res, rej) => {
    const req = db.transaction(store, "readonly").objectStore(store).get(key);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

function storePut(store, obj) {
  return new Promise((res, rej) => {
    const req = db.transaction(store, "readwrite").objectStore(store).put(obj);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

function storeDel(store, key) {
  return new Promise((res, rej) => {
    const req = db.transaction(store, "readwrite").objectStore(store).delete(key);
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
  });
}

function storeAll(store) {
  return new Promise((res, rej) => {
    const req = db.transaction(store, "readonly").objectStore(store).getAll();
    req.onsuccess = () => res(req.result || []);
    req.onerror = () => rej(req.error);
  });
}

/* ============================================================
   工具函数
   ============================================================ */
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1600);
}

function getCode(type) {
  return document.getElementById(type + "Code").value;
}

function setCode(type, val) {
  document.getElementById(type + "Code").value = val;
}

function getName(type) {
  return document.getElementById(type + "Name").value.trim();
}

function setName(type, val) {
  document.getElementById(type + "Name").value = val || "";
}

/* ============================================================
   草稿 / 当前选中预设 记忆（切页或重新进入后恢复编辑器状态）
   ============================================================ */
const currentPreset = { global: 0, chat: 0, font: 0 };

function persistDraft(type) {
  try {
    if (type === 'font') {
      const nameEl = document.getElementById('fontName');
      localStorage.setItem('beautify_draft_font', JSON.stringify({
        name: nameEl ? nameEl.value : '',
        presetId: currentPreset.font || 0
      }));
      return;
    }
    localStorage.setItem('beautify_draft_' + type, JSON.stringify({
      code: getCode(type),
      name: getName(type),
      presetId: currentPreset[type] || 0
    }));
  } catch (e) {}
}

const draftTimers = {};
function persistDraftDebounced(type) {
  clearTimeout(draftTimers[type]);
  draftTimers[type] = setTimeout(() => persistDraft(type), 400);
}

function readDraft(type) {
  try {
    const raw = localStorage.getItem('beautify_draft_' + type);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}

async function refreshPresets(type) {
  const sel = document.getElementById(type + "Preset");
  sel.innerHTML = "";
  const items = await storeAll("presets");
  const filtered = items.filter(x => x.category === type);
  if (!filtered.length) {
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "暂无预设";
    sel.appendChild(o);
    return;
  }
  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = "选择预设";
  sel.appendChild(ph);
  filtered.forEach(x => {
    const o = document.createElement("option");
    o.value = x.id;
    o.textContent = x.name;
    sel.appendChild(o);
  });
  // 恢复当前选中的预设
  const want = currentPreset[type];
  if (want && filtered.some(x => x.id === want)) sel.value = want;
}

/* ============================================================
   应用CSS到父页面
   ============================================================ */
function applyCSSToParent(type, css) {
  try {
    if (window.parent !== window) {
      window.parent.postMessage({
        type: 'beautify:apply',
        target: type,
        css: css
      }, '*');
    }
    window.dispatchEvent(new CustomEvent('beautify:apply', { 
      detail: { type, css } 
    }));
    try {
      localStorage.setItem('beautify_' + type, css);
      localStorage.setItem('beautify_' + type + '_time', Date.now());
      // v2 键：只在此处(点“应用”)写入，各页面 appearance.js 据此覆盖 UI
      localStorage.setItem('beautify_' + type + '_v2', css);
    } catch(e) {}
    console.log('[Beautify] 已应用 ' + type + ' CSS');
  } catch(e) {
    console.warn('[Beautify] 应用CSS失败:', e);
  }
}

/* ============================================================
   初始化模板
   ============================================================ */
async function initTemplates() {
  const g = await storeGet("settings", "global_template_inited");
  if (!g) {
    setCode("global", GLOBAL_TEMPLATE);
    setCode("chat", CHAT_TEMPLATE);
    await storePut("settings", { key: "global_template_inited", value: true });
    // 注意：这里不再把模板写入 applied_*/localStorage，
    // 只有用户点「应用」后才真正应用到各页面，避免一打开美化就全局变样
  } else {
    const gCode = await storeGet("settings", "applied_global");
    const cCode = await storeGet("settings", "applied_chat");
    if (gCode) setCode("global", gCode.value);
    else setCode("global", GLOBAL_TEMPLATE);
    if (cCode) setCode("chat", cCode.value);
    else setCode("chat", CHAT_TEMPLATE);
  }
}

/* ============================================================
   CSS预设事件绑定
   ============================================================ */

document.querySelectorAll(".tabs button").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".tabs button").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.page).classList.add("active");
  };
});

document.getElementById("back").onclick = () => {
  if (window.parent !== window) {
    // 返回 More（beautify 从 more 页打开）
    window.parent.postMessage({ type: 'closeFullscreen' }, '*');
  } else if (history.length > 1) {
    history.back();
  } else {
    toast("返回");
  }
};

document.querySelectorAll("[data-clear]").forEach(btn => {
  btn.onclick = () => {
    const type = btn.dataset.clear;
    setCode(type, "");
    persistDraft(type);
    refreshPreview(type);
    toast("已清空");
  };
});

document.querySelectorAll("[data-restore]").forEach(btn => {
  btn.onclick = () => {
    const type = btn.dataset.restore;
    const template = type === "global" ? GLOBAL_TEMPLATE : CHAT_TEMPLATE;
    setCode(type, template);
    persistDraft(type);
    refreshPreview(type);
    toast("已还原初始模板");
  };
});

// 复制初始代码到剪贴板
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      resolve();
    } catch (e) { reject(e); }
  });
}

document.querySelectorAll("[data-copy]").forEach(btn => {
  btn.onclick = async () => {
    const type = btn.dataset.copy;
    const template = type === "global" ? GLOBAL_TEMPLATE : CHAT_TEMPLATE;
    try {
      await copyText(template);
      toast("初始代码已复制");
    } catch (e) {
      toast("复制失败，请手动选择");
    }
  };
});

document.querySelectorAll("[data-apply]").forEach(btn => {
  btn.onclick = async () => {
    const type = btn.dataset.apply;
    const css = getCode(type);
    await storePut("settings", { key: "applied_" + type, value: css });
    applyCSSToParent(type, css);
    persistDraft(type);
    const preview = document.getElementById(type + "Preview");
    if (preview) preview.textContent = css.length > 200 ? css.slice(0, 200) + "\n... (已应用)" : css || "(空)";
    refreshPreview(type);
    toast("CSS 已应用 ✓");
  };
});

document.querySelectorAll("[data-save]").forEach(btn => {
  btn.onclick = async () => {
    const type = btn.dataset.save;
    const name = getName(type);
    if (!name) return toast("请输入预设名称");
    const code = getCode(type);
    const id = await storePut("presets", { category: type, name, code, createdAt: Date.now() });
    currentPreset[type] = id;
    await refreshPresets(type);
    document.getElementById(type + "Preset").value = id;
    persistDraft(type);
    toast("预设已保存");
  };
});

document.querySelectorAll("[data-edit]").forEach(btn => {
  btn.onclick = async () => {
    const type = btn.dataset.edit;
    const sel = document.getElementById(type + "Preset");
    const id = Number(sel.value) || currentPreset[type];
    if (!id) return toast("请先选择预设");
    const items = await storeAll("presets");
    const found = items.find(x => x.id === id && x.category === type);
    if (!found) return toast("预设不存在，请重新选择");
    // 名称允许直接沿用选中预设的名字（修改昵称时填写即可）
    const name = getName(type) || found.name;
    const code = getCode(type);
    await storePut("presets", { id, category: type, name, code, updatedAt: Date.now() });
    currentPreset[type] = id;
    setName(type, name);
    await refreshPresets(type);
    sel.value = id;
    persistDraft(type);
    toast("预设已修改");
  };
});

document.querySelectorAll("[data-delete]").forEach(btn => {
  btn.onclick = async () => {
    const type = btn.dataset.delete;
    const sel = document.getElementById(type + "Preset");
    const id = Number(sel.value) || currentPreset[type];
    if (!id) return toast("没有可删除的预设");
    await storeDel("presets", id);
    if (currentPreset[type] === id) currentPreset[type] = 0;
    await refreshPresets(type);
    persistDraft(type);
    toast("预设已删除");
  };
});

document.querySelectorAll(".presetrow select").forEach(sel => {
  sel.onchange = async () => {
    const type = sel.id.replace("Preset", "");
    const id = Number(sel.value);
    const items = await storeAll("presets");
    const found = items.find(x => x.id === id && x.category === type);
    if (found) {
      currentPreset[type] = id;
      setCode(type, found.code || "");
      setName(type, found.name || "");
      persistDraft(type);
      toast("已加载预设");
    }
  };
});

// 编辑器内容变化即记忆草稿（防抖）+ 实时刷新预览
["globalCode", "chatCode", "globalName", "chatName"].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("input", () => {
    const type = id.indexOf("global") === 0 ? "global" : "chat";
    persistDraftDebounced(type);
    if (id === "globalCode" || id === "chatCode") refreshPreviewSoon(type);
  });
});

/* ============================================================
   实时预览（真实页面）
   - 全局预览：index.html（可点底栏切换 chat/api/discover/more）
   - 聊天预览：chat_inner.html（按最近会话打开）
   预览 iframe 默认不加载，点开才加载；编辑器内容/应用会实时注入。
   ============================================================ */
const previewMeta = {
  global: { card: "globalPreviewCard", frame: "globalPreviewFrame", bound: false },
  chat: { card: "chatPreviewCard", frame: "chatPreviewFrame", bound: false }
};
let previewAvatarCss = "";

function previewChatUrl() {
  let info = null;
  try { info = JSON.parse(sessionStorage.getItem('last_chat_info') || 'null'); } catch (e) {}
  const id = (info && info.chatId) ? info.chatId : 'default';
  const name = (info && info.chatName) ? info.chatName : '预览';
  return 'chat_inner.html?chat=' + encodeURIComponent(id) + '&name=' + encodeURIComponent(name);
}

function previewCssFor(target) {
  const main = getCode(target) || '';
  if (target !== 'chat') return main;
  return main + '\n' + (previewAvatarCss || '');
}

// 聊天预览：若没有真实消息，塞入一段示例，方便观察气泡/卡片/引用/撤回样式
function injectChatDemo(doc) {
  const host = doc.getElementById('messageContainer');
  if (!host || host.querySelector('.message-row') || host.getAttribute('data-lp-demo')) return;
  host.setAttribute('data-lp-demo', '1');
  host.innerHTML = [
    '<div class="date-label">今天</div>',
    '<div class="message-row left"><div class="message-avatar"><span>L</span></div>',
    '<div class="message-content"><div class="bubble other">你好呀，这是聊天美化预览～</div></div></div>',
    '<div class="message-row right"><div class="message-avatar"><span>我</span></div>',
    '<div class="message-content"><div class="bubble me">收到，气泡样式看得很清楚！</div></div></div>',
    '<div class="message-row left"><div class="message-avatar"><span>L</span></div>',
    '<div class="message-content"><div class="bubble other">带翻译的气泡</div>',
    '<span class="translation-text">Translated text preview</span></div></div>',
    '<div class="message-row left"><div class="message-avatar"><span>L</span></div>',
    '<div class="message-content"><div class="voice-bubble left"><span class="play-icon">▶</span>',
    '<div class="voice-wave"><span class="bar"></span><span class="bar"></span><span class="bar"></span>',
    '<span class="bar"></span><span class="bar"></span><span class="bar"></span></div>',
    '<span class="voice-duration">3&#39;&#39;</span></div></div></div>',
    '<div class="message-row left"><div class="message-avatar"><span>L</span></div>',
    '<div class="message-content"><div class="quote-block left">',
    '<span class="quote-fold"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 14l-4-4 4-4"/></svg></span>',
    '<span class="quote-name">L</span><span class="quote-text">被引用的内容</span></div>',
    '<div class="bubble other">引用后的气泡</div></div></div>',
    '<div class="message-row left"><div class="message-avatar"><span>L</span></div>',
    '<div class="message-content"><div class="bubble-card left transfer">',
    '<div class="card-main"><div class="icon-wrap"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="9"/></svg></div>',
    '<div><div class="card-title">转账</div><div class="card-sub">¥ 20.00</div></div></div>',
    '<div class="card-footer"><span class="card-footer-text">请收款</span>',
    '<div class="card-actions"><button class="card-btn">领取</button></div></div></div></div></div>',
    '<div class="message-row recalled"><div class="recall-notice">对方撤回了一条消息</div></div>'
  ].join('');
}

// 直接注入到预览 iframe（同源），保证即使页面脚本未就绪也能看到效果
function injectPreviewCss(target) {
  const meta = previewMeta[target];
  const frame = meta && document.getElementById(meta.frame);
  if (!frame) return;
  let doc = null;
  try { doc = frame.contentDocument; } catch (e) { return; }
  if (!doc || !doc.documentElement) return;
  const host = doc.body || doc.documentElement;
  let st = doc.getElementById('lp-live-' + target);
  if (!st) { st = doc.createElement('style'); st.id = 'lp-live-' + target; host.appendChild(st); }
  st.textContent = previewCssFor(target);
  if (target === 'chat') injectChatDemo(doc);
}

// 通过消息让预览页面用 appearance.js 正规应用（index 会再转发给其子 iframe）
function pushPreviewCss(target) {
  const meta = previewMeta[target];
  const frame = meta && document.getElementById(meta.frame);
  if (!frame || !frame.contentWindow) return;
  const css = getCode(target) || '';
  try { frame.contentWindow.postMessage({ type: 'beautify:apply', target: target, css: css }, '*'); } catch (e) {}
  if (target === 'chat') {
    try { frame.contentWindow.postMessage({ type: 'beautify:apply', target: 'chat-avatar', css: previewAvatarCss || '' }, '*'); } catch (e) {}
  }
}

function refreshPreview(target) {
  injectPreviewCss(target);
  pushPreviewCss(target);
}
const previewTimers = {};
function refreshPreviewSoon(target) {
  clearTimeout(previewTimers[target]);
  previewTimers[target] = setTimeout(() => refreshPreview(target), 300);
}

function togglePreview(target) {
  const meta = previewMeta[target];
  const card = meta && document.getElementById(meta.card);
  if (!card) return;
  const open = card.classList.toggle('open');
  const head = card.querySelector('.lp-head');
  if (head) head.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (!open) return;
  const frame = document.getElementById(meta.frame);
  if (!frame) return;
  const needSrc = !frame.getAttribute('src');
  if (needSrc) {
    const src = target === 'chat' ? previewChatUrl() : (frame.getAttribute('data-src') || 'index.html');
    frame.setAttribute('src', src);
  }
  if (!meta.bound) {
    meta.bound = true;
    frame.addEventListener('load', function () {
      // 首帧渲染完成后再注入，避免样式被页面脚本覆盖
      setTimeout(function () { refreshPreview(target); }, 80);
    });
  }
  setTimeout(function () { refreshPreview(target); }, needSrc ? 260 : 40);
}

document.querySelectorAll('.lp-head').forEach(function (h) {
  h.addEventListener('click', function () { togglePreview(h.dataset.lp); });
});

/* ============================================================
   头像调节（方圆 / 大小）：聊天内页头像
   存 localStorage，广播 beautify:apply(target=chat-avatar)
   ============================================================ */
const avatarRadiusEl = document.getElementById('avatarRadius');
const avatarSizeEl = document.getElementById('avatarSize');
const avatarRadiusVal = document.getElementById('avatarRadiusVal');
const avatarSizeVal = document.getElementById('avatarSizeVal');
const avatarState = { radius: 50, size: 36 };

function buildAvatarCss() {
  const r = (avatarState.radius != null ? avatarState.radius : 50) + '%';
  const s = (avatarState.size != null ? avatarState.size : 36) + 'px';
  return '.message-avatar,.topbar-avatar{border-radius:' + r + ' !important;width:' + s + ' !important;height:' + s + ' !important;}'
    + '.message-avatar img,.topbar-avatar img,.typing-indicator .ti-avatar{border-radius:' + r + ' !important;}'
    + '.typing-indicator .ti-avatar{width:' + s + ' !important;height:' + s + ' !important;}';
}

function syncAvatarLabels() {
  if (avatarRadiusVal) avatarRadiusVal.textContent = avatarState.radius + '%';
  if (avatarSizeVal) avatarSizeVal.textContent = avatarState.size + 'px';
}

let avatarSyncTimer = null;
function applyAvatarTune() {
  previewAvatarCss = buildAvatarCss();
  try {
    localStorage.setItem('beautify_chat_avatar', previewAvatarCss);
    localStorage.setItem('beautify_chat_avatar_cfg', JSON.stringify(avatarState));
  } catch (e) {}
  // 广播给聊天内页（父框架会再转发给各 iframe）
  if (window.parent !== window) {
    try { window.parent.postMessage({ type: 'beautify:apply', target: 'chat-avatar', css: previewAvatarCss }, '*'); } catch (e) {}
  }
  // 刷新聊天预览
  clearTimeout(avatarSyncTimer);
  avatarSyncTimer = setTimeout(function () {
    injectPreviewCss('chat');
    pushPreviewCss('chat');
  }, 120);
}

function onAvatarInput() {
  avatarState.radius = avatarRadiusEl ? parseInt(avatarRadiusEl.value) : 50;
  avatarState.size = avatarSizeEl ? parseInt(avatarSizeEl.value) : 36;
  if (isNaN(avatarState.radius)) avatarState.radius = 50;
  if (isNaN(avatarState.size)) avatarState.size = 36;
  syncAvatarLabels();
  applyAvatarTune();
}

if (avatarRadiusEl) avatarRadiusEl.addEventListener('input', onAvatarInput);
if (avatarSizeEl) avatarSizeEl.addEventListener('input', onAvatarInput);

// 载入已保存的头像调节
(function loadAvatarTune() {
  previewAvatarCss = buildAvatarCss();
  try {
    const cfg = JSON.parse(localStorage.getItem('beautify_chat_avatar_cfg') || 'null');
    if (cfg && typeof cfg.radius === 'number') avatarState.radius = cfg.radius;
    if (cfg && typeof cfg.size === 'number') avatarState.size = cfg.size;
  } catch (e) {}
  if (avatarRadiusEl) avatarRadiusEl.value = avatarState.radius;
  if (avatarSizeEl) avatarSizeEl.value = avatarState.size;
  syncAvatarLabels();
  previewAvatarCss = buildAvatarCss();
})();

document.getElementById("globalImport").onclick = () => document.getElementById("globalFile").click();
document.getElementById("chatImport").onclick = () => document.getElementById("chatFile").click();

async function handleImport(type) {
  const fileInput = document.getElementById(type + "File");
  const f = fileInput.files && fileInput.files[0];
  if (!f) return;
  try {
    const text = await f.text();
    if (f.name.endsWith(".json")) {
      try {
        const parsed = JSON.parse(text);
        const css = typeof parsed === "string" ? parsed : parsed.css || parsed.code || JSON.stringify(parsed, null, 2);
        setCode(type, css);
      } catch {
        setCode(type, text);
      }
    } else {
      setCode(type, text);
    }
    persistDraft(type);
    toast("文件已导入");
  } catch (e) {
    toast("导入失败");
  }
  fileInput.value = "";
}

document.getElementById("globalFile").onchange = () => handleImport("global");
document.getElementById("chatFile").onchange = () => handleImport("chat");

/* ============================================================
   导出当前选中的预设（分享图标；导出 {type,name,css} JSON，可被导入还原）
   ============================================================ */
function downloadTextFile(filename, text) {
  try {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e) {
    toast("导出失败");
  }
}

async function exportBeautifyPreset(type) {
  const sel = document.getElementById(type + "Preset");
  const id = sel ? Number(sel.value) || 0 : 0;
  let name = getName(type) || (type === "global" ? "全局美化" : "聊天美化");
  let css = getCode(type);
  if (id) {
    try {
      const items = await storeAll("presets");
      const p = items.find(x => x.id === id && x.category === type);
      if (p) { name = p.name || name; css = p.code || p.css || css; }
    } catch (e) {}
  }
  downloadTextFile(String(name).replace(/[\\/:*?"<>|]/g, "_") + ".json", JSON.stringify({ type, name, css }, null, 2));
  toast("已导出预设：" + name);
}

document.getElementById("globalExport").onclick = () => exportBeautifyPreset("global");
document.getElementById("chatExport").onclick = () => exportBeautifyPreset("chat");

/* ============================================================
   字体功能
   ============================================================ */
let fontState = { name: "", source: "", type: "", data: null, size: 16 };
let localURL = null;

// ---- 字体配置：序列化后让所有 Nano 页面共享（含文件 base64 / 远程 url） ----
function fontFormatFor(source) {
  const s = String(source || "").toLowerCase();
  if (/\.woff2($|\?)/.test(s)) return "woff2";
  if (/\.woff($|\?)/.test(s)) return "woff";
  if (/\.otf($|\?)/.test(s)) return "opentype";
  return "truetype";
}

function buildFontConfig() {
  if (!fontState || !fontState.name) return null;
  const cfg = {
    family: "NanoBeautifyFont",
    name: fontState.name || "",
    source: fontState.source || "",
    type: fontState.type || "",
    size: (fontState.size && fontState.size > 0) ? fontState.size : 16,
    format: fontFormatFor(fontState.source || fontState.name || "")
  };
  if (fontState.type === "file" && fontState.data) {
    // ArrayBuffer 可被 postMessage 结构化克隆传给各页面，避免 localStorage 超配额
    cfg.data = fontState.data;
  }
  return cfg;
}

function pushFontConfig(cfg) {
  try {
    if (cfg && cfg.type === "url" && cfg.source) {
      localStorage.setItem("beautify_font", JSON.stringify(cfg));
    } else {
      // 文件字体走 IndexedDB(appliedFont) 持久化，不塞 localStorage
      localStorage.removeItem("beautify_font");
    }
  } catch (e) {}
  if (window.parent !== window) {
    try { window.parent.postMessage({ type: "beautify:font", cfg: cfg }, "*"); } catch (e) {}
  }
  try {
    window.dispatchEvent(new CustomEvent("beautify:font", { detail: { cfg: cfg } }));
  } catch (e) {}
}

const fontSizeSlider = document.getElementById("fontSizeSlider");
const fontSizeDisplay = document.getElementById("fontSizeDisplay");
const fontPreview = document.getElementById("fontPreview");

function updateFontSize(val) {
  const size = parseInt(val);
  fontState.size = size;
  fontSizeDisplay.textContent = size + "px";
  fontPreview.style.fontSize = size + "px";
  storePut("settings", { key: "fontSize", value: size }).catch(() => {});
}

fontSizeSlider.oninput = function() {
  updateFontSize(this.value);
};

async function loadFontSize() {
  const saved = await storeGet("settings", "fontSize");
  if (saved && saved.value) {
    const size = saved.value;
    fontSizeSlider.value = size;
    updateFontSize(size);
  }
}

// ---- 字体导入 ----
document.getElementById("fontImport").onclick = () => document.getElementById("fontFile").click();

document.getElementById("fontFile").onchange = async e => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  try {
    const data = await f.arrayBuffer();
    fontState = { name: f.name, source: f.name, type: "file", data, size: fontState.size || 16 };
    if (localURL) URL.revokeObjectURL(localURL);
    localURL = URL.createObjectURL(new Blob([data]));
    const face = new FontFace("NanoLocalFont", 'url("' + localURL + '")');
    await face.load();
    document.fonts.add(face);
    applyFontToPage("NanoLocalFont");
    await storePut("settings", { key: "appliedFont", value: fontState }).catch(() => {});
    document.getElementById("filename").textContent = f.name;
    document.getElementById("fontMeta").textContent = "当前字体：" + f.name;
    toast("字体已加载");
  } catch (err) {
    console.error(err);
    toast("字体加载失败");
  }
  e.target.value = "";
};

// ---- URL字体 ----
document.getElementById("urlApply").onclick = async () => {
  const url = document.getElementById("fontUrl").value.trim();
  if (!url) return toast("请输入字体 URL");
  try {
    const face = new FontFace("NanoRemoteFont", 'url("' + url.replace(/"/g, '\\"') + '")');
    await face.load();
    document.fonts.add(face);
    fontState = { name: "NanoRemoteFont", source: url, type: "url", data: null, size: fontState.size || 16 };
    applyFontToPage("NanoRemoteFont");
    await storePut("settings", { key: "appliedFont", value: fontState }).catch(() => {});
    document.getElementById("filename").textContent = "已连接远程字体";
    document.getElementById("fontMeta").textContent = "当前字体：" + url;
    toast("字体已连接");
  } catch (err) {
    console.error(err);
    toast("连接失败，检查 URL 或 CORS");
  }
};

// ---- 字体预设 ----
async function refreshFontPresets() {
  const sel = document.getElementById("fontPreset");
  sel.innerHTML = "";
  const items = await storeAll("presets");
  const filtered = items.filter(x => x.category === "font");
  if (!filtered.length) {
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "暂无预设";
    sel.appendChild(o);
    return;
  }
  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = "选择字体预设";
  sel.appendChild(ph);
  filtered.forEach(x => {
    const o = document.createElement("option");
    o.value = x.id;
    o.textContent = x.name;
    sel.appendChild(o);
  });
  const want = currentPreset.font;
  if (want && filtered.some(x => x.id === want)) sel.value = want;
}

// 加载字体预设 - 修复：正确设置fontState并应用
document.getElementById("fontPreset").onchange = async () => {
  const sel = document.getElementById("fontPreset");
  const id = Number(sel.value);
  if (!id) return;
  const items = await storeAll("presets");
  const found = items.find(x => x.id === id && x.category === "font");
  if (found && found.font) {
    currentPreset.font = id;
    // 完整复制字体状态
    fontState = {
      name: found.font.name || "",
      source: found.font.source || "",
      type: found.font.type || "",
      data: found.font.data || null,
      size: found.font.size || 16
    };
    document.getElementById("fontName").value = found.name || "";
    document.getElementById("filename").textContent = fontState.source || "已加载";
    document.getElementById("fontMeta").textContent = "预设：" + (fontState.name || found.name);
    document.getElementById("fontUrl").value = fontState.type === "url" ? fontState.source : "";
    fontSizeSlider.value = fontState.size;
    updateFontSize(fontState.size);
    
    // 自动应用字体
    try {
      if (fontState.type === "file" && fontState.data) {
        if (localURL) URL.revokeObjectURL(localURL);
        localURL = URL.createObjectURL(new Blob([fontState.data]));
        const face = new FontFace("NanoLocalFont", 'url("' + localURL + '")');
        await face.load();
        document.fonts.add(face);
        applyFontToPage("NanoLocalFont");
      } else if (fontState.type === "url" && fontState.source) {
        const face = new FontFace("NanoRemoteFont", 'url("' + fontState.source.replace(/"/g, '\\"') + '")');
        await face.load();
        document.fonts.add(face);
        applyFontToPage("NanoRemoteFont");
      }
      await storePut("settings", { key: "appliedFont", value: fontState }).catch(() => {});
      persistDraft("font");
      toast("字体预设已加载并应用");
    } catch (e) {
      console.error(e);
      toast("字体加载失败，请检查文件或URL");
    }
  }
};

// ---- 字体应用函数 ----
function applyFontToPage(family) {
  const size = fontState.size || 16;
  document.body.style.fontFamily = family + ',-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Helvetica Neue",Arial,sans-serif';
  document.body.style.fontSize = size + "px";
  fontPreview.style.fontFamily = "inherit";
  fontPreview.style.fontSize = size + "px";
  document.querySelectorAll("button,input,textarea,select").forEach(x => {
    x.style.fontFamily = "inherit";
    x.style.fontSize = "inherit";
  });
  // 广播字体配置（含文件base64/远程URL）给父框架与所有 Nano 页面
  pushFontConfig(buildFontConfig());
}

function systemFont() {
  const size = fontState.size || 16;
  document.body.style.fontFamily = '-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Helvetica Neue",Arial,sans-serif';
  document.body.style.fontSize = size + "px";
  fontPreview.style.fontFamily = "inherit";
  fontPreview.style.fontSize = size + "px";
  document.querySelectorAll("button,input,textarea,select").forEach(x => {
    x.style.fontFamily = "inherit";
    x.style.fontSize = "inherit";
  });
  // 恢复系统字体：清空全局字体配置
  pushFontConfig(null);
}

// ---- 清除/还原/应用 ----
document.getElementById("fontClearFile").onclick = () => {
  fontState = { name: "", source: "", type: "", data: null, size: fontState.size || 16 };
  systemFont();
  storeDel("settings", "appliedFont").catch(() => {});
  currentPreset.font = 0;
  persistDraft("font");
  refreshFontPresets();
  document.getElementById("filename").textContent = "未选择";
  document.getElementById("fontMeta").textContent = "系统默认";
  toast("已清除字体");
};

document.getElementById("fontClear").onclick = () => {
  fontState = { name: "", source: "", type: "", data: null, size: fontState.size || 16 };
  document.getElementById("fontUrl").value = "";
  systemFont();
  storeDel("settings", "appliedFont").catch(() => {});
  currentPreset.font = 0;
  persistDraft("font");
  refreshFontPresets();
  document.getElementById("filename").textContent = "未选择";
  document.getElementById("fontMeta").textContent = "系统默认";
  toast("字体设置已清空");
};

document.getElementById("fontRestore").onclick = () => {
  fontState = { name: "", source: "", type: "", data: null, size: fontState.size || 16 };
  document.getElementById("fontUrl").value = "";
  systemFont();
  storeDel("settings", "appliedFont").catch(() => {});
  currentPreset.font = 0;
  persistDraft("font");
  refreshFontPresets();
  document.getElementById("filename").textContent = "未选择";
  document.getElementById("fontMeta").textContent = "系统默认";
  toast("已还原系统字体");
};

document.getElementById("fontApply").onclick = async () => {
  if (!fontState.name) return toast("请先加载或连接字体");
  try {
    if (fontState.type === "file" && fontState.data) {
      if (localURL) URL.revokeObjectURL(localURL);
      localURL = URL.createObjectURL(new Blob([fontState.data]));
      const face = new FontFace("NanoLocalFont", 'url("' + localURL + '")');
      await face.load();
      document.fonts.add(face);
      applyFontToPage("NanoLocalFont");
    } else if (fontState.type === "url" && fontState.source) {
      const face = new FontFace("NanoRemoteFont", 'url("' + fontState.source.replace(/"/g, '\\"') + '")');
      await face.load();
      document.fonts.add(face);
      applyFontToPage("NanoRemoteFont");
    } else {
      return toast("字体数据无效");
    }
    await storePut("settings", { key: "appliedFont", value: fontState });
    toast("字体已应用 ✓");
  } catch (e) {
    console.error(e);
    toast("字体应用失败");
  }
};

// ---- 保存/修改/删除 ----
document.getElementById("fontSave").onclick = async () => {
  const name = document.getElementById("fontName").value.trim();
  if (!name) return toast("请输入预设名称");
  if (!fontState.name) return toast("请先加载或连接字体");
  fontState.size = parseInt(fontSizeSlider.value) || 16;
  const id = await storePut("presets", { category: "font", name, font: fontState, createdAt: Date.now() });
  currentPreset.font = id;
  await refreshFontPresets();
  document.getElementById("fontPreset").value = id;
  persistDraft("font");
  toast("字体预设已保存");
};

document.getElementById("fontEdit").onclick = async () => {
  const sel = document.getElementById("fontPreset");
  const id = Number(sel.value) || currentPreset.font;
  if (!id) return toast("请先选择预设");
  const items = await storeAll("presets");
  const found = items.find(x => x.id === id && x.category === "font");
  if (!found) return toast("预设不存在，请重新选择");
  const name = document.getElementById("fontName").value.trim() || found.name;
  if (!fontState.name && found.font) {
    fontState = found.font;
  }
  if (!fontState.name) return toast("请先加载或连接字体");
  fontState.size = parseInt(fontSizeSlider.value) || 16;
  await storePut("presets", { id, category: "font", name, font: fontState, updatedAt: Date.now() });
  currentPreset.font = id;
  document.getElementById("fontName").value = name;
  await refreshFontPresets();
  sel.value = id;
  persistDraft("font");
  toast("字体预设已修改");
};

document.getElementById("fontDelete").onclick = async () => {
  const sel = document.getElementById("fontPreset");
  const id = Number(sel.value) || currentPreset.font;
  if (!id) return toast("没有可删除的预设");
  await storeDel("presets", id);
  if (currentPreset.font === id) currentPreset.font = 0;
  await refreshFontPresets();
  persistDraft("font");
  toast("字体预设已删除");
};

// 字体预设名称输入也记忆
(function() {
  const el = document.getElementById("fontName");
  if (el) el.addEventListener("input", () => persistDraftDebounced("font"));
})();

/* ============================================================
   localStorage 同步
   ============================================================ */
document.addEventListener('beautify:apply', function(e) {
  try {
    localStorage.setItem('beautify_' + e.detail.type, e.detail.css);
    localStorage.setItem('beautify_' + e.detail.type + '_time', Date.now());
    localStorage.setItem('beautify_' + e.detail.type + '_v2', e.detail.css);
  } catch(err) {}
});

/* ============================================================
   把已保存字体重新应用到 beautify 页面自身（重新进入时不丢字体）
   ============================================================ */
async function restoreFontToBeautifyPage() {
  if (!fontState || !fontState.name) return;
  try {
    if (fontState.type === "file" && fontState.data) {
      if (localURL) URL.revokeObjectURL(localURL);
      localURL = URL.createObjectURL(new Blob([fontState.data]));
      const face = new FontFace("NanoLocalFont", 'url("' + localURL + '")');
      await face.load();
      document.fonts.add(face);
      applyFontToPage("NanoLocalFont");
    } else if (fontState.type === "url" && fontState.source) {
      const face = new FontFace("NanoRemoteFont", 'url("' + fontState.source.replace(/"/g, '\\"') + '")');
      await face.load();
      document.fonts.add(face);
      applyFontToPage("NanoRemoteFont");
    }
  } catch (e) {
    // 远程字体可能因 CORS 加载失败，至少把 family 应用到页面
    try { applyFontToPage(fontState.type === "file" ? "NanoLocalFont" : "NanoRemoteFont"); } catch (e2) {}
  }
}

/* ============================================================
   启动
   ============================================================ */
(async () => {
  try {
    // 迁移：旧版聊天模板默认把头像换成 "☰"、并去掉了顶栏玻璃包裹（会出现乱码/双图标），
    // 若是未改动的旧模板，直接换成新版默认模板并重新应用。
    try {
      var storedChat = localStorage.getItem('beautify_chat_v2') || '';
      if (storedChat.indexOf('☰') !== -1 && storedChat.indexOf('聊天美化模板') !== -1) {
        localStorage.setItem('beautify_chat_v2', CHAT_TEMPLATE);
        localStorage.setItem('beautify_chat', CHAT_TEMPLATE);
        setCode('chat', CHAT_TEMPLATE);
        applyCSSToParent('chat', CHAT_TEMPLATE);
        try { storePut('settings', { key: 'applied_chat', value: CHAT_TEMPLATE }).catch(function() {}); } catch (e2) {}
      }
    } catch (e) {}

    // 迁移：旧版全局模板底栏是 space-between（胶囊靠左、电话靠右），改成整体居中
    try {
      var storedGlobal = localStorage.getItem('beautify_global_v2') || '';
      if (storedGlobal && storedGlobal.indexOf('.bottom-actions') !== -1 && storedGlobal.indexOf('justify-content: space-between') !== -1) {
        var fixedGlobal = storedGlobal.replace(/(\.bottom-actions\s*\{[^}]*?)justify-content:\s*space-between;/m, '$1justify-content: center;');
        if (fixedGlobal !== storedGlobal) {
          localStorage.setItem('beautify_global_v2', fixedGlobal);
          localStorage.setItem('beautify_global', fixedGlobal);
          setCode('global', fixedGlobal);
          applyCSSToParent('global', fixedGlobal);
          try { storePut('settings', { key: 'applied_global', value: fixedGlobal }).catch(function() {}); } catch (e2) {}
        }
      }
    } catch (e) {}

    await openDB();

    // 先恢复上次编辑的草稿（CSS/名称/选中预设），避免重新进入显示初始 CSS
    const gd = readDraft("global");
    const cd = readDraft("chat");
    const fd = (() => { try { const r = localStorage.getItem("beautify_draft_font"); return r ? JSON.parse(r) : null; } catch (e) { return null; } })();
    if (gd) { setCode("global", gd.code || ""); setName("global", gd.name || ""); currentPreset.global = gd.presetId || 0; }
    if (cd) { setCode("chat", cd.code || ""); setName("chat", cd.name || ""); currentPreset.chat = cd.presetId || 0; }
    if (fd) { currentPreset.font = fd.presetId || 0; }

    await initTemplates();
    if (gd) setCode("global", gd.code || "");
    if (cd) setCode("chat", cd.code || "");
    await refreshPresets("global");
    await refreshPresets("chat");
    await refreshFontPresets();
    await loadFontSize();
    
    const af = await storeGet("settings", "appliedFont");
    if (af && af.value) {
      fontState = af.value;
      if (!fontState.size) fontState.size = 16;
      document.getElementById("filename").textContent = fontState.source || fontState.name || "已保存";
      document.getElementById("fontMeta").textContent = "当前字体：" + (fontState.name || fontState.source);
      fontSizeSlider.value = fontState.size;
      updateFontSize(fontState.size);
      // 恢复字体到美化页预览 + 同步给所有 Nano 页面
      await restoreFontToBeautifyPage();
      pushFontConfig(buildFontConfig());
    } else if (currentPreset.font) {
      // 已选字体预设但没有已应用字体（例如刚还原过）：自动载入并应用选中预设
      const fitems = await storeAll("presets");
      const found = fitems.find(x => x.id === currentPreset.font && x.category === "font");
      if (found && found.font) {
        fontState = found.font;
        if (!fontState.size) fontState.size = 16;
        document.getElementById("fontName").value = found.name || "";
        document.getElementById("filename").textContent = fontState.source || "已加载";
        document.getElementById("fontMeta").textContent = "预设：" + (found.name || fontState.name);
        document.getElementById("fontUrl").value = fontState.type === "url" ? fontState.source : "";
        fontSizeSlider.value = fontState.size;
        updateFontSize(fontState.size);
        await restoreFontToBeautifyPage();
        pushFontConfig(buildFontConfig());
      } else {
        pushFontConfig(null);
      }
    } else {
      pushFontConfig(null);
    }
    
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'beautify:loaded' }, '*');
    }
    
    toast("美化已加载");
  } catch (e) {
    console.error(e);
    toast("初始化失败");
  }
})();