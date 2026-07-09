// ============================================================================
//  API RP 7G Reference — content carried over from the workbook's Reference
//  sheet. NON-AUTHORITATIVE GUIDANCE: always defer to the current edition of
//  API RP 7G. Values here are operational reference, not controlled master
//  data (the controlled data is the Tubular Catalog).
// ============================================================================

const tdS: React.CSSProperties = { border: '1px solid var(--line)', padding: '6px 10px', fontSize: 12.5, verticalAlign: 'top' };
const thS: React.CSSProperties = { ...tdS, background: 'var(--sunk)', color: 'var(--dim)', font: '10.5px var(--mono)', whiteSpace: 'nowrap' };
const h3: React.CSSProperties = { fontFamily: 'var(--disp)', margin: '20px 0 8px' };

const CLASSES = [
  ['PREMIUM', 'Remaining wall ≥ 80% of nominal', 'OD wear ≤ 3% of nominal OD', 'Two White Bands + one centre punch mark'],
  ['CLASS 2', 'Remaining wall ≥ 70% of nominal', 'OD wear ≤ 4% of nominal OD', 'One Yellow Band + two centre punch marks'],
  ['CLASS 3', 'Any imperfection exceeding Class 2 limits', 'N/A', 'One Orange Band + three centre punch marks'],
  ['SCRAP', 'No longer fit for service', 'N/A', 'One Red Band'],
];

const ZONES = [
  ['Zone A', 'Pipe body covered under drill pipe classification', 'Primary zone for wall thickness and OD wear measurements'],
  ['Zone B', 'Tool joint — box and pin area', 'Condition rated separately (Red = scrap/shop repair, Green = field repairable)'],
  ['Zone C', 'Transition / upset area between body and tool joint', 'May not be fully covered by standard measurements; inspect carefully'],
];

const STANDARDS = [
  ['API RP 7G', 'Used drill pipe inspection, classification and reconditioning'],
  ['API Spec 5D', 'New drill pipe properties and specifications'],
  ['API Spec 7', 'Drill collar and rotary drill stem element dimensions and threads'],
  ['API Standard 5CT', 'Casing and tubing classification and drift diameter requirements'],
];

const WEIGHTS = [
  ['9-1/2" DC, 7-5/8" REG', '217.2 lb/ft', '323.2 kg/m'],
  ['8-1/2" DC, 6-5/8" REG', '~175 lb/ft', '~260 kg/m'],
  ['8-1/4" DC, 6-5/8" REG', '150.3 lb/ft', '223.7 kg/m'],
  ['6-3/4" DC, NC50', '101.4 lb/ft', '150.9 kg/m'],
  ['6-1/2" DC, 4" IF', '~85 lb/ft', '~126 kg/m'],
  ['6-1/4" DC, 4" IF (NC46)', '~78 lb/ft', '~116 kg/m'],
  ['6-1/2" DC, 4-1/2" IF NC50', '~90 lb/ft', '~134 kg/m'],
  ['4-3/4" DC, NC38', '47.3 lb/ft', '70.4 kg/m'],
  ['5-1/2" HWDP DELTA544', '56.5 lb/ft', '84.1 kg/m'],
  ['5" HWDP NC50', '49.3 lb/ft', '73.4 kg/m'],
  ['4" HWDP XT39', '30.5 lb/ft', '45.4 kg/m'],
  ['3-1/2" HWDP NC38', '25.3 lb/ft', '37.7 kg/m'],
];

export default function ReferenceView() {
  return (
    <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: '16px 24px', maxWidth: 900 }}>
      <h2 style={{ fontFamily: 'var(--disp)', margin: 0 }}>Tubular Inspection &amp; Classification — Reference</h2>
      <p style={{ color: 'var(--amber)', fontSize: 12.5, border: '1px solid var(--amber)', borderRadius: 8, padding: '8px 12px' }}>
        ⚠ Non-authoritative guidance for internal reference only. Always refer to the current edition of API RP 7G
        for official requirements. Controlled master data (the tubular catalog) is managed separately by administrators.
      </p>

      <h3 style={h3}>1 · Drill pipe classification (API RP 7G)</h3>
      <table style={{ borderCollapse: 'collapse', width: '100%', background: 'var(--panel)' }}>
        <thead><tr>{['CLASS', 'WALL THICKNESS', 'MAX OD WEAR', 'BAND MARKING'].map((h) => <th key={h} style={thS}>{h}</th>)}</tr></thead>
        <tbody>{CLASSES.map((r) => (
          <tr key={r[0]}>{r.map((c, i) => <td key={i} style={{ ...tdS, fontWeight: i === 0 ? 700 : 400 }}>{c}</td>)}</tr>
        ))}</tbody>
      </table>

      <h3 style={h3}>2 · Inspection zones</h3>
      <table style={{ borderCollapse: 'collapse', width: '100%', background: 'var(--panel)' }}>
        <thead><tr>{['ZONE', 'AREA COVERED', 'NOTES'].map((h) => <th key={h} style={thS}>{h}</th>)}</tr></thead>
        <tbody>{ZONES.map((r) => (
          <tr key={r[0]}>{r.map((c, i) => <td key={i} style={{ ...tdS, fontWeight: i === 0 ? 700 : 400 }}>{c}</td>)}</tr>
        ))}</tbody>
      </table>

      <h3 style={h3}>3 · Related standards</h3>
      <table style={{ borderCollapse: 'collapse', width: '100%', background: 'var(--panel)' }}>
        <tbody>{STANDARDS.map((r) => (
          <tr key={r[0]}><td style={{ ...tdS, fontWeight: 700, whiteSpace: 'nowrap' }}>{r[0]}</td><td style={tdS}>{r[1]}</td></tr>
        ))}</tbody>
      </table>

      <h3 style={h3}>4 · Tubular nominal weights (reference)</h3>
      <table style={{ borderCollapse: 'collapse', width: '100%', background: 'var(--panel)' }}>
        <thead><tr>{['DESCRIPTION', 'NOMINAL WEIGHT', 'METRIC'].map((h) => <th key={h} style={thS}>{h}</th>)}</tr></thead>
        <tbody>{WEIGHTS.map((r) => (
          <tr key={r[0]}>{r.map((c, i) => <td key={i} style={tdS}>{c}</td>)}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}
