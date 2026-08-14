// ============================================================================
//  Inspection Frequencies — replicates the reference
//  `/admin/inspection-frequencies` list. Read-only: the offered frequencies are
//  enforced by the CHECK constraints on insp_records.{major,intermediate}
//  _freq_months, so changing the set requires a migration, not a UI edit.
// ============================================================================
import { useMemo } from 'react';
import DataTable from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { Badge, PageHeader } from '../components/ui';
import { INTERMEDIATE_FREQUENCIES, MAJOR_FREQUENCIES, frequencyLabel } from '../types';

interface Row {
  months: number; label: string; unit: string; amount: number;
  major: boolean; intermediate: boolean; order: number;
}

export default function FrequenciesView() {
  const rows = useMemo<Row[]>(() => {
    const all = [...new Set<number>([...INTERMEDIATE_FREQUENCIES, ...MAJOR_FREQUENCIES])]
      .sort((a, b) => a - b);
    return all.map((months, i) => ({
      months,
      label: frequencyLabel(months),
      unit: months < 12 ? 'Months' : 'Years',
      amount: months < 12 ? months : months / 12,
      major: (MAJOR_FREQUENCIES as readonly number[]).includes(months),
      intermediate: (INTERMEDIATE_FREQUENCIES as readonly number[]).includes(months),
      order: i + 1,
    }));
  }, []);

  const yesNo = (on: boolean) => (
    <Badge tone={on ? 'success' : 'neutral'}>{on ? 'Yes' : 'No'}</Badge>
  );

  const columns: Column<Row>[] = [
    { key: 'label', header: 'Label', value: (r) => r.label },
    { key: 'unit', header: 'Unit', value: (r) => r.unit },
    { key: 'amount', header: 'Amount', align: 'right', value: (r) => r.amount },
    { key: 'major', header: 'Major', value: (r) => (r.major ? 'Yes' : 'No'), render: (r) => yesNo(r.major) },
    { key: 'intermediate', header: 'Intermediate', value: (r) => (r.intermediate ? 'Yes' : 'No'), render: (r) => yesNo(r.intermediate) },
    { key: 'order', header: 'Order', align: 'right', value: (r) => r.order },
    { key: 'status', header: 'Status', value: () => 'Active', render: () => <Badge tone="success">Active</Badge> },
  ];

  return (
    <>
      <PageHeader
        title="Inspection Frequencies"
        subtitle="Frequency options available when scheduling intermediate and major inspections."
      />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => String(r.months)}
        searchPlaceholder="Search frequencies…"
        emptyTitle="No frequencies"
        emptyDesc="No inspection frequencies are configured."
      />
    </>
  );
}
