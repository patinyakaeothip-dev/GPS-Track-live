// gps-tracker.js — background GPS tracking for the native (Capacitor) shell.
// This file is NOT loaded directly by the browser — it's an ES module bundled
// by esbuild (`npm run build:native`) into gps-tracker.bundle.js, an IIFE
// that exposes `window.trtGpsTracker` so the plain <script type="text/babel">
// React app (mobile-app.jsx, no bundler) can call into it with plain globals.
//
// Why this needs a native shell at all: browsers suspend/throttle JS the
// moment the screen locks or the tab backgrounds, so a runner's position
// stops updating exactly when it matters most (mid-race, phone in pocket).
// @capacitor-community/background-geolocation runs as a native OS service
// instead, so it keeps reporting positions while the app is backgrounded.
//
// On the web (no Capacitor bridge — e.g. testing in a normal browser tab)
// this transparently falls back to navigator.geolocation.watchPosition,
// which only works while the tab is foregrounded. That's fine for demoing
// in a browser; real background tracking only happens inside the built app.

import { Capacitor, registerPlugin } from '@capacitor/core';

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');

let watcherId = null;
let onPing = null;
// Identity used for every pushPing while a watcher is running — kept as
// mutable module state (not captured once in the watcher callback's
// closure) so a later start() call can correct it, same as onPing below.
let currentEventId = null;
let currentBib = null;
let retryTimerId = null;
let heartbeatTimerId = null;
let lastFix = null; // { lat, lon, accuracy, speed } — most recent fix regardless of whether it was far enough to trigger a ping
let lastPingAt = 0;
let heartbeatEventId = null;
let heartbeatBib = null;
let visibilityHandler = null;

// Battery mode: a runner mid-race for many hours cares more about their
// phone lasting the whole race than about map-dot smoothness on a long
// distance, but a short/technical race wants the tightest update rate it
// can get. Three tiers instead of a plain on/off toggle, matching the
// reference the user asked to match — heartbeatMs is this mode's ceiling
// on how long the dot can sit stale with zero movement; distanceFilter is
// how far a runner must move to trigger a ping before that ceiling hits;
// enableHighAccuracy/maximumAge only affect the web fallback (native's own
// accuracy is controlled by distanceFilter alone; there's no separate
// accuracy knob on that plugin). Persisted so the choice survives an app
// relaunch, same as everything else read straight from localStorage here.
const GPS_MODE_KEY = 'trt.gps.mode.v1';
const GPS_MODES = ['performance', 'normal', 'eco'];
function loadMode() {
  try {
    const raw = localStorage.getItem(GPS_MODE_KEY);
    // 'saver' was this key's only non-'normal' value before the 3-tier
    // split below — treat it as this range's closest equivalent, eco,
    // rather than silently reverting anyone who'd already picked it back
    // to normal.
    if (raw === 'saver') return 'eco';
    return GPS_MODES.includes(raw) ? raw : 'normal';
  } catch (_) { return 'normal'; }
}
function saveMode(mode) {
  try { localStorage.setItem(GPS_MODE_KEY, mode); } catch (_) {}
}
let currentMode = loadMode();
const MODE_CONFIG = {
  performance: { distanceFilter: 20, heartbeatMs: 45000, enableHighAccuracy: true, maximumAge: 3000 },
  normal: { distanceFilter: 60, heartbeatMs: 210000, enableHighAccuracy: true, maximumAge: 8000 },
  eco: { distanceFilter: 500, heartbeatMs: 600000, enableHighAccuracy: false, maximumAge: 60000 },
};

// The background-geolocation plugin only ever fires on movement past
// distanceFilter — it has no time-based option of its own. That's fine
// while running, but leaves the map dot sitting motionless for a long
// stretch whenever a runner walks slowly, rests at a checkpoint, or is
// stuck in a queue — indistinguishable on Live Monitor from GPS having
// actually died. A heartbeat re-sends the last known fix on a timer so
// there's always a recent ping to show/measure staleness against, even
// with zero movement. The tick itself runs on a fixed, short interval
// (HEARTBEAT_TICK_MS) regardless of mode — only the *threshold* checked
// each tick depends on currentMode — so switching modes mid-race takes
// effect on the very next tick with nothing to tear down and recreate.
const HEARTBEAT_TICK_MS = 15000;
function isNative() {
  return Capacitor.isNativePlatform();
}

