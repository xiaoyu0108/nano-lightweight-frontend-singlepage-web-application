// ============================================================
// discover.js — 照片墙（点击换图）+ 入口跳转
// ============================================================
(function () {
  'use strict';

  /* ---------------- 1. 照片轮播 ---------------- */
  var cards = Array.prototype.slice.call(document.querySelectorAll('.card'));
  var total = cards.length;
  var current = 0;
  var targetPhoto = 0;

  var dotsBox = document.getElementById('dots');
  if (dotsBox) {
    cards.forEach(function (_, i) {
      var d = document.createElement('span');
      d.className = 'dot' + (i === 0 ? ' active' : '');
      dotsBox.appendChild(d);
    });
  }

  function positionCards() {
    if (!total) return;
    cards.forEach(function (card) {
      var i = Number(card.dataset.index);
      var diff = (i - current + total) % total;
      card.className = 'card';
      if (diff === 0) card.classList.add('center');
      else if (diff === 1) card.classList.add('right');
      else if (diff === 2) card.classList.add('farright');
      else if (diff === total - 1) card.classList.add('left');
      else card.classList.add('farleft');
    });
    if (dotsBox) {
      Array.prototype.forEach.call(dotsBox.children, function (d, i) {
        d.classList.toggle('active', i === current);
      });
    }
  }

  if (total) {
    positionCards();

    cards.forEach(function (card) {
      card.addEventListener('click', function () {
        var i = Number(card.dataset.index);
        if (i === current) {
          openSheet(i);
        } else {
          current = i;
          positionCards();
        }
      });
    });

    var startX = 0;
    var carousel = document.getElementById('carousel');
    if (carousel) {
      carousel.addEventListener('touchstart', function (e) {
        startX = e.touches[0].clientX;
      }, { passive: true });

      carousel.addEventListener('touchend', function (e) {
        var dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) > 35) {
          current = (current + (dx < 0 ? 1 : -1) + total) % total;
          positionCards();
        }
      }, { passive: true });
    }
  }

  /* ---------------- 2. 换图弹层 ---------------- */
  var sheet = document.getElementById('sheet');
  var mask = document.getElementById('mask');
  var fileInput = document.getElementById('fileInput');
  var toast = document.getElementById('toast');

  function showToast(text) {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(window.__toast);
    window.__toast = setTimeout(function () {
      toast.classList.remove('show');
    }, 1100);
  }

  function openSheet(index) {
    targetPhoto = index;
    if (sheet) sheet.classList.add('open');
    if (mask) mask.classList.add('open');
  }
  function closeSheet() {
    if (sheet) sheet.classList.remove('open');
    if (mask) mask.classList.remove('open');
  }

  var chooseBtn = document.getElementById('choose');
  if (chooseBtn) {
    chooseBtn.addEventListener('click', function () {
      closeSheet();
      if (fileInput) { fileInput.value = ''; fileInput.click(); }
    });
  }
  var cancelBtn = document.getElementById('cancel');
  if (cancelBtn) cancelBtn.addEventListener('click', closeSheet);
  if (mask) mask.addEventListener('click', closeSheet);

  if (fileInput) {
    fileInput.addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var url = URL.createObjectURL(file);
      var card = cards.filter(function (c) {
        return Number(c.dataset.index) === targetPhoto;
      })[0];
      if (card) {
        var img = card.querySelector('img');
        if (img) img.src = url;
        showToast('photo updated');
      }
    });
  }

  /* ---------------- 3. 入口跳转 ---------------- */
  var APPS = {
    moments: { url: 'moments.html', title: 'Moments' },
    ins:     { url: 'ins.html?v=14', title: 'Instagram' },
    couple:  { url: 'couple-spaces.html', title: 'Couple Spaces' },
    halo:    { url: 'halo.html', title: 'Halo' },
    books:   { url: 'books.html', title: 'Books' },
    music:   { url: 'music.html', title: 'Music' }
  };

  Array.prototype.forEach.call(document.querySelectorAll('.entry[data-app]'), function (el) {
    el.addEventListener('click', function () {
      var app = APPS[el.getAttribute('data-app')];
      if (!app) return;
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({
            type: 'openFullscreen',
            url: app.url,
            title: app.title,
            showBack: false,
            source: 'discover'
          }, '*');
          return;
        }
      } catch (e) { /* ignore */ }
      window.location.href = app.url;
    });
  });
})();