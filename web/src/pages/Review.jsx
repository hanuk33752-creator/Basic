import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api.js';
import { usePack } from '../PackContext.jsx';

const COUNTS = [1, 5, 10];

const PERIODS = [
  { key: 'all', label: '전체 기간' },
  { key: 'today', label: '오늘' },
  { key: '7d', label: '최근 7일' },
  { key: '30d', label: '최근 30일' },
  { key: 'month', label: '이번 달' },
];

const THRESHOLDS = [
  { key: 1, label: '오답 전체', hint: '한 번이라도 틀린 문제' },
  { key: 3, label: '3회 이상', hint: '세 번 넘게 틀린 문제' },
  { key: 5, label: '5회 이상', hint: '다섯 번 넘게 틀린 문제' },
  { key: 10, label: '10회 이상', hint: '열 번 넘게 틀린 문제' },
];

const MODES = [
  { key: 'practice', label: '연습 모드', hint: '오답노트에 기록되지 않습니다.' },
  { key: 'exam', label: '시험 모드', hint: '결과가 오답노트에 반영됩니다.' },
];

export default function Review() {
  const navigate = useNavigate();
  const { activePack } = usePack();
  const [period, setPeriod] = useState('all');
  const [minWrong, setMinWrong] = useState(1);
  const [mode, setMode] = useState('practice');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setRows(null);
    setError(null);
    try {
      const data = await api.listNotes(period);
      setRows(data.rows);
    } catch (e) {
      setError(e.message);
      setRows([]);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load, activePack]);

  // 오답노트 목록에 이미 문제별 오답 횟수가 들어 있어 따로 조회할 필요가 없다.
  const counts = useMemo(() => {
    const source = rows ?? [];
    return Object.fromEntries(
      THRESHOLDS.map((t) => [t.key, source.filter((r) => r.wrong_count >= t.key).length])
    );
  }, [rows]);

  const available = counts[minWrong] ?? 0;

  return (
    <main className="page">
      <h1>오답 다시 풀기</h1>
      <p className="sub">
        {activePack ? `${activePack.name} · 오답노트에 쌓인 문제만 출제합니다.` : '활성 팩이 없습니다.'}
      </p>
      {error && <div className="error">{error}</div>}

      <h2>어느 기간의 오답을?</h2>
      <div className="filter-row">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            className={`btn sm ${period === p.key ? 'active' : ''}`}
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <h2>몇 번 이상 틀린 문제를?</h2>
      <div className="mode-grid">
        {THRESHOLDS.map((t) => {
          const n = counts[t.key] ?? 0;
          return (
            <button
              key={t.key}
              type="button"
              className={`mode-card${minWrong === t.key ? ' selected' : ''}`}
              onClick={() => setMinWrong(t.key)}
              disabled={rows !== null && n === 0}
            >
              <span className="mode-name">
                {t.label} <span className="count-badge">{rows === null ? '…' : `${n}문제`}</span>
              </span>
              <span className="mode-hint">{t.hint}</span>
            </button>
          );
        })}
      </div>

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
      {rows !== null && available === 0 ? (
        <div className="empty">
          조건에 맞는 오답이 없습니다. 기간이나 횟수 조건을 바꿔 보세요.
          <div style={{ marginTop: 12 }}>
            <Link className="btn" to="/start">일반 출제로 풀기</Link>
          </div>
        </div>
      ) : (
        <>
          <div className="choice-grid">
            {COUNTS.map((n) => (
              <button
                key={n}
                className="choice"
                disabled={available === 0}
                onClick={() =>
                  navigate(`/solve?count=${n}&mode=${mode}&source=notes&period=${period}&minWrong=${minWrong}`)
                }
              >
                <span className="big">{n}</span>
                <span className="label">{n}문제</span>
              </button>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 14 }}>
            조건에 맞는 문제 {available}개 중에서 뽑습니다. 더 많이 고르면 있는 만큼만 출제됩니다.
          </p>
        </>
      )}
    </main>
  );
}
