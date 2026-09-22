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

    transferConfirm.addEventListener('click', function() {
        const amount = transferAmount.value.trim();
        const note = transferNote.value.trim() || '转账';
        if (!amount || parseFloat(amount) <= 0) {
            window.__chat.showAlert('提示', '请输入正确金额');
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