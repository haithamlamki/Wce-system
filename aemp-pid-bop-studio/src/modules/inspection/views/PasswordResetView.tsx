// ============================================================================
//  Security Management → Password Reset (reference submenu): self-service
//  password change for the signed-in account, available to every user.
// ============================================================================
import { useState } from 'react';
import { changeOwnPassword } from '../lib/users';

export default function PasswordResetView() {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setMsg(null); setErr(null);
    if (pw.length < 8) { setErr('Password must be at least 8 characters.'); return; }
    if (pw !== pw2) { setErr('Passwords do not match.'); return; }
    setBusy(true);
    try {
      await changeOwnPassword(pw);
      setMsg('Password changed. Use the new password at your next login.');
      setPw(''); setPw2('');
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ maxWidth: 460 }}>
      <h2 style={{ fontSize: 18 }}>Security Management — Password Reset</h2>
      <div style={{ color: 'var(--i-muted)', fontSize: 12, marginBottom: 12 }}>
        Change the password of your own account.
      </div>
      <div className="insp-card">
        <div className="insp-form-grid" style={{ gridTemplateColumns: '1fr' }}>
          <div className="insp-field"><label>New password (min 8 chars)</label>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
          <div className="insp-field"><label>Repeat new password</label>
            <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
        </div>
        {err && <div style={{ color: '#d33', fontSize: 12.5, marginTop: 8 }}>{err}</div>}
        {msg && <div style={{ color: 'var(--i-success)', fontSize: 12.5, marginTop: 8 }}>{msg}</div>}
        <div className="insp-toolbar" style={{ marginTop: 12 }}>
          <button className="insp-btn primary" disabled={busy} onClick={save}>🔑 Change Password</button>
        </div>
      </div>
    </div>
  );
}
