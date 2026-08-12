// ============================================================================
//  Data Upload — download the category template, pick an approver + file,
//  validate client-side (workbookImport) then bulk-insert via RPC.
// ============================================================================
import { useState } from 'react';
import * as XLSX from 'xlsx';
import { useInspection } from '../state/InspectionContext';
import { buildTemplateWorkbook } from '../lib/template';
import { parseWorkbook } from '../lib/workbookImport';
import { importRecords } from '../lib/records';
import { CATEGORY_LABELS, type InspCategory } from '../types';

export default function DataUploadView({ category, onDone }: {
  category: InspCategory; onDone: () => void;
}) {
  const { types, parts, components, units, companies, approvers } = useInspection();
  const [approverId, setApproverId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const downloadTemplate = () => {
    const wb = buildTemplateWorkbook(category, { types, units, companies });
    XLSX.writeFile(wb, `inspection-template-${category}.xlsx`);
  };

  const upload = async () => {
    if (!approverId) { alert('Choose an Approve User.'); return; }
    if (!file) { alert('Choose a file.'); return; }
    setBusy(true); setErrors([]);
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const { rows, errors: errs } = parseWorkbook(wb, { category, types, parts, components, units, companies });
      if (errs.length) { setErrors(errs); return; }
      if (rows.length === 0) { setErrors(['No data rows found in the file.']); return; }
      const n = await importRecords(rows.map((r) => ({ ...r, approver_id: approverId })));
      alert(`Imported ${n} record(s) as Pending Approval.`);
      onDone();
    } catch (e) { setErrors([(e as Error).message]); }
    finally { setBusy(false); }
  };

  return (
    <div className="insp-card">
      <div className="insp-toolbar" style={{ background: 'color-mix(in srgb, var(--green) 8%, transparent)', borderRadius: 8, padding: 10 }}>
        <span style={{ fontSize: 12.5 }}>
          ⓘ Not sure of the format? Download the sample template for {CATEGORY_LABELS[category]}, fill it in, then upload it here.
        </span>
        <div style={{ flex: 1 }} />
        <button className="insp-btn" onClick={downloadTemplate}>⭳ Download Template</button>
      </div>
      <div className="insp-form-grid" style={{ marginTop: 12 }}>
        <div className="insp-field"><label>Approve User *</label>
          <select value={approverId} onChange={(e) => setApproverId(e.target.value)}>
            <option value="">Select approver…</option>
            {approvers.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select></div>
        <div className="insp-field"><label>Select file to upload</label>
          <input type="file" accept=".xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
      </div>
      <div className="insp-toolbar" style={{ marginTop: 12 }}>
        <button className="insp-btn primary" disabled={busy} onClick={upload}>⇪ Upload</button>
      </div>
      {errors.length > 0 && (
        <div style={{ marginTop: 12, color: '#d33', fontSize: 12.5 }}>
          <b>Fix these and re-upload (nothing was imported):</b>
          <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
