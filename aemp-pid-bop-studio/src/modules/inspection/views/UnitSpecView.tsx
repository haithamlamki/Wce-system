// ============================================================================
//  Unit technical specification — the rig spec sheet (Technical Overview,
//  Mast, Sub-Structure, Draw Works …) redesigned as a responsive page: a hero
//  band with the headline ratings and rig photo, then one card per section.
//  Holders of unit:update (admins/managers implicitly) edit it in place:
//  rename/reorder/add/remove sections and rows, multi-line values, photo.
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Icon from '../components/Icon';
import { EmptyState, LoadingState } from '../components/ui';
import { useInspection } from '../state/InspectionContext';
import { formatDate } from '../lib/format';
import {
  fetchUnitSpec, findValue, moveItem, removeUnitPhoto, saveUnitSpec, SPEC_TEMPLATE,
  unitPhotoUrl, uploadUnitPhoto, type SpecSection, type UnitSpec,
} from '../lib/unitSpecs';
import './unitSpec.css';

/** Headline ratings; `section` scopes the lookup when a label repeats (Height, Hook Load). */
const KPIS: { label: string; keys: string[]; section?: string }[] = [
  { label: 'Power rating', keys: ['HP Rating'] },
  { label: 'Hook load', keys: ['Hook Load'], section: 'Technical Overview' },
  { label: 'Drilling depth', keys: ['Drilling Depth', 'Nominal Drilling Capacity'] },
  { label: 'Mast height', keys: ['Height'], section: 'Mast' },
];

function kpiValue(spec: UnitSpec, k: (typeof KPIS)[number]): string {
  if (!k.section) return findValue(spec, k.keys);
  const title = k.section.toLowerCase();
  const scoped = { sections: spec.sections.filter((s) => s.title.toLowerCase() === title) };
  return findValue(scoped, k.keys) || findValue(spec, k.keys);
}

const clone = (s: UnitSpec): UnitSpec => ({
  sections: s.sections.map((x) => ({ title: x.title, rows: x.rows.map((r) => ({ ...r })) })),
});

