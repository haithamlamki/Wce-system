// ============================================================================
//  Order Pipe & Delivery — real staged workflow (no demo timers). Every stage
//  change is an explicit authorized action; approval allocates stock from
//  concrete source records (availability = P+C2 − holds; Class 3/Scrap never
//  orderable); delivery is the only thing that updates the destination.
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useTubular } from '../state/TubularContext';
import { fetchCatalog, type CatalogItem } from '../lib/records';

interface Order {
  id: string; order_no: string; requesting_unit_id: string; status: string;
  priority: string; needed_by: string | null; notes: string | null; created_at: string;
}
interface Item { id: string; order_id: string; catalog_item_id: string; quantity: number }
interface Avail { record_id: string; unit_id: string; catalog_item_id: string; serviceable: number; held: number; available: number }

const STAGES = ['requested', 'approved', 'picked', 'in_transit', 'delivered'] as const;
const STAGE_LABEL: Record<string, string> = {
  requested: 'Requested', approved: 'Approved', picked: 'Picked at Yard',
  in_transit: 'In Transit', delivered: 'Delivered', cancelled: 'Cancelled',
};

const sel: React.CSSProperties = { background: 'var(--panel)', color: 'var(--ink)', border: '1px solid var(--line2)', borderRadius: 7, padding: '6px 8px' };
const tdS: React.CSSProperties = { border: '1px solid var(--line)', padding: '5px 8px', font: '12px var(--mono)' };
const card: React.CSSProperties = { background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 10, padding: 14 };
const btn: React.CSSProperties = { ...sel, cursor: 'pointer', fontSize: 12 };

