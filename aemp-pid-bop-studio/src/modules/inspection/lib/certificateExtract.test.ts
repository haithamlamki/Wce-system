// ============================================================================
//  Certificate extraction tests.
//
//  The fixtures are the real text layers of the sample certificates, with the
//  individual inspectors' names replaced — the layout, labels, serials and
//  dates are exactly as the PDFs produce them, including the `13--OCT-25`
//  double-hyphen typo and the two-pairs-per-line header rows.
// ============================================================================
import { describe, expect, it } from 'vitest';
import {
  buildRecordPatch, extractCertificate, extractCertificatePages, isScanned,
  parseCertificateDate, snapFrequency, valueOf,
} from './certificateExtract';
import type { CertField } from './certificateExtract';

/** Bureau Veritas MPI report — the dominant template (3 of 4 samples). */
const BV_MPI = `
MAGNETIC PARTICLE INSPECTION REPORT
Report Number BV.OMA.IVS.MPT.31531-IR-022 Date of Inspection 09-Jul-25
Customer Name ABRAJ ENERGY SERVICES S.A.O.C. Date of Expiry 08-Jul-26
Location ADAM BASE Inspection Type ANNUAL
Rig/Hoist Number ABRAJ 305 Inspection Category N/A
Inspection standard  ASTM – E709  AWS D1  MNT-MS-08-002,Rev.8
Inspection method  Visual Inspection  MPI With Black Ink & WCP
Equipment Details Serial Number Due Date Consumable
AC YOKE 2595 17-Dec-25 WCP MR 72 2503056
DC YOKE N/A N/A BLACKINKMR76 2503041
WEIGHT BAR 518 13-Oct-26
INSPECTION PARAMETERS
Magnetizing Technique Continuous Part Temperature 33 Celsius
INSPECTED ITEMS DETAILS
Serial Number Description Make Size Result
AN-8600010 DRILL PIPE STORAGE BIN -- Satisfactory
PICTURES
Remarks: Perform MPI on all the accessible lifting point welding joints.
Inspected by: A INSPECTOR Company authentication:
Date of Issue : 15/07/2025
Bureau Veritas Middle East Co. LLC
`;

/** Same template, different issue: full month names and a malformed expiry. */
const BV_MPI_VARIANT = `
MAGNETIC PARTICLE INSPECTION REPORT
Report Number BV.OMA.IVS.32168.021 Date of Inspection 14-April-2025
Customer Name ABRAJ ENERGY SERVICES Date of Expiry 13--OCT-25
Rig /Unit RIG 304 Inspection Type ANNUAL
INSPECTED ITEMS DETAILS
Serial Number Description Make Size Result
NL 2628463 PIPE SPINNER --- ---- SATISFACTORY
Comments: MPI was performed On Client Specified Area
Bureau Veritas Middle East Co. LLC
`;

/** GAI-Tronics certificate of conformance — colon-delimited, no due dates. */
const OEM_COC = `
Certificate of Conformance
Customer Name: National Oilwell Varco LP
Project Name: Abraj Energy / Rigs 106 & 107
Customer PO No.: N/A
GAI-Tronics Job No.: 117320631 & 117291858
Remarks:
5/28/2020
Quality Assurance Manager or Designee Date
`;

describe('parseCertificateDate', () => {
  it('reads every spelling the sample certificates use', () => {
    expect(parseCertificateDate('09-Jul-25')).toBe('2025-07-09');
    expect(parseCertificateDate('14-April-2025')).toBe('2025-04-14');
    expect(parseCertificateDate('13 October 2026')).toBe('2026-10-13');
    expect(parseCertificateDate('15/07/2025')).toBe('2025-07-15');
    expect(parseCertificateDate('2025-07-17')).toBe('2025-07-17');
  });

  it('survives the double-hyphen typo seen on a real expiry date', () => {
    expect(parseCertificateDate('13--OCT-25')).toBe('2025-10-13');
  });

  it('falls back to month-first when the second part cannot be a month', () => {
    // 5/28/2020 on the US-issued OEM certificate.
    expect(parseCertificateDate('5/28/2020')).toBe('2020-05-28');
  });

  it('keeps ambiguous numeric dates day-first', () => {
    expect(parseCertificateDate('03/04/2025')).toBe('2025-04-03');
  });

  it('returns null when there is no date', () => {
    expect(parseCertificateDate('Bureau Veritas')).toBeNull();
    expect(parseCertificateDate('')).toBeNull();
  });
});

