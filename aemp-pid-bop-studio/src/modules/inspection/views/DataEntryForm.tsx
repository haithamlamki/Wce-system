// ============================================================================
//  New / edit inspection record — replicates the reference `/inspection/new`
//  full-page form: field order, labels and placeholders per
//  docs/inspection-reference-parity.md §7.
//
//  Due dates are shown read-only and computed with computeDueDate (the mirror
//  of the 0030 trigger); they are never sent to the server. New records are
//  always created Pending Approval — the client cannot self-approve.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useInspection } from '../state/InspectionContext';
import { fetchRecordById, insertRecord, updateRecord } from '../lib/records';
import type { RecordDraft } from '../lib/records';
import { computeDueDate } from '../lib/compliance';
import { uploadFile } from '../lib/files';
import { PageHeader } from '../components/ui';
import Combobox from '../components/Combobox';
import type { ComboOption } from '../components/Combobox';
import {
  FILE_KIND_LABELS, INTERMEDIATE_FREQUENCIES, MAJOR_FREQUENCIES,
  WORKING_STATUS_LABELS, frequencyLabel,
} from '../types';
import type { FileKind, WorkingStatus } from '../types';

interface Fields {
  serialNumber: string; partNumber: string; oem: string; inspectionCompany: string;
  unitId: string; companyId: string; typeId: string; partId: string; componentId: string;
  componentDescription: string; manufactureYear: string; workingStatus: WorkingStatus;
  majorDate: string; majorFreq: string; intermediateDate: string; intermediateFreq: string;
  folder: FileKind; approverId: string;
}

const BLANK: Fields = {
  serialNumber: '', partNumber: '', oem: '', inspectionCompany: '',
  unitId: '', companyId: '', typeId: '', partId: '', componentId: '',
  componentDescription: '', manufactureYear: '', workingStatus: 'in_use',
  majorDate: '', majorFreq: '', intermediateDate: '', intermediateFreq: '',
  folder: 'oem_certificate', approverId: '',
};

const REQUIRED: (keyof Fields)[] = [
  'serialNumber', 'inspectionCompany', 'unitId', 'companyId', 'typeId', 'partId', 'approverId',
];

