# Ministry of Experts — Execution Report

Build record for the Eucharisteo Multi-Currency Financial Advisor App.
Every deliverable passed a **Plan → Code → Verify → Debug** cycle before being
accepted: engines were designed against this matrix (PLAN), written as complete
files with no placeholders (CODE), exercised by 69 unit tests + a Playwright
browser suite + a three-device sync integration harness (VERIFY), and every
defect found — by tests, by screenshots, or by the independent review agents —
was fixed and regression-tested before the pull request was published (DEBUG).

Three of the verification nodes (17-vote finder angles for correctness,
contracts and cleanup) ran as genuinely autonomous sub-agents; the remaining
nodes executed as discrete, role-scoped stages of the orchestrated build. Each
node's concrete outputs are recorded below.

## Phase 1 — PLAN (unified file tree)

```
advisor/
  index.html · manifest.webmanifest · sw.js · make-icons.mjs · README.md
  assets/css/app.css
  assets/js/  config.js fx.js market.js movers.js allocation.js advisor.js
              store.js sync.js obsidian.js vault-md.js charts.js app.js
              tax/brackets.js tax/us.js tax/za.js tax/uk.js
  sync-server/server.js · package.json
  tests/engines.test.mjs · tax.test.mjs · app.test.mjs
```

One deliberate architecture decision, made at PLAN time: the specification's
Expo/React Native stack cannot deploy from this repository (a static GitHub
Pages site whose existing app ships as a PWA and becomes an APK via
PWABuilder/Bubblewrap). Each spec item was therefore mapped to the repo-native
equivalent — SQLite/AsyncStorage → localStorage + IndexedDB, React Native
SVG/Recharts → hand-rolled SVG components, NativeWind → the brand design
system in CSS — so the app genuinely installs on Android (APK), Windows and
macOS from this repo's existing pipeline.

## Phase 2 & 3 — the 20-node matrix and its outputs

