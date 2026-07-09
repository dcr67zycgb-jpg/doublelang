/* DoubleLang — динамический блог.
   Читает /articles.json, определяет язык страницы и рисует карточки
   в блок .blog-grid. Чтобы добавить статью — достаточно дописать
   один объект в articles.json (см. AGENT-GUIDE.md). Разметку страниц
   трогать не нужно. */
(function () {
  function pageLang() {
    var p = location.pathname.toLowerCase();
    if (/\/german\//.test(p))  return 'de';
    if (/\/french\//.test(p))  return 'fr';
    if (/\/english\//.test(p)) return 'en';
    if (/\/serbian\//.test(p)) return 'sr';
    if (/home\.html/.test(p) || p === '/' || p === '') return 'all';
    return 'nl'; // index.html, dutch-general.html
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function cardHTML(a, i, hidden) {
    var rev = 's' + ((i % 6) + 1);
    var extra = hidden ? ' blog-extra' : '';
    var style = hidden ? ' style="display:none"' : '';
    return (
      '<article class="blog-card reveal ' + rev + extra + '"' + style + '>' +
        '<div class="blog-thumb" style="padding:0;overflow:hidden">' +
          '<img src="' + esc(a.cover) + '" alt="' + esc(a.title) + '" loading="lazy" style="width:100%;height:100%;object-fit:cover">' +
          (a.category ? '<span class="blog-cat" style="position:absolute;top:14px;left:14px">' + esc(a.category) + '</span>' : '') +
        '</div>' +
        '<div class="blog-body">' +
          '<h3>' + esc(a.title) + '</h3>' +
          '<p>' + esc(a.excerpt) + '</p>' +
          '<div class="blog-meta">' +
            '<span>' + esc(a.readtime || '') + '</span>' +
            '<a href="' + esc(a.url) + '" class="blog-read">Читать →</a>' +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }

  function revealCards(grid) {
    // Гарантированно показываем карточки блога, даже если
    // IntersectionObserver/анимация reveal не сработали.
    (grid || document).querySelectorAll('.blog-card.reveal').forEach(function (el) {
      if (!el.classList.contains('blog-extra')) el.classList.add('visible');
    });
  }

  function render(list) {
    var grid = document.querySelector('.blog-grid');
    if (!grid) return;
    if (!list.length) { revealCards(grid); return; }
    var VISIBLE = 3;
    grid.innerHTML = list
      .map(function (a, i) { return cardHTML(a, i, i >= VISIBLE); })
      .join('');

    // подключаем существующую кнопку "показать ещё", если она есть
    var btn = document.getElementById('blog-toggle');
    var hasExtra = list.length > VISIBLE;
    if (btn) {
      if (!hasExtra) { btn.style.display = 'none'; return; }
      btn.style.display = '';
      var open = false;
      btn.onclick = function () {
        open = !open;
        document.querySelectorAll('.blog-extra').forEach(function (el) {
          el.style.display = open ? '' : 'none';
        });
        btn.textContent = open ? 'Скрыть' : 'Показать все статьи (' + list.length + ')';
      };
      btn.textContent = 'Показать все статьи (' + list.length + ')';
    }

    // прогоняем reveal-анимацию для новых карточек
    if (window.IntersectionObserver) {
      var io = new IntersectionObserver(function (ents) {
        ents.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
      }, { threshold: 0.1, rootMargin: '0px 0px -36px 0px' });
      grid.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
    } else {
      grid.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('visible'); });
    }
    // Подстраховка: если через 1.4с карточки всё ещё скрыты — показываем принудительно.
    setTimeout(function () { revealCards(grid); }, 1400);
  }

  function boot() {
    var lang = pageLang();
    fetch('/articles.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (all) {
        var list = (lang === 'all')
          ? all.slice()
          : all.filter(function (a) {
              var L = a.lang;
              return L === lang || (Array.isArray(L) && L.indexOf(lang) !== -1) || L === 'all';
            });
        list.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
        render(list);
      })
      .catch(function () { revealCards(document.querySelector('.blog-grid')); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
