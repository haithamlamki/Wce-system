// ============================================================================
//  Permissions (reference `/permissions`): the fixed list of resource:action
//  keys and which roles hold each one. Read-only — keys are granted by
//  editing a role.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import DataTable from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { EmptyState, PageHeader } from '../components/ui';
import { useInspection } from '../state/InspectionContext';
import { fetchRoles, type InspRole } from '../lib/accessApi';
import { INSPECTION_PERMISSIONS } from '../lib/permissions';

interface Row { key: string; resource: string; action: string; roles: InspRole[] }

export default function PermissionsView() {
  const { canAny } = useInspection();
  const [roles, setRoles] = useState<InspRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRoles().then(setRoles).catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  const rows = useMemo<Row[]>(() => INSPECTION_PERMISSIONS.map((k) => {
    const [resource, action] = k.split(':');
    return { key: k, resource, action, roles: roles.filter((r) => r.permissions.includes(k)) };
  }), [roles]);

  if (!canAny('role:view', 'user:manage-access')) {
    return <EmptyState ico="⚿" title="No Access" desc="You need the role:view or user:manage-access permission." />;
  }

  const columns: Column<Row>[] = [
    { key: 'key', field: 'key', header: 'Permission', sortable: true, value: (r) => r.key, render: (r) => <code>{r.key}</code> },
    { key: 'resource', field: 'resource', header: 'Resource', sortable: true, value: (r) => r.resource },
    { key: 'action', field: 'action', header: 'Action', sortable: true, value: (r) => r.action },
    { key: 'roles', header: 'Roles', value: (r) => r.roles.map((x) => x.name).join(', '),
      render: (r) => (r.roles.length ? r.roles.map((x, i) => (
        <span key={x.id}>{i > 0 && ', '}<Link to={`/inspection/roles/${x.id}`}>{x.name}</Link></span>
      )) : <span style={{ color: 'var(--i-muted)' }}>—</span>) },
  ];

  return (
    <>
      <PageHeader title="Permissions" subtitle={`${INSPECTION_PERMISSIONS.length} permissions. Grant them by editing a role.`} />
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.key} loading={loading} error={error}
        searchPlaceholder="Search permissions…" emptyTitle="No permissions found." initialPageSize={100} />
    </>
  );
}
