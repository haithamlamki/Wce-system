// ============================================================================
//  Fleet Inventory — pixel-faithful port of the prototype's #view-fleet:
//  unit-bar (View mode, Unit select, Tubular Filter, row-count chip), the
//  unit-card grid (fleet mode; a card click drills into that unit) and the
//  12-column #tbl-fleet with classification cells and status badges.
//  Data stays RLS-scoped via fetchVisibleRecords + calc.ts.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { useTubular } from '../state/TubularContext';
import {
  CATEGORY_LABEL,
  fetchCatalog, fetchVisibleRecords,
  type CatalogItem, type TubularCategory, type TubularRecordRow,
} from '../lib/records';
import { aggregate, fleetStatus } from '../lib/calc';

const qtyOf = (r: TubularRecordRow) => ({
  onContract: r.onContract, premium: r.premium, class2: r.class2,
  class3: r.class3, scrap: r.scrap, needsInspection: r.needsInspection,
});

const ST_CLASS: Record<string, string> = {
  short: 'short', surplus: 'surplus', met: 'balanced', uncontracted: 'unctr', no_data: 'nodata',
};
const ST_LABEL: Record<string, string> = {
  short: 'SHORT', surplus: 'SURPLUS', met: 'BALANCED', uncontracted: 'UNCONTRACTED', no_data: 'NO DATA',
};

const CAT_FILTERS: Array<{ value: 'all' | TubularCategory; label: string }> = [
  { value: 'all', label: 'All Categories' },
  { value: 'drill_pipe', label: 'Drill Pipe' },
  { value: 'hwdp', label: 'HWDP' },
  { value: 'drill_collar', label: 'Drill Collar' },
  { value: 'pup_joint', label: 'Pup Joint' },
];

