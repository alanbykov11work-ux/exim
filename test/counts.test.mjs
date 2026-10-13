import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function load() {
  const window = {};
  vm.runInNewContext(readFileSync(new URL('../public/exim/counts.js', import.meta.url), 'utf8'), { window, document: { getElementById: () => null } });
  return window;
}
const pick = (c) => JSON.stringify({ t: c.total, n: c.new, p: c.progress, d: c.done, cv: c.converted, rj: c.rejected, ar: c.archived });

test('counters group every non-draft workflow status exactly once', () => {
  const w = load();
  const all = Object.values(w.EXIM_COUNTS.GROUPS).flat();
  const statuses = ['new','clarification','assigned','calculated','offer_sent','approved','rejected','contract_signed','converted','archived'];
  assert.deepEqual([...all].sort(), [...statuses].sort());
});

test('closed and successful outcomes are counted separately; no invented conversion or plan metric', () => {
  const { EXIM_COUNTS: C } = load();
  assert.equal(pick(C.countOrders([{ status: 'rejected' }], [])), JSON.stringify({ t: 1, n: 0, p: 0, d: 1, cv: 0, rj: 1, ar: 0 }));
  assert.equal(pick(C.countOrders([{ status: 'converted' }], [])), JSON.stringify({ t: 1, n: 0, p: 0, d: 1, cv: 1, rj: 0, ar: 0 }));
  assert.equal(pick(C.countOrders([{ status: 'archived' }], [])), JSON.stringify({ t: 1, n: 0, p: 0, d: 1, cv: 0, rj: 0, ar: 1 }));
  assert.equal(pick(C.countOrders([], [])), JSON.stringify({ t: 0, n: 0, p: 0, d: 0, cv: 0, rj: 0, ar: 0 }));
  const mixed = C.countOrders(
    [{ status: 'draft' }, { status: 'new' }, { status: 'assigned' }, { status: 'offer_sent' }, { status: 'converted' }, { status: 'rejected' }],
    [{ status: 'in_transit' }, { status: 'delivered' }]);
  assert.equal(pick(mixed), JSON.stringify({ t: 5, n: 1, p: 2, d: 2, cv: 1, rj: 1, ar: 0 }));
  assert.equal(mixed.activeTransports, 1);
  assert.equal('conversion' in mixed, false);
  assert.equal(mixed.new + mixed.progress + mixed.done, mixed.total, 'counter equals list length');
});

test('state html escapes text and offers retry only when given', () => {
  const w = load();
  assert.ok(!w.EXIM_STATE.html('error', '<b>x</b>').includes('<b>'));
  assert.ok(w.EXIM_STATE.html('error', null, () => {}).includes('Повторить'));
  assert.equal(w.EXIM_STATE.classify({ code: '42501' }), 'forbidden');
  assert.equal(w.EXIM_STATE.classify({ status: 401 }), 'forbidden');
  assert.equal(w.EXIM_STATE.classify(new Error('x')), 'error');
});
