// Wave 2b: one server-backed source of counters and shared screen states.
(function () {
  'use strict';
  var GROUPS = {
    new: ['new'],
    progress: ['clarification', 'assigned', 'calculated', 'offer_sent', 'approved', 'contract_signed'],
    done: ['converted', 'rejected', 'archived']
  };
  var ACTIVE_TRANSPORT_EXCLUDED = ['delivered', 'archived'];

  function countOrders(orders, transports) {
    var c = { total: 0, new: 0, progress: 0, done: 0, activeTransports: 0 };
    (orders || []).forEach(function (o) {
      if (o.status === 'draft') return;
      c.total++;
      Object.keys(GROUPS).forEach(function (g) { if (GROUPS[g].indexOf(o.status) >= 0) c[g]++; });
    });
    (transports || []).forEach(function (t) {
      if (ACTIVE_TRANSPORT_EXCLUDED.indexOf(t.status) < 0) c.activeTransports++;
    });
    c.conversion = c.total ? Math.round(c.done / c.total * 100) : null;
    return c;
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return '&#' + ch.charCodeAt(0) + ';'; }); }

  // kind: loading | empty | error | forbidden | notfound
  var TEXT = {
    loading: 'Загрузка…', empty: 'Пока ничего нет', error: 'Не удалось загрузить данные',
    forbidden: 'Нет доступа к этому разделу', notfound: 'Не найдено'
  };
  function stateHtml(kind, msg, retryFn) {
    var id = 'st-retry-' + Math.random().toString(36).slice(2, 8);
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

  async function paintInbox() {
    var box = document.getElementById('inbox-list');
    if (!box || !window.__SUPA) return;
    ['inbox-new', 'inbox-progress', 'inbox-done', 'inbox-conv'].forEach(function (k) { setText(k, '…'); });
    box.innerHTML = stateHtml('loading');
    try {
      var c = await load();
      setText('inbox-new', c.new); setText('inbox-progress', c.progress); setText('inbox-done', c.done);
      setText('inbox-conv', c.conversion == null ? '—' : c.conversion + '%');
      setText('kpi-new', c.new); setText('kpi-inwork', c.progress); setText('kpi-closed', c.done);
      var pct = c.total ? Math.round((c.done + c.progress) / c.total * 100) : 0;
      setText('kpi-plan-pct', pct + '%');
      var bar = document.getElementById('kpi-plan-bar'); if (bar) bar.style.width = pct + '%';
      box.innerHTML = c.total
        ? stateHtml('empty', 'Заявок: ' + c.total + '. Работа с ними — в разделе «Заявки».')
        : stateHtml('empty', 'Заявок пока нет');
    } catch (e) {
      ['inbox-new', 'inbox-progress', 'inbox-done', 'inbox-conv'].forEach(function (k) { setText(k, '—'); });
      box.innerHTML = stateHtml(classify(e), null, paintInbox);
    }
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

  window.EXIM_COUNTS = { countOrders: countOrders, GROUPS: GROUPS, load: load };
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
