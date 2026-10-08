/* EXIM — адресуемая навигация (TASK-2026-001, Wave 2, REQ-005 / AC-TASK-009)
 *
 * Контракт адреса: /app#/<раздел>[/<id>]
 *   #/workflow                — раздел
 *   #/workflow/<order uuid>   — карточка заявки
 *   #/shipment-detail/<id>    — карточка перевозки
 *
 * Прямая ссылка открывает раздел, Reload его восстанавливает, Back/Forward
 * следуют истории браузера. Неизвестный раздел или недоступный объект дают
 * один и тот же ответ «не найдено» — без раскрытия, существует ли объект.
 */
(function () {
  'use strict';

  var SECTION = /^[a-z][a-z0-9-]{0,40}$/;
  var OBJECT_ID = /^[A-Za-z0-9-]{1,64}$/;

  function parse(hash) {
    var raw = String(hash || '').replace(/^#\/?/, '');
    if (!raw) return null;
    var parts = raw.split('/');
    var page = parts[0];
    var id = parts.length > 1 ? decodeURIComponent(parts[1]) : null;
    if (!SECTION.test(page)) return { page: null, id: null, invalid: true };
    if (id !== null && !OBJECT_ID.test(id)) return { page: page, id: null, invalid: true };
    return { page: page, id: id, invalid: false };
  }

  function format(page, id) {
    return '#/' + page + (id ? '/' + encodeURIComponent(id) : '');
  }

  var api = { parse: parse, format: format };
  if (typeof window === 'undefined') return;
  window.__EXIM_ROUTER = api;
  if (typeof window.navigate !== 'function') return;

  var pageExists = function (page) {
    return !!(page && document.getElementById('page-' + page));
  };

  var restoring = false;
  var base = window.navigate;

  function notFound() {
    if (typeof window.showToast === 'function') {
      window.showToast('warning', 'Не найдено', 'Раздел или объект не существует либо недоступен');
    }
  }

  // Карточки объектов внутри разделов, у которых нет своей страницы.
  function openObject(page, id) {
    if (page === 'workflow' && window.WF && window.WF.getData) {
      window.WF.getData().then(function (cache) {
        var found = (cache.orders || []).some(function (o) { return o.id === id || o.ref === id; });
        if (!found) { notFound(); return; }
        var order = cache.orders.find(function (o) { return o.id === id || o.ref === id; });
        window.WF.open(order.id);
      }).catch(notFound);
    }
  }

  window.navigate = function (page, event, id) {
    base(page, event, id);
    if (restoring || !pageExists(page)) return;
    var next = format(page, id);
    if (window.location.hash !== next) {
      window.history.pushState({ exim: true, page: page, id: id || null }, '', next);
    }
  };

  function apply(route, replace) {
    if (!route) return;
    if (route.invalid || !pageExists(route.page)) {
      notFound();
      restoring = true;
      try { base('dashboard', null, null); } finally { restoring = false; }
      window.history.replaceState({ exim: true, page: 'dashboard', id: null }, '', format('dashboard'));
      return;
    }
    restoring = true;
    try { window.navigate(route.page, null, route.id); } finally { restoring = false; }
    if (replace) {
      window.history.replaceState({ exim: true, page: route.page, id: route.id }, '', format(route.page, route.id));
    }
    if (route.id) openObject(route.page, route.id);
  }

  // Back/Forward браузера — источник истины, а не внутренний стек приложения.
  window.addEventListener('popstate', function () {
    apply(parse(window.location.hash) || { page: 'dashboard', id: null, invalid: false }, false);
  });

  // Кнопка «Назад» в интерфейсе ведёт по той же истории браузера.
  window.goBack = function () {
    if (window.history.state && window.history.state.exim && window.history.length > 1) {
      window.history.back();
    } else {
      apply({ page: 'dashboard', id: null, invalid: false }, true);
    }
  };

  // Первый вход: адрес из строки браузера; без адреса — фиксируем текущий раздел.
  var initial = parse(window.location.hash);
  if (initial) {
    apply(initial, true);
  } else {
    var current = (window.APP_STATE && window.APP_STATE.currentPage) || 'dashboard';
    window.history.replaceState({ exim: true, page: current, id: null }, '', format(current));
  }
})();
