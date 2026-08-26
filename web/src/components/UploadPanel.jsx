import { useMemo, useRef, useState } from 'react';
import api from '../api.js';

/**
 * 스펙 4장 흐름: 업로드 → AI 1차 분리 미리보기 → 사용자 수정/확인 → 키워드 추출 후 저장
 * 한 번에 수백 문제를 다룰 수 있도록 목록은 접힌 행으로 보여주고, 편집할 때만 펼친다.
 */
export default function UploadPanel({ packId, packName, onSaved }) {
  const fileRef = useRef(null);
  const [stage, setStage] = useState('idle'); // idle | parsing | preview | saving
  const [job, setJob] = useState(null);
  const [meta, setMeta] = useState(null);
  const [rows, setRows] = useState([]);
  const [openKey, setOpenKey] = useState(null);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const included = useMemo(() => rows.filter((r) => r.include).length, [rows]);
  const noSource = useMemo(() => rows.filter((r) => !r.source_text.trim()).length, [rows]);

  async function handleFile(file) {
    if (!file) return;
    setError(null);
    setResult(null);
    setJob(null);
    setStage('parsing');
    try {
      const started = await api.parseDocument(file);
      const data = await api.waitForJob(started.job_id, setJob);
      setMeta(data);
      setRows(
        data.candidates.map((c, i) => ({
          key: `${i}`,
          include: true,
          question_text: c.question_text,
          year_round: c.year_round ?? '',
          source_text: c.source_text ?? '',
          required_count: c.required_count ?? '',
          required_count_locked: !!c.required_count_locked,
          groups: c.groups ?? [],
        }))
      );
      setStage(data.candidates.length ? 'preview' : 'idle');
      if (!data.candidates.length) setError('문서에서 문제를 찾지 못했습니다. 다른 파일을 시도해 주세요.');
    } catch (e) {
      setError(e.message);
      setStage('idle');
    } finally {
      setJob(null);
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

  function setAll(fn) {
    setRows((prev) => prev.map((r) => ({ ...r, include: fn(r) })));
  }

  async function save() {
    const chosen = rows.filter((r) => r.include && r.question_text.trim());
    if (chosen.length === 0) return setError('저장할 문제를 하나 이상 선택해 주세요.');
    setStage('saving');
    setError(null);
    setJob(null);
    try {
      const payload = chosen.map((r) => ({
        question_text: r.question_text.trim(),
        year_round: r.year_round.trim(),
        source_text: r.source_text.trim(),
        required_count: r.required_count === '' ? null : Number(r.required_count),
        required_count_locked: r.required_count_locked,
        groups: r.groups ?? [],
      }));
      const started = await api.confirmCandidates(packId, payload);
      const data = await api.waitForJob(started.job_id, setJob);
      setResult(data);
      setRows([]);
      setMeta(null);
      setOpenKey(null);
      setStage('idle');
      onSaved?.();
    } catch (e) {
      setError(e.message);
      setStage('preview');
    } finally {
      setJob(null);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <strong>문제 등록</strong>
        <span className="muted">xlsx · docx · pdf · txt</span>
      </div>
      <p className="muted" style={{ marginTop: 4 }}>
        {packName
          ? `'${packName}' 팩에 문제를 추가합니다. 한 번에 최대 ${meta?.max_candidates ?? 500}문제까지 등록할 수 있습니다.`
          : '먼저 자격증 팩을 선택해 주세요.'}
      </p>

      <div className="notice" style={{ marginTop: 10 }}>
        <strong>엑셀 양식을 권합니다.</strong> 워드·PDF는 문서 구조에 따라 문제 경계를 잘못 잡을 수 있습니다.
        양식에 문제와 모범답안을 행 단위로 적으면 그대로 정확히 등록됩니다.
        <div className="btn-row" style={{ marginTop: 8 }}>
          <a className="btn sm" href="/api/upload/template.xlsx" download>
            ⬇ 엑셀 양식 내려받기
          </a>
        </div>
      </div>

      {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
      {result && <SaveSummary result={result} />}

      {(stage === 'idle' || stage === 'parsing') && (
        <div className="btn-row" style={{ marginTop: 10 }}>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.docx,.pdf,.txt,.md"
            disabled={!packId || stage !== 'idle'}
            onChange={(e) => handleFile(e.target.files?.[0])}
            style={{ flex: '1 1 240px' }}
          />
        </div>
      )}

      {(stage === 'parsing' || stage === 'saving') && <Progress job={job} stage={stage} />}

      {stage === 'preview' && meta && (
        <>
          <div className="notice" style={{ marginTop: 12 }}>
            {meta.filename} · 문제 후보 {rows.length}개 · 선택 {included}개
            {meta.parsed_by === 'excel' && ` · '${meta.sheet_name}' 시트에서 읽음`}
            {meta.truncated && ` · 상한 ${meta.max_candidates}개를 넘어 앞부분만 가져왔습니다.`}
            {meta.parsed_by === 'local' && ' · Claude API 키가 없어 로컬 규칙으로 분리했습니다. 내용을 꼭 확인해 주세요.'}
            {meta.skipped?.length > 0 && ` · 건너뛴 행 ${meta.skipped.length}개(문제 본문 없음)`}
            {meta.failures?.length > 0 && ` · 일부 구간(${meta.failures.length}개) 분석 실패`}
          </div>

          {noSource > 0 && (
            <div className="error" style={{ marginTop: 0 }}>
              참고자료가 비어 있는 후보가 {noSource}개 있습니다. 그대로 저장하면 채점 기준을 만들지 못해
              <strong> 랜덤 출제에서 제외</strong>됩니다.
            </div>
          )}

          <div className="filter-row">
            <button className="btn sm" onClick={() => setAll(() => true)}>전체 선택</button>
            <button className="btn sm" onClick={() => setAll(() => false)}>전체 해제</button>
            {noSource > 0 && (
              <button className="btn sm" onClick={() => setAll((r) => !!r.source_text.trim())}>
                참고자료 없는 항목 해제
              </button>
            )}
          </div>

          <div className="preview-list">
            {rows.map((r, idx) => (
              <CandidateRow
                key={r.key}
                row={r}
                index={idx}
                open={openKey === r.key}
                onToggleOpen={() => setOpenKey(openKey === r.key ? null : r.key)}
                onPatch={patch}
              />
            ))}
          </div>

          <div className="btn-row" style={{ marginTop: 14 }}>
            <button className="btn primary" onClick={save} disabled={included === 0}>
              {included}개 확인하고 저장
            </button>
            <button
              className="btn ghost"
              onClick={() => { setRows([]); setMeta(null); setOpenKey(null); setStage('idle'); }}
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

function CandidateRow({ row, index, open, onToggleOpen, onPatch }) {
  const missingSource = !row.source_text.trim();
  return (
    <div className={`preview-row${row.include ? '' : ' off'}`}>
      <div className="preview-head">
        <input
          type="checkbox"
          checked={row.include}
          onChange={(e) => onPatch(row.key, 'include', e.target.checked)}
          aria-label={`후보 ${index + 1} 포함`}
        />
        <button type="button" className="preview-title" onClick={onToggleOpen}>
          <span className="muted">{index + 1}.</span> {row.question_text || '(빈 문제)'}
        </button>
        <span className="preview-badges">
          {missingSource && <span className="tag miss" title="참고자료 없음">참고자료 없음</span>}
          {row.groups?.length > 0 && (
            <span className="tag hit" title="엑셀 항목 열에서 채점 기준이 확정됨">
              항목 {row.groups.length}
            </span>
          )}
          <span className="tag">{row.required_count ? `${row.required_count}가지` : '일반'}</span>
          <button type="button" className="btn sm ghost" onClick={onToggleOpen}>
            {open ? '닫기' : '편집'}
          </button>
        </span>
      </div>

      {open && (
        <div className="preview-body">
          <label className="field">
            문제 본문
            <textarea
              value={row.question_text}
              rows={3}
              onChange={(e) => onPatch(row.key, 'question_text', e.target.value)}
            />
          </label>
          <label className="field">
            참고자료 (채점 근거가 되는 원문 발췌)
            <textarea
              value={row.source_text}
              rows={4}
              onChange={(e) => onPatch(row.key, 'source_text', e.target.value)}
            />
          </label>
          <div className="btn-row">
            <label className="field" style={{ flex: '1 1 160px' }}>
              연도/회차
              <input
                type="text"
                value={row.year_round}
                placeholder="예: 2023년 1회"
                onChange={(e) => onPatch(row.key, 'year_round', e.target.value)}
              />
            </label>
            <label className="field" style={{ flex: '0 1 140px' }}>
              요구 항목 수 (N)
              <input
                type="number"
                min="1"
                max="20"
                value={row.required_count}
                placeholder="없음"
                onChange={(e) => onPatch(row.key, 'required_count', e.target.value)}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

function Progress({ job, stage }) {
  const total = job?.total ?? 0;
  const done = job?.progress ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : null;
  const phase = job?.phase ?? (stage === 'parsing' ? '문서 분석 준비 중' : '저장 준비 중');

  return (
    <div style={{ marginTop: 12 }}>
      <div className="muted" style={{ marginBottom: 6 }}>
        <span className="spinner">⏳</span> {phase}
        {total > 0 && ` · ${done}/${total}`}
      </div>
      <div className="bar">
        <div className={`bar-fill${pct === null ? ' indeterminate' : ''}`} style={pct === null ? undefined : { width: `${pct}%` }} />
      </div>
      <p className="muted" style={{ marginTop: 6 }}>
        문제 수가 많으면 몇 분 걸릴 수 있습니다. 이 화면을 그대로 두세요.
      </p>
    </div>
  );
}

function SaveSummary({ result }) {
  return (
    <div className="notice" style={{ marginTop: 10 }}>
      {result.saved_count}개 문제를 저장했습니다. (출제 가능 {result.ready_count}개)
      {result.incomplete?.length > 0 && (
        <>
          {' '}
          <strong>{result.incomplete.length}개</strong>는 채점 기준을 만들지 못해 랜덤 출제에서 제외됩니다.
          아래 목록에서 참고자료를 채우거나 삭제해 주세요.
        </>
      )}
      {result.failed?.length > 0 && ` · 실패 ${result.failed.length}건`}
    </div>
  );
}
