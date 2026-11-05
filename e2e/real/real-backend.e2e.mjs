// Browser E2E of the REAL SPA (public/exim/*) with REAL supabase-js against a disposable local
// PostgreSQL 16 + PostgREST 12 (scripts/local-stack). Each role is a separate browser context with its
// own JWT. Not hosted Supabase: no GoTrue login screen, no Storage API, no Realtime.
// Run: REST_URL=http://localhost:3012 JWT_SECRET=... SUPABASE_UMD=<path to supabase.js> PW=<playwright> node e2e/real/real-backend.e2e.mjs
import { createRequire } from 'module';
import http from 'http'; import fs from 'fs'; import path from 'path'; import crypto from 'crypto';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright');
const ROOT = process.cwd(), REST = process.env.REST_URL, SECRET = process.env.JWT_SECRET;
const UMD = process.env.SUPABASE_UMD || path.join(ROOT, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js');
const WS = 'c0000000-0000-4000-8000-000000000001';
const USERS = {
  clientA1: { id: 'a0000000-0000-4000-8000-000000000001', role: 'client', clientCompanyId: 'd0000000-0000-4000-8000-000000000001' },
  clientA2: { id: 'a0000000-0000-4000-8000-000000000002', role: 'client', clientCompanyId: 'd0000000-0000-4000-8000-000000000002' },
  manager: { id: 'a0000000-0000-4000-8000-000000000003', role: 'manager', clientCompanyId: null },
  logist: { id: 'a0000000-0000-4000-8000-000000000004', role: 'logist', clientCompanyId: null },
};
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (sub) => { const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64({ sub, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 7200 });
  return `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`; };
let FAIL = false;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname === '/__vendor/supabase.js') { r.writeHead(200, { 'content-type': 'text/javascript' }); return fs.createReadStream(UMD).pipe(r); }
  if (u.pathname.startsWith('/rest/v1/')) {
    if (FAIL) { r.writeHead(503, { 'content-type': 'application/json' }); return r.end('{"message":"injected outage"}'); }
    const target = new URL(REST + u.pathname.slice(8) + u.search);
    const headers = { ...q.headers }; delete headers.host;
    const pq = http.request(target, { method: q.method, headers }, (pr) => { r.writeHead(pr.statusCode, pr.headers); pr.pipe(r); });
    pq.on('error', () => { r.writeHead(502); r.end(); }); return q.pipe(pq);
  }
  if (u.pathname === '/e2e/real/harness-real.html') {
    const who = USERS[u.searchParams.get('as')];
    const cfg = { token: jwt(who.id), user: { id: who.id, role: who.role, workspaceId: WS, clientCompanyId: who.clientCompanyId } };
    const html = fs.readFileSync(path.join(ROOT, u.pathname), 'utf8').replace('<script src="/__vendor', `<script>window.__CFG=${JSON.stringify(cfg)}</script><script src="/__vendor`);
    r.writeHead(200, { 'content-type': 'text/html' }); return r.end(html);
  }
  fs.readFile(path.join(ROOT, decodeURIComponent(u.pathname)), (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': types[path.extname(u.pathname)] || 'application/octet-stream' }); r.end(d); });
});
await new Promise(ok => srv.listen(8790, ok));
const BASE = 'http://localhost:8790/e2e/real/harness-real.html';
const results = []; const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info: String(info).slice(0, 300) }); console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  ' + String(info).slice(0, 300))); };
const rest = async (who, p) => (await fetch(REST + p, { headers: { Authorization: 'Bearer ' + jwt(USERS[who].id), accept: 'application/json' } })).json();
const rpc = async (who, fn, args) => (await fetch(REST + '/rpc/' + fn, { method: 'POST', headers: { Authorization: 'Bearer ' + jwt(USERS[who].id), 'content-type': 'application/json' }, body: JSON.stringify(args) })).json();

const browser = await chromium.launch();
const pages = {}; const errors = [];
for (const who of Object.keys(USERS)) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(who + ': ' + e)); p.on('dialog', d => d.dismiss());
  pages[who] = p;
}
const open = async (who, hash) => { const p = pages[who]; await p.goto(BASE + '?as=' + who + (hash || '')); await p.reload(); await p.waitForFunction(() => window.__BOOTED || window.__BOOTERR, null, { timeout: 20000 }); await p.waitForTimeout(900); return p; };
const modal = (p) => p.evaluate(() => (document.getElementById('modal').classList.contains('active') ? document.getElementById('modal-body').innerText : ''));
const toast = (p) => p.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.innerText).join(' | '));
const clickText = async (p, text, sel = 'button, a, label') => { const el = p.locator(`#modal-body ${sel.split(',').map(s => s.trim() + `:has-text("${text}")`).join(', #modal-body ')}`).first(); await el.click({ timeout: 5000 }); await p.waitForTimeout(800); };
const fill = (p, id, v) => p.fill('#' + id, String(v));

