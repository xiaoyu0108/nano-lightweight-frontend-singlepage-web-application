// ===== 图片功能 =====
(function() {
    const imagePopup = document.getElementById('imagePopup');
    const imageFileInput = document.getElementById('imageFileInput');
    const imagePreview = document.getElementById('imagePreview');
    const imagePreviewBox = document.getElementById('imagePreviewBox');
    const imageTextInput = document.getElementById('imageTextInput');
    const imageCancel = document.getElementById('imageCancel');
    const imageConfirm = document.getElementById('imageConfirm');
    const imgTabText = document.getElementById('imgTabText');
    const imgTabFile = document.getElementById('imgTabFile');
    const imgPaneText = document.getElementById('imgPaneText');
    const imgPaneFile = document.getElementById('imgPaneFile');
    let selectedImageData = '';
    let imgTab = 'text';

    function setImgTab(t) {
        imgTab = t;
        if (imgTabText) imgTabText.classList.toggle('active', t === 'text');
        if (imgTabFile) imgTabFile.classList.toggle('active', t === 'file');
        if (imgPaneText) imgPaneText.style.display = (t === 'text') ? '' : 'none';
        if (imgPaneFile) imgPaneFile.style.display = (t === 'file') ? '' : 'none';
    }
    if (imgTabText) imgTabText.addEventListener('click', function () { setImgTab('text'); });
    if (imgTabFile) imgTabFile.addEventListener('click', function () { setImgTab('file'); });
    setImgTab('text');

    imageFileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(evt) {
                selectedImageData = evt.target.result;
                imagePreview.src = selectedImageData;
                imagePreviewBox.style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    });

    imageCancel.addEventListener('click', function() {
        imagePopup.classList.remove('active');
    });

    imageConfirm.addEventListener('click', function() {
        const textContent = imageTextInput.value.trim();
        if (imgTab === 'file') {
            if (!selectedImageData) { window.__chat.showAlert('提示', '请选择一张照片'); return; }
        } else if (!textContent) {
            window.__chat.showAlert('提示', '请输入要生成的文字');
            return;
        }
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const timeStr = h + ':' + m;

        if (imgTab === 'file') {
            window.__chat.addMessage('right', '', timeStr, null, false, false, null, null, null,
                null, false, null, true, { url: selectedImageData, desc: '图片' });
        } else {
            window.__chat.addMessage('right', textContent, timeStr, null, false, false, null, null, null, null, false, null, true, { textImage: true });
        }
        window.__chat.saveMessages();
        imagePopup.classList.remove('active');
    });

    imagePopup.addEventListener('click', function(e) {
        if (e.target === this) imagePopup.classList.remove('active');
    });
})();