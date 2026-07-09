// ============================================================================
//  Transfers — rig-to-rig movement ledger + actions. Creation commits stock
//  ("To Other Rig"); the RECEIVING unit (or an approver) confirms delivery,
//  which atomically moves premium stock via complete_movement(). No silent
//  quantity overwrites anywhere.
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useTubular } from '../state/TubularContext';
import { fetchCatalog, fetchUnitRecords, type CatalogItem, type TubularRecordRow } from '../lib/records';

interface MovementRow {
  id: string; record_id: string; from_unit_id: string; to_unit_id: string;
  quantity: number; status: 'pending' | 'completed' | 'cancelled';
  note: string | null; created_at: string; created_by: string;
}

const sel: React.CSSProperties = { background: 'var(--panel)', color: 'var(--ink)', border: '1px solid var(--line2)', borderRadius: 7, padding: '6px 8px' };
const tdS: React.CSSProperties = { border: '1px solid var(--line)', padding: '5px 8px', font: '12px var(--mono)' };
const btn: React.CSSProperties = { border: '1px solid var(--line2)', background: 'var(--panel)', color: 'var(--ink)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12 };

export default function MovementsView() {
  const { units, hasPerm } = useTubular();
  const [allUnits, setAllUnits] = useState<Array<{ id: string; name: string }>>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [srcUnit, setSrcUnit] = useState('');
  const [srcRecords, setSrcRecords] = useState<TubularRecordRow[]>([]);
  const [recordId, setRecordId] = useState('');
  const [destUnit, setDestUnit] = useState('');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [mv, un] = await Promise.all([
      supabase.from('tubular_movements').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('units').select('id, name').eq('active', true).order('name'),
    ]);
    if (!mv.error) setMovements((mv.data ?? []) as MovementRow[]);
    if (!un.error) setAllUnits((un.data ?? []) as Array<{ id: string; name: string }>);
  }, []);

  useEffect(() => {
    void load();
    void fetchCatalog().then(setCatalog).catch(() => undefined);
  }, [load]);

  useEffect(() => { if (!srcUnit && units.length) setSrcUnit(units[0].id); }, [units, srcUnit]);
  useEffect(() => {
    setRecordId('');
    if (srcUnit) void fetchUnitRecords(srcUnit).then(setSrcRecords).catch(() => setSrcRecords([]));
  }, [srcUnit]);

  const catById = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const unitName = useCallback((id: string) =>
    allUnits.find((u) => u.id === id)?.name ?? units.find((u) => u.id === id)?.name ?? '…',
  [allUnits, units]);
  const myUnitIds = useMemo(() => new Set(units.map((u) => u.id)), [units]);

  const act = async (fn: () => Promise<{ error: { message: string } | null }>) => {
    setBusy(true); setError('');
    try {
      const { error: e } = await fn();
      if (e) throw new Error(e.message);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const createTransfer = () => act(async () => {
    if (!supabase) return { error: { message: 'Cloud not configured' } };
    return supabase.rpc('transfer_tubular', {
      p_record_id: recordId, p_to_unit_id: destUnit,
      p_quantity: Number(qty), p_note: note || null,
    });
  }).then(() => { setQty(''); setNote(''); });

  const canCreate = hasPerm('data_entry') && units.length > 0;

  return (
    <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 16 }}>
      {error && <div role="alert" style={{ border: '1px solid var(--red)', color: 'var(--red)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 13 }}>{error}</div>}

      {canCreate && (
        <section style={{ background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 10, padding: 14, marginBottom: 18 }}>
          <h3 style={{ fontFamily: 'var(--disp)', margin: '0 0 10px' }}>New rig-to-rig transfer</h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={srcUnit} onChange={(e) => setSrcUnit(e.target.value)} style={sel} aria-label="Source unit">
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <select value={recordId} onChange={(e) => setRecordId(e.target.value)} style={{ ...sel, maxWidth: 320 }} aria-label="Tubular record">
              <option value="">— tubular —</option>
              {srcRecords.filter((r) => r.premium > 0).map((r) => (
                <option key={r.id} value={r.id}>
                  {catById.get(r.catalogItemId)?.description} (premium {r.premium}{r.remarks ? `, ${r.remarks}` : ''})
                </option>
              ))}
            </select>
            <span style={{ color: 'var(--faint)' }}>→</span>
            <select value={destUnit} onChange={(e) => setDestUnit(e.target.value)} style={sel} aria-label="Destination unit">
              <option value="">— destination —</option>
              {allUnits.filter((u) => u.id !== srcUnit).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="qty" inputMode="numeric" style={{ ...sel, width: 70 }} aria-label="Quantity" />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="note (optional)" style={{ ...sel, width: 220 }} />
            <button disabled={busy || !recordId || !destUnit || !/^\d+$/.test(qty) || Number(qty) <= 0}
              onClick={() => void createTransfer()}
              style={{ border: 0, background: 'var(--accent)', color: '#fff', padding: '7px 16px', borderRadius: 7, fontWeight: 700, cursor: 'pointer' }}>
              Create transfer
            </button>
          </div>
          <p style={{ color: 'var(--faint)', fontSize: 11.5, margin: '8px 0 0' }}>
            Transfers move premium (serviceable) stock. Creating a transfer commits the quantity under "To Other Rig";
            stock only moves when the receiving unit confirms delivery.
          </p>
        </section>
      )}

      <h3 style={{ fontFamily: 'var(--disp)', margin: '0 0 8px' }}>Movements</h3>
      <table style={{ borderCollapse: 'collapse', width: '100%', background: 'var(--panel)' }}>
        <thead>
          <tr>{['WHEN', 'FROM', 'TO', 'QTY', 'STATUS', 'NOTE', ''].map((h) => (
            <th key={h} style={{ ...tdS, background: 'var(--sunk)', color: 'var(--dim)', textAlign: 'left' }}>{h}</th>))}
          </tr>
        </thead>
        <tbody>
          {movements.map((m) => {
            const canReceive = m.status === 'pending'
              && (hasPerm('approve_movements') || (hasPerm('data_entry') && myUnitIds.has(m.to_unit_id)));
            const canCancel = m.status === 'pending'
              && (hasPerm('approve_movements') || myUnitIds.has(m.from_unit_id));
            return (
              <tr key={m.id}>
                <td style={tdS}>{new Date(m.created_at).toLocaleString()}</td>
                <td style={tdS}>{unitName(m.from_unit_id)}</td>
                <td style={tdS}>{unitName(m.to_unit_id)}</td>
                <td style={{ ...tdS, textAlign: 'right' }}>{m.quantity}</td>
                <td style={{ ...tdS, fontWeight: 700, color: m.status === 'pending' ? 'var(--amber)' : m.status === 'completed' ? 'var(--green)' : 'var(--faint)' }}>
                  {m.status.toUpperCase()}
                </td>
                <td style={{ ...tdS, fontFamily: 'var(--body)', color: 'var(--dim)' }}>{m.note}</td>
                <td style={tdS}>
                  {canReceive && (
                    <button style={{ ...btn, color: 'var(--green)' }} disabled={busy}
                      onClick={() => void act(async () => supabase!.rpc('complete_movement', { p_movement_id: m.id }))}>
                      Confirm receipt
                    </button>
                  )}{' '}
                  {canCancel && (
                    <button style={{ ...btn, color: 'var(--red)' }} disabled={busy}
                      onClick={() => void act(async () => supabase!.rpc('cancel_movement', { p_movement_id: m.id }))}>
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          {movements.length === 0 && <tr><td style={{ ...tdS, color: 'var(--faint)' }} colSpan={7}>No movements yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
