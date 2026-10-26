// ============================================================================
//  New document set (reference `/inspection/shared-documents/new`): rigs,
//  name, optional description and category, and at least one file.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { MultiCombobox } from '../components/Combobox';
import Icon from '../components/Icon';
import { EmptyState, PageHeader } from '../components/ui';
import { useInspection } from '../state/InspectionContext';
import { createDocumentSet, listDocumentCategories } from '../lib/sharedDocuments';

export const SHARED_DOC_ACCEPT = '.pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx';

/** "Select or type a category..." — free text with the categories already in use. */
export function CategoryInput({ id, value, onChange, options }: {
  id: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <>
      <input id={id} className="insp-input" list={`${id}-list`} value={value} maxLength={255}
        placeholder="Select or type a category..." onChange={(e) => onChange(e.target.value)} />
      <datalist id={`${id}-list`}>{options.map((c) => <option key={c} value={c} />)}</datalist>
    </>
  );
}

export default function SharedDocumentSetFormView() {
  const navigate = useNavigate();
  const { can, units, scopedUnitIds } = useInspection();
  const back = () => navigate('/inspection/shared-documents');
  const rigOptions = useMemo(() => units.filter((u) => scopedUnitIds.has(u.id))
    .map((u) => ({ value: u.id, label: u.name })).sort((a, b) => a.label.localeCompare(b.label)), [units, scopedUnitIds]);
  const [categories, setCategories] = useState<string[]>([]);
  const [rigs, setRigs] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { listDocumentCategories().then(setCategories).catch(() => setCategories([])); }, []);

  if (!can('shared-document:create')) {
    return <EmptyState ico="⚿" title="No Access" desc="You need the shared-document:create permission." />;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (rigs.length === 0) next.rigs = 'At least one rig is required';
    if (!name.trim()) next.name = 'Name is required';
    if (files.length === 0) next.files = 'At least one file is required';
    setErrs(next);
    if (Object.keys(next).length) return;
    setProgress(0);
    try {
      await createDocumentSet({ unitIds: rigs, name: name.trim(), description: description.trim() || undefined,
        category: category.trim() || undefined, files }, setProgress);
      back();
    } catch (err) {
      setErrs({ form: (err as Error).message });
      setProgress(null);
    }
  };
  const busy = progress !== null;
  const fieldErr = (k: string) => errs[k] && <p style={{ color: 'var(--i-danger)', fontSize: 12, margin: '4px 0 0' }}>{errs[k]}</p>;

  return (
    <div style={{ maxWidth: 680 }}>
      <PageHeader title="New document set" subtitle="Shared Documents"
        actions={<button type="button" className="insp-btn" onClick={back}>← Back</button>} />
      <form className="insp-card" onSubmit={submit} noValidate style={{ display: 'grid', gap: 14 }}>
        <div className="insp-field"><label htmlFor="sd-rigs">Rigs</label>
          <MultiCombobox id="sd-rigs" options={rigOptions} selected={rigs} noun="rig"
            onChange={(v) => { setRigs(v); setErrs((x) => ({ ...x, rigs: '' })); }}
            placeholder="Select rigs..." searchPlaceholder="Search rigs..." />{fieldErr('rigs')}</div>
        <div className="insp-field"><label htmlFor="sd-name">Name</label>
          <input id="sd-name" className="insp-input" value={name} maxLength={255}
            placeholder="e.g. 2026 Annual Certs" onChange={(e) => setName(e.target.value)} />{fieldErr('name')}</div>
        <div className="insp-field"><label htmlFor="sd-desc">Description</label>
          <input id="sd-desc" className="insp-input" value={description} maxLength={500}
            placeholder="Optional" onChange={(e) => setDescription(e.target.value)} /></div>
        <div className="insp-field"><label htmlFor="sd-cat">Category</label>
          <CategoryInput id="sd-cat" value={category} onChange={setCategory} options={categories} /></div>
        <div className="insp-field"><label>Files</label>
          <button type="button" className="insp-dropzone" aria-label="Choose files" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" />
            <div style={{ fontWeight: 600 }}>
              {files.length > 0 ? `${files.length} file${files.length === 1 ? '' : 's'} selected` : 'Click to choose files'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--i-muted)' }}>PDF, images, Office documents</div>
          </button>
          <input ref={fileRef} type="file" multiple accept={SHARED_DOC_ACCEPT} hidden
            onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); setErrs((x) => ({ ...x, files: '' })); }} />
          {fieldErr('files')}</div>
        {busy && <progress value={progress ?? 0} max={100} aria-label="Upload progress" style={{ width: '100%' }} />}
        {fieldErr('form')}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="insp-btn" onClick={back}>Cancel</button>
          <button type="submit" className="insp-btn primary" disabled={busy}>
            {busy && <span className="insp-spinner" aria-hidden="true" />}Create document set</button>
        </div>
      </form>
    </div>
  );
}
