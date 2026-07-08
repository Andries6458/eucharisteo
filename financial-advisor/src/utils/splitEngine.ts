import {
  AssetClass,
  AssetType,
  CurrencyCode,
  FourWaySplit,
  FxRates,
  Holding,
  RiskTolerance,
  SplitSlice,
  TaxJurisdiction,
  UserProfile,
} from '../types';
import { convert } from './fxEngine';
import { CURRENCIES } from './currencies';

/**
 * The 4-Way Portfolio Split Engine.
 *
 * Every investor profile maps investable cash onto exactly four asset
 * classes — Stocks (individual equities), Shares (ETFs), Crypto, and Fixed
 * Income/Cash. Low/Medium/High use hardcoded strategic weights; the
 * Tax-Optimised profile first fills the jurisdiction's tax-free wrapper
 * (SA TFSA, UK ISA, US Roth IRA) and then allocates the remainder.
 */

export const ASSET_CLASS_ORDER: AssetClass[] = [
  'Stocks',
  'Shares',
  'Crypto',
  'FixedIncome',
];

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  Stocks: 'Stocks',
  Shares: 'Shares / ETFs',
  Crypto: 'Crypto',
  FixedIncome: 'Fixed Income / Cash',
};

/** Map a ledger asset type onto its 4-way split class. */
export function assetClassFor(assetType: AssetType): AssetClass {
  switch (assetType) {
    case 'Stock':
      return 'Stocks';
    case 'ETF':
      return 'Shares';
    case 'Crypto':
      return 'Crypto';
    case 'Bond':
    case 'Cash':
      return 'FixedIncome';
  }
}

interface StaticSplit {
  weights: Record<AssetClass, number>;
  labels: Record<AssetClass, string>;
  strategy: string;
}

const STATIC_SPLITS: Record<Exclude<RiskTolerance, 'TaxOptimised'>, StaticSplit> = {
  High: {
    weights: { Stocks: 50, Shares: 30, Crypto: 15, FixedIncome: 5 },
    labels: {
      Stocks: 'High-Growth Stocks',
      Shares: 'Global Shares / ETFs',
      Crypto: 'Crypto',
      FixedIncome: 'Cash',
    },
    strategy:
      'Aggressive Growth: half the portfolio in high-growth equities for maximum upside, a global ETF core for breadth, a full crypto sleeve for asymmetric returns, and a thin 5% cash buffer for opportunistic buying.',
  },
  Medium: {
    weights: { Stocks: 40, Shares: 40, Crypto: 5, FixedIncome: 15 },
    labels: {
      Stocks: 'Blue-Chip Stocks',
      Shares: 'Broad Market Shares / ETFs',
      Crypto: 'Crypto',
      FixedIncome: 'Cash / Bonds',
    },
    strategy:
      'Balanced: blue-chip equities and broad market ETFs split the growth engine evenly, a 5% crypto satellite adds upside without endangering the plan, and 15% in cash and bonds cushions drawdowns.',
  },
  Low: {
    weights: { Stocks: 15, Shares: 35, Crypto: 0, FixedIncome: 50 },
    labels: {
      Stocks: 'Dividend Stocks',
      Shares: 'Index Shares / ETFs',
      Crypto: 'Crypto',
      FixedIncome: 'Government Bonds / Cash',
    },
    strategy:
      'Conservative: capital preservation leads with half the portfolio in government bonds and cash, index ETFs provide steady market participation, dividend payers add income, and crypto is excluded entirely.',
  },
};

interface WrapperRule {
  name: string;
  annualCap: number;
  currency: CurrencyCode;
}

/** Annual tax-free wrapper contribution limits per jurisdiction. */
export const WRAPPER_RULES: Record<TaxJurisdiction, WrapperRule> = {
  SA_SARS: { name: 'SA Tax-Free Savings Account', annualCap: 36000, currency: 'ZAR' },
  UK_HMRC: { name: 'UK Stocks & Shares ISA', annualCap: 20000, currency: 'GBP' },
  US_IRS: { name: 'US Roth IRA', annualCap: 7000, currency: 'USD' },
};

/** Post-wrapper weights for the Tax-Optimised remainder. */
const TAX_OPT_REMAINDER_WEIGHTS: Record<AssetClass, number> = {
  Stocks: 30,
  Shares: 35,
  Crypto: 5,
  FixedIncome: 30,
};

