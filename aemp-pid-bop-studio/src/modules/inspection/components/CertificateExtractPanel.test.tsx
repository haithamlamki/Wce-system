// ============================================================================
//  The review panel's issuer reporting.
//
//  Mounted with the PDF reader and the database stubbed, so this exercises the
//  real component with no pdf.js runtime and no writes. What it checks is what
//  the reviewer must be told before they can trust a value: which house issued
//  the certificate, how sure the parser is, and — when nothing was recognised —
//  that every value below is only a suggestion.
// ============================================================================
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InspectionRecord } from '../types';

const BV_TEXT = [
  'MAGNETIC PARTICLE INSPECTION REPORT',
  'Report Number BV.OMA.IVS.32168.021 Date of Inspection 09-Jul-25',
  'Customer Name ABRAJ ENERGY SERVICES Date of Expiry 08-Jul-26',
  'INSPECTED ITEMS DETAILS',
  'Serial Number Description Make Size Result',
  'NL 2628463 PIPE SPINNER --- ---- SATISFACTORY',
  'Bureau Veritas Middle East Co. LLC',
].join('\n');

const UNKNOWN_TEXT = [
  'SOME OTHER HOUSE INSPECTION RECORD',
  'Date of Test: 01-Dec-2022',
  'Serial No: NL 2628463',
  'A certificate body with enough text to carry a real text layer.',
].join('\n');

/** Pages the stubbed reader returns; set per test before mounting. */
const pdf = { pages: [BV_TEXT] };

vi.mock('../lib/pdfText', () => ({
  readPdfPages: () => Promise.resolve(pdf.pages),
}));
vi.mock('../lib/records', () => ({
  updateRecord: () => Promise.resolve(),
}));
vi.mock('../state/InspectionContext', () => ({
  useInspection: () => ({ can: () => true }),
}));

// Imported after the mocks so the component picks them up.
const { default: CertificateExtractPanel } = await import('./CertificateExtractPanel');

const RECORD = {
  id: 'r1', serialNumber: 'NL 2628463', oem: '', inspectionCompany: '', partNumber: '',
  manufactureYear: null, majorDate: null, intermediateDate: null,
} as unknown as InspectionRecord;

let container: HTMLDivElement;
let root: Root;

async function mount() {
  await act(async () => {
    root.render(
      <CertificateExtractPanel
        record={RECORD}
        file={new File(['x'], 'cert.pdf', { type: 'application/pdf' })}
        onClose={() => {}}
        onApplied={() => {}}
      />,
    );
  });
  // Let the async read + extraction settle.
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  pdf.pages = [BV_TEXT];
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('CertificateExtractPanel — issuer reporting', () => {
  it('names the recognised issuer and its confidence', async () => {
    await mount();
    const text = container.textContent ?? '';
    expect(text).toContain('Issuer recognised');
    expect(text).toContain('Bureau Veritas');
    expect(text).toContain('high confidence');
  });

  it('quotes the evidence that identified the issuer', async () => {
    await mount();
    expect(container.textContent).toContain('Bureau Veritas name');
  });

  it('warns plainly when the issuer is unrecognised', async () => {
    pdf.pages = [UNKNOWN_TEXT];
    await mount();
    const text = container.textContent ?? '';
    expect(text).toContain('Unrecognised issuer');
    expect(text).toMatch(/suggestion/i);
    expect(text).not.toContain('Issuer recognised');
  });

  it('still shows the reviewer the extracted value and its evidence', async () => {
    await mount();
    expect(container.textContent).toContain('NL 2628463');
    // The source line is the reviewer's proof; it must stay on screen.
    expect(container.textContent).toContain('PIPE SPINNER');
  });

  it('does not leak internal parser vocabulary into the review UI', async () => {
    await mount();
    const text = container.textContent ?? '';
    for (const internal of ['structured-table', 'exact-label', 'label-proximity', 'bureau-veritas']) {
      expect(text).not.toContain(internal);
    }
  });
});
