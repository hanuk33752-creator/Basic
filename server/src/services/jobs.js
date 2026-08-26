import { randomUUID } from 'node:crypto';

/**
 * 오래 걸리는 업로드 작업(문서 파싱 / 키워드 추출)을 백그라운드로 돌리고
 * 진행률을 폴링으로 조회할 수 있게 하는 아주 단순한 인메모리 잡 스토어.
 * 1인용 앱이라 프로세스 메모리로 충분하다.
 */
const jobs = new Map();
const TTL_MS = 60 * 60 * 1000; // 완료 후 1시간 뒤 정리

export function createJob(type) {
  const job = {
    job_id: randomUUID(),
    type,
    status: 'running', // running | done | error
    phase: '준비 중',
    progress: 0,
    total: 0,
    result: null,
    error: null,
    created_at: Date.now(),
    finished_at: null,
  };
  jobs.set(job.job_id, job);
  sweep();
  return job;
}

export function getJob(jobId) {
  return jobs.get(jobId);
}

export function updateJob(jobId, patch) {
  const job = jobs.get(jobId);
  if (job) Object.assign(job, patch);
  return job;
}

export function finishJob(jobId, result) {
  return updateJob(jobId, { status: 'done', result, finished_at: Date.now(), phase: '완료' });
}

export function failJob(jobId, error) {
  return updateJob(jobId, {
    status: 'error',
    error: error?.message ?? String(error),
    finished_at: Date.now(),
    phase: '실패',
  });
}

/** 폴링 응답용 (result 는 완료 시에만 싣는다) */
export function publicView(job) {
  const { job_id, type, status, phase, progress, total, error } = job;
  return { job_id, type, status, phase, progress, total, error, result: status === 'done' ? job.result : null };
}

function sweep() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.finished_at && now - job.finished_at > TTL_MS) jobs.delete(id);
  }
}

/**
 * 작업들을 제한된 동시성으로 실행한다. (Claude API 호출을 병렬화하되 과부하는 피함)
 * onDone 은 개별 작업이 끝날 때마다 호출된다.
 */
export async function mapWithConcurrency(items, limit, worker, onDone) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runner() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = { ok: true, value: await worker(items[index], index) };
      } catch (err) {
        results[index] = { ok: false, error: err };
      }
      onDone?.(index, results[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return results;
}
