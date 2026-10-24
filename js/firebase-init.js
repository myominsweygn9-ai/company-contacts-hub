/**
 * firebase-init.js
 * ------------------------------------------------------------------
 * Connection details for YOUR Firebase project.
 *
 * Replace the six PASTE_... values below with the ones shown in
 * Firebase console > Project settings > Your apps > Web app.
 * (See README-SETUP.md, Phase 2.)
 *
 * Use a NEW Firebase project for this site — not the one used by the
 * technician checklist — so the two sites and their user lists stay
 * completely separate.
 * ------------------------------------------------------------------
 */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAbKUw0BPxYFQ3FEgN5Hy-ohxHQ32e_5EQ",
  authDomain: "contacts-hub-190f6.firebaseapp.com",
  projectId: "contacts-hub-190f6",
  storageBucket: "contacts-hub-190f6.firebasestorage.app",
  messagingSenderId: "76520923805",
  appId: "1:76520923805:web:f2d88eafffcf1e6434ea74",
};

const FIREBASE_READY = !FIREBASE_CONFIG.apiKey.startsWith("PASTE");

let fbAuth = null;
let fbDb = null;

if (FIREBASE_READY && typeof firebase !== "undefined") {
  if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
  fbAuth = firebase.auth();
  // The login page does not load Firestore, so only start it when present.
  if (typeof firebase.firestore === "function") {
    fbDb = firebase.firestore();
    // Keeps a copy on each device: pages open instantly, and only changed
    // records are downloaded again. This keeps usage far below the free limits.
    fbDb.enablePersistence({ synchronizeTabs: true }).catch(() => {});
  }
}
