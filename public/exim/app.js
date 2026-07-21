    // ===== State Management =====
    const APP_STATE = {
      currentPage: 'dashboard',
      currentRole: 'client',
      currentStep: 1,
      selectedShipmentId: null,
      selectedServiceId: null,
      history: [],
      shipments: [],
      containers: [],
      requests: []
    };

    const STATUSES = [
      { idx: 0, key: 'pending', label: 'Подготовка документов', addr: 'Офис EXIM, Алматы', lat: 23.1291, lng: 113.2644, mx: 1080, my: 585, city: 'Гуанчжоу' },
      { idx: 1, key: 'loading', label: 'Загрузка в порту', addr: 'Порт Шэньчжэнь', lat: 22.5431, lng: 114.0579, mx: 1010, my: 545, city: 'Шэньчжэнь' },
      { idx: 2, key: 'transit', label: 'В пути', addr: 'Сианьский хаб', lat: 34.3416, lng: 108.9398, mx: 815, my: 315, city: 'Сиань' },
      { idx: 3, key: 'customs', label: 'На таможне', addr: 'СВХ Хоргос, КПП', lat: 44.2110, lng: 80.4160, mx: 360, my: 150, city: 'Хоргос' },
      { idx: 4, key: 'customs-cleared', label: 'Таможня пройдена', addr: 'Алматы-1 станция', lat: 43.3383, lng: 76.9430, mx: 215, my: 135, city: 'Алматы-1' },
      { idx: 5, key: 'delivered', label: 'Доставлено', addr: 'ул. Тлендиева, 92', lat: 43.2500, lng: 76.8700, mx: 165, my: 175, city: 'Алматы' }
    ];

    const CITY_GEO = {
      'алматы':   { lat: 43.2389, lng: 76.8897 },
      'астана':   { lat: 51.1605, lng: 71.4704 },
      'шымкент':  { lat: 42.3417, lng: 69.5901 },
      'караганда':{ lat: 49.8047, lng: 73.1094 },
      'актобе':   { lat: 50.2839, lng: 57.1670 },
      'атырау':   { lat: 47.0945, lng: 51.9238 },
      'актау':    { lat: 43.6410, lng: 51.1985 },
      'уральск':  { lat: 51.2333, lng: 51.3667 },
      'тараз':    { lat: 42.9000, lng: 71.3667 },
      'павлодар': { lat: 52.2871, lng: 76.9674 },
      'гуанчжоу': { lat: 23.1291, lng: 113.2644 },
      'шэньчжэнь':{ lat: 22.5431, lng: 114.0579 },
      'пекин':    { lat: 39.9042, lng: 116.4074 },
      'шанхай':   { lat: 31.2304, lng: 121.4737 },
      'иу':       { lat: 29.3068, lng: 120.0750 },
      'урумчи':   { lat: 43.8256, lng: 87.6168 },
      'сиань':    { lat: 34.3416, lng: 108.9398 },
      'хоргос':   { lat: 44.2110, lng: 80.4160 },
      'достык':   { lat: 45.2500, lng: 82.4833 },
      'москва':   { lat: 55.7558, lng: 37.6173 },
      'казань':   { lat: 55.7963, lng: 49.1088 },
      'омск':     { lat: 54.9885, lng: 73.3242 },
      'ташкент':  { lat: 41.2995, lng: 69.2401 },
      'бишкек':   { lat: 42.8746, lng: 74.5698 },
      'стамбул':  { lat: 41.0082, lng: 28.9784 },
      'тбилиси':  { lat: 41.7151, lng: 44.8271 },
      'урал':     { lat: 51.2333, lng: 51.3667 }
    };
    function cityGeo(name) {
      if (!name) return null;
      const k = String(name).toLowerCase().trim();
      for (const key in CITY_GEO) { if (k.includes(key)) return CITY_GEO[key]; }
      return null;
    }
    // Маршрут заявки: реальные города вместо шаблонного примера
    function shipmentRoute(ship) {
      if (ship && ship.route && ship.route.length) return ship.route;
      const o = cityGeo(ship && ship.origin), d = cityGeo(ship && ship.destination);
      if (!o || !d) return STATUSES; // не знаем координат — показываем типовой маршрут
      const oName = ship.origin, dName = ship.destination;
      // промежуточная точка: Хоргос для Китая, иначе середина пути
      const viaChina = /гуанчжоу|шэньчжэнь|пекин|шанхай|иу|урумчи|сиань|китай/i.test(oName + ' ' + dName);
      const via = viaChina ? { lat: 44.2110, lng: 80.4160, city: 'Хоргос' }
                           : { lat: (o.lat + d.lat) / 2, lng: (o.lng + d.lng) / 2, city: 'В пути' };
      return [
        { idx: 0, key: 'pending',  label: 'Подготовка документов', addr: 'Отправление: ' + oName, lat: o.lat, lng: o.lng, city: oName },
        { idx: 1, key: 'loading',  label: 'Загрузка',              addr: oName,                    lat: o.lat, lng: o.lng, city: oName },
        { idx: 2, key: 'transit',  label: 'В пути',                addr: via.city,                 lat: via.lat, lng: via.lng, city: via.city },
        { idx: 3, key: 'customs',  label: viaChina ? 'На таможне (Хоргос)' : 'Транзитный пункт', addr: via.city, lat: via.lat, lng: via.lng, city: via.city },
        { idx: 4, key: 'customs-cleared', label: 'Прибытие в город назначения', addr: dName,      lat: d.lat, lng: d.lng, city: dName },
        { idx: 5, key: 'delivered', label: 'Доставлено',           addr: 'Доставка: ' + dName,     lat: d.lat, lng: d.lng, city: dName }
      ];
    }

    // ===== Navigation =====
    function navigate(page, event, id = null) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }

      // Push to history
      if (APP_STATE.currentPage !== page) {
        APP_STATE.history.push(APP_STATE.currentPage);
      }

      APP_STATE.currentPage = page;
      if (id) {
        if (page === 'shipment-detail') APP_STATE.selectedShipmentId = id;
        if (page === 'tracking') APP_STATE.trackingId = id;
        if (page === 'service-detail') APP_STATE.selectedServiceId = id;
        if (page === 'container-detail') APP_STATE.selectedContainerId = id;
      }

      // Hide all pages
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

      // Show current page
      const pageEl = document.getElementById('page-' + page);
      if (pageEl) {
        pageEl.classList.add('active');

        // Update nav
        document.querySelectorAll('.app-nav a').forEach(a => a.classList.remove('active'));
        const navItem = document.querySelector(`[data-nav="${page}"]`);
        if (navItem) navItem.classList.add('active');

        // Populate content if needed
        if (page === 'dashboard') { renderDashboardShipments(); renderRdStatus(); }
        if (page === 'shipments') renderShipmentsList();
        if (page === 'shipment-detail') { renderShipmentDetail(id); renderShipmentDocs(id); }
        if (page === 'tracking') renderTracking();
        if (page === 'service-detail') renderServiceDetail(id);
        if (page === 'margin') renderMargin();
        if (page === 'containers') renderContainers();
        if (page === 'container-detail') renderContainerDetail(id);
        if (page === 'inbox') renderInbox();
        if (page === 'notifications') renderNotifications();
        if (page === 'profile') loadProfile();

        // Scroll to top
        window.scrollTo(0, 0);
      }
    }

    function goBack() {
      if (APP_STATE.history.length > 0) {
        const prev = APP_STATE.history.pop();
        navigate(prev, null, null);
      } else {
        navigate('dashboard');
      }
    }

    function switchRole(role, event) {
      const own = (window.__EXIM && window.__EXIM.role) || 'client';
      if (own === 'client' && role !== 'client') { showToast('warning', 'Недостаточно прав', 'Смена роли доступна только сотрудникам EXIM'); return; }
      APP_STATE.currentRole = role;
      document.body.setAttribute('data-role', role);

      // Update role switcher
      document.querySelectorAll('.role-switcher button').forEach(btn => {
        btn.classList.remove('active');
      });
      if (event && event.currentTarget) event.currentTarget.classList.add('active');

      // Navigate to appropriate page
      if (role === 'manager' || role === 'logist') {
        navigate('margin');
      } else {
        navigate('dashboard');
      }

      showToast('success', 'Роль изменена', `Вы переключились на роль: ${role === 'client' ? 'Клиент' : role === 'manager' ? 'Менеджер' : 'Логист'}`);
    }

    function logout() {
      if (confirm('Вы уверены, что хотите выйти?')) {
        if (window.__EXIM_LOGOUT) window.__EXIM_LOGOUT();
      }
    }

    // ===== Toast Notifications =====
    function showToast(type, title, message) {
      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;

      const icons = {
        success: '✓',
        warning: '⚠',
        danger: '✕',
        info: 'ℹ'
      };

      toast.innerHTML = `
        <div class="toast-icon">${icons[type] || 'ℹ'}</div>
        <div class="toast-content">
          <div class="toast-title">${title}</div>
          <div class="toast-message">${message}</div>
        </div>
      `;

      document.getElementById('toast-container').appendChild(toast);

      setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }

    // ===== Modal =====
    function openModal(title, content) {
      document.getElementById('modal-title').textContent = title;
      document.getElementById('modal-body').innerHTML = content;
      document.getElementById('modal').classList.add('active');
    }

    function closeModal() {
      document.getElementById('modal').classList.remove('active');
    }

    // ===== Render Functions =====
    const RD_STATUS = {
      delivered: { cls: 'rd-s-done', label: 'Доставлено' },
      transit:   { cls: 'rd-s-transit', label: 'В пути' },
      customs:   { cls: 'rd-s-customs', label: 'На таможне' },
      loading:   { cls: 'rd-s-loading', label: 'Загрузка' },
      pending:   { cls: 'rd-s-prep', label: 'Подготовка' }
    };

    function renderRdStatus() {
      const all = APP_STATE.shipments || [];
      const active = all.filter(s => s.status !== 'delivered');
      const line = document.getElementById('rd-status-line');
      if (line) {
        if (!all.length) line.innerHTML = 'Начните первую <span style="color: var(--accent);">перевозку</span>';
        else if (!active.length) line.innerHTML = 'Все грузы <span style="color: var(--accent);">доставлены</span>';
        else line.innerHTML = 'У вас <span style="color: var(--accent);" class="mono">' + active.length + '</span> ' + (active.length === 1 ? 'активный груз' : (active.length < 5 ? 'активных груза' : 'активных грузов')) + ',<br>задержек нет';
      }
      const box = document.getElementById('rd-slots');
      if (box) {
        if (!active.length) {
          box.innerHTML = '<div style="padding:14px 4px;color:var(--muted);font-size:13.5px;">Событий на сегодня нет</div>';
        } else {
          const times = ['10:00', '12:00', '14:00', '16:00'];
          box.innerHTML = active.slice(0, 4).map((s, i) => {
            const st = STATUSES.find(x => x.key === s.status) || STATUSES[0];
            const cls = s.status === 'customs' ? ' amber' : (s.status === 'pending' ? ' blue' : '');
            return '<div class="rd-slot"><span class="rd-slot-time">' + times[i] + '</span><span class="rd-slot-chip' + cls + '">' + st.label + ' · ' + s.id + '</span></div>';
          }).join('');
        }
      }
    }

    function rdWeek(dir) {
      APP_STATE.weekOffset = (APP_STATE.weekOffset || 0) + dir;
      renderDashboardShipments();
    }

    function rdFilter(f, event) {
      if (event && event.currentTarget) {
        event.currentTarget.parentElement.querySelectorAll('.rd-tab').forEach(t => t.classList.remove('active'));
        event.currentTarget.classList.add('active');
      }
      APP_STATE.dashFilter = f;
      renderDashboardShipments();
    }

    function renderDashboardShipments() {
      const all = APP_STATE.shipments;
      const f = APP_STATE.dashFilter || 'all';
      const list = all.filter(x => f === 'all' ? true : x.status === f);

      // KPI strip
      const setT = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      setT('kpi-active', all.filter(x => x.status !== 'delivered').length);
      setT('kpi-transit', all.filter(x => x.status === 'transit').length);
      const totalValue = all.filter(x => x.status !== 'delivered').reduce((s, x) => s + (x.price || 0), 0);
      setT('kpi-value', fmtKZT(totalValue));
      setT('kpi-term', all.length ? '≈ 32 дн' : '—');

      // Week strip
      const week = document.getElementById('rd-week');
      const monthEl = document.getElementById('rd-month');
      if (week) {
        const now = new Date();
        now.setDate(now.getDate() + (APP_STATE.weekOffset || 0) * 7);
        monthEl.textContent = now.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
        const dn = ['Пн','Вт','Ср','Чт','Пт'];
        const monday = new Date(now);
        monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
        week.innerHTML = dn.map((d, i) => {
          const day = new Date(monday); day.setDate(monday.getDate() + i);
          const isToday = day.toDateString() === now.toDateString();
          return `<div class="rd-day ${isToday ? 'active' : ''}"><div class="dn">${d}</div><div class="dd">${day.getDate()}</div></div>`;
        }).join('');
      }

      // Feature cards (hero + 2 mini) from active shipments
      const active = all.filter(x => x.status !== 'delivered');
      const feat = active.length ? active : all;
      const hero = feat[0], m1 = feat[1], m2 = feat[2];
      const st = s => RD_STATUS[s.status] || RD_STATUS.pending;

      if (!hero) {
        document.getElementById('rd-feature').innerHTML = `
        <div class="rd-hero" style="grid-column: 1 / -1;">
          <div style="z-index:1;">
            <span class="rd-pill" style="background:rgba(255,255,255,0.2);">Добро пожаловать</span>
            <div style="font-size:22px;font-weight:700;margin-top:14px;line-height:1.25;letter-spacing:-0.02em;">Оформите первую перевозку</div>
            <div style="font-size:13px;opacity:0.9;margin-top:6px;">Расчёт стоимости займёт 2 минуты</div>
          </div>
          <button class="rd-hero-btn" onclick="navigate('shipment-new', event)">Оставить заявку</button>
        </div>`;
        document.getElementById('rd-table').innerHTML = `<div style="padding:24px 8px;color:var(--muted);text-align:center;">Заявок пока нет — оформите первую</div>`;
        return;
      }

      const bars = (color) => Array.from({length: 16}, (_, i) => {
        const h = 20 + Math.round(Math.abs(Math.sin(i * 0.9)) * 46);
        return `<span style="flex:1;align-self:flex-end;height:${h}%;background:${color};border-radius:3px;"></span>`;
      }).join('');

      document.getElementById('rd-feature').innerHTML = `
        <div class="rd-hero">
          <div style="z-index:1;">
            <span class="rd-pill" style="background:rgba(255,255,255,0.2);">${st(hero).label}</span>
            <div style="font-size:22px;font-weight:700;margin-top:14px;line-height:1.25;letter-spacing:-0.02em;">${hero.origin}<br>→ ${hero.destination}</div>
            <div class="mono" style="font-size:13px;opacity:0.9;margin-top:6px;">${hero.id} · ${hero.cargo}</div>
          </div>
          <button class="rd-hero-btn" onclick="navigate('shipment-detail', event, '${hero.id}')">Отследить груз</button>
        </div>
        ${[m1, m2].filter(Boolean).map((m, mi) => `
          <div class="rd-mini" onclick="navigate('shipment-detail', event, '${m.id}')">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <div class="mono" style="font-size:12px;color:var(--muted);font-weight:600;">${m.id}</div>
              <div class="mono" style="font-size:22px;font-weight:700;color:rgba(15,23,42,0.10);line-height:1;">0${mi + 2}</div>
            </div>
            <div style="font-size:16px;font-weight:700;line-height:1.3;margin-top:6px;letter-spacing:-0.02em;">${m.origin} → ${m.destination}</div>
            <div style="margin-top:8px;"><span class="rd-pill ${st(m).cls}">${st(m).label}</span></div>
            <div class="rd-mini-chart ${m.status === 'customs' ? 'dark' : ''}">
              <div style="position:absolute;inset:12px;display:flex;gap:3px;align-items:flex-end;">
                ${bars(m.status === 'customs' ? '#F97316' : 'rgba(225,29,72,0.55)')}
              </div>
            </div>
          </div>
        `).join('')}
      `;

      // Table
      document.getElementById('rd-table').innerHTML = list.map(s => `
        <div class="rd-trow" style="cursor:pointer;" onclick="navigate('shipment-detail', event, '${s.id}')">
          <span style="display:flex;align-items:center;gap:10px;"><span class="rd-avatar">${s.client.replace(/[«»"]/g,'').trim().slice(0,2).toUpperCase()}</span><span class="mono" style="font-weight:600;">${s.id}</span></span>
          <span style="color:var(--muted);">${s.origin} → ${s.destination}</span>
          <span><span class="rd-pill ${st(s).cls}">${st(s).label}</span></span>
          <span style="color:var(--muted);">${s.cargo}</span>
        </div>
      `).join('') || `<div style="padding:24px 8px;color:var(--muted);text-align:center;">Нет заявок с этим фильтром</div>`;
    }

    function renderShipmentsList() {
      const container = document.getElementById('shipments-list');
      const f = APP_STATE.shipmentFilter || 'all';
      const list = APP_STATE.shipments.filter(ship => {
        if (f === 'all') return true;
        if (f === 'active') return ship.status !== 'delivered';
        if (f === 'customs') return ship.status === 'customs';
        if (f === 'delivered') return ship.status === 'delivered';
        return true;
      });

      if (list.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>
            <h2 class="empty-title">Ничего не найдено</h2>
            <p class="empty-message">Нет перевозок с выбранным фильтром</p>
          </div>`;
        return;
      }

      container.innerHTML = list.map(ship => `
        <div class="shipment-item" onclick="navigate('shipment-detail', event, '${ship.id}')">
          <div class="shipment-header">
            <div>
              <div class="shipment-id mono">${ship.id}</div>
              <div class="shipment-route">${ship.origin} → ${ship.destination}</div>
            </div>
            <span class="pill pill-${ship.status === 'customs' ? 'warning' : ship.status === 'transit' ? 'info' : ship.status === 'delivered' ? 'accent' : 'accent'}">
              ${ship.statusLabel}
            </span>
          </div>
          <div style="margin-top: 12px;">
            <div style="display: flex; justify-content: space-between; font-size: 13px; color: var(--muted); margin-bottom: 8px;">
              <span>Прогресс</span>
              <span class="mono">${ship.progress}%</span>
            </div>
            <div style="height: 6px; background: var(--border); border-radius: 999px; overflow: hidden;">
              <div style="height: 100%; background: ${ship.status === 'delivered' ? 'var(--accent)' : 'var(--accent)'}; width: ${ship.progress}%; transition: width 0.3s;"></div>
            </div>
          </div>
          <div class="shipment-meta">
            <span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ${ship.created}</span>
            <span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg> ${ship.container}</span>
            <span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M12 3v18"/><path d="M5 7h14"/><path d="M5 7l-3 6a3.5 3.5 0 0 0 6 0zM19 7l-3 6a3.5 3.5 0 0 0 6 0z"/></svg> ${ship.weight}</span>
            <span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><line x1="12" y1="6" x2="12" y2="18"/></svg> ${fmtKZT(ship.price)}</span>
          </div>
        </div>
      `).join('');
    }

    function renderShipmentDetail(id) {
      const ship = APP_STATE.shipments.find(s => s.id === id);
      if (!ship) return;

      const container = document.getElementById('shipment-detail-content');

      const roleGated = APP_STATE.currentRole !== 'client';

      container.innerHTML = `
        <div class="card" style="border-left: 3px solid var(--accent); margin-bottom: 24px;">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 20px;">
            <div>
              <h1 style="font-size: 28px; font-weight: 700; margin-bottom: 8px; letter-spacing: -0.02em;" class="mono">${ship.id}</h1>
              <div style="font-size: 16px; color: var(--muted);">${ship.origin} → ${ship.destination}</div>
            </div>
            <span class="pill pill-${ship.status === 'customs' ? 'warning' : ship.status === 'transit' ? 'info' : ship.status === 'delivered' ? 'accent' : 'accent'}" style="font-size: 14px; padding: 8px 16px;">
              ${ship.statusLabel}
            </span>
          </div>

          <div class="grid grid-3">
            <div>
              <div style="font-size: 13px; color: var(--muted); margin-bottom: 4px;">Контейнер</div>
              <div style="font-weight: 600;">${ship.container}</div>
            </div>
            <div>
              <div style="font-size: 13px; color: var(--muted); margin-bottom: 4px;">Груз</div>
              <div style="font-weight: 600;">${ship.cargo}</div>
            </div>
            <div>
              <div style="font-size: 13px; color: var(--muted); margin-bottom: 4px;">Вес</div>
              <div style="font-weight: 600;">${ship.weight}</div>
            </div>
          </div>

          <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border);">
            <button class="btn btn-primary btn-sm" onclick="navigate('tracking')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> Отследить на карте</button>
            <button class="btn btn-secondary btn-sm" onclick="downloadInvoice('${ship.id}')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> Инвойс</button>
            ${!ship.paid ? `<button class="btn btn-secondary btn-sm" onclick="payInvoice('${ship.id}')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> Оплатить</button>` : ''}
            <button class="btn btn-ghost btn-sm" onclick="shareShipment('${ship.id}')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> Поделиться</button>
          </div>
        </div>

        <div class="grid grid-2">
          <div>
          <div class="card">
            <h3 class="card-title" style="margin-bottom: 20px;">Хронология</h3>
            <div class="timeline">
              ${shipmentRoute(ship).map((st, idx) => `
                <div class="timeline-item ${idx < ship.statusIdx ? 'done' : idx === ship.statusIdx ? 'current' : ''}">
                  <div class="timeline-dot"></div>
                  <div class="timeline-title">${st.label}</div>
                  <div class="timeline-subtitle">${st.addr}</div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="card" style="margin-top: 24px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
              <h3 class="card-title" style="margin-bottom:0;">Документы</h3>
              <button class="btn btn-secondary btn-sm" onclick="addShipmentDoc('${ship.id}')">+ Прикрепить</button>
            </div>
            <div id="ship-docs-${ship.id}" style="display: flex; flex-direction: column; gap: 8px;">
              <div style="color:var(--muted);font-size:13.5px;padding:6px 2px;">Загрузка…</div>
            </div>
          </div>
          </div>

          <div>
            <div class="card" style="margin-bottom: 24px;">
              <h3 class="card-title" style="margin-bottom: 20px;">Стоимость</h3>
              <div style="display: flex; flex-direction: column; gap: 12px;">
                ${roleGated ? `
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--muted);">Себестоимость</span>
                    <strong>${fmtKZT(ship.cost)}</strong>
                  </div>
                ` : ''}
                <div style="display: flex; justify-content: space-between; padding-top: 12px; border-top: 1px solid var(--border); font-size: 18px;">
                  <span>Цена клиенту</span>
                  <strong style="color: var(--accent);">${fmtKZT(ship.price)}</strong>
                </div>
                ${roleGated ? `
                  <div style="padding: 12px; background: rgba(21, 128, 61, 0.08); border-radius: var(--radius); border: 1px dashed var(--success);">
                    <div style="display: flex; justify-content: space-between; font-weight: 600; color: var(--success);">
                      <span>МАРЖА на этой заявке</span>
                      <span>${fmtKZT(ship.margin)} · ${Math.round(ship.margin / ship.price * 100)}%</span>
                    </div>
                  </div>
                  <div style="margin-top: 12px; padding: 12px; background: var(--bg); border-radius: var(--radius);">
                    <div style="font-weight: 600; margin-bottom: 4px;">Статус оплаты</div>
                    <span class="pill ${ship.paid ? 'pill-success' : 'pill-warning'}">${ship.paid ? 'Оплачено' : 'Ожидает оплаты'} · ${ship.id}</span>
                  </div>
                ` : ''}
              </div>
            </div>

            <div class="card">
              <h3 class="card-title" style="margin-bottom: 20px;">Менеджер</h3>
              <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--accent); color: white; display: grid; place-items: center; font-weight: 600;">
                  ${ship.manager.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <div style="font-weight: 600;">${ship.manager}</div>
                  <div style="font-size: 14px; color: var(--muted);">Менеджер по работе с клиентами</div>
                </div>
              </div>
              <div style="display: flex; gap: 8px;">
                <button class="btn btn-secondary btn-sm" style="flex: 1;" onclick="callManager('${ship.manager}')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.34 1.78.66 2.62a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.46-1.23a2 2 0 0 1 2.11-.45c.84.32 1.72.54 2.62.66A2 2 0 0 1 22 16.92z"/></svg> Позвонить</button>
                <button class="btn btn-secondary btn-sm" style="flex: 1;" onclick="messageManager('${ship.manager}')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Написать</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    function renderTracking() {
      const actives = APP_STATE.shipments.filter(s => s.status !== 'delivered');
      const ship = actives.find(s => s.id === APP_STATE.trackingId) || actives[0];
      if (ship) APP_STATE.trackingId = ship.id;
      if (!ship) {
        document.getElementById('tracking-content').innerHTML = `
          <div class="empty-state">
            <div class="empty-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>
            <h2 class="empty-title">Нет активных перевозок</h2>
            <p class="empty-message">Все ваши грузы доставлены</p>
          </div>
        `;
        return;
      }

      const switcher = actives.length > 1
        ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px;">' + actives.map(s =>
            '<button class="rd-tab ' + (s.id === ship.id ? 'active' : '') + '" onclick="APP_STATE.trackingId=\'' + s.id + '\';renderTracking();">' + s.id + ' · ' + (s.destination || '') + '</button>').join('') + '</div>'
        : '';
      document.getElementById('tracking-content').innerHTML = switcher + `
        <div class="card" style="border-left: 3px solid var(--accent); margin-bottom: 24px;">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 16px;">
            <div>
              <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 8px;">${ship.id}</h2>
              <div style="color: var(--muted);">${ship.origin} → ${ship.destination}</div>
            </div>
            <span class="pill pill-info" style="font-size: 14px; padding: 8px 16px;">
              <span class="dot"></span>
              Онлайн-трекинг
            </span>
          </div>

          <div style="position: relative; border-radius: var(--radius); overflow: hidden; margin-bottom: 16px; border: 1px solid var(--border);">
            <div id="track-map" style="width: 100%; height: 420px; z-index: 0;"></div>
            <button class="map-ctrl" style="position: absolute; top: 86px; left: 12px; z-index: 500;" onclick="leafletCenterCargo()" title="Показать груз">◎</button>
            <div class="map-legend" style="position: absolute; bottom: 12px; right: 12px; z-index: 500; background: rgba(255,255,255,0.92); border-radius: 12px; padding: 8px 12px; font-size: 12px; display: flex; gap: 14px; align-items: center; box-shadow: var(--shadow);">
              <span style="display:flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:50%;background:#15803D;"></span>Пройдено</span>
              <span style="display:flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:50%;background:#E11D48;"></span>Груз сейчас</span>
              <span style="display:flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:50%;background:#94A3B8;"></span>Впереди</span>
            </div>
          </div>

          <div class="grid grid-3">
            <div style="text-align: center;">
              <div style="font-size: 13px; color: var(--muted); margin-bottom: 4px;">Прогресс</div>
              <div style="font-size: 24px; font-weight: 700; color: var(--accent);">${ship.progress}%</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 13px; color: var(--muted); margin-bottom: 4px;">Текущий статус</div>
              <div style="font-size: 16px; font-weight: 600;">${shipmentRoute(ship)[ship.statusIdx].label}</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 13px; color: var(--muted); margin-bottom: 4px;">До прибытия</div>
              <div style="font-size: 24px; font-weight: 700;">${ship.eta}</div>
            </div>
          </div>
        </div>

        <div class="card">
          <h3 class="card-title" style="margin-bottom: 20px;">Детальная хронология</h3>
          <div class="timeline">
            ${shipmentRoute(ship).map((st, idx) => `
              <div class="timeline-item ${idx < ship.statusIdx ? 'done' : idx === ship.statusIdx ? 'current' : ''}">
                <div class="timeline-dot"></div>
                <div class="timeline-title">${st.label}</div>
                <div class="timeline-subtitle">${st.addr}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      initLeafletMap(ship);
    }

    // ===== Real map (Leaflet) =====
    let TRACK_MAP = null;
    function initLeafletMap(ship) {
      var ROUTE = shipmentRoute(ship);
      const el = document.getElementById('track-map');
      if (!el) return;
      if (!window.L) { setTimeout(function() { initLeafletMap(ship); }, 200); return; }
      if (TRACK_MAP) { try { TRACK_MAP.remove(); } catch (e) {} TRACK_MAP = null; }
      const dark = document.body.getAttribute('data-theme') === 'dark';
      const map = L.map(el, { scrollWheelZoom: true });
      TRACK_MAP = map;
      L.tileLayer(dark
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        { maxZoom: 19, attribution: '&copy; OpenStreetMap &copy; CARTO' }).addTo(map);
      const cur = ship.statusIdx;
      const pts = ROUTE.map(function(s) { return [s.lat, s.lng]; });
      L.polyline(pts, { color: '#94A3B8', weight: 3, dashArray: '4 10', opacity: 0.8 }).addTo(map);
      L.polyline(pts.slice(0, cur + 1), { color: '#E11D48', weight: 4 }).addTo(map);
      ROUTE.forEach(function(s, i) {
        const done = i < cur, current = i === cur;
        const color = done ? '#15803D' : current ? '#E11D48' : '#94A3B8';
        const m = L.circleMarker([s.lat, s.lng], { radius: current ? 9 : 6, color: '#fff', weight: 2.5, fillColor: color, fillOpacity: 1 }).addTo(map);
        const state = done ? '<span style="color:#15803D;font-weight:600;">Пройдено</span>' : current ? '<span style="color:#E11D48;font-weight:600;">Груз здесь сейчас</span>' : '<span style="color:#94A3B8;font-weight:600;">Ожидается</span>';
        m.bindPopup('<div style="min-width:170px;"><div style="font-weight:700;margin-bottom:2px;">' + s.city + '</div><div style="font-size:12px;color:#64748B;margin-bottom:6px;">' + s.label + ' · ' + s.addr + '</div>' + state + '</div>');
      });
      const c = ROUTE[cur];
      L.marker([c.lat, c.lng], {
        icon: L.divIcon({ className: '', html: '<div class="cargo-pin"><div class="cargo-pulse"></div><div class="cargo-dot"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M10 17h4V5H2v12h3"/><path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1"/><circle cx="7.5" cy="17.5" r="2"/><circle cx="17.5" cy="17.5" r="2"/></svg></div></div>', iconSize: [46, 46], iconAnchor: [23, 23] }),
        zIndexOffset: 1000
      }).addTo(map).bindPopup('<div style="min-width:170px;"><div style="font-weight:700;margin-bottom:2px;">' + ship.id + '</div><div style="font-size:12px;color:#64748B;">' + c.label + ' · ' + c.addr + '</div></div>');
      map.fitBounds(L.latLngBounds(pts), { padding: [45, 45] });
    }
    function leafletCenterCargo() {
      if (!TRACK_MAP) return;
      const s = (APP_STATE.trackingId && APP_STATE.shipments.find(function(x) { return x.id === APP_STATE.trackingId; })) || APP_STATE.shipments.find(function(x) { return x.status !== 'delivered'; });
      const c = shipmentRoute(s)[(s && s.statusIdx) || 0];
      TRACK_MAP.flyTo([c.lat, c.lng], 8, { duration: 0.9 });
    }

    // ===== Interactive tracking map =====
    let MAP = null;
    function initTrackingMap(ship) {
      const stage = document.getElementById('track-map');
      const world = document.getElementById('track-world');
      if (!stage || !world) return;

      const stops = shipmentRoute(ship);
      const cur = ship.statusIdx;

      // Build a smooth route polyline through all stops
      const pts = stops.map(s => [s.mx, s.my]);
      const linePath = (arr) => arr.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ');
      document.getElementById('track-route-full').setAttribute('d', linePath(pts));
      document.getElementById('track-route-done').setAttribute('d', linePath(pts.slice(0, cur + 1)));

      // Stops
      const stopsG = document.getElementById('track-stops');
      stopsG.innerHTML = stops.map((s, i) => {
        const done = i < cur, current = i === cur;
        const fill = done ? '#15803D' : current ? '#E11D48' : '#CBD5E1';
        const r = current ? 9 : 6.5;
        return `<g class="map-stop" onclick="mapPopup(${i})">
          <circle cx="${s.mx}" cy="${s.my}" r="16" fill="transparent"/>
          <circle cx="${s.mx}" cy="${s.my}" r="${r}" fill="${fill}" stroke="#fff" stroke-width="2.5"/>
          <text x="${s.mx}" y="${s.my - 15}" text-anchor="middle" font-size="12" font-weight="700" fill="${current ? '#E11D48' : '#475569'}" style="paint-order:stroke;stroke:#fff;stroke-width:3px;">${s.city}</text>
        </g>`;
      }).join('');

      // Animated cargo marker at current stop
      const c = stops[cur];
      document.getElementById('track-marker').innerHTML = `
        <circle cx="${c.mx}" cy="${c.my}" r="10" fill="none" stroke="#E11D48" stroke-width="2.5" opacity="0.5">
          <animate attributeName="r" from="10" to="30" dur="1.8s" repeatCount="indefinite"/>
          <animate attributeName="opacity" from="0.5" to="0" dur="1.8s" repeatCount="indefinite"/>
        </circle>
        <circle cx="${c.mx}" cy="${c.my}" r="13" fill="#E11D48" stroke="#fff" stroke-width="3"/>
        <text x="${c.mx}" y="${c.my + 5}" text-anchor="middle" font-size="14"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M10 17h4V5H2v12h3"/><path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1"/><circle cx="7.5" cy="17.5" r="2"/><circle cx="17.5" cy="17.5" r="2"/></svg></text>`;

      // View state
      MAP = { stage, world, scale: 1, tx: 0, ty: 0, min: 0.6, max: 3, ship };
      // Fit world into stage width
      const fit = stage.clientWidth / 1200;
      MAP.scale = Math.max(fit, 0.62);
      MAP.tx = (stage.clientWidth - 1200 * MAP.scale) / 2;
      MAP.ty = (stage.clientHeight - 700 * MAP.scale) / 2;
      mapApply();
      mapCenterCargo();
      bindMapDrag();
    }

    function mapApply() {
      if (!MAP) return;
      MAP.tx = Math.min(MAP.stage.clientWidth * 0.5, Math.max(MAP.stage.clientWidth - 1200 * MAP.scale - MAP.stage.clientWidth * 0.5, MAP.tx));
      MAP.ty = Math.min(MAP.stage.clientHeight * 0.5, Math.max(MAP.stage.clientHeight - 700 * MAP.scale - MAP.stage.clientHeight * 0.5, MAP.ty));
      MAP.world.style.transform = `translate(${MAP.tx}px, ${MAP.ty}px) scale(${MAP.scale})`;
    }

    function mapZoom(f, cx, cy) {
      if (!MAP) return;
      const ns = Math.min(MAP.max, Math.max(MAP.min, MAP.scale * f));
      const r = MAP.stage.getBoundingClientRect();
      cx = cx ?? r.width / 2; cy = cy ?? r.height / 2;
      // keep point under cursor stable
      MAP.tx = cx - (cx - MAP.tx) * (ns / MAP.scale);
      MAP.ty = cy - (cy - MAP.ty) * (ns / MAP.scale);
      MAP.scale = ns;
      hidePopup();
      mapApply();
    }

    function mapCenterCargo() {
      if (!MAP) return;
      const c = shipmentRoute(MAP.ship)[MAP.ship.statusIdx];
      MAP.scale = Math.min(MAP.max, Math.max(MAP.scale, 1.15));
      MAP.tx = MAP.stage.clientWidth / 2 - c.mx * MAP.scale;
      MAP.ty = MAP.stage.clientHeight / 2 - c.my * MAP.scale;
      MAP.world.style.transition = 'transform 0.5s cubic-bezier(0.4,0,0.2,1)';
      mapApply();
      setTimeout(() => { if (MAP) MAP.world.style.transition = ''; }, 520);
    }

    function bindMapDrag() {
      const stage = MAP.stage;
      let dragging = false, sx = 0, sy = 0, moved = false;
      stage.onpointerdown = (e) => { dragging = true; moved = false; sx = e.clientX - MAP.tx; sy = e.clientY - MAP.ty; stage.style.cursor = 'grabbing'; stage.setPointerCapture(e.pointerId); hidePopup(); };
      stage.onpointermove = (e) => { if (!dragging) return; MAP.tx = e.clientX - sx; MAP.ty = e.clientY - sy; moved = true; mapApply(); };
      stage.onpointerup = (e) => { dragging = false; stage.style.cursor = 'grab'; };
      stage.onpointerleave = () => { dragging = false; stage.style.cursor = 'grab'; };
      stage.onwheel = (e) => { e.preventDefault(); const r = stage.getBoundingClientRect(); mapZoom(e.deltaY < 0 ? 1.12 : 0.89, e.clientX - r.left, e.clientY - r.top); };
    }

    function mapPopup(i) {
      const s = shipmentRoute(MAP.ship)[i], cur = MAP.ship.statusIdx;
      const state = i < cur ? { t: 'Пройдено', c: '#15803D' } : i === cur ? { t: 'Груз здесь сейчас', c: '#E11D48' } : { t: 'Ожидается', c: '#94A3B8' };
      const pop = document.getElementById('track-popup');
      document.getElementById('track-popup-body').innerHTML = `
        <div style="font-size:11px;font-weight:700;color:${state.c};text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px;">${state.t}</div>
        <div style="font-weight:700;font-size:15px;margin-bottom:2px;">${s.label}</div>
        <div style="font-size:13px;color:var(--muted);"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ${s.addr}</div>`;
      // position popup over the stop in stage coords
      const px = MAP.tx + s.mx * MAP.scale;
      const py = MAP.ty + s.my * MAP.scale;
      pop.style.left = px + 'px';
      pop.style.top = py + 'px';
      pop.style.display = 'block';
    }
    function hidePopup() { const p = document.getElementById('track-popup'); if (p) p.style.display = 'none'; }

    function renderServiceDetail(id) {
      const services = {
        auto: {
          title: 'Автоперевозки', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M10 17h4V5H2v12h3"/><path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1"/><circle cx="7.5" cy="17.5" r="2"/><circle cx="17.5" cy="17.5" r="2"/></svg>', price: 'по запросу',
          description: 'Автомобильные перевозки грузов с полной и частичной загрузкой — все виды грузов, в том числе требующие поддержания температурного режима',
          features: ['Полная и частичная загрузка (FTL/LTL)', 'Рефрижераторные перевозки', 'Негабаритные и тяжеловесные грузы', 'Опытные водители, знание трасс СНГ и Китая', 'Мониторинг груза на всём маршруте', 'Страхование каждой перевозки'],
          included: ['Подбор транспорта', 'Разработка маршрута', 'Сопроводительные документы', 'Отслеживание в пути']
        },
        avia: {
          title: 'Авиаперевозки', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>', price: 'по запросу',
          description: 'Высокая скорость доставки регулярными авиарейсами — большой опыт в области международных грузовых авиаперевозок, 150+ партнёров по всему миру',
          features: ['Организация перевозки оптимальным маршрутом', 'Бронирование мест на выбранный рейс', 'Оформление всей документации', 'Хранение груза в аэропорту', 'Полный контроль передвижения', 'Отслеживание статуса доставки'],
          included: ['Разработка маршрута', 'Бронирование рейса', 'Оформление документов', 'Контроль доставки']
        },
        rail: {
          title: 'ЖД-перевозки', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><rect x="4" y="3" width="16" height="13" rx="2"/><path d="M4 11h16"/><circle cx="8.5" cy="19" r="1.6"/><circle cx="15.5" cy="19" r="1.6"/><path d="M8 16l-2 5M16 16l2 5"/></svg>', price: 'по запросу',
          description: 'Железнодорожные перевозки грузов — полный комплекс транспортно-логистических услуг для бизнеса и частных лиц, собственный подвижной состав',
          features: ['Крытые вагоны, полувагоны, цистерны, платформы', 'Погрузочно-разгрузочные работы от 3 до 450 тонн', 'Перевозки Китай — Казахстан — СНГ', 'Терминальная обработка груза', 'Содействие в разрешительной документации', 'Несколько маршрутов на выбор'],
          included: ['Подача вагонов', 'Погрузка/выгрузка', 'Документальное оформление', 'Контроль в пути']
        },
        multimodal: {
          title: 'Мультимодальные перевозки', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>', price: 'по запросу',
          description: 'Комбинированные схемы доставки: море + железная дорога + авто. Индивидуальные схемы перевозки для каждого заказчика',
          features: ['Средний коридор: Китай — КЗ — ЕС', 'Маршруты через Достык, Хоргос и порт Актау', 'Регулярные внешнеторговые и каботажные перевозки', 'Надёжные суда различных типов', 'Единый оператор на всём маршруте', 'Оптимизация стоимости и сроков'],
          included: ['Индивидуальная схема', 'Все виды транспорта', 'Сквозной документооборот', 'Единая точка контроля']
        },
        customs: {
          title: 'Таможенное оформление',
          icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>',
          price: 'от ₸ 213 750',
          description: 'Полное сопровождение грузов на всех этапах таможенного оформления в Республике Казахстан',
          features: [
            'Подготовка и подача декларации на товары',
            'Согласование кодов ТН ВЭД',
            'Расчёт таможенных платежей',
            'Представительство на таможне',
            'Получение разрешительных документов',
            'Консультации по изменениям законодательства'
          ],
          included: [
            'Классификация товара',
            'Проверка документов',
            'Подача декларации',
            'Оплата пошлин и сборов',
            'Получение разрешения на выпуск'
          ]
        },
        insurance: {
          title: 'Страхование груза',
          icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
          price: '2% от стоимости',
          description: 'Комплексное страхование грузов от всех рисков при международной перевозке',
          features: [
            'Защита от утраты и повреждения',
            'Страхование от всех рисков',
            'Покрытие форс-мажорных обстоятельств',
            'Быстрое урегулирование убытков',
            'Работа с ведущими страховыми компаниями',
            'Помощь в оформлении претензий'
          ],
          included: [
            'Оформление полиса',
            'Консультация по рискам',
            'Круглосуточная поддержка',
            'Сопровождение при убытках'
          ]
        },
        storage: {
          title: 'Складское хранение',
          icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
          price: '₸ 7 125 / день',
          description: 'Временное хранение грузов на лицензированном складе временного хранения в Алматы',
          features: [
            'СВХ с лицензией таможни',
            'Круглосуточная охрана',
            'Видеонаблюдение',
            'Контроль температуры и влажности',
            'Погрузочно-разгрузочные работы',
            'Складская обработка и маркировка'
          ],
          included: [
            'Приёмка и размещение',
            'Хранение до 30 дней',
            'Базовое страхование',
            'Отгрузка по заявке'
          ]
        },
        certification: {
          title: 'Сертификация', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/></svg>', price: 'от ₸ 142 500',
          description: 'Получение сертификатов и деклараций соответствия техническим регламентам ЕАЭС',
          features: ['Определение схемы сертификации', 'Подготовка доказательной базы', 'Испытания в аккредитованной лаборатории', 'Регистрация деклараций', 'Сертификаты происхождения', 'Отказные письма'],
          included: ['Анализ товара', 'Оформление документов', 'Регистрация в реестре', 'Консультация специалиста']
        },
        consulting: {
          title: 'ВЭД консалтинг', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>', price: '₸ 71 250 / час',
          description: 'Консультации по внешнеэкономической деятельности, валютному контролю и налогообложению',
          features: ['Структурирование сделки', 'Подбор кодов ТН ВЭД', 'Валютный контроль', 'Оптимизация логистики', 'Работа с контрактами', 'Сопровождение проверок'],
          included: ['Первичная консультация', 'Анализ документов', 'Письменное заключение', 'Поддержка сделки']
        },
        delivery: {
          title: 'Доставка до двери', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M10 17h4V5H2v12h3"/><path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1"/><circle cx="7.5" cy="17.5" r="2"/><circle cx="17.5" cy="17.5" r="2"/></svg>', price: 'от ₸ 38 000',
          description: 'Автодоставка контейнера или сборного груза от терминала до вашего адреса',
          features: ['Доставка по всему Казахстану', 'Подача транспорта в срок', 'Погрузо-разгрузочные работы', 'Отслеживание в пути', 'Экспедирование', 'Доставка сборных грузов'],
          included: ['Подача авто', 'Доставка до адреса', 'Выгрузка', 'Документы о доставке']
        }
      };

      const service = services[id] || services.customs;

      document.getElementById('service-detail-content').innerHTML = `
        <div class="card" style="border-left: 3px solid var(--accent); margin-bottom: 24px;">
          <div style="display: flex; align-items: center; gap: 20px; margin-bottom: 24px;">
            <div style="width: 80px; height: 80px; background: var(--bg); border-radius: 50%; display: grid; place-items: center; font-size: 40px;">
              ${service.icon}
            </div>
            <div style="flex: 1;">
              <h1 style="font-size: 28px; font-weight: 700; margin-bottom: 8px;">${service.title}</h1>
              <div style="font-size: 24px; font-weight: 700; color: var(--accent);">${service.price}</div>
            </div>
            <button class="btn btn-primary btn-lg">Заказать услугу</button>
          </div>

          <p style="font-size: 16px; color: var(--muted); line-height: 1.6;">${service.description}</p>
        </div>

        <div class="grid grid-2">
          <div class="card">
            <h3 class="card-title" style="margin-bottom: 20px;">Преимущества</h3>
            <div style="display: flex; flex-direction: column; gap: 12px;">
              ${service.features.map(f => `
                <div style="display: flex; gap: 12px;">
                  <div style="color: var(--success); font-size: 18px;">✓</div>
                  <div>${f}</div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="card">
            <h3 class="card-title" style="margin-bottom: 20px;">Что входит в стоимость</h3>
            <div style="display: flex; flex-direction: column; gap: 12px;">
              ${service.included.map(item => `
                <div style="padding: 12px; background: var(--bg); border-radius: var(--radius);">
                  ${item}
                </div>
              `).join('')}
            </div>

            <button class="btn btn-secondary" style="width: 100%; margin-top: 20px;">
              Получить консультацию
            </button>
          </div>
        </div>
      `;
    }

    function renderMargin() {
      const total = APP_STATE.shipments.reduce((sum, s) => sum + s.margin, 0);
      const paid = APP_STATE.shipments.filter(s => s.paid).reduce((sum, s) => sum + s.margin, 0);
      const unpaid = total - paid;
      const paidCount = APP_STATE.shipments.filter(s => s.paid).length;
      const unpaidCount = APP_STATE.shipments.length - paidCount;

      document.getElementById('total-margin').textContent = fmtKZT(total);
      document.getElementById('paid-margin').textContent = fmtKZT(paid);
      document.getElementById('unpaid-margin').textContent = fmtKZT(unpaid);

      document.querySelector('.margin-label').textContent = APP_STATE.shipments.length
        ? `${APP_STATE.shipments.length} перевозок · средняя маржа ${fmtKZT(Math.round(total / APP_STATE.shipments.length))} на заявку`
        : 'Пока нет заявок';

      document.querySelector('.margin-split-item:first-child .margin-split-label').textContent =
        `Оплачено · ${paidCount} из ${APP_STATE.shipments.length} заявок`;

      document.querySelector('.margin-split-item:last-child .margin-split-label').textContent =
        `Ожидает оплаты · ${unpaidCount} заявок в пути`;

      const tbody = document.getElementById('margin-table');
      tbody.innerHTML = APP_STATE.shipments.map(s => `
        <tr>
          <td><strong>${s.id}</strong></td>
          <td>${s.origin} → ${s.destination}</td>
          <td>${fmtKZT(s.price)}</td>
          <td>${fmtKZT(s.cost)}</td>
          <td><strong style="color: var(--success);">${fmtKZT(s.margin)}</strong></td>
          <td>
            <span class="pill ${s.paid ? 'pill-success' : 'pill-warning'}">
              ${s.paid ? 'Оплачено' : 'Ожидает'}
            </span>
          </td>
        </tr>
      `).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:32px;">Пока нет заявок</td></tr>';
    }

    // ===== Multi-step Form =====
    function nextStep() {
      const form = document.getElementById('new-shipment-form');
      const currentStep = APP_STATE.currentStep;

      // Validate current step
      const currentPane = form.querySelector(`.form-step[data-step="${currentStep}"]`);
      const inputs = currentPane.querySelectorAll('[required]');
      let valid = true;

      inputs.forEach(input => {
        if (!input.value && input.type !== 'hidden') {
          valid = false;
          input.style.borderColor = 'var(--danger)';
        } else {
          input.style.borderColor = '';
        }
      });

      if (!valid) {
        showToast('warning', 'Заполните все поля', 'Пожалуйста, заполните обязательные поля');
        return;
      }

      if (currentStep < 4) {
        APP_STATE.currentStep++;
        updateFormStep();
        if (APP_STATE.currentStep === 4) recalcEstimate();
      }
    }

    function prevStep() {
      if (APP_STATE.currentStep > 1) {
        APP_STATE.currentStep--;
        updateFormStep();
      }
    }

    function updateFormStep() {
      const form = document.getElementById('new-shipment-form');

      // Hide all steps
      form.querySelectorAll('.form-step').forEach(step => {
        step.style.display = 'none';
        step.classList.remove('active');
      });

      // Show current step
      const currentPane = form.querySelector(`.form-step[data-step="${APP_STATE.currentStep}"]`);
      if (currentPane) {
        currentPane.style.display = 'block';
        currentPane.classList.add('active');
      }

      // Update progress
      document.querySelectorAll('.progress-step').forEach((step, idx) => {
        step.classList.remove('done', 'current');
        if (idx < APP_STATE.currentStep - 1) {
          step.classList.add('done');
        } else if (idx === APP_STATE.currentStep - 1) {
          step.classList.add('current');
        }
      });
    }

    // ===== Form Helpers =====
    const CARGO_POOLS = {
      // контейнерные виды
      sea:  { label: 'Тип контейнера', chips: [["20dc","20' DC"],["40dc","40' DC"],["40hc","40' HC"],["reefer","Reefer"]] },
      rail: { label: 'Тип контейнера', chips: [["20dc","20' DC"],["40dc","40' DC"],["40hc","40' HC"],["reefer","Reefer"]] },
      // авто: без контейнера — тип загрузки
      truck: { label: 'Тип загрузки', chips: [["ftl","Полная фура (FTL)"],["ltl","Консолидация (сборный)"],["reefer-truck","Рефрижератор"],["oversize","Негабарит"]] },
      // авиа
      air:  { label: 'Тип груза', chips: [["consol","Сборный груз"],["pallets","Паллеты"],["express","Экспресс"],["dg","Опасный груз (DG)"]] }
    };
    function renderCargoPool(method) {
      const box = document.getElementById('cargo-pool-chips');
      if (!box) return;
      const pool = CARGO_POOLS[method] || CARGO_POOLS.sea;
      const lbl = box.closest('.form-group') ? box.closest('.form-group').querySelector('.form-label') : null;
      if (lbl) lbl.textContent = pool.label;
      box.innerHTML = pool.chips.map(function(c, i) {
        return '<div class="chip ' + (i === 0 ? 'active' : '') + '" onclick="selectContainer(this, \'' + c[0] + '\')">' + c[1] + '</div>';
      }).join('');
      const inp = document.querySelector('[name="container"]');
      if (inp) inp.value = pool.chips[0][1];
    }
    function selectShippingMethod(el, method) {
      renderCargoPool(method);
      el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      el.classList.add('active');
      document.querySelector('[name="shipping-method"]').value = method;
      recalcEstimate();
    }

    function selectContainer(el, type) {
      el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      el.classList.add('active');
      document.querySelector('[name="container"]').value = type;
      recalcEstimate();
    }
    function selectCustoms(el, val) {
      el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      el.classList.add('active');
      document.querySelector('[name="customs"]').value = val;
      recalcEstimate();
    }

    function recalcEstimate() {
      const box = document.getElementById('estimate-box');
      if (!box) return;
      const method = (document.querySelector('[name="shipping-method"]') || {}).value || 'sea';
      const container = (document.querySelector('[name="container"]') || {}).value || '20dc';

      const freightByMethod = { sea: 3200, rail: 3800, truck: 4200, air: 6900 };
      const containerMult = { '20dc': 1, '40dc': 1.5, '40hc': 1.65, 'reefer': 2.1 };
      const freight = Math.round(freightByMethod[method] * (containerMult[container] || 1));

      const servicePrices = {
        'Таможенное оформление': 450,
        'Сертификация': 300,
        'Страхование': Math.round(freight * 0.02),
        'Складское хранение': 225
      };
      const rows = [{ label: 'Перевозка (' + method.toUpperCase() + ', ' + container.toUpperCase() + ')', val: freight }];
      let total = freight;
      const customs = (document.querySelector('[name="customs"]') || {}).value || 'yes';
      if (customs === 'yes') { rows.push({ label: 'Таможенное оформление', val: 450 }); total += 450; }
      document.querySelectorAll('.form-step[data-step="3"] .chip.active').forEach(chip => {
        const name = chip.textContent.trim();
        const p = servicePrices[name] || 0;
        rows.push({ label: name, val: p });
        total += p;
      });
      APP_STATE.lastEstimate = total;
      const fmt = n => fmtKZT(n);
      box.innerHTML = rows.map(r => `
        <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
          <span>${r.label}</span><strong>${fmt(r.val)}</strong>
        </div>`).join('') + `
        <div style="display: flex; justify-content: space-between; padding-top: 12px; border-top: 2px solid var(--border); font-size: 20px; font-weight: 700; color: var(--accent);">
          <span>Итого</span><span>${fmt(total)}</span>
        </div>`;
    }

    function toggleService(el) {
      el.classList.toggle('active');
      recalcEstimate();
    }

    function toggleNotify(name, on, key) {
      try {
        const s = JSON.parse(localStorage.getItem('exim-settings') || '{}');
        if (key) { s[key] = on; localStorage.setItem('exim-settings', JSON.stringify(s)); }
      } catch (e) {}
      showToast(on ? 'success' : 'info', name, on ? 'Уведомления включены' : 'Уведомления отключены');
    }
    function loadSettings() {
      try {
        const s = JSON.parse(localStorage.getItem('exim-settings') || '{}');
        [['set-email', 'email'], ['set-sms', 'sms'], ['set-push', 'push']].forEach(function(p) {
          const el = document.getElementById(p[0]);
          if (el && s[p[1]] !== undefined) el.checked = s[p[1]];
        });
      } catch (e) {}
    }

    function filterServices(cat, event) {
      if (event && event.currentTarget) {
        event.currentTarget.parentElement.querySelectorAll('.rd-tab').forEach(t => t.classList.remove('active'));
        event.currentTarget.classList.add('active');
      }
      document.querySelectorAll('#services-grid .svc-card').forEach(card => {
        card.style.display = (cat === 'all' || card.dataset.cat === cat) ? '' : 'none';
      });
    }

    function filterShipments(filter, event) {
      if (event && event.currentTarget) {
        const parent = event.currentTarget.parentElement;
        parent.querySelectorAll('.chip, .rd-tab').forEach(c => c.classList.remove('active'));
        event.currentTarget.classList.add('active');
      }
      APP_STATE.shipmentFilter = filter;
      renderShipmentsList();
    }

    // ===== Form Submit =====
    document.getElementById('new-shipment-form').addEventListener('submit', function(e) {
      e.preventDefault();

      // Create new shipment
      const newId = 'EX-' + Math.floor(1000 + Math.random() * 9000);
      const estPrice = APP_STATE.lastEstimate || 4650;

      APP_STATE.shipments.unshift({
        id: newId,
        origin: document.querySelector('[name="origin"]').value,
        destination: document.querySelector('[name="destination"]').value,
        status: 'pending',
        statusLabel: 'Подготовка',
        progress: 5,
        container: document.querySelector('[name="container"]').value,
        cargo: document.querySelector('[name="cargo-type"]').value || 'Груз',
        weight: document.querySelector('[name="weight"]').value + ' кг',
        client: profileClient(),
        manager: 'Назначается',
        price: estPrice,
        cost: Math.round(estPrice * 0.78),
        margin: Math.round(estPrice * 0.22),
        paid: false,
        statusIdx: 0,
        created: new Date().toLocaleDateString('ru-RU'),
        eta: '≈ 32 дня'
      });

      // Reset form
      APP_STATE.currentStep = 1;

      // Create manager request (demo flow 1)
      APP_STATE.requests.unshift({
        id: 'RQ-' + Math.floor(8000 + Math.random() * 2000),
        type: 'Перевозка',
        title: `${document.querySelector('[name="origin"]').value || '—'} → ${document.querySelector('[name="destination"]').value || '—'}, ${document.querySelector('[name="cargo-type"]').value || 'груз'}`,
        client: profileClient(), phone: profilePhone(),
        created: new Date().toLocaleDateString('ru-RU'), status: 'new',
        detail: `${document.querySelector('[name="container"]').value || ''} · ${document.querySelector('[name="weight"]').value || '—'} кг · заявка ${newId}`
      });
      persist();
      pushNotif('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>', 'Заявка создана', `Заявка ${newId} принята в обработку. Менеджер свяжется с вами в течение 2 часов.`, 'shipment-detail', newId);

      this.reset();
      updateFormStep();

      // Show success page
      document.getElementById('new-shipment-id').textContent = newId;
      const setNs = function(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; };
      const created = APP_STATE.shipments[0];
      setNs('ns-route', created.origin + ' → ' + created.destination);
      setNs('ns-container', created.container || '—');
      setNs('ns-cargo', created.cargo + ', ' + created.weight);
      setNs('ns-price', fmtKZT(created.price));
      navigate('shipment-success');
    });

    // ===== Profile =====
    function fldVal(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
    function profileClient() { return (APP_STATE.profile && APP_STATE.profile.company) || 'Клиент'; }
    function profilePhone() { return (APP_STATE.profile && APP_STATE.profile.phone) || '—'; }
    function saveProfile() {
      const p = { company: fldVal('pf-company'), bin: fldVal('pf-bin'), address: fldVal('pf-address'), name: fldVal('pf-name'), role: fldVal('pf-role'), phone: fldVal('pf-phone'), email: fldVal('pf-email') };
      APP_STATE.profile = p;
      try { localStorage.setItem('exim-profile', JSON.stringify(p)); } catch (e) {}
      applyProfileToHeader();
      showToast('success', 'Сохранено', 'Изменения профиля сохранены');
    }
    function loadProfile() {
      try {
        const raw = localStorage.getItem('exim-profile');
        if (!raw) return;
        const p = JSON.parse(raw);
        APP_STATE.profile = p;
        const map = { 'pf-company': p.company, 'pf-bin': p.bin, 'pf-address': p.address, 'pf-name': p.name, 'pf-role': p.role, 'pf-phone': p.phone, 'pf-email': p.email };
        Object.keys(map).forEach(function(id) { const el = document.getElementById(id); if (el && map[id]) el.value = map[id]; });
      } catch (e) {}
      applyProfileToHeader();
      renderProfileDocs();
    }
    function applyProfileToHeader() {
      const p = APP_STATE.profile || {};
      const nameEl = document.getElementById('user-name');
      const avEl = document.getElementById('user-avatar');
      const n = (p.name || '').trim();
      if (nameEl) nameEl.textContent = n ? n.split(/\s+/).slice(0, 2).join(' ') : 'Профиль';
      if (avEl) avEl.textContent = n ? n.split(/\s+/).slice(0, 2).map(function(w) { return w[0]; }).join('').toUpperCase() : '—';
    }

    // ===== Notification center =====
    function defaultNotifs() { return []; }
    function loadNotifs() {
      try {
        const raw = localStorage.getItem('exim-notifs-v2');
        APP_STATE.notifications = raw ? JSON.parse(raw) : defaultNotifs();
      } catch (e) { APP_STATE.notifications = defaultNotifs(); }
    }
    function persistNotifs() { try { localStorage.setItem('exim-notifs-v2', JSON.stringify(APP_STATE.notifications)); } catch (e) {} }
    function pushNotif(icon, title, text, page, refId) {
      if (!APP_STATE.notifications) loadNotifs();
      APP_STATE.notifications.unshift({ icon: icon, title: title, text: text, page: page, refId: refId, time: Date.now(), read: false });
      if (APP_STATE.notifications.length > 50) APP_STATE.notifications.length = 50;
      persistNotifs();
      updateNotifBadge();
      if (APP_STATE.currentPage === 'notifications') renderNotifications();
    }
    function timeAgo(t) {
      const m = Math.max(1, Math.round((Date.now() - t) / 60000));
      if (m < 60) return m + ' мин назад';
      const h = Math.round(m / 60);
      if (h < 24) return h + ' ч назад';
      return Math.round(h / 24) + ' дн назад';
    }
    function renderNotifications() {
      const box = document.getElementById('notif-list');
      if (!box) return;
      const list = APP_STATE.notifications || [];
      if (!list.length) { box.innerHTML = '<div style="padding:40px;text-align:center;color:var(--muted);">Нет уведомлений</div>'; return; }
      const today = [], earlier = [];
      list.forEach(function(n, i) { ((Date.now() - n.time) < 86400000 ? today : earlier).push([n, i]); });
      const item = function(pair) {
        const n = pair[0], i = pair[1];
        return `<div onclick="openNotif(${i})" style="padding: 16px; background: ${n.read ? 'var(--bg)' : 'rgba(225, 29, 72, 0.04)'}; border-radius: var(--radius); ${n.read ? '' : 'border-left: 3px solid var(--accent);'} margin-bottom: 12px; cursor: pointer;">
          <div style="display: flex; gap: 12px;">
            <div style="font-size: 24px;">${n.icon}</div>
            <div style="flex: 1;">
              <div style="font-weight: 600; margin-bottom: 4px;">${n.title}</div>
              <div style="font-size: 14px; color: var(--muted); margin-bottom: 8px;">${n.text}</div>
              <div style="font-size: 12px; color: var(--muted);">${timeAgo(n.time)}</div>
            </div>
          </div>
        </div>`;
      };
      const sect = function(t) { return `<div style="font-size: 13px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 16px;">${t}</div>`; };
      box.innerHTML = (today.length ? sect('Сегодня') + today.map(item).join('') : '') +
        (earlier.length ? `<div style="margin-top: 12px;"></div>` + sect('Ранее') + earlier.map(item).join('') : '');
    }
    function updateNotifBadge() {
      const n = (APP_STATE.notifications || []).filter(function(x) { return !x.read; }).length;
      document.querySelectorAll('.icon-btn .badge').forEach(function(b) { b.textContent = n; b.style.display = n ? '' : 'none'; });
    }
    function openNotif(i) {
      const n = (APP_STATE.notifications || [])[i];
      if (!n) return;
      n.read = true;
      persistNotifs(); updateNotifBadge(); renderNotifications();
      if (n.page) navigate(n.page, null, n.refId || null);
    }
    function markAllRead() {
      (APP_STATE.notifications || []).forEach(function(n) { n.read = true; });
      persistNotifs(); updateNotifBadge(); renderNotifications();
      showToast('success', 'Готово', 'Все уведомления отмечены прочитанными');
    }

    // ===== Documents & invoices =====
    function downloadFile(name, content, type) {
      const blob = new Blob([content], { type: (type || 'text/plain') + ';charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function() { URL.revokeObjectURL(a.href); }, 5000);
    }
    function invoiceNo(id) { return 'INV-2026-' + String(id).replace(/\D/g, ''); }
    function docShell(title, body) {
      return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:Helvetica,Arial,sans-serif;max-width:700px;margin:40px auto;color:#111;padding:0 20px;line-height:1.5}h1{font-size:22px}table{width:100%;border-collapse:collapse;margin:24px 0}td,th{padding:10px;border-bottom:1px solid #ddd;text-align:left}tfoot td{font-weight:700;font-size:18px;border-top:2px solid #111}.muted{color:#666;font-size:13px}@media print{body{margin:10px auto}}</style></head><body>${body}</body></html>`;
    }
    function downloadInvoice(id) {
      const s = APP_STATE.shipments.find(function(x) { return x.id === id; });
      if (!s) return;
      const p = APP_STATE.profile || {};
      const body = `<h1>Счёт на оплату ${invoiceNo(id)}</h1>
        <p class="muted">Дата: ${new Date().toLocaleDateString('ru-RU')} · Заявка ${s.id}</p>
        <p><strong>Исполнитель:</strong> ТОО «EXIM Logistics», БИН 990840001234, г. Алматы<br>
        <strong>Заказчик:</strong> ${p.company || s.client}, БИН ${p.bin || '—'}</p>
        <table><thead><tr><th>Услуга</th><th>Сумма</th></tr></thead>
        <tbody><tr><td>Организация перевозки ${s.origin} → ${s.destination}, контейнер ${s.container}, груз: ${s.cargo} (${s.weight})</td><td>${fmtKZT(s.price)}</td></tr></tbody>
        <tfoot><tr><td>Итого к оплате</td><td>${fmtKZT(s.price)}</td></tr></tfoot></table>
        <p class="muted">Оплата в течение 5 банковских дней с даты выставления счёта.</p>`;
      downloadFile(invoiceNo(id) + '.html', docShell(invoiceNo(id), body), 'text/html');
      showToast('success', 'Инвойс', invoiceNo(id) + ' скачан. Откройте файл и распечатайте в PDF.');
    }
    function downloadDoc(name, refId) {
      const body = `<h1>${name}</h1><p class="muted">Заявка ${refId || '—'} · Сформировано ${new Date().toLocaleString('ru-RU')}</p>
        <p>Электронная копия документа «${name}», сформированная в личном кабинете EXIM Super App.</p>`;
      downloadFile(String(name).replace(/[^\wа-яА-ЯёЁ.-]+/g, '_') + '.html', docShell(name, body), 'text/html');
      showToast('success', 'Загрузка', name + ' — файл скачан');
    }

    // ===== Payment =====
    function payInvoice(id) {
      const s = APP_STATE.shipments.find(function(x) { return x.id === id; });
      if (!s) return;
      openModal('Оплата · ' + id, `
        <div style="background: var(--bg); padding: 16px; border-radius: var(--radius); margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
          <span style="color: var(--muted);">Счёт ${invoiceNo(id)}</span><strong style="font-size: 20px; color: var(--accent);">${fmtKZT(s.price)}</strong>
        </div>
        <div class="form-group"><label class="form-label">Способ оплаты</label>
          <select class="form-input" id="pay-method" onchange="document.getElementById('pay-card-fields').style.display = this.value === 'card' ? '' : 'none'">
            <option value="card">Банковская карта</option>
            <option value="kaspi">Kaspi Pay</option>
            <option value="invoice">Безналичный расчёт (юр. лицо)</option>
          </select>
        </div>
        <div id="pay-card-fields">
          <div class="form-group"><label class="form-label">Номер карты</label><input class="form-input" id="pay-card" placeholder="0000 0000 0000 0000" maxlength="19" inputmode="numeric"></div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-group"><label class="form-label">Срок действия</label><input class="form-input" id="pay-exp" placeholder="ММ/ГГ" maxlength="5"></div>
            <div class="form-group"><label class="form-label">CVC</label><input class="form-input" id="pay-cvc" placeholder="•••" maxlength="3" type="password"></div>
          </div>
        </div>
        <button class="btn btn-primary btn-lg" style="width: 100%;" onclick="confirmPayment('${id}')">Оплатить ${fmtKZT(s.price)}</button>`);
    }
    function confirmPayment(id) {
      const s = APP_STATE.shipments.find(function(x) { return x.id === id; });
      if (!s) return;
      const method = (document.getElementById('pay-method') || {}).value || 'card';
      if (method === 'invoice') {
        closeModal();
        downloadInvoice(id);
        pushNotif('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg>', 'Счёт выставлен', `${invoiceNo(id)} на ${fmtKZT(s.price)} — ожидаем оплату по реквизитам`, 'shipment-detail', id);
        return;
      }
      if (method === 'card') {
        const num = ((document.getElementById('pay-card') || {}).value || '').replace(/\s/g, '');
        if (num.length < 16) { showToast('warning', 'Проверьте карту', 'Введите 16 цифр номера карты'); return; }
        if (!/^\d\d\/\d\d$/.test((document.getElementById('pay-exp') || {}).value || '')) { showToast('warning', 'Срок действия', 'Укажите в формате ММ/ГГ'); return; }
        if (((document.getElementById('pay-cvc') || {}).value || '').length < 3) { showToast('warning', 'CVC', 'Введите 3 цифры с обратной стороны карты'); return; }
      }
      s.paid = true;
      persist();
      closeModal();
      pushNotif('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>', 'Оплата получена', `Счёт ${invoiceNo(id)} на ${fmtKZT(s.price)} оплачен`, 'shipment-detail', id);
      if (APP_STATE.currentPage === 'shipment-detail') renderShipmentDetail(id);
      if (APP_STATE.currentPage === 'margin') renderMargin();
      showToast('success', 'Оплачено', 'Платёж проведён успешно');
    }

    function shareShipment(id) {
      const link = `https://exim.kz/track/${id}`;
      if (navigator.clipboard) navigator.clipboard.writeText(link).catch(() => {});
      showToast('success', 'Ссылка скопирована', link);
    }

    // ===== Manager contact =====
    const OFFICE_PHONE = '+7 727 339 40 50';
    function currentManagerName() {
      const s = APP_STATE.shipments.find(function(x) { return x.id === APP_STATE.selectedShipmentId; });
      return (s && s.manager && s.manager !== 'Назначается' && s.manager) || 'Менеджер EXIM';
    }
    function callManager(name) {
      openModal('Связаться · ' + name, `
        <div style="text-align: center; padding: 8px 0 16px;">
          <div style="width: 72px; height: 72px; margin: 0 auto 12px; border-radius: 50%; background: var(--accent); color: #fff; display: grid; place-items: center; font-size: 28px;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.34 1.78.66 2.62a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.46-1.23a2 2 0 0 1 2.11-.45c.84.32 1.72.54 2.62.66A2 2 0 0 1 22 16.92z"/></svg></div>
          <div style="font-weight: 600; font-size: 18px; margin-bottom: 4px;">${name}</div>
          <div style="color: var(--muted); font-size: 14px;">Пн–Пт 9:00–18:00 (GMT+5)</div>
        </div>
        <a class="btn btn-primary btn-lg" style="width: 100%; margin-bottom: 10px; display: flex; justify-content: center; text-decoration: none;" href="tel:${OFFICE_PHONE.replace(/\s/g, '')}">Позвонить ${OFFICE_PHONE}</a>
        <button class="btn btn-primary btn-lg" style="width: 100%; margin-bottom: 10px; background:#25D366;" onclick="closeModal(); openWhatsApp('Здравствуйте! Пишу из EXIM Super App (' + profileClient() + ').')">WhatsApp +7 700 494 94 99</button>
        <button class="btn btn-secondary btn-lg" style="width: 100%;" onclick="closeModal(); messageManager('${name}')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Написать в чат</button>`);
    }
    function chatKey(name) { return String(name).replace(/[^\wа-яА-ЯёЁ]+/g, '_'); }
    function loadChats() { try { APP_STATE.chats = JSON.parse(localStorage.getItem('exim-chats') || '{}'); } catch (e) { APP_STATE.chats = {}; } }
    function persistChats() { try { localStorage.setItem('exim-chats', JSON.stringify(APP_STATE.chats)); } catch (e) {} }
    function messageManager(name) {
      if (!APP_STATE.chats) loadChats();
      const k = chatKey(name);
      if (!APP_STATE.chats[k]) APP_STATE.chats[k] = [];
      openModal('Чат · ' + name, `
        <div id="chat-log" style="max-height: 320px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding: 4px 0 12px;"></div>
        <div style="display: flex; gap: 8px;">
          <input class="form-input" id="chat-input" placeholder="Сообщение…" style="flex: 1;" onkeydown="if (event.key === 'Enter') sendChat('${name}')">
          <button class="btn btn-primary" onclick="sendChat('${name}')">Отправить</button>
        </div>`);
      renderChat(name);
      const inp = document.getElementById('chat-input');
      if (inp) inp.focus();
    }
    function renderChat(name) {
      const log = document.getElementById('chat-log');
      if (!log) return;
      const msgs = APP_STATE.chats[chatKey(name)] || [];
      log.innerHTML = msgs.map(function(m) {
        return `<div style="align-self: ${m.me ? 'flex-end' : 'flex-start'}; max-width: 80%; padding: 10px 14px; border-radius: 14px; font-size: 14px; line-height: 1.4; ${m.me ? 'background: var(--accent); color: #fff; border-bottom-right-radius: 4px;' : 'background: var(--bg); border-bottom-left-radius: 4px;'}">${m.text}<div style="font-size: 11px; opacity: 0.7; margin-top: 4px;">${new Date(m.t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</div></div>`;
      }).join('');
      log.scrollTop = log.scrollHeight;
    }
    function sendChat(name) {
      const input = document.getElementById('chat-input');
      const text = (input && input.value || '').trim();
      if (!text) return;
      const k = chatKey(name);
      if (!APP_STATE.chats[k]) APP_STATE.chats[k] = [];
      APP_STATE.chats[k].push({ me: true, text: text.replace(/</g, '&lt;'), t: Date.now() });
      input.value = '';
      persistChats(); renderChat(name);
      setTimeout(function() {
        const already = APP_STATE.chats[k].some(function(m) { return m.system; });
        if (already) return;
        APP_STATE.chats[k].push({ me: false, system: true, text: 'Сообщение доставлено. Менеджер ответит в рабочее время (Пн–Пт 9:00–18:00). Срочные вопросы — по телефону ' + OFFICE_PHONE + '.', t: Date.now() });
        persistChats(); renderChat(name);
      }, 900);
    }

    function headerSearch() {
      const input = document.getElementById('hdr-search-input');
      const q = (input.value || '').trim().toUpperCase();
      if (!q) return;
      const found = APP_STATE.shipments.find(s => s.id.toUpperCase() === q || s.id.toUpperCase().includes(q));
      if (found) {
        input.value = '';
        navigate('shipment-detail', null, found.id);
        showToast('success', 'Найдено', 'Открываем ' + found.id);
      } else {
        showToast('danger', 'Не найдено', 'Заявка ' + q + ' не найдена');
      }
    }

    function trackSearch() {
      const input = document.getElementById('tracking-search-input');
      const q = (input.value || '').trim().toUpperCase();
      if (!q) {
        showToast('warning', 'Введите номер', 'Укажите номер заявки в формате EX-XXXX');
        input.focus();
        return;
      }
      const found = APP_STATE.shipments.find(s => s.id.toUpperCase() === q);
      if (found) {
        showToast('success', 'Заявка найдена', `Открываем ${found.id}`);
        navigate('shipment-detail', null, found.id);
      } else {
        showToast('danger', 'Не найдено', `Заявка ${q} не найдена`);
      }
    }

    // Delegated actions for dynamically-rendered / repeated buttons
    document.addEventListener('click', function(e) {
      const btn = e.target.closest('button');
      if (btn && !btn.getAttribute('onclick') && !btn.closest('#modal')) {
        const label = btn.textContent.trim();
        if (label === 'Скачать') {
          const tr = btn.closest('tr');
          const name = tr && tr.querySelector('td') ? tr.querySelector('td').textContent.trim() : 'Документ';
          downloadDoc(name, APP_STATE.selectedShipmentId);
          return;
        }
        if (label.includes('Позвонить')) { callManager(currentManagerName()); return; }
        if (label.includes('Написать')) { messageManager(currentManagerName()); return; }
        if (label === 'Заказать услугу' || label === 'Получить консультацию') {
          const h = document.querySelector('#page-service-detail h1, #page-service-detail .rd-h1');
          const title = h ? h.textContent.trim() : 'Консультация';
          APP_STATE.requests.unshift({
            id: 'RQ-' + Math.floor(8000 + Math.random() * 2000), type: 'Услуга', title: title,
            client: profileClient(), phone: profilePhone(),
            created: new Date().toLocaleDateString('ru-RU'), status: 'new', detail: 'Заказ через каталог услуг'
          });
          persist();
          pushNotif('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg>', 'Заявка на услугу отправлена', title + ' — менеджер свяжется с вами в ближайшее время', null, null);
          showToast('success', 'Открываем WhatsApp', 'Продолжите диалог с менеджером в WhatsApp');
          openWhatsApp('Здравствуйте! Хочу заказать услугу «' + title + '» (заявка из EXIM Super App, ' + profileClient() + ').');
          return;
        }
      }
      const drop = e.target.closest('.file-upload');
      if (drop) {
        const picker = document.createElement('input');
        picker.type = 'file';
        picker.accept = '.pdf,.jpg,.jpeg,.png';
        picker.onchange = () => {
          if (picker.files.length) {
            showToast('success', 'Файл загружен', picker.files[0].name);
          }
        };
        picker.click();
      }
    });




    // ===== WhatsApp =====
    const WHATSAPP_PHONE = '77004949499'; // +7 700 494 94 99 — EXIM KZ
    function openWhatsApp(text) {
      const url = 'https://wa.me/' + WHATSAPP_PHONE + '?text=' + encodeURIComponent(text);
      window.open(url, '_blank');
    }
    // ===== Документы заявки (Supabase Storage) =====
    async function renderShipmentDocs(shipId) {
      const box = document.getElementById('ship-docs-' + shipId);
      if (!box || !window.__EXIM_DOCS) return;
      try {
        const files = await window.__EXIM_DOCS.list('shipments/' + shipId);
        if (!files.length) {
          box.innerHTML = '<div style="color:var(--muted);font-size:13.5px;padding:6px 2px;">Документов пока нет. Прикрепите инвойс, упаковочный лист или договор.</div>';
          return;
        }
        box.innerHTML = files.map(function(f) {
          const shown = f.name.replace(/^\d+_/, '');
          const ext = (f.name.split('.').pop() || '').toUpperCase().slice(0, 5);
          return '<div style="display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 12px;">' +
            '<span class="pill pill-info">' + ext + '</span>' +
            '<div style="flex: 1;"><div style="font-weight: 600; font-size: 14px;">' + shown + '</div>' +
            '<div style="font-size: 12px; color: var(--muted);">' + (f.created_at ? new Date(f.created_at).toLocaleDateString('ru-RU') : '') + ' · ' + shipId + '</div></div>' +
            '<button class="btn btn-ghost btn-sm" onclick="dlShipmentDoc(\'' + shipId + '\',\'' + f.name + '\')">Скачать</button>' +
            '<button class="btn btn-ghost btn-sm" style="color:var(--accent);" onclick="rmShipmentDoc(\'' + shipId + '\',\'' + f.name + '\')">Удалить</button>' +
            '</div>';
        }).join('');
      } catch (e) {
        box.innerHTML = '<div style="color:var(--muted);font-size:13.5px;">Не удалось загрузить документы</div>';
      }
    }
    function addShipmentDoc(shipId) {
      if (!window.__EXIM_DOCS) { showToast('warning', 'Хранилище не подключено', 'Обновите страницу (Cmd+Shift+R) и попробуйте снова'); return; }
      const picker = document.createElement('input');
      picker.type = 'file';
      picker.accept = '.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx';
      picker.onchange = async function() {
        if (!picker.files.length) return;
        const file = picker.files[0];
        if (file.size > 50 * 1024 * 1024) { showToast('warning', 'Файл слишком большой', 'Максимум 50 МБ'); return; }
        showToast('info', 'Загрузка…', file.name);
        try {
          await window.__EXIM_DOCS.upload(file, 'shipments/' + shipId);
          showToast('success', 'Документ прикреплён', file.name);
          renderShipmentDocs(shipId);
        } catch (e) { showToast('danger', 'Ошибка загрузки', (e && e.message) || ''); }
      };
      picker.click();
    }
    async function dlShipmentDoc(shipId, name) {
      try {
        const url = await window.__EXIM_DOCS.signedUrl('shipments/' + shipId + '/' + name);
        const a = document.createElement('a');
        a.href = url; a.download = name.replace(/^\d+_/, ''); a.target = '_blank';
        document.body.appendChild(a); a.click(); a.remove();
      } catch (e) { showToast('danger', 'Ошибка', 'Не удалось получить файл'); }
    }
    async function rmShipmentDoc(shipId, name) {
      if (!confirm('Удалить документ?')) return;
      try {
        await window.__EXIM_DOCS.remove('shipments/' + shipId + '/' + name);
        renderShipmentDocs(shipId);
      } catch (e) { showToast('danger', 'Ошибка', 'Не удалось удалить'); }
    }

    // ===== Документы профиля (Supabase Storage) =====
    async function renderProfileDocs() {
      const body = document.getElementById('profile-docs-body');
      if (!body || !window.__EXIM_DOCS) return;
      try {
        const files = await window.__EXIM_DOCS.list('profile');
        if (!files.length) {
          body.innerHTML = '<tr><td colspan="4" style="color:var(--muted);text-align:center;padding:24px;">Документов пока нет — добавьте первый</td></tr>';
          return;
        }
        body.innerHTML = files.map(function(f) {
          const ext = (f.name.split('.').pop() || '').toUpperCase().slice(0, 5);
          const d = f.created_at ? new Date(f.created_at).toLocaleDateString('ru-RU') : '—';
          const shown = f.name.replace(/^\d+_/, '');
          return '<tr>' +
            '<td>' + shown + '</td>' +
            '<td><span class="pill pill-info">' + ext + '</span></td>' +
            '<td>' + d + '</td>' +
            '<td style="white-space:nowrap;">' +
              '<button class="btn btn-ghost btn-sm" onclick="dlProfileDoc(\'' + f.name + '\')">Скачать</button> ' +
              '<button class="btn btn-ghost btn-sm" style="color:var(--accent);" onclick="rmProfileDoc(\'' + f.name + '\')">Удалить</button>' +
            '</td></tr>';
        }).join('');
      } catch (e) {
        body.innerHTML = '<tr><td colspan="4" style="color:var(--muted);text-align:center;padding:24px;">Не удалось загрузить список документов</td></tr>';
      }
    }
    function addProfileDoc() {
      if (!window.__EXIM_DOCS) { showToast('warning', 'Хранилище не подключено', 'Обновите страницу (Cmd+Shift+R) и попробуйте снова'); return; }
      const picker = document.createElement('input');
      picker.type = 'file';
      picker.accept = '.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx';
      picker.onchange = async function() {
        if (!picker.files.length) return;
        const file = picker.files[0];
        if (file.size > 50 * 1024 * 1024) { showToast('warning', 'Файл слишком большой', 'Максимальный размер — 50 МБ'); return; }
        showToast('info', 'Загрузка…', file.name);
        try {
          await window.__EXIM_DOCS.upload(file, 'profile');
          showToast('success', 'Документ загружен', file.name);
          renderProfileDocs();
        } catch (e) {
          showToast('danger', 'Ошибка загрузки', (e && e.message) || 'Попробуйте ещё раз');
        }
      };
      picker.click();
    }
    async function dlProfileDoc(name) {
      try {
        const url = await window.__EXIM_DOCS.signedUrl('profile/' + name);
        const a = document.createElement('a');
        a.href = url; a.download = name.replace(/^\d+_/, ''); a.target = '_blank';
        document.body.appendChild(a); a.click(); a.remove();
      } catch (e) { showToast('danger', 'Ошибка', 'Не удалось получить файл'); }
    }
    async function rmProfileDoc(name) {
      if (!confirm('Удалить документ?')) return;
      try {
        await window.__EXIM_DOCS.remove('profile/' + name);
        showToast('success', 'Удалено', 'Документ удалён');
        renderProfileDocs();
      } catch (e) { showToast('danger', 'Ошибка', 'Не удалось удалить'); }
    }

    // ===== Persistence =====
    const KZT_RATE = 475;
    function fmtKZT(usd) { return '₸ ' + Math.round(usd * KZT_RATE).toLocaleString('ru-RU'); }
    function persist() {
      try {
        localStorage.setItem('exim-data-v2', JSON.stringify({
          shipments: APP_STATE.shipments,
          containers: APP_STATE.containers,
          requests: APP_STATE.requests
        }));
      } catch (e) {}
    }
    function loadPersisted() {
      try {
        const raw = localStorage.getItem('exim-data-v2');
        if (!raw) return;
        const d = JSON.parse(raw);
        if (d.shipments) APP_STATE.shipments = d.shipments;
        if (d.containers) APP_STATE.containers = d.containers;
        if (d.requests) APP_STATE.requests = d.requests;
      } catch (e) {}
    }

    // ===== Login =====
    let loginRole = 'client';
    function selectLoginRole(role) {
      loginRole = role;
      document.querySelectorAll('.login-role-btn').forEach(b => b.classList.toggle('active', b.dataset.loginRole === role));
    }
    function doLogin() {
      return; // авторизация выполняется через Supabase (/login)
      const user = document.getElementById('login-user').value.trim();
      if (!user) { showToast('warning', 'Введите данные', 'Укажите телефон или email'); return; }
      document.getElementById('login-screen').classList.add('hidden');
      try { localStorage.setItem('exim-logged', '1'); localStorage.setItem('exim-role', loginRole); } catch (e) {}
      switchRoleTo(loginRole);
      showToast('success', 'Вход выполнен', `Добро пожаловать, ${loginRole === 'client' ? 'клиент' : 'менеджер'}!`);
    }
    function switchRoleTo(role) {
      APP_STATE.currentRole = role;
      document.body.setAttribute('data-role', role);
      document.querySelectorAll('.role-switcher button').forEach((btn, i) => {
        btn.classList.toggle('active', (role === 'client' && i === 0) || (role === 'manager' && i === 1) || (role === 'logist' && i === 2));
      });
      navigate(role === 'client' ? 'dashboard' : 'inbox');
    }

    // ===== Container catalog =====
    const CNT_STATUS = {
      available: { label: 'В наличии', cls: 'pill-accent' },
      reserved:  { label: 'В резерве', cls: 'pill-warning' },
      sold:      { label: 'Продан', cls: 'pill-info' }
    };
    function renderContainers() {
      const box = document.getElementById('containers-list');
      const f = APP_STATE.containerFilter || 'all';
      const list = APP_STATE.containers.filter(c => {
        if (f === 'all') return true;
        if (f === 'available') return c.status === 'available';
        return c.type === f;
      });
      box.innerHTML = list.map(c => {
        const st = CNT_STATUS[c.status];
        return `
        <div class="cnt-card" onclick="navigate('container-detail', null, '${c.id}')">
          <div class="cnt-photo" style="background:linear-gradient(135deg, ${c.tone}, #1E293B);">
            <div class="cnt-doors"></div>
            <span class="pill ${st.cls} cnt-status">${st.label}</span>
          </div>
          <div class="cnt-body">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span class="mono" style="font-size:12px;color:var(--muted);">${c.id}</span>
              <span style="font-size:12px;color:var(--muted);">${c.year} г.</span>
            </div>
            <div style="font-weight:700;font-size:17px;">${c.typeLabel}</div>
            <div style="font-size:13px;color:var(--muted);"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ${c.city} · ${c.condition}</div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
              <span class="mono" style="font-size:20px;font-weight:700;color:var(--accent);">${fmtKZT(c.price)}</span>
              <span class="svc-arrow">→</span>
            </div>
          </div>
        </div>`;
      }).join('') || `<div style="padding:40px;color:var(--muted);text-align:center;grid-column:1/-1;">Нет контейнеров по фильтру</div>`;
    }
    function filterContainers(f, event) {
      if (event && event.currentTarget) {
        event.currentTarget.parentElement.querySelectorAll('.rd-tab').forEach(t => t.classList.remove('active'));
        event.currentTarget.classList.add('active');
      }
      APP_STATE.containerFilter = f;
      renderContainers();
    }
    function renderContainerDetail(id) {
      const c = APP_STATE.containers.find(x => x.id === (id || APP_STATE.selectedContainerId));
      if (!c) return;
      const st = CNT_STATUS[c.status];
      const specs = [
        ['Тип', c.typeLabel], ['Год выпуска', c.year + ' г.'], ['Состояние', c.condition],
        ['Город', c.city], ['Внутр. объём', c.type === 'reefer' ? '28 м³' : c.type.startsWith('40') ? '67 м³' : '33 м³'],
        ['Макс. загрузка', c.type.startsWith('40') ? '28 500 кг' : '21 700 кг']
      ];
      document.getElementById('container-detail-content').innerHTML = `
        <div class="grid grid-2">
          <div>
            <div class="cnt-photo" style="height:320px;border-radius:20px;background:linear-gradient(135deg, ${c.tone}, #1E293B);">
              <div class="cnt-doors"></div>
              <span class="pill ${st.cls} cnt-status" style="top:16px;left:16px;">${st.label}</span>
            </div>
          </div>
          <div>
            <span class="mono" style="font-size:13px;color:var(--muted);">${c.id}</span>
            <h1 class="rd-h1" style="font-size:30px;margin:6px 0 4px;">${c.typeLabel}</h1>
            <div class="mono" style="font-size:30px;font-weight:700;color:var(--accent);margin-bottom:20px;">${fmtKZT(c.price)}</div>
            <div class="grid grid-2" style="gap:14px;margin-bottom:24px;">
              ${specs.map(s => `<div><div style="font-size:12px;color:var(--muted);">${s[0]}</div><div style="font-weight:600;">${s[1]}</div></div>`).join('')}
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              ${c.status === 'available'
                ? `<button class="btn btn-primary btn-lg" onclick="buyContainer('${c.id}')">Купить · оставить заявку</button>`
                : `<button class="btn btn-secondary btn-lg" disabled aria-disabled="true">${st.label}</button>`}
              <button class="btn btn-secondary btn-lg" onclick="callManager('Отдел контейнеров')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.34 1.78.66 2.62a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.46-1.23a2 2 0 0 1 2.11-.45c.84.32 1.72.54 2.62.66A2 2 0 0 1 22 16.92z"/></svg> Связаться</button>
            </div>
          </div>
        </div>`;
    }
    function buyContainer(id) {
      const c = APP_STATE.containers.find(x => x.id === id);
      if (!c) return;
      c.status = 'reserved';
      const rq = {
        id: 'RQ-' + Math.floor(8000 + Math.random() * 2000),
        type: 'Контейнер',
        title: `Покупка ${c.id} (${c.typeLabel}, ${c.city})`,
        client: profileClient(), phone: profilePhone(),
        created: new Date().toLocaleDateString('ru-RU'), status: 'new',
        detail: `Цена ${fmtKZT(c.price)} · состояние ${c.condition.toLowerCase()}`
      };
      APP_STATE.requests.unshift(rq);
      persist();
      showToast('success', 'Заявка создана', `${rq.id} отправлена менеджеру. Контейнер в резерве.`);
      navigate('containers');
    }
    function openSellContainer() {
      openModal('Продать контейнер компании', `
        <div class="form-group"><label class="form-label">Тип контейнера</label>
          <select class="form-input" id="sell-type"><option>20' DC</option><option>40' DC</option><option>40' HC</option><option>Рефрижератор</option></select></div>
        <div class="grid grid-2" style="gap:14px;">
          <div class="form-group"><label class="form-label">Город</label><input class="form-input" id="sell-city" placeholder="Алматы"></div>
          <div class="form-group"><label class="form-label">Год выпуска</label><input class="form-input" id="sell-year" placeholder="2020"></div>
        </div>
        <div class="grid grid-2" style="gap:14px;">
          <div class="form-group"><label class="form-label">Состояние</label>
            <select class="form-input" id="sell-cond"><option>Отличное</option><option>Хорошее</option><option>Удовл.</option></select></div>
          <div class="form-group"><label class="form-label">Желаемая цена, ₸</label><input class="form-input" id="sell-price" placeholder="1 200 000"></div>
        </div>
        <button class="btn btn-primary btn-lg" style="width:100%;margin-top:8px;" onclick="submitSellContainer()">Отправить на оценку</button>
      `);
    }
    function submitSellContainer() {
      const city = document.getElementById('sell-city').value.trim() || 'Алматы';
      const type = document.getElementById('sell-type').value;
      const rq = {
        id: 'RQ-' + Math.floor(8000 + Math.random() * 2000), type: 'Контейнер',
        title: `Продажа контейнера ${type} (${city})`, client: profileClient(), phone: profilePhone(),
        created: new Date().toLocaleDateString('ru-RU'), status: 'new',
        detail: `Оценка · ${document.getElementById('sell-cond').value} · ${document.getElementById('sell-price').value ? '₸ ' + document.getElementById('sell-price').value : 'цена не указана'}`
      };
      APP_STATE.requests.unshift(rq);
      persist();
      closeModal();
      showToast('success', 'Заявка отправлена', `${rq.id} — менеджер свяжется для оценки.`);
    }

    // ===== Manager inbox =====
    const RQ_STATUS = {
      new:      { label: 'Новая', cls: 'pill-accent' },
      progress: { label: 'В работе', cls: 'pill-warning' },
      done:     { label: 'Закрыта', cls: 'pill-info' }
    };
    function renderInbox() {
      const box = document.getElementById('inbox-list');
      const f = APP_STATE.inboxFilter || 'all';
      const list = APP_STATE.requests.filter(r => f === 'all' ? true : r.status === f);
      document.getElementById('inbox-new').textContent = APP_STATE.requests.filter(r => r.status === 'new').length;
      document.getElementById('inbox-progress').textContent = APP_STATE.requests.filter(r => r.status === 'progress').length;
      document.getElementById('inbox-done').textContent = APP_STATE.requests.filter(r => r.status === 'done').length;
      const doneN = APP_STATE.requests.filter(r => r.status === 'done').length;
      const progN = APP_STATE.requests.filter(r => r.status === 'progress').length;
      const newN = APP_STATE.requests.filter(r => r.status === 'new').length;
      const totalN = APP_STATE.requests.length;
      const setK = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      setK('inbox-conv', totalN ? Math.round(doneN / totalN * 100) + '%' : '—');
      const pct = totalN ? Math.round((doneN + progN) / totalN * 100) : 0;
      setK('kpi-plan-pct', pct + '%');
      const bar = document.getElementById('kpi-plan-bar');
      if (bar) bar.style.width = pct + '%';
      setK('kpi-closed', doneN);
      setK('kpi-inwork', progN);
      setK('kpi-new', newN);
      setK('kpi-margin-sum', fmtKZT(APP_STATE.shipments.filter(s => s.paid).reduce((s2, x) => s2 + (x.margin || 0), 0)));
      renderTasks();
      box.innerHTML = list.map(r => {
        const st = RQ_STATUS[r.status];
        return `
        <div class="inbox-row">
          <div class="inbox-new-dot" style="${r.status === 'new' ? '' : 'visibility:hidden;'}"></div>
          <div>
            <div style="display:flex;align-items:center;gap:8px;"><span class="mono" style="font-size:12px;color:var(--muted);">${r.id}</span><span class="pill pill-info" style="font-size:11px;">${r.type}</span></div>
            <div style="font-weight:600;margin-top:4px;">${r.title}</div>
            <div style="font-size:13px;color:var(--muted);">${r.detail}</div>
          </div>
          <div>
            <div style="font-weight:600;font-size:14px;">${r.client}</div>
            <div class="mono" style="font-size:13px;color:var(--muted);">${r.phone}</div>
            <div style="font-size:12px;color:var(--muted);">${r.created}</div>
          </div>
          <div><span class="pill ${st.cls}">${st.label}</span></div>
          <div style="display:flex;flex-direction:column;gap:6px;min-width:150px;">
            ${r.status === 'new' ? `<button class="btn btn-primary btn-sm" onclick="acceptRequest('${r.id}')">Принять в работу</button>` : ''}
            ${r.status === 'progress' ? `<button class="btn btn-primary btn-sm" onclick="closeRequest('${r.id}')">Закрыть заявку</button>` : ''}
            <button class="btn btn-secondary btn-sm" onclick="messageManager('${r.client}')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Клиенту</button>
          </div>
        </div>`;
      }).join('') || `<div style="padding:40px;color:var(--muted);text-align:center;">Нет заявок по фильтру</div>`;
    }
    // ===== Manager tasks (persisted) =====
    function loadTasks() { try { APP_STATE.tasks = JSON.parse(localStorage.getItem('exim-tasks') || '[]'); } catch (e) { APP_STATE.tasks = []; } }
    function persistTasks() { try { localStorage.setItem('exim-tasks', JSON.stringify(APP_STATE.tasks)); } catch (e) {} }
    function renderTasks() {
      const box = document.getElementById('tasks-list');
      if (!box) return;
      if (!APP_STATE.tasks) loadTasks();
      box.innerHTML = (APP_STATE.tasks.map((it, i) => `
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:6px 0;">
          <input type="checkbox" ${it.done ? 'checked' : ''} onchange="toggleTask(${i}, this.checked)">
          <span style="flex:1;${it.done ? 'text-decoration:line-through;color:var(--muted);' : ''}">${it.t}</span>
          <button class="btn btn-ghost btn-sm" onclick="removeTask(${i})" title="Удалить">×</button>
        </label>`).join('') || `<div style="color:var(--muted);font-size:14px;padding:4px 0 6px;">Задач пока нет</div>`) + `
        <div style="display:flex;gap:8px;margin-top:8px;">
          <input class="form-input" id="task-input" placeholder="Новая задача…" style="flex:1;" onkeydown='if (event.key === "Enter") addTask()'>
          <button class="btn btn-secondary" onclick="addTask()">+</button>
        </div>`;
    }
    function addTask() {
      const inp = document.getElementById('task-input');
      const t = (inp && inp.value || '').trim();
      if (!t) return;
      APP_STATE.tasks.push({ t: t.replace(/</g, '&lt;'), done: false });
      persistTasks(); renderTasks();
    }
    function toggleTask(i, on) { if (APP_STATE.tasks[i]) { APP_STATE.tasks[i].done = on; persistTasks(); renderTasks(); } }
    function removeTask(i) { APP_STATE.tasks.splice(i, 1); persistTasks(); renderTasks(); }

    function filterInbox(f, event) {
      if (event && event.currentTarget) {
        event.currentTarget.parentElement.querySelectorAll('.rd-tab').forEach(t => t.classList.remove('active'));
        event.currentTarget.classList.add('active');
      }
      APP_STATE.inboxFilter = f;
      renderInbox();
    }
    function acceptRequest(id) {
      const r = APP_STATE.requests.find(x => x.id === id);
      if (r) { r.status = 'progress'; persist(); renderInbox(); showToast('success', 'Принято в работу', `${id} — статус изменён на «В работе».`); }
    }
    function closeRequest(id) {
      const r = APP_STATE.requests.find(x => x.id === id);
      if (r) { r.status = 'done'; persist(); renderInbox(); showToast('success', 'Заявка закрыта', `${id} — оформлена и закрыта.`); }
    }

    // ===== i18n (RU/KZ/EN/ZH) =====
    const I18N = {
      'nav.home':       { ru: 'Главная', kz: 'Басты бет', en: 'Home', zh: '主页' },
      'nav.shipments':  { ru: 'Перевозки', kz: 'Тасымалдар', en: 'Shipments', zh: '运输' },
      'nav.tracking':   { ru: 'Отслеживание', kz: 'Бақылау', en: 'Tracking', zh: '追踪' },
      'nav.containers': { ru: 'Контейнеры', kz: 'Контейнерлер', en: 'Containers', zh: '集装箱' },
      'nav.services':   { ru: 'Услуги', kz: 'Қызметтер', en: 'Services', zh: '服务' },
      'nav.inbox':      { ru: 'Входящие', kz: 'Кіріс өтінімдер', en: 'Inbox', zh: '收件箱' },
      'nav.margin':     { ru: 'Маржа', kz: 'Маржа', en: 'Margin', zh: '利润' },
      'qa.request':     { ru: 'Оставить заявку', kz: 'Өтінім қалдыру', en: 'New request', zh: '提交申请' },
      'qa.calc':        { ru: 'Рассчитать перевозку', kz: 'Тасымалды есептеу', en: 'Calculate shipping', zh: '运费计算' },
      'qa.buy':         { ru: 'Купить контейнер', kz: 'Контейнер сатып алу', en: 'Buy a container', zh: '购买集装箱' },
      'qa.contact':     { ru: 'Связаться с менеджером', kz: 'Менеджермен байланысу', en: 'Contact a manager', zh: '联系经理' },
      'dash.eyebrow':   { ru: 'Обзор перевозок', kz: 'Тасымалдарға шолу', en: 'Shipments overview', zh: '运输概览' },
      'dash.title':     {
        ru: 'Груз под контролем,<br><span style="color: var(--accent);">от порта до двери.</span>',
        kz: 'Жүк бақылауда,<br><span style="color: var(--accent);">порттан есікке дейін.</span>',
        en: 'Cargo in control,<br><span style="color: var(--accent);">from port to door.</span>',
        zh: '货物尽在掌控，<br><span style="color: var(--accent);">从港口到门口。</span>'
      },
      // Shipments
      'ship.eyebrow':   { ru: 'Все заявки', kz: 'Барлық өтінімдер', en: 'All requests', zh: '所有申请' },
      'ship.title':     { ru: 'Мои перевозки', kz: 'Менің тасымалдарым', en: 'My shipments', zh: '我的运输' },
      'btn.newRequest': { ru: '+ Новая заявка', kz: '+ Жаңа өтінім', en: '+ New request', zh: '+ 新申请' },
      // Tracking
      'track.eyebrow':  { ru: 'Отслеживание в реальном времени', kz: 'Нақты уақыттағы бақылау', en: 'Real-time tracking', zh: '实时追踪' },
      'track.title':    { ru: 'Где мой груз?', kz: 'Жүгім қайда?', en: 'Where is my cargo?', zh: '我的货物在哪？' },
      // Containers
      'cnt.eyebrow':    { ru: 'Контейнерный рынок', kz: 'Контейнер нарығы', en: 'Container marketplace', zh: '集装箱市场' },
      'cnt.title':      { ru: 'Каталог контейнеров', kz: 'Контейнерлер каталогы', en: 'Container catalog', zh: '集装箱目录' },
      'cnt.sell':       { ru: '+ Продать контейнер', kz: '+ Контейнер сату', en: '+ Sell a container', zh: '+ 出售集装箱' },
      // Services
      'svc.eyebrow':    { ru: 'Услуги EXIM', kz: 'EXIM қызметтері', en: 'EXIM services', zh: 'EXIM 服务' },
      'svc.title':      { ru: 'Всё для импорта,<br><span style="color: var(--accent);">в одном окне.</span>', kz: 'Импортқа қажеттің бәрі,<br><span style="color: var(--accent);">бір терезеде.</span>', en: 'Everything for import,<br><span style="color: var(--accent);">in one place.</span>', zh: '进口所需的一切，<br><span style="color: var(--accent);">尽在一处。</span>' },
      'svc.order':      { ru: '+ Заказать перевозку', kz: '+ Тасымалға тапсырыс', en: '+ Order shipping', zh: '+ 预订运输' },
      // Inbox
      'inbox.eyebrow':  { ru: 'Рабочее место менеджера', kz: 'Менеджердің жұмыс орны', en: 'Manager workspace', zh: '经理工作台' },
      'inbox.title':    { ru: 'Входящие заявки', kz: 'Кіріс өтінімдер', en: 'Incoming requests', zh: '收到的申请' },
      // Notifications
      'notif.eyebrow':  { ru: 'Центр уведомлений', kz: 'Хабарламалар орталығы', en: 'Notification center', zh: '通知中心' },
      'notif.title':    { ru: 'Уведомления', kz: 'Хабарламалар', en: 'Notifications', zh: '通知' },
      'notif.readAll':  { ru: 'Прочитать все', kz: 'Барлығын оқу', en: 'Mark all read', zh: '全部已读' },
      // Profile
      'prof.eyebrow':   { ru: 'Личный кабинет', kz: 'Жеке кабинет', en: 'Account', zh: '个人中心' },
      'prof.title':     { ru: 'Профиль компании', kz: 'Компания профилі', en: 'Company profile', zh: '公司资料' },
      // Margin
      'margin.eyebrow': { ru: 'Аналитика', kz: 'Аналитика', en: 'Analytics', zh: '分析' },
      'margin.title':   { ru: 'Маржа', kz: 'Маржа', en: 'Margin', zh: '利润' },
      // Login
      'login.eyebrow':  { ru: 'Вход в систему', kz: 'Жүйеге кіру', en: 'Sign in', zh: '登录系统' },
      'login.welcome':  { ru: 'Добро пожаловать', kz: 'Қош келдіңіз', en: 'Welcome', zh: '欢迎' },
      'login.as':       { ru: 'Войти как', kz: 'Кім ретінде кіру', en: 'Sign in as', zh: '登录身份' },
      'login.client':   { ru: 'Клиент', kz: 'Клиент', en: 'Client', zh: '客户' },
      'login.manager':  { ru: 'Менеджер', kz: 'Менеджер', en: 'Manager', zh: '经理' },
      'login.userLabel':{ ru: 'Телефон или email', kz: 'Телефон немесе email', en: 'Phone or email', zh: '电话或邮箱' },
      'login.passLabel':{ ru: 'Пароль', kz: 'Құпия сөз', en: 'Password', zh: '密码' },
      'login.submit':   { ru: 'Войти', kz: 'Кіру', en: 'Sign in', zh: '登录' },
      'login.demo':     { ru: 'Демо-доступ · данные предзаполнены', kz: 'Демо-қатынау · деректер алдын ала толтырылған', en: 'Demo access · fields pre-filled', zh: '演示访问 · 已预填' },
      'login.lead':     { ru: 'Заявки на перевозку, отслеживание в реальном времени, каталог контейнеров и прямая связь с менеджером — в одном приложении.', kz: 'Тасымалдау өтінімдері, нақты уақыттағы бақылау, контейнерлер каталогы және менеджермен тікелей байланыс — бір қосымшада.', en: 'Shipping requests, real-time tracking, a container catalog and direct manager contact — in one app.', zh: '运输申请、实时追踪、集装箱目录和经理直连——尽在一个应用中。' },
      'login.hero':     {
        ru: 'Груз под контролем,<br>от порта до двери.',
        kz: 'Жүк бақылауда,<br>порттан есікке дейін.',
        en: 'Cargo in control,<br>from port to door.',
        zh: '货物尽在掌控，<br>从港口到门口。'
      },
      'login.stat1':    { ru: 'перевозок', kz: 'тасымал', en: 'shipments', zh: '运输' },
      'login.stat2':    { ru: 'средний срок', kz: 'орташа мерзім', en: 'avg. time', zh: '平均时长' },
      'login.stat3':    { ru: 'поддержка', kz: 'қолдау', en: 'support', zh: '支持' },
      // Roles
      'role.client':    { ru: 'Клиент', kz: 'Клиент', en: 'Client', zh: '客户' },
      'role.manager':   { ru: 'Менеджер', kz: 'Менеджер', en: 'Manager', zh: '经理' },
      'role.logist':    { ru: 'Логист', kz: 'Логист', en: 'Logistics', zh: '物流' },
      // Dashboard KPI
      'kpi.active':     { ru: 'активных перевозок', kz: 'белсенді тасымал', en: 'active shipments', zh: '进行中运输' },
      'kpi.transit':    { ru: 'в пути сейчас', kz: 'жолда қазір', en: 'in transit now', zh: '在途中' },
      'kpi.value':      { ru: 'стоимость грузов', kz: 'жүк құны', en: 'cargo value', zh: '货物价值' },
      'kpi.term':       { ru: 'средний срок доставки', kz: 'орташа жеткізу мерзімі', en: 'avg. delivery time', zh: '平均送达时长' },
      // Filter tabs
      'flt.all':        { ru: 'Все', kz: 'Барлығы', en: 'All', zh: '全部' },
      'flt.transit':    { ru: 'В пути', kz: 'Жолда', en: 'In transit', zh: '在途' },
      'flt.customs':    { ru: 'На таможне', kz: 'Кеденде', en: 'At customs', zh: '清关中' },
      'flt.delivered':  { ru: 'Доставлено', kz: 'Жеткізілді', en: 'Delivered', zh: '已送达' }
    };
    function setLang(lang, event) {
      APP_STATE.lang = lang;
      try { localStorage.setItem('exim-lang', lang); } catch (e) {}
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const k = el.getAttribute('data-i18n');
        if (I18N[k] && I18N[k][lang]) el.textContent = I18N[k][lang];
      });
      document.querySelectorAll('[data-i18n-html]').forEach(el => {
        const k = el.getAttribute('data-i18n-html');
        if (I18N[k] && I18N[k][lang]) el.innerHTML = I18N[k][lang];
      });
      document.querySelectorAll('#lang-switch button').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
      const names = { ru: 'Русский язык', kz: 'Қазақ тілі', en: 'English', zh: '中文' };
      if (event) showToast('info', 'Язык · Language', names[lang]);
    }

    // ===== Theme =====
    function toggleTheme() {
      const dark = document.body.getAttribute('data-theme') !== 'dark';
      applyTheme(dark ? 'dark' : 'light');
      if (APP_STATE.currentPage === 'tracking') renderTracking();
    }
    function applyTheme(mode) {
      if (mode === 'dark') document.body.setAttribute('data-theme', 'dark');
      else document.body.removeAttribute('data-theme');
      try { localStorage.setItem('exim-theme', mode); } catch (e) {}
    }

    // ===== Init =====
    function initApp() {
      let saved = 'light';
      try { saved = localStorage.getItem('exim-theme') || 'light'; } catch (e) {}
      applyTheme(saved);

      loadPersisted();
      loadProfile();
      loadSettings();
      loadNotifs();
      loadChats();
      updateNotifBadge();

      let lang = 'ru';
      try { lang = localStorage.getItem('exim-lang') || 'ru'; } catch (e) {}
      setLang(lang);

      // Auth: сессия и роль приходят из Next.js / Supabase
      const exim = window.__EXIM || { role: 'client' };
      if ((exim.role || 'client') === 'client') {
        document.querySelectorAll('.role-switcher').forEach(function(el) { el.style.display = 'none'; });
      }
      switchRoleTo(exim.role === 'manager' || exim.role === 'logist' || exim.role === 'admin' ? (exim.role === 'admin' ? 'manager' : exim.role) : 'client');
      updateFormStep();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApp);
    else initApp();