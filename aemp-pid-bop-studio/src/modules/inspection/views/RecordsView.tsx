// ============================================================================
//  Equipment Inspection — replicates the reference `/inspection` page: category
//  chips, Rig/Equipment/Part filter selects, and a grouped-header table
//  (Equipment · Inspection Schedule · Approval Workflow · Additional).
//  See docs/inspection-reference-parity.md §6.
//
//  Bulk date updates and approvals go through the SECURITY DEFINER RPCs; the
//  permission checks here only drive the UI, the DB remains the boundary.
// ============================================================================
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInspection } from '../state/InspectionContext';
import { bulkUpdateDates, deleteRecord, fetchRecords, sameQuery } from '../lib/records';
import { useRecordList } from '../state/useRecordList';
import { useAuth } from '../../../state/AuthContext';
import type { ListQuery } from '../lib/records';
import { complianceStatus } from '../lib/compliance';
import { downloadCsv, recordsToCsv } from '../lib/exportCsv';
import { formatDate } from '../lib/format';
import DataTable from '../components/DataTable';
import type { Column } from '../components/DataTable';
import FilesDrawer from '../components/FilesDrawer';
import LogsDrawer from '../components/LogsDrawer';
import Icon from '../components/Icon';
import Combobox from '../components/Combobox';
import { Badge, PageHeader } from '../components/ui';
import {
  APPROVE_STATUS_LABELS, CATEGORY_LABELS, CATEGORY_ORDER, WORKING_STATUS_LABELS,
  frequencyLabel,
} from '../types';
import type { InspCategory, InspectionRecord } from '../types';

/** Reference orders the category chips alphabetically after "All". */
const CHIP_ORDER: InspCategory[] = [...CATEGORY_ORDER]
  .sort((a, b) => CATEGORY_LABELS[a].localeCompare(CATEGORY_LABELS[b]));

function DueCell({ due, today }: { due: string | null; today: string }) {
  if (!due) return <>—</>;
  const status = complianceStatus(due, today);
  if (status === 'overdue') return <Badge tone="danger">{`» ${formatDate(due)}`}</Badge>;
  if (status === 'due_soon') return <Badge tone="warning">{formatDate(due)}</Badge>;
  return <>{formatDate(due)}</>;
}

