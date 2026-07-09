// ============================================================================
//  Order Pipe & Track Delivery — pixel-faithful port of the prototype's
//  #view-orders: unit-bar (My Rig, requests chip, admin panel gate), the
//  Available Pipe pool table + Request Pipe form (grid-2-3), My Order
//  Tracking cards with order-timers + the 5-step tracker, and the Admin
//  all-orders table (stage select / Advance / Cancel). Everything runs on
//  the real lifecycle RPCs — no demo timers: stage clocks derive from actual
//  pipe_order_events timestamps, and approval places real reservation holds
//  (greedy auto-allocation across the largest available P+C2 sources).
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../state/AuthContext';
import { useTubular } from '../state/TubularContext';
import { useToast } from '../components/shell/Toast';
import { fetchCatalog, type CatalogItem } from '../lib/records';

interface Order {
  id: string; order_no: string; requesting_unit_id: string; requested_by: string;
  status: string; priority: string; needed_by: string | null; notes: string | null; created_at: string;
}
interface Item { id: string; order_id: string; catalog_item_id: string; quantity: number }
interface OrderEvent { order_id: string; to_status: string; occurred_at: string }
interface Avail { record_id: string; unit_id: string; catalog_item_id: string; available: number }

const STAGES = ['requested', 'approved', 'picked', 'in_transit', 'delivered'] as const;
const STAGE_LABEL: Record<string, string> = {
  requested: 'Requested', approved: 'Approved', picked: 'Picked at Yard',
  in_transit: 'In Transit', delivered: 'Delivered',
};
const NEXT_STAGE: Record<string, string> = { approved: 'picked', picked: 'in_transit', in_transit: 'delivered' };

