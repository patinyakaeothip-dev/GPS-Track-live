// photo-saver.js — saves a data-URL image straight to the device's Photos
// album via @capacitor-community/media, when running in the native
// (Capacitor) shell. This file is NOT loaded directly by the browser — it's
// bundled by esbuild (`npm run build:native`) into photo-saver.bundle.js, an
// IIFE that exposes `window.trtPhotoSaver`, same pattern as gps-tracker.js.
//
// Why this needs a native call at all: the web-standard way to hand a
// generated image to the OS is the Share Sheet (navigator.share), which
// works fine but makes "save to Photos" one extra tap behind "ดูเพิ่มเติม"/
// "More" instead of a single direct action — reported as unwanted friction
// on the certificate page specifically, the one place people actually want
// a one-tap save. Media.savePhoto writes straight to the camera roll, no
// share sheet involved, on both iOS and Android.
//
// On the web (no Capacitor bridge) this has nothing to fall back to —
// callers should keep their own web download/share flow for that case (see
// certificate.html's saveCertImage) and only use this when isNative() is
// true.

import { Capacitor } from '@capacitor/core';
import { Media } from '@capacitor-community/media';

function isNative() {
  return Capacitor.isNativePlatform();
}

// dataUrl: a "data:image/...;base64,..." string, e.g. from
// canvas.toDataURL() — Media.savePhoto accepts that directly, no need to
// decode it ourselves first.
async function saveDataUrl(dataUrl) {
  await Media.savePhoto({ path: dataUrl });
}

window.trtPhotoSaver = { saveDataUrl, isNative };
