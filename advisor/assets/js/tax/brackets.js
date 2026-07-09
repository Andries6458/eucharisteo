/* Shared progressive-bracket machinery for the US/SA/UK tax engines.
   A bracket table is [[upper bound of taxable amount, rate], ...] with the
   last upper bound Infinity. */

export const clampMoney = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/* Tax the amount through the table, returning the total and per-band slices. */
export function bracketTax(taxable, brackets) {
  let tax = 0;
  let lower = 0;
  const bands = [];
  for (const [upper, rate] of brackets) {
    if (taxable <= lower) break;
    const slice = Math.min(taxable, upper) - lower;
    if (slice > 0) {
      tax += slice * rate;
      bands.push({ from: lower, to: Math.min(taxable, upper), rate, tax: slice * rate });
    }
    lower = upper;
  }
  return { tax, bands };
}

/* Rate of the band the last unit of `taxable` falls in. */
export function marginalRate(taxable, brackets) {
  for (const [upper, rate] of brackets) if (taxable <= upper) return rate;
  return brackets[brackets.length - 1][1];
}
