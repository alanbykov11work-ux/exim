import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function load() {
  const window = {};
  vm.runInNewContext(readFileSync(new URL('../public/exim/counts.js', import.meta.url), 'utf8'), { window, document: { getElementById: () => null } });
  return window;
}

test('counters group every workflow status exactly once', () => {
  const w = load();
  const all = Object.values(w.EXIM_COUNTS.GROUPS).flat();
  const statuses = ['new','assigned','calculated','offer_sent','approved','rejected','contract_signed','converted','archived'];
  assert.deepEqual([...all].sort(), [...statuses].sort());
});

test('counters derive from server orders and transports', () => {
  const w = load();
  const c = w.EXIM_COUNTS.countOrders(
    [{ status: 'new' }, { status: 'assigned' }, { status: 'offer_sent' }, { status: 'converted' }],
    [{ status: 'in_transit' }, { status: 'delivered' }]);
  assert.equal(JSON.stringify({ t: c.total, n: c.new, p: c.progress, d: c.done, a: c.activeTransports, cv: c.conversion }),
    JSON.stringify({ t: 4, n: 1, p: 2, d: 1, a: 1, cv: 25 }));
  assert.equal(w.EXIM_COUNTS.countOrders([], []).conversion, null);
});

test('state html escapes text and offers retry only when given', () => {
  const w = load();
  assert.ok(!w.EXIM_STATE.html('error', '<b>x</b>').includes('<b>'));
  assert.ok(w.EXIM_STATE.html('error', null, () => {}).includes('Повторить'));
  assert.equal(w.EXIM_STATE.classify({ code: '42501' }), 'forbidden');
  assert.equal(w.EXIM_STATE.classify(new Error('x')), 'error');
});
