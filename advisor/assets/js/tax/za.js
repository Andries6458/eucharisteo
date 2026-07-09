/* South African tax engine — SARS, tax year 2025/26 (1 Mar 2025 – 28 Feb 2026).
   Amounts in ZAR. Covers the marginal income-tax table with age rebates,
   capital gains (40% inclusion + annual exclusion), the interest exemption,
   dividends withholding tax and TFSA contribution limits. */

import { clampMoney, bracketTax, marginalRate as marginalRateIn } from './brackets.js';

export const ZA_TAX_YEAR = '2025/26';

/* Marginal brackets: [upper bound of taxable income, rate]. */
export const ZA_BRACKETS = [
  [237_100, 0.18], [370_500, 0.26], [512_800, 0.31], [673_000, 0.36],
  [857_900, 0.39], [1_817_000, 0.41], [Infinity, 0.45],
];

/* Rebates are cumulative with age. */
export const REBATES = { primary: 17_235, secondary65: 9_444, tertiary75: 3_145 };

export const CGT = { inclusionRate: 0.40, annualExclusion: 40_000 };
export const INTEREST_EXEMPTION = { under65: 23_800, over65: 34_500 };
export const DIVIDENDS_WHT_RATE = 0.20;

export const TFSA = { annualLimit: 36_000, lifetimeLimit: 500_000, penaltyRate: 0.40 };

export function rebateFor(age) {
  const a = typeof age === 'number' && Number.isFinite(age) ? age : 0;
  let r = REBATES.primary;
  if (a >= 65) r += REBATES.secondary65;
  if (a >= 75) r += REBATES.tertiary75;
  return r;
}

export function marginalRate(taxableIncome) {
  return marginalRateIn(clampMoney(taxableIncome), ZA_BRACKETS);
}

/* Personal income tax after the age rebate (never below zero). */
export function incomeTax(taxableIncome, { age = 40 } = {}) {
  const taxable = clampMoney(taxableIncome);
  const { tax: gross, bands } = bracketTax(taxable, ZA_BRACKETS);
  const rebate = rebateFor(age);
  const tax = Math.max(0, gross - rebate);
  return {
    taxable, grossTax: gross, rebate, tax, bands,
    marginalRate: marginalRate(taxable),
    effectiveRate: taxable > 0 ? tax / taxable : 0,
  };
}

/* Individual CGT: gain − R40k exclusion, 40% included, taxed at the rates that
   apply on top of existing taxable income (rebate already absorbed there). */
export function capitalGainsTax(gain, taxableIncome, { age = 40, exclusionUsed = 0 } = {}) {
  const g = clampMoney(gain);
  const exclusionLeft = Math.max(0, CGT.annualExclusion - clampMoney(exclusionUsed));
  const afterExclusion = Math.max(0, g - exclusionLeft);
  const included = afterExclusion * CGT.inclusionRate;
  const base = clampMoney(taxableIncome);
  const withGain = incomeTax(base + included, { age }).tax;
  const without = incomeTax(base, { age }).tax;
  const tax = Math.max(0, withGain - without);
  return {
    gain: g, exclusionApplied: Math.min(g, exclusionLeft), includedAmount: included, tax,
    effectiveRate: g > 0 ? tax / g : 0,
    maxEffectiveRate: CGT.inclusionRate * ZA_BRACKETS[ZA_BRACKETS.length - 1][1], // 18%
  };
}

/* TFSA room and penalty exposure. Over-contributions are penalised at 40%. */
export function tfsaStatus({ contributedThisYear = 0, lifetimeContributed = 0 } = {}) {
  const year = clampMoney(contributedThisYear);
  const life = clampMoney(lifetimeContributed);
  const annualRoom = Math.max(0, TFSA.annualLimit - year);
  const lifetimeRoom = Math.max(0, TFSA.lifetimeLimit - life);
  const excess = Math.max(year - TFSA.annualLimit, life - TFSA.lifetimeLimit, 0);
  return {
    annualRoom, lifetimeRoom,
    room: Math.min(annualRoom, lifetimeRoom),
    excess, penalty: excess * TFSA.penaltyRate,
    annualLimit: TFSA.annualLimit, lifetimeLimit: TFSA.lifetimeLimit,
  };
}

/* Taxable interest after the age-based exemption. */
export function taxableInterest(interest, { age = 40 } = {}) {
  const exemption = age >= 65 ? INTEREST_EXEMPTION.over65 : INTEREST_EXEMPTION.under65;
  return { exemption, taxable: Math.max(0, clampMoney(interest) - exemption) };
}

/* Dividends withholding tax (local dividends, outside a TFSA). */
export function dividendsTax(dividends) {
  const d = clampMoney(dividends);
  return { tax: d * DIVIDENDS_WHT_RATE, net: d * (1 - DIVIDENDS_WHT_RATE), rate: DIVIDENDS_WHT_RATE };
}

/* Full picture for the advisor screen. */
export function zaCapitalGainsSummary({ gain, annualIncome, age = 40, tfsa = {} }) {
  const cgt = capitalGainsTax(gain, annualIncome, { age });
  return {
    year: ZA_TAX_YEAR,
    income: incomeTax(annualIncome, { age }),
    cgt,
    tfsa: tfsaStatus(tfsa),
  };
}
