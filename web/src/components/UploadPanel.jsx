import { useRef, useState } from 'react';
import api from '../api.js';

/**
 * 스펙 4장 흐름: 업로드 → AI 1차 분리 미리보기 → 사용자 수정/확인 → 키워드 추출 후 저장
 */
export default function UploadPanel({ packId, packName, onSaved }) {
  const fileRef = useRef(null);
  const [stage, setStage] = useState('idle'); // idle | parsing | preview | saving
  const [meta, setMeta] = useState(null);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  async function handleFile(file) {
    if (!file) return;
    setError(null);
    setResult(null);
    setStage('parsing');
    try {
      const data = await api.parseDocument(file);
      setMeta(data);
      setRows(
        data.candidates.map((c, i) => ({
          key: `${i}`,
          include: true,
          question_text: c.question_text,
          year_round: c.year_round ?? '',
          source_text: c.source_text ?? '',
          required_count: c.required_count ?? '',
          required_count_locked: false,
        }))
      );
      setStage(data.candidates.length ? 'preview' : 'idle');
      if (!data.candidates.length) setError('문서에서 문제를 찾지 못했습니다. 다른 파일을 시도해 주세요.');
    } catch (e) {
      setError(e.message);
      setStage('idle');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function patch(key, field, value) {
    setRows((prev) =>
      prev.map((r) =>
        r.key === key
          ? { ...r, [field]: value, ...(field === 'required_count' ? { required_count_locked: true } : null) }
          : r
      )
    );
  }

  async function save() {
    const chosen = rows.filter((r) => r.include && r.question_text.trim());
    if (chosen.length === 0) return setError('저장할 문제를 하나 이상 선택해 주세요.');
    setStage('saving');
    setError(null);
    try {
      const payload = chosen.map((r) => ({
        question_text: r.question_text.trim(),
        year_round: r.year_round.trim(),
        source_text: r.source_text.trim(),
        required_count: r.required_count === '' ? null : Number(r.required_count),
        required_count_locked: r.required_count_locked,
      }));
      const data = await api.confirmCandidates(packId, payload);
      setResult(data);
      setRows([]);
      setMeta(null);
      setStage('idle');
      onSaved?.();
    } catch (e) {
      setError(e.message);
      setStage('preview');
    }
  }

  const included = rows.filter((r) => r.include).length;

  return (
    <div className="card">
      <div className="card-head">
        <strong>문서 업로드</strong>
        <span className="muted">docx · pdf · txt</span>
      </div>
      <p className="muted" style={{ marginTop: 4 }}>
        {packName ? `'${packName}' 팩에 문제를 추가합니다.` : '먼저 자격증 팩을 선택해 주세요.'}
      </p>

      {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
      {result && (
        <div className="notice" style={{ marginTop: 10 }}>
          {result.saved_count}개 문제를 저장했습니다.
          {result.failed.length > 0 && ` (실패 ${result.failed.length}건)`}
        </div>
      )}

      {stage !== 'preview' && (
        <div className="btn-row" style={{ marginTop: 10 }}>
          <input
            ref={fileRef}
            type="file"
            accept=".docx,.pdf,.txt,.md"
            disabled={!packId || stage !== 'idle'}
            onChange={(e) => handleFile(e.target.files?.[0])}
            style={{ flex: '1 1 240px' }}
          />
          {stage === 'parsing' && <span className="muted"><span className="spinner">⏳</span> 문서 분석 중…</span>}
        </div>
      )}

      {stage === 'preview' && meta && (
        <>
          <div className="notice" style={{ marginTop: 12 }}>
            {meta.filename} · 문제 후보 {rows.length}개
            {meta.parsed_by === 'local' && ' · Claude API 키가 없어 로컬 규칙으로 분리했습니다. 내용을 꼭 확인해 주세요.'}
          </div>

          {rows.map((r, idx) => (
            <div className="card" key={r.key} style={{ background: r.include ? undefined : '#fafafa' }}>
              <div className="card-head" style={{ marginBottom: 8 }}>
                <label className="muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={r.include}
                    onChange={(e) => patch(r.key, 'include', e.target.checked)}
                  />
                  후보 {idx + 1} 포함
                </label>
                <span className="muted">
                  {r.required_count ? `요구 항목 ${r.required_count}개` : '일반 서술형'}
                </span>
              </div>

              <label className="field">
                문제 본문
                <textarea
                  value={r.question_text}
                  rows={3}
                  onChange={(e) => patch(r.key, 'question_text', e.target.value)}
                />
              </label>
              <label className="field">
                참고자료 (채점 근거가 되는 원문 발췌)
                <textarea
                  value={r.source_text}
                  rows={4}
                  onChange={(e) => patch(r.key, 'source_text', e.target.value)}
                />
              </label>
              <div className="btn-row">
                <label className="field" style={{ flex: '1 1 160px' }}>
                  연도/회차
                  <input
                    type="text"
                    value={r.year_round}
                    placeholder="예: 2023년 1회"
                    onChange={(e) => patch(r.key, 'year_round', e.target.value)}
                  />
                </label>
                <label className="field" style={{ flex: '0 1 140px' }}>
                  요구 항목 수 (N)
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={r.required_count}
                    placeholder="없음"
                    onChange={(e) => patch(r.key, 'required_count', e.target.value)}
                  />
                </label>
              </div>
            </div>
          ))}

          <div className="btn-row">
            <button className="btn primary" disabled={stage === 'saving'} onClick={save}>
              {stage === 'saving' ? '키워드 추출 중…' : `${included}개 확인하고 저장`}
            </button>
            <button
              className="btn ghost"
              disabled={stage === 'saving'}
              onClick={() => { setRows([]); setMeta(null); setStage('idle'); }}
            >
              취소
            </button>
          </div>
          <p className="muted">저장 시점에 요구 항목 수와 키워드 그룹이 자동 추출됩니다.</p>
        </>
      )}
    </div>
  );
}
