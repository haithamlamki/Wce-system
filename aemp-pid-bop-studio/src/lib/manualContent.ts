// ============================================================================
//  Generated in-app documentation (FR — user manual + symbols manual).
//  Authored as HTML so the same source renders in the Help view and prints.
// ============================================================================
import { SYM, SYM_ORDER, type SymbolKey } from './symbols';

export const USER_MANUAL_HTML = `
<h1>AEMP P&amp;ID &amp; BOP Studio — User Manual</h1>
<p>This studio builds a rig's High-Pressure Well Control (HPWC) P&amp;ID once, links every
symbol to a real inspectable asset, and produces a BOP elevation and a live equipment register.</p>

<h2>1. Roles</h2>
<ul>
  <li><b>Admin / Manager</b> — build and edit the master P&amp;ID, the equipment sheet and the BOP; save drafts and <b>publish</b> the final sheet.</li>
  <li><b>End user (Field)</b> — <b>read-only</b>: views the published final P&amp;ID, equipment sheet and 2D/3D models, prints/exports, and reads/downloads manuals. No edits.</li>
</ul>

<h2>2. Getting started</h2>
<ol>
  <li>On first open, set the <b>reference date, rig and inspector</b> (date-first modal). The reference date drives all inspection status.</li>
  <li>Use <b>P&amp;ID Full → Build Full P&amp;ID</b> to place the rig master, or <b>Import from AEMP</b> / <b>Import drawing…</b>.</li>
  <li>Switch <b>Admin / Field</b> in the header (Field is locked for end users).</li>
</ol>

<h2>3. Building the P&amp;ID (Admin)</h2>
<ul>
  <li><b>Place</b>: click a palette symbol to place &amp; approve, or drag it onto the canvas. Search/collapse the palette by category.</li>
  <li><b>Edit</b>: select to move (snap), connect (ports), rotate/flip/scale/duplicate; multi-select, align, distribute, group, lock; undo/redo.</li>
  <li><b>Tag</b> each item and set inspection dates in the properties panel so it links to AEMP and shows status.</li>
  <li><b>Clear canvas</b> removes all equipment <i>and</i> piping.</li>
  <li><b>Validation</b>: the ⚠ panel flags overlaps, dangling/duplicate connections and untagged critical gear; click an issue to zoom to it.</li>
</ul>

<h2>4. Equipment Sheet</h2>
<ul>
  <li>Live register with search, status filter and summary counters.</li>
  <li>Admin: per-row <b>show/remove</b> (as-built) and <b>delete</b>; import CSV/XLSX or from AEMP.</li>
  <li>Everyone: <b>Export CSV</b> and <b>Export Excel</b> (P&amp;ID + equipment in one workbook).</li>
  <li><b>view ▸</b> jumps to the item on the diagram.</li>
</ul>

<h2>5. BOP Scheme</h2>
<ul>
  <li>Scaled elevation from the <b>datum</b> to the <b>rotary table (RKB)</b>; metres/feet; clearance-to-RT.</li>
  <li><b>AI-build</b> by hole section builds the vertical stack plus the <b>choke</b> and <b>kill</b> side-valve branches.</li>
  <li>Editable component heights; hover for serial/dates/status.</li>
</ul>

<h2>6. Save, draft &amp; publish</h2>
<ul>
  <li><b>File ▾</b> menu: Save/Open <code>.json</code>, Export CSV/Excel, Print P&amp;ID/BOP.</li>
  <li>Admin: <b>Save as draft</b> (work in progress) and <b>Publish final sheet</b> — end users on that rig then see the published version.</li>
  <li><b>☁ Cloud</b> keeps revision history; restore any earlier revision.</li>
</ul>

<h2>7. Manuals &amp; Help</h2>
<p>This Help page holds the User Manual and the Symbols Guide. Admins upload rig manuals here;
everyone can view and download them.</p>
`;

const CATEGORY_NOTES: Record<string, string> = {
  'BOP Stack': 'Blowout-preventer stack components — annular, ram preventers and the mud cross / drilling spool.',
  'Wellhead & Tree': 'Wellhead and Christmas-tree assemblies at the well.',
  'Valves': 'Flow-control valves: gate, butterfly, plug, HCR (hydraulic), check/NRV, adjustable choke, FOSV/Kelly cock, 4-way and relief.',
  'Manifold': 'Manifolds, spools/pipe and flexible (coflex) hoses.',
  'Mud System': 'Mud handling — pumps, tanks, shakers, agitators, hopper, gas separator and degasser.',
  'Koomey': 'BOP control / accumulator (Koomey) unit, HPU and regulators.',
  'Instruments': 'Pressure gauges and gas / H₂S monitors.',
};

const COLOUR_FAMILY = `
<h2>Identity colours</h2>
<ul>
  <li><b style="color:#cf3a30">Red</b> — BOP &amp; well-control valves</li>
  <li><b style="color:#2f8b55">Green</b> — wellhead / tree</li>
  <li><b style="color:#3270b2">Blue</b> — accumulator / HPU / pumps / MGS</li>
  <li><b style="color:#8d9dab">Steel</b> — spools / manifolds / control</li>
  <li><b style="color:#e6a829">Yellow</b> — shaker / gas monitor</li>
</ul>
<p>A separate <b>status ring</b> shows inspection state (in-date / due / overdue) independently of identity colour.</p>
`;

/** Build the Symbols Guide HTML from the live symbol library. */
export function symbolsGuideHtml(): string {
  let html = `<h1>Symbols Guide</h1>
<p>The library is illustrated, colour-coded and theme-stable. Each symbol carries a unique key,
display name, category, identity colour and four N/E/S/W connection ports.</p>${COLOUR_FAMILY}`;

  for (const cat of SYM_ORDER) {
    const keys = (Object.keys(SYM) as SymbolKey[]).filter((k) => SYM[k].cat === cat);
    if (!keys.length) continue;
    html += `<h2>${cat}</h2>`;
    if (CATEGORY_NOTES[cat]) html += `<p>${CATEGORY_NOTES[cat]}</p>`;
    html += '<ul>';
    for (const k of keys) {
      const s = SYM[k];
      html += `<li><b>${s.name}</b> <span style="color:#8d9dab">(${k})</span>${s.custom ? ' — custom' : ''}${s.defaults?.size ? ` · default size ${s.defaults.size}` : ''}</li>`;
    }
    html += '</ul>';
  }

  html += `
<h2>Building a new symbol</h2>
<p>In Admin, open <b>P&amp;ID Full → ⊞ Symbol library → ＋ Draw new symbol</b>. Use the rectangle,
ellipse, line and polygon tools (set stroke, fill and width), give it a name, category, width/height
and identity colour, then <b>Save symbol</b>. It joins the palette and the library immediately and is
saved with the project.</p>

<h2>Importing symbols</h2>
<p>In the Symbol library, <b>⤓ Import</b> accepts a custom-symbols <code>.json</code> file (exported
from another project) or a raw <code>.svg</code> file (its viewBox sets the size). Imported symbols
are added as custom symbols.</p>

<h2>Exporting symbols</h2>
<p><b>⤒ Export</b> downloads all custom symbols as a <code>.json</code> file you can import elsewhere.
Built-in symbols are always present and need no export.</p>
`;
  return html;
}
