// ============================================================================
//  Fleet Inventory — read-only classification view over tubular_records.
//  Fleet mode aggregates by tubular description across every unit the caller
//  may see (RLS-scoped); Unit mode lists the raw sheet rows of one unit.
//  All figures come straight from the records (no stored totals); status uses
//  SERVICEABLE (P+C2) per the workbook rule.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { useTubular } from '../state/TubularContext';
import {
  CATEGORY_LABEL, CATEGORY_ORDER,
  fetchCatalog, fetchVisibleRecords,
  type CatalogItem, type TubularCategory, type TubularRecordRow,
} from '../lib/records';
import { FLEET_STATUS_LABEL, aggregate, fleetStatus, serviceable } from '../lib/calc';

const th: React.CSSProperties = { border: '1px solid var(--line2)', background: 'var(--sunk)', padding: '7px 8px', font: '10.5px var(--mono)', color: 'var(--dim)', whiteSpace: 'nowrap' };
const cell: React.CSSProperties = { border: '1px solid var(--line)', padding: '6px 8px', font: '12.5px var(--mono)', textAlign: 'right' };

const statusColor: Record<string, string> = {
  short: 'var(--red)', met: 'var(--green)', surplus: 'var(--blue)',
  uncontracted: 'var(--amber)', no_data: 'var(--faint)',
};

