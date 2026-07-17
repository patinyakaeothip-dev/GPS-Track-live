// event-store.js — shared events data used by both admin/index.html (create/
// edit) and the runner app's event picker (index.html). No real backend yet:
// persisted to localStorage, so it only syncs between Admin and the app when
// opened in the same browser/device. A real multi-device deploy needs this
// swapped for an actual API (see src/api.js for the existing Apps Script
// client shape to extend).

(function () {
  const KEY = 'trt.events.v1';

  const SEED_EVENTS = [
    {
      id: 'rtr2026', name: 'Rayong Trail Running 2026', date: '18 เม.ย. 2026', raceDateISO: '2026-04-18', status: 'live',
      closed: false, hotline: '081-234-5678',
      distances: [
        { label: '11K', cutoff: '150', open: true, cpTimes: { start: '06:10', a1_out: '', a2_in: '', a2_out: '', a1_in: '', finish: '08:40' } },
        { label: '22K', cutoff: '270', open: true, cpTimes: { start: '06:05', a1_out: '', a2_in: '', a2_out: '', a1_in: '', finish: '10:35' } },
        { label: '29K', cutoff: '360', open: true, cpTimes: { start: '06:00', a1_out: '', a2_in: '', a2_out: '', a1_in: '', finish: '12:00' } },
      ],
    },
    {
      id: 'kk2026', name: 'Khao Kho Ultra 2026', date: '3 ส.ค. 2026', raceDateISO: '2026-08-03', status: 'upcoming',
      closed: true, hotline: '',
      distances: [{ label: '22K', cutoff: '270', open: false, cpTimes: { start: '06:00', a1_out: '', a2_in: '', a2_out: '', a1_in: '', finish: '10:30' } }],
    },
    {
      id: 'ky2025', name: 'Khao Yai Trail 2025', date: '2 พ.ย. 2025', status: 'past',
      closed: true, bib: '114', distance: '29K', hotline: '',
      distances: [{ label: '29K', cutoff: '360', open: false }],
    },
  ];

  function loadEvents() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      if (Array.isArray(raw) && raw.length) return raw;
    } catch (_) {}
    saveEvents(SEED_EVENTS);
    return SEED_EVENTS;
  }

  function saveEvents(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (_) {}
  }

  function upsertEvent(ev) {
    const list = loadEvents().slice();
    const idx = list.findIndex(e => e.id === ev.id);
    if (idx >= 0) list[idx] = ev; else list.push(ev);
    saveEvents(list);
    return list;
  }

  function deleteEvent(id) {
    const list = loadEvents().filter(e => e.id !== id);
    saveEvents(list);
    return list;
  }

  function newEventId() {
    return 'ev' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  Object.assign(window, { eventStore: { loadEvents, saveEvents, upsertEvent, deleteEvent, newEventId } });
})();
