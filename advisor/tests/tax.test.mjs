/* Tax engine tests — expected values computed by hand from the published
   IRS 2025 / SARS 2025-26 / HMRC 2025-26 tables, including bracket
   boundaries, zero and extreme inputs. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as us from '../assets/js/tax/us.js';
import * as za from '../assets/js/tax/za.js';
import * as uk from '../assets/js/tax/uk.js';

const close = (a, b, eps = 0.51) => assert.ok(Math.abs(a - b) < eps, `expected ${a} ≈ ${b}`);

/* ---------------- US (IRS 2025) ---------------- */

test('us: ordinary tax on $50,000 single', () => {
  // 11,925@10% + 36,550@12% + 1,525@22% = 1,192.50 + 4,386 + 335.50
  close(us.ordinaryTax(50_000, 'single').tax, 5_914);
});

test('us: zero, negative and NaN income are safe', () => {
  assert.equal(us.ordinaryTax(0).tax, 0);
  assert.equal(us.ordinaryTax(-5000).tax, 0);
  assert.equal(us.ordinaryTax(NaN).tax, 0);
});

test('us: bracket boundary is exact', () => {
  close(us.ordinaryTax(11_925, 'single').tax, 1_192.5);
  assert.equal(us.ordinaryTax(11_925, 'single').marginalRate, 0.10);
  assert.equal(us.ordinaryTax(11_926, 'single').marginalRate, 0.12);
});

test('us: LTCG stacks on ordinary income across the 0% boundary', () => {
  // taxable income 40,000; gain 20,000 -> 8,350 at 0%, 11,650 at 15%
  const r = us.longTermGainsTax(20_000, 40_000, 'single');
  close(r.tax, 1_747.5);
});

test('us: LTCG entirely in the 0% band is tax-free', () => {
  assert.equal(us.longTermGainsTax(8_000, 30_000, 'single').tax, 0);
});

test('us: short-term gains are taxed as the top income slice', () => {
  const r = us.shortTermGainsTax(10_000, 100_000, 'single');
  // 100k->103,350 @22% (737) + 103,350->110k @24% (1,596)
  close(r.tax, 737 + 1_596);
});

test('us: long-term beats short-term for the same gain', () => {
  const s = us.usCapitalGainsSummary({ gain: 50_000, annualIncome: 120_000, filingStatus: 'single' });
  assert.ok(s.longTerm.tax < s.shortTerm.tax);
  assert.ok(s.holdLongSaving > 0);
});

test('us: NIIT applies only above the MAGI threshold', () => {
  assert.equal(us.niitTax(10_000, 150_000, 'single').tax, 0);
  close(us.niitTax(10_000, 205_000, 'single').tax, 5_000 * 0.038);
  close(us.niitTax(10_000, 500_000, 'single').tax, 10_000 * 0.038);
});

test('us: married brackets differ from single', () => {
  assert.ok(us.ordinaryTax(100_000, 'married_joint').tax < us.ordinaryTax(100_000, 'single').tax);
});

test('us: extreme income stays finite at 37%', () => {
  const r = us.ordinaryTax(1e12, 'single');
  assert.ok(Number.isFinite(r.tax));
  close(r.effectiveRate, 0.37, 0.001);
});

/* ---------------- SA (SARS 2025/26) ---------------- */

test('za: income tax on R500,000 (age 40) matches the SARS table', () => {
  // 42,678 + 34,684 + 40,145 = 117,507 gross − 17,235 rebate = 100,272
  close(za.incomeTax(500_000, { age: 40 }).tax, 100_272);
});

test('za: tax threshold — R95,750 pays exactly zero', () => {
  assert.equal(za.incomeTax(95_750, { age: 40 }).tax, 0);
  assert.ok(za.incomeTax(95_751, { age: 40 }).tax < 1);
});

test('za: age rebates reduce tax for 65+ and 75+', () => {
  const t40 = za.incomeTax(300_000, { age: 40 }).tax;
  const t66 = za.incomeTax(300_000, { age: 66 }).tax;
  const t76 = za.incomeTax(300_000, { age: 76 }).tax;
  close(t40 - t66, 9_444);
  close(t66 - t76, 3_145);
});

test('za: top marginal rate is 45%', () => {
  assert.equal(za.marginalRate(2_000_000), 0.45);
  assert.equal(za.marginalRate(100_000), 0.18);
});

