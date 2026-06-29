// ============================================================================
//  BOP stack-up elevation  (PRD §7.8, FR-31..35)
//  Per-symbol nominal heights + auto-build-by-hole-section, ported from the
//  prototype. Real serials/dates are grafted from the AEMP register by tag.
// ============================================================================
import type { AempAsset, BopItem, BopScheme } from '../types';
import type { SymbolKey } from './symbols';

/** Nominal component heights (metres) used to draw the stack to scale. */
export const BOPH: Partial<Record<SymbolKey, number>> = {
  wellhead: 0.8,
  annular: 1.5,
  dram: 1.8,
  sram: 1.0,
  cross: 0.6,
  pipe: 0.5,
  hcr: 0.4,
  gate: 0.4,
  check: 0.35,
  choke: 0.5,
};

export type HoleSection = '26' | '17.5' | '12.25' | '8.5';

export const SECTION_NAMES: Record<HoleSection, string> = {
  '26': '26″ surface',
  '17.5': '17½″ intermediate',
  '12.25': '12¼″ production',
  '8.5': '8½″ reservoir',
};

const M_PER_FT = 0.3048;
export const toFeet = (m: number) => m / M_PER_FT;
export const toMetres = (ft: number) => ft * M_PER_FT;

let bopSeq = 1;

/**
 * Auto-build a BOP stack for a hole section (FR-33). Production / reservoir
 * sections add a shear ram. Serials & due dates are pulled from the AEMP
 * register where a tag matches (FR-35).
 */
export function buildBopStack(section: HoleSection, register: AempAsset[] = []): BopItem[] {
  const full = section === '12.25' || section === '8.5';
  const seq: Array<[SymbolKey, string, string]> = [
    ['wellhead', 'WH', 'Wellhead'],
    ['cross', 'B4', 'Mud Cross / Drilling Spool'],
  ];
  if (full) seq.push(['sram', 'B3', 'Single / Shear Ram']);
  seq.push(['dram', 'B2', 'Double Ram Preventer'], ['annular', 'B1', 'Annular Preventer']);

  const byTag: Record<string, AempAsset> = {};
  for (const it of register) if (it.tag) byTag[it.tag] = it;

  return seq.map(([type, tag, description]) => {
    const ref = byTag[tag] ?? ({} as Partial<AempAsset>);
    return {
      id: 'b' + bopSeq++,
      type,
      tag,
      description,
      height: BOPH[type] ?? 0.5,
      serial: ref.serial ?? '',
      int_due: ref.int_due ?? '',
      maj_due: ref.maj_due ?? '',
    };
  });
}

/** Total stack height and top-of-stack / clearance-to-RT (FR-34). */
export function stackMetrics(scheme: BopScheme) {
  const total = scheme.items.reduce((sum, it) => sum + it.height, 0);
  const topOfStack = scheme.datum + total;
  const clearanceToRT = scheme.rt - topOfStack;
  return { total, topOfStack, clearanceToRT };
}
