"use strict";
/**
 * vendors.js — vendor list, vendor page (with comments), add/edit form.
 *
 * Rating numbers (average, "members used") are kept on the vendor record
 * itself (ratingSum / ratingCount), so the list page never has to read every
 * comment. That keeps database usage tiny.
 */

function vendorAvg(v) {
  return v.ratingCount ? v.ratingSum / v.ratingCount : 0;
}

// What the current person may see in the main list.
function listableVendors() {
  const uid = Session.user.uid;
  return Object.values(Store.vendors).filter(
    (v) => v.status === "approved" || (v.status === "pending" && v.createdBy === uid && !isAdmin())
  );
}

/* ---------------------------------------------------------------
   Save / approve / delete
---------------------------------------------------------------- */

async function submitVendor(existing, values, photoFile) {
  const admin = isAdmin();
  const col = fbDb.collection("vendors");
  const ref = existing ? col.doc(existing.id) : col.doc();
  const batch = fbDb.batch();
  const data = { ...values, updatedAt: ts() };

  let photo = null;
  if (photoFile) {
    photo = await compressImage(photoFile);
    data.hasPhoto = true;
  }

  if (existing) {
    batch.update(ref, data);
  } else {
    Object.assign(data, {
      status: admin ? "approved" : "pending",
      createdBy: Session.user.uid,
      createdByName: myName(),
      createdAt: ts(),
      ratingSum: 0,
      ratingCount: 0,
      hasPhoto: !!photo,
    });
    if (admin) data.approvedAt = ts();
    batch.set(ref, data);
  }

  if (photo) {
    batch.set(fbDb.collection("vendorPhotos").doc(ref.id), {
      data: photo,
      createdBy: existing ? existing.createdBy : Session.user.uid,
      updatedAt: ts(),
    });
  }
  await batch.commit();
  return ref.id;
}

async function approveVendor(id) {
  await fbDb.collection("vendors").doc(id).update({
    status: "approved",
    approvedAt: ts(),
    updatedAt: ts(),
  });
}

async function deleteVendor(id, commentIds) {
  const ref = fbDb.collection("vendors").doc(id);
  const batch = fbDb.batch();
  (commentIds || []).forEach((cid) => batch.delete(ref.collection("comments").doc(cid)));
  batch.delete(fbDb.collection("vendorPhotos").doc(id));
  batch.delete(ref);
  await batch.commit();
}

async function saveComment(vendorId, rating, text) {
  const uid = Session.user.uid;
  const vref = fbDb.collection("vendors").doc(vendorId);
  const cref = vref.collection("comments").doc(uid);
  await fbDb.runTransaction(async (tx) => {
    const v = await tx.get(vref);
    const c = await tx.get(cref);
    if (!v.exists) throw new Error("This vendor no longer exists.");
    const old = c.exists ? c.data().rating || 0 : 0;
    tx.set(cref, {
      uid,
      name: myName(),
      rating,
      text,
      createdAt: c.exists ? c.data().createdAt : ts(),
      updatedAt: ts(),
    });
    tx.update(vref, {
      ratingSum: (v.data().ratingSum || 0) - old + rating,
      ratingCount: (v.data().ratingCount || 0) + (c.exists ? 0 : 1),
    });
  });
}

async function deleteComment(vendorId, cid) {
  const vref = fbDb.collection("vendors").doc(vendorId);
  const cref = vref.collection("comments").doc(cid);
  await fbDb.runTransaction(async (tx) => {
    const v = await tx.get(vref);
    const c = await tx.get(cref);
    if (!c.exists) return;
    if (v.exists) {
      tx.update(vref, {
        ratingSum: Math.max(0, (v.data().ratingSum || 0) - (c.data().rating || 0)),
        ratingCount: Math.max(0, (v.data().ratingCount || 0) - 1),
      });
    }
    tx.delete(cref);
  });
}

/* ---------------------------------------------------------------
   Add / edit form
---------------------------------------------------------------- */