export default function FleetInventoryView() {
  const { units } = useTubular();
  const [records, setRecords] = useState<TubularRecordRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [mode, setMode] = useState<'fleet' | 'single'>('fleet');
  const [unitId, setUnitId] = useState('');
  const [tubFilter, setTubFilter] = useState<'all' | TubularCategory>('all');
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

  useEffect(() => { if (!unitId && units.length) setUnitId(units[0].id); }, [units, unitId]);

  const catById = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);

  const unitCards = useMemo(() => {
    const byUnit = new Map<string, TubularRecordRow[]>();
    for (const r of records) byUnit.set(r.unitId, [...(byUnit.get(r.unitId) ?? []), r]);
    return [...units]
      .sort((a, b) => (a.unitType === b.unitType
        ? a.name.localeCompare(b.name, undefined, { numeric: true })
        : a.unitType === 'rig' ? -1 : 1))
      .map((u) => ({ unit: u, rows: byUnit.get(u.id) ?? [] }))
      .map((x) => ({ ...x, t: aggregate(x.rows.map(qtyOf)) }));
  }, [records, units]);

  const filtered = useMemo(() => records.filter((r) => {
    const item = catById.get(r.catalogItemId);
    if (!item) return false;
    if (mode === 'single' && r.unitId !== unitId) return false;
    if (tubFilter !== 'all' && item.category !== tubFilter) return false;
    return true;
  }), [records, catById, mode, unitId, tubFilter]);

  if (loading || error) {
    return (
      <section className="view" id="view-fleet">
        <div className="empty-cert">
          <div className="ico">⊟</div>
          <div className="title">Fleet Inventory</div>
          <div className="desc">{error || 'Loading…'}</div>
        </div>
      </section>
    );
  }

  return (
    <section className="view" id="view-fleet">
      <div className="section-head">
        <div className="section-title">Fleet Inventory</div>
        <div className="section-sub">Browse units · drill into tubular details</div>
      </div>

      <div className="unit-bar">
        <span className="lbl">View</span>
        <select id="fleet-mode" value={mode} onChange={(e) => setMode(e.target.value as 'fleet' | 'single')}>
          <option value="fleet">Fleet-Wide (all units)</option>
          <option value="single">Single Unit</option>
        </select>
        {mode === 'single' && (
          <>
            <span className="lbl" id="fleet-unit-lbl">Unit</span>
            <select id="fleet-unit" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </>
        )}
        <span className="lbl">Tubular Filter</span>
        <select id="fleet-tubfilter" value={tubFilter} onChange={(e) => setTubFilter(e.target.value as typeof tubFilter)}>
          {CAT_FILTERS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <span className="spacer" />
        <span className="meta-chip">Total Rows: <span className="v" id="fleet-rowcount">{filtered.length}</span></span>
      </div>

      <div id="fleet-units-cards" className="unit-list">
        {(mode === 'fleet' ? unitCards : unitCards.filter((x) => x.unit.id === unitId)).map(({ unit, t }) => (
          <div key={unit.id} className={`unit-card${mode === 'single' && unit.id === unitId ? ' active' : ''}`}
            onClick={() => {
              if (mode === 'single' && unit.id === unitId) { setMode('fleet'); }
              else { setMode('single'); setUnitId(unit.id); }
            }}>
            <div className="name">{unit.name}</div>
            <div className="type">{unit.unitType === 'hoist' ? 'Hoist' : 'Rig'} · Joints</div>
            <div className="stats">
              <span>{t.rows} rows</span>
              <span className="total">{t.onBoard.toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="tbl-wrap">
        <table id="tbl-fleet">
          <thead>
            <tr>
              <th>Unit</th><th>Category</th><th>Tubular Description</th>
              <th className="num">Contract</th>
              <th className="num"><span className="cls-cell"><span className="cls-band premium" />Premium</span></th>
              <th className="num"><span className="cls-cell"><span className="cls-band c2" />Class 2</span></th>
              <th className="num"><span className="cls-cell"><span className="cls-band c3" />Class 3</span></th>
              <th className="num"><span className="cls-cell"><span className="cls-band scrap" />Scrap</span></th>
              <th className="num"><span className="cls-cell"><span className="cls-band needs" />Needs Insp.</span></th>
              <th className="num">On-Board</th><th className="num">Variance</th><th>Status</th>
            </tr>
          </thead>
          <tbody id="fleet-body">
            {filtered.length === 0 && (
              <tr><td colSpan={12} style={{ textAlign: 'center', color: 'var(--text-3)' }}>No rows match the current filters.</td></tr>
            )}
            {filtered.map((r) => {
              const item = catById.get(r.catalogItemId)!;
              const st = fleetStatus(qtyOf(r));
              const variance = r.onBoard - r.onContract;
              return (
                <tr key={r.id}>
                  <td className="mono" style={{ color: 'var(--copper-2)', fontWeight: 600 }}>{unitById.get(r.unitId)?.name}</td>
                  <td style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-3)' }}>{CATEGORY_LABEL[item.category]}</td>
                  <td>{item.description}</td>
                  <td className="num">{r.onContract.toLocaleString()}</td>
                  <td className="num">{r.premium.toLocaleString()}</td>
                  <td className="num" style={{ color: r.class2 > 0 ? 'var(--c-class2)' : 'var(--text-3)' }}>{r.class2.toLocaleString()}</td>
                  <td className="num" style={{ color: r.class3 > 0 ? 'var(--c-class3)' : 'var(--text-3)' }}>{r.class3.toLocaleString()}</td>
                  <td className="num" style={{ color: r.scrap > 0 ? 'var(--red-2)' : 'var(--text-3)' }}>{r.scrap.toLocaleString()}</td>
                  <td className="num" style={{ color: r.needsInspection > 0 ? '#c084fc' : 'var(--text-3)' }}>{r.needsInspection.toLocaleString()}</td>
                  <td className="num" style={{ color: 'var(--text)' }}>{r.onBoard.toLocaleString()}{r.onBoardOverride != null && <span title={`Reported total ${r.onBoardOverride} (legacy import)`} style={{ color: 'var(--copper-2)' }}> ⚑</span>}</td>
                  <td className="num" style={{ color: variance < 0 ? 'var(--red-2)' : variance > 0 ? 'var(--green-2)' : 'var(--text-2)' }}>
                    {variance >= 0 ? `+${variance.toLocaleString()}` : variance.toLocaleString()}
                  </td>
                  <td><span className={`st ${ST_CLASS[st]}`}>{ST_LABEL[st]}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
