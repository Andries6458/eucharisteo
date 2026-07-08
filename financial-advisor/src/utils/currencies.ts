import { CurrencyCode, CurrencyMeta } from '../types';

export const CURRENCIES: Record<CurrencyCode, CurrencyMeta> = {
  USD: {
    code: 'USD',
    symbol: '$',
    name: 'US Dollar',
    flag: '🇺🇸',
    jurisdiction: 'US_IRS',
    jurisdictionLabel: 'United States — IRS',
  },
  ZAR: {
    code: 'ZAR',
    symbol: 'R',
    name: 'South African Rand',
    flag: '🇿🇦',
    jurisdiction: 'SA_SARS',
    jurisdictionLabel: 'South Africa — SARS',
  },
  GBP: {
    code: 'GBP',
    symbol: '£',
    name: 'British Pound',
    flag: '🇬🇧',
    jurisdiction: 'UK_HMRC',
    jurisdictionLabel: 'United Kingdom — HMRC',
  },
};

export const CURRENCY_LIST: CurrencyMeta[] = [
  CURRENCIES.USD,
  CURRENCIES.ZAR,
  CURRENCIES.GBP,
];

export function symbolFor(code: CurrencyCode): string {
  return CURRENCIES[code].symbol;
}

export function formatMoney(
  amount: number,
  code: CurrencyCode,
  options?: { compact?: boolean; decimals?: number }
): string {
  const symbol = symbolFor(code);
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  const decimals = options?.decimals ?? 2;

  if (options?.compact) {
    if (abs >= 1_000_000_000) return `${sign}${symbol}${(abs / 1_000_000_000).toFixed(2)}B`;
    if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(2)}M`;
    if (abs >= 10_000) return `${sign}${symbol}${(abs / 1_000).toFixed(1)}K`;
  }

  const fixed = abs.toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decPart !== undefined
    ? `${sign}${symbol}${grouped}.${decPart}`
    : `${sign}${symbol}${grouped}`;
}

export function formatPct(value: number, decimals = 2): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}
