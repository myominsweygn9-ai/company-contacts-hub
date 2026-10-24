"use strict";
/**
 * util.js — small helpers shared by every page.
 *
 * SECURITY NOTE: members type text that other members will see, so every
 * piece of user text is passed through esc() before it is put on the page.
 * Never insert user text into innerHTML without esc().
 */

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

// Turns plain web addresses inside ALREADY-ESCAPED text into links.
function linkify(escaped) {
  return escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
}

function multiline(s) {
  return linkify(esc(s)).replace(/\n/g, "<br>");
}

// Returns a safe http(s) address, or "" if the text is not a valid web address.
function safeWebUrl(u) {
  u = String(u || "").trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  try {
    const x = new URL(u);
    return x.protocol === "http:" || x.protocol === "https:" ? x.href : "";
  } catch (e) {
    return "";
  }
}

function telHref(p) {
  const d = String(p || "").replace(/[^\d+]/g, "");
  return d ? "tel:" + d : "";
}
function waHref(p) {
  const d = String(p || "").replace(/\D/g, "");
  return d ? "https://wa.me/" + d : "";
}
function mapsHref(a) {
  return a
    ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(a)
    : "";
}

function tsToDate(t) {
  if (!t) return null;
  if (typeof t.toDate === "function") return t.toDate();
  if (t.seconds) return new Date(t.seconds * 1000);
  const d = new Date(t);
  return isNaN(d) ? null : d;
}
// A just-written record has no server time yet; treat it as "now".
function tsMillis(t) {
  const d = tsToDate(t);
  return d ? d.getTime() : Date.now();
}
function fmtDate(t) {
  const d = tsToDate(t) || (t === null || t === undefined ? new Date() : null);
  return d
    ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "";
}
function fmtDateTime(t) {
  const d = tsToDate(t) || new Date();
  return (
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) +
    ", " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
}

function ts() {
  return firebase.firestore.FieldValue.serverTimestamp();
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function starsHtml(value) {
  const r = Math.round(value || 0);
  let s = "";
  for (let i = 1; i <= 5; i++) s += `<span class="${i <= r ? "on" : "off"}">★</span>`;
  return `<span class="stars" role="img" aria-label="${r} out of 5 stars">${s}</span>`;
}

/* ---------- toast ---------- */
function toast(msg, kind) {
  const root = document.getElementById("toast-root");
  if (!root) return;
  const el = document.createElement("div");
  el.className = "toast " + (kind || "");
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => el.classList.add("show"), 10);
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 3400);
}

/* ---------- modal ---------- */
let modalState = null;

function openModal(inner, opts) {
  opts = opts || {};
  const root = document.getElementById("modal-root");
  root.innerHTML =
    '<div class="modal-backdrop"><div class="modal-card" role="dialog" aria-modal="true"></div></div>';
  const backdrop = root.firstElementChild;
  const card = backdrop.firstElementChild;
  card.innerHTML = inner;
  modalState = {
    dismissible: opts.dismissible !== false,
    onDismiss: opts.onDismiss || null,
  };
  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) dismissModal();
  });
  document.body.classList.add("modal-open");
  return card;
}

function closeModal() {
  const root = document.getElementById("modal-root");
  if (root) root.innerHTML = "";
  modalState = null;
  document.body.classList.remove("modal-open");
}

function dismissModal() {
  if (!modalState || !modalState.dismissible) return;
  const cb = modalState.onDismiss;
  closeModal();
  if (cb) cb();
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") dismissModal();
});

function confirmDialog(message, opts) {
  opts = opts || {};
  const label = opts.confirmLabel || "Delete";
  const danger = opts.danger !== false;
  return new Promise((resolve) => {
    const card = openModal(
      `<p class="dlg-text">${esc(message)}</p>
       <div class="form-actions">
         <button type="button" class="${danger ? "btn-danger" : "btn-primary"}" id="dlg-ok">${esc(label)}</button>
         <button type="button" class="btn-secondary" id="dlg-cancel">Cancel</button>
       </div>`,
      { onDismiss: () => resolve(false) }
    );
    card.querySelector("#dlg-ok").addEventListener("click", () => {
      closeModal();
      resolve(true);
    });
    card.querySelector("#dlg-cancel").addEventListener("click", () => {
      closeModal();
      resolve(false);
    });
  });
}

function promptDialog(title, opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    const card = openModal(
      `<h3>${esc(title)}</h3>
       <form id="dlg-form">
         <label class="field"><span>${esc(opts.label || "")}</span>
           <input id="dlg-input" maxlength="60" required value="${esc(opts.value || "")}">
         </label>
         <div class="form-actions">
           <button class="btn-primary" type="submit">${esc(opts.confirmLabel || "Save")}</button>
           <button type="button" class="btn-secondary" id="dlg-cancel">Cancel</button>
         </div>
       </form>`,
      { onDismiss: () => resolve(null) }
    );
    const input = card.querySelector("#dlg-input");
    input.focus();
    input.select();
    card.querySelector("#dlg-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) return;
      closeModal();
      resolve(v);
    });
    card.querySelector("#dlg-cancel").addEventListener("click", () => {
      closeModal();
      resolve(null);
    });
  });
}

/* ---------- images ---------- */
// Shrinks a photo to a small JPEG so it can be stored inside the database
// (no paid file-storage service needed).
function compressImage(file, maxSide) {
  maxSide = maxSide || 640;
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) {
      reject(new Error("Please choose an image file."));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const r = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * r));
      const h = Math.max(1, Math.round(img.height * r));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      let q = 0.78;
      let out = c.toDataURL("image/jpeg", q);
      while (out.length > 150000 && q > 0.35) {
        q -= 0.1;
        out = c.toDataURL("image/jpeg", q);
      }
      resolve(out);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image. Try a JPG or PNG photo."));
    };
    img.src = url;
  });
}

function downloadJson(obj, filename) {
  const text = JSON.stringify(
    obj,
    (k, v) => (v && typeof v.toDate === "function" ? v.toDate().toISOString() : v),
    2
  );
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
