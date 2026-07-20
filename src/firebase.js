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
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
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
  const auth = getAuth(app);
  const db = getFirestore(app);
  const googleProvider = new GoogleAuthProvider();

  window.fb = {
    app, auth, db,
    signInWithGoogle: () => signInWithPopup(auth, googleProvider),
    signOutUser: () => signOut(auth),
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
  };
  window.dispatchEvent(new CustomEvent('trt:firebase-ready'));
}
