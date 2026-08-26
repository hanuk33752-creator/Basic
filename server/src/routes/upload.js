import { Router } from 'express';
import multer from 'multer';
import * as repo from '../repo.js';
import { extractText, detectRequiredCount } from '../services/parse.js';
import { proposeQuestions, buildKeywords } from '../services/extract.js';
import { isClaudeAvailable } from '../services/claude.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

/** 1차 파싱: 문서 → 문제 후보 미리보기 (아직 저장하지 않음) */
router.post('/parse', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: '파일이 필요합니다.' });
    const text = await extractText(req.file.buffer, req.file.originalname);
    if (!text) return res.status(422).json({ error: '문서에서 텍스트를 추출하지 못했습니다.' });

    const { source, candidates } = await proposeQuestions(text);
    res.json({
      filename: req.file.originalname,
      char_count: text.length,
      parsed_by: source,
      claude_available: isClaudeAvailable(),
      candidates,
    });
  } catch (err) {
    next(err);
  }
});

/** 2차 확정: 사용자가 확인한 후보들에 대해 키워드 그룹을 추출하고 저장한다. */
router.post('/confirm', async (req, res, next) => {
  try {
    const { packId, candidates } = req.body ?? {};
    const targetPack = Number(packId) || repo.getActivePack()?.pack_id;
    if (!targetPack) return res.status(400).json({ error: '자격증 팩을 먼저 선택해 주세요.' });
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return res.status(400).json({ error: '저장할 문제가 없습니다.' });
    }

    const saved = [];
    const failed = [];
    for (const c of candidates) {
      const questionText = (c.question_text ?? '').trim();
      if (!questionText) continue;
      try {
        const requested =
          c.required_count === '' || c.required_count === undefined
            ? detectRequiredCount(questionText)
            : c.required_count;
        const kw = await buildKeywords({
          question_text: questionText,
          source_text: c.source_text ?? '',
          required_count: requested,
        });
        // 사용자가 미리보기에서 N을 직접 지정했으면 그 값을 우선한다.
        const requiredCount = c.required_count_locked ? requested : (kw.required_count ?? requested ?? null);
        saved.push(
          repo.saveQuestion({
            packId: targetPack,
            questionText,
            yearRound: c.year_round?.trim() || null,
            requiredCount: requiredCount ?? null,
            sourceText: c.source_text?.trim() || null,
            groups: kw.groups,
          })
        );
      } catch (err) {
        failed.push({ question_text: questionText.slice(0, 60), error: err.message });
      }
    }

    res.json({ saved_count: saved.length, failed, questions: saved });
  } catch (err) {
    next(err);
  }
});

export default router;
