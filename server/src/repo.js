// DB 접근 계층. 라우터/서비스는 SQL 대신 이 함수들만 사용한다.
import { all, get, run, tx } from './db.js';

/**
 * 출제 가능한 문제의 조건: 채점 기준(키워드가 든 그룹)이 최소 하나 있어야 한다.
 * 참고자료가 비어 키워드를 못 뽑은 문제는 채점을 할 수 없으므로 랜덤 출제에서 제외한다.
 */
const GRADABLE = `EXISTS (
  SELECT 1 FROM keyword_group g
  WHERE g.question_id = q.question_id AND g.keywords <> '[]'
)`;

/* ── 자격증 팩 ────────────────────────────────────────────── */

export function listPacks() {
  return all(`
    SELECT p.*,
      (SELECT COUNT(*) FROM question q WHERE q.pack_id = p.pack_id) AS question_count,
      (SELECT COUNT(*) FROM question q WHERE q.pack_id = p.pack_id AND ${GRADABLE}) AS ready_count
    FROM cert_pack p ORDER BY p.is_active DESC, p.created_at DESC`);
}

export function getPack(packId) {
  return get('SELECT * FROM cert_pack WHERE pack_id = ?', packId);
}

export function getActivePack() {
  return get('SELECT * FROM cert_pack WHERE is_active = 1');
}

export function createPack(name, { activate = false } = {}) {
  return tx(() => {
    const { lastInsertRowid } = run('INSERT INTO cert_pack (name, is_active) VALUES (?, 0)', name);
    const packId = Number(lastInsertRowid);
    // 첫 팩이면 자동 활성화
    const total = get('SELECT COUNT(*) AS c FROM cert_pack').c;
    if (activate || total === 1) activatePackInner(packId);
    return getPack(packId);
  });
}

function activatePackInner(packId) {
  run('UPDATE cert_pack SET is_active = 0');
  run('UPDATE cert_pack SET is_active = 1 WHERE pack_id = ?', packId);
}

export function activatePack(packId) {
  return tx(() => {
    activatePackInner(packId);
    return getPack(packId);
  });
}

export function deletePack(packId) {
  return tx(() => {
    const pack = getPack(packId);
    if (!pack) return null;
    run('DELETE FROM cert_pack WHERE pack_id = ?', packId);
    if (pack.is_active) {
      const next = get('SELECT pack_id FROM cert_pack ORDER BY created_at LIMIT 1');
      if (next) activatePackInner(next.pack_id);
    }
    return pack;
  });
}

/* ── 문제 ─────────────────────────────────────────────────── */

export function listQuestions(packId) {
  const rows = all(
    'SELECT * FROM question WHERE pack_id = ? ORDER BY question_id',
    packId
  );
  return rows.map(hydrate);
}

export function getQuestion(questionId) {
  const q = get('SELECT * FROM question WHERE question_id = ?', questionId);
  return q ? hydrate(q) : undefined;
}

/** 채점 기준이 있는 문제만 대상으로 랜덤 출제한다. */
export function randomQuestions(packId, count) {
  const rows = all(
    `SELECT * FROM question q WHERE q.pack_id = ? AND ${GRADABLE} ORDER BY RANDOM() LIMIT ?`,
    packId,
    count
  );
  return rows.map(hydrate);
}

/** 출제 가능한 문제 수 */
export function countReady(packId) {
  return get(`SELECT COUNT(*) AS c FROM question q WHERE q.pack_id = ? AND ${GRADABLE}`, packId).c;
}

/** 채점 기준이 없어 출제되지 않는 문제 목록 */
export function listIncomplete(packId) {
  return all(
    `SELECT * FROM question q WHERE q.pack_id = ? AND NOT ${GRADABLE} ORDER BY q.question_id`,
    packId
  ).map(hydrate);
}

