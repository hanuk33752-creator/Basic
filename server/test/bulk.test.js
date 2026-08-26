import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4800 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${PORT}/api`;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quizapp-bulk-'));
let server;

before(async () => {
  server = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'index.js')], {
    env: { ...process.env, PORT: String(PORT), DB_PATH: path.join(tmpDir, 'bulk.db'), ANTHROPIC_API_KEY: '' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 80; i += 1) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return;
    } catch { /* 기동 대기 */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('서버 기동 실패');
});

after(() => {
  server?.kill();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function call(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function waitJob(jobId) {
  for (let i = 0; i < 600; i += 1) {
    const { data } = await call('GET', `/upload/jobs/${jobId}`);
    if (data.status === 'done') return data.result;
    if (data.status === 'error') throw new Error(data.error);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('작업이 끝나지 않았습니다');
}

/** 절반은 참고자료가 있고 절반은 빈, 300개짜리 문서를 만든다. */
function buildDocument(count) {
  const lines = [];
  for (let i = 1; i <= count; i += 1) {
    lines.push(`${i}. 시험문제 ${i}번의 원인을 3가지 서술하시오.`);
    if (i % 2 === 1) {
      lines.push(`답) 원인가${i} 항목이 있다.\n둘째 원인나${i} 항목이 있다.\n셋째 원인다${i} 항목이 있다.`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

test('300문제 일괄 등록과 빈 문제 출제 제외', async (t) => {
  await call('POST', '/packs', { name: '대량등록' });

  let candidates;

  await t.test('300문제 문서를 파싱한다', async () => {
    const form = new FormData();
    form.append('file', new Blob([buildDocument(300)], { type: 'text/plain' }), 'bulk.txt');
    const res = await fetch(`${BASE}/upload/parse`, { method: 'POST', body: form });
    assert.equal(res.status, 202, '즉시 job_id 를 돌려준다');
    const job = await res.json();
    assert.ok(job.job_id);

    const result = await waitJob(job.job_id);
    assert.equal(result.candidates.length, 300);
    assert.equal(result.truncated, false);
    candidates = result.candidates;
  });

  await t.test('300문제를 한 번에 저장한다', async () => {
    const { status, data } = await call('POST', '/upload/confirm', { candidates });
    assert.equal(status, 202);
    const result = await waitJob(data.job_id);

    assert.equal(result.saved_count, 300);
    assert.equal(result.failed.length, 0);
    // 참고자료가 비어 키워드를 못 만든 문제는 incomplete 로 보고된다.
    assert.equal(result.incomplete.length, 150);
    assert.equal(result.ready_count, 150);
  });

  await t.test('빈 문제는 랜덤 출제에 절대 포함되지 않는다', async () => {
    const { data: packs } = await call('GET', '/packs');
    const pack = packs.packs.find((p) => p.name === '대량등록');
    assert.equal(pack.question_count, 300);
    assert.equal(pack.ready_count, 150);

    const seen = new Set();
    for (let i = 0; i < 40; i += 1) {
      const { data } = await call('GET', '/quiz?count=10');
      assert.equal(data.questions.length, 10);
      assert.equal(data.available, 150);
      for (const q of data.questions) seen.add(q.question_id);
    }

    // 뽑힌 문제는 모두 채점 기준이 있는 것들이어야 한다.
    const { data: incomplete } = await call('GET', '/questions/incomplete');
    const blocked = new Set(incomplete.questions.map((q) => q.question_id));
    assert.equal(blocked.size, 150);
    for (const id of seen) assert.ok(!blocked.has(id), `빈 문제 #${id} 가 출제되었다`);
  });

  await t.test('상한을 넘는 요청은 거부된다', async () => {
    const tooMany = Array.from({ length: 501 }, (_, i) => ({ question_text: `문제 ${i}` }));
    const { status } = await call('POST', '/upload/confirm', { candidates: tooMany });
    assert.equal(status, 413);
  });
});
