// ============================================================================
//  Parse an upload workbook (template.ts layout) into ImportRow[] with
//  human-readable, row-numbered validation errors. Pure — testable offline.
// ============================================================================
import * as XLSX from 'xlsx';
import type { ImportRow } from './records';
import type { Company, EquipmentPart, EquipmentType, InspCategory, InspUnit, PartComponent, WorkingStatus } from '../types';
import { INTERMEDIATE_FREQUENCIES, MAJOR_FREQUENCIES, WORKING_STATUS_LABELS, frequencyLabel } from '../types';

export interface ImportContext {
  category: InspCategory;
  types: EquipmentType[]; parts: EquipmentPart[]; components: PartComponent[];
  units: InspUnit[]; companies: Company[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseFrequency(label: string, allowed: readonly number[]): number | null | 'bad' {
  const t = label.trim();
  if (!t) return null;
  const hit = allowed.find((m) => frequencyLabel(m).toLowerCase() === t.toLowerCase());
  return hit ?? 'bad';
}

function parseStatus(label: string): WorkingStatus | 'bad' {
  const t = label.trim().toLowerCase();
  if (!t) return 'in_use';
  const hit = (Object.entries(WORKING_STATUS_LABELS) as [WorkingStatus, string][])
    .find(([, l]) => l.toLowerCase() === t);
  return hit ? hit[0] : 'bad';
}

export function parseWorkbook(wb: XLSX.WorkBook, ctx: ImportContext) {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: false, defval: '' });
  const rows: ImportRow[] = [];
  const errors: string[] = [];
  const catTypes = ctx.types.filter((t) => t.category === ctx.category);

  grid.slice(1).forEach((cells, i) => {
    const rowNo = i + 2; // 1-based + header row
    const c = (n: number) => String(cells[n] ?? '').trim();
    if (cells.every((v) => String(v ?? '').trim() === '')) return;

    const errsBefore = errors.length;
    const typeName = c(0);
    const type = catTypes.find((t) => t.name.toLowerCase() === typeName.toLowerCase());
    if (!type) errors.push(`Row ${rowNo}: unknown Equipment "${typeName}"`);

    const partName = c(1);
    const part = type && partName
      ? ctx.parts.find((p) => p.typeId === type.id && p.name.toLowerCase() === partName.toLowerCase())
      : undefined;
    if (partName && type && !part) errors.push(`Row ${rowNo}: unknown Equipment Part "${partName}"`);

    const compName = c(2);
    const comp = part && compName
      ? ctx.components.find((k) => k.partId === part.id && k.name.toLowerCase() === compName.toLowerCase())
      : undefined;
    if (compName && part && !comp) errors.push(`Row ${rowNo}: unknown Part Component "${compName}"`);

    const unitName = c(4);
    const unit = ctx.units.find((u) => u.name.toLowerCase() === unitName.toLowerCase());
    if (!unit) errors.push(`Row ${rowNo}: unknown Unit "${unitName}"`);

    const companyName = c(5);
    const company = companyName
      ? ctx.companies.find((k) => k.name.toLowerCase() === companyName.toLowerCase())
      : undefined;
    if (companyName && !company) errors.push(`Row ${rowNo}: unknown Company "${companyName}"`);

    const status = parseStatus(c(10));
    if (status === 'bad') errors.push(`Row ${rowNo}: unknown Status "${c(10)}"`);

    const interDate = c(12); const majorDate = c(14);
    if (interDate && !ISO_DATE.test(interDate)) errors.push(`Row ${rowNo}: intermediate date "${interDate}" is not YYYY-MM-DD`);
    if (majorDate && !ISO_DATE.test(majorDate)) errors.push(`Row ${rowNo}: major date "${majorDate}" is not YYYY-MM-DD`);

    const interFreq = parseFrequency(c(13), INTERMEDIATE_FREQUENCIES);
    if (interFreq === 'bad') errors.push(`Row ${rowNo}: unknown Intermediate Frequency "${c(13)}"`);
    const majorFreq = parseFrequency(c(15), MAJOR_FREQUENCIES);
    if (majorFreq === 'bad') errors.push(`Row ${rowNo}: unknown Major Frequency "${c(15)}"`);

    if (errors.length > errsBefore) return; // never emit a row that had errors

    rows.push({
      type_id: type!.id, part_id: part?.id ?? null, component_id: comp?.id ?? null,
      unit_id: unit!.id, company_id: company?.id ?? null,
      component_description: c(3), oem: c(6), inspection_company: c(7),
      serial_number: c(8), part_number: c(9),
      working_status: status as WorkingStatus,
      manufacture_year: c(11) ? Number(c(11)) : null,
      intermediate_date: interDate || null,
      intermediate_freq_months: interFreq === null ? null : (interFreq as number),
      major_date: majorDate || null,
      major_freq_months: majorFreq === null ? null : (majorFreq as number),
      remarks: c(16), specs: {},
    });
  });

  return { rows, errors };
}
