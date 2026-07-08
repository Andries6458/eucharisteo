import {
  AdviceSignal,
  CurrencyCode,
  FxRates,
  Holding,
  RiskTolerance,
  UserProfile,
} from '../types';
import { convert } from './fxEngine';

interface RecommendationTemplate {
  title: string;
  ticker: string;
  assetType: AdviceSignal['assetType'];
  action: AdviceSignal['action'];
  currency: CurrencyCode;
  targetAllocationPct: number;
  rationale: string;
  riskMatch: RiskTolerance;
  /** Minimum investable cash (USD) for the signal to be actionable. */
  minCashUsd: number;
}

const RECOMMENDATIONS: Record<RiskTolerance, RecommendationTemplate[]> = {
  Low: [
    {
      title: 'US Treasury Bond ETF',
      ticker: 'GOVT',
      assetType: 'Bond',
      action: 'Buy',
      currency: 'USD',
      targetAllocationPct: 40,
      rationale:
        'Government bonds anchor a low-risk portfolio with predictable coupon income and minimal drawdown risk.',
      riskMatch: 'Low',
      minCashUsd: 100,
    },
    {
      title: 'SA Retail Savings Bond',
      ticker: 'RSA-5YR',
      assetType: 'Bond',
      action: 'Accumulate',
      currency: 'ZAR',
      targetAllocationPct: 25,
      rationale:
        'RSA retail bonds pay double-digit rand yields backed by the state — strong real returns for ZAR-based savers.',
      riskMatch: 'Low',
      minCashUsd: 50,
    },
    {
      title: 'UK Gilts Index Fund',
      ticker: 'VGOV',
      assetType: 'Bond',
      action: 'Buy',
      currency: 'GBP',
      targetAllocationPct: 20,
      rationale:
        'Gilts hedge sterling liabilities and stabilise the portfolio when equities sell off.',
      riskMatch: 'Low',
      minCashUsd: 100,
    },
    {
      title: 'Global Dividend Aristocrats',
      ticker: 'NOBL',
      assetType: 'Stock',
      action: 'Accumulate',
      currency: 'USD',
      targetAllocationPct: 15,
      rationale:
        'Companies with 25+ years of dividend growth add equity upside with below-market volatility.',
      riskMatch: 'Low',
      minCashUsd: 100,
    },
  ],
  Medium: [
    {
      title: 'S&P 500 Index ETF',
      ticker: 'VOO',
      assetType: 'ETF',
      action: 'Buy',
      currency: 'USD',
      targetAllocationPct: 35,
      rationale:
        'Core US equity exposure; dollar-cost averaging into the index compounds reliably over 5+ year horizons.',
      riskMatch: 'Medium',
      minCashUsd: 100,
    },
    {
      title: 'JSE Top 40 Tracker',
      ticker: 'STX40',
      assetType: 'ETF',
      action: 'Accumulate',
      currency: 'ZAR',
      targetAllocationPct: 20,
      rationale:
        'Broad rand-denominated equity exposure with resource-sector upside and attractive valuations.',
      riskMatch: 'Medium',
      minCashUsd: 50,
    },
    {
      title: 'FTSE 100 Income ETF',
      ticker: 'ISF',
      assetType: 'ETF',
      action: 'Buy',
      currency: 'GBP',
      targetAllocationPct: 20,
      rationale:
        'UK large caps trade at a discount to global peers while paying a ~4% sterling dividend yield.',
      riskMatch: 'Medium',
      minCashUsd: 100,
    },
    {
      title: 'Investment-Grade Corporate Bonds',
      ticker: 'LQD',
      assetType: 'Bond',
      action: 'Hold',
      currency: 'USD',
      targetAllocationPct: 15,
      rationale:
        'Corporate credit balances the equity sleeve and locks in elevated yields before rate cuts.',
      riskMatch: 'Medium',
      minCashUsd: 100,
    },
    {
      title: 'Bitcoin (satellite position)',
      ticker: 'BTC',
      assetType: 'Crypto',
      action: 'Accumulate',
      currency: 'USD',
      targetAllocationPct: 5,
      rationale:
        'A small crypto sleeve adds asymmetric upside; keep it under 5% so drawdowns stay survivable.',
      riskMatch: 'Medium',
      minCashUsd: 25,
    },
  ],
  High: [
    {
      title: 'Nasdaq 100 Growth ETF',
      ticker: 'QQQ',
      assetType: 'ETF',
      action: 'Buy',
      currency: 'USD',
      targetAllocationPct: 35,
      rationale:
        'Concentrated exposure to AI and mega-cap tech — the highest-beta core holding for aggressive growth.',
      riskMatch: 'High',
      minCashUsd: 100,
    },
    {
      title: 'Bitcoin',
      ticker: 'BTC',
      assetType: 'Crypto',
      action: 'Accumulate',
      currency: 'USD',
      targetAllocationPct: 15,
      rationale:
        'Hard-capped supply and institutional adoption support a full crypto allocation for high-risk mandates.',
      riskMatch: 'High',
      minCashUsd: 25,
    },
    {
      title: 'Ethereum',
      ticker: 'ETH',
      assetType: 'Crypto',
      action: 'Buy',
      currency: 'USD',
      targetAllocationPct: 10,
      rationale:
        'Staking yield plus smart-contract network effects diversify the crypto sleeve beyond Bitcoin.',
      riskMatch: 'High',
      minCashUsd: 25,
    },
    {
      title: 'SA Small-Cap Value',
      ticker: 'SMLCAP',
      assetType: 'Stock',
      action: 'Accumulate',
      currency: 'ZAR',
      targetAllocationPct: 15,
      rationale:
        'Deep-value rand small caps offer multi-bagger potential as domestic sentiment recovers.',
      riskMatch: 'High',
      minCashUsd: 50,
    },
    {
      title: 'UK AIM Growth Basket',
      ticker: 'AIM-GRW',
      assetType: 'Stock',
      action: 'Buy',
      currency: 'GBP',
      targetAllocationPct: 10,
      rationale:
        'AIM-listed growth shares carry inheritance-tax relief after two years and high growth optionality.',
      riskMatch: 'High',
      minCashUsd: 100,
    },
  ],
};

