-- ============================================================================
--  0052_unit_technical_specs.sql — per-unit technical specification sheet
--  (the "Rig Spec" sheet: Technical Overview, Mast, Sub-Structure, Draw Works…).
--  The sheet is a free-form list of titled sections of label/value rows held
--  as jsonb, so admins can add sections and rows without schema changes:
--    { "sections": [ { "title": "Mast", "rows": [ { "label": "...", "value": "..." } ] } ] }
--  Read: unit:view. Write: unit:update (admins/managers bypass via has_insp_perm).
--  The rig photo lives in the private bucket 'unit-photos' (signed URLs).
-- ============================================================================

create table if not exists public.unit_specs (
  unit_id     uuid primary key references public.units(id) on delete cascade,
  spec        jsonb not null default '{"sections": []}'::jsonb
              check (jsonb_typeof(spec -> 'sections') = 'array'),
  photo_path  text,
  updated_by  uuid references auth.users(id) default auth.uid(),
  updated_at  timestamptz not null default now()
);

alter table public.unit_specs enable row level security;

drop policy if exists unit_specs_read on public.unit_specs;
create policy unit_specs_read on public.unit_specs
  for select to authenticated using (public.has_insp_perm('unit:view'));

drop policy if exists unit_specs_insert on public.unit_specs;
create policy unit_specs_insert on public.unit_specs
  for insert to authenticated with check (public.has_insp_perm('unit:update'));

drop policy if exists unit_specs_update on public.unit_specs;
create policy unit_specs_update on public.unit_specs
  for update to authenticated
  using (public.has_insp_perm('unit:update')) with check (public.has_insp_perm('unit:update'));

drop policy if exists unit_specs_delete on public.unit_specs;
create policy unit_specs_delete on public.unit_specs
  for delete to authenticated using (public.has_insp_perm('unit:update'));

create or replace function public.unit_specs_touch() returns trigger
  language plpgsql set search_path = public as
$$ begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;

drop trigger if exists unit_specs_touch on public.unit_specs;
create trigger unit_specs_touch before update on public.unit_specs
  for each row execute function public.unit_specs_touch();

-- rig photos
insert into storage.buckets (id, name, public) values ('unit-photos', 'unit-photos', false)
on conflict (id) do nothing;

drop policy if exists unit_photos_read on storage.objects;
create policy unit_photos_read on storage.objects
  for select to authenticated
  using (bucket_id = 'unit-photos' and public.has_insp_perm('unit:view'));

drop policy if exists unit_photos_insert on storage.objects;
create policy unit_photos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'unit-photos' and public.has_insp_perm('unit:update'));

drop policy if exists unit_photos_delete on storage.objects;
create policy unit_photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'unit-photos' and public.has_insp_perm('unit:update'));