export default function OrdersView() {
  const { units, hasPerm } = useTubular();
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [avail, setAvail] = useState<Avail[]>([]);
  const [allUnits, setAllUnits] = useState<Array<{ id: string; name: string }>>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // create form
  const [nUnit, setNUnit] = useState(''); const [nItem, setNItem] = useState('');
  const [nQty, setNQty] = useState(''); const [nNeeded, setNNeeded] = useState('');
  const [nPriority, setNPriority] = useState('normal'); const [nNote, setNNote] = useState('');
  // approval allocation: order item id -> record id (single-source v1)
  const [alloc, setAlloc] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!supabase) return;
    const [o, i, a, u, cat] = await Promise.all([
      supabase.from('pipe_orders').select('*').order('created_at', { ascending: false }).limit(40),
      supabase.from('pipe_order_items').select('*'),
      supabase.from('tubular_availability').select('*'),
      supabase.from('units').select('id, name').eq('active', true).order('name'),
      fetchCatalog(),
    ]);
    if (!o.error) setOrders((o.data ?? []) as Order[]);
    if (!i.error) setItems((i.data ?? []) as Item[]);
    if (!a.error) setAvail((a.data ?? []) as Avail[]);
    if (!u.error) setAllUnits((u.data ?? []) as Array<{ id: string; name: string }>);
    setCatalog(cat);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!nUnit && units.length) setNUnit(units[0].id); }, [units, nUnit]);

  const catById = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const unitName = useCallback((id: string) => allUnits.find((u) => u.id === id)?.name ?? '…', [allUnits]);
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

  const createOrder = () => act(async () => supabase!.rpc('create_pipe_order', {
    p_unit_id: nUnit,
    p_items: [{ catalog_item_id: nItem, quantity: Number(nQty) }],
    p_needed_by: nNeeded || null, p_priority: nPriority, p_note: nNote || null,
  })).then(() => { setNItem(''); setNQty(''); setNNote(''); });

  const approve = (o: Order) => {
    const oItems = items.filter((i) => i.order_id === o.id);
    const allocations = oItems.map((i) => ({
      order_item_id: i.id, record_id: alloc[i.id], quantity: i.quantity,
    }));
    if (allocations.some((a) => !a.record_id)) {
      setError('Pick a source record for every item before approving.');
      return;
    }
    void act(async () => supabase!.rpc('approve_pipe_order', { p_order_id: o.id, p_allocations: allocations }));
  };

  const canRequest = hasPerm('data_entry') || hasPerm('manage_orders');

  return (
    <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 16 }}>
      {error && <div role="alert" style={{ border: '1px solid var(--red)', color: 'var(--red)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 13 }}>{error}</div>}

      {canRequest && units.length > 0 && (
        <section style={{ ...card, marginBottom: 16 }}>
          <h3 style={{ fontFamily: 'var(--disp)', margin: '0 0 10px' }}>Request pipe</h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={nUnit} onChange={(e) => setNUnit(e.target.value)} style={sel} aria-label="Requesting unit">
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <select value={nItem} onChange={(e) => setNItem(e.target.value)} style={{ ...sel, maxWidth: 300 }} aria-label="Tubular">
              <option value="">— tubular —</option>
              {catalog.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.description}</option>)}
            </select>
            <input placeholder="qty" inputMode="numeric" value={nQty} onChange={(e) => setNQty(e.target.value)} style={{ ...sel, width: 70 }} />
            <input type="date" value={nNeeded} onChange={(e) => setNNeeded(e.target.value)} style={sel} aria-label="Needed by" />
            <select value={nPriority} onChange={(e) => setNPriority(e.target.value)} style={sel} aria-label="Priority">
              {['low', 'normal', 'high', 'urgent'].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input placeholder="note" value={nNote} onChange={(e) => setNNote(e.target.value)} style={{ ...sel, width: 200 }} />
            <button disabled={busy || !nItem || !/^[1-9]\d*$/.test(nQty)}
              onClick={() => void createOrder()}
              style={{ border: 0, background: 'var(--accent)', color: '#fff', padding: '7px 16px', borderRadius: 7, fontWeight: 700, cursor: 'pointer' }}>
              Submit request
            </button>
          </div>
        </section>
      )}

      <div style={{ display: 'grid', gap: 14 }}>
        {orders.map((o) => {
          const oItems = items.filter((i) => i.order_id === o.id);
          const stageIdx = STAGES.indexOf(o.status as typeof STAGES[number]);
          return (
            <section key={o.id} style={card}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <strong style={{ fontFamily: 'var(--mono)' }}>{o.order_no}</strong>
                <span>{unitName(o.requesting_unit_id)}</span>
                <span style={{ color: o.priority === 'urgent' ? 'var(--red)' : o.priority === 'high' ? 'var(--amber)' : 'var(--faint)', fontSize: 12 }}>{o.priority}</span>
                {o.needed_by && <span style={{ color: 'var(--faint)', fontSize: 12 }}>needed by {o.needed_by}</span>}
                <div style={{ flex: 1 }} />
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--faint)' }}>{new Date(o.created_at).toLocaleString()}</span>
              </div>

              {/* stage timeline */}
              <div style={{ display: 'flex', gap: 4, margin: '10px 0', alignItems: 'center', flexWrap: 'wrap' }}>
                {o.status === 'cancelled'
                  ? <span style={{ color: 'var(--red)', fontWeight: 700, fontSize: 12 }}>✕ CANCELLED</span>
                  : STAGES.map((s, i) => (
                    <span key={s} style={{
                      fontSize: 11, fontFamily: 'var(--mono)', padding: '3px 9px', borderRadius: 12,
                      background: i <= stageIdx ? 'var(--accent)' : 'var(--sunk)',
                      color: i <= stageIdx ? '#fff' : 'var(--faint)',
                    }}>
                      {i < stageIdx ? '✓ ' : ''}{STAGE_LABEL[s]}
                    </span>
                  ))}
              </div>

              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <tbody>
                  {oItems.map((i) => {
                    const sources = avail.filter((a) => a.catalog_item_id === i.catalog_item_id
                      && a.unit_id !== o.requesting_unit_id && a.available > 0);
                    return (
                      <tr key={i.id}>
                        <td style={{ ...tdS, fontFamily: 'var(--body)' }}>{catById.get(i.catalog_item_id)?.description}</td>
                        <td style={{ ...tdS, textAlign: 'right' }}>{i.quantity} jt</td>
                        {o.status === 'requested' && hasPerm('approve_orders') && (
                          <td style={tdS}>
                            <select value={alloc[i.id] ?? ''} onChange={(e) => setAlloc((a) => ({ ...a, [i.id]: e.target.value }))} style={{ ...sel, padding: '3px 6px', fontSize: 12 }} aria-label="Source record">
                              <option value="">— source (available P+C2) —</option>
                              {sources.map((s) => (
                                <option key={s.record_id} value={s.record_id}>
                                  {unitName(s.unit_id)} — {s.available} available
                                </option>
                              ))}
                            </select>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {o.status === 'requested' && hasPerm('approve_orders') && (
                  <button style={{ ...btn, color: 'var(--green)' }} disabled={busy} onClick={() => approve(o)}>Approve &amp; reserve</button>
                )}
                {o.status === 'approved' && hasPerm('manage_orders') && (
                  <button style={btn} disabled={busy} onClick={() => void act(async () => supabase!.rpc('advance_pipe_order', { p_order_id: o.id, p_to: 'picked' }))}>Mark picked at yard</button>
                )}
                {o.status === 'picked' && hasPerm('manage_orders') && (
                  <button style={btn} disabled={busy} onClick={() => void act(async () => supabase!.rpc('advance_pipe_order', { p_order_id: o.id, p_to: 'in_transit' }))}>Dispatch (in transit)</button>
                )}
                {o.status === 'in_transit' && (hasPerm('manage_orders') || (hasPerm('data_entry') && myUnitIds.has(o.requesting_unit_id))) && (
                  <button style={{ ...btn, color: 'var(--green)' }} disabled={busy} onClick={() => void act(async () => supabase!.rpc('advance_pipe_order', { p_order_id: o.id, p_to: 'delivered' }))}>Confirm delivery</button>
                )}
                {!['delivered', 'cancelled'].includes(o.status)
                  && (hasPerm('approve_orders') || hasPerm('manage_orders') || o.status === 'requested') && (
                  <button style={{ ...btn, color: 'var(--red)' }} disabled={busy} onClick={() => void act(async () => supabase!.rpc('cancel_pipe_order', { p_order_id: o.id, p_reason: null }))}>Cancel</button>
                )}
                {o.notes && <span style={{ color: 'var(--dim)', fontSize: 12, alignSelf: 'center' }}>{o.notes}</span>}
              </div>
            </section>
          );
        })}
        {orders.length === 0 && <div className="placeholder"><strong>Order Pipe</strong>No orders yet.</div>}
      </div>
    </div>
  );
}
