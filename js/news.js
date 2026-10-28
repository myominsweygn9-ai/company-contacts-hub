"use strict";
/**
 * news.js — News & Policy board, with "read" ticks.
 *
 * When a member opens a post, a small record "reads/<postId>_<userId>" is
 * saved. Members see a green "Read" tick next to posts they have opened and
 * an amber "New" tag on the rest. The admin sees who has read each post and
 * who has not.
 */

function isPolicy(p) { return p.category === APP_SETTINGS.policyCategory; }

function sortedNews(list) {
  return (list || Store.news).slice().sort((a, b) => {
    if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
    return tsMillis(b.createdAt) - tsMillis(a.createdAt);
  });
}

function unreadNewsCount() {
  if (isAdmin()) return 0;
  return Store.news.filter((p) => !isPolicy(p) && !Store.myReads[p.id]).length;
}
function unreadPolicyCount() {
  if (isAdmin()) return 0;
  return Store.news.filter((p) => isPolicy(p) && !Store.myReads[p.id]).length;
}

let markedReadThisSession = new Set();
function markRead(postId) {
  if (isAdmin() || !Store.readsLoaded) return;
  if (Store.myReads[postId] || markedReadThisSession.has(postId)) return;
  markedReadThisSession.add(postId);
  const uid = Session.user.uid;
  fbDb.collection("reads").doc(postId + "_" + uid).set({
    postId,
    uid,
    name: myName(),
    email: Session.user.email || "",
    readAt: ts(),
  }).catch((e) => {
    markedReadThisSession.delete(postId);
    console.error("could not record read", e);
  });
}

/* ---------- post form (admin) ---------- */

