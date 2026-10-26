// ============================================================================
//  Edge Function: mycerts — read-only proxy to API MyCerts (the American
//  Petroleum Institute Composite List, https://mycerts.api.org) for the
//  Vendor Companies certification panel and form badges.
//  --------------------------------------------------------------------------
//  Deploy:  supabase functions deploy mycerts          (JWT verified)
//  POST { companyName, page = 1, exact = false }  →
//    { available, items[], totalCount, reason, stale, asOf }
//  - exact: only rows whose company / legal name equals the query (case-insensitive)
//  - every good answer is cached in insp_mycerts_cache; when MyCerts is down the
//    cached answer is returned with stale = true, else available = false.
// ============================================================================
// @ts-nocheck — Deno/Edge runtime types are not part of the Vite tsconfig.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const BASE = 'https://mycerts.api.org';
const PAGE_SIZE = 50;
const EXACT_SCAN = 500;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

let programs: Record<number, string> | null = null;

async function getJson(url: string) {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) { const e = new Error(`MyCerts ${res.status}`); e.status = res.status; throw e; }
  return res.json();
}

/** Program id → display name. Monogram (1) has specifications, so the list leaves it out. */
async function programNames(): Promise<Record<number, string>> {
  if (programs) return programs;
  const map: Record<number, string> = { 1: 'Monogram' };
  try {
    const j = await getJson(`${BASE}/api/Programs/GetProgramsWithNotSpecifications?includeInactive=true`);
    for (const p of j._embedded?.programs ?? []) map[p.id] = p.formalName || p.name;
  } catch { /* names fall back to null below */ }
  programs = map;
  return map;
}

function search(name: string, pageNdx: number, pageSize: number) {
  const q = new URLSearchParams({ companyName: name, certificationNumber: '', scopeStatement: '',
    pageNdx: String(pageNdx), pageSize: String(pageSize) });
  return getJson(`${BASE}/api/Search?${q}`);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const body = await req.json().catch(() => ({}));
  const name = String(body.companyName ?? '').trim().slice(0, 300);
  const page = Math.max(1, Math.min(200, Number(body.page) || 1));
  const exact = body.exact === true;
  if (name.length < 3) return json({ error: 'companyName needs at least 3 characters' }, 400);

  const key = `${name.toLowerCase()}|${exact}|${page}`;
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    const names = await programNames();
    let rows: any[]; let total: number;
    if (exact) {
      const j = await search(name, 1, EXACT_SCAN);
      const want = name.toLowerCase();
      const all = (j._embedded?.searchResults ?? []).filter((r) =>
        [r.companyName, r.companyLegalName].some((n) => String(n ?? '').trim().toLowerCase() === want));
      total = all.length;
      rows = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    } else {
      const j = await search(name, page, PAGE_SIZE);
      rows = j._embedded?.searchResults ?? [];
      total = Number(j._embedded?.totalRowCount ?? rows.length);
    }
    const payload = {
      available: true,
      items: rows.map((r) => ({
        companyId: r.companyId, companyName: r.companyName, city: r.city || null,
        stateProvince: r.stateProvince || null, country: r.country || null,
        program: names[r.programId] ?? null, certificationNumber: r.certificationNumber || '',
        status: r.certificationStatusName || '', statusChangedOn: r.certificationStatusChangeDate || null,
      })),
      totalCount: total, reason: null, stale: false, asOf: new Date().toISOString(),
    };
    await admin.from('insp_mycerts_cache').upsert({ query_key: key, payload, fetched_at: payload.asOf });
    return json(payload);
  } catch (e) {
    const reason = e?.status === 429 ? 'rate-limited' : 'unreachable';
    const { data } = await admin.from('insp_mycerts_cache').select('payload').eq('query_key', key).maybeSingle();
    if (data?.payload) return json({ ...data.payload, stale: true });
    return json({ available: false, items: [], totalCount: 0, reason, stale: false, asOf: null });
  }
});
