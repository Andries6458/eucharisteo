/* Eucharisteo Financial Advisor — configuration.
   Pure data module: safe to import from the browser, the sync server and tests. */

export const APP_NAME = 'Eucharisteo Financial Advisor';
export const STORAGE_KEY = 'eucharisteo-advisor-v1';
export const SYNC_PORT = 8765;

/* ---------- currencies ---------- */

export const CURRENCIES = ['USD', 'ZAR', 'GBP'];

export const CURRENCY_META = {
  USD: { symbol: '$', name: 'US Dollar', locale: 'en-US' },
  ZAR: { symbol: 'R', name: 'South African Rand', locale: 'en-ZA' },
  GBP: { symbol: '£', name: 'British Pound', locale: 'en-GB' },
};

/* Pinned fallback rates (1 USD in each currency) used until a live fetch
   succeeds and whenever the device is offline. asOf documents their vintage. */
export const FALLBACK_FX = {
  base: 'USD',
  rates: { USD: 1, ZAR: 18.10, GBP: 0.79 },
  asOf: '2026-01-15',
  source: 'pinned',
};

/* Live FX endpoint (ECB reference rates, keyless, CORS-enabled). */
export const FX_API = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=ZAR,GBP';

/* ---------- market data ---------- */

/* Watchlist universe scanned by the movers screener. `yahoo` is the symbol
   used by the PC relay's Yahoo proxy; `finnhub` (US only) by direct polling. */
export const UNIVERSE = [
  // S&P 500 large caps (USD)
  { symbol: 'AAPL',  name: 'Apple',              market: 'S&P 500', currency: 'USD', yahoo: 'AAPL',    finnhub: 'AAPL' },
  { symbol: 'MSFT',  name: 'Microsoft',           market: 'S&P 500', currency: 'USD', yahoo: 'MSFT',    finnhub: 'MSFT' },
  { symbol: 'NVDA',  name: 'NVIDIA',              market: 'S&P 500', currency: 'USD', yahoo: 'NVDA',    finnhub: 'NVDA' },
  { symbol: 'AMZN',  name: 'Amazon',              market: 'S&P 500', currency: 'USD', yahoo: 'AMZN',    finnhub: 'AMZN' },
  { symbol: 'GOOGL', name: 'Alphabet',            market: 'S&P 500', currency: 'USD', yahoo: 'GOOGL',   finnhub: 'GOOGL' },
  { symbol: 'META',  name: 'Meta Platforms',      market: 'S&P 500', currency: 'USD', yahoo: 'META',    finnhub: 'META' },
  { symbol: 'TSLA',  name: 'Tesla',               market: 'S&P 500', currency: 'USD', yahoo: 'TSLA',    finnhub: 'TSLA' },
  { symbol: 'JPM',   name: 'JPMorgan Chase',      market: 'S&P 500', currency: 'USD', yahoo: 'JPM',     finnhub: 'JPM' },
  { symbol: 'XOM',   name: 'Exxon Mobil',         market: 'S&P 500', currency: 'USD', yahoo: 'XOM',     finnhub: 'XOM' },
  { symbol: 'JNJ',   name: 'Johnson & Johnson',   market: 'S&P 500', currency: 'USD', yahoo: 'JNJ',     finnhub: 'JNJ' },
  { symbol: 'SPY',   name: 'SPDR S&P 500 ETF',    market: 'S&P 500', currency: 'USD', yahoo: 'SPY',     finnhub: 'SPY' },
  // JSE (ZAR — JSE quotes arrive in cents from Yahoo; the relay normalises to rand)
  { symbol: 'NPN',   name: 'Naspers',             market: 'JSE',     currency: 'ZAR', yahoo: 'NPN.JO',  finnhub: null },
  { symbol: 'PRX',   name: 'Prosus',              market: 'JSE',     currency: 'ZAR', yahoo: 'PRX.JO',  finnhub: null },
  { symbol: 'SOL',   name: 'Sasol',               market: 'JSE',     currency: 'ZAR', yahoo: 'SOL.JO',  finnhub: null },
  { symbol: 'FSR',   name: 'FirstRand',           market: 'JSE',     currency: 'ZAR', yahoo: 'FSR.JO',  finnhub: null },
  { symbol: 'MTN',   name: 'MTN Group',           market: 'JSE',     currency: 'ZAR', yahoo: 'MTN.JO',  finnhub: null },
  { symbol: 'AGL',   name: 'Anglo American',      market: 'JSE',     currency: 'ZAR', yahoo: 'AGL.JO',  finnhub: null },
  { symbol: 'STX40', name: 'Satrix 40 ETF',       market: 'JSE',     currency: 'ZAR', yahoo: 'STX40.JO', finnhub: null },
  // FTSE 100 (GBP — LSE quotes arrive in pence from Yahoo; the relay normalises to pounds)
  { symbol: 'SHEL',  name: 'Shell',               market: 'FTSE',    currency: 'GBP', yahoo: 'SHEL.L',  finnhub: null },
  { symbol: 'AZN',   name: 'AstraZeneca',         market: 'FTSE',    currency: 'GBP', yahoo: 'AZN.L',   finnhub: null },
  { symbol: 'HSBA',  name: 'HSBC Holdings',       market: 'FTSE',    currency: 'GBP', yahoo: 'HSBA.L',  finnhub: null },
  { symbol: 'ULVR',  name: 'Unilever',            market: 'FTSE',    currency: 'GBP', yahoo: 'ULVR.L',  finnhub: null },
  { symbol: 'BP',    name: 'BP',                  market: 'FTSE',    currency: 'GBP', yahoo: 'BP.L',    finnhub: null },
  { symbol: 'RIO',   name: 'Rio Tinto',           market: 'FTSE',    currency: 'GBP', yahoo: 'RIO.L',   finnhub: null },
  { symbol: 'VUKE',  name: 'Vanguard FTSE 100 ETF', market: 'FTSE',  currency: 'GBP', yahoo: 'VUKE.L',  finnhub: null },
];

