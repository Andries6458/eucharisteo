# Eucharisteo Invoice Tracker

A private, installable invoice tracker for **Eucharisteo Trading (Pty) Ltd**.

It tracks two money flows:

| Party | Flow | Eucharisteo entity | Currency (default) | VAT (default) |
|---|---|---|---|---|
| **Vulcan Mozambique** | Receivable — *you* invoice them | **EC Trading LDA** (Mozambique) | USD | No VAT |
| **AMSA Vanderbijlpark** | Payable — *they* invoice you | **Eucharisteo Trading (Pty) Ltd** (RSA) | ZAR (Rand) | VAT included (15%) |

Invoices to Vulcan are issued by **EC Trading LDA**; the AMSA side sits under **Eucharisteo Trading (Pty) Ltd**. The correct entity appears on each invoice PDF and on the dashboard. Add EC Trading LDA's NUIT / registration / address in `assets/js/config.js` (the `ENTITIES` block) to have them printed on the Vulcan invoice PDFs.

Currency and VAT are editable per invoice, so you can mix USD / ZAR / MZN / EUR / GBP.

## What it does

- **Auto-calculates** every line (qty × unit price), the invoice total, the VAT split for AMSA, payments, and the outstanding balance.
- **Per-party / per-currency totals**: invoiced, paid, outstanding, overdue count.
- **CT numbers** added manually per invoice (type + Enter, or paste a list) — fully searchable.
- **Reminders**: lead-time nudges before the due date (7 / 3 / 1 days out), **escalating overdue tiers** (7 / 14 / 30 / 60 days, with a CRITICAL level at 60+), a "no activity for 30+ days" flag, and a **weekly outstanding summary** — all with optional device notifications. Default payment terms auto-fill the due date 30 days after the invoice date for both parties (editable per invoice). Tune any of these in `assets/js/config.js`.
- **Excel + PDF export**: full ledger, per-party statements, and single-invoice PDFs.
- **Copy / paste** invoices and line items straight from Excel or your Windows PC.
- **Up to 6 users** on phones (Android), Windows, Mac — sharing the same live data across countries (via Firebase).
- **Works offline** and **installs like an app** (and can be packaged as an **APK**).
- **Private** — `noindex`, not linked from the public website, only reachable by direct URL or once installed.

---

## 1. Try it immediately (no setup)

Open `tracker/index.html` from your hosting (e.g. `https://your-site/tracker/`).
On first run it's in **Local mode** — data is saved on that one device. Click **Continue (local mode)** and start adding invoices. Great for testing and offline use.

> Local mode is per-device. To share live with your 6 users, do step 2.

---

## 2. Turn on shared cloud sync (6 users, any country) — ~10 minutes

This uses **Firebase** (Google). The free "Spark" plan is far more than enough.

1. Go to **https://console.firebase.google.com → Add project**. Name it e.g. `eucharisteo-invoices`. (Google Analytics optional — you can disable it.)
2. **Authentication → Get started → Email/Password → Enable.**
   Then **Users → Add user** for each partner (email + password). Add up to 6.
3. **Firestore Database → Create database → Production mode →** choose a location near you (e.g. `europe-west`). Then open the **Rules** tab, paste the rules below, and **Publish**:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       // Only the signed-in Eucharisteo users can read/write company data
       match /workspaces/{ws}/invoices/{doc} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```
4. **Storage → Get started** (needed for invoice file attachments). Then open the **Rules** tab, paste the rules below, and **Publish**:

   ```
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /workspaces/{ws}/invoices/{allPaths=**} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```
5. **Project settings (⚙) → Your apps → Web app (`</>`) → register an app →** copy the `firebaseConfig` values.
6. Open **`tracker/assets/js/config.js`** and replace the `PASTE_…` placeholders with those values. Save and re-deploy.

Done. Now everyone signs in with their email/password and sees the same live invoices and reminders, updating in real time. (It still works offline and syncs when back online.)

> Want me to wire this up for you? Paste your `firebaseConfig` block and I'll drop it into `config.js`.

---

## 3. Install on phones & Windows

- **Android (Chrome):** open the URL → menu **⋮ → Install app / Add to Home screen**.
- **Windows (Edge/Chrome):** open the URL → click the **Install** icon in the address bar (or menu → *Apps → Install this site as an app*).
- **iPhone (Safari):** **Share → Add to Home Screen**.

It then opens full-screen like a normal app, works offline, and shows on the home screen / Start menu.

The site is deployed by **`.github/workflows/deploy-pages.yml`** to GitHub Pages on every push to `main`. Default live URL:

- `https://andries6458.github.io/eucharisteo/`            (company website)
- `https://andries6458.github.io/eucharisteo/tracker/`    (invoice tracker)

