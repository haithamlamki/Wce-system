// ============================================================================
//  Contracts — real records replacing the prototype's generated demos.
//  Compliance per line = Σ serviceable (P+C2) of that unit's records for the
//  line's catalog item vs the line quantity (computed live). Drift panel
//  compares contract lines against the records' imported on_contract values.
//  Expiry badges at ≤30 days; expired/archived contracts are read-only
//  history (enforced by RLS, mirrored here).
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useTubular } from '../state/TubularContext';
import { fetchCatalog, fetchVisibleRecords, type CatalogItem, type TubularRecordRow } from '../lib/records';
import { serviceable } from '../lib/calc';

interface Contract {
  id: string; unit_id: string; client: string; contract_ref: string;
  start_date: string | null; end_date: string | null; status: string; notes: string | null;
  updated_at: string;
}
interface Line { id: string; contract_id: string; catalog_item_id: string; quantity: number }

const sel: React.CSSProperties = { background: 'var(--panel)', color: 'var(--ink)', border: '1px solid var(--line2)', borderRadius: 7, padding: '6px 8px' };
const tdS: React.CSSProperties = { border: '1px solid var(--line)', padding: '5px 8px', font: '12px var(--mono)' };
const card: React.CSSProperties = { background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 10, padding: 14 };

function daysToEnd(c: Contract): number | null {
  if (!c.end_date) return null;
  return Math.floor((new Date(c.end_date).getTime() - Date.now()) / 86400000);
}

