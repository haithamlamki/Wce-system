// ============================================================================
//  Tubular fleet math — pure functions mirroring the AUTHORITATIVE workbook
//  rules (and the generated columns in 0016_tubular_records.sql). The Excel
//  formulas are the source of truth:
//    On Board Total    D = E+F+G+H            (Premium+Class2+Class3+Scrap)
//    Serviceable         = E+F                (Premium+Class2 — NEVER Class 3,
//                                              Scrap or Needs Inspection)
//    Contractually Less O = IF(desc="","",
//                            IF((E+F)-C>=0,"OK",(E+F)-C))
//  The HTML prototype counted Class 3 in compliance/availability; that was a
//  confirmed defect and is corrected here (user decision 2026-07-09).
// ============================================================================

export interface Quantities {
  onContract: number;
  premium: number;
  class2: number;
  class3: number;
  scrap: number;
  needsInspection: number;
}

/** D-column rule. `onBoardOverride` exists only on legacy imported rows. */
export function onBoardTotal(q: Pick<Quantities, 'premium' | 'class2' | 'class3' | 'scrap'>): number {
  return q.premium + q.class2 + q.class3 + q.scrap;
}

/** Contract-ready stock: Premium + Class 2 only. */
export function serviceable(q: Pick<Quantities, 'premium' | 'class2'>): number {
  return q.premium + q.class2;
}

/** (P+C2) − Contract; negative = shortfall. */
export function contractDelta(q: Pick<Quantities, 'premium' | 'class2' | 'onContract'>): number {
  return serviceable(q) - q.onContract;
}

/**
 * The O-column display rule. `hasDescription=false` reproduces the blank cell
 * for rows without a tubular description.
 */
export function contractuallyLess(q: Pick<Quantities, 'premium' | 'class2' | 'onContract'>, hasDescription: boolean): string {
  if (!hasDescription) return '';
  const d = contractDelta(q);
  return d >= 0 ? 'OK' : String(d);
}

export type FleetStatus = 'no_data' | 'uncontracted' | 'short' | 'met' | 'surplus';

export const FLEET_STATUS_LABEL: Record<FleetStatus, string> = {
  no_data: 'NO DATA',
  uncontracted: 'UNCONTRACTED',
  short: '⚠ SHORT',
  met: '✔ MET',
  surplus: '✚ SURPLUS',
};

/**
 * Excel Dashboard J-column status — based on SERVICEABLE stock vs contract
 * (the prototype's onBoard-including-scrap status was a defect).
 */
export function fleetStatus(q: Pick<Quantities, 'premium' | 'class2' | 'onContract'>): FleetStatus {
  const sv = serviceable(q);
  if (q.onContract === 0) return sv === 0 ? 'no_data' : 'uncontracted';
  const d = sv - q.onContract;
  if (d < 0) return 'short';
  if (d === 0) return 'met';
  return 'surplus';
}

/** Reported (imported) totals that disagree with the class sum get flagged. */
export function overrideVariance(
  q: Pick<Quantities, 'premium' | 'class2' | 'class3' | 'scrap'>,
  onBoardOverride: number | null,
): number | null {
  if (onBoardOverride == null) return null;
  const computed = onBoardTotal(q);
  return onBoardOverride === computed ? null : onBoardOverride - computed;
}

export interface AggregateTotals extends Quantities {
  onBoard: number;
  serviceable: number;
  rows: number;
}

/** Sum rows into one totals object (Master/Dashboard aggregation). */
export function aggregate(rows: Quantities[]): AggregateTotals {
  const t: AggregateTotals = {
    onContract: 0, premium: 0, class2: 0, class3: 0, scrap: 0,
    needsInspection: 0, onBoard: 0, serviceable: 0, rows: 0,
  };
  for (const r of rows) {
    t.onContract += r.onContract;
    t.premium += r.premium;
    t.class2 += r.class2;
    t.class3 += r.class3;
    t.scrap += r.scrap;
    t.needsInspection += r.needsInspection;
    t.rows += 1;
  }
  t.onBoard = onBoardTotal(t);
  t.serviceable = serviceable(t);
  return t;
}

/**
 * Fleet utilization KPI = Serviceable / Contract (documented definition; the
 * prototype divided onBoard-including-scrap by contract, which could exceed
 * 100% on scrapped stock). Returns null when there is no contract quantity.
 */
export function fleetUtilization(t: Pick<AggregateTotals, 'serviceable' | 'onContract'>): number | null {
  if (t.onContract <= 0) return null;
  return (t.serviceable / t.onContract) * 100;
}

/** Attention rule from the prototype, kept: short OR scrap OR needs-inspection. */
export function needsAttention(q: Quantities): boolean {
  return fleetStatus(q) === 'short' || q.scrap > 0 || q.needsInspection > 0;
}

/** Parse a pasted Excel/TSV block into a rows×cols matrix of trimmed cells. */
export function parseClipboardBlock(text: string): string[][] {
  const rows = text.replace(/\r\n?/g, '\n').split('\n');
  while (rows.length && rows[rows.length - 1] === '') rows.pop();
  return rows.map((r) => r.split('\t').map((c) => c.trim()));
}

/**
 * Strict non-negative integer parse for grid/paste input. Invalid input is a
 * visible error, NEVER silently coerced to 0 (workbook-import rule applies to
 * manual entry too). Empty string means 0 (an empty Excel cell).
 */
export function parseQuantity(raw: string): { ok: true; value: number } | { ok: false; error: string } {
  const s = raw.trim();
  if (s === '') return { ok: true, value: 0 };
  if (!/^\d+$/.test(s)) return { ok: false, error: `"${raw}" is not a non-negative whole number` };
  const n = Number(s);
  if (!Number.isSafeInteger(n)) return { ok: false, error: `"${raw}" is out of range` };
  return { ok: true, value: n };
}
