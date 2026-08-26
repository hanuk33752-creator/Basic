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

  // 문서 업로드 파이프라인
  parseDocument: (file) => {
    const form = new FormData();
    form.append('file', file);
    return request('POST', '/upload/parse', form, true);
  },
  confirmCandidates: (packId, candidates) => request('POST', '/upload/confirm', { packId, candidates }),

  // 문제
  listQuestions: (packId) => request('GET', `/questions${packId ? `?packId=${packId}` : ''}`),
  getQuestion: (id) => request('GET', `/questions/${id}`),
  createQuestion: (payload) => request('POST', '/questions', payload),
  updateQuestion: (id, payload) => request('PUT', `/questions/${id}`, payload),
  deleteQuestion: (id) => request('DELETE', `/questions/${id}`),
};

export default api;
