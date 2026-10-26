// ============================================================================
//  Calibration Register list — replicates the reference `/calibration` page:
//  one register per rig with instrument / overdue counts, New register,
//  Upload register (Excel) and a Blank template.
// ============================================================================
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import DataTable from '../components/DataTable';
import type { Column } from '../components/DataTable';
import Icon from '../components/Icon';
import { Badge, PageHeader } from '../components/ui';
import CalUploadPanel from '../components/CalUploadPanel';
import { useInspection } from '../state/InspectionContext';
import { formatDate } from '../lib/format';
import { buildRegisterWorkbook, REGISTER_TITLES, type CalRegister } from '../lib/calibration';
import { deleteRegister, fetchRegisters, saveRegister } from '../lib/calibrationApi';

type Draft = { id?: string; unitId: string; title: string; registerDate: string; qualificationCode: string; revisionNo: string };
const EMPTY: Draft = { unitId: '', title: REGISTER_TITLES[0], registerDate: '', qualificationCode: '', revisionNo: '1' };

export default function CalibrationListView() {
  const { units, can } = useInspection();
  const navigate = useNavigate();
  const editable = can('calibration:update');
  const [rows, setRows] = useState<CalRegister[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [uploading, setUploading] = useState(false);
  const [titleFilter, setTitleFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await fetchRegisters()); setError(null); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!draft?.unitId) { setError('Pick a rig.'); return; }
    try {
      const id = await saveRegister({ ...draft, registerDate: draft.registerDate || null });
      setDraft(null);
      if (draft.id) await load(); else navigate(`/inspection/calibration/${id}`);
    } catch (e) { setError((e as Error).message); }
  };

  const remove = async (r: CalRegister) => {
    if (!window.confirm(`Delete the ${r.unitName} register and its ${r.instrumentCount} instrument(s)?`)) return;
    try { await deleteRegister(r.id); await load(); } catch (e) { setError((e as Error).message); }
  };

  const blankTemplate = () => XLSX.writeFile(buildRegisterWorkbook(
    { title: REGISTER_TITLES[0], location: '', registerDate: null, revisionNo: '', qualificationCode: '' }, []),
  'Calibration_Register_Template.xlsx');

  const shown = titleFilter ? rows.filter((r) => r.title === titleFilter) : rows;

  const columns: Column<CalRegister>[] = [
    { key: 'rig', header: 'Rig', sortable: true, value: (r) => r.unitName,
      render: (r) => <a href={`/inspection/calibration/${r.id}`}
        onClick={(e) => { e.preventDefault(); navigate(`/inspection/calibration/${r.id}`); }}>{r.unitName}</a> },
    { key: 'title', header: 'Title', sortable: true, value: (r) => r.title },
    { key: 'date', header: 'Register date', sortable: true, value: (r) => r.registerDate, render: (r) => formatDate(r.registerDate) },
    { key: 'qual', header: 'Qualification code', value: (r) => r.qualificationCode || '—' },
    { key: 'rev', header: 'Revision', value: (r) => r.revisionNo },
    { key: 'count', header: 'Instruments', align: 'right', sortable: true, value: (r) => r.instrumentCount },
    { key: 'overdue', header: 'Overdue', align: 'right', sortable: true, value: (r) => r.overdueCount },
    { key: 'status', header: 'Calibration', value: (r) => (r.overdueCount ? 'Overdue' : r.dueSoonCount ? 'Due soon' : 'Current'),
      render: (r) => (r.overdueCount ? <Badge tone="danger">Overdue</Badge>
        : r.dueSoonCount ? <Badge tone="warning">Due soon</Badge> : <Badge tone="success">Current</Badge>) },
    ...(editable ? [{ key: 'actions', header: '', render: (r: CalRegister) => (
      <span style={{ display: 'flex', gap: 4 }}>
        <button type="button" className="insp-iconbtn" title="Edit register" onClick={() => setDraft({
          id: r.id, unitId: r.unitId, title: r.title, registerDate: r.registerDate ?? '',
          qualificationCode: r.qualificationCode, revisionNo: r.revisionNo })}><Icon name="edit" /></button>
        <button type="button" className="insp-iconbtn" title="Delete register" onClick={() => remove(r)}><Icon name="delete" /></button>
      </span>
    ) }] : []),
  ];

  return (
    <>
      <PageHeader
        title="Calibration Register"
        subtitle="TMMDE — test, measuring, monitoring and detecting equipment, one register per rig."
        actions={editable && (
          <>
            <button type="button" className="insp-btn" onClick={blankTemplate}><Icon name="download" /> Blank template</button>
            <button type="button" className="insp-btn" onClick={() => { setUploading(true); setDraft(null); }}>
              <Icon name="upload" /> Upload register</button>
            <button type="button" className="insp-btn primary" onClick={() => { setDraft(EMPTY); setUploading(false); }}>
              <Icon name="plus" /> New register</button>
          </>
        )}
      />
      {error && <div className="insp-card" style={{ borderColor: 'var(--i-danger)', marginBottom: 14 }}>{error}</div>}

      {uploading && (
        <CalUploadPanel onClose={() => setUploading(false)}
          onDone={(id) => navigate(`/inspection/calibration/${id}`)} />
      )}

      {draft && (
        <div className="insp-card" style={{ marginBottom: 14 }}>
          <div className="insp-form-grid">
            <div className="insp-field">
              <label htmlFor="cal-rig">Rig *</label>
              <select id="cal-rig" className="insp-input" value={draft.unitId} disabled={!!draft.id}
                onChange={(e) => setDraft({ ...draft, unitId: e.target.value })}>
                <option value="">Select a rig…</option>
                {units.filter((u) => draft.id || !rows.some((r) => r.unitId === u.id))
                  .map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className="insp-field">
              <label htmlFor="cal-title">Title</label>
              <select id="cal-title" className="insp-input" value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}>
                {REGISTER_TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="insp-field">
              <label htmlFor="cal-date">Register date</label>
              <input id="cal-date" type="date" className="insp-input" value={draft.registerDate}
                onChange={(e) => setDraft({ ...draft, registerDate: e.target.value })} />
            </div>
            <div className="insp-field">
              <label htmlFor="cal-qual">Qualification code</label>
              <input id="cal-qual" className="insp-input" placeholder="MNT-MS-FM-02-110" value={draft.qualificationCode}
                onChange={(e) => setDraft({ ...draft, qualificationCode: e.target.value })} />
            </div>
            <div className="insp-field">
              <label htmlFor="cal-rev">Revision</label>
              <input id="cal-rev" className="insp-input" value={draft.revisionNo}
                onChange={(e) => setDraft({ ...draft, revisionNo: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" className="insp-btn primary" onClick={save}>{draft.id ? 'Save' : 'Create register'}</button>
            <button type="button" className="insp-btn" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="insp-filterrow" style={{ marginBottom: 10 }}>
        <select className="insp-input" aria-label="Filter by title" value={titleFilter}
          onChange={(e) => setTitleFilter(e.target.value)}>
          <option value="">All titles</option>
          {REGISTER_TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <DataTable rows={shown} columns={columns} rowKey={(r) => r.id} loading={loading}
        searchPlaceholder="Search registers…" emptyTitle="No registers"
        emptyDesc="Create a register for a rig, or upload one from Excel." />
    </>
  );
}
