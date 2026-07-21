// runner-store.js — the real per-event runner roster: who actually
// registered, their assigned bib, and their checkpoint progress. Separate
// from src/event-store.js (which only tracks the *count* of registrations
// for quota purposes) and separate from the fully-simulated NAMES list in
// live-monitor.jsx (fake demo dots, unrelated to real sign-ups).
//
// Persisted to localStorage for instant reads, mirrored to a Firestore
// "runners" collection when src/firebase-config.js is filled in — same
// pattern as event-store.js.
(function () {
  const KEY = 'trt.runners.v1';

  function loadRunners() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (_) { return []; }
  }
  function saveRunners(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (_) {}
  }
  function listRunners(eventId) {
    return loadRunners().filter(r => r.eventId === eventId);
  }

  // Bibs are 4-digit, assigned per distance using that distance's numeric
  // prefix (1000s for the 1st distance in the event, 2000s for the 2nd,
  // ...) so they stay stable and readable instead of a random id — e.g.
  // 1001, 1002, ... 2001, 2002, ...
  function nextBib(eventId, ev, distLabel) {
    const distIdx = Math.max(0, (ev.distances || []).findIndex(d => d.label === distLabel));
    const base = (distIdx + 1) * 1000;
    const taken = listRunners(eventId).filter(r => r.distance === distLabel).length;
    return String(base + taken + 1);
  }

  function registerRunner(ev, data) {
    const bib = nextBib(ev.id, ev, data.distance);
    const runner = {
      id: `${ev.id}_${bib}`,
      eventId: ev.id,
      bib,
      distance: data.distance,
      nickname: data.nickname,
      phone: data.phone || '',
      gender: data.gender || '',
      emgPhone: data.emgPhone || '',
      uid: data.uid || '',
      checkins: [],
      progressKm: 0,
      dnf: false,
      registeredAt: Date.now(),
    };
    const list = loadRunners().slice();
    list.push(runner);
    saveRunners(list);
    if (window.fb) window.fb.setDocById('runners', runner.id, runner).catch(err => console.warn('[runner-store] Firestore write failed', err));
    notifyUpdated();
    return runner;
  }

  // Generic patch — used both by the app syncing checkin/progress after a
  // QR scan, and by Admin's runner-management page editing name/phone/
  // distance/bib or marking DNF.
  function updateRunnerProgress(id, patch) {
    const list = loadRunners().slice();
    const idx = list.findIndex(r => r.id === id);
    if (idx < 0) return;
    list[idx] = { ...list[idx], ...patch };
    saveRunners(list);
    if (window.fb) window.fb.setDocById('runners', id, list[idx]).catch(err => console.warn('[runner-store] Firestore write failed', err));
    notifyUpdated();
    return list[idx];
  }

  // Cancels a registration outright (mis-registration, duplicate, etc).
  // Caller is responsible for also calling eventStore.decrementRegistration
  // so the quota count stays in sync.
  function deleteRunner(id) {
    const list = loadRunners().filter(r => r.id !== id);
    saveRunners(list);
    if (window.fb) window.fb.deleteDocById('runners', id).catch(err => console.warn('[runner-store] Firestore delete failed', err));
    notifyUpdated();
  }

  // One-time cleanup: reassigns every runner in this event a fresh
  // sequential bib under the current scheme (used to backfill the old
  // 3-digit runners after the bib format changed to 4 digits). Keeps each
  // runner's document id stable — only the displayed bib field changes —
  // and preserves registration order (oldest first) within each distance.
  function renumberBibs(ev) {
    const all = loadRunners();
    const mine = all.filter(r => r.eventId === ev.id).slice().sort((a, b) => (a.registeredAt || 0) - (b.registeredAt || 0));
    const byDist = {};
    mine.forEach(r => { (byDist[r.distance] = byDist[r.distance] || []).push(r); });
    const newBibById = {};
    Object.keys(byDist).forEach(distLabel => {
      const distIdx = Math.max(0, (ev.distances || []).findIndex(d => d.label === distLabel));
      const base = (distIdx + 1) * 1000;
      byDist[distLabel].forEach((r, i) => { newBibById[r.id] = String(base + i + 1); });
    });
    const next = all.map(r => (newBibById[r.id] ? { ...r, bib: newBibById[r.id] } : r));
    saveRunners(next);
    if (window.fb) {
      next.filter(r => newBibById[r.id]).forEach(r => window.fb.setDocById('runners', r.id, r).catch(err => console.warn('[runner-store] Firestore write failed', err)));
    }
    notifyUpdated();
  }

  function startFirestoreSync() {
    if (!window.fb) return;
    window.fb.listDocs('runners').then(remote => {
      if (remote.length) { saveRunners(remote); notifyUpdated(); }
    }).catch(err => console.warn('[runner-store] Firestore initial load failed', err));
    window.fb.watchCollection('runners', remote => { saveRunners(remote); notifyUpdated(); });
  }
  function notifyUpdated() {
    window.dispatchEvent(new CustomEvent('trt:runners-updated'));
  }
  if (window.fb) startFirestoreSync();
  else window.addEventListener('trt:firebase-ready', startFirestoreSync, { once: true });

  Object.assign(window, { runnerStore: { listRunners, registerRunner, updateRunnerProgress, deleteRunner, renumberBibs } });
})();
