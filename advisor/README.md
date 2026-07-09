# Eucharisteo Financial Advisor

A private, installable **multi-currency financial advisor** for Eucharisteo Trading.
It runs on Android phones (installable / APK-packagable), Windows/Mac desktops and
in any modern browser, sharing one live state across devices on your network.

## What it does

- **Multi-currency native base switching** — $ USD, R ZAR, £ GBP. One tap on the
  header switch re-prices the whole app instantly. Live ECB rates (keyless,
  auto-refreshed) with a pinned offline fallback.
- **Top movers screen** — top 5 gainers and top 5 losers with green/red momentum
  tickers and intraday sparklines across the **S&P 500, JSE (incl. Satrix 40)
  and FTSE**, plus a **volume-spike screener** (≥2× average volume). Filter per
  market.
- **4-way allocation engine** — every holding and wallet balance lands in one of
  four buckets: **High risk / Medium risk / Low risk / Tax-optimised**. Pick an
  ideal split (Aggressive 45/30/10/15 · Balanced 25/35/20/20 · Conservative
  10/25/40/25) and the donut, drift bars and rebalancing plan show exactly what
  to buy or trim, in your base currency, against your **live wallet balances**.
- **Tax advisor for three residencies** (current tables, editable in one place):
  - **SARS 2025/26** — full marginal table with age rebates, CGT (40% inclusion,
    R40,000 exclusion), interest exemption, dividends WHT and **TFSA limits**
    (R36,000/yr, R500,000 lifetime, 40% penalty warnings).
  - **HMRC 2025/26** — bands with the £100k personal-allowance taper, CGT 18/24%
    with the £3,000 exempt amount, dividend rates and **ISA allowance** (£20,000).
  - **IRS 2025** — ordinary brackets (short-term gains), long-term 0/15/20%
    stacking, standard deduction, NIIT 3.8%, and the "hold long" saving.
- **Advisory report** — plain-language recommendations combining allocation
  drift, tax room (TFSA/ISA/exclusions) and unusual market volume.
- **Obsidian sync** — mirrors *Portfolio*, *Allocation*, *Advisory Report* and a
  daily *Movers log* as clean Markdown notes with frontmatter and wikilinks:
  straight into your vault folder (Chrome/Edge), as downloads (any browser), or
  **fully automatic** via the PC hub.
- **PC & multi-device sync** — a small WebSocket hub on your PC keeps every
  device's state identical in real time (last-write-wins) and relays **live
  Yahoo Finance quotes** to all of them.
- **Works offline** and **installs like an app**. When no live source is
  reachable, prices come from a clearly-labelled on-device simulator so every
  screen stays functional.
- **Private by design** — `noindex`, data only on your devices and your own PC.

## Try it

Open `advisor/index.html` from your hosting — with this repo's GitHub Pages
deploy that is:

- `https://andries6458.github.io/eucharisteo/advisor/`

Add wallet balances and holdings, and pick your risk profile and tax residency.
Everything is saved on the device.

## Install on phones & Windows

- **Android (Chrome):** open the URL → **⋮ → Install app**.
- **Windows (Edge/Chrome):** click the **Install** icon in the address bar.
- **iPhone (Safari):** **Share → Add to Home Screen**.

To build a **sideloadable APK**, use https://www.pwabuilder.com with the advisor
URL (same flow as the invoice tracker — see `tracker/README.md` §4).

## Live market data (optional — three ways)

| Source | Coverage | Setup |
|---|---|---|
| **PC hub relay** (recommended) | S&P 500 + JSE + FTSE | run the sync server below; connected devices get Yahoo Finance quotes automatically |
| **Finnhub key** | US symbols | free key from https://finnhub.io → paste in **Settings** (stored only on the device) |
| **Simulator** | everything | zero setup — deterministic, clearly labelled "Simulated" |

## PC sync hub + automatic Obsidian mirroring

On the desktop that shares Wi-Fi with your phone (needs Node 18+):

```bash
cd advisor/sync-server
npm install
npm start
# or, to also auto-write your Obsidian vault on every change:
EC_ADVISOR_VAULT="/path/to/YourVault" npm start        # macOS/Linux
set EC_ADVISOR_VAULT=C:\Users\you\Vault && npm start   # Windows
```

The hub prints its LAN address (e.g. `192.168.1.20:8765`). Enter that in
**Settings → PC & multi-device sync → Connect** on each device. State then flows
both ways in real time, the hub keeps `state.json` across restarts, and — with
`EC_ADVISOR_VAULT` set — your Obsidian notes update within seconds of any change
on any device.

## Files

```
advisor/
  index.html               app shell (5 screens, bottom navigation)
  manifest.webmanifest     PWA manifest (installability)
  sw.js                    service worker (offline, network-first)
  make-icons.mjs           regenerates the app icons (node make-icons.mjs)
  assets/
    css/app.css            brand design system (dark, gold, validated chart palette)
    js/config.js           currencies, symbol universe, profiles, chart colors
    js/fx.js               FX engine — conversion, formatting, live ECB rates
    js/market.js           market aggregator — relay/Finnhub/simulator chain
    js/movers.js           top-movers + volume-spike screener
    js/allocation.js       4-way bucket engine + rebalancing plans
    js/tax/us.js           IRS 2025 (brackets, LTCG stacking, NIIT)
    js/tax/za.js           SARS 2025/26 (rebates, CGT, TFSA, dividends WHT)
    js/tax/uk.js           HMRC 2025/26 (PA taper, CGT, dividends, ISA, PSA)
    js/advisor.js          advisory report generator
    js/vault-md.js         Obsidian Markdown builder (shared browser/server)
    js/store.js            persisted state store with sync-ready revisions
    js/sync.js             WebSocket sync client (reconnect, quote relay)
    js/obsidian.js         vault writer (File System Access API + downloads)
    js/charts.js           SVG line chart, allocation donut, sparklines
    js/app.js              UI controller
  sync-server/
    server.js              PC hub: sync relay, Yahoo quote proxy, vault writer
    package.json           (single dependency: ws)
  tests/                   node:test suites — run: node --test advisor/tests/*.test.mjs
```

## Notes & limits

- Sync is whole-state **last-write-wins** (highest revision, then timestamp).
  It is built for one person's devices, not simultaneous editing: if two
  devices are edited while one is offline, the device with more edits wins
  when it reconnects. Use the JSON backup before big reorganisations.
- Tax figures are **estimates for planning**, not filing advice; tables live in
  `assets/js/tax/*.js` and are dated per tax year for easy annual updates.
- Yahoo quote data comes via *your own PC* (no keys, personal use); the app
  itself never talks to Yahoo directly.
- Money is stored in each item's own currency and converted on render, so a
  rate change never mutates your data.
- The app is intentionally **not linked from the public site** and is marked
  `noindex`, so it stays private to Eucharisteo.
