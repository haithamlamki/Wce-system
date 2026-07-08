// ============================================================================
//  SvgMarkup — the ONE place a stored SymbolDef.svg string is turned into DOM.
//  Every render-side sink (palette, canvas, BOP scheme, properties/tooltip
//  previews, symbol library cards) must go through this instead of a raw
//  dangerouslySetInnerHTML, so a malicious symbol can never execute (F1).
//  Ingest-side sinks (symbolStore, customSymbols) sanitize independently —
//  see src/lib/sanitizeSvg.ts.
// ============================================================================
import { sanitizeSvg } from '../lib/sanitizeSvg';

/** Renders sanitized inner-SVG markup inside a <g>, forwarding all other SVG props. */
export default function SvgMarkup({ svg, ...rest }: React.SVGProps<SVGGElement> & { svg: string }) {
  return <g {...rest} dangerouslySetInnerHTML={{ __html: sanitizeSvg(svg) }} />;
}
