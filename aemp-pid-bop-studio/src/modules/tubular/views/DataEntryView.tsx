// ============================================================================
//  Data Entry — pixel-faithful port of the prototype's #view-entry: numbered
//  form-cards (① unit & tubular ② API RP 7G quantities ③ movement/rental
//  ④ actions), the ↻ Spreadsheet Sync card (wired to the real staged
//  importer) and the Existing Records table with edit/delete. Saves go
//  through submit_tubular_entry (single line; archive on delete). The batch
//  grid remains available behind a toggle (user decision 2026-07-10).
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTubular } from '../state/TubularContext';
import { useToast } from '../components/shell/Toast';
import EntryGrid from '../components/EntryGrid';
import {
  CATEGORY_LABEL, CATEGORY_ORDER,
  fetchCatalog, fetchUnitRecords, submitEntry,
  type CatalogItem, type TubularCategory, type TubularRecordRow,
} from '../lib/records';
import { contractuallyLess, fleetStatus } from '../lib/calc';
import { parseTubularWorkbook } from '../lib/workbookImport';
import { downloadJson } from '../lib/downloadJson';

const ST_CLASS: Record<string, string> = {
  short: 'short', surplus: 'surplus', met: 'balanced', uncontracted: 'unctr', no_data: 'nodata',
};
const ST_LABEL: Record<string, string> = {
  short: 'SHORT', surplus: 'SURPLUS', met: 'BALANCED', uncontracted: 'UNCONTRACTED', no_data: 'NO DATA',
};

type QtyKey = 'onContract' | 'premium' | 'class2' | 'class3' | 'scrap' | 'needsInspection'
  | 'damagedOnLocation' | 'sendToRepair' | 'toOtherRig' | 'receiveFromRig';

const QTY_DEFS: Array<{ key: QtyKey; label: string; band?: string; help: string }> = [
  { key: 'onContract', label: 'On Contract', help: 'Required qty' },
  { key: 'premium', label: 'Premium', band: '#ffffff', help: '≥80% wall' },
  { key: 'class2', label: 'Class 2', band: 'var(--c-class2)', help: '≥70% wall' },
  { key: 'class3', label: 'Class 3', band: 'var(--c-class3)', help: 'Exceeds C2 limits' },
  { key: 'scrap', label: 'Scrap', band: 'var(--c-scrap)', help: 'Not for service' },
  { key: 'needsInspection', label: 'Needs Insp.', band: 'var(--c-needs)', help: 'Flagged' },
];
const MOVE_DEFS: Array<{ key: QtyKey; label: string }> = [
  { key: 'damagedOnLocation', label: 'Damaged On Location' },
  { key: 'sendToRepair', label: 'Send to Repair' },
  { key: 'toOtherRig', label: 'To Other Rig' },
  { key: 'receiveFromRig', label: 'Receive From Rig' },
];

const CAT_ENTRY_LABEL: Record<TubularCategory, string> = {
  drill_pipe: 'Drill Pipe',
  hwdp: 'HWDP (Heavy Weight Drill Pipe)',
  drill_collar: 'Drill Collar',
  pup_joint: 'Pup Joint',
};

interface FormState {
  editingId: string | null;
  category: '' | TubularCategory;
  catalogItemId: string;
  qty: Record<QtyKey, number>;
  rentalDate: string;
  remarks: string;
}

const emptyForm = (): FormState => ({
  editingId: null, category: '', catalogItemId: '',
  qty: {
    onContract: 0, premium: 0, class2: 0, class3: 0, scrap: 0, needsInspection: 0,
    damagedOnLocation: 0, sendToRepair: 0, toOtherRig: 0, receiveFromRig: 0,
  },
  rentalDate: '', remarks: '',
});

// Prototype form-card header: orange numbered square + Oswald copper caption.
function FormHead({ num, children }: { num: string; children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 13, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--copper-2)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ background: 'var(--copper)', color: '#fff', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{num}</span>
      {children}
    </div>
  );
}

