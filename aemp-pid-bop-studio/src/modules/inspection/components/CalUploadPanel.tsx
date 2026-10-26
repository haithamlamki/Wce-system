// ============================================================================
//  Upload a TMMDE register from Excel (reference "Upload register"): read and
//  count first, nothing written until Apply. The rig is the one picked here —
//  never the sheet's Location — and a mismatch holds the load until confirmed.
// ============================================================================
import { useState } from 'react';
import * as XLSX from 'xlsx';
import { useInspection } from '../state/InspectionContext';
import { parseRegisterWorkbook, REGISTER_TITLES, type ImportPlan, type ParsedRegister } from '../lib/calibration';
import { applyImport, fetchInstruments, fetchRegisters, previewImport, saveRegister } from '../lib/calibrationApi';

interface Preview { parsed: ParsedRegister; plan: ImportPlan; registerId: string | null }

export default function CalUploadPanel({ fixedUnitId, onClose, onDone }: {
  fixedUnitId?: string; onClose: () => void; onDone: (registerId: string) => void;
}) {
  const { units } = useInspection();
  const [unitId, setUnitId] = useState(fixedUnitId ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmRig, setConfirmRig] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unit = units.find((u) => u.id === unitId);
  const rigMismatch = !!(preview && unit && preview.parsed.header.location
    && preview.parsed.header.location.trim().toLowerCase() !== unit.name.trim().toLowerCase());

  const read = async () => {
    if (!unitId || !file) { setError('Pick the rig and the file first.'); return; }
    setBusy(true); setError(null); setPreview(null); setConfirmRig(false);
    try {
      const parsed = parseRegisterWorkbook(XLSX.read(await file.arrayBuffer(), { cellDates: false }));
      const reg = (await fetchRegisters()).find((r) => r.unitId === unitId) ?? null;
      const existing = reg ? await fetchInstruments(reg.id) : [];
      setPreview({ parsed, plan: previewImport(parsed.rows, existing), registerId: reg?.id ?? null });
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const apply = async () => {
    if (!preview) return;
    setBusy(true); setError(null);
    try {
      const h = preview.parsed.header;
      const title = (REGISTER_TITLES as readonly string[]).find((t) => t.toLowerCase() === h.title.toLowerCase())
        ?? REGISTER_TITLES[0];
      const registerId = preview.registerId ?? await saveRegister({ unitId, title, registerDate: h.registerDate,
        qualificationCode: h.qualificationCode, revisionNo: h.revisionNo });
      await applyImport(registerId, preview.plan, preview.parsed.present, setStatus);
      onDone(registerId);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="insp-card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="insp-field">
          <label htmlFor="cal-up-rig">Rig</label>
          <select id="cal-up-rig" className="insp-input" value={unitId} disabled={!!fixedUnitId || busy}
            onChange={(e) => { setUnitId(e.target.value); setPreview(null); }}>
            <option value="">Select a rig…</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div className="insp-field">
          <label htmlFor="cal-up-file">Register file (.xlsx)</label>
          <input id="cal-up-file" type="file" accept=".xlsx,.xls" disabled={busy}
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); }} />
        </div>
        <button type="button" className="insp-btn primary" disabled={busy || !file || !unitId} onClick={read}>Read file</button>
        <button type="button" className="insp-btn" disabled={busy} onClick={onClose}>Back</button>
      </div>

      {error && <p style={{ color: 'var(--i-danger)', marginTop: 10 }}>{error}</p>}
      {status && busy && <p style={{ color: 'var(--i-muted)', marginTop: 10 }}>{status}</p>}

      {preview && (
        <div style={{ marginTop: 14 }}>
          <strong>Nothing written yet.</strong>
          <ul className="insp-plainlist">
            <li>{preview.plan.inserts.length} new instrument(s), {preview.plan.updates.length} will be updated</li>
            <li>{preview.plan.untouched} already in the register and not in the file — left as they are</li>
            <li>{preview.parsed.errors.length} problem(s){preview.registerId ? '' : ' · a new register will be created'}</li>
          </ul>
          {preview.parsed.errors.length > 0 && (
            <div className="insp-table-wrap" style={{ maxHeight: 220, marginTop: 8 }}>
              <table className="insp-table">
                <thead><tr><th>Row</th><th>Column</th><th>Problem</th></tr></thead>
                <tbody>
                  {preview.parsed.errors.map((e, k) => (
                    <tr key={k}><td>{e.row}</td><td>{e.column}</td><td>{e.message}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {rigMismatch && (
            <label style={{ display: 'flex', gap: 8, marginTop: 10, color: 'var(--i-danger)' }}>
              <input type="checkbox" checked={confirmRig} onChange={(e) => setConfirmRig(e.target.checked)} />
              The file names "{preview.parsed.header.location}", not {unit?.name}. Load it onto {unit?.name} anyway.
            </label>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" className="insp-btn primary"
              disabled={busy || (rigMismatch && !confirmRig) || (preview.plan.inserts.length + preview.plan.updates.length === 0)}
              onClick={apply}>Apply upload</button>
            <button type="button" className="insp-btn" disabled={busy} onClick={() => setPreview(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
