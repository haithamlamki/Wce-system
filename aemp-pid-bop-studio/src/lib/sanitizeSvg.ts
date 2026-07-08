// ============================================================================
//  SVG / colour sanitization (Finding F1: stored XSS).
//  User-authored or imported symbol artwork (SymbolDef.svg) and its identity
//  colour are stored as raw strings and rendered via dangerouslySetInnerHTML /
//  inline style in many places. Without sanitization a malicious symbol
//  (<script>, on*= handlers, <a>/<image> with a javascript: URI) executes for
//  every user who views it. Run sanitizeSvg/safeColor on BOTH ingest (where a
//  SymbolDef.svg is produced/loaded) and render (SvgMarkup) so neither path can
//  be skipped.
// ============================================================================
import DOMPurify from 'dompurify';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Sanitize inner-SVG markup (no outer <svg> wrapper) for safe DOM insertion.
 *
 * The stored value is a fragment (`<rect .../><circle .../>`, no `<svg>`), but
 * DOMPurify's `svg` profile only recognises tags like `<rect>`/`<path>` as SVG
 * elements — and keeps them — when they're parsed inside an `<svg>` ancestor;
 * otherwise it treats the fragment as plain HTML and drops everything. So we
 * wrap the fragment in a throwaway `<svg>`, ask DOMPurify to return a DOM
 * fragment (not a string), and read back only that wrapper's children — any
 * markup an attacker manages to break out of the wrapper (e.g. via a literal
 * `</svg>` in the payload) is discarded here rather than leaking into the
 * returned string. Dangerous content (`<script>`, `on*=`, `javascript:` URIs)
 * is stripped by DOMPurify's core sanitizer regardless of this wrapping, since
 * that layer isn't namespace- or profile-gated.
 */
export function sanitizeSvg(svg: string | undefined | null): string {
  if (!svg) return '';
  const wrapped = `<svg xmlns="${SVG_NS}">${svg}</svg>`;
  const clean = DOMPurify.sanitize(wrapped, {
    USE_PROFILES: { svg: true, svgFilters: true },
    RETURN_DOM_FRAGMENT: true,
  });
  const wrapper = clean.querySelector('svg');
  return wrapper ? wrapper.innerHTML : '';
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_COLOR = /^rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(?:,\s*[\d.]+%?\s*)?\)$/i;
const CSS_VAR = /^var\(--[a-z0-9-]+\)$/i;
/** Named literals used throughout the app's own symbol/shape colour values. */
const NAMED_COLORS = new Set(['none', 'currentcolor', 'transparent']);

/** Return `c` unchanged if it matches an allow-listed colour form; otherwise a safe fallback. */
export function safeColor(c: string | undefined): string {
  if (!c) return 'currentColor';
  const v = c.trim();
  if (HEX_COLOR.test(v) || RGB_COLOR.test(v) || CSS_VAR.test(v) || NAMED_COLORS.has(v.toLowerCase())) return v;
  return 'currentColor';
}
