# Company Contacts Hub — Setup

Free hosting: GitHub Pages (site) + Firebase Spark plan (login and data).
Use a NEW Firebase project and a NEW GitHub repository, separate from the technician checklist.

## Phase 1 — Create the Firebase project
1. console.firebase.google.com > Add project (name e.g. `contacts-hub`). Turn Google Analytics off.
2. Build > Authentication > Get started > Sign-in method > enable **Email/Password** only.
3. Build > Firestore Database > Create database > Standard edition > location **asia-southeast1 (Singapore)** > **Production mode**.
4. Project settings (gear) > Your apps > Web `</>` > register an app. Copy the `firebaseConfig` values.

## Phase 2 — Connect the site and publish the rules
1. Open `js/firebase-init.js` and replace each `PASTE_...` value with your config.
2. Firestore Database > **Rules** tab > delete everything, paste the contents of `firestore.rules` > **Publish**.
3. Authentication > Users > **Add user**: your own email + password (this is the admin).
4. Copy that user's **User UID**.
5. Firestore Database > Data > Start collection `roles` > Document ID = the admin UID >
   fields: `role` (string) = `admin`, `email` (string) = your email, `name` (string) = your name,
   `createdAt` (timestamp) = now.
6. Authentication > Settings > Authorized domains: make sure `YOURNAME.github.io` is listed (add it if not).

## Phase 3 — Put the site on GitHub Pages
1. New GitHub repository (Public). Upload/commit all files so `index.html` is at the top level.
2. Settings > Pages > Deploy from branch > `main` / root.
3. Share `https://YOURNAME.github.io/REPO/login.html`.

## Phase 4 — Add people
Authentication > Users > Add user (email + password) for the boss and each teammate.
Send each person their password privately. They can use "Forgot password?" to choose their own.
They appear under Admin > Members after first sign-in, where you can promote or demote.

## How it works
- Members add vendors → status "pending" → only they and you can see it → you approve under Admin > Approvals.
- News & Policy is posted by you only. Members get a green "Read" tick when they open a post; you see who has/hasn't read.
- Categories: Admin > Categories (add, rename, delete). Backup: Admin > Backup (JSON file).

## Honest limits
- Name card photos are shrunk and stored inside Firestore (avoids paid storage). Keep them modest.
- A signed-in member could, with technical effort, fake a vendor's rating total (rules allow members to update only those two numbers). Acceptable for a trusted internal team.
- The "not read yet" list counts only people who have signed in at least once.
- Free plan: 50k reads / 20k writes per day — far above a 50-person team's needs.
- Anyone with a valid account sees all approved vendors; remove leavers in Authentication > Users.