---

## 3a. Custom domain (optional, recommended for a clean / bar-free app)

Pointing a subdomain such as **`tracker.eucharisteotrading.co.za`** at the site gives a tidy URL and lets the Android APK run **without the browser address bar** (via Digital Asset Links).

**Step 1 — add a DNS record** at whoever hosts DNS for `eucharisteotrading.co.za`:

| Type  | Name / Host | Value / Target            | TTL  |
|-------|-------------|---------------------------|------|
| CNAME | `tracker`   | `andries6458.github.io.`  | Auto |

**Step 2 — attach the domain** (do this *after* the DNS record exists, so the live site never goes dark): add a file named `CNAME` (no extension) at the repo root containing exactly `tracker.eucharisteotrading.co.za`, then push. GitHub serves the site on the new domain over HTTPS (it auto-provisions the certificate, which can take a few minutes).

**Step 3 — bar-free APK (optional):** after building the APK with PWABuilder, copy the SHA-256 signing-cert fingerprint it gives you into `.well-known/assetlinks.json` (a template is in the repo), then rebuild. The app then opens with no address bar.

> The live tracker URL then becomes `https://tracker.eucharisteotrading.co.za/tracker/`.

---

## 4. Build a downloadable **.APK** (for sideloading on partners' phones)

You need the app deployed to an **HTTPS URL** first (step 1/2). Then choose one:

### Option A — PWABuilder (easiest, no tools) ✅ recommended
1. Go to **https://www.pwabuilder.com**.
2. Enter your tracker URL (e.g. `https://your-site/tracker/`) → **Start**.
3. Click **Package For Stores → Android → Download**.
4. Inside the zip you get a ready **`app-release-signed.apk`** plus a `signing.keystore`.
   **Keep the keystore safe** — you need the same one to ship updates.
5. Send the APK to your partners. On their phone: allow "Install unknown apps" for the browser/Files app, then open the APK to install.

> By default PWABuilder builds a Trusted Web Activity that expects the site to verify ownership (Digital Asset Links). For private internal use you can tick **"Don't verify"** / sideload mode in PWABuilder's Android options so it installs without the `assetlinks.json` step.

### Option B — GitHub Action (automated, advanced)
This repo includes **`.github/workflows/build-apk.yml`**, which uses Bubblewrap to build an APK and upload it as a downloadable artifact. Before running it:
1. Deploy the tracker and set its public URL in the workflow (`HOST` / `MANIFEST_URL`).
2. (Recommended) create a signing keystore once and add it as repo secrets (instructions are in the workflow file). Without a persistent keystore, each build is signed with a throwaway debug key (fine for testing, not for updates).
3. Run the workflow from the **Actions** tab → download the APK from the run's **Artifacts**.

---

## 5. Using it day to day

- **+ (bottom right)** — add an invoice. Pick the party (auto-sets currency & VAT), enter the invoice number, add CT numbers, add line items (totals calculate live), set issue/due dates (quick `+30d` buttons), and record any payments.
- **Tabs** — filter All / Vulcan / AMSA. **Search** matches invoice no, CT number, notes.
- **⎘ Paste** — bulk-import invoices pasted from Excel (columns shown in the dialog).
- **⬇ Excel / ⬇ PDF** — export the current view (respects the active party tab).
- **⋯ menu** — JSON backup/restore, sync status, install & company info.
- **🔔 Enable device alerts** — get a notification when invoices are overdue/due soon.

### Excel/PDF exports include
- **Excel:** *Invoices*, *Line Items*, and *Summary* sheets.
- **PDF:** branded statement with a summary table + full invoice list; plus per-invoice PDFs from inside an invoice.

---

## Files

```
tracker/
  index.html              app shell (login + dashboard)
  manifest.webmanifest    PWA manifest (installability)
  sw.js                   service worker (offline)
  make-icons.mjs          regenerates the app icons (node make-icons.mjs)
  assets/
    css/app.css
    js/config.js          ← paste your Firebase keys here
    js/calc.js            calculation engine (VAT, ageing, totals)
    js/store.js           Firebase / local storage layer
    js/export.js          Excel + PDF + clipboard parsing
    js/app.js             UI controller
    icons/                generated PNG icons
```

## Notes & limits
- Reminders show inside the app and can fire a device notification while the app is open/installed. True background push (when the app is fully closed) would need Firebase Cloud Messaging — can be added later if you want it.
- Money is rounded to 2 decimals; per-currency totals are kept separate (no auto FX conversion).
- The app is intentionally **not linked from the public site** and is marked `noindex`, so it stays private to Eucharisteo.
