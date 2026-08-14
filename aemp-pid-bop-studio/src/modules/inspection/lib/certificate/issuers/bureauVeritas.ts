// ============================================================================
//  Bureau Veritas — MPI report template.
//
//  Every marker below was read off the three real BV certificates in the sample
//  set; nothing is anticipated for layouts that have not been seen. Observed
//  footer block:
//
//    Bureau Veritas Middle East Co. LLC
//    PO Box : 110, PC : 134 , ... Email : ivs.oman@ae.bureauveritas.com
//    . OMA.IVS.Form 17 Rev.3.0.Aug 2022
//
//  Two layout facts drive the passes:
//
//   1. The "Equipment Details" table near the top lists the INSPECTOR'S OWN
//      tools (AC YOKE, DC YOKE, WEIGHT BAR) with their own serials and due
//      dates. Reading it as the subject would attach a calibration date to the
//      customer's equipment, so only "INSPECTED ITEMS DETAILS" is ever read.
//   2. Header rows carry two label/value pairs per line with no colons, so a
//      value runs only until the next known label — handled by the shared
//      label engine, not here.
// ============================================================================
import type { InspectedItem } from '../model';
import type { ExtractionPass, IssuerStrategy, PassContext } from './types';

const ITEMS_HEADING = /inspected items details/i;
const ITEMS_COLUMNS = /^serial\s*number\b.*\bdescription\b/i;
const SECTION_END = /^(pictures|remarks|comments|inspected by|inspection parameters)\b/i;

/**
 * Splits a row of the inspected-items table into serial and description.
 *
 * The serial is the leading run of tokens containing digits (or one short
 * all-caps prefix such as "NL"), which keeps multi-token serials like
 * "NL 2628463" intact while stopping before the description.
 */
export function splitItemRow(row: string): InspectedItem | null {
  const tokens = row.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const serialParts: string[] = [];
  let i = 0;
  for (; i < tokens.length; i += 1) {
    const tk = tokens[i];
    const hasDigit = /\d/.test(tk);
    const shortCode = /^[A-Z]{1,3}$/.test(tk);
    if (hasDigit || (shortCode && serialParts.length === 0)) serialParts.push(tk);
    else break;
  }
  if (serialParts.length === 0) return null;
  const description = tokens.slice(i)
    .filter((tk) => !/^(satisfactory|acceptable|pass|passed|-+|—+)$/i.test(tk))
    .join(' ')
    .trim();
  // Trailing inch marks bleed in from the adjacent Size column ("AN3503546''").
  const serial = serialParts.join(' ').replace(/["'’”]+$/, '').trim();
  return { serial, description, raw: row };
}

/** Reads INSPECTED ITEMS DETAILS — never the inspector's own tool table. */
const inspectedItemsPass: ExtractionPass = ({ page, emit, addItem }: PassContext) => {
  const { lines } = page;
  const start = lines.findIndex((l) => ITEMS_HEADING.test(l.text));
  if (start === -1) return;

  const items: InspectedItem[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i].text;
    if (SECTION_END.test(line)) break;
    if (ITEMS_COLUMNS.test(line)) continue;
    const item = splitItemRow(line);
    if (item && item.description) { items.push(item); addItem(item); }
  }

  // The first inspected item is the certificate's subject.
  const first = items[0];
  if (!first) return;
  emit({
    field: 'serialNumber',
    raw: first.serial,
    source: first.raw,
    evidence: 'structured-table',
    rule: 'INSPECTED ITEMS DETAILS row 1',
  });
  emit({
    field: 'equipmentDescription',
    raw: first.description,
    source: first.raw,
    evidence: 'structured-table',
    rule: 'INSPECTED ITEMS DETAILS row 1',
  });
};

/** The issuing house is printed as the first footer line. */
const footerCompanyPass: ExtractionPass = ({ page, emit }: PassContext) => {
  const line = page.lines.find((l) => /bureau\s*veritas/i.test(l.text) && l.text.length < 80);
  if (!line) return;
  emit({
    field: 'inspectionCompany',
    raw: line.text,
    source: line.text,
    evidence: 'exact-label',
    rule: 'Bureau Veritas footer',
  });
};

export const BUREAU_VERITAS: IssuerStrategy = {
  id: 'bureau-veritas',
  displayName: 'Bureau Veritas',
  signals: [
    { name: 'Bureau Veritas name', test: /bureau\s*veritas/i, weight: 'strong' },
    { name: 'Bureau Veritas domain', test: /bureauveritas\.com/i, weight: 'strong' },
    { name: 'BV report-number scheme', test: /\bBV\.OMA\.[A-Z]/i, weight: 'strong' },
    { name: 'BV work-instruction code', test: /\bBV\/IVS\//i, weight: 'weak' },
    { name: 'BV form code', test: /OMA\.IVS\.Form\s*\d+/i, weight: 'weak' },
    { name: 'MPI report template', test: /magnetic particle inspection report/i, weight: 'weak' },
  ],
  labels: {
    // Slashed rig spellings are this template's; they are too specific to be
    // generic and too load-bearing here to leave out.
    unit: ['rig/hoist number', 'rig /unit', 'rig/unit'],
  },
  // Both tables on this template head their columns with words that are also
  // field labels. Left alone, "Make" in the items header reads "Size Result"
  // as the OEM, at high confidence, on a field the reviewer can write back.
  skipLines: [
    ITEMS_COLUMNS,
    /^equipment details\b.*\bserial number\b/i,
  ],
  passes: [inspectedItemsPass, footerCompanyPass],
};
