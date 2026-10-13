/* ============================================================
   EXIM Super App — рабочие циклы
   Цикл 1: заявка → назначение логиста → расчёт → маржа → предложение → решение клиента
   Цикл 2: перевозка → рейсы → внутренние события → публикация клиенту
   Данные: Supabase (window.__SUPA), права — RLS в базе.
   ============================================================ */
(function () {
  const S = () => window.__SUPA;
  const U = () => window.__EXIM || {};
  // Роль приходит из server-validated membership. APP_STATE и элементы UI
  // никогда не повышают права пользователя.
  const dbRole = () => U().role || 'client';
  const effRole = () => {
    const dbr = dbRole();
    if (dbr === 'admin') return 'manager';
    return ['manager', 'logist'].includes(dbr) ? dbr : 'client';
  };
  const isMgr = () => effRole() === 'manager';
  const isLog = () => effRole() === 'logist';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtT = n => n == null || n === '' ? '—' : '₸ ' + Math.round(Number(n)).toLocaleString('ru-RU');
  const dt = s => s ? new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  const overdue = o => o.status === 'assigned' && o.calc_deadline && new Date(o.calc_deadline) < new Date();

  const OST = {
    draft:          { l: 'Черновик',           c: '' },
    clarification:  { l: 'На уточнении',       c: 'pill-warning' },
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

  let CACHE = { orders: [], fin: {}, profiles: [], transports: [], tab: 'orders', openOrder: null, openTrans: null, loadedAt: 0, loading: null };

  // ---------- загрузка данных (кэш 15 сек + защита от параллельных запросов) ----------
  // Ошибка любого обязательного запроса — это ошибка загрузки, а не «данных нет».
  // Кэш и отметка свежести обновляются только после полностью успешной загрузки;
  // повтор после ошибки действительно идёт на сервер.
  function loadError(res, what) {
    const e = res && res.error;
    const err = new Error((e && e.message) || ('Не удалось загрузить: ' + what));
    err.code = e && (e.code || e.status);
    err.status = e && e.status;
    err.what = what;
    return err;
  }
  function must(res, what) {
    if (!res || res.error) throw loadError(res, what);
    if (res.data == null) throw loadError({ error: { message: 'Пустой ответ сервера: ' + what } }, what);
    return res.data;
  }
  async function loadAll(force) {
    if (!force && CACHE.loadedAt && Date.now() - CACHE.loadedAt < 15000) return;
    if (CACHE.loading) return CACHE.loading;
    CACHE.loading = _loadAll().then(
      (next) => { Object.assign(CACHE, next); CACHE.loadedAt = Date.now(); CACHE.error = null; },
      (err) => { CACHE.loadedAt = 0; CACHE.error = err; throw err; }
    ).finally(() => { CACHE.loading = null; });
    return CACHE.loading;
  }
  async function _loadAll() {
    const s = S();
    if (!s) throw loadError(null, 'нет соединения с сервером');
    const next = {};
    const [ordersRes, transRes] = await Promise.all([
      // цена клиента, текст предложения и внутренний комментарий расчёта
      // не выбираются из таблицы напрямую: их отдаёт только orders_scoped()
      s.rpc('orders_scoped', { p_workspace_id: U().workspaceId }),
      s.from('transports').select('*').order('created_at', { ascending: false })
    ]);
    // Серверная RLS уже вернула только разрешённый scope.
    next.orders = must(ordersRes, 'заявки');
    next.transports = must(transRes, 'перевозки');
    if (isMgr()) next.companies = must(await s.from('client_companies').select('id, name').order('name'), 'клиентские компании');
    next.fin = {};
    if (isMgr() || isLog()) {
      const ids = next.orders.map(o => o.id);
      const fin = ids.length ? must(await s.from('order_finance').select('*').in('order_id', ids), 'финансы заявок') : [];
      fin.forEach(f => { next.fin[f.order_id] = f; });
    }
    next.profiles = must(await s.from('profiles').select('id, full_name, email, role, company, staff_code'), 'профили');
    return next;
  }
  function stateBox(err, retry) {
    const st = window.EXIM_STATE;
    if (st) return st.html(st.classify(err), err && err.code === '42501' ? null : 'Не удалось загрузить данные', retry);
    return '<div role="alert" style="padding:40px;color:var(--muted);">Не удалось загрузить данные</div>';
  }
  const logists = () => CACHE.profiles.filter(p => ['logist','manager','admin'].includes(p.role));
  const profName = id => { const p = CACHE.profiles.find(x => x.id === id); return p ? (p.full_name || p.email) : '—'; };

  async function hist(orderId, action, snapshot) {
    try { await S().from('order_history').insert({ order_id: orderId, actor_id: U().id, action, snapshot: snapshot || {} }); } catch (e) {}
  }
  // Код направления для умного номера: 10 Китай, 20 РФ/СНГ, 30 внутри КЗ, 40 Европа, 50 Турция/Кавказ, 90 прочее
  function directionCode(origin, destination) {
    const s = ((origin || '') + ' ' + (destination || '')).toLowerCase();
    if (/гуанчжоу|шэньчжэнь|пекин|шанхай|иу|урумчи|сиань|китай|хоргос|достык/.test(s)) return '10';
    if (/москва|казань|омск|новосибирск|екатеринбург|россия|минск|ташкент|бишкек|душанбе/.test(s)) return '20';
    if (/стамбул|турция|тбилиси|баку|ереван/.test(s)) return '50';
    if (/берлин|варшава|прага|европ|гамбург|роттердам/.test(s)) return '40';
    const kz = /алматы|астана|шымкент|караганда|актобе|атырау|актау|уральск|тараз|павлодар|казахстан/;
    const parts = s.split(' ');
    if (kz.test(origin || '') && kz.test(destination || '')) return '30';
    return '90';
  }
  function refOrd() { return 'ZK-' + Math.floor(1000 + Math.random() * 9000); }
  function refTr() { return 'TR-' + Math.floor(1000 + Math.random() * 9000); }

  // ---------- страница ----------
  async function renderWF() {
    const box = document.getElementById('wf-content');
    if (!box) return;
    if (!CACHE.loadedAt) box.innerHTML = '<div style="padding:40px;text-align:center;color:var(--muted);">Загрузка…</div>';
    try { await loadAll(); } catch (e) { box.innerHTML = stateBox(e, () => renderWF()); return; }
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
    if (o.status === 'draft') { openDraft(id); return; }
    setTimeout(() => { loadClar(o.id); loadFiles(o.id); }, 50);
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
      </div>
      <div id="wf-clar" data-order="${o.id}"></div>
      <div id="wf-files" data-order="${o.id}" data-ws="${o.workspace_id}" data-add="${canAttach(o) ? 1 : 0}"></div>
      ${(!isLog() && (['new', 'clarification', 'assigned', 'calculated'].includes(o.status) || (isMgr() && o.status === 'rejected')))
        ? `<button class="btn btn-secondary btn-sm" style="margin-bottom:14px;" onclick="WF.editRequest('${o.id}')">Изменить заявку</button>` : ''}`;
    if (od) body += `<div class="auth-msg" style="background:rgba(225,29,72,.07);border:1px solid rgba(225,29,72,.25);color:var(--accent);border-radius:10px;padding:10px 12px;margin-bottom:14px;font-size:13.5px;">Расчёт просрочен — дедлайн был ${dt(o.calc_deadline)}</div>`;

    // ---- вид для КЛИЕНТА ----
    if (!isMgr() && !isLog()) {
      if (o.status === 'clarification') {
        body += `<div class="form-group"><label class="form-label" for="wf-clar-msg">Ответ менеджеру</label>
          <textarea class="form-input" id="wf-clar-msg" rows="2"></textarea></div>
          <button class="btn btn-primary btn-lg" style="width:100%;" onclick="WF.answerClar('${o.id}')">Ответить и вернуть менеджеру</button>
          <div style="color:var(--muted);font-size:13px;margin-top:8px;">Если нужно поправить данные — нажмите «Изменить заявку».</div>`;
      } else if (o.status === 'offer_sent') {
        body += `<div id="wf-offer" data-order="${o.id}" data-days="${esc(o.calc_days || '')}">Загрузка…</div>`;
        setTimeout(() => loadOffer(o.id), 50);
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
          <div class="form-group"><label class="form-label">Срок</label>
            <input class="form-input" id="wf-days" value="${esc(o.calc_days)}" placeholder="7–9 дней"></div>
          <div class="form-group"><label class="form-label">Расчёт по статьям</label>
            <div id="wf-exp-rows">${(exp.length ? exp : [{ name: 'Фрахт', amount: '' }, { name: 'СВХ / терминал', amount: '' }, { name: 'Оформление', amount: '' }]).map(e => `
              <div class="wf-exp-row" style="display:flex;gap:8px;margin-bottom:8px;">
                <input class="form-input wf-exp-name" placeholder="Статья расхода" value="${esc(e.name)}" style="flex:2;">
                <input class="form-input wf-exp-sum" type="number" placeholder="Сумма, ₸" value="${e.amount || ''}" style="flex:1;" oninput="WF.calcSum()">
                <button type="button" class="btn btn-ghost btn-sm" style="color:var(--accent);flex:none;" onclick="this.parentElement.remove();WF.calcSum();">✕</button>
              </div>`).join('')}</div>
            <button type="button" class="btn btn-secondary btn-sm" onclick="WF.addExpRow()">+ добавить статью</button>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding:12px 14px;background:var(--bg);border-radius:10px;">
              <span style="font-weight:600;">Себестоимость (итого)</span>
              <span class="mono" id="wf-cost-total" style="font-size:18px;font-weight:700;">₸ 0</span>
            </div>
          </div>
          <div class="form-group"><label class="form-label">Ставки перевозчиков (минимум 2)</label>
            <div id="wf-rates" data-order="${o.id}" data-edit="1">Загрузка…</div>
            <div style="display:grid;grid-template-columns:2fr 1fr 80px;gap:8px;margin-top:8px;">
              <input class="form-input" id="wf-rate-carrier" placeholder="Перевозчик">
              <input class="form-input" id="wf-rate-amount" type="number" placeholder="Ставка">
              <input class="form-input" id="wf-rate-cur" value="KZT" maxlength="3">
            </div>
            <button type="button" class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="WF.addRate('${o.id}')">+ добавить ставку</button>
          </div>
          <div class="form-group"><label class="form-label">Комментарий менеджеру</label>
            <textarea class="form-input" id="wf-comment" rows="2">${esc(o.calc_comment)}</textarea></div>
          <button class="btn btn-primary btn-lg" style="width:100%;" onclick="WF.submitCalc('${o.id}')">Отправить расчёт менеджеру</button>`;
        setTimeout(() => { calcSum(); loadRates(o.id); }, 50);
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
        <button class="btn btn-primary btn-lg" style="width:100%;" onclick="WF.assign('${o.id}')">Назначить и отправить на расчёт</button>
        <div class="form-group" style="margin-top:14px;"><label class="form-label" for="wf-clar-msg">Не хватает данных?</label>
          <textarea class="form-input" id="wf-clar-msg" rows="2" placeholder="Что уточнить у клиента"></textarea></div>
        <button class="btn btn-secondary btn-lg" style="width:100%;" onclick="WF.returnClar('${o.id}')">Вернуть клиенту на уточнение</button>`;
    } else if (o.status === 'clarification') {
      body += `<div style="color:var(--muted);font-size:14px;">Заявка у клиента на уточнении.</div>`;
    } else if (o.status === 'assigned') {
      body += `<div style="color:var(--muted);font-size:14px;">Логист: <b>${profName(o.logist_id)}</b> · дедлайн ${dt(o.calc_deadline)}. Ожидаем расчёт.</div>`;
    } else if (o.status === 'calculated') {
      const cost = Number(f.cost || 0);
      setTimeout(() => loadRates(o.id), 50);
      body += calcBlock(o, f) + `
        <div style="font-weight:600;margin:14px 0 6px;">Ставки перевозчиков</div>
        <div id="wf-rates" data-order="${o.id}" data-select="1">Загрузка…</div>
        <div style="font-weight:600;margin:14px 0 10px;">Предложение клиенту</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group"><label class="form-label">Маржа, ₸</label>
            <input class="form-input" id="wf-margin" type="number" placeholder="250000" oninput="document.getElementById('wf-total').value=${cost}+Number(this.value||0)"></div>
          <div class="form-group"><label class="form-label">Итоговая цена, ₸</label>
            <input class="form-input" id="wf-total" type="number" value="${cost}"></div>
        </div>
        <div class="form-group"><label class="form-label">Комментарий для клиента</label>
          <textarea class="form-input" id="wf-offer-comment" rows="2" placeholder="Например: срок, что включено в цену"></textarea></div>
        <div class="form-group"><label class="form-label" for="wf-price-reason">Причина изменения цены (если предложение уже отправлялось)</label>
          <input class="form-input" id="wf-price-reason" placeholder="Видна только сотрудникам"></div>
        <button class="btn btn-primary btn-lg" style="width:100%;" onclick="WF.sendOffer('${o.id}')">Отправить предложение клиенту</button>`;
    } else if (o.status === 'offer_sent') {
      body += calcBlock(o, f) + offerBlock(o, f) + `<div style="color:var(--muted);font-size:14px;margin-top:8px;">Ожидаем решение клиента.</div>`;
    } else if (o.status === 'approved') {
      body += calcBlock(o, f) + offerBlock(o, f) + `
        <div style="font-weight:600;margin:14px 0 8px;">Договорное основание</div>
        <div style="color:var(--muted);font-size:13px;margin-bottom:8px;">Согласование предложения — ещё не договор. Перевозку можно создать только после фиксации основания.</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:0 12px;">
          <div class="form-group"><label class="form-label" for="wf-agr-kind">Основание</label>
            <select class="form-input" id="wf-agr-kind"><option value="contract">Договор</option><option value="addendum">Допсоглашение</option><option value="signed_offer">Подписанное предложение</option><option value="invoice_paid">Оплаченный счёт</option></select></div>
          <div class="form-group"><label class="form-label" for="wf-agr-num">Номер документа</label><input class="form-input" id="wf-agr-num"></div>
          <div class="form-group"><label class="form-label" for="wf-agr-date">Дата подписания</label><input class="form-input" id="wf-agr-date" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
        </div>
        <button class="btn btn-primary btn-lg" style="width:100%;" onclick="WF.signContract('${o.id}')">Зафиксировать основание</button>`;
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
  // ---- REQ-001: форма запроса, черновик и идемпотентная отправка ----
  const RQ_FORM = [
    ['contact_name', 'Контактное лицо *', 'text'], ['contact_phone', 'Телефон контакта', 'tel'],
    ['origin', 'Откуда *', 'text'], ['destination', 'Куда *', 'text'],
    ['ready_date', 'Дата готовности груза', 'date'], ['transport', 'Вид транспорта', 'select:|Авто|ЖД|Море|Авиа|Мультимодальная'],
    ['cargo', 'Груз (название / тип) *', 'text'], ['hs_code', 'Код ТН ВЭД (если известен)', 'text'],
    ['places', 'Мест', 'number'], ['weight_kg', 'Вес, кг *', 'number'],
    ['volume_m3', 'Объём, м³ *', 'number'], ['dimensions', 'Габариты', 'text'],
    ['packaging', 'Упаковка', 'text'], ['stackable', 'Штабелируемый', 'select:|да|нет'],
    ['loading_method', 'Способ погрузки', 'text'], ['incoterms', 'Incoterms', 'select:|EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP'],
    ['consignee', 'Получатель', 'text'], ['comment', 'Комментарий', 'text']
  ];
  const RQ_LABEL = Object.fromEntries(RQ_FORM.map(([k, l]) => [k, l.replace(' *', '')]));
  const DRAFT_KEY = 'exim-req-draft';
  const draftLocal = { get() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(v)); } catch (e) {} },
    clear() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} } };
  function rqInput([k, l, t], val) {
    const v = val == null ? '' : (k === 'stackable' ? (val === true ? 'да' : val === false ? 'нет' : val) : val);
    if (t.startsWith('select:')) return `<div class="form-group"><label class="form-label" for="rq-${k}">${l}</label><select class="form-input" id="rq-${k}" onchange="WF.rqKeep()">${t.slice(7).split('|').map(o => `<option value="${o}" ${o === String(v) ? 'selected' : ''}>${o || '—'}</option>`).join('')}</select></div>`;
    return `<div class="form-group"><label class="form-label" for="rq-${k}">${l}</label><input class="form-input" id="rq-${k}" type="${t}" value="${esc(v)}" oninput="WF.rqKeep()" ${t === 'number' ? 'min="0" step="any"' : ''}></div>`;
  }
  function rqCollect() {
    const out = {};
    RQ_FORM.forEach(([k]) => { const el = document.getElementById('rq-' + k); if (!el) return;
      let v = el.value.trim(); if (k === 'stackable') v = v === 'да' ? true : v === 'нет' ? false : null; out[k] = v; });
    return out;
  }
  function rqKeep() { const box = document.getElementById('rq-form'); if (box) draftLocal.set({ key: box.dataset.key, company: (document.getElementById('wf-company') || {}).value || null, data: rqCollect() }); }
  async function newOrder(existing) {
    const saved = existing ? null : draftLocal.get();
    const key = existing ? existing.client_request_id : (saved && saved.key) || crypto.randomUUID();
    const data = existing || (saved && saved.data) || {};
    const companies = (CACHE.companies || []).map(c => `<option value="${c.id}" ${saved && saved.company === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    openModal(existing ? 'Черновик ' + existing.ref : 'Новый запрос на расчёт', `
      <div id="rq-form" data-key="${esc(key)}">
        ${isMgr() && !existing ? `<div class="form-group"><label class="form-label" for="wf-company">Клиентская компания *</label><select class="form-input" id="wf-company" onchange="WF.rqKeep()">${companies}</select></div>` : ''}
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 12px;">${RQ_FORM.map(f => rqInput(f, data[f[0]])).join('')}</div>
        ${existing ? `<div id="wf-files" data-order="${existing.id}" data-ws="${U().workspaceId}" data-add="1"></div>` : '<div style="color:var(--muted);font-size:12.5px;margin-bottom:8px;">Фото и документы можно добавить после сохранения черновика.</div>'}
        <div id="rq-errors" role="alert" style="color:var(--accent);font-size:13.5px;margin:4px 0 10px;"></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-secondary btn-lg" style="flex:1;" onclick="WF.saveDraft(false)">Сохранить черновик</button>
          <button class="btn btn-primary btn-lg" style="flex:1;" onclick="WF.saveDraft(true)">Отправить менеджеру</button>
        </div>
        <div style="color:var(--muted);font-size:12.5px;margin-top:8px;">* обязательны для отправки. Черновик можно сохранить с любым набором полей.</div>
      </div>`);
    if (existing) { const box = document.getElementById('rq-form'); box.dataset.company = existing.client_company_id; loadFiles(existing.id); }
  }
  async function saveDraft(submit) {
    const box = document.getElementById('rq-form'); if (!box) return;
    const companyId = box.dataset.company || (isMgr() ? (document.getElementById('wf-company') || {}).value : U().clientCompanyId);
    const errBox = document.getElementById('rq-errors');
    if (!companyId) { errBox.textContent = 'Нет доступной клиентской компании — запрос создаётся только в её рамках.'; return; }
    rqKeep();
    const { data, error } = await S().rpc('save_request', { p_client_request_id: box.dataset.key, p_company_id: companyId, p_data: rqCollect(), p_submit: !!submit });
    if (error) {
      const m = /missing required fields: (.*)/.exec(error.message || '');
      errBox.innerHTML = m ? 'Недостаточно данных: ' + m[1].split(',').map(k => esc(RQ_LABEL[k] || k)).join(', ')
        : esc(error.message) + ' <button class="btn btn-ghost btn-sm" onclick="WF.saveDraft(' + !!submit + ')">Повторить</button>';
      return;
    }
    const r = Array.isArray(data) ? data[0] : data;
    CACHE.loadedAt = 0;
    if (submit) { draftLocal.clear(); closeModal(); showToast('success', 'Запрос отправлен', r.ref + ' — менеджер проверит данные'); renderWF(); }
    else { errBox.textContent = ''; showToast('info', 'Черновик сохранён', r.ref + (r.missing && r.missing.length ? ' · не хватает: ' + r.missing.map(k => RQ_LABEL[k] || k).join(', ') : '')); }
  }
  async function openDraft(id) {
    const { data, error } = await S().from('orders').select(['id', 'ref', 'client_company_id', 'client_request_id'].concat(RQ_FORM.map(f => f[0])).join(',')).eq('id', id).maybeSingle();
    if (error || !data) { showToast('danger', 'Черновик недоступен', error ? error.message : ''); return; }
    newOrder(data);
  }
  async function assign(id) {
    const lg = (document.getElementById('wf-logist') || {}).value;
    const dl = (document.getElementById('wf-deadline') || {}).value;
    if (!lg) { showToast('warning', 'Выберите логиста', 'Назначьте роль logist нужному сотруднику'); return; }
    const upd = { logist_id: lg, status: 'assigned', calc_deadline: dl ? new Date(dl).toISOString() : null };
    const { error } = await S().from('orders').update(upd).eq('id', id);
    if (error) { showToast('danger', 'Ошибка', error.message); return; }
    hist(id, 'assigned', upd);
    CACHE.loadedAt = 0;
    closeModal(); showToast('success', 'Логист назначен', 'Заявка отправлена на расчёт'); renderWF();
  }
  function gatherExpenses() {
    return [...document.querySelectorAll('#wf-exp-rows .wf-exp-row')].map(r => ({
      name: (r.querySelector('.wf-exp-name') || {}).value || '',
      amount: Number((r.querySelector('.wf-exp-sum') || {}).value || 0)
    })).filter(e => e.name.trim() && e.amount > 0);
  }
  function calcSum() {
    const total = gatherExpenses().reduce((s, e) => s + e.amount, 0);
    const el = document.getElementById('wf-cost-total');
    if (el) el.textContent = fmtT(total);
    return total;
  }
  function addExpRow() {
    const box = document.getElementById('wf-exp-rows');
    if (!box) return;
    box.insertAdjacentHTML('beforeend', `
      <div class="wf-exp-row" style="display:flex;gap:8px;margin-bottom:8px;">
        <input class="form-input wf-exp-name" placeholder="Статья расхода" style="flex:2;">
        <input class="form-input wf-exp-sum" type="number" placeholder="Сумма, ₸" style="flex:1;" oninput="WF.calcSum()">
        <button type="button" class="btn btn-ghost btn-sm" style="color:var(--accent);flex:none;" onclick="this.parentElement.remove();WF.calcSum();">✕</button>
      </div>`);
  }
  async function submitCalc(id) {
    const v = x => (document.getElementById(x) || {}).value || '';
    const expenses = gatherExpenses();
    const cost = expenses.reduce((s, e) => s + e.amount, 0);
    if (!cost) { showToast('warning', 'Заполните статьи расчёта', 'Добавьте хотя бы одну статью с суммой'); return; }
    if ((RATES[id] || []).filter(r => r.status === 'active').length < 2) { showToast('warning', 'Нужно минимум 2 ставки', 'Добавьте ставки перевозчиков'); return; }
    const updO = { calc_route: v('wf-route'), calc_days: v('wf-days'), calc_comment: v('wf-comment'), calc_submitted_at: new Date().toISOString(), status: 'calculated' };
    const e1 = (await S().from('orders').update(updO).eq('id', id)).error;
    const e2 = (await S().from('order_finance').upsert({ order_id: id, cost, expenses })).error;
    if (e1 || e2) { showToast('danger', 'Ошибка', (e1 || e2).message); return; }
    hist(id, 'calculated', { ...updO, cost, expenses });
    CACHE.loadedAt = 0;
    closeModal(); showToast('success', 'Расчёт отправлен', 'Менеджер получит уведомление'); renderWF();
  }
  async function sendOffer(id) {
    const margin = Number((document.getElementById('wf-margin') || {}).value || 0);
    const total = Number((document.getElementById('wf-total') || {}).value || 0);
    const comment = (document.getElementById('wf-offer-comment') || {}).value || '';
    if (!total) { showToast('warning', 'Укажите итоговую цену', ''); return; }
    // версия предложения создаётся только через функцию БД; прежняя открытая версия становится неактуальной
    const reason = ((document.getElementById('wf-price-reason') || {}).value || '').trim();
    const e1 = (await S().rpc('send_offer', { p_order_id: id, p_total: total, p_comment: comment || null, p_price_reason: reason || null })).error;
    if (e1) { showToast('danger', /requires a reason/.test(e1.message) ? 'Укажите причину изменения цены' : 'Ошибка', e1.message); return; }
    const e2 = (await S().from('order_finance').update({ margin }).eq('order_id', id)).error;
    if (e2) { showToast('danger', 'Предложение отправлено, но маржа не сохранена', e2.message); }
    hist(id, 'offer_sent', { margin, total, comment });
    CACHE.loadedAt = 0;
    closeModal(); showToast('success', 'Предложение отправлено', 'Клиент увидит цену ' + fmtT(total)); renderWF();
  }
  async function loadOffer(orderId) {
    const box = document.getElementById('wf-offer');
    if (!box || box.dataset.order !== orderId) return;
    const { data, error } = await S().from('commercial_offers')
      .select('id, version, total_price, currency, comment, valid_until').eq('order_id', orderId).eq('status', 'sent').maybeSingle();
    if (error || !data) {
      const st = window.EXIM_STATE;
      box.innerHTML = st ? st.html(error ? st.classify(error) : 'notfound', error ? null : 'Актуальное предложение не найдено', () => loadOffer(orderId)) : 'Ошибка';
      return;
    }
    const days = box.dataset.days;
    box.innerHTML = `<div class="card" style="background:var(--bg);box-shadow:none;margin-bottom:14px;">
        <div style="font-size:13px;color:var(--muted);margin-bottom:4px;">Предложение EXIM · версия ${data.version}${data.valid_until ? ' · действует до ' + esc(data.valid_until) : ''}</div>
        <div style="font-size:26px;font-weight:700;color:var(--accent);">${data.currency === 'KZT' ? fmtT(data.total_price) : Number(data.total_price).toLocaleString('ru-RU') + ' ' + esc(data.currency)}</div>
        ${days ? `<div style="font-size:13.5px;color:var(--muted);margin-top:4px;">Срок: ${days}</div>` : ''}
        ${data.comment ? `<div style="font-size:14px;margin-top:8px;">${esc(data.comment)}</div>` : ''}
      </div>
      <div style="display:flex;gap:10px;">
        <button class="btn btn-primary btn-lg" style="flex:1;" onclick="WF.decide('${data.id}','approved')">Согласовать</button>
        <button class="btn btn-secondary btn-lg" style="flex:1;" onclick="WF.decide('${data.id}','rejected')">Отклонить</button>
      </div>
      <div class="form-group" style="margin-top:14px;"><label class="form-label" for="wf-clar-msg">Есть вопрос по предложению?</label>
        <textarea class="form-input" id="wf-clar-msg" rows="2"></textarea></div>
      <button class="btn btn-ghost btn-lg" style="width:100%;" onclick="WF.askOffer('${data.id}')">Запросить уточнение</button>`;
  }
  async function decide(offerId, decision) {
    // решение привязано к конкретной версии предложения; устаревшая версия будет отклонена БД
    const { error } = await S().rpc('decide_offer', { p_offer_id: offerId, p_decision: decision });
    if (error) { showToast('danger', 'Ошибка', error.message); return; }
    CACHE.loadedAt = 0;
    closeModal();
    showToast(decision === 'approved' ? 'success' : 'info', decision === 'approved' ? 'Предложение согласовано' : 'Предложение отклонено', decision === 'approved' ? 'Менеджер подготовит договор' : 'Менеджер свяжется с вами');
    renderWF();
  }
  async function signContract(id) {
    const v = x => ((document.getElementById(x) || {}).value || '').trim();
    if (!v('wf-agr-date')) { showToast('warning', 'Укажите дату подписания', ''); return; }
    const { error } = await S().rpc('record_agreement', { p_order_id: id, p_kind: v('wf-agr-kind') || 'contract', p_signed_on: v('wf-agr-date'), p_doc_number: v('wf-agr-num') || null });
    if (error) { showToast('danger', 'Основание не зафиксировано', error.message); return; }
    hist(id, 'contract_signed', { kind: v('wf-agr-kind'), number: v('wf-agr-num'), signed_on: v('wf-agr-date') });
    CACHE.loadedAt = 0;
    closeModal(); showToast('success', 'Основание зафиксировано', 'Теперь можно создать перевозку'); renderWF();
  }
  let creatingShipment = false;
  async function createTransport(id) {
    const o = CACHE.orders.find(x => x.id === id); if (!o || creatingShipment) return;
    creatingShipment = true;
    try {
      let ref = null;
      try {
        const { data } = await S().rpc('gen_transport_ref', { p_manager: U().id, p_logist: o.logist_id, p_direction: directionCode(o.origin, o.destination) });
        ref = data;
      } catch (e) {}
      // перевозку создаёт функция БД: проверяет основание, переносит данные заявки, не создаёт дубль
      const { data, error } = await S().rpc('create_shipment', { p_order_id: id, p_ref: ref });
      if (error) { showToast('danger', 'Перевозка не создана', error.message); return; }
      const r = Array.isArray(data) ? data[0] : data;
      if (r.created) hist(id, 'converted', { transport: r.ref });
      CACHE.loadedAt = 0;
      closeModal(); showToast('success', r.created ? 'Перевозка создана' : 'Перевозка уже существует', r.ref);
      CACHE.tab = 'trans'; renderWF();
    } finally { creatingShipment = false; }
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
      // клиенту — только безопасный слой рейсов, без машины и водителя
      (isMgr() || isLog())
        ? s.from('trips').select('*').eq('transport_id', id).order('created_at')
        : s.rpc('client_trips', { p_transport_id: id }),
      // персонал видит всю ленту с версиями и скрытыми записями, клиент — только действующие тексты
      (isMgr() || isLog())
        ? s.rpc('transport_feed_staff', { p_transport_id: id })
        : s.from('transport_updates').select('id, public_text, occurred_at, location, version, created_at').eq('transport_id', id).order('occurred_at', { ascending: true }),
      (isMgr() || isLog()) ? s.from('trip_events').select('*').eq('transport_id', id).eq('is_current', true).order('occurred_at', { ascending: false }) : Promise.resolve({ data: [] })
    ]);
    const events = evRes.data || [];
    const st = TST[t.status] || TST.preparing;
    const staff = isMgr() || isLog();

    const DIRN = { '10': 'Китай', '20': 'РФ/СНГ', '30': 'Казахстан', '40': 'Европа', '50': 'Турция/Кавказ', '90': 'Прочее' };
    const refParts = /^(\d{2})-(\d{2})-(\d{2})-(\d+)$/.exec(t.ref);
    const refHint = refParts ? 'Менеджер №' + refParts[1] + ' · Логист №' + refParts[2] + ' · ' + (DIRN[refParts[3]] || 'напр. ' + refParts[3]) + ' · порядковый ' + refParts[4] : '';
    let body = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <div><span class="mono" style="font-size:13px;color:var(--muted);" title="${esc(refHint)}">${esc(t.ref)}${refHint ? ' ⓘ' : ''}</span>
        <div style="font-size:19px;font-weight:700;">${esc(t.origin)} → ${esc(t.destination)}</div></div>
        <span class="pill pill-info">${st.l}</span></div>
      <div style="height:8px;background:var(--border);border-radius:4px;margin:10px 0 4px;">
        <div style="height:8px;width:${t.progress}%;background:var(--accent);border-radius:4px;"></div></div>
      <div style="font-size:12.5px;color:var(--muted);margin-bottom:14px;">Прогресс ${t.progress}%${isMgr() ? ' · Менеджер: вы' : ''}</div>`;

    // Этапы перевозки Foundation Gate: двигает только назначенный логист, по одному шагу
    if (t.stage) {
      const i = STAGES.indexOf(t.stage);
      body += `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">` + STAGES.map((k, j) =>
        `<span class="pill ${j < i ? '' : j === i ? 'pill-accent' : ''}" style="${j > i ? 'opacity:.45;' : ''}">${STAGE_L[k]}</span>`).join('') + `</div>`;
      const next = STAGES[i + 1];
      if (next && isLog() && (t.logist_id === U().id)) {
        body += `${next === 'factory_contact' ? `<div class="form-group"><label class="form-label" for="st-note">Результат связи с фабрикой</label><input class="form-input" id="st-note"></div>` : ''}
          <button class="btn btn-primary" style="width:100%;margin-bottom:14px;" onclick="WF.advanceShipment('${t.id}','${next}')">Далее: ${STAGE_L[next]}</button>`;
      }
    } else if (isMgr()) {
      body += `<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">` +
        Object.keys(TST).map(k => `<button class="rd-tab ${t.status===k?'active':''}" onclick="WF.setTStatus('${t.id}','${k}')">${TST[k].l}</button>`).join('') + `</div>`;
    }

    // Рейсы
    body += `<div style="font-weight:600;margin:8px 0 8px;">Рейсы / машины ${staff ? `<a href="#" style="font-size:13px;font-weight:500;color:var(--accent);" onclick="WF.addTrip('${t.id}');return false;">+ добавить</a>` : ''}</div>`;
    body += (trips || []).length ? (trips || []).map((tr, idx) =>
      `<div style="display:flex;justify-content:space-between;padding:8px 12px;border:1px solid var(--border);border-radius:10px;margin-bottom:6px;font-size:14px;">
        <span>${tr.sequence ? '№' + tr.sequence + ' · ' : ''}${esc(tr.name || 'Рейс ' + (idx + 1))}${tr.trip_stage ? ' · ' + (TRIP_L[tr.trip_stage] || tr.trip_stage) : ''}${tr.route ? ' · ' + esc(tr.route) : ''}${tr.mode ? ' · ' + (MODE_L[tr.mode] || tr.mode) : ''}${staff && tr.vehicle_no ? ' · ' + esc(tr.vehicle_no) : ''}${staff && tr.driver ? ' · ' + esc(tr.driver) : ''}${tr.planned_arrival ? ' · прибытие ' + esc(tr.planned_arrival) : ''}</span>
        <span>${staff && tr.assignee_id === U().id && TRIP_NEXT[tr.trip_stage] ? `<a href="#" style="color:var(--accent);font-size:13px;" onclick="WF.advanceTrip('${t.id}','${tr.id}','${TRIP_NEXT[tr.trip_stage]}');return false;">→ ${TRIP_L[TRIP_NEXT[tr.trip_stage]]}</a> · ` : ''}
        ${staff ? `<a href="#" style="color:var(--accent);font-size:13px;" onclick="WF.addEvent('${t.id}','${tr.id}');return false;">+ событие</a>` : ''}</span>
      </div>`).join('') : `<div style="color:var(--muted);font-size:13.5px;margin-bottom:6px;">Рейсы ещё не добавлены</div>`;

    // Внутренние события (персонал)
    if (staff) {
      body += `<div style="font-weight:600;margin:14px 0 8px;">Внутренние события <span style="font-weight:400;color:var(--muted);font-size:12.5px;">(клиент не видит)</span></div>`;
      body += events.length ? events.map(ev => `
        <div style="padding:10px 12px;background:var(--bg);border-radius:10px;margin-bottom:6px;">
          <div style="font-size:12.5px;color:var(--muted);">${EVT_L[ev.event_type] || 'Событие'} · ${dt(ev.occurred_at || ev.created_at)}${ev.location ? ' · ' + esc(ev.location) : ''}${ev.supersedes_id ? ' · исправлено' : ''}</div>
          <div style="font-size:13.5px;">${esc(ev.internal_text)}</div>
          <div style="display:flex;justify-content:space-between;gap:8px;margin-top:4px;flex-wrap:wrap;">
            <span style="font-size:12px;color:var(--muted);">${ev.processed ? 'опубликовано' : 'не опубликовано'}</span>
            <span>
              <a href="#" style="font-size:12.5px;color:var(--muted);" onclick="WF.eventForm('${t.id}','${ev.trip_id || ''}',${ev.id});return false;">Исправить</a>
              ${isMgr() ? ` · <a href="#" style="font-size:12.5px;color:var(--accent);" onclick="WF.publish('${t.id}',${ev.id});return false;">${ev.processed ? 'Обновить публикацию' : 'Опубликовать клиенту →'}</a>` : ''}
            </span>
          </div></div>`).join('') : `<div style="color:var(--muted);font-size:13.5px;">Событий нет</div>`;
    }

    // Публичная лента
    body += `<div style="font-weight:600;margin:14px 0 8px;">Лента для клиента</div>`;
    body += (updates || []).length ? (updates || []).map(u => {
      const off = u.hidden || u.superseded_by;
      return `
      <div style="padding:10px 12px;border-left:3px solid ${off ? 'var(--border)' : 'var(--accent)'};background:var(--bg);border-radius:0 10px 10px 0;margin-bottom:6px;${off ? 'opacity:.55;' : ''}">
        <div style="font-size:14px;">${esc(u.public_text)}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:3px;">${dt(u.occurred_at || u.created_at)}${u.location ? ' · ' + esc(u.location) : ''}${u.version > 1 ? ' · версия ' + u.version : ''}
          ${u.hidden ? ' · скрыто: ' + esc(u.hidden_reason || '') : ''}${u.superseded_by ? ' · заменено новой версией' : ''}
          ${isMgr() && !off ? ` · <a href="#" style="color:var(--muted);" onclick="WF.hideUpdate('${t.id}',${u.id});return false;">Скрыть</a>` : ''}</div>
      </div>`; }).join('') : `<div style="color:var(--muted);font-size:13.5px;">Обновлений пока нет</div>`;

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
  const STAGES = ['preparation', 'factory_contact', 'pickup_waiting', 'loading', 'in_transit'];
  const STAGE_L = { preparation: 'Подготовка', factory_contact: 'Связь с фабрикой', pickup_waiting: 'Ожидание забора', loading: 'Погрузка', in_transit: 'В пути' };
  const TRIP_L = { planned: 'запланирован', loading: 'погрузка', in_transit: 'в пути' };
  const TRIP_NEXT = { planned: 'loading', loading: 'in_transit' };
  async function advanceShipment(tid, next) {
    const { error } = await S().rpc('advance_shipment', { p_transport_id: tid, p_to_stage: next, p_note: fv('st-note') || null });
    if (error) { showToast('danger', 'Этап не изменён', error.message); return; }
    CACHE.loadedAt = 0; await loadAll(); showToast('success', 'Этап изменён', STAGE_L[next]); openTrans(tid);
  }
  async function advanceTrip(tid, tripId, next) {
    const { error } = await S().rpc('advance_trip', { p_trip_id: tripId, p_to_stage: next });
    if (error) { showToast('danger', 'Рейс не изменён', error.message); return; }
    showToast('success', 'Рейс', TRIP_L[next]); openTrans(tid);
  }
  const MODE_L = { road: 'Авто', rail: 'ЖД', sea: 'Море', air: 'Авиа', multimodal: 'Мультимодальная' };
  const EVT_L = { loaded: 'Погрузка', departed: 'Отправление', border: 'Граница', customs_in: 'Таможня — прибытие', customs_out: 'Таможня — выпуск', arrived: 'Прибытие', delivered: 'Доставлено', delay: 'Задержка', other: 'Другое' };
  const fv = x => ((document.getElementById(x) || {}).value || '').trim();
  const fld = (id, label, type, val, extra) => `<div class="form-group"><label class="form-label" for="${id}">${label}</label><input class="form-input" id="${id}" type="${type || 'text'}" value="${esc(val || '')}" ${extra || ''}></div>`;
  const sel = (id, label, map, val) => `<div class="form-group"><label class="form-label" for="${id}">${label}</label><select class="form-input" id="${id}">${Object.keys(map).map(k => `<option value="${k}" ${k === val ? 'selected' : ''}>${map[k]}</option>`).join('')}</select></div>`;
  const grid = inner => `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:0 12px;">${inner}</div>`;
  function addTrip(tid) {
    openModal('Новый рейс', grid(
      fld('tr-name', 'Название рейса', 'text', '', 'placeholder="Машина 1"') + sel('tr-mode', 'Вид транспорта', MODE_L, 'road') +
      fld('tr-carrier', 'Перевозчик') + fld('tr-driver', 'Водитель') +
      fld('tr-vehicle', 'Номер машины') + fld('tr-trailer', 'Прицеп') +
      fld('tr-container', 'Контейнер') + fld('tr-wagon', 'Вагон') +
      fld('tr-flight', 'Рейс (авиа)') + fld('tr-bill', 'Коносамент / накладная') +
      fld('tr-dep', 'Плановая отправка', 'date') + fld('tr-arr', 'Плановое прибытие', 'date')) +
      `<div style="color:var(--muted);font-size:12.5px;margin-bottom:10px;">Клиент видит только вид транспорта, статус и плановые даты.</div>
      <input type="hidden" id="tr-key" value="${crypto.randomUUID()}">
      <button class="btn btn-primary btn-lg" style="width:100%;" onclick="WF.saveTrip('${tid}')">Добавить рейс</button>`);
  }
  async function saveTrip(tid) {
    const row = { transport_id: tid, name: fv('tr-name') || 'Рейс', mode: fv('tr-mode') || null, carrier: fv('tr-carrier') || null, driver: fv('tr-driver'),
      vehicle_no: fv('tr-vehicle') || null, trailer_no: fv('tr-trailer') || null, container_no: fv('tr-container') || null,
      wagon_no: fv('tr-wagon') || null, flight_no: fv('tr-flight') || null, bill_no: fv('tr-bill') || null };
    // рейс создаётся функцией БД: номер по порядку, исполнитель, повтор с тем же ключом не создаёт дубль
    const res = await S().rpc('create_trip', { p_transport_id: tid, p_client_key: fv('tr-key'), p_mode: row.mode, p_route: null,
      p_name: row.name, p_carrier: row.carrier, p_vehicle_no: row.vehicle_no, p_driver: row.driver, p_container_no: row.container_no, p_assignee: null });
    if (res.error) { showToast('danger', 'Рейс не добавлен', res.error.message); return; }
    const created = Array.isArray(res.data) ? res.data[0] : res.data;
    const data = { id: created.trip_id };
    const extra = { trailer_no: row.trailer_no, wagon_no: row.wagon_no, flight_no: row.flight_no, bill_no: row.bill_no };
    if (Object.values(extra).some(Boolean)) await S().from('trips').update(extra).eq('id', data.id);
    if (fv('tr-dep') || fv('tr-arr')) {
      const r = await S().rpc('set_trip_plan', { p_trip_id: data.id, p_departure: fv('tr-dep') || null, p_arrival: fv('tr-arr') || null, p_reason: null });
      if (r.error) showToast('warning', 'Рейс добавлен без плановых дат', r.error.message);
    }
    showToast('success', 'Рейс добавлен', row.name); openTrans(tid);
  }
  function addEvent(tid, tripId) { eventForm(tid, tripId, null); }
  async function eventForm(tid, tripId, evId) {
    let ev = {};
    if (evId) { const r = await S().from('trip_events').select('*').eq('id', evId).single(); ev = r.data || {}; }
    const at = ev.occurred_at ? new Date(ev.occurred_at) : new Date();
    const local = new Date(at.getTime() - at.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    openModal(evId ? 'Исправление события' : 'Новое событие рейса', grid(
      sel('ev-type', 'Тип', EVT_L, ev.event_type || 'other') + fld('ev-at', 'Дата и время', 'datetime-local', local) + fld('ev-loc', 'Место', 'text', ev.location)) +
      `<div class="form-group"><label class="form-label" for="ev-text">Внутренний текст (клиент не видит)</label><textarea class="form-input" id="ev-text" rows="2">${esc(ev.internal_text || '')}</textarea></div>
      <div class="form-group"><label class="form-label" for="ev-draft">Черновик текста для клиента</label><textarea class="form-input" id="ev-draft" rows="2">${esc(ev.client_draft || '')}</textarea></div>
      ${evId ? '<div style="color:var(--muted);font-size:12.5px;margin-bottom:10px;">Исправление создаёт новую версию, прежняя остаётся в истории.</div>' : ''}
      <button class="btn btn-primary btn-lg" style="width:100%;" onclick="WF.saveEvent('${tid}','${tripId || ''}',${evId || 'null'})">${evId ? 'Сохранить исправление' : 'Добавить событие'}</button>`);
  }
  async function saveEvent(tid, tripId, evId) {
    if (fv('ev-text').length < 2) { showToast('warning', 'Опишите событие', ''); return; }
    const at = fv('ev-at') ? new Date(fv('ev-at')).toISOString() : new Date().toISOString();
    const { error } = evId
      ? await S().rpc('correct_trip_event', { p_event_id: evId, p_internal_text: fv('ev-text'), p_occurred_at: at, p_location: fv('ev-loc') || null, p_event_type: fv('ev-type'), p_client_draft: fv('ev-draft') || null })
      : await S().from('trip_events').insert({ transport_id: tid, trip_id: tripId || null, internal_text: fv('ev-text'), created_by: U().id, event_type: fv('ev-type'), occurred_at: at, location: fv('ev-loc') || null, client_draft: fv('ev-draft') || null });
    if (error) { showToast('danger', 'Событие не сохранено', error.message); return; }
    showToast('success', evId ? 'Событие исправлено' : 'Событие добавлено', 'Менеджер опубликует текст клиенту'); openTrans(tid);
  }
  async function publish(tid, evId) {
    const { data: ev } = await S().from('trip_events').select('*').eq('id', evId).single();
    openModal('Публикация клиенту', `
      <div style="font-size:13px;color:var(--muted);margin-bottom:8px;">Внутренний текст: ${esc(ev ? ev.internal_text : '')}</div>
      <div class="form-group"><label class="form-label" for="pub-text">Текст, который увидит клиент</label>
        <textarea class="form-input" id="pub-text" rows="3">${esc((ev && ev.client_draft) || '')}</textarea></div>
      <div style="color:var(--muted);font-size:12.5px;margin-bottom:10px;">Не указывайте водителя, перевозчика, контакты и внутренние причины.</div>
      <button class="btn btn-primary btn-lg" style="width:100%;" onclick="WF.doPublish('${tid}',${evId})">Опубликовать</button>`);
  }
  async function doPublish(tid, evId) {
    const { error } = await S().rpc('publish_event', { p_event_id: evId, p_public_text: fv('pub-text') });
    if (error) { showToast('danger', 'Не опубликовано', error.message); return; }
    showToast('success', 'Опубликовано', 'Клиент увидит обновление'); openTrans(tid);
  }
  async function hideUpdate(tid, uid) {
    openModal('Скрыть публикацию', `<div class="form-group"><label class="form-label" for="hide-reason">Причина (видят только сотрудники)</label>
      <input class="form-input" id="hide-reason"></div>
      <button class="btn btn-primary btn-lg" style="width:100%;" onclick="WF.doHide('${tid}',${uid})">Скрыть от клиента</button>`);
  }
  async function doHide(tid, uid) {
    const { error } = await S().rpc('hide_update', { p_update_id: uid, p_reason: fv('hide-reason') });
    if (error) { showToast('danger', 'Не скрыто', error.message); return; }
    showToast('success', 'Скрыто', 'Запись осталась в истории'); openTrans(tid);
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
        <td>${['manager','logist','admin'].includes(p.role) ? `<input class="form-input mono" style="height:36px;width:64px;padding:0 8px;font-size:13.5px;" value="${p.staff_code != null ? String(p.staff_code).padStart(2, '0') : ''}" placeholder="—"
          onchange="WF.setCode('${p.id}', this.value)" title="Код сотрудника для номеров перевозок">` : '<span style="color:var(--muted);">—</span>'}</td>
      </tr>`).join('');
    return `<div class="card">
      <div style="font-weight:600;margin-bottom:4px;">Пользователи и роли</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:14px;">Смена роли применяется сразу. Свою роль тоже можно менять — интерфейс перезагрузится. Нельзя снять последнего администратора.</div>
      <table class="table"><thead><tr><th>Имя</th><th>Email</th><th>Компания</th><th>Роль</th><th>Код</th></tr></thead><tbody>${rows}</tbody></table>
    </div>`;
  }
  async function setCode(uid, code) {
    const n = parseInt(code, 10);
    if (!n || n < 1 || n > 99) { showToast('warning', 'Код 01–99', 'Введите число от 1 до 99'); return; }
    const { error } = await S().rpc('admin_set_code', { p_user: uid, p_code: n });
    if (error) { showToast('danger', 'Ошибка', error.message); return; }
    showToast('success', 'Код сохранён', String(n).padStart(2, '0'));
    CACHE.loadedAt = 0; renderWF();
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
    try { await loadAll(); } catch (e) { box.innerHTML = stateBox(e, () => renderWFDash()); return; }
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
    box.innerHTML = `<div style="margin: 4px 0 24px;">
      <span class="eyebrow">${title}</span>
      <div class="svc-kpis wf-kpis">${cards}</div>
    </div>`;
    // старая демо-полоса KPI дублирует показатели — скрываем
    const legacy = document.getElementById('rd-kpis-legacy');
    if (legacy) legacy.style.display = 'none';
  }

  // ---------- интеграция с приложением ----------
  const REQ_ORIG = {};
  async function editRequest(id) {
    const o = CACHE.orders.find(x => x.id === id); if (!o) return;
    const { data, error } = await S().from('orders').select(RQ_FORM.map(f => f[0]).join(',')).eq('id', id).maybeSingle();
    if (error || !data) { showToast('danger', 'Заявка недоступна', error ? error.message : ''); return; }
    REQ_ORIG[id] = data;
    const body = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 12px;">${RQ_FORM.map(f => rqInput(f, data[f[0]])).join('')}</div>
      <div class="form-group"><label class="form-label" for="wf-rev-reason">Что изменилось и почему</label>
        <input class="form-input" id="wf-rev-reason" placeholder="Например: уточнили вес"></div>
      <div style="color:var(--muted);font-size:13px;margin-bottom:10px;">Изменение создаст новую версию заявки. Действующие ставки будут отозваны, расчёт начнётся заново.</div>
      <button class="btn btn-primary btn-lg" style="width:100%;" onclick="WF.saveRequest('${o.id}')">Сохранить новую версию</button>
      <div id="wf-revs" style="margin-top:16px;"></div>`;
    openModal('Изменение заявки ' + o.ref, body);
    loadRevisions(id);
  }
  async function loadRevisions(id) {
    const box = document.getElementById('wf-revs'); if (!box) return;
    const { data, error } = await S().from('order_revisions').select('revision, reason, created_at').eq('order_id', id).order('revision', { ascending: false });
    if (error) { box.innerHTML = window.EXIM_STATE ? EXIM_STATE.html(EXIM_STATE.classify(error), null, () => loadRevisions(id)) : ''; return; }
    box.innerHTML = (data || []).length ? '<div style="font-weight:600;margin-bottom:6px;">История версий</div>' + data.map(r =>
      `<div style="font-size:13.5px;padding:4px 0;">Версия ${r.revision} · ${dt(r.created_at)}${r.reason ? ' · ' + esc(r.reason) : ''}</div>`).join('') : '';
  }
  async function saveRequest(id) {
    const orig = REQ_ORIG[id] || {};
    const cur = rqCollect(), patch = {};
    const norm = v => v == null ? '' : String(v);
    Object.keys(cur).forEach(k => {
      const a = norm(cur[k]), b = norm(orig[k]);
      const same = (k === 'weight_kg' || k === 'volume_m3' || k === 'places') && a && b ? Number(a) === Number(b) : a === b;
      if (!same) patch[k] = cur[k];
    });
    if (!Object.keys(patch).length) { showToast('info', 'Изменений нет', ''); return; }
    const reason = ((document.getElementById('wf-rev-reason') || {}).value || '').trim() || null;
    const { data, error } = await S().rpc('revise_order', { p_order_id: id, p_data: patch, p_reason: reason });
    if (error) { showToast('danger', 'Заявка не изменена', error.message); return; }
    CACHE.loadedAt = 0;
    closeModal(); showToast('success', 'Заявка обновлена', 'Версия ' + data); renderWF();
  }
  // ---- фото и документы к заявке (бакет request-files) ----
  function canAttach(o) {
    if (isLog()) return false;
    if (isMgr()) return !['converted', 'archived'].includes(o.status);
    return ['draft', 'new', 'clarification', 'assigned', 'calculated'].includes(o.status);
  }
  async function loadFiles(orderId) {
    const box = document.getElementById('wf-files'); if (!box || box.dataset.order !== orderId) return;
    const { data, error } = await S().from('order_attachments').select('id, kind, file_name, object_path, size_bytes, created_at').eq('order_id', orderId).order('created_at');
    if (error) { box.innerHTML = window.EXIM_STATE ? EXIM_STATE.html(EXIM_STATE.classify(error), null, () => loadFiles(orderId)) : ''; return; }
    const list = (data || []).map(a => `<div style="display:flex;gap:8px;align-items:center;font-size:13.5px;padding:3px 0;">
        <span>${a.kind === 'photo' ? 'Фото' : 'Документ'}</span>
        <a href="#" onclick="WF.openFile('${esc(a.object_path)}');return false;" style="flex:1;overflow:hidden;text-overflow:ellipsis;">${esc(a.file_name)}</a>
        <span class="mono" style="color:var(--muted);">${Math.max(1, Math.round(a.size_bytes / 1024))} КБ</span></div>`).join('');
    const add = box.dataset.add === '1' ? `<label class="btn btn-secondary btn-sm" style="margin-top:6px;cursor:pointer;">+ фото или документ
        <input type="file" hidden multiple accept="image/jpeg,image/png,image/webp,image/heic,application/pdf,.xlsx,.docx" onchange="WF.uploadFiles('${orderId}', this)"></label>
        <div style="color:var(--muted);font-size:12px;">JPG, PNG, WEBP, HEIC, PDF, XLSX, DOCX · до 20 МБ</div>` : '';
    box.innerHTML = (list || add) ? `<div class="card" style="background:var(--bg);box-shadow:none;margin-bottom:14px;"><div style="font-weight:600;margin-bottom:6px;">Фото и документы</div>${list || '<div style="color:var(--muted);font-size:13px;">Файлов нет</div>'}${add}</div>` : '';
  }
  async function uploadFiles(orderId, input) {
    const box = document.getElementById('wf-files'); if (!box) return;
    const files = [...(input.files || [])];
    for (const file of files) {
      if (file.size > 20 * 1024 * 1024) { showToast('warning', 'Файл слишком большой', file.name + ' — больше 20 МБ'); continue; }
      const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80) || 'file';
      const path = `${box.dataset.ws}/${orderId}/${crypto.randomUUID()}-${safe}`;
      const up = await S().storage.from('request-files').upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) { showToast('danger', 'Файл не загружен', file.name + ': ' + up.error.message); continue; }
      const reg = await S().rpc('register_attachment', { p_order_id: orderId, p_object_path: path, p_file_name: file.name });
      if (reg.error) { showToast('danger', 'Файл не прикреплён', file.name + ': ' + reg.error.message); continue; }
    }
    loadFiles(orderId);
  }
  async function openFile(path) {
    const { data, error } = await S().storage.from('request-files').createSignedUrl(path, 300);
    if (error || !data) { showToast('danger', 'Файл недоступен', error ? error.message : ''); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  }
  const DIR = { to_client: 'Менеджер → клиент', to_manager: 'Клиент → менеджер' };
  async function loadClar(orderId) {
    const box = document.getElementById('wf-clar'); if (!box || box.dataset.order !== orderId) return;
    const { data, error } = await S().from('order_clarifications').select('direction, message, created_at').eq('order_id', orderId).order('id');
    if (error) { box.innerHTML = window.EXIM_STATE ? EXIM_STATE.html(EXIM_STATE.classify(error), null, () => loadClar(orderId)) : ''; return; }
    box.innerHTML = (data || []).length ? '<div class="card" style="background:var(--bg);box-shadow:none;margin-bottom:14px;"><div style="font-weight:600;margin-bottom:6px;">Уточнения</div>' +
      data.map(m => `<div style="font-size:13.5px;padding:4px 0;"><span style="color:var(--muted);">${DIR[m.direction]} · ${dt(m.created_at)}</span><br>${esc(m.message)}</div>`).join('') + '</div>' : '';
  }
  function clarMsg() { return ((document.getElementById('wf-clar-msg') || {}).value || '').trim(); }
  async function clarCall(fn, args, ok) {
    if ((args.p_message || '').length < 3) { showToast('warning', 'Напишите сообщение', 'Минимум 3 символа'); return; }
    const { error } = await S().rpc(fn, args);
    if (error) { showToast('danger', 'Не отправлено', error.message); return; }
    CACHE.loadedAt = 0; closeModal(); showToast('success', ok, ''); renderWF();
  }
  const returnClar = id => clarCall('return_for_clarification', { p_order_id: id, p_message: clarMsg() }, 'Заявка возвращена клиенту');
  const answerClar = id => clarCall('answer_clarification', { p_order_id: id, p_message: clarMsg() }, 'Ответ отправлен менеджеру');
  const askOffer = offerId => clarCall('request_offer_clarification', { p_offer_id: offerId, p_message: clarMsg() }, 'Вопрос отправлен менеджеру');
  const RATES = {};
  async function loadRates(orderId) {
    const box = document.getElementById('wf-rates');
    if (!box || box.dataset.order !== orderId) return;
    const { data, error } = await S().from('rate_quotes')
      .select('id, carrier, amount, currency, status, created_by, created_at').eq('order_id', orderId).order('created_at');
    if (error) {
      box.innerHTML = window.EXIM_STATE ? EXIM_STATE.html(EXIM_STATE.classify(error), null, () => loadRates(orderId)) : esc(error.message);
      return;
    }
    RATES[orderId] = data || [];
    const edit = box.dataset.edit === '1';
    const sel = box.dataset.select === '1';
    let chosen = null;
    if (sel) { const r = await S().from('orders').select('selected_rate_id').eq('id', orderId).maybeSingle(); chosen = r.data && r.data.selected_rate_id; }
    box.innerHTML = RATES[orderId].length ? RATES[orderId].map(r => `
      <div style="display:flex;gap:8px;align-items:center;padding:6px 0;${r.status === 'withdrawn' ? 'opacity:.5;text-decoration:line-through;' : ''}">
        <span style="flex:1;">${esc(r.carrier)}</span>
        <span class="mono">${Number(r.amount).toLocaleString('ru-RU')} ${esc(r.currency)}</span>
        ${sel && r.status === 'active' ? (r.id === chosen ? '<span class="pill pill-accent">выбрана</span>' : `<button type="button" class="btn btn-ghost btn-sm" onclick="WF.selectRate('${orderId}','${r.id}')">Выбрать</button>`) : ''}
        ${edit && r.status === 'active' ? `<button type="button" class="btn btn-ghost btn-sm" onclick="WF.withdrawRate('${r.id}','${orderId}')">Отозвать</button>` : ''}
      </div>`).join('') : '<div style="color:var(--muted);font-size:13.5px;">Ставок пока нет</div>';
  }
  async function addRate(orderId) {
    const v = x => ((document.getElementById(x) || {}).value || '').trim();
    const carrier = v('wf-rate-carrier'), amount = Number(v('wf-rate-amount')), currency = v('wf-rate-cur').toUpperCase() || 'KZT';
    if (!carrier || !(amount > 0)) { showToast('warning', 'Укажите перевозчика и ставку', ''); return; }
    const { error } = await S().from('rate_quotes').insert({ order_id: orderId, carrier, amount, currency });
    if (error) { showToast('danger', 'Ставка не добавлена', error.message); return; }
    ['wf-rate-carrier', 'wf-rate-amount'].forEach(x => { const el = document.getElementById(x); if (el) el.value = ''; });
    loadRates(orderId);
  }
  async function selectRate(orderId, rateId) {
    const { error } = await S().rpc('select_rate', { p_order_id: orderId, p_rate_id: rateId });
    if (error) { showToast('danger', 'Ставка не выбрана', error.message); return; }
    loadRates(orderId);
  }
  async function withdrawRate(rateId, orderId) {
    const { error } = await S().from('rate_quotes').update({ status: 'withdrawn' }).eq('id', rateId);
    if (error) { showToast('danger', 'Не удалось отозвать', error.message); return; }
    loadRates(orderId);
  }
  window.WF = {
    tab: t => { CACHE.tab = t; renderWF(); },
    view: v => { CACHE.view = v; renderWF(); },
    calcSum, addExpRow,
    setRole, setCode, dash: renderWFDash,
    getData: async () => { await loadAll(); return CACHE; },
    teamHtml: () => viewTeam(),
    effRole, dbRole,
    open: openOrder, newOrder: () => newOrder(), createOrder: () => saveDraft(true), assign, submitCalc, sendOffer, decide, addRate, withdrawRate, saveDraft, rqKeep, returnClar, answerClar, askOffer, uploadFiles, openFile, selectRate, saveTrip, eventForm, saveEvent, doPublish, hideUpdate, doHide, advanceShipment, advanceTrip, editRequest, saveRequest,
    signContract, createTransport, showHistory,
    openTrans, setTStatus, addTrip, addEvent, publish, transDocs, addTransDoc, render: renderWF
  };
  // при смене роли просмотра — обновить данные на текущей странице
  ['switchRole', 'switchRoleTo'].forEach(function (fn) {
    const orig = window[fn];
    if (typeof orig !== 'function') return;
    window[fn] = function () {
      const r = orig.apply(this, arguments);
      CACHE.loadedAt = 0;
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
