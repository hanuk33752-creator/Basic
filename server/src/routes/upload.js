import { Router } from 'express';
import multer from 'multer';
import * as repo from '../repo.js';
import { extractText, detectRequiredCount } from '../services/parse.js';
import { proposeQuestions, buildKeywords, MAX_CANDIDATES } from '../services/extract.js';
import { isClaudeAvailable } from '../services/claude.js';
import { createJob, getJob, updateJob, finishJob, failJob, publicView, mapWithConcurrency } from '../services/jobs.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const SAVE_CONCURRENCY = Number(process.env.EXTRACT_CONCURRENCY) || 4;

/**
 * 1차 파싱: 문서 → 문제 후보 미리보기 (아직 저장하지 않음)
 * 문서가 크면 몇 분씩 걸리므로 잡을 만들어 즉시 job_id 를 돌려주고 백그라운드로 처리한다.
 */
router.post('/parse', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '파일이 필요합니다.' });

  const { originalname, buffer } = req.file;
  const job = createJob('parse');
  res.status(202).json(publicView(job));

  (async () => {
    try {
      updateJob(job.job_id, { phase: '문서에서 텍스트 추출 중' });
      const text = await extractText(buffer, originalname);
      if (!text) throw new Error('문서에서 텍스트를 추출하지 못했습니다.');

      updateJob(job.job_id, { phase: '문제와 참고자료 분리 중' });
      const { source, candidates, truncated, failures } = await proposeQuestions(text, {
        onProgress: (done, total) => updateJob(job.job_id, { progress: done, total }),
      });

      finishJob(job.job_id, {
        filename: originalname,
        char_count: text.length,
        parsed_by: source,
        claude_available: isClaudeAvailable(),
        truncated: !!truncated,
        max_candidates: MAX_CANDIDATES,
        failures: failures ?? [],
        candidates,
      });
    } catch (err) {
      console.error('[upload/parse]', err);
      failJob(job.job_id, err);
    }
  })();
});

/**
 * 2차 확정: 사용자가 확인한 후보들에 대해 키워드 그룹을 추출하고 저장한다.
 * 300개 단위 일괄 등록을 감안해 백그라운드 잡 + 제한된 동시성으로 처리한다.
 */
router.post('/confirm', (req, res) => {
  const { packId, candidates } = req.body ?? {};
  const targetPack = Number(packId) || repo.getActivePack()?.pack_id;
  if (!targetPack) return res.status(400).json({ error: '자격증 팩을 먼저 선택해 주세요.' });
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return res.status(400).json({ error: '저장할 문제가 없습니다.' });
  }
  if (candidates.length > MAX_CANDIDATES) {
    return res
      .status(413)
      .json({ error: `한 번에 저장할 수 있는 문제는 ${MAX_CANDIDATES}개까지입니다. (요청 ${candidates.length}개)` });
  }

  const valid = candidates.filter((c) => (c.question_text ?? '').trim());
  const job = createJob('confirm');
  updateJob(job.job_id, { total: valid.length, phase: '키워드 추출 중' });
  res.status(202).json(publicView(job));

  (async () => {
    try {
      const saved = [];
      const failed = [];
      const incomplete = [];
      let done = 0;

      // 문제별로 키워드를 뽑는다. 저장은 순서를 보장하려고 추출 뒤에 한 번에 한다.
      const prepared = await mapWithConcurrency(
        valid,
        SAVE_CONCURRENCY,
        async (c) => {
          const questionText = c.question_text.trim();
          const requested =
            c.required_count === '' || c.required_count === undefined || c.required_count === null
              ? detectRequiredCount(questionText)
              : c.required_count;
          const kw = await buildKeywords({
            question_text: questionText,
            source_text: c.source_text ?? '',
            required_count: requested,
          });
          return { c, questionText, requested, kw };
        },
        () => {
          done += 1;
          updateJob(job.job_id, { progress: done });
        }
      );

      updateJob(job.job_id, { phase: '문제은행에 저장 중' });
      prepared.forEach((r, i) => {
        const source = valid[i];
        if (!r.ok) {
          failed.push({ question_text: (source.question_text ?? '').slice(0, 60), error: r.error?.message ?? String(r.error) });
          return;
        }
        const { c, questionText, requested, kw } = r.value;
        // 사용자가 미리보기에서 N을 직접 지정했으면 그 값을 우선한다.
        const requiredCount = c.required_count_locked ? requested : kw.required_count ?? requested ?? null;
        const question = repo.saveQuestion({
          packId: targetPack,
          questionText,
          yearRound: c.year_round?.trim() || null,
          requiredCount: requiredCount ?? null,
          sourceText: c.source_text?.trim() || null,
          groups: kw.groups,
        });
        saved.push(question);
        // 키워드를 하나도 못 뽑은 문제는 채점이 불가능해 랜덤 출제에서 제외된다.
        if (question.keyword_groups.length === 0) {
          incomplete.push({ question_id: question.question_id, question_text: questionText.slice(0, 60) });
        }
      });

      finishJob(job.job_id, {
        saved_count: saved.length,
        ready_count: saved.length - incomplete.length,
        incomplete,
        failed,
        pack_id: targetPack,
      });
    } catch (err) {
      console.error('[upload/confirm]', err);
      failJob(job.job_id, err);
    }
  })();
});

/** 잡 진행 상황 폴링 */
router.get('/jobs/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: '작업을 찾을 수 없습니다. (만료되었을 수 있습니다)' });
  res.json(publicView(job));
});

export default router;
