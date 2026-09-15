/* ============================================================
   EXIM CRM — лиды и воронка продаж (менеджеры/админы)
   ============================================================ */
(function () {
  const S = () => window.__SUPA;
  const U = () => window.__EXIM || {};
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtT = n => n == null || n === '' ? '—' : '₸ ' + Math.round(Number(n)).toLocaleString('ru-RU');
  const dt = s => s ? new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

  const STAGES = {
    new:         { l: 'Новый',        c: '#2563EB' },
    qualified:   { l: 'Квалификация', c: '#B45309' },
    proposal:    { l: 'КП отправлено', c: '#0D9488' },
    negotiation: { l: 'Переговоры',   c: '#E11D48' },
    won:         { l: 'Сделка',       c: '#15803D' },
    lost:        { l: 'Проигран',     c: '#767B86' }
  };
  const SOURCES = { site: 'Сайт', whatsapp: 'WhatsApp', call: 'Звонок', referral: 'Рекомендация', manual: 'Вручную', other: 'Другое' };

  const C = { list: [], view: 'kanban', loadedAt: 0 };
  const isStaff = () => ['manager', 'admin'].includes(U().role);

  async function load(force) {
    if (!force && Date.now() - C.loadedAt < 15000) return;
    const { data } = await S().from('leads').select('*').order('created_at', { ascending: false });
    C.list = data || [];
    C.loadedAt = Date.now();
  }
  function refLead() { return 'LD-' + Math.floor(1000 + Math.random() * 9000); }
  async function hist(id, action, snapshot) {
    try { await S().from('lead_history').insert({ lead_id: id, actor_id: U().id, action, snapshot: snapshot || {} }); } catch (e) {}
  }

  async function render() {
    const box = document.getElementById('crm-content');
    if (!box) return;
    if (!isStaff()) { box.innerHTML = '<div class="card" style="padding:40px;text-align:center;color:var(--muted);">CRM доступна менеджерам и администраторам</div>'; return; }
    if (!C.loadedAt) box.innerHTML = '<div style="padding:40px;text-align:center;color:var(--muted);">Загрузка…</div>';
    try { await load(); } catch (e) { box.innerHTML = '<div style="padding:30px;color:var(--muted);">Ошибка загрузки: ' + esc(e.message) + '</div>'; return; }

    const active = C.list.filter(l => !['won', 'lost'].includes(l.stage));
    const won = C.list.filter(l => l.stage === 'won');
    const pipeline = active.reduce((s, l) => s + Number(l.amount || 0), 0);
    const wonSum = won.reduce((s, l) => s + Number(l.amount || 0), 0);
    const conv = C.list.length ? Math.round(won.length / C.list.length * 100) : 0;

    const tiles = `<div class="svc-kpis wf-kpis" style="margin-bottom:20px;">
      <div class="svc-kpi"><div class="mono svc-kpi-n">${active.length}</div><div class="svc-kpi-l">лидов в работе</div></div>
      <div class="svc-kpi"><div class="mono svc-kpi-n">${fmtT(pipeline)}</div><div class="svc-kpi-l">сумма воронки</div></div>
      <div class="svc-kpi"><div class="mono svc-kpi-n" style="color:var(--accent);">${conv}%</div><div class="svc-kpi-l">конверсия в сделку</div></div>
      <div class="svc-kpi"><div class="mono svc-kpi-n">${fmtT(wonSum)}</div><div class="svc-kpi-l">сумма сделок</div></div>
    </div>`;

    const viewBtns = `<div class="rd-tabs" style="margin:0;display:inline-flex;">
      <button class="rd-tab ${C.view === 'kanban' ? 'active' : ''}" onclick="CRM.view('kanban')">Воронка</button>
      <button class="rd-tab ${C.view !== 'kanban' ? 'active' : ''}" onclick="CRM.view('list')">Список</button></div>`;
    const head = `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
      ${viewBtns}<button class="btn btn-primary" onclick="CRM.newLead()">+ Новый лид</button></div>`;

    let bodyHtml;
    if (C.view === 'kanban') {
      const cols = Object.keys(STAGES).map(k => {
        const items = C.list.filter(l => l.stage === k);
        const sum = items.reduce((s, l) => s + Number(l.amount || 0), 0);
        const cards = items.map(l => `
          <div class="kb-card" onclick="CRM.open('${l.id}')">
            <div class="mono" style="font-size:11.5px;color:var(--muted);">${esc(l.ref)} · ${SOURCES[l.source] || ''}</div>
            <div style="font-weight:600;font-size:13.5px;margin:3px 0;">${esc(l.company || l.name || '—')}</div>
            ${l.title ? `<div style="font-size:12px;color:var(--muted);">${esc(l.title)}</div>` : ''}
            ${l.amount ? `<div class="mono" style="font-size:12.5px;margin-top:4px;font-weight:600;">${fmtT(l.amount)}</div>` : ''}
          </div>`).join('');
        return `<div class="kb-col">
          <div class="kb-head" style="border-top:3px solid ${STAGES[k].c};border-radius:3px 3px 0 0;padding-top:8px;">
            ${STAGES[k].l} <span class="kb-n">${items.length}</span></div>
          ${sum ? `<div style="font-size:11px;color:var(--muted);padding:0 6px 8px;" class="mono">${fmtT(sum)}</div>` : ''}
          ${cards || '<div class="kb-empty">—</div>'}</div>`;
      }).join('');
      bodyHtml = `<div class="kb-board">${cols}</div>`;
    } else {
      const rows = C.list.map(l => `
        <tr style="cursor:pointer;" onclick="CRM.open('${l.id}')">
          <td class="mono">${esc(l.ref)}</td>
          <td><b>${esc(l.company || l.name || '—')}</b>${l.name && l.company ? '<div style="font-size:12px;color:var(--muted);">' + esc(l.name) + '</div>' : ''}</td>
          <td>${esc(l.title || '—')}</td>
          <td>${SOURCES[l.source] || '—'}</td>
          <td class="mono">${fmtT(l.amount)}</td>
          <td><span class="pill" style="background:${STAGES[l.stage].c}18;color:${STAGES[l.stage].c};">${STAGES[l.stage].l}</span></td>
          <td style="color:var(--muted);font-size:13px;">${dt(l.created_at)}</td>
        </tr>`).join('');
      bodyHtml = C.list.length ? `<div class="card"><table class="table">
        <thead><tr><th>№</th><th>Клиент</th><th>Запрос</th><th>Источник</th><th>Сумма</th><th>Стадия</th><th>Создан</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`
        : '<div class="card" style="text-align:center;padding:44px;color:var(--muted);">Лидов пока нет — добавьте первый</div>';
    }
    box.innerHTML = tiles + head + bodyHtml;
  }

  function newLead() {
    openModal('Новый лид', `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="form-group"><label class="form-label">Компания</label><input class="form-input" id="ld-company" placeholder="ТОО «Компания»"></div>
        <div class="form-group"><label class="form-label">Контактное лицо</label><input class="form-input" id="ld-name" placeholder="Имя"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="form-group"><label class="form-label">Телефон</label><input class="form-input" id="ld-phone" placeholder="+7 ___ ___ __ __"></div>
        <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="ld-email" placeholder="mail@company.kz"></div>
      </div>
      <div class="form-group"><label class="form-label">Суть запроса</label><input class="form-input" id="ld-title" placeholder="Урумчи → Алматы, оборудование 20 т"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="form-group"><label class="form-label">Источник</label>
          <select class="form-input" id="ld-source">${Object.keys(SOURCES).map(k => `<option value="${k}">${SOURCES[k]}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Потенциальная сумма, ₸</label><input class="form-input" id="ld-amount" type="number" placeholder="1500000"></div>
      </div>
      <button class="btn btn-primary btn-lg" style="width:100%;" onclick="CRM.create()">Добавить лид</button>`);
  }
  async function create() {
    const v = id => (document.getElementById(id) || {}).value || '';
    if (!v('ld-company') && !v('ld-name')) { showToast('warning', 'Заполните клиента', 'Укажите компанию или контактное лицо'); return; }
    const row = {
      ref: refLead(), company: v('ld-company'), name: v('ld-name'), phone: v('ld-phone'), email: v('ld-email'),
      title: v('ld-title'), source: v('ld-source') || 'manual',
      amount: v('ld-amount') ? Number(v('ld-amount')) : null,
      owner_id: U().id, created_by: U().id
    };
    const { data, error } = await S().from('leads').insert(row).select().single();
    if (error) { showToast('danger', 'Ошибка', error.message); return; }
    hist(data.id, 'created', row);
    C.loadedAt = 0; closeModal(); showToast('success', 'Лид добавлен', data.ref); render();
  }

  function openLead(id) {
    const l = C.list.find(x => x.id === id); if (!l) return;
    const st = STAGES[l.stage];
    const stageBtns = Object.keys(STAGES).map(k =>
      `<button class="rd-tab ${l.stage === k ? 'active' : ''}" onclick="CRM.setStage('${l.id}','${k}')">${STAGES[k].l}</button>`).join('');
    openModal('Лид ' + l.ref, `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px;">
        <div><div style="font-size:18px;font-weight:700;">${esc(l.company || l.name || '—')}</div>
        ${l.name && l.company ? `<div style="font-size:13.5px;color:var(--muted);">${esc(l.name)}</div>` : ''}</div>
        <span class="pill" style="background:${st.c}18;color:${st.c};flex:none;">${st.l}</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;font-size:13.5px;margin-bottom:12px;">
        <div><span style="color:var(--muted);">Телефон:</span> ${l.phone ? `<a href="tel:${esc(l.phone)}" style="color:var(--fg);font-weight:600;">${esc(l.phone)}</a>` : '—'}</div>
        <div><span style="color:var(--muted);">Email:</span> ${esc(l.email || '—')}</div>
        <div><span style="color:var(--muted);">Источник:</span> ${SOURCES[l.source] || '—'}</div>
        <div><span style="color:var(--muted);">Сумма:</span> <b>${fmtT(l.amount)}</b></div>
      </div>
      ${l.title ? `<div style="font-size:14px;padding:10px 12px;background:var(--bg);border-radius:10px;margin-bottom:12px;">${esc(l.title)}</div>` : ''}
      <div style="font-size:13px;font-weight:600;margin-bottom:6px;">Стадия</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">${stageBtns}</div>
      <div class="form-group"><label class="form-label">Заметка</label>
        <textarea class="form-input" id="ld-note" rows="2">${esc(l.note || '')}</textarea>
        <div class="form-hint"><a href="#" onclick="CRM.saveNote('${l.id}');return false;">Сохранить заметку</a></div></div>
      <div style="display:flex;gap:10px;">
        ${l.phone ? `<button class="btn btn-secondary" style="flex:1;background:#25D366;color:#fff;border:none;" onclick="openWhatsApp('Здравствуйте${l.name ? ', ' + esc(l.name) : ''}! Это EXIM KZ по вашему запросу${l.title ? ': ' + esc(l.title) : ''}')">WhatsApp</button>` : ''}
        ${l.order_id ? `<button class="btn btn-secondary" style="flex:1;" onclick="closeModal();navigate('workflow')">Открыть заявку</button>`
          : `<button class="btn btn-primary" style="flex:1;" onclick="CRM.convert('${l.id}')">Создать заявку на расчёт</button>`}
      </div>`);
  }
  async function setStage(id, stage) {
    let lost_reason = '';
    if (stage === 'lost') { lost_reason = prompt('Причина проигрыша (необязательно):') || ''; }
    const { error } = await S().from('leads').update({ stage, lost_reason, stage_changed_at: new Date().toISOString() }).eq('id', id);
    if (error) { showToast('danger', 'Ошибка', error.message); return; }
    hist(id, 'stage:' + stage, { lost_reason });
    C.loadedAt = 0; await load(true); openLead(id); render();
  }
  async function saveNote(id) {
    const note = (document.getElementById('ld-note') || {}).value || '';
    const { error } = await S().from('leads').update({ note }).eq('id', id);
    if (error) { showToast('danger', 'Ошибка', error.message); return; }
    C.loadedAt = 0; showToast('success', 'Заметка сохранена', '');
  }
  async function convert(id) {
    const l = C.list.find(x => x.id === id); if (!l) return;
    // создаём заявку на расчёт из лида; клиентом выступает менеджер (пока клиент не зарегистрирован)
    const [origin, destination] = (l.title || '').includes('→')
      ? l.title.split('→').map(s => s.trim().split(',')[0])
      : ['', ''];
    const row = {
      ref: 'ZK-' + Math.floor(1000 + Math.random() * 9000),
      client_id: U().id, created_by: U().id,
      origin: origin || 'Уточнить', destination: destination || 'Уточнить',
      cargo: l.title || '', comment: 'Из лида ' + l.ref + ' · ' + (l.company || l.name || '')
    };
    const { data, error } = await S().from('orders').insert(row).select().single();
    if (error) { showToast('danger', 'Ошибка', error.message); return; }
    await S().from('leads').update({ order_id: data.id, stage: 'won', stage_changed_at: new Date().toISOString() }).eq('id', id);
    hist(id, 'converted', { order: data.ref });
    C.loadedAt = 0; closeModal();
    showToast('success', 'Заявка создана', data.ref + ' — назначьте логиста в разделе «Заявки»');
    render();
  }

  window.CRM = { render, view: v => { C.view = v; render(); }, newLead, create, open: openLead, setStage, saveNote, convert };
  const _nav = window.navigate;
  window.navigate = function (page, event, id) {
    _nav(page, event, id);
    if (page === 'crm') render();
  };
})();
