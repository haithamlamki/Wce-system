// ============================================================================
//  Layout import (PRD §7.10, FR-40..43) — CLIENT STUB.
//  Ingests a rig's existing interactive drawing and recovers a layout template
//  (equipment type/tag/x/y + piping polylines). Proven approach: the prototype
//  embeds its geometry as `TEMPLATE` / `PIPES` JS arrays, so we recover them by
//  balanced-bracket extraction + JSON parse (the same method used to bootstrap
//  this app's data). Also accepts a JSON file `{ template, pipes }`.
//  In production this becomes a server pipeline that also handles vector PDF /
//  CAD exports (§10.2); the output contract (TemplateItem[]/PipeSeg[]) is stable.
//  This parses untrusted user-supplied files, so inputs are capped and any
//  JSON-parse failure is normalised into a clean, user-facing Error (F14).
// ============================================================================
import type { PipeSeg, TemplateItem } from '../types';
import { MAX_IMPORT_ROWS } from './importMap';
import { SYM, type SymbolKey } from './symbols';

export { MAX_IMPORT_ROWS };

/** Reject drawing files above this size before any parsing. */
export const MAX_DRAWING_CHARS = 20 * 1024 * 1024; // 20 MB (chars)

const MIN_COORD = -100000;
const MAX_COORD = 100000;
const MIN_ROT = -360;
const MAX_ROT = 360;

/** Clamp a coordinate/rotation to a finite, sane range; non-finite → 0. */
function clamp(n: unknown, min: number, max: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.min(max, Math.max(min, v));
}

export interface ParsedLayout {
  template: TemplateItem[];
  pipes: PipeSeg[];
  source: 'json' | 'embedded-arrays';
}

/** Tag-prefix → symbol-type rules (FR-43). Refine with Abraj sign-off (§16.3). */
const TAG_RULES: Array<[RegExp, SymbolKey]> = [
  [/^(PG|PT)/i, 'gauge'],
  [/^(PM|MP)/i, 'mudpump'],
  [/^(LPR|TPR)/i, 'dram'],
  [/^ISR/i, 'sram'],
  [/^PRV/i, 'relief'],
  [/^ANN/i, 'annular'],
  [/^CM/i, 'gate'],
  [/^(C\d)/i, 'pipe'],
];

/** Map a source element type + tag to a library symbol key. */
export function mapToSymbol(rawType: string | undefined, tag: string | undefined): SymbolKey {
  const t = (rawType || '').toLowerCase();
  if (t && (SYM as Record<string, unknown>)[t]) return t as SymbolKey;
  for (const [re, key] of TAG_RULES) if (re.test(tag || '')) return key;
  return 'gate';
}

/** Balanced-bracket extraction of `const <name> = [ ... ]` from source text. */
function extractArray(text: string, name: string): string | null {
  const at = text.search(new RegExp(`(const|let|var)\\s+${name}\\s*=`));
  if (at < 0) return null;
  const start = text.indexOf('[', at);
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false, quote = '';
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === quote) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = true; quote = ch; }
    else if (ch === '[') depth++;
    else if (ch === ']' && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

type RawTemplateRow = {
  type?: unknown; tag?: unknown; name?: unknown; x?: unknown; y?: unknown; rot?: unknown;
};

function normalize(rawTemplate: unknown[]): TemplateItem[] {
  if (rawTemplate.length > MAX_IMPORT_ROWS) {
    throw new Error(`Drawing has too many items (max ${MAX_IMPORT_ROWS}).`);
  }
  return rawTemplate.map((raw) => {
    const t = (raw ?? {}) as RawTemplateRow;
    return {
      type: mapToSymbol(typeof t.type === 'string' ? t.type : undefined, typeof t.tag === 'string' ? t.tag : undefined),
      tag: typeof t.tag === 'string' ? t.tag : '',
      name: typeof t.name === 'string' ? t.name : '',
      x: clamp(t.x, MIN_COORD, MAX_COORD),
      y: clamp(t.y, MIN_COORD, MAX_COORD),
      rot: clamp(t.rot, MIN_ROT, MAX_ROT),
    };
  });
}

/**
 * Parse a drawing file into a layout. Supports:
 *   - JSON `{ template:[...], pipes:[...] }` (or a saved project with nodes), and
 *   - interactive HTML/JS containing `TEMPLATE` / `PIPES` arrays.
 * @throws if no recognisable geometry is found.
 */
export function parseDrawing(text: string): ParsedLayout {
  if (text.length > MAX_DRAWING_CHARS) throw new Error('Drawing file too large.');

  const trimmed = text.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let json: { template?: unknown; TEMPLATE?: unknown; pipes?: unknown; PIPES?: unknown; project?: { nodes?: unknown; pipes?: unknown }; nodes?: unknown };
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error('Could not parse the drawing — invalid JSON or unrecognised format.');
    }
    const tmpl = json.template ?? json.TEMPLATE ?? (json.project?.nodes ?? json.nodes);
    const pipes = json.pipes ?? json.PIPES ?? json.project?.pipes ?? [];
    if (Array.isArray(tmpl) && tmpl.length) {
      return { template: normalize(tmpl), pipes: pipes as PipeSeg[], source: 'json' };
    }
    throw new Error('JSON has no template/nodes array.');
  }

  const tmplRaw = extractArray(text, 'TEMPLATE');
  const pipesRaw = extractArray(text, 'PIPES');
  if (!tmplRaw) throw new Error('No TEMPLATE array found in the drawing. Expected an interactive HTML drawing or a JSON layout.');

  let rawTemplate: unknown[];
  let rawPipes: unknown[] = [];
  try {
    rawTemplate = JSON.parse(tmplRaw);
    if (pipesRaw) rawPipes = JSON.parse(pipesRaw);
  } catch {
    throw new Error('Could not parse the drawing — invalid JSON or unrecognised format.');
  }

  const template = normalize(rawTemplate);
  const pipes: PipeSeg[] = rawPipes as PipeSeg[];
  return { template, pipes, source: 'embedded-arrays' };
}
