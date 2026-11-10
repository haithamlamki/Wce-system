// ============================================================================
//  Major Overhaul — shared state hook + small widgets used by the portfolio
//  dashboard and the rig page. The plan horizon defaults to 10 years and is
//  editable (1–20); the viewer's choice is remembered per browser.
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from './ui';
import { useInspection } from '../state/InspectionContext';
import { downloadCsv } from '../lib/exportCsv';
import {
  buildPlanRows, clampHorizon, DEFAULT_HORIZON, MAX_HORIZON, planYears, projectKey, STATUS_TONE,
  type MohProject, type MohStatus, type PlanRow, type Rig,
} from '../lib/moh';
import { fetchMohData, type MohData } from '../lib/mohApi';

const H_KEY = 'insp.moh.horizon';
const S_KEY = 'insp.moh.startYear';

function stored(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function store(key: string, v: string): void {
  try { localStorage.setItem(key, v); } catch { /* storage unavailable */ }
}

export function todayUTC(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

export function useMohPlan() {
  const { units, scopedUnitIds } = useInspection();
  const thisYear = new Date().getFullYear();
  const [horizon, setHorizonState] = useState(() => clampHorizon(stored(H_KEY), DEFAULT_HORIZON));
  const [startYear, setStartState] = useState(() => {
    const n = Math.trunc(Number(stored(S_KEY)));
    return n >= 2000 && n <= 2200 ? n : thisYear;
  });
  const [data, setData] = useState<MohData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try { setData(await fetchMohData()); setError(null); }
    catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const setHorizon = (v: unknown) => { const h = clampHorizon(v); setHorizonState(h); store(H_KEY, String(h)); };
  const setStartYear = (v: unknown) => {
    const n = Math.trunc(Number(v));
    if (n >= 2000 && n <= 2200) { setStartState(n); store(S_KEY, String(n)); }
  };

  const rigs: Rig[] = useMemo(() => units
    .filter((u) => u.unitType !== 'other' && scopedUnitIds.has(u.id))
    .map((u) => ({ id: u.id, name: u.name }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })), [units, scopedUnitIds]);

  const years = useMemo(() => planYears(startYear, horizon), [startYear, horizon]);

  const rows: PlanRow[] = useMemo(() => (data ? buildPlanRows({
    rigs, items: data.items, units: data.units, inspection: data.inspection,
    notApplicable: data.notApplicable, today: todayUTC(), years,
  }) : []), [data, rigs, years]);

  const projects = useMemo(() => new Map<string, MohProject>((data?.projects ?? [])
    .map((p) => [projectKey(p.rigId, p.itemId, p.mohUnitId, p.year), p])), [data]);

  return { data, error, reload, rigs, rows, years, horizon, setHorizon, startYear, setStartYear, projects };
}

export function PlanControls({ startYear, horizon, onStart, onHorizon }: {
  startYear: number; horizon: number; onStart: (v: string) => void; onHorizon: (v: string) => void;
}) {
  return (
    <>
      <label className="fld">
        <span>Start year</span>
        <input className="insp-input" type="number" min={2000} max={2200} value={startYear}
          style={{ width: 110 }} onChange={(e) => onStart(e.target.value)} />
      </label>
      <label className="fld">
        <span>Horizon (years)</span>
        <select className="insp-input" value={horizon} onChange={(e) => onHorizon(e.target.value)}>
          {Array.from({ length: MAX_HORIZON }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>{n} {n === 1 ? 'year' : 'years'}{n === DEFAULT_HORIZON ? ' (default)' : ''}</option>
          ))}
        </select>
      </label>
    </>
  );
}

const STATUS_LABEL: Record<MohStatus, string> = {
  OVERDUE: 'Overdue', 'DUE THIS YEAR': 'Due this year', 'DUE NEXT YEAR': 'Due next year', PLANNED: 'Planned',
  'NOT DUE IN PLAN': 'Not due in plan', 'NO LAST MOH DATA': 'No last MOH data', 'NOT APPLICABLE': 'Not applicable',
};

export function statusLabel(s: MohStatus): string { return STATUS_LABEL[s]; }

export function StatusBadge({ status }: { status: MohStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

export function Kpi({ label, value, tone, caption }: {
  label: string; value: string | number; tone?: 'danger' | 'warning'; caption?: string;
}) {
  return (
    <div className="insp-kpi">
      <div>
        <div className="lbl">{label}</div>
        <div className={`num${tone ? ` ${tone}` : ''}`}>{value}</div>
        {caption && <div className="cap">{caption}</div>}
      </div>
    </div>
  );
}

export function rowsToCsv(header: string[], body: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...body].map((r) => r.map(esc).join(',')).join('\r\n');
}

export function exportCsv(fileName: string, header: string[], body: (string | number)[][]): void {
  downloadCsv(rowsToCsv(header, body), fileName);
}
