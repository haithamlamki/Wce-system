// ============================================================================
//  The issuer strategy contract.
//
//  A strategy owns only what is genuinely issuer-specific: the signals that
//  identify the document, the label spellings that house uses, and any layout
//  rule (a table, a footer) that generic labelling cannot express. Everything
//  else — line splitting, label matching, value normalisation, confidence,
//  deduplication — is shared, so adding an issuer is a small file rather than
//  another copy of the parser.
// ============================================================================
import type { LabelSet } from '../document';
import type {
  CertField, CertificatePage, Confidence, EvidenceKind, InspectedItem, IssuerId,
} from '../model';

/**
 * One piece of evidence that a document came from a given issuer.
 *
 * `strong` means the marker is specific to that house — its name, its domain,
 * its report-number scheme. `weak` means it merely corroborates: a template
 * heading like "MAGNETIC PARTICLE INSPECTION REPORT" is used by many houses.
 * A weak signal alone never claims a document.
 */
export interface IssuerSignal {
  /** Shown to the reviewer as the reason the issuer was chosen. */
  name: string;
  test: RegExp;
  weight: 'strong' | 'weak';
}

export const SIGNAL_SCORE: Record<IssuerSignal['weight'], number> = { strong: 3, weak: 1 };

/** Minimum score to claim a document — one strong signal, or three weak ones. */
export const CLAIM_THRESHOLD = 3;

/** At or above this score the detection is reported as high confidence. */
export const HIGH_CONFIDENCE_SCORE = 6;

export interface EmitInput {
  field: CertField;
  /** The value exactly as printed; the orchestrator normalises it. */
  raw: string;
  /** The line it was read from, shown to the reviewer. */
  source: string;
  evidence: EvidenceKind;
  /** The label or named rule responsible, for auditing a wrong value. */
  rule: string;
}

export interface PassContext {
  page: CertificatePage;
  /** Records a candidate. Normalisation, capping and dedup happen upstream. */
  emit: (c: EmitInput) => void;
  /** Records a row of the inspected-items table. */
  addItem: (item: InspectedItem) => void;
}

/** A layout rule generic labelling cannot express — a table, a footer block. */
export type ExtractionPass = (ctx: PassContext) => void;

export interface IssuerStrategy {
  id: IssuerId;
  /** Human-facing name. The UI keys off `id`, never off this string. */
  displayName: string;
  signals: IssuerSignal[];
  /** Label spellings specific to this house, merged over the generic set. */
  labels?: LabelSet;
  /**
   * Generic labels this issuer must NOT use, when its layout would make them
   * misleading. Removing a label is safer than adding a competing one.
   */
  suppress?: Partial<Record<CertField, string[]>>;
  /**
   * Lines the label engine must not read at all.
   *
   * A table's column-header row is the case that matters: "Serial Number
   * Description Make Size Result" is a list of headings, not label/value pairs,
   * and reading it produces a confident-looking value ("Make" → "Size Result")
   * that is pure noise. Skipping the row is safer than weakening the labels,
   * which would cost real matches elsewhere on the page.
   */
  skipLines?: RegExp[];
  passes?: ExtractionPass[];
  /**
   * Ceiling on the confidence any candidate may carry under this strategy.
   * The unknown issuer uses it so an unverified document cannot present a
   * value as certain.
   */
  maxConfidence?: Confidence;
}
