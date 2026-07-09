// ============================================================================
//  API RP 7G Reference — pixel-faithful port of the prototype's #view-ref:
//  ref-grid with the four reference tables (classification, band marking,
//  inspection zones, related standards) plus "How To Use This System".
//  Non-authoritative guidance; the controlled master data is the catalog.
// ============================================================================

const CLASSES: Array<[string, string, string]> = [
  ['Premium', '≥ 80% of nominal wall', '≤ 3% of nominal OD'],
  ['Class 2', '≥ 70% of nominal wall', '≤ 4% of nominal OD'],
  ['Class 3', 'Exceeds Class 2 limits', 'N/A'],
  ['Scrap', 'Not fit for service', 'N/A'],
];

const BANDS: Array<[string, string, string, string]> = [
  ['Premium', 'Two White Bands', 'One centre punch mark', '#ffffff'],
  ['Class 2', 'One Yellow Band', 'Two centre punch marks', 'var(--c-class2)'],
  ['Class 3', 'One Orange Band', 'Three centre punch marks', 'var(--c-class3)'],
  ['Scrap', 'One Red Band', '—', 'var(--c-scrap)'],
];

const ZONES: Array<[string, string, string]> = [
  ['Zone A', 'Pipe body', 'Wall thickness & OD wear measurements'],
  ['Zone B', 'Tool joint — box & pin', 'Condition rated separately (Red / Green)'],
  ['Zone C', 'Transition / upset area', 'May not be fully covered by standard measurements — inspect carefully'],
];

const STANDARDS: Array<[string, string]> = [
  ['API RP 7G', 'Used drill pipe inspection, classification and reconditioning'],
  ['API Spec 5D', 'New drill pipe properties and specifications'],
  ['API Spec 7', 'Drill collar and rotary drill stem element dimensions and threads'],
  ['API Std 5CT', 'Casing and tubing classification and drift diameter requirements'],
];

const HOW_TO = [
  'Open the Dashboard for the live fleet position — every figure is computed from the database.',
  'Use Fleet Inventory to browse units and drill into per-tubular classification detail.',
  'Enter monthly counts on the Data Entry page (form or batch grid) — saves are audited.',
  'Ask the AI Assistant for totals, shortfalls, comparisons and inspection lists.',
  'Manage client commitments and compliance on the Contracts page.',
  'Track locations and plan trips on the Asset Map (straight-line distances).',
  'Request pipe and follow every delivery stage on Order Pipe.',
  'Work through the Training modules, then check your knowledge with the quiz.',
];

export default function ReferenceView() {
  return (
    <section className="view" id="view-ref">
      <div className="section-head">
        <div className="section-title">API RP 7G Reference</div>
        <div className="section-sub">Drill pipe classification &amp; inspection standards · non-authoritative guidance</div>
      </div>

      <div className="ref-grid">
        <div className="ref-card">
          <h4>Drill Pipe Classification (API RP 7G)</h4>
          <table className="ref-class-tbl">
            <thead><tr><th>Class</th><th>Wall Thickness</th><th>Max OD Wear</th></tr></thead>
            <tbody>
              {CLASSES.map(([cls, wall, od]) => (
                <tr key={cls}><td>{cls}</td><td>{wall}</td><td>{od}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ref-card">
          <h4>Band Marking Convention</h4>
          <table className="ref-class-tbl">
            <thead><tr><th>Class</th><th>Band Marking</th><th>Punch Marks</th></tr></thead>
            <tbody>
              {BANDS.map(([cls, band, punch, color]) => (
                <tr key={cls}>
                  <td>{cls}</td>
                  <td><span className="color-band" style={{ background: color }} />{band}</td>
                  <td>{punch}</td>
                </tr>
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
                <tr key={zone}><td className="mono">{zone}</td><td>{area}</td><td>{notes}</td></tr>
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
                <tr key={std}><td className="mono">{std}</td><td>{scope}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ref-card" style={{ marginTop: 14 }}>
        <h4>How To Use This System</h4>
        <ol>
          {HOW_TO.map((h) => <li key={h}>{h}</li>)}
        </ol>
        <p style={{ marginTop: 10, color: 'var(--text-3)' }}>
          Reference values on this page are operational guidance only — always refer to the current
          edition of API RP 7G for official requirements.
        </p>
      </div>
    </section>
  );
}
