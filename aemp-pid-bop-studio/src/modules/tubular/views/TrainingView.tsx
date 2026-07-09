// ============================================================================
//  Training — pixel-faithful port of the prototype's #view-training: the Your
//  Progress panel with copper progress bar, module rows with completion
//  checkboxes, and the 5-question Quick Knowledge Check. Progress persists in
//  training_progress against the authenticated user; two quiz items were
//  reworded to match production behavior (flagged deviation in the plan).
// ============================================================================
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../state/AuthContext';
import { useToast } from '../components/shell/Toast';

interface Module { id: string; slug: string; title: string; summary: string; position: number }
interface Progress { module_id: string; completed_at: string; score: number | null }

const QUIZ: Array<{ q: string; options: string[]; answer: number }> = [
  { q: 'Where is the tubular data stored?', options: ['In each browser', 'In the shared cloud database', 'In the Excel workbook', 'On the rig laptop only'], answer: 1 },
  { q: 'A unit shows SHORT when…', options: ['On-board exceeds contract', 'Serviceable stock (Premium + Class 2) is below the contract quantity', 'Scrap is recorded', 'No data was entered'], answer: 1 },
  { q: 'The final stage of a pipe order is…', options: ['Approved', 'Picked at Yard', 'In Transit', 'Delivered'], answer: 3 },
  { q: 'Who moves an order between stages?', options: ['It advances automatically on a timer', 'The requesting rig only', 'An authorized approver / logistics user, one explicit step at a time', 'Anyone signed in'], answer: 2 },
  { q: 'What does the Auto theme do?', options: ['Cycles hourly', 'Follows your device light/dark preference', 'Always dark', 'Matches the rig timezone'], answer: 1 },
];

export default function TrainingView() {
  const { session } = useAuth();
  const toast = useToast();
  const [modules, setModules] = useState<Module[]>([]);
  const [progress, setProgress] = useState<Map<string, Progress>>(new Map());
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [quizResult, setQuizResult] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !session) return;
    const [m, pr] = await Promise.all([
      supabase.from('training_modules').select('id, slug, title, summary, position').eq('active', true).order('position'),
      supabase.from('training_progress').select('module_id, completed_at, score').eq('user_id', session.user.id),
    ]);
    if (!m.error) setModules((m.data ?? []) as Module[]);
    if (!pr.error) setProgress(new Map(((pr.data ?? []) as Progress[]).map((x) => [x.module_id, x])));
  }, [session]);
  useEffect(() => { void load(); }, [load]);

  const setComplete = async (moduleId: string, complete: boolean, score?: number) => {
    if (!supabase || !session) return;
    if (complete) {
      const { error } = await supabase.from('training_progress').upsert({
        user_id: session.user.id, module_id: moduleId,
        completed_at: new Date().toISOString(), score: score ?? null,
      });
      if (error) { toast(error.message, 'error'); return; }
    } else {
      await supabase.from('training_progress').delete()
        .eq('user_id', session.user.id).eq('module_id', moduleId);
    }
    await load();
  };

  const submitQuiz = () => {
    const score = Math.round((QUIZ.reduce((n, q, i) => n + (answers[i] === q.answer ? 1 : 0), 0) / QUIZ.length) * 100);
    setQuizResult(score);
    const classMod = modules.find((m) => m.slug === 'api-rp-7g-classes');
    if (classMod) void setComplete(classMod.id, true, score);
  };

  const done = modules.filter((m) => progress.has(m.id)).length;
  const pctDone = modules.length ? Math.round((done / modules.length) * 100) : 0;
  const scoreBadge = quizResult == null ? null
    : quizResult >= 80 ? 'surplus' : quizResult >= 50 ? 'balanced' : 'short';

  return (
    <section className="view" id="view-training">
      <div className="section-head">
        <div className="section-title">Training</div>
        <div className="section-sub">Work through each module, then check your knowledge with the quiz</div>
      </div>

      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-head">
          <h3>Your Progress</h3>
          <span className="badge" id="training-progress-badge">{done} / {modules.length} complete</span>
        </div>
        <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', height: 10, borderRadius: 5, overflow: 'hidden' }}>
          <div id="training-progress-bar"
            style={{ width: `${pctDone}%`, height: '100%', background: 'linear-gradient(90deg, var(--copper), var(--copper-2))', transition: 'width .3s' }} />
        </div>
      </div>

      <div id="training-modules">
        {modules.map((m) => {
          const pr = progress.get(m.id);
          return (
            <div className="panel" key={m.id}
              style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
              <div>
                <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 13.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text)' }}>{m.title}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3 }}>{m.summary}</div>
                {pr && (
                  <div className="mono" style={{ fontSize: 10, color: 'var(--green)', marginTop: 4 }}>
                    completed {new Date(pr.completed_at).toLocaleDateString()}{pr.score != null ? ` · score ${pr.score}%` : ''}
                  </div>
                )}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: pr ? 'var(--green)' : 'var(--text-3)', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                <input type="checkbox" className="training-check" data-module={m.slug} checked={!!pr}
                  onChange={(e) => void setComplete(m.id, e.target.checked)} />
                {pr ? 'Completed' : 'Mark complete'}
              </label>
            </div>
          );
        })}
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-head">
          <h3>Quick Knowledge Check</h3>
          <span className="badge">5 questions</span>
        </div>
        <div id="training-quiz">
          {QUIZ.map((q, i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12.5, color: 'var(--text)', marginBottom: 8 }}>{i + 1}. {q.q}</div>
              <div style={{ display: 'grid', gap: 5 }}>
                {q.options.map((o, j) => (
                  <label key={j} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: answers[i] === j ? 'var(--copper-2)' : 'var(--text-2)', cursor: 'pointer' }}>
                    <input type="radio" name={`quiz-q${i}`} checked={answers[i] === j}
                      onChange={() => setAnswers((a) => ({ ...a, [i]: j }))} />
                    {o}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button className="btn sm" id="training-quiz-submit"
          disabled={Object.keys(answers).length < QUIZ.length} onClick={submitQuiz}>
          Check My Answers
        </button>
        {quizResult != null && (
          <span id="training-quiz-result" style={{ marginLeft: 12 }}>
            <span className={`st ${scoreBadge}`}>You scored {Math.round((quizResult / 100) * QUIZ.length)} / {QUIZ.length} ({quizResult}%)</span>
          </span>
        )}
      </div>
    </section>
  );
}