export default function DataEntryView() {
  const { units, hasPerm } = useTubular();
  const toast = useToast();
  const [gridMode, setGridMode] = useState(false);
  const [unitId, setUnitId] = useState('');
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [unitMeas, setUnitMeas] = useState('Joints');
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [records, setRecords] = useState<TubularRecordRow[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [syncStatus, setSyncStatus] = useState('No import yet this session');
  const [syncError, setSyncError] = useState('');

  useEffect(() => { if (!unitId && units.length) setUnitId(units[0].id); }, [units, unitId]);
  useEffect(() => { void fetchCatalog().then(setCatalog).catch(() => undefined); }, []);

  const loadRecords = useCallback(async () => {
    if (!unitId) return;
    try { setRecords(await fetchUnitRecords(unitId)); } catch { setRecords([]); }
  }, [unitId]);
  useEffect(() => { void loadRecords(); }, [loadRecords]);

  const catById = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const descOptions = useMemo(
    () => catalog.filter((c) => c.active && (!form.category || c.category === form.category)),
    [catalog, form.category],
  );
  const unitName = units.find((u) => u.id === unitId)?.name ?? '';

  const setQty = (key: QtyKey, raw: string) => {
    const n = raw === '' ? 0 : Number(raw);
    if (!Number.isInteger(n) || n < 0) return;
    setForm((f) => ({ ...f, qty: { ...f.qty, [key]: n } }));
  };

  const lessDisplay = contractuallyLess(
    { onContract: form.qty.onContract, premium: form.qty.premium, class2: form.qty.class2 },
    !!form.catalogItemId,
  );

  const save = async () => {
    if (!form.catalogItemId) { toast('Choose a tubular description first.', 'error'); return; }
    setSaving(true);
    try {
      const position = form.editingId
        ? records.find((r) => r.id === form.editingId)?.position ?? records.length + 1
        : (records.length ? Math.max(...records.map((r) => r.position)) + 1 : 1);
      await submitEntry({
        unitId, entryDate,
        lines: [{
          id: form.editingId,
          catalog_item_id: form.catalogItemId,
          position,
          on_contract: form.qty.onContract,
          premium: form.qty.premium,
          class2: form.qty.class2,
          class3: form.qty.class3,
          scrap: form.qty.scrap,
          needs_inspection: form.qty.needsInspection,
          damaged_on_location: form.qty.damagedOnLocation,
          send_to_repair: form.qty.sendToRepair,
          to_other_rig: form.qty.toOtherRig,
          receive_from_rig: form.qty.receiveFromRig,
          rental_date: form.rentalDate || null,
          remarks: form.remarks || null,
        }],
        archiveIds: [],
      });
      toast(form.editingId ? 'Record updated.' : 'Record saved.', 'success');
      setForm(emptyForm());
      await loadRecords();
    } catch (e) {
      toast(`Save failed — nothing stored. ${e instanceof Error ? e.message : e}`, 'error');
    } finally { setSaving(false); }
  };

  const editRecord = (r: TubularRecordRow) => {
    const item = catById.get(r.catalogItemId);
    setForm({
      editingId: r.id,
      category: item?.category ?? '',
      catalogItemId: r.catalogItemId,
      qty: {
        onContract: r.onContract, premium: r.premium, class2: r.class2, class3: r.class3,
        scrap: r.scrap, needsInspection: r.needsInspection,
        damagedOnLocation: r.damagedOnLocation, sendToRepair: r.sendToRepair,
        toOtherRig: r.toOtherRig, receiveFromRig: r.receiveFromRig,
      },
      rentalDate: r.rentalDate ?? '', remarks: r.remarks ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteRecord = async (r: TubularRecordRow) => {
    try {
      await submitEntry({ unitId, entryDate, lines: [], archiveIds: [r.id], note: 'record removed via Data Entry' });
      toast('Record archived (history preserved).', 'success');
      await loadRecords();
    } catch (e) {
      toast(`Delete failed. ${e instanceof Error ? e.message : e}`, 'error');
    }
  };

  const exportJson = () => {
    downloadJson(`tubular-${unitName || 'unit'}-${entryDate}.json`, {
      unit: unitName,
      unit_of_measure: unitMeas,
      exported_at: new Date().toISOString(),
      records: records.map((r) => ({
        tubular: catById.get(r.catalogItemId)?.description,
        category: catById.get(r.catalogItemId) ? CATEGORY_LABEL[catById.get(r.catalogItemId)!.category] : null,
        on_contract: r.onContract, premium: r.premium, class_2: r.class2, class_3: r.class3,
        scrap: r.scrap, needs_inspection: r.needsInspection, on_board: r.onBoard,
        damaged_on_location: r.damagedOnLocation, send_to_repair: r.sendToRepair,
        to_other_rig: r.toOtherRig, receive_from_rig: r.receiveFromRig,
        rental_date: r.rentalDate, remarks: r.remarks,
      })),
    });
  };

  const onSyncFile = async (f: File | undefined) => {
    if (!f) return;
    setSyncError('');
    try {
      const parsed = await parseTubularWorkbook(await f.arrayBuffer());
      setSyncStatus(`Parsed ${parsed.stats.unitSheets} sheets · ${parsed.stats.dataRows} rows · ${parsed.stats.errorRows} errors`);
      toast('Workbook parsed — review & commit it from the Import tab.', 'success');
    } catch (e) {
      setSyncStatus('Import failed');
      setSyncError(e instanceof Error ? e.message : String(e));
    }
  };

  if (!hasPerm('data_entry')) {
    return (
      <section className="view" id="view-entry">
        <div className="empty-cert"><div className="ico">✎</div><div className="title">Data Entry</div>
          <div className="desc">You do not have the data-entry permission.</div></div>
      </section>
    );
  }
  if (!units.length) {
    return (
      <section className="view" id="view-entry">
        <div className="empty-cert"><div className="ico">✎</div><div className="title">Data Entry</div>
          <div className="desc">No Rig/Hoist is assigned to your account. Ask an administrator for a unit assignment.</div></div>
      </section>
    );
  }

  return (
    <section className="view" id="view-entry">
      <div className="section-head">
        <div className="section-title">Data Entry</div>
        <div className="section-sub" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          Add or update tubular records for a Rig/Hoist
          <button className="btn alt sm" onClick={() => setGridMode((v) => !v)}>
            {gridMode ? '✎ Form Mode' : '⊞ Batch Grid Mode'}
          </button>
        </div>
      </div>

      {gridMode ? (
        <EntryGrid />
      ) : (
        <>
          <div className="form-card">
            <FormHead num="1">Select Unit &amp; Tubular</FormHead>
            <div className="form-row three">
              <div className="form-field">
                <label>Rig / Hoist <span className="req">*</span></label>
                <select id="e-unit" value={unitId} onChange={(e) => { setUnitId(e.target.value); setForm(emptyForm()); }}>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Date of Update <span className="req">*</span></label>
                <input id="e-date" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
              </div>
              <div className="form-field">
                <label>Unit of Measure</label>
                <select id="e-unitmeas" value={unitMeas} onChange={(e) => setUnitMeas(e.target.value)}>
                  <option>Joints</option><option>Feet</option><option>Meters</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-field">
                <label>Category <span className="req">*</span></label>
                <select id="e-cat" value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as FormState['category'], catalogItemId: '' }))}>
                  <option value="">— Choose category —</option>
                  {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CAT_ENTRY_LABEL[c]}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Tubular Description <span className="req">*</span></label>
                <select id="e-desc" value={form.catalogItemId}
                  onChange={(e) => setForm((f) => ({ ...f, catalogItemId: e.target.value }))}>
                  <option value="">{form.category ? '— Choose description —' : '— Choose category first —'}</option>
                  {descOptions.map((c) => <option key={c.id} value={c.id}>{c.description}</option>)}
                </select>
                <span className="help">Per API RP 7G classification</span>
              </div>
            </div>
          </div>

          <div className="form-card">
            <FormHead num="2">Quantities — API RP 7G Classification</FormHead>
            <div className="form-row six">
              {QTY_DEFS.map((q) => (
                <div className="form-field" key={q.key}>
                  <label>
                    {q.band && <span className="band" style={{ background: q.band }} />}
                    {q.label}
                  </label>
                  <input type="number" min={0} value={form.qty[q.key]}
                    onChange={(e) => setQty(q.key, e.target.value)} />
                  <span className="help">{q.help}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="form-card">
            <FormHead num="3">Movement, Repair &amp; Rental (Optional)</FormHead>
            <div className="form-row four">
              {MOVE_DEFS.map((m) => (
                <div className="form-field" key={m.key}>
                  <label>{m.label}</label>
                  <input type="number" min={0} value={form.qty[m.key]}
                    onChange={(e) => setQty(m.key, e.target.value)} />
                </div>
              ))}
            </div>
            <div className="form-row three">
              <div className="form-field">
                <label>Rental Date</label>
                <input id="e-rental" type="date" value={form.rentalDate}
                  onChange={(e) => setForm((f) => ({ ...f, rentalDate: e.target.value }))} />
              </div>
              <div className="form-field">
                <label>Contractually Less</label>
                <input id="e-less" value={lessDisplay} readOnly
                  style={{ color: lessDisplay === 'OK' ? 'var(--green)' : 'var(--red-2)' }} />
                <span className="help">Computed: (Premium + Class 2) − Contract</span>
              </div>
              <div className="form-field">
                <label>Remarks</label>
                <input id="e-remarks" placeholder="Optional notes…" value={form.remarks}
                  onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} />
              </div>
            </div>
            <div className="form-actions">
              <button className="btn" id="e-save" disabled={saving} onClick={() => void save()}>
                ⬇ {form.editingId ? 'Update Record' : 'Save Record'}
              </button>
              <button className="btn alt" id="e-reset" onClick={() => setForm(emptyForm())}>Reset Form</button>
              <button className="btn alt" id="e-export" onClick={exportJson}>⬆ Export All Data (JSON)</button>
            </div>
          </div>

          <div className="form-card" id="sync-card">
            <FormHead num="↻">Spreadsheet Sync</FormHead>
            <div className="form-row three">
              <div className="form-field">
                <label>Workbook File</label>
                {hasPerm('import') ? (
                  <label className="amap-file-label">
                    ⬆ Choose Spreadsheet File
                    <input id="sync-fileInput" type="file" accept=".xlsx" style={{ display: 'none' }}
                      onChange={(e) => void onSyncFile(e.target.files?.[0])} />
                  </label>
                ) : (
                  <span className="help">Requires the import permission.</span>
                )}
                <span className="help">Reads every Rig/Hoist sheet of the monthly workbook.</span>
              </div>
              <div className="form-field">
                <label>Status</label>
                <span className="meta-chip" id="sync-status" style={{ alignSelf: 'flex-start' }}>{syncStatus}</span>
              </div>
              <div className="form-field">
                <label>Commit</label>
                <span className="help">
                  Imports are staged, previewed and committed on the{' '}
                  <Link to="/tubular/import" style={{ color: 'var(--copper-2)' }}>Import tab</Link> with a full reconciliation report.
                </span>
              </div>
            </div>
            <div className="amap-note">
              Dashboard and Master sheets are derived data and are never imported. Typed On-Board totals that
              disagree with the classification sum are kept as reported values and flagged for review.
            </div>
            {syncError && <div style={{ color: 'var(--red-2)', fontSize: 11.5, marginTop: 8 }} id="sync-error">{syncError}</div>}
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Existing Records — <span id="entry-unit-label" style={{ color: 'var(--copper-2)' }}>{unitName || 'All Units'}</span></h3>
              <span className="badge" id="entry-count">{records.length} records</span>
            </div>
            <div className="tbl-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Tubular</th><th className="num">Contract</th><th className="num">Premium</th>
                    <th className="num">C2</th><th className="num">C3</th><th className="num">Scrap</th>
                    <th className="num">Needs</th><th className="num">Variance</th><th>Status</th><th style={{ width: 140 }}>Actions</th>
                  </tr>
                </thead>
                <tbody id="entry-body">
                  {records.length === 0 && (
                    <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-3)' }}>No records for this unit yet.</td></tr>
                  )}
                  {records.map((r) => {
                    const st = fleetStatus({ onContract: r.onContract, premium: r.premium, class2: r.class2 });
                    const variance = r.onBoard - r.onContract;
                    return (
                      <tr key={r.id}>
                        <td>{catById.get(r.catalogItemId)?.description}{r.remarks ? <span style={{ color: 'var(--text-4)' }}> · {r.remarks}</span> : null}</td>
                        <td className="num">{r.onContract.toLocaleString()}</td>
                        <td className="num">{r.premium.toLocaleString()}</td>
                        <td className="num" style={{ color: r.class2 > 0 ? 'var(--c-class2)' : 'var(--text-3)' }}>{r.class2.toLocaleString()}</td>
                        <td className="num" style={{ color: r.class3 > 0 ? 'var(--c-class3)' : 'var(--text-3)' }}>{r.class3.toLocaleString()}</td>
                        <td className="num" style={{ color: r.scrap > 0 ? 'var(--red-2)' : 'var(--text-3)' }}>{r.scrap.toLocaleString()}</td>
                        <td className="num" style={{ color: r.needsInspection > 0 ? '#c084fc' : 'var(--text-3)' }}>{r.needsInspection.toLocaleString()}</td>
                        <td className="num" style={{ color: variance < 0 ? 'var(--red-2)' : variance > 0 ? 'var(--green-2)' : 'var(--text-2)' }}>
                          {variance >= 0 ? `+${variance.toLocaleString()}` : variance.toLocaleString()}
                        </td>
                        <td><span className={`st ${ST_CLASS[st]}`}>{ST_LABEL[st]}</span></td>
                        <td>
                          <button className="btn-tr" onClick={() => editRecord(r)}>Edit</button>{' '}
                          <button className="btn-tr danger" onClick={() => void deleteRecord(r)}>Del</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
