// ============================================================================
//  Equipment import dialog (research report §5): interactive column-mapping with
//  a live preview, persisted mapping, and duplicate-tag handling. Format-blind —
//  parent supplies already-parsed rows (CSV or XLSX).
// ============================================================================
import { useMemo, useState } from 'react';
import { applyMap, autoMap, IMPORT_FIELDS, type ColumnMap, type MappedRow } from '../lib/importMap';

const MAP_STORE = 'aemp.importMap.v1';
export type DupMode = 'skip' | 'overwrite' | 'rename';

interface Props {
  rows: Record<string, string>[];
  headers: string[];
  existingTags: Set<string>;
  onCancel: () => void;
  onApply: (mapped: MappedRow[], dup: DupMode) => void;
}

function loadSaved(): ColumnMap {
  try { return JSON.parse(localStorage.getItem(MAP_STORE) || '{}'); } catch { return {}; }
}

export default function ImportDialog({ rows, headers, existingTags, onCancel, onApply }: Props) {
  const [map, setMap] = useState<ColumnMap>(() => {
    const saved = loadSaved();
    const auto = autoMap(headers);
    // saved mapping wins where its header still exists in this file
    const merged: ColumnMap = { ...auto };
    for (const f of IMPORT_FIELDS) {
      const s = saved[f.key];
      if (s && headers.includes(s)) merged[f.key] = s;
    }
    return merged;
  });
  const [dup, setDup] = useState<DupMode>('skip');

  const mapped = useMemo(() => applyMap(rows, map), [rows, map]);
  const dupCount = useMemo(
    () => mapped.filter((r) => r.tag && existingTags.has(r.tag)).length,
    [mapped, existingTags],
  );

  function apply() {
    localStorage.setItem(MAP_STORE, JSON.stringify(map));
    onApply(mapped, dup);
  }

  return (
    <div style={backdrop} onClick={onCancel}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={head}>
          <div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 16 }}>Import equipment · map columns</div>
          <div style={{ fontSize: 12, color: 'var(--dim)' }}>{rows.length} rows · {mapped.length} importable</div>
        </div>

        <div style={{ padding: '14px 18px', overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 18px' }}>
            {IMPORT_FIELDS.map((f) => (
              <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={lbl}>{f.label}</span>
                <select style={inp} value={map[f.key] ?? ''}
                  onChange={(e) => setMap((m) => ({ ...m, [f.key]: e.target.value || undefined }))}>
                  <option value="">— not mapped —</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>

          {/* preview of the first rows as mapped */}
          <div style={lbl} >Preview (first 5)</div>
          <div style={{ overflowX: 'auto', border: '1px solid var(--line2)', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)', fontSize: 11 }}>
              <thead><tr>{['Tag', 'Type', 'System', 'Serial', 'Int due', 'Maj due'].map((h) => <th key={h} style={pth}>{h}</th>)}</tr></thead>
              <tbody>
                {mapped.slice(0, 5).map((r, i) => (
                  <tr key={i}>
                    <td style={ptd}>{r.tag || '—'}</td>
                    <td style={ptd}>{r.type || <span style={{ color: 'var(--faint)' }}>auto</span>}</td>
                    <td style={ptd}>{r.section || '—'}</td>
                    <td style={ptd}>{r.serial || '—'}</td>
                    <td style={ptd}>{r.int_due || '—'}</td>
                    <td style={ptd}>{r.maj_due || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {dupCount > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={lbl}>{dupCount} tag{dupCount === 1 ? '' : 's'} already in the project — on conflict:</div>
              <div style={{ display: 'flex', gap: 14, fontSize: 12.5 }}>
                {(['skip', 'overwrite', 'rename'] as DupMode[]).map((m) => (
                  <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', textTransform: 'capitalize' }}>
                    <input type="radio" name="dup" checked={dup === m} onChange={() => setDup(m)} />{m}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={foot}>
          <button style={ghost} onClick={onCancel}>Cancel</button>
          <button style={primary} onClick={apply} disabled={!mapped.length}>Import {mapped.length} item{mapped.length === 1 ? '' : 's'}</button>
        </div>
      </div>
    </div>
  );
}

const backdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: '#0008', display: 'grid', placeItems: 'center', zIndex: 100 };
const modal: React.CSSProperties = { width: 'min(720px, 94vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 14, boxShadow: 'var(--shadow)', overflow: 'hidden' };
const head: React.CSSProperties = { padding: '15px 18px', borderBottom: '1px solid var(--line2)' };
const foot: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--line2)' };
const lbl: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: 1, color: 'var(--faint)', textTransform: 'uppercase', fontWeight: 600, margin: '16px 0 6px' };
const inp: React.CSSProperties = { background: 'var(--panel2)', border: '1px solid var(--line2)', color: 'var(--ink)', padding: '7px 9px', borderRadius: 7, fontSize: 12.5 };
const primary: React.CSSProperties = { background: 'var(--accent)', color: '#fff', border: 0, borderRadius: 7, padding: '8px 14px', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' };
const ghost: React.CSSProperties = { background: 'var(--panel2)', color: 'var(--ink)', border: '1px solid var(--line2)', borderRadius: 7, padding: '8px 14px', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' };
const pth: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--line2)', color: 'var(--faint)', fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase', background: 'var(--panel2)' };
const ptd: React.CSSProperties = { padding: '5px 8px', borderBottom: '1px solid var(--line)' };
