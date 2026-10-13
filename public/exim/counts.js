// Wave 2b: one server-backed source of counters and shared screen states.
(function () {
  'use strict';
  // Группы статусов заявки. «Закрыто» — любой финальный исход; успешный исход —
  // только converted (создана перевозка). Метрика конверсии и план продаж в Product OS
  // не утверждены, поэтому здесь не вычисляются.
  var GROUPS = {
    new: ['new'],
    progress: ['clarification', 'assigned', 'calculated', 'offer_sent', 'approved', 'contract_signed'],
    done: ['converted', 'rejected', 'archived']
  };
  var ACTIVE_TRANSPORT_EXCLUDED = ['delivered', 'archived'];

  function countOrders(orders, transports) {
    var c = { total: 0, new: 0, progress: 0, done: 0, converted: 0, rejected: 0, archived: 0, activeTransports: 0 };
    (orders || []).forEach(function (o) {
      if (o.status === 'draft') return;
      c.total++;
      Object.keys(GROUPS).forEach(function (g) { if (GROUPS[g].indexOf(o.status) >= 0) c[g]++; });
      if (o.status === 'converted' || o.status === 'rejected' || o.status === 'archived') c[o.status]++;
    });
    (transports || []).forEach(function (t) {
      if (ACTIVE_TRANSPORT_EXCLUDED.indexOf(t.status) < 0) c.activeTransports++;
    });
    return c;
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return '&#' + ch.charCodeAt(0) + ';'; }); }

  // kind: loading | empty | error | forbidden | notfound
  var TEXT = {
    loading: 'Загрузка…', empty: 'Пока ничего нет', error: 'Не удалось загрузить данные',
    forbidden: 'Нет доступа к этому разделу', notfound: 'Не найдено'
  };
  function stateHtml(kind, msg, retryFn) {
    var id = '__eximRetry_' + Math.random().toString(36).slice(2, 10);
    if (retryFn) window[id] = function () { delete window[id]; retryFn(); };
    return '<div class="exim-state exim-state-' + esc(kind) + '" role="' + (kind === 'error' ? 'alert' : 'status') + '" style="padding:32px 16px;text-align:center;color:var(--muted);">' +
      '<div>' + esc(msg || TEXT[kind] || '') + '</div>' +
      (retryFn ? '<button class="btn btn-secondary btn-sm" style="margin-top:12px;" onclick="' + id + '()">Повторить</button>' : '') + '</div>';
  }
  function classify(err) {
    var code = err && (err.code || err.status);
    if (code === '42501' || code === 403 || code === 401) return 'forbidden';
    return 'error';
  }

  function setText(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }

  async function load() {
    if (!window.WF || !window.WF.getData) throw new Error('workflow not ready');
    var d = await window.WF.getData();
    return countOrders(d.orders, d.transports);
  }

  var LABEL = { new: 'Новая', clarification: 'На уточнении', assigned: 'На расчёте', calculated: 'Расчёт готов',
    offer_sent: 'Предложение у клиента', approved: 'Согласована', contract_signed: 'Договор', converted: 'Перевозка создана',
    rejected: 'Отклонена', archived: 'Архив' };
  var UNSET = 'Метрика не утверждена в Product OS';

  async function paintInbox() {
    var box = document.getElementById('inbox-list');
    if (!box || !window.__SUPA) return;
    ['inbox-new', 'inbox-progress', 'inbox-done', 'kpi-new', 'kpi-inwork', 'kpi-closed'].forEach(function (k) { setText(k, '…'); });
    box.innerHTML = stateHtml('loading');
    var d;
    try {
      if (!window.WF || !window.WF.getData) throw new Error('workflow not ready');
      d = await window.WF.getData();
    } catch (e) {
      ['inbox-new', 'inbox-progress', 'inbox-done', 'kpi-new', 'kpi-inwork', 'kpi-closed'].forEach(function (k) { setText(k, '—'); });
      box.innerHTML = stateHtml(classify(e), null, paintInbox);
      return;
    }
    var c = countOrders(d.orders, d.transports);
    setText('inbox-new', c.new); setText('inbox-progress', c.progress); setText('inbox-done', c.done);
    setText('kpi-new', c.new); setText('kpi-inwork', c.progress); setText('kpi-closed', c.done);
    ['inbox-conv', 'kpi-plan-pct'].forEach(function (k) {
      var el = document.getElementById(k); if (el) { el.textContent = '—'; el.title = UNSET; }
    });
    var bar = document.getElementById('kpi-plan-bar'); if (bar) bar.style.width = '0%';
    var f = (typeof APP_STATE !== 'undefined' && APP_STATE.inboxFilter) || 'all';
    var rows = (d.orders || []).filter(function (o) {
      if (o.status === 'draft') return false;
      if (f === 'all') return true;
      return (GROUPS[f] || []).indexOf(o.status) >= 0;
    });
    // пустота показывается только после успешного ответа сервера
    if (!rows.length) { box.innerHTML = stateHtml('empty', c.total ? 'Нет заявок по фильтру' : 'Заявок пока нет'); return; }
    box.innerHTML = rows.map(function (o) {
      return '<div class="inbox-row" role="link" tabindex="0" style="cursor:pointer;" onclick="EXIM_COUNTS.openOrder(\'' + esc(o.id) + '\')">' +
        '<div class="inbox-new-dot" style="' + (o.status === 'new' ? '' : 'visibility:hidden;') + '"></div>' +
        '<div><span class="mono" style="font-size:12px;color:var(--muted);">' + esc(o.ref) + '</span>' +
        '<div style="font-weight:600;margin-top:4px;">' + esc(o.origin) + ' → ' + esc(o.destination) + '</div>' +
        '<div style="font-size:13px;color:var(--muted);">' + esc(o.cargo || '') + '</div></div>' +
        '<div><span class="pill pill-info">' + esc(LABEL[o.status] || o.status) + '</span></div></div>';
    }).join('');
  }

  function openOrder(id) {
    if (window.__EXIM_ROUTER && window.__EXIM_ROUTER.go) window.__EXIM_ROUTER.go('order', id);
  }

  async function paintRdStatus() {
    var line = document.getElementById('rd-status-line');
    if (!line || !window.__SUPA) return;
    try {
      var c = await load();
      var n = c.activeTransports;
      line.innerHTML = n ? 'Активных перевозок: <span style="color: var(--accent);" class="mono">' + n + '</span>'
        : 'Активных перевозок <span style="color: var(--accent);">нет</span>';
    } catch (e) {
      line.textContent = 'Не удалось загрузить статус';
    }
  }

  window.EXIM_COUNTS = { countOrders: countOrders, GROUPS: GROUPS, load: load, openOrder: openOrder };
  window.EXIM_STATE = { html: stateHtml, classify: classify };

  if (typeof window.renderInbox === 'function') {
    var origInbox = window.renderInbox;
    window.renderInbox = function () { if (window.__SUPA) return paintInbox(); return origInbox.apply(this, arguments); };
  }
  if (typeof window.renderRdStatus === 'function') {
    var origRd = window.renderRdStatus;
    window.renderRdStatus = function () { origRd.apply(this, arguments); return paintRdStatus(); };
  }
})();
