// ============================================================================
//  The canonical extraction model.
//
//  Every issuer strategy normalises into these types, so the review UI and the
//  write surface never see issuer-specific shapes. Nothing here reaches the
//  database: reference matching (companies, equipment types, units) happens
//  after extraction, against the normalised text, so the parser stays testable
//  with no database at all.
// ============================================================================

export type CertField =
  | 'serialNumber' | 'certificateNumber' | 'oem' | 'inspectionCompany'
  | 'equipmentDescription' | 'partNumber' | 'unit' | 'customer'
  | 'inspectionDate' | 'nextDueDate' | 'inspectionType'
  | 'workingPressure' | 'testPressure' | 'manufactureYear';

export type Confidence = 'high' | 'medium' | 'low';

/**
 * How a value was found. Confidence is derived from this rather than from "a
 * regex matched", so a loosely-related token can never present as certainty.
 *
 *  exact-label      a known label matched on the line, value read beside it
 *  structured-table a row of a table this issuer's layout defines
 *  label-proximity  the label stood alone; the value came from the next line
 *  generic-fallback a heuristic with no label behind it at all
 *  ambiguous        matched, but the value admits more than one reading
 */
export type EvidenceKind =
  | 'exact-label' | 'structured-table' | 'label-proximity'
  | 'generic-fallback' | 'ambiguous';

/** Confidence implied by each evidence class, before any issuer cap. */
export const CONFIDENCE_OF: Record<EvidenceKind, Confidence> = {
  'exact-label': 'high',
  'structured-table': 'high',
  'label-proximity': 'medium',
  'generic-fallback': 'low',
  ambiguous: 'low',
};

export const CONFIDENCE_RANK: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };

export type IssuerId = 'bureau-veritas' | 'gai-tronics' | 'unknown';

export interface Candidate {
  field: CertField;
  /** Normalised value — ISO dates, four-digit years, trimmed text. */
  value: string;
  /** Exactly as printed, before normalisation. Never discarded. */
  raw: string;
  confidence: Confidence;
  /** The line the value was read from, shown to the user for verification. */
  source: string;
  /** 1-based page this came from. */
  page: number;
  evidence: EvidenceKind;
  /** The label or named rule that produced it, for auditing a wrong value. */
  rule: string;
  /** Which issuer strategy was in force. */
  issuer: IssuerId;
  /**
   * The value admits more than one reading — an all-numeric date whose first
   * two parts are both <= 12, say. Such values stay suggestions and are shown
   * to the reviewer alongside the raw text.
   */
  ambiguous?: boolean;
}

/** A row of an inspected-items table — the equipment actually tested. */
export interface InspectedItem {
  serial: string;
  description: string;
  raw: string;
}

export interface IssuerDetection {
  id: IssuerId;
  displayName: string;
  confidence: Confidence;
  /** The lines that identified the issuer, quoted for the reviewer. */
  evidence: string[];
  /** False for `unknown`: no strategy claimed the document. */
  recognised: boolean;
}

export interface CertificateLine {
  text: string;
  /** Position within the page, so a rule can look at neighbouring lines. */
  index: number;
}

export interface CertificatePage {
  /** 1-based. */
  pageNumber: number;
  lines: CertificateLine[];
  text: string;
  /** Too little text to be a real text layer — a scan, or a blank page. */
  looksEmpty: boolean;
}

export interface ExtractionResult {
  candidates: Candidate[];
  items: InspectedItem[];
  /** Months between inspection and next-due, snapped to an allowed frequency. */
  inferredFrequencyMonths: number | null;
  /** True when the text is too sparse to be a real certificate text layer. */
  looksEmpty: boolean;
  issuer: IssuerDetection;
  /** 1-based page this certificate came from. */
  page: number;
}

export const UNKNOWN_ISSUER: IssuerDetection = {
  id: 'unknown',
  displayName: 'Unrecognised issuer',
  confidence: 'low',
  evidence: [],
  recognised: false,
};