// 1. client creates and submits; double click does not duplicate
let p = await open('clientA1', '#/workflow');
await p.evaluate(() => WF.newOrder()); await p.waitForTimeout(400);
for (const [k, v] of [['contact_name', 'Иван Петров'], ['origin', 'Урумчи'], ['destination', 'Алматы'], ['cargo', 'текстиль'], ['weight_kg', '1200'], ['volume_m3', '14']]) await fill(p, 'rq-' + k, v);
const sub = p.locator('#modal-body button:has-text("Отправить менеджеру")');
await Promise.all([sub.click(), sub.click().catch(() => {})]); await p.waitForTimeout(1500);
let orders = await rest('manager', '/orders?select=id,ref,status&order=created_at');
check('client submits via the form; double click creates one request', orders.length === 1 && orders[0].status === 'new', JSON.stringify(orders));
const order = orders[0]?.id;

// 2. other client and failure-free non-disclosure
p = await open('clientA2', '#/order/' + order);
check('client A2 opening A1 order URL gets "Не найдено"', (await toast(p)).includes('Не найдено') && !(await modal(p)).includes(orders[0]?.ref || 'x'), await toast(p));

// 3. manager assigns the logistician through the card
p = await open('manager', '#/order/' + order);
check('order card restored from URL for manager', (await modal(p)).includes(orders[0]?.ref), await modal(p));
await p.selectOption('#wf-logist', USERS.logist.id).catch(() => {});
await clickText(p, 'Назначить и отправить на расчёт', 'button');
check('manager assigned the logistician', (await rpc('manager', 'workflow_stages', { p_type: 'quote_request', p_ids: [order] }))[0]?.stage === 'sent_to_logistician', await toast(p));

// 4. logistician accepts, adds two complete rates, completes
p = await open('logist', '#/order/' + order);
await clickText(p, 'Данных достаточно', 'button');
p = await open('logist', '#/order/' + order);
for (const [c, a] of [['ТОО Альфа', 2000], ['ТОО Бета', 2200]]) {
  await fill(p, 'wf-rate-carrier', c); await fill(p, 'wf-rate-amount', a); await fill(p, 'wf-rate-cur', 'USD');
  await fill(p, 'wf-rate-valid', new Date(Date.now() + 864e6).toISOString().slice(0, 10)); await fill(p, 'wf-rate-days', 9);
  await fill(p, 'wf-rate-avail', 'есть'); await fill(p, 'wf-rate-source', 'звонок'); await fill(p, 'wf-rate-comment', 'вариант ' + c);
  await clickText(p, 'добавить ставку', 'button');
}
check('two RateQuotes saved separately; stage still rate_search', (await rest('logist', `/rate_quotes?order_id=eq.${order}&select=id`)).length === 2
  && (await rpc('logist', 'workflow_stages', { p_type: 'quote_request', p_ids: [order] }))[0]?.stage === 'rate_search');
await p.locator('#wf-exp-rows .wf-exp-sum').first().fill('1800');
await clickText(p, 'Завершить поиск ставок', 'button');
check('logistician completes rate search from the UI', (await rpc('logist', 'workflow_stages', { p_type: 'quote_request', p_ids: [order] }))[0]?.stage === 'rate_received', await toast(p));

// 5. manager selects a rate and sends offer v1
p = await open('manager', '#/order/' + order);
await clickText(p, 'Выбрать', 'button');
p = await open('manager', '#/order/' + order);
await fill(p, 'wf-total', 3000);
await clickText(p, 'Отправить предложение клиенту', 'button');
let offers = await rest('manager', `/commercial_offers?order_id=eq.${order}&select=id,version,status`);
check('manager sends offer v1 from the UI', offers.length === 1 && offers[0].version === 1, JSON.stringify(offers));

// 6. stale version: client tab 1 shows v1, tab 2 asks a question, manager sends v2, tab 1 approves stale v1
const stale = await open('clientA1', '#/order/' + order);
check('client sees offer version 1 after reload', (await modal(stale)).includes('версия 1'), await modal(stale));
const tab2 = await stale.context().newPage(); await tab2.goto(BASE + '?as=clientA1#/order/' + order); await tab2.waitForFunction(() => window.__BOOTED); await tab2.waitForTimeout(900);
await tab2.fill('#wf-clar-msg', 'Что входит в цену?'); await tab2.locator('#modal-body button:has-text("Запросить уточнение")').click(); await tab2.waitForTimeout(800);
p = await open('manager', '#/order/' + order);
await fill(p, 'wf-total', 2900); await fill(p, 'wf-price-reason', 'скидка за объём'); await fill(p, 'wf-offer-comment', 'включено СВХ');
await clickText(p, 'Отправить предложение клиенту', 'button');
await stale.locator('#modal-body button:has-text("Согласовать")').click(); await stale.waitForTimeout(800);
check('approving a stale version is refused', (await toast(stale)).match(/no longer open|Ошибка/) && (await rest('manager', `/commercial_offers?order_id=eq.${order}&status=eq.approved&select=id`)).length === 0, await toast(stale));
p = await open('clientA1', '#/order/' + order);
check('after reload client sees version 2', (await modal(p)).includes('версия 2'), await modal(p));
await clickText(p, 'Согласовать', 'button');
check('client approves version 2', (await rest('manager', `/commercial_offers?order_id=eq.${order}&status=eq.approved&select=version`))[0]?.version === 2);

