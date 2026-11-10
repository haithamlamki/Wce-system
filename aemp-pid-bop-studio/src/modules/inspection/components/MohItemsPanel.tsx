// ============================================================================
//  Major Overhaul — equipment master editor (moh:update). Edits description,
//  category, interval basis (calendar years / operating hours), interval,
//  active flag, and which inspection equipment types auto-fill "last MOH".
// ============================================================================
import { useMemo, useState } from 'react';
import Icon from './Icon';
import { Badge } from './ui';
import { useInspection } from '../state/InspectionContext';
import { MOH_CATEGORIES, type IntervalBasis, type MohCategory, type MohItem } from '../lib/moh';
import { saveItem, setItemTypes } from '../lib/mohApi';

type Draft = {
  id?: string; sno: string; description: string; category: MohCategory; basis: IntervalBasis;
  interval: string; active: boolean; typeIds: string[];
};

const toDraft = (i: MohItem): Draft => ({
  id: i.id, sno: String(i.sno), description: i.description, category: i.category, basis: i.basis,
  interval: i.interval?.toString() ?? '', active: i.active, typeIds: i.typeIds,
});

export default function MohItemsPanel({ items, onClose, onSaved }: {
  items: MohItem[]; onClose: () => void; onSaved: () => Promise<void> | void;
}) {
  const { types } = useInspection();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [typeQ, setTypeQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const sorted = useMemo(() => [...items].sort((a, b) => a.sno - b.sno), [items]);
  const typeName = useMemo(() => new Map(types.map((t) => [t.id, t.name])), [types]);
  const typeOptions = useMemo(() => {
    const n = typeQ.trim().toLowerCase();
    return [...types].filter((t) => !n || t.name.toLowerCase().includes(n))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [types, typeQ]);

  const startNew = () => setDraft({
    sno: String((sorted[sorted.length - 1]?.sno ?? 0) + 1), description: '', category: 'Other', basis: 'years',
    interval: '5', active: true, typeIds: [],
  });

  const save = async () => {
    if (!draft) return;
    const sno = Math.trunc(Number(draft.sno));
    const interval = draft.interval.trim() === '' ? null : Math.trunc(Number(draft.interval));
    if (!draft.description.trim()) { setErr('Enter an equipment description.'); return; }
    if (!Number.isFinite(sno) || sno < 1) { setErr('S.No. must be a positive number.'); return; }
    if (interval !== null && (!Number.isFinite(interval) || interval < 1)) { setErr('Interval must be a positive whole number.'); return; }
    setBusy(true); setErr(null);
    try {
      await saveItem({ id: draft.id, sno, description: draft.description, category: draft.category,
        basis: draft.basis, interval, active: draft.active });
      // A new item's id is only known after a reload; links are set on its next edit.
      if (draft.id) await setItemTypes(draft.id, draft.typeIds);
      setDraft(null);
      await onSaved();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const toggleType = (id: string) => draft && setDraft({
    ...draft, typeIds: draft.typeIds.includes(id) ? draft.typeIds.filter((t) => t !== id) : [...draft.typeIds, id],
  });

  return (
    <div className="insp-card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <h3 style={{ margin: 0, flex: 1 }}>Equipment master</h3>
        <button type="button" className="insp-btn primary" onClick={startNew}><Icon name="plus" /> Add equipment</button>
        <button type="button" className="insp-btn" onClick={onClose}>Close</button>
      </div>

      {draft && (
        <div className="insp-card" style={{ marginBottom: 12 }}>
          <div className="insp-form-grid">
            <div className="insp-field"><label htmlFor="mi-sno">S.No.</label>
              <input id="mi-sno" type="number" min={1} className="insp-input" value={draft.sno}
                onChange={(e) => setDraft({ ...draft, sno: e.target.value })} /></div>
            <div className="insp-field" style={{ gridColumn: 'span 2' }}><label htmlFor="mi-desc">Equipment description *</label>
              <input id="mi-desc" className="insp-input" value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
            <div className="insp-field"><label htmlFor="mi-cat">Category</label>
              <select id="mi-cat" className="insp-input" value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value as MohCategory })}>
                {MOH_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select></div>
            <div className="insp-field"><label htmlFor="mi-basis">Interval basis</label>
              <select id="mi-basis" className="insp-input" value={draft.basis}
                onChange={(e) => setDraft({ ...draft, basis: e.target.value as IntervalBasis })}>
                <option value="years">Calendar years</option>
                <option value="hours">Operating hours</option>
              </select></div>
            <div className="insp-field"><label htmlFor="mi-int">MOH interval ({draft.basis})</label>
              <input id="mi-int" type="number" min={1} className="insp-input" value={draft.interval}
                onChange={(e) => setDraft({ ...draft, interval: e.target.value })} /></div>
            <div className="insp-field"><label htmlFor="mi-act">Active</label>
              <select id="mi-act" className="insp-input" value={draft.active ? '1' : '0'}
                onChange={(e) => setDraft({ ...draft, active: e.target.value === '1' })}>
                <option value="1">Active</option><option value="0">Inactive (hidden from plans)</option>
              </select></div>
          </div>
          {draft.id && draft.basis === 'years' && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                Linked inspection equipment types (auto-fill last MOH from major inspections)</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {draft.typeIds.length ? draft.typeIds.map((t) => (
                  <button key={t} type="button" className="insp-btn" onClick={() => toggleType(t)}
                    title="Remove link">{typeName.get(t) ?? t} ✕</button>
                )) : <span style={{ color: 'var(--i-muted)', fontSize: 12 }}>None linked.</span>}
              </div>
              <input className="insp-input" placeholder="Find equipment type…" value={typeQ}
                onChange={(e) => setTypeQ(e.target.value)} style={{ maxWidth: 320 }} />
              <div style={{ maxHeight: 160, overflowY: 'auto', marginTop: 6, display: 'grid', gap: 2 }}>
                {typeOptions.slice(0, 60).map((t) => (
                  <label key={t.id} style={{ display: 'flex', gap: 6, fontSize: 12.5 }}>
                    <input type="checkbox" checked={draft.typeIds.includes(t.id)} onChange={() => toggleType(t.id)} />
                    {t.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          {!draft.id && <p style={{ color: 'var(--i-muted)', fontSize: 12 }}>Save first, then edit the item to link inspection equipment types.</p>}
          {err && <div style={{ color: 'var(--i-danger)', marginTop: 8 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" className="insp-btn primary" disabled={busy} onClick={save}>Save</button>
            <button type="button" className="insp-btn" onClick={() => { setDraft(null); setErr(null); }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="insp-table-wrap" style={{ maxHeight: 420 }}>
        <table className="insp-table">
          <thead><tr><th>S.No.</th><th>Equipment</th><th>Category</th><th>Interval</th><th>Linked types</th><th>Status</th><th /></tr></thead>
          <tbody>
            {sorted.map((i) => (
              <tr key={i.id}>
                <td>{i.sno}</td>
                <td>{i.description}</td>
                <td>{i.category}</td>
                <td>{i.interval ? `${i.interval.toLocaleString('en-US')} ${i.basis === 'hours' ? 'h' : 'yr'}` : <Badge tone="warning">Not set</Badge>}</td>
                <td style={{ fontSize: 12 }}>{i.typeIds.map((t) => typeName.get(t) ?? '?').join(', ') || '—'}</td>
                <td>{i.active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}</td>
                <td><button type="button" className="insp-iconbtn" title="Edit"
                  onClick={() => { setDraft(toDraft(i)); setErr(null); }}><Icon name="edit" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
