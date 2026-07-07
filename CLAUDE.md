# CLAUDE.md

Guidance for AI assistants working in this repository.

## What this repo is

Two things live in one static site, deployed together to GitHub Pages:

1. **A marketing website** for **Eucharisteo Trading (Pty) Ltd** — metallurgical
   coal optimisation specialists. Multi-page static HTML/CSS/JS at the repo root.
2. **A private PWA "Invoice Tracker"** under `tracker/` — an installable,
   offline-capable single-page app that tracks money owed to and by the company,
   with optional Firebase cloud sync across up to 6 users.

There is **no build step and no framework**. Everything is hand-written HTML, CSS,
and vanilla ES modules served as-is. Do not introduce a bundler, transpiler, or
package manager unless explicitly asked — the "no toolchain" property is
deliberate (it keeps deploys to a plain file copy).

## Repository layout

```
/                         Marketing site (static HTML)
  index.html              Root — a redirect that sends visitors to /tracker/
  index-company.html      The actual company homepage content
  about.html              Company pages (share nav/footer markup + assets/)
  services.html
  projects.html
  contact.html
  CNAME                   Custom domain: tracker.eucharisteotrading.co.za
  .well-known/
    assetlinks.json       Digital Asset Links for the Android APK (needs real SHA-256)
  assets/                 Marketing-site assets ONLY
    css/styles.css
    js/main.js            Nav toggle, scroll effects (IIFE, no modules)
    img/logo.svg, logo-mark.svg

  tracker/                The Invoice Tracker PWA (self-contained)
    index.html            App shell: login screen + dashboard
    manifest.webmanifest  PWA manifest (installability)
    sw.js                 Service worker (offline cache; bump CACHE on changes)
    make-icons.mjs        Regenerates PNG icons with Node zlib only (no deps)
    README.md             Detailed end-user + Firebase setup guide
    assets/
      css/app.css
      js/config.js        Firebase keys, legal ENTITIES, reminder rules
      js/calc.js          Pure calculation engine (VAT, ageing, totals) — no DOM
      js/store.js         Storage layer: Firebase OR localStorage fallback
      js/export.js        Excel + PDF export + clipboard/PDF parsing
      js/app.js           UI controller (largest file; wires everything together)
      icons/              Generated PNG app icons

  .github/workflows/
    deploy-pages.yml      Deploys whole repo to GitHub Pages on push to main
    build-apk.yml         Manual: builds an Android APK with Bubblewrap
```

Note the two `assets/` trees are **separate**: root `assets/` is for the
marketing site, `tracker/assets/` is for the app. Keep them independent.

Also note the marketing pages' nav links "Home" to `index.html`, which currently
redirects to `/tracker/`; the standalone company homepage content is in
`index-company.html`. Keep this in mind before "fixing" a Home link — confirm the
intended landing page with the user first.

## The tracker's architecture (the part that matters most)

The app is split into ES modules with a strict separation of concerns. Respect it
when making changes:

- **`config.js`** — All tunable data lives here: the `firebaseConfig`, the
  `WORKSPACE_ID`, the legal `ENTITIES` (EC Trading LDA in Mozambique, Eucharisteo
  Trading (Pty) Ltd in South Africa — these print on invoice PDFs), and the `APP`
  reminder rules (`leadTimeDays`, `overdueTiers`, `stalenessDays`,
  `weeklySummaryDay`). `isFirebaseConfigured()` decides local vs cloud mode.
- **`calc.js`** — **Pure functions, no DOM, no storage.** The `PARTIES` table
  defines each ledger/counterparty and its defaults (currency, VAT mode/rate,
  payment terms, which Eucharisteo entity issues it). Everything about VAT splits,
  balances, status, ageing, per-party/per-currency summaries, and reminders is
  computed here. This file is the source of truth for business logic — put new
  financial rules here, keep them side-effect-free, and reuse them in exports.
