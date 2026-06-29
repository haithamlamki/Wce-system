// ============================================================================
//  Custom symbols — user-drawn additions to the library (Symbol Drawer).
//  Ported from the prototype's drSerialize/mergeCustomSymbols. Custom symbols
//  live on the project (travel with save/load) and are merged into the shared
//  SYM registry so every consumer (palette, canvas, BOP, export) sees them.
// ============================================================================
import { SYM, SYM_ORDER, type DrawShape, type SymbolDef } from './symbols';

const r = (v: number) => Math.round(v * 10) / 10;

/** Serialise drawn primitives into inner SVG markup (no <svg> wrapper). */
export function serializeShapes(shapes: DrawShape[]): string {
  return shapes
    .map((s) => {
      const f = s.fill === 'none' ? 'none' : s.fill;
      if (s.type === 'rect') {
        const x = Math.min(s.x!, s.x! + s.w!), y = Math.min(s.y!, s.y! + s.h!);
        return `<rect x="${r(x)}" y="${r(y)}" width="${r(Math.abs(s.w!))}" height="${r(Math.abs(s.h!))}" fill="${f}" stroke="${s.stroke}" stroke-width="${s.sw}"/>`;
      }
      if (s.type === 'ellipse')
        return `<ellipse cx="${r(s.x! + s.w! / 2)}" cy="${r(s.y! + s.h! / 2)}" rx="${r(Math.abs(s.w! / 2))}" ry="${r(Math.abs(s.h! / 2))}" fill="${f}" stroke="${s.stroke}" stroke-width="${s.sw}"/>`;
      if (s.type === 'line')
        return `<line x1="${r(s.x!)}" y1="${r(s.y!)}" x2="${r(s.x! + s.w!)}" y2="${r(s.y! + s.h!)}" stroke="${s.stroke}" stroke-width="${s.sw}"/>`;
      if (s.type === 'poly')
        return `<polygon points="${(s.points ?? []).map((p) => r(p[0]) + ',' + r(p[1])).join(' ')}" fill="${f}" stroke="${s.stroke}" stroke-width="${s.sw}"/>`;
      return '';
    })
    .join('');
}

/** Register a project's custom symbols into the shared SYM registry. */
export function mergeCustomSymbols(custom: Record<string, SymbolDef> | undefined): void {
  if (!custom) return;
  for (const [k, d] of Object.entries(custom)) {
    SYM[k] = { ...d, custom: true };
    if (!SYM_ORDER.includes(d.cat)) SYM_ORDER.push(d.cat);
  }
}

/** Remove a custom symbol from the shared registry. */
export function unregisterSymbol(key: string): void {
  delete SYM[key];
}

let seq = 0;
/** Deterministic-enough unique key for a new custom symbol. */
export function newCustomKey(existing: Record<string, unknown>): string {
  let k: string;
  do { k = `custom_${(seq++).toString(36)}_${Object.keys(existing).length}`; } while (existing[k] || SYM[k]);
  return k;
}

/** All custom categories currently present (for the drawer's category list). */
export function allCategories(): string[] {
  return [...new Set(Object.values(SYM).map((s) => s.cat))];
}
