// ============================================================================
//  Issuer-aware parsing: detection, per-issuer layout, and the unknown path.
//
//  The existing certificateExtract.test.ts pins the Bureau Veritas *values* and
//  is deliberately unchanged by the refactor — it is the proof that meaning was
//  preserved. This file covers what the refactor added: which issuer was
//  identified and why, what an unrecognised document is allowed to produce, and
//  the evidence carried alongside every value.
// ============================================================================
import { describe, expect, it } from 'vitest';
import {
  buildRecordPatch, candidateOf, detectIssuer, extractCertificate,
  extractCertificatePages, toPage, valueOf,
} from '../certificateExtract';
import type { CertField } from '../certificateExtract';

/** Trimmed from the real Bureau Veritas MPI text layer. */
const BV = `
MAGNETIC PARTICLE INSPECTION REPORT
Report Number BV.OMA.IVS.MPT.31531-IR-022 Date of Inspection 09-Jul-25
Customer Name ABRAJ ENERGY SERVICES S.A.O.C. Date of Expiry 08-Jul-26
Rig/Hoist Number ABRAJ 305 Inspection Type ANNUAL
INSPECTED ITEMS DETAILS
Serial Number Description Make Size Result
AN-8600010 DRILL PIPE STORAGE BIN -- Satisfactory
Bureau Veritas Middle East Co. LLC
Phone : +968 24968000 / Email : ivs.oman@ae.bureauveritas.com
`;

/** Trimmed from the real GAI-Tronics certificate of conformance. */
const GAI = `
Certificate of Conformance
Customer Name: National Oilwell Varco LP
Project Name: Abraj Energy / Rigs 106 & 107
GAI-Tronics Job No.:
117320631 & 117291858
Certification is hereby given that the items contracted for have been functionally tested.
3030 Kutztown Road, Reading, PA 19605 USA
`;

describe('issuer detection', () => {
  it('identifies Bureau Veritas from name, report scheme and domain', () => {
    const d = detectIssuer(toPage(BV, 1));
    expect(d.id).toBe('bureau-veritas');
    expect(d.recognised).toBe(true);
    expect(d.confidence).toBe('high');
    expect(d.evidence.join(' ')).toMatch(/Bureau Veritas name/);
  });

  it('identifies GAI-Tronics from its name and conformance wording', () => {
    const d = detectIssuer(toPage(GAI, 1));
    expect(d.id).toBe('gai-tronics');
    expect(d.recognised).toBe(true);
  });

  it('quotes the line that identified the issuer, not just the rule name', () => {
    const d = detectIssuer(toPage(BV, 1));
    expect(d.evidence.some((e) => e.includes('Bureau Veritas Middle East Co. LLC'))).toBe(true);
  });

  it('refuses to identify an issuer from a single weak token', () => {
    // The template heading alone is used by many houses; without a house name,
    // a report-number scheme or a domain there is nothing to identify.
    const d = detectIssuer(toPage(
      'MAGNETIC PARTICLE INSPECTION REPORT\nSerial Number AB-1\nDescription VALVE BODY\n', 1,
    ));
    expect(d.id).toBe('unknown');
    expect(d.recognised).toBe(false);
  });

  it('treats a page with no text layer as unrecognised', () => {
    expect(detectIssuer(toPage('   ', 1)).recognised).toBe(false);
  });
});

describe('unknown issuer — fails safe', () => {
  const unknown = extractCertificate(
    'Date of Test: 01-Dec-2022\nSerial No: XY-99\nSome unremarkable certificate body text.\n',
  );

  it('is reported as unrecognised so the UI can warn', () => {
    expect(unknown.issuer.recognised).toBe(false);
    expect(unknown.issuer.id).toBe('unknown');
  });

  it('still reads genuinely issuer-independent labels', () => {
    expect(valueOf(unknown, 'inspectionDate')).toBe('2022-12-01');
    expect(valueOf(unknown, 'serialNumber')).toBe('XY-99');
  });

  it('never presents an unverified value as high confidence', () => {
    for (const c of unknown.candidates) expect(c.confidence).not.toBe('high');
  });

  it("does not apply another issuer's layout rules", () => {
    // The Bureau Veritas items table must not be read on a document that is
    // not a Bureau Veritas document, however similar the heading looks.
    const r = extractCertificate(
      'SOME OTHER HOUSE REPORT\nINSPECTED ITEMS DETAILS\n'
      + 'Serial Number Description Make Size Result\n'
      + 'AN-8600010 DRILL PIPE STORAGE BIN -- Satisfactory\n',
    );
    expect(r.issuer.recognised).toBe(false);
    expect(r.items).toHaveLength(0);
    expect(valueOf(r, 'equipmentDescription')).toBeNull();
  });

  it('leaves a rig unread when only an issuer-specific spelling is present', () => {
    // "Rig /Unit" is Bureau Veritas's spelling and lives in that strategy.
    const r = extractCertificate('Rig /Unit RIG 304\nA certificate from an unknown house.\n');
    expect(r.issuer.recognised).toBe(false);
    expect(valueOf(r, 'unit')).toBeNull();
  });
});

