// ============================================================================
//  Module landing page — shown after login at /home. One unified platform,
//  multiple modules: WCE (P&ID / BOP Studio, the existing app) and Tubular
//  Fleet Management. The Tubular card is permission-aware (UI-level only;
//  RLS remains the real boundary). WCE stays reachable exactly as before via
//  its original deep links.
// ============================================================================
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { useAuth } from '../state/AuthContext';
import { canAccessModule, isPrivileged } from '../modules/tubular/lib/permissions';

const card: React.CSSProperties = {
  display: 'block', textDecoration: 'none', color: 'var(--ink)',
  background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 14,
  padding: '26px 26px 22px', width: 340, boxShadow: 'var(--shadow)',
};

function ModuleCard({ to, icon, title, sub, note, disabled }: {
  to: string; icon: string; title: string; sub: string; note?: string; disabled?: boolean;
}) {
  const body = (
    <>
      <div style={{ fontSize: 34, marginBottom: 10 }} aria-hidden>{icon}</div>
      <div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 19 }}>{title}</div>
      <div style={{ color: 'var(--dim)', fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>{sub}</div>
      {note && (
        <div style={{ marginTop: 12, fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
          {note}
        </div>
      )}
    </>
  );
  if (disabled) {
    return <div style={{ ...card, opacity: 0.55 }} aria-disabled>{body}</div>;
  }
  return <Link to={to} style={card}>{body}</Link>;
}

export default function HomeView() {
  const { role, session, fullName } = useAuth();
  const [granted, setGranted] = useState<ReadonlySet<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase || !session || isPrivileged(role)) { setLoaded(true); return; }
      const { data, error } = await supabase
        .from('user_module_permissions').select('permission').eq('user_id', session.user.id);
      if (error) console.error('Failed to load module permissions:', error);
      if (!cancelled) {
        setGranted(new Set((data ?? []).map((r) => r.permission as string)));
        setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [session, role]);

  const tubularOk = canAccessModule(role, granted);
  const offline = !isSupabaseConfigured || !session;

  return (
    <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
      <div>
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 24 }}>
            {fullName ? `Welcome, ${fullName}` : 'Welcome'}
          </div>
          <div style={{ color: 'var(--faint)', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 6 }}>
            Abraj Equipment Master Pro — choose a module
          </div>
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
          <ModuleCard
            to="/full"
            icon="🛢"
            title="P&ID · BOP Studio"
            sub="Well Control Equipment drawings, BOP schematics, equipment register and inspection dashboard."
            note="Module 1 · WCE"
          />
          <ModuleCard
            to="/tubular"
            icon="🧰"
            title="Tubular Fleet Management"
            sub="Rig & Hoist tubular monitoring: data entry, fleet inventory, contracts, pipe orders and logistics."
            note={offline ? 'Requires cloud sign-in' : (!loaded ? 'Checking access…' : tubularOk ? 'Module 2 · Tubular' : 'No access — ask an administrator')}
            disabled={offline || (loaded && !tubularOk)}
          />
        </div>
      </div>
    </div>
  );
}
