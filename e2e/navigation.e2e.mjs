// Browser E2E for navigation, states and layout (Codex review 2026-10-08).
// Fake Supabase in harness.html; no network, no real database.
// Run: PW=$(npm root -g)/playwright node e2e/navigation.e2e.mjs   (or with a local playwright install)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright');
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = process.cwd();
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png' };
const srv = http.createServer((q, r) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); });
await new Promise(ok => srv.listen(8765, ok));
const URL0 = 'http://localhost:8765/e2e/harness.html';
const O1='10000000-0000-4000-8000-0000000000a1', T1='10000000-0000-4000-8000-0000000000b1';
const results = []; const check = (name, cond, info='') => { results.push({ name, ok: !!cond, info }); };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(String(e)));
const open = async (h) => { await page.goto(URL0 + h); await page.reload(); await boot(); };
const boot = async () => { await page.waitForFunction(() => window.__BOOTED || window.__BOOTERR, null, { timeout: 15000 }); await page.waitForTimeout(400); };
const modalText = () => page.evaluate(() => { const m = document.querySelector('.modal-overlay.active, .modal.active, #modal-overlay.active, .modal-backdrop.show'); return m ? m.innerText : (document.getElementById('modal-title')||{}).innerText || ''; });
const toast = () => page.evaluate(() => [...document.querySelectorAll('.toast, .toast-title, #toast-container *')].map(x => x.innerText).join(' | '));

await page.goto(URL0); await boot();
check('boot without errors', !errors.length, errors.join(';'));
// search order -> URL
await page.fill('#hdr-search-input', 'ZK-261013-AAAAA'); await page.press('#hdr-search-input', 'Enter'); await page.waitForTimeout(500);
check('search order -> #/order/<id>', page.url().endsWith('#/order/' + O1), page.url());
check('order card open after search', (await modalText()).includes('ZK-261013-AAAAA'), (await modalText()).slice(0, 80));
await page.reload(); await boot();
check('reload restores order card', (await modalText()).includes('ZK-261013-AAAAA'), page.url());
// search shipment
await page.fill('#hdr-search-input', '01-02-10-0007'); await page.press('#hdr-search-input', 'Enter'); await page.waitForTimeout(500);
check('search shipment -> #/shipment/<id>', page.url().endsWith('#/shipment/' + T1), page.url());
check('shipment card open', (await modalText()).includes('01-02-10-0007'));
await page.reload(); await boot();
check('reload restores shipment card', (await modalText()).includes('01-02-10-0007'), page.url());
await page.goBack(); await page.waitForTimeout(500);
check('Back -> previous address', page.url().includes('#/order/' + O1) || page.url().includes('#/workflow'), page.url());
await page.goForward(); await page.waitForTimeout(500);
check('Forward -> shipment again', page.url().endsWith('#/shipment/' + T1) && (await modalText()).includes('01-02-10-0007'), page.url());
// non-disclosure: unknown vs other-tenant id same answer
await open('#/order/99999999-0000-4000-8000-000000000000');
const t1 = await toast();
await open('#/shipment/99999999-0000-4000-8000-000000000001');
const t2 = await toast();
check('unknown object -> "Не найдено"', t1.includes('Не найдено') && t2.includes('Не найдено'), t1 + ' / ' + t2);
// malformed
errors.length = 0;
for (const h of ['#/workflow/%', '#/workflow/a/ignored', '#/%E0%A4%A']) { await open(h); }
check('malformed hash: boots, no exception, lands on dashboard', !errors.length && page.url().endsWith('#/dashboard'), errors.join(';') + ' ' + page.url());
// list click -> URL
await open('#/inbox');
const rows = await page.locator('#inbox-list .inbox-row').count();
check('inbox shows server rows (not empty state)', rows === 1, 'rows=' + rows);
const kpi = await page.evaluate(() => [document.getElementById('inbox-new').textContent, document.getElementById('inbox-conv').textContent]);
check('inbox counter equals list; conversion not invented', kpi[0] === '1' && kpi[1] === '—', kpi.join(','));
await page.locator('#inbox-list .inbox-row').first().click(); await page.waitForTimeout(500);
check('click in list -> #/order/<id>', page.url().endsWith('#/order/' + O1), page.url());
// failure injection + retry
await page.evaluate(() => sessionStorage.setItem('fail', JSON.stringify(['rpc:orders_scoped'])));
await open('#/inbox');
await page.evaluate(() => sessionStorage.removeItem('fail'));
const errState = await page.locator('#inbox-list .exim-state-error').count();
check('server error -> error state with Retry, not empty', errState === 1 && (await page.locator('#inbox-list button:has-text("Повторить")').count()) === 1);
await page.evaluate(() => window.__FAIL.clear());
await page.locator('#inbox-list button:has-text("Повторить")').click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(600);
check('Retry reloads from server and shows rows', (await page.locator('#inbox-list .inbox-row').count()) === 1);
// demo shipments absent in server mode
await open('#/shipments');
const shipText = await page.evaluate(() => (document.getElementById('shipments-list') || {}).innerText || '');
check('shipments list from server only (no demo EX-*)', shipText.includes('01-02-10-0007') && !/EX-\d{4}/.test(shipText), shipText.slice(0, 120));
// viewports
const over = {};
for (const w of [360, 375, 390]) {
  await page.setViewportSize({ width: w, height: 800 });
  for (const h of ['#/dashboard', '#/inbox', '#/workflow', '#/shipments']) {
    await open(h);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    if (sw > w) over[w + h] = sw;
  }
}
check('no page-level overflow at 360/375/390 (dashboard, inbox, workflow, shipments)', !Object.keys(over).length, JSON.stringify(over));
await browser.close(); srv.close();
console.log(JSON.stringify(results, null, 1));
console.log('PASS', results.filter(r => r.ok).length, 'of', results.length);
if (results.some(r => !r.ok)) process.exitCode = 1;
