// ============================================================================
//  Dashboard "Calibration" section (reference calibration widget): overdue and
//  due-soon instrument counts, the worst lateness, and one line per rig that
//  opens its register. Hidden for users without insp_calibration_view.
// ============================================================================
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Card, EmptyState, SectionTitle } from './ui';
import { useInspection } from '../state/InspectionContext';
import { daysUntil } from '../lib/compliance';
import type { CalRegister } from '../lib/calibration';
import { fetchOldestOverdue, fetchRegisters } from '../lib/calibrationApi';

function Stat({ label, value, caption, tone }: { label: string; value: number; caption?: string; tone?: 'danger' | 'warning' }) {
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

export default function CalibrationDashboard() {
  const { can } = useInspection();
  const navigate = useNavigate();
  const allowed = can('insp_calibration_view');
  const [regs, setRegs] = useState<CalRegister[] | null>(null);
  const [worst, setWorst] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return undefined;
    let alive = true;
    const today = new Date().toISOString().slice(0, 10);
    Promise.all([fetchRegisters(), fetchOldestOverdue(today)])
      .then(([r, oldest]) => {
        if (!alive) return;
        setRegs(r);
        setWorst(oldest ? -(daysUntil(oldest, today) ?? 0) : null);
      })
      .catch((e: Error) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [allowed]);

  if (!allowed) return null;

  const sum = (k: 'instrumentCount' | 'overdueCount' | 'dueSoonCount') => regs?.reduce((s, r) => s + r[k], 0) ?? 0;
  const go = (id: string) => navigate(`/inspection/calibration/${id}`);

  return (
    <>
      <SectionTitle>Calibration</SectionTitle>
      <div className="insp-grid-2">
        <Card title="TMMDE Calibration">
          {error ? <p style={{ color: 'var(--i-danger)' }}>{error}</p> : (
            <div className="insp-kpis">
              <Stat label="Instruments" value={sum('instrumentCount')} caption={`${regs?.length ?? 0} registers`} />
              <Stat label="Overdue" value={sum('overdueCount')} tone="danger" caption={worst ? `worst ${worst}d` : undefined} />
              <Stat label="Due next 30" value={sum('dueSoonCount')} tone="warning" />
            </div>
          )}
        </Card>
        <Card title="Registers by Rig">
          {regs && regs.length ? (
            <ul className="insp-plainlist">
              {regs.map((r) => (
                <li key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '4px 0' }}>
                  <a href={`/inspection/calibration/${r.id}`} onClick={(e) => { e.preventDefault(); go(r.id); }}>
                    {r.unitName}</a>
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <small style={{ color: 'var(--i-muted)' }}>{r.instrumentCount} instruments</small>
                    {r.overdueCount ? <Badge tone="danger">{r.overdueCount} overdue</Badge>
                      : r.dueSoonCount ? <Badge tone="warning">{r.dueSoonCount} due soon</Badge>
                        : <Badge tone="success">Current</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          ) : <EmptyState title={regs ? 'No registers yet' : 'Loading…'} />}
        </Card>
      </div>
    </>
  );
}
