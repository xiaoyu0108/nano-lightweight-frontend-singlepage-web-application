// ===== 转账功能 =====
(function() {
    const transferPopup = document.getElementById('transferPopup');
    const transferAmount = document.getElementById('transferAmount');
    const transferNote = document.getElementById('transferNote');
    const transferCancel = document.getElementById('transferCancel');
    const transferConfirm = document.getElementById('transferConfirm');

    transferCancel.addEventListener('click', function() {
        transferPopup.classList.remove('active');
    });

    // 读取钱包余额；没有记录时按初始 5000 处理
    function getWalletBalance() {
        return new Promise(function(resolve) {
            try {
                var req = indexedDB.open('nano_wallet_db', 1);
                req.onupgradeneeded = function(e) {
                    try {
                        var d = e.target.result;
                        if (!d.objectStoreNames.contains('wallet_data')) d.createObjectStore('wallet_data', { keyPath: 'key' });
                        if (!d.objectStoreNames.contains('ledger_data')) d.createObjectStore('ledger_data', { keyPath: 'key' });
                    } catch (e) {}
                };
                req.onsuccess = function(e) {
                    var db = e.target.result;
                    try {
                        var tx = db.transaction('wallet_data', 'readonly');
                        var r = tx.objectStore('wallet_data').get('wallet_data');
                        r.onsuccess = function() { resolve(r.result && typeof r.result.value.balance === 'number' ? r.result.value.balance : 5000); };
                        r.onerror = function() { resolve(5000); };
                    } catch (err) { resolve(5000); }
                };
                req.onerror = function() { resolve(5000); };
            } catch (e) { resolve(5000); }
        });
    }

    transferConfirm.addEventListener('click', async function() {
        const amount = transferAmount.value.trim();
        const note = transferNote.value.trim() || '转账';
        if (!amount || parseFloat(amount) <= 0) {
            window.__chat.showAlert('提示', '请输入正确金额');
            return;
        }
        const balance = await getWalletBalance();
        if (balance <= 0) {
            window.__chat.showAlert('提示', '钱包余额为 0，无法转账');
            return;
        }
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const timeStr = h + ':' + m;
        const cardData = {
            cardType: 'transfer',
            amount: '¥' + parseFloat(amount).toFixed(2),
            title: note,
            footer: '已发送',
            status: 'pending'
        };
        window.__chat.addMessage('right', '', timeStr, null, false, true, cardData);
        window.__chat.saveMessages();
        transferPopup.classList.remove('active');
    });

    transferPopup.addEventListener('click', function(e) {
        if (e.target === this) transferPopup.classList.remove('active');
    });
})();