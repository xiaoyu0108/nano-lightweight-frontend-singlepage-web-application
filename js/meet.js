/* meet.js — Meet 好友申请中心（微信号取自人设 Mask） */
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var NF = window.NanoFriend;

    function toast(msg) {
        var el = $('ktToast');
        if (!el) return;
        el.textContent = msg;
        el.classList.add('show');
        clearTimeout(el.__t);
        el.__t = setTimeout(function () { el.classList.remove('show'); }, 1700);
    }

    var SRC_LABEL = { alt: '小号试探', groupnpc: '群聊好友', ins: 'Instagram', halo: 'Halo', other: '好友申请' };

    function renderWechat() {
        var el = $('ktWechat');
        if (!el) return;
        var wx = NF ? NF.wechat() : '';
        if (wx) { el.textContent = wx; el.classList.remove('empty'); }
        else { el.textContent = '未设置'; el.classList.add('empty'); }
    }

    function renderList() {
        var box = $('ktList');
        if (!box || !NF) return;
        var list = NF.list();
        var count = $('ktCount');
        if (count) count.textContent = String(list.length);
        box.innerHTML = '';
        if (!list.length) {
            var empty = document.createElement('div');
            empty.className = 'kt-empty';
            empty.textContent = '暂时没有新的好友申请';
            box.appendChild(empty);
            return;
        }
        list.forEach(function (r) {
            var row = document.createElement('div');
            row.className = 'kt-req';

            var av = document.createElement('div');
            av.className = 'kt-req-avatar';
            if (r.avatar) {
                var img = document.createElement('img');
                img.src = r.avatar; img.alt = '';
                av.appendChild(img);
            } else {
                av.textContent = String(r.name || '?').charAt(0);
            }
            row.appendChild(av);

            var main = document.createElement('div');
            main.className = 'kt-req-main';
            var nm = document.createElement('div');
            nm.className = 'kt-req-name';
            nm.textContent = r.name || '陌生人';
            var src = document.createElement('div');
            src.className = 'kt-req-src';
            src.textContent = '来自 ' + (SRC_LABEL[r.source] || '好友申请') + (r.requestNote ? (' · ' + r.requestNote) : '');
            main.appendChild(nm);
            main.appendChild(src);
            if (r.setting) {
                var note = document.createElement('div');
                note.className = 'kt-req-note';
                note.textContent = String(r.setting).replace(/\n+/g, ' ');
                main.appendChild(note);
            }
            row.appendChild(main);

            var acts = document.createElement('div');
            acts.className = 'kt-req-actions';
            var ok = document.createElement('button');
            ok.className = 'kt-accept'; ok.textContent = '同意';
            var no = document.createElement('button');
            no.className = 'kt-reject'; no.textContent = '拒绝';
            ok.addEventListener('click', function () {
                ok.disabled = true; ok.textContent = '…';
                NF.accept(r.id).then(function (c) {
                    toast(c ? ('已添加「' + (r.name || '') + '」') : '添加失败');
                    renderList();
                });
            });
            no.addEventListener('click', function () {
                NF.reject(r.id);
                toast('已拒绝');
                renderList();
            });
            acts.appendChild(ok);
            acts.appendChild(no);
            row.appendChild(acts);

            box.appendChild(row);
        });
    }

    var back = $('ktBack');
    if (back) {
        back.addEventListener('click', function () {
            if (window.parent !== window) window.parent.postMessage({ type: 'nanoCloseOverlay' }, '*');
            else if (history.length > 1) history.back();
            else location.href = 'chat.html';
        });
    }

    var edit = $('ktEditWechat');
    if (edit) {
        edit.addEventListener('click', function () {
            if (window.parent !== window) {
                window.parent.postMessage({ type: 'openFullscreen', url: 'mask.html', title: 'Mask', showBack: true }, '*');
            } else {
                location.href = 'mask.html';
            }
        });
    }

    window.addEventListener('nanoFriendRequestsChanged', renderList);
    renderWechat();
    renderList();
    try { if (window.parent !== window) window.parent.postMessage({ type: 'pageLoaded', page: 'meet' }, '*'); } catch (e) {}
})();
