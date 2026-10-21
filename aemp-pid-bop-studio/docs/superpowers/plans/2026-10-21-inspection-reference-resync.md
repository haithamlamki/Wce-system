# Inspection module — reference re-sync (Oct 2026) using REA

Goal: bring `src/modules/inspection` back to full parity with the live
reference `https://einspection.abrajenergy.com` (Equipment Master Pro), which
has kept evolving since the August parity batches (PRs #17–#24).

Tool: REA (`rea-agents` on npm, repo `morluto/rea`, MIT, v6.7.0, Node ≥24.11 ✓
we have 24.22). Used **read-only** against the reference via the user's own
logged-in Chrome session. Never write to the reference system.

## 1. Review findings (2026-10-21, side-by-side in Chrome)

### Layout — matches
Same shell, same dashboard sections (KPI strip, Compliance & Risk, Planning &
Behaviour, Fleet & Assets, Process & Governance), same Records grouped header.

### Gaps found
| # | Area | Reference | Ours |
|---|------|-----------|------|
| R1 | **Specifications page** (`/specifications`) | Measurement catalog (30 rows: Measurement, Units, Abbreviation, Equipment count) assignable to equipment types; Export / Filters / Columns | Missing — specs are free-form jsonb, no catalog table |
| R2 | **Data drift** | 7,442 scheduled / 11,254 obligations, 405 OEMs, 40 units | 5,798 / 9,841, 371 OEMs, 30 units — Aug import is stale |
| R3 | **Approval state** | 548 pending, 6,894 approved, avg 7.1 d, 706 approved in 30 d | 0 pending, avg "—" (import set everything approved, no approval dates) |
| R4 | Compliance by Rig | % compliant per unit, sorted ascending | Bar values are counts (axis 0–6), not % |
| R5 | Distribution labels | Display names ("Well Control Equipment") | Raw keys (`well_control`) |
| R6 | Overdue Aging | buckets 1-30 / 31-60 / 60+ with axis to 8,000 | Same buckets, verify bucket order + colours |
| R7 | Sidebar | Specifications present; no Shared Documents / Security Management for this user | We show Shared Documents + Security Management — confirm whether reference hides them by role or removed them |
| R8 | Data Quality card | "79% complete" + per-field missing counts (Due date, Serial, Frequency, Manuf. year, OEM) | Card renders, no counts in text extract — verify bars render |
| R9 | Units | Reference has case-duplicate units (`hoist 2`/`Hoist 2`, `flst`/`FLST`) | Decide: mirror as-is or normalise on import |

Pages not yet re-audited: Equipment, Inspections (columns/filters), Approvals,
Equipment Categories, P&ID, Library, Inspection Frequencies, Companies, Units,
record entry form, files drawer, logs.

## 2. How REA is used

| Step | REA workflow | Output we keep |
|------|--------------|----------------|
| A | Website analysis through the logged-in Chrome session | Full route map + per-page component inventory (catches pages the sidebar hides) |
| B | Analyse the reference JS bundle (sourcemaps if served) | Column definitions, form fields + validation, enum labels, role/permission checks |
| C | Network capture (HAR) while clicking through each page read-only | API endpoints + response shapes → exact field list for the data model and re-import |

Artefacts go to the session scratchpad, not the repo, since they may contain
record data.

## 3. Task list

0. **Setup (needs user approval):** `npx rea-agents setup` — registers REA as
   an MCP server in Claude Code config; restart session. Verify package
   provenance (npm `repository` = github.com/morluto/rea ✓).
1. **Audit** — run A/B/C over every reference page; produce a gap matrix
   extending §1 (route × columns × filters × actions × permissions).
2. **R1 Specifications** — migration `0040_insp_specifications` (measurement,
   units, abbreviation; type↔spec join), `SpecificationsView` + route + nav,
   wire spec picker into CatalogView/DataEntryForm. TDD for lib.
3. **R4/R5/R6/R8 dashboard fixes** — RPC returns % per unit; category label
   map; verify aging + data-quality bars. Tests in `compliance.test.ts`.
4. **R7 nav/role parity** — match sidebar to reference per role.
5. **R2/R3 data re-sync** — user exports fresh reference data; extend
   `referenceImport.ts` to (a) upsert by Unit+Serial instead of insert-only,
   (b) carry approval status/approver/approved_at so pending + avg-approval
   KPIs match. Dry-run diff report before writing to prod.
6. **Remaining page gaps** from step 1.
7. **Verify** — `npm run build && npm test`; side-by-side screenshot check of
   every page; KPI numbers must match the reference after re-sync.

## Constraints
- Reference is production: read-only browsing, no form submits, no edits.
- Our Supabase is prod too: migrations and imports need explicit user OK.
- Pre-go-live cleanup still pending from August (SMOKE-AP-001, SMOKE-UP-002,
  smoke-certificate.pdf, inspector@abraj.test).
