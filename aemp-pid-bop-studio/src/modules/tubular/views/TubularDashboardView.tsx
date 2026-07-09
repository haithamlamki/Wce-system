// ============================================================================
//  Tubular Dashboard — every figure computed live from RLS-scoped records
//  (no stored or hardcoded totals; the Excel Dashboard's hardcoded 28/5/33/40
//  counts were wrong by design). KPI definitions per the approved plan:
//    Serviceable = P+C2 · Shortfall = Serviceable − Contract ·
//    Utilization = Serviceable/Contract · statuses per Excel Dashboard.
//  Charts are hand-rolled CSS bars (no chart dependency; CSP-safe), matching
//  the existing WCE DashboardView approach.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { useTubular } from '../state/TubularContext';
import {
  fetchCatalog, fetchVisibleRecords,
  type CatalogItem, type TubularRecordRow,
} from '../lib/records';
import {
  FLEET_STATUS_LABEL, aggregate, fleetStatus, fleetUtilization, needsAttention, overrideVariance,
} from '../lib/calc';

const tile: React.CSSProperties = {
  background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 12,
  padding: '14px 18px', minWidth: 150, boxShadow: 'var(--shadow)',
};
const tileLabel: React.CSSProperties = { font: '10px var(--mono)', color: 'var(--faint)', letterSpacing: 1, textTransform: 'uppercase' };
const tileValue: React.CSSProperties = { fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 26 };
const tdS: React.CSSProperties = { border: '1px solid var(--line)', padding: '5px 8px', font: '12px var(--mono)', textAlign: 'right' };

function qtyOf(r: TubularRecordRow) {
  return {
    onContract: r.onContract, premium: r.premium, class2: r.class2,
    class3: r.class3, scrap: r.scrap, needsInspection: r.needsInspection,
  };
}

