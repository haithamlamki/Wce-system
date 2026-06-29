# Product Requirements Document
## Abraj Equipment Master Pro — P&ID & BOP Studio (Well Control Equipment module)

| | |
|---|---|
| **Product** | P&ID & BOP Studio — a module of Abraj Equipment Master Pro (AEMP) |
| **Owner** | Abraj Energy Services (AEMP platform team) |
| **Document status** | Draft v1.0 (for build) |
| **Prepared from** | Working interactive prototype (`rig_pid_bop_studio.html`) + Rig 305 HPWC source drawing |
| **Prepared by** | — |
| **Date** | — |

---

## 1. Executive summary

P&ID & BOP Studio is a web module inside Abraj Equipment Master Pro (AEMP) that lets an **administrator build a master Piping & Instrumentation Diagram (P&ID)** for a rig's High-Pressure Well Control (HPWC) system **once**, and lets **field crews adjust it to their actual rig and read live inspection status** by hovering over equipment. It also produces a **BOP stack-up elevation scheme** and feeds a **live equipment inspection register** that maps directly to AEMP's existing inspection data.

The goal is to replace static, manually-drawn AutoCAD/Excel P&IDs (e.g. *Abraj # 305 HPWC 001*) with a living, data-linked diagram where every symbol is tied to a real, inspectable asset (tag, serial, RWP, size, manufacturer, intermediate/major inspection dates) — and where compliance status (in-date / due / overdue) is visible at a glance on the diagram, in a register, and on a BOP elevation.

A working single-file browser prototype already demonstrates the full UX. This PRD specifies the **production system** to be built and integrated into AEMP.

---

## 2. Goals, objectives & success metrics

### 2.1 Business goals
- Standardise HPWC P&IDs across the rig fleet from a single master template per rig.
- Cut the time to produce/update a rig P&ID from days (manual CAD) to minutes (adjust master).
- Make well-control inspection status continuously visible to crews and management.
- Improve inspection compliance (fewer overdue WCE items) through visibility and light gamification.

### 2.2 Product objectives
- One-click load of the exact rig master P&ID with equipment, tags and piping in place.
- Hover-to-inspect on any equipment item (serial, description, last/next inspection, status).
- Field "as-built" trimming (installed / removed) without altering the admin master.
- BOP stack-up elevation with adjustable datum-to-rotary-table reference.
- Bi-directional integration with AEMP equipment + inspection records.

### 2.3 Success metrics (KPIs)
- ≥ 90% of active rigs have a maintained digital master P&ID within 2 quarters.
- ≥ 95% of WCE items on each diagram carry a tag linked to an AEMP asset.
- Reduction in overdue WCE inspections (baseline vs. 6 months post-launch).
- Time-to-produce a rig P&ID < 30 minutes for an admin from master.
- Field adoption: ≥ 70% of rig crews open the diagram monthly.

---

## 3. Background & context

- **Operator / context:** Abraj Energy Services — drilling & well services (Oman). HPWC = High-Pressure Well Control equipment (BOP stack, kill/choke lines, choke manifold, standpipe, Koomey/accumulator unit, mud pumps & mud system, cement lines, instruments).
- **AEMP (Abraj Equipment Master Pro):** Abraj's existing, live equipment-inspection platform (≈1 year in production) at `einspection.abrajenergy.com`. It is the **system of record** for equipment, serials, and inspection dates. This module integrates into it.
- **Source drawings:** Rig master P&IDs exist as CAD/Excel/PDF (e.g. *Rig 305 HP Well Control Equipment*, drawing *Abraj # 305 HPWC 001*) and as an interactive HTML rendering. These define the authoritative equipment layout, tags and piping.
- **Reference inspection dataset:** Rig 303 WCE inspection sheet — 172 components across 10 systems (BOP/Kill/Choke, Choke Manifold, Koomey Unit, Mud Pumps 1–3, Ground & Standpipe Manifolds, Cement Lines, Instruments) — each with RWP, size, manufacturer, serial, and intermediate/major inspection dates. Used to validate the data model.

---

## 4. Personas & roles

| Role | Description | Key permissions |
|---|---|---|
| **Administrator** (drawing owner / WCE engineer) | Builds and maintains the master P&ID for a rig. Tags equipment, places/edits symbols, defines the BOP scheme. | Full edit: build master, add/move/delete symbols, change symbol type/rotation/scale, tag, set inspection dates, build BOP, import/export. |
| **Field Inspector / Crew (end user)** | Uses the master on a specific rig. Marks items installed/removed to match reality, reads inspection status, inspects items. | View + as-built: toggle installed/removed, hover inspection details, jump to overdue items, account & rewards. No edit of the master geometry. |
| **Manager / Viewer** | Oversight of compliance across rigs. | Read-only dashboards, register, export. |
| **System / Integrator** | AEMP backend & data sync. | API access for equipment + inspection sync. |

---

## 5. Scope

### 5.1 In scope
- Master P&ID authoring (admin) and as-built adjustment (field).
- Illustrated, colour-coded WCE symbol library + admin symbol controls.
- Equipment register with live inspection status and export.
- BOP stack-up elevation scheme.
- Exact-layout import from existing rig drawings.
- AEMP equipment & inspection integration (import/sync/export).
- Hover inspection tooltips, status engine, theming (light/dark/auto).
- 3D isometric presentation view.
- Account page with stewardship rewards (gamification).
- AI assistant for diagram drafting (phased).

### 5.2 Out of scope (initial release)
- Full volumetric 3D/CAD modelling of equipment.
- Real-time multi-user co-editing (concurrent cursors).
- Mobile-native apps (responsive web only at launch).
- Procurement / inventory management beyond inspection linkage.

### 5.3 Phasing summary
- **Phase 0 — Prototype (done):** single-file browser app proving the full UX.
- **Phase 1 — Core production:** auth/roles, AEMP data integration, master authoring, register, status engine, persistence in AEMP.
- **Phase 2 — Layout pipeline & BOP:** exact-layout import service, BOP scheme, exports.
- **Phase 3 — Engagement & intelligence:** rewards (real leaderboard), 3D view, AI assistant.

---

## 6. System overview

The product has three primary working surfaces plus supporting pages:

1. **P&ID Full** — the master diagram canvas (build / adjust / inspect).
2. **BOP Scheme** — vertical elevation stack-up with datum & rotary-table references.
3. **Equipment Sheet** — the live inspection register/table.
4. **Account** (end user) — profile, preferences, and the stewardship rewards dashboard.

Cross-cutting: onboarding, Admin/Field mode switch, theming, AEMP import/export, save/load.

---

## 7. Functional requirements

> Requirements are written as: **[FR-x]** *Statement.* Acceptance criteria are listed where useful. "Prototype" notes mark behaviour already demonstrated.

### 7.1 Onboarding & project setup
- **[FR-1]** On first open, the user sets **inspection/reference date, rig/unit, and inspector name** before building. *(Prototype: date-first modal.)*
- **[FR-2]** The reference date drives all status calculations (in-date / due / overdue).
- **[FR-3]** A persistent **project chip** in the header shows rig + date and is editable.
- **[FR-4]** Starting a new project on an empty canvas auto-loads the rig's master P&ID layout.

### 7.2 Authentication, roles & account *(production — not in prototype)*
- **[FR-5]** Users authenticate via AEMP SSO; role (Admin / Field / Manager) is derived from AEMP.
- **[FR-6]** The **Admin/Field mode** switch is gated by role; Field users cannot enter Admin edit.
- **[FR-7]** An **account page** (opened from the header avatar) shows profile (name, role, rig), theme preference, "edit profile", and the rewards dashboard.

### 7.3 P&ID Full builder (admin)
- **[FR-8]** Admin can **build the full master P&ID in one click**, placing all equipment in the rig's real positions with piping. *(Prototype: from extracted Rig 305 geometry.)*
- **[FR-9]** Admin can place symbols by **click-to-place (auto-position + approve)** or drag-from-palette. *(Prototype.)*
- **[FR-10]** Admin can **move, delete, and connect** equipment; connections (piping) render as routed lines.
- **[FR-11]** Canvas supports **pan, wheel-zoom, fit-to-view, snap-to-grid**, and an engineering **title block + piping legend** overlay.
- **[FR-12]** Each item has editable properties: **tag, description, system, RWP (psi), size, manufacturer, serial, intermediate last/due, major last/due**.
- **[FR-13]** Piping supports colour by line type (suction, discharge, choke, kill, interconnect).

### 7.4 Symbol library & admin symbol controls
- **[FR-14]** A library of **illustrated, colour-coded WCE symbols** is provided (see §10), grouped by category (BOP Stack, Wellhead & Tree, Valves, Manifold, Mud System, Koomey, Instruments).
- **[FR-15]** Symbols are colour-coded by family (red = BOP & well-control valves, green = wellhead/tree, blue = accumulator/HPU/pumps/MGS, steel = spools/manifolds/control, yellow = shaker/gas monitor) with a small **status ring** showing inspection state independently of identity colour.
- **[FR-16]** Admin can **change/swap** a placed item's symbol via a picker without losing its data. *(Prototype.)*
- **[FR-17]** Admin can **rotate (90° steps), flip, scale (40–240%), and duplicate** a symbol; transforms are reflected in ports, connections, selection, and fit. *(Prototype; keyboard R / D.)*
- **[FR-18]** An **"apply to all of this type"** option performs the rotate/scale/swap across every item of the same type. *(Prototype.)*
- **[FR-19]** *(Production)* Admin can request **new symbol types** to be added to the library (governed set; see Open Questions on the symbol legend).

### 7.5 Field (as-built) mode & hover inspection
- **[FR-20]** In **Field mode** the palette and edit tools are hidden; the diagram becomes a pan-and-read reference. *(Prototype.)*
- **[FR-21]** Field user **clicks an item to toggle installed / removed** ("as-built"); removed items fade and are flagged in the register/export. *(Prototype.)*
- **[FR-22]** Hovering any item shows a **tooltip**: tag, symbol name, description, serial, RWP/size, **last inspection, next due, and colour-coded status** (and a "removed" flag if applicable). *(Prototype.)*
- **[FR-23]** As-built changes are stored as an overlay and **do not modify the admin master**.

### 7.6 Equipment Sheet (register)
- **[FR-24]** A live table lists **every component** with tag, symbol, system, RWP, size, manufacturer, serial, intermediate due, major due, status, and on-rig (installed/removed). *(Prototype.)*
- **[FR-25]** Summary counters: total, in-date, due soon, overdue, untagged.
- **[FR-26]** **Search, filter (system/status), and sortable columns**. *(Prototype.)*
- **[FR-27]** A row links back to the item on the diagram ("view ▸"). *(Prototype.)*
- **[FR-28]** **Export to CSV** in an AEMP-compatible column layout. *(Prototype; mapping to be confirmed — see §11.)*

### 7.7 Inspection status engine
- **[FR-29]** Status is computed per item from `int_due`/`maj_due` vs the reference date: **Overdue** (past due), **Due Soon** (≤ 60 days), **In Date**, **Untagged** (no tag). *(Prototype; 60-day window configurable.)*
- **[FR-30]** Status drives symbol status-ring colour, register badges, BOP scheme colour, and rewards/compliance metrics.

### 7.8 BOP Scheme (elevation)
- **[FR-31]** A **vertical stack-up elevation** renders from an adjustable **zero datum** up to the **rotary table (RKB)**; both elevations are user-editable. *(Prototype.)*
- **[FR-32]** Units switch between **metres and feet** (values convert). *(Prototype.)*
- **[FR-33]** **Auto-build by hole section** (26″, 17½″, 12¼″, 8½″) generates the stack (wellhead, mud cross, rams, annular) with kill/choke detail and standard tags. *(Prototype.)*
- **[FR-34]** Each component has an editable **height**; the scheme draws to scale with an **elevation axis**, top-of-stack and **clearance-to-RT dimension**.
- **[FR-35]** Hover shows component details and inspection status; stack pulls real serials/dates where tags match.

### 7.9 AEMP integration
- **[FR-36]** **One-click "Import from AEMP"** pulls the rig's full equipment list (tag, serial, RWP, size, manufacturer, inspection dates) into the project. *(Prototype: live-endpoint hook is **stubbed and untested** — `window.AEMP_ENDPOINT` with no auth/schema — and falls back to an embedded offline cache. The cache is the **Rig 303** 172-component inspection dataset; the canvas geometry is **Rig 305**. Live AEMP integration is unproven pending the API contract — see §16.1.)*
- **[FR-37]** Imported equipment **links by tag** to placed symbols, populating their inspection data.
- **[FR-38]** *(Production)* Changes to inspection dates sync back to AEMP (or AEMP remains source-of-record and the module reads on load and on demand).
- **[FR-39]** *(Production)* Configurable AEMP endpoint, auth token, and field mapping.

### 7.10 Exact-layout import pipeline *(production service)*
- **[FR-40]** A service ingests a rig's existing drawing (interactive HTML / vector PDF / CAD export) and produces a **layout template**: equipment with type, tag, x/y, plus piping polylines with colour.
- **[FR-41]** The template becomes the rig's **master start point** (every new project for that rig starts here).
- **[FR-42]** The pipeline maps source equipment to library symbol types and preserves the **exact relative positions and piping** of the source. *(Prototype proved this by executing the rig's own layout code to recover geometry.)*
- **[FR-43]** *(Open)* A **symbol-type mapping table** (tag prefix → exact valve type) refines auto-mapping where the source legend is graphical/unreadable.

### 7.11 3D isometric view
- **[FR-44]** A **3D toggle** renders the P&ID as an isometric scene: equipment stands on a tilted ground plane with drop shadows, piping on the ground in colour, back-to-front layering. *(Prototype: 2.5D billboarded projection.)*
- **[FR-45]** 3D is a **presentation mode** (pan + hover; editing disabled).
- **[FR-46]** *(Optional, future)* Extrude tall vessels (tanks, accumulators, MGS) into simple 3D solids.

### 7.12 AI assistant *(phased)*
- **[FR-47]** A natural-language assistant drafts/extends diagrams ("draw a 10k BOP stack with kill & choke lines") and lays out components. *(Prototype: preview, with deterministic BOP fallback.)*
- **[FR-48]** *(Production)* Runs against AEMP's own model/back-end rather than a public endpoint.

### 7.13 Rewards / gamification (Well Control Steward)
- **[FR-49]** Rewards live on the **end-user account page** (opened from the avatar). *(Prototype.)*
- **[FR-50]** **Points** are earned from real work: +10 tag a component, +5 add due dates, +8 keep an item in-date, +30 build a BOP scheme, +50 load the master P&ID. *(Values configurable.)*
- **[FR-51]** **Tiers**: Bronze → Silver → Gold → Platinum → Diamond Steward, with progress to next tier.
- **[FR-52]** **Trophy cabinet** of achievements unlocked by milestones (first tag, fully tagged, all-clear/no overdue, stack builder, compliance pro, perfect stack, etc.).
- **[FR-53]** **Action queue** lists the user's actual overdue/due-soon items with a "fix ▸" jump to the diagram.
- **[FR-54]** **Crew leaderboard** ranks users by points. *(Prototype: seeded; production requires shared backend — see §16.)*
- **[FR-55]** **Redeem points** for a recognition catalogue; redemptions persist.

### 7.14 Theming & accessibility
- **[FR-56]** **Light / Dark / Auto** themes; Auto follows OS preference. Light is default. *(Prototype.)*
- **[FR-57]** Minimum-contrast compliance; status never conveyed by colour alone (status ring + text/badges).

### 7.15 Persistence, save/load, versioning
- **[FR-58]** Projects **autosave** and can be **saved/opened as `.json`**. *(Prototype.)*
- **[FR-59]** *(Production)* Projects persist server-side in AEMP, keyed by rig, with **revision history** (master vs as-built per crew).

---

## 8. Data model (logical)

```
Project
  id, rigId, rigName, referenceDate, inspector, createdBy, revision
  meta { drawingNo, title }

Component (node)
  id, type (symbol key), x, y
  rot, scale, flip                       // admin transforms
  tag, description, system
  rwp, size, manufacturer, serial
  intLast, intDue, majLast, majDue       // inspection dates
  installed (bool, as-built), removed
  aempAssetId (link to AEMP record)

Pipe
  id, points[] (polyline), color, lineType, width

Edge (logical connection, optional)
  id, fromComponentId, toComponentId, color

BOPScheme
  datum, rotaryTable, unit (m|ft)
  items[] { id, type, tag, description, height, serial, dueDates }

Rewards (per user/project)
  points (derived), spent, redeemed[]

AEMPAsset (read model)
  assetId, tag, serial, rwp, size, manufacturer, system,
  intLast, intDue, majLast, majDue, status
```

**Status derivation:** `status = f(intDue, majDue, referenceDate)` → `{inDate | dueSoon | overdue | untagged}`.

---

## 9. Symbol library specification

A governed library of illustrated, scalable (SVG) symbols. The prototype implements **30 symbols** grouped by category (the **Butterfly Valve** below is specified but **not yet drawn** in the prototype — it is a Phase-1 addition):

- **BOP Stack:** Annular BOP, Double Ram BOP, Single Ram BOP, Mud Cross / Spool.
- **Wellhead & Tree:** Wellhead, Xmas Tree.
- **Valves:** Gate Valve, Butterfly Valve *(planned — not in prototype)*, HCR Valve, Check/NRV, Adjustable Choke, FOSV/Kelly Cock, 4-Way Valve, Relief/Pop-off.
- **Manifold:** Manifold, Spool/Pipe, Flex/Coflex Hose.
- **Mud System:** Mud Pump (Triplex), Centrifugal Pump, Mud Tank, Shale Shaker, Agitator, Mud Hopper, Mud Gas Separator, Degasser/Vessel.
- **Koomey:** Accumulator Bottle, Koomey/Control Panel, Hydraulic Power Unit, Regulator.
- **Instruments:** Pressure Gauge, Gas/H₂S Monitor.

**Requirements:**
- Each symbol: unique key, display name, category, base width/height, identity colour, vector artwork, and 4 connection ports (N/E/S/W).
- Symbols must render identically across themes (baked colours) with a separate status indicator.
- A **mapping table** translates source-drawing element types and tag prefixes to symbol keys (e.g. `PG/PT → gauge`, `PM/MP → mud pump`, `LPR/TPR → double ram`, `ISR → single ram`, `PRV → relief`, `ANNULAR → annular`, tank labels → tank). The valve-prefix→type rules need Abraj sign-off (see §16).

---

## 10. Integrations & APIs

### 10.1 AEMP equipment & inspection
- **Read:** fetch rig equipment (tags, serials, ratings, manufacturer, system, inspection dates/status).
- **Write (optional):** push inspection updates / as-built status, or remain read-only with AEMP as source-of-record.
- **Auth:** AEMP SSO / token; per-rig authorisation.
- **Mapping:** field map between AEMP schema and the Component model; CSV/JSON import format aligned to AEMP's import template.

### 10.2 Layout import service
- Accepts rig drawing artefacts; outputs layout template (equipment + piping) — see §7.10.

### 10.3 Export
- CSV (AEMP-compatible), JSON project, and (future) PDF/print of the diagram and BOP scheme.

> **Dependency:** Exact API endpoints, payload schemas, auth method, and the equipment import column format are owned by the AEMP backend team and must be provided to finalise integration.

---

## 11. Non-functional requirements

- **Performance:** smooth pan/zoom and render with 200+ components and full piping; status recompute < 100 ms.
- **Browser support:** latest Chrome/Edge/Safari/Firefox; responsive down to tablet.
- **Offline tolerance:** load from cached master + last-synced AEMP data when offline; sync on reconnect.
- **Security:** SSO, role-based access, audit trail of edits, no client-embedded secrets.
- **Reliability:** autosave; no data loss on disconnect; revision history.
- **Accessibility:** WCAG AA contrast; status not colour-only; keyboard support for core actions.
- **Localization:** English UI; support Arabic labels/RTL in future (Abraj is bilingual).
- **Auditability:** who changed what/when on master and as-built.

---

## 12. Technical architecture (recommended for production)

The prototype is a **single-file client-side app** (HTML/CSS/vanilla JS, SVG rendering, browser-storage persistence). For production inside AEMP:

- **Frontend:** component-based SPA (e.g. React) embedding the SVG canvas engine; keep the symbol library and rendering logic from the prototype as a reusable module.
- **Backend:** AEMP services expose equipment/inspection APIs; a module service stores projects, masters, as-built overlays, BOP schemes, and rewards.
- **Database:** relational store for projects/components/pipes/BOP/rewards keyed by rig and revision.
- **Layout import:** a server-side pipeline/service for drawing → template conversion.
- **Auth:** AEMP SSO; RBAC.
- **Real-time (later):** optional websocket sync for shared leaderboards / multi-viewer.
- **Hosting:** within Abraj's AEMP environment.

---

## 13. Analytics & reporting
- Fleet compliance dashboard (overdue/due/in-date by rig and system).
- Adoption metrics (diagrams maintained, field opens, items tagged).
- Inspection-due forecast (next 30/60/90 days).
- Rewards/engagement metrics.

---

## 14. Roadmap & milestones

| Phase | Scope | Key deliverables |
|---|---|---|
| **0 — Prototype (done)** | Full UX proof | Single-file app: master build, symbols + controls, register, status, BOP, hover, 3D, rewards, account. |
| **1 — Core production** | Auth, data, authoring | AEMP SSO/RBAC; AEMP equipment read; master authoring + register + status; server persistence; CSV export aligned to AEMP. |
| **2 — Layout & BOP** | Fidelity + elevation | Layout import service (exact positions + piping); symbol-type mapping sign-off; BOP scheme; PDF/print export. |
| **3 — Engagement & AI** | Stickiness + assist | Rewards with real shared leaderboard; 3D view; AI assistant on AEMP model; analytics dashboards. |

---

## 15. Acceptance criteria (representative)

- **Master build:** Admin loads a rig master in ≤ 3 clicks; equipment positions and piping match the source drawing within agreed tolerance; all items carry tags linked to AEMP.
- **Field inspect:** Hovering any item shows correct serial and next-due pulled from AEMP; status colour matches the register.
- **As-built:** Toggling removed updates register/export without changing the admin master.
- **Status:** Overdue/due/in-date computed correctly against the reference date for all dated items.
- **BOP:** Datum and rotary-table edits rescale the stack; clearance dimension is correct; units convert.
- **Integration:** One-click AEMP import populates equipment for the selected rig from the live endpoint.
- **Rewards:** Points and trophies reflect real project state; redemptions persist; action-queue links resolve to the right item.

---

## 16. Risks, dependencies & open questions

1. **AEMP API & data format (blocker for live integration).** Endpoints, payload schema, auth, and the equipment **import column format** must be supplied by the AEMP backend team. *Until then, import uses an embedded/cached dataset.*
2. **Exact-layout source per rig.** Faithful reproduction needs each rig's drawing in a parseable form (interactive HTML, vector PDF, or CAD export with coordinates). Flattened raster images are insufficient.
3. **Valve symbol-type legend.** Source drawings encode valve types (plug/gate/check/butterfly) graphically; a **tag-prefix → symbol-type mapping table** must be confirmed by Abraj to render exact valve symbols (currently defaults to gate valve where unknown).
4. **Source-of-record & write-back.** Decide whether the module writes inspection updates to AEMP or remains read-only with AEMP authoritative.
5. **Shared leaderboard.** Real cross-user rewards/leaderboard requires the AEMP backend (or shared storage); prototype uses seeded data.
6. **Symbol governance.** Process for approving/adding new symbol types and their colours to the library.
7. **Bilingual / RTL.** Confirm if Arabic UI/labels are required at launch or later.
8. **3D scope.** Confirm whether isometric (2.5D) presentation is sufficient or volumetric extrusion is desired.

---

## 17. Appendix A — Current prototype feature inventory

The Phase-0 prototype (`rig_pid_bop_studio.html`) demonstrates: date-first onboarding; Admin/Field modes; one-click master build with exact Rig 305 layout + coloured piping; click-to-place + approve and drag placement; connect/route piping; 30 illustrated colour-coded symbols; admin symbol controls (change/rotate/flip/scale/duplicate/apply-to-all); per-item properties & tagging; hover inspection tooltips; installed/removed as-built; equipment register with status, search/filter/sort, CSV export; inspection status engine; BOP elevation with datum/RKB, units, auto-build by hole section, editable heights; one-click AEMP import (live hook + cache); 3D isometric view; light/dark/auto theming; save/open JSON + autosave; AI assistant (preview) + auto BOP; account page with Well Control Steward rewards (tiers, trophies, action queue, leaderboard, redeem).

## 18. Appendix B — Glossary

- **HPWC** — High-Pressure Well Control (equipment).
- **BOP** — Blowout Preventer; **Annular**, **Ram** (LPR lower pipe ram, TPR top pipe ram, ISR inter/shear ram).
- **RKB** — Rotary Kelly Bushing / rotary table elevation (rig floor reference).
- **RWP** — Rated Working Pressure (psi).
- **Koomey** — accumulator/control unit for BOP hydraulics; **HPU** hydraulic power unit.
- **MGS** — Mud Gas Separator.
- **FOSV / IBOP / Kelly cock** — full-opening safety / inside BOP valves.
- **HCR** — hydraulically-controlled (remote) gate valve.
- **AEMP** — Abraj Equipment Master Pro (inspection platform / system of record).
- **As-built** — the field crew's installed/removed adjustments to the admin master.
- **Intermediate / Major inspection** — the two recurring WCE inspection intervals tracked per item.