// A fix's accuracy is the radius (meters) the OS itself says the true
// position could be off by. Under tree cover, in an urban canyon, or
// whenever the OS falls back to cell/WiFi-based positioning instead of a
// real GPS/GNSS lock, that radius can balloon to hundreds of meters or
// more — and unlike a missing fix (which just means no update), a *bad*
// fix looks exactly like a real one, so it gets plotted straight onto the
// map/route and can visibly overshoot well past the runner's actual
// location. Dropping fixes this poor and waiting for the next, better one
// is worth far more than showing a wrong dot immediately.
const MAX_ACCURACY_M = 100;
function accuracyOk(accuracy) {
  return accuracy == null || accuracy <= MAX_ACCURACY_M;
}
// A GPS chip coming from a cold-ish start (just walked outside from
// indoors, phone just unlocked, etc.) can take a while to settle to a
// genuinely good fix — every reading in that window can plausibly stay
// worse than MAX_ACCURACY_M, which meant strict filtering alone could
// reject every single fix indefinitely and show "no live GPS" forever
// even outdoors with a real, if imprecise, position available the whole
// time. A late/rough position beats no position — once it's been this
// long since the last *accepted* fix, accept the next one regardless of
// accuracy rather than keep waiting for a good one that may not come.
const ACCURACY_GRACE_MS = 60000;
let lastAcceptedAt = 0;
function shouldAcceptFix(accuracy) {
  if (accuracyOk(accuracy)) return true;
  return Date.now() - lastAcceptedAt > ACCURACY_GRACE_MS;
}

// GPS itself needs no signal (satellites, not cell towers) — but writing a
// ping to Firestore does need connectivity, and trail courses routinely run
// through dead zones. A failed write used to just get logged and dropped,
// so a runner's dot would sit stale on the map until their *next* ping
// happened to land after signal came back — which, in a long dead zone,
// might be a while. Only the most recent failed ping is worth keeping
// (see the one-doc-per-runner note below — history was never kept anyway),
// so on failure it's remembered here and retried until it lands, instead
// of just being lost.
const PENDING_KEY = 'trt.gps.pendingPing.v1';
function loadPending() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY)); } catch (_) { return null; }
}
function savePending(ping) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(ping)); } catch (_) {}
}
function clearPending() {
  try { localStorage.removeItem(PENDING_KEY); } catch (_) {}
}
async function flushPending() {
  const pending = loadPending();
  if (!pending || !window.fb) return;
  try {
    await window.fb.setDocById('livePos', `${pending.eventId}_${pending.bib}`, pending);
    clearPending();
  } catch (err) {
    // still offline/failing — leave it queued, the next timer tick or
    // 'online' event will try again.
  }
}

// One doc per runner, overwritten on every ping — NOT one doc per ping.
// A trail race can run for many hours with pings every ~10m of movement;
// keeping history per-point would mean thousands of Firestore docs per
// runner per race (and everyone spectating pays to read that history back).
// Spectators only ever need the *latest* position, so this stays a single
// cheap doc per runner regardless of race duration.
async function pushPing(eventId, bib, lat, lon, extra) {
  lastFix = { lat, lon, ...extra };
  lastPingAt = Date.now();
  lastAcceptedAt = lastPingAt;
  heartbeatEventId = eventId;
  heartbeatBib = bib;
  const ping = { eventId, bib, lat, lon, at: Date.now(), ...extra };
  if (onPing) onPing(ping);
  if (window.fb) {
    const id = `${eventId}_${bib}`;
    try {
      await window.fb.setDocById('livePos', id, ping);
      // A successful write means connectivity is back — clear out
      // whatever got stuck from an earlier dead zone so it doesn't
      // overwrite this fresher position on the next retry tick.
      clearPending();
    } catch (err) {
      console.warn('[gps-tracker] Firestore ping write failed — will retry', err);
      savePending(ping);
    }
  }
}