export default function UnitSpecView() {
  const { id = '' } = useParams();
  const { units, companies, can } = useInspection();
  const unit = units.find((u) => u.id === id);
  const company = companies.find((c) => c.id === unit?.companyId)?.name ?? '';
  const editable = can('unit:update');

  const [spec, setSpec] = useState<UnitSpec | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<UnitSpec | null>(null);
  const [draftPhoto, setDraftPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rec = await fetchUnitSpec(id);
      setSpec(rec?.spec ?? null);
      setPhotoPath(rec?.photoPath ?? null);
      setUpdatedAt(rec?.updatedAt ?? null);
      setError(null);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const shownPhoto = draft ? draftPhoto : photoPath;
  useEffect(() => {
    let alive = true;
    if (!shownPhoto) { setPhotoUrl(null); return; }
    unitPhotoUrl(shownPhoto)
      .then((u) => { if (alive) setPhotoUrl(u); })
      .catch(() => { if (alive) setPhotoUrl(null); });
    return () => { alive = false; };
  }, [shownPhoto]);

  const dirty = useMemo(
    () => !!draft && (JSON.stringify(draft) !== JSON.stringify(spec) || draftPhoto !== photoPath),
    [draft, spec, draftPhoto, photoPath],
  );
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const startEdit = (from: UnitSpec) => { setDraft(clone(from)); setDraftPhoto(photoPath); setError(null); };

  const cancel = async () => {
    if (dirty && !window.confirm('Discard your unsaved changes?')) return;
    // a photo uploaded during this edit is orphaned once the edit is discarded
    if (draftPhoto && draftPhoto !== photoPath) await removeUnitPhoto(draftPhoto).catch(() => undefined);
    setDraft(null);
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const saved = await saveUnitSpec(id, draft, draftPhoto);
      if (photoPath && photoPath !== draftPhoto) await removeUnitPhoto(photoPath).catch(() => undefined);
      setSpec(saved); setPhotoPath(draftPhoto); setUpdatedAt(new Date().toISOString());
      setDraft(null); setError(null);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const path = await uploadUnitPhoto(id, file);
      if (draftPhoto && draftPhoto !== photoPath) await removeUnitPhoto(draftPhoto).catch(() => undefined);
      setDraftPhoto(path);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const setSections = (fn: (s: SpecSection[]) => SpecSection[]) =>
    setDraft((d) => (d ? { sections: fn(d.sections) } : d));
  const patchSection = (i: number, fn: (s: SpecSection) => SpecSection) =>
    setSections((ss) => ss.map((s, j) => (j === i ? fn(s) : s)));
  const patchRow = (i: number, ri: number, field: 'label' | 'value', v: string) =>
    patchSection(i, (x) => ({ ...x, rows: x.rows.map((y, k) => (k === ri ? { ...y, [field]: v } : y)) }));

  if (!unit) {
    return <EmptyState ico="?" title="Unit not found" desc="This unit does not exist or is outside your scope." />;
  }
  if (loading) return <LoadingState label="Loading specification…" />;

  const view = draft ?? spec;

  return (
    <div className="uspec">
      <nav className="uspec-crumbs" aria-label="Breadcrumb">
        <Link to="/inspection/units">Units</Link><span aria-hidden="true">/</span><span>{unit.name}</span>
      </nav>

      <div className="insp-pagehead">
        <div>
          <h1>{unit.name} — Technical Specification</h1>
          <p>
            {[company, unit.description].filter(Boolean).join(' · ') || 'Rig technical data sheet'}
            {updatedAt && !draft && <> · Updated {formatDate(updatedAt)}</>}
          </p>
        </div>
        <div className="actions">
          {draft ? (
            <>
              <button className="insp-btn" onClick={() => void cancel()} disabled={busy}>Cancel</button>
              <button className="insp-btn primary" onClick={() => void save()} disabled={busy || !dirty}>
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            </>
          ) : view && (
            <>
              <button className="insp-btn" onClick={() => window.print()}>
                <Icon name="download" size={14} /> Print / PDF
              </button>
              {editable && (
                <button className="insp-btn primary" onClick={() => startEdit(view)}>
                  <Icon name="edit" size={14} /> Edit
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {error && <div className="uspec-error" role="alert">{error}</div>}

      {!view ? (
        <div className="insp-card">
          <EmptyState ico="▤" title="No technical specification yet"
            desc={editable
              ? 'Start from the standard Abraj rig sheet and fill in the values.'
              : 'An administrator has not added this unit’s sheet yet.'} />
          {editable && (
            <div className="uspec-center">
              <button className="insp-btn primary" onClick={() => startEdit(SPEC_TEMPLATE)}>
                <Icon name="plus" size={14} /> Start from standard template
              </button>
              <button className="insp-btn" onClick={() => startEdit({ sections: [] })}>Start blank</button>
            </div>
          )}
        </div>
      ) : (
        <>
          <section className="uspec-hero">
            <div className="uspec-hero-main">
              <div className="uspec-eyebrow">{findValue(view, ['Rig Number']) || unit.name}</div>
              <div className="uspec-model">{findValue(view, ['Rig Model']) || '—'}</div>
              <div className="uspec-kpis">
                {KPIS.map((k) => (
                  <div className="uspec-kpi" key={k.label}>
                    <span>{k.label}</span>
                    <strong>{kpiValue(view, k) || '—'}</strong>
                  </div>
                ))}
              </div>
            </div>
            <div className={`uspec-photo${photoUrl ? '' : ' empty'}`}>
              {photoUrl ? <img src={photoUrl} alt={`${unit.name} rig`} /> : <span>No rig photo</span>}
              {draft && (
                <div className="uspec-photo-acts">
                  <label className="insp-btn sm">
                    <Icon name="upload" size={12} /> {draftPhoto ? 'Replace' : 'Upload'} photo
                    <input type="file" accept="image/*" hidden disabled={busy}
                      onChange={(e) => { void onPhoto(e.target.files?.[0]); e.target.value = ''; }} />
                  </label>
                  {draftPhoto && (
                    <button className="insp-btn sm danger" onClick={() => setDraftPhoto(null)}>Remove</button>
                  )}
                </div>
              )}
            </div>
          </section>

          <div className={`uspec-grid${draft ? ' editing' : ''}`}>
            {view.sections.map((s, i) => (
              <section className="uspec-sec" key={i}>
                {draft ? (
                  <header className="uspec-sec-head edit">
                    <input className="insp-input" value={s.title} placeholder="Section title" aria-label="Section title"
                      onChange={(e) => patchSection(i, (x) => ({ ...x, title: e.target.value }))} />
                    <button className="uspec-ib" title="Move section up" disabled={i === 0}
                      onClick={() => setSections((ss) => moveItem(ss, i, -1))}>↑</button>
                    <button className="uspec-ib" title="Move section down" disabled={i === view.sections.length - 1}
                      onClick={() => setSections((ss) => moveItem(ss, i, 1))}>↓</button>
                    <button className="uspec-ib danger" title="Delete section"
                      onClick={() => {
                        if (s.rows.some((r) => r.value) && !window.confirm(`Delete section “${s.title || 'untitled'}”?`)) return;
                        setSections((ss) => ss.filter((_, j) => j !== i));
                      }}>✕</button>
                  </header>
                ) : (
                  <header className="uspec-sec-head"><h2>{s.title}</h2></header>
                )}

                {draft ? (
                  <div className="uspec-rows">
                    {s.rows.map((r, ri) => (
                      <div className="uspec-row edit" key={ri}>
                        <input className="insp-input" value={r.label} placeholder="Label" aria-label="Label"
                          onChange={(e) => patchRow(i, ri, 'label', e.target.value)} />
                        <textarea className="insp-input" value={r.value} placeholder="Value (Enter for a new line)"
                          aria-label="Value" rows={Math.min(6, Math.max(1, r.value.split('\n').length))}
                          onChange={(e) => patchRow(i, ri, 'value', e.target.value)} />
                        <div className="uspec-row-acts">
                          <button className="uspec-ib" title="Move row up" disabled={ri === 0}
                            onClick={() => patchSection(i, (x) => ({ ...x, rows: moveItem(x.rows, ri, -1) }))}>↑</button>
                          <button className="uspec-ib" title="Move row down" disabled={ri === s.rows.length - 1}
                            onClick={() => patchSection(i, (x) => ({ ...x, rows: moveItem(x.rows, ri, 1) }))}>↓</button>
                          <button className="uspec-ib danger" title="Delete row"
                            onClick={() => patchSection(i, (x) => ({ ...x, rows: x.rows.filter((_, k) => k !== ri) }))}>✕</button>
                        </div>
                      </div>
                    ))}
                    <button className="insp-btn sm uspec-add"
                      onClick={() => patchSection(i, (x) => ({ ...x, rows: [...x.rows, { label: '', value: '' }] }))}>
                      <Icon name="plus" size={12} /> Add row
                    </button>
                  </div>
                ) : s.rows.length ? (
                  <dl className="uspec-rows">
                    {s.rows.map((r, ri) => (
                      // a label with no value is a fitted-equipment line item (e.g. Additional Equipment)
                      <div className={`uspec-row${r.value ? '' : ' item'}`} key={ri}>
                        <dt>{r.label}</dt>
                        <dd>{r.value || (r.label ? '✓' : '')}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="uspec-none">No details recorded.</p>
                )}
              </section>
            ))}
          </div>

          {draft && (
            <button className="insp-btn uspec-add-sec"
              onClick={() => setSections((ss) => [...ss, { title: '', rows: [{ label: '', value: '' }] }])}>
              <Icon name="plus" size={14} /> Add section
            </button>
          )}
        </>
      )}
    </div>
  );
}