test('za: CGT applies exclusion, 40% inclusion, and crosses brackets correctly', () => {
  // gain 140k, income 500k: 100k after exclusion, 40k included.
  // 500k->512,800 @31% = 3,968 ; 512,800->540k @36% = 9,792 ; total 13,760
  const r = za.capitalGainsTax(140_000, 500_000, { age: 40 });
  assert.equal(r.exclusionApplied, 40_000);
  assert.equal(r.includedAmount, 40_000);
  close(r.tax, 13_760);
});

test('za: gains inside the R40,000 exclusion are tax-free', () => {
  assert.equal(za.capitalGainsTax(35_000, 500_000, { age: 40 }).tax, 0);
});

test('za: max effective CGT rate is 18%', () => {
  close(za.capitalGainsTax(10_000_000, 2_000_000, { age: 40 }).maxEffectiveRate, 0.18, 1e-9);
});

test('za: TFSA room, limits and 40% penalty', () => {
  const ok = za.tfsaStatus({ contributedThisYear: 10_000, lifetimeContributed: 100_000 });
  assert.equal(ok.annualRoom, 26_000);
  assert.equal(ok.room, 26_000);
  assert.equal(ok.penalty, 0);

  const over = za.tfsaStatus({ contributedThisYear: 40_000, lifetimeContributed: 100_000 });
  assert.equal(over.excess, 4_000);
  assert.equal(over.penalty, 1_600);

  const life = za.tfsaStatus({ contributedThisYear: 0, lifetimeContributed: 490_000 });
  assert.equal(life.room, 10_000); // lifetime cap binds before the annual one
});

test('za: interest exemption by age; dividends withheld at 20%', () => {
  assert.equal(za.taxableInterest(30_000, { age: 40 }).taxable, 6_200);
  assert.equal(za.taxableInterest(30_000, { age: 70 }).taxable, 0);
  close(za.dividendsTax(1_000).tax, 200);
});

/* ---------------- UK (HMRC 2025/26) ---------------- */

test('uk: income tax on £50,000 is £7,486', () => {
  close(uk.incomeTax(50_000).tax, 7_486);
});

test('uk: personal allowance tapers above £100,000', () => {
  assert.equal(uk.personalAllowance(100_000), 12_570);
  assert.equal(uk.personalAllowance(110_000), 7_570);
  assert.equal(uk.personalAllowance(125_140), 0);
  assert.equal(uk.personalAllowance(200_000), 0);
  // £110,000: taxable 102,430 -> 37,700@20% + 64,730@40% = 33,432
  close(uk.incomeTax(110_000).tax, 33_432);
});

test('uk: zero and sub-allowance incomes pay nothing', () => {
  assert.equal(uk.incomeTax(0).tax, 0);
  assert.equal(uk.incomeTax(12_570).tax, 0);
});

test('uk: CGT uses 18% in the unused basic band and 24% above', () => {
  const basic = uk.capitalGainsTax(10_000, 30_000);
  assert.equal(basic.chargeable, 7_000);
  close(basic.tax, 1_260);

  const higher = uk.capitalGainsTax(10_000, 60_000);
  close(higher.tax, 7_000 * 0.24);

  // straddling: income 45,000 -> taxable 32,430, basic room 5,270
  const straddle = uk.capitalGainsTax(10_000, 45_000);
  close(straddle.tax, 5_270 * 0.18 + 1_730 * 0.24);
});

test('uk: gains within the £3,000 exempt amount are tax-free', () => {
  assert.equal(uk.capitalGainsTax(2_500, 50_000).tax, 0);
});

test('uk: ISA allowance room and over-contribution', () => {
  assert.equal(uk.isaStatus({ contributedThisYear: 12_000 }).room, 8_000);
  assert.equal(uk.isaStatus({ contributedThisYear: 25_000 }).overContribution, 5_000);
  assert.equal(uk.isaStatus({}).room, 20_000);
});

test('uk: personal savings allowance by band', () => {
  assert.equal(uk.savingsAllowance(30_000), 1_000);
  assert.equal(uk.savingsAllowance(60_000), 500);
  assert.equal(uk.savingsAllowance(200_000), 0);
});

test('uk: dividend tax respects the £500 allowance and band stacking', () => {
  const r = uk.dividendTax(10_000, 30_000);
  // taxable dividends 9,500, all within basic band -> 8.75%
  close(r.tax, 9_500 * 0.0875);
  assert.equal(uk.dividendTax(400, 30_000).tax, 0);
});