export default function FleetInventoryView() {
  const { units } = useTubular();
  const [records, setRecords] = useState<TubularRecordRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [mode, setMode] = useState<'fleet' | string>('fleet'); // 'fleet' or unit id
  const [category, setCategory] = useState<'all' | TubularCategory>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [cat, recs] = await Promise.all([fetchCatalog(), fetchVisibleRecords()]);
        setCatalog(cat); setRecords(recs);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const catById = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);

  const filtered = useMemo(() => records.filter((r) => {
    const c = catById.get(r.catalogItemId);
    if (!c) return false;
    if (category !== 'all' && c.category !== category) return false;
    if (mode !== 'fleet' && r.unitId !== mode) return false;
    if (search && !c.description.toLowerCase().includes(search.toLowerCase())
        && !(r.remarks ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [records, catById, category, mode, search]);

  /** Fleet mode: one aggregated line per catalog item (duplicates roll up here — never in storage). */
  const fleetLines = useMemo(() => {
    const byItem = new Map<string, TubularRecordRow[]>();
    for (const r of filtered) {
      const list = byItem.get(r.catalogItemId) ?? [];
      list.push(r);
      byItem.set(r.catalogItemId, list);
    }
    return [...byItem.entries()]
      .map(([itemId, rows]) => ({
        item: catById.get(itemId) as CatalogItem,
        totals: aggregate(rows.map((r) => ({
          onContract: r.onContract, premium: r.premium, class2: r.class2,
          class3: r.class3, scrap: r.scrap, needsInspection: r.needsInspection,
        }))),
        unitCount: new Set(rows.map((r) => r.unitId)).size,
        lastUpdate: rows.map((r) => r.updatedAt).sort().slice(-1)[0] ?? '',
      }))
      .sort((a, b) => a.item.position - b.item.position);
  }, [filtered, catById]);

  if (loading) return <div className="placeholder">Loading inventory…</div>;
  if (error) return <div className="placeholder"><strong>Fleet Inventory</strong>{error}</div>;

  return (
    <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <select value={mode} onChange={(e) => setMode(e.target.value)}
          style={{ background: 'var(--panel)', color: 'var(--ink)', border: '1px solid var(--line2)', borderRadius: 7, padding: '6px 8px' }}>
          <option value="fleet">Fleet-wide (aggregated)</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value as 'all' | TubularCategory)}
          style={{ background: 'var(--panel)', color: 'var(--ink)', border: '1px solid var(--line2)', borderRadius: 7, padding: '6px 8px' }}>
          <option value="all">All categories</option>
          {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>
        <input placeholder="Search description / remarks…" value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ background: 'var(--panel)', color: 'var(--ink)', border: '1px solid var(--line2)', borderRadius: 7, padding: '6px 10px', width: 240 }} />
        <span style={{ color: 'var(--faint)', fontSize: 12 }}>
          {mode === 'fleet' ? `${fleetLines.length} tubular types` : `${filtered.length} rows`} · computed live from records
        </span>
      </div>

      <table style={{ borderCollapse: 'collapse', width: '100%', background: 'var(--panel)' }}>
        <thead>
          <tr>
            {(mode === 'fleet'
              ? ['TUBULAR DESCRIPTION', 'UNITS', 'ON CONTRACT', 'ON BOARD', 'PREMIUM', 'CLASS 2', 'CLASS 3', 'SCRAP', 'NEEDS INSP', 'SERVICEABLE', 'NET SHORTFALL', 'STATUS', 'LAST UPDATE']
              : ['TUBULAR DESCRIPTION', 'ON CONTRACT', 'ON BOARD', 'PREMIUM', 'CLASS 2', 'CLASS 3', 'SCRAP', 'NEEDS INSP', 'DAMAGED', 'TO REPAIR', 'SERVICEABLE', 'CONTRACTUALLY LESS', 'STATUS', 'REMARKS', 'LAST UPDATE']
            ).map((h) => <th key={h} style={{ ...th, textAlign: h === 'TUBULAR DESCRIPTION' ? 'left' : 'right' }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {mode === 'fleet'
            ? fleetLines.map(({ item, totals, unitCount, lastUpdate }) => {
                const st = fleetStatus(totals);
                return (
                  <tr key={item.id}>
                    <td style={{ ...cell, textAlign: 'left', fontFamily: 'var(--body)' }}>{item.description}</td>
                    <td style={cell}>{unitCount}</td>
                    <td style={cell}>{totals.onContract}</td>
                    <td style={cell}>{totals.onBoard}</td>
                    <td style={cell}>{totals.premium}</td>
                    <td style={cell}>{totals.class2}</td>
                    <td style={cell}>{totals.class3}</td>
                    <td style={cell}>{totals.scrap}</td>
                    <td style={cell}>{totals.needsInspection}</td>
                    <td style={cell}>{totals.serviceable}</td>
                    <td style={{ ...cell, color: totals.serviceable - totals.onContract < 0 ? 'var(--red)' : 'var(--green)' }}>
                      {totals.serviceable - totals.onContract}
                    </td>
                    <td style={{ ...cell, color: statusColor[st], fontWeight: 700, textAlign: 'center' }}>{FLEET_STATUS_LABEL[st]}</td>
                    <td style={{ ...cell, color: 'var(--faint)' }}>{lastUpdate ? new Date(lastUpdate).toLocaleDateString() : '—'}</td>
                  </tr>
                );
              })
            : filtered.map((r) => {
                const item = catById.get(r.catalogItemId);
                const nums = { onContract: r.onContract, premium: r.premium, class2: r.class2, class3: r.class3, scrap: r.scrap, needsInspection: r.needsInspection };
                const st = fleetStatus(nums);
                return (
                  <tr key={r.id}>
                    <td style={{ ...cell, textAlign: 'left', fontFamily: 'var(--body)' }}>
                      {item?.description}
                      <span style={{ color: 'var(--faint)', fontSize: 10.5 }}> · {unitById.get(r.unitId)?.name}</span>
                    </td>
                    <td style={cell}>{r.onContract}</td>
                    <td style={cell} title={r.onBoardOverride != null ? `Reported total ${r.onBoardOverride} (legacy import)` : undefined}>
                      {r.onBoard}{r.onBoardOverride != null && <span style={{ color: 'var(--amber)' }}> ⚑</span>}
                    </td>
                    <td style={cell}>{r.premium}</td>
                    <td style={cell}>{r.class2}</td>
                    <td style={cell}>{r.class3}</td>
                    <td style={cell}>{r.scrap}</td>
                    <td style={cell}>{r.needsInspection}</td>
                    <td style={cell}>{r.damagedOnLocation}</td>
                    <td style={cell}>{r.sendToRepair}</td>
                    <td style={cell}>{serviceable(nums)}</td>
                    <td style={{ ...cell, color: r.contractDelta < 0 ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>
                      {r.contractDelta >= 0 ? 'OK' : r.contractDelta}
                    </td>
                    <td style={{ ...cell, color: statusColor[st], fontWeight: 700, textAlign: 'center' }}>{FLEET_STATUS_LABEL[st]}</td>
                    <td style={{ ...cell, textAlign: 'left', fontFamily: 'var(--body)', color: 'var(--dim)' }}>{r.remarks}</td>
                    <td style={{ ...cell, color: 'var(--faint)' }}>{new Date(r.updatedAt).toLocaleDateString()}</td>
                  </tr>
                );
              })}
        </tbody>
      </table>
    </div>
  );
}
