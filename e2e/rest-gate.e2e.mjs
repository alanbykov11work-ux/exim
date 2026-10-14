// REST/RPC Gate scenario against a disposable local stack: PostgreSQL 16 + PostgREST 12,
// seven synthetic accounts with locally minted JWTs (scripts/local-stack/*).
// Not hosted Supabase: GoTrue, Storage API and Realtime are not part of this stack.
// Run: REST_URL=http://localhost:3011 JWT_SECRET=... node e2e/rest-gate.e2e.mjs
import crypto from 'node:crypto';

const REST = process.env.REST_URL || 'http://localhost:3011';
const SECRET = process.env.JWT_SECRET;
if (!SECRET) { console.error('JWT_SECRET is required'); process.exit(2); }
const U = {
  clientA1: 'a0000000-0000-4000-8000-000000000001', clientA2: 'a0000000-0000-4000-8000-000000000002',
  manager: 'a0000000-0000-4000-8000-000000000003', logist: 'a0000000-0000-4000-8000-000000000004',
  adminA: 'a0000000-0000-4000-8000-000000000005', clientB1: 'a0000000-0000-4000-8000-000000000006',
  adminB: 'a0000000-0000-4000-8000-000000000007',
};
const A1 = 'd0000000-0000-4000-8000-000000000001', WSA = 'c0000000-0000-4000-8000-000000000001';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(sub) {
  const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64({ sub, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`;
}
async function call(user, method, path, body) {
  const headers = { 'content-type': 'application/json', accept: 'application/json', prefer: 'return=representation' };
  if (user) headers.authorization = 'Bearer ' + jwt(U[user]);
  const r = await fetch(REST + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: r.status, data };
}
const rpc = (user, fn, args) => call(user, 'POST', '/rpc/' + fn, args || {});
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info: typeof info === 'string' ? info : JSON.stringify(info).slice(0, 300) }); };
const denied = (r) => r.status >= 400;
const one = (r) => (Array.isArray(r.data) ? r.data[0] : r.data);

const full = { contact_name: 'Контакт', origin: 'Урумчи', destination: 'Алматы', cargo: 'текстиль', weight_kg: '1000', volume_m3: '10' };
const key = crypto.randomUUID();
let r = await rpc('clientA1', 'save_request', { p_client_request_id: key, p_company_id: A1, p_data: full, p_submit: true });
const order = one(r)?.order_id; check('client A1 submits a request', r.status === 200 && order, r);
r = await rpc('clientA1', 'save_request', { p_client_request_id: key, p_company_id: A1, p_data: full, p_submit: true });
check('repeated submit returns the same request', one(r)?.order_id === order, r);
r = await rpc('clientA2', 'save_request', { p_client_request_id: crypto.randomUUID(), p_company_id: A1, p_data: full, p_submit: false });
check('client A2 cannot create for company A1', denied(r), r);

for (const u of ['clientA2', 'clientB1', 'adminB']) {
  r = await call(u, 'GET', `/orders?id=eq.${order}&select=id,ref`);
  check(`${u} does not see order of A1 by direct id`, r.status === 200 && r.data.length === 0, r);
}
r = await call(null, 'GET', `/orders?select=id`);
check('anonymous request gets nothing', denied(r) || (Array.isArray(r.data) && r.data.length === 0), r);
r = await call('clientA1', 'GET', `/orders?id=eq.${order}&select=total_price`);
check('client cannot select total_price column directly', denied(r), r);
r = await call('clientA1', 'PATCH', `/orders?id=eq.${order}`, { status: 'approved' });
check('client cannot change status directly', denied(r) || (Array.isArray(r.data) && r.data.length === 0), r);

r = await rpc('clientA1', 'assign_logist', { p_order_id: order, p_logist: U.logist });
check('client cannot assign a logistician', denied(r), r);
r = await rpc('manager', 'assign_logist', { p_order_id: order, p_logist: U.logist });
check('manager assigns the logistician', r.status === 200 || r.status === 204, r);
r = await rpc('logist', 'logist_accept', { p_order_id: order });
check('logistician accepts (rate_search)', r.status < 300, r);

const rate = (amount, c) => call('logist', 'POST', '/rate_quotes', { order_id: order, carrier: 'Carrier ' + c, amount, currency: 'USD',
  valid_until: new Date(Date.now() + 864e6).toISOString().slice(0, 10), transit_days: 9, availability: 'есть', route: 'Урумчи → Алматы',
  transport_mode: 'road', source: 'звонок', comment: 'вариант ' + c });
const r1 = await rate(2000, 1); check('first RateQuote saved', r1.status === 201, r1);
r = await rpc('manager', 'workflow_stages', { p_type: 'quote_request', p_ids: [order] });
check('first rate does not change the stage', one(r)?.stage === 'rate_search', r);
r = await rpc('logist', 'complete_rate_search', { p_order_id: order });
check('completion refused with one rate', denied(r), r);
const r2 = await rate(2200, 2); check('second RateQuote saved separately', r2.status === 201 && one(r2).id !== one(r1).id, r2);
r = await call('clientA1', 'GET', `/rate_quotes?order_id=eq.${order}`);
check('client does not see rates', r.status === 200 && r.data.length === 0, r);
r = await rpc('logist', 'complete_rate_search', { p_order_id: order });
check('logistician completes rate search', r.status < 300, r);

r = await rpc('logist', 'send_offer', { p_order_id: order, p_total: 3000 });
check('logistician cannot create a CommercialOffer', denied(r), r);
r = await rpc('manager', 'select_rate', { p_order_id: order, p_rate_id: one(r2).id });
check('manager selects a rate', r.status < 300, r);
r = await rpc('manager', 'send_offer', { p_order_id: order, p_total: 3000 });
const offer = one(r); check('manager sends offer v1', r.status === 200 && offer?.version === 1, r);
r = await rpc('logist', 'orders_scoped', { p_workspace_id: WSA });
check('logistician payload has no client price', r.status === 200 && r.data.find(o => o.id === order)?.total_price == null, r);
r = await rpc('clientA1', 'orders_scoped', { p_workspace_id: WSA });
const co = r.data.find(o => o.id === order);
check('client sees the price after the offer and no internal comment', co?.total_price == 3000 && co?.calc_comment == null, co);
r = await rpc('clientA2', 'decide_offer', { p_offer_id: offer.offer_id, p_decision: 'approved', p_reason: null });
check('client A2 cannot decide for A1', denied(r), r);
r = await rpc('clientA1', 'decide_offer', { p_offer_id: offer.offer_id, p_decision: 'approved', p_reason: null });
check('client A1 approves exact version', r.status < 300, r);

r = await rpc('manager', 'record_agreement', { p_order_id: order, p_kind: 'contract', p_signed_on: new Date().toISOString().slice(0, 10), p_doc_number: 'Д-1' });
check('manager records the contract basis', r.status === 200, r);
const s1 = one(await rpc('manager', 'create_shipment', { p_order_id: order }));
const s2 = one(await rpc('manager', 'create_shipment', { p_order_id: order }));
check('exactly one Shipment (repeat returns the same)', s1?.transport_id && s1.transport_id === s2?.transport_id && s2.created === false, [s1, s2]);
const tr = s1.transport_id;

const adv = (to, note, at, loc) => rpc('logist', 'advance_shipment', { p_transport_id: tr, p_to_stage: to, p_note: note, p_occurred_at: at || null, p_location: loc || null });
check('manager cannot move the shipment', denied(await rpc('manager', 'advance_shipment', { p_transport_id: tr, p_to_stage: 'factory_contact', p_note: 'x', p_occurred_at: null, p_location: null })));
check('preparation → factory_contact', (await adv('factory_contact', 'фабрика готова')).status < 300);
check('factory_contact → pickup_waiting', (await adv('pickup_waiting', 'забор завтра')).status < 300);
const tkey = crypto.randomUUID();
const t1 = one(await rpc('logist', 'create_trip', { p_transport_id: tr, p_client_key: tkey, p_mode: 'road' }));
const t1b = one(await rpc('logist', 'create_trip', { p_transport_id: tr, p_client_key: tkey, p_mode: 'road' }));
check('Trip created idempotently with sequence 1', t1?.trip_id && t1.trip_id === t1b?.trip_id && t1.sequence === 1, [t1, t1b]);
check('road trip needs vehicle and driver', denied(await rpc('logist', 'assign_trip_transport', { p_trip_id: t1.trip_id, p_carrier: 'ТОО', p_vehicle_no: null, p_driver: null })));
check('transport assigned', (await rpc('logist', 'assign_trip_transport', { p_trip_id: t1.trip_id, p_carrier: 'ТОО Перевозчик', p_vehicle_no: '123ABC01', p_driver: 'Пётр' })).status < 300);
const at = (h) => new Date(Date.UTC(2026, 9, 21, h)).toISOString();
check('shipment loading', (await adv('loading', 'погрузка', at(8), 'Урумчи')).status < 300);
check('trip loading', (await rpc('logist', 'advance_trip', { p_trip_id: t1.trip_id, p_to_stage: 'loading', p_occurred_at: at(8), p_location: 'Урумчи', p_source: 'водитель' })).status < 300);
check('trip in_transit', (await rpc('logist', 'advance_trip', { p_trip_id: t1.trip_id, p_to_stage: 'in_transit', p_occurred_at: at(14), p_location: 'Урумчи', p_source: 'водитель' })).status < 300);
check('shipment in_transit', (await adv('in_transit', 'отправлен', at(14), 'Урумчи')).status < 300);
check('Post-Gate transition refused', denied(await adv('border_or_customs', 'граница', at(30), 'Хоргос')));

const ev = async (txt, h) => one(await call('logist', 'POST', '/trip_events', { transport_id: tr, trip_id: t1.trip_id, internal_text: txt, created_by: U.logist, event_type: 'other', occurred_at: at(h), location: 'Хоргос' }));
const e1 = await ev('водитель Пётр, 123ABC01 — выехал', 15), e2 = await ev('граница, простой из-за документов', 20);
check('two internal tracking events', e1?.id && e2?.id, [e1, e2]);
check('logistician cannot publish', denied(await rpc('logist', 'publish_event', { p_event_id: e1.id, p_public_text: 'Груз в пути' })));
check('manager publishes event 1', (await rpc('manager', 'publish_event', { p_event_id: e1.id, p_public_text: 'Груз в пути' })).status < 300);
check('manager publishes event 2', (await rpc('manager', 'publish_event', { p_event_id: e2.id, p_public_text: 'Груз на границе' })).status < 300);
r = await call('clientA1', 'GET', `/transport_updates?transport_id=eq.${tr}&select=public_text,occurred_at&order=occurred_at`);
check('client sees two published events in order', r.status === 200 && r.data.map(x => x.public_text).join('|') === 'Груз в пути|Груз на границе', r);
check('client cannot read hidden_reason/published_by', denied(await call('clientA1', 'GET', `/transport_updates?select=hidden_reason`)));
r = await call('clientA1', 'GET', `/trip_events?transport_id=eq.${tr}`); check('client gets no internal events', r.status === 200 && r.data.length === 0, r);
r = await call('clientA1', 'GET', `/trips?transport_id=eq.${tr}`); check('client gets no trip rows (driver, vehicle)', r.status === 200 && r.data.length === 0, r);
r = await rpc('clientA1', 'client_trips', { p_transport_id: tr });
check('client trip layer has no carrier/vehicle/driver', r.status === 200 && r.data.length === 1 && !('driver' in r.data[0]) && !('carrier' in r.data[0]), r);
r = await rpc('clientA1', 'workflow_stages', { p_type: 'shipment', p_ids: [tr] });
check('client gets only the client label', one(r)?.stage == null && one(r)?.client_label === 'Груз в пути', r);
for (const u of ['clientA2', 'clientB1']) {
  r = await call(u, 'GET', `/transport_updates?transport_id=eq.${tr}&select=public_text`);
  check(`${u} gets no tracking of A1`, r.status === 200 && r.data.length === 0, r);
  r = await rpc(u, 'find_by_number', { p_number: s1.ref });
  check(`${u} cannot find the shipment by number`, r.status === 200 && r.data.length === 0, r);
}
r = await call('adminB', 'GET', `/tenant_audit_events?select=workspace_id`);
check('tenant admin B sees no audit of workspace A', r.status === 200 && r.data.every(x => x.workspace_id !== WSA), r);
r = await call('adminA', 'GET', `/tenant_audit_events?select=action&workspace_id=eq.${WSA}`);
check('tenant admin A sees own audit (shipment created)', r.status === 200 && r.data.some(x => x.action === 'shipment.created'), r);
r = await call('adminA', 'PATCH', `/workflow_template_versions?version=eq.1`, { status: 'retired' });
check('tenant admin cannot change workflow templates', denied(r) || (Array.isArray(r.data) && r.data.length === 0), r);

for (const x of results) console.log((x.ok ? 'ok   ' : 'FAIL ') + x.name + (x.ok ? '' : '  ' + x.info));
console.log(`PASS ${results.filter(x => x.ok).length} of ${results.length}`);
if (results.some(x => !x.ok)) process.exitCode = 1;
