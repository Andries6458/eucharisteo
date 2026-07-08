# Financial Advisor & Tax Optimization App

A production-ready, multi-currency financial advisor built from a single
codebase that ships to **Android (APK)**, **iOS**, and **Windows/desktop**
(Expo Web + Electron shell).

## Feature overview

| Area | What it does |
| --- | --- |
| Currency & FX engine | USD ($), ZAR (R), GBP (£) with a live mock feed that re-polls every 5 seconds; a global dropdown instantly rebases every value in the app |
| Wallet ledger | AsyncStorage-backed ledger of assets (name, type, purchase currency, price, quantity, date) — fully local-first, works offline in a standalone APK |
| Growth chart | Touch-interactive SVG line chart: 24 months of history plus a 5-year compound projection matched to the user's risk tolerance |
| Live advisory | Auto-refreshing FX pair grid (USD/ZAR, USD/GBP, crosses), global indices, and risk-matched advice cards sized to investable cash |
| Tax optimizer | US IRS, SA SARS, and UK HMRC bracket visualizers that follow the active base currency, with income tax + capital gains estimates and per-jurisdiction optimization tips |
| User profile | Multi-currency income and cash reserves, risk tolerance (Low/Medium/High), persisted locally |

## Project layout

```
financial-advisor/
├── App.tsx                     # Root: providers, global currency bar, bottom tabs
├── index.ts                    # Expo entry point
├── app.json / eas.json         # Expo + EAS build configuration
├── electron/main.js            # Windows desktop shell (loads the web export)
├── backend/                    # FastAPI mirror of the on-device engines
│   ├── main.py                 # /rates /convert /tax/estimate /portfolio/summary /advice
│   └── requirements.txt
└── src/
    ├── types.ts                # Shared domain types
    ├── theme.ts                # Design tokens
    ├── context/AppContext.tsx  # Global state: currency, rates, ledger, profile
    ├── storage/storage.ts      # AsyncStorage persistence with seed fallback
    ├── data/seeds.ts           # Seed portfolio + profile
    ├── utils/
    │   ├── fxEngine.ts         # 5-second mock rate feed, conversion, pairs, indices
    │   ├── taxEngine.ts        # IRS / SARS / HMRC brackets, income tax + CGT
    │   ├── advisor.ts          # Risk-based recommendations, portfolio math, projections
    │   └── currencies.ts       # Currency metadata and money formatting
    ├── components/             # CurrencySelector, GrowthChart, MetricCard,
    │                           # AdviceCard, TaxBracketVisualizer, AddHoldingModal
    └── screens/                # Wallet, Advisory, Tax, Profile
```

## Running the app

```bash
cd financial-advisor
npm install

npm run android   # Android device/emulator via Expo
npm run ios       # iOS simulator via Expo
npm run web       # Browser / desktop viewport
```

### Android APK (EAS)

```bash
npm install -g eas-cli
eas login
npm run build:apk        # uses the "apk" profile in eas.json (buildType: apk)
```

### Windows desktop

```bash
npm run build:web        # exports the web bundle to ./dist
npx electron electron/main.js
```

Package with `electron-builder` (point it at `electron/main.js` and bundle
`dist/`) to produce a Windows installer.

## Backend (optional)

The app is local-first and needs no server. The FastAPI backend exposes the
same engines over HTTP for centralized deployments:

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# interactive docs at http://localhost:8000/docs
```

Endpoints: `GET /rates`, `POST /convert`, `POST /tax/estimate`,
`POST /portfolio/summary`, `POST /advice`, `GET /health`.

## Notes

- Tax figures use 2024/25 published brackets (IRS single filer, SARS
  individuals, HMRC England) and are planning estimates, not filing advice.
- FX rates are a bounded mean-reverting random walk around realistic anchors —
  swap `src/utils/fxEngine.ts` (or the backend `/rates` route) for a real feed
  by keeping the same `FxRates` shape.
