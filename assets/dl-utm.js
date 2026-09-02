/* dl-utm.js — метки рекламы: запомнить при входе, приложить к заявке.
 *
 * ЗАЧЕМ. Платформа уже вытаскивает метки из `page_url` заявки, и для прямого пути этого
 * хватает: человек кликнул рекламу, попал на /french/?utm_...=, тут же оставил заявку.
 * Но если он походил по сайту и вернулся с другой страницы, `page_url` уже чистый —
 * метки теряются. Здесь они переживают переходы: localStorage, а не переменная страницы.
 * Он же даёт first-touch (самый первый источник визита), которого у платформы нет вовсе.
 *
 * ⚠️ ПОЧЕМУ ПЕРЕХВАТ ТРАНСПОРТА, А НЕ СКРЫТЫЕ ПОЛЯ, как в ТЗ. Формы на сайте НЕ
 * отправляют html-форму: каждая собирает JSON руками и шлёт его сама. Замер 02.09 —
 * 25 мест с `fetch` и 12 файлов с `XMLHttpRequest` на 13 страницах. Скрытое поле в
 * разметке в такой body просто не попадёт, а править 37 рукописных вызовов — 37 шансов
 * ошибиться и ни одного способа проверить, что нигде не забыл.
 *
 * ⚠️ ПРАВИЛО БЕЗОПАСНОСТИ: любая неудача здесь ДОЛЖНА заканчиваться обычной отправкой.
 * Заявка важнее метки. Поэтому каждый шаг в try/catch и при любой неожиданности мы
 * отдаём управление исходному транспорту, ничего не меняя.
 */
(function () {
  'use strict';

  var KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
              'placement', 'ad_id', 'fbclid'];
  var LT = 'dl_lt';           // last-touch: последний рекламный вход
  var FT = 'dl_ft';           // first-touch: самый первый, пишется один раз навсегда
  var LEAD = '/api/crm/webhooks/lead';

  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* приватный режим */ } }
  function load(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }

  /* Метки из адреса. Значения НЕ раскодируем и не трогаем: сервер разбирает query сам
   * (parse_qs), и второй разбор здесь только внёс бы расхождение между тем, что видит
   * платформа в page_url, и тем, что мы прислали полем. */
  function fromUrl() {
    var out = {}, has = false;
    try {
      var p = new URLSearchParams(location.search);
      for (var i = 0; i < KEYS.length; i++) {
        var v = p.get(KEYS[i]);
        if (v) { out[KEYS[i]] = v; has = true; }
      }
    } catch (e) { return null; }
    return has ? out : null;
  }

  /* Запоминаем при каждом рекламном входе. last-touch перезаписывается — последний
   * клик важнее для атрибуции расхода; first-touch пишется ТОЛЬКО если пуст, иначе он
   * перестал бы быть первым. */
  var fresh = fromUrl();
  if (fresh) {
    var s = '';
    try { s = JSON.stringify(fresh); } catch (e) { s = ''; }
    if (s) {
      store(LT, s);
      if (!load(FT)) store(FT, s);
    }
  }

  /* Метки для заявки: свежие из адреса, иначе запомненные. Плюс first_source отдельным
   * полем — платформа кладёт его в свою колонку. */
  function marks() {
    var m = {};
    try {
      var lt = fresh || JSON.parse(load(LT) || '{}');
      for (var k in lt) { if (lt[k]) m[k] = lt[k]; }
      /* first_source — ЗНАЧЕНИЕ источника, а не весь первый контекст: по нему
       * группируют в отчёте, а JSON-строка не сгруппируется. Полный первый контекст
       * остаётся в localStorage под dl_ft, если однажды понадобится. */
      try {
        var ft = JSON.parse(load(FT) || '{}');
        if (ft && ft.utm_source) m.first_source = ft.utm_source;
      } catch (e) { /* первый контекст испорчен — просто не шлём */ }
    } catch (e) { return {}; }
    return m;
  }

  function isLead(url) {
    try { return String(url || '').indexOf(LEAD) !== -1; } catch (e) { return false; }
  }

  /* Дописываем ТОЛЬКО отсутствующие ключи: если форма прислала своё значение, оно
   * точнее — человек мог оставить заявку по другому направлению, чем пришёл. Тот же
   * порядок «форма → метка», что на сервере. */
  function mergeBody(body) {
    var m = marks();
    if (!m || !Object.keys(m).length) return body;
    try {
      var o = JSON.parse(body);
      if (!o || typeof o !== 'object' || Array.isArray(o)) return body;
      for (var k in m) { if (!o[k]) o[k] = m[k]; }
      return JSON.stringify(o);
    } catch (e) { return body; }   // не JSON — не наше дело, отдаём как было
  }

  /* ── fetch ───────────────────────────────────────────────────────────────── */
  var _fetch = window.fetch;
  if (typeof _fetch === 'function') {
    window.fetch = function (input, init) {
      try {
        var url = (typeof input === 'string') ? input : (input && input.url);
        if (isLead(url) && init && typeof init.body === 'string') {
          init = Object.assign({}, init, { body: mergeBody(init.body) });
        }
      } catch (e) { /* заявка важнее метки */ }
      /* ⚠️ call(this, input, init), а НЕ apply(this, arguments): файл в строгом режиме,
       * а в нём `arguments` НЕ связан с параметрами — переприсваивание `init` выше
       * потерялось бы, и метки не дошли бы. Поймано стендом: XHR работал, fetch молча
       * отправлял тело без меток. Глазами это не видно, форма выглядит правильной. */
      return _fetch.call(this, input, init);
    };
  }

  /* ── XMLHttpRequest ──────────────────────────────────────────────────────── */
  var XP = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
  if (XP && XP.open && XP.send) {
    var _open = XP.open, _send = XP.send;
    XP.open = function (method, url) {
      try { this.__dlLead = isLead(url); } catch (e) { this.__dlLead = false; }
      return _open.apply(this, arguments);
    };
    XP.send = function (body) {
      try {
        if (this.__dlLead && typeof body === 'string') {
          return _send.call(this, mergeBody(body));
        }
      } catch (e) { /* см. выше */ }
      return _send.apply(this, arguments);
    };
  }

  /* Для отладки с консоли: видно, что запомнено, без похода в localStorage руками. */
  window.dlUtm = { marks: marks, lt: function () { return load(LT); }, ft: function () { return load(FT); } };
})();
