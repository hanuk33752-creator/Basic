import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api.js';

export default function Solve() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  // count=all 은 조건에 맞는 문제를 한 사이클로 전부 푸는 모드다.
  const rawCount = params.get('count');
  const fullCycle = rawCount === 'all';
  const count = fullCycle ? 'all' : Number(rawCount) || 1;
  const mode = params.get('mode') === 'exam' ? 'exam' : 'practice';
  const rawSource = params.get('source');
  const source = rawSource === 'notes' || rawSource === 'unsolved' ? rawSource : 'all';
  const period = params.get('period') ?? 'all';
  const minWrong = Number(params.get('minWrong')) || 1;

  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [status, setStatus] = useState('loading'); // loading | ready | submitting
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .startQuiz(count, source === 'notes' ? { source, period, minWrong } : { source })
      .then((data) => {
        if (cancelled) return;
        setQuestions(data.questions);
        setAnswers(Object.fromEntries(data.questions.map((q) => [q.question_id, ''])));
        setStatus('ready');
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message);
        setStatus('ready');
      });
    return () => { cancelled = true; };
  }, [count, source, period, minWrong]);

  const answered = questions.filter((q) => (answers[q.question_id] ?? '').trim()).length;

  async function submit() {
    if (answered === 0 && !confirm('작성한 답안이 없습니다. 그대로 제출할까요?')) return;
    // 한 사이클은 문제가 많아 빈칸을 못 보고 내리기 쉽다. 남은 칸 수를 먼저 알려준다.
    const blank = questions.length - answered;
    if (
      answered > 0 &&
      blank > 0 &&
      fullCycle &&
      !confirm(`아직 ${blank}문제가 비어 있습니다. 그대로 제출할까요?`)
    ) {
      return;
    }
    setStatus('submitting');
    setError(null);
    try {
      const payload = questions.map((q) => ({
        question_id: q.question_id,
        answer_text: answers[q.question_id] ?? '',
      }));
      const data = await api.submitAnswers(payload, mode);
      navigate('/result', {
        state: {
          ...data,
          count,
          source,
          review: source === 'notes' ? { period, minWrong } : null,
        },
        replace: true,
      });
    } catch (e) {
      setError(e.message);
      setStatus('ready');
    }
  }

  if (status === 'loading') {
    return <main className="page"><p className="muted"><span className="spinner">⏳</span> 문제를 뽑는 중…</p></main>;
  }

  return (
    <main className="page">
      <h1>문제 풀이</h1>
      <p className="sub">
        <span className={`mode-badge${mode === 'exam' ? ' exam' : ''}`}>
          {mode === 'exam' ? '시험 모드' : '연습 모드'}
        </span>{' '}
        {source === 'notes' && <span className="mode-badge">오답 복습</span>}
        {source === 'unsolved' && <span className="mode-badge">오늘 안 푼 문제</span>}
        {source !== 'all' ? ' ' : ''}
        {fullCycle && <span className="mode-badge">한 사이클 전부</span>}
        {fullCycle ? ' ' : ''}
        {questions.length}문제 · 작성 {answered}/{questions.length}
        {!fullCycle && questions.length < count && ' · 조건에 맞는 문제가 부족해 있는 만큼만 출제했습니다.'}
      </p>
      {mode === 'practice' && (
        <p className="muted" style={{ marginTop: -12, marginBottom: 16 }}>
          연습 모드입니다. 채점은 되지만 오답노트에는 기록되지 않습니다.
        </p>
      )}
      {error && <div className="error">{error}</div>}

      {questions.length === 0 ? (
        <div className="empty">출제할 문제가 없습니다.</div>
      ) : (
        questions.map((q, i) => (
          <section className="card" key={q.question_id}>
            <div className="q-meta">
              문제 {i + 1} / {questions.length} · {q.source_no ? `${q.source_no}번` : `#${q.question_id}`}
              {q.required_count ? ` · ${q.required_count}가지 요구` : ''} · 배점 {q.max_score}점
            </div>
            <p className="q-text">{q.question_text}</p>
            <textarea
              className="answer-input"
              value={answers[q.question_id] ?? ''}
              placeholder={
                q.required_count
                  ? `${q.required_count}가지 항목을 각각 서술해 주세요.`
                  : '답안을 서술해 주세요.'
              }
              onChange={(e) => setAnswers((prev) => ({ ...prev, [q.question_id]: e.target.value }))}
              disabled={status === 'submitting'}
            />
          </section>
        ))
      )}

      {questions.length > 0 && (
        <div className="btn-row">
          <button className="btn primary block" disabled={status === 'submitting'} onClick={submit}>
            {status === 'submitting' ? '채점 중… (AI 채점은 몇 초 걸립니다)' : '전체 제출하고 채점받기'}
          </button>
        </div>
      )}
    </main>
  );
}
