// ============================================================================
//  Equipment — replicates the reference `/equipment` list
//  (columns: Equipment Type, Category, Description, Parts, Specs).
//  Opening a row goes to the equipment-type detail page (CatalogView).
// ============================================================================
import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DataTable from '../components/DataTable';
import type { Column, FilterDef } from '../components/DataTable';
import { PageHeader } from '../components/ui';
import { useInspection } from '../state/InspectionContext';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../types';
import type { EquipmentType, InspCategory } from '../types';

export default function EquipmentView() {
  const { types, parts, loading, can } = useInspection();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const category = params.get('category') ?? '';

  const partCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of parts) m.set(p.typeId, (m.get(p.typeId) ?? 0) + 1);
    return m;
  }, [parts]);

  const rows = useMemo(
    () => (category ? types.filter((t) => t.category === category) : types),
    [types, category],
  );

  const columns: Column<EquipmentType>[] = [
    { key: 'name', header: 'Equipment Type', value: (t) => t.name },
    { key: 'category', header: 'Category', value: (t) => CATEGORY_LABELS[t.category] },
    { key: 'description', header: 'Description', value: (t) => t.description },
    { key: 'parts', header: 'Parts', align: 'right', value: (t) => partCounts.get(t.id) ?? 0 },
    { key: 'specs', header: 'Specs', align: 'right', value: (t) => t.specFields.length },
  ];

  const filters: FilterDef[] = [{
    key: 'category',
    label: 'Category',
    value: category,
    onChange: (v) => setParams(v ? { category: v } : {}),
    options: [
      { value: '', label: 'All categories' },
      ...CATEGORY_ORDER.map((c: InspCategory) => ({ value: c, label: CATEGORY_LABELS[c] })),
    ],
  }];

  return (
    <>
      <PageHeader
        title="Equipment"
        subtitle="Manage equipment types, their parts, components and specifications."
        actions={can('insp_manage_catalog') ? (
          <button type="button" className="insp-btn primary"
            onClick={() => navigate('/inspection/equipment/new')}>
            + New equipment type
          </button>
        ) : undefined}
      />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(t) => t.id}
        loading={loading}
        filters={filters}
        searchPlaceholder="Search equipment…"
        emptyTitle="No equipment types"
        emptyDesc="No equipment types match the current filters."
        rowActions={(t) => (
          <button type="button" className="insp-btn sm"
            onClick={() => navigate(`/inspection/equipment/${t.id}`)}>
            Open
          </button>
        )}
      />
    </>
  );
}
