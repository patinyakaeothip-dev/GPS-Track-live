// event-store.js — shared events data used by both admin/index.html (create/
// edit) and the runner app's event picker (index.html). Persisted to
// localStorage so the UI is instant and works offline/without a backend.
// When src/firebase-config.js has real credentials (window.fb is set by
// src/firebase.js), this also mirrors every write to the Firestore
// "events" collection in the background and listens for remote changes —
// that's what makes Admin edits show up on a runner's phone across devices.
// Until then it silently stays localStorage-only, same as before.

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
    if (window.fb) window.fb.setDocById('events', ev.id, ev).catch(err => console.warn('[event-store] Firestore write failed', err));
    return list;
  }

  function deleteEvent(id) {
    const list = loadEvents().filter(e => e.id !== id);
    saveEvents(list);
    if (window.fb) window.fb.deleteDocById('events', id).catch(err => console.warn('[event-store] Firestore delete failed', err));
    return list;
  }

  function newEventId() {
    return 'ev' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // Best-effort: once Firebase is configured, pull the real remote list on
  // load and keep listening for changes made from other devices, so every
  // open tab/phone converges on the same data instead of each device's own
  // localStorage copy.
  function startFirestoreSync() {
    if (!window.fb) return;
    window.fb.listDocs('events').then(remote => {
      if (remote.length) { saveEvents(remote); notifyUpdated(); }
      else if (loadEvents().length) {
        // First run against an empty Firestore collection — seed it from
        // whatever this device already has (e.g. the local SEED_EVENTS).
        loadEvents().forEach(ev => window.fb.setDocById('events', ev.id, ev).catch(() => {}));
      }
    }).catch(err => console.warn('[event-store] Firestore initial load failed', err));

    window.fb.watchCollection('events', remote => {
      saveEvents(remote);
      notifyUpdated();
    });
  }
  function notifyUpdated() {
    window.dispatchEvent(new CustomEvent('trt:events-updated'));
  }
  if (window.fb) startFirestoreSync();
  else window.addEventListener('trt:firebase-ready', startFirestoreSync, { once: true });

  Object.assign(window, { eventStore: { loadEvents, saveEvents, upsertEvent, deleteEvent, newEventId } });
})();
