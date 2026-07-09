// ============================================================================
//  AI Assistant (deterministic v1 — approved decision). Answers are computed
//  by assistant.ts over the caller's RLS-scoped records: no LLM, no external
//  calls, no invented quantities. Each answer can show its backing records.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTubular } from '../state/TubularContext';
import { fetchCatalog, fetchVisibleRecords, type CatalogItem, type TubularRecordRow } from '../lib/records';
import { answer, type AssistantAnswer } from '../lib/assistant';

interface ChatEntry { who: 'you' | 'assistant'; text: string; rows?: AssistantAnswer['rows'] }

export default function AssistantView() {
  const { units } = useTubular();
  const [records, setRecords] = useState<TubularRecordRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [chat, setChat] = useState<ChatEntry[]>([{
    who: 'assistant',
    text: 'I answer from your live tubular data (your authorized units only). Try "fleet summary", "what is short of contract", "scrap", or "Rig 105".',
  }]);
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void Promise.all([fetchCatalog(), fetchVisibleRecords()])
      .then(([c, r]) => { setCatalog(c); setRecords(r); })
      .catch(() => undefined);
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat]);

  const ctx = useMemo(() => ({
    records, catalog,
    unitNames: new Map(units.map((u) => [u.id, u.name])),
  }), [records, catalog, units]);

  const ask = () => {
    const q = input.trim();
    if (!q) return;
    const a = answer(q, ctx);
    setChat((c) => [...c, { who: 'you', text: q }, { who: 'assistant', text: a.text, rows: a.rows }]);
    setInput('');
  };

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', maxWidth: 860, margin: '0 auto', width: '100%' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'grid', gap: 10, alignContent: 'start' }}>
        {chat.map((e, i) => (
          <div key={i} style={{
            justifySelf: e.who === 'you' ? 'end' : 'start', maxWidth: '85%',
            background: e.who === 'you' ? 'var(--accent)' : 'var(--panel)',
            color: e.who === 'you' ? '#fff' : 'var(--ink)',
            border: e.who === 'you' ? 0 : '1px solid var(--line2)',
            borderRadius: 12, padding: '9px 13px', fontSize: 13.5, lineHeight: 1.55,
          }}>
            {e.text}
            {e.rows && e.rows.length > 0 && (
              <table style={{ borderCollapse: 'collapse', marginTop: 8, fontSize: 12 }}>
                <tbody>
                  {e.rows.map((r, j) => (
                    <tr key={j}>
                      <td style={{ border: '1px solid var(--line)', padding: '3px 8px', fontFamily: 'var(--mono)' }}>{r.unit}</td>
                      <td style={{ border: '1px solid var(--line)', padding: '3px 8px' }}>{r.description}</td>
                      <td style={{ border: '1px solid var(--line)', padding: '3px 8px', fontFamily: 'var(--mono)' }}>{r.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '10px 16px 16px' }}>
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') ask(); }}
          placeholder="Ask about your tubular fleet…"
          style={{ flex: 1, background: 'var(--panel)', color: 'var(--ink)', border: '1px solid var(--line2)', borderRadius: 9, padding: '10px 13px', fontSize: 13.5 }} />
        <button onClick={ask}
          style={{ border: 0, background: 'var(--accent)', color: '#fff', padding: '0 20px', borderRadius: 9, fontWeight: 700, cursor: 'pointer' }}>
          Ask
        </button>
      </div>
    </div>
  );
}
