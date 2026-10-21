// ============================================================================
//  Specifications — the measurement/units catalog (reference `/specifications`).
//  Equipment types name a specification by its label "Measurement(abbr)",
//  the same form the source export uses for its spec column headers.
// ============================================================================
import { supabase } from '../../../lib/supabase';
import type { EquipmentType } from '../types';

export interface Specification {
  id: string; measurement: string; units: string; abbreviation: string; active: boolean;
}

export interface SpecificationRow extends Specification { equipment: number }

export function specLabel(s: Pick<Specification, 'measurement' | 'abbreviation'>): string {
  return `${s.measurement}(${s.abbreviation})`;
}

/** Each specification with the number of equipment types that use it. */
export function specUsage(specs: Specification[], types: EquipmentType[]): SpecificationRow[] {
  const uses = new Map<string, number>();
  for (const t of types) {
    for (const f of t.specFields) uses.set(f.toLowerCase(), (uses.get(f.toLowerCase()) ?? 0) + 1);
  }
  return specs.map((s) => ({ ...s, equipment: uses.get(specLabel(s).toLowerCase()) ?? 0 }));
}

function esc(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function specsToCsv(rows: SpecificationRow[]): string {
  const lines = rows.map((r) => [r.measurement, r.units, r.abbreviation, String(r.equipment)].map(esc).join(','));
  return ['Measurement,Units,Abbreviation,Equipment', ...lines].join('\n') + '\n';
}

export async function fetchSpecifications(): Promise<Specification[]> {
  if (!supabase) throw new Error('Cloud not configured.');
  const { data, error } = await supabase.from('insp_specifications')
    .select('id,measurement,units,abbreviation,active')
    .order('measurement').order('units');
  if (error) throw new Error(error.message);
  return (data ?? []) as Specification[];
}
