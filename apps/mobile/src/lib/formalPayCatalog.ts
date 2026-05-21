/**
 * Formal-pay facts — the numbers behind the PF / ESI / income-tax
 * explainer.
 *
 * A worker's first formal payslip is alarming: ₹18,000 agreed, but the
 * slip shows deductions and a smaller "in hand" figure. The explainer
 * screen demystifies it. This file is the single, dated source for
 * every rate it cites — so when the government revises a rate (PF/ESI
 * are stable; income tax shifts with the Union Budget each February),
 * the update is one edit here, not a hunt through the UI.
 *
 * Figures verified for the FY 2026-27 financial year:
 *   - EPF: employee + employer each 12% of basic + DA. (cleartax.in,
 *     epfindia.gov.in, salarybox.in — 2026.)
 *   - ESI: employee 0.75%, employer 3.25% of gross; coverage ceiling
 *     ₹21,000/month gross. (cleartax.in/s/esi-rate, esic — 2026.)
 *   - Income tax, new regime: ₹0 up to ₹4L, then 5/10/15/20/25/30%
 *     bands; the s.87A rebate makes taxable income up to ₹12L pay zero.
 *     Budget 2026 left the FY 2025-26 slabs unchanged for FY 2026-27.
 *     (incometax.gov.in, cleartax.in/s/income-tax-slabs — 2026.)
 */

export interface TaxSlab {
  /** Upper bound of the band, rupees. Null = no upper bound (top band). */
  upTo: number | null;
  /** Marginal rate, percent. */
  pct: number;
}

export const FORMAL_PAY_FACTS = {
  /** Financial year these figures are valid for. Shown to the worker. */
  effectiveFy: '2026-27',

  pf: {
    /** Employee contribution, % of basic + DA. */
    employeePct: 12,
    /** Employer contribution, % of basic + DA. */
    employerPct: 12,
  },

  esi: {
    /** Employee contribution, % of gross wages. */
    employeePct: 0.75,
    /** Employer contribution, % of gross wages. */
    employerPct: 3.25,
    /** Gross monthly wage at/below which ESI applies, rupees. */
    wageCeiling: 21000,
  },

  tax: {
    /** Taxable income at/below which the s.87A rebate zeroes the bill. */
    taxFreeIncome: 1200000,
    /** Standard deduction for salaried taxpayers, rupees. */
    standardDeduction: 75000,
    /** New-regime slabs, ascending. */
    slabs: [
      { upTo: 400000, pct: 0 },
      { upTo: 800000, pct: 5 },
      { upTo: 1200000, pct: 10 },
      { upTo: 1600000, pct: 15 },
      { upTo: 2000000, pct: 20 },
      { upTo: 2400000, pct: 25 },
      { upTo: null, pct: 30 },
    ] as TaxSlab[],
  },

  /**
   * Official government portals, shown as tappable links in the
   * "Claiming what's yours" section. Both are long-standing .gov.in
   * domains. PF is withdrawn via the EPFO member portal (reachable
   * from the EPFO site / the UMANG app); ESI benefits are accessed
   * through ESIC. Verified current for 2026.
   */
  portals: {
    epfo: 'https://www.epfindia.gov.in/',
    esic: 'https://www.esic.gov.in/',
  },

  /** Representative monthly wage used in the worked example. */
  sampleMonthlyWage: 18000,
} as const;

export interface SamplePayslip {
  /** Monthly gross wage. */
  gross: number;
  /** Employee PF deduction. */
  pf: number;
  /** Employee ESI deduction (0 when above the coverage ceiling). */
  esi: number;
  /** Monthly income-tax deduction. */
  tax: number;
  /** Cash in hand after deductions. */
  inHand: number;
  /** Total real value = cash + PF (since PF is the worker's own savings). */
  realValue: number;
}

/**
 * Compute the worked-example payslip for a monthly wage. Pure and
 * exported for unit tests.
 *
 * Simplifications (it's an explainer, not a tax filing): PF is taken at
 * 12% of the whole entered wage — close enough for the example, and the
 * explainer text notes PF is really on basic pay. Income tax is
 * annualised (wage × 12), reduced by the standard deduction, and only
 * charged when taxable income exceeds the s.87A tax-free limit — which,
 * for essentially every blue-collar wage, leaves it at zero.
 */
export function computeSamplePayslip(monthlyWage: number): SamplePayslip {
  const gross = Math.max(0, Math.round(monthlyWage));
  const pf = Math.round((gross * FORMAL_PAY_FACTS.pf.employeePct) / 100);
  const esi =
    gross <= FORMAL_PAY_FACTS.esi.wageCeiling
      ? Math.round((gross * FORMAL_PAY_FACTS.esi.employeePct) / 100)
      : 0;

  const annualTaxable = Math.max(
    0,
    gross * 12 - FORMAL_PAY_FACTS.tax.standardDeduction,
  );
  const annualTax =
    annualTaxable <= FORMAL_PAY_FACTS.tax.taxFreeIncome
      ? 0
      : annualTaxFromSlabs(annualTaxable);
  const tax = Math.round(annualTax / 12);

  const inHand = gross - pf - esi - tax;
  return { gross, pf, esi, tax, inHand, realValue: inHand + pf };
}

/** Sum the slab tax on an annual taxable income. */
function annualTaxFromSlabs(annualTaxable: number): number {
  let tax = 0;
  let lower = 0;
  for (const slab of FORMAL_PAY_FACTS.tax.slabs) {
    const upper = slab.upTo ?? Infinity;
    if (annualTaxable > lower) {
      const inBand = Math.min(annualTaxable, upper) - lower;
      tax += (inBand * slab.pct) / 100;
    }
    lower = upper;
  }
  return tax;
}
