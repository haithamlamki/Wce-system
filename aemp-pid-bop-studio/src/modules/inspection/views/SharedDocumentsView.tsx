// ============================================================================
//  Shared Documents — replicates the reference `/inspection/shared-documents`
//  list: document sets uploaded once against one or more rigs and linked to
//  many inspection records (columns Name, Rigs, Files, Linked records,
//  Description, Created by). Backed by migration 0048.
// ============================================================================
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DataTable from '../components/DataTable';
import type { Column } from '../components/DataTable';
import Icon from '../components/Icon';
import { Badge, EmptyState, PageHeader } from '../components/ui';
import { useInspection } from '../state/InspectionContext';
import { deleteDocumentSet, listDocumentSets, type DocumentSetRow } from '../lib/sharedDocuments';

export default function SharedDocumentsView() {
  const { can } = useInspection();
  const navigate = useNavigate();
  const [rows, setRows] = useState<DocumentSetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    listDocumentSets().then((r) => { setRows(r); setError(null); })
      .catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  if (!can('shared-document:view')) {
    return <EmptyState ico="⚿" title="No Access" desc="You need the shared-document:view permission." />;
  }

  const remove = async (r: DocumentSetRow) => {
    if (!window.confirm(`Delete document set?\n\n"${r.name}" and its files and links will be permanently removed.`)) return;
    try { await deleteDocumentSet(r.id); load(); } catch (e) { setError((e as Error).message); }
  };

  const columns: Column<DocumentSetRow>[] = [
    { key: 'name', field: 'name', header: 'Name', sortable: true, filterable: true,
      filterPlaceholder: 'Search name...', value: (r) => r.name },
    { key: 'rigName', field: 'rigName', header: 'Rigs', sortable: true, filterable: true,
      filterPlaceholder: 'Filter rigs...', value: (r) => r.rigName ?? '' },
    { key: 'documentCount', header: 'Files', sortable: true, value: (r) => r.documentCount,
      render: (r) => <Badge>{r.documentCount}</Badge> },
    { key: 'linkedRecordCount', header: 'Linked records', sortable: true, value: (r) => r.linkedRecordCount,
      render: (r) => <Badge>{r.linkedRecordCount}</Badge> },
    { key: 'description', header: 'Description', value: (r) => r.description ?? '',
      render: (r) => r.description ?? <span style={{ color: 'var(--i-muted)' }}>-</span> },
    { key: 'createdBy', header: 'Created by', value: (r) => r.createdBy ?? '-' },
    { key: 'actions', header: '', align: 'right', width: 90, render: (r) => (
      <span style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
        <button type="button" className="insp-iconbtn" title="Manage document set"
          onClick={() => navigate(`/inspection/shared-documents/${r.id}`)}><Icon name="edit" /></button>
        {can('shared-document:delete') && r.canManage && (
          <button type="button" className="insp-iconbtn danger" title="Delete document set"
            onClick={() => remove(r)}><Icon name="delete" /></button>
        )}
      </span>
    ) },
  ];

  return (
    <>
      <PageHeader title="Shared Documents"
        subtitle="Upload document sets once against a rig and link them to many inspection records."
        actions={can('shared-document:create') && (
          <button type="button" className="insp-btn primary" onClick={() => navigate('/inspection/shared-documents/new')}>
            <Icon name="plus" /> New document set</button>
        )} />
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} loading={loading} error={error}
        searchPlaceholder="Search document sets..." emptyTitle="No document sets found." initialPageSize={25} />
    </>
  );
}
