/* EXIM — адресуемая навигация (TASK-2026-001, REQ-005 / AC-TASK-008, AC-TASK-009)
 *
 * Контракт адреса:
 *   #/<раздел>             — раздел приложения (dashboard, workflow, …)
 *   #/order/<uuid>         — карточка заявки (раздел «Заявки»)
 *   #/shipment/<uuid>      — карточка перевозки (раздел «Заявки», вкладка «Перевозки»)
 *   #/workflow/<uuid>      — устаревший адрес заявки, переписывается в #/order/<uuid>
 *
 * Прямая ссылка открывает объект, Reload его восстанавливает, Back/Forward
 * следуют истории браузера. Объект ищется только среди данных, которые сервер
 * вернул текущему пользователю; отсутствующий и недоступный объект дают один
 * и тот же ответ «не найдено». Неверный адрес (битое %-кодирование, лишние
 * сегменты) не роняет загрузку и считается недействительным.
 */
(function () {
  'use strict';

  var SECTION = /^[a-z][a-z0-9-]{0,40}$/;
  var OBJECT_ID = /^[A-Za-z0-9-]{1,64}$/;
  var OBJECTS = { order: 'workflow', shipment: 'workflow' };
  var INVALID = { page: null, kind: null, id: null, invalid: true };

  function decode(part) {
    try { return decodeURIComponent(part); } catch (e) { return null; }
  }

  function parse(hash) {
    var raw = String(hash || '').replace(/^#\/?/, '');
    if (!raw) return null;
    var parts = raw.split('/');
    if (parts.length > 2 || parts.some(function (p) { return p === ''; })) return INVALID;
    var page = decode(parts[0]);
    if (page === null || !SECTION.test(page)) return INVALID;
    var id = null;
    if (parts.length === 2) {
      id = decode(parts[1]);
      if (id === null || !OBJECT_ID.test(id)) return INVALID;
    }
    if (OBJECTS[page]) {
      if (!id) return INVALID;
      return { page: OBJECTS[page], kind: page, id: id, invalid: false };
    }
    if (page === 'workflow' && id) return { page: 'workflow', kind: 'order', id: id, invalid: false };
    if (id) return INVALID;
    return { page: page, kind: null, id: null, invalid: false };
  }

  function format(page, id, kind) {
    if (kind && OBJECTS[kind]) return '#/' + kind + '/' + encodeURIComponent(id);
    return '#/' + page;
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

  function push(route, replace) {
    var next = format(route.page, route.id, route.kind);
    var st = { exim: true, page: route.page, kind: route.kind || null, id: route.id || null };
    if (replace) window.history.replaceState(st, '', next);
    else if (window.location.hash !== next) window.history.pushState(st, '', next);
  }

  // Открывает карточку только среди объектов, которые сервер вернул пользователю.
  function openObject(kind, id) {
    if (!window.WF || !window.WF.getData) { notFound(); return Promise.resolve(false); }
    return window.WF.getData().then(function (cache) {
      var list = kind === 'shipment' ? (cache.transports || []) : (cache.orders || []);
      var item = list.find(function (x) { return x.id === id; });
      if (!item) { notFound(); return false; }
      restoring = true;
      try {
        if (kind === 'shipment') { window.WF.tab('trans'); window.WF.openTrans(item.id); }
        else window.WF.open(item.id);
      } finally { restoring = false; }
      return true;
    }, function () {
      if (typeof window.showToast === 'function') window.showToast('danger', 'Ошибка загрузки', 'Повторите попытку');
      return false;
    });
  }

  window.navigate = function (page, event, id) {
    base(page, event, id);
    if (restoring || !pageExists(page)) return;
    push({ page: page, kind: null, id: null }, false);
  };

  // Явный переход к объекту: адрес → раздел → карточка.
  function go(kind, id) {
    if (!OBJECTS[kind] || !OBJECT_ID.test(String(id || ''))) { notFound(); return; }
    restoring = true;
    try { base(OBJECTS[kind], null, null); } finally { restoring = false; }
    push({ page: OBJECTS[kind], kind: kind, id: id }, false);
    return openObject(kind, id);
  }
  api.go = go;

  // Открытие карточки из списка тоже меняет адрес.
  function hookCards() {
    if (!window.WF || window.WF.__routed) return;
    var open = window.WF.open, openTrans = window.WF.openTrans;
    window.WF.open = function (id) {
      if (!restoring) push({ page: 'workflow', kind: 'order', id: id }, false);
      return open.apply(this, arguments);
    };
    window.WF.openTrans = function (id) {
      if (!restoring) push({ page: 'workflow', kind: 'shipment', id: id }, false);
      return openTrans.apply(this, arguments);
    };
    window.WF.__routed = true;
  }
  hookCards();

  function apply(route, replace) {
    if (!route) return;
    if (route.invalid || !pageExists(route.page)) {
      notFound();
      restoring = true;
      try { base('dashboard', null, null); } finally { restoring = false; }
      push({ page: 'dashboard' }, true);
      return;
    }
    if (typeof window.closeModal === 'function' && !route.kind) {
      try { window.closeModal(); } catch (e) { /* модального окна нет */ }
    }
    restoring = true;
    try { base(route.page, null, null); } finally { restoring = false; }
    if (replace) push(route, true);
    if (route.kind) openObject(route.kind, route.id);
  }

  // Back/Forward браузера — источник истины, а не внутренний стек приложения.
  window.addEventListener('popstate', function () {
    apply(parse(window.location.hash) || { page: 'dashboard', kind: null, id: null, invalid: false }, false);
  });

  window.goBack = function () {
    if (window.history.state && window.history.state.exim && window.history.length > 1) {
      window.history.back();
    } else {
      apply({ page: 'dashboard', kind: null, id: null, invalid: false }, true);
    }
  };

  var initial = parse(window.location.hash);
  if (initial) {
    apply(initial, true);
  } else {
    var current = (typeof APP_STATE !== 'undefined' && APP_STATE.currentPage) || 'dashboard';
    push({ page: current }, true);
  }
})();
