// ============================================================================
//  Training — modules + completion stored against the authenticated user in
//  training_progress (never browser-local). Includes a scored quiz for the
//  classification module; privileged users can see everyone's completion via
//  RLS (reporting arrives later).
// ============================================================================
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../state/AuthContext';

interface Module { id: string; slug: string; title: string; summary: string; position: number }
interface Progress { module_id: string; completed_at: string; score: number | null }

const QUIZ: Array<{ q: string; options: string[]; answer: number }> = [
  { q: 'Premium class requires remaining wall thickness of at least…', options: ['60%', '70%', '80%', '90%'], answer: 2 },
  { q: 'One Yellow Band + two centre punch marks means…', options: ['Premium', 'Class 2', 'Class 3', 'Scrap'], answer: 1 },
  { q: 'Which classes count toward contract serviceability?', options: ['Premium only', 'Premium + Class 2', 'Premium + Class 2 + Class 3', 'Everything on board'], answer: 1 },
  { q: 'A red band on the tool joint means…', options: ['Field repairable', 'Needs inspection', 'Scrap / shop repair', 'New pipe'], answer: 2 },
  { q: 'Zone C covers…', options: ['Pipe body', 'Tool joint', 'The transition/upset area', 'The bore'], answer: 2 },
];

const card: React.CSSProperties = { background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 10, padding: 14 };

export default function TrainingView() {
  const { session } = useAuth();
  const [modules, setModules] = useState<Module[]>([]);
  const [progress, setProgress] = useState<Map<string, Progress>>(new Map());
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [quizResult, setQuizResult] = useState<number | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!supabase || !session) return;
    const [m, pr] = await Promise.all([
      supabase.from('training_modules').select('id, slug, title, summary, position').eq('active', true).order('position'),
      supabase.from('training_progress').select('module_id, completed_at, score').eq('user_id', session.user.id),
    ]);
    if (m.error) { setError(m.error.message); return; }
    setModules((m.data ?? []) as Module[]);
    setProgress(new Map(((pr.data ?? []) as Progress[]).map((x) => [x.module_id, x])));
  }, [session]);

  useEffect(() => { void load(); }, [load]);

  const complete = async (moduleId: string, score?: number) => {
    if (!supabase || !session) return;
    setError('');
    const { error: e } = await supabase.from('training_progress').upsert({
      user_id: session.user.id, module_id: moduleId,
      completed_at: new Date().toISOString(), score: score ?? null,
    });
    if (e) setError(e.message); else await load();
  };

  const submitQuiz = () => {
    const score = Math.round((QUIZ.reduce((n, q, i) => n + (answers[i] === q.answer ? 1 : 0), 0) / QUIZ.length) * 100);
    setQuizResult(score);
    const classMod = modules.find((m) => m.slug === 'api-rp-7g-classes');
    if (classMod) void complete(classMod.id, score);
  };

  const done = modules.filter((m) => progress.has(m.id)).length;

  return (
    <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: '16px 24px', maxWidth: 900 }}>
      {error && <div role="alert" style={{ color: 'var(--red)', fontSize: 13, marginBottom: 8 }}>{error}</div>}
      <h2 style={{ fontFamily: 'var(--disp)', margin: '0 0 4px' }}>Training</h2>
      <p style={{ color: 'var(--dim)', fontSize: 13, marginTop: 0 }}>
        {done}/{modules.length} modules completed — progress is saved to your account.
      </p>

      <div style={{ display: 'grid', gap: 10 }}>
        {modules.map((m) => {
          const pr = progress.get(m.id);
          return (
            <div key={m.id} style={{ ...card, display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 20 }} aria-hidden>{pr ? '✅' : '📘'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontFamily: 'var(--disp)' }}>{m.title}</div>
                <div style={{ color: 'var(--dim)', fontSize: 12.5 }}>{m.summary}</div>
                {pr && (
                  <div style={{ color: 'var(--green)', fontSize: 11.5, fontFamily: 'var(--mono)' }}>
                    completed {new Date(pr.completed_at).toLocaleDateString()}{pr.score != null ? ` · score ${pr.score}%` : ''}
                  </div>
                )}
              </div>
              {!pr && (
                <button onClick={() => void complete(m.id)}
                  style={{ border: '1px solid var(--line2)', background: 'var(--panel)', color: 'var(--accent)', padding: '6px 12px', borderRadius: 7, cursor: 'pointer', fontWeight: 600 }}>
                  Mark complete
                </button>
              )}
            </div>
          );
        })}
      </div>

      <h3 style={{ fontFamily: 'var(--disp)', margin: '24px 0 8px' }}>Classification quiz</h3>
      <div style={{ display: 'grid', gap: 12 }}>
        {QUIZ.map((q, i) => (
          <div key={i} style={card}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>{i + 1}. {q.q}</div>
            <div style={{ display: 'grid', gap: 4 }}>
              {q.options.map((o, j) => (
                <label key={j} style={{ fontSize: 13, color: answers[i] === j ? 'var(--accent)' : 'var(--dim)', cursor: 'pointer' }}>
                  <input type="radio" name={`q${i}`} checked={answers[i] === j}
                    onChange={() => setAnswers((a) => ({ ...a, [i]: j }))} /> {o}
                </label>
              ))}
            </div>
          </div>
        ))}
        <div>
          <button disabled={Object.keys(answers).length < QUIZ.length} onClick={submitQuiz}
            style={{ border: 0, background: 'var(--accent)', color: '#fff', padding: '8px 18px', borderRadius: 7, fontWeight: 700, cursor: 'pointer' }}>
            Submit quiz
          </button>
          {quizResult != null && (
            <span style={{ marginLeft: 12, fontWeight: 700, color: quizResult >= 80 ? 'var(--green)' : 'var(--amber)' }}>
              Score: {quizResult}% {quizResult >= 80 ? '— passed' : '— review the reference and retry'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
