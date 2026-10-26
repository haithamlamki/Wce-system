// ============================================================================
//  Calibration instruments grid (reference register page): every column in the
//  Excel register's order, edited in place — "New instrument" drops in a blank
//  row, each row saves on its own. Header rows and the actions column stay in
//  view while scrolling; acceptance/remarks keep their line breaks.
// ============================================================================
import { useMemo, useState } from 'react';
import Icon from './Icon';
import VendorCombobox from './VendorCombobox';
import { formatDate } from '../lib/format';
import { complianceStatus } from '../lib/compliance';
import {
  CAL_COLUMNS, defaultDueDate, suggestTmmd, TMMD_VALUES, validateInstrument,
  type CalInstrument, type InstrumentField, type TmmdMapping,
} from '../lib/calibration';

export const NEW_PREFIX = 'new-';

export function blankInstrument(registerId: string, seq: number): CalInstrument {
  return {
    id: `${NEW_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, registerId, sequenceNo: seq,
    certificateNo: '', instrument: '', tmmd: null, manufacturer: '', model: '', serialNumber: '', range: '',
    location: '', grade: '', acceptanceCriteria: '', lastCalibration: null, dueDate: null,
    certifyingCompany: '', remarks: '', certFilePath: null, certFileName: null,
  };
}

interface Props {
  rows: CalInstrument[];
  editable: boolean;
  tmmdMap: TmmdMapping[];
  today: string;
  onSave: (row: CalInstrument, file: File | null) => Promise<void>;
  onDelete: (row: CalInstrument) => Promise<void>;
  onDiscardNew: (id: string) => void;
  onOpenCert: (row: CalInstrument, download: boolean) => void;
  onDetachCert: (row: CalInstrument) => Promise<void>;
}

type RowErrors = Partial<Record<InstrumentField, string>> & { _?: string };

const MULTILINE = new Set<InstrumentField>(['acceptanceCriteria', 'remarks']);
const WIDE = new Set<InstrumentField>(['instrument', 'manufacturer', 'certifyingCompany', 'location', 'acceptanceCriteria', 'remarks']);
const NULLABLE = new Set<InstrumentField>(['tmmd', 'lastCalibration', 'dueDate']);

function display(r: CalInstrument, f: InstrumentField): string {
  const v = r[f];
  if (v === null || v === undefined) return '';
  return f === 'lastCalibration' || f === 'dueDate' ? formatDate(v as string) : String(v);
}

function without<T>(m: Record<string, T>, k: string): Record<string, T> {
  const n = { ...m };
  delete n[k];
  return n;
}

export default function CalInstrumentTable(p: Props) {
  const [drafts, setDrafts] = useState<Record<string, CalInstrument>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [errors, setErrors] = useState<Record<string, RowErrors>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [filters, setFilters] = useState<Partial<Record<InstrumentField, string>>>({});

  const isNew = (r: CalInstrument) => r.id.startsWith(NEW_PREFIX);
  const editing = (r: CalInstrument) => isNew(r) || !!drafts[r.id];
  const current = (r: CalInstrument) => drafts[r.id] ?? r;

  const shown = useMemo(() => p.rows.filter((r) => isNew(r)
    || (Object.entries(filters) as [InstrumentField, string][]).every(([f, q]) => {
      if (!q) return true;
      const needle = q.toLowerCase();
      return display(r, f).toLowerCase().includes(needle) || String(r[f] ?? '').toLowerCase().includes(needle);
    })), [p.rows, filters]);

  const setField = (r: CalInstrument, f: InstrumentField, v: string) => {
    const value = f === 'sequenceNo' ? (v === '' ? null : Number(v)) : (v === '' && NULLABLE.has(f) ? null : v);
    setDrafts((d) => ({ ...d, [r.id]: { ...current(r), [f]: value } as CalInstrument }));
  };

  // TMMD fills itself in when the Instrument cell is left — never over a typed value.
  const onInstrumentBlur = (r: CalInstrument) => {
    const c = current(r);
    if (c.tmmd) return;
    const t = suggestTmmd(c.instrument, p.tmmdMap);
    if (t) setDrafts((d) => ({ ...d, [r.id]: { ...c, tmmd: t } }));
  };

  const save = async (r: CalInstrument) => {
    const c = current(r);
    const errs = validateInstrument(c);
    if (Object.keys(errs).length) { setErrors((e) => ({ ...e, [r.id]: errs })); return; }
    setBusy(r.id);
    try {
      await p.onSave({ ...c, dueDate: c.dueDate || defaultDueDate(c.lastCalibration) }, files[r.id] ?? null);
      setDrafts((d) => without(d, r.id));
      setFiles((f) => without(f, r.id));
      setErrors((e) => without(e, r.id));
    } catch (e) { setErrors((x) => ({ ...x, [r.id]: { _: (e as Error).message } })); }
    finally { setBusy(null); }
  };

  const cancel = (r: CalInstrument) => {
    if (isNew(r)) p.onDiscardNew(r.id);
    setDrafts((d) => without(d, r.id));
    setErrors((e) => without(e, r.id));
  };

  const remove = async (r: CalInstrument) => {
    if (!window.confirm(`Delete instrument ${r.serialNumber || r.certificateNo}?`)) return;
    setBusy(r.id);
    try { await p.onDelete(r); } catch (e) { setErrors((x) => ({ ...x, [r.id]: { _: (e as Error).message } })); }
    finally { setBusy(null); }
  };

  const cell = (r: CalInstrument, f: InstrumentField, label: string) => {
    const c = current(r);
    if (!editing(r)) {
      if (f === 'dueDate') {
        return c.dueDate ? <span className={`insp-rag ${complianceStatus(c.dueDate, p.today)}`}>{display(c, f)}</span> : '';
      }
      return <span style={MULTILINE.has(f) ? { whiteSpace: 'pre-line' } : undefined}>{display(c, f)}</span>;
    }
    const err = errors[r.id]?.[f];
    const common = { className: 'insp-input', 'aria-label': label, 'aria-invalid': !!err, title: err,
      style: err ? { borderColor: 'var(--i-danger)' } : undefined };
    if (f === 'tmmd') {
      return (
        <select {...common} value={c.tmmd ?? ''} onChange={(e) => setField(r, f, e.target.value)}>
          <option value="">—</option>
          {TMMD_VALUES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      );
    }
    if (f === 'lastCalibration' || f === 'dueDate') {
      return <input {...common} type="date" value={c[f] ?? ''} onChange={(e) => setField(r, f, e.target.value)} />;
    }
    if (f === 'certifyingCompany') {
      return <VendorCombobox ariaLabel={label} value={c.certifyingCompany} invalid={!!err} onChange={(v) => setField(r, f, v)} />;
    }
    if (MULTILINE.has(f)) {
      return <textarea {...common} rows={2} value={c[f] as string} onChange={(e) => setField(r, f, e.target.value)} />;
    }
    return <input {...common} type={f === 'sequenceNo' ? 'number' : 'text'} value={(c[f] as string | number | null) ?? ''}
      onChange={(e) => setField(r, f, e.target.value)} onBlur={f === 'instrument' ? () => onInstrumentBlur(r) : undefined} />;
  };

  const sticky = { position: 'sticky' as const, right: 0, background: 'var(--i-surface)' };

  return (
    <div className="insp-table-wrap" style={{ maxHeight: '70vh', overflow: 'auto' }}>
      <table className="insp-table" style={{ minWidth: 2200 }}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--i-surface)' }}>
          <tr>
            {CAL_COLUMNS.map((c) => <th key={c.field} style={{ minWidth: WIDE.has(c.field) ? 200 : 110 }}>{c.label}</th>)}
            <th style={{ minWidth: 200 }}>Certificate file</th>
            {p.editable && <th style={{ ...sticky, zIndex: 3 }}>Actions</th>}
          </tr>
          <tr>
            {CAL_COLUMNS.map((c) => (
              <th key={c.field}>
                {c.field === 'tmmd' ? (
                  <select className="insp-input" aria-label="Filter TMMD" value={filters.tmmd ?? ''}
                    onChange={(e) => setFilters({ ...filters, tmmd: e.target.value })}>
                    <option value="">All</option>
                    {TMMD_VALUES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                ) : (
                  <input className="insp-input" aria-label={`Filter ${c.label}`} placeholder="Filter…"
                    value={filters[c.field] ?? ''} onChange={(e) => setFilters({ ...filters, [c.field]: e.target.value })} />
                )}
              </th>
            ))}
            <th />
            {p.editable && <th style={{ ...sticky, zIndex: 3 }} />}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const c = current(r);
            const isEdit = editing(r);
            return (
              <tr key={r.id}>
                {CAL_COLUMNS.map((col) => <td key={col.field} style={{ verticalAlign: 'top' }}>{cell(r, col.field, col.label)}</td>)}
                <td style={{ verticalAlign: 'top' }}>
                  {isEdit ? (
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {c.certFileName && <small style={{ color: 'var(--i-muted)' }}>Current: {c.certFileName}</small>}
                      <input type="file" accept=".pdf,image/*" aria-label="Certificate file"
                        onChange={(e) => setFiles((f) => ({ ...f, [r.id]: e.target.files?.[0] ?? null }))} />
                    </span>
                  ) : c.certFilePath ? (
                    <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <a href="#" onClick={(e) => { e.preventDefault(); p.onOpenCert(c, false); }}>{c.certFileName}</a>
                      <button type="button" className="insp-iconbtn" title="Download certificate"
                        onClick={() => p.onOpenCert(c, true)}><Icon name="download" /></button>
                      {p.editable && <button type="button" className="insp-iconbtn" title="Detach certificate"
                        onClick={() => { if (window.confirm('Detach this certificate file?')) void p.onDetachCert(c); }}>
                        <Icon name="delete" /></button>}
                    </span>
                  ) : <span style={{ color: 'var(--i-muted)' }}>—</span>}
                </td>
                {p.editable && (
                  <td style={{ ...sticky, zIndex: 1, verticalAlign: 'top' }}>
                    {isEdit ? (
                      <span style={{ display: 'flex', gap: 4 }}>
                        <button type="button" className="insp-btn primary" disabled={busy === r.id} onClick={() => save(r)}>Save</button>
                        <button type="button" className="insp-btn" disabled={busy === r.id} onClick={() => cancel(r)}>Cancel</button>
                      </span>
                    ) : (
                      <span style={{ display: 'flex', gap: 4 }}>
                        <button type="button" className="insp-iconbtn" title="Edit instrument"
                          onClick={() => setDrafts((d) => ({ ...d, [r.id]: r }))}><Icon name="edit" /></button>
                        <button type="button" className="insp-iconbtn" title="Delete instrument" disabled={busy === r.id}
                          onClick={() => remove(r)}><Icon name="delete" /></button>
                      </span>
                    )}
                    {errors[r.id] && (
                      <div style={{ color: 'var(--i-danger)', fontSize: 11, maxWidth: 220, marginTop: 4 }}>
                        {errors[r.id]._ ?? Object.values(errors[r.id]).join(' ')}
                      </div>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
          {shown.length === 0 && (
            <tr><td colSpan={CAL_COLUMNS.length + 2} style={{ textAlign: 'center', color: 'var(--i-muted)', padding: 24 }}>
              No instruments match.
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