// eventId/bib identify whose position this is; onPingCb is an optional local
// callback (e.g. to update the Track tab's UI immediately, before the
// Firestore round-trip).
async function start(eventId, bib, onPingCb) {
  // The very first start() call (the moment a runner scans the start QR)
  // fires from a screen that unmounts immediately afterward, before the
  // UI that actually wants live position updates (AppShell) exists to
  // pass a callback — so always let the most recent caller's callback
  // take over, even once a watcher's already running, instead of only
  // ever accepting one set at creation time.
  if (onPingCb) onPing = onPingCb;
  // Same "most recent caller wins" treatment for eventId/bib — the very
  // first start() call (e.g. AppShell's resume-tracking effect firing on
  // app load, before the roster sync has patched in this runner's real
  // bib yet) used to fall back to session.runner.bib || uid || name, and
  // that fallback identity got permanently baked into the watcher's
  // closure below. Every later start() call with the *real* bib was a
  // no-op past the watcherId guard, so pings kept writing to
  // livePos/<eventId>_<uid> forever — a doc Live Monitor/Friends never
  // looks at, since they query by bib. Runner's own device still looked
  // fine (it reads onPing/local state, not Firestore) which is what made
  // this so easy to miss. Updating these on every call means a later,
  // correct bib takes over immediately, even once the watcher's running.
  currentEventId = eventId;
  currentBib = bib;
  // Idempotent — the app calls this both at the exact moment a runner
  // scans start, and (separately, see mobile-app.jsx's AppShell) on every
  // app load to resume tracking for someone already mid-race after a
  // reload/relaunch. Those two calls often land back to back for the same
  // runner; without this guard the second call would leak the first
  // watcher (never removed) while starting a redundant second one.
  if (watcherId != null) return;
  retryTimerId = setInterval(flushPending, 15000);
  window.addEventListener('online', flushPending);
  heartbeatTimerId = setInterval(() => {
    if (!lastFix || Date.now() - lastPingAt < MODE_CONFIG[currentMode].heartbeatMs) return;
    pushPing(heartbeatEventId, heartbeatBib, lastFix.lat, lastFix.lon, { accuracy: lastFix.accuracy, speed: lastFix.speed });
  }, HEARTBEAT_TICK_MS);

  if (isNative()) {
    await addNativeWatcher();
    return;
  }
  startWebWatcher();
}

// Native watcher setup — its own function (not inlined in start()) so
// setMode can remove and re-add it with a fresh distanceFilter without
// touching the timers/listeners start() also sets up, which only ever need
// doing once per session regardless of how many times the mode changes.
async function addNativeWatcher() {
  watcherId = await BackgroundGeolocation.addWatcher(
    {
      backgroundMessage: 'กำลังติดตามตำแหน่ง GPS ระหว่างวิ่ง',
      backgroundTitle: 'Rayong Trail',
      requestPermissions: true,
      stale: false,
      distanceFilter: MODE_CONFIG[currentMode].distanceFilter, // meters — spectators only need map-level precision; denser pings just burn battery + Firestore writes for no visible benefit
    },
    (location, error) => {
      if (error) { console.warn('[gps-tracker] native watcher error', error); return; }
      if (!location) return;
      if (!shouldAcceptFix(location.accuracy)) { console.warn('[gps-tracker] dropping low-accuracy native fix', location.accuracy); return; }
      pushPing(currentEventId, currentBib, location.latitude, location.longitude, { accuracy: location.accuracy, speed: location.speed ?? null });
    },
  );
}