describe('evidence carried with every value', () => {
  const r = extractCertificate(BV, 1);

  it('records page, rule, issuer and evidence class for a table value', () => {
    const serial = candidateOf(r, 'serialNumber')!;
    expect(serial.value).toBe('AN-8600010');
    expect(serial.page).toBe(1);
    expect(serial.issuer).toBe('bureau-veritas');
    expect(serial.evidence).toBe('structured-table');
    expect(serial.rule).toMatch(/INSPECTED ITEMS/);
    expect(serial.source).toContain('DRILL PIPE STORAGE BIN');
  });

  it('names the label that produced a header value', () => {
    const date = candidateOf(r, 'inspectionDate')!;
    expect(date.evidence).toBe('exact-label');
    expect(date.rule).toBe('date of inspection');
    expect(date.confidence).toBe('high');
  });

  it('keeps the raw text beside the normalised value', () => {
    const date = candidateOf(r, 'inspectionDate')!;
    expect(date.value).toBe('2025-07-09');
    expect(date.raw).toBe('09-Jul-25');
  });

  it('numbers pages so a multi-page file stays traceable', () => {
    const results = extractCertificatePages([BV, '   ', BV]);
    expect(results.map((x) => x.page)).toEqual([1, 3]);
    expect(candidateOf(results[1], 'serialNumber')!.page).toBe(3);
  });
});

describe('layout rules that stop confident noise', () => {
  it('does not read a column-header row as label/value pairs', () => {
    // "Make" is a manufacturer label, but in "Serial Number Description Make
    // Size Result" it is a heading. Reading it yielded oem = "Size Result" at
    // high confidence, on a field the reviewer can write back to the record.
    const r = extractCertificate(BV, 1);
    expect(valueOf(r, 'oem')).toBeNull();
  });

  it('pairs a wrapped value with the last label on the line', () => {
    // The Bureau Veritas template wraps the value of the final label on a
    // two-label header row. Only the last label can wrap — an earlier one is
    // bounded by the label after it — so the pairing is determinate.
    const wrapped = extractCertificate(
      'Report Number BV.OMA.IVS.32168.013 Date of Inspection\n'
      + '14-Apr-25\n'
      + 'Bureau Veritas Middle East Co. LLC\n',
    );
    expect(valueOf(wrapped, 'certificateNumber')).toBe('BV.OMA.IVS.32168.013');
    expect(valueOf(wrapped, 'inspectionDate')).toBe('2025-04-14');
    expect(candidateOf(wrapped, 'inspectionDate')!.evidence).toBe('label-proximity');
    expect(candidateOf(wrapped, 'inspectionDate')!.confidence).toBe('medium');
  });

  it('refuses to pair a label with a line that is itself a label row', () => {
    // The next line starting a new field means the first label's value is
    // simply absent, not wrapped onto it.
    const r = extractCertificate(
      'Date of Inspection\nCustomer Name ABRAJ ENERGY SERVICES\n'
      + 'Bureau Veritas Middle East Co. LLC\n',
    );
    expect(valueOf(r, 'inspectionDate')).toBeNull();
    expect(valueOf(r, 'customer')).toBe('ABRAJ ENERGY SERVICES');
  });
});

describe('ambiguous dates', () => {
  // 03/04/2026 is 3 April or 4 March depending on the house's convention, and
  // nothing in the text decides it.
  const r = extractCertificate(
    'Date of Inspection 03/04/2026\nA certificate body long enough to be real text.\n',
  );

  it('flags the value rather than silently choosing a reading', () => {
    const d = candidateOf(r, 'inspectionDate')!;
    expect(d.ambiguous).toBe(true);
    expect(d.evidence).toBe('ambiguous');
  });

  it('drops confidence so it cannot look decided', () => {
    expect(candidateOf(r, 'inspectionDate')!.confidence).toBe('low');
  });

  it('preserves the raw text for the reviewer to judge', () => {
    expect(candidateOf(r, 'inspectionDate')!.raw).toBe('03/04/2026');
  });

  it('does not flag a date a named month makes unambiguous', () => {
    const named = extractCertificate(BV, 1);
    expect(candidateOf(named, 'inspectionDate')!.ambiguous).toBeUndefined();
  });

  it('does not flag a numeric date only one reading fits', () => {
    // 28 cannot be a month, so 5/28/2020 is decided.
    const us = extractCertificate(
      'Date of Test 5/28/2020\nA certificate body long enough to be real text.\n',
    );
    expect(candidateOf(us, 'inspectionDate')!.ambiguous).toBeUndefined();
  });
});

describe('the certificate expiry stays cross-check information', () => {
  const r = extractCertificate(BV, 1);
  const everything = new Set<CertField>([
    'serialNumber', 'oem', 'inspectionCompany', 'partNumber', 'manufactureYear',
    'inspectionDate', 'nextDueDate', 'equipmentDescription', 'unit', 'customer',
    'certificateNumber', 'inspectionType', 'workingPressure', 'testPressure',
  ]);

  it('is extracted and shown', () => {
    expect(valueOf(r, 'nextDueDate')).toBe('2026-07-08');
  });

  it('never reaches the record, even when every field is ticked', () => {
    const patch = buildRecordPatch(r, everything, 'major');
    expect(JSON.stringify(patch)).not.toContain('2026-07-08');
    expect(patch).not.toHaveProperty('major_due_date');
    expect(patch).not.toHaveProperty('intermediate_due_date');
  });

  it('contributes only through the inferred frequency', () => {
    // 09-Jul-25 → 08-Jul-26 is a 12-month cycle; the database recomputes the
    // due date from date + frequency, and 0030's trigger owns that.
    expect(r.inferredFrequencyMonths).toBe(12);
    const patch = buildRecordPatch(r, everything, 'major');
    expect(patch.major_date).toBe('2025-07-09');
    expect(patch.major_freq_months).toBe(12);
  });
});
