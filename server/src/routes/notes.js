import { Router } from 'express';
import { all, get } from '../db.js';
import * as repo from '../repo.js';

const router = Router();

/** 기간 필터 → SQLite datetime 경계값. null이면 전체 기간. */
// submitted_at 은 서버 로컬 시간으로 저장되므로 경계값도 localtime 기준으로 만든다.
const PERIODS = {
  all: null,
  '7d': "datetime('now', 'localtime', '-7 days')",
  '30d': "datetime('now', 'localtime', '-30 days')",
  month: "datetime('now', 'localtime', 'start of month')",
};

function periodClause(period) {
  const expr = PERIODS[period] ?? null;
  return expr ? `AND a.submitted_at >= ${expr}` : '';
}

/**
 * 오답노트 목록.
 * X와 △ 모두 오답으로 누적하고, 누적 오답 횟수(X+△) 순으로 정렬한다. (스펙 7장)
 */
router.get('/notes', (req, res) => {
  const period = req.query.period ?? 'all';
  if (!(period in PERIODS)) return res.status(400).json({ error: '지원하지 않는 기간 필터입니다.' });

  const pack = req.query.packId ? repo.getPack(Number(req.query.packId)) : repo.getActivePack();
  if (!pack) return res.json({ pack: null, period, rows: [], totals: emptyTotals() });

  const clause = periodClause(period);
  const rows = all(
    `SELECT
       q.question_id,
       q.question_text,
       q.year_round,
       q.required_count,
       COUNT(*)                                                   AS attempt_count,
       SUM(CASE WHEN a.verdict = 'X' THEN 1 ELSE 0 END)           AS x_count,
       SUM(CASE WHEN a.verdict = 'TRIANGLE' THEN 1 ELSE 0 END)    AS triangle_count,
       SUM(CASE WHEN a.verdict = 'O' THEN 1 ELSE 0 END)           AS o_count,
       SUM(CASE WHEN a.verdict IN ('X','TRIANGLE') THEN 1 ELSE 0 END) AS wrong_count,
       ROUND(AVG(a.score), 2)                                     AS avg_score,
       MAX(a.submitted_at)                                        AS last_attempt_at
     FROM attempt a
     JOIN question q ON q.question_id = a.question_id
     WHERE q.pack_id = ? AND a.counts_in_notes = 1 ${clause}
     GROUP BY q.question_id
     HAVING wrong_count > 0
     ORDER BY wrong_count DESC, x_count DESC, last_attempt_at DESC`,
    pack.pack_id
  );

  const totals = get(
    `SELECT
       COUNT(*)                                                AS attempt_count,
       SUM(CASE WHEN a.verdict = 'O' THEN 1 ELSE 0 END)        AS o_count,
       SUM(CASE WHEN a.verdict = 'TRIANGLE' THEN 1 ELSE 0 END) AS triangle_count,
       SUM(CASE WHEN a.verdict = 'X' THEN 1 ELSE 0 END)        AS x_count
     FROM attempt a
     JOIN question q ON q.question_id = a.question_id
     WHERE q.pack_id = ? AND a.counts_in_notes = 1 ${clause}`,
    pack.pack_id
  );

  res.json({
    pack: { pack_id: pack.pack_id, name: pack.name },
    period,
    rows,
    totals: totals?.attempt_count ? totals : emptyTotals(),
  });
});

/** 문제별 시도 이력 */
router.get('/notes/:questionId', (req, res) => {
  const questionId = Number(req.params.questionId);
  const question = repo.getQuestion(questionId);
  if (!question) return res.status(404).json({ error: '문제를 찾을 수 없습니다.' });

  const period = req.query.period ?? 'all';
  if (!(period in PERIODS)) return res.status(400).json({ error: '지원하지 않는 기간 필터입니다.' });

  const attempts = all(
    `SELECT * FROM attempt a
     WHERE a.question_id = ? AND a.counts_in_notes = 1 ${periodClause(period)}
     ORDER BY a.submitted_at DESC, a.attempt_id DESC`,
    questionId
  ).map((a) => ({
    ...a,
    matched_groups: JSON.parse(a.matched_groups),
    missing_groups: JSON.parse(a.missing_groups),
  }));

  res.json({ question, attempts });
});

function emptyTotals() {
  return { attempt_count: 0, o_count: 0, triangle_count: 0, x_count: 0 };
}

export default router;
