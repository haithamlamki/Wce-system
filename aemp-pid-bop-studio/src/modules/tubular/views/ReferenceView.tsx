// ============================================================================
//  Reference — merged Reference + User Manual page (2026-08 UX refresh):
//  API RP 7G tables (classification, band marking, inspection zones, related
//  standards) followed by the per-page system guide and the FAQ, with a
//  jump-to select. Guide text reflects the current UX (floating assistant,
//  topbar Data Entry button, dashboard pie chart).
// ============================================================================
import { useState } from 'react';

const CLASSES: Array<[string, string, string, string]> = [
  ['Premium', '≥ 80% of nominal', '≤ 3% of nominal OD', '#fff'],
  ['Class 2', '≥ 70% of nominal', '≤ 4% of nominal OD', '#facc15'],
  ['Class 3', 'Exceeds Class 2 limits', 'N/A', '#fb923c'],
  ['Scrap', 'No longer fit for service', 'N/A', '#ef4444'],
];

const BANDS: Array<[string, string, string, string]> = [
  ['Premium', 'Two White Bands', 'One centre punch', '#fff'],
  ['Class 2', 'One Yellow Band', 'Two centre punches', '#facc15'],
  ['Class 3', 'One Orange Band', 'Three centre punches', '#fb923c'],
  ['Scrap', 'One Red Band', '—', '#ef4444'],
];

const ZONES: Array<[string, string, string]> = [
  ['Zone A', 'Pipe body', 'Wall thickness & OD wear'],
  ['Zone B', 'Tool joint', 'Box & pin condition'],
  ['Zone C', 'Transition / upset area', 'Inspect carefully'],
];

const STANDARDS: Array<[string, string]> = [
  ['API RP 7G', 'Used drill pipe inspection & classification'],
  ['API Spec 5D', 'New drill pipe specifications'],
  ['API Spec 7', 'Drill collar & rotary drill stem dimensions'],
  ['API Std 5CT', 'Casing & tubing classification'],
];

interface GuideSection { id: string; ico: string; title: string; body: string[] }

const SECTIONS: GuideSection[] = [
  {
    id: 'man-dashboard', ico: '▦', title: 'Dashboard',
    body: [
      'The Dashboard is the live fleet position. Six KPI cards summarise units reporting, contracted quantity and the API RP 7G class mix; three live cards track pipe orders, contracts needing attention and fleet utilization (serviceable ÷ contracted).',
      'Charts break the fleet down: joints per rig (pie), tubular type, class mix, unit and contract variance. The Items Requiring Attention table lists every line that is short of contract, holds scrap, or has joints flagged for inspection.',
      'Use the Filter select to scope everything to a single Rig/Hoist. Figures are computed from the database on every refresh — nothing is hardcoded.',
    ],
  },
  {
    id: 'man-fleet', ico: '⊟', title: 'Tubular Inventory',
    body: [
      'Fleet-Wide view shows a card per unit (click a card to drill into that unit) above the full classification table. Single Unit view scopes the table to one Rig/Hoist.',
      'Each row shows the contract quantity, the four API RP 7G classes, needs-inspection count, computed on-board total, variance and a status badge. The Tubular Filter narrows by category.',
    ],
  },
  {
    id: 'man-entry', ico: '✎', title: 'Data Entry',
    body: [
      'Open Data Entry with the ✎ Data Entry button under the System Online indicator in the top bar (requires the data-entry permission).',
      'Work top to bottom: ① choose your Rig/Hoist, date and tubular; ② enter the classification quantities; ③ record movements, rental date and remarks; then Save Record. Each save is a full audited submission.',
      'On Board Total is always computed (Premium + Class 2 + Class 3 + Scrap) and cannot be typed; Contractually Less shows OK or the shortfall of Premium + Class 2 against contract.',
      'The Existing Records table lists your unit\'s current rows — Edit loads a row back into the form, Delete archives it (history is never destroyed). The Batch Grid Mode toggle opens the Excel-style sheet for whole-month entry.',
      'Spreadsheet Sync parses the monthly workbook; staged imports are previewed and committed on the Import tab with a reconciliation report.',
    ],
  },
  {
    id: 'man-chat', ico: '◈', title: 'AI Assistant',
    body: [
      'The assistant floats at the bottom-right of every Tubular page — click the ◈ bubble to expand it, and minimise it when you\'re done. It never covers the page content while collapsed.',
      'Ask about totals, shortfalls, scrap, inspections, rig comparisons or a specific unit. Every number in an answer is computed from the records your account is authorized to see — the assistant never estimates.',
      'The assistant is read-only; make changes through Data Entry.',
    ],
  },
  {
    id: 'man-contracts', ico: '▤', title: 'Contracts',
    body: [
      'Each card shows a rig\'s client contract with its committed tubular lines. On Hand counts serviceable stock (Premium + Class 2) only; per-line status shows OK, SHORT or MISSING, and the card badge rolls up compliance including expiry (≤30 days shows EXPIRING).',
      'Administrators create and edit contracts through the modal. Draft contracts can be deleted; anything that has been active is archived instead so the history is preserved.',
      'The certificate utility renders a printable classification statement for any unit + tubular from the live records.',
    ],
  },
  {
    id: 'man-map', ico: '◎', title: 'Asset Map',
    body: [
      'Shows Abraj sites, logistics points, rigs and hoists across Oman. Locations are shared database records; administrators can add, edit or remove them (Admin Mode toggle, then click the map or use a marker popup).',
      'The distance calculator, trip cost planner and distance matrix use straight-line (haversine) distances — operational coordinates are never sent to external routing services.',
    ],
  },
  {
    id: 'man-orders', ico: '⛟', title: 'Order Pipe & Tracking',
    body: [
      'The fleet pool lists serviceable stock (Premium + Class 2, minus existing holds) available outside your rig. Submit a request with quantity and priority; an authorized approver reserves stock, and the yard/logistics team advances the order through Picked at Yard and In Transit.',
      'Every stage change is a real, timestamped action by a responsible person — orders never advance automatically. Confirm delivery when the pipe arrives; that is what moves stock onto your rig\'s records. Cancelling releases any reserved stock.',
    ],
  },
  {
    id: 'man-theme', ico: '☀/☾', title: 'Theme',
    body: [
      'Use the topbar toggle to pick Light, Dark or Auto. Auto follows your device\'s light/dark preference. The choice is remembered on this device and also applies to the P&ID / BOP Studio module.',
    ],
  },
];

