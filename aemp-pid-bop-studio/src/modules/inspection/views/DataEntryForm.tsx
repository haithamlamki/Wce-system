// ============================================================================
//  Data Entry — source-parity single-record form: approver, catalog cascade
//  (equipment → part → component), unit/company, statuses, dates+frequencies
//  with live due-date preview (enhancement), and per-type spec fields.
// ============================================================================
import { useMemo, useState } from 'react';
import { useInspection } from '../state/InspectionContext';
import { insertRecord, updateRecord, type RecordDraft } from '../lib/records';
import { computeDueDate } from '../lib/compliance';
import { INTERMEDIATE_FREQUENCIES, MAJOR_FREQUENCIES, WORKING_STATUS_LABELS,
  frequencyLabel, type InspCategory, type InspectionRecord, type WorkingStatus } from '../types';

export default function DataEntryForm({ category, onSaved, editing = null }: {
  category: InspCategory; onSaved: () => void; editing?: InspectionRecord | null;
}) {
  const { types, parts, components, units, companies, approvers } = useInspection();
  const catTypes = useMemo(() => types.filter((t) => t.category === category), [types, category]);

  const [f, setF] = useState({
    approverId: editing?.approverId ?? '',
    typeId: editing?.typeId ?? '',
    partId: editing?.partId ?? '',
    componentId: editing?.componentId ?? '',
    componentDescription: editing?.componentDescription ?? '',
    unitId: editing?.unitId ?? '',
    companyId: editing?.companyId ?? '',
    oem: editing?.oem ?? '',
    inspectionCompany: editing?.inspectionCompany ?? '',
    serialNumber: editing?.serialNumber ?? '',
    partNumber: editing?.partNumber ?? '',
    workingStatus: (editing?.workingStatus ?? 'in_use') as WorkingStatus,
    manufactureYear: editing?.manufactureYear?.toString() ?? '',
    intermediateDate: editing?.intermediateDate ?? '',
    intermediateFreq: editing?.intermediateFreqMonths?.toString() ?? '',
    majorDate: editing?.majorDate ?? '',
    majorFreq: editing?.majorFreqMonths?.toString() ?? '',
    remarks: editing?.remarks ?? '',
  });
  const [specs, setSpecs] = useState<Record<string, string>>(editing?.specs ?? {});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  const type = catTypes.find((t) => t.id === f.typeId);
  const typeParts = parts.filter((p) => p.typeId === f.typeId);
  const partComponents = components.filter((c) => c.partId === f.partId);
  const interDue = computeDueDate(f.intermediateDate || null, f.intermediateFreq ? Number(f.intermediateFreq) : null);
  const majorDue = computeDueDate(f.majorDate || null, f.majorFreq ? Number(f.majorFreq) : null);

  const save = async () => {
    if (!f.approverId) { alert('Approve User is required.'); return; }
    if (!f.typeId || !f.unitId) { alert('Equipment and Unit are required.'); return; }
    const draft: RecordDraft = {
      type_id: f.typeId, part_id: f.partId || null, component_id: f.componentId || null,
      unit_id: f.unitId, company_id: f.companyId || null,
      component_description: f.componentDescription, oem: f.oem,
      inspection_company: f.inspectionCompany, serial_number: f.serialNumber,
      part_number: f.partNumber, working_status: f.workingStatus,
      manufacture_year: f.manufactureYear ? Number(f.manufactureYear) : null,
      intermediate_date: f.intermediateDate || null,
      intermediate_freq_months: f.intermediateFreq ? Number(f.intermediateFreq) : null,
      major_date: f.majorDate || null,
      major_freq_months: f.majorFreq ? Number(f.majorFreq) : null,
      remarks: f.remarks, specs, approver_id: f.approverId,
    };
    setBusy(true);
    try {
      if (editing) {
        await updateRecord(editing.id, draft);
        alert('Record updated.');
      } else {
        await insertRecord(draft);
        alert('Record saved (Pending Approval).');
      }
      onSaved();
    } catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="insp-card">
      <h3 style={{ marginTop: 0 }}>{editing ? 'Edit Record' : 'New Inspection Record'}</h3>
      <div style={{ color: 'var(--dim)', fontSize: 12, marginBottom: 12 }}>
        Fill in the fields below and choose an approver, then save.
      </div>
      <div className="insp-form-grid">
        <div className="insp-field"><label>Approve User *</label>
          <select value={f.approverId} onChange={set('approverId')}>
            <option value="">Select approver…</option>
            {approvers.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select></div>
        <div className="insp-field"><label>Equipment *</label>
          <select value={f.typeId} onChange={(e) => { set('typeId')(e); setF((s) => ({ ...s, partId: '', componentId: '' })); setSpecs({}); }}>
            <option value="">Select equipment…</option>
            {catTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select></div>
        <div className="insp-field"><label>Equipment Part</label>
          <select value={f.partId} onChange={(e) => { set('partId')(e); setF((s) => ({ ...s, componentId: '' })); }}>
            <option value="">—</option>
            {typeParts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></div>
        <div className="insp-field"><label>Equipment Part Component</label>
          <select value={f.componentId} onChange={set('componentId')}>
            <option value="">—</option>
            {partComponents.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></div>
        <div className="insp-field"><label>Component Description</label>
          <input value={f.componentDescription} onChange={set('componentDescription')} /></div>
        <div className="insp-field"><label>Unit *</label>
          <select value={f.unitId} onChange={set('unitId')}>
            <option value="">Select unit…</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select></div>
        <div className="insp-field"><label>Company</label>
          <select value={f.companyId} onChange={set('companyId')}>
            <option value="">—</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></div>
        <div className="insp-field"><label>OEM</label><input value={f.oem} onChange={set('oem')} /></div>
        <div className="insp-field"><label>Inspection Company</label>
          <input value={f.inspectionCompany} onChange={set('inspectionCompany')} /></div>
        <div className="insp-field"><label>Serial Number</label>
          <input value={f.serialNumber} onChange={set('serialNumber')} /></div>
        <div className="insp-field"><label>Part Number</label>
          <input value={f.partNumber} onChange={set('partNumber')} /></div>
        <div className="insp-field"><label>Status</label>
          <select value={f.workingStatus} onChange={set('workingStatus')}>
            {Object.entries(WORKING_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></div>
        <div className="insp-field"><label>Manufacture Year</label>
          <input type="number" min={1950} max={2100} value={f.manufactureYear} onChange={set('manufactureYear')} /></div>
        <div className="insp-field"><label>Intermediate Inspection Date</label>
          <input type="date" value={f.intermediateDate} onChange={set('intermediateDate')} /></div>
        <div className="insp-field"><label>Intermediate Frequency</label>
          <select value={f.intermediateFreq} onChange={set('intermediateFreq')}>
            <option value="">—</option>
            {INTERMEDIATE_FREQUENCIES.map((m) => <option key={m} value={m}>{frequencyLabel(m)}</option>)}
          </select>
          {interDue && <span style={{ fontSize: 11, color: 'var(--dim)' }}>Due: {interDue}</span>}</div>
        <div className="insp-field"><label>Major Inspection Date</label>
          <input type="date" value={f.majorDate} onChange={set('majorDate')} /></div>
        <div className="insp-field"><label>Major Frequency</label>
          <select value={f.majorFreq} onChange={set('majorFreq')}>
            <option value="">—</option>
            {MAJOR_FREQUENCIES.map((m) => <option key={m} value={m}>{frequencyLabel(m)}</option>)}
          </select>
          {majorDue && <span style={{ fontSize: 11, color: 'var(--dim)' }}>Due: {majorDue}</span>}</div>
        {(type?.specFields ?? []).map((field) => (
          <div className="insp-field" key={field}><label>{field}</label>
            <input value={specs[field] ?? ''} onChange={(e) => setSpecs((s) => ({ ...s, [field]: e.target.value }))} /></div>
        ))}
        <div className="insp-field" style={{ gridColumn: '1 / -1' }}><label>Remarks</label>
          <textarea rows={2} value={f.remarks} onChange={set('remarks')} /></div>
      </div>
      <div className="insp-toolbar" style={{ marginTop: 14 }}>
        <button className="insp-btn primary" disabled={busy} onClick={save}>
          {editing ? '💾 Save Changes' : '💾 Save Record'}
        </button>
      </div>
    </div>
  );
}