/**
 * Produce actionable, sized advice signals for the user's risk profile and
 * cash reserves, denominated in the active base currency.
 */
export function getAdviceSignals(
  profile: UserProfile,
  baseCurrency: CurrencyCode,
  rates: FxRates
): AdviceSignal[] {
  const cashUsd = convert(
    profile.cashReserves,
    profile.cashCurrency,
    'USD',
    rates
  );
  const templates = RECOMMENDATIONS[profile.riskTolerance];
  const actionable = templates.filter((t) => cashUsd >= t.minCashUsd);
  const universe = actionable.length > 0 ? actionable : templates;
  const totalPct = universe.reduce((sum, t) => sum + t.targetAllocationPct, 0);

  return universe.map((template, index) => {
    const shareOfCash = template.targetAllocationPct / totalPct;
    const amountUsd = cashUsd * shareOfCash;
    const suggestedAmount = convert(amountUsd, 'USD', baseCurrency, rates);
    return {
      id: `${profile.riskTolerance}-${template.ticker}-${index}`,
      title: template.title,
      ticker: template.ticker,
      assetType: template.assetType,
      action: cashUsd >= template.minCashUsd ? template.action : 'Hold',
      currency: template.currency,
      targetAllocationPct: template.targetAllocationPct,
      suggestedAmount,
      rationale: template.rationale,
      riskMatch: template.riskMatch,
    };
  });
}

export interface PortfolioSummary {
  totalValue: number;
  totalCost: number;
  unrealizedGain: number;
  unrealizedGainPct: number;
}

/** Value the ledger in the active base currency using live rates. */
export function summarizePortfolio(
  holdings: Holding[],
  baseCurrency: CurrencyCode,
  rates: FxRates
): PortfolioSummary {
  let totalValue = 0;
  let totalCost = 0;
  holdings.forEach((holding) => {
    const value = holding.currentPrice * holding.quantity;
    const cost = holding.purchasePrice * holding.quantity;
    totalValue += convert(value, holding.purchaseCurrency, baseCurrency, rates);
    totalCost += convert(cost, holding.purchaseCurrency, baseCurrency, rates);
  });
  const unrealizedGain = totalValue - totalCost;
  return {
    totalValue,
    totalCost,
    unrealizedGain,
    unrealizedGainPct: totalCost > 0 ? (unrealizedGain / totalCost) * 100 : 0,
  };
}

export interface GrowthPoint {
  label: string;
  value: number;
  projected: boolean;
}

const EXPECTED_ANNUAL_RETURN: Record<RiskTolerance, number> = {
  Low: 0.055,
  Medium: 0.085,
  High: 0.125,
};

/**
 * Build the chart series: 24 months of simulated history ending at today's
 * portfolio value, followed by a 5-year monthly compound growth projection at
 * the expected return for the user's risk tolerance.
 */
export function buildGrowthSeries(
  currentValue: number,
  risk: RiskTolerance
): GrowthPoint[] {
  const annual = EXPECTED_ANNUAL_RETURN[risk];
  const monthly = Math.pow(1 + annual, 1 / 12) - 1;
  const historyMonths = 24;
  const projectionMonths = 60;
  const points: GrowthPoint[] = [];
  const now = new Date();

  // Walk history backwards from the current value so the series always meets
  // the live number, with deterministic wobble seeded per month.
  const startValue = currentValue / Math.pow(1 + monthly, historyMonths);
  for (let m = 0; m <= historyMonths; m += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - (historyMonths - m), 1);
    const trend = startValue * Math.pow(1 + monthly, m);
    const wobble =
      m === historyMonths ? 0 : Math.sin(m * 1.7) * 0.035 + Math.sin(m * 0.6) * 0.02;
    points.push({
      label: `${date.toLocaleString('en', { month: 'short' })} '${String(
        date.getFullYear()
      ).slice(2)}`,
      value: trend * (1 + wobble),
      projected: false,
    });
  }

  for (let m = 3; m <= projectionMonths; m += 3) {
    const date = new Date(now.getFullYear(), now.getMonth() + m, 1);
    points.push({
      label: `${date.toLocaleString('en', { month: 'short' })} '${String(
        date.getFullYear()
      ).slice(2)}`,
      value: currentValue * Math.pow(1 + monthly, m),
      projected: true,
    });
  }

  return points;
}
