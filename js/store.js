"use strict";
/**
 * store.js — live copy of the shared data.
 *
 * Listens to the database once and keeps everything in memory. Pages read
 * from here (no extra database reads when you move between pages), and are
 * told when something changes so they can refresh by themselves.
 */

const Store = {
  vendors: {}, vendorsLoaded: false,
  news: [], newsLoaded: false,
  config: { vendorCategories: [], newsCategories: [] },
  configLoaded: false, configExists: false,
  myReads: {}, readsLoaded: false,     // members: posts I have opened
  allReads: {},                         // admin: postId -> { uid -> record }
  members: [], membersLoaded: false,    // admin: everyone who has signed in
  errors: [],
};

const storeSubs = new Set();
let storeTimer = null;

function onStoreChange(fn) {
  storeSubs.add(fn);
  return () => storeSubs.delete(fn);
}
function emitStore() {
  if (storeTimer) return;
  storeTimer = setTimeout(() => {
    storeTimer = null;
    storeSubs.forEach((fn) => {
      try { fn(); } catch (e) { console.error(e); }
    });
  }, 20);
}

function docsToMap(snap) {
  const m = {};
  snap.forEach((d) => { m[d.id] = { id: d.id, ...d.data() }; });
  return m;
}

function startStore() {
  const uid = Session.user.uid;
  const fail = (what) => (e) => {
    console.error(what, e);
    Store.errors.push(what + ": " + (e && (e.code || e.message)));
    emitStore();
  };

  // Category lists (editable by the admin).
  fbDb.collection("config").doc("lists").onSnapshot((s) => {
    const d = s.exists ? s.data() : {};
    Store.config = {
      vendorCategories: d.vendorCategories || APP_SETTINGS.defaultVendorCategories.slice(),
      newsCategories: d.newsCategories || APP_SETTINGS.defaultNewsCategories.slice(),
    };
    Store.configExists = s.exists;
    Store.configLoaded = true;
    emitStore();
  }, fail("config"));

  // Vendors. Admin sees everything; members see approved ones plus their own.
  if (isAdmin()) {
    fbDb.collection("vendors").onSnapshot((snap) => {
      Store.vendors = docsToMap(snap);
      Store.vendorsLoaded = true;
      emitStore();
    }, fail("vendors"));
  } else {
    let approved = {}, mine = {};
    const merge = () => {
      Store.vendors = { ...approved, ...mine };
      Store.vendorsLoaded = true;
      emitStore();
    };
    fbDb.collection("vendors").where("status", "==", "approved").onSnapshot((snap) => {
      approved = docsToMap(snap);
      merge();
    }, fail("vendors"));
    fbDb.collection("vendors").where("createdBy", "==", uid).onSnapshot((snap) => {
      mine = docsToMap(snap);
      merge();
    }, fail("my vendors"));
  }

  // News & policy.
  fbDb.collection("news").onSnapshot((snap) => {
    Store.news = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    Store.newsLoaded = true;
    emitStore();
  }, fail("news"));

  // Read ticks.
  if (isAdmin()) {
    fbDb.collection("reads").onSnapshot((snap) => {
      const all = {};
      snap.forEach((d) => {
        const r = d.data();
        (all[r.postId] = all[r.postId] || {})[r.uid] = r;
      });
      Store.allReads = all;
      Store.readsLoaded = true;
      emitStore();
    }, fail("reads"));
    fbDb.collection("roles").onSnapshot((snap) => {
      Store.members = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      Store.membersLoaded = true;
      emitStore();
    }, fail("members"));
  } else {
    fbDb.collection("reads").where("uid", "==", uid).onSnapshot((snap) => {
      const mine = {};
      snap.forEach((d) => { mine[d.data().postId] = true; });
      Store.myReads = mine;
      Store.readsLoaded = true;
      emitStore();
    }, fail("reads"));
  }
}

function storeReady() {
  return (
    Store.vendorsLoaded && Store.newsLoaded && Store.configLoaded && Store.readsLoaded &&
    (!isAdmin() || Store.membersLoaded)
  );
}

// First time the admin opens the site, save the starting category lists.
function seedConfigIfNeeded() {
  if (isAdmin() && Store.configLoaded && !Store.configExists) {
    fbDb.collection("config").doc("lists").set(Store.config, { merge: true }).catch(() => {});
  }
}

function vendorCategories() { return Store.config.vendorCategories; }
function newsCategories() { return Store.config.newsCategories; }
function pendingVendors() {
  return Object.values(Store.vendors)
    .filter((v) => v.status === "pending")
    .sort((a, b) => tsMillis(a.createdAt) - tsMillis(b.createdAt));
}
function memberList() { return Store.members.filter((m) => m.role === "member"); }
