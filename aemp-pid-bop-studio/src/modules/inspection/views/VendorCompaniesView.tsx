// ============================================================================
//  Vendor Companies list (reference `/vendor-companies`): the OEM, inspection
//  and certifying company names offered on the forms — name, source and
//  status, searched and paged on the server (4,500+ names).
// ============================================================================
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DataTable from '../components/DataTable';
import type { Column, ServerMode } from '../components/DataTable';
import Icon from '../components/Icon';
import { Badge, PageHeader } from '../components/ui';
import { useInspection } from '../state/InspectionContext';
import { fetchVendors, type VendorQuery } from '../lib/vendorApi';
import type { VendorCompany } from '../lib/vendors';

export default function VendorCompaniesView() {
  const { can } = useInspection();
  const navigate = useNavigate();
  const editable = can('vendor-company:update');
  const [query, setQuery] = useState<VendorQuery>({ q: '', page: 1, perPage: 25, sort: 'name', desc: false });
  const [rows, setRows] = useState<VendorCompany[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (q: VendorQuery) => {
    setLoading(true);
    try { const r = await fetchVendors(q); setRows(r.rows); setTotal(r.total); setError(null); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(query); }, [load, query]);

  const server: ServerMode = {
    total, page: query.page, perPage: query.perPage, loading,
    onChange: (n) => {
      const q = (n.columnFilters.name || n.search || '').trim();
      const sort: VendorQuery['sort'] = n.sortBy === 'source' ? 'source' : 'name';
      const next: VendorQuery = { q, page: q !== query.q ? 1 : n.page, perPage: n.perPage, sort,
        desc: n.sortBy ? !n.sortAsc : false };
      if (JSON.stringify(next) !== JSON.stringify(query)) setQuery(next);
    },
  };

  const columns: Column<VendorCompany>[] = [
    { key: 'name', field: 'name', header: 'Name', sortable: true, value: (r) => r.name, filterPlaceholder: 'Search name…' },
    { key: 'source', field: 'source', header: 'Source', sortable: true, value: (r) => r.source,
      render: (r) => <Badge>{r.source}</Badge> },
    { key: 'status', header: 'Status', value: (r) => (r.isActive ? 'Active' : 'Inactive'),
      render: (r) => <Badge tone={r.isActive ? 'success' : 'neutral'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
    { key: 'actions', header: '', align: 'right', render: (r) => (
      <span style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
        <button type="button" className="insp-iconbtn" title="View vendor company"
          onClick={() => navigate(`/inspection/vendor-companies/${r.id}`)}><Icon name="documents" /></button>
        {editable && <button type="button" className="insp-iconbtn" title="Edit vendor company"
          onClick={() => navigate(`/inspection/vendor-companies/${r.id}/edit`)}><Icon name="edit" /></button>}
      </span>
    ) },
  ];

  return (
    <>
      <PageHeader
        title="Vendor Companies"
        subtitle="OEM, inspection and certifying companies offered on the inspection and calibration forms."
        actions={can('vendor-company:create') && (
          <button type="button" className="insp-btn primary" onClick={() => navigate('/inspection/vendor-companies/new')}>
            <Icon name="plus" /> New vendor company</button>
        )}
      />
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} server={server} loading={loading} error={error}
        searchPlaceholder="Search vendor companies…" emptyTitle="No vendor companies found." initialPageSize={25} />
    </>
  );
}
