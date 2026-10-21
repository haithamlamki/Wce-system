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
import { isReferenceExport } from '../lib/referenceImport';
import { syncReferenceExport, type SyncReport } from '../lib/referenceSync';
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
  const [preview, setPreview] = useState<{ wb: XLSX.WorkBook; report: SyncReport } | null>(null);

  const downloadTemplate = () => {
    const wb = buildTemplateWorkbook(category, { types, units, companies });
    XLSX.writeFile(wb, `inspection-template-${category}.xlsx`);
  };

  const ctx = { types, parts, components, units, companies };

  const upload = async () => {
    if (!file) { setErrors(['Choose a file first.']); return; }
    setBusy(true); setErrors([]); setStatus(null); setPreview(null);
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      if (isReferenceExport(wb)) {
        // Full source-system export: preview how the database would change
        // (dry run, no writes); the user applies it from the preview panel.
        const report = await syncReferenceExport(wb, ctx, setStatus, { dryRun: true });
        setPreview({ wb, report });
        setStatus(null);
        return;
      }
      if (!approverId) { setErrors(['Choose an Approve User first.']); return; }
      const { rows, errors: errs } = parseWorkbook(wb, { category, types, parts, components, units, companies });
      if (errs.length) { setErrors(errs); return; }
      if (rows.length === 0) { setErrors(['No data rows found in the file.']); return; }
      const n = await importRecords(rows.map((r) => ({ ...r, approver_id: approverId })));
      setStatus(`Imported ${n} record(s) as Pending Approval.`);
      onDone();
    } catch (e) { setErrors([(e as Error).message]); }
    finally { setBusy(false); }
  };

  const applySync = async () => {
    if (!preview) return;
    setBusy(true); setErrors([]);
    try {
      const res = await syncReferenceExport(preview.wb, ctx, setStatus, { dryRun: false });
      await refreshCatalog();
      setPreview(null);
      setStatus(`Synced with the source system: ${res.updates} updated, ${res.inserts} added.`);
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

        {preview && (
          <div className="insp-card" data-testid="sync-preview" style={{ marginTop: 12 }}>
            <b>Source-system export detected — preview (nothing written yet)</b>
            <ul style={{ fontSize: 12.5 }}>
              <li>{preview.report.rows} records in file ({preview.report.skippedDuplicates} in-file duplicates skipped)</li>
              <li>{preview.report.updates} existing records will be updated, {preview.report.inserts} added</li>
              <li>{preview.report.pendingApproval} will be Pending Approval, as in the source</li>
              <li>Units to create: {preview.report.unitsCreated.join(', ') || 'none'}</li>
              <li>Catalog additions: {preview.report.catalogCreated.types} types,{' '}
                {preview.report.catalogCreated.parts} parts, {preview.report.catalogCreated.components} components,{' '}
                {preview.report.catalogCreated.companies} companies</li>
              <li>Category corrections: {preview.report.categoryFixes.length}
                {preview.report.categoryFixes.length > 0 && ` (${preview.report.categoryFixes
                  .slice(0, 8).map((f) => `${f.name}: ${CATEGORY_LABELS[f.from]} → ${CATEGORY_LABELS[f.to]}`)
                  .join('; ')}${preview.report.categoryFixes.length > 8 ? '; …' : ''})`}</li>
              <li>{preview.report.orphanIds.length} records here are not in the export (kept, not deleted)</li>
            </ul>
            <div className="insp-toolbar" style={{ marginBottom: 0 }}>
              <button type="button" className="insp-btn primary" disabled={busy} onClick={applySync}>
                Apply sync
              </button>
              <button type="button" className="insp-btn" disabled={busy} onClick={() => setPreview(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}

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
