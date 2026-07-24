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
  // Cancelled registrations stay in storage (see cancelRunner below) instead
  // of being deleted, but every normal caller — results, ranking, live
  // monitor, friends, bib assignment, "have I already registered" — should
  // see them as simply gone. Pass { includeCancelled: true } for the one
  // place that actually needs the audit trail (Admin's runner manager).
  function listRunners(eventId, opts) {
    const list = loadRunners().filter(r => r.eventId === eventId);
    return (opts && opts.includeCancelled) ? list : list.filter(r => !r.cancelled);
  }
  // Cross-device lookup: "have I already registered" only worked before if
  // this exact browser's local session still remembered it. A registration
  // is really tied to the runner's Google account (uid), which is stored on
  // the roster record regardless of device — this is what lets the app
  // recognize "you already registered" after a fresh login anywhere.
  function listRunnersByUid(uid, opts) {
    if (!uid) return [];
    const list = loadRunners().filter(r => r.uid === uid);
    return (opts && opts.includeCancelled) ? list : list.filter(r => !r.cancelled);
  }

  // Bibs are 4-digit, assigned per distance using that distance's numeric
  // prefix (1000s for the 1st distance in the event, 2000s for the 2nd,
  // ...) so they stay stable and readable instead of a random id — e.g.
  // 1001, 1002, ... 2001, 2002, ... Based on the highest bib already taken
  // (not a plain count) so a cancelled/deleted registration doesn't free up
  // its number and hand it to someone else later.
  function nextBib(eventId, ev, distLabel) {
    const distIdx = Math.max(0, (ev.distances || []).findIndex(d => d.label === distLabel));
    const base = (distIdx + 1) * 1000;
    // includeCancelled: a cancelled registration's bib is never handed to
    // someone else — now that cancelled runners are kept as records instead
    // of deleted, that's easy to actually guarantee instead of just hoped for.
    const bibs = listRunners(eventId, { includeCancelled: true }).filter(r => r.distance === distLabel).map(r => parseInt(r.bib, 10) || base);
    const highest = bibs.length ? Math.max(...bibs) : base;
    return String(highest + 1);
  }

  function registerRunner(ev, data) {
    const bib = nextBib(ev.id, ev, data.distance);
    const runner = {
      // Deliberately NOT derived from the bib — two registrations racing
      // each other (e.g. before this device's roster has finished syncing
      // from Firestore) could otherwise compute the same "next" bib and end
      // up overwriting each other's Firestore document outright instead of
      // just showing a duplicate bib.
      id: `${ev.id}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      eventId: ev.id,
      bib,
      distance: data.distance,
      nickname: data.nickname,
      phone: data.phone || '',
      gender: data.gender || '',
      emgName: data.emgName || '',
      emgPhone: data.emgPhone || '',
      bloodType: data.bloodType || '',
      email: data.email || '',
      medical: data.medical || '',
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
  // `synced` on the return value resolves once the Firestore write actually
  // lands (or false if it fails/there's no backend) — the local write above
  // already happened either way (offline-first), but SOS specifically needs
  // to know the real outcome before telling a runner "help is on the way"
  // instead of assuming success the instant the button is tapped.
  function updateRunnerProgress(id, patch) {
    const list = loadRunners().slice();
    const idx = list.findIndex(r => r.id === id);
    if (idx < 0) return { runner: null, synced: Promise.resolve(false) };
    list[idx] = { ...list[idx], ...patch };
    saveRunners(list);
    const synced = window.fb
      ? window.fb.setDocById('runners', id, list[idx]).then(() => true).catch(err => { console.warn('[runner-store] Firestore write failed', err); return false; })
      : Promise.resolve(false);
    notifyUpdated();
    return { runner: list[idx], synced };
  }

  // Same "don't let a late realtime snapshot resurrect what we just
  // deleted" guard as event-store.js's deleteEvent.
  const pendingDeletes = new Set();

  // Cancels a registration but keeps the record — a runner cancelling their
  // own spot, or Admin cancelling a mis-registration/duplicate, should still
  // leave something RD can look up later (a dispute over a bib, "did I
  // actually register", etc). `by` is 'runner' or 'admin' so the two are
  // distinguishable in Admin's audit view. Caller is still responsible for
  // eventStore.decrementRegistration so the quota count stays in sync.
  function cancelRunner(id, by) {
    return updateRunnerProgress(id, { cancelled: true, cancelledAt: Date.now(), cancelledBy: by || 'admin' });
  }

  // Deletes a registration outright, no record kept — only for genuinely
  // purging bad data (test entries, duplicates created by a UI glitch),
  // not for normal cancellations. Prefer cancelRunner for those.
  // Caller is responsible for also calling eventStore.decrementRegistration
  // so the quota count stays in sync.
  function deleteRunner(id) {
    const list = loadRunners().filter(r => r.id !== id);
    saveRunners(list);
    pendingDeletes.add(id);
    setTimeout(() => pendingDeletes.delete(id), 10000);
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
    // Cancelled registrations keep whatever bib they had when cancelled —
    // renumbering only makes sense for people actually racing.
    const mine = all.filter(r => r.eventId === ev.id && !r.cancelled).slice().sort((a, b) => (a.registeredAt || 0) - (b.registeredAt || 0));
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
      const filtered = remote.filter(r => !pendingDeletes.has(r.id));
      if (filtered.length) { saveRunners(filtered); notifyUpdated(); }
    }).catch(err => console.warn('[runner-store] Firestore initial load failed', err));
    window.fb.watchCollection('runners', remote => {
      saveRunners(remote.filter(r => !pendingDeletes.has(r.id)));
      notifyUpdated();
    });
  }
  function notifyUpdated() {
    window.dispatchEvent(new CustomEvent('trt:runners-updated'));
  }
  if (window.fb) startFirestoreSync();
  else window.addEventListener('trt:firebase-ready', startFirestoreSync, { once: true });

  Object.assign(window, { runnerStore: { listRunners, listRunnersByUid, registerRunner, updateRunnerProgress, cancelRunner, deleteRunner, renumberBibs } });
})();
