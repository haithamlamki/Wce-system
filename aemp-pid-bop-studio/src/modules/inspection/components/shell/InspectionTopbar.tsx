import { Link } from 'react-router-dom';
import { AccountChip } from '../../../../components/Auth';
import NotificationsSlot from '../NotificationsSlot';
import { useInspection } from '../../state/InspectionContext';

export default function InspectionTopbar() {
  const { can, canAccess } = useInspection();
  return (
    <header className="insp-topbar">
      <div className="insp-brand">
        <img src="/brand/abraj-mark.png" alt="Abraj" />
        <div>
          <h1>Equipment Master Pro</h1>
          <div className="insp-sub">Equipment Inspection · Abraj Energy Services</div>
        </div>
      </div>
      <div className="insp-topbar-spacer" />
      <NotificationsSlot />
      {canAccess && (
        <Link to="/inspection/library" className="insp-home-link" title="User Guide and Inspection Manual">🕮 User Guide</Link>
      )}
      {canAccess && can('insp_approve') && (
        <Link to="/inspection/approvals" className="insp-home-link" title="Records waiting for your approval">✓ Pending Approval</Link>
      )}
      <Link to="/home" className="insp-home-link">⌂ Modules</Link>
      <AccountChip />
    </header>
  );
}
