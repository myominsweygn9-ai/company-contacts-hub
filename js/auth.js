"use strict";
/**
 * auth.js — who is signed in, and are they the admin?
 *
 * Passwords are checked by Firebase Authentication (Google), never by this
 * code. Each person's role lives in the database at roles/<their user id>:
 *   role: "admin"   -> can approve vendors, post news, manage categories
 *   role: "member"  -> can view, add vendors (need approval), comment
 *
 * The admin role document is created by hand once (README-SETUP.md).
 * Everyone else gets a "member" document automatically the first time
 * they sign in. The database security rules (firestore.rules) are what
 * really enforce all of this — hiding buttons is only for a tidy screen.
 */

const Session = { user: null, profile: null, ref: null };

function isAdmin() {
  return !!(Session.profile && Session.profile.role === "admin");
}
function myName() {
  return (Session.profile && Session.profile.name) || (Session.user && Session.user.email) || "Member";
}

function requireLogin() {
  return new Promise((resolve, reject) => {
    let handled = false;
    fbAuth.onAuthStateChanged(async (user) => {
      if (!user) {
        location.replace("login.html");
        return;
      }
      if (handled) return;
      handled = true;
      Session.user = user;
      try {
        await loadProfile(user);
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function loadProfile(user) {
  const ref = fbDb.collection("roles").doc(user.uid);
  Session.ref = ref;
  let snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      role: "member",
      email: user.email || "",
      name: "",
      createdAt: ts(),
    });
    snap = await ref.get();
  }
  Session.profile = snap.data();

  if (!Session.profile.name || !Session.profile.email) {
    const name = Session.profile.name || (await askForName());
    const email = user.email || "";
    await ref.update({ name, email });
    Session.profile.name = name;
    Session.profile.email = email;
  }
}

function askForName() {
  return new Promise((resolve) => {
    const card = openModal(
      `<h3>Welcome</h3>
       <p class="muted">Please enter your name. It is shown next to your comments and in the "read" list for news.</p>
       <form id="name-form">
         <label class="field"><span>Your name</span>
           <input id="name-input" maxlength="60" required autocomplete="name">
         </label>
         <div class="form-actions"><button class="btn-primary" type="submit">Continue</button></div>
       </form>`,
      { dismissible: false }
    );
    card.querySelector("#name-input").focus();
    card.querySelector("#name-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const v = card.querySelector("#name-input").value.trim();
      if (!v) return;
      closeModal();
      resolve(v);
    });
  });
}

function logout() {
  fbAuth.signOut().finally(() => {
    location.href = "login.html";
  });
}
