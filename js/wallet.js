// ============================================================
// wallet.js — 银行卡（与 chat-inner 互通）+ 记账（独立）
// 数据存储：IndexedDB（nano_wallet_db）
// ============================================================
(function() {
    'use strict';

    // ===== 常量 =====
    var DB_NAME = 'nano_wallet_db';
    var DB_VERSION = 1;
    var WALLET_STORE = 'wallet_data';
    var LEDGER_STORE = 'ledger_data';

    // ===== DOM 引用 =====
    var balanceEl = document.getElementById('balanceAmount');
    var cardNumberEl = document.getElementById('cardNumber');
    var bankNameEl = document.getElementById('bankName');
    var walletTxList = document.getElementById('walletTxList');
    var walletTxCount = document.getElementById('walletTxCount');

    var entryListEl = document.getElementById('entryList');
    var entryCountEl = document.getElementById('entryCount');
    var totalIncomeEl = document.getElementById('totalIncome');
    var totalExpenseEl = document.getElementById('totalExpense');
    var totalBalanceEl = document.getElementById('totalBalance');

    var toastEl = document.getElementById('toast');
    var navTitle = document.getElementById('navTitle');

    // ===== 弹窗元素 =====
    var entryModal = document.getElementById('entryModal');
    var entryType = document.getElementById('entryType');
    var entryAmount = document.getElementById('entryAmount');
    var entryDesc = document.getElementById('entryDesc');
    var entryCancel = document.getElementById('entryCancel');
    var entryConfirm = document.getElementById('entryConfirm');

    var editModal = document.getElementById('editModal');
    var editType = document.getElementById('editType');
    var editAmount = document.getElementById('editAmount');
    var editDesc = document.getElementById('editDesc');
    var editCancel = document.getElementById('editCancel');
    var editConfirm = document.getElementById('editConfirm');

    var rechargeModal = document.getElementById('rechargeModal');
    var rechargeAmount = document.getElementById('rechargeAmount');
    var rechargeCancel = document.getElementById('rechargeCancel');
    var rechargeConfirm = document.getElementById('rechargeConfirm');

    // ===== 按钮 =====
    var backBtn = document.getElementById('backBtn');
    var addBtn = document.getElementById('addBtn');
    var rechargeBtn = document.getElementById('rechargeBtn');
    var tabBtns = document.querySelectorAll('.tab-btn');
    var pageWallet = document.getElementById('pageWallet');
    var pageLedger = document.getElementById('pageLedger');

    // ===== 状态 =====
    var editingId = null;
    var currentTab = 'wallet';
    var _walletCache = null;
    var _ledgerCache = null;

    // ============================================================
    // IndexedDB 操作
    // ============================================================
    function openDB() {
        return new Promise(function(resolve, reject) {
            try {
                var req = indexedDB.open(DB_NAME, DB_VERSION);
                req.onupgradeneeded = function(e) {
                    var db = e.target.result;
                    if (!db.objectStoreNames.contains(WALLET_STORE)) {
                        db.createObjectStore(WALLET_STORE, { keyPath: 'key' });
                    }
                    if (!db.objectStoreNames.contains(LEDGER_STORE)) {
                        db.createObjectStore(LEDGER_STORE, { keyPath: 'key' });
                    }
                };
                req.onsuccess = function(e) { resolve(e.target.result); };
                req.onerror = function(e) { reject(e.target.error); };
            } catch (e) { reject(e); }
        });
    }

    function idbGet(storeName, key) {
        return openDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                try {
                    var tx = db.transaction(storeName, 'readonly');
                    var store = tx.objectStore(storeName);
                    var req = store.get(key);
                    req.onsuccess = function() { resolve(req.result ? req.result.value : null); };
                    req.onerror = function() { reject(req.error); };
                    tx.oncomplete = function() { db.close(); };
                } catch (e) { reject(e); }
            });
        });
    }

    function idbPut(storeName, key, value) {
        return openDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                try {
                    var tx = db.transaction(storeName, 'readwrite');
                    var store = tx.objectStore(storeName);
                    var req = store.put({ key: key, value: value });
                    req.onsuccess = function() { resolve(); };
                    req.onerror = function() { reject(req.error); };
                    tx.oncomplete = function() { db.close(); };
                } catch (e) { reject(e); }
            });
        });
    }

    // ============================================================
    // 银行卡数据（与 chat-inner 互通）
    // ============================================================
    var WALLET_KEY = 'wallet_data';

    function getDefaultWallet() {
        return {
            balance: 0,
            cardNumber: '',
            bankName: '',
            transactions: []
        };
    }

    function getWalletData() {
        return idbGet(WALLET_STORE, WALLET_KEY).then(function(data) {
            if (data) {
                data.balance = typeof data.balance === 'number' ? data.balance : 0;
                data.cardNumber = data.cardNumber || '';
                data.bankName = data.bankName || '';
                data.transactions = Array.isArray(data.transactions) ? data.transactions : [];
                _walletCache = data;
                return data;
            }
            var def = getDefaultWallet();
            return idbPut(WALLET_STORE, WALLET_KEY, def).then(function() {
                _walletCache = def;
                return def;
            });
        });
    }

    function saveWalletData(data) {
        _walletCache = data;
        return idbPut(WALLET_STORE, WALLET_KEY, data);
    }

    // ============================================================
    // 记账数据（完全独立）
    // ============================================================
    var LEDGER_KEY = 'ledger_data';

    function getDefaultLedger() {
        return { entries: [] };
    }

    function getLedgerData() {
        return idbGet(LEDGER_STORE, LEDGER_KEY).then(function(data) {
            if (data) {
                data.entries = Array.isArray(data.entries) ? data.entries : [];
                _ledgerCache = data;
                return data;
            }
            var def = getDefaultLedger();
            return idbPut(LEDGER_STORE, LEDGER_KEY, def).then(function() {
                _ledgerCache = def;
                return def;
            });
        });
    }

    function saveLedgerData(data) {
        _ledgerCache = data;
        return idbPut(LEDGER_STORE, LEDGER_KEY, data);
    }

    // ============================================================
    // 工具函数
    // ============================================================
    function formatMoney(num) {
        return '¥' + Number(num).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    function formatMoneyRaw(num) {
        return Number(num).toFixed(2);
    }

    function formatTime(iso) {
        try {
            var d = new Date(iso);
            if (isNaN(d.getTime())) return iso;
            var h = String(d.getHours()).padStart(2, '0');
            var m = String(d.getMinutes()).padStart(2, '0');
            var month = String(d.getMonth() + 1).padStart(2, '0');
            var day = String(d.getDate()).padStart(2, '0');
            return month + '/' + day + ' ' + h + ':' + m;
        } catch (e) { return iso; }
    }

    function generateId() {
        return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    function escHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ============================================================
    // 左滑删除组件
    // ============================================================
    function setupSwipeDelete(container, onDelete) {
        var startX = 0;
        var isDragging = false;
        var targetWrap = null;
        var threshold = 40;

        container.addEventListener('touchstart', function(e) {
            var item = e.target.closest('.entry-item');
            if (!item) return;
            var wrap = item.closest('.entry-item-wrap');
            if (!wrap) return;
            if (wrap.classList.contains('swiped-out')) return;

            container.querySelectorAll('.entry-item-wrap.swiped').forEach(function(w) {
                if (w !== wrap) w.classList.remove('swiped');
            });

            targetWrap = wrap;
            var touch = e.touches[0];
            startX = touch.clientX;
            isDragging = true;
            wrap.style.transition = 'none';
        }, { passive: true });

        container.addEventListener('touchmove', function(e) {
            if (!isDragging || !targetWrap) return;
            var touch = e.touches[0];
            var deltaX = touch.clientX - startX;
            if (deltaX > 0) deltaX = 0;
            var item = targetWrap.querySelector('.entry-item');
            if (item) {
                var translate = Math.max(deltaX, -80);
                item.style.transform = 'translateX(' + translate + 'px)';
            }
        }, { passive: true });

        container.addEventListener('touchend', function(e) {
            if (!isDragging || !targetWrap) {
                isDragging = false;
                return;
            }
            isDragging = false;
            var item = targetWrap.querySelector('.entry-item');
            if (!item) { targetWrap = null; return; }

            var computedStyle = window.getComputedStyle(item);
            var matrix = computedStyle.transform;
            var translateX = 0;
            if (matrix && matrix !== 'none') {
                var values = matrix.match(/matrix.*\((.+)\)/);
                if (values) {
                    var nums = values[1].split(', ');
                    translateX = parseFloat(nums[4] || 0);
                }
            }

            targetWrap.style.transition = 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)';

            if (translateX < -threshold) {
                targetWrap.classList.add('swiped');
                item.style.transform = 'translateX(-80px)';
            } else {
                targetWrap.classList.remove('swiped');
                item.style.transform = 'translateX(0)';
            }
            targetWrap = null;
        }, { passive: true });

        container.addEventListener('click', function(e) {
            var deleteBtn = e.target.closest('.entry-delete-btn');
            if (deleteBtn) {
                var wrap = deleteBtn.closest('.entry-item-wrap');
                if (wrap) {
                    var id = wrap.dataset.id;
                    if (id && onDelete) {
                        wrap.classList.add('swiped-out');
                        setTimeout(function() {
                            onDelete(id);
                        }, 350);
                    }
                }
                return;
            }

            var item = e.target.closest('.entry-item');
            if (!item) return;
            var wrap = item.closest('.entry-item-wrap');
            if (!wrap) return;
            if (wrap.classList.contains('swiped')) {
                wrap.classList.remove('swiped');
                item.style.transform = 'translateX(0)';
                return;
            }
            var id = wrap.dataset.id;
            if (id && window._onEditEntry) {
                window._onEditEntry(id);
            }
        });
    }

    // ============================================================
    // 记账操作（独立）
    // ============================================================
    function addLedgerEntry(type, amount, desc) {
        return getLedgerData().then(function(data) {
            var entry = {
                id: generateId(),
                type: type,
                amount: Math.round(amount * 100) / 100,
                desc: desc || '',
                time: new Date().toISOString()
            };
            data.entries.unshift(entry);
            if (data.entries.length > 500) data.entries = data.entries.slice(0, 500);
            return saveLedgerData(data).then(function() {
                renderLedger();
                return entry;
            });
        });
    }

    function deleteLedgerEntry(id) {
        return getLedgerData().then(function(data) {
            data.entries = data.entries.filter(function(e) { return e.id !== id; });
            return saveLedgerData(data).then(function() {
                renderLedger();
                showToast('已删除');
            });
        });
    }

    function updateLedgerEntry(id, type, amount, desc) {
        return getLedgerData().then(function(data) {
            var entry = data.entries.find(function(e) { return e.id === id; });
            if (!entry) return;
            entry.type = type;
            entry.amount = Math.round(amount * 100) / 100;
            entry.desc = desc || '';
            return saveLedgerData(data).then(function() {
                renderLedger();
                showToast('已更新');
            });
        });
    }

    function getLedgerEntry(id) {
        return getLedgerData().then(function(data) {
            return data.entries.find(function(e) { return e.id === id; }) || null;
        });
    }

    function calcLedgerStats(entries) {
        var income = 0,
            expense = 0;
        entries.forEach(function(e) {
            if (e.type === 'income') income += e.amount;
            else expense += e.amount;
        });
        return { income: income, expense: expense, balance: income - expense };
    }

    // ============================================================
    // 银行卡操作（与 chat-inner 互通）
    // ============================================================
    function addWalletTransaction(type, amount, desc) {
        return getWalletData().then(function(data) {
            var tx = {
                id: generateId(),
                type: type,
                amount: Math.round(amount * 100) / 100,
                desc: desc || '',
                time: new Date().toISOString()
            };
            data.transactions = data.transactions || [];
            data.transactions.unshift(tx);
            if (data.transactions.length > 500) data.transactions = data.transactions.slice(0, 500);
            return saveWalletData(data).then(function() {
                renderWallet();
                return tx;
            });
        });
    }

    function updateWalletBalance(delta, desc) {
        return getWalletData().then(function(data) {
            data.balance = Math.round((data.balance + delta) * 100) / 100;
            var type = delta >= 0 ? 'income' : 'expense';
            var tx = {
                id: generateId(),
                type: type,
                amount: Math.abs(delta),
                desc: desc || (delta >= 0 ? '充值' : '支出'),
                time: new Date().toISOString()
            };
            data.transactions = data.transactions || [];
            data.transactions.unshift(tx);
            if (data.transactions.length > 500) data.transactions = data.transactions.slice(0, 500);
            return saveWalletData(data).then(function() {
                renderWallet();
            });
        });
    }

    function deleteWalletTransaction(id) {
        return getWalletData().then(function(data) {
            data.transactions = data.transactions.filter(function(t) { return t.id !== id; });
            return saveWalletData(data).then(function() {
                renderWallet();
                showToast('已删除');
            });
        });
    }

    // ============================================================
    // 渲染
    // ============================================================
    function renderWallet() {
        getWalletData().then(function(data) {
            balanceEl.innerHTML = '<span class="currency">¥</span>' + Number(data.balance).toFixed(2).replace(
                /\B(?=(\d{3})+(?!\d))/g, ',');
            var rawNum = data.cardNumber.replace(/\s/g, '');
            var masked = rawNum.length >= 4 ? '**** **** **** ' + rawNum.slice(-4) : '**** **** **** ****';
            cardNumberEl.innerHTML = masked.replace(/(.{4})/g, '$1 ').trim();
            bankNameEl.textContent = data.bankName || '我的银行卡';

            var txs = data.transactions || [];
            walletTxCount.textContent = txs.length + ' 笔';
            if (txs.length === 0) {
                walletTxList.innerHTML =
                    '<div class="empty-entries"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="7" y1="14" x2="17" y2="14"/></svg><div>暂无交易记录</div></div>';
                return;
            }
            var html = '';
            txs.forEach(function(tx) {
                var isIncome = tx.type === 'income';
                var iconClass = isIncome ? 'income' : 'expense';
                var amountClass = isIncome ? 'income' : 'expense';
                var sign = isIncome ? '+' : '-';
                var iconSvg = isIncome ?
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v8"/><path d="M8 12l4 4 4-4"/></svg>' :
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16V8"/><path d="M8 12l4-4 4 4"/></svg>';
                html +=
                    '<div class="entry-item-wrap" data-id="' + tx.id + '">' +
                    '<div class="entry-item">' +
                    '<div class="entry-icon ' + iconClass + '">' + iconSvg + '</div>' +
                    '<div class="entry-info">' +
                    '<div class="entry-desc">' + escHtml(tx.desc || (isIncome ? '收入' : '支出')) + '</div>' +
                    '<div class="entry-time">' + formatTime(tx.time) + '</div>' +
                    '</div>' +
                    '<div class="entry-amount ' + amountClass + '">' + sign + formatMoneyRaw(tx.amount) + '</div>' +
                    '</div>' +
                    '<button class="entry-delete-btn"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>删除</button>' +
                    '</div>';
            });
            walletTxList.innerHTML = html;
            setupSwipeDelete(walletTxList, function(id) {
                deleteWalletTransaction(id);
            });
        });
    }

    function renderLedger() {
        getLedgerData().then(function(data) {
            var entries = data.entries || [];
            var stats = calcLedgerStats(entries);

            totalIncomeEl.textContent = formatMoney(stats.income);
            totalExpenseEl.textContent = formatMoney(stats.expense);
            totalBalanceEl.textContent = formatMoney(stats.balance);
            entryCountEl.textContent = entries.length + ' 笔';

            if (entries.length === 0) {
                entryListEl.innerHTML =
                    '<div class="empty-entries"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="7" y1="14" x2="17" y2="14"/></svg><div>还没有记账记录<br>点击右上角 + 开始记账</div></div>';
                return;
            }

            var html = '';
            entries.forEach(function(e) {
                var isIncome = e.type === 'income';
                var iconClass = isIncome ? 'income' : 'expense';
                var amountClass = isIncome ? 'income' : 'expense';
                var sign = isIncome ? '+' : '-';
                var iconSvg = isIncome ?
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v8"/><path d="M8 12l4 4 4-4"/></svg>' :
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16V8"/><path d="M8 12l4-4 4 4"/></svg>';
                var desc = e.desc || (isIncome ? '收入' : '支出');
                html +=
                    '<div class="entry-item-wrap" data-id="' + e.id + '">' +
                    '<div class="entry-item">' +
                    '<div class="entry-icon ' + iconClass + '">' + iconSvg + '</div>' +
                    '<div class="entry-info">' +
                    '<div class="entry-desc">' + escHtml(desc) + '</div>' +
                    '<div class="entry-time">' + formatTime(e.time) + '</div>' +
                    '</div>' +
                    '<div class="entry-amount ' + amountClass + '">' + sign + formatMoneyRaw(e.amount) + '</div>' +
                    '</div>' +
                    '<button class="entry-delete-btn"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>删除</button>' +
                    '</div>';
            });
            entryListEl.innerHTML = html;

            window._onEditEntry = function(id) {
                openEditModal(id);
            };

            setupSwipeDelete(entryListEl, function(id) {
                deleteLedgerEntry(id);
            });
        });
    }

    function renderAll() {
        renderWallet();
        renderLedger();
    }

    // ============================================================
    // Toast
    // ============================================================
    var toastTimer = null;

    function showToast(msg) {
        toastEl.textContent = msg;
        toastEl.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function() {
            toastEl.classList.remove('show');
        }, 2000);
    }

    // ============================================================
    // 弹窗工具
    // ============================================================
    function openModal(el) { el.classList.add('active'); }

    function closeModal(el) { el.classList.remove('active'); }

    // ============================================================
    // 新增记账（独立）
    // ============================================================
    function openAddModal() {
        entryType.value = 'income';
        entryAmount.value = '';
        entryDesc.value = '';
        document.getElementById('modalTitle').textContent = '记一笔';
        document.getElementById('modalSub').textContent = '记录你的收支';
        openModal(entryModal);
        setTimeout(function() { entryAmount.focus(); }, 200);
    }

    function handleAddSubmit() {
        var type = entryType.value;
        var amount = parseFloat(entryAmount.value);
        var desc = entryDesc.value.trim();
        if (!amount || amount <= 0) { showToast('请输入有效的金额'); return; }
        if (amount > 99999999) { showToast('金额太大，请检查'); return; }
        addLedgerEntry(type, amount, desc || (type === 'income' ? '收入' : '支出')).then(function() {
            closeModal(entryModal);
            showToast(type === 'income' ? '收入已记录 ✓' : '支出已记录 ✓');
        });
    }

    // ============================================================
    // 修改记账（独立）
    // ============================================================
    function openEditModal(id) {
        getLedgerEntry(id).then(function(entry) {
            if (!entry) { showToast('记录不存在'); return; }
            editingId = id;
            editType.value = entry.type;
            editAmount.value = entry.amount;
            editDesc.value = entry.desc || '';
            openModal(editModal);
            setTimeout(function() { editAmount.focus(); }, 200);
        });
    }

    function handleEditSubmit() {
        if (!editingId) return;
        var type = editType.value;
        var amount = parseFloat(editAmount.value);
        var desc = editDesc.value.trim();
        if (!amount || amount <= 0) { showToast('请输入有效的金额'); return; }
        updateLedgerEntry(editingId, type, amount, desc || (type === 'income' ? '收入' : '支出')).then(function() {
            closeModal(editModal);
            editingId = null;
        });
    }

    // ============================================================
    // 充值（银行卡）
    // ============================================================
    function handleRecharge() {
        var val = parseFloat(rechargeAmount.value);
        if (!val || val <= 0) { showToast('请输入有效的充值金额'); return; }
        if (val > 100000) { showToast('单次充值不能超过 100,000 元'); return; }
        updateWalletBalance(val, '充值 ' + formatMoneyRaw(val) + ' 元').then(function() {
            closeModal(rechargeModal);
            rechargeAmount.value = '';
            showToast('充值成功！');
            if (window.parent !== window) {
                try {
                    getWalletData().then(function(data) {
                        window.parent.postMessage({ type: 'walletUpdated', data: data }, '*');
                    });
                } catch (e) {}
            }
        });
    }

    // ============================================================
    // 切换页面
    // ============================================================
    function switchTab(tab) {
        currentTab = tab;
        tabBtns.forEach(function(btn) {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        pageWallet.classList.toggle('active', tab === 'wallet');
        pageLedger.classList.toggle('active', tab === 'ledger');
        navTitle.textContent = tab === 'wallet' ? '钱包' : '记账';
        addBtn.classList.toggle('hidden', tab === 'wallet');
    }

    // ============================================================
    // 返回
    // ============================================================
    function goBack() {
        if (window.parent !== window) {
            window.parent.postMessage({ type: 'closeFullscreen' }, '*');
        } else {
            history.back();
        }
    }

    // ============================================================
    // 接收来自父页面（chat-inner）的消息
    // ============================================================
    window.addEventListener('message', function(event) {
        var data = event.data;
        if (!data) return;

        if (data.type === 'NANO_TRANSFER_SUBMIT' || data.type === 'walletSyncResponse' || data.type ===
            'walletUpdated') {
            if (data.data) {
                getWalletData().then(function(wd) {
                    if (data.data.balance !== undefined) wd.balance = data.data.balance;
                    if (data.data.transactions) wd.transactions = data.data.transactions;
                    saveWalletData(wd).then(function() { renderWallet(); });
                });
            }
        }

        if (data.type === 'NANO_TRANSFER_CARD') {
            if (data.amount && data.amount > 0) {
                updateWalletBalance(data.amount, '收到转账 ' + formatMoneyRaw(data.amount) + ' 元');
            }
        }

        if (data.type === 'walletRefresh') {
            renderWallet();
        }

        if (data.type === 'walletSyncRequest') {
            getWalletData().then(function(data) {
                try {
                    window.parent.postMessage({ type: 'walletSyncResponse', data: data }, '*');
                } catch (e) {}
            });
        }
    });

    // ============================================================
    // 暴露 API
    // ============================================================
    window.__wallet = {
        getWalletData: getWalletData,
        getLedgerData: getLedgerData,
        addLedgerEntry: addLedgerEntry,
        deleteLedgerEntry: deleteLedgerEntry,
        updateLedgerEntry: updateLedgerEntry,
        updateWalletBalance: updateWalletBalance,
        render: renderAll,
        showToast: showToast,
        switchTab: switchTab
    };

    // ============================================================
    // 事件绑定
    // ============================================================
    backBtn.addEventListener('click', goBack);

    tabBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
            switchTab(this.dataset.tab);
        });
    });

    addBtn.addEventListener('click', openAddModal);

    entryCancel.addEventListener('click', function() { closeModal(entryModal); });
    entryConfirm.addEventListener('click', handleAddSubmit);
    entryAmount.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault();
            entryDesc.focus(); }
    });
    entryDesc.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault();
            entryConfirm.click(); }
    });

    editCancel.addEventListener('click', function() { closeModal(editModal);
        editingId = null; });
    editConfirm.addEventListener('click', handleEditSubmit);
    editAmount.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault();
            editDesc.focus(); }
    });
    editDesc.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault();
            editConfirm.click(); }
    });

    rechargeBtn.addEventListener('click', function() {
        rechargeAmount.value = '';
        openModal(rechargeModal);
        setTimeout(function() { rechargeAmount.focus(); }, 200);
    });
    rechargeCancel.addEventListener('click', function() { closeModal(rechargeModal);
        rechargeAmount.value = ''; });
    rechargeConfirm.addEventListener('click', handleRecharge);
    rechargeAmount.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault();
            rechargeConfirm.click(); }
    });

    document.querySelectorAll('.modal-overlay').forEach(function(el) {
        el.addEventListener('click', function(e) {
            if (e.target === this) {
                closeModal(this);
                if (this.id === 'rechargeModal') rechargeAmount.value = '';
                if (this.id === 'editModal') { editingId = null; }
            }
        });
    });

    // ============================================================
    // 初始化
    // ============================================================
    renderAll();
    switchTab('wallet');

    if (window.parent !== window) {
        try {
            window.parent.postMessage({ type: 'pageLoaded', page: 'wallet' }, '*');
            window.parent.postMessage({ type: 'walletSyncRequest' }, '*');
        } catch (e) {}
    }

})();