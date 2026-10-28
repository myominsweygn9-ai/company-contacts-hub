"use strict";
/** home.js — the Home page: welcome, totals, categories, newest vendors and posts. */

const HomeView = (() => {
  let root = null;

  function mount(container) {
    root = container;
    root.onclick = (ev) => {
      const tile = ev.target.closest("[data-homecat]");
      if (tile) window.pendingVendorCat = tile.dataset.homecat;
      cardClick(ev);
    };
    update();
  }

  function update() {
    if (!root) return;
    const approved = Object.values(Store.vendors).filter((v) => v.status === "approved");
    const posts = Store.news;
    const policies = posts.filter(isPolicy);
    const news = posts.filter((p) => !isPolicy(p));
    const first = String(myName()).split(" ")[0];
    const total = memberList().length;

    const pend = isAdmin() ? pendingVendors().length : 0;
    const un = unreadNewsCount(), up = unreadPolicyCount();

    // Categories that have vendors first, then the rest.
    const cats = vendorCategories().map((c, i) => ({ c, i, n: approved.filter((v) => v.category === c).length }));
    cats.sort((a, b) => b.n - a.n || a.i - b.i);
    const tiles = cats.slice(0, 6);

    const recent = approved.slice().sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt)).slice(0, 3);
    const latest = posts.slice().sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt)).slice(0, 3);

    root.innerHTML = `
      ${pend ? `<div class="notice warn">${pend} vendor${pend > 1 ? "s are" : " is"} waiting for your approval. <a href="#/admin/approvals">Review now</a></div>` : ""}
      <section class="hero">
        <div>
          <div class="eyebrow">YOUR INTERNAL PORTAL</div>
          <h2>Welcome, ${esc(first)}</h2>
          <p>Find trusted contractors, read team updates and check work policies, all in one place.</p>
        </div>
        <div class="hero-art">🤝</div>
      </section>

      <section class="stats">
        <a class="stat" href="#/vendors"><div class="icon-tile">▦</div><div><b>${approved.length}</b><span class="lbl">Trusted vendors</span></div></a>
        <a class="stat" href="#/news"><div class="icon-tile">📣</div><div><b>${news.length}</b><span class="lbl">News &amp; updates</span>${un ? `<div class="new-note">${un} new</div>` : ""}</div></a>
        <a class="stat" href="#/policy"><div class="icon-tile">📄</div><div><b>${policies.length}</b><span class="lbl">Work policies</span>${up ? `<div class="new-note">${up} new</div>` : ""}</div></a>
      </section>

      <div class="section-head"><h3>Browse service categories</h3><a href="#/vendors">View all vendors →</a></div>
      <div class="cat-grid">
        ${tiles.length ? tiles.map((t) => `
          <a class="cat-tile" href="#/vendors" data-homecat="${esc(t.c)}">
            <span class="ci">${categoryIcon(t.c)}</span><b>${esc(t.c)}</b><small>${t.n} vendor${t.n === 1 ? "" : "s"}</small>
          </a>`).join("") : '<div class="empty">No categories yet.</div>'}
      </div>

      <div class="section-head"><h3>Recently added vendors</h3><a href="#/vendors">View directory →</a></div>
      <div class="grid">${recent.length ? recent.map(vendorCardHtml).join("") : '<div class="empty">No vendors yet. Add the first one from the Vendor Directory.</div>'}</div>

      <div class="section-head"><h3>Latest news &amp; policies</h3><a href="#/news">View updates →</a></div>
      ${latest.length ? latest.map((p) => newsCardHtml(p, total)).join("") : '<div class="empty">No posts yet.</div>'}
    `;
  }

  function unmount() { if (root) root.onclick = null; root = null; }
  return { mount, update, unmount };
})();
