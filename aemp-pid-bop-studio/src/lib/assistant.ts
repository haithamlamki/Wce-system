// ============================================================================
//  AI assistant — diagram drafting (PRD §7.12, FR-47).
//  PREVIEW: a deterministic natural-language planner (the prototype's
//  "deterministic BOP fallback"). In production (FR-48) this is replaced by a
//  call to AEMP's own model; the action contract below stays the same.
// ============================================================================
import { SYM, type SymbolKey } from './symbols';
import type { HoleSection } from './bop';

export type AssistantAction =
  | { kind: 'master' }
  | { kind: 'import' }
  | { kind: 'bop'; section: HoleSection; rwp: string }
  | { kind: 'place'; type: SymbolKey; count: number }
  | { kind: 'clear' }
  | { kind: 'none' };

export interface Plan {
  reply: string;
  action: AssistantAction;
}

const SECTION_WORDS: Array<[RegExp, HoleSection]> = [
  [/\b26\b|surface/, '26'],
  [/\b17|intermediate\b/, '17.5'],
  [/\b12|production\b/, '12.25'],
  [/\b8\.?5?\b|reservoir/, '8.5'],
];

function numberWord(text: string): number {
  const m = text.match(/\b(\d{1,2})\b/);
  if (m) return Math.min(12, Math.max(1, +m[1]));
  if (/\b(a|an|one)\b/.test(text)) return 1;
  if (/\bcouple|two\b/.test(text)) return 2;
  if (/\bfew|three\b/.test(text)) return 3;
  return 1;
}

/** Find a symbol whose name best matches free text (longest name hit wins). */
function matchSymbol(text: string): SymbolKey | null {
  let best: SymbolKey | null = null;
  let bestLen = 0;
  for (const [key, s] of Object.entries(SYM)) {
    const words = s.name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
    for (const w of words) {
      if (text.includes(w) && w.length > bestLen) { best = key as SymbolKey; bestLen = w.length; }
    }
    if (text.includes(key) && key.length > bestLen) { best = key as SymbolKey; bestLen = key.length; }
  }
  return best;
}

/** Interpret a natural-language command into a deterministic plan. */
export function interpret(input: string): Plan {
  const t = input.toLowerCase().trim();
  if (!t) return { reply: 'Tell me what to draw — e.g. “build a 10k BOP stack with kill & choke”.', action: { kind: 'none' } };

  if (/\b(clear|reset|empty|wipe)\b/.test(t))
    return { reply: 'Cleared the canvas.', action: { kind: 'clear' } };

  if (/\b(import|aemp|equipment list|register)\b/.test(t))
    return { reply: 'Importing the rig equipment from AEMP (offline cache).', action: { kind: 'import' } };

  if (/\b(bop|stack|preventer|blowout)\b/.test(t)) {
    let section: HoleSection = '12.25';
    for (const [re, s] of SECTION_WORDS) if (re.test(t)) { section = s; break; }
    const rwp = /15\s*k|15000/.test(t) ? '15000' : /5\s*k|5000/.test(t) ? '5000' : '10000';
    const extras = [/kill/.test(t) && 'kill', /choke/.test(t) && 'choke'].filter(Boolean).join(' & ');
    return {
      reply: `Built a ${rwp.replace('000', 'k')} BOP stack (${section}″ section)${extras ? ` with ${extras} detail` : ''}.`,
      action: { kind: 'bop', section, rwp },
    };
  }

  if (/\b(master|full p ?& ?id|whole diagram|everything|layout)\b/.test(t))
    return { reply: 'Laid out the full Rig 305 master P&ID with piping.', action: { kind: 'master' } };

  if (/\b(add|place|insert|draw|put)\b/.test(t)) {
    const sym = matchSymbol(t);
    if (sym) {
      const count = numberWord(t);
      return { reply: `Placed ${count} × ${SYM[sym].name}.`, action: { kind: 'place', type: sym, count } };
    }
    return { reply: 'I couldn’t match that to a symbol. Try a name like “annular”, “gate valve” or “mud pump”.', action: { kind: 'none' } };
  }

  return {
    reply: 'I can: build the master P&ID, import from AEMP, build a BOP stack (e.g. “10k BOP with kill & choke”), add symbols (“add 3 gate valves”), or clear the canvas.',
    action: { kind: 'none' },
  };
}

/** A few example prompts surfaced in the UI. */
export const ASSISTANT_SAMPLES = [
  'Build the full master P&ID',
  'Build a 10k BOP stack with kill & choke',
  'Import equipment from AEMP',
  'Add 3 gate valves',
];
