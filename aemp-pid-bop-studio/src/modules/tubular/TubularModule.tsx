// ============================================================================
//  Tubular Fleet Management — module shell, pixel-faithful to the authoritative
//  prototype: .tubular-app root (own design system, tubular.css) containing
//  the prototype topbar, tab nav and <main>. Lazy-loaded from App.tsx so the
//  WCE bundle is unaffected; the WCE appbar is hidden on /tubular.
// ============================================================================
import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import './tubular.css';
import { TubularProvider, useTubular } from './state/TubularContext';
import { ToastProvider } from './components/shell/Toast';
import TubularTopbar from './components/shell/TubularTopbar';
import TubularTabNav from './components/shell/TubularTabNav';
import DataEntryView from './views/DataEntryView';
import FleetInventoryView from './views/FleetInventoryView';
import ImportView from './views/ImportView';
import MasterRegisterView from './views/MasterRegisterView';
import MovementsView from './views/MovementsView';
import ContractsView from './views/ContractsView';
import OrdersView from './views/OrdersView';
import ReferenceView from './views/ReferenceView';
import ManualView from './views/ManualView';
import TrainingView from './views/TrainingView';
import AssistantView from './views/AssistantView';
import TubularDashboardView from './views/TubularDashboardView';

// Leaflet is heavy and map-only — keep it out of the main tubular chunk.
const MapView = lazy(() => import('./views/MapView'));

function EmptyState({ ico, title, desc }: { ico: string; title: string; desc: string }) {
  return (
    <div className="empty-cert" style={{ marginTop: 40 }}>
      <div className="ico">{ico}</div>
      <div className="title">{title}</div>
      <div className="desc">{desc}</div>
    </div>
  );
}

function AccessGate() {
  const { enabled, loading, canAccess } = useTubular();

  if (!enabled) {
    return <EmptyState ico="☁" title="Cloud Required"
      desc="Tubular Fleet Management is database-backed. Configure Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) to use this module." />;
  }
  if (loading) {
    return <EmptyState ico="◌" title="Loading" desc="Loading your access…" />;
  }
  if (!canAccess) {
    return <EmptyState ico="⚿" title="No Access"
      desc="Your account has no Tubular module permission yet. Ask an administrator to grant access (view / data entry) and assign your Rig or Hoist." />;
  }

  return (
    <Routes>
      <Route index element={<TubularDashboardView />} />
      <Route path="inventory" element={<FleetInventoryView />} />
      <Route path="entry" element={<DataEntryView />} />
      <Route path="master" element={<MasterRegisterView />} />
      <Route path="transfers" element={<MovementsView />} />
      <Route path="contracts" element={<ContractsView />} />
      <Route path="orders" element={<OrdersView />} />
      <Route path="map" element={
        <Suspense fallback={<EmptyState ico="◎" title="Asset & Logistics Map" desc="Loading map…" />}>
          <MapView />
        </Suspense>
      } />
      <Route path="reference" element={<ReferenceView />} />
      <Route path="training" element={<TrainingView />} />
      <Route path="manual" element={<ManualView />} />
      <Route path="assistant" element={<AssistantView />} />
      <Route path="import" element={<ImportView />} />
      <Route path="*" element={<EmptyState ico="?" title="Not Found" desc="This Tubular page does not exist." />} />
    </Routes>
  );
}

export default function TubularModule() {
  return (
    <TubularProvider>
      <ToastProvider>
        <div className="tubular-app">
          <TubularTopbar />
          <TubularTabNav />
          <main>
            <AccessGate />
          </main>
        </div>
      </ToastProvider>
    </TubularProvider>
  );
}
