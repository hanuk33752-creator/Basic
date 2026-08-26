const LABEL_LIMIT = 44;
const shorten = (text = '') => (text.length > LABEL_LIMIT ? `${text.slice(0, LABEL_LIMIT)}…` : text);

export const VERDICT_LABEL = { O: 'O 정답', TRIANGLE: '△ 부분정답', X: 'X 오답' };
export const VERDICT_MARK = { O: 'O', TRIANGLE: '△', X: 'X' };

/** 채점 결과 1건. 스펙 6장의 피드백 형식을 그대로 따른다. */
export default function ResultCard({ result, index, total }) {
  const isGroup = result.mode === 'group';
  return (
    <section className="card">
      <div className="card-head">
        <span className="q-meta" style={{ margin: 0 }}>
          문제 {index + 1}
          {total ? ` / ${total}` : ''}
          {result.year_round ? ` · ${result.year_round}` : ''}
        </span>
        <span>
          <span className={`verdict ${result.verdict}`}>{VERDICT_MARK[result.verdict]}</span>
          <strong style={{ marginLeft: 10 }}>{result.score} / 5점</strong>
        </span>
      </div>

      <p className="q-text">{result.question_text}</p>

      {result.answer_text !== undefined && (
        <details style={{ marginBottom: 10 }}>
          <summary className="muted">내가 쓴 답안 보기</summary>
          <p className="q-text" style={{ marginTop: 8 }}>
            {result.answer_text.trim() || '(작성하지 않음)'}
          </p>
        </details>
      )}

      <div className="muted" style={{ marginBottom: 8 }}>
        {isGroup
          ? `요구 항목 ${result.required_count}개 · 인정된 항목 ${result.credited_count}개` +
            (result.matched_count > result.credited_count
              ? ` (${result.matched_count}개 맞췄으나 ${result.credited_count}개까지만 인정)`
              : '')
          : `전체 키워드 ${result.total_candidates}개 · 매칭 ${result.matched_count}개`}
      </div>

      {result.missing_required > 0 && (
        <div className="error">
          반드시 답해야 하는 <strong>필수 항목 {result.missing_required}개</strong>가 빠졌습니다.
          아래 ★ 표시된 항목입니다.
        </div>
      )}

      <div style={{ marginBottom: 6 }}>
        <div className="muted" style={{ marginBottom: 4 }}>
          {isGroup ? '인정된 항목' : '매칭된 키워드'}
        </div>
        {result.matched_groups.length === 0 ? (
          <span className="muted">없음</span>
        ) : (
          result.matched_groups.map((g, i) => (
            <span className="tag hit" key={`m${i}`} title={g.label}>
              {g.is_required && '★ '}
              {shorten(g.label)}
              {isGroup && g.keywords?.length ? ` (${g.keywords.join(', ')})` : ''}
            </span>
          ))
        )}
      </div>

      <div>
        <div className="muted" style={{ marginBottom: 4 }}>
          {isGroup
            ? `부족한 항목 ${Math.max(0, result.required_count - result.credited_count)}개 · 후보`
            : '누락된 키워드'}
        </div>
        {result.missing_groups.length === 0 ? (
          <span className="muted">없음</span>
        ) : (
          result.missing_groups.map((g, i) => (
            <span className="tag miss" key={`x${i}`} title={g.label}>
              {g.is_required && '★ '}
              {shorten(g.label)}
              {isGroup && g.keywords?.length ? ` (${g.keywords.join(', ')})` : ''}
            </span>
          ))
        )}
      </div>

      {result.feedback && (
        <p className="muted" style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>
          💬 {result.feedback}
        </p>
      )}
      {result.graded_by === 'local' && (
        <p className="muted" style={{ marginTop: 10 }}>
          키워드 대조로 채점했습니다. 같은 뜻을 다른 말로 쓰면 인정되지 않을 수 있으니,
          위 항목과 비교해 직접 확인해 주세요.
        </p>
      )}
    </section>
  );
}
