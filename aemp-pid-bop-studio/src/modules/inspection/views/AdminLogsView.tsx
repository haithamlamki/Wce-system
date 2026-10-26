// ============================================================================
//  Audit Logs (reference `/admin/audit-logs`) and App Logs (`/admin/logs`):
//  newest first, searched / filtered / paged on the server. A row's details
//  show the column diff (audit) or the exception text (app).
// ============================================================================
import { useCallback, useEffect, useState } from 'react';
import DataTable from '../components/DataTable';
import type { Column, FilterDef, ServerMode } from '../components/DataTable';
import Icon from '../components/Icon';
import { Badge, EmptyState, PageHeader, type BadgeTone } from '../components/ui';
import { useInspection } from '../state/InspectionContext';
import { fetchAppLogs, fetchAuditEvents, type AppLog, type AuditEvent, type LogQuery } from '../lib/accessApi';

const ENTITY_TYPES = ['CalibrationRecord', 'CalibrationRegister', 'Company', 'Equipment', 'EquipmentPart',
  'EquipmentPartComponent', 'EquipmentSpecification', 'InspectionRecord', 'Role', 'RolePermission', 'ScopeItem',
  'ScopeTemplate', 'Specification', 'Unit', 'User', 'UserRole', 'UserScopeTemplate', 'VendorCompany'];
const ACTION_TONE: Record<string, BadgeTone> = { Create: 'success', Update: 'info', Delete: 'danger' };
const LEVEL_TONE: Record<string, BadgeTone> = { Information: 'info', Warning: 'warning', Error: 'danger' };

const when = (iso: string) => new Date(iso).toLocaleString();

export default function AdminLogsView({ kind }: { kind: 'audit' | 'app' }) {
  const { can } = useInspection();
  const audit = kind === 'audit';
  const [query, setQuery] = useState<LogQuery>({ q: '', filter: '', page: 1, perPage: 25 });
  const [rows, setRows] = useState<(AuditEvent | AppLog)[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<AuditEvent | AppLog | null>(null);

  const load = useCallback(async (q: LogQuery) => {
    setLoading(true);
    try {
      const r = audit ? await fetchAuditEvents(q) : await fetchAppLogs(q);
      setRows(r.rows); setTotal(r.total); setError(null);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [audit]);
  useEffect(() => { void load(query); }, [load, query]);

  if (!can(audit ? 'audit:view' : 'log:view')) {
    return <EmptyState ico="⚿" title="No Access" desc={`You need the ${audit ? 'audit:view' : 'log:view'} permission.`} />;
  }

  const server: ServerMode = {
    total, page: query.page, perPage: query.perPage, loading,
    onChange: (n) => {
      const q = (n.search || '').trim();
      const next = { ...query, q, page: q !== query.q ? 1 : n.page, perPage: n.perPage };
      if (JSON.stringify(next) !== JSON.stringify(query)) setQuery(next);
    },
  };
  const filters: FilterDef[] = [{
    key: 'filter', label: audit ? 'Entity type' : 'Level', value: query.filter,
    options: [{ value: '', label: 'All' }, ...(audit ? ENTITY_TYPES : ['Information', 'Warning', 'Error'])
      .map((v) => ({ value: v, label: v }))],
    onChange: (v) => setQuery({ ...query, filter: v, page: 1 }),
  }];
  const details: Column<AuditEvent | AppLog> = { key: 'details', header: '', align: 'right', render: (r) => (
    <button type="button" className="insp-iconbtn" title="Details" onClick={() => setOpen(r)}><Icon name="documents" /></button>
  ) };

  const auditCols: Column<AuditEvent>[] = [
    { key: 'when', header: 'Timestamp', value: (r) => r.createdAt, render: (r) => when(r.createdAt) },
    { key: 'user', header: 'User', value: (r) => r.userName },
    { key: 'action', header: 'Action', value: (r) => r.action,
      render: (r) => <Badge tone={ACTION_TONE[r.action] ?? 'neutral'}>{r.action}</Badge> },
    { key: 'entity', header: 'Entity', value: (r) => r.entityType },
    { key: 'label', header: 'Label', value: (r) => r.entityLabel ?? r.entityId },
    { key: 'changes', header: 'Changes', align: 'right', value: (r) => r.changes?.length ?? 0 },
  ];
  const appCols: Column<AppLog>[] = [
    { key: 'when', header: 'Timestamp', value: (r) => r.createdAt, render: (r) => when(r.createdAt) },
    { key: 'level', header: 'Level', value: (r) => r.level,
      render: (r) => <Badge tone={LEVEL_TONE[r.level] ?? 'neutral'}>{r.level}</Badge> },
    { key: 'source', header: 'Source', value: (r) => r.source ?? '—' },
    { key: 'message', header: 'Message', value: (r) => r.message },
  ];
  const columns = [...(audit ? auditCols : appCols) as Column<AuditEvent | AppLog>[], details];

  return (
    <>
      <PageHeader title={audit ? 'Audit Logs' : 'App Logs'}
        subtitle={audit ? 'Who created, changed or deleted what, and when.' : 'Application warnings and errors.'} />
      {open && (
        <div className="insp-card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>{'action' in open ? `${open.action} ${open.entityType} — ${open.entityLabel ?? open.entityId}`
              : `${open.level} — ${open.source ?? ''}`}</h3>
            <button type="button" className="insp-btn" onClick={() => setOpen(null)}>Close</button>
          </div>
          <p style={{ color: 'var(--i-muted)', fontSize: 12.5 }}>{when(open.createdAt)}{'userName' in open && ` · ${open.userName}`}</p>
          {'action' in open ? (open.changes?.length ? (
            <table className="insp-table">
              <thead><tr><th>Column</th><th>Old value</th><th>New value</th></tr></thead>
              <tbody>{open.changes.map((c) => (
                <tr key={c.column}><td>{c.column}</td><td>{c.oldValue ?? '—'}</td><td>{c.newValue ?? '—'}</td></tr>
              ))}</tbody>
            </table>
          ) : <p>No column changes recorded.</p>) : (
            <>
              <p>{open.message}</p>
              {open.exception && <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11.5, maxHeight: 360, overflow: 'auto' }}>{open.exception}</pre>}
            </>
          )}
        </div>
      )}
      <DataTable rows={rows} columns={columns} rowKey={(r) => String(r.id)} server={server} loading={loading} error={error}
        filters={filters} searchPlaceholder={audit ? 'Search user, entity or label…' : 'Search message or source…'}
        emptyTitle="No log entries found." initialPageSize={25} />
    </>
  );
}