export default function ContractsView() {
  const { units, hasPerm } = useTubular();
  const canManage = hasPerm('manage_contracts');
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [records, setRecords] = useState<TubularRecordRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  // create form
  const [nUnit, setNUnit] = useState(''); const [nClient, setNClient] = useState('');
  const [nRef, setNRef] = useState(''); const [nStart, setNStart] = useState(''); const [nEnd, setNEnd] = useState('');
  // add-line form (per contract)
  const [lineItem, setLineItem] = useState(''); const [lineQty, setLineQty] = useState('');
  const [lineFor, setLineFor] = useState('');

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const [c, l, cat, recs] = await Promise.all([
        supabase.from('tubular_contracts').select('*').order('updated_at', { ascending: false }),
        supabase.from('tubular_contract_lines').select('*'),
        fetchCatalog(), fetchVisibleRecords(),
      ]);
      if (c.error) throw new Error(c.error.message);
      if (l.error) throw new Error(l.error.message);
      setContracts((c.data ?? []) as Contract[]);
      setLines((l.data ?? []) as Line[]);
      setCatalog(cat); setRecords(recs);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const catById = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const unitName = useCallback((id: string) => units.find((u) => u.id === id)?.name ?? '…', [units]);

  /** serviceable per (unit, catalog item) from live records */
  const servBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of records) {
      const k = `${r.unitId}|${r.catalogItemId}`;
      m.set(k, (m.get(k) ?? 0) + serviceable(r));
    }
    return m;
  }, [records]);

  /** imported on_contract per (unit, catalog item) for the drift panel */
  const onContractBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of records) {
      const k = `${r.unitId}|${r.catalogItemId}`;
      m.set(k, (m.get(k) ?? 0) + r.onContract);
    }
    return m;
  }, [records]);

  const mutate = async (fn: () => Promise<{ error: { message: string } | null }>) => {
    setError('');
    const { error: e } = await fn();
    if (e) setError(e.message); else await load();
  };

  const createContract = () => mutate(async () => supabase!
    .from('tubular_contracts')
    .insert({ unit_id: nUnit, client: nClient, contract_ref: nRef, start_date: nStart || null, end_date: nEnd || null, status: 'active' }));

  const addLine = (contractId: string) => mutate(async () => supabase!
    .from('tubular_contract_lines')
    .insert({ contract_id: contractId, catalog_item_id: lineItem, quantity: Number(lineQty) }));

  const setStatus = (id: string, status: string) => mutate(async () => supabase!
    .from('tubular_contracts').update({ status }).eq('id', id));

  if (loading) return <div className="placeholder">Loading contracts…</div>;

  return (
    <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 16 }}>
      {error && <div role="alert" style={{ border: '1px solid var(--red)', color: 'var(--red)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 13 }}>{error}</div>}

      {canManage && (
        <section style={{ ...card, marginBottom: 16 }}>
          <h3 style={{ fontFamily: 'var(--disp)', margin: '0 0 10px' }}>New contract</h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <select value={nUnit} onChange={(e) => setNUnit(e.target.value)} style={sel} aria-label="Unit">
              <option value="">— unit —</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <input placeholder="Client" value={nClient} onChange={(e) => setNClient(e.target.value)} style={sel} />
            <input placeholder="Contract ref (e.g. C3100000659)" value={nRef} onChange={(e) => setNRef(e.target.value)} style={{ ...sel, width: 220 }} />
            <input type="date" value={nStart} onChange={(e) => setNStart(e.target.value)} style={sel} aria-label="Start date" />
            <input type="date" value={nEnd} onChange={(e) => setNEnd(e.target.value)} style={sel} aria-label="End date" />
            <button disabled={!nUnit || !nRef} onClick={() => void createContract()}
              style={{ border: 0, background: 'var(--accent)', color: '#fff', padding: '7px 16px', borderRadius: 7, fontWeight: 700, cursor: 'pointer' }}>
              Create
            </button>
          </div>
        </section>
      )}

      <div style={{ display: 'grid', gap: 14 }}>
        {contracts.map((c) => {
          const cls = lines.filter((l) => l.contract_id === c.id);
          const d = daysToEnd(c);
          const expiring = c.status === 'active' && d != null && d <= 30;
          return (
            <section key={c.id} style={card}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <strong style={{ fontFamily: 'var(--disp)', fontSize: 16 }}>{c.contract_ref}</strong>
                <span style={{ color: 'var(--dim)' }}>{c.client}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{unitName(c.unit_id)}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--faint)' }}>
                  {c.start_date ?? '…'} → {c.end_date ?? '…'}
                </span>
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                  border: '1px solid var(--line2)',
                  color: c.status === 'active' ? (expiring ? 'var(--amber)' : 'var(--green)') : c.status === 'expired' ? 'var(--red)' : 'var(--dim)',
                }}>
                  {c.status.toUpperCase()}{expiring ? ` · ${d}d LEFT` : d != null && c.status === 'expired' ? '' : ''}
                </span>
                <div style={{ flex: 1 }} />
                {canManage && c.status === 'active' && (
                  <button style={{ ...sel, cursor: 'pointer', fontSize: 12 }} onClick={() => void setStatus(c.id, 'expired')}>Mark expired</button>
                )}
                {canManage && c.status !== 'archived' && c.status !== 'active' && (
                  <button style={{ ...sel, cursor: 'pointer', fontSize: 12 }} onClick={() => void setStatus(c.id, 'archived')}>Archive</button>
                )}
              </div>

              <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 10, background: 'var(--panel)' }}>
                <thead>
                  <tr>{['REQUIRED TUBULAR', 'QTY', 'SERVICEABLE (P+C2)', 'COMPLIANCE', 'RECORDS SAY ON-CONTRACT (DRIFT)'].map((h) => (
                    <th key={h} style={{ ...tdS, background: 'var(--sunk)', color: 'var(--dim)', textAlign: 'left' }}>{h}</th>))}
                  </tr>
                </thead>
                <tbody>
                  {cls.map((l) => {
                    const k = `${c.unit_id}|${l.catalog_item_id}`;
                    const sv = servBy.get(k) ?? 0;
                    const rc = onContractBy.get(k) ?? 0;
                    const ok = sv >= l.quantity;
                    return (
                      <tr key={l.id}>
                        <td style={{ ...tdS, fontFamily: 'var(--body)' }}>{catById.get(l.catalog_item_id)?.description}</td>
                        <td style={{ ...tdS, textAlign: 'right' }}>{l.quantity}</td>
                        <td style={{ ...tdS, textAlign: 'right' }}>{sv}</td>
                        <td style={{ ...tdS, fontWeight: 700, color: ok ? 'var(--green)' : 'var(--red)' }}>
                          {ok ? 'OK' : `${sv - l.quantity}`}
                        </td>
                        <td style={{ ...tdS, textAlign: 'right', color: rc === l.quantity ? 'var(--faint)' : 'var(--amber)' }}>
                          {rc}{rc !== l.quantity ? ` (drift ${rc - l.quantity > 0 ? '+' : ''}${rc - l.quantity})` : ''}
                        </td>
                      </tr>
                    );
                  })}
                  {cls.length === 0 && <tr><td style={{ ...tdS, color: 'var(--faint)' }} colSpan={5}>No lines yet.</td></tr>}
                </tbody>
              </table>

              {canManage && (c.status === 'draft' || c.status === 'active') && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <select value={lineFor === c.id ? lineItem : ''} onChange={(e) => { setLineFor(c.id); setLineItem(e.target.value); }} style={{ ...sel, maxWidth: 320 }} aria-label="Catalog item">
                    <option value="">— add required tubular —</option>
                    {catalog.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.description}</option>)}
                  </select>
                  <input placeholder="qty" inputMode="numeric" value={lineFor === c.id ? lineQty : ''}
                    onChange={(e) => { setLineFor(c.id); setLineQty(e.target.value); }} style={{ ...sel, width: 70 }} />
                  <button disabled={lineFor !== c.id || !lineItem || !/^[1-9]\d*$/.test(lineQty)}
                    onClick={() => void addLine(c.id)} style={{ ...sel, cursor: 'pointer' }}>Add line</button>
                </div>
              )}
            </section>
          );
        })}
        {contracts.length === 0 && <div className="placeholder"><strong>Contracts</strong>No contracts yet.{canManage ? ' Create the first one above.' : ''}</div>}
      </div>
    </div>
  );
}
