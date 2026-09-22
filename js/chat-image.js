// ===== 图片功能 =====
(function() {
    const imagePopup = document.getElementById('imagePopup');
    const imageFileInput = document.getElementById('imageFileInput');
    const imagePreview = document.getElementById('imagePreview');
    const imagePreviewBox = document.getElementById('imagePreviewBox');
    const imageTextInput = document.getElementById('imageTextInput');
    const imageCancel = document.getElementById('imageCancel');
    const imageConfirm = document.getElementById('imageConfirm');
    let selectedImageData = '';

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
        if (!selectedImageData && !textContent) {
            window.__chat.showAlert('提示', '请选择图片或输入文字');
            return;
        }
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const timeStr = h + ':' + m;

        if (selectedImageData) {
            window.__chat.addMessage('right', '', timeStr, null, false, false, null, null, null,
                null, false, null, true, { url: selectedImageData, desc: '图片' });
        } else if (textContent) {
            window.__chat.addMessage('right', textContent, timeStr, null, false, false, null, null, null, null, false, null, true, { textImage: true });
        }
        window.__chat.saveMessages();
        imagePopup.classList.remove('active');
    });

    imagePopup.addEventListener('click', function(e) {
        if (e.target === this) imagePopup.classList.remove('active');
    });
})();