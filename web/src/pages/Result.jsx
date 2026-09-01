import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import ResultCard from '../components/ResultCard.jsx';
import api from '../api.js';

export default function Result() {
  const { state } = useLocation();
  const navigate = useNavigate();

  if (!state?.results) {
    return (
      <main className="page">
        <h1>채점 결과</h1>
        <div className="empty">표시할 채점 결과가 없습니다.</div>
        <button className="btn primary" onClick={() => navigate('/')}>홈으로</button>
      </main>
    );
  }

  const { results, summary, mode = 'exam', count = results.length } = state;
  const modeName = mode === 'exam' ? '시험 모드' : '연습 모드';
  const [counted, setCounted] = useState(
    () => Object.fromEntries(results.map((r) => [r.attempt_id, mode === 'exam']))
  );
  const [error, setError] = useState(null);

  async function toggleCounted(attemptId) {
    const next = !counted[attemptId];
    setCounted((prev) => ({ ...prev, [attemptId]: next }));
    try {
      await api.setAttemptCounted(attemptId, next);
    } catch (e) {
      setCounted((prev) => ({ ...prev, [attemptId]: !next })); // 실패하면 되돌린다
      setError(e.message);
    }
  }

  const excluded = results.filter((r) => !counted[r.attempt_id]).length;

  return (
    <main className="page">
      <h1>채점 결과</h1>
      <p className="sub">
        <span className={`mode-badge${mode === 'exam' ? ' exam' : ''}`}>
          {mode === 'exam' ? '시험 모드' : '연습 모드'}
        </span>{' '}
        총 {summary.total_score} / {summary.max_total}점 · O {summary.o} · △ {summary.triangle} · X {summary.x}
      </p>

      {error && <div className="error">{error}</div>}

      {mode === 'practice' ? (
        <div className="notice">연습 모드라 오답노트에 기록되지 않았습니다.</div>
      ) : (
        <div className="notice">
          틀린 문제가 오답노트에 기록되었습니다.
          채점이 잘못됐다고 판단되면 문제별 <strong>오답노트에서 빼기</strong> 를 누르세요.
          {excluded > 0 && ` (현재 ${excluded}개 제외됨)`}
        </div>
      )}

      {results.map((r, i) => (
        <ResultCard
          key={r.attempt_id}
          result={r}
          index={i}
          total={results.length}
          counted={mode === 'exam' ? counted[r.attempt_id] : null}
          onToggleCounted={mode === 'exam' ? () => toggleCounted(r.attempt_id) : null}
        />
      ))}

      <div className="btn-row">
        <button
          className="btn primary"
          onClick={() => navigate(`/solve?count=${count}&mode=${mode}`, { replace: true })}
        >
          새 문제 풀기 ({modeName} · {count}문제)
        </button>
        <button className="btn" onClick={() => navigate('/start')}>모드·개수 바꾸기</button>
        <Link className="btn" to="/notes">오답노트 보기</Link>
        <Link className="btn ghost" to="/">홈으로</Link>
      </div>
    </main>
  );
}
