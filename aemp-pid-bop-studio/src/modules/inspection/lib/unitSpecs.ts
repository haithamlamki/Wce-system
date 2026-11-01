// ============================================================================
//  Unit technical specification sheet (migration 0052) — titled sections of
//  label/value rows stored as jsonb on public.unit_specs, plus an optional rig
//  photo in the private 'unit-photos' bucket. Pure helpers first, then the
//  Supabase calls.
// ============================================================================
import { supabase } from '../../../lib/supabase';

export interface SpecRow { label: string; value: string }
export interface SpecSection { title: string; rows: SpecRow[] }
export interface UnitSpec { sections: SpecSection[] }

export interface UnitSpecRecord {
  unitId: string;
  spec: UnitSpec;
  photoPath: string | null;
  updatedAt: string | null;
}

const BUCKET = 'unit-photos';
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/** Section layout of the standard Abraj rig sheet, values blank. */
export const SPEC_TEMPLATE: UnitSpec = {
  sections: ([
    ['Technical Overview', ['Rig Number', 'Rig Model', 'HP Rating', 'Hook Load', 'Drilling Depth']],
    ['Mast', ['Type – Model', 'Height', 'Hook Load']],
    ['Sub-Structure', ['Type', 'Height', 'Casing Load', 'Setback Load', 'Combined Load (Rotary Table + Setback)']],
    ['Draw Works', ['Model / Type', 'Horsepower Rating', 'Max. Line Pull', 'Drilling Line Diameter', 'Auxiliary Brake']],
    ['Top Drive', ['Model', 'Horsepower Rating', 'Capacity', 'Drilling Speed (RPM)', 'Max. Continuous Torque', 'Drill Pipe Range']],
    ['Traveling Block', ['Model', 'Max. Static Hook Load', 'Sheave Quantity']],
    ['Crown Block', ['Model', 'Max. Static Hook Load', 'Sheave Quantity']],
    ['Rotary Table', ['Type', 'Table Opening', 'Insert Bushing']],
    ['Iron Roughneck', ['Type', 'Operating Pressure', 'Torque Tubular Range']],
    ['Engine & Generator', ['Engine Type', 'Engine Horsepower Rating', 'Generator Type', 'Generator Rating', 'Voltage / Frequency', 'Control Unit', 'Air Compressor']],
    ['Dead Line Anchor', ['Model / Type', 'Max. Deadline Pull']],
    ['Well Control', ['Annular BOP', 'Double Ram BOP', 'Single Ram BOP', 'BOP Control Unit', 'Choke Manifold']],
    ['Mud Tank System', ['Shale Shaker', 'Active Mud System', 'Reserve Mud System', 'Water Tanks', 'Trip Tank', 'Stripping Tank']],
    ['Mud Pumps', ['Model / Type', 'Horsepower Rating', 'Pressure Rating', 'Relief Valve', 'Pulsation Dampener', 'Standpipe Pressure', 'Cement Manifold']],
    ['Power Slip', ['Make / Type']],
    ['Additional Equipment', []],
  ] as const).map(([title, labels]) => ({ title, rows: labels.map((label) => ({ label, value: '' })) })),
};

/** Coerce whatever jsonb came back into a well-formed sheet. */
export function normalizeSpec(raw: unknown): UnitSpec {
  const secs = (raw as { sections?: unknown } | null)?.sections;
  if (!Array.isArray(secs)) return { sections: [] };
  return {
    sections: secs.map((s) => {
      const rows: unknown[] = Array.isArray(s?.rows) ? s.rows : [];
      return {
        title: String(s?.title ?? ''),
        rows: rows.map((r) => {
          const row = r as { label?: unknown; value?: unknown } | null;
          return { label: String(row?.label ?? ''), value: String(row?.value ?? '') };
        }),
      };
    }),
  };
}

/** Trim text, drop fully blank rows and untitled empty sections before saving. */
export function cleanSpec(spec: UnitSpec): UnitSpec {
  return {
    sections: spec.sections
      .map((s) => ({
        title: s.title.trim(),
        rows: s.rows
          .map((r) => ({ label: r.label.trim(), value: r.value.replace(/[ \t]+$/gm, '').trim() }))
          .filter((r) => r.label || r.value),
      }))
      .filter((s) => s.title || s.rows.length),
  };
}

/** Validation errors that block saving (empty list = valid). */
export function validateSpec(spec: UnitSpec): string[] {
  const errs: string[] = [];
  spec.sections.forEach((s, i) => {
    if (!s.title) errs.push(`Section ${i + 1} needs a title.`);
    if (s.title.length > 80) errs.push(`Section ${i + 1} title is too long (max 80).`);
    s.rows.forEach((r) => {
      if (r.label.length > 120) errs.push(`A label in section ${i + 1} is too long (max 120).`);
      if (r.value.length > 1000) errs.push(`A value in section ${i + 1} is too long (max 1000).`);
    });
  });
  return errs;
}

/** First non-empty value whose label matches one of `labels` (case-insensitive). */
export function findValue(spec: UnitSpec, labels: readonly string[]): string {
  const wanted = labels.map((l) => l.toLowerCase());
  for (const s of spec.sections) {
    for (const r of s.rows) {
      if (r.value && wanted.includes(r.label.toLowerCase())) return r.value;
    }
  }
  return '';
}

/** Immutable move of item `from` by `delta` positions (no-op at the edges). */
export function moveItem<T>(list: readonly T[], from: number, delta: number): T[] {
  const to = from + delta;
  if (to < 0 || to >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

// ---------------------------------------------------------------------------

function need() {
  if (!supabase) throw new Error('Cloud not configured.');
  return supabase;
}

export async function fetchUnitSpec(unitId: string): Promise<UnitSpecRecord | null> {
  const { data, error } = await need().from('unit_specs')
    .select('unit_id,spec,photo_path,updated_at').eq('unit_id', unitId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    unitId: data.unit_id, spec: normalizeSpec(data.spec),
    photoPath: data.photo_path ?? null, updatedAt: data.updated_at ?? null,
  };
}

export async function saveUnitSpec(unitId: string, spec: UnitSpec, photoPath: string | null): Promise<UnitSpec> {
  const clean = cleanSpec(spec);
  const errs = validateSpec(clean);
  if (errs.length) throw new Error(errs.join(' '));
  const { error } = await need().from('unit_specs')
    .upsert({ unit_id: unitId, spec: clean, photo_path: photoPath }, { onConflict: 'unit_id' });
  if (error) throw new Error(error.message);
  return clean;
}

export async function uploadUnitPhoto(unitId: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('The photo must be an image file.');
  if (file.size > MAX_PHOTO_BYTES) throw new Error('The photo must be 10 MB or smaller.');
  const ext = (file.name.split('.').pop() ?? '').replace(/[^\w]/g, '').slice(0, 5) || 'jpg';
  const path = `${unitId}/${Date.now()}.${ext}`;
  const { error } = await need().storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw new Error(error.message);
  return path;
}

export async function removeUnitPhoto(path: string): Promise<void> {
  await need().storage.from(BUCKET).remove([path]);
}

export async function unitPhotoUrl(path: string): Promise<string> {
  const { data, error } = await need().storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
