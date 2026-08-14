// ============================================================================
//  Units — replicates the reference `/units` list
//  (columns: Name, Company, Description).
// ============================================================================
import { useMemo } from 'react';
import DataTable from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { Badge, PageHeader } from '../components/ui';
import { useInspection } from '../state/InspectionContext';

interface Row { id: string; name: string; unitType: 'rig' | 'hoist' | 'other' }

const TYPE_LABELS: Record<Row['unitType'], string> = {
  rig: 'Rig', hoist: 'Hoist', other: 'Other',
};

export default function UnitsView() {
  const { units, loading } = useInspection();

  const rows = useMemo<Row[]>(
    () => units.map((u) => ({ id: u.id, name: u.name, unitType: u.unitType })),
    [units],
  );

  const columns: Column<Row>[] = [
    { key: 'name', header: 'Name', value: (r) => r.name },
    // `public.units` carries no company foreign key in the current schema, so
    // the company cell stays empty rather than guessing an owner.
    { key: 'company', header: 'Company', value: () => null, sortable: false },
    {
      key: 'description',
      header: 'Description',
      value: (r) => TYPE_LABELS[r.unitType],
      render: (r) => <Badge tone="neutral">{TYPE_LABELS[r.unitType]}</Badge>,
    },
  ];

  return (
    <>
      <PageHeader title="Units" subtitle="Rigs, hoists and other units in the fleet." />
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
