// DoubleLang — серверный прокси для заявок с форм.
// Токен Telegram-бота и Make-вебхук лежат в переменных окружения Netlify,
// в исходный код сайта они НЕ попадают.
//
// Требуемые переменные окружения (Netlify → Site settings → Environment variables):
//   LEAD_TG_TOKEN      — токен бота, напр. 8902775229:AAF...
//   LEAD_TG_CHAT_ID    — chat_id получателя, напр. 5364646512
//   LEAD_MAKE_WEBHOOK  — (опционально) URL вебхука Make.com
//
// Node 18+ на Netlify: global fetch доступен.

const ALLOW_ORIGIN = '*'; // сайт и функции на одном домене; можно сузить до домена

function cors() {
  return {
    'Access-Control-Allow-Origin': ALLOW_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

function digits(s) {
  return String(s || '').replace(/\D/g, '');
}

exports.handler = async function (event) {
  // Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors(), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors(), body: JSON.stringify({ ok: false, error: 'method_not_allowed' }) };
  }

  // Парсим тело
  let data = {};
  try {
    data = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: cors(), body: JSON.stringify({ ok: false, error: 'bad_json' }) };
  }

  // Простейший антиспам: honeypot-поле (если фронт его пришлёт заполненным — бот)
  if (data.website || data.hp) {
    return { statusCode: 200, headers: cors(), body: JSON.stringify({ ok: true }) };
  }

  // Валидация телефона — минимум 7 цифр
  const phone = String(data.phone || '').trim();
  if (digits(phone).length < 7) {
    return { statusCode: 422, headers: cors(), body: JSON.stringify({ ok: false, error: 'phone_required' }) };
  }

  const name = String(data.name || '').trim();
  const email = String(data.email || '').trim();
  const goal = String(data.goal || '').trim();
  const teacher = String(data.teacher || '').trim();
  const calltime = String(data.calltime || '').trim();
  const source = String(data.source || '').trim();
  const page = String(data.page || '').trim();

  const TG_TOKEN = process.env.LEAD_TG_TOKEN;
  const TG_CHAT_ID = process.env.LEAD_TG_CHAT_ID;
  const MAKE_WEBHOOK = process.env.LEAD_MAKE_WEBHOOK;

  if (!TG_TOKEN || !TG_CHAT_ID) {
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ ok: false, error: 'server_not_configured' }) };
  }

  const now = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });

  const tgText =
    '📩 Новая заявка DoubleLang\n' +
    '📱 Телефон: ' + (phone || '—') + '\n' +
    '👤 Имя: ' + (name || '—') + '\n' +
    '📧 Email: ' + (email || '—') + '\n' +
    '🎯 Цель: ' + (goal || '—') + '\n' +
    (teacher ? '👩‍🏫 Преподаватель: ' + teacher + '\n' : '') +
    (calltime ? '⏰ Удобное время: ' + calltime + '\n' : '') +
    '🔗 Источник: ' + (source || '—') + '\n' +
    '🌐 Страница: ' + (page || '—') + '\n' +
    '🕒 Время: ' + now;

  const tasks = [];

  tasks.push(
    fetch('https://api.telegram.org/bot' + TG_TOKEN + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT_ID, text: tgText }),
    }).catch(function (e) { console.error('TG error:', e && e.message); })
  );

  if (MAKE_WEBHOOK) {
    tasks.push(
      fetch(MAKE_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, name, email, goal, teacher, calltime, source, page, timestamp: now }),
      }).catch(function (e) { console.error('Make error:', e && e.message); })
    );
  }

  await Promise.all(tasks);

  return { statusCode: 200, headers: cors(), body: JSON.stringify({ ok: true }) };
};
