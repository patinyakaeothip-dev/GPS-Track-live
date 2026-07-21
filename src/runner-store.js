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

  // Bibs are assigned per distance using that distance's numeric prefix
  // (100s for the 1st distance in the event, 200s for the 2nd, ...) so they
  // stay stable and readable instead of a random id, similar to how the
  // demo NAMES bibs are laid out (101, 102, ... 201, 202, ...).
  function nextBib(eventId, ev, distLabel) {
    const distIdx = Math.max(0, (ev.distances || []).findIndex(d => d.label === distLabel));
    const base = (distIdx + 1) * 100;
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
      emgPhone: data.emgPhone || '',
      uid: data.uid || '',
      checkins: [],
      progressKm: 0,
      registeredAt: Date.now(),
    };
    const list = loadRunners().slice();
    list.push(runner);
    saveRunners(list);
    if (window.fb) window.fb.setDocById('runners', runner.id, runner).catch(err => console.warn('[runner-store] Firestore write failed', err));
    notifyUpdated();
    return runner;
  }

  function updateRunnerProgress(id, patch) {
    const list = loadRunners().slice();
    const idx = list.findIndex(r => r.id === id);
    if (idx < 0) return;
    list[idx] = { ...list[idx], ...patch };
    saveRunners(list);
    if (window.fb) window.fb.setDocById('runners', id, list[idx]).catch(err => console.warn('[runner-store] Firestore write failed', err));
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

  Object.assign(window, { runnerStore: { listRunners, registerRunner, updateRunnerProgress } });
})();
