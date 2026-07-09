// ============================================================================
//  Tubular Fleet Management — module shell. Lazy-loaded from App.tsx so the
//  WCE bundle is unaffected. Renders the module sub-navigation (permission-
//  gated via visibleTabs) and its nested routes. Pages land PR-by-PR; every
//  not-yet-implemented route shows a placeholder.
// ============================================================================
import { NavLink, Route, Routes } from 'react-router-dom';
import { useAuth } from '../../state/AuthContext';
import { TubularProvider, useTubular } from './state/TubularContext';
import { visibleTabs } from './lib/permissions';
import DataEntryView from './views/DataEntryView';
import FleetInventoryView from './views/FleetInventoryView';
import ImportView from './views/ImportView';
import MasterRegisterView from './views/MasterRegisterView';
import MovementsView from './views/MovementsView';
import TubularDashboardView from './views/TubularDashboardView';

function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="placeholder">
      <strong>{title}</strong>
      {note}
    </div>
  );
}

function AccessGate() {
  const { role } = useAuth();
  const { enabled, loading, granted, canAccess } = useTubular();

  if (!enabled) {
    return (
      <Placeholder
        title="Cloud required"
        note="Tubular Fleet Management is database-backed and needs the cloud connection. Configure Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) to use this module."
      />
    );
  }
  if (loading) return <Placeholder title="Tubular Fleet Management" note="Loading your access…" />;
  if (!canAccess) {
    return (
      <Placeholder
        title="No access to Tubular Fleet Management"
        note="Your account has no Tubular module permission yet. Ask an administrator to grant you access (view / data entry) and assign your Rig or Hoist."
      />
    );
  }

  const tabs = visibleTabs(role, granted);
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <nav
        className="tabs"
        aria-label="Tubular module"
        style={{ margin: '10px 16px 0', alignSelf: 'flex-start', flexWrap: 'wrap' }}
      >
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === '/tubular'}
            className={({ isActive }) => (isActive ? 'active' : '')}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <Routes>
          <Route index element={<TubularDashboardView />} />
          <Route path="inventory" element={<FleetInventoryView />} />
          <Route path="entry" element={<DataEntryView />} />
          <Route path="master" element={<MasterRegisterView />} />
          <Route path="transfers" element={<MovementsView />} />
          <Route path="contracts" element={<Placeholder title="Contracts" note="Arrives with the contracts release." />} />
          <Route path="orders" element={<Placeholder title="Order Pipe & Delivery" note="Arrives with the orders release." />} />
          <Route path="map" element={<Placeholder title="Asset & Logistics Map" note="Arrives with the logistics release." />} />
          <Route path="reference" element={<Placeholder title="API RP 7G Reference" note="Arrives with the reference release." />} />
          <Route path="training" element={<Placeholder title="Training" note="Arrives with the training release." />} />
          <Route path="manual" element={<Placeholder title="User Manual" note="Arrives with the documentation release." />} />
          <Route path="import" element={<ImportView />} />
          <Route path="*" element={<Placeholder title="Not found" note="This Tubular page does not exist." />} />
        </Routes>
      </div>
    </div>
  );
}

export default function TubularModule() {
  return (
    <TubularProvider>
      <AccessGate />
    </TubularProvider>
  );
}
