// ============================================================================
//  Annual Maintenance — the plan's equipment lines, grouped by section like
//  the workbook. Click a line to open its scope-of-work checklist; with
//  am:update (and the plan not finalized) tick tasks and edit dates, status,
//  responsible and comments. A line with a checklist takes its status from it.
// ============================================================================
import { Fragment, useMemo, useState } from 'react';
import { ItemStatusBadge, ProgressBar } from './AmShared';
import { ITEM_STATUSES, fmtDate, itemProgress, type AmItem, type AmTask, type ItemStatus } from '../lib/am';
import type { ItemPatch } from '../lib/amApi';

export default function AmItemsTable({ items, editable, onToggle, onPatch }: {
  items: AmItem[]; editable: boolean;
  onToggle: (item: AmItem, task: AmTask) => void;
  onPatch: (item: AmItem, patch: ItemPatch) => Promise<void>;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [section, setSection] = useState('');
  const [status, setStatus] = useState('');
  const [resp, setResp] = useState('');
  const [q, setQ] = useState('');

  const sections = useMemo(() => [...new Set(items.map((i) => i.section))], [items]);
  const people = useMemo(() => [...new Set(items.map((i) => i.responsible).filter(Boolean))].sort(), [items]);
  const needle = q.trim().toLowerCase();
  const shown = items.filter((i) => (!section || i.section === section) && (!status || i.status === status)
    && (!resp || i.responsible === resp)
    && (!needle || `${i.description} ${i.comments} ${i.tasks.map((t) => t.description).join(' ')}`.toLowerCase().includes(needle)));

  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const rowId = (i: AmItem, n: number) => i.id ?? `row-${n}`;

  return (
    <>
      <div className="insp-filterrow am-noprint">
        <label className="fld"><span>Section</span>
          <select className="insp-input" value={section} onChange={(e) => setSection(e.target.value)}>
            <option value="">All sections</option>{sections.map((s) => <option key={s}>{s}</option>)}
          </select></label>
        <label className="fld"><span>Status</span>
          <select className="insp-input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>{ITEM_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select></label>
        <label className="fld"><span>Responsible</span>
          <select className="insp-input" value={resp} onChange={(e) => setResp(e.target.value)}>
            <option value="">Everyone</option>{people.map((p) => <option key={p}>{p}</option>)}
          </select></label>
        <label className="fld"><span>Search</span>
          <input className="insp-input" value={q} placeholder="Equipment, task, comment…" onChange={(e) => setQ(e.target.value)} /></label>
        <button type="button" className="insp-btn" style={{ alignSelf: 'flex-end' }}
          onClick={() => setOpen(open.size ? new Set() : new Set(shown.map(rowId)))}>
          {open.size ? 'Collapse all' : 'Expand all'}</button>
      </div>

      <div className="insp-table-wrap">
        <table className="insp-table">
          <thead>
            <tr><th>SN</th><th>Equipment</th><th>Category</th><th>Interval</th><th>Inspection status</th>
              <th>Responsible</th><th>Start</th><th>End</th><th>Progress</th><th>Status</th><th>Comments</th></tr>
          </thead>
          <tbody>
            {shown.map((i, n) => {
              const id = rowId(i, n);
              const head = n === 0 || shown[n - 1].section !== i.section;
              return (
                <Fragment key={id}>
                  {head && <tr className="am-section-row"><td colSpan={11}>{i.section}</td></tr>}
                  <tr className={`am-item-row${i.status === 'Not applicable' ? ' na' : ''}`}>
                    <td>{i.sn ?? ''}</td>
                    <td>
                      <button type="button" className="am-expand" aria-expanded={open.has(id)} onClick={() => toggle(id)}>
                        <span aria-hidden>{open.has(id) ? '▾' : '▸'}</span> {i.description}
                      </button>
                    </td>
                    <td>{i.category}</td><td>{i.intervalText}</td><td>{i.applicability}</td><td>{i.responsible}</td>
                    <td>{fmtDate(i.startDate)}</td><td>{fmtDate(i.endDate)}</td>
                    <td><ProgressBar value={itemProgress(i)} /></td>
                    <td><ItemStatusBadge status={i.status} /></td>
                    <td style={{ maxWidth: 220, whiteSpace: 'normal' }}>{i.comments}</td>
                  </tr>
                  {open.has(id) && (
                    <tr><td /><td colSpan={10}>
                      <ItemDetail item={i} editable={editable} onToggle={onToggle} onPatch={onPatch} />
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
            {!shown.length && <tr><td colSpan={11} style={{ color: 'var(--i-muted)' }}>No lines match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ItemDetail({ item, editable, onToggle, onPatch }: {
  item: AmItem; editable: boolean; onToggle: (item: AmItem, task: AmTask) => void;
  onPatch: (item: AmItem, patch: ItemPatch) => Promise<void>;
}) {
  const [f, setF] = useState({ startDate: item.startDate ?? '', endDate: item.endDate ?? '', status: item.status,
    responsible: item.responsible, comments: item.comments });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dirty = f.startDate !== (item.startDate ?? '') || f.endDate !== (item.endDate ?? '') || f.status !== item.status
    || f.responsible !== item.responsible || f.comments !== item.comments;
  const badDates = !!f.startDate && !!f.endDate && f.endDate < f.startDate;
  const statusLocked = item.tasks.length > 0 && item.applicability !== 'Not applicable';

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await onPatch(item, { startDate: f.startDate || null, endDate: f.endDate || null,
        ...(statusLocked ? {} : { status: f.status }), responsible: f.responsible.trim(), comments: f.comments });
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };

  return (
    <div>
      {item.tasks.length ? (
        <ul className="am-checklist">
          {item.tasks.map((t) => (
            <li key={t.id ?? t.seq} className={t.done ? 'done' : ''}>
              <label>
                <input type="checkbox" checked={t.done} disabled={!editable || !t.id} onChange={() => onToggle(item, t)} />
                <span>{t.seq}. {t.description}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : <p style={{ color: 'var(--i-muted)', margin: '4px 0' }}>No scope-of-work checklist for this line.</p>}

      {editable && item.id && (
        <div className="insp-filterrow" style={{ marginTop: 8 }}>
          <label className="fld"><span>Start</span>
            <input className="insp-input" type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></label>
          <label className="fld"><span>End</span>
            <input className="insp-input" type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></label>
          <label className="fld"><span>Status</span>
            <select className="insp-input" value={f.status} disabled={statusLocked}
              title={statusLocked ? 'Follows the checklist' : undefined}
              onChange={(e) => setF({ ...f, status: e.target.value as ItemStatus })}>
              {ITEM_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select></label>
          <label className="fld"><span>Responsible</span>
            <input className="insp-input" maxLength={120} value={f.responsible} onChange={(e) => setF({ ...f, responsible: e.target.value })} /></label>
          <label className="fld" style={{ flex: 1, minWidth: 220 }}><span>Comments</span>
            <input className="insp-input" maxLength={2000} value={f.comments} onChange={(e) => setF({ ...f, comments: e.target.value })} /></label>
          <button type="button" className="insp-btn primary" style={{ alignSelf: 'flex-end' }}
            disabled={!dirty || busy || badDates} onClick={() => void save()}>{busy ? 'Saving…' : 'Save line'}</button>
        </div>
      )}
      {badDates && <div style={{ color: 'var(--i-danger)', fontSize: 12.5 }}>End date is before start date.</div>}
      {err && <div style={{ color: 'var(--i-danger)', fontSize: 12.5 }}>{err}</div>}
    </div>
  );
}
