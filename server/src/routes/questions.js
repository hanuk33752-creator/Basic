import { Router } from 'express';
import * as repo from '../repo.js';

const router = Router();

router.get('/', (req, res) => {
  const packId = Number(req.query.packId) || repo.getActivePack()?.pack_id;
  if (!packId) return res.json({ questions: [] });
  res.json({ questions: repo.listQuestions(packId) });
});

router.get('/:questionId', (req, res) => {
  const q = repo.getQuestion(Number(req.params.questionId));
  if (!q) return res.status(404).json({ error: '문제를 찾을 수 없습니다.' });
  res.json(q);
});

router.post('/', (req, res) => {
  const { packId, questionText, yearRound, requiredCount, sourceText, groups } = req.body ?? {};
  const targetPack = Number(packId) || repo.getActivePack()?.pack_id;
  if (!targetPack) return res.status(400).json({ error: '자격증 팩을 먼저 만들어 주세요.' });
  if (!questionText?.trim()) return res.status(400).json({ error: '문제 본문이 필요합니다.' });
  res.status(201).json(
    repo.saveQuestion({
      packId: targetPack,
      questionText: questionText.trim(),
      yearRound: yearRound ?? null,
      requiredCount: requiredCount ?? null,
      sourceText: sourceText ?? null,
      groups: groups ?? [],
    })
  );
});

router.put('/:questionId', (req, res) => {
  const updated = repo.updateQuestion(Number(req.params.questionId), req.body ?? {});
  if (!updated) return res.status(404).json({ error: '문제를 찾을 수 없습니다.' });
  res.json(updated);
});

router.delete('/:questionId', (req, res) => {
  if (!repo.deleteQuestion(Number(req.params.questionId))) {
    return res.status(404).json({ error: '문제를 찾을 수 없습니다.' });
  }
  res.json({ ok: true });
});

export default router;
