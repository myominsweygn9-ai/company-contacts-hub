"use strict";
/**
 * app.js — page routing, top bar and start-up.
 * Pages are chosen by the part after # in the address:
 *   #/vendors  #/vendor/<id>  #/news  #/news/<id>  #/admin
 */

const ROUTES = [
  { re: /^#\/vendors$/, view: VendorsView, tab: "vendors" },
  { re: /^#\/vendor\/([^/]+)$/, view: VendorDetailView, tab: "vendors" },
  { re: /^#\/news$/, view: NewsView, tab: "news" },
  { re: /^#\/news\/([^/]+)$/, view: NewsPostView, tab: "news" },
  { re: /^#\/admin$/, view: AdminView, tab: "admin", adminOnly: true },
];

let currentView = null;

function route() {
  const hash = location.hash || "#/vendors";
  for (const r of ROUTES) {
    const m = hash.match(r.re);
    if (!m) continue;
    if (r.adminOnly && !isAdmin()) {
      location.hash = "#/vendors";
      return;
    }
    if (currentView && currentView.unmount) currentView.unmount();
    currentView = r.view;
    window.scrollTo(0, 0);
    r.view.mount(document.getElementById("view"), m[1] ? decodeURIComponent(m[1]) : null);
    document.querySelectorAll("#tabs a").forEach((a) =>
      a.classList.toggle("active", a.dataset.route === r.tab)
    );
    return;
  }
  location.hash = "#/vendors";
}

function updateChrome() {
  const nb = document.getElementById("badge-news");
  const n = unreadCount();
  nb.textContent = n;
  nb.hidden = !n;

  if (isAdmin()) {
    const ab = document.getElementById("badge-admin");
    const p = pendingVendors().length;
    ab.textContent = p;
    ab.hidden = !p;
  }

  const banner = document.getElementById("banner");
  if (Store.errors.length) {
    banner.hidden = false;
    banner.textContent =
      "Some information could not be loaded (" + Store.errors[0] +
      "). If this keeps happening, tell the admin.";
  } else {
    banner.hidden = true;
  }
}

function showBootMessage(html) {
  const boot = document.getElementById("boot");
  boot.hidden = false;
  boot.innerHTML = html;
}

async function boot() {
  if (!FIREBASE_READY) {
    showBootMessage(
      '<div class="boot-card"><h2>Almost ready</h2><p>The site is not connected to Firebase yet. Open <code>js/firebase-init.js</code> and paste in your Firebase details (see README-SETUP.md, Phase 2).</p></div>'
    );
    return;
  }

  try {
    await requireLogin();
  } catch (e) {
    console.error(e);
    showBootMessage(
      '<div class="boot-card"><h2>Could not sign you in</h2><p>Your account is signed in, but its profile could not be read. Check that the security rules were published (README-SETUP.md, Phase 2) and try again.</p><p><button type="button" class="btn-secondary" id="boot-logout">Log out</button></p></div>'
    );
    document.getElementById("boot-logout").addEventListener("click", logout);
    return;
  }

  document.getElementById("brand-name").textContent = APP_SETTINGS.appName;
  document.getElementById("brand-sub").textContent = APP_SETTINGS.tagline;
  document.title = APP_SETTINGS.appName;
  document.getElementById("user-label").textContent =
    myName() + (isAdmin() ? " · Admin" : "");
  document.getElementById("tab-admin").hidden = !isAdmin();
  document.getElementById("logout").addEventListener("click", logout);

  startStore();
  onStoreChange(() => {
    seedConfigIfNeeded();
    updateChrome();
    if (currentView && currentView.update) currentView.update();
  });

  // Wait briefly for the first data so the page does not flash empty.
  const started = Date.now();
  while (!storeReady() && Date.now() - started < 6000) {
    await new Promise((r) => setTimeout(r, 50));
  }

  document.getElementById("boot").hidden = true;
  document.getElementById("topbar").hidden = false;
  updateChrome();
  window.addEventListener("hashchange", route);
  route();
}

document.addEventListener("DOMContentLoaded", boot);
