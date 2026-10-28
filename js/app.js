"use strict";
/**
 * app.js — page routing, sidebar and start-up.
 *   #/home  #/vendors  #/vendor/<id>  #/news  #/news/<id>  #/policy  #/admin/<tab>
 */

const ROUTES = [
  { re: /^#\/home$/, view: HomeView, nav: () => "home" },
  { re: /^#\/vendors$/, view: VendorsView, nav: () => "vendors" },
  { re: /^#\/vendor\/([^/]+)$/, view: VendorDetailView, nav: () => "vendors" },
  { re: /^#\/news$/, view: NewsView, nav: () => "news" },
  { re: /^#\/policy$/, view: PolicyView, nav: () => "policy" },
  {
    re: /^#\/news\/([^/]+)$/, view: NewsPostView,
    nav: (id) => { const p = Store.news.find((x) => x.id === id); return p && isPolicy(p) ? "policy" : "news"; },
  },
  { re: /^#\/admin(?:\/([a-z]+))?$/, view: AdminView, nav: (t) => "admin-" + (t || "approvals"), adminOnly: true },
];

let currentView = null;

function route() {
  const hash = location.hash || "#/home";
  document.body.classList.remove("nav-open");
  for (const r of ROUTES) {
    const m = hash.match(r.re);
    if (!m) continue;
    if (r.adminOnly && !isAdmin()) {
      location.hash = "#/home";
      return;
    }
    if (currentView && currentView.unmount) currentView.unmount();
    currentView = r.view;
    window.scrollTo(0, 0);
    const param = m[1] ? decodeURIComponent(m[1]) : null;
    r.view.mount(document.getElementById("view"), param);
    const key = r.nav(param);
    document.querySelectorAll(".nav a").forEach((a) =>
      a.classList.toggle("active", a.dataset.route === key)
    );
    return;
  }
  location.hash = "#/home";
}

function setBadge(id, n) {
  const el = document.getElementById(id);
  el.textContent = n;
  el.hidden = !n;
}

function updateChrome() {
  setBadge("badge-news", unreadNewsCount());
  setBadge("badge-policy", unreadPolicyCount());
  if (isAdmin()) setBadge("badge-admin", pendingVendors().length);

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

  document.title = APP_SETTINGS.appName;
  const ini = initials(myName());
  document.getElementById("sb-avatar").textContent = ini;
  document.getElementById("top-avatar").textContent = ini;
  document.getElementById("sb-name").textContent = myName();
  document.getElementById("sb-role").textContent = isAdmin() ? "Administrator" : "Team member";
  document.getElementById("user-label").textContent = myName();
  document.getElementById("admin-nav").hidden = !isAdmin();
  document.getElementById("logout").addEventListener("click", logout);

  // Mobile menu
  document.getElementById("menu-btn").addEventListener("click", () => document.body.classList.toggle("nav-open"));
  document.getElementById("sb-backdrop").addEventListener("click", () => document.body.classList.remove("nav-open"));

  // Search box in the top bar searches vendors.
  document.getElementById("gsearch").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const input = document.getElementById("gsearch-input");
    window.pendingVendorQuery = input.value.trim();
    window.pendingVendorCat = "All";
    if (location.hash === "#/vendors") route();
    else location.hash = "#/vendors";
    input.blur();
  });

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
  document.getElementById("app").hidden = false;
  updateChrome();
  window.addEventListener("hashchange", route);
  route();
}

document.addEventListener("DOMContentLoaded", boot);
