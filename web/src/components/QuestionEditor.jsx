import { useState } from 'react';

const splitKeywords = (text) =>
  text
    .split(/[,\n]/)
    .map((k) => k.trim())
    .filter(Boolean);

/** 문제 한 건을 고치는 폼. 저장 payload 는 PUT /api/questions/:id 형식 그대로다. */
export default function QuestionEditor({ question, onSave, onCancel, busy }) {
  const isFlat = question.required_count == null;

  const [sourceNo, setSourceNo] = useState(question.source_no ?? '');
  const [questionText, setQuestionText] = useState(question.question_text);
  const [sourceText, setSourceText] = useState(
    (question.references ?? []).map((r) => r.source_text).join('\n\n')
  );
  const [requiredCount, setRequiredCount] = useState(question.required_count ?? '');
  const [flatKeywords, setFlatKeywords] = useState(
    isFlat ? (question.keyword_groups[0]?.keywords ?? []).join(', ') : ''
  );
  const [items, setItems] = useState(
    isFlat
      ? []
      : question.keyword_groups.map((g) => ({
          label: g.label ?? '',
          keywords: g.keywords.join(', '),
          is_required: !!g.is_required,
        }))
  );
  const [error, setError] = useState(null);

  const groupMode = requiredCount !== '' && Number(requiredCount) >= 1;

  function patchItem(index, field, value) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  }

  function changeRequiredCount(value) {
    setRequiredCount(value);
    // 일반 서술형 → 항목형으로 바꾸면 적어도 한 칸은 있어야 한다.
    if (value !== '' && Number(value) >= 1 && items.length === 0) {
      setItems([{ label: '', keywords: '', is_required: false }]);
    }
  }

  function submit() {
    if (!questionText.trim()) return setError('문제 본문을 입력해 주세요.');

    const groups = groupMode
      ? items
          .map((it) => ({
            label: it.label.trim() || null,
            keywords: splitKeywords(it.keywords),
            is_required: it.is_required,
          }))
          .filter((g) => g.label || g.keywords.length > 0)
      : [{ keywords: splitKeywords(flatKeywords) }];

    const usable = groups.filter((g) => g.keywords.length > 0);
    if (usable.length === 0) {
      return setError('채점에 쓸 키워드를 하나 이상 입력해 주세요. 키워드가 없으면 출제되지 않습니다.');
    }

    onSave({
      sourceNo: sourceNo.trim() || null,
      questionText: questionText.trim(),
      sourceText: sourceText.trim() || null,
      requiredCount: groupMode ? Number(requiredCount) : null,
      groups,
    });
  }

  return (
    <div className="card editing">
      <div className="card-head">
        <strong>문제 편집</strong>
        <span className="muted">#{question.question_id}</span>
      </div>
      {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}

      <div className="btn-row" style={{ marginTop: 10 }}>
        <label className="field" style={{ flex: '0 1 140px' }}>
          번호
          <input type="text" value={sourceNo} placeholder="예: 112" onChange={(e) => setSourceNo(e.target.value)} />
        </label>
        <label className="field" style={{ flex: '0 1 160px' }}>
          요구 항목 수 (N)
          <input
            type="number"
            min="1"
            max="20"
            value={requiredCount}
            placeholder="없음 (일반 서술형)"
            onChange={(e) => changeRequiredCount(e.target.value)}
          />
        </label>
      </div>

      <label className="field">
        문제 본문
        <textarea value={questionText} rows={3} onChange={(e) => setQuestionText(e.target.value)} />
      </label>

      <label className="field">
        모범답안
        <textarea value={sourceText} rows={5} onChange={(e) => setSourceText(e.target.value)} />
      </label>

      {groupMode ? (
        <>
          <div className="card-head" style={{ marginBottom: 6 }}>
            <span className="field" style={{ margin: 0 }}>채점 항목</span>
            <button
              type="button"
              className="btn sm"
              onClick={() => setItems((prev) => [...prev, { label: '', keywords: '', is_required: false }])}
            >
              항목 추가
            </button>
          </div>
          <p className="muted" style={{ marginTop: 0 }}>
            키워드는 쉼표로 구분합니다. 하나라도 답안에 있으면 그 항목을 쓴 것으로 봅니다.
            필수로 표시한 항목은 반드시 답해야 합니다.
          </p>

          {items.map((it, i) => (
            <div className="item-row" key={i}>
              <label className="item-required" title="반드시 답해야 하는 항목">
                <input
                  type="checkbox"
                  checked={it.is_required}
                  onChange={(e) => patchItem(i, 'is_required', e.target.checked)}
                />
                필수
              </label>
              <input
                type="text"
                value={it.label}
                placeholder={`항목 ${i + 1} 이름`}
                onChange={(e) => patchItem(i, 'label', e.target.value)}
              />
              <input
                type="text"
                value={it.keywords}
                placeholder="키워드1, 키워드2"
                onChange={(e) => patchItem(i, 'keywords', e.target.value)}
              />
              <button
                type="button"
                className="btn sm danger"
                onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
              >
                삭제
              </button>
            </div>
          ))}
        </>
      ) : (
        <label className="field">
          채점 키워드 (쉼표로 구분)
          <textarea
            value={flatKeywords}
            rows={2}
            placeholder="응집제, 주입량, 최적"
            onChange={(e) => setFlatKeywords(e.target.value)}
          />
        </label>
      )}

      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn primary" disabled={busy} onClick={submit}>
          {busy ? '저장 중…' : '저장'}
        </button>
        <button className="btn ghost" disabled={busy} onClick={onCancel}>취소</button>
      </div>
    </div>
  );
}
