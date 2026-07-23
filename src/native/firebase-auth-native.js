// firebase-auth-native.js — Google sign-in for the native (Capacitor) app
// shell, bundled by esbuild into firebase-auth-native.bundle.js (same
// pattern as gps-tracker.js) so the plain <script> app (src/firebase.js,
// no bundler) can call into it via a global.
//
// Why this exists: src/firebase.js's signInWithGoogle() uses
// signInWithPopup/signInWithRedirect, which need a real browser tab. Inside
// a Capacitor WKWebView there is no separate browser process for a popup,
// and a redirect round-trip has nowhere to "come back" to — the button just
// spins on "กำลังเข้าสู่ระบบ..." forever. @capacitor-firebase/authentication
// drives the OS-native Google Sign-In SDK instead (a real native UI, not a
// webview), then hands back a Google ID token that src/firebase.js exchanges
// for a normal Firebase Auth session via signInWithCredential — so the rest
// of the app (onAuthChange, auth.currentUser, ...) doesn't need to know or
// care whether the sign-in happened natively or via the web SDK.

import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';

function isNative() {
  return Capacitor.isNativePlatform();
}

// Resolves to a Google ID token, or throws — src/firebase.js turns that
// into a Firebase credential and signs the web SDK's `auth` in with it.
async function signInWithGoogle() {
  const result = await FirebaseAuthentication.signInWithGoogle();
  const idToken = result && result.credential && result.credential.idToken;
  if (!idToken) throw new Error('[firebase-auth-native] no idToken returned from native Google sign-in');
  return idToken;
}

async function signOut() {
  try { await FirebaseAuthentication.signOut(); } catch (err) { console.warn('[firebase-auth-native] native sign-out failed', err); }
}

window.trtNativeAuth = { isNative, signInWithGoogle, signOut };