function openPostForm(existing, defaultCat) {
  const e = existing || {};
  const cats = newsCategories().slice();
  if (e.category && !cats.includes(e.category)) cats.push(e.category);
  if (!cats.includes(APP_SETTINGS.policyCategory)) cats.push(APP_SETTINGS.policyCategory);
  const chosen = e.category || defaultCat || cats[0];

  const card = openModal(`
    <h3>${existing ? "Edit post" : "New post"}</h3>
    <form id="pf" novalidate>
      <div class="form-grid">
        <label class="field span2"><span>Title *</span>
          <input id="pf-title" maxlength="150" required value="${esc(e.title)}"></label>
        <label class="field"><span>Category *</span>
          <select id="pf-cat">${cats.map((c) => `<option ${c === chosen ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
        <label class="field check"><input id="pf-pin" type="checkbox" ${e.pinned ? "checked" : ""}> <span>Pin to the top</span></label>
        <label class="field span2"><span>Message *</span>
          <textarea id="pf-body" rows="8" maxlength="5000" required>${esc(e.body)}</textarea></label>
        ${existing ? '<label class="field check span2"><input id="pf-reset" type="checkbox"> <span>Mark as unread again for everyone (use after an important change)</span></label>' : ""}
      </div>
      <p class="form-error" id="pf-err" hidden></p>
      <div class="form-actions">
        <button class="btn-primary" type="submit" id="pf-save">${existing ? "Save changes" : "Publish"}</button>
        <button type="button" class="btn-secondary" id="pf-cancel">Cancel</button>
      </div>
    </form>`);

  card.querySelector("#pf-cancel").addEventListener("click", closeModal);
  card.querySelector("#pf").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const err = card.querySelector("#pf-err");
    const title = card.querySelector("#pf-title").value.trim();
    const body = card.querySelector("#pf-body").value.trim();
    if (!title || !body) {
      err.textContent = "Please fill in the title and the message.";
      err.hidden = false;
      return;
    }
    const data = {
      title,
      body,
      category: card.querySelector("#pf-cat").value,
      pinned: card.querySelector("#pf-pin").checked,
      updatedAt: ts(),
    };
    const btn = card.querySelector("#pf-save");
    btn.disabled = true;
    try {
      if (existing) {
        await fbDb.collection("news").doc(existing.id).update(data);
        const reset = card.querySelector("#pf-reset");
        if (reset && reset.checked) await clearReads(existing.id);
      } else {
        await fbDb.collection("news").add({ ...data, authorName: myName(), createdAt: ts() });
      }
      closeModal();
      toast(existing ? "Post updated." : "Post published.", "ok");
    } catch (ex) {
      console.error(ex);
      btn.disabled = false;
      err.textContent = ex.message || "Could not save.";
      err.hidden = false;
    }
  });
  card.querySelector("#pf-title").focus();
}

async function clearReads(postId) {
  const recs = Object.values(Store.allReads[postId] || {});
  for (const part of chunk(recs, 400)) {
    const b = fbDb.batch();
    part.forEach((r) => b.delete(fbDb.collection("reads").doc(postId + "_" + r.uid)));
    await b.commit();
  }
}

async function deletePost(postId) {
  await clearReads(postId);
  await fbDb.collection("news").doc(postId).delete();
}

/* ---------- list ---------- */

function newsCardHtml(p, total) {
  let tick;
  if (isAdmin()) {
    const n = Object.keys(Store.allReads[p.id] || {}).length;
    tick = `<span class="tick admin">✓ Read by ${n}${total ? " of " + total : ""}</span>`;
  } else {
    tick = Store.myReads[p.id]
      ? '<span class="tick read">✓ Read</span>'
      : '<span class="tick new">● New</span>';
  }
  const body = String(p.body || "");
  return `
    <a class="card news-card ${p.pinned ? "pinned" : ""}" href="#/news/${encodeURIComponent(p.id)}">
      <div class="icon-tile">${isPolicy(p) ? "📄" : "📣"}</div>
      <div class="news-main">
        <div class="news-top">
          <div class="vc-chips">
            ${p.pinned ? '<span class="chip pin">PINNED</span>' : ""}
            <span class="chip cat">${esc(p.category)}</span>
          </div>
          ${tick}
        </div>
        <h3>${esc(p.title)}</h3>
        <p class="preview">${esc(body.replace(/\s+/g, " ").slice(0, 180))}${body.length > 180 ? "…" : ""}</p>
        <div class="muted small">Posted by ${esc(p.authorName || "Admin")} · ${fmtDate(p.createdAt)}</div>
      </div>
    </a>`;
}

// One list view for "News & Updates", one for "Work Policy".
function createNewsList(mode) {
  const pol = mode === "policy";
  let root = null;
  const state = { cat: "All" };

  function mount(container) {
    root = container;
    const title = pol ? "Work Policy" : "News & Updates";
    const sub = pol ? "Important policies, procedures and guidelines." : "Company announcements, work updates and shared information.";
    const btn = isAdmin() ? `<button type="button" class="btn-primary" id="n-new">${pol ? "+ New Policy" : "+ New Post"}</button>` : "";
    root.innerHTML = pageHeader(title, sub, btn) + (pol ? "" : '<div class="chips" id="n-chips"></div>') + '<div id="n-list"></div>';
    const add = root.querySelector("#n-new");
    if (add) add.addEventListener("click", () => openPostForm(null, pol ? APP_SETTINGS.policyCategory : (newsCategories().find((c) => c !== APP_SETTINGS.policyCategory) || "")));
    const chips = root.querySelector("#n-chips");
    if (chips) chips.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-cat]");
      if (!b) return;
      state.cat = b.dataset.cat;
      update();
    });
    update();
  }

  function update() {
    if (!root) return;
    const mine = Store.news.filter((p) => isPolicy(p) === pol);
    if (!pol) {
      const cats = newsCategories().filter((c) => c !== APP_SETTINGS.policyCategory);
      mine.forEach((p) => { if (p.category && !cats.includes(p.category)) cats.push(p.category); });
      root.querySelector("#n-chips").innerHTML = ["All", ...cats]
        .map((c) => `<button type="button" class="chip-btn ${c === state.cat ? "active" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`)
        .join("");
    }
    const list = sortedNews(mine).filter((p) => pol || state.cat === "All" || p.category === state.cat);
    const el = root.querySelector("#n-list");
    if (!Store.newsLoaded) { el.innerHTML = '<div class="empty">Loading…</div>'; return; }
    if (!list.length) {
      el.innerHTML = `<div class="empty">${mine.length ? "No posts in this category." : pol ? "No policies yet." : "No posts yet."}</div>`;
      return;
    }
    const total = memberList().length;
    el.innerHTML = list.map((p) => newsCardHtml(p, total)).join("");
  }

  function unmount() { root = null; }
  return { mount, update, unmount };
}
const NewsView = createNewsList("news");
const PolicyView = createNewsList("policy");

