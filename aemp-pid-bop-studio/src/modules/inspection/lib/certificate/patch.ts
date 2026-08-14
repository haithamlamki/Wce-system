// ============================================================================
//  The write surface — the only shape extraction will ever hand to a record.
//
//  Kept in its own file so the invariants below are reviewable in one place,
//  independent of however many issuer strategies exist.
// ============================================================================
import type { CertField, ExtractionResult } from './model';
import { valueOf } from './extract';

/**
 * Deliberately narrow: there is no member for `*_due_date` or `approve_status`,
 * so a certificate can never hand the client authority over a calculated due
 * date (migration 0030's trigger owns those) nor move a record through the
 * approval workflow.
 *
 * The certificate's stated expiry is read and shown to the reviewer as a
 * cross-check, and there is deliberately nowhere in this type for it to land.
 * Widening this type is the one change that would break those guarantees,
 * which is why it is stated here rather than left implicit in a component.
 */
export interface CertificatePatch {
  serial_number?: string;
  oem?: string;
  inspection_company?: string;
  part_number?: string;
  manufacture_year?: number;
  major_date?: string | null;
  major_freq_months?: number;
  intermediate_date?: string | null;
  intermediate_freq_months?: number;
}

export type Schedule = 'major' | 'intermediate';

/**
 * Builds the record patch from the fields the user ticked. Pure, so the safety
 * invariants above are testable without rendering anything.
 *
 * Note what drives the schedule dates: the INSPECTION date and a frequency
 * inferred from the gap between inspection and expiry. The expiry itself is
 * never written — the database recomputes the due date from date + frequency.
 */
export function buildRecordPatch(
  result: ExtractionResult,
  picked: ReadonlySet<CertField>,
  schedule: Schedule,
): CertificatePatch {
  const patch: CertificatePatch = {};
  const take = (f: CertField) => (picked.has(f) ? valueOf(result, f) : null);

  const serial = take('serialNumber');
  if (serial) patch.serial_number = serial;

  const oem = take('oem');
  if (oem) patch.oem = oem;

  const company = take('inspectionCompany');
  if (company) patch.inspection_company = company;

  const part = take('partNumber');
  if (part) patch.part_number = part;

  const year = Number(take('manufactureYear'));
  if (Number.isInteger(year) && year > 0) patch.manufacture_year = year;

  const date = take('inspectionDate');
  if (date) {
    const months = result.inferredFrequencyMonths;
    if (schedule === 'major') {
      patch.major_date = date;
      if (months) patch.major_freq_months = months;
    } else {
      patch.intermediate_date = date;
      if (months) patch.intermediate_freq_months = months;
    }
  }

  return patch;
}
