// firebase-config.js — fill this in with the values from
// Firebase Console → Project settings → Your apps → Web app (</>) → SDK setup.
// These are public client identifiers (not secrets) and are safe to commit —
// Firestore/Auth access is actually restricted by Security Rules, not by
// hiding this object.
//
// Leave everything blank to keep running the current localStorage-only demo
// mode (src/event-store.js falls back automatically when this isn't filled in).

window.FIREBASE_CONFIG = {
  apiKey: 'AIzaSyC4YFyApNa8vHydeAZ_48pABgGIXmKLx3s',
  // Same-origin as this site rather than Firebase's default
  // rayong-trail-live.firebaseapp.com — see functions/__/auth/[[path]].js
  // for why: redirect-based sign-in (Apple, and Google's popup-blocked
  // fallback) needs the whole round-trip to stay on one origin or modern
  // browsers' third-party storage partitioning silently drops the pending
  // sign-in state on the way back.
  authDomain: 'gps-track-live.pages.dev',
  projectId: 'rayong-trail-live',
  storageBucket: 'rayong-trail-live.firebasestorage.app',
  messagingSenderId: '404432675602',
  appId: '1:404432675602:web:7d4e2c65082d28c00409cb',
};
