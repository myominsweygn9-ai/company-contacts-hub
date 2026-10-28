"use strict";
/**
 * admin.js — screens only the admin sees:
 *   Approvals (vendors added by members), Members, Categories, Backup.
 */

async function renameCategory(kind, oldName, newName) {
  const isVendor = kind === "vendor";
  const list = (isVendor ? vendorCategories() : newsCategories()).map((c) => (c === oldName ? newName : c));
  await saveCategoryList(kind, [...new Set(list)]);

  const items = isVendor ? Object.values(Store.vendors) : Store.news;
  const coll = isVendor ? "vendors" : "news";
  const affected = items.filter((x) => x.category === oldName);
  for (const part of chunk(affected, 400)) {
    const b = fbDb.batch();
    part.forEach((x) => b.update(fbDb.collection(coll).doc(x.id), { category: newName }));
    await b.commit();
  }
}

function saveCategoryList(kind, list) {
  const key = kind === "vendor" ? "vendorCategories" : "newsCategories";
  return fbDb.collection("config").doc("lists").set({ [key]: list }, { merge: true });
}

async function buildBackup(setStatus) {
  const vendors = Object.values(Store.vendors);
  const out = { exportedAt: new Date().toISOString(), vendors: [], news: Store.news, members: Store.members, reads: Store.allReads, config: Store.config };
  let i = 0;
  for (const v of vendors) {
    i++;
    setStatus(`Reading vendor ${i} of ${vendors.length}…`);
    const ref = fbDb.collection("vendors").doc(v.id);
    const cs = await ref.collection("comments").get();
    const item = { ...v, comments: cs.docs.map((d) => ({ id: d.id, ...d.data() })) };
    if (v.hasPhoto) {
      const p = await fbDb.collection("vendorPhotos").doc(v.id).get();
      if (p.exists) item.photo = p.data().data;
    }
    out.vendors.push(item);
  }
  return out;
}

