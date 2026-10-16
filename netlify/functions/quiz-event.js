// Netlify Function: приём событий квиза по шагам → своя база.
// Пишет в Google Sheets через Make/вебхук (QUIZ_EVENTS_WEBHOOK) ИЛИ в Supabase (SUPABASE_URL + SUPABASE_KEY, таблица quiz_events).
// Переменные окружения задаются в Netlify UI, не в коде.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: '' };
  let body; try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, body: 'bad json' }; }
  const allowed = ['event','session','source','ts','page','answer','dl_first','dl_last','_fbc','_fbp','fbclid','ad_id','adset_id','campaign_id','placement','gclid','yclid'];
  const row = {};
  for (const k of Object.keys(body)) if (allowed.includes(k) || /^utm_/.test(k)) { const v = String(body[k] ?? ''); if (v && !v.startsWith('{{')) row[k] = v.slice(0, 500); }
  if (!row.event || !row.session) return { statusCode: 400, body: 'event/session required' };
  row.ip = (event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'] || '').split(',')[0];
  row.ua = (event.headers['user-agent'] || '').slice(0, 300);
  try {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
      await fetch(process.env.SUPABASE_URL + '/rest/v1/quiz_events', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: process.env.SUPABASE_KEY, Authorization: 'Bearer ' + process.env.SUPABASE_KEY, Prefer: 'return=minimal' }, body: JSON.stringify(row) });
    } else if (process.env.QUIZ_EVENTS_WEBHOOK) {
      await fetch(process.env.QUIZ_EVENTS_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(row) });
    } else { console.log('quiz_event', JSON.stringify(row)); }
  } catch (e) { console.error('quiz_event store failed', e); }
  return { statusCode: 204, body: '' };
};
