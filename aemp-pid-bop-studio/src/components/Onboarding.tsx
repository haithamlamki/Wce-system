// Date-first onboarding modal + editable project chip (PRD FR-1/3/4).
// The chip in the header shows rig + reference date and reopens the modal to
// edit them. The reference date drives all status calculations (FR-2).
import { useEffect, useState } from 'react';
import { useProject } from '../state/ProjectContext';

export function ProjectChip() {
  const { project, setShowOnboard } = useProject();
  return (
    <button onClick={() => setShowOnboard(true)} title="Edit rig & reference date" style={chip}>
      <span style={{ display: 'grid', gap: 1, textAlign: 'left' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--faint)' }}>PROJECT</span>
        <span style={{ fontWeight: 600 }}>{project.meta.rig} · {project.meta.date || 'set date'}</span>
      </span>
      <span style={{ color: 'var(--dim)' }}>▾</span>
    </button>
  );
}

export function OnboardModal() {
  const { project, showOnboard, completeOnboarding } = useProject();
  const [date, setDate] = useState(project.meta.date);
  const [rig, setRig] = useState(project.meta.rig);
  const [who, setWho] = useState(project.meta.who);

  // re-seed fields each time the modal opens
  useEffect(() => {
    if (showOnboard) { setDate(project.meta.date); setRig(project.meta.rig); setWho(project.meta.who); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOnboard]);

  if (!showOnboard) return null;
  const fresh = project.nodes.length === 0;

  return (
    <div style={overlay}>
      <div style={modal}>
        <h2 style={{ fontFamily: 'var(--disp)', margin: '0 0 4px' }}>{fresh ? 'Start a P&ID project' : 'Edit project'}</h2>
        <p style={{ margin: '0 0 16px', color: 'var(--dim)', fontSize: 13 }}>
          The reference date drives all inspection status (in-date / due / overdue).
          {fresh && ' We’ll load the rig master P&ID to start.'}
        </p>
        <label style={ml}>Inspection / reference date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inp} />
        <label style={ml}>Rig / Unit</label>
        <input type="text" value={rig} onChange={(e) => setRig(e.target.value)} placeholder="e.g. Rig 305" style={inp} />
        <label style={ml}>Inspector (optional)</label>
        <input type="text" value={who} onChange={(e) => setWho(e.target.value)} placeholder="Name" style={inp} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button style={primary}
            onClick={() => completeOnboarding({ date: date || new Date().toISOString().slice(0, 10), rig: rig.trim() || 'Rig', who: who.trim() })}>
            {fresh ? 'Start →' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

const chip: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, background: 'var(--panel2)', border: '1px solid var(--line2)', borderRadius: 8, padding: '6px 11px', cursor: 'pointer', fontSize: 12, color: 'var(--ink)' };
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(8,16,24,0.5)', display: 'grid', placeItems: 'center', zIndex: 100 };
const modal: React.CSSProperties = { background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 14, padding: 24, width: 380, boxShadow: 'var(--shadow)' };
const ml: React.CSSProperties = { display: 'block', fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: 1, color: 'var(--faint)', textTransform: 'uppercase', margin: '10px 0 4px', fontWeight: 600 };
const inp: React.CSSProperties = { width: '100%', background: 'var(--panel2)', border: '1px solid var(--line2)', color: 'var(--ink)', padding: '9px 10px', borderRadius: 7, fontFamily: 'var(--mono)', fontSize: 13 };
const primary: React.CSSProperties = { background: 'var(--accent)', color: '#fff', border: 0, borderRadius: 7, padding: '9px 18px', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
