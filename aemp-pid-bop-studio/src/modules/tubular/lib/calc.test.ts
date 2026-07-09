// Excel-parity tests. The named cases are REAL rows from
// "Tubular_Monitoring and data entry.xlsx" (verified cell-by-cell during
// discovery) so the web math provably reconciles with the approved workbook.
import { describe, expect, it } from 'vitest';
import {
  aggregate,
  contractDelta,
  contractuallyLess,
  fleetStatus,
  fleetUtilization,
  needsAttention,
  onBoardTotal,
  overrideVariance,
  parseClipboardBlock,
  parseQuantity,
} from './calc';

const q = (onContract: number, premium: number, class2 = 0, class3 = 0, scrap = 0, needsInspection = 0) =>
  ({ onContract, premium, class2, class3, scrap, needsInspection });

describe('workbook formula parity', () => {
  it('Rig 103 r7 — 4" DP XT39: C=324, P=315 → less = -9 (shortfall)', () => {
    expect(contractuallyLess(q(324, 315), true)).toBe('-9');
    expect(fleetStatus(q(324, 315))).toBe('short');
  });

  it('Rig 103 r32 — 4-3/4" DC: C=20, P=18 → -2; on_board 18', () => {
    expect(contractuallyLess(q(20, 18), true)).toBe('-2');
    expect(onBoardTotal(q(20, 18))).toBe(18);
  });

  it('empty description → blank (O-column IF(B7="",""))', () => {
    expect(contractuallyLess(q(0, 0), false)).toBe('');
  });

  it('serviceable ≥ contract → OK, even with zero stock and zero contract', () => {
    expect(contractuallyLess(q(0, 0), true)).toBe('OK');
    expect(contractuallyLess(q(30, 15, 15), true)).toBe('OK');
    expect(contractuallyLess(q(30, 40), true)).toBe('OK');
  });

  it('Class 3 and Scrap count on-board but NEVER toward the contract', () => {
    // C=100, P=50, C2=10, C3=30, Scrap=10 → onBoard 100 but less = -40
    const row = q(100, 50, 10, 30, 10);
    expect(onBoardTotal(row)).toBe(100);
    expect(contractDelta(row)).toBe(-40);
    expect(contractuallyLess(row, true)).toBe('-40');
    expect(fleetStatus(row)).toBe('short'); // prototype wrongly said balanced
  });

  it('needs inspection never enters any total', () => {
    const row = q(10, 10, 0, 0, 0, 99);
    expect(onBoardTotal(row)).toBe(10);
    expect(contractuallyLess(row, true)).toBe('OK');
  });

  it('dashboard statuses: NO DATA / UNCONTRACTED / MET / SURPLUS', () => {
    expect(fleetStatus(q(0, 0))).toBe('no_data');
    expect(fleetStatus(q(0, 5))).toBe('uncontracted');
    expect(fleetStatus(q(5, 5))).toBe('met');
    expect(fleetStatus(q(5, 9))).toBe('surplus');
  });
});

describe('override variance (the 85 legacy workbook rows)', () => {
  it('Rig 103 r21 — HWDP: classes sum 10, typed D=30 (damaged 20) → variance +20', () => {
    expect(overrideVariance(q(43, 10), 30)).toBe(20);
  });
  it('Rig 109 r29 — DC: classes sum 20, typed D=4 → variance -16', () => {
    expect(overrideVariance(q(0, 20), 4)).toBe(-16);
  });
  it('no override, or override equal to the sum → no variance flag', () => {
    expect(overrideVariance(q(0, 10), null)).toBeNull();
    expect(overrideVariance(q(0, 10), 10)).toBeNull();
  });
});

describe('aggregation and utilization', () => {
  it('fleet aggregate matches the verified workbook baseline shape', () => {
    // miniature fleet: two rows; totals are simple sums, onBoard/serviceable derived
    const t = aggregate([q(324, 315), q(43, 10, 5, 2, 3, 1)]);
    expect(t.onContract).toBe(367);
    expect(t.premium).toBe(325);
    expect(t.onBoard).toBe(335);      // 325+5+2+3
    expect(t.serviceable).toBe(330);  // P+C2 only
    expect(t.rows).toBe(2);
  });

  it('utilization = serviceable/contract; null without contract; scrap cannot inflate it', () => {
    expect(fleetUtilization({ serviceable: 50, onContract: 100 })).toBe(50);
    expect(fleetUtilization({ serviceable: 50, onContract: 0 })).toBeNull();
    const scrapHeavy = aggregate([q(100, 40, 0, 0, 60)]);
    expect(fleetUtilization(scrapHeavy)).toBe(40); // not 100
  });

  it('attention list: short OR scrap OR needs-inspection', () => {
    expect(needsAttention(q(10, 10))).toBe(false);
    expect(needsAttention(q(10, 5))).toBe(true);
    expect(needsAttention(q(0, 5, 0, 0, 1))).toBe(true);
    expect(needsAttention(q(0, 5, 0, 0, 0, 1))).toBe(true);
  });
});

describe('grid input parsing', () => {
  it('parses a pasted Excel block into a matrix, trimming CRLF and tail blank line', () => {
    expect(parseClipboardBlock('1\t2\t3\r\n4\t5\t6\r\n')).toEqual([
      ['1', '2', '3'],
      ['4', '5', '6'],
    ]);
  });

  it('quantities: empty = 0; invalid input is an error, never silently 0', () => {
    expect(parseQuantity('')).toEqual({ ok: true, value: 0 });
    expect(parseQuantity(' 42 ')).toEqual({ ok: true, value: 42 });
    expect(parseQuantity('-5').ok).toBe(false);
    expect(parseQuantity('3.5').ok).toBe(false);
    expect(parseQuantity('abc').ok).toBe(false);
    expect(parseQuantity('1e3').ok).toBe(false);
  });
});
