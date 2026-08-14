// ============================================================================
//  Equipment Categories — replicates the reference `/equipment-categories`
//  list (columns: Category, Equipment). Categories are a DB enum, so the page
//  is read-only: adding one would require altering `public.insp_category`.
// ============================================================================
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import DataTable from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { PageHeader } from '../components/ui';
import { useInspection } from '../state/InspectionContext';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../types';
import type { InspCategory } from '../types';

interface Row { key: InspCategory; label: string; equipment: number }

export default function EquipmentCategoriesView() {
  const { types, loading } = useInspection();
  const navigate = useNavigate();

  const rows = useMemo<Row[]>(() => CATEGORY_ORDER.map((key) => ({
    key,
    label: CATEGORY_LABELS[key],
    equipment: types.filter((t) => t.category === key).length,
  })), [types]);

  const columns: Column<Row>[] = [
    { key: 'label', header: 'Category', value: (r) => r.label },
    { key: 'equipment', header: 'Equipment', align: 'right', value: (r) => r.equipment },
  ];

  return (
    <>
      <PageHeader
        title="Equipment Categories"
        subtitle="The seven equipment categories and how many equipment types each holds."
      />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.key}
        loading={loading}
        searchPlaceholder="Search equipment categories…"
        emptyTitle="No categories"
        emptyDesc="No equipment categories are defined."
        rowActions={(r) => (
          <button type="button" className="insp-btn sm"
            onClick={() => navigate(`/inspection/equipment?category=${r.key}`)}>
            Open
          </button>
        )}
      />
    </>
  );
}
