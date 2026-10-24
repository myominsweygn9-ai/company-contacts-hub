"use strict";
/**
 * login.js — the sign-in page. Passwords go straight to Firebase
 * Authentication; this file never stores or sees them afterwards.
 */
(function () {
  document.getElementById("login-brand").textContent = APP_SETTINGS.appName;

  const form = document.getElementById("login-form");
  const err = document.getElementById("login-error");
  const info = document.getElementById("login-info");
  const btn = document.getElementById("login-btn");

  if (!FIREBASE_READY) {
    document.getElementById("setup-warning").hidden = false;
    btn.disabled = true;
    return;
  }

  // Already signed in (for example a tab left open)? Go straight in.
  fbAuth.onAuthStateChanged((user) => {
    if (user) location.replace("index.html");
  });

  function show(el, msg) {
    err.hidden = true;
    info.hidden = true;
    el.textContent = msg;
    el.hidden = false;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    err.hidden = true;
    info.hidden = true;
    btn.disabled = true;
    btn.textContent = "Signing in…";
    fbAuth
      .signInWithEmailAndPassword(
        document.getElementById("l-email").value.trim(),
        document.getElementById("l-password").value
      )
      .then(() => location.replace("index.html"))
      .catch((ex) => {
        btn.disabled = false;
        btn.textContent = "Sign In";
        if (ex && ex.code === "auth/too-many-requests") {
          show(err, "Too many attempts. Please wait a few minutes, or use Forgot password.");
        } else if (ex && ex.code === "auth/network-request-failed") {
          show(err, "No internet connection. Please try again.");
        } else {
          show(err, "Incorrect email or password.");
        }
      });
  });

  document.getElementById("forgot").addEventListener("click", () => {
    const email = document.getElementById("l-email").value.trim();
    if (!email) {
      show(err, "Type your email above first, then tap Forgot password.");
      return;
    }
    fbAuth
      .sendPasswordResetEmail(email)
      .catch(() => {})
      .then(() => {
        // Same message whether or not the email exists, so nobody can use
        // this page to find out who has an account.
        show(info, "If that email has an account, a password reset link has been sent. Check your inbox and spam folder.");
      });
  });
})();
