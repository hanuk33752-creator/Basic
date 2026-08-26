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
    question_text: q.question_text,
    year_round: q.year_round,
    max_score: q.max_score,
    required_count: q.required_count,
  }));

  res.json({
    pack: { pack_id: pack.pack_id, name: pack.name },
    requested: count,
    // 채점 기준이 없는 문제는 출제 대상에서 빠지므로 그 수도 함께 알려준다.
    available: repo.countReady(pack.pack_id),
    questions,
  });
});

/** 답안 일괄 제출 → 채점 → 시도 기록 저장 */
router.post('/submit', async (req, res, next) => {
  try {
    const answers = req.body?.answers;
    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: '제출할 답안이 없습니다.' });
    }

    const results = [];
    for (const item of answers) {
      const question = repo.getQuestion(Number(item.question_id));
      if (!question) continue;
      const answerText = item.answer_text ?? '';
      const graded = await gradeAnswer(question, answerText);

      const { lastInsertRowid } = run(
        `INSERT INTO attempt
           (question_id, answer_text, score, ratio, verdict, matched_groups, missing_groups, feedback, graded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        question.question_id,
        answerText,
        graded.score,
        graded.ratio,
        graded.verdict,
        JSON.stringify(graded.matched_groups),
        JSON.stringify(graded.missing_groups),
        graded.feedback ?? null,
        graded.graded_by
      );
      const saved = get('SELECT submitted_at FROM attempt WHERE attempt_id = ?', Number(lastInsertRowid));

      results.push({
        attempt_id: Number(lastInsertRowid),
        question_id: question.question_id,
        question_text: question.question_text,
        year_round: question.year_round,
        answer_text: answerText,
        submitted_at: saved?.submitted_at,
        ...graded,
      });
    }

    if (results.length === 0) return res.status(404).json({ error: '채점할 문제를 찾지 못했습니다.' });

    const totalScore = results.reduce((sum, r) => sum + r.score, 0);
    res.json({
      results,
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

export default router;
