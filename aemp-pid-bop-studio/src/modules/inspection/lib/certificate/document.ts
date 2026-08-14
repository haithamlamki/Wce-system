// ============================================================================
//  Document / page normalisation and the shared label-matching engine.
//
//  Sits between raw PDF text and any issuer rule: pages become line arrays
//  once, and every issuer matches labels through the same index. Issuers supply
//  WHICH labels to look for; they never reimplement HOW to look.
// ============================================================================
import type { CertField, CertificateLine, CertificatePage } from './model';

/** Below this much non-whitespace a page carries no usable text layer. */
const MIN_TEXT_CHARS = 40;

export function pageLooksEmpty(text: string): boolean {
  return text.replace(/\s/g, '').length < MIN_TEXT_CHARS;
}

export function toPage(text: string, pageNumber: number): CertificatePage {
  const lines: CertificateLine[] = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((t, index) => ({ text: t, index }));
  return { pageNumber, lines, text, looksEmpty: pageLooksEmpty(text) };
}

/** One PDF's pages, 1-based, in order. */
export function toDocument(pages: string[]): CertificatePage[] {
  return pages.map((text, i) => toPage(text, i + 1));
}

/** Label synonyms per field, lowercase. */
export type LabelSet = Partial<Record<CertField, string[]>>;

export interface LabelIndexEntry { label: string; field: CertField }

/**
 * Flattens a label set into a longest-first index, so "serial number" is
 * matched before the shorter "serial" and claims those characters first.
 */
export function buildLabelIndex(labels: LabelSet): LabelIndexEntry[] {
  return Object.entries(labels)
    .flatMap(([field, syns]) => (syns ?? []).map((label) => ({
      label: label.toLowerCase(), field: field as CertField,
    })))
    .sort((a, b) => b.label.length - a.label.length);
}

export interface LabelHit { at: number; end: number; field: CertField; label: string }

/**
 * Occurrences of known labels in a line, non-overlapping, left to right.
 *
 * Whole-word only, and a longer label that already claimed those characters
 * wins — without this, "serial" fires inside "serialisation" and inside the
 * longer "serial number" it is part of.
 */
export function labelHits(line: string, index: LabelIndexEntry[]): LabelHit[] {
  const lc = line.toLowerCase();
  const hits: LabelHit[] = [];
  const taken: boolean[] = new Array(line.length).fill(false);

  for (const { label, field } of index) {
    let from = 0;
    for (;;) {
      const at = lc.indexOf(label, from);
      if (at === -1) break;
      from = at + 1;
      const end = at + label.length;
      const before = at === 0 ? '' : line[at - 1];
      const after = line[end] ?? '';
      if (before && /[A-Za-z]/.test(before)) continue;
      if (after && /[A-Za-z]/.test(after)) continue;
      if (taken.slice(at, end).some(Boolean)) continue;
      for (let i = at; i < end; i += 1) taken[i] = true;
      hits.push({ at, end, field, label });
    }
  }
  return hits.sort((a, b) => a.at - b.at);
}