function openVendorForm(existing, onSaved) {
  const e = existing || {};
  const cats = vendorCategories().slice();
  if (e.category && !cats.includes(e.category)) cats.push(e.category);
  if (!cats.length) cats.push("Other");

  const isEdit = !!existing;
  const needsApproval = !isEdit && !isAdmin();

  const card = openModal(`
    <h3>${isEdit ? "Edit vendor" : "Add a vendor"}</h3>
    ${needsApproval ? '<p class="notice info">Everyone can see it after the admin approves it. Until then only you and the admin can see it.</p>' : ""}
    <form id="vf" novalidate>
      <div class="form-grid">
        <label class="field"><span>Company name *</span>
          <input id="vf-name" maxlength="120" required value="${esc(e.name)}"></label>
        <label class="field"><span>Trade / category *</span>
          <select id="vf-cat">${cats.map((c) => `<option ${c === e.category ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
        <label class="field"><span>Contact person</span>
          <input id="vf-contact" maxlength="100" value="${esc(e.contact)}"></label>
        <label class="field"><span>Phone</span>
          <input id="vf-phone" maxlength="40" inputmode="tel" value="${esc(e.phone)}" placeholder="+65 9123 4567"></label>
        <label class="field"><span>WhatsApp <small>(with country code)</small></span>
          <input id="vf-wa" maxlength="40" inputmode="tel" value="${esc(e.whatsapp)}" placeholder="+65 9123 4567"></label>
        <label class="field"><span>Email</span>
          <input id="vf-email" type="email" maxlength="120" value="${esc(e.email)}"></label>
        <label class="field"><span>Website</span>
          <input id="vf-web" maxlength="200" value="${esc(e.website)}" placeholder="www.example.com"></label>
        <label class="field"><span>Address</span>
          <input id="vf-addr" maxlength="200" value="${esc(e.address)}"></label>
        <label class="field span2"><span>Services offered</span>
          <input id="vf-services" maxlength="300" value="${esc(e.services)}" placeholder="e.g. DB installation, fault finding, 24h callout"></label>
        <label class="field span2"><span>Note <small>(how we know them, or "found on Google, not tried yet")</small></span>
          <textarea id="vf-note" rows="3" maxlength="500">${esc(e.note)}</textarea></label>
        <label class="field span2"><span>Name card photo <small>(optional${isEdit && e.hasPhoto ? ", leave empty to keep the current one" : ""})</small></span>
          <input id="vf-photo" type="file" accept="image/*"></label>
      </div>
      <p class="form-error" id="vf-err" hidden></p>
      <div class="form-actions">
        <button class="btn-primary" type="submit" id="vf-save">${isEdit ? "Save changes" : needsApproval ? "Submit for approval" : "Save vendor"}</button>
        <button type="button" class="btn-secondary" id="vf-cancel">Cancel</button>
      </div>
    </form>`);

  const err = (msg) => {
    const p = card.querySelector("#vf-err");
    p.textContent = msg;
    p.hidden = !msg;
  };
  card.querySelector("#vf-cancel").addEventListener("click", closeModal);
  card.querySelector("#vf").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    err("");
    const val = (id) => card.querySelector(id).value.trim();
    const name = val("#vf-name");
    if (!name) return err("Please enter the company name.");
    const web = val("#vf-web");
    const webOk = safeWebUrl(web);
    if (web && !webOk) return err("The website address does not look right.");

    const values = {
      name,
      category: val("#vf-cat"),
      contact: val("#vf-contact"),
      phone: val("#vf-phone"),
      whatsapp: val("#vf-wa"),
      email: val("#vf-email"),
      website: webOk,
      address: val("#vf-addr"),
      services: val("#vf-services"),
      note: val("#vf-note"),
    };
    const file = card.querySelector("#vf-photo").files[0] || null;
    const btn = card.querySelector("#vf-save");
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      const id = await submitVendor(existing, values, file);
      closeModal();
      toast(
        isEdit ? "Vendor updated." : needsApproval ? "Submitted. The admin will review it." : "Vendor added.",
        "ok"
      );
      if (onSaved) onSaved(id);
    } catch (ex) {
      console.error(ex);
      btn.disabled = false;
      btn.textContent = isEdit ? "Save changes" : "Save vendor";
      err(ex.message || "Could not save. Please try again.");
    }
  });
  card.querySelector("#vf-name").focus();
}

/* ---------------------------------------------------------------
   Vendor list
---------------------------------------------------------------- */

function vendorCardHtml(v) {
  const n = v.ratingCount || 0;
  const call = v.phone && telHref(v.phone);
  const lines = [
    v.phone ? `<div class="cl"><span>☎</span>${esc(v.phone)}</div>` : "",
    v.email ? `<div class="cl"><span>✉</span>${esc(v.email)}</div>` : "",
    v.address ? `<div class="cl"><span>⌖</span>${esc(v.address)}</div>` : "",
  ].join("");
  const href = "#/vendor/" + encodeURIComponent(v.id);
  return `
    <article class="card vendor-card" data-href="${href}">
      <div class="vc-head">
        <div class="icon-tile">${categoryIcon(v.category)}</div>
        <div class="vc-title">
          <h3>${esc(v.name)}</h3>
          <div class="muted small">${esc(v.category)}${v.status === "pending" ? ' · <span class="pend-text">Pending approval</span>' : ""}</div>
        </div>
      </div>
      <div class="rating-line">${
        n
          ? `${starsHtml(vendorAvg(v))} <span class="muted small">${vendorAvg(v).toFixed(1)} · ${n} comment${n > 1 ? "s" : ""}</span>`
          : '<span class="muted small">No rating yet</span>'
      }</div>
      <p class="services">${esc(v.services || "—")}</p>
      <div class="contact-lines">${lines}</div>
      <div class="vc-actions">
        ${call ? `<a class="btn-call" href="${call}">☎ Call</a>` : ""}
        ${v.email ? `<a class="btn-mail" href="mailto:${esc(v.email)}">✉ Email</a>` : ""}
        <a class="btn-view" href="${href}">View details</a>
      </div>
    </article>`;
}

// Clicking a card (but not its Call / Email links) opens the vendor page.
function cardClick(ev) {
  if (ev.target.closest("a,button")) return;
  const c = ev.target.closest("[data-href]");
  if (c) location.hash = c.dataset.href;
}

const VendorsView = (() => {
  let root = null;
  const state = { q: "", cat: "All", sort: "az" };

  function mount(container) {
    root = container;
    if (window.pendingVendorQuery != null) { state.q = window.pendingVendorQuery; window.pendingVendorQuery = null; }
    if (window.pendingVendorCat != null) { state.cat = window.pendingVendorCat; window.pendingVendorCat = null; }
    root.innerHTML = pageHeader("Vendor Directory", "Find the right contractor or service provider.",
        '<button type="button" class="btn-primary" id="v-add">+ Add Vendor</button>') + `
      <div class="toolbar">
        <input id="v-search" class="search" type="search" placeholder="Search name, trade, area, service..." value="${esc(state.q)}" autocomplete="off">
        <select id="v-sort" class="select" aria-label="Sort vendors">
          <option value="az">Sort: A–Z</option>
          <option value="top">Sort: Top rated</option>
          <option value="new">Sort: Newest</option>
        </select>
      </div>
      <div id="v-notice"></div>
      <div class="chips" id="v-chips"></div>
      <div class="grid" id="v-grid"></div>`;
    root.querySelector("#v-sort").value = state.sort;
    root.querySelector("#v-search").addEventListener("input", (ev) => {
      state.q = ev.target.value;
      renderGrid();
    });
    root.querySelector("#v-sort").addEventListener("change", (ev) => {
      state.sort = ev.target.value;
      renderGrid();
    });
    root.querySelector("#v-add").addEventListener("click", () => openVendorForm(null));
    root.querySelector("#v-grid").addEventListener("click", cardClick);
    root.querySelector("#v-chips").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-cat]");
      if (!b) return;
      state.cat = b.dataset.cat;
      renderChips();
      renderGrid();
    });
    update();
  }

  function update() {
    if (!root) return;
    renderNotice();
    renderChips();
    renderGrid();
  }

  function renderNotice() {
    const el = root.querySelector("#v-notice");
    if (isAdmin()) {
      const n = pendingVendors().length;
      el.innerHTML = n
        ? `<div class="notice warn">${n} vendor${n > 1 ? "s are" : " is"} waiting for your approval. <a href="#/admin/approvals">Review now</a></div>`
        : "";
    } else {
      const n = listableVendors().filter((v) => v.status === "pending").length;
      el.innerHTML = n
        ? `<div class="notice info">${n} of your submission${n > 1 ? "s are" : " is"} waiting for admin approval.</div>`
        : "";
    }
  }

  function categoriesInUse() {
    const cats = vendorCategories().slice();
    listableVendors().forEach((v) => {
      if (v.category && !cats.includes(v.category)) cats.push(v.category);
    });
    return cats;
  }

  function renderChips() {
    const all = listableVendors();
    const count = (c) => all.filter((v) => v.category === c).length;
    const chips = ["All", ...categoriesInUse()];
    root.querySelector("#v-chips").innerHTML = chips
      .map((c) => {
        const n = c === "All" ? all.length : count(c);
        return `<button type="button" class="chip-btn ${c === state.cat ? "active" : ""}" data-cat="${esc(c)}">${esc(c)} <small>${n}</small></button>`;
      })
      .join("");
  }

  function matches(v) {
    if (state.cat !== "All" && v.category !== state.cat) return false;
    const q = state.q.trim().toLowerCase();
    if (!q) return true;
    const hay = [v.name, v.category, v.contact, v.services, v.address, v.note, v.phone, v.email]
      .join(" ")
      .toLowerCase();
    return q.split(/\s+/).every((t) => hay.includes(t));
  }

  function renderGrid() {
    const grid = root.querySelector("#v-grid");
    const list = listableVendors().filter(matches);
    list.sort((a, b) => {
      if (state.sort === "top") return vendorAvg(b) - vendorAvg(a) || (b.ratingCount || 0) - (a.ratingCount || 0);
      if (state.sort === "new") return tsMillis(b.createdAt) - tsMillis(a.createdAt);
      return String(a.name).localeCompare(String(b.name));
    });

    if (!Store.vendorsLoaded) {
      grid.innerHTML = '<div class="empty">Loading…</div>';
      return;
    }
    if (!list.length) {
      grid.innerHTML = `<div class="empty">${
        listableVendors().length
          ? "No vendors match your search."
          : "No vendors yet. Be the first to add one with <strong>+ Add Vendor</strong>."
      }</div>`;
      return;
    }
    grid.innerHTML = list.map(vendorCardHtml).join("");
  }

  function unmount() { root = null; }
  return { mount, update, unmount };
})();

/* ---------------------------------------------------------------
   Vendor page
---------------------------------------------------------------- */

const VendorDetailView = (() => {
  let root, id, unsubComments, comments, built, photoStamp, myRating, formTouched;

  function mount(container, vendorId) {
    root = container;
    id = vendorId;
    comments = [];
    built = false;
    photoStamp = null;
    myRating = 0;
    formTouched = false;
    root.innerHTML = `<a class="back-link" href="#/vendors">← Back to Vendors</a><div id="vd-body"></div>`;
    unsubComments = fbDb
      .collection("vendors").doc(id).collection("comments")
      .onSnapshot(
        (snap) => {
          comments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          comments.sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
          if (built) renderComments();
        },
        (e) => console.error("comments", e)
      );
    update();
  }

  function unmount() {
    if (unsubComments) unsubComments();
    unsubComments = null;
    root = null;
  }

  function update() {
    if (!root) return;
    const v = Store.vendors[id];
    const body = root.querySelector("#vd-body");
    if (!v) {
      built = false;
      body.innerHTML = Store.vendorsLoaded
        ? '<div class="empty">This vendor was not found. It may have been removed, or it is still waiting for approval.</div>'
        : '<div class="empty">Loading…</div>';
      return;
    }
    if (!built) {
      body.innerHTML = `
        <div class="detail">
          <section class="card" id="vd-info"></section>
          <div class="detail-right">
            <section class="card" id="vd-photo-card" hidden>
              <h4>Name card photo</h4>
              <div id="vd-photo"></div>
            </section>
            <section class="card" id="vd-comments">
              <h4 id="cm-title">Team comments</h4>
              <div id="cm-list"></div>
              <div id="cm-form-wrap"></div>
            </section>
          </div>
        </div>`;
      built = true;
      bindInfoActions();
      buildCommentForm(v);
      renderComments();
    }
    renderInfo(v);
    maybeLoadPhoto(v);
  }

  function renderInfo(v) {
    const web = safeWebUrl(v.website);
    const rows = [
      ["Contact", esc(v.contact)],
      ["Phone", v.phone ? `<a href="${telHref(v.phone)}">${esc(v.phone)}</a>` : ""],
      ["WhatsApp", v.whatsapp && waHref(v.whatsapp) ? `<a href="${waHref(v.whatsapp)}" target="_blank" rel="noopener noreferrer">${esc(v.whatsapp)}</a>` : ""],
      ["Email", v.email ? `<a href="mailto:${esc(v.email)}">${esc(v.email)}</a>` : ""],
      ["Website", web ? `<a href="${esc(web)}" target="_blank" rel="noopener noreferrer">${esc(v.website)}</a>` : ""],
      ["Address", v.address ? `<a href="${mapsHref(v.address)}" target="_blank" rel="noopener noreferrer">${esc(v.address)}</a>` : ""],
      ["Services", esc(v.services)],
      ["Team note", v.note ? multiline(v.note) : ""],
    ].filter((r) => r[1]);

    const n = v.ratingCount || 0;
    const uid = Session.user.uid;
    const mayEdit = isAdmin() || (v.createdBy === uid && v.status === "pending");
    const call = v.phone && telHref(v.phone);
    const wa = v.whatsapp && waHref(v.whatsapp);

    root.querySelector("#vd-info").innerHTML = `
      ${v.status === "pending" ? `<div class="notice warn">${isAdmin() ? "This vendor is waiting for your approval." : "Waiting for admin approval. Only you and the admin can see this page."}</div>` : ""}
      <h2>${esc(v.name)}</h2>
      <div class="vc-chips">
        <span class="chip cat">${esc(v.category)}</span>
        ${n ? `<span class="chip good">Used by ${n} member${n > 1 ? "s" : ""}</span>` : ""}
      </div>
      <div class="rating-line big">${
        n ? `${starsHtml(vendorAvg(v))} <span class="muted">${vendorAvg(v).toFixed(1)} (${n} comment${n > 1 ? "s" : ""})</span>` : '<span class="muted">No rating yet</span>'
      }</div>
      <div class="info-rows">
        ${rows.map((r) => `<div class="info-row"><span class="k">${r[0]}</span><span class="v">${r[1]}</span></div>`).join("")}
      </div>
      <p class="muted small">Added by ${esc(v.createdByName || "—")} · ${fmtDate(v.createdAt)}</p>
      <div class="action-row">
        ${call ? `<a class="btn-primary" href="${call}">Call</a>` : ""}
        ${wa ? `<a class="btn-secondary" href="${wa}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ""}
      </div>
      ${
        mayEdit || isAdmin()
          ? `<div class="action-row admin-row">
              ${isAdmin() && v.status === "pending" ? '<button type="button" class="btn-primary" data-act="approve">Approve</button>' : ""}
              ${mayEdit ? '<button type="button" class="btn-secondary" data-act="edit">Edit</button>' : ""}
              ${isAdmin() ? '<button type="button" class="btn-danger" data-act="delete">Delete vendor</button>' : ""}
              ${!isAdmin() && mayEdit ? '<button type="button" class="btn-danger" data-act="withdraw">Withdraw</button>' : ""}
            </div>`
          : ""
      }`;
  }

  function bindInfoActions() {
    root.querySelector("#vd-info").addEventListener("click", async (ev) => {
      const b = ev.target.closest("[data-act]");
      if (!b) return;
      const v = Store.vendors[id];
      if (!v) return;
      const act = b.dataset.act;
      try {
        if (act === "edit") {
          openVendorForm(v);
        } else if (act === "approve") {
          await approveVendor(id);
          toast("Vendor approved.", "ok");
        } else if (act === "delete" || act === "withdraw") {
          const msg = act === "delete"
            ? `Delete "${v.name}" and all its comments? This cannot be undone.`
            : `Withdraw "${v.name}"?`;
          if (!(await confirmDialog(msg, { confirmLabel: act === "delete" ? "Delete" : "Withdraw" }))) return;
          await deleteVendor(id, comments.map((c) => c.id));
          toast("Removed.", "ok");
          location.hash = "#/vendors";
        }
      } catch (ex) {
        console.error(ex);
        toast("That did not work. " + (ex.message || ""), "err");
      }
    });
  }

  async function maybeLoadPhoto(v) {
    const stamp = v.hasPhoto ? String(tsMillis(v.updatedAt)) : null;
    if (stamp === photoStamp) return;
    photoStamp = stamp;
    const card = root.querySelector("#vd-photo-card");
    if (!v.hasPhoto) {
      card.hidden = true;
      return;
    }
    try {
      const s = await fbDb.collection("vendorPhotos").doc(id).get();
      const d = s.exists ? s.data().data || "" : "";
      // Only show real JPEG data produced by this site.
      if (!root || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(d)) return;
      const holder = root.querySelector("#vd-photo");
      holder.innerHTML = `<img class="namecard" alt="Name card" src="${d}">`;
      card.hidden = false;
      holder.querySelector("img").addEventListener("click", () => {
        const c = openModal(`<img class="namecard-big" alt="Name card" src="${d}"><div class="form-actions"><button type="button" class="btn-secondary" id="pc-close">Close</button></div>`);
        c.querySelector("#pc-close").addEventListener("click", closeModal);
      });
    } catch (e) {
      console.error("photo", e);
    }
  }

  /* ----- comments ----- */

  function buildCommentForm(v) {
    const wrap = root.querySelector("#cm-form-wrap");
    if (v.status !== "approved") {
      wrap.innerHTML = '<p class="muted small">Comments open once the admin has approved this vendor.</p>';
      return;
    }
    wrap.innerHTML = `
      <form id="cm-form" class="cm-form">
        <h5 id="cm-form-title">Add your comment</h5>
        <div class="star-picker" id="star-picker">
          ${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-v="${n}" aria-label="${n} star${n > 1 ? "s" : ""}">★</button>`).join("")}
        </div>
        <textarea id="cm-text" rows="3" maxlength="1000" placeholder="What job did they do? Would you use them again?"></textarea>
        <p class="form-error" id="cm-err" hidden></p>
        <div class="form-actions">
          <button class="btn-primary" type="submit" id="cm-submit">Post</button>
          <button type="button" class="btn-link danger" id="cm-delete" hidden>Delete my comment</button>
        </div>
      </form>`;
    const picker = wrap.querySelector("#star-picker");
    picker.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-v]");
      if (!b) return;
      myRating = Number(b.dataset.v);
      formTouched = true;
      paintStars();
    });
    wrap.querySelector("#cm-text").addEventListener("input", () => { formTouched = true; });
    wrap.querySelector("#cm-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const err = wrap.querySelector("#cm-err");
      const text = wrap.querySelector("#cm-text").value.trim();
      err.hidden = true;
      if (!myRating) { err.textContent = "Please tap the stars to give a rating."; err.hidden = false; return; }
      if (!text) { err.textContent = "Please write a short comment."; err.hidden = false; return; }
      const btn = wrap.querySelector("#cm-submit");
      btn.disabled = true;
      try {
        await saveComment(id, myRating, text);
        formTouched = false;
        toast("Comment saved.", "ok");
      } catch (ex) {
        console.error(ex);
        err.textContent = ex.message || "Could not save your comment.";
        err.hidden = false;
      }
      btn.disabled = false;
    });
    wrap.querySelector("#cm-delete").addEventListener("click", async () => {
      if (!(await confirmDialog("Delete your comment?"))) return;
      try {
        await deleteComment(id, Session.user.uid);
        myRating = 0;
        formTouched = false;
        wrap.querySelector("#cm-text").value = "";
        paintStars();
        toast("Comment deleted.", "ok");
      } catch (ex) {
        toast("Could not delete. " + (ex.message || ""), "err");
      }
    });
    paintStars();
  }

  function paintStars() {
    root.querySelectorAll("#star-picker button").forEach((b) => {
      b.classList.toggle("on", Number(b.dataset.v) <= myRating);
    });
  }

  function renderComments() {
    if (!root) return;
    const uid = Session.user.uid;
    root.querySelector("#cm-title").textContent = `Team comments (${comments.length})`;
    const list = root.querySelector("#cm-list");
    list.innerHTML = comments.length
      ? comments
          .map((c) => `
          <div class="comment">
            <div class="comment-head">
              <strong>${esc(c.name)}</strong>
              ${starsHtml(c.rating)}
              <span class="muted small">${fmtDate(c.createdAt)}</span>
              ${c.id === uid || isAdmin() ? `<button type="button" class="icon-x" data-cid="${esc(c.id)}" title="Delete comment" aria-label="Delete comment">×</button>` : ""}
            </div>
            <p>${multiline(c.text)}</p>
          </div>`)
          .join("")
      : '<p class="muted">No comments yet.</p>';

    list.onclick = async (ev) => {
      const b = ev.target.closest("[data-cid]");
      if (!b) return;
      if (!(await confirmDialog("Delete this comment?"))) return;
      try {
        await deleteComment(id, b.dataset.cid);
        toast("Comment deleted.", "ok");
      } catch (ex) {
        toast("Could not delete. " + (ex.message || ""), "err");
      }
    };

    // Pre-fill the form with my own earlier comment (until I start typing).
    const form = root.querySelector("#cm-form");
    if (form) {
      const mine = comments.find((c) => c.id === uid);
      if (mine && !formTouched) {
        myRating = mine.rating || 0;
        root.querySelector("#cm-text").value = mine.text || "";
        paintStars();
      }
      root.querySelector("#cm-form-title").textContent = mine ? "Your comment" : "Add your comment";
      root.querySelector("#cm-submit").textContent = mine ? "Update" : "Post";
      root.querySelector("#cm-delete").hidden = !mine;
    }
  }

  return { mount, update, unmount };
})();
