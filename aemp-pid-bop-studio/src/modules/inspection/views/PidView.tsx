// ============================================================================
//  P&ID — replicates the reference `/pid` list
//  (columns: Unit, Company, Inspector, Status, Components).
//
//  The host application owns P&ID projects in its own WCE module; this module
//  has no read API for them and adding one would mean reaching across module
//  boundaries and past the inspection RLS policies. The page therefore renders
//  its real chrome over an empty result and links to the P&ID studio instead of
//  fabricating rows.
// ============================================================================
import { Link } from 'react-router-dom';
import DataTable from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { PageHeader } from '../components/ui';

interface PidProject {
  id: string; unit: string; company: string;
  inspector: string; status: string; components: number;
}

export default function PidView() {
  const rows: PidProject[] = [];

  const columns: Column<PidProject>[] = [
    { key: 'unit', header: 'Unit', value: (r) => r.unit },
    { key: 'company', header: 'Company', value: (r) => r.company },
    { key: 'inspector', header: 'Inspector', value: (r) => r.inspector },
    { key: 'status', header: 'Status', value: (r) => r.status },
    { key: 'components', header: 'Components', align: 'right', value: (r) => r.components },
  ];

  return (
    <>
      <PageHeader
        title="P&ID"
        subtitle="Piping and instrumentation projects linked to inspection units."
        actions={<Link className="insp-btn" to="/">Open P&amp;ID studio</Link>}
      />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        searchPlaceholder="Search projects…"
        emptyTitle="No P&ID projects"
        emptyDesc="P&ID projects are managed in the P&ID studio module and are not mirrored into the inspection register."
      />
    </>
  );
}
