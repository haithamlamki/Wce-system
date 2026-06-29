// Login / sign-up gate + header account chip (PRD §7.2).
import { useState } from 'react';
import { useAuth } from '../state/AuthContext';

/** Full-screen gate shown when cloud is enabled and nobody is signed in. */
export function LoginScreen({ onSkip }: { onSkip: () => void }) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg('');
    try {
      if (mode === 'in') await signIn(email, password);
      else {
        const { needsConfirmation } = await signUp(email, password, name);
        if (needsConfirmation) setMsg('Account created — check your email to confirm, then sign in.');
      }
    } catch (err) { setMsg((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div style={wrap}>
      <form style={card} onSubmit={submit}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 4 }}>
          <div className="logo" style={{ width: 34, height: 34, borderRadius: 8, background: 'linear-gradient(135deg,var(--accent),var(--accent2))', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontFamily: 'var(--disp)' }}>AEP</div>
          <div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 18 }}>P&amp;ID · BOP Studio</div>
        </div>
        <p style={{ color: 'var(--dim)', fontSize: 13, margin: '0 0 14px' }}>
          {mode === 'in' ? 'Sign in to access cloud projects.' : 'Create an account (you’ll start as a Field user).'}
        </p>
        {mode === 'up' && (<><label style={ml}>Full name</label><input style={inp} value={name} onChange={(e) => setName(e.target.value)} /></>)}
        <label style={ml}>Email</label>
        <input style={inp} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label style={ml}>Password</label>
        <input style={inp} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        {msg && <div style={{ fontSize: 12, color: 'var(--amber)', margin: '10px 0 0' }}>{msg}</div>}
        <button style={primary} disabled={busy} type="submit">{busy ? '…' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 12.5 }}>
          <button type="button" style={link} onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(''); }}>
            {mode === 'in' ? 'Create an account' : 'Have an account? Sign in'}
          </button>
          <button type="button" style={link} onClick={onSkip}>Continue offline →</button>
        </div>
      </form>
    </div>
  );
}

/** Header account chip with role + sign out. */
export function AccountChip() {
  const { user, role, fullName, signOut } = useAuth();
  if (!user) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ display: 'grid', textAlign: 'right', lineHeight: 1.2 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{fullName || user.email}</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--faint)', textTransform: 'uppercase' }}>{role ?? '—'}</span>
      </span>
      <button onClick={signOut} title="Sign out" style={{ border: '1px solid var(--line2)', background: 'var(--panel)', color: 'var(--ink)', padding: '6px 10px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Sign out</button>
    </div>
  );
}

const wrap: React.CSSProperties = { position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: 'var(--bg)' };
const card: React.CSSProperties = { background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 14, padding: 28, width: 360, boxShadow: 'var(--shadow)' };
const ml: React.CSSProperties = { display: 'block', fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: 1, color: 'var(--faint)', textTransform: 'uppercase', margin: '10px 0 4px', fontWeight: 600 };
const inp: React.CSSProperties = { width: '100%', background: 'var(--panel2)', border: '1px solid var(--line2)', color: 'var(--ink)', padding: '9px 10px', borderRadius: 7, fontFamily: 'var(--mono)', fontSize: 13 };
const primary: React.CSSProperties = { width: '100%', background: 'var(--accent)', color: '#fff', border: 0, borderRadius: 7, padding: '10px', fontWeight: 600, fontSize: 13, cursor: 'pointer', marginTop: 16 };
const link: React.CSSProperties = { border: 0, background: 'transparent', color: 'var(--accent)', cursor: 'pointer', fontSize: 12.5, padding: 0 };
