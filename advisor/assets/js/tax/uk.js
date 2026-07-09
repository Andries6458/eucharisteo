/* UK tax engine — HMRC, tax year 2025/26 (6 Apr 2025 – 5 Apr 2026).
   Amounts in GBP. Covers rUK income-tax bands with the personal-allowance
   taper, capital gains (18%/24% with the £3,000 annual exempt amount),
   dividend tax and the ISA / personal savings allowances. */

import { clampMoney, bracketTax } from './brackets.js';

export const UK_TAX_YEAR = '2025/26';

export const PERSONAL_ALLOWANCE = 12_570;
export const PA_TAPER_THRESHOLD = 100_000; // PA shrinks £1 per £2 above this

/* rUK bands over TAXABLE (above-allowance) income, per the HMRC table:
   basic to £37,700 · higher to £125,140 · additional above. */
export const UK_BANDS = [
  [37_700, 0.20],
  [125_140, 0.40],
  [Infinity, 0.45],
];

export const CGT = { annualExemptAmount: 3_000, basicRate: 0.18, higherRate: 0.24 };
export const BASIC_RATE_LIMIT = 37_700; // taxable (above-PA) income where higher rate starts

export const DIVIDEND = { allowance: 500, basicRate: 0.0875, higherRate: 0.3375, additionalRate: 0.3935 };

export const ISA_ALLOWANCE = 20_000;
export const PSA = { basic: 1_000, higher: 500, additional: 0 };

/* Personal allowance after the £100k taper. */
export function personalAllowance(income) {
  const i = clampMoney(income);
  if (i <= PA_TAPER_THRESHOLD) return PERSONAL_ALLOWANCE;
  return Math.max(0, PERSONAL_ALLOWANCE - (i - PA_TAPER_THRESHOLD) / 2);
}

/* Income tax on total income (salary etc., not dividends). */
export function incomeTax(income) {
  const gross = clampMoney(income);
  const pa = personalAllowance(gross);
  const taxable = Math.max(0, gross - pa);
  const { tax, bands } = bracketTax(taxable, UK_BANDS);
  const marginal = taxable <= 0 ? 0
    : taxable <= UK_BANDS[0][0] ? 0.20
    : taxable <= UK_BANDS[1][0] ? 0.40 : 0.45;
  return {
    gross, personalAllowance: pa, taxable, tax, bands,
    marginalRate: marginal,
    effectiveRate: gross > 0 ? tax / gross : 0,
    band: marginal <= 0.20 ? 'basic' : marginal === 0.40 ? 'higher' : 'additional',
  };
}

/* CGT on assets (18% within the unused basic-rate band, 24% above),
   after the £3,000 annual exempt amount. */
export function capitalGainsTax(gain, income, { exemptUsed = 0 } = {}) {
  const g = clampMoney(gain);
  const exemptLeft = Math.max(0, CGT.annualExemptAmount - clampMoney(exemptUsed));
  const chargeable = Math.max(0, g - exemptLeft);

  const it = incomeTax(income);
  const basicLeft = Math.max(0, BASIC_RATE_LIMIT - it.taxable);
  const atBasic = Math.min(chargeable, basicLeft);
  const atHigher = chargeable - atBasic;
  const tax = atBasic * CGT.basicRate + atHigher * CGT.higherRate;
  return {
    gain: g, exemptApplied: Math.min(g, exemptLeft), chargeable,
    atBasic, atHigher, tax,
    effectiveRate: g > 0 ? tax / g : 0,
  };
}

/* Dividend tax: dividends stack on top of other income, use the £500
   allowance, then the 8.75/33.75/39.35 rates by band. */
export function dividendTax(dividends, otherIncome) {
  const d = clampMoney(dividends);
  const it = incomeTax(otherIncome);
  const pa = it.personalAllowance;
  const paLeft = Math.max(0, pa - clampMoney(otherIncome));
  let taxableDiv = Math.max(0, d - paLeft);
  const allowanceUsed = Math.min(taxableDiv, DIVIDEND.allowance);
  taxableDiv -= allowanceUsed;

  // position of the dividend slice within the bands (above other taxable income
  // plus the allowance-covered part, which still occupies band space)
  let position = it.taxable + Math.min(d - taxableDiv, DIVIDEND.allowance);
  let tax = 0;
  const bandEdges = [[UK_BANDS[0][0], DIVIDEND.basicRate], [UK_BANDS[1][0], DIVIDEND.higherRate], [Infinity, DIVIDEND.additionalRate]];
  let remaining = taxableDiv;
  for (const [upper, rate] of bandEdges) {
    if (remaining <= 0) break;
    const room = Math.max(0, upper - position);
    const slice = Math.min(remaining, room);
    tax += slice * rate;
    remaining -= slice;
    position += slice;
  }
  return { dividends: d, allowance: DIVIDEND.allowance, taxable: taxableDiv, tax, effectiveRate: d > 0 ? tax / d : 0 };
}

/* ISA room: contributions this tax year against the £20,000 allowance. */
export function isaStatus({ contributedThisYear = 0 } = {}) {
  const year = clampMoney(contributedThisYear);
  return {
    allowance: ISA_ALLOWANCE,
    room: Math.max(0, ISA_ALLOWANCE - year),
    overContribution: Math.max(0, year - ISA_ALLOWANCE),
  };
}

/* Personal savings allowance by income band. */
export function savingsAllowance(income) {
  const band = incomeTax(income).band;
  return PSA[band];
}

/* Full picture for the advisor screen. */
export function ukCapitalGainsSummary({ gain, annualIncome, isa = {} }) {
  return {
    year: UK_TAX_YEAR,
    income: incomeTax(annualIncome),
    cgt: capitalGainsTax(gain, annualIncome),
    isa: isaStatus(isa),
    psa: savingsAllowance(annualIncome),
  };
}