const TAX_OPT_LABELS: Record<AssetClass, string> = {
  Stocks: 'Blue-Chip Stocks (taxable)',
  Shares: 'Index ETFs (wrapper first)',
  Crypto: 'Crypto',
  FixedIncome: 'Bonds / Cash',
};

/**
 * Compute the recommended 4-way split of the user's investable cash in the
 * active base currency.
 */
export function computeTargetSplit(
  profile: UserProfile,
  baseCurrency: CurrencyCode,
  rates: FxRates
): FourWaySplit {
  const cash = Math.max(
    0,
    convert(profile.cashReserves, profile.cashCurrency, baseCurrency, rates)
  );

  if (profile.riskTolerance !== 'TaxOptimised') {
    const split = STATIC_SPLITS[profile.riskTolerance];
    const slices: SplitSlice[] = ASSET_CLASS_ORDER.map((assetClass) => ({
      assetClass,
      label: split.labels[assetClass],
      pct: split.weights[assetClass],
      amount: (cash * split.weights[assetClass]) / 100,
    }));
    return {
      profile: profile.riskTolerance,
      baseCurrency,
      investableCash: cash,
      slices,
      wrapper: null,
      strategy: split.strategy,
    };
  }

  // Tax-Optimised: fill the jurisdiction's tax-free wrapper first (the
  // wrapper holds index ETFs, so it lands in the Shares class), then spread
  // the remainder across all four classes.
  const wrapperRule = WRAPPER_RULES[CURRENCIES[baseCurrency].jurisdiction];
  const capInBase = convert(
    wrapperRule.annualCap,
    wrapperRule.currency,
    baseCurrency,
    rates
  );
  const wrapperContribution = Math.min(cash, capInBase);
  const remainder = cash - wrapperContribution;

  const amounts: Record<AssetClass, number> = {
    Stocks: (remainder * TAX_OPT_REMAINDER_WEIGHTS.Stocks) / 100,
    Shares:
      wrapperContribution +
      (remainder * TAX_OPT_REMAINDER_WEIGHTS.Shares) / 100,
    Crypto: (remainder * TAX_OPT_REMAINDER_WEIGHTS.Crypto) / 100,
    FixedIncome: (remainder * TAX_OPT_REMAINDER_WEIGHTS.FixedIncome) / 100,
  };

  const slices: SplitSlice[] = ASSET_CLASS_ORDER.map((assetClass) => ({
    assetClass,
    label: TAX_OPT_LABELS[assetClass],
    pct: cash > 0 ? (amounts[assetClass] / cash) * 100 : 0,
    amount: amounts[assetClass],
  }));

  const wrapperShareOfCap =
    capInBase > 0 ? Math.round((wrapperContribution / capInBase) * 100) : 0;

  return {
    profile: 'TaxOptimised',
    baseCurrency,
    investableCash: cash,
    slices,
    wrapper: {
      name: wrapperRule.name,
      cap: capInBase,
      contribution: wrapperContribution,
      currency: baseCurrency,
    },
    strategy:
      `Tax-Optimised: contributions flow into the ${wrapperRule.name} first ` +
      `(${wrapperShareOfCap}% of this year's allowance used) so all growth inside the wrapper is tax-free, ` +
      'then the remainder is spread across blue-chip stocks, extra index ETFs, a small crypto sleeve, and bonds/cash for stability.',
  };
}

/**
 * Measure the ledger's current 4-way breakdown as percentages of portfolio
 * value in the base currency.
 */
export function computeCurrentSplit(
  holdings: Holding[],
  baseCurrency: CurrencyCode,
  rates: FxRates
): Record<AssetClass, number> {
  const totals: Record<AssetClass, number> = {
    Stocks: 0,
    Shares: 0,
    Crypto: 0,
    FixedIncome: 0,
  };
  let grandTotal = 0;
  holdings.forEach((holding) => {
    const value = convert(
      holding.currentPrice * holding.quantity,
      holding.purchaseCurrency,
      baseCurrency,
      rates
    );
    totals[assetClassFor(holding.assetType)] += value;
    grandTotal += value;
  });
  if (grandTotal <= 0) {
    return { Stocks: 0, Shares: 0, Crypto: 0, FixedIncome: 0 };
  }
  return {
    Stocks: (totals.Stocks / grandTotal) * 100,
    Shares: (totals.Shares / grandTotal) * 100,
    Crypto: (totals.Crypto / grandTotal) * 100,
    FixedIncome: (totals.FixedIncome / grandTotal) * 100,
  };
}