describe('snapFrequency', () => {
  it('snaps a measured gap onto an allowed frequency', () => {
    expect(snapFrequency(12)).toBe(12);
    expect(snapFrequency(59)).toBe(60);
  });

  it('refuses a gap that matches no standard cycle', () => {
    expect(snapFrequency(9)).toBeNull();
  });
});

describe('Bureau Veritas MPI report', () => {
  const r = extractCertificate(BV_MPI);

  it('splits the two label/value pairs sharing one line', () => {
    expect(valueOf(r, 'certificateNumber')).toBe('BV.OMA.IVS.MPT.31531-IR-022');
    expect(valueOf(r, 'inspectionDate')).toBe('2025-07-09');
    expect(valueOf(r, 'customer')).toBe('ABRAJ ENERGY SERVICES S.A.O.C.');
    expect(valueOf(r, 'nextDueDate')).toBe('2026-07-08');
  });

  it('reads the rig and inspection type', () => {
    expect(valueOf(r, 'unit')).toBe('ABRAJ 305');
    expect(valueOf(r, 'inspectionType')).toBe('ANNUAL');
  });

  it('takes the subject from INSPECTED ITEMS, not the inspector tool table', () => {
    expect(valueOf(r, 'serialNumber')).toBe('AN-8600010');
    expect(valueOf(r, 'equipmentDescription')).toBe('DRILL PIPE STORAGE BIN');
    // AC YOKE / WEIGHT BAR are the inspector's own kit and must not appear.
    expect(r.items.map((i) => i.serial)).not.toContain('2595');
    expect(r.items).toHaveLength(1);
  });

  it('identifies the issuing house from the footer', () => {
    expect(valueOf(r, 'inspectionCompany')).toBe('Bureau Veritas Middle East Co. LLC');
  });

  it('infers an annual cycle from inspection and expiry', () => {
    expect(r.inferredFrequencyMonths).toBe(12);
  });
});

describe('Bureau Veritas MPI report — variant spellings', () => {
  const r = extractCertificate(BV_MPI_VARIANT);

  it('handles full month names and the malformed expiry', () => {
    expect(valueOf(r, 'inspectionDate')).toBe('2025-04-14');
    expect(valueOf(r, 'nextDueDate')).toBe('2025-10-13');
    expect(r.inferredFrequencyMonths).toBe(6);
  });

  it('reads a multi-token serial', () => {
    expect(valueOf(r, 'serialNumber')).toBe('NL 2628463');
    expect(valueOf(r, 'equipmentDescription')).toBe('PIPE SPINNER');
  });

  it('reads the rig from the "Rig /Unit" spelling', () => {
    expect(valueOf(r, 'unit')).toBe('RIG 304');
  });
});

describe('OEM certificate of conformance', () => {
  const r = extractCertificate(OEM_COC);

  it('reads the colon-delimited job number as the certificate number', () => {
    expect(valueOf(r, 'certificateNumber')).toContain('117320631');
  });

  it('does not invent inspection dates the document does not carry', () => {
    expect(valueOf(r, 'nextDueDate')).toBeNull();
    expect(r.inferredFrequencyMonths).toBeNull();
  });
});

