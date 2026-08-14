// ============================================================================
//  The orchestrator.
//
//      text  →  page normalisation  →  issuer detection
//            →  issuer labels + layout passes
//            →  generic normalisation  →  confidence  →  result
//
//  Each step is a separate module; this file only sequences them. Database and
//  reference matching stay outside entirely, so extraction is testable with a
//  string and nothing else.
// ============================================================================
import { buildLabelIndex, labelHits, pageLooksEmpty, toPage } from './document';
import type { LabelSet } from './document';
import { detectIssuer, strategyFor } from './issuers';
import { GENERIC_LABELS } from './issuers/generic';
import type { EmitInput, IssuerStrategy } from './issuers/types';
import { CONFIDENCE_OF, CONFIDENCE_RANK, UNKNOWN_ISSUER } from './model';
import type {
  Candidate, CertField, CertificatePage, Confidence, ExtractionResult,
  InspectedItem, IssuerDetection,
} from './model';
import {
  clean, monthsBetween, normaliseValue, snapFrequency, valueIsAmbiguous, valueLooksValid,
} from './normalize';

/** Generic labels plus the issuer's own, minus anything the issuer suppresses. */
function labelsFor(strategy: IssuerStrategy): LabelSet {
  const merged: LabelSet = {};
  const fields = new Set<CertField>([
    ...Object.keys(GENERIC_LABELS), ...Object.keys(strategy.labels ?? {}),
  ] as CertField[]);

  for (const field of fields) {
    const suppressed = new Set((strategy.suppress?.[field] ?? []).map((s) => s.toLowerCase()));
    const all = [...(strategy.labels?.[field] ?? []), ...(GENERIC_LABELS[field] ?? [])]
      .filter((l) => !suppressed.has(l.toLowerCase()));
    if (all.length > 0) merged[field] = all;
  }
  return merged;
}

/** Lowers a confidence to the strategy's ceiling, never raises it. */
function cap(confidence: Confidence, ceiling?: Confidence): Confidence {
  if (!ceiling) return confidence;
  return CONFIDENCE_RANK[confidence] < CONFIDENCE_RANK[ceiling] ? ceiling : confidence;
}

/** Extracts candidate field values from ONE certificate (one PDF page). */
export function extractCertificatePage(page: CertificatePage): ExtractionResult {
  const issuer: IssuerDetection = page.looksEmpty ? UNKNOWN_ISSUER : detectIssuer(page);
  const strategy = strategyFor(issuer.id);
  const index = buildLabelIndex(labelsFor(strategy));

  const found = new Map<CertField, Candidate>();
  const items: InspectedItem[] = [];

  const emit = (input: EmitInput) => {
    const raw = clean(input.raw);
    if (!valueLooksValid(input.field, raw)) return;

    const ambiguous = valueIsAmbiguous(input.field, raw);
    const evidence = ambiguous ? 'ambiguous' : input.evidence;
    const confidence = cap(CONFIDENCE_OF[evidence], strategy.maxConfidence);

    const candidate: Candidate = {
      field: input.field,
      value: normaliseValue(input.field, raw),
      raw,
      confidence,
      source: input.source,
      page: page.pageNumber,
      evidence,
      rule: input.rule,
      issuer: issuer.id,
      ...(ambiguous ? { ambiguous: true } : {}),
    };

    const existing = found.get(candidate.field);
    if (!existing || CONFIDENCE_RANK[candidate.confidence] < CONFIDENCE_RANK[existing.confidence]) {
      found.set(candidate.field, candidate);
    }
  };

  // --- header label/value pairs, several per line -----------------------------
  const skip = strategy.skipLines ?? [];
  for (const line of page.lines) {
    // Column-header rows list headings, not values; reading them yields
    // confident-looking noise. See IssuerStrategy.skipLines.
    if (skip.some((re) => re.test(line.text))) continue;
    const hits = labelHits(line.text, index);

    for (let h = 0; h < hits.length; h += 1) {
      const { end, field, label } = hits[h];
      const stop = hits[h + 1]?.at ?? line.text.length;
      const value = clean(line.text.slice(end, stop));

      if (valueLooksValid(field, value)) {
        emit({ field, raw: value, source: line.text, evidence: 'exact-label', rule: label });
        continue;
      }
      // An empty value means the text wrapped. Only the LAST label on a line
      // can wrap — any earlier label's value is bounded by the label after it —
      // so pairing it with the next line is determinate rather than a guess.
      // The next line must itself carry no label, or it is a new row, not a
      // continuation. This recovers "Date of Inspection ⏎ 14-Apr-25", which the
      // Bureau Veritas template wraps on two-label header rows.
      const isLastHit = h === hits.length - 1;
      if (!value && isLastHit) {
        const next = page.lines[line.index + 1]?.text;
        const nextIsLabelRow = next ? labelHits(next, index).length > 0 : true;
        const cleaned = next && !nextIsLabelRow ? clean(next) : '';
        if (cleaned && valueLooksValid(field, cleaned)) {
          emit({
            field,
            raw: cleaned,
            source: `${line.text} ⏎ ${next}`,
            evidence: 'label-proximity',
            rule: label,
          });
        }
      }
    }
  }

  // --- issuer layout rules ------------------------------------------------------
  for (const pass of strategy.passes ?? []) {
    pass({ page, emit, addItem: (item) => items.push(item) });
  }

  // --- generic fallbacks, only where no labelled value was found ----------------
  if (!found.has('inspectionCompany')) {
    const issuerLine = page.lines.find((l) => (
      /\b(LLC|L\.L\.C|Ltd|Limited|Co\.|Corporation|Inc\.)\b/i.test(l.text)
      && l.text.length < 80
      && !/^(customer|address|phone|email)/i.test(l.text)
    ));
    if (issuerLine) {
      emit({
        field: 'inspectionCompany',
        raw: issuerLine.text,
        source: issuerLine.text,
        evidence: 'generic-fallback',
        rule: 'company-suffix line',
      });
    }
  }

  const candidates = [...found.values()];
  const inspection = found.get('inspectionDate')?.value;
  const due = found.get('nextDueDate')?.value;
  const inferredFrequencyMonths = inspection && due
    ? snapFrequency(monthsBetween(inspection, due))
    : null;

  return {
    candidates,
    items,
    inferredFrequencyMonths,
    looksEmpty: page.looksEmpty,
    issuer,
    page: page.pageNumber,
  };
}

/** Extracts from one certificate's text. Page number defaults to 1. */
export function extractCertificate(text: string, pageNumber = 1): ExtractionResult {
  return extractCertificatePage(toPage(text, pageNumber));
}

/**
 * One PDF page is one certificate in these documents, so a multi-page file
 * yields one result per page. Pages with no usable text are dropped.
 */
export function extractCertificatePages(pages: string[]): ExtractionResult[] {
  return pages
    .map((text, i) => extractCertificate(text, i + 1))
    .filter((r) => !r.looksEmpty);
}

/**
 * True when no page carried usable text — the file is a scan or photograph, so
 * the fields cannot be read without OCR. Lives here rather than beside the
 * pdf.js reader so it stays testable without the browser PDF runtime.
 */
export function isScanned(pages: string[]): boolean {
  return pages.every(pageLooksEmpty);
}

/** Convenience lookup for callers prefilling a form. */
export function valueOf(result: ExtractionResult, field: CertField): string | null {
  return result.candidates.find((c) => c.field === field)?.value ?? null;
}

/** The full candidate, when the caller needs its evidence rather than its value. */
export function candidateOf(result: ExtractionResult, field: CertField): Candidate | null {
  return result.candidates.find((c) => c.field === field) ?? null;
}
