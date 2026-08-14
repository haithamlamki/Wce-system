// ============================================================================
//  Certificate field extraction — public surface.
//
//  Deliberately NOT an AI call and never a network call. The sample
//  certificates carry a real PDF text layer, so label-based extraction is free,
//  offline, deterministic and auditable. Every candidate carries the line it
//  came from, the rule that produced it and the issuer that was in force, so a
//  human can check it before anything is saved. This module never writes.
//
//  The implementation lives in ./certificate as separate layers:
//
//    model.ts        the canonical extraction model
//    normalize.ts    dates, years, value cleaning — issuer-independent
//    document.ts     page/line normalisation and the label-matching engine
//    issuers/        one file per issuer + scored detection
//    extract.ts      sequences the layers
//    patch.ts        the write surface and its safety invariants
//
//  Reference matching (companies, equipment types, units) is deliberately NOT
//  part of this pipeline: extraction produces normalised text, and resolving
//  that text against the database happens afterwards, in the caller.
// ============================================================================
export type {
  CertField, Candidate, Confidence, EvidenceKind, ExtractionResult, InspectedItem,
  IssuerDetection, IssuerId, CertificatePage, CertificateLine,
} from './certificate/model';
export { CONFIDENCE_OF, CONFIDENCE_RANK, UNKNOWN_ISSUER } from './certificate/model';

export {
  parseCertificateDate, parseDate, snapFrequency, monthsBetween,
} from './certificate/normalize';
export type { ParsedDate, DateFormat } from './certificate/normalize';

export { toPage, toDocument, pageLooksEmpty } from './certificate/document';

export { detectIssuer, strategyFor, STRATEGIES } from './certificate/issuers';
export type { IssuerStrategy, IssuerSignal } from './certificate/issuers';

export {
  extractCertificate, extractCertificatePage, extractCertificatePages,
  isScanned, valueOf, candidateOf,
} from './certificate/extract';

export { buildRecordPatch } from './certificate/patch';
export type { CertificatePatch, Schedule } from './certificate/patch';
