import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api.js';
import { usePack } from '../PackContext.jsx';
import UploadPanel from '../components/UploadPanel.jsx';

export default function Manage() {
  const { packs, activePack, refresh } = usePack();
  const [newName, setNewName] = useState('');
  const [questions, setQuestions] = useState([]);
  const [filter, setFilter] = useState('all'); // all | ready | incomplete
  const [limit, setLimit] = useState(30);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState(null);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
  }, []);

  const loadQuestions = useCallback(async () => {
    if (!activePack) return setQuestions([]);
    const data = await api.listQuestions(activePack.pack_id);
    setQuestions(data.questions);
  }, [activePack]);

  useEffect(() => {
    loadQuestions().catch((e) => setError(e.message));
  }, [loadQuestions]);

  const incompleteCount = useMemo(
    () => questions.filter((q) => q.keyword_groups.length === 0).length,
    [questions]
  );
  const filtered = useMemo(() => {
    if (filter === 'ready') return questions.filter((q) => q.keyword_groups.length > 0);
    if (filter === 'incomplete') return questions.filter((q) => q.keyword_groups.length === 0);
    return questions;
  }, [questions, filter]);

  async function guard(fn) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <h1>문제 관리</h1>
      <p className="sub">자격증 팩을 만들고 전환합니다. 활성 팩의 문제만 출제됩니다.</p>
      {error && <div className="error">{error}</div>}

      {health?.lan_urls?.length > 0 && (
        <div className="notice">
          휴대폰·태블릿에서도 쓰려면 <strong>같은 와이파이</strong>에 연결한 뒤 아래 주소로 접속하세요.
          <div style={{ marginTop: 6 }}>
            {health.lan_urls.map((url) => (
              <code key={url} style={{ display: 'block', fontSize: 15 }}>{url}</code>
            ))}
          </div>
          <div className="muted" style={{ marginTop: 6 }}>
            이 PC가 켜져 있고 앱이 실행 중일 때만 됩니다. 로그인 기능이 없으니 공용 와이파이에서는 쓰지 마세요.
          </div>
        </div>
      )}

      {health && (
        <div className="notice">
          {health.claude_available ? (
            <>채점 방식: <strong>AI 의미 기반</strong> ({health.model})</>
          ) : (
            <>
              채점 방식: <strong>키워드 대조</strong> · 인터넷 없이 동작합니다
              <details style={{ marginTop: 6 }}>
                <summary className="muted" style={{ cursor: 'pointer' }}>AI 의미 기반 채점으로 바꾸려면</summary>
                <div className="muted" style={{ marginTop: 6 }}>
                  프로젝트 폴더의 <code>.env</code> 파일에 <code>ANTHROPIC_API_KEY=sk-ant-...</code> 를 넣고
                  터미널에서 <code>Ctrl+C</code> 로 끈 뒤 <code>npm start</code> 로 다시 시작하세요.
                  같은 뜻을 다르게 쓴 답안까지 인정되지만, 채점할 때마다 인터넷 연결과 API 비용이 듭니다.
                </div>
              </details>
            </>
          )}
        </div>
      )}

      <h2>자격증 팩</h2>
      <div className="card">
        <div className="btn-row">
          <input
            type="text"
            value={newName}
            placeholder="예: 수질환경기사"
            onChange={(e) => setNewName(e.target.value)}
            style={{ flex: '1 1 200px' }}
          />
          <button
            className="btn primary"
            disabled={busy || !newName.trim()}
            onClick={() => guard(async () => { await api.createPack(newName.trim()); setNewName(''); })}
          >
            팩 추가
          </button>
        </div>
      </div>

      {packs.length === 0 ? (
        <div className="empty">등록된 자격증 팩이 없습니다.</div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>이름</th>
                <th className="num">문제 수</th>
                <th className="num">출제 가능</th>
                <th className="num">상태</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {packs.map((p) => (
                <tr key={p.pack_id}>
                  <td>{p.name}</td>
                  <td className="num">{p.question_count}</td>
                  <td className="num">
                    {p.ready_count}
                    {p.question_count > p.ready_count && (
                      <span className="muted"> (-{p.question_count - p.ready_count})</span>
                    )}
                  </td>
                  <td className="num">
                    {p.is_active ? <span className="pack-chip">활성</span> : <span className="muted">대기</span>}
                  </td>
                  <td className="num">
                    <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
                      {!p.is_active && (
                        <button
                          className="btn sm"
                          disabled={busy}
                          onClick={() => guard(() => api.activatePack(p.pack_id))}
                        >
                          활성화
                        </button>
                      )}
                      <button
                        className="btn sm danger"
                        disabled={busy}
                        onClick={() => {
                          if (confirm(`'${p.name}' 팩과 소속 문제를 모두 삭제할까요?`)) {
                            guard(() => api.deletePack(p.pack_id));
                          }
                        }}
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>문제 추가</h2>
      <UploadPanel
        packId={activePack?.pack_id}
        packName={activePack?.name}
        onSaved={() => guard(loadQuestions)}
      />

      <h2>등록된 문제 {activePack ? `(${activePack.name})` : ''}</h2>

      {incompleteCount > 0 && (
        <div className="error">
          채점 기준(키워드)을 만들지 못한 문제가 <strong>{incompleteCount}개</strong> 있습니다.
          이 문제들은 랜덤 출제에서 자동으로 제외됩니다. 참고자료를 채워 다시 등록하거나 삭제해 주세요.
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button
              className="btn sm danger"
              disabled={busy}
              onClick={() => {
                if (confirm(`채점 기준이 없는 문제 ${incompleteCount}개를 삭제할까요?`)) {
                  guard(async () => {
                    await api.deleteIncomplete(activePack.pack_id);
                    await loadQuestions();
                  });
                }
              }}
            >
              {incompleteCount}개 일괄 삭제
            </button>
          </div>
        </div>
      )}

      {questions.length > 0 && (
        <div className="filter-row">
          {[
            ['all', `전체 ${questions.length}`],
            ['ready', `출제 가능 ${questions.length - incompleteCount}`],
            ['incomplete', `채점 기준 없음 ${incompleteCount}`],
          ].map(([key, label]) => (
            <button
              key={key}
              className={`btn sm ${filter === key ? 'active' : ''}`}
              onClick={() => { setFilter(key); setLimit(30); }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty">
          {questions.length === 0 ? '등록된 문제가 없습니다.' : '해당하는 문제가 없습니다.'}
        </div>
      ) : (
        <>
          {filtered.slice(0, limit).map((q) => (
            <div className="card" key={q.question_id}>
              <div className="q-meta">
                #{q.question_id}
                {q.year_round ? ` · ${q.year_round}` : ''}
                {q.required_count ? ` · 요구 항목 ${q.required_count}개` : ' · 일반 서술형'}
                {q.keyword_groups.length === 0 && (
                  <span className="tag miss" style={{ marginLeft: 8 }}>채점 기준 없음 · 출제 제외</span>
                )}
              </div>
              <p className="q-text">{q.question_text}</p>
              <div>
                {q.keyword_groups.map((g) =>
                  g.is_flat ? (
                    g.keywords.map((k) => <span className="tag" key={k}>{k}</span>)
                  ) : (
                    <span className={`tag${g.is_required ? ' hit' : ''}`} key={g.group_id}>
                      {g.is_required && '★ '}
                      {g.label || `항목 ${g.group_index + 1}`}: {g.keywords.join(', ')}
                    </span>
                  )
                )}
              </div>
              <div className="btn-row" style={{ marginTop: 10 }}>
                <button
                  className="btn sm danger"
                  onClick={() => {
                    if (confirm('이 문제를 삭제할까요?')) {
                      guard(async () => { await api.deleteQuestion(q.question_id); await loadQuestions(); });
                    }
                  }}
                >
                  삭제
                </button>
              </div>
            </div>
          ))}

          {filtered.length > limit && (
            <button className="btn block" onClick={() => setLimit((n) => n + 50)}>
              더 보기 ({filtered.length - limit}개 남음)
            </button>
          )}
        </>
      )}
    </main>
  );
}
