// ============================================================================
//  Dashboard — pixel-faithful port of the prototype's #view-dashboard: 6 KPI
//  cards, 3 live cards, activity feed, 4 Chart.js charts, attention table.
//  All figures computed live from RLS-scoped records (fetchVisibleRecords +
//  calc.ts); activity feed from real submissions & order events. The 5s tick
//  drives the live clock; data refreshes every 60s.
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Chart, BarController, BarElement, DoughnutController, ArcElement,
  CategoryScale, LinearScale, Legend, Tooltip,
} from 'chart.js';
import { supabase } from '../../../lib/supabase';
import { useTubular } from '../state/TubularContext';
import {
  fetchCatalog, fetchVisibleRecords,
  type CatalogItem, type TubularRecordRow,
} from '../lib/records';
import { aggregate, fleetStatus, fleetUtilization, needsAttention } from '../lib/calc';

Chart.register(BarController, BarElement, DoughnutController, ArcElement, CategoryScale, LinearScale, Legend, Tooltip);

const qtyOf = (r: TubularRecordRow) => ({
  onContract: r.onContract, premium: r.premium, class2: r.class2,
  class3: r.class3, scrap: r.scrap, needsInspection: r.needsInspection,
});

const ST_CLASS: Record<string, string> = {
  short: 'short', surplus: 'surplus', met: 'balanced', uncontracted: 'unctr', no_data: 'nodata',
};
const ST_LABEL: Record<string, string> = {
  short: 'SHORT', surplus: 'SURPLUS', met: 'BALANCED', uncontracted: 'UNCONTR.', no_data: 'NO DATA',
};

interface FeedItem { at: string; text: string }

const TOOLTIP_STYLE = {
  backgroundColor: '#0f141c', titleColor: '#f59e0b', bodyColor: '#e6e9ef',
  borderColor: '#232c3a', borderWidth: 1,
};
const GRID = '#1a212d';
const TICK = '#6c7689';

function shortLabel(desc: string): string {
  return desc.length > 26 ? `${desc.slice(0, 24)}…` : desc;
}