export default function RecordsView() {
  const { can, types, parts, units, approvers } = useInspection();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [category, setCategory] = useState<InspCategory | ''>('');
  const [unitId, setUnitId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [partId, setPartId] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [bulkMajor, setBulkMajor] = useState('');
  const [bulkInter, setBulkInter] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [filesFor, setFilesFor] = useState<InspectionRecord | null>(null);
  const [logsFor, setLogsFor] = useState<InspectionRecord | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  // Pagination, search, sorting, filtering and the total count are all done by
  // the database; only the visible page is transferred.
  // Seeded with the exact shape the table emits once its controls settle, so
  // the first emission compares equal and the page loads with ONE query instead
  // of refetching as each empty control reports itself.
  const [table, setTable] = useState<Omit<ListQuery, 'category' | 'unitId' | 'typeId' | 'partId'>>(
    { page: 1, perPage: 10, search: '', sortBy: undefined, sortAsc: undefined, columnFilters: {} },
  );
  // Narrowing the result set invalidates the current page cursor: page 3 of the
  // unfiltered list is past the end of a filter that returns a single page, so
  // the table would come back empty. Every filter control resets to page 1
  // first; React batches both updates into one render, so one query is sent.
  const toPage1 = useCallback(
    () => setTable((t) => (t.page === 1 ? t : { ...t, page: 1 })),
    [],
  );

  // Memoized because it is the list hook's effect dependency: a fresh object on
  // every render would refetch on every render.
  const query = useMemo(
    (): ListQuery => ({
      ...table,
      category: category || undefined,
      unitId: unitId || undefined,
      typeId: typeId || undefined,
      partId: partId || undefined,
    }),
    [table, category, unitId, typeId, partId],
  );

  const {
    rows, total, loading, error: err, refresh: reload,
  } = useRecordList(query, session?.user.id ?? '');

  // Only ids present in the approver directory resolve to a name; others stay
  // blank rather than showing a raw uuid.
  const approverNames = useMemo(
    () => new Map(approvers.map((a) => [a.id, a.name])),
    [approvers],
  );

  const catTypes = useMemo(
    () => (category ? types.filter((t) => t.category === category) : types),
    [types, category],
  );
  const typeParts = useMemo(
    () => (typeId ? parts.filter((p) => p.typeId === typeId) : []),
    [parts, typeId],
  );

  // Export is the one place a FULL dataset fetch is still correct — it is an
  // explicit user action, not a page load.
  const exportAll = async () => {
    setBusy(true);
    try {
      const all = await fetchRecords({
        category: category || undefined,
        typeId: typeId || undefined,
        unitId: unitId || undefined,
      });
      downloadCsv(recordsToCsv(all), "inspection-records.csv");
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const applyBulkDates = async () => {
    if (!bulkMajor && !bulkInter) {
      setNotice('Pick a major and/or intermediate date.');
      return;
    }
    setBusy(true);
    try {
      const n = await bulkUpdateDates([...selected], bulkMajor || null, bulkInter || null);
      setNotice(`Updated ${n} record${n === 1 ? '' : 's'}.`);
      setSelected(new Set());
      setBulkMajor(''); setBulkInter('');
      reload();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async (r: InspectionRecord) => {
    const label = r.serialNumber || r.typeName;
    if (!window.confirm(`Delete the record for "${label}" on ${r.unitName}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await deleteRecord(r.id);
      reload();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Column set and default visibility mirror the reference's Columns menu:
  // Unit and Remarks are pinned; the optional columns below are offered but off
  // by default, grouped under the same bands the reference uses.
  // The catalog carries the same specification under two spellings that differ
  // only in the unit suffix ("Size (in)" vs "Size(in)"). The reference lists
  // each specification once under its base name, so aliases are merged for
  // display and the value is read from whichever spelling the record stored.
  // Verified against the catalog: stripping the trailing parenthetical merges
  // only these duplicates and never two genuinely different fields.
  const specColumns = useMemo(() => {
    const byBase = new Map<string, string[]>();
    for (const t of types) {
      for (const f of t.specFields) {
        const base = f.replace(/\([^)]*\)\s*$/, '').trim() || f;
        const aliases = byBase.get(base) ?? [];
        if (!aliases.includes(f)) aliases.push(f);
        byBase.set(base, aliases);
      }
    }
    return [...byBase.entries()]
      .map(([base, aliases]) => ({ base, aliases }))
      .sort((a, b) => a.base.localeCompare(b.base));
  }, [types]);

  const columns: Column<InspectionRecord>[] = [
    { key: 'unit', field: 'unit_name', header: 'Unit', group: 'Equipment', pinned: true, value: (r) => r.unitName },
    { key: 'company', field: 'company_name', header: 'Company', group: 'Equipment', value: (r) => r.companyName },
    { key: 'serial', field: 'serial_number', header: 'Serial', group: 'Equipment', value: (r) => r.serialNumber },
    { key: 'type', field: 'type_name', header: 'Equipment', group: 'Equipment', value: (r) => r.typeName },
    { key: 'part', field: 'part_name', header: 'Part', group: 'Equipment', value: (r) => r.partName },
    { key: 'component', field: 'component_name', header: 'Component', group: 'Equipment', value: (r) => r.componentName },
    {
      key: 'status', field: 'working_status',
      header: 'Status',
      group: 'Equipment',
      value: (r) => WORKING_STATUS_LABELS[r.workingStatus],
      render: (r) => (
        <Badge tone={r.workingStatus === 'in_use' ? 'success' : 'neutral'}>
          {WORKING_STATUS_LABELS[r.workingStatus]}
        </Badge>
      ),
    },
    { key: 'category', field: 'category', header: 'Category', group: 'Equipment', defaultHidden: true, value: (r) => CATEGORY_LABELS[r.category] },
    { key: 'componentDescription', header: 'Component Description', group: 'Equipment', defaultHidden: true, value: (r) => r.componentDescription },
    { key: 'partNumber', field: 'part_number', header: 'Part Number', group: 'Equipment', defaultHidden: true, value: (r) => r.partNumber },
    { key: 'oem', field: 'oem', header: 'OEM', group: 'Equipment', defaultHidden: true, value: (r) => r.oem },
    { key: 'manufactureYear', field: 'manufacture_year', header: 'Manufacture Year', group: 'Equipment', defaultHidden: true, align: 'right', value: (r) => r.manufactureYear },
    { key: 'inspectionCompany', field: 'inspection_company', header: 'Inspection Company', group: 'Equipment', defaultHidden: true, value: (r) => r.inspectionCompany },
    {
      key: 'interDue', field: 'intermediate_due_date',
      header: 'Intermediate Due',
      group: 'Inspection Schedule',
      pinned: true,
      filterPlaceholder: 'Filter Intermediate Due',
      value: (r) => r.intermediateDueDate,
      render: (r) => <DueCell due={r.intermediateDueDate} today={today} />,
    },
    {
      key: 'majorDue', field: 'major_due_date',
      header: 'Major Due',
      group: 'Inspection Schedule',
      filterPlaceholder: 'Filter Major Due',
      value: (r) => r.majorDueDate,
      render: (r) => <DueCell due={r.majorDueDate} today={today} />,
    },
    { key: 'interDate', field: 'intermediate_date', header: 'Intermediate Date', group: 'Inspection Schedule', defaultHidden: true, value: (r) => r.intermediateDate, render: (r) => formatDate(r.intermediateDate) },
    { key: 'interFreq', field: 'intermediate_freq_months', header: 'Intermediate Frequency', group: 'Inspection Schedule', defaultHidden: true, value: (r) => (r.intermediateFreqMonths ? frequencyLabel(r.intermediateFreqMonths) : null) },
    { key: 'majorDate', field: 'major_date', header: 'Major Date', group: 'Inspection Schedule', defaultHidden: true, value: (r) => r.majorDate, render: (r) => formatDate(r.majorDate) },
    { key: 'majorFreq', field: 'major_freq_months', header: 'Major Frequency', group: 'Inspection Schedule', defaultHidden: true, value: (r) => (r.majorFreqMonths ? frequencyLabel(r.majorFreqMonths) : null) },
    {
      key: 'approve', field: 'approve_status',
      header: 'Approve Status',
      group: 'Approval Workflow',
      pinned: true,
      value: (r) => APPROVE_STATUS_LABELS[r.approveStatus],
      render: (r) => (
        <Badge tone={r.approveStatus === 'approved' ? 'success'
          : r.approveStatus === 'rejected' ? 'danger' : 'info'}>
          {APPROVE_STATUS_LABELS[r.approveStatus]}
        </Badge>
      ),
    },
    {
      key: 'requestedBy', field: 'created_by', header: 'Approval Requested By', group: 'Approval Workflow',
      defaultHidden: true, value: (r) => (r.createdBy ? approverNames.get(r.createdBy) ?? null : null),
    },
    {
      key: 'requestedDate', field: 'created_at', header: 'Approval Requested Date', group: 'Approval Workflow',
      defaultHidden: true, value: (r) => r.createdAt ?? null, render: (r) => formatDate(r.createdAt),
    },
    {
      key: 'requestedFor', field: 'approver_id', header: 'Approval Requested For', group: 'Approval Workflow',
      defaultHidden: true, value: (r) => (r.approverId ? approverNames.get(r.approverId) ?? null : null),
    },
    {
      key: 'approvedBy', field: 'approved_by', header: 'Approved By', group: 'Approval Workflow',
      defaultHidden: true, value: (r) => (r.approvedBy ? approverNames.get(r.approvedBy) ?? null : null),
    },
    {
      key: 'approvedDate', field: 'approved_at', header: 'Approved Date', group: 'Approval Workflow',
      defaultHidden: true, value: (r) => r.approvedAt ?? null, render: (r) => formatDate(r.approvedAt),
    },
    { key: 'remarks', field: 'remarks', header: 'Remarks', group: 'Additional', pinned: true, filterable: false, value: (r) => r.remarks },
    ...specColumns.map(({ base, aliases }): Column<InspectionRecord> => ({
      key: `spec:${base}`,
      header: base,
      group: 'Specifications',
      defaultHidden: true,
      value: (r) => {
        for (const a of aliases) {
          const v = r.specs?.[a];
          if (v) return v;
        }
        return null;
      },
    })),
  ];

  return (
    <>
      <PageHeader
        title="Equipment Inspection"
        subtitle="Browse and search inspection records by rig, equipment and category."
        actions={(
          <>
            {can('insp_export') && (
              <button type="button" className="insp-btn"
                onClick={exportAll} disabled={busy}>
                <Icon name="export" /> Export
              </button>
            )}
            {can('insp_upload') && (
              <button type="button" className="insp-btn"
                onClick={() => navigate('/inspection/records/upload')}>
                <Icon name="upload" /> Upload
              </button>
            )}
            {can('insp_data_entry') && (
              <button type="button" className="insp-btn primary"
                onClick={() => navigate('/inspection/records/new')}>
                <Icon name="plus" /> New record
              </button>
            )}
          </>
        )}
      />

      <div className="insp-chips">
        <button type="button" className={`insp-chip${category === '' ? ' active' : ''}`}
          onClick={() => { toPage1(); setCategory(''); setTypeId(''); setPartId(''); }}>All</button>
        {CHIP_ORDER.map((c) => (
          <button key={c} type="button" className={`insp-chip${category === c ? ' active' : ''}`}
            onClick={() => { toPage1(); setCategory(c); setTypeId(''); setPartId(''); }}>
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      <div className="insp-filterrow">
        <div className="fld">
          <span id="flt-rig-lbl">Rig</span>
          <Combobox
            value={unitId} block={false}
            onChange={(v) => { toPage1(); setUnitId(v); }}
            placeholder="All rigs"
            options={[{ value: '', label: 'All rigs' },
              ...units.map((u) => ({ value: u.id, label: u.name }))]}
          />
        </div>
        <div className="fld">
          <span>Equipment</span>
          <Combobox
            value={typeId} block={false}
            onChange={(v) => { toPage1(); setTypeId(v); setPartId(''); }}
            placeholder="All equipment"
            options={[{ value: '', label: 'All equipment' },
              ...catTypes.map((t) => ({ value: t.id, label: t.name }))]}
          />
        </div>
        <div className="fld">
          <span>Part</span>
          <Combobox
            value={partId} disabled={!typeId} block={false}
            onChange={(v) => { toPage1(); setPartId(v); }}
            placeholder="All parts"
            options={[{ value: '', label: 'All parts' },
              ...typeParts.map((p) => ({ value: p.id, label: p.name }))]}
          />
        </div>
      </div>

      {notice && (
        <div className="insp-card" style={{ marginBottom: 12, fontSize: 12.5 }} role="status">
          {notice}
        </div>
      )}

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        server={{
          total,
          page: table.page,
          perPage: table.perPage,
          loading,
          onChange: (n) => setTable((t) => {
            const next = {
              ...t,
              page: n.page,
              perPage: n.perPage,
              search: n.search,
              sortBy: n.sortBy ?? undefined,
              // Only override the default ordering once a column is actually sorted.
              sortAsc: n.sortBy ? n.sortAsc : undefined,
              columnFilters: n.columnFilters,
            };
            return sameQuery(t, next) ? t : next;
          }),
        }}
        error={err}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        searchPlaceholder="Search serial, equipment, part…"
        emptyTitle="No inspection records"
        emptyDesc="No records match the current category, rig, equipment or search."
        aboveTable={selected.size > 0 && can('insp_data_entry') ? (
          <div className="insp-toolbar">
            <span>{selected.size} selected</span>
            <label className="fld" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11.5, color: 'var(--i-muted)' }}>Major</span>
              <input type="date" className="insp-input" value={bulkMajor}
                onChange={(e) => setBulkMajor(e.target.value)} aria-label="Bulk major inspection date" />
            </label>
            <label className="fld" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11.5, color: 'var(--i-muted)' }}>Intermediate</span>
              <input type="date" className="insp-input" value={bulkInter}
                onChange={(e) => setBulkInter(e.target.value)} aria-label="Bulk intermediate inspection date" />
            </label>
            <div className="grow">
              <button type="button" className="insp-btn primary" disabled={busy}
                onClick={applyBulkDates}>Update dates</button>
            </div>
          </div>
        ) : undefined}
        rowActions={(r) => (
          <>
            <button type="button" className="insp-iconbtn sm" title="Documents"
              aria-label="Documents" onClick={() => setFilesFor(r)}><Icon name="documents" /></button>
            <button type="button" className="insp-iconbtn sm" title="History"
              aria-label="History" onClick={() => setLogsFor(r)}><Icon name="history" /></button>
            {can('insp_data_entry') && (
              <button type="button" className="insp-iconbtn sm" title="Edit" aria-label="Edit"
                onClick={() => navigate(`/inspection/records/${r.id}/edit`)}><Icon name="edit" /></button>
            )}
            {can('insp_manage_catalog') && (
              <button type="button" className="insp-iconbtn sm danger" title="Delete"
                aria-label="Delete" disabled={busy}
                onClick={() => doDelete(r)}><Icon name="delete" /></button>
            )}
          </>
        )}
      />

      {filesFor && (
        <FilesDrawer record={filesFor} onClose={() => setFilesFor(null)} onRecordChanged={reload} />
      )}
      {logsFor && <LogsDrawer record={logsFor} onClose={() => setLogsFor(null)} />}
    </>
  );
}
