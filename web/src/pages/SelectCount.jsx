import { useNavigate } from 'react-router-dom';
import { usePack } from '../PackContext.jsx';

const COUNTS = [1, 5, 10];

export default function SelectCount() {
  const navigate = useNavigate();
  const { activePack } = usePack();
  const available = activePack?.question_count ?? 0;

  return (
    <main className="page">
      <h1>몇 문제를 풀까요?</h1>
      <p className="sub">
        {activePack ? `${activePack.name} · 등록된 문제 ${available}개` : '활성 팩이 없습니다.'}
      </p>

      <div className="choice-grid">
        {COUNTS.map((n) => (
          <button
            key={n}
            className="choice"
            disabled={available === 0}
            onClick={() => navigate(`/solve?count=${n}`)}
          >
            <span className="big">{n}</span>
            <span className="label">{n}문제</span>
          </button>
        ))}
      </div>
      {available > 0 && available < 10 && (
        <p className="muted" style={{ marginTop: 14 }}>
          등록된 문제보다 많이 고르면 있는 만큼만 출제됩니다.
        </p>
      )}
    </main>
  );
}
