// ============================================================================
//  One rig's TMMDE register (reference `/calibration/:id`): header facts,
//  Overdue / Due soon / Compliant filter, Export to the same Excel layout,
//  Upload into this rig, New instrument, Renumber, and per-row certificates.
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import Icon from '../components/Icon';
import { Badge, EmptyState, PageHeader } from '../components/ui';
import CalUploadPanel from '../components/CalUploadPanel';
import CalInstrumentTable, { blankInstrument, NEW_PREFIX } from '../components/CalInstrumentTable';
import { useInspection } from '../state/InspectionContext';
import { formatDate } from '../lib/format';
import { complianceStatus, type ComplianceStatus } from '../lib/compliance';
import {
  buildRegisterWorkbook, renumber, type CalInstrument, type CalRegister, type TmmdMapping,
} from '../lib/calibration';
import {
  applyRenumber, certificateUrl, deleteInstrument, detachCertificate, fetchInstruments, fetchRegister,
  fetchTmmdMap, saveInstrument, uploadCertificate,
} from '../lib/calibrationApi';

type StatusFilter = '' | Exclude<ComplianceStatus, 'unknown'>;

export default function CalibrationRegisterView() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { can } = useInspection();
  const editable = can('calibration:update');
  const today = new Date().toISOString().slice(0, 10);

  const [register, setRegister] = useState<CalRegister | null>(null);
  const [rows, setRows] = useState<CalInstrument[]>([]);
  const [tmmdMap, setTmmdMap] = useState<TmmdMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<StatusFilter>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const reg = await fetchRegister(id);
      const [inst, map] = await Promise.all([fetchInstruments(id), fetchTmmdMap(reg.title)]);
      setRegister(reg); setRows(inst); setTmmdMap(map); setError(null);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => {
    const c = { overdue: 0, due_soon: 0, compliant: 0 };
    for (const r of rows) {
      const s = complianceStatus(r.dueDate, today);
      if (s !== 'unknown' && !r.id.startsWith(NEW_PREFIX)) c[s] += 1;
    }
    return c;
  }, [rows, today]);
  const savedCount = rows.filter((r) => !r.id.startsWith(NEW_PREFIX)).length;

  const shown = status
    ? rows.filter((r) => r.id.startsWith(NEW_PREFIX) || complianceStatus(r.dueDate, today) === status)
    : rows;

  const replaceRow = (oldId: string, next: CalInstrument) =>
    setRows((rs) => rs.map((r) => (r.id === oldId ? next : r)));

  const onSave = async (row: CalInstrument, file: File | null) => {
    const isNew = row.id.startsWith(NEW_PREFIX);
    let saved = await saveInstrument(id, row, isNew);
    if (file) saved = await uploadCertificate(saved, file);
    replaceRow(row.id, saved);
  };

  const onDelete = async (row: CalInstrument) => {
    await deleteInstrument(row);
    setRows((rs) => rs.filter((r) => r.id !== row.id));
  };

  const onOpenCert = async (row: CalInstrument, download: boolean) => {
    if (!row.certFilePath) return;
    // Open the tab synchronously so the popup blocker allows it, then point it at the signed URL.
    const win = download ? null : window.open('', '_blank');
    try {
      const url = await certificateUrl(row.certFilePath, download);
      if (win) win.location.href = url; else window.location.assign(url);
    } catch (e) { win?.close(); setError((e as Error).message); }
  };

  const onDetachCert = async (row: CalInstrument) => {
    try { replaceRow(row.id, await detachCertificate(row)); } catch (e) { setError((e as Error).message); }
  };

  const addRow = () => {
    const next = rows.reduce((m, r) => Math.max(m, r.sequenceNo ?? 0), 0) + 1;
    setRows((rs) => [blankInstrument(id, next), ...rs]);
    setStatus('');
  };

  const doRenumber = async () => {
    const changes = renumber(rows.filter((r) => !r.id.startsWith(NEW_PREFIX)));
    if (!changes.length) { setNotice('Numbering is already 1…n.'); return; }
    if (!window.confirm(`Renumber ${changes.length} instrument(s) to close the gaps in S.N?`)) return;
    try { await applyRenumber(changes); setNotice(`Renumbered ${changes.length} instrument(s).`); await load(); }
    catch (e) { setError((e as Error).message); }
  };

  const doExport = () => {
    if (!register) return;
    const saved = rows.filter((r) => !r.id.startsWith(NEW_PREFIX));
    const wb = buildRegisterWorkbook({
      title: register.title, location: register.unitName, registerDate: register.registerDate,
      revisionNo: register.revisionNo, qualificationCode: register.qualificationCode,
    }, saved.map(({ id: _id, registerId: _r, certFilePath: _p, certFileName: _n, ...rest }) => rest));
    XLSX.writeFile(wb, `Calibration_Register_${register.unitName.replace(/\s+/g, '_')}.xlsx`);
  };

  if (loading && !register) return <EmptyState ico="◌" title="Loading" desc="Loading the register…" />;
  if (!register) return <EmptyState ico="⚠" title="Register not found" desc={error ?? 'This register does not exist.'} />;

  const chip = (value: StatusFilter, label: string, n: number | null) => (
    <button type="button" className={`insp-btn${status === value ? ' primary' : ''}`} onClick={() => setStatus(value)}>
      {label}{n === null ? '' : ` (${n})`}
    </button>
  );

  const fact = (label: string, value: string | number) => (
    <div><small style={{ color: 'var(--i-muted)' }}>{label}</small><div>{value}</div></div>
  );

  return (
    <>
      <PageHeader
        title={`${register.unitName} — Calibration Register`}
        subtitle={register.title}
        actions={(
          <>
            <button type="button" className="insp-btn" onClick={() => navigate('/inspection/calibration')}>Back</button>
            <button type="button" className="insp-btn" onClick={doExport}><Icon name="export" /> Export</button>
            {editable && (
              <>
                <button type="button" className="insp-btn" onClick={() => setUploading((u) => !u)}>
                  <Icon name="upload" /> Upload</button>
                <button type="button" className="insp-btn" onClick={doRenumber}>Renumber</button>
                <button type="button" className="insp-btn primary" onClick={addRow}><Icon name="plus" /> New instrument</button>
              </>
            )}
          </>
        )}
      />

      <div className="insp-card" style={{ marginBottom: 14, display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        {fact('Location', register.unitName)}
        {fact('Date', formatDate(register.registerDate) || '—')}
        {fact('Revision No', register.revisionNo || '—')}
        {fact('Qualification code', register.qualificationCode || '—')}
        {fact('Instruments', savedCount)}
        <div style={{ display: 'flex', gap: 6 }}>
          {counts.overdue > 0 && <Badge tone="danger">{counts.overdue} overdue</Badge>}
          {counts.due_soon > 0 && <Badge tone="warning">{counts.due_soon} due soon</Badge>}
        </div>
      </div>

      {error && <div className="insp-card" style={{ borderColor: 'var(--i-danger)', marginBottom: 14 }}>{error}</div>}
      {notice && <div className="insp-card" style={{ marginBottom: 14 }}>{notice}</div>}

      {uploading && (
        <CalUploadPanel fixedUnitId={register.unitId} onClose={() => setUploading(false)}
          onDone={() => { setUploading(false); void load(); }} />
      )}

      <div className="insp-filterrow" style={{ marginBottom: 10, display: 'flex', gap: 6 }}>
        {chip('', 'All', null)}
        {chip('overdue', 'Overdue', counts.overdue)}
        {chip('due_soon', 'Due soon', counts.due_soon)}
        {chip('compliant', 'Compliant', counts.compliant)}
      </div>

      <CalInstrumentTable rows={shown} editable={editable} tmmdMap={tmmdMap} today={today}
        onSave={onSave} onDelete={onDelete}
        onDiscardNew={(rid) => setRows((rs) => rs.filter((r) => r.id !== rid))}
        onOpenCert={(r, dl) => { void onOpenCert(r, dl); }} onDetachCert={onDetachCert} />
    </>
  );
}
