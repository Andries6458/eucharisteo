/* US federal tax engine — IRS, tax year 2025 (returns filed 2026).
   Amounts in USD. Covers ordinary-income brackets (short-term capital gains),
   preferential long-term capital-gains brackets with income stacking,
   the standard deduction and the 3.8% Net Investment Income Tax. */

import { clampMoney, bracketTax, marginalRate } from './brackets.js';

export const US_TAX_YEAR = 2025;

export const STANDARD_DEDUCTION = { single: 15_750, married_joint: 31_500 };

/* Marginal ordinary-income brackets: [upper bound of taxable income, rate]. */
export const ORDINARY_BRACKETS = {
  single: [
    [11_925, 0.10], [48_475, 0.12], [103_350, 0.22], [197_300, 0.24],
    [250_525, 0.32], [626_350, 0.35], [Infinity, 0.37],
  ],
  married_joint: [
    [23_850, 0.10], [96_950, 0.12], [206_700, 0.22], [394_600, 0.24],
    [501_050, 0.32], [751_600, 0.35], [Infinity, 0.37],
  ],
};

/* Long-term capital-gains brackets over taxable income (gains stack on top
   of ordinary income): [upper bound, rate]. */
export const LTCG_BRACKETS = {
  single: [[48_350, 0], [533_400, 0.15], [Infinity, 0.20]],
  married_joint: [[96_700, 0], [600_050, 0.15], [Infinity, 0.20]],
};

export const NIIT = {
  rate: 0.038,
  magiThreshold: { single: 200_000, married_joint: 250_000 },
};

/* Tax on ordinary taxable income (after deductions). */
export function ordinaryTax(taxableIncome, filingStatus = 'single') {
  const brackets = ORDINARY_BRACKETS[filingStatus] || ORDINARY_BRACKETS.single;
  const taxable = clampMoney(taxableIncome);
  const { tax, bands } = bracketTax(taxable, brackets);
  return {
    taxable, tax, bands,
    marginalRate: taxable > 0 ? marginalRate(taxable, brackets) : brackets[0][1],
    effectiveRate: taxable > 0 ? tax / taxable : 0,
  };
}

/* Short-term gains are ordinary income: tax the gain as the top slice above
   existing taxable income. */
export function shortTermGainsTax(gain, taxableIncome, filingStatus = 'single') {
  const g = clampMoney(gain);
  const base = clampMoney(taxableIncome);
  const withGain = ordinaryTax(base + g, filingStatus).tax;
  const without = ordinaryTax(base, filingStatus).tax;
  const tax = withGain - without;
  return { gain: g, tax, effectiveRate: g > 0 ? tax / g : 0, treatment: 'short-term (ordinary income)' };
}

/* Long-term gains stack on top of ordinary taxable income but use the
   preferential 0/15/20 brackets for the stacked slice. */
export function longTermGainsTax(gain, taxableIncome, filingStatus = 'single') {
  const g = clampMoney(gain);
  const base = clampMoney(taxableIncome);
  const brackets = LTCG_BRACKETS[filingStatus] || LTCG_BRACKETS.single;
  let tax = 0;
  let lower = 0;
  const bands = [];
  for (const [upper, rate] of brackets) {
    const from = Math.max(lower, base);
    const to = Math.min(upper, base + g);
    if (to > from) {
      tax += (to - from) * rate;
      bands.push({ from, to, rate, tax: (to - from) * rate });
    }
    lower = upper;
  }
  return { gain: g, tax, bands, effectiveRate: g > 0 ? tax / g : 0, treatment: 'long-term (0/15/20%)' };
}

/* 3.8% NIIT on the lesser of net investment income and MAGI over the threshold. */
export function niitTax(netInvestmentIncome, magi, filingStatus = 'single') {
  const nii = clampMoney(netInvestmentIncome);
  const threshold = NIIT.magiThreshold[filingStatus] || NIIT.magiThreshold.single;
  const excess = Math.max(0, clampMoney(magi) - threshold);
  const taxedAmount = Math.min(nii, excess);
  return { tax: taxedAmount * NIIT.rate, taxedAmount, threshold };
}

/* Full picture for the advisor screen: gain taxed both ways plus NIIT,
   so the user sees exactly what holding 12+ months is worth. */
export function usCapitalGainsSummary({ gain, annualIncome, filingStatus = 'single' }) {
  const deduction = STANDARD_DEDUCTION[filingStatus] || STANDARD_DEDUCTION.single;
  const taxable = Math.max(0, clampMoney(annualIncome) - deduction);
  const shortTerm = shortTermGainsTax(gain, taxable, filingStatus);
  const longTerm = longTermGainsTax(gain, taxable, filingStatus);
  const magi = clampMoney(annualIncome) + clampMoney(gain);
  const niit = niitTax(gain, magi, filingStatus);
  return {
    year: US_TAX_YEAR, filingStatus, standardDeduction: deduction, taxableIncome: taxable,
    shortTerm, longTerm, niit,
    holdLongSaving: shortTerm.tax - longTerm.tax,
  };
}
