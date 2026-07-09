// ============================================================================
//  Master Register — database-driven consolidated view across all visible
//  units (one row per record, duplicates preserved), re-skinned in the
//  prototype design language (unit-bar filters, tbl-wrap table, st badges).
//  Logic unchanged: filters, search, sort, hardened CSV export gated on the
//  export permission.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { useTubular } from '../state/TubularContext';
import {
  CATEGORY_LABEL, CATEGORY_ORDER,
  fetchCatalog, fetchVisibleRecords,
  type CatalogItem, type TubularCategory, type TubularRecordRow,
} from '../lib/records';
import { FLEET_STATUS_LABEL, fleetStatus, serviceable } from '../lib/calc';
import { downloadCsv } from '../lib/exportCsv';

type SortKey = 'unit' | 'description' | 'onContract' | 'serviceable' | 'delta' | 'updatedAt';

const ST_CLASS: Record<string, string> = {
  short: 'short', surplus: 'surplus', met: 'balanced', uncontracted: 'unctr', no_data: 'nodata',
};

export default function MasterRegisterView() {
  const { units, hasPerm } = useTubular();
  const [records, setRecords] = useState<TubularRecordRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [unitFilter, setUnitFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'rig' | 'hoist'>('all');
  const [catFilter, setCatFilter] = useState<'all' | TubularCategory>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'unit', dir: 1 });

  useEffect(() => {
    (async () => {
      try {
        const [cat, recs] = await Promise.all([fetchCatalog(), fetchVisibleRecords()]);
        setCatalog(cat); setRecords(recs);
      } finally { setLoading(false); }
    })();
  }, []);

  const catById = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);

  const rows = useMemo(() => {
    const filtered = records.filter((r) => {
      const item = catById.get(r.catalogItemId);
      const unit = unitById.get(r.unitId);
      if (!item || !unit) return false;
      if (unitFilter !== 'all' && r.unitId !== unitFilter) return false;
      if (typeFilter !== 'all' && unit.unitType !== typeFilter) return false;
      if (catFilter !== 'all' && item.category !== catFilter) return false;
      const st = fleetStatus({ onContract: r.onContract, premium: r.premium, class2: r.class2 });
      if (statusFilter !== 'all' && st !== statusFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!item.description.toLowerCase().includes(s)
          && !unit.name.toLowerCase().includes(s)
          && !(r.remarks ?? '').toLowerCase().includes(s)) return false;
      }
      return true;
    });
    const key = sort.key;
    return filtered.sort((a, b) => {
      const ua = unitById.get(a.unitId)?.name ?? '';
      const ub = unitById.get(b.unitId)?.name ?? '';
      let cmp = 0;
      if (key === 'unit') cmp = ua.localeCompare(ub, undefined, { numeric: true });
      else if (key === 'description') cmp = (catById.get(a.catalogItemId)?.description ?? '').localeCompare(catById.get(b.catalogItemId)?.description ?? '');
      else if (key === 'onContract') cmp = a.onContract - b.onContract;
      else if (key === 'serviceable') cmp = serviceable(a) - serviceable(b);
      else if (key === 'delta') cmp = a.contractDelta - b.contractDelta;
      else cmp = a.updatedAt.localeCompare(b.updatedAt);
      return cmp * sort.dir || ua.localeCompare(ub, undefined, { numeric: true });
    });
  }, [records, catById, unitById, unitFilter, typeFilter, catFilter, statusFilter, search, sort]);

  const onSort = (key: SortKey) =>
    setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }));
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : '');

  const exportCsv = () => {
    downloadCsv(
      `tubular-master-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Unit', 'Type', 'Category', 'Description', 'On Contract', 'On Board', 'Premium', 'Class 2', 'Class 3',
        'Scrap', 'Needs Inspection', 'Damaged', 'To Repair', 'To Other Rig', 'From Rig', 'Serviceable',
        'Contract Delta', 'Status', 'Rental Date', 'Remarks', 'Reported On Board', 'Last Update'],
      rows.map((r) => {
        const item = catById.get(r.catalogItemId);
        const unit = unitById.get(r.unitId);
        const st = fleetStatus({ onContract: r.onContract, premium: r.premium, class2: r.class2 });
        return [unit?.name, unit?.unitType, item ? CATEGORY_LABEL[item.category] : '', item?.description,
          r.onContract, r.onBoard, r.premium, r.class2, r.class3, r.scrap, r.needsInspection,
          r.damagedOnLocation, r.sendToRepair, r.toOtherRig, r.receiveFromRig, serviceable(r),
          r.contractDelta, FLEET_STATUS_LABEL[st], r.rentalDate ?? '', r.remarks ?? '',
          r.onBoardOverride ?? '', r.updatedAt];
      }),
    );
  };

  if (loading) {
    return (
      <section className="view">
        <div className="empty-cert"><div className="ico">▥</div><div className="title">Master Register</div><div className="desc">Loading…</div></div>
      </section>
    );
  }

  return (
    <section className="view" id="view-master">
      <div className="section-head">
        <div className="section-title">Master Register</div>
        <div className="section-sub">Consolidated row-level register across all authorized units</div>
      </div>

      <div className="unit-bar">
        <span className="lbl">Unit</span>
        <select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)}>
          <option value="all">All units</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}>
          <option value="all">Rigs + Hoists</option><option value="rig">Rigs</option><option value="hoist">Hoists</option>
        </select>
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value as typeof catFilter)}>
          <option value="all">All categories</option>
          {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          {Object.entries(FLEET_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)', padding: '8px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5, outline: 'none', width: 200 }} />
        <span className="meta-chip">Rows: <span className="v">{rows.length}</span></span>
        <span className="spacer" />
        {hasPerm('export') && <button className="btn sm" onClick={exportCsv}>⬇ Export CSV</button>}
      </div>

      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ cursor: 'pointer' }} onClick={() => onSort('unit')}>Unit{arrow('unit')}</th>
              <th style={{ cursor: 'pointer' }} onClick={() => onSort('description')}>Description{arrow('description')}</th>
              <th className="mono" style={{ cursor: 'pointer' }} onClick={() => onSort('onContract')}>Contract{arrow('onContract')}</th>
              <th className="mono">On-Board</th>
              <th className="mono">Prem</th><th className="mono">C2</th><th className="mono">C3</th><th className="mono">Scrap</th>
              <th className="mono">Needs</th><th className="mono">Dmg</th><th className="mono">Repair</th><th className="mono">To Rig</th><th className="mono">From Rig</th>
              <th className="mono" style={{ cursor: 'pointer' }} onClick={() => onSort('serviceable')}>Serviceable{arrow('serviceable')}</th>
              <th className="mono" style={{ cursor: 'pointer' }} onClick={() => onSort('delta')}>Delta{arrow('delta')}</th>
              <th>Status</th>
              <th>Remarks</th>
              <th className="mono" style={{ cursor: 'pointer' }} onClick={() => onSort('updatedAt')}>Updated{arrow('updatedAt')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={18} style={{ textAlign: 'center', color: 'var(--text-3)' }}>No rows match the current filters.</td></tr>
            )}
            {rows.map((r) => {
              const item = catById.get(r.catalogItemId);
              const st = fleetStatus({ onContract: r.onContract, premium: r.premium, class2: r.class2 });
              return (
                <tr key={r.id}>
                  <td className="mono">{unitById.get(r.unitId)?.name}</td>
                  <td>{item?.description}</td>
                  <td className="num">{r.onContract}</td>
                  <td className="num">{r.onBoard}{r.onBoardOverride != null && <span title={`Reported ${r.onBoardOverride} (legacy import)`} style={{ color: 'var(--copper-2)' }}> ⚑</span>}</td>
                  <td className="num">{r.premium}</td><td className="num">{r.class2}</td><td className="num">{r.class3}</td>
                  <td className="num">{r.scrap}</td><td className="num">{r.needsInspection}</td><td className="num">{r.damagedOnLocation}</td>
                  <td className="num">{r.sendToRepair}</td><td className="num">{r.toOtherRig}</td><td className="num">{r.receiveFromRig}</td>
                  <td className="num">{serviceable(r)}</td>
                  <td className="num" style={{ color: r.contractDelta < 0 ? 'var(--red-2)' : 'var(--green)' }}>{r.contractDelta}</td>
                  <td><span className={`st ${ST_CLASS[st]}`}>{FLEET_STATUS_LABEL[st]}</span></td>
                  <td style={{ whiteSpace: 'normal', color: 'var(--text-3)' }}>{r.remarks}</td>
                  <td className="num">{new Date(r.updatedAt).toLocaleDateString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