// Web fallback: foreground-only. Its own function for the same reason as
// addNativeWatcher above — setMode can tear down and restart just the
// watcher, not the visibilityHandler (registered once, reads currentMode
// itself on every catch-up fix so it never goes stale).
function startWebWatcher() {
  if (!navigator.geolocation) return;
  const cfg = MODE_CONFIG[currentMode];
  watcherId = navigator.geolocation.watchPosition(
    pos => {
      if (!shouldAcceptFix(pos.coords.accuracy)) { console.warn('[gps-tracker] dropping low-accuracy browser fix', pos.coords.accuracy); return; }
      pushPing(currentEventId, currentBib, pos.coords.latitude, pos.coords.longitude, { accuracy: pos.coords.accuracy, speed: pos.coords.speed ?? null });
    },
    err => console.warn('[gps-tracker] browser watcher error', err),
    { enableHighAccuracy: cfg.enableHighAccuracy, maximumAge: cfg.maximumAge },
  );
  if (visibilityHandler) return; // already registered from an earlier startWebWatcher() call this session
  // watchPosition just silently stops delivering callbacks while the tab
  // is backgrounded/screen-locked (see the file-level note on why) —
  // there was nothing that kicked it back into gear once the runner
  // unlocked their phone and came back, so Live Monitor kept showing
  // wherever they were the moment the screen locked, arbitrarily far
  // behind, until the next natural movement callback happened to land.
  // Grab one fresh fix immediately on regaining visibility instead of
  // waiting for that.
  visibilityHandler = () => {
    if (document.visibilityState !== 'visible') return;
    const c = MODE_CONFIG[currentMode];
    navigator.geolocation.getCurrentPosition(
      pos => {
        if (!shouldAcceptFix(pos.coords.accuracy)) { console.warn('[gps-tracker] dropping low-accuracy catch-up fix', pos.coords.accuracy); return; }
        pushPing(currentEventId, currentBib, pos.coords.latitude, pos.coords.longitude, { accuracy: pos.coords.accuracy, speed: pos.coords.speed ?? null });
      },
      err => console.warn('[gps-tracker] visibility catch-up fix failed', err),
      { enableHighAccuracy: c.enableHighAccuracy, maximumAge: c.maximumAge },
    );
  };
  document.addEventListener('visibilitychange', visibilityHandler);
}

// Switches battery-saver on/off. Takes effect on the very next heartbeat
// tick regardless (see HEARTBEAT_TICK_MS above); for the actual GPS
// watcher — distanceFilter (native) / enableHighAccuracy+maximumAge (web)
// — those are only read once, at the moment a watcher is created, so an
// already-running watcher is torn down and immediately re-created here to
// pick up the new setting mid-race instead of only on the next app launch.
async function setMode(mode) {
  const next = GPS_MODES.includes(mode) ? mode : 'normal';
  if (next === currentMode) return;
  currentMode = next;
  saveMode(next);
  if (watcherId == null) return;
  if (isNative()) {
    await BackgroundGeolocation.removeWatcher({ id: watcherId });
    watcherId = null;
    await addNativeWatcher();
  } else if (navigator.geolocation) {
    navigator.geolocation.clearWatch(watcherId);
    watcherId = null;
    startWebWatcher();
  }
}
function getMode() {
  return currentMode;
}

async function stop() {
  if (retryTimerId) { clearInterval(retryTimerId); retryTimerId = null; }
  if (heartbeatTimerId) { clearInterval(heartbeatTimerId); heartbeatTimerId = null; }
  window.removeEventListener('online', flushPending);
  lastFix = null;
  lastPingAt = 0;
  lastAcceptedAt = 0;
  if (visibilityHandler) { document.removeEventListener('visibilitychange', visibilityHandler); visibilityHandler = null; }
  if (watcherId == null) return;
  if (isNative()) await BackgroundGeolocation.removeWatcher({ id: watcherId });
  else navigator.geolocation.clearWatch(watcherId);
  watcherId = null;
  onPing = null;
  currentEventId = null;
  currentBib = null;
}

window.trtGpsTracker = { start, stop, isNative, setMode, getMode };
