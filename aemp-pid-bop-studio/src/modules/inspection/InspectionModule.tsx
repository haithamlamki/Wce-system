// ============================================================================
//  Equipment Inspection module shell — lazy-loaded from App.tsx. Replicates the
//  reference system's sidebar shell and route set (see
//  docs/inspection-reference-parity.md). Access-gated by any role key; the DB
//  (RLS + SECURITY DEFINER RPCs) remains the authorization boundary.
// ============================================================================
import { useCallback, useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import './inspection.css';
import { InspectionProvider, useInspection } from './state/InspectionContext';
import InspectionTopbar from './components/shell/InspectionTopbar';
import InspectionSidebar from './components/shell/InspectionSidebar';
import { EmptyState } from './components/ui';
import DashboardView from './views/DashboardView';
import EquipmentView from './views/EquipmentView';
import RecordsView from './views/RecordsView';
import DataEntryForm from './views/DataEntryForm';
import DataUploadView from './views/DataUploadView';
import ApprovalsView from './views/ApprovalsView';
import SharedDocumentsView from './views/SharedDocumentsView';
import EquipmentCategoriesView from './views/EquipmentCategoriesView';
import SpecificationsView from './views/SpecificationsView';
import CalibrationListView from './views/CalibrationListView';
import CalibrationRegisterView from './views/CalibrationRegisterView';
import PidView from './views/PidView';
import LibraryView from './views/LibraryView';
import FrequenciesView from './views/FrequenciesView';
import CompaniesView from './views/CompaniesView';
import VendorCompaniesView from './views/VendorCompaniesView';
import VendorCompanyView from './views/VendorCompanyView';
import UnitsView from './views/UnitsView';
import CatalogView from './views/CatalogView';
import UsersView from './views/UsersView';
import RolesView from './views/RolesView';
import RoleView from './views/RoleView';
import PermissionsView from './views/PermissionsView';
import ScopeTemplatesView from './views/ScopeTemplatesView';
import AdminLogsView from './views/AdminLogsView';
import ReleaseLogView from './views/ReleaseLogView';
import PasswordResetView from './views/PasswordResetView';

function ModuleRoutes() {
  const { enabled, loading, canAccess, error } = useInspection();
  if (!enabled) {
    return <EmptyState ico="☁" title="Cloud Required"
      desc="Equipment Inspection is database-backed. Configure Supabase to use this module." />;
  }
  if (loading) return <EmptyState ico="◌" title="Loading" desc="Loading your access…" />;
  if (error) return <EmptyState ico="⚠" title="Error" desc={error} />;
  if (!canAccess) {
    return <EmptyState ico="⚿" title="No Access"
      desc="Your account has no Inspection module permission yet. Ask an administrator to assign you a role." />;
  }
  return (
    <Routes>
      <Route index element={<DashboardView />} />
      <Route path="equipment" element={<EquipmentView />} />
      <Route path="equipment/:typeId" element={<CatalogView />} />
      <Route path="records" element={<RecordsView />} />
      <Route path="records/new" element={<DataEntryForm />} />
      <Route path="records/:id/edit" element={<DataEntryForm />} />
      <Route path="records/upload" element={<DataUploadView />} />
      <Route path="approvals" element={<ApprovalsView />} />
      <Route path="shared-documents" element={<SharedDocumentsView />} />
      <Route path="equipment-categories" element={<EquipmentCategoriesView />} />
      <Route path="specifications" element={<SpecificationsView />} />
      <Route path="calibration" element={<CalibrationListView />} />
      <Route path="calibration/:id" element={<CalibrationRegisterView />} />
      <Route path="pid" element={<PidView />} />
      <Route path="library" element={<LibraryView />} />
      <Route path="admin/inspection-frequencies" element={<FrequenciesView />} />
      <Route path="companies" element={<CompaniesView />} />
      <Route path="vendor-companies" element={<VendorCompaniesView />} />
      <Route path="vendor-companies/new" element={<VendorCompanyView />} />
      <Route path="vendor-companies/:id" element={<VendorCompanyView />} />
      <Route path="vendor-companies/:id/edit" element={<VendorCompanyView />} />
      <Route path="units" element={<UnitsView />} />
      <Route path="users" element={<UsersView />} />
      <Route path="roles" element={<RolesView />} />
      <Route path="roles/new" element={<RoleView />} />
      <Route path="roles/:id" element={<RoleView />} />
      <Route path="roles/:id/edit" element={<RoleView />} />
      <Route path="permissions" element={<PermissionsView />} />
      <Route path="scope-templates" element={<ScopeTemplatesView />} />
      <Route path="admin/audit-logs" element={<AdminLogsView key="audit" kind="audit" />} />
      <Route path="admin/logs" element={<AdminLogsView key="app" kind="app" />} />
      <Route path="release-log" element={<ReleaseLogView />} />
      <Route path="password" element={<PasswordResetView />} />
      <Route path="*" element={<EmptyState ico="?" title="Not Found" desc="This Inspection page does not exist." />} />
    </Routes>
  );
}

const THEME_KEY = 'insp.theme';

export default function InspectionModule() {
  const [navOpen, setNavOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 1024);
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem(THEME_KEY) === 'dark'; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch { /* storage unavailable */ }
  }, [dark]);

  const closeOnMobile = useCallback(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= 1024) setNavOpen(false);
  }, []);

  const cls = ['insp-app', dark ? 'dark' : '', navOpen ? 'nav-open' : 'nav-collapsed']
    .filter(Boolean).join(' ');

  return (
    <InspectionProvider>
      <div className={cls}>
        <InspectionTopbar
          onToggleNav={() => setNavOpen((v) => !v)}
          dark={dark}
          onToggleDark={() => setDark((v) => !v)}
        />
        <div className="insp-body">
          <InspectionSidebar onNavigate={closeOnMobile} />
          <main className="insp-main">
            <ModuleRoutes />
          </main>
        </div>
      </div>
    </InspectionProvider>
  );
}
