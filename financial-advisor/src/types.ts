export type CurrencyCode = 'USD' | 'ZAR' | 'GBP';

export type AssetType = 'Stock' | 'Bond' | 'Crypto';

export type RiskTolerance = 'Low' | 'Medium' | 'High';

export type TaxJurisdiction = 'US_IRS' | 'SA_SARS' | 'UK_HMRC';

export interface CurrencyMeta {
  code: CurrencyCode;
  symbol: string;
  name: string;
  flag: string;
  jurisdiction: TaxJurisdiction;
  jurisdictionLabel: string;
}

export interface FxRates {
  /** Units of currency per 1 USD. USD is always 1. */
  perUsd: Record<CurrencyCode, number>;
  updatedAt: number;
  tick: number;
}

export interface Holding {
  id: string;
  assetName: string;
  ticker: string;
  assetType: AssetType;
  purchaseCurrency: CurrencyCode;
  purchasePrice: number;
  quantity: number;
  purchaseDate: string;
  /** Current unit price expressed in the purchase currency. */
  currentPrice: number;
}

export interface UserProfile {
  name: string;
  annualIncome: number;
  incomeCurrency: CurrencyCode;
  cashReserves: number;
  cashCurrency: CurrencyCode;
  riskTolerance: RiskTolerance;
}

export interface TaxBracket {
  /** Lower bound of the bracket in local currency. */
  from: number;
  /** Upper bound of the bracket in local currency; null means unbounded. */
  to: number | null;
  rate: number;
}

export interface TaxRuleSet {
  jurisdiction: TaxJurisdiction;
  authority: string;
  country: string;
  currency: CurrencyCode;
  taxYearLabel: string;
  brackets: TaxBracket[];
  /** Flat rebate subtracted from computed tax (SARS primary rebate). */
  rebate: number;
  /** Income exempt from tax before brackets apply (UK personal allowance). */
  personalAllowance: number;
  /** Personal allowance taper threshold (UK); null if not applicable. */
  allowanceTaperThreshold: number | null;
  capitalGains: {
    annualExclusion: number;
    /** Portion of the gain that is taxable (SARS inclusion rate); 1 elsewhere. */
    inclusionRate: number;
    /** Flat CGT bands: [{from, to, rate}] applied to taxable gains. */
    bands: TaxBracket[];
    note: string;
  };
  optimizationTips: string[];
}

export interface IncomeTaxResult {
  gross: number;
  taxable: number;
  totalTax: number;
  effectiveRate: number;
  marginalRate: number;
  activeBracketIndex: number;
  perBracketTax: number[];
}

export interface CapitalGainsResult {
  grossGain: number;
  exclusionApplied: number;
  taxableGain: number;
  estimatedTax: number;
  effectiveRate: number;
}

export interface MarketIndex {
  symbol: string;
  name: string;
  region: string;
  value: number;
  changePct: number;
}

export interface FxPairQuote {
  pair: string;
  base: CurrencyCode;
  quote: CurrencyCode;
  rate: number;
  changePct: number;
}

export interface AdviceSignal {
  id: string;
  title: string;
  ticker: string;
  assetType: AssetType | 'Cash' | 'ETF';
  action: 'Buy' | 'Hold' | 'Reduce' | 'Accumulate';
  currency: CurrencyCode;
  targetAllocationPct: number;
  suggestedAmount: number;
  rationale: string;
  riskMatch: RiskTolerance;
}
