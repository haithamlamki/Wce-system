// ============================================================================
//  Upload template — one Data sheet with header row + a Lists sheet of valid
//  values (equipment names, units, companies, statuses, frequencies).
// ============================================================================
import * as XLSX from 'xlsx';
import type { Company, EquipmentType, InspCategory, InspUnit } from '../types';
import { CATEGORY_LABELS, INTERMEDIATE_FREQUENCIES, MAJOR_FREQUENCIES,
  WORKING_STATUS_LABELS, frequencyLabel } from '../types';

export const TEMPLATE_HEADERS = [
  'Equipment', 'Equipment Part', 'Equipment Part Component', 'Component Description',
  'Unit', 'Company', 'OEM', 'Inspection Company', 'Serial Number', 'Part Number',
  'Status', 'Manufacture Year',
  'Intermediate Inspection Date (YYYY-MM-DD)', 'Intermediate Inspection Frequency',
  'Major Inspection Date (YYYY-MM-DD)', 'Major Inspection Frequency', 'Remarks',
];

export interface TemplateContext {
  types: EquipmentType[]; units: InspUnit[]; companies: Company[];
}

export function buildTemplateWorkbook(category: InspCategory, ctx: TemplateContext): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const data = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS]);
  XLSX.utils.book_append_sheet(wb, data, 'Data');
  const lists = XLSX.utils.aoa_to_sheet([
    [`Valid values — ${CATEGORY_LABELS[category]}`],
    ['Equipment:', ...ctx.types.filter((t) => t.category === category).map((t) => t.name)],
    ['Unit:', ...ctx.units.map((u) => u.name)],
    ['Company:', ...ctx.companies.map((c) => c.name)],
    ['Status:', ...Object.values(WORKING_STATUS_LABELS)],
    ['Intermediate Frequency:', ...INTERMEDIATE_FREQUENCIES.map(frequencyLabel)],
    ['Major Frequency:', ...MAJOR_FREQUENCIES.map(frequencyLabel)],
  ]);
  XLSX.utils.book_append_sheet(wb, lists, 'Lists');
  return wb;
}
