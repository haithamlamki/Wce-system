// ============================================================================
//  Data Upload — download the category template, pick an approver + file,
//  validate client-side (workbookImport) then bulk-insert via RPC.
// ============================================================================
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { useInspection } from '../state/InspectionContext';
import { buildTemplateWorkbook } from '../lib/template';
import { parseWorkbook } from '../lib/workbookImport';
import { importReferenceExport, isReferenceExport } from '../lib/referenceImport';
import { importRecords } from '../lib/records';
import { PageHeader } from '../components/ui';
import { CATEGORY_LABELS, CATEGORY_ORDER, type InspCategory } from '../types';

export default function DataUploadView() {
  const { types, parts, components, units, companies, approvers, refreshCatalog } = useInspection();
  const navigate = useNavigate();
  const onDone = () => navigate('/inspection/records');
  // The template is per-category; a full reference export is detected and
  // imported across every category regardless of this choice.
  const [category, setCategory] = useState<InspCategory>('well_control');
  const [approverId, setApproverId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const downloadTemplate = () => {
    const wb = buildTemplateWorkbook(category, { types, units, companies });
    XLSX.writeFile(wb, `inspection-template-${category}.xlsx`);
  };

  const upload = async () => {
    if (!approverId) { setErrors(['Choose an Approve User first.']); return; }
    if (!file) { setErrors(['Choose a file first.']); return; }
    setBusy(true); setErrors([]); setStatus(null);
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      if (isReferenceExport(wb)) {
        // Full source-system export (all categories): creates missing catalog
        // entries, imports in batches, approves. Idempotent on re-runs.
        const res = await importReferenceExport(wb,
          { types, parts, components, units, companies }, approverId, setStatus);
        await refreshCatalog();
        setStatus(`Reference export imported: ${res.imported} records `
          + `(${res.skippedDuplicates} duplicates skipped, ${res.approved} approved); catalog +`
          + `${res.catalogCreated.companies} companies, +${res.catalogCreated.types} types, `
          + `+${res.catalogCreated.parts} parts, +${res.catalogCreated.components} components.`);
        onDone();
        return;
      }
      const { rows, errors: errs } = parseWorkbook(wb, { category, types, parts, components, units, companies });
      if (errs.length) { setErrors(errs); return; }
      if (rows.length === 0) { setErrors(['No data rows found in the file.']); return; }
      const n = await importRecords(rows.map((r) => ({ ...r, approver_id: approverId })));
      setStatus(`Imported ${n} record(s) as Pending Approval.`);
      onDone();
    } catch (e) { setErrors([(e as Error).message]); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader
        title="Upload records"
        subtitle="Bulk-import inspection records from a workbook."
        actions={(
          <button type="button" className="insp-btn"
            onClick={() => navigate('/inspection/records')}>Back</button>
        )}
      />
      <div className="insp-card">
        <div className="insp-toolbar">
          <span style={{ fontSize: 12.5 }}>
            Not sure of the format? Download the sample template for {CATEGORY_LABELS[category]},
            fill it in, then upload it here.
          </span>
          <div className="grow">
            <button type="button" className="insp-btn" onClick={downloadTemplate}>
              Download Template
            </button>
          </div>
        </div>

        <div className="insp-form-grid" style={{ marginTop: 12 }}>
          <div className="insp-field">
            <label htmlFor="up-category">Category</label>
            <select id="up-category" className="insp-select" value={category}
              onChange={(e) => setCategory(e.target.value as InspCategory)}>
              {CATEGORY_ORDER.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>
          <div className="insp-field">
            <label htmlFor="up-approver">Approve User<span className="req"> *</span></label>
            <select id="up-approver" className="insp-select" value={approverId}
              onChange={(e) => setApproverId(e.target.value)}>
              <option value="">Select an approver…</option>
              {approvers.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="insp-field">
            <label htmlFor="up-file">Select file to upload</label>
            <input id="up-file" className="insp-input" type="file" accept=".xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>

        <div className="insp-toolbar" style={{ marginTop: 12, marginBottom: 0 }}>
          <button type="button" className="insp-btn primary" disabled={busy} onClick={upload}>
            Upload
          </button>
          {status && (
            <span data-testid="upload-status" style={{ fontSize: 12.5, color: 'var(--i-success)' }}>
              {status}
            </span>
          )}
        </div>

        {errors.length > 0 && (
          <div style={{ marginTop: 12, color: 'var(--i-danger)', fontSize: 12.5 }} role="alert">
            <b>Fix these and re-upload (nothing was imported):</b>
            <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        )}
      </div>
    </>
  );
}
