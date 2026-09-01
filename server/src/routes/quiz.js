import { Router } from 'express';
import * as repo from '../repo.js';
import { gradeAnswer } from '../services/grading.js';
import { run, get } from '../db.js';

const router = Router();
const ALLOWED_COUNTS = [1, 5, 10];

/** 랜덤 출제. 채점 기준(키워드)은 응답에 포함하지 않는다. */
router.get('/quiz', (req, res) => {
  const count = Number(req.query.count) || 1;
  if (!ALLOWED_COUNTS.includes(count)) {
    return res.status(400).json({ error: '출제 개수는 1, 5, 10 중 하나여야 합니다.' });
  }
  const pack = req.query.packId ? repo.getPack(Number(req.query.packId)) : repo.getActivePack();
  if (!pack) return res.status(400).json({ error: '활성 자격증 팩이 없습니다.' });

  const questions = repo.randomQuestions(pack.pack_id, count).map((q) => ({
    question_id: q.question_id,
    source_no: q.source_no,
    question_text: q.question_text,
    max_score: q.max_score,
    required_count: q.required_count,
    // 모범답안(references)과 채점 기준(keyword_groups)은 넣지 않는다.
  }));

  res.json({
    pack: { pack_id: pack.pack_id, name: pack.name },
    requested: count,
    // 채점 기준이 없는 문제는 출제 대상에서 빠지므로 그 수도 함께 알려준다.
    available: repo.countReady(pack.pack_id),
    questions,
  });
});

const MODES = ['practice', 'exam'];

/**
 * 답안 일괄 제출 → 채점 → 시도 기록 저장
 * 연습 모드(practice)로 낸 답안은 채점은 하되 오답노트에 누적하지 않는다.
 */
router.post('/submit', async (req, res, next) => {
  try {
    const answers = req.body?.answers;
    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: '제출할 답안이 없습니다.' });
    }
    const mode = MODES.includes(req.body?.mode) ? req.body.mode : 'exam';
    const countsInNotes = mode === 'exam' ? 1 : 0;

    const results = [];
    for (const item of answers) {
      const question = repo.getQuestion(Number(item.question_id));
      if (!question) continue;
      const answerText = item.answer_text ?? '';
      const graded = await gradeAnswer(question, answerText);

      const { lastInsertRowid } = run(
        `INSERT INTO attempt
           (question_id, answer_text, score, ratio, verdict, matched_groups, missing_groups,
            feedback, graded_by, mode, counts_in_notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        question.question_id,
        answerText,
        graded.score,
        graded.ratio,
        graded.verdict,
        JSON.stringify(graded.matched_groups),
        JSON.stringify(graded.missing_groups),
        graded.feedback ?? null,
        graded.graded_by,
        mode,
        countsInNotes
      );
      const saved = get('SELECT submitted_at FROM attempt WHERE attempt_id = ?', Number(lastInsertRowid));

      results.push({
        attempt_id: Number(lastInsertRowid),
        question_id: question.question_id,
        source_no: question.source_no,
        question_text: question.question_text,
        // 채점이 끝난 뒤에는 모범답안을 보여준다 (복습용)
        reference_text: (question.references ?? []).map((r) => r.source_text).join('\n\n'),
        answer_text: answerText,
        submitted_at: saved?.submitted_at,
        mode,
        counts_in_notes: countsInNotes === 1,
        ...graded,
      });
    }

    if (results.length === 0) return res.status(404).json({ error: '채점할 문제를 찾지 못했습니다.' });

    const totalScore = results.reduce((sum, r) => sum + r.score, 0);
    res.json({
      results,
      mode,
      summary: {
        count: results.length,
        total_score: Math.round(totalScore * 2) / 2,
        max_total: results.length * 5,
        o: results.filter((r) => r.verdict === 'O').length,
        triangle: results.filter((r) => r.verdict === 'TRIANGLE').length,
        x: results.filter((r) => r.verdict === 'X').length,
      },
    });
  } catch (err) {
    next(err);
  }
});

/** 채점이 끝난 시도를 오답노트 집계에 넣거나 뺀다. (키워드 채점이 잘못 판정한 경우 등) */
router.patch('/attempts/:attemptId', (req, res) => {
  const attemptId = Number(req.params.attemptId);
  const include = req.body?.counts_in_notes;
  if (typeof include !== 'boolean') {
    return res.status(400).json({ error: 'counts_in_notes 는 true 또는 false 여야 합니다.' });
  }
  const attempt = get('SELECT attempt_id FROM attempt WHERE attempt_id = ?', attemptId);
  if (!attempt) return res.status(404).json({ error: '시도 기록을 찾을 수 없습니다.' });

  run('UPDATE attempt SET counts_in_notes = ? WHERE attempt_id = ?', include ? 1 : 0, attemptId);
  res.json({ attempt_id: attemptId, counts_in_notes: include });
});

export default router;
