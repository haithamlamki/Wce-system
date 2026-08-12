// ============================================================================
//  Equipment Inspection module shell — lazy-loaded from App.tsx; hides the WCE
//  appbar (same pattern as /tubular). Access-gated by insp_view.
// ============================================================================
import { Route, Routes } from 'react-router-dom';
import './inspection.css';
import { InspectionProvider, useInspection } from './state/InspectionContext';
import InspectionTopbar from './components/shell/InspectionTopbar';
import InspectionTabNav from './components/shell/InspectionTabNav';
import RegisterView from './views/RegisterView';
import RecordsView from './views/RecordsView';
import CatalogView from './views/CatalogView';
import MetricsView from './views/MetricsView';

export function EmptyState({ ico, title, desc }: { ico: string; title: string; desc: string }) {
  return (
    <div className="insp-empty">
      <div className="ico">{ico}</div>
      <div style={{ fontWeight: 700, marginTop: 6 }}>{title}</div>
      <div style={{ fontSize: 12.5, marginTop: 4 }}>{desc}</div>
    </div>
  );
}

function AccessGate() {
  const { enabled, loading, canAccess, error } = useInspection();
  if (!enabled) {
    return <EmptyState ico="☁" title="Cloud Required"
      desc="Equipment Inspection is database-backed. Configure Supabase to use this module." />;
  }
  if (loading) return <EmptyState ico="◌" title="Loading" desc="Loading your access…" />;
  if (error) return <EmptyState ico="⚠" title="Error" desc={error} />;
  if (!canAccess) {
    return <EmptyState ico="⚿" title="No Access"
      desc="Your account has no Inspection module permission yet. Ask an administrator to grant insp_view." />;
  }
  return (
    <Routes>
      <Route index element={<RegisterView />} />
      <Route path="records" element={<RecordsView />} />
      <Route path="catalog" element={<CatalogView />} />
      <Route path="metrics" element={<MetricsView />} />
      <Route path="library" element={<EmptyState ico="🗀" title="Library" desc="Lands in Task 16." />} />
      <Route path="*" element={<EmptyState ico="?" title="Not Found" desc="This Inspection page does not exist." />} />
    </Routes>
  );
}

export default function InspectionModule() {
  return (
    <InspectionProvider>
      <div className="insp-app">
        <InspectionTopbar />
        <InspectionTabNav />
        <main className="insp-main">
          <AccessGate />
        </main>
      </div>
    </InspectionProvider>
  );
}
