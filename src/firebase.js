// firebase.js — thin wrapper around the Firebase modular SDK (loaded via CDN
// as an ES module). Exposes window.fb with auth + Firestore helpers so the
// rest of the app (plain <script type="text/babel">, no bundler) can call
// into it without import statements.
//
// Does nothing (window.fb stays null) until src/firebase-config.js has real
// values — every caller must check `window.fb` before using it and fall
// back to the existing localStorage behavior otherwise.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, initializeAuth, indexedDBLocalPersistence, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signInWithCredential, getRedirectResult, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore, collection, doc, getDocs, setDoc, deleteDoc, onSnapshot,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const cfg = window.FIREBASE_CONFIG || {};
const configured = !!(cfg.apiKey && cfg.projectId);

if (!configured) {
  console.warn('[firebase] FIREBASE_CONFIG not filled in — running in localStorage-only demo mode. See src/firebase-config.js.');
  window.fb = null;
} else {
  const app = initializeApp(cfg);
  // getAuth()'s automatic persistence detection hangs indefinitely inside a
  // Capacitor WKWebView (capacitor://localhost origin) — signInWithCredential
  // never resolves or rejects, it just sits there. Forcing indexedDB
  // persistence explicitly skips whatever's going wrong in that
  // auto-detection. window.Capacitor is injected by the native runtime
  // before any page script runs, so it's safe to read directly here.
  const isNativeShell = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const auth = isNativeShell ? initializeAuth(app, { persistence: indexedDBLocalPersistence }) : getAuth(app);
  const db = getFirestore(app);
  const googleProvider = new GoogleAuthProvider();

  window.fb = {
    app, auth, db,
    // Try popup first, fall back to redirect. Neither one alone has proven
    // reliable across every real device tested:
    //  - popup used to fail everywhere with "Cross-Origin-Opener-Policy
    //    policy would block the window.closed call" — fixed by serving
    //    `Cross-Origin-Opener-Policy: same-origin-allow-popups` (see
    //    _headers) so this page is allowed to poll the popup window.
    //  - redirect alone (tried previously) still silently failed on real
    //    mobile phones even once that popup issue was understood — the
    //    round trip through the authDomain (a different origin than this
    //    app) and back seems to lose its pending state in some mobile
    //    browser storage-partitioning scenarios that are hard to reproduce
    //    outside a real device.
    // Popup succeeding first avoids that whole round trip; only environments
    // that outright block/close the popup (in-app webviews like Line/
    // Facebook, popup blockers) fall through to redirect.
    async signInWithGoogle() {
      // Inside the native app shell there's no browser tab for a popup or
      // redirect to round-trip through — see src/native/firebase-auth-native.js
      // for why. Drive the OS-native Google Sign-In UI instead, then fold the
      // resulting Google ID token into this same `auth` instance so the rest
      // of the app can keep treating web and native sign-in identically.
      if (window.trtNativeAuth && window.trtNativeAuth.isNative()) {
        const idToken = await window.trtNativeAuth.signInWithGoogle();
        return signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
      }
      try {
        return await signInWithPopup(auth, googleProvider);
      } catch (err) {
        const popupFailureCodes = ['auth/popup-blocked', 'auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/operation-not-supported-in-this-environment'];
        if (popupFailureCodes.includes(err.code)) return signInWithRedirect(auth, googleProvider);
        throw err;
      }
    },
    // Only relevant on the redirect path — call on page load to pick up the
    // result of a Google sign-in that just navigated back. Resolves to null
    // when there's no pending redirect sign-in.
    getGoogleRedirectResult: () => getRedirectResult(auth),
    async signOutUser() {
      if (window.trtNativeAuth && window.trtNativeAuth.isNative()) await window.trtNativeAuth.signOut();
      return signOut(auth);
    },
    onAuthChange: (cb) => onAuthStateChanged(auth, cb),
    // Collection helpers used by src/event-store.js and friends.
    async listDocs(colName) {
      const snap = await getDocs(collection(db, colName));
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },
    async setDocById(colName, id, data) {
      await setDoc(doc(db, colName, id), data);
    },
    async deleteDocById(colName, id) {
      await deleteDoc(doc(db, colName, id));
    },
    watchCollection(colName, cb) {
      return onSnapshot(collection(db, colName), snap => {
        cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
    },
    // Watches a single doc instead of a whole collection — used for live GPS
    // position (src/native/gps-tracker.js writes one doc per runner, and a
    // spectator only ever needs that one runner's latest fix, not everyone's).
    watchDocById(colName, id, cb) {
      return onSnapshot(doc(db, colName, id), snap => {
        cb(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      });
    },
  };
  window.dispatchEvent(new CustomEvent('trt:firebase-ready'));
}
