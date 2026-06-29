# Integration spec — AEMP P&ID & BOP Studio

This documents (A) the **Supabase backend** the frontend already talks to, and
(B) the **AEMP API contract** the AEMP backend team still needs to supply to
replace the cache/stub with the live system of record (PRD §16.1).

---

## A. Supabase backend (Phase-1, implemented)

**Project:** `reutvufibeezhknxdudc` (Wce-system) · region ap-northeast-1.
**Client:** `@supabase/supabase-js` via `src/lib/supabase.ts`, using the
**publishable (anon) key** from `.env.local`:

```
VITE_SUPABASE_URL=https://reutvufibeezhknxdudc.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_…
```

Schema: see `supabase/migrations/0001_initial_schema.sql` (already applied).

### Tables

| Table | Purpose | Key columns |
|---|---|---|
| `projects` | Saved P&ID projects (FR-59). Full document stored as JSONB. | `id`, `rig_name`, `reference_date`, `inspector`, `revision`, `data jsonb`, `updated_at` |
| `equipment` | AEMP-equivalent WCE register; read model for import (FR-36/37). Seeded with the 172-row Rig 303 dataset (10 systems). | `rig_name`, `tag`, `type`, `section`, `description`, `rwp`, `size`, `manufacturer`, `serial`, `int_last`, `int_due`, `maj_last`, `maj_due` |

### Code paths
- `src/lib/cloud.ts` — `saveProjectCloud`, `listProjectsCloud`, `loadProjectCloud`, `fetchEquipmentCloud`.
- `src/lib/aemp.ts` `importFromAEMP()` priority: **live endpoint → Supabase `equipment` → embedded cache.**
- UI: header **☁ Cloud** panel (save/open), **Import from AEMP** pulls from Supabase.

### Seeding
```
node --env-file=.env.local scripts/seed-equipment.mjs
```

### ⚠️ Security (must change before production)
RLS is enabled but uses **demo policies that allow anonymous CRUD** so the
keyless demo works. Production must:
1. Authenticate via **AEMP SSO** (Supabase `authenticated` role or JWT from AEMP).
2. Replace `demo_anon_*` policies with **per-rig, per-role** policies (Admin/Field/Manager, PRD §4/§7.2).
3. Seed `equipment` with a **service-role** key in CI, not the anon key.
4. Never expose a service-role key in the frontend bundle.

---

## B. AEMP API contract still required (blocker — PRD §16.1)

The live `window.AEMP_ENDPOINT` path in `importFromAEMP()` is a **stub**. To go
live against `einspection.abrajenergy.com`, the AEMP team must provide:

### B1. Equipment read endpoint (FR-36)
- **URL** + method (e.g. `GET /api/equipment?rig=305`).
- **Auth:** SSO/token scheme and header (`Authorization: Bearer …`?), per-rig authorisation.
- **Payload schema** — the frontend `AempAsset` shape it must map to:

```ts
interface AempAsset {
  type: string;          // symbol key or mappable equipment type
  section: string;       // system, e.g. "BOP/Kill/Choke"
  description: string;
  tag: string;           // links to placed symbols (FR-37)
  rwp: string;           // rated working pressure (psi)
  size: string;
  manufacturer: string;
  serial: string;
  int_last: string;      // ISO yyyy-mm-dd ('' if none)
  int_due: string;
  maj_last: string;
  maj_due: string;
}
```

### B2. Symbol-type mapping table (FR-43, §9)
Confirm the **tag-prefix → symbol-type** rules (e.g. `PG/PT → gauge`,
`LPR/TPR → dram`, `ISR → sram`, `PRV → relief`). Current client defaults to
`gate` where unknown (`sectionForTag()` in `aemp.ts`).

### B3. Write-back (optional, FR-38)
Decide whether the module writes inspection/as-built updates back to AEMP, or
AEMP stays read-only system of record. If write-back: endpoint + payload + auth.

### B4. CSV import column format (FR-28)
The exact AEMP-compatible column order for register CSV export/import.

---

## C. Data model reference
See `src/types.ts` (`Project`, `Component`, `Pipe`, `BopScheme`, `AempAsset`) —
the canonical client shapes that both backends must satisfy.