/** 채점 기준이 없는 문제를 일괄 삭제한다. */
export function deleteIncomplete(packId) {
  return run(
    `DELETE FROM question WHERE question_id IN (
       SELECT q.question_id FROM question q WHERE q.pack_id = ? AND NOT ${GRADABLE}
     )`,
    packId
  ).changes;
}

function hydrate(q) {
  const groups = all(
    'SELECT * FROM keyword_group WHERE question_id = ? ORDER BY group_index',
    q.question_id
  ).map((g) => ({ ...g, keywords: JSON.parse(g.keywords), is_flat: !!g.is_flat, is_required: !!g.is_required }));
  const references = all(
    'SELECT * FROM reference_material WHERE question_id = ? ORDER BY reference_id',
    q.question_id
  );
  return { ...q, keyword_groups: groups, references };
}

/**
 * 문제 1건 저장 (참고자료·키워드 그룹 포함).
 * groups: [{ label, keywords: string[] }]  — N 있는 문제
 *         [{ keywords: string[] }] 1건     — N 없는 flat 문제
 */
export function saveQuestion({
  packId,
  questionText,
  yearRound = null,
  requiredCount = null,
  sourceText = null,
  groups = [],
}) {
  return tx(() => {
    const { lastInsertRowid } = run(
      `INSERT INTO question (pack_id, question_text, year_round, max_score, required_count)
       VALUES (?, ?, ?, 5, ?)`,
      packId,
      questionText,
      yearRound,
      requiredCount
    );
    const questionId = Number(lastInsertRowid);
    if (sourceText) {
      run('INSERT INTO reference_material (question_id, source_text) VALUES (?, ?)', questionId, sourceText);
    }
    writeGroups(questionId, requiredCount, groups);
    return getQuestion(questionId);
  });
}

export function updateQuestion(questionId, { questionText, yearRound, requiredCount, sourceText, groups }) {
  return tx(() => {
    const existing = get('SELECT * FROM question WHERE question_id = ?', questionId);
    if (!existing) return null;
    run(
      'UPDATE question SET question_text = ?, year_round = ?, required_count = ? WHERE question_id = ?',
      questionText ?? existing.question_text,
      yearRound === undefined ? existing.year_round : yearRound,
      requiredCount === undefined ? existing.required_count : requiredCount,
      questionId
    );
    if (sourceText !== undefined) {
      run('DELETE FROM reference_material WHERE question_id = ?', questionId);
      if (sourceText) {
        run('INSERT INTO reference_material (question_id, source_text) VALUES (?, ?)', questionId, sourceText);
      }
    }
    if (groups !== undefined) {
      run('DELETE FROM keyword_group WHERE question_id = ?', questionId);
      const n = requiredCount === undefined ? existing.required_count : requiredCount;
      writeGroups(questionId, n, groups);
    }
    return getQuestion(questionId);
  });
}

function writeGroups(questionId, requiredCount, groups) {
  const isFlat = requiredCount == null;
  if (isFlat) {
    // flat: 모든 키워드를 단일 리스트로 합쳐 한 행에 저장 (스펙 3.4)
    const keywords = [...new Set(groups.flatMap((g) => g.keywords ?? []))];
    if (keywords.length === 0) return;
    run(
      'INSERT INTO keyword_group (question_id, group_index, label, keywords, is_flat) VALUES (?, 0, NULL, ?, 1)',
      questionId,
      JSON.stringify(keywords)
    );
    return;
  }
  groups.forEach((g, i) => {
    run(
      `INSERT INTO keyword_group (question_id, group_index, label, keywords, is_flat, is_required)
       VALUES (?, ?, ?, ?, 0, ?)`,
      questionId,
      i,
      g.label ?? null,
      JSON.stringify(g.keywords ?? []),
      g.is_required ? 1 : 0
    );
  });
}

export function deleteQuestion(questionId) {
  return run('DELETE FROM question WHERE question_id = ?', questionId).changes > 0;
}

export function countQuestions(packId) {
  return get('SELECT COUNT(*) AS c FROM question WHERE pack_id = ?', packId).c;
}
