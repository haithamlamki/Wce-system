// ============================================================================
//  Transfers — rig-to-rig movement ledger + actions, re-skinned in the
//  prototype design language (form-card, unit-bar selects, tbl-wrap, st
//  badges). Logic unchanged: creation commits stock ("To Other Rig"); the
//  receiving unit (or an approver) confirms delivery via complete_movement().
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useTubular } from '../state/TubularContext';
import { useToast } from '../components/shell/Toast';
import { fetchCatalog, fetchUnitRecords, type CatalogItem, type TubularRecordRow } from '../lib/records';

interface MovementRow {
  id: string; record_id: string; from_unit_id: string; to_unit_id: string;
  quantity: number; status: 'pending' | 'completed' | 'cancelled';
  note: string | null; created_at: string; created_by: string;
}

const ST_MAP: Record<MovementRow['status'], { cls: string; label: string }> = {
  pending: { cls: 'balanced', label: 'PENDING' },
  completed: { cls: 'surplus', label: 'COMPLETED' },
  cancelled: { cls: 'nodata', label: 'CANCELLED' },
};

export default function MovementsView() {
  const { units, hasPerm } = useTubular();
  const toast = useToast();
  const [allUnits, setAllUnits] = useState<Array<{ id: string; name: string }>>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [srcUnit, setSrcUnit] = useState('');
  const [srcRecords, setSrcRecords] = useState<TubularRecordRow[]>([]);
  const [recordId, setRecordId] = useState('');
  const [destUnit, setDestUnit] = useState('');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
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

  const act = async (fn: () => Promise<{ error: { message: string } | null }>, ok: string) => {
    setBusy(true);
    try {
      const { error: e } = await fn();
      if (e) throw new Error(e.message);
      toast(ok, 'success');
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally { setBusy(false); }
  };

  const createTransfer = () =>
    act(async () => supabase!.rpc('transfer_tubular', {
      p_record_id: recordId, p_to_unit_id: destUnit,
      p_quantity: Number(qty), p_note: note || null,
    }), 'Transfer created — stock committed under "To Other Rig".')
      .then(() => { setQty(''); setNote(''); });

  const canCreate = hasPerm('data_entry') && units.length > 0;

  return (
    <section className="view" id="view-transfers">
      <div className="section-head">
        <div className="section-title">Rig-to-Rig Transfers</div>
        <div className="section-sub">Stock moves only when the receiving unit confirms delivery</div>
      </div>

      {canCreate && (
        <div className="form-card">
          <div className="section-title" style={{ marginBottom: 16 }}>New Transfer</div>
          <div className="form-row four">
            <div className="form-field">
              <label>Source Unit</label>
              <select value={srcUnit} onChange={(e) => setSrcUnit(e.target.value)}>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Tubular (premium stock)</label>
              <select value={recordId} onChange={(e) => setRecordId(e.target.value)}>
                <option value="">— tubular —</option>
                {srcRecords.filter((r) => r.premium > 0).map((r) => (
                  <option key={r.id} value={r.id}>
                    {catById.get(r.catalogItemId)?.description} (premium {r.premium}{r.remarks ? `, ${r.remarks}` : ''})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Destination</label>
              <select value={destUnit} onChange={(e) => setDestUnit(e.target.value)}>
                <option value="">— destination —</option>
                {allUnits.filter((u) => u.id !== srcUnit).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Quantity (Joints)</label>
              <input placeholder="qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>Note</label>
              <input placeholder="optional" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="form-field">
              <label>&nbsp;</label>
              <button className="btn" disabled={busy || !recordId || !destUnit || !/^[1-9]\d*$/.test(qty)}
                onClick={() => void createTransfer()}>
                ⇄ Create Transfer
              </button>
            </div>
          </div>
          <div className="amap-note">
            Transfers move premium (serviceable) stock. Creating a transfer commits the quantity under
            "To Other Rig"; stock only moves when the receiving unit confirms receipt.
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <h3>Movement Ledger</h3>
          <span className="badge">{movements.length} recent movements</span>
        </div>
        <div className="tbl-scroll">
          <table>
            <thead>
              <tr><th>When</th><th>From</th><th>To</th><th className="mono">Qty</th><th>Status</th><th>Note</th><th /></tr>
            </thead>
            <tbody>
              {movements.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-3)' }}>No movements yet.</td></tr>
              )}
              {movements.map((m) => {
                const canReceive = m.status === 'pending'
                  && (hasPerm('approve_movements') || (hasPerm('data_entry') && myUnitIds.has(m.to_unit_id)));
                const canCancel = m.status === 'pending'
                  && (hasPerm('approve_movements') || myUnitIds.has(m.from_unit_id));
                const st = ST_MAP[m.status];
                return (
                  <tr key={m.id}>
                    <td className="mono">{new Date(m.created_at).toLocaleString()}</td>
                    <td className="mono">{unitName(m.from_unit_id)}</td>
                    <td className="mono">{unitName(m.to_unit_id)}</td>
                    <td className="num">{m.quantity}</td>
                    <td><span className={`st ${st.cls}`}>{st.label}</span></td>
                    <td style={{ whiteSpace: 'normal', color: 'var(--text-3)' }}>{m.note}</td>
                    <td>
                      {canReceive && (
                        <button className="btn-tr" disabled={busy}
                          onClick={() => void act(async () => supabase!.rpc('complete_movement', { p_movement_id: m.id }), 'Receipt confirmed — stock moved.')}>
                          Confirm receipt
                        </button>
                      )}{' '}
                      {canCancel && (
                        <button className="btn-tr danger" disabled={busy}
                          onClick={() => void act(async () => supabase!.rpc('cancel_movement', { p_movement_id: m.id }), 'Transfer cancelled — commitment released.')}>
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