-- seed the two sheets supplied by operations (Rig 103 docx, Rig 305 poster)
insert into public.unit_specs (unit_id, spec)
select u.id, s.spec::jsonb from public.units u
join (values
  ('Rig 103', $spec${"sections": [{"title": "Technical Overview", "rows": [{"label": "Rig Number", "value": "ABRAJ # 103"}, {"label": "Rig Model", "value": "ZJ 40 DBST DRILLING RIG"}, {"label": "HP Rating", "value": "1000 HP"}, {"label": "Nominal Drilling Capacity", "value": "4000 Meters with 5\" DP"}]}, {"title": "Mast", "rows": [{"label": "Type – Model", "value": "HH Cantilever – JJ225/43.3-K"}, {"label": "Height", "value": "43.3 m (142 ft)"}, {"label": "Hook Load", "value": "2250 kN (500,000 lbs) @ 10 lines"}]}, {"title": "Sub-Structure", "rows": [{"label": "Type", "value": "DZ225 Hydraulically Raising & Lowering"}, {"label": "Height", "value": "7.3 m (23 ft)"}, {"label": "Setback Load", "value": "2336 kN (525,000 lbs), capable of racking:\n72 stands of 5\" DP\n36 stands of 3 1/2\" DP\n4 stands of 9 1/2\" DC\n8 stands of 8 1/4\" DC\n4 stands of 6 1/2\" DC"}, {"label": "Combined Load (Rotary Table + Setback)", "value": "3776 kN (848,720 lbs)"}]}, {"title": "Draw Works", "rows": [{"label": "Model / Type", "value": "JC40DB DW / VFD Drive"}, {"label": "Input Power", "value": "1000 kW (1341 HP)"}, {"label": "Max. Fast Line Pull", "value": "275 kN"}, {"label": "Drilling Line Diameter", "value": "32 mm (1 1/4\")"}, {"label": "Auxiliary Brake", "value": "Dynamic brake via AC motor (primary braking system)\nHydraulic disc brake (secondary braking system)"}]}, {"title": "Top Drive", "rows": [{"label": "Model", "value": "TESCO 350 EXI 600"}, {"label": "Horsepower Rating", "value": "600 HP"}, {"label": "Capacity", "value": "350 ton"}, {"label": "Drilling Speed (RPM)", "value": "0 to 228 rpm continuous"}, {"label": "Max. Continuous Torque", "value": "51,000 ft·lbs (69,147 N·m)"}, {"label": "Drill Pipe Range", "value": "3 1/2\" to 6 5/8\""}]}, {"title": "Traveling Block", "rows": [{"label": "Model", "value": "YC225"}, {"label": "Max. Static Hook Load", "value": "2250 kN (500,000 lbs)"}, {"label": "Sheave Quantity", "value": "5 × Φ1120 mm (44\")"}]}, {"title": "Crown Block", "rows": [{"label": "Model", "value": "TC225"}, {"label": "Max. Static Hook Load", "value": "2250 kN (500,000 lbs) @ 10 lines"}, {"label": "Sheave Quantity", "value": "5 × 44\" main sheave + 1 × 50\" fast sheave"}]}, {"title": "Rotary Table", "rows": [{"label": "Type", "value": "ZP275"}, {"label": "Table Opening", "value": "27 1/2\" – Master Bushing: Split Type"}]}, {"title": "Well Control", "rows": [{"label": "Annular BOP", "value": "HRSB, 13 5/8\" 5K"}, {"label": "Double Ram BOP", "value": "HRSB, 13 5/8\" 5K"}, {"label": "Choke Manifold", "value": "Kingdream Petroleum, 5K"}, {"label": "Accumulator Unit", "value": "Guangzhou Petroleum, 3K"}]}, {"title": "Iron Roughneck", "rows": [{"label": "Type", "value": "Iron Roughneck ST-80"}, {"label": "Operating Pressure", "value": "2,500 psi (172 bar)"}, {"label": "Make-up & Break-out Torque", "value": "60,000 & 80,000 ft·lbs"}, {"label": "Torque Tubular Range", "value": "2 7/8\" to 8 1/2\" OD Tool Joints"}]}, {"title": "Engine & Generator", "rows": [{"label": "Engine Type", "value": "3 × CAT 3512C"}, {"label": "Engine Horsepower Rating", "value": "1101 bkW (1476 bhp)"}, {"label": "Generator Type", "value": "SR4B"}, {"label": "Generator Rating", "value": "1750 KVA"}, {"label": "Voltage / Frequency", "value": "600 V / 60 Hz"}, {"label": "Control Unit", "value": "AC VFD drive system"}, {"label": "Air Compressor", "value": "Atlas Copco (GA 75+)"}]}, {"title": "Dead Line Anchor", "rows": [{"label": "Model / Type", "value": "JZG34 / Horizontal"}, {"label": "Max. Deadline Pull", "value": "340 kN (76,435 lbs)"}]}, {"title": "Mud Tank System", "rows": [{"label": "Shale Shaker", "value": "MONGOOSE PRO"}, {"label": "Active Mud System", "value": "1150 bbl"}, {"label": "Reserve Mud System", "value": "900 bbl"}, {"label": "Water Tanks", "value": "1 × 500 bbl"}, {"label": "Trip Tank", "value": "40 bbl"}, {"label": "Stripping Tank", "value": "6 bbl"}]}, {"title": "Mud Pumps", "rows": [{"label": "Model / Type", "value": "HHF-1300 / Triplex, Single acting"}, {"label": "Horsepower Rating", "value": "100 HP"}, {"label": "Pressure Rating", "value": "4500 psi with 5 1/2\" liner"}, {"label": "Relief Valve", "value": "NOV Titan Class RX 36000-02 & -03"}, {"label": "Pulsation Dampener", "value": "Hydril K20, 7500 psi"}, {"label": "Standpipe Pressure", "value": "5000 psi"}, {"label": "Cement Manifold", "value": "10000 psi"}]}, {"title": "Power Slip", "rows": [{"label": "Make / Type", "value": ""}]}, {"title": "Additional Equipment", "rows": [{"label": "Mast / Substructure hydraulic raising/lowering system", "value": ""}, {"label": "Anti-Collision System", "value": ""}, {"label": "Fast Moving Rig", "value": "Equipped with independent rig move dolly"}, {"label": "Complete set of Rig Site Camp", "value": ""}]}]}$spec$),
  ('Rig 305', $spec${"sections": [{"title": "Technical Overview", "rows": [{"label": "Rig Number", "value": "ABRAJ # 305"}, {"label": "Rig Model", "value": "ZJ 70 DBS7 DRILLING RIG"}, {"label": "HP Rating", "value": "2000 HP"}, {"label": "Hook Load", "value": "4500 kN (1,000,000 lbs) @ 12 lines"}, {"label": "Drilling Depth", "value": "7000 Meters"}]}, {"title": "Mast", "rows": [{"label": "Type – Model", "value": "HH Cantilever – JJ450/47.85-K"}, {"label": "Height", "value": "47.85 m (157 ft)"}, {"label": "Hook Load", "value": "4500 kN (1,000,000 lbs) @ 12 lines"}]}, {"title": "Sub-Structure", "rows": [{"label": "Type", "value": "Hydraulically Raising & Lowering"}, {"label": "Height", "value": "10.67 m (35 ft)"}, {"label": "Casing Load", "value": "4500 kN (1,000,000 lbs)"}, {"label": "Setback Load", "value": "3600 kN (800,000 lbs), capable of racking:\n250 stands of 5 1/2\" DP\n8 stands of 8 1/4\" DC\n5 stands of 9 1/2\" DC"}, {"label": "Combined Load (Rotary Table + Setback)", "value": "8100 kN (1,800,000 lbs)"}]}, {"title": "Draw Works", "rows": [{"label": "Model / Type", "value": "JC70DB / VFD Drive"}, {"label": "Horsepower Rating", "value": "2680 HP"}, {"label": "Max. Line Pull", "value": "485 kN"}, {"label": "Drilling Line Diameter", "value": "38 mm (1 1/2\")"}, {"label": "Auxiliary Brake", "value": "Dynamic brake via AC motor (primary braking system)\nHydraulic disc brake (secondary braking system)"}]}, {"title": "Top Drive", "rows": [{"label": "Model", "value": "TDS-11SH"}, {"label": "Horsepower Rating", "value": "1100 HP"}, {"label": "Capacity", "value": "500 ton"}, {"label": "Drilling Speed (RPM)", "value": "0 to 228 rpm continuous"}, {"label": "Max. Continuous Torque", "value": "51,000 ft·lbs (69,147 N·m)"}, {"label": "Drill Pipe Range", "value": "3 1/2\" to 6 5/8\""}]}, {"title": "Traveling Block", "rows": [{"label": "Model", "value": "YC450"}, {"label": "Max. Static Hook Load", "value": "4500 kN (1,000,000 lbs)"}, {"label": "Sheave Quantity", "value": "6 × Φ1524 mm (60\")"}]}, {"title": "Crown Block", "rows": [{"label": "Model", "value": "TC450"}, {"label": "Max. Static Hook Load", "value": "4500 kN (1,000,000 lbs) @ 12 lines"}, {"label": "Sheave Quantity", "value": "6 × 60\" main sheave + 1 × 70\" fast sheave"}]}, {"title": "Rotary Table", "rows": [{"label": "Type", "value": "ZP375"}, {"label": "Table Opening", "value": "Φ952.5 mm (37 1/2\")"}, {"label": "Insert Bushing", "value": "Insert Bowl (2 3/8\" – 8 5/8\")\nInsert Bowl (9 5/8\" – 10 3/4\")\nInsert Bowl (11 3/4\" – 13 3/8\")\n30\" Split for running 18 5/8\" or 20\" casing"}]}, {"title": "Iron Roughneck", "rows": [{"label": "Type", "value": "ST-100"}, {"label": "Operating Pressure", "value": "2,500 psi (172 bar)"}, {"label": "Torque Tubular Range", "value": "3 1/2\" to 9 3/4\" (Tubular Diameter)\n4\" to 9 3/4\" (Tool Joint Diameter)"}]}, {"title": "Engine & Generator", "rows": [{"label": "Engine Type", "value": "5 × CAT 3512C"}, {"label": "Engine Horsepower Rating", "value": "1101 bkW (1476 bhp)"}, {"label": "Generator Type", "value": "SR4B"}, {"label": "Generator Rating", "value": "1750 KVA"}, {"label": "Voltage / Frequency", "value": "600 V / 60 Hz"}, {"label": "Control Unit", "value": "AC VFD drive system"}, {"label": "Air Compressor", "value": "Atlas Copco (GA 75+)"}]}, {"title": "Dead Line Anchor", "rows": [{"label": "Model / Type", "value": "JZG41 / Horizontal"}, {"label": "Max. Deadline Pull", "value": "410 kN"}]}, {"title": "Well Control", "rows": [{"label": "Double Ram BOP", "value": "CAMERON 13 5/8\" 10K"}, {"label": "Single Ram BOP", "value": "CAMERON 13 5/8\" 10K"}, {"label": "Annular BOP", "value": "CAMERON 13 5/8\" 5K"}, {"label": "BOP Control Unit", "value": "SARA SAE"}, {"label": "Choke Manifold", "value": "WOM"}]}, {"title": "Mud Tank System", "rows": [{"label": "Shale Shaker", "value": "4 Nos Axiom – AX-1"}, {"label": "Active Mud System", "value": "1500 bbl"}, {"label": "Reserve Mud System", "value": "4 × 2000 bbl"}, {"label": "Water Tanks", "value": "2 × 500 bbl"}, {"label": "Trip Tank", "value": "2 × 50 bbl"}, {"label": "Stripping Tank", "value": "5 bbl"}]}, {"title": "Mud Pumps", "rows": [{"label": "Model / Type", "value": "HHF-1600HL / Triplex, Single acting"}, {"label": "Horsepower Rating", "value": "1600 HP"}, {"label": "Pressure Rating", "value": "7500 psi with 4 1/2\" liner"}, {"label": "Relief Valve", "value": "NOV Titan Class RX 36000-02 & -03"}, {"label": "Pulsation Dampener", "value": "Hydril K20, 7500 psi"}, {"label": "Standpipe Pressure", "value": "7500 psi"}, {"label": "Cement Manifold", "value": "10000 psi"}]}, {"title": "Power Slip", "rows": [{"label": "Make / Type", "value": "NOV / PS-21"}]}, {"title": "Additional Equipment", "rows": [{"label": "Mast / Substructure hydraulic raising/lowering system", "value": ""}, {"label": "Anti-Collision System", "value": ""}, {"label": "Soft Torque Rotary System", "value": ""}, {"label": "Fast Moving Rig", "value": ""}]}]}$spec$)
) as s(name, spec) on s.name = u.name
on conflict (unit_id) do nothing;
