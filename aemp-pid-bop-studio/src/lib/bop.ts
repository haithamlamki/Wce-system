// ============================================================================
//  BOP stack-up elevation  (PRD §7.8, FR-31..35)
//  Per-symbol nominal heights + auto-build-by-hole-section, ported from the
//  prototype. Real serials/dates are grafted from the AEMP register by tag.
// ============================================================================
import type { AempAsset, BopItem, BopScheme } from '../types';
import { SYM, type SymbolKey } from './symbols';
import { nextBopSeqSeed } from './idSeq';

/** Nominal component heights (metres) used to draw the stack to scale.
 *  A symbol's own `bopHeight` (symbols.ts) wins where present; this is fallback. */
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

/** Reseed the `b<n>` id counter (F8) so rebuilding the stack after a project
 *  load/restore can't collide with `b`-ids already present in that project's
 *  BOP scheme. Never lowers the counter — call before `buildBopStack`. */
export function seedBopSeq(items: BopItem[] | null | undefined): void {
  bopSeq = nextBopSeqSeed(items, bopSeq);
}

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

  // Side outlet valves off the stack (FR — choke & kill manifold valves).
  const sides: Array<[SymbolKey, string, string, 'choke' | 'kill', number]> = [
    ['gate', 'CK-MGV', 'Choke manual gate valve', 'choke', 0],
    ['hcr', 'CK-HCR', 'Choke hydraulic (HCR) valve', 'choke', 1],
    ['choke', 'CK-ADJ', 'Adjustable choke', 'choke', 2],
    ['gate', 'KL-MGV', 'Kill line manual gate valve', 'kill', 0],
    ['hcr', 'KL-HCR', 'Hydraulic kill valve (HCR)', 'kill', 1],
    ['check', 'KL-NRV', 'Hydraulic kill valve NRV (check)', 'kill', 2],
  ];

  const byTag: Record<string, AempAsset> = {};
  for (const it of register) if (it.tag) byTag[it.tag] = it;
  const graft = (tag: string) => byTag[tag] ?? ({} as Partial<AempAsset>);

  const main: BopItem[] = seq.map(([type, tag, description]) => {
    const ref = graft(tag);
    return {
      id: 'b' + bopSeq++, type, tag, description,
      height: SYM[type]?.bopHeight ?? BOPH[type] ?? 0.5,
      serial: ref.serial ?? '', int_due: ref.int_due ?? '', maj_due: ref.maj_due ?? '',
    };
  });

  const side: BopItem[] = sides.map(([type, tag, description, sd, order]) => {
    const ref = graft(tag);
    return {
      id: 'b' + bopSeq++, type, tag, description,
      height: BOPH[type] ?? 0.4, side: sd, branchOrder: order,
      serial: ref.serial ?? '', int_due: ref.int_due ?? '', maj_due: ref.maj_due ?? '',
    };
  });

  return [...main, ...side];
}

/** Total stack height and top-of-stack / clearance-to-RT (FR-34).
 *  Side-branch valves don't add to the vertical height. */
export function stackMetrics(scheme: BopScheme) {
  const total = scheme.items.filter((it) => !it.side).reduce((sum, it) => sum + it.height, 0);
  const topOfStack = scheme.datum + total;
  const clearanceToRT = scheme.rt - topOfStack;
  return { total, topOfStack, clearanceToRT };
}
