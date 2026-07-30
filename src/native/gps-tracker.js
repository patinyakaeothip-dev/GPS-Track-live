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
let retryTimerId = null;

function isNative() {
  return Capacitor.isNativePlatform();
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
  // Idempotent — the app calls this both at the exact moment a runner
  // scans start, and (separately, see mobile-app.jsx's AppShell) on every
  // app load to resume tracking for someone already mid-race after a
  // reload/relaunch. Those two calls often land back to back for the same
  // runner; without this guard the second call would leak the first
  // watcher (never removed) while starting a redundant second one.
  if (watcherId != null) return;
  onPing = onPingCb || null;
  retryTimerId = setInterval(flushPending, 15000);
  window.addEventListener('online', flushPending);

  if (isNative()) {
    watcherId = await BackgroundGeolocation.addWatcher(
      {
        backgroundMessage: 'กำลังติดตามตำแหน่ง GPS ระหว่างวิ่ง',
        backgroundTitle: 'Rayong Trail',
        requestPermissions: true,
        stale: false,
        distanceFilter: 50, // meters — spectators only need map-level precision; denser pings just burn battery + Firestore writes for no visible benefit
      },
      (location, error) => {
        if (error) { console.warn('[gps-tracker] native watcher error', error); return; }
        if (location) pushPing(eventId, bib, location.latitude, location.longitude, { accuracy: location.accuracy, speed: location.speed ?? null });
      },
    );
    return;
  }

  // Web fallback: foreground-only.
  if (navigator.geolocation) {
    watcherId = navigator.geolocation.watchPosition(
      pos => pushPing(eventId, bib, pos.coords.latitude, pos.coords.longitude, { accuracy: pos.coords.accuracy, speed: pos.coords.speed ?? null }),
      err => console.warn('[gps-tracker] browser watcher error', err),
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
  }
}

async function stop() {
  if (retryTimerId) { clearInterval(retryTimerId); retryTimerId = null; }
  window.removeEventListener('online', flushPending);
  if (watcherId == null) return;
  if (isNative()) await BackgroundGeolocation.removeWatcher({ id: watcherId });
  else navigator.geolocation.clearWatch(watcherId);
  watcherId = null;
  onPing = null;
}

window.trtGpsTracker = { start, stop, isNative };
