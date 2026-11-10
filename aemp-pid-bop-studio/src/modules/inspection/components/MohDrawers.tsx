// ============================================================================
//  Major Overhaul — side drawers for the rig page: a manually entered unit
//  (last MOH date / year / hour meters) and a per-year MOH project (status,
//  PO / PR, vendor…). Read-only when the viewer lacks moh:update.
// ============================================================================
import { useState } from 'react';
import type { ReactNode } from 'react';
import { PROJECT_STATUSES, type MohItem, type MohProject, type MohUnit, type ProjectStatus } from '../lib/moh';
import { saveProject, saveUnit } from '../lib/mohApi';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

const toNum = (v: string): number | null => (v.trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v));

function Drawer({ title, subtitle, onClose, children, footer }: {
  title: string; subtitle?: string; onClose: () => void; children: ReactNode; footer: ReactNode;
}) {
  return (
    <div className="insp-drawer" role="dialog" aria-label={title}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
          {subtitle && <div style={{ color: 'var(--i-muted)', fontSize: 12, marginTop: 3 }}>{subtitle}</div>}
        </div>
        <button type="button" className="insp-iconbtn" aria-label="Close" onClick={onClose}>✕</button>
      </div>
      <div style={{ display: 'grid', gap: 12 }}>{children}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>{footer}</div>
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return <div className="insp-field"><label htmlFor={id}>{label}</label>{children}</div>;
}

export function UnitDrawer({ item, rigId, rigName, unit, readOnly, onClose, onSaved }: {
  item: MohItem; rigId: string; rigName: string; unit: Partial<MohUnit> | null;
  readOnly: boolean; onClose: () => void; onSaved: () => void;
}) {
  const hours = item.basis === 'hours';
  const [f, setF] = useState({
    assetNumber: unit?.assetNumber ?? '', equipmentNumber: unit?.equipmentNumber ?? '',
    lastMohDate: unit?.lastMohDate ?? '', lastMohYear: unit?.lastMohYear?.toString() ?? '',
    lastMohHours: unit?.lastMohHours?.toString() ?? '', currentHours: unit?.currentHours?.toString() ?? '',
    avgHoursPerYear: unit?.avgHoursPerYear?.toString() ?? '', remarks: unit?.remarks ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    const year = toNum(f.lastMohYear);
    if (year !== null && (year < 1900 || year > 2200 || !Number.isInteger(year))) { setErr('Last MOH year must be 1900–2200.'); return; }
    const cur = toNum(f.currentHours), last = toNum(f.lastMohHours);
    if (cur !== null && last !== null && cur < last) { setErr('Current hours cannot be lower than last MOH hours.'); return; }
    setBusy(true); setErr(null);
    try {
      await saveUnit({
        id: unit?.id, rigId, itemId: item.id, assetNumber: f.assetNumber, equipmentNumber: f.equipmentNumber,
        lastMohDate: f.lastMohDate || null, lastMohYear: f.lastMohDate ? null : year, lastMohHours: last, currentHours: cur,
        avgHoursPerYear: toNum(f.avgHoursPerYear), remarks: f.remarks,
      });
      onSaved();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <Drawer title={unit?.id ? 'Edit MOH unit' : 'Add MOH unit'} subtitle={`${rigName} · ${item.description}`} onClose={onClose}
      footer={(
        <>
          {!readOnly && <button type="button" className="insp-btn primary" disabled={busy} onClick={save}>Save unit</button>}
          <button type="button" className="insp-btn" onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</button>
        </>
      )}>
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 12 }}>
        <Field id="moh-asset" label="Asset number">
          <input id="moh-asset" className="insp-input" value={f.assetNumber} onChange={set('assetNumber')} /></Field>
        <Field id="moh-eqno" label="Equipment number">
          <input id="moh-eqno" className="insp-input" value={f.equipmentNumber} onChange={set('equipmentNumber')} /></Field>
        {hours ? (
          <>
            <Field id="moh-lh" label="Last MOH hour meter">
              <input id="moh-lh" type="number" min={0} className="insp-input" value={f.lastMohHours} onChange={set('lastMohHours')} /></Field>
            <Field id="moh-ch" label="Current hour meter">
              <input id="moh-ch" type="number" min={0} className="insp-input" value={f.currentHours} onChange={set('currentHours')} /></Field>
            <Field id="moh-ah" label="Average hours / year">
              <input id="moh-ah" type="number" min={0} className="insp-input" value={f.avgHoursPerYear} onChange={set('avgHoursPerYear')} /></Field>
          </>
        ) : (
          <>
            <Field id="moh-ld" label="Last MOH date">
              <input id="moh-ld" type="date" className="insp-input" value={f.lastMohDate} onChange={set('lastMohDate')} /></Field>
            <Field id="moh-ly" label="Last MOH year (if the exact date is unknown)">
              <input id="moh-ly" type="number" min={1900} max={2200} className="insp-input" value={f.lastMohYear}
                onChange={set('lastMohYear')} disabled={!!f.lastMohDate} /></Field>
          </>
        )}
        <Field id="moh-rem" label="Remarks">
          <textarea id="moh-rem" className="insp-input" rows={3} value={f.remarks} onChange={set('remarks')} /></Field>
      </fieldset>
      {err && <div style={{ color: 'var(--i-danger)' }}>{err}</div>}
    </Drawer>
  );
}

export function ProjectDrawer({ project, title, readOnly, onClose, onSaved }: {
  project: MohProject; title: string; readOnly: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [p, setP] = useState<MohProject>(project);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const text = (k: 'vendor' | 'poNumber' | 'prNumber' | 'responsible' | 'comments') =>
    (e: { target: { value: string } }) => setP({ ...p, [k]: e.target.value });

  const save = async () => {
    setBusy(true); setErr(null);
    try { await saveProject(p); onSaved(); } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <Drawer title={`MOH project · ${p.year}`} subtitle={title} onClose={onClose}
      footer={(
        <>
          {!readOnly && <button type="button" className="insp-btn primary" disabled={busy} onClick={save}>Save project</button>}
          <button type="button" className="insp-btn" onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</button>
        </>
      )}>
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 12 }}>
        <Field id="pd-status" label="Current status">
          <select id="pd-status" className="insp-input" value={p.status}
            onChange={(e) => setP({ ...p, status: e.target.value as ProjectStatus })}>
            {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select></Field>
        <Field id="pd-month" label="Planned month">
          <select id="pd-month" className="insp-input" value={p.plannedMonth ?? ''}
            onChange={(e) => setP({ ...p, plannedMonth: toNum(e.target.value) })}>
            <option value="">Not set</option>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select></Field>
        <Field id="pd-start" label="Planned start date">
          <input id="pd-start" type="date" className="insp-input" value={p.startDate ?? ''}
            onChange={(e) => setP({ ...p, startDate: e.target.value || null })} /></Field>
        <Field id="pd-dur" label="Estimated duration (days)">
          <input id="pd-dur" type="number" min={0} className="insp-input" value={p.durationDays ?? ''}
            onChange={(e) => setP({ ...p, durationDays: toNum(e.target.value) })} /></Field>
        <Field id="pd-vendor" label="Vendor / workshop">
          <input id="pd-vendor" className="insp-input" value={p.vendor} onChange={text('vendor')} /></Field>
        <Field id="pd-resp" label="Responsible person">
          <input id="pd-resp" className="insp-input" value={p.responsible} onChange={text('responsible')} /></Field>
        <Field id="pd-pr" label="PR number">
          <input id="pd-pr" className="insp-input" value={p.prNumber} onChange={text('prNumber')} /></Field>
        <Field id="pd-po" label="PO number">
          <input id="pd-po" className="insp-input" value={p.poNumber} onChange={text('poNumber')} /></Field>
        <Field id="pd-com" label="Comments">
          <textarea id="pd-com" className="insp-input" rows={3} value={p.comments} onChange={text('comments')} /></Field>
      </fieldset>
      {err && <div style={{ color: 'var(--i-danger)' }}>{err}</div>}
    </Drawer>
  );
}
