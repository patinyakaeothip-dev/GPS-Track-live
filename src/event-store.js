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
      checkpoints: [
        { id: 'a1_out', label: 'A1 ↗', km: 5.6 },
        { id: 'a2_in', label: 'A2 ↑', km: 11.6 },
        { id: 'a2_out', label: 'A2 ↓', km: 19 },
        { id: 'a1_in', label: 'A1 ↙', km: 23.5 },
      ],
      distances: [
        { id: 'd0', label: '11K', cutoff: '150', open: true, cpTimes: { start: '06:10', a1_out: '', a2_in: '', a2_out: '', a1_in: '', finish: '08:40' } },
        { id: 'd1', label: '22K', cutoff: '270', open: true, cpTimes: { start: '06:05', a1_out: '', a2_in: '', a2_out: '', a1_in: '', finish: '10:35' } },
        { id: 'd2', label: '29K', cutoff: '360', open: true, cpTimes: { start: '06:00', a1_out: '', a2_in: '', a2_out: '', a1_in: '', finish: '12:00' } },
      ],
    },
    {
      id: 'kk2026', name: 'Khao Kho Ultra 2026', date: '3 ส.ค. 2026', raceDateISO: '2026-08-03', status: 'upcoming',
      closed: true, hotline: '',
      checkpoints: [
        { id: 'a1_out', label: 'A1 ↗', km: 5.6 },
        { id: 'a2_in', label: 'A2 ↑', km: 11.6 },
        { id: 'a2_out', label: 'A2 ↓', km: 19 },
        { id: 'a1_in', label: 'A1 ↙', km: 23.5 },
      ],
      distances: [{ id: 'd0', label: '22K', cutoff: '270', open: false, cpTimes: { start: '06:00', a1_out: '', a2_in: '', a2_out: '', a1_in: '', finish: '10:30' } }],
    },
    {
      id: 'ky2025', name: 'Khao Yai Trail 2025', date: '2 พ.ย. 2025', status: 'past',
      closed: true, bib: '114', distance: '29K', hotline: '',
      distances: [{ id: 'd0', label: '29K', cutoff: '360', open: false }],
    },
  ];

  function loadEvents() {
    try {
      // Only seed demo events when there's genuinely nothing stored yet
      // (missing key / corrupted JSON) — an empty array is a valid,
      // intentional state (every event got deleted) and must be respected,
      // not treated the same as "no data" and silently reseeded. That
      // conflation was the actual bug behind "deleting the last event
      // brings back all 3 demo events."
      if (localStorage.getItem(KEY) === null) throw new Error('no stored events yet');
      const raw = JSON.parse(localStorage.getItem(KEY));
      if (Array.isArray(raw)) return raw;
    } catch (_) {}
    saveEvents(SEED_EVENTS);
    return SEED_EVENTS;
  }

  function saveEvents(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (_) {}
  }

  // Firestore rejects arrays-of-arrays ("Nested arrays are not supported") —
  // uploaded GPX tracks store their points as [[lat,lon,ele,km], ...], which
  // trips this the moment a real GPX file is attached to an event. Wrap each
  // inner array in a plain object on the way out, and unwrap on the way
  // back in, so the rest of the app can keep using plain point tuples.
  function toFirestoreSafe(val) {
    if (Array.isArray(val)) return val.map(v => Array.isArray(v) ? { __arr: toFirestoreSafe(v) } : toFirestoreSafe(v));
    if (val && typeof val === 'object') {
      const out = {};
      for (const k in val) out[k] = toFirestoreSafe(val[k]);
      return out;
    }
    return val;
  }
  function fromFirestoreSafe(val) {
    if (Array.isArray(val)) return val.map(fromFirestoreSafe);
    if (val && typeof val === 'object') {
      if (Array.isArray(val.__arr) && Object.keys(val).length === 1) return fromFirestoreSafe(val.__arr);
      const out = {};
      for (const k in val) out[k] = fromFirestoreSafe(val[k]);
      return out;
    }
    return val;
  }

  function upsertEvent(ev) {
    const list = loadEvents().slice();
    const idx = list.findIndex(e => e.id === ev.id);
    if (idx >= 0) list[idx] = ev; else list.push(ev);
    saveEvents(list);
    if (window.fb) window.fb.setDocById('events', ev.id, toFirestoreSafe(ev)).catch(err => console.warn('[event-store] Firestore write failed', err));
    return list;
  }

  // Deletes fired against Firestore are async and take a moment to actually
  // land — if a realtime snapshot from *before* the delete finished arrives
  // in the meantime, watchCollection's "trust whatever remote says" would
  // silently resurrect the just-deleted event. Remember recent deletes for
  // a few seconds and filter them out of any incoming snapshot so this
  // can't bounce back.
  const pendingDeletes = new Set();

  function deleteEvent(id) {
    const list = loadEvents().filter(e => e.id !== id);
    saveEvents(list);
    pendingDeletes.add(id);
    setTimeout(() => pendingDeletes.delete(id), 10000);
    if (window.fb) window.fb.deleteDocById('events', id).catch(err => console.warn('[event-store] Firestore delete failed', err));
    return list;
  }

  function newEventId() {
    return 'ev' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // Called by the runner app right after a successful registration so the
  // Admin quota (see src/admin-app.jsx capacity/registered fields) reflects
  // real sign-ups instead of staying a manually-typed number.
  function incrementRegistration(eventId, distLabel) {
    const ev = loadEvents().find(e => e.id === eventId);
    if (!ev) return;
    const distances = (ev.distances || []).map(d =>
      d.label === distLabel ? { ...d, registered: String((parseInt(d.registered, 10) || 0) + 1) } : d);
    upsertEvent({ ...ev, distances });
  }
  // Mirror of incrementRegistration — called when Admin cancels/deletes a
  // runner's registration (see admin/runners.html) so the quota count stays
  // in sync instead of only ever going up.
  function decrementRegistration(eventId, distLabel) {
    const ev = loadEvents().find(e => e.id === eventId);
    if (!ev) return;
    const distances = (ev.distances || []).map(d =>
      d.label === distLabel ? { ...d, registered: String(Math.max(0, (parseInt(d.registered, 10) || 0) - 1)) } : d);
    upsertEvent({ ...ev, distances });
  }

  // Best-effort: once Firebase is configured, pull the real remote list on
  // load and keep listening for changes made from other devices, so every
  // open tab/phone converges on the same data instead of each device's own
  // localStorage copy.
  function startFirestoreSync() {
    if (!window.fb) return;
    window.fb.listDocs('events').then(remote => {
      const filtered = remote.filter(e => !pendingDeletes.has(e.id)).map(fromFirestoreSafe);
      if (filtered.length) { saveEvents(filtered); notifyUpdated(); }
      else if (loadEvents().length) {
        // First run against an empty Firestore collection — seed it from
        // whatever this device already has (e.g. the local SEED_EVENTS).
        loadEvents().forEach(ev => window.fb.setDocById('events', ev.id, toFirestoreSafe(ev)).catch(() => {}));
      }
    }).catch(err => console.warn('[event-store] Firestore initial load failed', err));

    window.fb.watchCollection('events', remote => {
      saveEvents(remote.filter(e => !pendingDeletes.has(e.id)).map(fromFirestoreSafe));
      notifyUpdated();
    });
  }
  function notifyUpdated() {
    window.dispatchEvent(new CustomEvent('trt:events-updated'));
  }
  if (window.fb) startFirestoreSync();
  else window.addEventListener('trt:firebase-ready', startFirestoreSync, { once: true });

  Object.assign(window, { eventStore: { loadEvents, saveEvents, upsertEvent, deleteEvent, newEventId, incrementRegistration, decrementRegistration } });
})();
