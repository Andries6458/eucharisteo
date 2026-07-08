import {
  CapitalGainsResult,
  IncomeTaxResult,
  TaxBracket,
  TaxJurisdiction,
  TaxRuleSet,
} from '../types';

/**
 * Regional tax rule sets. Brackets are expressed in each jurisdiction's local
 * currency; callers convert the user's income into that currency first (the
 * FX engine handles this) so the visualizers always react to the active
 * currency jurisdiction.
 */
export const TAX_RULES: Record<TaxJurisdiction, TaxRuleSet> = {
  US_IRS: {
    jurisdiction: 'US_IRS',
    authority: 'IRS',
    country: 'United States',
    currency: 'USD',
    taxYearLabel: '2024 federal, single filer',
    brackets: [
      { from: 0, to: 11600, rate: 0.1 },
      { from: 11600, to: 47150, rate: 0.12 },
      { from: 47150, to: 100525, rate: 0.22 },
      { from: 100525, to: 191950, rate: 0.24 },
      { from: 191950, to: 243725, rate: 0.32 },
      { from: 243725, to: 609350, rate: 0.35 },
      { from: 609350, to: null, rate: 0.37 },
    ],
    rebate: 0,
    personalAllowance: 14600,
    allowanceTaperThreshold: null,
    capitalGains: {
      annualExclusion: 0,
      inclusionRate: 1,
      bands: [
        { from: 0, to: 47025, rate: 0 },
        { from: 47025, to: 518900, rate: 0.15 },
        { from: 518900, to: null, rate: 0.2 },
      ],
      note: 'Long-term capital gains rates for assets held over 12 months. Short-term gains are taxed as ordinary income.',
    },
    optimizationTips: [
      'Max out 401(k) contributions ($23,000 limit) to reduce taxable income dollar-for-dollar.',
      'Hold appreciating assets over 12 months to qualify for long-term capital gains rates (0/15/20%) instead of ordinary rates.',
      'Harvest losses before year-end: up to $3,000 of net capital losses offsets ordinary income annually.',
      'Contribute to a Roth IRA if under the income phase-out for tax-free growth on new investments.',
      'Use an HSA if eligible — triple tax advantage on contributions, growth, and qualified withdrawals.',
    ],
  },
  SA_SARS: {
    jurisdiction: 'SA_SARS',
    authority: 'SARS',
    country: 'South Africa',
    currency: 'ZAR',
    taxYearLabel: '2024/25 tax year, individual',
    brackets: [
      { from: 0, to: 237100, rate: 0.18 },
      { from: 237100, to: 370500, rate: 0.26 },
      { from: 370500, to: 512800, rate: 0.31 },
      { from: 512800, to: 673000, rate: 0.36 },
      { from: 673000, to: 857900, rate: 0.39 },
      { from: 857900, to: 1817000, rate: 0.41 },
      { from: 1817000, to: null, rate: 0.45 },
    ],
    rebate: 17235,
    personalAllowance: 0,
    allowanceTaperThreshold: null,
    capitalGains: {
      annualExclusion: 40000,
      inclusionRate: 0.4,
      bands: [
        { from: 0, to: 237100, rate: 0.18 },
        { from: 237100, to: 370500, rate: 0.26 },
        { from: 370500, to: 512800, rate: 0.31 },
        { from: 512800, to: 673000, rate: 0.36 },
        { from: 673000, to: 857900, rate: 0.39 },
        { from: 857900, to: 1817000, rate: 0.41 },
        { from: 1817000, to: null, rate: 0.45 },
      ],
      note: '40% of the net gain above the R40,000 annual exclusion is included in taxable income and taxed at your marginal rate (max effective 18%).',
    },
    optimizationTips: [
      'Contribute up to 27.5% of income (max R350,000) to a retirement annuity — contributions are fully deductible.',
      'Use your R36,000 annual tax-free savings account allowance (R500,000 lifetime) for zero tax on growth.',
      'Time disposals to use the R40,000 annual capital gains exclusion every tax year.',
      'Only 40% of capital gains are taxable — favour growth assets over income assets in taxable accounts.',
      'Claim the primary rebate (R17,235) and medical tax credits when filing with SARS.',
    ],
  },
  UK_HMRC: {
    jurisdiction: 'UK_HMRC',
    authority: 'HMRC',
    country: 'United Kingdom',
    currency: 'GBP',
    taxYearLabel: '2024/25 tax year, England',
    brackets: [
      { from: 0, to: 37700, rate: 0.2 },
      { from: 37700, to: 112570, rate: 0.4 },
      { from: 112570, to: null, rate: 0.45 },
    ],
    rebate: 0,
    personalAllowance: 12570,
    allowanceTaperThreshold: 100000,
    capitalGains: {
      annualExclusion: 3000,
      inclusionRate: 1,
      bands: [
        { from: 0, to: 37700, rate: 0.18 },
        { from: 37700, to: null, rate: 0.24 },
      ],
      note: 'Gains above the £3,000 annual exempt amount are taxed at 18% within the basic-rate band and 24% above it.',
    },
    optimizationTips: [
      'Shelter up to £20,000 per year in a Stocks & Shares ISA — all growth and withdrawals are tax-free.',
      'Pension contributions get relief at your marginal rate and restore the personal allowance if income exceeds £100,000.',
      'Realise gains annually to use the £3,000 CGT exempt amount before it is lost.',
      'Transfer assets between spouses tax-free to use both partners\' allowances and basic-rate bands.',
      'Watch the 60% effective tax trap between £100,000 and £125,140 caused by the allowance taper.',
    ],
  },
};

