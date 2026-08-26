const BASE = '/api';

async function request(method, url, body, isForm = false) {
  const opts = { method };
  if (body !== undefined) {
    if (isForm) opts.body = body;
    else {
      opts.headers = { 'content-type': 'application/json' };
      opts.body = JSON.stringify(body);
    }
  }
  const res = await fetch(BASE + url, opts);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error || `요청 실패 (${res.status})`);
  return data;
}

export const api = {
  health: () => request('GET', '/health'),

  // 자격증 팩
  listPacks: () => request('GET', '/packs'),
  createPack: (name, activate) => request('POST', '/packs', { name, activate }),
  activatePack: (packId) => request('POST', `/packs/${packId}/activate`),
  deletePack: (packId) => request('DELETE', `/packs/${packId}`),

  // 출제·채점
  startQuiz: (count, packId) =>
    request('GET', `/quiz?count=${count}${packId ? `&packId=${packId}` : ''}`),
  submitAnswers: (answers) => request('POST', '/submit', { answers }),

  // 오답노트
  listNotes: (period = 'all', packId) =>
    request('GET', `/notes?period=${period}${packId ? `&packId=${packId}` : ''}`),
  getNoteHistory: (questionId, period = 'all') =>
    request('GET', `/notes/${questionId}?period=${period}`),

  // 문서 업로드 파이프라인 (백그라운드 잡 + 폴링)
  parseDocument: (file) => {
    const form = new FormData();
    form.append('file', file);
    return request('POST', '/upload/parse', form, true);
  },
  confirmCandidates: (packId, candidates) => request('POST', '/upload/confirm', { packId, candidates }),
  getJob: (jobId) => request('GET', `/upload/jobs/${jobId}`),

  /** 잡이 끝날 때까지 폴링한다. onTick 으로 진행률을 흘려보낸다. */
  async waitForJob(jobId, onTick, intervalMs = 900) {
    for (;;) {
      const job = await this.getJob(jobId);
      onTick?.(job);
      if (job.status === 'done') return job.result;
      if (job.status === 'error') throw new Error(job.error || '작업이 실패했습니다.');
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  },

  // 문제
  listQuestions: (packId) => request('GET', `/questions${packId ? `?packId=${packId}` : ''}`),
  listIncomplete: (packId) => request('GET', `/questions/incomplete${packId ? `?packId=${packId}` : ''}`),
  deleteIncomplete: (packId) => request('DELETE', `/questions/incomplete${packId ? `?packId=${packId}` : ''}`),
  getQuestion: (id) => request('GET', `/questions/${id}`),
  createQuestion: (payload) => request('POST', '/questions', payload),
  updateQuestion: (id, payload) => request('PUT', `/questions/${id}`, payload),
  deleteQuestion: (id) => request('DELETE', `/questions/${id}`),
};

export default api;
