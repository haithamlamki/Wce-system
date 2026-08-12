// ============================================================================
//  Catalog admin writes — plain RLS-guarded table writes (insp_manage_catalog).
// ============================================================================
import { supabase } from '../../../lib/supabase';
import type { InspCategory } from '../types';

function need() {
  if (!supabase) throw new Error('Cloud not configured.');
  return supabase;
}

export async function saveType(t: {
  id?: string; category: InspCategory; name: string; description: string; specFields: string[];
}): Promise<void> {
  const sb = need();
  const row = { category: t.category, name: t.name, description: t.description, spec_fields: t.specFields };
  const { error } = t.id
    ? await sb.from('insp_equipment_types').update(row).eq('id', t.id)
    : await sb.from('insp_equipment_types').insert(row);
  if (error) throw new Error(error.message);
}

export async function deleteType(id: string): Promise<void> {
  const { error } = await need().from('insp_equipment_types').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function savePart(p: {
  id?: string; typeId: string; name: string; description: string; position: number;
}): Promise<void> {
  const sb = need();
  const row = { type_id: p.typeId, name: p.name, description: p.description, position: p.position };
  const { error } = p.id
    ? await sb.from('insp_equipment_parts').update(row).eq('id', p.id)
    : await sb.from('insp_equipment_parts').insert(row);
  if (error) throw new Error(error.message);
}

export async function deletePart(id: string): Promise<void> {
  const { error } = await need().from('insp_equipment_parts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function saveComponent(c: {
  id?: string; partId: string; name: string; description: string; position: number;
}): Promise<void> {
  const sb = need();
  const row = { part_id: c.partId, name: c.name, description: c.description, position: c.position };
  const { error } = c.id
    ? await sb.from('insp_part_components').update(row).eq('id', c.id)
    : await sb.from('insp_part_components').insert(row);
  if (error) throw new Error(error.message);
}

export async function deleteComponent(id: string): Promise<void> {
  const { error } = await need().from('insp_part_components').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
