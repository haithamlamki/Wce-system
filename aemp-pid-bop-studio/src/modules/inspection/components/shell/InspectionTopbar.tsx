import { Link } from 'react-router-dom';
import { AccountChip } from '../../../../components/Auth';
import NotificationsSlot from '../NotificationsSlot';

export default function InspectionTopbar() {
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
      <Link to="/home" className="insp-home-link">⌂ Modules</Link>
      <AccountChip />
    </header>
  );
}
