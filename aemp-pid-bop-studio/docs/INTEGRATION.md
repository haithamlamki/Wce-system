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
| `project_versions` | Append-only revision snapshots (FR-59, migration `0005`). Authenticated read+insert only. | `id`, `project_id` (FK→projects, cascade), `revision`, `note`, `data jsonb`, `created_by`, `created_at` |
| `equipment` | AEMP-equivalent WCE register; read model for import (FR-36/37). Seeded with the 172-row Rig 303 dataset (10 systems). | `rig_name`, `tag`, `type`, `section`, `description`, `rwp`, `size`, `manufacturer`, `serial`, `int_last`, `int_due`, `maj_last`, `maj_due` |
| `profiles.points` + `leaderboard()` RPC | Crew leaderboard (FR-54, migration `0004`). SECURITY DEFINER RPC returns name/points/rig only. | `profiles.points`, `public.leaderboard()` |

### Code paths
- `src/lib/cloud.ts` — `saveProjectCloud`, `listProjectsCloud`, `loadProjectCloud`, `fetchEquipmentCloud`.
- `src/lib/aemp.ts` `importFromAEMP()` priority: **mock → live endpoint → Supabase `equipment` → embedded cache** (live/mock mapped via `mapAempRecords` + field map; see §B).
- UI: header **☁ Cloud** panel (save/open), **Import from AEMP** pulls from Supabase.

### Seeding
```
node --env-file=.env.local scripts/seed-equipment.mjs
```

### Auth & RLS (gap now closed — migration `0002`)
Anonymous CRUD has been **removed**. Current state:
- **`profiles`** table (one per `auth.users`), with a `user_role` enum
  (`admin` / `field` / `manager`) and an auto-create trigger on sign-up.
- **`projects`**: authenticated read/insert/update; owner-only delete (`created_by`).
- **`equipment`**: authenticated read; **admin-only** writes.
- Frontend: `src/state/AuthContext.tsx` + `src/components/Auth.tsx` — email/password
  sign-in/up gate; the header shows the user + role; **Field role cannot enter
  Admin edit** (FR-6). Sign-up creates a `field` user.

**Promote a user to admin** (run after they register):
```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

Verified: the anon key now sees **0** equipment rows and project inserts are
rejected by RLS.

### Per-rig authorization (migration `0003`)
Field users are scoped to their assigned `profiles.rig`; **admins & managers see
all rigs**. SECURITY DEFINER helpers `my_role()`, `my_rig()`, `is_privileged()`
back the policies:
- `projects` read/insert/update scoped to the user's rig (delete = owner only).
- `equipment` read scoped to the user's rig; writes admin-only.
- UI: the header account chip has a **rig selector** that writes `profiles.rig`
  (`AuthContext.updateRig`). Privileged users see "All rigs".

### Still required for production
1. Replace email/password with **AEMP SSO** (JWT from AEMP → Supabase) — PRD §7.2.
2. Seed `equipment` with a **service-role** key in CI, not the anon key.
3. If email confirmation is enabled on the project, either confirm via email or
   disable it in Supabase → Auth settings for internal use.
4. Consider multi-rig assignments (a join table) if crews cover several rigs;
   current model is one rig per profile.

### Server-side data model (Prisma)
`prisma/schema.prisma` mirrors the DB and binds to the provided
`DATABASE_URL` (pooled) / `DIRECT_URL` (direct) — the foundation for the future
AEMP-side API (FR-48). It is **not** imported by the browser app.
```bash
# Prisma reads .env — copy the two URLs there first (gitignored), then:
npm run db:pull       # introspect the live DB via DIRECT_URL
npm run db:generate   # generate the typed client
```

---

## B. AEMP API contract still required (blocker — PRD §16.1)

The client adapter is now **built and configurable** — `importFromAEMP()`
priority is **mock → live endpoint → Supabase `equipment` → embedded cache**, and
live/mock records are passed through a **field map** (`mapAempRecords`) so AEMP's
own field names need not match ours. What remains is for the AEMP team to supply
the endpoint, auth, and (if names differ) the field map. Configure via env:

```
VITE_AEMP_ENDPOINT=https://einspection.abrajenergy.com/api/equipment   # live URL
VITE_AEMP_TOKEN=<bearer token>                                         # or via SSO
VITE_AEMP_FIELDMAP={"tag":"equipmentTag","serial":"serialNo",...}      # source→internal
VITE_AEMP_MOCK=true                                                    # exercise the live path offline
```

The endpoint may return a bare array or a `{ items|equipment|data: [...] }`
envelope. **Try it today:** set `VITE_AEMP_MOCK=true` and click **Import from
AEMP** — the bundled mock (`src/lib/data/aemp-mock.ts`, deliberately foreign
field names) flows through the adapter, proving the mapping. See `aemp.test.ts`.

### B1. Equipment read endpoint (FR-36)
- **URL** + method (e.g. `GET /api/equipment?rig=305`).
- **Auth:** SSO/token scheme and header (`Authorization: Bearer …`?), per-rig authorisation.
- **Payload schema** — the frontend `AempAsset` shape records are mapped to
  (supply `VITE_AEMP_FIELDMAP` if AEMP's names differ):

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
