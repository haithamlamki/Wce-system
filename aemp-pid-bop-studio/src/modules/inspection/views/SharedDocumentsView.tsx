// ============================================================================
//  Shared Documents — replicates the reference `/inspection/shared-documents`
//  list (columns: Name, Rig, Files, Linked records, Description, Created by).
//
//  There is no backing table for document SETS in this database: 0031 created
//  `insp_files` (files attached to a single record) and the `inspection-library`
//  bucket, but nothing that groups files into a named, rig-scoped set linked to
//  many records. Implementing it for real needs a migration adding
//  `insp_document_sets` (id, name, unit_id, description, created_by, created_at)
//  plus a join table to insp_records. Until then this page renders its real
//  chrome over an empty result rather than fabricating rows.
// ============================================================================
import DataTable from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { PageHeader } from '../components/ui';

interface DocumentSet {
  id: string; name: string; rig: string; files: number;
  linkedRecords: number; description: string; createdBy: string;
}

export default function SharedDocumentsView() {
  const rows: DocumentSet[] = [];

  const columns: Column<DocumentSet>[] = [
    { key: 'name', header: 'Name', value: (r) => r.name },
    { key: 'rig', header: 'Rig', value: (r) => r.rig },
    { key: 'files', header: 'Files', align: 'right', value: (r) => r.files },
    { key: 'linked', header: 'Linked records', align: 'right', value: (r) => r.linkedRecords },
    { key: 'description', header: 'Description', value: (r) => r.description },
    { key: 'createdBy', header: 'Created by', value: (r) => r.createdBy },
  ];

  return (
    <>
      <PageHeader
        title="Shared Documents"
        subtitle="Document sets shared across inspection records."
      />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        searchPlaceholder="Search document sets..."
        emptyTitle="No document sets yet"
        emptyDesc="Shared document sets are not available in this workspace. Files attached to individual inspection records are managed from the record's documents drawer."
      />
    </>
  );
}
