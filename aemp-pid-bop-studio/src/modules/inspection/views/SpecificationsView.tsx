// ============================================================================
//  Specifications — replicates the reference `/specifications` list (columns:
//  Measurement, Units, Abbreviation, Equipment) with CSV export.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import DataTable from '../components/DataTable';
import type { Column } from '../components/DataTable';
import Icon from '../components/Icon';
import { PageHeader } from '../components/ui';
import { useInspection } from '../state/InspectionContext';
import { downloadCsv } from '../lib/exportCsv';
import { fetchSpecifications, specsToCsv, specUsage } from '../lib/specifications';
import type { Specification, SpecificationRow } from '../lib/specifications';

export default function SpecificationsView() {
  const { types } = useInspection();
  const [specs, setSpecs] = useState<Specification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchSpecifications()
      .then((s) => { if (alive) setSpecs(s); })
      .catch((e: Error) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const rows = useMemo(() => specUsage(specs, types), [specs, types]);

  const columns: Column<SpecificationRow>[] = [
    { key: 'measurement', header: 'Measurement', value: (r) => r.measurement },
    { key: 'units', header: 'Units', value: (r) => r.units },
    { key: 'abbreviation', header: 'Abbreviation', value: (r) => r.abbreviation },
    { key: 'equipment', header: 'Equipment', align: 'right', value: (r) => r.equipment },
  ];

  return (
    <>
      <PageHeader
        title="Specifications"
        subtitle="Manage the measurement/units catalog assignable to equipment types."
        actions={(
          <button type="button" className="insp-btn" disabled={rows.length === 0}
            onClick={() => downloadCsv(specsToCsv(rows), 'specifications.csv')}>
            <Icon name="export" /> Export
          </button>
        )}
      />
      {error && (
        <div className="insp-card" style={{ borderColor: 'var(--i-danger)', marginBottom: 14 }}>
          Could not load specifications: {error}
        </div>
      )}
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        loading={loading}
        searchPlaceholder="Search specifications…"
        emptyTitle="No specifications"
        emptyDesc="The specifications catalog is empty."
      />
    </>
  );
}
