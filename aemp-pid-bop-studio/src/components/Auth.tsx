// Login / sign-up gate + header account chip (PRD §7.2).
import { useEffect, useState } from 'react';
import { useAuth } from '../state/AuthContext';
import { aempSsoEnabled, readInboundAempToken, signInWithAemp } from '../lib/aempSso';

/** Full-screen gate shown when cloud is enabled and nobody is signed in. */
export function LoginScreen({ onSkip }: { onSkip: () => void }) {
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function aempSignIn() {
    setBusy(true); setMsg('');
    try { await signInWithAemp(); }
    catch (err) { setMsg((err as Error).message); }
    finally { setBusy(false); }
  }

  // If AEMP handed us a token (embedded launch), attempt SSO automatically.
  useEffect(() => {
    if (aempSsoEnabled && readInboundAempToken()) aempSignIn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg('');
    try {
      if (mode === 'in') await signIn(email, password);
      else if (mode === 'reset') {
        await resetPassword(email);
        setMsg('If that email has an account, a password-reset link is on its way — check your inbox.');
      } else {
        const { needsConfirmation } = await signUp(email, password, name);
        if (needsConfirmation) setMsg('Account created — check your email to confirm, then sign in.');
      }
    } catch (err) { setMsg((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div style={wrap}>
      <form style={card} onSubmit={submit}>
        <img src="/brand/abraj-logo.png" alt="Abraj" style={{ height: 38, display: 'block', marginBottom: 12, objectFit: 'contain' }} />
        <div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 18, marginBottom: 4 }}>P&amp;ID · BOP Studio</div>
        <p style={{ color: 'var(--dim)', fontSize: 13, margin: '0 0 14px' }}>
          {mode === 'in' ? 'Sign in to access cloud projects.'
            : mode === 'reset' ? 'Enter your email and we’ll send a link to reset your password.'
            : 'Create an account (you’ll start as a Field user).'}
        </p>
        {mode === 'up' && (<><label style={ml}>Full name</label><input style={inp} value={name} onChange={(e) => setName(e.target.value)} /></>)}
        <label style={ml}>Email</label>
        <input style={inp} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        {mode !== 'reset' && (
          <>
            <label style={ml}>Password</label>
            <input style={inp} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            {mode === 'in' && (
              <button type="button" style={{ ...link, marginTop: 6, display: 'block', marginLeft: 'auto' }} onClick={() => { setMode('reset'); setMsg(''); }}>
                Forgot password?
              </button>
            )}
          </>
        )}
        {msg && <div style={{ fontSize: 12, color: 'var(--amber)', margin: '10px 0 0' }}>{msg}</div>}
        <button style={primary} disabled={busy} type="submit">{busy ? '…' : mode === 'in' ? 'Sign in' : mode === 'reset' ? 'Send reset link' : 'Create account'}</button>
        {aempSsoEnabled && mode !== 'reset' && (
          <>
            <div style={{ textAlign: 'center', color: 'var(--faint)', fontSize: 11, margin: '12px 0 8px' }}>— or —</div>
            <button type="button" style={{ ...primary, marginTop: 0, background: 'var(--accent2)' }} disabled={busy} onClick={aempSignIn}>
              Sign in with AEMP
            </button>
          </>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 12.5 }}>
          <button type="button" style={link} onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(''); }}>
            {mode === 'reset' ? '← Back to sign in' : mode === 'in' ? 'Create an account' : 'Have an account? Sign in'}
          </button>
          <button type="button" style={link} onClick={onSkip}>Continue offline →</button>
        </div>
      </form>
    </div>
  );
}

/** Shown after a user returns via a password-reset link (recovery session). */
export function ResetPasswordScreen() {
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setMsg('Passwords don’t match.'); return; }
    setBusy(true); setMsg('');
    try {
      await updatePassword(password);
      setDone(true);
    } catch (err) { setMsg((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div style={wrap}>
      <form style={card} onSubmit={submit}>
        <img src="/brand/abraj-logo.png" alt="Abraj" style={{ height: 38, display: 'block', marginBottom: 12, objectFit: 'contain' }} />
        <div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Set a new password</div>
        {done ? (
          <p style={{ color: 'var(--dim)', fontSize: 13, margin: '8px 0 0' }}>
            Password updated. You’re signed in — you can close this and continue.
          </p>
        ) : (
          <>
            <p style={{ color: 'var(--dim)', fontSize: 13, margin: '0 0 14px' }}>Choose a new password for your account.</p>
            <label style={ml}>New password</label>
            <input style={inp} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            <label style={ml}>Confirm password</label>
            <input style={inp} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} />
            {msg && <div style={{ fontSize: 12, color: 'var(--amber)', margin: '10px 0 0' }}>{msg}</div>}
            <button style={primary} disabled={busy} type="submit">{busy ? '…' : 'Update password'}</button>
          </>
        )}
      </form>
    </div>
  );
}

const KNOWN_RIGS = ['Rig 103', 'Rig 303', 'Rig 305'];

/** Header account chip with role, per-rig selector, and sign out. */
export function AccountChip() {
  const { user, role, fullName, rig, updateRig, signOut } = useAuth();
  if (!user) return null;
  const privileged = role === 'admin' || role === 'manager';
  const options = Array.from(new Set([...(rig ? [rig] : []), ...KNOWN_RIGS]));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <select
        value={rig ?? ''}
        onChange={(e) => updateRig(e.target.value).catch((err) => alert(err.message))}
        title={privileged ? 'Your rig (you can see all rigs)' : 'Your assigned rig — scopes what you can see'}
        style={{ background: 'var(--panel2)', border: '1px solid var(--line2)', color: 'var(--ink)', borderRadius: 7, padding: '6px 8px', fontSize: 11.5, fontFamily: 'var(--mono)' }}
      >
        <option value="">{privileged ? 'All rigs' : 'Set rig…'}</option>
        {options.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
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