function fmtElapsed(ms: number): string {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

export default function OrdersView() {
  const { fullName } = useAuth();
  const { units, hasPerm } = useTubular();
  const toast = useToast();
  const canAdmin = hasPerm('approve_orders') || hasPerm('manage_orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [avail, setAvail] = useState<Avail[]>([]);
  const [allUnits, setAllUnits] = useState<Array<{ id: string; name: string }>>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [myRig, setMyRig] = useState('');
  const [adminOpen, setAdminOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  // request form
  const [oDesc, setODesc] = useState(''); const [oQty, setOQty] = useState('');
  const [oPriority, setOPriority] = useState('Standard'); const [oNotes, setONotes] = useState('');

  const load = useCallback(async () => {
    if (!supabase) return;
    const [o, i, e, a, u, cat] = await Promise.all([
      supabase.from('pipe_orders').select('*').order('created_at', { ascending: false }).limit(60),
      supabase.from('pipe_order_items').select('*'),
      supabase.from('pipe_order_events').select('order_id, to_status, occurred_at'),
      supabase.from('tubular_availability').select('record_id, unit_id, catalog_item_id, available'),
      supabase.from('units').select('id, name').eq('active', true).order('name'),
      fetchCatalog(),
    ]);
    if (!o.error) setOrders((o.data ?? []) as Order[]);
    if (!i.error) setItems((i.data ?? []) as Item[]);
    if (!e.error) setEvents((e.data ?? []) as OrderEvent[]);
    if (!a.error) setAvail((a.data ?? []) as Avail[]);
    if (!u.error) setAllUnits((u.data ?? []) as Array<{ id: string; name: string }>);
    setCatalog(cat);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!myRig && units.length) setMyRig(units[0].id); }, [units, myRig]);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  void tick;

  const catById = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const unitName = useCallback((id: string) => allUnits.find((u) => u.id === id)?.name
    ?? units.find((u) => u.id === id)?.name ?? '…', [allUnits, units]);

  /** Pool: available (P+C2 − holds) per catalog item, excluding my own rig's stock. */
  const pool = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of avail) {
      if (a.unit_id === myRig) continue;
      m.set(a.catalog_item_id, (m.get(a.catalog_item_id) ?? 0) + a.available);
    }
    return catalog
      .filter((c) => (m.get(c.id) ?? 0) > 0)
      .map((c) => ({ item: c, available: m.get(c.id)! }))
      .sort((x, y) => x.item.position - y.item.position);
  }, [avail, catalog, myRig]);

  const myOrders = useMemo(() => orders.filter((o) => o.requesting_unit_id === myRig), [orders, myRig]);
  const eventsFor = useCallback((orderId: string) =>
    events.filter((e) => e.order_id === orderId).sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)),
  [events]);

  const act = async (fn: () => Promise<{ error: { message: string } | null }>, ok: string) => {
    setBusy(true);
    try {
      const { error } = await fn();
      if (error) throw new Error(error.message);
      toast(ok, 'success');
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally { setBusy(false); }
  };

  const submitRequest = () => {
    if (!oDesc || !/^[1-9]\d*$/.test(oQty)) { toast('Choose a tubular and a valid quantity.', 'error'); return; }
    void act(async () => supabase!.rpc('create_pipe_order', {
      p_unit_id: myRig,
      p_items: [{ catalog_item_id: oDesc, quantity: Number(oQty) }],
      p_needed_by: null,
      p_priority: oPriority === 'Urgent' ? 'urgent' : 'normal',
      p_note: oNotes || null,
    }), 'Request submitted.').then(() => { setODesc(''); setOQty(''); setONotes(''); });
  };

  /** Approve: greedily allocate each item from the largest available source records. */
  const approveOrder = async (o: Order) => {
    const oItems = items.filter((i) => i.order_id === o.id);
    const allocations: Array<{ order_item_id: string; record_id: string; quantity: number }> = [];
    for (const it of oItems) {
      let remaining = it.quantity;
      const sources = avail
        .filter((a) => a.catalog_item_id === it.catalog_item_id && a.unit_id !== o.requesting_unit_id && a.available > 0)
        .sort((x, y) => y.available - x.available);
      for (const s of sources) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, s.available);
        allocations.push({ order_item_id: it.id, record_id: s.record_id, quantity: take });
        remaining -= take;
      }
      if (remaining > 0) {
        toast(`Insufficient available stock for ${catById.get(it.catalog_item_id)?.description ?? 'item'} (short ${remaining}).`, 'error');
        return;
      }
    }
    await act(async () => supabase!.rpc('approve_pipe_order', { p_order_id: o.id, p_allocations: allocations }),
      'Order approved — stock reserved.');
  };

  const setStage = async (o: Order, target: string) => {
    if (target === o.status) return;
    if (o.status === 'requested' && target === 'approved') { await approveOrder(o); return; }
    // advance through legal transitions one by one up to the target
    const chain = ['approved', 'picked', 'in_transit', 'delivered'];
    const from = chain.indexOf(o.status);
    const to = chain.indexOf(target);
    if (from === -1 || to <= from) { toast(`Cannot move from ${o.status} to ${target}.`, 'error'); return; }
    setBusy(true);
    try {
      for (let i = from + 1; i <= to; i++) {
        const { error } = await supabase!.rpc('advance_pipe_order', { p_order_id: o.id, p_to: chain[i] });
        if (error) throw new Error(error.message);
      }
      toast(`Order ${o.order_no} → ${STAGE_LABEL[target]}.`, 'success');
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
      await load();
    } finally { setBusy(false); }
  };

  const renderTracker = (o: Order) => {
    const stageIdx = STAGES.indexOf(o.status as typeof STAGES[number]);
    return (
      <div className="order-track">
        {STAGES.map((s, i) => {
          const cls = o.status === 'cancelled'
            ? (i === 0 ? 'done' : '')
            : i < stageIdx || o.status === 'delivered' && i === stageIdx ? 'done' : i === stageIdx ? 'current' : '';
          return (
            <div key={s} className={`step ${cls}`.trim()}>
              <div className="bar" />
              <div className="dot">{cls === 'done' ? '✓' : i + 1}</div>
              <div className="lbl">{STAGE_LABEL[s]}</div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <section className="view" id="view-orders">
      <div className="section-head">
        <div className="section-title">Order Pipe &amp; Track Delivery</div>
        <div className="section-sub">Request tubulars for your rig and follow every step to arrival</div>
      </div>

      <div className="unit-bar">
        <span className="lbl">My Rig</span>
        <select id="ord-myrig" value={myRig} onChange={(e) => setMyRig(e.target.value)}>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <span className="meta-chip">Requests placed: <span className="v" id="ord-count-mine">{myOrders.length}</span></span>
        <span className="spacer" />
        {canAdmin && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--text-2)' }}>
            <input id="ord-admin-toggle" type="checkbox" checked={adminOpen} onChange={(e) => setAdminOpen(e.target.checked)} />
            Admin control panel
          </label>
        )}
      </div>

      <div className="grid-2-3">
        <div className="panel">
          <div className="panel-head">
            <h3>Available Pipe (Fleet Pool)</h3>
            <span className="badge" id="avail-badge">{pool.length} types · P+C2 minus holds</span>
          </div>
          <div className="tbl-scroll">
            <table className="avail-tbl">
              <thead>
                <tr><th>Description</th><th>Category</th><th className="mono">Available (Joints)</th><th /></tr>
              </thead>
              <tbody id="avail-tbody">
                {pool.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-3)' }}>No serviceable stock available in the fleet pool.</td></tr>}
                {pool.map(({ item, available }) => (
                  <tr key={item.id}>
                    <td>{item.description}</td>
                    <td>{item.category.replace('_', ' ').toUpperCase()}</td>
                    <td className="qty-cell">{available.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn-tr" data-req-desc={item.id} onClick={() => setODesc(item.id)}>Request</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="form-card" style={{ marginBottom: 0 }}>
          <div className="section-title" style={{ marginBottom: 16 }}>Request Pipe</div>
          <div className="form-field" style={{ marginBottom: 14 }}>
            <label>Tubular <span className="req">*</span></label>
            <select id="ord-desc" value={oDesc} onChange={(e) => setODesc(e.target.value)}>
              <option value="">— tubular —</option>
              {catalog.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.description}</option>)}
            </select>
          </div>
          <div className="form-field" style={{ marginBottom: 14 }}>
            <label>Quantity (Joints) <span className="req">*</span></label>
            <input id="ord-qty" placeholder="e.g. 20" inputMode="numeric" value={oQty} onChange={(e) => setOQty(e.target.value)} />
          </div>
          <div className="form-field" style={{ marginBottom: 14 }}>
            <label>Priority</label>
            <select id="ord-priority" value={oPriority} onChange={(e) => setOPriority(e.target.value)}>
              <option>Standard</option><option>Urgent</option>
            </select>
          </div>
          <div className="form-field" style={{ marginBottom: 14 }}>
            <label>Notes</label>
            <textarea id="ord-notes" value={oNotes} onChange={(e) => setONotes(e.target.value)} />
          </div>
          <button className="btn sm" id="ord-submit" disabled={busy || !hasPerm('data_entry')} onClick={submitRequest}>
            Submit Request
          </button>
        </div>
      </div>

      <div className="section-head">
        <div className="section-title">My Order Tracking</div>
        <div className="section-sub">Live status from request to arrival at your rig</div>
      </div>
      <div id="orders-mine-list">
        {myOrders.length === 0 && (
          <div className="empty-cert">
            <div className="ico">⛟</div>
            <div className="title">No Orders Yet</div>
            <div className="desc">Submit a request above — every stage from approval to delivery is tracked here.</div>
          </div>
        )}
        {myOrders.map((o) => {
          const oItems = items.filter((i) => i.order_id === o.id);
          const evs = eventsFor(o.id);
          const lastEvent = evs.slice(-1)[0];
          const stageMs = lastEvent ? Date.now() - new Date(lastEvent.occurred_at).getTime() : 0;
          const deliveredEv = evs.find((e) => e.to_status === 'delivered');
          const totalMs = (deliveredEv ? new Date(deliveredEv.occurred_at).getTime() : Date.now()) - new Date(o.created_at).getTime();
          return (
            <div className="order-card" key={o.id}>
              <div className="order-card-head">
                <div>
                  <div className="order-title">{oItems.map((i) => `${catById.get(i.catalog_item_id)?.description ?? '…'}`).join(' · ')}</div>
                  <div className="order-sub">
                    {o.order_no} · {oItems.map((i) => `${i.quantity} jt`).join(' · ')} · {o.priority} · requested {new Date(o.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start' }}>
                  {o.status !== 'cancelled' && (
                    <>
                      <div className="order-timer">
                        <span className="lbl">Time In Current Stage</span>
                        {o.status === 'delivered' ? '—' : fmtElapsed(stageMs)}
                      </div>
                      <div className="order-timer">
                        <span className="lbl">Total Delivery Time</span>
                        {fmtElapsed(totalMs)}
                      </div>
                    </>
                  )}
                  {o.status === 'cancelled' && <span className="st short">CANCELLED</span>}
                </div>
              </div>
              {o.status !== 'cancelled' && renderTracker(o)}
              {o.notes && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>{o.notes}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                {o.status === 'in_transit' && hasPerm('data_entry') && (
                  <button className="btn-tr" disabled={busy}
                    onClick={() => void act(async () => supabase!.rpc('advance_pipe_order', { p_order_id: o.id, p_to: 'delivered' }), 'Delivery confirmed — stock received.')}>
                    Confirm delivery
                  </button>
                )}
                {o.status === 'requested' && (
                  <button className="btn-tr danger" disabled={busy}
                    onClick={() => void act(async () => supabase!.rpc('cancel_pipe_order', { p_order_id: o.id, p_reason: null }), 'Request cancelled.')}>
                    Cancel request
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {canAdmin && adminOpen && (
        <div id="orders-admin-wrap">
          <div className="section-head" style={{ marginTop: 24 }}>
            <div className="section-title">Admin — All Rig Orders</div>
            <div className="section-sub">Advance, deliver or cancel any order across the fleet · {fullName || 'admin'}</div>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr><th>Rig</th><th>Item</th><th className="mono">Qty</th><th>Priority</th><th>Stage</th><th className="mono">Elapsed</th><th>Controls</th></tr>
              </thead>
              <tbody id="orders-admin-tbody">
                {orders.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-3)' }}>No orders.</td></tr>}
                {orders.map((o) => {
                  const oItems = items.filter((i) => i.order_id === o.id);
                  const evs = eventsFor(o.id);
                  const lastEvent = evs.slice(-1)[0];
                  const next = NEXT_STAGE[o.status];
                  return (
                    <tr key={o.id}>
                      <td className="mono">{unitName(o.requesting_unit_id)}</td>
                      <td>{oItems.map((i) => catById.get(i.catalog_item_id)?.description).join(' · ')}</td>
                      <td className="num">{oItems.reduce((n, i) => n + i.quantity, 0)}</td>
                      <td>{o.priority}</td>
                      <td>
                        {['delivered', 'cancelled'].includes(o.status) ? (
                          <span className={`st ${o.status === 'delivered' ? 'surplus' : 'short'}`}>{o.status.toUpperCase()}</span>
                        ) : (
                          <select value={o.status} disabled={busy}
                            onChange={(e) => void setStage(o, e.target.value)}
                            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)', padding: '4px 6px', fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5 }}>
                            {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="num">{lastEvent ? fmtElapsed(Date.now() - new Date(lastEvent.occurred_at).getTime()) : '—'}</td>
                      <td>
                        {o.status === 'requested' && (
                          <button className="btn-tr" disabled={busy} onClick={() => void approveOrder(o)}>Approve</button>
                        )}{' '}
                        {next && o.status !== 'requested' && (
                          <button className="btn-tr" disabled={busy}
                            onClick={() => void act(async () => supabase!.rpc('advance_pipe_order', { p_order_id: o.id, p_to: next }), `Order → ${STAGE_LABEL[next]}.`)}>
                            Advance
                          </button>
                        )}{' '}
                        {!['delivered', 'cancelled'].includes(o.status) && (
                          <button className="btn-tr danger" disabled={busy}
                            onClick={() => void act(async () => supabase!.rpc('cancel_pipe_order', { p_order_id: o.id, p_reason: 'cancelled by admin' }), 'Order cancelled — holds released.')}>
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
      )}
    </section>
  );
}
