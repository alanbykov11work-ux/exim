/* EXIM — серверный режим (TASK-2026-001, Codex review 2026-10-08 п.5)
 *
 * В авторизованном режиме (есть сессия Supabase) экраны перевозок читают
 * только серверные перевозки из WF.getData(), а не демонстрационные данные
 * из localStorage. Пустой список показывается только после успешного ответа;
 * ошибка показывает состояние ошибки с «Повторить». Демонстрационные действия
 * (создание перевозки без заявки, оплата, маржа по демо-данным) отключены.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.__SUPA) return;

  var STATUS_MAP = { preparing: 'pending', loading: 'loading', in_transit: 'transit', customs: 'customs',
    delivering: 'transit', delivered: 'delivered', archived: 'delivered' };
  var LABEL = { preparing: 'Подготовка', loading: 'Загрузка', in_transit: 'В пути', customs: 'На таможне',
    delivering: 'Доставка', delivered: 'Доставлено', archived: 'Архив' };

  function mapTransports(transports, orders) {
    var byId = {};
    (orders || []).forEach(function (o) { byId[o.id] = o; });
    return (transports || []).map(function (t) {
      var o = byId[t.order_id] || {};
      return {
        id: t.ref, serverId: t.id, origin: t.origin, destination: t.destination,
        cargo: o.cargo || '', client: '', container: o.container || '', weight: o.weight || '',
        created: t.created_at ? String(t.created_at).slice(0, 10) : '',
        status: STATUS_MAP[t.status] || 'pending', statusLabel: LABEL[t.status] || t.status,
        progress: t.progress || 0, price: null, margin: null, paid: false, server: true
      };
    });
  }

  function app() { return typeof APP_STATE !== 'undefined' ? APP_STATE : null; }
  function state(kind, err, retry) {
    var st = window.EXIM_STATE;
    return st ? st.html(kind || st.classify(err), null, retry) : '';
  }

  async function sync() {
    if (!window.WF || !window.WF.getData) throw new Error('workflow not ready');
    var d = await window.WF.getData();
    var a = app(); if (a) a.shipments = mapTransports(d.transports, d.orders);
    return d;
  }

  function wrap(name, targetId) {
    var orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function () {
      var args = arguments, self = this;
      var box = targetId && document.getElementById(targetId);
      if (box) box.innerHTML = state('loading');
      return sync().then(function () { return orig.apply(self, args); }, function (e) {
        var b = targetId && document.getElementById(targetId);
        if (b) b.innerHTML = state(null, e, function () { window[name](); });
      });
    };
  }
  wrap('renderDashboardShipments', 'rd-table');
  wrap('renderShipmentsList', 'shipments-list');
  wrap('renderTracking', 'tracking-content');

  // Маржа по демо-перевозкам в серверном режиме не показывается.
  window.renderMargin = function () {
    var t = document.getElementById('margin-table');
    if (t) t.innerHTML = '<tr><td colspan="6">' + state('empty', null) .replace('Пока ничего нет',
      'Маржа считается по заявкам: откройте раздел «Заявки и расчёты»') + '</td></tr>';
    ['total-margin', 'paid-margin', 'unpaid-margin'].forEach(function (id) { var el = document.getElementById(id); if (el) el.textContent = '—'; });
  };

  // Старые адреса карточки перевозки ведут на серверную карточку.
  var nav = window.navigate;
  window.navigate = function (page, event, id) {
    if (page === 'shipment-detail' && window.__EXIM_ROUTER && window.__EXIM_ROUTER.go) {
      var a = app(), s = a && (a.shipments || []).find(function (x) { return x.id === id; });
      window.__EXIM_ROUTER.go('shipment', s ? s.serverId : id);
      return;
    }
    return nav.apply(this, arguments);
  };

  // Демонстрационное создание перевозки без заявки отключено: только через заявку.
  document.addEventListener('submit', function (e) {
    if (e.target && e.target.id === 'new-shipment-form') {
      e.preventDefault(); e.stopPropagation();
      if (window.showToast) window.showToast('info', 'Создайте заявку', 'Перевозка создаётся из согласованной заявки');
      if (window.WF && window.WF.newOrder) { window.navigate('workflow'); window.WF.newOrder(); }
    }
  }, true);

  ['payInvoice', 'confirmPayment'].forEach(function (n) {
    if (typeof window[n] === 'function') window[n] = function () {
      if (window.showToast) window.showToast('info', 'Недоступно', 'Оплата не входит в Foundation Gate');
    };
  });
  if (typeof window.persist === 'function') {
    window.persist = function () {
      var a = app(); if (!a) return;
      try { localStorage.setItem('exim-data-v2', JSON.stringify({ containers: a.containers, requests: a.requests })); } catch (e) {}
    };
  }
  var a0 = app(); if (a0) a0.shipments = [];

  window.EXIM_SERVER_MODE = { mapTransports: mapTransports };
})();
// После подключения серверного режима перерисовать текущий раздел уже из серверных данных.
(function () {
  if (typeof window === 'undefined' || !window.__SUPA) return;
  var page = typeof APP_STATE !== 'undefined' ? APP_STATE.currentPage : null;
  if (page === 'dashboard' && window.renderDashboardShipments) window.renderDashboardShipments();
  if (page === 'shipments' && window.renderShipmentsList) window.renderShipmentsList();
  if (page === 'tracking' && window.renderTracking) window.renderTracking();
  if (page === 'margin' && window.renderMargin) window.renderMargin();
})();