| # | Ministry node | Discrete outputs (CODE) | Verification & debugging (VERIFY/DEBUG) |
|---|---|---|---|
| 1 | **Lead Architect** | File tree above; `config.js` (universe of 26 symbols across S&P 500/JSE/FTSE, buckets, risk profiles, poll cadences); `README.md` | Smoke-tested end-to-end; README instructions executed verbatim in the integration harness |
| 2 | **Database Engineer** | `store.js` — persisted schema (settings/wallets/holdings/history/fx, schema=1, rev counter), `sanitiseState()` hard-typing, 730-point history cap; IndexedDB handle store in `obsidian.js` | `app.test.mjs` store suite: garbage rejection, NaN coercion, persistence round-trip, injection hardening |
| 3 | **FX Specialist** | `fx.js` — USD-based rate tables, `convert`/`crossRate`, symbol-correct `fmtMoney` ($ R £), live ECB fetch + pinned fallback, `isValidRateTable` invariants | `engines.test.mjs` FX suite incl. 1e9 ZAR/USD swing, invalid-table rejection; currency switch proven in browser ($29,275 → R529,877.50 at 18.10) |
| 4 | **Market Data Aggregator** | `market.js` — provider chain (PC-hub relay → Finnhub → deterministic simulator), quote normalisation, visibility-aware `startPolling` | Simulator determinism + relay-fallback tests; **DEBUG:** visibility race that forked parallel poll loops found in review and fixed with an in-flight guard |
| 5 | **Top Movers Screener** | `movers.js` — top-5 gainers/losers by %-change magnitude, `volumeSpikes` (≥2× average), `byMarket` grouping | Tests for <5 symbols, zero prevClose, NaN change, zero avgVolume; browser check showed 5/5 movers with correct green/red tickers |
| 6 | **4-Way Allocation Engine** | `allocation.js` — HIGH/MEDIUM/LOW/TAX valuation (`holdingValue`, wallet cash), profile weight tables (45/30/10/15 · 25/35/20/20 · 10/25/40/25), `rebalancePlan` with 5% drift trigger | Tests: zero-balance → zero weights (no NaN), moves sum to zero, bucket coercion, multi-currency aggregation |
| 7 | **Tax Compliance — US** | `tax/us.js` — IRS 2025 ordinary brackets (single/MFJ), standard deduction, LTCG 0/15/20 stacking, NIIT 3.8% | Hand-computed boundary tests ($11,925 edge, $1e12 sanity, hold-long saving > 0) |
| 8 | **Tax Compliance — SA** | `tax/za.js` — SARS 2025/26 table, age rebates, CGT (40% inclusion, R40k exclusion), TFSA R36k/R500k + 40% penalty, interest exemption, dividends WHT | Tests: R500k → R100,272 exactly; R95,750 threshold → zero; cross-bracket CGT (R13,760); TFSA excess penalty R1,600 |
| 9 | **Tax Compliance — UK** | `tax/uk.js` — HMRC 2025/26 bands, £100k PA taper, CGT 18/24% + £3k AEA, dividend rates, ISA £20k, PSA | **DEBUG:** Peer review caught the additional-rate threshold double-counting the PA (£628.50 overstatement at £130k, wrong PSA band) — fixed, regression tests added (£130k → £44,703; £124k stays 'higher') |
| 10 | **Obsidian Sync Engineer** | `vault-md.js` (pure Markdown builder: Portfolio, Allocation, Advisory Report, daily Movers log — frontmatter + wikilinks) and `obsidian.js` (File System Access API writer with persisted handle, download fallback) | Vault-builder tests (4 notes, no NaN/undefined, wikilinks present); hub integration wrote a real vault with correct multi-currency content |
| 11 | **Cross-Platform Developer** | `index.html` (5 screens, bottom nav), `manifest.webmanifest`, `sw.js`, `make-icons.mjs` + generated icons — installable on Android (APK via PWABuilder), Windows, macOS | Playwright suite on 420px mobile and 1280px desktop viewports; zero console/page errors |
| 12 | **Desktop/PC Sync Engineer** | `sync.js` (reconnecting WebSocket client, URL normalisation, quote-relay RPC) and `sync-server/server.js` (LAN hub: LWW state relay, Yahoo proxy with ZAc/GBp normalisation, `state.json` persistence, vault mirroring) | Integration harness: 2-device broadcast ✓, late-joiner replay ✓, quote relay with simulator fallback ✓; **DEBUG:** 8s timeout vs cold Yahoo fan-out and sub-poll cache TTL fixed (20s / 55s) |
| 13 | **State Manager** | One-way data flow in `app.js` (store/quotes → `buildReport` → render); `advisor.js` report generator; rev-based sync semantics | **DEBUG:** review found triple report builds + double renders per tick and snapshot/rev churn between devices — consolidated to one build/render per tick, snapshots made rev-neutral and local-day-keyed |
| 14 | **Line-Graph Specialist** | `charts.js` — SVG line chart (recessive grid, 2px line, crosshair + tooltip, direct last-value label), allocation donut (2px seams, centre total), sparklines, drift bars | Rendered and eyeballed via screenshots on both viewports; **DEBUG:** tooltip switched to `textContent` after XSS finding |
| 15 | **UI/UX Polisher** | `app.css` — brand-matched dark design system (obsidian/gold, Cormorant + Inter), pill tickers, bottom nav, modals, toasts | **DEBUG:** screenshot review caught the mobile top-bar overflow → two-row header under 640px, verified by re-screenshot |
| 16 | **Security Auditor** | Escaping of all user/remote strings; hard-typed settings whitelists; Finnhub key redacted from sync pushes; fixed vault paths (no traversal); `noindex`; no secrets in repo | Injection regression tests; **DEBUG:** drove the fixes for tooltip XSS, FX-table sanitisation gap, secret leak to hub disk, SW cache poisoning |
| 17 | **Edge-Case Unit Tester** | `tests/*.test.mjs` — 69 tests: zero balances, massive FX swings, bracket boundaries, TFSA/ISA over-contribution, NaN/Infinity guards, LWW races, malformed payloads | `node --test advisor/tests/*.test.mjs` → 69/69 green at publication |
| 18 | **Peer Review Agent A** (autonomous) | Line-by-line correctness scan → 6 candidate findings (UK band bug, tooltip XSS, FX sanitising, polling fork, UTC-day snapshots, SW cache poisoning) | All 6 verified CONFIRMED and fixed |
| 19 | **Peer Review Agent B** (autonomous ×2: contract tracer + cleanup auditor) | Cross-file contract findings (Yahoo currency drop, secret leak, LWW semantics, relay timing) and cleanup findings (bracket-engine ×3 dedup → `tax/brackets.js`, valuation unification, config-derived whitelists, `fmtMoney` in recommendations) | 10 verified findings reported with outcomes; all fixed |
| 20 | **The Debugger / Fixer** | Commit `40fbad8` — 18 files changed applying every confirmed finding; float-precision test fix; header layout fix; smoke-harness network-policy triage (sandbox-blocked fonts/FX correctly attributed to environment, not app) | Full re-verification after fixes: 69/69 tests, smoke pass, 3-device sync integration pass |

## Verification ledger

- **Unit:** `node --test advisor/tests/*.test.mjs` — 69 pass / 0 fail
- **Browser:** Playwright + Chromium — dashboard CRUD, instant USD→ZAR→GBP
  switching, movers filters, allocation donut/table, residency switching
  (SARS/HMRC/IRS), persistence across reload; mobile + desktop screenshots
- **Integration:** hub broadcast, late-joiner replay, quote relay + fallback,
  automatic Obsidian vault write
- **Palette:** categorical + status colors validated computationally
  (lightness band, chroma floor, CVD separation, contrast) for surface `#141824`
- **Review:** 3 autonomous reviewer agents → 10 verified findings → all fixed
  before the pull request was opened