export default function TubularDashboardView() {
  const { units } = useTubular();
  const [records, setRecords] = useState<TubularRecordRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [cat, recs] = await Promise.all([fetchCatalog(), fetchVisibleRecords()]);
        setCatalog(cat); setRecords(recs);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally { setLoading(false); }
    })();
  }, []);

  const catById = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);

  const fleet = useMemo(() => aggregate(records.map(qtyOf)), [records]);
  const util = fleetUtilization(fleet);
  const unitsWithData = useMemo(() => new Set(records.map((r) => r.unitId)).size, [records]);
  const rigCount = units.filter((u) => u.unitType === 'rig').length;
  const hoistCount = units.filter((u) => u.unitType === 'hoist').length;

  /** Per-description aggregation = the Excel Dashboard matrix (full catalog, incl. the 2 items Excel Master dropped). */
  const byDescription = useMemo(() => {
    const m = new Map<string, TubularRecordRow[]>();
    for (const r of records) m.set(r.catalogItemId, [...(m.get(r.catalogItemId) ?? []), r]);
    return catalog
      .filter((c) => m.has(c.id))
      .map((c) => ({ item: c, totals: aggregate((m.get(c.id) ?? []).map(qtyOf)) }));
  }, [records, catalog]);

  const byUnit = useMemo(() => {
    const m = new Map<string, TubularRecordRow[]>();
    for (const r of records) m.set(r.unitId, [...(m.get(r.unitId) ?? []), r]);
    return [...m.entries()]
      .map(([unitId, rows]) => ({ name: unitById.get(unitId)?.name ?? '?', totals: aggregate(rows.map(qtyOf)) }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [records, unitById]);

  const attention = useMemo(() =>
    records.filter((r) => needsAttention(qtyOf(r)))
      .sort((a, b) => (a.contractDelta - b.contractDelta)).slice(0, 12),
  [records]);

  const overrides = useMemo(() =>
    records.map((r) => ({ r, v: overrideVariance(qtyOf(r), r.onBoardOverride) }))
      .filter((x) => x.v != null),
  [records]);

  if (loading) return <div className="placeholder">Loading dashboard…</div>;
  if (error) return <div className="placeholder"><strong>Dashboard</strong>{error}</div>;

  const pct = (n: number) => (fleet.onBoard > 0 ? `${((n / fleet.onBoard) * 100).toFixed(1)}%` : '—');
  const maxUnitBoard = Math.max(1, ...byUnit.map((u) => u.totals.onBoard));

  return (
    <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={tile}><div style={tileLabel}>Active Units (with data)</div><div style={tileValue}>{unitsWithData}<span style={{ fontSize: 13, color: 'var(--faint)' }}> / {rigCount} rigs · {hoistCount} hoists</span></div></div>
        <div style={tile}><div style={tileLabel}>On Contract</div><div style={tileValue}>{fleet.onContract.toLocaleString()}</div></div>
        <div style={tile}><div style={tileLabel}>Serviceable (P+C2)</div><div style={tileValue}>{fleet.serviceable.toLocaleString()}</div></div>
        <div style={tile}><div style={tileLabel}>On Board</div><div style={tileValue}>{fleet.onBoard.toLocaleString()}</div></div>
        <div style={tile}><div style={tileLabel}>Premium</div><div style={tileValue}>{fleet.premium.toLocaleString()}<span style={{ fontSize: 13, color: 'var(--faint)' }}> {pct(fleet.premium)}</span></div></div>
        <div style={tile}><div style={tileLabel}>Class 2</div><div style={tileValue}>{fleet.class2.toLocaleString()}</div></div>
        <div style={tile}><div style={tileLabel}>Class 3</div><div style={tileValue}>{fleet.class3.toLocaleString()}</div></div>
        <div style={tile}><div style={tileLabel}>Scrap</div><div style={{ ...tileValue, color: fleet.scrap ? 'var(--red)' : undefined }}>{fleet.scrap.toLocaleString()}</div></div>
        <div style={tile}><div style={tileLabel}>Needs Inspection</div><div style={{ ...tileValue, color: fleet.needsInspection ? 'var(--amber)' : undefined }}>{fleet.needsInspection.toLocaleString()}</div></div>
        <div style={tile}>
          <div style={tileLabel}>Fleet Utilization (Serviceable / Contract)</div>
          <div style={tileValue}>{util == null ? '—' : `${util.toFixed(1)}%`}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 1fr) minmax(340px, 1fr)', gap: 16, alignItems: 'start' }}>
        <section>
          <h3 style={{ fontFamily: 'var(--disp)', margin: '4px 0 8px' }}>Contract position by tubular type</h3>
          <table style={{ borderCollapse: 'collapse', width: '100%', background: 'var(--panel)' }}>
            <thead><tr>{['DESCRIPTION', 'CONTRACT', 'SERVICEABLE', 'SHORTFALL', 'STATUS'].map((h) => (
              <th key={h} style={{ ...tdS, background: 'var(--sunk)', color: 'var(--dim)', textAlign: h === 'DESCRIPTION' ? 'left' : 'right' }}>{h}</th>))}</tr></thead>
            <tbody>
              {byDescription.map(({ item, totals }) => {
                const st = fleetStatus(totals);
                const d = totals.serviceable - totals.onContract;
                return (
                  <tr key={item.id}>
                    <td style={{ ...tdS, textAlign: 'left', fontFamily: 'var(--body)' }}>{item.description}</td>
                    <td style={tdS}>{totals.onContract}</td>
                    <td style={tdS}>{totals.serviceable}</td>
                    <td style={{ ...tdS, color: d < 0 ? 'var(--red)' : 'var(--green)' }}>{d}</td>
                    <td style={{ ...tdS, textAlign: 'center', fontWeight: 700, color: st === 'short' ? 'var(--red)' : st === 'surplus' ? 'var(--blue)' : st === 'met' ? 'var(--green)' : 'var(--faint)' }}>
                      {FLEET_STATUS_LABEL[st]}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section>
          <h3 style={{ fontFamily: 'var(--disp)', margin: '4px 0 8px' }}>Inventory by unit (on board)</h3>
          <div style={{ display: 'grid', gap: 5 }}>
            {byUnit.map((u) => (
              <div key={u.name} style={{ display: 'grid', gridTemplateColumns: '76px 1fr 60px', gap: 8, alignItems: 'center', fontSize: 12 }}>
                <span style={{ fontFamily: 'var(--mono)' }}>{u.name}</span>
                <div style={{ background: 'var(--sunk)', borderRadius: 4, height: 14, overflow: 'hidden' }} role="img"
                  aria-label={`${u.name}: ${u.totals.onBoard} joints on board`}>
                  <div style={{ width: `${(u.totals.onBoard / maxUnitBoard) * 100}%`, height: '100%', background: 'var(--accent)' }} />
                </div>
                <span style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>{u.totals.onBoard}</span>
              </div>
            ))}
          </div>

          <h3 style={{ fontFamily: 'var(--disp)', margin: '18px 0 8px' }}>Items requiring attention</h3>
          <table style={{ borderCollapse: 'collapse', width: '100%', background: 'var(--panel)' }}>
            <tbody>
              {attention.map((r) => (
                <tr key={r.id}>
                  <td style={{ ...tdS, textAlign: 'left' }}>{unitById.get(r.unitId)?.name}</td>
                  <td style={{ ...tdS, textAlign: 'left', fontFamily: 'var(--body)' }}>{catById.get(r.catalogItemId)?.description}</td>
                  <td style={{ ...tdS, color: 'var(--red)' }}>
                    {r.contractDelta < 0 ? `${r.contractDelta} short` : r.scrap > 0 ? `${r.scrap} scrap` : `${r.needsInspection} needs insp.`}
                  </td>
                </tr>
              ))}
              {attention.length === 0 && <tr><td style={{ ...tdS, textAlign: 'left', color: 'var(--green)' }}>Nothing requires attention.</td></tr>}
            </tbody>
          </table>

          <h3 style={{ fontFamily: 'var(--disp)', margin: '18px 0 8px' }}>Reconciliation — reported vs computed on-board</h3>
          <p style={{ color: 'var(--dim)', fontSize: 12, margin: '0 0 6px' }}>
            Legacy workbook rows whose typed On Board Total differs from the classification sum. Resolve by classifying the difference (often Damaged on Location).
          </p>
          <table style={{ borderCollapse: 'collapse', width: '100%', background: 'var(--panel)' }}>
            <tbody>
              {overrides.slice(0, 12).map(({ r, v }) => (
                <tr key={r.id}>
                  <td style={{ ...tdS, textAlign: 'left' }}>{unitById.get(r.unitId)?.name}</td>
                  <td style={{ ...tdS, textAlign: 'left', fontFamily: 'var(--body)' }}>{catById.get(r.catalogItemId)?.description}</td>
                  <td style={tdS}>reported {r.onBoardOverride}</td>
                  <td style={{ ...tdS, color: 'var(--amber)' }}>{(v as number) > 0 ? `+${v}` : v} vs classes</td>
                </tr>
              ))}
              {overrides.length === 0 && <tr><td style={{ ...tdS, textAlign: 'left', color: 'var(--green)' }}>All on-board totals reconcile with classifications.</td></tr>}
              {overrides.length > 12 && <tr><td style={{ ...tdS, textAlign: 'left', color: 'var(--faint)' }}>…and {overrides.length - 12} more (see Master Register).</td></tr>}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
