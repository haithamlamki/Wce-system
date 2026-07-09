// ============================================================================
//  API RP 7G Reference — pixel-faithful port of the prototype's #view-ref:
//  ref-grid with the four reference tables (classification, band marking,
//  inspection zones, related standards) plus "How To Use This System".
//  Two "How To" clauses were truth-corrected: data saves to the cloud
//  database (not the browser) and the assistant reads authorized records.
// ============================================================================

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

const HOW_TO: Array<[string, string]> = [
  ['Dashboard', 'fleet-wide KPIs, charts, and items needing attention.'],
  ['Fleet Inventory', 'browse units and their tubular records; filter by category.'],
  ['Data Entry', 'add or edit records for any rig/hoist. Pick category → description → enter quantities. Data is saved to the shared cloud database.'],
  ['AI Assistant', 'ask natural questions about the data. The assistant only references the records your account is authorized to see.'],
  ['Contracts', "view every rig's contract requirements and commitments, check compliance against current stock, and (as admin) add or edit contracts. A certificate generator utility is also tucked inside this page."],
  ['Order Pipe', 'rig users pick their rig, browse available pipe across the fleet, submit a request, and watch it move through Requested → Approved → Picked → In Transit → Delivered with a live timer.'],
  ['Theme', "use the Light / Dark / Auto control in the top bar to match your preference or your device's system setting."],
  ['Export', 'use the Export button on Data Entry to save all data as JSON.'],
];

function bandStyle(color: string): React.CSSProperties {
  return color === '#fff' ? { background: '#fff', borderColor: '#666' } : { background: color };
}

export default function ReferenceView() {
  return (
    <section className="view" id="view-ref">
      <div className="section-head">
        <div className="section-title">API RP 7G Reference</div>
        <div className="section-sub">Drill pipe classification &amp; inspection standards</div>
      </div>

      <div className="ref-grid">
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

      <div className="ref-card" style={{ marginTop: 14 }}>
        <h4>How To Use This System</h4>
        <ol style={{ marginLeft: 18, fontSize: 12.5, lineHeight: 1.8, color: 'var(--text-2)' }}>
          {HOW_TO.map(([name, desc]) => (
            <li key={name}><strong style={{ color: 'var(--copper-2)' }}>{name}</strong> — {desc}</li>
          ))}
        </ol>
      </div>
    </section>
  );
}
