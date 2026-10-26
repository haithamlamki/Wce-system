// ============================================================================
//  Vendor Companies — data access (migration 0043) and the `mycerts` edge
//  function. RLS lets anyone with insp_view read names; writes need
//  insp_vendor_edit.
// ============================================================================
import { supabase } from '../../../lib/supabase';
import type { CertResult, VendorCompany } from './vendors';

function need() {
  if (!supabase) throw new Error('Cloud not configured.');
  return supabase;
}

function mapVendor(r: Record<string, unknown>): VendorCompany {
  return { id: r.id as string, name: r.name as string, source: r.source as VendorCompany['source'],
    isActive: r.is_active as boolean };
}

const duplicate = (m: string) => (/insp_vendor_companies_name_key/.test(m)
  ? 'A vendor company with this name already exists.' : m);

export interface VendorQuery { q: string; page: number; perPage: number; sort: 'name' | 'source'; desc: boolean }

export async function fetchVendors(p: VendorQuery): Promise<{ rows: VendorCompany[]; total: number }> {
  let qb = need().from('insp_vendor_companies').select('id,name,source,is_active', { count: 'exact' });
  if (p.q.trim()) qb = qb.ilike('name', `%${p.q.trim()}%`);
  const from = (p.page - 1) * p.perPage;
  const { data, error, count } = await qb.order(p.sort, { ascending: !p.desc })
    .order('name').range(from, from + p.perPage - 1);
  if (error) throw new Error(error.message);
  return { rows: (data ?? []).map(mapVendor), total: count ?? 0 };
}

export async function fetchVendor(id: string): Promise<VendorCompany> {
  const { data, error } = await need().from('insp_vendor_companies').select('id,name,source,is_active').eq('id', id).single();
  if (error) throw new Error(error.message);
  return mapVendor(data);
}

export async function saveVendor(v: { id?: string; name: string; isActive: boolean }): Promise<string> {
  const row = { name: v.name.trim(), is_active: v.isActive };
  const q = v.id
    ? need().from('insp_vendor_companies').update(row).eq('id', v.id).select('id').single()
    : need().from('insp_vendor_companies').insert({ ...row, source: 'Manual' }).select('id').single();
  const { data, error } = await q;
  if (error) throw new Error(duplicate(error.message));
  return data.id as string;
}

/** Active names for the form suggestion lists (prefix matches first). */
export async function searchVendors(q: string, limit = 20, offset = 0): Promise<{ id: string; name: string }[]> {
  const { data, error } = await need().rpc('insp_vendor_search', { p_q: q, p_limit: limit, p_offset: offset });
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; name: string }[];
}

export async function fetchCertifications(companyName: string, page = 1, exact = false): Promise<CertResult> {
  const { data, error } = await need().functions.invoke('mycerts', { body: { companyName, page, exact } });
  if (error) return { available: false, items: [], totalCount: 0, reason: 'unreachable', stale: false, asOf: null };
  return data as CertResult;
}
