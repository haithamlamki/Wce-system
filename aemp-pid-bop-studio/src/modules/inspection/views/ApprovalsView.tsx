// ============================================================================
//  Approvals — replicates the reference `/inspection/approvals` page (columns
//  Serial, Equipment, Part, Rig, Requested by, When, Status plus the
//  "Run due-date notifications now" action).
//
//  Business rule preserved from the previous implementation: a non-privileged
//  approver only sees records that named them as approver. The DB RPC
//  (insp_set_approval, guarded by insp_approve) remains the real authorization
//  boundary — the checks below only drive the UI.
// ============================================================================
import { useMemo, useState } from 'react';
import { useAuth } from '../../../state/AuthContext';
import { useInspection } from '../state/InspectionContext';
import { sameQuery, setApproval } from '../lib/records';
import { useRecordList } from '../state/useRecordList';
import type { ListQuery } from '../lib/records';
import { listExpiringFiles } from '../lib/files';
import { buildAlerts } from '../lib/compliance';
import { isPrivileged } from '../lib/permissions';
import { formatDate } from '../lib/format';
import DataTable from '../components/DataTable';
import type { Column } from '../components/DataTable';
import LogsDrawer from '../components/LogsDrawer';
import { Badge, EmptyState, PageHeader } from '../components/ui';
import { APPROVE_STATUS_LABELS } from '../types';
import type { InspectionRecord } from '../types';

export default function ApprovalsView() {
  const { session, role } = useAuth();
  const { can, approvers } = useInspection();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [logsFor, setLogsFor] = useState<InspectionRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // The queue is filtered BY THE DATABASE: approve_status and, for
  // non-privileged approvers, the approver scoping too. The page never sees
  // records outside its queue, so nothing is filtered in JavaScript.
  // Seeded with the shape the table emits once its controls settle (see
  // RecordsView) so the queue loads with one query rather than three.
  const [query, setQuery] = useState<ListQuery>(
    { page: 1, perPage: 10, search: '', sortBy: undefined, sortAsc: undefined, columnFilters: {} },
  );

  // The approver scoping is part of the query, so it is also part of the count
  // cache key — a privileged and a non-privileged user can never share a total.
  const scoped = useMemo(
    (): ListQuery => ({
      ...query,
      approveStatus: 'pending_approval',
      approverId: isPrivileged(role) ? undefined : session?.user.id,
    }),
    [query, role, session],
  );

  const {
    rows, total, loading, error: err, refresh: reload,
  } = useRecordList(scoped, session?.user.id ?? '');

  const pending = rows;

  // Creator ids are uuids; resolve to a name only when the person also appears
  // in the approver directory, otherwise show an em dash rather than guessing.
  const nameById = useMemo(
    () => new Map(approvers.map((a) => [a.id, a.name])),
    [approvers],
  );

  const act = async (ids: string[], approve: boolean) => {
    if (ids.length === 0) return;
    const reason = approve ? undefined : (window.prompt('Reject reason (optional)') ?? undefined);
    setBusy(true);
    try {
      const n = await setApproval(ids, approve, reason);
      setNotice(`${approve ? 'Approved' : 'Rejected'} ${n} record${n === 1 ? '' : 's'}.`);
      setSelected(new Set());
      reload();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runNotifications = async () => {
    setBusy(true);
    try {
      const files = await listExpiringFiles();
      const alerts = buildAlerts(rows, files, new Date().toISOString().slice(0, 10));
      setNotice(`${alerts.length} due-date alert${alerts.length === 1 ? '' : 's'} generated.`);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!can('insp_approve')) {
    return (
      <>
        <PageHeader title="Approvals" subtitle="Inspection records waiting for your approval." />
        <EmptyState ico="⚿" title="Approval permission required"
          desc="Ask your administrator for the insp_approve permission." />
      </>
    );
  }

  const columns: Column<InspectionRecord>[] = [
    { key: 'serial', field: 'serial_number', header: 'Serial', value: (r) => r.serialNumber },
    { key: 'equipment', field: 'type_name', header: 'Equipment', value: (r) => r.typeName },
    { key: 'part', field: 'part_name', header: 'Part', value: (r) => r.partName },
    { key: 'rig', field: 'unit_name', header: 'Rig', value: (r) => r.unitName },
    {
      key: 'requestedBy', field: 'created_by',
      header: 'Requested by',
      value: (r) => (r.createdBy ? nameById.get(r.createdBy) ?? null : null),
    },
    {
      key: 'when', field: 'created_at',
      header: 'When',
      value: (r) => r.createdAt ?? null,
      render: (r) => formatDate(r.createdAt),
    },
    {
      key: 'status', field: 'approve_status',
      header: 'Status',
      value: (r) => APPROVE_STATUS_LABELS[r.approveStatus],
      render: (r) => <Badge tone="info">{APPROVE_STATUS_LABELS[r.approveStatus]}</Badge>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Approvals"
        subtitle="Inspection records waiting for your approval."
        actions={(
          <button type="button" className="insp-btn" disabled={busy} onClick={runNotifications}>
            Run due-date notifications now
          </button>
        )}
      />

      {notice && (
        <div className="insp-card" style={{ marginBottom: 12, fontSize: 12.5 }} role="status">
          {notice}
        </div>
      )}

      <DataTable
        rows={pending}
        columns={columns}
        rowKey={(r) => r.id}
        server={{
          total,
          page: query.page,
          perPage: query.perPage,
          loading,
          onChange: (n) => setQuery((q) => {
            const next = {
              ...q,
              page: n.page,
              perPage: n.perPage,
              search: n.search,
              sortBy: n.sortBy ?? undefined,
              // Only override the default ordering once a column is actually sorted.
              sortAsc: n.sortBy ? n.sortAsc : undefined,
              columnFilters: n.columnFilters,
            };
            return sameQuery(q, next) ? q : next;
          }),
        }}
        error={err}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        searchPlaceholder="Search serial, equipment, rig…"
        emptyTitle="Nothing waiting for approval"
        emptyDesc="No inspection records are pending your sign-off."
        aboveTable={selected.size > 0 ? (
          <div className="insp-toolbar">
            <span>{selected.size} selected</span>
            <div className="grow">
              <button type="button" className="insp-btn primary" disabled={busy}
                onClick={() => act([...selected], true)}>Approve selected</button>
              <button type="button" className="insp-btn danger" disabled={busy}
                onClick={() => act([...selected], false)}>Reject selected</button>
            </div>
          </div>
        ) : undefined}
        rowActions={(r) => (
          <button type="button" className="insp-btn sm" title="History"
            onClick={() => setLogsFor(r)}>🗒</button>
        )}
      />

      {logsFor && <LogsDrawer record={logsFor} onClose={() => setLogsFor(null)} />}
    </>
  );
}
