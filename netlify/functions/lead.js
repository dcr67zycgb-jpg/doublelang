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

// Разрешённые источники (Origin). Заявки принимаем только со своих доменов.
const ALLOWED = [
  'https://doublelang-online-school.com',
  'https://www.doublelang-online-school.com',
];

function cors(origin) {
  const allow = ALLOWED.includes(origin) ? origin : ALLOWED[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

function digits(s) {
  return String(s || '').replace(/\D/g, '');
}

// Rate-limit по IP (best-effort, в памяти тёплого инстанса).
// Не более RL_MAX заявок за RL_WINDOW мс с одного IP.
const RL_WINDOW = 60 * 1000;
const RL_MAX = 5;
const rlHits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (rlHits.get(ip) || []).filter(function (t) { return now - t < RL_WINDOW; });
  arr.push(now);
  rlHits.set(ip, arr);
  if (rlHits.size > 5000) { // защита от разрастания памяти
    for (const [k, v] of rlHits) { if (!v.length || now - v[v.length - 1] > RL_WINDOW) rlHits.delete(k); }
  }
  return arr.length > RL_MAX;
}

exports.handler = async function (event) {
  const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  // Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors(origin), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors(origin), body: JSON.stringify({ ok: false, error: 'method_not_allowed' }) };
  }

  // Rate-limit по IP
  const ip = (event.headers && (event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'] || '')).split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) {
    return { statusCode: 429, headers: cors(origin), body: JSON.stringify({ ok: false, error: 'too_many_requests' }) };
  }

  // Ограничение размера тела (защита от мусорных payload)
  if ((event.body || '').length > 8000) {
    return { statusCode: 413, headers: cors(origin), body: JSON.stringify({ ok: false, error: 'payload_too_large' }) };
  }

  // Парсим тело
  let data = {};
  try {
    data = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: cors(origin), body: JSON.stringify({ ok: false, error: 'bad_json' }) };
  }

  // Простейший антиспам: honeypot-поле (если фронт его пришлёт заполненным — бот)
  if (data.website || data.hp) {
    return { statusCode: 200, headers: cors(origin), body: JSON.stringify({ ok: true }) };
  }

  // Валидация телефона — минимум 7 цифр
  const phone = String(data.phone || '').trim();
  if (digits(phone).length < 7) {
    return { statusCode: 422, headers: cors(origin), body: JSON.stringify({ ok: false, error: 'phone_required' }) };
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
    return { statusCode: 500, headers: cors(origin), body: JSON.stringify({ ok: false, error: 'server_not_configured' }) };
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

  return { statusCode: 200, headers: cors(origin), body: JSON.stringify({ ok: true }) };
};