/* ---------- single post ---------- */

const NewsPostView = (() => {
  let root = null, id = null;

  function mount(container, postId) {
    root = container;
    id = postId;
    update();
  }

  function update() {
    if (!root) return;
    const p = Store.news.find((x) => x.id === id);
    if (!p) {
      root.innerHTML = '<a class="back-link" href="#/news">← Back</a>' + (Store.newsLoaded
        ? '<div class="empty">This post was not found. It may have been removed.</div>'
        : '<div class="empty">Loading…</div>');
      return;
    }
    markRead(id);

    const back = isPolicy(p) ? ["#/policy", "Work Policy"] : ["#/news", "News & Updates"];
    const edited = p.updatedAt && tsMillis(p.updatedAt) - tsMillis(p.createdAt) > 60000;
    root.innerHTML = `
      <a class="back-link" href="${back[0]}">← Back to ${esc(back[1])}</a>
      <article class="card post">
        <div class="vc-chips">
          ${p.pinned ? '<span class="chip pin">PINNED</span>' : ""}
          <span class="chip cat">${esc(p.category)}</span>
          ${!isAdmin() ? '<span class="tick read">✓ Read</span>' : ""}
        </div>
        <h2>${esc(p.title)}</h2>
        <div class="muted small">Posted by ${esc(p.authorName || "Admin")} · ${fmtDate(p.createdAt)}${edited ? " · edited " + fmtDate(p.updatedAt) : ""}</div>
        <div class="post-body">${multiline(p.body)}</div>
        ${isAdmin() ? `<div class="action-row admin-row">
            <button type="button" class="btn-secondary" id="np-edit">Edit</button>
            <button type="button" class="btn-danger" id="np-del">Delete post</button>
          </div>` : ""}
      </article>
      ${isAdmin() ? receiptsHtml(p) : ""}`;

    if (isAdmin()) {
      root.querySelector("#np-edit").addEventListener("click", () => openPostForm(p));
      root.querySelector("#np-del").addEventListener("click", async () => {
        if (!(await confirmDialog(`Delete "${p.title}"?`))) return;
        try {
          await deletePost(p.id);
          toast("Post deleted.", "ok");
          location.hash = back[0];
        } catch (ex) {
          toast("Could not delete. " + (ex.message || ""), "err");
        }
      });
    }
  }

  function receiptsHtml(p) {
    const reads = Store.allReads[p.id] || {};
    const members = memberList();
    const readList = Object.values(reads).sort((a, b) => tsMillis(b.readAt) - tsMillis(a.readAt));
    const unread = members.filter((m) => !reads[m.id]).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const pct = members.length ? Math.round((readList.length / members.length) * 100) : 0;
    return `
      <section class="card receipts">
        <h4>Who has read this</h4>
        <div class="progress"><div style="width:${Math.min(100, pct)}%"></div></div>
        <p><strong>${readList.length}</strong> of <strong>${members.length}</strong> members have read it (${pct}%)</p>
        <div class="two-col">
          <div>
            <h5>Read (${readList.length})</h5>
            ${readList.length ? `<ul class="plain">${readList.map((r) => `<li><span class="tick read">✓</span> ${esc(r.name || r.email)} <span class="muted small">${fmtDateTime(r.readAt)}</span></li>`).join("")}</ul>` : '<p class="muted small">Nobody yet.</p>'}
          </div>
          <div>
            <h5>Not read yet (${unread.length})</h5>
            ${unread.length ? `<ul class="plain">${unread.map((m) => `<li>${esc(m.name || m.email)}</li>`).join("")}</ul>` : '<p class="muted small">Everyone has read it.</p>'}
          </div>
        </div>
        <p class="muted small">Only people who have signed in at least once are counted as members.</p>
      </section>`;
  }

  function unmount() { root = null; }
  return { mount, update, unmount };
})();
