import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePack } from '../PackContext.jsx';

const COUNTS = [1, 5, 10];

const MODES = [
  {
    key: 'practice',
    label: '연습 모드',
    hint: '오답노트에 기록되지 않습니다. 부담 없이 여러 번 풀어보세요.',
  },
  {
    key: 'exam',
    label: '시험 모드',
    hint: '틀린 문제가 오답노트에 누적됩니다. 실력을 점검할 때 쓰세요.',
  },
];

export default function SelectCount() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('practice');
  const { activePack } = usePack();
  // 채점 기준이 있는 문제만 출제 대상이다.
  const available = activePack?.ready_count ?? 0;
  const excluded = (activePack?.question_count ?? 0) - available;

  return (
    <main className="page">
      <h1>문제 풀기</h1>
      <p className="sub">
        {activePack ? `${activePack.name} · 출제 가능한 문제 ${available}개` : '활성 팩이 없습니다.'}
        {excluded > 0 && ` · 채점 기준이 없어 제외된 문제 ${excluded}개`}
      </p>

      <h2>어떻게 풀까요?</h2>
      <div className="mode-grid">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            className={`mode-card${mode === m.key ? ' selected' : ''}`}
            onClick={() => setMode(m.key)}
          >
            <span className="mode-name">{m.label}</span>
            <span className="mode-hint">{m.hint}</span>
          </button>
        ))}
      </div>

      <h2>몇 문제를 풀까요?</h2>
      <div className="choice-grid">
        {COUNTS.map((n) => (
          <button
            key={n}
            className="choice"
            disabled={available === 0}
            onClick={() => navigate(`/solve?count=${n}&mode=${mode}`)}
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
