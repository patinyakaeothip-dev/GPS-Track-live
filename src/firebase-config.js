// firebase-config.js — fill this in with the values from
// Firebase Console → Project settings → Your apps → Web app (</>) → SDK setup.
// These are public client identifiers (not secrets) and are safe to commit —
// Firestore/Auth access is actually restricted by Security Rules, not by
// hiding this object.
//
// Leave everything blank to keep running the current localStorage-only demo
// mode (src/event-store.js falls back automatically when this isn't filled in).

window.FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};
