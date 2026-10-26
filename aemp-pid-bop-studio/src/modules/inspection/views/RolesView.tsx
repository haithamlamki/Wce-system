// ============================================================================
//  Roles list (reference `/roles`): each role, how many permissions it holds
//  and how many users carry it. System roles cannot be deleted.
// ============================================================================
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DataTable from '../components/DataTable';
import type { Column } from '../components/DataTable';
import Icon from '../components/Icon';
import { Badge, EmptyState, PageHeader } from '../components/ui';
import { useInspection } from '../state/InspectionContext';
import { deleteRole, fetchRoles, type InspRole } from '../lib/accessApi';

export default function RolesView() {
  const { can } = useInspection();
  const navigate = useNavigate();
  const [rows, setRows] = useState<InspRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetchRoles().then((r) => { setRows(r); setError(null); })
      .catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  if (!can('role:view')) return <EmptyState ico="⚿" title="No Access" desc="You need the role:view permission." />;

  const remove = async (r: InspRole) => {
    if (!window.confirm(`Delete role "${r.name}"? ${r.userCount} user(s) will lose its permissions.`)) return;
    try { await deleteRole(r.id); load(); } catch (e) { setError((e as Error).message); }
  };

  const columns: Column<InspRole>[] = [
    { key: 'name', field: 'name', header: 'Name', sortable: true, value: (r) => r.name,
      render: (r) => <>{r.name} {r.isSystemRole && <Badge tone="info">System</Badge>}</> },
    { key: 'description', header: 'Description', value: (r) => r.description },
    { key: 'perms', header: 'Permissions', align: 'right', sortable: true, value: (r) => r.permissions.length },
    { key: 'users', header: 'Users', align: 'right', sortable: true, value: (r) => r.userCount },
    { key: 'actions', header: '', align: 'right', render: (r) => (
      <span style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
        <button type="button" className="insp-iconbtn" title="View role"
          onClick={() => navigate(`/inspection/roles/${r.id}`)}><Icon name="documents" /></button>
        {can('role:update') && <button type="button" className="insp-iconbtn" title="Edit role"
          onClick={() => navigate(`/inspection/roles/${r.id}/edit`)}><Icon name="edit" /></button>}
        {can('role:delete') && !r.isSystemRole && <button type="button" className="insp-iconbtn danger" title="Delete role"
          onClick={() => remove(r)}><Icon name="delete" /></button>}
      </span>
    ) },
  ];

  return (
    <>
      <PageHeader title="Roles" subtitle="Named sets of permissions. Users get their permissions from the roles they hold."
        actions={can('role:create') && (
          <button type="button" className="insp-btn primary" onClick={() => navigate('/inspection/roles/new')}>
            <Icon name="plus" /> New role</button>
        )} />
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} loading={loading} error={error}
        searchPlaceholder="Search roles…" emptyTitle="No roles found." initialPageSize={25} />
    </>
  );
}
