// ============================================================================
//  Notifications bell — unread count + dropdown, live via Supabase Realtime
//  (wss already allowed by the CSP). Rows are RLS-scoped to the caller; the
//  only client write is marking read.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../state/AuthContext';

interface Notification {
  id: string; kind: string; title: string; body: string | null;
  link: string | null; read_at: string | null; created_at: string;
}

export default function NotificationsBell() {
  const { session } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!supabase || !session) return;
    const { data } = await supabase
      .from('notifications')
      .select('id, kind, title, body, link, read_at, created_at')
      .order('created_at', { ascending: false })
      .limit(20);
    setItems((data ?? []) as Notification[]);
  }, [session]);

  useEffect(() => {
    void load();
    if (!supabase || !session) return;
    const channel = supabase
      .channel('tubular-notifications')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${session.user.id}` },
        () => { void load(); })
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [load, session]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const unread = items.filter((n) => !n.read_at).length;

  const markAllRead = async () => {
    if (!supabase) return;
    await supabase.from('notifications')
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null);
    await load();
  };

  if (!session) return null;

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <button onClick={() => setOpen((v) => !v)} aria-label={`Notifications (${unread} unread)`}
        style={{ border: '1px solid var(--line2)', background: 'var(--panel)', color: 'var(--ink)', padding: '6px 11px', borderRadius: 7, cursor: 'pointer', position: 'relative' }}>
        🔔
        {unread > 0 && (
          <span style={{ position: 'absolute', top: -6, right: -6, background: 'var(--red)', color: '#fff', borderRadius: 9, fontSize: 10, fontWeight: 700, padding: '1px 5px' }}>
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: '110%', width: 340, maxHeight: 420, overflow: 'auto', background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 10, boxShadow: 'var(--shadow)', zIndex: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>
            <strong style={{ fontFamily: 'var(--disp)', fontSize: 13 }}>Notifications</strong>
            <div style={{ flex: 1 }} />
            {unread > 0 && (
              <button onClick={() => void markAllRead()}
                style={{ border: 0, background: 'transparent', color: 'var(--accent)', cursor: 'pointer', fontSize: 12 }}>
                Mark all read
              </button>
            )}
          </div>
          {items.map((n) => (
            <Link key={n.id} to={n.link ?? '/tubular'} onClick={() => setOpen(false)}
              style={{ display: 'block', padding: '9px 12px', borderBottom: '1px solid var(--line)', textDecoration: 'none', color: 'var(--ink)', background: n.read_at ? 'transparent' : 'color-mix(in srgb, var(--accent) 7%, transparent)' }}>
              <div style={{ fontSize: 13, fontWeight: n.read_at ? 400 : 700 }}>{n.title}</div>
              {n.body && <div style={{ fontSize: 12, color: 'var(--dim)' }}>{n.body}</div>}
              <div style={{ fontSize: 10.5, color: 'var(--faint)', fontFamily: 'var(--mono)' }}>{new Date(n.created_at).toLocaleString()}</div>
            </Link>
          ))}
          {items.length === 0 && <div style={{ padding: 14, color: 'var(--faint)', fontSize: 13 }}>Nothing yet.</div>}
        </div>
      )}
    </div>
  );
}
