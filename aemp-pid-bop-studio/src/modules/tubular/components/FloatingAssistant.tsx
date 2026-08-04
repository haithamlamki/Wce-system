// ============================================================================
//  Floating AI Assistant — collapsible bottom-right chat bubble available on
//  every Tubular page (replaces the old /tubular/assistant page). Same
//  deterministic engine (lib/assistant.ts) over the caller's RLS-scoped
//  records; data loads lazily on first open.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTubular } from '../state/TubularContext';
import { fetchCatalog, fetchVisibleRecords, type CatalogItem, type TubularRecordRow } from '../lib/records';
import { answer, type AssistantAnswer } from '../lib/assistant';

interface ChatEntry { who: 'user' | 'ai'; text: string; rows?: AssistantAnswer['rows']; time: string }

const SUGGESTIONS = ['Fleet summary', 'Which rigs have scrap?', 'Which rigs are short of stock?', 'What needs inspection?'];

const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function FloatingAssistant() {
  const { enabled, canAccess, units } = useTubular();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [records, setRecords] = useState<TubularRecordRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [chat, setChat] = useState<ChatEntry[]>([{
    who: 'ai', time: now(),
    text: 'Hello — ask me anything about your tubular fleet data: counts, classifications, surplus/shortfall, which rigs have what.',
  }]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || loaded) return;
    setLoaded(true);
    void Promise.all([fetchCatalog(), fetchVisibleRecords()])
      .then(([c, r]) => { setCatalog(c); setRecords(r); })
      .catch(() => setLoaded(false));
  }, [open, loaded]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat, typing, open]);

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

  if (!enabled || !canAccess) return null;

  return (
    <>
      {open && (
        <div className="ai-float" role="dialog" aria-label="AI Assistant">
          <div className="ai-float-head">
            <div className="title"><span className="ai-dot" />Abraj Inventory Assistant</div>
            <button className="ai-float-min" onClick={() => setOpen(false)} aria-label="Minimize assistant">—</button>
          </div>
          <div className="ai-float-body">
            {chat.map((m, i) => (
              <div key={i} className={`msg ${m.who}`}>
                <div className="avatar">{m.who === 'ai' ? 'A' : 'U'}</div>
                <div className="bubble">
                  <span style={{ whiteSpace: 'pre-line' }}>{m.text}</span>
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
          <div className="ai-float-suggest">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="suggest" onClick={() => ask(s)}>{s}</button>
            ))}
          </div>
          <div className="ai-float-input">
            <textarea rows={1} value={input}
              placeholder="Ask about tubulars, rigs, classes…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey} />
            <button disabled={typing || !input.trim()} onClick={() => ask()}>Send</button>
          </div>
        </div>
      )}
      <button className="ai-fab" onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close AI Assistant' : 'Open AI Assistant'}
        title="AI Assistant">◈</button>
    </>
  );
}
