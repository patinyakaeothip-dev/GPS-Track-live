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

  // Async now (it used to just be a synchronous local computation) because
  // getting a real, collision-proof bib out of window.fb.allocateNextBib
  // means an actual Firestore round-trip when there's a backend to round-
  // trip to. nextBib's plain "highest existing + 1" is still what's used
  // when there's no backend (window.fb null — local demo mode, a single
  // device with no other client to race against anyway), and is also what
  // seeds the very first allocation of a real event's counter (see
  // allocateNextBib's own comment) so events with runners registered
  // before this fix shipped don't have their numbering jump or reset.
  async function registerRunner(ev, data) {
    const seedNext = nextBib(ev.id, ev, data.distance);
    let bib = seedNext;
    if (window.fb) {
      try {
        bib = String(await window.fb.allocateNextBib(`${ev.id}_${data.distance}`, parseInt(seedNext, 10)));
      } catch (err) {
        // Real backend, but the transaction itself failed (offline mid-
        // registration, permissions, etc.) — falling all the way back to
        // the old local guess keeps registration itself from breaking
        // outright; it can still collide in the same rare race this was
        // meant to close, but that's strictly no worse than before this
        // fix existed, not a new failure mode.
        console.warn('[runner-store] atomic bib allocation failed, falling back to local next-bib', err);
      }
    }
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
      emgName2: data.emgName2 || '',
      emgPhone2: data.emgPhone2 || '',
      bloodType: data.bloodType || '',
      email: data.email || '',
      medical: data.medical || '',
      // Only ever collected from Profile (optional there too) — used
      // solely to compute an age-category ranking, nothing else. A blank
      // value here just means this runner doesn't show up in that
      // ranking's age-category filter, same as a blank gender already
      // means "not shown in the ชาย/หญิง split."
      birthYear: data.birthYear || '',
      uid: data.uid || '',
      avatarPhoto: data.avatarPhoto || '',
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
    // Firestore-side merge of just `patch`, not a full-document overwrite
    // of list[idx] — list[idx] comes from this device's local cache, which
    // can be behind (e.g. this same runner just got a finish check-in
    // recorded from a different device/tab). Writing the whole cached
    // object back used to silently revert whatever fields Firestore had
    // moved on without this device knowing.
    const synced = window.fb
      ? window.fb.setDocById('runners', id, patch, { merge: true }).then(() => true).catch(err => { console.warn('[runner-store] Firestore write failed', err); return false; })
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

  // A fresh device (new browser profile, freshly installed native app) has
  // an empty local roster cache until the first real Firestore sync lands
  // — checking "is this uid already registered for this event" (see
  // mobile-app.jsx's openRunnerSpace) against that empty cache always came
  // back "no", wrongly sending someone who'd already registered on a
  // *different* device straight back to the registration form. isReady/
  // waitUntilReady let a caller hold off on that kind of "definitely not
  // there" conclusion until at least one real sync has actually happened.
  let storeReady = false;
  const readyWaiters = [];
  function markReady() {
    if (storeReady) return;
    storeReady = true;
    readyWaiters.splice(0).forEach(fn => fn());
  }
  function isReady() { return storeReady; }
  // timeoutMs is a safety net, not the expected path — genuinely offline
  // with no backend at all (window.fb null) should still let callers
  // proceed after a bounded wait instead of hanging forever.
  function waitUntilReady(timeoutMs = 4000) {
    if (storeReady) return Promise.resolve();
    return new Promise(resolve => {
      readyWaiters.push(resolve);
      setTimeout(resolve, timeoutMs);
    });
  }

  function startFirestoreSync() {
    if (!window.fb) return;
    window.fb.listDocs('runners').then(remote => {
      const filtered = remote.filter(r => !pendingDeletes.has(r.id));
      if (filtered.length) { saveRunners(filtered); notifyUpdated(); }
      markReady();
    }).catch(err => { console.warn('[runner-store] Firestore initial load failed', err); markReady(); });
    window.fb.watchCollection('runners', remote => {
      saveRunners(remote.filter(r => !pendingDeletes.has(r.id)));
      notifyUpdated();
      markReady();
    });
  }
  function notifyUpdated() {
    window.dispatchEvent(new CustomEvent('trt:runners-updated'));
  }
  if (window.fb) startFirestoreSync();
  else window.addEventListener('trt:firebase-ready', startFirestoreSync, { once: true });

  // ── SOS log ───────────────────────────────────────────────────────────
  // Separate from the roster's own sos/sosReason fields, which only ever
  // reflect the *current* signal — clearing an SOS (self-cancel or Admin's
  // "รับทราบ" button) wiped those fields with nothing kept behind, so
  // there was no way to answer "who SOS'd, when, and who responded" after
  // the fact. One doc per SOS event here, never overwritten in place other
  // than to attach a resolution once it's handled, so the history survives
  // regardless of what the roster's live fields say right now.
  const LOG_KEY = 'trt.sosLog.v1';
  function loadSosLog() {
    try { return JSON.parse(localStorage.getItem(LOG_KEY)) || []; } catch (_) { return []; }
  }
  function saveSosLog(list) {
    try { localStorage.setItem(LOG_KEY, JSON.stringify(list)); } catch (_) {}
  }
  function notifySosLogUpdated() {
    window.dispatchEvent(new CustomEvent('trt:sosLog-updated'));
  }
  // Called the moment a runner sends SOS (see mobile-app.jsx's SOS confirm
  // handler) — logs a new, unresolved entry.
  function logSosTriggered({ eventId, rosterId, bib, nickname, reason }) {
    const entry = {
      id: `sos${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      eventId, rosterId, bib, nickname, reason: reason || '',
      triggeredAt: Date.now(), resolvedAt: null, resolvedBy: '',
    };
    const list = loadSosLog().slice();
    list.push(entry);
    saveSosLog(list);
    if (window.fb) window.fb.setDocById('sosLog', entry.id, entry).catch(err => console.warn('[runner-store] Firestore write failed', err));
    notifySosLogUpdated();
    return entry;
  }
  // Called both when a runner cancels their own SOS and when Admin hits
  // "รับทราบ · ปิดสัญญาณ SOS" on Live Monitor — resolvedBy is left blank
  // for a self-cancel (see both call sites) so the log can distinguish "the
  // runner called it off themselves" from "Admin responded".
  function resolveSosLog(rosterId, resolvedBy) {
    const list = loadSosLog().slice();
    // Newest-first so a runner who's SOS'd more than once resolves their
    // *latest* open signal, not whichever unresolved entry happens to be
    // first in storage order.
    const idx = list.slice().reverse().findIndex(e => e.rosterId === rosterId && !e.resolvedAt);
    if (idx < 0) return;
    const realIdx = list.length - 1 - idx;
    list[realIdx] = { ...list[realIdx], resolvedAt: Date.now(), resolvedBy: resolvedBy || '' };
    saveSosLog(list);
    if (window.fb) window.fb.setDocById('sosLog', list[realIdx].id, list[realIdx]).catch(err => console.warn('[runner-store] Firestore write failed', err));
    notifySosLogUpdated();
  }
  function listSosLog(eventId) {
    return loadSosLog().filter(e => e.eventId === eventId).sort((a, b) => (b.triggeredAt || 0) - (a.triggeredAt || 0));
  }
  function startSosLogFirestoreSync() {
    if (!window.fb) return;
    window.fb.listDocs('sosLog').then(remote => { if (remote.length) { saveSosLog(remote); notifySosLogUpdated(); } })
      .catch(err => console.warn('[runner-store] SOS log initial load failed', err));
    window.fb.watchCollection('sosLog', remote => { saveSosLog(remote); notifySosLogUpdated(); });
  }
  if (window.fb) startSosLogFirestoreSync();
  else window.addEventListener('trt:firebase-ready', startSosLogFirestoreSync, { once: true });

  Object.assign(window, { runnerStore: { listRunners, listRunnersByUid, registerRunner, updateRunnerProgress, cancelRunner, deleteRunner, renumberBibs, logSosTriggered, resolveSosLog, listSosLog, isReady, waitUntilReady } });
})();