const FAQ: Array<[string, string]> = [
  ['Where is my data stored?', 'In the shared cloud database (Supabase) with per-unit authorization and a full audit trail — not in your browser. Every device sees the same data.'],
  ['Why can\'t I see a unit or page?', 'Visibility follows your account\'s permissions and unit assignments. Ask an administrator to grant access or assign your Rig/Hoist.'],
  ['Can I undo an edit?', 'Every save is kept as an immutable submission, and deleted rows are archived rather than destroyed. An administrator can restore prior values from the audit history.'],
  ['Do orders advance automatically?', 'No. Every stage — approval, picking, transit, delivery — is an explicit action by an authorized person, with a real timestamp.'],
  ['Do map distances need internet routing services?', 'No. Distances are straight-line (haversine) computed locally; only standard map tiles are fetched. Coordinates never leave the system.'],
];

function bandStyle(color: string): React.CSSProperties {
  return color === '#fff' ? { background: '#fff', borderColor: '#666' } : { background: color };
}

export default function ReferenceView() {
  const [jump, setJump] = useState('');

  const jumpTo = (id: string) => {
    setJump(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section className="view" id="view-ref">
      <div className="section-head">
        <div className="section-title">Reference</div>
        <div className="section-sub">API RP 7G standards · system guide &amp; FAQ</div>
      </div>

      <div className="unit-bar">
        <span className="lbl">Jump to</span>
        <select id="ref-jump" value={jump || 'ref-standards'} onChange={(e) => jumpTo(e.target.value)}>
          <option value="ref-standards">API RP 7G Standards</option>
          {SECTIONS.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          <option value="man-faq">FAQ &amp; Troubleshooting</option>
        </select>
      </div>

      <div className="ref-grid" id="ref-standards">
        <div className="ref-card">
          <h4>Drill Pipe Classification (API RP 7G)</h4>
          <table className="ref-class-tbl">
            <thead><tr><th>Class</th><th>Wall Thickness</th><th>Max OD Wear</th></tr></thead>
            <tbody>
              {CLASSES.map(([cls, wall, od, color]) => (
                <tr key={cls}><td><span className="color-band" style={bandStyle(color)} />{cls}</td><td>{wall}</td><td>{od}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ref-card">
          <h4>Band Marking Convention</h4>
          <table>
            <thead><tr><th>Class</th><th>Band Marking</th><th>Punch Marks</th></tr></thead>
            <tbody>
              {BANDS.map(([cls, band, punch, color]) => (
                <tr key={cls}><td><span className="color-band" style={bandStyle(color)} />{cls}</td><td>{band}</td><td>{punch}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ref-card">
          <h4>Inspection Zones</h4>
          <table>
            <thead><tr><th>Zone</th><th>Area Covered</th><th>Notes</th></tr></thead>
            <tbody>
              {ZONES.map(([zone, area, notes]) => (
                <tr key={zone}><td>{zone}</td><td>{area}</td><td>{notes}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ref-card">
          <h4>Related Standards</h4>
          <table>
            <thead><tr><th>Standard</th><th>Scope</th></tr></thead>
            <tbody>
              {STANDARDS.map(([std, scope]) => (
                <tr key={std}><td>{std}</td><td>{scope}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section-head" style={{ marginTop: 24 }}>
        <div className="section-title" style={{ fontSize: 15 }}>System Guide</div>
        <div className="section-sub">A guide to every page in the Abraj Tubular Inventory system</div>
      </div>

      {SECTIONS.map((s) => (
        <div className="ref-card" id={s.id} key={s.id} style={{ marginBottom: 14 }}>
          <h4>{s.ico} {s.title}</h4>
          {s.body.map((p, i) => <p key={i} style={{ marginBottom: 8 }}>{p}</p>)}
        </div>
      ))}

      <div className="ref-card" id="man-faq">
        <h4>FAQ &amp; Troubleshooting</h4>
        <table>
          <thead><tr><th>Question</th><th>Answer</th></tr></thead>
          <tbody>
            {FAQ.map(([q, a]) => (
              <tr key={q}><td style={{ whiteSpace: 'normal' }}>{q}</td><td style={{ whiteSpace: 'normal' }}>{a}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