const AdminView = (() => {
  let root = null;
  let tab = "approvals";

  function mount(container, param) {
    root = container;
    tab = ["approvals", "members", "categories", "backup"].includes(param) ? param : "approvals";
    root.innerHTML = pageHeader("Administration", "Approvals, members, categories and backups.") + `
      <div class="subtabs" id="a-tabs">
        <a href="#/admin/approvals" data-tab="approvals">Approvals <span class="badge" id="a-badge" hidden></span></a>
        <a href="#/admin/members" data-tab="members">Members</a>
        <a href="#/admin/categories" data-tab="categories">Categories</a>
        <a href="#/admin/backup" data-tab="backup">Backup</a>
      </div>
      <div id="a-body"></div>`;
    render();
  }

  function update() {
    if (!root) return;
    // Do not rebuild the screen while the admin is typing in a box.
    const a = document.activeElement;
    if (a && root.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) {
      renderTabsOnly();
      return;
    }
    render();
  }

  function renderTabsOnly() {
    const n = pendingVendors().length;
    const badge = root.querySelector("#a-badge");
    badge.textContent = n;
    badge.hidden = !n;
  }

  function render() {
    root.querySelectorAll("#a-tabs [data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    renderTabsOnly();
    const body = root.querySelector("#a-body");
    if (tab === "approvals") renderApprovals(body);
    else if (tab === "members") renderMembers(body);
    else if (tab === "categories") renderCategories(body);
    else renderBackup(body);
  }

  /* ----- approvals ----- */
  function renderApprovals(body) {
    const list = pendingVendors();
    if (!list.length) {
      body.innerHTML = '<div class="empty">Nothing waiting for approval.</div>';
      return;
    }
    body.innerHTML = list.map((v) => `
      <div class="card approval">
        <div class="approval-main">
          <h3>${esc(v.name)}</h3>
          <div class="vc-chips"><span class="chip cat">${esc(v.category)}</span></div>
          <p class="services">${esc(v.services || "—")}</p>
          <p class="muted small">Submitted by ${esc(v.createdByName || "—")} · ${fmtDate(v.createdAt)}</p>
          ${v.note ? `<p class="small">Note: ${esc(v.note)}</p>` : ""}
        </div>
        <div class="approval-actions">
          <a class="btn-secondary" href="#/vendor/${encodeURIComponent(v.id)}">Open</a>
          <button type="button" class="btn-primary" data-approve="${esc(v.id)}">Approve</button>
          <button type="button" class="btn-danger" data-reject="${esc(v.id)}">Reject</button>
        </div>
      </div>`).join("");
    body.onclick = async (ev) => {
      const ap = ev.target.closest("[data-approve]");
      const rj = ev.target.closest("[data-reject]");
      try {
        if (ap) {
          await approveVendor(ap.dataset.approve);
          toast("Approved. Everyone can see it now.", "ok");
        } else if (rj) {
          const v = Store.vendors[rj.dataset.reject];
          if (!v || !(await confirmDialog(`Reject and delete "${v.name}"?`, { confirmLabel: "Reject" }))) return;
          await deleteVendor(v.id, []);
          toast("Rejected and removed.", "ok");
        }
      } catch (ex) {
        toast("That did not work. " + (ex.message || ""), "err");
      }
    };
  }

  /* ----- members ----- */
  function renderMembers(body) {
    const me = Session.user.uid;
    const list = Store.members.slice().sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email)));
    body.innerHTML = `
      <div class="notice info">
        <strong>To add a new person:</strong> Firebase console &gt; Authentication &gt; Users &gt; Add user (their email and a password).
        They appear in this list after their first sign-in. To remove someone, disable or delete them in the same place.
      </div>
      <div class="card">
        <p class="muted small">${list.length} account${list.length === 1 ? "" : "s"} have signed in.</p>
        <div class="table">
          ${list.map((m) => `
            <div class="trow">
              <div><strong>${esc(m.name || "(no name yet)")}</strong><div class="muted small">${esc(m.email)}</div></div>
              <div><span class="chip ${m.role === "admin" ? "pin" : "cat"}">${esc(m.role)}</span></div>
              <div>${m.id === me ? '<span class="muted small">You</span>' : `<button type="button" class="btn-sm" data-role="${esc(m.id)}" data-to="${m.role === "admin" ? "member" : "admin"}">${m.role === "admin" ? "Make member" : "Make admin"}</button>`}</div>
            </div>`).join("")}
        </div>
      </div>`;
    body.onclick = async (ev) => {
      const b = ev.target.closest("[data-role]");
      if (!b) return;
      const m = Store.members.find((x) => x.id === b.dataset.role);
      if (!m) return;
      const to = b.dataset.to;
      if (!(await confirmDialog(`Make ${m.name || m.email} ${to === "admin" ? "an admin (they will be able to change and delete everything)" : "a normal member"}?`, { confirmLabel: "Yes, change", danger: to === "admin" }))) return;
      try {
        await fbDb.collection("roles").doc(m.id).update({ role: to });
        toast("Role changed.", "ok");
      } catch (ex) {
        toast("Could not change the role. " + (ex.message || ""), "err");
      }
    };
  }

  /* ----- categories ----- */
  function catPanel(kind, title, list) {
    const items = kind === "vendor" ? Object.values(Store.vendors) : Store.news;
    return `
      <section class="card">
        <h4>${esc(title)}</h4>
        <div class="table">
          ${list.map((c) => {
            const n = items.filter((x) => x.category === c).length;
            return `<div class="trow">
              <div><strong>${esc(c)}</strong> <span class="muted small">${n} in use</span></div>
              <div class="row-actions">${kind === "news" && c === APP_SETTINGS.policyCategory
                ? '<span class="muted small">Used by the Work Policy page</span>'
                : `<button type="button" class="btn-sm" data-ren="${kind}" data-name="${esc(c)}">Rename</button>
                <button type="button" class="btn-sm danger" data-del="${kind}" data-name="${esc(c)}">Delete</button>`}
              </div></div>`;
          }).join("") || '<p class="muted">No categories yet.</p>'}
        </div>
        <form class="inline-form" data-add="${kind}">
          <input maxlength="60" placeholder="New category name" required>
          <button class="btn-primary" type="submit">Add</button>
        </form>
      </section>`;
  }

  function renderCategories(body) {
    body.innerHTML = `
      <p class="muted">Renaming a category also updates every vendor or post that uses it. To merge two categories, rename one to the other's name.</p>
      <div class="two-col">
        ${catPanel("vendor", "Vendor categories", vendorCategories())}
        ${catPanel("news", "News & policy categories", newsCategories())}
      </div>`;

    body.onsubmit = async (ev) => {
      const f = ev.target.closest("[data-add]");
      if (!f) return;
      ev.preventDefault();
      const kind = f.dataset.add;
      const name = f.querySelector("input").value.trim();
      const cur = kind === "vendor" ? vendorCategories() : newsCategories();
      if (!name) return;
      if (cur.some((c) => c.toLowerCase() === name.toLowerCase())) return toast("That category already exists.", "err");
      try {
        await saveCategoryList(kind, [...cur, name]);
        toast("Category added.", "ok");
      } catch (ex) { toast("Could not save. " + (ex.message || ""), "err"); }
    };

    body.onclick = async (ev) => {
      const ren = ev.target.closest("[data-ren]");
      const del = ev.target.closest("[data-del]");
      try {
        if (ren) {
          const kind = ren.dataset.ren, old = ren.dataset.name;
          const nn = await promptDialog("Rename category", { label: "New name", value: old });
          if (!nn || nn === old) return;
          await renameCategory(kind, old, nn);
          toast("Category renamed.", "ok");
        } else if (del) {
          const kind = del.dataset.del, name = del.dataset.name;
          const items = kind === "vendor" ? Object.values(Store.vendors) : Store.news;
          const n = items.filter((x) => x.category === name).length;
          if (n) return toast(`${n} item${n > 1 ? "s use" : " uses"} "${name}". Rename it to another category first.`, "err");
          if (!(await confirmDialog(`Delete the category "${name}"?`))) return;
          const cur = kind === "vendor" ? vendorCategories() : newsCategories();
          await saveCategoryList(kind, cur.filter((c) => c !== name));
          toast("Category deleted.", "ok");
        }
      } catch (ex) {
        toast("That did not work. " + (ex.message || ""), "err");
      }
    };
  }

  /* ----- backup ----- */
  function renderBackup(body) {
    body.innerHTML = `
      <div class="card">
        <h4>Download a backup</h4>
        <p>Saves every vendor (with comments and name card photos), all news posts, the category lists and the member list into one file on your device.
           Keep a copy somewhere safe now and then, for example once a month.</p>
        <button type="button" class="btn-primary" id="bk-go">Download backup file</button>
        <p class="muted small" id="bk-status"></p>
      </div>`;
    body.onclick = async (ev) => {
      if (!ev.target.closest("#bk-go")) return;
      const btn = body.querySelector("#bk-go");
      const status = body.querySelector("#bk-status");
      btn.disabled = true;
      try {
        const data = await buildBackup((t) => { status.textContent = t; });
        const stamp = new Date().toISOString().slice(0, 10);
        downloadJson(data, `contacts-hub-backup-${stamp}.json`);
        status.textContent = `Done. ${data.vendors.length} vendors and ${data.news.length} posts saved.`;
      } catch (ex) {
        console.error(ex);
        status.textContent = "Backup failed: " + (ex.message || ex);
      }
      btn.disabled = false;
    };
  }

  function unmount() { root = null; }
  return { mount, update, unmount };
})();
