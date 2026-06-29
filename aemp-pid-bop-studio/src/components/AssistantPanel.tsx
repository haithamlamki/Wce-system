// AI assistant panel (PRD FR-47, preview). Drives the deterministic planner in
// lib/assistant.ts and applies its actions to the live project. Slide-in drawer
// toggled from the header.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../state/ProjectContext';
import { ASSISTANT_SAMPLES, interpret, type AssistantAction } from '../lib/assistant';

interface Msg { who: 'you' | 'ai'; text: string }

export default function AssistantPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const p = useProject();
  const navigate = useNavigate();
  const [log, setLog] = useState<Msg[]>([{ who: 'ai', text: 'Hi — I can draft your P&ID. Try one of the prompts below.' }]);
  const [text, setText] = useState('');

  if (!open) return null;

  async function run(action: AssistantAction) {
    switch (action.kind) {
      case 'master': p.loadMaster(); navigate('/full'); break;
      case 'import': await p.importAEMP(); navigate('/full'); break;
      case 'bop': p.buildBop(action.section); navigate('/bop'); break;
      case 'clear': p.setProject({ ...p.project, nodes: [], edges: [], pipes: [] }); navigate('/full'); break;
      case 'place': {
        navigate('/full');
        for (let i = 0; i < action.count; i++) p.addNode(action.type, 200 + (i % 4) * 140, 200 + Math.floor(i / 4) * 120);
        break;
      }
      case 'none': break;
    }
  }

  async function submit(value: string) {
    const v = value.trim();
    if (!v) return;
    setText('');
    const plan = interpret(v);
    setLog((l) => [...l, { who: 'you', text: v }, { who: 'ai', text: plan.reply }]);
    await run(plan.action);
  }

  return (
    <div style={drawer}>
      <div style={head}>
        <span style={{ fontFamily: 'var(--disp)', fontWeight: 700 }}>✦ AI Assistant <small style={{ color: 'var(--faint)', fontWeight: 400 }}>preview</small></span>
        <button onClick={onClose} style={x}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {log.map((m, i) => (
          <div key={i} style={{ alignSelf: m.who === 'you' ? 'flex-end' : 'flex-start', maxWidth: '85%', padding: '8px 11px', borderRadius: 10, fontSize: 13, lineHeight: 1.5,
            background: m.who === 'you' ? 'var(--accent)' : 'var(--panel2)', color: m.who === 'you' ? '#fff' : 'var(--ink)', border: m.who === 'you' ? 0 : '1px solid var(--line2)' }}>
            {m.text}
          </div>
        ))}
      </div>

      <div style={{ padding: '0 14px 8px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {ASSISTANT_SAMPLES.map((s) => (
          <button key={s} onClick={() => submit(s)} style={chip}>{s}</button>
        ))}
      </div>

      <form style={{ padding: 14, borderTop: '1px solid var(--line2)', display: 'flex', gap: 8 }}
        onSubmit={(e) => { e.preventDefault(); submit(text); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Describe a diagram…" style={inp} />
        <button type="submit" style={send}>Send</button>
      </form>

      <div style={{ padding: '0 14px 12px', fontSize: 10.5, color: 'var(--faint)', lineHeight: 1.5 }}>
        Preview uses a deterministic planner. Production (FR-48) runs against AEMP’s model.
      </div>
    </div>
  );
}

const drawer: React.CSSProperties = { position: 'fixed', top: 56, right: 0, bottom: 0, width: 340, background: 'var(--panel)', borderLeft: '1px solid var(--line2)', boxShadow: 'var(--shadow)', zIndex: 60, display: 'flex', flexDirection: 'column' };
const head: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid var(--line2)' };
const x: React.CSSProperties = { border: 0, background: 'transparent', color: 'var(--dim)', fontSize: 16, cursor: 'pointer' };
const chip: React.CSSProperties = { background: 'var(--panel2)', border: '1px solid var(--line2)', color: 'var(--dim)', borderRadius: 14, padding: '5px 10px', fontSize: 11.5, cursor: 'pointer' };
const inp: React.CSSProperties = { flex: 1, background: 'var(--panel2)', border: '1px solid var(--line2)', color: 'var(--ink)', padding: '9px 10px', borderRadius: 7, fontSize: 13 };
const send: React.CSSProperties = { background: 'var(--accent)', color: '#fff', border: 0, borderRadius: 7, padding: '0 14px', fontWeight: 600, cursor: 'pointer' };
