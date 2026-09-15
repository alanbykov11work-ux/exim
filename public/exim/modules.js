/* ============================================================
   EXIM Super App — модули: Аналитика, Чаты, Задачи, Роли в профиле
   ============================================================ */
(function () {
  const S = () => window.__SUPA;
  const U = () => window.__EXIM || {};
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtT = n => '₸ ' + Math.round(Number(n || 0)).toLocaleString('ru-RU');
  const dt = s => s ? new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  // категориальная палитра — проверена валидатором (CVD-safe)
  const PAL = ['#E11D48', '#2563EB', '#B45309', '#0D9488'];
  const GRID = 'rgba(120,120,120,0.18)';
  const INK = 'var(--fg, #16181d)';
  const MUT = 'var(--muted, #767b86)';

  /* ============================================================
     ГРАФИКИ (SVG, без внешних библиотек)
     ============================================================ */
  function chartCard(title, svg, extra) {
    return `<div class="card an-card"><div class="an-title">${title}</div>${svg}${extra || ''}</div>`;
  }
  function barChart(items, opts) {
    // items: [{label, value, color?, hint?}]
    const W = 460, H = 220, padL = 8, padB = 26, padT = 18;
    const max = Math.max(1, ...items.map(i => i.value));
    const bw = Math.min(46, (W - padL * 2) / items.length - 8);
    const bars = items.map((it, i) => {
      const x = padL + i * ((W - padL * 2) / items.length) + ((W - padL * 2) / items.length - bw) / 2;
      const h = Math.round((H - padB - padT) * it.value / max);
      const y = H - padB - h;
      const c = it.color || PAL[0];
      const v = opts && opts.fmt ? opts.fmt(it.value) : it.value;
      return `<g><title>${esc(it.label)}: ${esc(v)}${it.hint ? ' · ' + esc(it.hint) : ''}</title>
        <rect x="${x}" y="${y}" width="${bw}" height="${Math.max(2, h)}" rx="4" fill="${c}"></rect>
        <text x="${x + bw / 2}" y="${y - 5}" text-anchor="middle" font-size="11" fill="${INK}">${esc(String(v))}</text>
        <text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="10.5" fill="${MUT}">${esc(it.label)}</text></g>`;
    }).join('');
    const grid = [0.25, 0.5, 0.75, 1].map(f =>
      `<line x1="${padL}" x2="${W - padL}" y1="${H - padB - (H - padB - padT) * f}" y2="${H - padB - (H - padB - padT) * f}" stroke="${GRID}" stroke-width="1"/>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;">${grid}${bars}</svg>`;
  }
  function lineChart(points, color) {
    // points: [{label, value}]
    const W = 460, H = 200, padL = 8, padB = 24, padT = 14;
    const max = Math.max(1, ...points.map(p => p.value));
    const step = (W - padL * 2) / Math.max(1, points.length - 1);
    const xy = points.map((p, i) => [padL + i * step, H - padB - (H - padB - padT) * p.value / max]);
    const path = xy.map((c, i) => (i ? 'L' : 'M') + c[0].toFixed(1) + ' ' + c[1].toFixed(1)).join(' ');
    const dots = points.map((p, i) => `<g><title>${esc(p.label)}: ${p.value}</title>
      <circle cx="${xy[i][0]}" cy="${xy[i][1]}" r="4" fill="${color || PAL[0]}" stroke="var(--card,#fff)" stroke-width="2"/>
      </g><text x="${xy[i][0]}" y="${H - 6}" text-anchor="middle" font-size="10" fill="${MUT}">${esc(p.label)}</text>`).join('');
    const last = points[points.length - 1];
    const lastLbl = last ? `<text x="${xy[xy.length - 1][0]}" y="${xy[xy.length - 1][1] - 9}" text-anchor="middle" font-size="11" font-weight="600" fill="${INK}">${last.value}</text>` : '';
    const grid = [0.33, 0.66, 1].map(f =>
      `<line x1="${padL}" x2="${W - padL}" y1="${H - padB - (H - padB - padT) * f}" y2="${H - padB - (H - padB - padT) * f}" stroke="${GRID}" stroke-width="1"/>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;">${grid}<path d="${path}" fill="none" stroke="${color || PAL[0]}" stroke-width="2" stroke-linecap="round"/>${dots}${lastLbl}</svg>`;
  }
  function donutChart(items) {
    // items: [{label, value}] — цвета в фиксированном порядке PAL
    const total = items.reduce((s, i) => s + i.value, 0) || 1;
    const R = 70, C = 2 * Math.PI * R;
    let acc = 0;
    const segs = items.map((it, i) => {
      const frac = it.value / total;
      const dash = Math.max(0, frac * C - 2); // 2px зазор между сегментами
      const seg = `<circle r="${R}" cx="100" cy="100" fill="none" stroke="${PAL[i % PAL.length]}"
        stroke-width="26" stroke-dasharray="${dash} ${C - dash}" stroke-dashoffset="${-acc * C}"
        transform="rotate(-90 100 100)"><title>${esc(it.label)}: ${it.value} (${Math.round(frac * 100)}%)</title></circle>`;
      acc += frac;
      return seg;
    }).join('');
    const legend = items.map((it, i) =>
      `<div class="an-leg"><span class="an-dot" style="background:${PAL[i % PAL.length]}"></span>${esc(it.label)} <b>${it.value}</b></div>`).join('');
    return `<div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap;">
      <svg viewBox="0 0 200 200" style="width:150px;height:150px;flex:none;">${segs}
        <text x="100" y="96" text-anchor="middle" font-size="26" font-weight="700" fill="${INK}">${total}</text>
        <text x="100" y="116" text-anchor="middle" font-size="10.5" fill="${MUT}">всего</text></svg>
      <div>${legend}</div></div>`;
  }
  function statTile(n, label, accent) {
    return `<div class="svc-kpi"><div class="mono svc-kpi-n" ${accent ? 'style="color:var(--accent);"' : ''}>${n}</div><div class="svc-kpi-l">${label}</div></div>`;
  }

  const OSTL = { new: 'Новые', assigned: 'На расчёте', calculated: 'Расчёт готов', offer_sent: 'У клиента', approved: 'Согласованы', rejected: 'Отклонены', contract_signed: 'Договор', converted: 'В перевозке', archived: 'Архив' };
  const TSTL = { preparing: 'Подготовка', loading: 'Загрузка', in_transit: 'В пути', customs: 'Таможня', delivering: 'Доставка', delivered: 'Доставлено' };

  function monthKey(d) { const x = new Date(d); return x.toLocaleDateString('ru-RU', { month: 'short' }); }
  function lastMonths(n) {
    const out = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({ key: d.toLocaleDateString('ru-RU', { month: 'short' }), m: d.getMonth(), y: d.getFullYear() });
    }
    return out;
  }

  async function renderAnalytics() {
    const box = document.getElementById('an-content');
    if (!box || !window.WF) return;
    box.innerHTML = '<div style="padding:40px;text-align:center;color:var(--muted);">Загрузка…</div>';
    let D;
    try { D = await WF.getData(); } catch (e) { box.innerHTML = '<div style="padding:30px;color:var(--muted);">Не удалось загрузить данные</div>'; return; }
    const role = WF.effRole();
    const os = D.orders, ts = D.transports;
    const months = lastMonths(6);
    const byMonth = (list, field) => months.map(m => ({
      label: m.key,
      value: list.filter(x => { const d = new Date(x[field || 'created_at']); return d.getMonth() === m.m && d.getFullYear() === m.y; }).length
    }));

    // статусы заявок → бар
    const stCounts = Object.keys(OSTL).map(k => ({ label: OSTL[k], value: os.filter(o => o.status === k).length })).filter(x => x.value > 0);
    // перевозки по статусам → донат (максимум 4 категории, остальное в «Прочее»)
    let trs = Object.keys(TSTL).map(k => ({ label: TSTL[k], value: ts.filter(t => t.status === k).length })).filter(x => x.value > 0);
    if (trs.length > 4) trs = trs.slice(0, 3).concat([{ label: 'Прочее', value: trs.slice(3).reduce((s, x) => s + x.value, 0) }]);

    let tiles = '', charts = '';
    if (role === 'manager') {
      const sent = os.filter(o => o.offer_sent_at);
      const appr = os.filter(o => ['approved', 'contract_signed', 'converted'].includes(o.status));
      const conv = sent.length ? Math.round(appr.length / sent.length * 100) : 0;
      const marginSum = sent.reduce((s, o) => s + Number((D.fin[o.id] || {}).margin || 0), 0);
      const priceSum = appr.reduce((s, o) => s + Number(o.total_price || 0), 0);
      tiles = statTile(os.length, 'заявок всего') + statTile(conv + '%', 'конверсия предложений', conv > 0)
        + statTile(fmtT(marginSum), 'маржа по отправленным', false) + statTile(fmtT(priceSum), 'сумма согласованных', false);
      const marginByMonth = months.map(m => ({
        label: m.key,
        value: sent.filter(o => { const d = new Date(o.offer_sent_at); return d.getMonth() === m.m && d.getFullYear() === m.y; })
          .reduce((s, o) => s + Number((D.fin[o.id] || {}).margin || 0), 0)
      }));
      charts =
        chartCard('Заявки по статусам', stCounts.length ? barChart(stCounts) : emptyCh()) +
        chartCard('Новые заявки по месяцам', lineChart(byMonth(os), PAL[1])) +
        chartCard('Маржа по месяцам, ₸', barChart(marginByMonth, { fmt: v => v ? Math.round(v / 1000) + 'к' : 0 })) +
        chartCard('Перевозки по статусам', trs.length ? donutChart(trs) : emptyCh());
    } else if (role === 'logist') {
      const my = os;
      const late = my.filter(o => o.status === 'assigned' && o.calc_deadline && new Date(o.calc_deadline) < new Date());
      tiles = statTile(my.filter(o => o.status === 'assigned').length, 'на расчёте сейчас')
        + statTile(late.length, 'просрочено', late.length > 0)
        + statTile(my.filter(o => o.calc_submitted_at).length, 'расчётов сдано')
        + statTile(ts.length, 'перевозок в работе');
      charts = chartCard('Мои заявки по статусам', stCounts.length ? barChart(stCounts) : emptyCh()) +
        chartCard('Назначения по месяцам', lineChart(byMonth(os), PAL[1]));
    } else {
      const appr = os.filter(o => ['approved', 'contract_signed', 'converted'].includes(o.status));
      tiles = statTile(os.length, 'заявок всего')
        + statTile(os.filter(o => o.status === 'offer_sent').length, 'ждут вашего решения', os.some(o => o.status === 'offer_sent'))
        + statTile(fmtT(appr.reduce((s, o) => s + Number(o.total_price || 0), 0)), 'сумма согласованных')
        + statTile(ts.filter(t => t.status === 'delivered').length, 'доставлено');
      charts = chartCard('Ваши заявки по месяцам', lineChart(byMonth(os))) +
        chartCard('Заявки по статусам', stCounts.length ? barChart(stCounts) : emptyCh()) +
        (trs.length ? chartCard('Перевозки по статусам', donutChart(trs)) : '');
    }
    box.innerHTML = `<div class="svc-kpis" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-bottom:20px;">${tiles}</div>
      <div class="an-grid">${charts}</div>`;
  }
  function emptyCh() { return '<div style="padding:36px 0;text-align:center;color:var(--muted);font-size:13.5px;">Пока нет данных</div>'; }

  /* ============================================================
     ЧАТЫ
     ============================================================ */
  const TRMAP = { 'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya','қ':'k','ғ':'g','ң':'n','ү':'u','ұ':'u','һ':'h','ө':'o','ә':'a','і':'i' };
  const slug = n => n.toLowerCase().split('').map(c => TRMAP[c] !== undefined ? TRMAP[c] : c).join('').replace(/[^a-z0-9.\-_]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'file';
  const IMG_EXT = /\.(png|jpe?g|gif|webp)$/i;
  const CHS = { list: [], active: null, sub: null, profiles: [] };
  const isStaffDb = () => ['manager', 'logist', 'admin'].includes(U().role);

  async function loadChats() {
    const s = S();
    const [chatsRes, profsRes] = await Promise.all([
      s.from('chats').select('*').order('created_at', { ascending: false }),
      CHS.profiles.length ? Promise.resolve({ data: CHS.profiles }) : s.from('profiles').select('id, full_name, email, role, company')
    ]);
    CHS.list = chatsRes.data || [];
    CHS.profiles = profsRes.data || [];
  }
  const pname = id => { const p = CHS.profiles.find(x => x.id === id); return p ? (p.full_name || p.email) : '…'; };

  async function renderChats() {
    const box = document.getElementById('ch-content');
    if (!box) return;
    box.innerHTML = '<div style="padding:40px;text-align:center;color:var(--muted);">Загрузка…</div>';
    try { await loadChats(); } catch (e) { box.innerHTML = '<div style="padding:30px;color:var(--muted);">Ошибка загрузки</div>'; return; }
    const items = CHS.list.map(c => `
      <div class="ch-item ${CHS.active === c.id ? 'active' : ''}" onclick="CH.open('${c.id}')">
        <div class="ch-ava">${c.is_group ? '⛬' : (esc((chatTitle(c) || '·')[0].toUpperCase()))}</div>
        <div style="min-width:0;">
          <div class="ch-name">${esc(chatTitle(c))}</div>
          <div class="ch-sub">${c.is_group ? 'Группа' : 'Личный чат'}</div>
        </div>
      </div>`).join('');
    box.innerHTML = `
      <div class="ch-wrap">
        <div class="ch-side">
          <button class="btn btn-primary" style="width:100%;margin-bottom:12px;" onclick="CH.newChat()">+ Новый чат</button>
          ${items || '<div style="color:var(--muted);font-size:13.5px;padding:8px;">Чатов пока нет — создайте первый</div>'}
        </div>
        <div class="ch-main" id="ch-main">
          <div class="ch-empty">Выберите чат слева или создайте новый</div>
        </div>
      </div>`;
    if (CHS.active) openChat(CHS.active);
  }
  function chatTitle(c) {
    if (c.name) return c.name;
    return 'Чат от ' + dt(c.created_at);
  }
  async function openChat(id) {
    CHS.active = id;
    document.querySelectorAll('.ch-item').forEach(el => el.classList.toggle('active', el.getAttribute('onclick').includes(id)));
    const main = document.getElementById('ch-main');
    if (!main) return;
    const c = CHS.list.find(x => x.id === id);
    const s = S();
    const [{ data: msgs }, { data: members }] = await Promise.all([
      s.from('chat_messages').select('*').eq('chat_id', id).order('created_at').limit(200),
      s.from('chat_members').select('user_id, last_read_at').eq('chat_id', id)
    ]);
    // до какого момента ВСЕ остальные участники прочитали чат
    const others = (members || []).filter(x => x.user_id !== U().id);
    CHS.othersReadUpTo = others.length
      ? Math.min(...others.map(x => new Date(x.last_read_at || 0).getTime()))
      : 0;
    const allNames = (members || []).map(m => pname(m.user_id));
    const mShort = allNames.length > 3
      ? allNames.slice(0, 3).join(', ') + ' и ещё ' + (allNames.length - 3)
      : allNames.join(', ');
    main.innerHTML = `
      <div class="ch-head"><div style="min-width:0;"><b>${esc(chatTitle(c))}</b>
        <div class="ch-sub" title="${esc(allNames.join(', '))}">${esc(allNames.length ? allNames.length + ' участн.: ' + mShort : '')}</div></div></div>
      <div class="ch-log" id="ch-log">${(msgs || []).map(msgHtml).join('') || '<div class="ch-empty">Сообщений пока нет</div>'}</div>
      <div class="ch-input">
        <button class="ch-attach-btn" title="Прикрепить файл" onclick="CH.attach()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg></button>
        <input class="form-input" id="ch-text" placeholder="Сообщение…" onkeydown="if(event.key==='Enter')CH.send()">
        <button class="btn btn-primary" onclick="CH.send()">→</button>
      </div>`;
    const log = document.getElementById('ch-log');
    if (log) log.scrollTop = log.scrollHeight;
    subscribeChat(id);
    try { await s.from('chat_members').update({ last_read_at: new Date().toISOString() }).eq('chat_id', id).eq('user_id', U().id); } catch (e) {}
    refreshBadges();
  }
  function msgHtml(m) {
    const mine = m.sender_id === U().id;
    let inner;
    if (m.file_path) {
      const isImg = IMG_EXT.test(m.file_name || m.file_path);
      const fid = 'att-' + Math.abs((m.file_path || '').split('').reduce((a, c) => a * 31 + c.charCodeAt(0) | 0, 7));
      inner = isImg
        ? `<div class="ch-bubble" style="padding:4px;"><div id="${fid}" class="ch-img" onclick="CH.openFile('${esc(m.file_path)}')" style="cursor:zoom-in;">🖼 ${esc(m.file_name || 'изображение')}</div></div>`
        : `<div class="ch-bubble ch-file" onclick="CH.openFile('${esc(m.file_path)}')">📎 ${esc(m.file_name || 'файл')}<span style="font-size:11px;opacity:.7;display:block;">нажмите, чтобы скачать</span></div>`;
      if (isImg) setTimeout(() => fillImg(fid, m.file_path), 30);
    } else {
      inner = `<div class="ch-bubble">${esc(m.text)}</div>`;
    }
    const read = mine && m.created_at && CHS.othersReadUpTo >= new Date(m.created_at).getTime();
    const ticks = mine ? `<span class="ch-ticks ${read ? 'read' : ''}" title="${read ? 'Прочитано' : 'Доставлено'}">${read ? '✓✓' : '✓'}</span>` : '';
    return `<div class="ch-msg ${mine ? 'mine' : ''}" data-ts="${m.created_at || ''}">
      ${mine ? '' : `<div class="ch-msg-author">${esc(pname(m.sender_id))}</div>`}
      ${inner}
      <div class="ch-time">${dt(m.created_at)} ${ticks}</div></div>`;
  }
  function updateTicks() {
    document.querySelectorAll('#ch-log .ch-msg.mine').forEach(el => {
      const ts = el.getAttribute('data-ts');
      const t = el.querySelector('.ch-ticks');
      if (!ts || !t) return;
      if (CHS.othersReadUpTo >= new Date(ts).getTime()) { t.textContent = '✓✓'; t.classList.add('read'); t.title = 'Прочитано'; }
    });
  }
  async function fillImg(elId, path) {
    try {
      const { data } = await S().storage.from('documents').createSignedUrl(path, 3600);
      const el = document.getElementById(elId);
      if (el && data && data.signedUrl) el.innerHTML = '<img src="' + data.signedUrl + '" style="max-width:260px;max-height:220px;border-radius:9px;display:block;">';
    } catch (e) {}
  }
  async function openFile(path) {
    try {
      const { data, error } = await S().storage.from('documents').createSignedUrl(path, 300);
      if (error || !data) throw error;
      window.open(data.signedUrl, '_blank');
    } catch (e) { showToast('danger', 'Ошибка', 'Не удалось открыть файл'); }
  }
  function attachFile() {
    if (!CHS.active) return;
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.onchange = async () => {
      if (!picker.files.length) return;
      const file = picker.files[0];
      if (file.size > 50 * 1024 * 1024) { showToast('warning', 'Файл слишком большой', 'Максимум 50 МБ'); return; }
      const path = 'chat/' + CHS.active + '/' + Date.now() + '_' + slug(file.name);
      const log = document.getElementById('ch-log');
      const tmpId = 'tmp-' + Date.now();
      if (log) {
        log.insertAdjacentHTML('beforeend', '<div class="ch-msg mine" id="' + tmpId + '" style="opacity:.6;"><div class="ch-bubble">📎 ' + esc(file.name) + '<span style="font-size:11px;display:block;">загрузка…</span></div></div>');
        log.scrollTop = log.scrollHeight;
      }
      try {
        const { error: upErr } = await S().storage.from('documents').upload(path, file);
        if (upErr) throw upErr;
        const { error: msgErr } = await S().from('chat_messages').insert({ chat_id: CHS.active, sender_id: U().id, text: '📎 ' + file.name, file_path: path, file_name: file.name });
        if (msgErr) throw msgErr;
        const el = document.getElementById(tmpId);
        if (el) el.remove();
        // показать нормальный пузырь
        if (log) { log.insertAdjacentHTML('beforeend', msgHtml({ sender_id: U().id, file_path: path, file_name: file.name, created_at: new Date().toISOString() })); log.scrollTop = log.scrollHeight; }
      } catch (e) {
        const el = document.getElementById(tmpId);
        if (el) { el.style.opacity = '1'; el.querySelector('.ch-bubble').innerHTML = '📎 ' + esc(file.name) + '<span style="font-size:11px;display:block;color:#fca5b1;">не загружен: ' + esc(e.message || '') + '</span>'; }
      }
    };
    picker.click();
  }
  function subscribeChat(id) {
    try {
      if (CHS.sub) S().removeChannel(CHS.sub);
      CHS.sub = S().channel('chat-' + id)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_members', filter: 'chat_id=eq.' + id }, payload => {
          if (payload.new.user_id === U().id) return;
          const t = new Date(payload.new.last_read_at || 0).getTime();
          if (t > (CHS.othersReadUpTo || 0)) {
            // пересчёт: минимум по всем остальным неизвестен точно, но одиночный собеседник — именно это значение
            CHS.othersReadUpTo = t;
            updateTicks();
          }
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: 'chat_id=eq.' + id }, payload => {
          if (payload.new.sender_id === U().id) return; // своё уже показано мгновенно
          const log = document.getElementById('ch-log');
          if (log && CHS.active === id) {
            const empty = log.querySelector('.ch-empty'); if (empty) empty.remove();
            log.insertAdjacentHTML('beforeend', msgHtml(payload.new));
            log.scrollTop = log.scrollHeight;
          }
        }).subscribe();
    } catch (e) {}
  }
  async function sendMsg() {
    const inp = document.getElementById('ch-text');
    const text = (inp && inp.value || '').trim();
    if (!text || !CHS.active) return;
    inp.value = '';
    // оптимистичная отправка: пузырь появляется мгновенно
    const log = document.getElementById('ch-log');
    const tmpId = 'tmp-' + Date.now();
    if (log) {
      const empty = log.querySelector('.ch-empty'); if (empty) empty.remove();
      log.insertAdjacentHTML('beforeend',
        '<div class="ch-msg mine" id="' + tmpId + '" style="opacity:.65;">' +
        '<div class="ch-bubble">' + esc(text) + '</div>' +
        '<div class="ch-time">отправка…</div></div>');
      log.scrollTop = log.scrollHeight;
    }
    const { error } = await S().from('chat_messages').insert({ chat_id: CHS.active, sender_id: U().id, text });
    const el = document.getElementById(tmpId);
    if (error) {
      if (el) { el.style.opacity = '1'; el.querySelector('.ch-time').textContent = 'не отправлено'; el.querySelector('.ch-bubble').style.background = 'rgba(225,29,72,.25)'; }
      showToast('danger', 'Не отправлено', error.message);
    } else if (el) {
      el.style.opacity = '1';
      el.querySelector('.ch-time').innerHTML = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) + ' <span class="ch-ticks" title="Доставлено">✓</span>'; el.setAttribute('data-ts', new Date().toISOString());
    }
  }
  function newChatModal() {
    // клиент видит только сотрудников; персонал — всех
    const others = CHS.profiles.filter(p => p.id !== U().id)
      .filter(p => isStaffDb() || ['manager', 'logist', 'admin'].includes(p.role));
    openModal('Новый чат', `
      <div class="form-group"><label class="form-label">Участники</label>
        <div style="max-height:220px;overflow:auto;border:1px solid var(--border);border-radius:10px;padding:8px;">
          ${others.map(p => `<label style="display:flex;gap:10px;align-items:center;padding:7px 6px;cursor:pointer;font-size:14px;">
            <input type="checkbox" class="ch-pick" value="${p.id}">
            <span>${esc(p.full_name || p.email)}</span>
            <span class="pill pill-info" style="margin-left:auto;">${{ client: 'Клиент', manager: 'Менеджер', logist: 'Логист', admin: 'Админ' }[p.role] || p.role}</span>
          </label>`).join('') || '<div style="color:var(--muted);">Нет доступных участников</div>'}
        </div></div>
      <div class="form-group"><label class="form-label">Название группы (если участников больше одного)</label>
        <input class="form-input" id="ch-gname" placeholder="Например: Перевозка TR-2381"></div>
      <button class="btn btn-primary btn-lg" style="width:100%;" onclick="CH.create()">Создать чат</button>`);
  }
  async function createChat() {
    const ids = [...document.querySelectorAll('.ch-pick:checked')].map(x => x.value);
    if (!ids.length) { showToast('warning', 'Выберите участников', ''); return; }
    const gname = (document.getElementById('ch-gname') || {}).value || '';
    const isGroup = ids.length > 1;
    const name = isGroup ? (gname || 'Группа') : (gname || pname(ids[0]));
    const s = S();
    const { data: chat, error } = await s.from('chats').insert({ name, is_group: isGroup, created_by: U().id }).select().single();
    if (error) { showToast('danger', 'Ошибка', error.message); return; }
    const rows = ids.concat([U().id]).map(uid => ({ chat_id: chat.id, user_id: uid, added_by: U().id }));
    const { error: e2 } = await s.from('chat_members').insert(rows);
    if (e2) { showToast('danger', 'Ошибка участников', e2.message); return; }
    closeModal(); CHS.active = chat.id; renderChats();
  }

  /* ============================================================
     ЗАДАЧИ (в духе Битрикс24)
     ============================================================ */
  const TSK = { list: [], filter: 'all', profiles: [], view: 'list' };
  const TS_ST = {
    new:         { l: 'Новая',        c: 'pill-warning' },
    in_progress: { l: 'В работе',     c: 'pill-info' },
    review:      { l: 'Ждёт контроля', c: 'pill-accent' },
    done:        { l: 'Завершена',    c: '' },
    deferred:    { l: 'Отложена',     c: '' }
  };
  const TS_PR = { low: 'Низкий', normal: 'Обычный', high: 'Высокий' };
  const tOver = t => t.deadline && new Date(t.deadline) < new Date() && !['done', 'deferred'].includes(t.status);

  async function loadTasksDb() {
    const s = S();
    const { data } = await s.from('tasks').select('*').order('created_at', { ascending: false });
    TSK.list = data || [];
    const { data: profs } = await s.from('profiles').select('id, full_name, email, role');
    TSK.profiles = profs || [];
  }
  const tname = id => { const p = TSK.profiles.find(x => x.id === id); return p ? (p.full_name || p.email) : '…'; };

  async function renderTasks() {
    const box = document.getElementById('ts-content');
    if (!box) return;
    box.innerHTML = '<div style="padding:40px;text-align:center;color:var(--muted);">Загрузка…</div>';
    try { await loadTasksDb(); } catch (e) { box.innerHTML = '<div style="padding:30px;color:var(--muted);">Ошибка загрузки</div>'; return; }
    let list = TSK.list;
    if (TSK.filter === 'my') list = list.filter(t => t.assignee_id === U().id);
    if (TSK.filter === 'set') list = list.filter(t => t.creator_id === U().id);
    if (TSK.filter === 'over') list = list.filter(tOver);
    const tabs = ['all|Все', 'my|Я исполнитель', 'set|Я поставил', 'over|Просроченные'].map(x => {
      const [k, l] = x.split('|');
      return `<button class="rd-tab ${TSK.filter === k ? 'active' : ''}" onclick="TS.filter('${k}')">${l}</button>`;
    }).join('');
    const rows = list.map(t => {
      const st = TS_ST[t.status] || TS_ST.new;
      return `<tr style="cursor:pointer;" onclick="TS.open('${t.id}')">
        <td style="max-width:280px;"><b>${esc(t.title)}</b>${t.priority === 'high' ? ' <span class="pill" style="background:rgba(225,29,72,.12);color:var(--accent);">Важная</span>' : ''}</td>
        <td>${esc(tname(t.assignee_id))}</td>
        <td>${esc(tname(t.creator_id))}</td>
        <td>${t.deadline ? `<span style="${tOver(t) ? 'color:var(--accent);font-weight:600;' : ''}">${dt(t.deadline)}</span>` : '—'}</td>
        <td><span class="pill ${st.c}">${st.l}</span>${tOver(t) ? ' <span class="pill" style="background:rgba(225,29,72,.12);color:var(--accent);">Просрочена</span>' : ''}</td>
      </tr>`;
    }).join('');
    const viewBtns = `<div class="rd-tabs" style="margin:0;display:inline-flex;">
      <button class="rd-tab ${TSK.view !== 'kanban' ? 'active' : ''}" onclick="TS.view('list')">Список</button>
      <button class="rd-tab ${TSK.view === 'kanban' ? 'active' : ''}" onclick="TS.view('kanban')">Канбан</button></div>`;
    let bodyHtml;
    if (TSK.view === 'kanban' && list.length) {
      const cols = Object.keys(TS_ST).map(k => {
        const items = list.filter(t => t.status === k);
        const cards = items.map(t => `<div class="kb-card" onclick="TS.open('${t.id}')">
          <div style="font-weight:600;font-size:13.5px;">${esc(t.title)}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:3px;">${esc(tname(t.assignee_id))}${t.deadline ? ' · <span style="' + (tOver(t) ? 'color:var(--accent);font-weight:600;' : '') + '">' + dt(t.deadline) + '</span>' : ''}</div>
        </div>`).join('');
        return `<div class="kb-col"><div class="kb-head">${TS_ST[k].l} <span class="kb-n">${items.length}</span></div>${cards || '<div class="kb-empty">—</div>'}</div>`;
      }).join('');
      bodyHtml = `<div class="kb-board">${cols}</div>`;
    } else {
      bodyHtml = list.length ? `<div class="card"><table class="table">
        <thead><tr><th>Задача</th><th>Исполнитель</th><th>Постановщик</th><th>Крайний срок</th><th>Статус</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`
        : '<div class="card" style="text-align:center;padding:44px;color:var(--muted);">Задач нет</div>';
    }
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;"><div class="rd-tabs" style="margin:0;">${tabs}</div>${viewBtns}</div>
        <button class="btn btn-primary" onclick="TS.newTask()">+ Поставить задачу</button>
      </div>${bodyHtml}`;
  }
  function newTaskModal() {
    const others = TSK.profiles;
    openModal('Новая задача', `
      <div class="form-group"><label class="form-label">Название</label>
        <input class="form-input" id="ts-title" placeholder="Подготовить КП по Урумчи — Алматы"></div>
      <div class="form-group"><label class="form-label">Описание</label>
        <textarea class="form-input" id="ts-desc" rows="3" placeholder="Что нужно сделать"></textarea></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="form-group"><label class="form-label">Исполнитель</label>
          <select class="form-input" id="ts-assignee">${others.map(p => `<option value="${p.id}" ${p.id === U().id ? 'selected' : ''}>${esc(p.full_name || p.email)}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Крайний срок</label>
          <input class="form-input" id="ts-deadline" type="datetime-local"></div>
      </div>
      <div class="form-group"><label class="form-label">Приоритет</label>
        <select class="form-input" id="ts-priority"><option value="normal">Обычный</option><option value="high">Высокий</option><option value="low">Низкий</option></select></div>
      <button class="btn btn-primary btn-lg" style="width:100%;" onclick="TS.create()">Поставить задачу</button>`);
  }
  async function createTask() {
    const v = id => (document.getElementById(id) || {}).value || '';
    if (!v('ts-title')) { showToast('warning', 'Название обязательно', ''); return; }
    const row = {
      title: v('ts-title'), description: v('ts-desc'), creator_id: U().id,
      assignee_id: v('ts-assignee') || U().id,
      deadline: v('ts-deadline') ? new Date(v('ts-deadline')).toISOString() : null,
      priority: v('ts-priority') || 'normal'
    };
    const { error } = await S().from('tasks').insert(row);
    if (error) { showToast('danger', 'Ошибка', error.message); return; }
    closeModal(); showToast('success', 'Задача поставлена', row.title); renderTasks();
  }
  async function openTask(id) {
    const t = TSK.list.find(x => x.id === id); if (!t) return;
    const { data: comments } = await S().from('task_comments').select('*').eq('task_id', id).order('created_at');
    const st = TS_ST[t.status] || TS_ST.new;
    const can = t.creator_id === U().id || t.assignee_id === U().id || ['manager', 'admin'].includes(U().role);
    const flow = {
      new: [['in_progress', 'Взять в работу'], ['deferred', 'Отложить']],
      in_progress: [['review', 'На проверку'], ['done', 'Завершить'], ['deferred', 'Отложить']],
      review: [['done', 'Принять и завершить'], ['in_progress', 'Вернуть в работу']],
      deferred: [['in_progress', 'Возобновить']],
      done: [['in_progress', 'Переоткрыть']]
    }[t.status] || [];
    openModal('Задача', `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px;">
        <div style="font-size:18px;font-weight:700;">${esc(t.title)}</div>
        <span class="pill ${st.c}" style="flex:none;">${st.l}</span></div>
      ${t.description ? `<div style="font-size:14px;margin-bottom:12px;white-space:pre-wrap;">${esc(t.description)}</div>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;font-size:13.5px;color:var(--muted);margin-bottom:14px;">
        <div>Исполнитель: <b style="color:var(--fg);">${esc(tname(t.assignee_id))}</b></div>
        <div>Постановщик: <b style="color:var(--fg);">${esc(tname(t.creator_id))}</b></div>
        <div>Срок: <b style="color:${tOver(t) ? 'var(--accent)' : 'var(--fg)'};">${t.deadline ? dt(t.deadline) : '—'}</b></div>
        <div>Приоритет: <b style="color:var(--fg);">${TS_PR[t.priority] || t.priority}</b></div>
      </div>
      ${can && flow.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">${flow.map(f =>
        `<button class="btn btn-secondary btn-sm" onclick="TS.setStatus('${t.id}','${f[0]}')">${f[1]}</button>`).join('')}</div>` : ''}
      <div style="font-weight:600;font-size:14px;margin-bottom:8px;">Комментарии</div>
      <div style="max-height:180px;overflow:auto;margin-bottom:10px;" id="ts-comments">
        ${(comments || []).map(c => `<div style="padding:8px 10px;background:var(--bg);border-radius:9px;margin-bottom:6px;">
          <div style="font-size:12px;color:var(--muted);">${esc(tname(c.author_id))} · ${dt(c.created_at)}</div>
          <div style="font-size:13.5px;">${esc(c.text)}</div></div>`).join('') || '<div style="color:var(--muted);font-size:13px;">Комментариев нет</div>'}
      </div>
      <div style="display:flex;gap:8px;">
        <input class="form-input" id="ts-comment" placeholder="Комментарий…" onkeydown="if(event.key==='Enter')TS.comment('${t.id}')">
        <button class="btn btn-secondary" onclick="TS.comment('${t.id}')">→</button>
      </div>`);
  }
  async function setTaskStatus(id, status) {
    const { error } = await S().from('tasks').update({ status }).eq('id', id);
    if (error) { showToast('danger', 'Ошибка', error.message); return; }
    showToast('success', 'Статус обновлён', TS_ST[status].l);
    await loadTasksDb(); openTask(id); renderTasks();
  }
  async function addTaskComment(id) {
    const inp = document.getElementById('ts-comment');
    const text = (inp && inp.value || '').trim();
    if (!text) return;
    inp.value = '';
    const box = document.getElementById('ts-comments');
    if (box) {
      box.insertAdjacentHTML('beforeend', '<div style="padding:8px 10px;background:var(--bg);border-radius:9px;margin-bottom:6px;opacity:.7;">' +
        '<div style="font-size:12px;color:var(--muted);">вы · сейчас</div><div style="font-size:13.5px;">' + esc(text) + '</div></div>');
      box.scrollTop = box.scrollHeight;
    }
    const { error } = await S().from('task_comments').insert({ task_id: id, author_id: U().id, text });
    if (error) { showToast('danger', 'Ошибка', error.message); return; }
  }

  /* ============================================================
     РОЛИ В ПРОФИЛЕ (для админов)
     ============================================================ */
  async function renderProfileRoles() {
    const box = document.getElementById('profile-admin-roles');
    if (!box || !window.WF) return;
    if (WF.dbRole() !== 'admin') { box.innerHTML = ''; return; }
    try { await WF.getData(); } catch (e) { return; }
    box.innerHTML = `<div class="card" style="margin-top:24px;">
      <h3 class="card-title" style="margin-bottom:6px;">Управление ролями</h3>
      <div style="font-size:13px;color:var(--muted);margin-bottom:12px;">Доступно администраторам. Смена роли применяется сразу.</div>
      ${WF.teamHtml()}</div>`;
    // teamHtml возвращает карточку — уберём двойную обёртку
    const inner = box.querySelector('.card .card');
    if (inner) { inner.style.boxShadow = 'none'; inner.style.border = 'none'; inner.style.padding = '0'; }
  }


  /* ============================================================
     ПЛАШКИ НЕПРОЧИТАННОГО В МЕНЮ
     ============================================================ */
  function setNavBadge(nav, count) {
    const link = document.querySelector('.app-nav a[data-nav="' + nav + '"]');
    if (!link) return;
    let b = link.querySelector('.nav-badge');
    if (!count) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('span'); b.className = 'nav-badge'; link.appendChild(b); }
    b.textContent = count > 99 ? '99+' : count;
  }
  async function refreshBadges() {
    const s = S(); if (!s) return;
    try {
      const { data: unread } = await s.rpc('unread_messages');
      setNavBadge('chats', Number(unread || 0));
    } catch (e) {}
    try {
      const { data: nt } = await s.from('tasks').select('id').eq('assignee_id', U().id).eq('status', 'new');
      setNavBadge('tasks', (nt || []).length);
    } catch (e) {}
  }
  function subscribeBadges() {
    try {
      S().channel('badges-global')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, payload => {
          if (payload.new.sender_id !== U().id) refreshBadges();
        }).subscribe();
    } catch (e) {}
    setInterval(refreshBadges, 45000);
    setTimeout(refreshBadges, 1500);
  }
  subscribeBadges();

  /* ============================================================
     ИНТЕГРАЦИЯ
     ============================================================ */
  window.AN = { render: renderAnalytics };
  window.CH = { render: renderChats, open: openChat, send: sendMsg, newChat: newChatModal, create: createChat, attach: attachFile, openFile };
  window.TS = { render: renderTasks, filter: f => { TSK.filter = f; renderTasks(); }, view: v => { TSK.view = v; renderTasks(); }, open: openTask, newTask: newTaskModal, create: createTask, setStatus: setTaskStatus, comment: addTaskComment };

  const _nav = window.navigate;
  window.navigate = function (page, event, id) {
    _nav(page, event, id);
    if (page === 'analytics') renderAnalytics();
    if (page === 'chats') renderChats();
    if (page === 'tasks') renderTasks();
    if (page === 'profile') renderProfileRoles();
  };
})();