describe('buildRecordPatch — the write surface', () => {
  const cert = extractCertificate(BV_MPI);
  const all = new Set<CertField>(['serialNumber', 'oem', 'inspectionCompany', 'partNumber',
    'manufactureYear', 'inspectionDate']);

  it('never writes a due date — migration 0030 owns those', () => {
    const patch = buildRecordPatch(cert, all, 'major');
    expect(patch).not.toHaveProperty('major_due_date');
    expect(patch).not.toHaveProperty('intermediate_due_date');
    // The certificate states an expiry, and it must stay out of the patch.
    expect(valueOf(cert, 'nextDueDate')).toBe('2026-07-08');
    expect(JSON.stringify(patch)).not.toContain('2026-07-08');
  });

  it('never touches approval state', () => {
    const patch = buildRecordPatch(cert, all, 'major');
    expect(patch).not.toHaveProperty('approve_status');
    expect(patch).not.toHaveProperty('approver_id');
    expect(patch).not.toHaveProperty('reject_reason');
  });

  it('writes the inspection date only to the chosen schedule', () => {
    const major = buildRecordPatch(cert, all, 'major');
    expect(major.major_date).toBe('2025-07-09');
    expect(major.major_freq_months).toBe(12);
    expect(major).not.toHaveProperty('intermediate_date');

    const intermediate = buildRecordPatch(cert, all, 'intermediate');
    expect(intermediate.intermediate_date).toBe('2025-07-09');
    expect(intermediate.intermediate_freq_months).toBe(12);
    expect(intermediate).not.toHaveProperty('major_date');
  });

  it('writes nothing the user did not tick', () => {
    // Ticks one field and expects exactly that field. Uses the serial rather
    // than the OEM: this template prints no manufacturer, and the value that
    // used to appear here was the items table's column header ("Make" →
    // "Size Result") being read as a manufacturer.
    const patch = buildRecordPatch(cert, new Set<CertField>(['serialNumber']), 'major');
    expect(Object.keys(patch)).toEqual(['serial_number']);
  });

  it('offers no manufacturer for a template that does not print one', () => {
    expect(valueOf(cert, 'oem')).toBeNull();
  });

  it('produces an empty patch when nothing is selected', () => {
    expect(buildRecordPatch(cert, new Set<CertField>(), 'major')).toEqual({});
  });

  it('omits the frequency when no standard cycle was inferred', () => {
    const noFreq = extractCertificate('Date of Test: 01-Dec-2022');
    const patch = buildRecordPatch(noFreq, new Set<CertField>(['inspectionDate']), 'major');
    expect(patch.major_date).toBe('2022-12-01');
    expect(patch).not.toHaveProperty('major_freq_months');
  });
});

describe('isScanned — the OCR guard', () => {
  it('accepts a page carrying a real text layer', () => {
    expect(isScanned([BV_MPI])).toBe(false);
  });

  it('rejects a file whose pages carry no text', () => {
    expect(isScanned(['', '   ', '\n'])).toBe(true);
  });

  it('accepts a file where only some pages are blank', () => {
    expect(isScanned(['', BV_MPI])).toBe(false);
  });
});

describe('guards', () => {
  it('flags a page with no usable text layer', () => {
    const r = extractCertificate('  \n \n');
    expect(r.looksEmpty).toBe(true);
    expect(r.candidates).toHaveLength(0);
  });

  it('treats each page of a multi-page file as its own certificate', () => {
    const results = extractCertificatePages([BV_MPI, '   ', BV_MPI_VARIANT]);
    expect(results).toHaveLength(2);
    expect(valueOf(results[0], 'serialNumber')).toBe('AN-8600010');
    expect(valueOf(results[1], 'serialNumber')).toBe('NL 2628463');
  });

  it('rejects N/A as a value', () => {
    const r = extractCertificate('Serial Number N/A\nDescription N/A');
    expect(valueOf(r, 'serialNumber')).toBeNull();
  });

  it('ignores a label word appearing mid-sentence', () => {
    const r = extractCertificate(
      'This equipment was tested in accordance with the serialisation standard.',
    );
    expect(valueOf(r, 'serialNumber')).toBeNull();
  });
});