- **`store.js`** — One small storage API used by the whole app. Transparently
  uses **Firebase** (Auth + Firestore + Storage) for shared real-time sync, or
  falls back to **localStorage** ("local mode") when Firebase isn't configured or
  init fails. Firebase SDK is loaded from CDN at version `FB_VER`. Callers use
  `onInvoices`, `onAuth`, `saveInvoice`, etc. without knowing which backend is
  live.
- **`export.js`** — Excel (SheetJS) and PDF (jsPDF + autotable) export, plus
  clipboard-table and PDF-text parsing (pdf.js). Libraries are **lazy-loaded from
  CDN on demand** and cached by the service worker, so exports work offline after
  first use. Imports pure helpers from `calc.js`.
- **`app.js`** — The UI controller. Imports from the other three modules, owns the
  DOM, `state`, event wiring, and rendering. Keep business logic out of here —
  delegate to `calc.js`.

### The `PARTIES` / ledgers model

Ledgers are keyed in `calc.js` (`PARTY_KEYS = ['VULCAN_EC', 'VULCAN_ECT', 'AMSA',
'INYATHI']`). Each is either a **RECEIVABLE** (we invoice them) or **PAYABLE**
(they invoice us), with its own default currency and VAT rule — e.g. Vulcan
Mozambique is USD/MZN at 16% IVA, AMSA is ZAR at 15% VAT, Inyathi is 0% (no VAT).
When adding or changing a ledger, update `PARTIES`, `PARTY_KEYS`, and
`canonicalParty()` together, and check `config.js` `ENTITIES` if a new legal
entity issues the invoices. Currency and VAT are also editable per-invoice, so
never assume a ledger's default is the stored value — read from the invoice.

## Making changes safely

- **After editing any file the service worker caches, bump the `CACHE` constant
  in `tracker/sw.js`** (currently `eucharisteo-tracker-v7`). Otherwise installed
  users keep the stale cached version. The SW is network-first for app code but
  the version bump is the reliable signal — increment it on every tracker change.
- **Regenerate icons** with `node tracker/make-icons.mjs` only if you change the
  brand mark; it writes into `tracker/assets/icons/` using Node's built-in zlib
  (no npm install needed).
- **Do not commit real secrets beyond what's already here.** `config.js` contains
  a Firebase Web config — those keys are public-by-design for client apps, gated
  by Firestore/Storage security rules (documented in `tracker/README.md`). Don't
  add server-side secrets, service-account keys, or the APK signing keystore to
  the repo.
- **Keep the tracker private:** the app is `noindex`, intentionally not linked
  from the marketing site, and reachable only by direct URL. Don't add links to it
  from the public pages or remove the noindex directives.
- **Brand colours:** navy `#0a0e1a` background, gold `#d4a574` accent. Reused
  across the manifest, icons, APK theme, and CSS.

## Deployment & CI

- **Site deploy** — `deploy-pages.yml` runs on every **push to `main`** (and
  manual dispatch). It uploads the entire repo root as the Pages artifact, so the
  live URL structure mirrors the file tree: `/` → redirect → `/tracker/`.
  Live: `https://tracker.eucharisteotrading.co.za/tracker/` (custom domain) or
  `https://andries6458.github.io/eucharisteo/tracker/`.
- **APK build** — `build-apk.yml` is **manual only** (`workflow_dispatch`). It
  uses Bubblewrap to wrap the deployed PWA as a Trusted Web Activity APK and
  uploads it as a run artifact. The workflow currently generates a throwaway
  signing keystore each run (fine for testing; a persistent keystore is needed for
  shippable updates). The `host`/URLs in its `twa-manifest.json` block must match
  the live deployment.

## Git workflow for this repo

- Deploys trigger on `main`, so a push to `main` publishes to production.
- Do a quick manual sanity check in a browser for UI/tracker changes — there is
  no automated test suite. `calc.js` is written to be unit-testable (pure
  functions) if you ever add tests.
- Commit messages here are short, imperative, and describe the user-facing
  behaviour (e.g. "Add Incoming / Outgoing finance filter tabs"). Match that style.