export default function TubularDashboardView() {
  const { units } = useTubular();
  const [records, setRecords] = useState<TubularRecordRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [orders, setOrders] = useState<Array<{ status: string }>>([]);
  const [contractsAttn, setContractsAttn] = useState<{ total: number; attn: number }>({ total: 0, attn: 0 });
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [rigFilter, setRigFilter] = useState('all');
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString());
  const [loading, setLoading] = useState(true);

  const chTypeRef = useRef<HTMLCanvasElement>(null);
  const chMixRef = useRef<HTMLCanvasElement>(null);
  const chUnitRef = useRef<HTMLCanvasElement>(null);
  const chVarRef = useRef<HTMLCanvasElement>(null);
  const chartsRef = useRef<Chart[]>([]);

  const load = useCallback(async () => {
    try {
      const [cat, recs] = await Promise.all([fetchCatalog(), fetchVisibleRecords()]);
      setCatalog(cat); setRecords(recs);
      if (supabase) {
        const [o, c, subs, events] = await Promise.all([
          supabase.from('pipe_orders').select('status'),
          supabase.from('tubular_contracts').select('id, status, end_date'),
          supabase.from('tubular_submissions').select('submitted_at, source, note, unit_id').order('submitted_at', { ascending: false }).limit(6),
          supabase.from('pipe_order_events').select('occurred_at, to_status, order_id').order('occurred_at', { ascending: false }).limit(6),
        ]);
        setOrders((o.data ?? []) as Array<{ status: string }>);
        const cl = (c.data ?? []) as Array<{ status: string; end_date: string | null }>;
        const attn = cl.filter((x) => x.status === 'expired'
          || (x.status === 'active' && x.end_date && (new Date(x.end_date).getTime() - Date.now()) / 86400000 <= 30)).length;
        setContractsAttn({ total: cl.length, attn });
        const unitName = (id: string) => units.find((u) => u.id === id)?.name ?? 'unit';
        const items: FeedItem[] = [
          ...((subs.data ?? []) as Array<{ submitted_at: string; source: string; note: string | null; unit_id: string }>)
            .map((s) => ({ at: s.submitted_at, text: `${unitName(s.unit_id)} — ${s.source === 'import' ? 'workbook import' : s.source === 'movement' ? (s.note ?? 'movement') : 'data entry saved'}` })),
          ...((events.data ?? []) as Array<{ occurred_at: string; to_status: string }>)
            .map((e) => ({ at: e.occurred_at, text: `pipe order → ${e.to_status.replace('_', ' ')}` })),
        ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10);
        setFeed(items);
      }
    } finally {
      setLoading(false);
    }
  }, [units]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const clockId = setInterval(() => setClock(new Date().toLocaleTimeString()), 5000);
    const dataId = setInterval(() => { void load(); }, 60000);
    return () => { clearInterval(clockId); clearInterval(dataId); };
  }, [load]);

  const catById = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);

  const scoped = useMemo(
    () => (rigFilter === 'all' ? records : records.filter((r) => r.unitId === rigFilter)),
    [records, rigFilter],
  );

  const agg = useMemo(() => aggregate(scoped.map(qtyOf)), [scoped]);
  const util = fleetUtilization(agg);
  const activeOrders = orders.filter((o) => !['delivered', 'cancelled'].includes(o.status)).length;
  const inTransit = orders.filter((o) => o.status === 'in_transit').length;
  const unitsWithData = useMemo(() => new Set(scoped.map((r) => r.unitId)).size, [scoped]);
  const pct = (n: number) => (agg.onBoard > 0 ? `${((n / agg.onBoard) * 100).toFixed(1)}% of on-board` : '—');
  const lastUpdate = useMemo(() => {
    const recent = scoped.reduce<string | null>((m, r) => (m == null || r.updatedAt > m ? r.updatedAt : m), null);
    if (!recent) return '—';
    return new Date(recent).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }, [scoped]);

  const attention = useMemo(() =>
    scoped.filter((r) => needsAttention(qtyOf(r)))
      .sort((a, b) => ((a.onBoard - a.onContract) - (b.onBoard - b.onContract)) || (b.scrap - a.scrap)),
  [scoped]);

  // ---- charts ---------------------------------------------------------------
  useEffect(() => {
    chartsRef.current.forEach((c) => c.destroy());
    chartsRef.current = [];
    if (loading) return;

    const byDesc = new Map<string, TubularRecordRow[]>();
    for (const r of scoped) byDesc.set(r.catalogItemId, [...(byDesc.get(r.catalogItemId) ?? []), r]);
    const descAgg = [...byDesc.entries()]
      .map(([id, rows]) => ({ item: catById.get(id), t: aggregate(rows.map(qtyOf)) }))
      .filter((x) => x.item)
      .sort((a, b) => b.t.onBoard - a.t.onBoard);

    const top12 = descAgg.slice(0, 12);
    if (chTypeRef.current) {
      chartsRef.current.push(new Chart(chTypeRef.current, {
        type: 'bar',
        data: {
          labels: top12.map((x) => shortLabel(x.item!.description)),
          datasets: [
            { label: 'Premium', data: top12.map((x) => x.t.premium), backgroundColor: '#f1f5f9' },
            { label: 'Class 2', data: top12.map((x) => x.t.class2), backgroundColor: '#facc15' },
            { label: 'Class 3', data: top12.map((x) => x.t.class3), backgroundColor: '#fb923c' },
            { label: 'Scrap', data: top12.map((x) => x.t.scrap), backgroundColor: '#ef4444' },
          ],
        },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 11, padding: 10, font: { size: 10 } } },
            tooltip: TOOLTIP_STYLE,
          },
          scales: {
            x: { stacked: true, grid: { color: GRID }, ticks: { color: TICK } },
            y: { stacked: true, grid: { display: false }, ticks: { color: '#a4adc0', font: { size: 9.5 } } },
          },
        },
      }));
    }

    if (chMixRef.current) {
      chartsRef.current.push(new Chart(chMixRef.current, {
        type: 'doughnut',
        data: {
          labels: ['Premium', 'Class 2', 'Class 3', 'Scrap', 'Needs Insp.'],
          datasets: [{
            data: [agg.premium, agg.class2, agg.class3, agg.scrap, agg.needsInspection],
            backgroundColor: ['#f1f5f9', '#facc15', '#fb923c', '#ef4444', '#a855f7'],
            borderColor: '#0f141c', borderWidth: 2,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '62%',
          plugins: {
            legend: { position: 'bottom', labels: { padding: 10, boxWidth: 10, font: { size: 10.5 } } },
            tooltip: {
              ...TOOLTIP_STYLE,
              callbacks: {
                label: (ctx) => {
                  const total = (ctx.dataset.data as number[]).reduce((a, b) => a + b, 0);
                  const v = ctx.parsed as number;
                  return ` ${ctx.label}: ${v.toLocaleString()} (${total ? ((v / total) * 100).toFixed(1) : 0}%)`;
                },
              },
            },
          },
        },
      }));
    }

    const byUnit = new Map<string, TubularRecordRow[]>();
    for (const r of scoped) byUnit.set(r.unitId, [...(byUnit.get(r.unitId) ?? []), r]);
    const unitAgg = [...byUnit.entries()]
      .map(([id, rows]) => ({ unit: unitById.get(id), t: aggregate(rows.map(qtyOf)) }))
      .filter((x) => x.unit && x.t.onBoard > 0)
      .sort((a, b) => b.t.onBoard - a.t.onBoard);
    if (chUnitRef.current) {
      chartsRef.current.push(new Chart(chUnitRef.current, {
        type: 'bar',
        data: {
          labels: unitAgg.map((x) => x.unit!.name),
          datasets: [{
            data: unitAgg.map((x) => x.t.onBoard),
            backgroundColor: unitAgg.map((x) => (x.unit!.unitType === 'hoist' ? '#3b82f6' : '#d97706')),
            borderRadius: 2,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { ...TOOLTIP_STYLE, callbacks: { label: (ctx) => ` ${(ctx.parsed.y as number).toLocaleString()} joints` } },
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#a4adc0', font: { size: 10 }, minRotation: 45, maxRotation: 60 } },
            y: { beginAtZero: true, grid: { color: GRID }, ticks: { color: TICK } },
          },
        },
      }));
    }

    const variance = top12
      .map((x) => ({ label: shortLabel(x.item!.description), v: x.t.onBoard - x.t.onContract }))
      .sort((a, b) => a.v - b.v);
    if (chVarRef.current) {
      chartsRef.current.push(new Chart(chVarRef.current, {
        type: 'bar',
        data: {
          labels: variance.map((x) => x.label),
          datasets: [{
            data: variance.map((x) => x.v),
            backgroundColor: variance.map((x) => (x.v < 0 ? '#ef4444' : x.v > 0 ? '#10b981' : '#6c7689')),
            borderRadius: 2,
          }],
        },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { ...TOOLTIP_STYLE, callbacks: { label: (ctx) => { const v = ctx.parsed.x as number; return ` ${v > 0 ? '+' : ''}${v.toLocaleString()} joints`; } } },
          },
          scales: {
            x: { grid: { color: GRID }, ticks: { color: TICK } },
            y: { grid: { display: false }, ticks: { color: '#a4adc0', font: { size: 9.5 } } },
          },
        },
      }));
    }

    return () => {
      chartsRef.current.forEach((c) => c.destroy());
      chartsRef.current = [];
    };
  }, [scoped, agg, catById, unitById, loading]);

  return (
    <section className="view" id="view-dashboard">
      <div className="section-head">
        <div className="section-title">Fleet Overview</div>
        <div className="section-sub" id="dash-sub">
          Total on-board: {agg.onBoard.toLocaleString()} joints · Last update: {lastUpdate}
        </div>
      </div>

      <div className="unit-bar">
        <span className="lbl">Filter</span>
        <select id="dash-rig-filter" value={rigFilter} onChange={(e) => setRigFilter(e.target.value)}>
          <option value="all">All Units</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <span className="meta-chip" id="dash-live-clock">Live · {clock}</span>
        <span className="spacer" />
        <span className="meta-chip">Data refreshes every 60s</span>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="lbl">Total Units</div>
          <div className="val" id="k-units">{units.length}</div>
          <div className="delta" id="k-units-sub">{unitsWithData} active · {units.length - unitsWithData} empty</div>
        </div>
        <div className="kpi">
          <div className="lbl">On Contract</div>
          <div className="val" id="k-contract">{agg.onContract.toLocaleString()}</div>
          <div className="delta">Required quantity</div>
        </div>
        <div className="kpi premium">
          <div className="lbl"><span className="band" style={{ background: '#fff' }} />Premium</div>
          <div className="val" id="k-premium">{agg.premium.toLocaleString()}</div>
          <div className="delta" id="k-premium-pct"><span className="pct">{pct(agg.premium)}</span></div>
        </div>
        <div className="kpi c2">
          <div className="lbl"><span className="band" style={{ background: 'var(--c-class2)' }} />Class 2</div>
          <div className="val" id="k-c2">{agg.class2.toLocaleString()}</div>
          <div className="delta" id="k-c2-pct"><span className="pct">{pct(agg.class2)}</span></div>
        </div>
        <div className="kpi c3">
          <div className="lbl"><span className="band" style={{ background: 'var(--c-class3)' }} />Class 3</div>
          <div className="val" id="k-c3">{agg.class3.toLocaleString()}</div>
          <div className="delta" id="k-c3-pct"><span className="pct">{pct(agg.class3)}</span></div>
        </div>
        <div className="kpi scrap">
          <div className="lbl"><span className="band" style={{ background: 'var(--c-scrap)' }} />Scrap + Needs Insp.</div>
          <div className="val" id="k-scrap">{(agg.scrap + agg.needsInspection).toLocaleString()}</div>
          <div className="delta" id="k-scrap-pct"><span className="pct">{pct(agg.scrap + agg.needsInspection)}</span></div>
        </div>
      </div>

      <div className="grid-3">
        <div className="kpi">
          <div className="lbl">🚚 Active Pipe Orders</div>
          <div className="val" id="k-live-orders">{activeOrders}</div>
          <div className="delta" id="k-live-orders-sub">{inTransit} in transit right now</div>
        </div>
        <div className="kpi">
          <div className="lbl">📄 Contracts Needing Attention</div>
          <div className="val" id="k-live-contracts">{contractsAttn.attn}</div>
          <div className="delta" id="k-live-contracts-sub">{contractsAttn.total} total contracts</div>
        </div>
        <div className="kpi">
          <div className="lbl">⚙ Fleet Utilization</div>
          <div className="val" id="k-live-util">{util == null ? '—' : `${util.toFixed(0)}%`}</div>
          <div className="delta">Serviceable vs. contracted</div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 24 }}>
        <div className="panel-head">
          <h3>Live Activity Feed</h3>
          <span className="badge">Pipe orders &amp; data updates</span>
        </div>
        <div id="dash-activity-feed">
          {feed.length === 0 && <div style={{ color: 'var(--text-3)', fontSize: 11.5 }}>No recent activity.</div>}
          {feed.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--line)', fontSize: 11.5 }}>
              <span className="mono" style={{ color: 'var(--text-3)', flexShrink: 0 }}>{new Date(f.at).toLocaleString()}</span>
              <span style={{ color: 'var(--text-2)' }}>{f.text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid-2-3">
        <div className="panel">
          <div className="panel-head">
            <h3>Tubular Type · Classification Breakdown</h3>
            <span className="badge">Top 12 by Volume</span>
          </div>
          <div className="chart-wrap tall"><canvas id="ch-typebreakdown" ref={chTypeRef} /></div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <h3>Fleet Class Mix</h3>
            <span className="badge">All Tubulars</span>
          </div>
          <div className="chart-wrap tall"><canvas id="ch-classmix" ref={chMixRef} /></div>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <h3>Inventory by Unit</h3>
            <span className="badge">Total On-Board (Joints)</span>
          </div>
          <div className="chart-wrap"><canvas id="ch-byunit" ref={chUnitRef} /></div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <h3>Contract Variance</h3>
            <span className="badge">Surplus vs Shortfall</span>
          </div>
          <div className="chart-wrap"><canvas id="ch-variance" ref={chVarRef} /></div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Items Requiring Attention</h3>
          <span className="badge" id="att-count">{attention.length} items</span>
        </div>
        <div className="tbl-scroll">
          <table id="tbl-attention">
            <thead>
              <tr>
                <th>Unit</th><th>Tubular</th><th className="mono">Contract</th><th className="mono">On-Board</th>
                <th className="mono">Variance</th><th className="mono">Scrap</th><th className="mono">Needs Insp.</th><th>Status</th>
              </tr>
            </thead>
            <tbody id="att-body">
              {attention.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-3)' }}>No items require attention.</td></tr>
              )}
              {attention.map((r) => {
                const st = fleetStatus(qtyOf(r));
                const variance = r.onBoard - r.onContract;
                return (
                  <tr key={r.id}>
                    <td className="mono">{unitById.get(r.unitId)?.name}</td>
                    <td>{catById.get(r.catalogItemId)?.description}</td>
                    <td className="num">{r.onContract.toLocaleString()}</td>
                    <td className="num">{r.onBoard.toLocaleString()}</td>
                    <td className="num" style={{ color: variance < 0 ? 'var(--red-2)' : 'var(--green)' }}>
                      {variance > 0 ? `+${variance}` : variance}
                    </td>
                    <td className="num">{r.scrap.toLocaleString()}</td>
                    <td className="num">{r.needsInspection.toLocaleString()}</td>
                    <td><span className={`st ${ST_CLASS[st]}`}>{ST_LABEL[st]}</span></td>
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
