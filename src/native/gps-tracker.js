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

function isNative() {
  return Capacitor.isNativePlatform();
}

async function pushPing(eventId, bib, lat, lon, extra) {
  const ping = { eventId, bib, lat, lon, at: Date.now(), ...extra };
  if (onPing) onPing(ping);
  if (window.fb) {
    const id = `${eventId}_${bib}_${ping.at}`;
    try { await window.fb.setDocById('pings', id, ping); }
    catch (err) { console.warn('[gps-tracker] Firestore ping write failed', err); }
  }
}

// eventId/bib identify whose position this is; onPingCb is an optional local
// callback (e.g. to update the Track tab's UI immediately, before the
// Firestore round-trip).
async function start(eventId, bib, onPingCb) {
  onPing = onPingCb || null;

  if (isNative()) {
    watcherId = await BackgroundGeolocation.addWatcher(
      {
        backgroundMessage: 'กำลังติดตามตำแหน่ง GPS ระหว่างวิ่ง',
        backgroundTitle: 'Rayong Trail Running',
        requestPermissions: true,
        stale: false,
        distanceFilter: 10, // meters — trail pace doesn't need denser pings than this
      },
      (location, error) => {
        if (error) { console.warn('[gps-tracker] native watcher error', error); return; }
        if (location) pushPing(eventId, bib, location.latitude, location.longitude, { accuracy: location.accuracy });
      },
    );
    return;
  }

  // Web fallback: foreground-only.
  if (navigator.geolocation) {
    watcherId = navigator.geolocation.watchPosition(
      pos => pushPing(eventId, bib, pos.coords.latitude, pos.coords.longitude, { accuracy: pos.coords.accuracy }),
      err => console.warn('[gps-tracker] browser watcher error', err),
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
  }
}

async function stop() {
  if (watcherId == null) return;
  if (isNative()) await BackgroundGeolocation.removeWatcher({ id: watcherId });
  else navigator.geolocation.clearWatch(watcherId);
  watcherId = null;
  onPing = null;
}

window.trtGpsTracker = { start, stop, isNative };
