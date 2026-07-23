/* ============================================================
   EXIM Super App — рабочие циклы
   Цикл 1: заявка → назначение логиста → расчёт → маржа → предложение → решение клиента
   Цикл 2: перевозка → рейсы → внутренние события → публикация клиенту
   Данные: Supabase (window.__SUPA), права — RLS в базе.
   ============================================================ */
(function () {
  const S = () => window.__SUPA;
  const U = () => window.__EXIM || {};
  // Реальная роль (права в БД) и роль просмотра (переключатель в шапке)
  const dbRole = () => U().role || 'client';
  const effRole = () => {
    const dbr = dbRole();
    if (!['admin', 'manager', 'logist'].includes(dbr)) return 'client';
    const vr = (window.APP_STATE && window.APP_STATE.currentRole) || null;
    if (vr === 'client') return 'client';
    if (vr === 'logist') return 'logist';
    if (vr === 'manager') return 'manager';
    return dbr === 'admin' ? 'manager' : dbr;
  };
  const isMgr = () => effRole() === 'manager';
  const isLog = () => effRole() === 'logist';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtT = n => n == null || n === '' ? '—' : '₸ ' + Math.round(Number(n)).toLocaleString('ru-RU');
  const dt = s => s ? new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  const overdue = o => o.status === 'assigned' && o.calc_deadline && new Date(o.calc_deadline) < new Date();

  const OST = {
    new:            { l: 'Новая',              c: 'pill-warning' },
    assigned:       { l: 'На расчёте',          c: 'pill-info' },
    calculated:     { l: 'Расчёт готов',        c: 'pill-info' },
    offer_sent:     { l: 'Предложение у клиента', c: 'pill-accent' },
    approved:       { l: 'Согласована',         c: 'pill-accent' },
    rejected:       { l: 'Отклонена',           c: 'pill-warning' },
    contract_signed:{ l: 'Договор подписан',    c: 'pill-accent' },
    converted:      { l: 'Перевозка создана',   c: 'pill-info' },
    archived:       { l: 'Архив',               c: '' }
  };
  const TST = {
    preparing:  { l: 'Подготовка',   p: 5 },
    loading:    { l: 'Загрузка',     p: 20 },
    in_transit: { l: 'В пути',       p: 50 },
    customs:    { l: 'На таможне',   p: 70 },
    delivering: { l: 'Доставка',     p: 90 },
    delivered:  { l: 'Доставлено',   p: 100 }
  };

  let CACHE = { orders: [], fin: {}, profiles: [], transports: [], tab: 'orders', openOrder: null, openTrans: null };

  // ---------- загрузка данных ----------
  async function loadAll() {
    const s = S(); if (!s) return;
    const [{ data: orders }, { data: transports }] = await Promise.all([
      s.from('orders').select('*').order('created_at', { ascending: false }),
      s.from('transports').select('*').order('created_at', { ascending: false })
    ]);
    let allOrders = orders || [], allTrans = transports || [];
    // режим просмотра «как клиент/логист» у персонала: показываем соответствующий срез
    if (['admin', 'manager', 'logist'].includes(dbRole())) {
      if (effRole() === 'client') {
        allOrders = allOrders.filter(o => o.client_id === U().id || o.created_by === U().id);
        allTrans = allTrans.filter(t => t.client_id === U().id);
      } else if (effRole() === 'logist') {
        allOrders = allOrders.filter(o => o.logist_id === U().id);
        allTrans = allTrans.filter(t => t.logist_id === U().id);
      }
    }
    CACHE.orders = allOrders;
    CACHE.transports = allTrans;
    if (isMgr() || isLog()) {
      const ids = CACHE.orders.map(o => o.id);
      const { data: fin } = ids.length ? await s.from('order_finance').select('*').in('order_id', ids) : { data: [] };
      CACHE.fin = {}; (fin || []).forEach(f => CACHE.fin[f.order_id] = f);
    }
    { const { data: profs } = await s.from('profiles').select('id, full_name, email, role, company'); CACHE.profiles = profs || []; }
  }
  const logists = () => CACHE.profiles.filter(p => ['logist','manager','admin'].includes(p.role));
  const profName = id => { const p = CACHE.profiles.find(x => x.id === id); return p ? (p.full_name || p.email) : '—'; };

  async function hist(orderId, action, snapshot) {
    try { await S().from('order_history').insert({ order_id: orderId, actor_id: U().id, action, snapshot: snapshot || {} }); } catch (e) {}
  }
  function refOrd() { return 'ZK-' + Math.floor(1000 + Math.random() * 9000); }
  function refTr() { return 'TR-' + Math.floor(1000 + Math.random() * 9000); }

  // ---------- страница ----------
  async function renderWF() {
    const box = document.getElementById('wf-content');
    if (!box) return;
    box.innerHTML = '<div style="padding:40px;text-align:center;color:var(--muted);">Загрузка…</div>';
    try { await loadAll(); } catch (e) { box.innerHTML = '<div style="padding:40px;color:var(--muted);">Не удалось загрузить данные: ' + esc(e.message) + '</div>'; return; }
    const isAdmin = dbRole() === 'admin';
    const tabs = `
      <div class="rd-tabs" style="margin-bottom:20px;">
        <button class="rd-tab ${CACHE.tab==='orders'?'active':''}" onclick="WF.tab('orders')">Заявки и расчёты</button>
        <button class="rd-tab ${CACHE.tab==='trans'?'active':''}" onclick="WF.tab('trans')">Перевозки</button>
        ${isAdmin ? `<button class="rd-tab ${CACHE.tab==='team'?'active':''}" onclick="WF.tab('team')">Команда</button>` : ''}
      </div>`;
    box.innerHTML = tabs + (CACHE.tab === 'orders' ? viewOrders() : CACHE.tab === 'team' ? viewTeam() : viewTrans());
  }

  // ============================================================
  // ЦИКЛ 1 — список и карточки заявок
  // ============================================================
  function viewOrders() {
    const os = CACHE.orders;
    const viewBtns = `<div class="rd-tabs" style="margin:0;display:inline-flex;">
      <button class="rd-tab ${CACHE.view !== 'kanban' ? 'active' : ''}" onclick="WF.view('list')">Список</button>
      <button class="rd-tab ${CACHE.view === 'kanban' ? 'active' : ''}" onclick="WF.view('kanban')">Канбан</button></div>`;
    const newBtn = `<button class="btn btn-primary" onclick="WF.newOrder()">+ Новая заявка на расчёт</button>`;
    if (CACHE.view === 'kanban' && os.length) {
      const COLS = [
        ['new', 'Новые'], ['assigned', 'На расчёте'], ['calculated', 'Расчёт готов'],
        ['offer_sent', 'У клиента'], ['approved,contract_signed', 'Согласованы'], ['converted,rejected,archived', 'Завершены']
      ];
      const cols = COLS.map(c => {
        const keys = c[0].split(',');
        const list = os.filter(o => keys.includes(o.status));
        const cards = list.map(o => `<div class="kb-card" onclick="WF.open('${o.id}')">
            <div class="mono" style="font-size:11.5px;color:var(--muted);">${esc(o.ref)}${overdue(o) ? ' · <span style="color:var(--accent);font-weight:600;">просрочка</span>' : ''}</div>
            <div style="font-weight:600;font-size:13.5px;margin:3px 0;">${esc(o.origin)} → ${esc(o.destination)}</div>
            <div style="font-size:12px;color:var(--muted);">${esc(o.cargo || '')}${o.total_price && (isMgr() || o.offer_sent_at) ? ' · ' + fmtT(o.total_price) : ''}</div>
          </div>`).join('');
        return `<div class="kb-col"><div class="kb-head">${c[1]} <span class="kb-n">${list.length}</span></div>${cards || '<div class="kb-empty">—</div>'}</div>`;
      }).join('');
      return `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px;">${viewBtns}${isLog() ? '' : newBtn}</div>
        <div class="kb-board">${cols}</div>`;
    }
    if (!os.length) {
      return `<div class="card" style="text-align:center;padding:48px;">
        <div style="font-weight:600;font-size:17px;margin-bottom:6px;">Заявок пока нет</div>
        <div style="color:var(--muted);margin-bottom:20px;">${isLog() ? 'Вам ещё не назначили заявки на расчёт' : 'Создайте первую заявку — менеджер назначит логиста и вы получите расчёт'}</div>
        ${isLog() ? '' : newBtn}</div>`;
    }
    const rows = os.map(o => {
      const st = OST[o.status] || OST.new;
      const od = overdue(o);
      return `<tr style="cursor:pointer;" onclick="WF.open('${o.id}')">
        <td class="mono">${esc(o.ref)}</td>
        <td>${esc(o.origin)} → ${esc(o.destination)}</td>
        <td>${esc(o.cargo || '—')}</td>
        <td><span class="pill ${st.c}">${st.l}</span>${od ? ' <span class="pill" style="background:rgba(225,29,72,.12);color:var(--accent);">Просрочка расчёта</span>' : ''}</td>
        <td>${o.total_price && (isMgr() || o.offer_sent_at) ? fmtT(o.total_price) : '—'}</td>
        <td style="color:var(--muted);font-size:13px;">${dt(o.created_at)}</td>
      </tr>`;
    }).join('');
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px;">${viewBtns}${isLog() ? '' : newBtn}</div>
      <div class="card"><table class="table">
      <thead><tr><th>№</th><th>Маршрут</th><th>Груз</th><th>Статус</th><th>Цена</th><th>Создана</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  function openOrder(id) {
    const o = CACHE.orders.find(x => x.id === id); if (!o) return;
    const f = CACHE.fin[o.id] || {};
    const st = OST[o.status] || OST.new;
    const od = overdue(o);
    let body = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <div><span class="mono" style="font-size:13px;color:var(--muted);">${esc(o.ref)}</span>
        <div style="font-size:19px;font-weight:700;">${esc(o.origin)} → ${esc(o.destination)}</div></div>
        <span class="pill ${st.c}">${st.l}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;font-size:14px;margin-bottom:16px;">
        <div><span style="color:var(--muted);">Груз:</span> ${esc(o.cargo || '—')}</div>
        <div><span style="color:var(--muted);">Вес:</span> ${esc(o.weight || '—')}</div>
        <div><span style="color:var(--muted);">Транспорт:</span> ${esc(o.transport || '—')}</div>
        <div><span style="color:var(--muted);">Тип:</span> ${esc(o.container || '—')}</div>
      </div>`;
    if (od) body += `<div class="auth-msg" style="background:rgba(225,29,72,.07);border:1px solid rgba(225,29,72,.25);color:var(--accent);border-radius:10px;padding:10px 12px;margin-bottom:14px;font-size:13.5px;">Расчёт просрочен — дедлайн был ${dt(o.calc_deadline)}</div>`;

    // ---- вид для КЛИЕНТА ----
    if (!isMgr() && !isLog()) {
      if (o.status === 'offer_sent') {
        body += `<div class="card" style="background:var(--bg);box-shadow:none;margin-bottom:14px;">
          <div style="font-size:13px;color:var(--muted);margin-bottom:4px;">Предложение EXIM</div>
          <div style="font-size:26px;font-weight:700;color:var(--accent);">${fmtT(o.total_price)}</div>
          ${o.calc_days ? `<div style="font-size:13.5px;color:var(--muted);margin-top:4px;">Срок: ${esc(o.calc_days)}</div>` : ''}
          ${o.offer_comment ? `<div style="font-size:14px;margin-top:8px;">${esc(o.offer_comment)}</div>` : ''}
        </div>
        <div style="display:flex;gap:10px;">
          <button class="btn btn-primary btn-lg" style="flex:1;" onclick="WF.decide('${o.id}','approved')">Согласовать</button>
          <button class="btn btn-secondary btn-lg" style="flex:1;" onclick="WF.decide('${o.id}','rejected')">Отклонить</button>
        </div>`;
      } else if (o.status === 'approved' || o.status === 'contract_signed' || o.status === 'converted') {
        body += `<div style="font-size:14.5px;">Вы согласовали предложение <b>${fmtT(o.total_price)}</b>. ${o.status === 'converted' ? 'Перевозка создана — следите за ней во вкладке «Перевозки».' : 'Менеджер готовит договор и перевозку.'}</div>`;
      } else if (o.status === 'rejected') {
        body += `<div style="font-size:14.5px;color:var(--muted);">Предложение отклонено. Менеджер свяжется с вами для уточнения условий.</div>`;
      } else {
        body += `<div style="font-size:14.5px;color:var(--muted);">Заявка в работе: менеджер и логист готовят расчёт. Обычно это занимает до 1 рабочего дня.</div>`;
      }
      openModal('Заявка ' + o.ref, body);
      return;
    }

    // ---- вид для ЛОГИСТА ----
    if (isLog()) {
      if (o.status === 'assigned' || o.status === 'new') {
        const exp = (f.expenses || []);
        body += `<div style="font-weight:600;margin:6px 0 10px;">Расчёт ${o.calc_deadline ? '· дедлайн ' + dt(o.calc_deadline) : ''}</div>
          <div class="form-group"><label class="form-label">Маршрут следования</label>
            <input class="form-input" id="wf-route" value="${esc(o.calc_route)}" placeholder="Урумчи — Хоргос — Алматы"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="form-group"><label class="form-label">Срок</label>
              <input class="form-input" id="wf-days" value="${esc(o.calc_days)}" placeholder="7–9 дней"></div>
            <div class="form-group"><label class="form-label">Себестоимость, ₸</label>
              <input class="form-input" id="wf-cost" type="number" value="${f.cost || ''}" placeholder="1500000"></div>
          </div>
          <div class="form-group"><label class="form-label">Расходы (по строке: название = сумма)</label>
            <textarea class="form-input" id="wf-exp" rows="3" placeholder="Фрахт = 1200000&#10;СВХ = 150000&#10;Оформление = 150000">${esc(exp.map(e => e.name + ' = ' + e.amount).join('\n'))}</textarea></div>
          <div class="form-group"><label class="form-label">Комментарий менеджеру</label>
            <textarea class="form-input" id="wf-comment" rows="2">${esc(o.calc_comment)}</textarea></div>
          <button class="btn btn-primary btn-lg" style="width:100%;" onclick="WF.submitCalc('${o.id}')">Отправить расчёт менеджеру</button>`;
      } else {
        body += calcBlock(o, f) + `<div style="color:var(--muted);font-size:13.5px;margin-top:10px;">Расчёт отправлен ${dt(o.calc_submitted_at)}.</div>`;
      }
      openModal('Заявка ' + o.ref, body);
      return;
    }

    // ---- вид для МЕНЕДЖЕРА ----
    if (o.status === 'new') {
      const opts = logists().map(p => `<option value="${p.id}">${esc(p.full_name || p.email)} (${p.role})</option>`).join('');
      body += `<div style="font-weight:600;margin:6px 0 10px;">Назначить логиста</div>
        <div class="form-group"><label class="form-label">Логист</label>
          <select class="form-input" id="wf-logist">${opts || '<option value="">Нет логистов — назначьте роль в профилях</option>'}</select></div>
        <div class="form-group"><label class="form-label">Дедлайн расчёта</label>
          <input class="form-input" id="wf-deadline" type="datetime-local"></div>
        <button class="btn btn-primary btn-lg" style="width:100%;" onclick="WF.assign('${o.id}')">Назначить и отправить на расчёт</button>`;
    } else if (o.status === 'assigned') {
      body += `<div style="color:var(--muted);font-size:14px;">Логист: <b>${profName(o.logist_id)}</b> · дедлайн ${dt(o.calc_deadline)}. Ожидаем расчёт.</div>`;
    } else if (o.status === 'calculated') {
      const cost = Number(f.cost || 0);
      body += calcBlock(o, f) + `
        <div style="font-weight:600;margin:14px 0 10px;">Предложение клиенту</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group"><label class="form-label">Маржа, ₸</label>
            <input class="form-input" id="wf-margin" type="number" placeholder="250000" oninput="document.getElementById('wf-total').value=${cost}+Number(this.value||0)"></div>
          <div class="form-group"><label class="form-label">Итоговая цена, ₸</label>
            <input class="form-input" id="wf-total" type="number" value="${cost}"></div>
        </div>
        <div class="form-group"><label class="form-label">Комментарий для клиента</label>
          <textarea class="form-input" id="wf-offer-comment" rows="2" placeholder="Срок 7–9 дней, страхование включено"></textarea></div>
        <button class="btn btn-primary btn-lg" style="width:100%;" onclick="WF.sendOffer('${o.id}')">Отправить предложение клиенту</button>`;
    } else if (o.status === 'offer_sent') {
      body += calcBlock(o, f) + offerBlock(o, f) + `<div style="color:var(--muted);font-size:14px;margin-top:8px;">Ожидаем решение клиента.</div>`;
    } else if (o.status === 'approved') {
      body += calcBlock(o, f) + offerBlock(o, f) + `
        <div style="display:flex;gap:10px;margin-top:12px;">
          <button class="btn btn-primary btn-lg" style="flex:1;" onclick="WF.signContract('${o.id}')">Договор подписан ✓</button>
        </div>`;
    } else if (o.status === 'contract_signed') {
      body += calcBlock(o, f) + offerBlock(o, f) + `
        <button class="btn btn-primary btn-lg" style="width:100%;margin-top:12px;" onclick="WF.createTransport('${o.id}')">Создать перевозку из заявки</button>`;
    } else {
      body += calcBlock(o, f) + offerBlock(o, f);
    }
    body += `<div style="margin-top:14px;"><a href="#" style="font-size:13px;color:var(--muted);" onclick="WF.showHistory('${o.id}');return false;">История изменений →</a></div>`;
    openModal('Заявка ' + o.ref, body);
  }

  function calcBlock(o, f) {
    if (!o.calc_submitted_at) return '';
    const exp = (f.expenses || []).map(e => `<div style="display:flex;justify-content:space-between;font-size:13.5px;"><span style="color:var(--muted);">${esc(e.name)}</span><span>${fmtT(e.amount)}</span></div>`).join('');
    return `<div class="card" style="background:var(--bg);box-shadow:none;margin-bottom:6px;">
      <div style="font-size:13px;color:var(--muted);margin-bottom:6px;">Расчёт логиста (${profName(o.logist_id)} · ${dt(o.calc_submitted_at)})</div>
      <div style="font-size:14px;">Маршрут: <b>${esc(o.calc_route || '—')}</b> · Срок: <b>${esc(o.calc_days || '—')}</b></div>
      <div style="font-size:16px;margin:6px 0;">Себестоимость: <b>${fmtT(f.cost)}</b></div>
      ${exp ? `<div style="border-top:1px dashed var(--border);padding-top:6px;margin-top:4px;">${exp}</div>` : ''}
      ${o.calc_comment ? `<div style="font-size:13.5px;color:var(--muted);margin-top:6px;">${esc(o.calc_comment)}</div>` : ''}
    </div>`;
  }
  function offerBlock(o, f) {
    if (!o.offer_sent_at && !o.total_price) return '';
    return `<div class="card" style="background:var(--bg);box-shadow:none;margin-top:8px;">
      <div style="font-size:13px;color:var(--muted);margin-bottom:4px;">Предложение клиенту ${o.offer_sent_at ? '· ' + dt(o.offer_sent_at) : ''}</div>
      <div style="font-size:15px;">Маржа: <b>${fmtT(f.margin)}</b> → Итог: <b style="color:var(--accent);">${fmtT(o.total_price)}</b></div>
      ${o.client_decision ? `<div style="margin-top:6px;font-size:14px;">Клиент: <b>${o.client_decision === 'approved' ? 'согласовал ✓' : 'отклонил ✕'}</b> · ${dt(o.client_decision_at)}</div>` : ''}
    </div>`;
  }

  // ---------- действия цикла 1 ----------
  async function newOrder() {
    openModal('Новая заявка на расчёт', `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="form-group"><label class="form-label">Откуда</label><input class="form-input" id="wf-o" placeholder="Урумчи"></div>
        <div class="form-group"><label class="form-label">Куда</label><input class="form-input" id="wf-d" placeholder="Алматы"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="form-group"><label class="form-label">Транспорт</label>
          <select class="form-input" id="wf-t"><option>Авто</option><option>ЖД</option><option>Море</option><option>Авиа</option><option>Мультимодальная</option></select></div>
        <div class="form-group"><label class="form-label">Вес / объём</label><input class="form-input" id="wf-w" placeholder="20 т / 86 м³"></div>
      </div>
      <div class="form-group"><label class="form-label">Груз</label><input class="form-input" id="wf-c" placeholder="Оборудование"></div>
      ${isMgr() ? `<div class="form-group"><label class="form-label">Клиент</label><select class="form-input" id="wf-client">${CACHE.profiles.filter(p=>p.role==='client').map(p=>`<option value="${p.id}">${esc(p.company || p.full_name || p.email)}</option>`).join('') || `<option value="${U().id}">Я (${esc(U().email)})</option>`}</select></div>` : ''}
      <button class="btn btn-primary btn-lg" style="width:100%;" onclick="WF.createOrder()">Создать заявку</button>`);
  }
  async function createOrder() {
    const v = id => (document.getElementById(id) || {}).value || '';
    if (!v('wf-o') || !v('wf-d')) { showToast('warning', 'Заполните маршрут', 'Укажите откуда и куда'); return; }
    const clientId = isMgr() && document.getElementById('wf-client') ? v('wf-client') : U().id;
    const row = { ref: refOrd(), client_id: clientId, created_by: U().id, origin: v('wf-o'), destination: v('wf-d'), transport: v('wf-t'), cargo: v('wf-c'), weight: v('wf-w') };
    const { data, error } = await S().from('orders').insert(row).select().single();
    if (error) { showToast('danger', 'Ошибка', error.message); return; }
    hist(data.id, 'created', row);
    closeModal(); showToast('success', 'Заявка создана', data.ref + ' — менеджер назначит логиста');
    renderWF();
  }
  async function assign(id) {
    const lg = (document.getElementById('wf-logist') || {}).value;
    const dl = (document.getElementById('wf-deadline') || {}).value;
    if (!lg) { showToast('warning', 'Выберите логиста', 'Назначьте роль logist нужному сотруднику'); return; }
    const upd = { logist_id: lg, status: 'assigned', calc_deadline: dl ? new Date(dl).toISOString() : null };
    const { error } = await S().from('orders').update(upd).eq('id', id);
    if (error) { showToast('danger', 'Ошибка', error.message); return; }
    hist(id, 'assigned', upd);
    closeModal(); showToast('success', 'Логист назначен', 'Заявка отправлена на расчёт'); renderWF();
  }
  async function submitCalc(id) {
    const v = x => (document.getElementById(x) || {}).value || '';
    const cost = Number(v('wf-cost') || 0);
    if (!cost) { showToast('warning', 'Укажите себестоимость', 'Поле «Себестоимость» обязательно'); return; }
    const expenses = v('wf-exp').split('\n').map(l => { const m = l.split('='); return m.length === 2 ? { name: m[0].trim(), amount: Number(String(m[1]).replace(/[^\d.]/g, '')) || 0 } : null; }).filter(Boolean);
    const updO = { calc_route: v('wf-route'), calc_days: v('wf-days'), calc_comment: v('wf-comment'), calc_submitted_at: new Date().toISOString(), status: 'calculated' };
    const e1 = (await S().from('orders').update(updO).eq('id', id)).error;
    const e2 = (await S().from('order_finance').upsert({ order_id: id, cost, expenses })).error;
    if (e1 || e2) { showToast('danger', 'Ошибка', (e1 || e2).message); return; }
    hist(id, 'calculated', { ...updO, cost, expenses });
    closeModal(); showToast('success', 'Расчёт отправлен', 'Менеджер получит уведомление'); renderWF();
  }
  async function sendOffer(id) {
    const margin = Number((document.getElementById('wf-margin') || {}).value || 0);
    const total = Number((document.getElementById('wf-total') || {}).value || 0);
    const comment = (document.getElementById('wf-offer-comment') || {}).value || '';
    if (!total) { showToast('warning', 'Укажите итоговую цену', ''); return; }
    const e1 = (await S().from('orders').update({ total_price: total, offer_comment: comment, offer_sent_at: new Date().toISOString(), status: 'offer_sent' }).eq('id', id)).error;
    const e2 = (await S().from('order_finance').update({ margin }).eq('order_id', id)).error;
    if (e1 || e2) { showToast('danger', 'Ошибка', (e1 || e2).message); return; }
    hist(id, 'offer_sent', { margin, total, comment });
    closeModal(); showToast('success', 'Предложение отправлено', 'Клиент увидит цену ' + fmtT(total)); renderWF();
  }
  async function decide(id, decision) {
    // решение клиента идёт через защищённую функцию БД — менять цену и статус напрямую нельзя
    const { error } = await S().rpc('decide_order', { p_order_id: id, p_decision: decision });
    if (error) { showToast('danger', 'Ошибка', error.message); return; }
    closeModal();
    showToast(decision === 'approved' ? 'success' : 'info', decision === 'approved' ? 'Предложение согласовано' : 'Предложение отклонено', decision === 'approved' ? 'Менеджер подготовит договор' : 'Менеджер свяжется с вами');
    renderWF();
  }
  async function signContract(id) {
    const { error } = await S().from('orders').update({ contract_signed_at: new Date().toISOString(), status: 'contract_signed' }).eq('id', id);
    if (error) { showToast('danger', 'Ошибка', error.message); return; }
    hist(id, 'contract_signed', {});
    closeModal(); showToast('success', 'Договор отмечен подписанным', 'Теперь можно создать перевозку'); renderWF();
  }
  async function createTransport(id) {
    const o = CACHE.orders.find(x => x.id === id); if (!o) return;
    const row = { ref: refTr(), order_id: o.id, client_id: o.client_id, manager_id: U().id, logist_id: o.logist_id, origin: o.origin, destination: o.destination };
    const { data, error } = await S().from('transports').insert(row).select().single();
    if (error) { showToast('danger', 'Ошибка', error.message); return; }
    await S().from('orders').update({ status: 'converted' }).eq('id', id);
    hist(id, 'converted', { transport: data.ref });
    closeModal(); showToast('success', 'Перевозка создана', data.ref);
    CACHE.tab = 'trans'; renderWF();
  }
  async function showHistory(id) {
    const { data } = await S().from('order_history').select('*').eq('order_id', id).order('created_at', { ascending: false });
    const NAMES = { created: 'Заявка создана', assigned: 'Назначен логист', calculated: 'Расчёт логиста', offer_sent: 'Предложение отправлено', client_approved: 'Клиент согласовал', client_rejected: 'Клиент отклонил', contract_signed: 'Договор подписан', converted: 'Создана перевозка' };
    openModal('История изменений', (data || []).map(h =>
      `<div style="padding:10px 0;border-bottom:1px solid var(--border);">
        <div style="display:flex;justify-content:space-between;"><b style="font-size:14px;">${NAMES[h.action] || esc(h.action)}</b><span style="color:var(--muted);font-size:12.5px;">${dt(h.created_at)}</span></div>
        ${h.snapshot && Object.keys(h.snapshot).length ? `<div style="font-size:12.5px;color:var(--muted);margin-top:2px;">${esc(JSON.stringify(h.snapshot).slice(0, 160))}</div>` : ''}
      </div>`).join('') || '<div style="color:var(--muted);">Пусто</div>');
  }

  // ============================================================
  // ЦИКЛ 2 — перевозки
  // ============================================================
  function viewTrans() {
    const ts = CACHE.transports;
    if (!ts.length) return `<div class="card" style="text-align:center;padding:48px;color:var(--muted);">
      Перевозок пока нет.${isMgr() ? ' Создайте её из согласованной заявки (статус «Договор подписан»).' : ''}</div>`;
    return `<div class="grid grid-3">` + ts.map(t => {
      const st = TST[t.status] || TST.preparing;
      return `<div class="svc-card" onclick="WF.openTrans('${t.id}')">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <span class="mono" style="font-size:13px;color:var(--muted);">${esc(t.ref)}</span>
          <span class="pill pill-info">${st.l}</span></div>
        <h3 class="svc-h" style="font-size:16.5px;">${esc(t.origin)} → ${esc(t.destination)}</h3>
        <div style="height:6px;background:var(--border);border-radius:3px;margin:12px 0 4px;">
          <div style="height:6px;width:${t.progress}%;background:var(--accent);border-radius:3px;"></div></div>
        <div style="font-size:12.5px;color:var(--muted);">${t.progress}% · ${dt(t.created_at)}</div>
      </div>`;
    }).join('') + `</div>`;
  }

  async function openTrans(id) {
    const t = CACHE.transports.find(x => x.id === id); if (!t) return;
    CACHE.openTrans = id;
    const s = S();
    const [{ data: trips }, { data: updates }, evRes] = await Promise.all([
      s.from('trips').select('*').eq('transport_id', id).order('created_at'),
      s.from('transport_updates').select('*').eq('transport_id', id).order('created_at', { ascending: false }),
      (isMgr() || isLog()) ? s.from('trip_events').select('*').eq('transport_id', id).order('created_at', { ascending: false }) : Promise.resolve({ data: [] })
    ]);
    const events = evRes.data || [];
    const st = TST[t.status] || TST.preparing;
    const staff = isMgr() || isLog();

    let body = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <div><span class="mono" style="font-size:13px;color:var(--muted);">${esc(t.ref)}</span>
        <div style="font-size:19px;font-weight:700;">${esc(t.origin)} → ${esc(t.destination)}</div></div>
        <span class="pill pill-info">${st.l}</span></div>
      <div style="height:8px;background:var(--border);border-radius:4px;margin:10px 0 4px;">
        <div style="height:8px;width:${t.progress}%;background:var(--accent);border-radius:4px;"></div></div>
      <div style="font-size:12.5px;color:var(--muted);margin-bottom:14px;">Прогресс ${t.progress}%${isMgr() ? ' · Менеджер: вы' : ''}</div>`;

    if (isMgr()) {
      body += `<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">` +
        Object.keys(TST).map(k => `<button class="rd-tab ${t.status===k?'active':''}" onclick="WF.setTStatus('${t.id}','${k}')">${TST[k].l}</button>`).join('') + `</div>`;
    }

    // Рейсы
    body += `<div style="font-weight:600;margin:8px 0 8px;">Рейсы / машины ${staff ? `<a href="#" style="font-size:13px;font-weight:500;color:var(--accent);" onclick="WF.addTrip('${t.id}');return false;">+ добавить</a>` : ''}</div>`;
    body += (trips || []).length ? (trips || []).map(tr =>
      `<div style="display:flex;justify-content:space-between;padding:8px 12px;border:1px solid var(--border);border-radius:10px;margin-bottom:6px;font-size:14px;">
        <span>${esc(tr.name)}${tr.driver ? ' · ' + esc(tr.driver) : ''}</span>
        ${staff ? `<a href="#" style="color:var(--accent);font-size:13px;" onclick="WF.addEvent('${t.id}','${tr.id}','${esc(tr.name)}');return false;">+ событие</a>` : ''}
      </div>`).join('') : `<div style="color:var(--muted);font-size:13.5px;margin-bottom:6px;">Рейсы ещё не добавлены</div>`;

    // Внутренние события (персонал)
    if (staff) {
      body += `<div style="font-weight:600;margin:14px 0 8px;">Внутренние события <span style="font-weight:400;color:var(--muted);font-size:12.5px;">(клиент не видит)</span></div>`;
      body += events.length ? events.map(ev => `
        <div style="padding:10px 12px;background:var(--bg);border-radius:10px;margin-bottom:6px;">
          <div style="font-size:13.5px;">${esc(ev.internal_text)}</div>
          <div style="display:flex;justify-content:space-between;margin-top:4px;">
            <span style="font-size:12px;color:var(--muted);">${dt(ev.created_at)}${ev.processed ? ' · опубликовано' : ''}</span>
            ${isMgr() && !ev.processed ? `<a href="#" style="font-size:12.5px;color:var(--accent);" onclick="WF.publish('${t.id}',${ev.id});return false;">Опубликовать клиенту →</a>` : ''}
          </div></div>`).join('') : `<div style="color:var(--muted);font-size:13.5px;">Событий нет</div>`;
    }

    // Публичная лента
    body += `<div style="font-weight:600;margin:14px 0 8px;">Лента для клиента</div>`;
    body += (updates || []).length ? (updates || []).map(u => `
      <div style="padding:10px 12px;border-left:3px solid var(--accent);background:var(--bg);border-radius:0 10px 10px 0;margin-bottom:6px;">
        <div style="font-size:14px;">${esc(u.public_text)}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:3px;">${dt(u.created_at)}</div>
      </div>`).join('') : `<div style="color:var(--muted);font-size:13.5px;">Обновлений пока нет</div>`;

    // Документы + связь
    body += `<div style="display:flex;gap:10px;margin-top:16px;">
      <button class="btn btn-secondary" style="flex:1;" onclick="WF.transDocs('${t.id}','${esc(t.ref)}')">Документы</button>
      <button class="btn btn-primary" style="flex:1;" onclick="openWhatsApp('Здравствуйте! Вопрос по перевозке ${esc(t.ref)} (${esc(t.origin)} → ${esc(t.destination)})')">Связаться с менеджером</button>
    </div>`;
    openModal('Перевозка ' + t.ref, body);
  }

  async function setTStatus(id, status) {
    const { error } = await S().from('transports').update({ status, progress: TST[status].p }).eq('id', id);
    if (error) { showToast('danger', 'Ошибка', error.message); return; }
    await loadAll(); openTrans(id);
  }
  function addTrip(tid) {
    const name = prompt('Название рейса (например: Машина 1 · DAF 123ABC01)');
    if (!name) return;
    const driver = prompt('Водитель (необязательно)') || '';
    S().from('trips').insert({ transport_id: tid, name, driver }).then(({ error }) => {
      if (error) showToast('danger', 'Ошибка', error.message);
      else { showToast('success', 'Рейс добавлен', name); openTrans(tid); }
    });
  }
  function addEvent(tid, tripId, tripName) {
    const text = prompt('Внутреннее событие по «' + tripName + '» (видят только сотрудники):');
    if (!text) return;
    S().from('trip_events').insert({ transport_id: tid, trip_id: tripId, internal_text: text, created_by: U().id }).then(({ error }) => {
      if (error) showToast('danger', 'Ошибка', error.message);
      else { showToast('success', 'Событие добавлено', 'Менеджер увидит его и опубликует текст клиенту'); openTrans(tid); }
    });
  }
  async function publish(tid, evId) {
    const { data: ev } = await S().from('trip_events').select('*').eq('id', evId).single();
    const text = prompt('Текст для клиента:', ev ? 'По вашей перевозке: ' + ev.internal_text : '');
    if (!text) return;
    const e1 = (await S().from('transport_updates').insert({ transport_id: tid, source_event: evId, public_text: text, published_by: U().id })).error;
    const e2 = (await S().from('trip_events').update({ processed: true }).eq('id', evId)).error;
    if (e1 || e2) { showToast('danger', 'Ошибка', (e1 || e2).message); return; }
    showToast('success', 'Опубликовано', 'Клиент увидит обновление'); openTrans(tid);
  }
  function transDocs(tid, ref) {
    const t = CACHE.transports.find(x => x.id === tid);
    openModal('Документы · ' + ref, `
      <div id="wf-docs-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;">
        <div style="color:var(--muted);font-size:13.5px;">Загрузка…</div></div>
      <button class="btn btn-secondary" style="width:100%;" onclick="WF.addTransDoc('${tid}','${esc(ref)}')">+ Прикрепить документ</button>`);
    renderTransDocs(ref);
  }
  async function renderTransDocs(ref) {
    const box = document.getElementById('wf-docs-list'); if (!box || !window.__EXIM_DOCS) return;
    try {
      const files = await window.__EXIM_DOCS.list('transports/' + ref);
      box.innerHTML = files.length ? files.map(f =>
        `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid var(--border);border-radius:10px;">
          <span class="pill pill-info">${(f.name.split('.').pop() || '').toUpperCase().slice(0,5)}</span>
          <span style="flex:1;font-size:14px;">${esc(f.name.replace(/^\d+_/, ''))}</span>
          <a href="#" style="font-size:13px;color:var(--accent);" onclick="window.__EXIM_DOCS.signedUrl('transports/${ref}/${f.name}').then(u=>window.open(u,'_blank'));return false;">Скачать</a>
        </div>`).join('') : '<div style="color:var(--muted);font-size:13.5px;">Документов нет</div>';
    } catch (e) { box.innerHTML = '<div style="color:var(--muted);font-size:13.5px;">Не удалось загрузить</div>'; }
  }
  function addTransDoc(tid, ref) {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.onchange = async () => {
      if (!picker.files.length) return;
      try { await window.__EXIM_DOCS.upload(picker.files[0], 'transports/' + ref); showToast('success', 'Загружено', picker.files[0].name); renderTransDocs(ref); }
      catch (e) { showToast('danger', 'Ошибка загрузки', e.message || ''); }
    };
    picker.click();
  }


  // ============================================================
  // КОМАНДА (только админ): роли пользователей
  // ============================================================
  const ROLE_L = { client: 'Клиент', manager: 'Менеджер', logist: 'Логист', admin: 'Администратор' };
  function viewTeam() {
    const rows = CACHE.profiles.map(p => `
      <tr>
        <td>${esc(p.full_name || '—')}${p.id === U().id ? ' <span class="pill pill-info">вы</span>' : ''}</td>
        <td style="color:var(--muted);">${esc(p.email)}</td>
        <td>${esc(p.company || '—')}</td>
        <td>
          <select class="form-input" style="height:36px;padding:0 10px;font-size:13.5px;width:auto;"
            onchange="WF.setRole('${p.id}', this.value, ${p.id === U().id})">
            ${Object.keys(ROLE_L).map(r => `<option value="${r}" ${p.role===r?'selected':''}>${ROLE_L[r]}</option>`).join('')}
          </select>
        </td>
      </tr>`).join('');
    return `<div class="card">
      <div style="font-weight:600;margin-bottom:4px;">Пользователи и роли</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:14px;">Смена роли применяется сразу. Свою роль тоже можно менять — интерфейс перезагрузится. Нельзя снять последнего администратора.</div>
      <table class="table"><thead><tr><th>Имя</th><th>Email</th><th>Компания</th><th>Роль</th></tr></thead><tbody>${rows}</tbody></table>
    </div>`;
  }
  async function setRole(uid, role, isSelf) {
    const { error } = await S().rpc('admin_set_role', { p_user: uid, p_role: role });
    if (error) { showToast('danger', 'Ошибка', error.message); renderWF(); return; }
    showToast('success', 'Роль изменена', ROLE_L[role]);
    if (isSelf) setTimeout(() => window.location.reload(), 800);
    else renderWF();
  }

  // ============================================================
  // ДАШБОРДЫ ПО РОЛЯМ (на главной)
  // ============================================================
  function dashCard(n, label, accent, onclick) {
    return `<div class="svc-kpi" style="cursor:pointer;" onclick="${onclick || "navigate('workflow')"}">
      <div class="mono svc-kpi-n" ${accent ? 'style="color:var(--accent);"' : ''}>${n}</div>
      <div class="svc-kpi-l">${label}</div></div>`;
  }
  async function renderWFDash() {
    const box = document.getElementById('wf-dash');
    if (!box || !S()) return;
    try { await loadAll(); } catch (e) { return; }
    const os = CACHE.orders, ts = CACHE.transports;
    const inTransit = ts.filter(t => !['delivered', 'archived'].includes(t.status)).length;
    let cards = '';
    let title = '';
    if (isMgr()) {
      const nnew = os.filter(o => o.status === 'new').length;
      const calc = os.filter(o => o.status === 'assigned');
      const late = calc.filter(overdue).length;
      const ready = os.filter(o => o.status === 'calculated').length;
      const waiting = os.filter(o => o.status === 'offer_sent').length;
      const toShip = os.filter(o => ['approved', 'contract_signed'].includes(o.status)).length;
      const marginSum = os.filter(o => o.offer_sent_at).reduce((s, o) => s + Number((CACHE.fin[o.id] || {}).margin || 0), 0);
      title = 'Рабочий стол менеджера';
      cards = dashCard(nnew, 'новых заявок', nnew > 0) +
        dashCard(calc.length + (late ? ' <span style="font-size:14px;color:var(--accent);">(' + late + ' проср.)</span>' : ''), 'на расчёте', late > 0) +
        dashCard(ready, 'расчёт готов — нужна маржа', ready > 0) +
        dashCard(waiting, 'ждут решения клиента', false) +
        dashCard(toShip, 'к оформлению перевозки', toShip > 0) +
        dashCard(inTransit, 'перевозок в работе', false) +
        dashCard(fmtT(marginSum), 'маржа по отправленным', false);
    } else if (isLog()) {
      const my = os.filter(o => o.status === 'assigned');
      const late = my.filter(overdue).length;
      title = 'Рабочий стол логиста';
      cards = dashCard(my.length, 'заявок на расчёте у вас', my.length > 0) +
        dashCard(late, 'просрочено', late > 0) +
        dashCard(inTransit, 'перевозок в работе', false);
    } else {
      const active = os.filter(o => !['rejected', 'archived', 'converted'].includes(o.status)).length;
      const decide = os.filter(o => o.status === 'offer_sent').length;
      const done = ts.filter(t => t.status === 'delivered').length;
      title = 'Ваши перевозки с EXIM';
      cards = dashCard(active, 'заявок в работе', false) +
        dashCard(decide, 'ждут вашего решения', decide > 0) +
        dashCard(inTransit, 'грузов в пути', false) +
        dashCard(done, 'доставлено', false);
    }
    box.innerHTML = `<div style="margin: 4px 0 20px;">
      <span class="eyebrow">${title}</span>
      <div class="svc-kpis" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));">${cards}</div>
    </div>`;
  }

  // ---------- интеграция с приложением ----------
  window.WF = {
    tab: t => { CACHE.tab = t; renderWF(); },
    view: v => { CACHE.view = v; renderWF(); },
    setRole, dash: renderWFDash,
    getData: async () => { await loadAll(); return CACHE; },
    teamHtml: () => viewTeam(),
    effRole, dbRole,
    open: openOrder, newOrder, createOrder, assign, submitCalc, sendOffer, decide,
    signContract, createTransport, showHistory,
    openTrans, setTStatus, addTrip, addEvent, publish, transDocs, addTransDoc, render: renderWF
  };
  // при смене роли просмотра — обновить данные на текущей странице
  ['switchRole', 'switchRoleTo'].forEach(function (fn) {
    const orig = window[fn];
    if (typeof orig !== 'function') return;
    window[fn] = function () {
      const r = orig.apply(this, arguments);
      setTimeout(function () {
        const pg = window.APP_STATE && APP_STATE.currentPage;
        if (pg === 'workflow') renderWF();
        if (pg === 'dashboard') renderWFDash();
        if (pg === 'analytics' && window.AN) AN.render();
      }, 50);
      return r;
    };
  });

  const _nav = window.navigate;
  window.navigate = function (page, event, id) {
    _nav(page, event, id);
    if (page === 'workflow') renderWF();
    if (page === 'dashboard') renderWFDash();
  };
  // при первом входе тоже отрисовать дашборд
  setTimeout(renderWFDash, 600);
})();
