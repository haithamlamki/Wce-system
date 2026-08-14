// ============================================================================
//  Issuer registry and detection.
//
//  Detection is scored, not first-match. A strong signal (the house's name, its
//  domain, its report-number scheme) is worth three; a weak one (a template
//  heading many houses use) is worth one. A document is claimed only at three
//  or more, so a lone weak token never decides an issuer, and when two
//  strategies both match the higher score wins rather than declaration order.
//
//  Adding an issuer means adding a file and one line here.
// ============================================================================
import type { CertificatePage, Confidence, IssuerDetection, IssuerId } from '../model';
import { UNKNOWN_ISSUER } from '../model';
import { GENERIC_STRATEGY } from './generic';
import { BUREAU_VERITAS } from './bureauVeritas';
import { GAI_TRONICS } from './gaiTronics';
import { CLAIM_THRESHOLD, HIGH_CONFIDENCE_SCORE, SIGNAL_SCORE } from './types';
import type { IssuerStrategy } from './types';

/** Every recognised issuer. `unknown` is the fallback and is not listed here. */
export const STRATEGIES: IssuerStrategy[] = [BUREAU_VERITAS, GAI_TRONICS];

export function strategyFor(id: IssuerId): IssuerStrategy {
  return STRATEGIES.find((s) => s.id === id) ?? GENERIC_STRATEGY;
}

interface Scored {
  strategy: IssuerStrategy;
  score: number;
  evidence: string[];
  strongHits: number;
}

function score(strategy: IssuerStrategy, text: string, page: CertificatePage): Scored {
  let total = 0;
  let strongHits = 0;
  const evidence: string[] = [];
  for (const signal of strategy.signals) {
    if (!signal.test.test(text)) continue;
    total += SIGNAL_SCORE[signal.weight];
    if (signal.weight === 'strong') strongHits += 1;
    // Quote the line that matched, so the reviewer sees why, not just what.
    const line = page.lines.find((l) => signal.test.test(l.text));
    evidence.push(line ? `${signal.name}: “${line.text}”` : signal.name);
  }
  return { strategy, score: total, evidence, strongHits };
}

/**
 * Identifies the issuing house from evidence inside the page.
 *
 * Returns the unknown issuer when nothing reaches the threshold — never a
 * best guess. The caller uses `recognised` to decide whether issuer-specific
 * layout rules may run at all.
 */
export function detectIssuer(page: CertificatePage): IssuerDetection {
  const { text } = page;
  const ranked = STRATEGIES
    .map((s) => score(s, text, page))
    .filter((r) => r.score >= CLAIM_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  const winner = ranked[0];
  if (!winner) return UNKNOWN_ISSUER;

  // A tie on score with no strong evidence either way is not an identification.
  const runnerUp = ranked[1];
  if (runnerUp && runnerUp.score === winner.score && winner.strongHits === 0) {
    return UNKNOWN_ISSUER;
  }

  const confidence: Confidence = winner.score >= HIGH_CONFIDENCE_SCORE ? 'high' : 'medium';
  return {
    id: winner.strategy.id,
    displayName: winner.strategy.displayName,
    confidence,
    evidence: winner.evidence,
    recognised: true,
  };
}

export { GENERIC_LABELS, GENERIC_STRATEGY } from './generic';
export { BUREAU_VERITAS } from './bureauVeritas';
export { GAI_TRONICS } from './gaiTronics';
export type { IssuerStrategy, IssuerSignal } from './types';
