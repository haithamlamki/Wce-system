// ============================================================================
//  Seed the Supabase `equipment` table with the Rig 303 WCE dataset.
//  Usage (from the app dir, with .env.local present):
//    node --env-file=.env.local scripts/seed-equipment.mjs
//  Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. The demo RLS policy lets
//  the anon key insert; production should seed with a service-role key instead.
// ============================================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const RIG = 'Rig 303';
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (run with --env-file=.env.local)');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const records = JSON.parse(readFileSync(join(here, '../src/lib/data/rig303-equipment.json'), 'utf8'));
const nz = (v) => (v && String(v).trim() ? String(v) : null); // '' / missing → null (date columns)

const rows = records.map((r) => ({
  rig_name: RIG,
  type: r.type ?? null,
  section: r.section ?? null,
  description: r.description ?? null,
  tag: nz(r.tag),
  rwp: r.rwp ?? null,
  size: r.size ?? null,
  manufacturer: r.manufacturer ?? null,
  serial: r.serial ?? null,
  int_last: nz(r.int_last),
  int_due: nz(r.int_due),
  maj_last: nz(r.maj_last),
  maj_due: nz(r.maj_due),
}));

const supabase = createClient(url, key, { auth: { persistSession: false } });

console.log(`Seeding ${rows.length} equipment rows for ${RIG}…`);
await supabase.from('equipment').delete().eq('rig_name', RIG);
for (let i = 0; i < rows.length; i += 100) {
  const chunk = rows.slice(i, i + 100);
  const { error } = await supabase.from('equipment').insert(chunk);
  if (error) { console.error('Insert failed:', error.message); process.exit(1); }
  console.log(`  inserted ${Math.min(i + 100, rows.length)}/${rows.length}`);
}
console.log('Done.');
