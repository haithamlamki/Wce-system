// ============================================================================
//  Fleet compliance dashboard (PRD §13).
//  Compliance by rig and system (overdue / due / in-date), plus a 30/60/90-day
//  inspection-due forecast. Reads the Supabase equipment register across all
//  rigs the user can see (RLS-scoped); falls back to the embedded Rig 303 cache
//  when Supabase is off. Status is date-based over int_due/maj_due.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { fetchComplianceRows, isSupabaseConfigured, type ComplianceRow } from '../lib/cloud';
import { RIG303_EQUIPMENT } from '../lib/data/rig303-equipment';

type DateStatus = 'ok' | 'due' | 'over' | 'none';
const MS = 864e5;

function dueStatus(int_due: string, maj_due: string, ref: Date): { status: DateStatus; daysToNext: number | null } {
  const ds = [int_due, maj_due].filter(Boolean).map((x) => new Date(x + 'T00:00').getTime());
  if (!ds.length) return { status: 'none', daysToNext: null };
  const days = ds.map((t) => (t - ref.getTime()) / MS);
  const min = Math.min(...days);
  if (min < 0) return { status: 'over', daysToNext: min };
  if (min <= 60) return { status: 'due', daysToNext: min };
  return { status: 'ok', daysToNext: min };
}

const embeddedRows = (): ComplianceRow[] =>
  RIG303_EQUIPMENT.map((r) => ({ rig_name: 'Rig 303', section: r.section || '—', tag: r.tag, int_due: r.int_due, maj_due: r.maj_due }));

export default function DashboardView() {
  const [rows, setRows] = useState<ComplianceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const ref = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (isSupabaseConfigured) {
          const r = await fetchComplianceRows();
          if (active && r.length) { setRows(r); setLive(true); setLoading(false); return; }
        }
      } catch { /* fall back */ }
      if (active) { setRows(embeddedRows()); setLive(false); setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  const stats = useMemo(() => {
    const byRig = new Map<string, Record<DateStatus, number>>();
    const bySys = new Map<string, Record<DateStatus, number>>();
    const forecast = { d30: 0, d60: 0, d90: 0, over: 0 };
    let ok = 0, total = 0;
    const bump = (m: Map<string, Record<DateStatus, number>>, k: string, s: DateStatus) => {
      const cur = m.get(k) ?? { ok: 0, due: 0, over: 0, none: 0 };
      cur[s]++; m.set(k, cur);
    };
    for (const r of rows) {
      const { status, daysToNext } = dueStatus(r.int_due, r.maj_due, ref);
      bump(byRig, r.rig_name, status);
      bump(bySys, r.section, status);
      total++;
      if (status === 'ok') ok++;
      if (status === 'over') forecast.over++;
      else if (daysToNext !== null) {
        if (daysToNext <= 30) forecast.d30++;
        else if (daysToNext <= 60) forecast.d60++;
        else if (daysToNext <= 90) forecast.d90++;
      }
    }
    const compliance = total ? Math.round((ok / total) * 100) : 0;
    return { byRig, bySys, forecast, ok, total, compliance };
  }, [rows, ref]);

  if (loading) return <div className="placeholder" style={{ margin: 'auto' }}>Loading compliance data…</div>;

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16 }}>
        <h2 style={{ fontFamily: 'var(--disp)', margin: 0 }}>Fleet Compliance</h2>
        <span style={{ fontSize: 11.5, color: 'var(--faint)' }}>
          {stats.total} assets · {live ? 'live from Supabase' : 'embedded cache'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
        <Kpi n={`${stats.compliance}%`} label="In-date" color="var(--green)" />
        <Kpi n={stats.forecast.over} label="Overdue" color="var(--red)" />
        <Kpi n={stats.forecast.d30} label="Due ≤30 days" color="var(--amber)" />
        <Kpi n={stats.forecast.d60 + stats.forecast.d90} label="Due 31–90 days" color="var(--dim)" />
        <Kpi n={stats.byRig.size} label="Rigs" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <Card title="Compliance by rig">
          {[...stats.byRig.entries()].sort().map(([rig, c]) => <Bar key={rig} label={rig} c={c} />)}
        </Card>

        <Card title="Inspection-due forecast">
          <ForecastRow label="Overdue" n={stats.forecast.over} color="var(--red)" />
          <ForecastRow label="Next 30 days" n={stats.forecast.d30} color="var(--amber)" />
          <ForecastRow label="31–60 days" n={stats.forecast.d60} color="var(--amber)" />
          <ForecastRow label="61–90 days" n={stats.forecast.d90} color="var(--dim)" />
        </Card>

        <Card title="Compliance by system">
          {[...stats.bySys.entries()].sort((a, b) => b[1].over - a[1].over).map(([sys, c]) => <Bar key={sys} label={sys} c={c} />)}
        </Card>
      </div>
    </div>
  );
}

function Kpi({ n, label, color }: { n: number | string; label: string; color?: string }) {
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 12, padding: '14px 20px', minWidth: 120, boxShadow: 'var(--shadow)' }}>
      <div style={{ fontFamily: 'var(--disp)', fontSize: 30, fontWeight: 700, color: color ?? 'var(--ink)' }}>{n}</div>
      <div style={{ fontSize: 11.5, color: 'var(--faint)' }}>{label}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>
      <div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{title}</div>
      {children}
    </section>
  );
}

function Bar({ label, c }: { label: string; c: Record<DateStatus, number> }) {
  const total = c.ok + c.due + c.over + c.none || 1;
  const seg = (v: number, color: string) => v ? <div style={{ width: `${(v / total) * 100}%`, background: color }} title={`${v}`} /> : null;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span style={{ fontFamily: 'var(--mono)', color: 'var(--faint)' }}>{c.over}▲ {c.due}● {c.ok}✓</span>
      </div>
      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: 'var(--sunk)' }}>
        {seg(c.over, 'var(--red)')}{seg(c.due, 'var(--amber)')}{seg(c.ok, 'var(--green)')}{seg(c.none, 'var(--line2)')}
      </div>
    </div>
  );
}

function ForecastRow({ label, n, color }: { label: string; n: number; color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
      <span style={{ fontSize: 13 }}><span style={{ color, marginRight: 8 }}>●</span>{label}</span>
      <span style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 18 }}>{n}</span>
    </div>
  );
}
