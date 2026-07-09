// ============================================================================
//  AI Assistant — pixel-faithful port of the prototype's #view-chat: two-column
//  chat-wrap (chat main with head/body/input + sidebar with Try Asking,
//  capabilities and limitations). Answers remain deterministic (assistant.ts)
//  over the caller's RLS-scoped records; limitations text updated to reflect
//  the cloud backend (truth deviation, flagged in the plan).
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTubular } from '../state/TubularContext';
import { fetchCatalog, fetchVisibleRecords, type CatalogItem, type TubularRecordRow } from '../lib/records';
import { answer, type AssistantAnswer } from '../lib/assistant';

interface ChatEntry {
  who: 'user' | 'ai';
  text: string;
  rows?: AssistantAnswer['rows'];
  time: string;
}

const SUGGESTIONS = [
  'Show me Rig 305 inventory',
  'Total premium 5" DP NC50 across the fleet',
  'Which rigs have scrap?',
  'How many drill pipes does Rig 205 have?',
  'Compare Rig 205 and Rig 305',
  'Which rigs are short of stock?',
  'What needs inspection?',
  'Last update for each rig',
  'Fleet summary',
  'Show me drill collars',
];

const CAPABILITIES = [
  'Counts & totals by rig, tubular or class',
  'Surplus vs. shortfall analysis',
  'Items needing inspection',
  'Rig comparisons',
  '"Where is X" — find locations',
  'Last update dates per unit',
  'API RP 7G classifications',
];

const LIMITATIONS = [
  'Answers only from your authorized data',
  'No external lookups',
  'Read-only (use Data Entry to update)',
];

const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function AssistantView() {
  const { units } = useTubular();
  const [records, setRecords] = useState<TubularRecordRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [chat, setChat] = useState<ChatEntry[]>([{
    who: 'ai',
    time: now(),
    text: 'Hello! I\'m your inventory assistant. I answer from the live tubular data your account can see — your authorized units only. Try one of the suggestions, or ask about counts, shortfalls, scrap, inspections or rig comparisons.',
  }]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void Promise.all([fetchCatalog(), fetchVisibleRecords()])
      .then(([c, r]) => { setCatalog(c); setRecords(r); })
      .catch(() => undefined);
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat, typing]);

  const ctx = useMemo(() => ({
    records, catalog,
    unitNames: new Map(units.map((u) => [u.id, u.name])),
  }), [records, catalog, units]);

  const ask = (q?: string) => {
    const question = (q ?? input).trim();
    if (!question || typing) return;
    setChat((c) => [...c, { who: 'user', text: question, time: now() }]);
    setInput('');
    setTyping(true);
    const a = answer(question, ctx);
    setTimeout(() => {
      setTyping(false);
      setChat((c) => [...c, { who: 'ai', text: a.text, rows: a.rows, time: now() }]);
    }, 300);
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      ask();
    }
  };

  return (
    <section className="view" id="view-chat">
      <div className="section-head">
        <div className="section-title">AI Assistant</div>
        <div className="section-sub">Ask questions about your inventory · deterministic · data-bound</div>
      </div>

      <div className="chat-wrap">
        <div className="chat-main">
          <div className="chat-head">
            <div className="title"><span className="ai-dot" />Abraj Inventory Assistant</div>
            <div className="meta">Cloud · Read-only · v1.0</div>
          </div>
          <div className="chat-body" id="chat-body">
            {chat.map((m, i) => (
              <div key={i} className={`msg ${m.who}`}>
                <div className="avatar">{m.who === 'ai' ? 'A' : 'U'}</div>
                <div className="bubble">
                  {m.text}
                  {m.rows && m.rows.length > 0 && (
                    <table>
                      <thead><tr><th>Unit</th><th>Tubular</th><th>Detail</th></tr></thead>
                      <tbody>
                        {m.rows.map((r, j) => (
                          <tr key={j}>
                            <td className="mono">{r.unit}</td>
                            <td>{r.description}</td>
                            <td className="mono">{r.detail}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <div className="time">{m.time}</div>
                </div>
              </div>
            ))}
            {typing && (
              <div className="msg ai">
                <div className="avatar">A</div>
                <div className="typing-indicator"><span /><span /><span /></div>
              </div>
            )}
            <div ref={endRef} />
          </div>
          <div className="chat-input-wrap">
            <div className="chat-input-row">
              <textarea id="chat-input" rows={1} value={input}
                placeholder="Ask about tubulars, rigs, classifications…  (Enter to send · Shift+Enter for newline)"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKey} />
              <button id="chat-send" disabled={typing || !input.trim()} onClick={() => ask()}>Send</button>
            </div>
          </div>
        </div>

        <aside className="chat-side">
          <div>
            <h4>Try Asking</h4>
            <div className="suggest-list" id="suggest-list">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="suggest" onClick={() => ask(s)}>{s}</button>
              ))}
            </div>
          </div>
          <div>
            <h4>What I Can Help With</h4>
            <ul className="ai-cap-list">
              {CAPABILITIES.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </div>
          <div>
            <h4>Limitations</h4>
            <ul className="ai-cap-list">
              {LIMITATIONS.map((l) => <li key={l}>{l}</li>)}
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}
