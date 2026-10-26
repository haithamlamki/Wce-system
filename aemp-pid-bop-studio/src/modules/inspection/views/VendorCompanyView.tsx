// ============================================================================
//  One vendor company (reference `/vendor-companies/:id`, `/new`, `/:id/edit`):
//  detail facts, the create/edit form (Active toggle only once saved), and the
//  API MyCerts certifications panel — searchable on New, with "Use this name".
// ============================================================================
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Badge, EmptyState, PageHeader } from '../components/ui';
import CertificationsPanel from '../components/CertificationsPanel';
import { useInspection } from '../state/InspectionContext';
import { fetchVendor, saveVendor } from '../lib/vendorApi';
import type { VendorCompany } from '../lib/vendors';

export default function VendorCompanyView() {
  const { id } = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { can } = useInspection();
  const editing = !id || pathname.endsWith('/edit');
  const back = () => navigate('/inspection/vendor-companies');

  const [vendor, setVendor] = useState<VendorCompany | null>(null);
  const [name, setName] = useState('');
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchVendor(id).then((v) => { setVendor(v); setName(v.name); setActive(v.isActive); })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (id && !vendor) {
    return error ? <EmptyState ico="⚠" title="Failed to load vendor company" desc={error} />
      : <EmptyState ico="◌" title="Loading" desc="Loading the vendor company…" />;
  }
  if (editing && !can('insp_vendor_edit')) {
    return <EmptyState ico="⚿" title="No Access" desc="You cannot edit vendor companies." />;
  }

  const save = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    if (name.trim().length > 300) { setError('Name must be 300 characters or fewer'); return; }
    setBusy(true); setError(null);
    try { await saveVendor({ id, name, isActive: active }); back(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ maxWidth: 760 }}>
      <PageHeader
        title={vendor?.name ?? 'New vendor company'}
        subtitle="Vendor Companies"
        actions={(
          <>
            <button type="button" className="insp-btn" onClick={back}>Back</button>
            {!editing && can('insp_vendor_edit') && (
              <button type="button" className="insp-btn primary" onClick={() => navigate(`/inspection/vendor-companies/${id}/edit`)}>Edit</button>
            )}
          </>
        )}
      />

      {editing ? (
        <div className="insp-card">
          <div className="insp-field">
            <label htmlFor="vc-name">Name</label>
            <input id="vc-name" className="insp-input" value={name} maxLength={300}
              aria-invalid={!!error} onChange={(e) => setName(e.target.value)} />
          </div>
          {id && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Active (offered in the company dropdowns)
            </label>
          )}
          {error && <p style={{ color: 'var(--i-danger)', marginTop: 8 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
            <button type="button" className="insp-btn" onClick={back}>Cancel</button>
            <button type="button" className="insp-btn primary" disabled={busy} onClick={save}>
              {id ? 'Save changes' : 'Create vendor company'}</button>
          </div>
        </div>
      ) : vendor && (
        <dl className="insp-card" style={{ display: 'grid', gridTemplateColumns: '12rem 1fr', rowGap: 10, margin: 0 }}>
          <dt style={{ color: 'var(--i-muted)' }}>Name</dt><dd style={{ margin: 0 }}>{vendor.name}</dd>
          <dt style={{ color: 'var(--i-muted)' }}>Source</dt><dd style={{ margin: 0 }}><Badge>{vendor.source}</Badge></dd>
          <dt style={{ color: 'var(--i-muted)' }}>Status</dt>
          <dd style={{ margin: 0 }}><Badge tone={vendor.isActive ? 'success' : 'neutral'}>{vendor.isActive ? 'Active' : 'Inactive'}</Badge></dd>
        </dl>
      )}

      {vendor ? <CertificationsPanel key={vendor.name} companyName={vendor.name} />
        : <CertificationsPanel companyName="" searchable onPickName={setName} />}
    </div>
  );
}
