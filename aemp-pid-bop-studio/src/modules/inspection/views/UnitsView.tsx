// ============================================================================
//  Units — replicates the reference `/units` list
//  (columns: Name, Company, Description). Company and the client description
//  live on the shared units register since migration 0040.
// ============================================================================
import { useMemo } from 'react';
import DataTable from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { PageHeader } from '../components/ui';
import { useInspection } from '../state/InspectionContext';

interface Row { id: string; name: string; company: string; description: string }

export default function UnitsView() {
  const { units, companies, loading } = useInspection();

  const rows = useMemo<Row[]>(() => {
    const companyName = new Map(companies.map((c) => [c.id, c.name]));
    return units.map((u) => ({
      id: u.id, name: u.name,
      company: (u.companyId && companyName.get(u.companyId)) || '',
      description: u.description ?? '',
    }));
  }, [units, companies]);

  const columns: Column<Row>[] = [
    { key: 'name', header: 'Name', value: (r) => r.name },
    { key: 'company', header: 'Company', value: (r) => r.company },
    { key: 'description', header: 'Description', value: (r) => r.description || '—' },
  ];

  return (
    <>
      <PageHeader title="Units" subtitle="Manage the units (rigs) that belong to each company." />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        loading={loading}
        searchPlaceholder="Search units…"
        emptyTitle="No units"
        emptyDesc="No units have been registered yet."
      />
    </>
  );
}
