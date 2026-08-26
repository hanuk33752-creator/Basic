import { Link, useNavigate } from 'react-router-dom';
import { usePack } from '../PackContext.jsx';

export default function Home() {
  const { activePack, loading } = usePack();
  const navigate = useNavigate();

  return (
    <main className="page">
      <h1>무엇을 할까요?</h1>
      <p className="sub">
        {loading
          ? '불러오는 중…'
          : activePack
            ? `현재 활성 팩: ${activePack.name} · 문제 ${activePack.question_count}개`
            : '아직 자격증 팩이 없습니다. 문제 관리에서 먼저 등록해 주세요.'}
      </p>

      {!loading && !activePack && (
        <div className="notice">
          <Link to="/manage">문제 관리</Link>로 이동해 문서를 업로드하고 자격증 팩을 만들어 주세요.
        </div>
      )}

      <div className="choice-grid">
        <button
          className="choice"
          onClick={() => navigate('/start')}
          disabled={!activePack || activePack.question_count === 0}
        >
          <span className="big">✏️</span>
          <span className="label">문제 풀기</span>
        </button>
        <button className="choice" onClick={() => navigate('/notes')}>
          <span className="big">📕</span>
          <span className="label">오답노트 확인</span>
        </button>
      </div>
    </main>
  );
}
