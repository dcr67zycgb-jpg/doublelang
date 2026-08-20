/* DoubleLang — проверка телефона перед отправкой заявки.
 *
 * Зачем: отправка висит на клике по кнопке цели, которая сразу шлёт данные в
 * CRM. Единственная существовавшая проверка (поле не пустое) срабатывала лишь
 * при переходе между шагами формы и кнопкой цели обходилась. В результате в
 * CRM могла уехать заявка с телефоном "+31" или "+7 0".
 *
 * Как работает: перехватываем клик и submit в фазе захвата, то есть ДО
 * встроенных в страницу обработчиков. Если номер не проходит проверку -
 * stopImmediatePropagation() не даёт отправке начаться. Разметку страниц при
 * этом трогать не нужно.
 */
(function () {
  'use strict';

  /* Ожидаемая длина национальной части по коду страны.
   * min/max — без кода страны. trunk — цифра, которую местные пишут в начале
   * номера внутри страны и которую нужно отбросить при международной записи
   * (в Нидерландах 0 6 12345678 -> +31 6 12345678). */
  var COUNTRIES = {
    '7':   { name: 'Россия / Казахстан', min: 10, max: 10, trunk: '8' },
    '31':  { name: 'Нидерланды',         min: 9,  max: 9,  trunk: '0' },
    '32':  { name: 'Бельгия',            min: 8,  max: 9,  trunk: '0' },
    '49':  { name: 'Германия',           min: 10, max: 11, trunk: '0' },
    '43':  { name: 'Австрия',            min: 10, max: 11, trunk: '0' },
    '41':  { name: 'Швейцария',          min: 9,  max: 9,  trunk: '0' },
    '33':  { name: 'Франция',            min: 9,  max: 9,  trunk: '0' },
    '44':  { name: 'Великобритания',     min: 10, max: 10, trunk: '0' },
    '1':   { name: 'США / Канада',       min: 10, max: 10, trunk: null },
    '381': { name: 'Сербия',             min: 8,  max: 9,  trunk: '0' },
    '90':  { name: 'Турция',             min: 10, max: 10, trunk: '0' },
    '34':  { name: 'Испания',            min: 9,  max: 9,  trunk: null },
    '351': { name: 'Португалия',         min: 9,  max: 9,  trunk: null },
    '30':  { name: 'Греция',             min: 10, max: 10, trunk: null },
    '81':  { name: 'Япония',             min: 10, max: 10, trunk: '0' },
    '375': { name: 'Беларусь',           min: 9,  max: 9,  trunk: '0' },
    '380': { name: 'Украина',            min: 9,  max: 9,  trunk: '0' },
    '995': { name: 'Грузия',             min: 9,  max: 9,  trunk: null },
    '374': { name: 'Армения',            min: 8,  max: 8,  trunk: '0' },
    '998': { name: 'Узбекистан',         min: 9,  max: 9,  trunk: null },
    '996': { name: 'Кыргызстан',         min: 9,  max: 9,  trunk: '0' },
    '972': { name: 'Израиль',            min: 9,  max: 9,  trunk: '0' },
    '48':  { name: 'Польша',             min: 9,  max: 9,  trunk: null },
    '39':  { name: 'Италия',             min: 9,  max: 10, trunk: null },
    '420': { name: 'Чехия',              min: 9,  max: 9,  trunk: null },
    '971': { name: 'ОАЭ',                min: 9,  max: 9,  trunk: '0' },
    '357': { name: 'Кипр',               min: 8,  max: 8,  trunk: null }
  };

  /* Коды разбираем от длинных к коротким: иначе "+375..." опознается как "+37". */
  var CODES = Object.keys(COUNTRIES).sort(function (a, b) { return b.length - a.length; });

  function digits(value) { return String(value || '').replace(/\D/g, ''); }

  /* Разбирает номер: код страны, национальная часть, отброшенный внутренний ноль. */
  function parse(value) {
    var d = digits(value);
    if (!d) return { empty: true };

    var localRu = false;
    /* Русскоязычная аудитория чаще всего набирает номер в местной записи:
     * 8 999 123 45 67. Это не ошибка ввода, а привычка - приводим к +7 сами,
     * иначе половина заявок упрётся в проверку на ровном месте. */
    if (String(value).trim().charAt(0) !== '+' && d.charAt(0) === '8' &&
        d.length >= 8 && d.length <= 11) {
      d = '7' + d.slice(1);
      localRu = true;
    }

    for (var i = 0; i < CODES.length; i++) {
      var code = CODES[i];
      if (d.indexOf(code) !== 0) continue;
      var rest = d.slice(code.length);
      var country = COUNTRIES[code];
      var trimmed = false;

      /* Классическая ошибка: человек дописывает местный номер целиком, вместе с
       * внутренним нулём. +31 06 12345678 - лишний ноль, номер длиннее нормы. */
      if (country.trunk && rest.charAt(0) === country.trunk && rest.length > country.min) {
        rest = rest.slice(1);
        trimmed = true;
      }
      return { code: code, rest: rest, country: country,
               trimmed: trimmed, localRu: localRu };
    }
    return { unknownCode: true, raw: d };
  }

  /* Возвращает {ok, message, normalized}. */
  function validate(value) {
    var p = parse(value);

    if (p.empty) {
      return { ok: false, message: 'Укажите номер телефона' };
    }
    if (p.unknownCode) {
      return { ok: false, message: 'Номер должен начинаться с кода страны, например +31' };
    }
    if (!p.rest.length) {
      return { ok: false, message: 'После кода +' + p.code + ' введите сам номер' };
    }
    if (p.rest.length < p.country.min) {
      var need = p.country.min - p.rest.length;
      return {
        ok: false,
        message: 'Номер неполный: не хватает ' + need + ' ' + plural(need, 'цифры', 'цифр', 'цифр')
      };
    }
    if (p.rest.length > p.country.max) {
      return {
        ok: false,
        message: 'В номере лишние цифры: для страны +' + p.code + ' их должно быть ' +
                 (p.country.min === p.country.max ? p.country.min : p.country.min + '–' + p.country.max)
      };
    }
    /* Одна и та же цифра подряд - заведомо тестовый ввод. */
    if (/^(\d)\1+$/.test(p.rest)) {
      return { ok: false, message: 'Похоже, номер введён не полностью' };
    }
    return { ok: true, normalized: '+' + p.code + p.rest, trimmed: p.trimmed };
  }

  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }

  /* --- отображение ошибки рядом с полем --- */

  function isVisible(el) {
    return !!(el && el.offsetParent !== null);
  }

  /* Форма многошаговая: телефон на первом шаге, кнопки цели на втором. Если
   * ругаться на скрытое поле, снаружи выглядит так, будто ничего не произошло.
   * Поэтому возвращаем человека на шаг с телефоном. */
  function revealPhoneStep(input) {
    if (isVisible(input)) return;
    var back = document.getElementById('fstep-back');
    if (back && isVisible(back)) { back.click(); return; }
    var step1 = document.getElementById('fstep1');
    var step2 = document.getElementById('fstep2');
    if (step1) step1.style.display = '';
    if (step2) step2.style.display = 'none';
  }

  function showError(input, message) {
    revealPhoneStep(input);

    input.style.borderColor = '#e05555';
    input.style.background = '#fff6f6';
    var box = input.parentNode.querySelector('.dl-phone-error');
    if (!box) {
      box = document.createElement('div');
      box.className = 'dl-phone-error';
      box.style.cssText = 'color:#e05555;font-size:13px;margin-top:6px;' +
                          'line-height:1.4;font-weight:600';
      input.parentNode.appendChild(box);
    }
    box.textContent = message;

    /* Короткая подсветка привлекает внимание, если поле уже было на экране
     * и человек его просто не заметил. */
    input.style.transition = 'box-shadow .2s';
    input.style.boxShadow = '0 0 0 4px rgba(224,85,85,.18)';
    setTimeout(function () { input.style.boxShadow = ''; }, 900);

    try {
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
      input.scrollIntoView();
    }
    setTimeout(function () {
      try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
    }, 150);
  }

  function clearError(input) {
    input.style.borderColor = '';
    input.style.boxShadow = '';
    input.style.background = '';
    input.style.boxShadow = '';
    var box = input.parentNode.querySelector('.dl-phone-error');
    if (box) box.remove();
  }

  /* Подсказка под полем, пока человек набирает: видно, сколько осталось.
   * Показываем только после того, как введён код страны и хоть одна цифра -
   * иначе подсказка мозолит глаза с первого символа. */
  /* Незавершённый номер должен ВЫГЛЯДЕТЬ незавершённым.

     Раньше подсказка про недостающие цифры была, а рамка оставалась той,
     что даёт CSS сайта при фокусе - бирюзовой. Поле с половиной номера
     читалось как одобренное, и человек жал «Записаться». Поэтому пока
     цифр не хватает, рамка янтарная и перебивает стиль фокуса. */
  var AMBER = '#e0a355';

  function showProgress(input) {
    var p = parse(input.value);
    var box = input.parentNode.querySelector('.dl-phone-hint-live');
    if (p.empty || p.unknownCode || !p.rest || !p.rest.length ||
        p.rest.length >= p.country.min) {
      if (box) box.remove();
      if (input.style.borderColor === AMBER) {
        input.style.borderColor = '';
        input.style.boxShadow = '';
      }
      return;
    }
    input.style.borderColor = AMBER;
    input.style.boxShadow = '0 0 0 3px rgba(224,163,85,.18)';
    if (!box) {
      box = document.createElement('div');
      box.className = 'dl-phone-hint-live';
      box.style.cssText = 'color:#8a9691;font-size:12px;margin-top:5px;line-height:1.4';
      input.parentNode.appendChild(box);
    }
    var need = p.country.min - p.rest.length;
    box.textContent = p.country.name + ': осталось ввести ' + need + ' ' +
                      plural(need, 'цифру', 'цифры', 'цифр');
  }

  /* Поле телефона той же формы, что и нажатый элемент. */
  function phoneFor(target) {
    var scope = target.closest('form') ||
                document.getElementById('fstep1') ||
                document.getElementById('lead-form') ||
                document;
    return scope.querySelector('input[type="tel"]') ||
           document.querySelector('input[type="tel"]');
  }

  function check(target) {
    var input = phoneFor(target);
    if (!input) return true;                       // формы без телефона не трогаем
    var result = validate(input.value);
    if (!result.ok) {
      showError(input, result.message);
      return false;
    }
    /* Нормализуем: убираем внутренний ноль и пробелы, чтобы в CRM пришёл
     * номер в международном виде и заявки не двоились по написанию. */
    if (input.value !== result.normalized) input.value = result.normalized;
    clearError(input);
    return true;
  }

  /* Кнопки, после нажатия которых начинается отправка. */
  var TRIGGERS = '.goal-btn, #fstep-next, [type="submit"], .lead-submit, .btn-submit';

  document.addEventListener('click', function (event) {
    var target = event.target.closest && event.target.closest(TRIGGERS);
    if (!target) return;
    if (target.disabled) return;
    if (!check(target)) {
      event.preventDefault();
      event.stopImmediatePropagation();           // не даём сработать отправке
    }
  }, true);

  document.addEventListener('submit', function (event) {
    if (!check(event.target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  /* Пока человек правит номер, ошибку убираем и показываем, сколько осталось. */
  document.addEventListener('input', function (event) {
    var input = event.target;
    if (input.matches && input.matches('input[type="tel"]')) {
      clearError(input);
      showProgress(input);
    }
  }, true);

  /* Ушёл из поля с неполным номером - говорим сразу, не дожидаясь отправки. */
  document.addEventListener('focusout', function (event) {
    var input = event.target;
    if (!input.matches || !input.matches('input[type="tel"]')) return;
    if (!String(input.value || '').trim()) return;      // пустое поле не ругаем
    var result = validate(input.value);
    if (!result.ok) showError(input, result.message);
  }, true);

  /* ------------------------------------------------------------------
     Заслон на уровне запроса.

     Проверки по кнопкам ненадёжны: на лендингах три разных отправителя
     (обработчик .goal-btn, модалка, чат-бот), список триггеров совпадал
     не со всеми, а кнопки .goal-btn вообще исчезли из вёрстки - остался
     только код. Любой новый путь отправки снова оказался бы без проверки.

     Поэтому правило «без телефона заявка не уходит» стоит там, где сходятся
     все пути: на самом запросе к вебхуку. Payload читается, номер
     проверяется тем же validate(), и при неполном номере запрос не
     выполняется вовсе, а видимое поле телефона подсвечивается.
     ------------------------------------------------------------------ */
  var LEAD_ENDPOINT = '/api/crm/webhooks/lead';

  function phoneFromBody(body) {
    if (!body || typeof body !== 'string') return null;
    try {
      var data = JSON.parse(body);
      return typeof data.phone === 'string' ? data.phone : '';
    } catch (e) {
      return null;                      // не JSON - не наше дело, пропускаем
    }
  }

  function leadAllowed(body) {
    var phone = phoneFromBody(body);
    if (phone === null) return true;    // payload не разобрался - не мешаем
    var result = validate(phone);
    if (result.ok) return true;

    /* Показываем причину на видимом поле, иначе отказ выглядит как «зависло». */
    var inputs = document.querySelectorAll('input[type="tel"]');
    for (var i = 0; i < inputs.length; i++) {
      if (isVisible(inputs[i])) {
        showError(inputs[i], result.message);
        try { inputs[i].focus(); } catch (e) {}
        break;
      }
    }
    try {
      console.warn('[dl-phone] заявка не отправлена: ' + result.message);
    } catch (e) {}
    return false;
  }

  var _fetch = window.fetch;
  if (typeof _fetch === 'function') {
    window.fetch = function (input, init) {
      var url = (typeof input === 'string') ? input : (input && input.url) || '';
      if (url.indexOf(LEAD_ENDPOINT) !== -1 && init && !leadAllowed(init.body)) {
        return Promise.reject(new Error('dl-phone: номер телефона не заполнен'));
      }
      return _fetch.apply(this, arguments);
    };
  }

  var _open = XMLHttpRequest.prototype.open;
  var _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__dlLead = String(url || '').indexOf(LEAD_ENDPOINT) !== -1;
    return _open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    if (this.__dlLead && !leadAllowed(body)) return;   // молча не отправляем
    return _send.apply(this, arguments);
  };

  window.DLPhone = { validate: validate, parse: parse };
})();
