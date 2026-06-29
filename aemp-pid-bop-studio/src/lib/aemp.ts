// ============================================================================
//  AEMP equipment integration  (PRD §7.9 / §10.1, FR-36..39)
//  --------------------------------------------------------------------------
//  Reads a rig's equipment list from AEMP (system-of-record) and links it to
//  placed symbols by tag. The live endpoint is still a STUB pending the AEMP
//  API contract (PRD §16.1) — until then we fall back to an embedded offline
//  cache (the Rig 303 dataset).
// ============================================================================
import type { AempAsset, Component, PipeSeg, TemplateItem } from '../types';
import { RIG303_EQUIPMENT } from './data/rig303-equipment';
import { RIG305_TEMPLATE, RIG305_PIPES } from './data/rig305-layout';
import { SYM, type SymbolKey } from './symbols';
import { relaxOverlaps } from './relaxLayout';
import { fetchEquipmentCloud, isSupabaseConfigured } from './cloud';

export interface AempConfig {
  /** Equipment endpoint, e.g. https://einspection.abrajenergy.com/api/equipment */
  endpoint?: string;
  /** Bearer token / SSO session — supplied by the host AEMP app (FR-39). */
  token?: string;
  /** Optional rig filter for the Supabase equipment table. */
  rig?: string;
}

export type ImportSource = 'live' | 'supabase' | 'cache';
export interface ImportResult {
  assets: AempAsset[];
  source: ImportSource;
  /** Back-compat: true when not the embedded cache. */
  live: boolean;
}

/**
 * Fetch the rig's equipment, in priority order:
 *   1. an explicit live AEMP endpoint (FR-36, still stubbed — see §16.1),
 *   2. the Supabase `equipment` register (Phase-1 backend),
 *   3. the embedded Rig 303 offline cache.
 */
export async function importFromAEMP(config: AempConfig = {}): Promise<ImportResult> {
  if (config.endpoint) {
    try {
      const res = await fetch(config.endpoint, {
        headers: {
          Accept: 'application/json',
          ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
        },
      });
      if (res.ok) {
        const data = (await res.json()) as AempAsset[];
        if (Array.isArray(data) && data.length) return { assets: data, source: 'live', live: true };
      }
    } catch {
      /* fall through */
    }
  }
  if (isSupabaseConfigured) {
    try {
      const rows = await fetchEquipmentCloud(config.rig);
      if (rows.length) return { assets: rows, source: 'supabase', live: true };
    } catch {
      /* fall through */
    }
  }
  return { assets: RIG303_EQUIPMENT, source: 'cache', live: false };
}

/** Map a source tag prefix to a symbol type where the type is unknown (PRD §9 mapping table). */
export function sectionForTag(tag: string): string {
  const t = (tag || '').toUpperCase();
  if (/^(PG|PT)/.test(t)) return 'Instruments';
  if (/^(PM|MP)/.test(t)) return 'Mud Pumps';
  if (/^C\d/.test(t)) return 'Cement Lines';
  if (/^(PRV|ISR|LPR|TPR|B)/.test(t)) return 'Well Control';
  if (/^(V|L|H|J|DPD|P)/.test(t)) return 'Well Control';
  return 'Mud System';
}

/**
 * Build the full master P&ID for a rig from its layout template, grafting in
 * AEMP inspection data by tag (FR-8/37). Returns the placed component nodes;
 * piping comes from RIG305_PIPES.
 */
export function buildMaster(
  template: TemplateItem[] = RIG305_TEMPLATE,
  register: AempAsset[] = RIG303_EQUIPMENT,
): { nodes: Component[]; pipes: PipeSeg[] } {
  const byTag: Record<string, AempAsset> = {};
  for (const it of register) if (it.tag) byTag[it.tag] = it;

  let nid = 1;
  const nodes: Component[] = template.map((t) => {
    const tp = (SYM[t.type as SymbolKey] ? t.type : 'gate') as SymbolKey;
    const s = SYM[tp];
    const ref = (t.tag && byTag[t.tag]) || ({} as Partial<AempAsset>);
    return {
      id: 'n' + nid++,
      type: tp,
      x: Math.round((t.x - s.w / 2) / 2) * 2,
      y: Math.round((t.y - s.h / 2) / 2) * 2,
      rot: 0,
      scale: 1,
      flip: false,
      tag: t.tag || '',
      description: t.name || s.name,
      section: ref.section || (t.name ? 'Mud System' : sectionForTag(t.tag)),
      rwp: ref.rwp || '',
      size: ref.size || '',
      manufacturer: ref.manufacturer || '',
      serial: ref.serial || '',
      int_last: ref.int_last || '',
      int_due: ref.int_due || '',
      maj_last: ref.maj_last || '',
      maj_due: ref.maj_due || '',
      removed: false,
      installed: true,
    };
  });

  // Shrink/relax symbols that collide in dense manifolds so the illustrated
  // glyphs fit the source spacing without moving equipment off its piping.
  return { nodes: relaxOverlaps(nodes), pipes: RIG305_PIPES };
}