export default function DataEntryForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { types, parts, components, units, companies, approvers, can } = useInspection();
  const [f, setF] = useState<Fields>(BLANK);
  const [specs, setSpecs] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Partial<Record<keyof Fields, string>>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [remarks, setRemarks] = useState('');

  // Edit mode: fetch THIS record from the same RLS-filtered view the list uses.
  // Fetching the whole table and searching it in JavaScript pulled every record
  // (6,400+ rows over sequential paged round trips) to fill one form, and left
  // every field blank until the last page arrived.
  useEffect(() => {
    if (!id) return undefined;
    let alive = true;
    fetchRecordById(id).then((r) => {
      if (!alive || !r) return;
      setF({
        serialNumber: r.serialNumber, partNumber: r.partNumber, oem: r.oem,
        inspectionCompany: r.inspectionCompany, unitId: r.unitId, companyId: r.companyId ?? '',
        typeId: r.typeId, partId: r.partId ?? '', componentId: r.componentId ?? '',
        componentDescription: r.componentDescription,
        manufactureYear: r.manufactureYear?.toString() ?? '',
        workingStatus: r.workingStatus,
        majorDate: r.majorDate ?? '', majorFreq: r.majorFreqMonths?.toString() ?? '',
        intermediateDate: r.intermediateDate ?? '',
        intermediateFreq: r.intermediateFreqMonths?.toString() ?? '',
        folder: 'oem_certificate', approverId: r.approverId ?? '',
      });
      setSpecs(r.specs);
      setRemarks(r.remarks);
    }).catch((e) => setNotice((e as Error).message));
    return () => { alive = false; };
  }, [id]);

  const set = <K extends keyof Fields>(k: K) => (v: Fields[K]) =>
    setF((s) => ({ ...s, [k]: v }));

  const type = useMemo(() => types.find((t) => t.id === f.typeId), [types, f.typeId]);
  const typeParts = useMemo(() => parts.filter((p) => p.typeId === f.typeId), [parts, f.typeId]);
  const partComponents = useMemo(
    () => components.filter((c) => c.partId === f.partId), [components, f.partId],
  );

  const majorDue = computeDueDate(f.majorDate || null, f.majorFreq ? Number(f.majorFreq) : null);
  const interDue = computeDueDate(
    f.intermediateDate || null, f.intermediateFreq ? Number(f.intermediateFreq) : null,
  );

  const validate = (): boolean => {
    const next: Partial<Record<keyof Fields, string>> = {};
    for (const k of REQUIRED) if (!f[k]) next[k] = 'This field is required.';
    if (f.manufactureYear) {
      const y = Number(f.manufactureYear);
      if (!Number.isInteger(y) || y < 1950 || y > 2100) {
        next.manufactureYear = 'Enter a year between 1950 and 2100.';
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
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
      remarks, specs, approver_id: f.approverId,
    };
    setBusy(true);
    try {
      let recordId = id ?? '';
      if (id) await updateRecord(id, draft);
      else recordId = await insertRecord(draft);
      if (files.length && can('insp_manage_files')) {
        // Sequential on purpose: keeps storage objects and insp_files rows in step.
        for (const file of files) await uploadFile(recordId, f.folder, file, null);
      }
      navigate('/inspection/records');
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const field = (
    label: string, key: keyof Fields, control: ReactNode, required = false,
  ) => (
    <div className="insp-field" key={key}>
      <label htmlFor={`fld-${key}`}>{label}{required && <span className="req"> *</span>}</label>
      {control}
      {errors[key] && <span className="err">{errors[key]}</span>}
    </div>
  );

  const text = (key: keyof Fields, extra: Record<string, unknown> = {}) => (
    <input id={`fld-${key}`} className="insp-input" value={String(f[key])}
      onChange={(e) => set(key)(e.target.value as Fields[typeof key])} {...extra} />
  );

  // The reference uses a searchable combobox for every picker on this form.
  const select = (key: keyof Fields, placeholder: string, options: ComboOption[]) => (
    <Combobox
      id={`fld-${key}`} value={String(f[key])} placeholder={placeholder} options={options}
      onChange={(v) => set(key)(v as Fields[typeof key])}
    />
  );

  return (
    <>
      <PageHeader
        title={id ? 'Edit record' : 'New record'}
        subtitle="Fill in the equipment, schedule and approver details, then save."
        actions={<button type="button" className="insp-btn"
          onClick={() => navigate('/inspection/records')}>Back</button>}
      />

      {notice && (
        <div className="insp-card" style={{ marginBottom: 12, fontSize: 12.5 }} role="alert">{notice}</div>
      )}

      <div className="insp-card">
        <div className="insp-form-grid">
          {field('Serial Number', 'serialNumber', text('serialNumber'), true)}
          {field('Part Number', 'partNumber', text('partNumber'))}
          {field('OEM', 'oem', text('oem'))}
          {field('Inspection Company', 'inspectionCompany', text('inspectionCompany'), true)}
          {field('Unit', 'unitId', select('unitId', 'Select unit…',
            units.map((u) => ({ value: u.id, label: u.name }))), true)}
          {field('Company', 'companyId', select('companyId', 'Select company…',
            companies.map((c) => ({ value: c.id, label: c.name }))), true)}
          {field('Equipment', 'typeId', (
            <Combobox
              id="fld-typeId" value={f.typeId} placeholder="Select equipment…"
              options={types.map((t) => ({ value: t.id, label: t.name }))}
              onChange={(v) => {
                setF((s) => ({ ...s, typeId: v, partId: '', componentId: '' }));
                setSpecs({});
              }}
            />
          ), true)}
          {field('Equipment Part', 'partId', (
            <Combobox
              id="fld-partId" value={f.partId} placeholder="Select equipment part…"
              options={typeParts.map((p) => ({ value: p.id, label: p.name }))}
              onChange={(v) => setF((s) => ({ ...s, partId: v, componentId: '' }))}
            />
          ), true)}
          {field('Component', 'componentId', select('componentId', 'Select component…',
            partComponents.map((c) => ({ value: c.id, label: c.name }))))}
          {field('Component Description', 'componentDescription', text('componentDescription'))}
          {field('Manufacture Year', 'manufactureYear',
            text('manufactureYear', { type: 'number', min: 1950, max: 2100 }))}
          {field('Status', 'workingStatus', (
            <Combobox
              id="fld-workingStatus" value={f.workingStatus} placeholder="Select status…"
              options={Object.entries(WORKING_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
              onChange={(v) => set('workingStatus')(v as WorkingStatus)}
            />
          ))}
          {field('Major Date', 'majorDate', text('majorDate', { type: 'date' }))}
          {field('Major Frequency', 'majorFreq', select('majorFreq', 'Frequency…',
            MAJOR_FREQUENCIES.map((m) => ({ value: String(m), label: frequencyLabel(m) }))))}
          <div className="insp-field">
            <label htmlFor="fld-majorDue">Major Due (auto)</label>
            <input id="fld-majorDue" className="insp-input" readOnly value={majorDue ?? ''} />
          </div>
          {field('Intermediate Date', 'intermediateDate', text('intermediateDate', { type: 'date' }))}
          {field('Intermediate Frequency', 'intermediateFreq', select('intermediateFreq', 'Frequency…',
            INTERMEDIATE_FREQUENCIES.map((m) => ({ value: String(m), label: frequencyLabel(m) }))))}
          <div className="insp-field">
            <label htmlFor="fld-interDue">Intermediate Due (auto)</label>
            <input id="fld-interDue" className="insp-input" readOnly value={interDue ?? ''} />
          </div>
          {can('insp_manage_files') && (
            <>
              {field('Folder', 'folder', (
                <Combobox
                  id="fld-folder" value={f.folder} placeholder="Select folder…"
                  options={Object.entries(FILE_KIND_LABELS).map(([v, l]) => ({ value: v, label: l }))}
                  onChange={(v) => set('folder')(v as FileKind)}
                />
              ))}
              <div className="insp-field">
                <label htmlFor="fld-docs">Documents</label>
                <input id="fld-docs" className="insp-input" type="file" multiple
                  onChange={(e) => setFiles([...(e.target.files ?? [])])} />
                <span style={{ fontSize: 11.5, color: 'var(--i-muted)' }}>
                  {files.length ? `${files.length} file(s) selected` : 'Click to choose documents'}
                </span>
              </div>
            </>
          )}
          {field('Send to approver', 'approverId', select('approverId', 'Select an approver…',
            approvers.map((a) => ({ value: a.id, label: a.name }))), true)}
          {(type?.specFields ?? []).map((name) => (
            <div className="insp-field" key={name}>
              <label htmlFor={`spec-${name}`}>{name}</label>
              <input id={`spec-${name}`} className="insp-input" value={specs[name] ?? ''}
                onChange={(e) => setSpecs((s) => ({ ...s, [name]: e.target.value }))} />
            </div>
          ))}
          <div className="insp-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="fld-remarks">Remarks</label>
            <textarea id="fld-remarks" className="insp-input" rows={2} value={remarks}
              onChange={(e) => setRemarks(e.target.value)} />
          </div>
        </div>

        <div className="insp-toolbar" style={{ marginTop: 16, marginBottom: 0 }}>
          <div className="grow">
            <button type="button" className="insp-btn"
              onClick={() => navigate('/inspection/records')}>Cancel</button>
            <button type="button" className="insp-btn primary" disabled={busy} onClick={save}>
              Save record
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
