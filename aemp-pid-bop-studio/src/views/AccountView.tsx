// Account — Well Control Steward rewards dashboard (PRD §7.13).
// Derives points/tier/trophies from real project state, lists the user's
// overdue/due-soon items with a jump-to-diagram (FR-53), and ranks the crew
// by points via Supabase (FR-54).
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../state/ProjectContext';
import { useAuth } from '../state/AuthContext';
import { ACHIEVEMENTS, REWARDS, rewardStats, tierOf, TIERS } from '../lib/rewards';
import { STATUS_COLOR, STATUS_LABEL, statusOf } from '../lib/status';
import { SYM, type SymbolKey } from '../lib/symbols';
import { fetchLeaderboard, upsertMyScore, type LeaderRow } from '../lib/cloud';

export default function AccountView() {
  const { project, refDate, redeemReward, requestFocus } = useProject();
  const { enabled, user, fullName } = useAuth();
  const navigate = useNavigate();
  const s = rewardStats(project, refDate);
  const available = s.pts - project.rewards.spent;
  const tier = tierOf(s.pts);
  const idx = TIERS.indexOf(tier);
  const next = TIERS[idx + 1];
  const progress = next ? Math.min(1, (s.pts - tier.min) / (next.min - tier.min)) : 1;

  // FR-53: the user's actual overdue / due-soon items, overdue first
  const queue = useMemo(
    () => project.nodes
      .map((n) => ({ n, st: statusOf(n, refDate) }))
      .filter((x) => x.st === 'over' || x.st === 'due')
      .sort((a, b) => (a.st === 'over' ? 0 : 1) - (b.st === 'over' ? 0 : 1)),
    [project.nodes, refDate],
  );
  const fix = (id: string) => { requestFocus(id); navigate('/full'); };

  // FR-54: publish my points + pull the ranked crew board
  const [board, setBoard] = useState<LeaderRow[] | null>(null);
  const [boardErr, setBoardErr] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || !user) return;
    let active = true;
    (async () => {
      try { await upsertMyScore(s.pts); const b = await fetchLeaderboard(); if (active) setBoard(b); }
      catch (e) { if (active) setBoardErr((e as Error).message); }
    })();
    return () => { active = false; };
  }, [enabled, user, s.pts]);

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <section style={card}>
          <div style={{ fontFamily: 'var(--disp)', fontSize: 13, letterSpacing: 1, color: 'var(--faint)', textTransform: 'uppercase' }}>Well Control Steward</div>
          <div style={{ fontFamily: 'var(--disp)', fontSize: 40, fontWeight: 700, color: tier.c }}>{tier.n}</div>
          <div style={{ fontSize: 13, color: 'var(--dim)' }}>{s.pts} points</div>
          <div style={{ height: 8, background: 'var(--sunk)', borderRadius: 6, marginTop: 12, overflow: 'hidden' }}>
            <div style={{ width: `${progress * 100}%`, height: '100%', background: tier.c }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 6 }}>
            {next ? `${next.min - s.pts} pts to ${next.n}` : 'Top tier reached'}
          </div>
        </section>

        <section style={card}>
          <H>Action queue</H>
          {queue.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--green)' }}>✓ All clear — nothing overdue or due soon.</div>
          ) : (
            <div style={{ maxHeight: 230, overflowY: 'auto' }}>
              {queue.map(({ n, st }) => (
                <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
                  <span style={{ color: STATUS_COLOR[st] }}>●</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 12.5, fontWeight: 600 }}>{n.tag || '—'} <span style={{ color: 'var(--faint)', fontWeight: 400 }}>{SYM[n.type as SymbolKey]?.name}</span></div>
                    <div style={{ fontSize: 10.5, color: STATUS_COLOR[st] }}>{STATUS_LABEL[st]} · next due {n.int_due || n.maj_due || '—'}</div>
                  </div>
                  <button style={fixBtn} onClick={() => fix(n.id)}>fix ▸</button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section style={card}>
          <H>Trophy cabinet</H>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {ACHIEVEMENTS.map((a) => {
              const earned = a.on(s);
              return (
                <div key={a.id} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--line2)', opacity: earned ? 1 : 0.4 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{earned ? '🏆 ' : '🔒 '}{a.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--faint)' }}>{a.desc}</div>
                </div>
              );
            })}
          </div>
        </section>

        <section style={card}>
          <H>Crew leaderboard</H>
          {!enabled ? (
            <Note>Connect the cloud (Supabase) to rank against your crew.</Note>
          ) : !user ? (
            <Note>Sign in to join the crew leaderboard.</Note>
          ) : boardErr ? (
            <Note>Leaderboard unavailable — apply migration 0004 to enable. ({boardErr})</Note>
          ) : board === null ? (
            <Note>Loading…</Note>
          ) : (
            <div style={{ maxHeight: 230, overflowY: 'auto' }}>
              {board.map((r, i) => {
                const me = r.id === user.id;
                return (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--line)', fontWeight: me ? 700 : 400 }}>
                    <span style={{ fontFamily: 'var(--disp)', width: 22, color: i < 3 ? tier.c : 'var(--faint)' }}>{i + 1}</span>
                    <span style={{ flex: 1 }}>{r.full_name}{me ? ' (you)' : ''}{r.rig ? <span style={{ color: 'var(--faint)', fontWeight: 400 }}> · {r.rig}</span> : null}</span>
                    <span style={{ fontFamily: 'var(--mono)' }}>{r.points}</span>
                  </div>
                );
              })}
              <div style={{ fontSize: 10.5, color: 'var(--faint)', marginTop: 8 }}>Your score ({fullName || 'you'}) publishes automatically.</div>
            </div>
          )}
        </section>

        <section style={card}>
          <H>Redeem points</H>
          <div style={{ fontSize: 11.5, color: 'var(--dim)', marginBottom: 8 }}>{available} points available to spend</div>
          {REWARDS.map((r) => {
            const redeemed = project.rewards.redeemed.includes(r.id);
            const can = !redeemed && available >= r.cost;
            return (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
                <span style={{ opacity: redeemed ? 0.55 : 1 }}>{r.name}</span>
                {redeemed ? (
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--green)' }}>✓ Redeemed</span>
                ) : (
                  <button
                    onClick={() => redeemReward(r.id)}
                    disabled={!can}
                    title={can ? `Redeem for ${r.cost} points` : 'Not enough points yet'}
                    style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 7, border: '1px solid var(--line2)', cursor: can ? 'pointer' : 'not-allowed', background: can ? 'var(--accent)' : 'var(--panel2)', color: can ? '#fff' : 'var(--faint)' }}>
                    ★ {r.cost}
                  </button>
                )}
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 16, marginBottom: 12 }}>{children}</div>;
}
function Note({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: 'var(--faint)', lineHeight: 1.6 }}>{children}</div>;
}
const card: React.CSSProperties = { background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 14, padding: 20, minWidth: 280, flex: '1 1 280px', boxShadow: 'var(--shadow)' };
const fixBtn: React.CSSProperties = { background: 'transparent', border: '1px solid var(--line2)', color: 'var(--accent)', padding: '3px 9px', borderRadius: 6, fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' };