function taxFromBrackets(taxable: number, brackets: TaxBracket[]): {
  total: number;
  perBracket: number[];
  marginalRate: number;
  activeIndex: number;
} {
  let total = 0;
  let marginalRate = brackets[0].rate;
  let activeIndex = 0;
  const perBracket = brackets.map((bracket, index) => {
    const upper = bracket.to ?? Number.POSITIVE_INFINITY;
    const amountInBracket = Math.max(
      0,
      Math.min(taxable, upper) - bracket.from
    );
    if (amountInBracket > 0) {
      marginalRate = bracket.rate;
      activeIndex = index;
    }
    const tax = amountInBracket * bracket.rate;
    total += tax;
    return tax;
  });
  return { total, perBracket, marginalRate, activeIndex };
}

/**
 * Compute income tax for a gross annual income expressed in the
 * jurisdiction's local currency.
 */
export function computeIncomeTax(
  grossIncome: number,
  rules: TaxRuleSet
): IncomeTaxResult {
  const gross = Math.max(0, grossIncome);

  let allowance = rules.personalAllowance;
  if (
    rules.allowanceTaperThreshold !== null &&
    gross > rules.allowanceTaperThreshold
  ) {
    // UK taper: allowance shrinks £1 for every £2 above the threshold.
    const reduction = (gross - rules.allowanceTaperThreshold) / 2;
    allowance = Math.max(0, allowance - reduction);
  }

  const taxable = Math.max(0, gross - allowance);
  const { total, perBracket, marginalRate, activeIndex } = taxFromBrackets(
    taxable,
    rules.brackets
  );
  const afterRebate = Math.max(0, total - rules.rebate);

  return {
    gross,
    taxable,
    totalTax: afterRebate,
    effectiveRate: gross > 0 ? afterRebate / gross : 0,
    marginalRate,
    activeBracketIndex: activeIndex,
    perBracketTax: perBracket,
  };
}

/**
 * Estimate capital gains tax on an unrealized gain, in local currency.
 * `annualIncome` positions the gain within rate bands where the jurisdiction
 * stacks gains on top of income (SARS marginal rate, HMRC basic/higher band).
 */
export function computeCapitalGainsTax(
  grossGain: number,
  annualIncome: number,
  rules: TaxRuleSet
): CapitalGainsResult {
  const gain = Math.max(0, grossGain);
  const exclusionApplied = Math.min(gain, rules.capitalGains.annualExclusion);
  const afterExclusion = gain - exclusionApplied;
  const taxableGain = afterExclusion * rules.capitalGains.inclusionRate;

  if (taxableGain <= 0) {
    return {
      grossGain: gain,
      exclusionApplied,
      taxableGain: 0,
      estimatedTax: 0,
      effectiveRate: 0,
    };
  }

  let estimatedTax: number;
  if (rules.jurisdiction === 'SA_SARS') {
    // Included gain stacks on top of taxable income at marginal rates.
    const baseTaxable = Math.max(0, annualIncome);
    const withGain = taxFromBrackets(
      baseTaxable + taxableGain,
      rules.capitalGains.bands
    ).total;
    const withoutGain = taxFromBrackets(
      baseTaxable,
      rules.capitalGains.bands
    ).total;
    estimatedTax = withGain - withoutGain;
  } else if (rules.jurisdiction === 'UK_HMRC') {
    // Gains fill whatever remains of the basic-rate band after income.
    const incomeAboveAllowance = Math.max(
      0,
      annualIncome - rules.personalAllowance
    );
    const withGain = taxFromBrackets(
      incomeAboveAllowance + taxableGain,
      rules.capitalGains.bands
    ).total;
    const withoutGain = taxFromBrackets(
      incomeAboveAllowance,
      rules.capitalGains.bands
    ).total;
    estimatedTax = withGain - withoutGain;
  } else {
    // US long-term CGT bands keyed off taxable income position.
    const base = Math.max(0, annualIncome - rules.personalAllowance);
    const withGain = taxFromBrackets(
      base + taxableGain,
      rules.capitalGains.bands
    ).total;
    const withoutGain = taxFromBrackets(base, rules.capitalGains.bands).total;
    estimatedTax = withGain - withoutGain;
  }

  return {
    grossGain: gain,
    exclusionApplied,
    taxableGain,
    estimatedTax,
    effectiveRate: gain > 0 ? estimatedTax / gain : 0,
  };
}
