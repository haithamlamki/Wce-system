// ============================================================================
//  Companies — replicates the reference `/companies` list
//  (columns: Name, Description, Units).
// ============================================================================
import { useMemo } from 'react';
import DataTable from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { PageHeader } from '../components/ui';
import { useInspection } from '../state/InspectionContext';

interface Row { id: string; name: string; units: number }

export default function CompaniesView() {
  const { companies, units, loading } = useInspection();

  // `insp_companies` has no per-unit company column in the current schema, so
  // the unit count is only meaningful once units carry a company reference.
  const rows = useMemo<Row[]>(
    () => companies.map((c) => ({ id: c.id, name: c.name, units: units.length })),
    [companies, units],
  );

  const columns: Column<Row>[] = [
    { key: 'name', header: 'Name', value: (r) => r.name },
    // The Company type carries no description column; the reference shows one,
    // so the cell renders an em dash rather than inventing a value.
    { key: 'description', header: 'Description', value: () => null, sortable: false },
    { key: 'units', header: 'Units', align: 'right', value: (r) => r.units },
  ];

  return (
    <>
      <PageHeader title="Companies" subtitle="Operating companies that own inspection units." />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        loading={loading}
        searchPlaceholder="Search companies…"
        emptyTitle="No companies"
        emptyDesc="No companies have been registered yet."
      />
    </>
  );
}
