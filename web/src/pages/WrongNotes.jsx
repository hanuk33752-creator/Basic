import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api.js';
import { usePack } from '../PackContext.jsx';
import { VERDICT_MARK } from '../components/ResultCard.jsx';

const PERIODS = [
  { key: 'all', label: '전체' },
  { key: '7d', label: '최근 7일' },
  { key: '30d', label: '최근 30일' },
  { key: 'month', label: '이번 달' },
];

export default function WrongNotes() {
  const { activePack } = usePack();
  const [period, setPeriod] = useState('all');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.listNotes(period));
    } catch (e) {
      setError(e.message);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load, activePack]);

  return (
    <main className="page">
      <h1>오답노트</h1>
      <p className="sub">
        X와 △를 모두 오답으로 누적합니다. 누적 오답 횟수가 많은 문제부터 표시됩니다.
      </p>
      {error && <div className="error">{error}</div>}

      <div className="filter-row">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            className={`btn sm ${period === p.key ? 'active' : ''}`}
            onClick={() => { setPeriod(p.key); setOpenId(null); }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {data?.totals?.attempt_count > 0 && (
        <div className="card">
          <div className="muted">
            {data.pack?.name} · 이 기간 제출 {data.totals.attempt_count}회 ·
            O {data.totals.o_count} · △ {data.totals.triangle_count} · X {data.totals.x_count}
          </div>
        </div>
      )}

      {!data ? (
        <p className="muted"><span className="spinner">⏳</span> 불러오는 중…</p>
      ) : data.rows.length === 0 ? (
        <div className="empty">
          이 기간에 쌓인 오답이 없습니다.
          <div style={{ marginTop: 12 }}>
            <Link className="btn" to="/start">문제 풀러 가기</Link>
          </div>
        </div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>문제</th>
                <th className="num">오답</th>
                <th className="num">X</th>
                <th className="num">△</th>
                <th className="num">평균</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr
                  key={r.question_id}
                  onClick={() => setOpenId(openId === r.question_id ? null : r.question_id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>
                    <div style={{ fontSize: 14 }}>
                      {r.question_text.length > 70
                        ? `${r.question_text.slice(0, 70)}…`
                        : r.question_text}
                    </div>
                    <div className="muted">
                      {r.source_no ? `${r.source_no}번` : `#${r.question_id}`}
                      {r.required_count ? ` · ${r.required_count}가지` : ''} · 시도 {r.attempt_count}회 ·
                      최근 {r.last_attempt_at}
                    </div>
                  </td>
                  <td className="num"><strong>{r.wrong_count}</strong></td>
                  <td className="num" style={{ color: 'var(--bad)' }}>{r.x_count}</td>
                  <td className="num" style={{ color: 'var(--partial)' }}>{r.triangle_count}</td>
                  <td className="num">{r.avg_score}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ marginTop: 8 }}>행을 누르면 해당 문제의 시도 이력이 열립니다.</p>
        </div>
      )}

      {openId && <History questionId={openId} period={period} onClose={() => setOpenId(null)} />}
    </main>
  );
}

function History({ questionId, period, onClose }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    api
      .getNoteHistory(questionId, period)
      .then((d) => !cancelled && setDetail(d))
      .catch((e) => !cancelled && setError(e.message));
    return () => { cancelled = true; };
  }, [questionId, period]);

  if (error) return <div className="error">{error}</div>;
  if (!detail) return <p className="muted"><span className="spinner">⏳</span> 이력 불러오는 중…</p>;

  return (
    <div className="card">
      <div className="card-head">
        <strong>시도 이력</strong>
        <button className="btn sm ghost" onClick={onClose}>닫기</button>
      </div>
      <p className="q-text" style={{ marginTop: 10 }}>{detail.question.question_text}</p>

      {detail.question.references?.length > 0 && (
        <details className="model-answer" open>
          <summary>모범답안</summary>
          <p className="q-text">{detail.question.references.map((r) => r.source_text).join('\n\n')}</p>
        </details>
      )}

      {detail.attempts.length === 0 ? (
        <div className="empty">이 기간의 시도가 없습니다.</div>
      ) : (
        detail.attempts.map((a) => (
          <div key={a.attempt_id} style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 10 }}>
            <div className="card-head">
              <span className="muted">{a.submitted_at}</span>
              <span>
                <span className={`verdict ${a.verdict}`}>{VERDICT_MARK[a.verdict]}</span>
                <strong style={{ marginLeft: 8 }}>{a.score} / 5점</strong>
              </span>
            </div>
            <p className="q-text" style={{ margin: '8px 0' }}>{a.answer_text.trim() || '(작성하지 않음)'}</p>
            <div>
              {a.matched_groups.map((g, i) => <span className="tag hit" key={`m${i}`}>{g.label}</span>)}
              {a.missing_groups.map((g, i) => <span className="tag miss" key={`x${i}`}>{g.label}</span>)}
            </div>
            {a.feedback && <p className="muted" style={{ marginTop: 6 }}>💬 {a.feedback}</p>}
          </div>
        ))
      )}
    </div>
  );
}