// 7. manager: contract basis, then shipment (double click → one)
p = await open('manager', '#/order/' + order);
await fill(p, 'wf-agr-num', 'Д-15'); await clickText(p, 'Зафиксировать основание', 'button');
p = await open('manager', '#/order/' + order);
const cb = p.locator('#modal-body button:has-text("Создать перевозку из заявки")');
await Promise.all([cb.click(), cb.click().catch(() => {})]); await p.waitForTimeout(1500);
const trs = await rest('manager', `/transports?order_id=eq.${order}&select=id,ref`);
check('one Shipment after a double click', trs.length === 1, JSON.stringify(trs));
const tr = trs[0]?.id;

// 8. logistician moves the shipment, creates and moves a trip
p = await open('logist', '#/shipment/' + tr);
check('shipment card restored from URL', (await modal(p)).includes(trs[0]?.ref), await modal(p));
await fill(p, 'st-note', 'фабрика подтвердила готовность'); await clickText(p, 'Далее: Связь с фабрикой', 'button');
await fill(p, 'st-note', 'забор 21.10'); await clickText(p, 'Далее: Ожидание забора', 'button');
await clickText(p, '+ добавить', 'a'); await fill(p, 'tr-name', 'Машина 1'); await clickText(p, 'Добавить рейс', 'button');
await clickText(p, 'транспорт назначен', 'a'); await fill(p, 'tt-carrier', 'ТОО Перевозчик'); await fill(p, 'tt-vehicle', '123ABC01'); await fill(p, 'tt-driver', 'Пётр Водитель');
await clickText(p, 'Назначить', 'button');
await fill(p, 'st-loc', 'Урумчи'); await fill(p, 'st-note', 'погрузка началась'); await clickText(p, 'Далее: Погрузка', 'button');
for (const st of ['погрузка', 'в пути']) { await clickText(p, '→ ' + st, 'a'); await fill(p, 'tt-loc', 'Урумчи'); await fill(p, 'tt-src', 'водитель'); await clickText(p, 'Сохранить', 'button'); }
await fill(p, 'st-loc', 'Урумчи'); await fill(p, 'st-note', 'отправлен'); await clickText(p, 'Далее: В пути', 'button');
check('shipment reached in_transit through the UI', (await rpc('logist', 'workflow_stages', { p_type: 'shipment', p_ids: [tr] }))[0]?.stage === 'in_transit', await toast(p));

// 9. two internal events, manager publishes both
for (const [txt, loc] of [['Пётр Водитель выехал, 123ABC01', 'Урумчи'], ['граница, простой из-за документов', 'Хоргос']]) {
  await clickText(p, '+ событие', 'a'); await p.fill('#ev-text', txt); await fill(p, 'ev-loc', loc); await clickText(p, 'Добавить событие', 'button');
}
p = await open('manager', '#/shipment/' + tr);
for (const t of ['Груз в пути', 'Груз на границе']) { await clickText(p, 'Опубликовать клиенту', 'a'); await p.fill('#pub-text', t); await clickText(p, 'Опубликовать', 'button'); }
p = await open('clientA1', '#/shipment/' + tr);
const cm = await modal(p);
check('client sees both published updates', cm.includes('Груз в пути') && cm.includes('Груз на границе'), cm);
check('client card has no driver, vehicle, carrier or internal text', !/Пётр|123ABC01|Перевозчик|простой/.test(cm), cm);

// 10. server outage → error state with Retry, then recovery
FAIL = true; p = await open('clientA1', '#/inbox');
const errState = await p.locator('#inbox-list .exim-state-error').count();
FAIL = false;
await p.locator('#inbox-list button:has-text("Повторить")').click().catch(() => {}); await p.waitForTimeout(1200);
check('outage shows error with Retry; Retry recovers', errState === 1 && (await p.locator('#inbox-list .inbox-row').count()) === 1);
check('no uncaught page errors', !errors.length, errors.join(' ; '));

await browser.close(); srv.close();
console.log(`PASS ${results.filter(x => x.ok).length} of ${results.length}`);
if (results.some(x => !x.ok)) process.exitCode = 1;
