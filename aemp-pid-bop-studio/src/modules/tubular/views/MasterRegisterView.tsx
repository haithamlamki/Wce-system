// ============================================================================
//  Master Register — the database-driven consolidated view across all units
//  the caller may see (replaces the Excel Master sheet's SUMIF copies). One
//  row per RECORD (duplicates preserved); filters, search, sort, CSV export
//  (formula-injection hardened). No stored totals anywhere.
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

const tdS: React.CSSProperties = { border: '1px solid var(--line)', padding: '5px 8px', font: '12px var(--mono)', textAlign: 'right', whiteSpace: 'nowrap' };
const thS: React.CSSProperties = { ...tdS, background: 'var(--sunk)', color: 'var(--dim)', cursor: 'pointer', userSelect: 'none' };

export default function MasterRegisterView() {
  const { units, hasPerm } = useTubular();
  const [records, setRecords] = useState<TubularRecordRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
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

  if (loading) return <div className="placeholder">Loading master register…</div>;
  if (error) return <div className="placeholder"><strong>Master Register</strong>{error}</div>;

  const sel: React.CSSProperties = { background: 'var(--panel)', color: 'var(--ink)', border: '1px solid var(--line2)', borderRadius: 7, padding: '6px 8px' };

  return (
    <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 16 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} style={sel}>
          <option value="all">All units</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)} style={sel}>
          <option value="all">Rigs + Hoists</option><option value="rig">Rigs</option><option value="hoist">Hoists</option>
        </select>
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value as typeof catFilter)} style={sel}>
          <option value="all">All categories</option>
          {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={sel}>
          <option value="all">All statuses</option>
          {Object.entries(FLEET_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...sel, width: 200 }} />
        <span style={{ color: 'var(--faint)', fontSize: 12 }}>{rows.length} rows</span>
        <div style={{ flex: 1 }} />
        {hasPerm('export') && (
          <button onClick={exportCsv}
            style={{ border: 0, background: 'var(--accent)', color: '#fff', padding: '7px 14px', borderRadius: 7, fontWeight: 700, cursor: 'pointer' }}>
            Export CSV
          </button>
        )}
      </div>

      <table style={{ borderCollapse: 'collapse', width: '100%', background: 'var(--panel)' }}>
        <thead>
          <tr>
            <th style={{ ...thS, textAlign: 'left' }} onClick={() => onSort('unit')}>UNIT {sort.key === 'unit' ? (sort.dir === 1 ? '▲' : '▼') : ''}</th>
            <th style={{ ...thS, textAlign: 'left' }} onClick={() => onSort('description')}>DESCRIPTION {sort.key === 'description' ? (sort.dir === 1 ? '▲' : '▼') : ''}</th>
            <th style={thS} onClick={() => onSort('onContract')}>CONTRACT</th>
            <th style={thS}>ON BOARD</th>
            <th style={thS}>PREM</th><th style={thS}>C2</th><th style={thS}>C3</th><th style={thS}>SCRAP</th>
            <th style={thS}>NEEDS</th><th style={thS}>DMG</th><th style={thS}>REPAIR</th><th style={thS}>TO RIG</th><th style={thS}>FROM RIG</th>
            <th style={thS} onClick={() => onSort('serviceable')}>SERVICEABLE</th>
            <th style={thS} onClick={() => onSort('delta')}>DELTA</th>
            <th style={thS}>STATUS</th>
            <th style={{ ...thS, textAlign: 'left' }}>REMARKS</th>
            <th style={thS} onClick={() => onSort('updatedAt')}>UPDATED {sort.key === 'updatedAt' ? (sort.dir === 1 ? '▲' : '▼') : ''}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const item = catById.get(r.catalogItemId);
            const st = fleetStatus({ onContract: r.onContract, premium: r.premium, class2: r.class2 });
            return (
              <tr key={r.id}>
                <td style={{ ...tdS, textAlign: 'left' }}>{unitById.get(r.unitId)?.name}</td>
                <td style={{ ...tdS, textAlign: 'left', fontFamily: 'var(--body)', whiteSpace: 'normal' }}>{item?.description}</td>
                <td style={tdS}>{r.onContract}</td>
                <td style={tdS} title={r.onBoardOverride != null ? `Reported ${r.onBoardOverride} (legacy import)` : undefined}>
                  {r.onBoard}{r.onBoardOverride != null && <span style={{ color: 'var(--amber)' }}> ⚑</span>}
                </td>
                <td style={tdS}>{r.premium}</td><td style={tdS}>{r.class2}</td><td style={tdS}>{r.class3}</td>
                <td style={tdS}>{r.scrap}</td><td style={tdS}>{r.needsInspection}</td><td style={tdS}>{r.damagedOnLocation}</td>
                <td style={tdS}>{r.sendToRepair}</td><td style={tdS}>{r.toOtherRig}</td><td style={tdS}>{r.receiveFromRig}</td>
                <td style={tdS}>{serviceable(r)}</td>
                <td style={{ ...tdS, color: r.contractDelta < 0 ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>{r.contractDelta}</td>
                <td style={{ ...tdS, textAlign: 'center', fontWeight: 700, color: st === 'short' ? 'var(--red)' : st === 'met' ? 'var(--green)' : st === 'surplus' ? 'var(--blue)' : 'var(--faint)' }}>{FLEET_STATUS_LABEL[st]}</td>
                <td style={{ ...tdS, textAlign: 'left', fontFamily: 'var(--body)', whiteSpace: 'normal', color: 'var(--dim)' }}>{r.remarks}</td>
                <td style={{ ...tdS, color: 'var(--faint)' }}>{new Date(r.updatedAt).toLocaleDateString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
