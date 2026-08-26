import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api.js';

export default function Solve() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const count = Number(params.get('count')) || 1;

  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [status, setStatus] = useState('loading'); // loading | ready | submitting
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .startQuiz(count)
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
  }, [count]);

  const answered = questions.filter((q) => (answers[q.question_id] ?? '').trim()).length;

  async function submit() {
    if (answered === 0 && !confirm('작성한 답안이 없습니다. 그대로 제출할까요?')) return;
    setStatus('submitting');
    setError(null);
    try {
      const payload = questions.map((q) => ({
        question_id: q.question_id,
        answer_text: answers[q.question_id] ?? '',
      }));
      const data = await api.submitAnswers(payload);
      navigate('/result', { state: data, replace: true });
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
        {questions.length}문제 · 작성 {answered}/{questions.length}
        {questions.length < count && ' · 등록된 문제가 부족해 있는 만큼만 출제했습니다.'}
      </p>
      {error && <div className="error">{error}</div>}

      {questions.length === 0 ? (
        <div className="empty">출제할 문제가 없습니다.</div>
      ) : (
        questions.map((q, i) => (
          <section className="card" key={q.question_id}>
            <div className="q-meta">
              문제 {i + 1} / {questions.length}
              {q.year_round ? ` · ${q.year_round}` : ''}
              {q.required_count ? ` · ${q.required_count}가지 요구` : ''} · 배점 {q.max_score}점
            </div>
            <p className="q-text">{q.question_text}</p>
            <textarea
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
