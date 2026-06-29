// Account — Well Control Steward rewards dashboard (PRD §7.13).
// Phase-1 scaffold: derives points/tier/trophies from real project state.
// TODO(Phase-1): profile, action queue jump-to-item, shared leaderboard (FR-54).
import { useProject } from '../state/ProjectContext';
import { ACHIEVEMENTS, REWARDS, rewardStats, tierOf, TIERS } from '../lib/rewards';

export default function AccountView() {
  const { project, refDate, redeemReward } = useProject();
  const s = rewardStats(project, refDate);
  const available = s.pts - project.rewards.spent;
  const tier = tierOf(s.pts);
  const idx = TIERS.indexOf(tier);
  const next = TIERS[idx + 1];
  const progress = next ? Math.min(1, (s.pts - tier.min) / (next.min - tier.min)) : 1;

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
const card: React.CSSProperties = { background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 14, padding: 20, minWidth: 280, flex: '1 1 280px', boxShadow: 'var(--shadow)' };
