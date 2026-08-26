import { Link, useLocation, useNavigate } from 'react-router-dom';
import ResultCard from '../components/ResultCard.jsx';

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

  const { results, summary } = state;
  return (
    <main className="page">
      <h1>채점 결과</h1>
      <p className="sub">
        총 {summary.total_score} / {summary.max_total}점 · O {summary.o} · △ {summary.triangle} · X {summary.x}
      </p>

      {results.map((r, i) => (
        <ResultCard key={r.attempt_id} result={r} index={i} total={results.length} />
      ))}

      <div className="btn-row">
        <button className="btn primary" onClick={() => navigate('/start')}>다시 풀기</button>
        <Link className="btn" to="/notes">오답노트 보기</Link>
        <Link className="btn ghost" to="/">홈으로</Link>
      </div>
    </main>
  );
}