export const POLL_INTERVAL_MS = 60_000;      // market poll cadence while visible
export const FX_REFRESH_MS = 6 * 3600_000;   // FX refresh cadence
export const VOLUME_SPIKE_FACTOR = 2;        // volume > 2x its average = spike
export const TOP_N_MOVERS = 5;

/* ---------- allocation ---------- */

export const BUCKETS = ['HIGH', 'MEDIUM', 'LOW', 'TAX'];

export const BUCKET_META = {
  HIGH:   { label: 'High risk',      hint: 'Single stocks, small caps, crypto-adjacent' },
  MEDIUM: { label: 'Medium risk',    hint: 'Broad index ETFs, large-cap blue chips' },
  LOW:    { label: 'Low risk',       hint: 'Bonds, money market, cash balances' },
  TAX:    { label: 'Tax-optimised',  hint: 'TFSA / ISA / retirement-wrapped assets' },
};

/* Ideal 4-way weight splits per risk profile (each sums to 1). */
export const RISK_PROFILES = {
  aggressive:   { label: 'Aggressive',   weights: { HIGH: 0.45, MEDIUM: 0.30, LOW: 0.10, TAX: 0.15 } },
  balanced:     { label: 'Balanced',     weights: { HIGH: 0.25, MEDIUM: 0.35, LOW: 0.20, TAX: 0.20 } },
  conservative: { label: 'Conservative', weights: { HIGH: 0.10, MEDIUM: 0.25, LOW: 0.40, TAX: 0.25 } },
};

/* Rebalancing advice triggers when a bucket drifts this far from target. */
export const DRIFT_THRESHOLD = 0.05;

/* ---------- charts (palette validated for the dark surface #141824) ---------- */

export const CHART_COLORS = {
  categorical: { HIGH: '#cc7e03', MEDIUM: '#0099ef', LOW: '#03a89e', TAX: '#a376ea' },
  gain: '#0bad70',
  loss: '#e76349',
  line: '#cc7e03',
};

/* ---------- tax residencies ---------- */

export const RESIDENCIES = [
  { code: 'US', label: 'United States (IRS)' },
  { code: 'ZA', label: 'South Africa (SARS)' },
  { code: 'UK', label: 'United Kingdom (HMRC)' },
];
