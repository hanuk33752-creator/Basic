import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4321 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${PORT}/api`;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quizapp-e2e-'));

let server;

before(async () => {
  server = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'index.js')], {
    env: { ...process.env, PORT: String(PORT), DB_PATH: path.join(tmpDir, 'e2e.db'), ANTHROPIC_API_KEY: '' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch { /* 아직 기동 전 */ }
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
  assert.ok(res.ok, `${method} ${url} 실패: ${JSON.stringify(data)}`);
  return data;
}

test('전체 흐름: 팩 생성 → 문제 등록 → 출제 → 채점 → 오답노트', async (t) => {
  await t.test('첫 팩은 자동으로 활성화된다', async () => {
    const pack = await call('POST', '/packs', { name: '수질환경기사' });
    assert.equal(pack.is_active, 1);
  });

  await t.test('N이 있는 문제와 없는 문제를 등록한다', async () => {
    await call('POST', '/questions', {
      questionText: '슬러지 벌킹의 원인을 3가지 서술하시오.',
      requiredCount: 3,
      sourceText: '사상균 증식 / 용존산소 부족 / F/M비 불균형 / 영양염류 불균형',
      groups: [
        { label: '사상균 과다 증식', keywords: ['사상균', '증식'] },
        { label: '용존산소 부족', keywords: ['용존산소', '부족'] },
        { label: 'F/M비 불균형', keywords: ['F/M비', '불균형'] },
        { label: '영양염류 불균형', keywords: ['영양염류', '질소'] },
      ],
    });
    await call('POST', '/questions', {
      questionText: '자테스트의 목적을 설명하시오.',
      sourceText: '최적 응집제 주입량과 최적 pH를 결정한다.',
      groups: [{ keywords: ['응집제', '주입량', 'pH', '최적'] }],
    });

    const { questions } = await call('GET', '/questions');
    assert.equal(questions.length, 2);
    // N 없는 문제는 flat 그룹 1개로 저장된다.
    const flat = questions.find((q) => q.required_count == null);
    assert.equal(flat.keyword_groups.length, 1);
    assert.equal(flat.keyword_groups[0].is_flat, true);
  });

  await t.test('채점 기준이 없는 문제는 저장은 되지만 출제 대상에서 빠진다', async () => {
    // 참고자료도 키워드도 없이 등록된 문제 (문서 파싱이 빈칸으로 끝난 경우)
    await call('POST', '/questions', { questionText: '참고자료가 없어 채점할 수 없는 문제입니다.' });

    const { packs } = await call('GET', '/packs');
    const pack = packs.find((p) => p.name === '수질환경기사');
    assert.equal(pack.question_count, 3);
    assert.equal(pack.ready_count, 2, '채점 기준이 있는 문제만 출제 가능으로 센다');

    // 100번 뽑아도 빈 문제는 절대 안 나와야 한다.
    for (let i = 0; i < 30; i += 1) {
      const quiz = await call('GET', '/quiz?count=10');
      assert.equal(quiz.questions.length, 2);
      assert.ok(
        quiz.questions.every((q) => !q.question_text.includes('채점할 수 없는')),
        '채점 기준 없는 문제가 출제되었다'
      );
    }

    const { questions: incomplete } = await call('GET', '/questions/incomplete');
    assert.equal(incomplete.length, 1);

    const { deleted } = await call('DELETE', '/questions/incomplete');
    assert.equal(deleted, 1);
    const after = await call('GET', '/packs');
    assert.equal(after.packs.find((p) => p.name === '수질환경기사').question_count, 2);
  });

  await t.test('출제 응답에 채점 기준과 모범답안이 새지 않는다', async () => {
    const quiz = await call('GET', '/quiz?count=5');
    assert.equal(quiz.questions.length, 2, '등록된 문제가 부족하면 있는 만큼만 출제');
    assert.equal(quiz.available, 2);
    for (const q of quiz.questions) {
      assert.equal(q.keyword_groups, undefined);
      assert.equal(q.references, undefined);
      assert.equal(q.reference_text, undefined, '풀기 전에는 모범답안을 주지 않는다');
    }
  });

  await t.test('채점 결과에는 모범답안과 문제 번호가 함께 온다', async () => {
    const created = await call('POST', '/questions', {
      questionText: '번호가 붙은 문제입니다.',
      sourceNo: '2023-1',
      sourceText: '이것이 모범답안 원문입니다.',
      groups: [{ keywords: ['모범답안', '원문'] }],
    });
    assert.equal(created.source_no, '2023-1');

    const { results } = await call('POST', '/submit', {
      mode: 'practice',
      answers: [{ question_id: created.question_id, answer_text: '모범답안 원문' }],
    });
    assert.equal(results[0].source_no, '2023-1');
    assert.equal(results[0].reference_text, '이것이 모범답안 원문입니다.');

    await call('DELETE', `/questions/${created.question_id}`);
  });

  await t.test('허용되지 않은 출제 개수는 거부된다', async () => {
    const res = await fetch(`${BASE}/quiz?count=7`);
    assert.equal(res.status, 400);
  });

  await t.test('3항목 중 3개를 맞히면 5점 O', async () => {
    const { results } = await call('POST', '/submit', {
      answers: [{ question_id: 1, answer_text: '사상균 증식, 용존산소 부족, F/M비 불균형 때문이다.' }],
    });
    assert.equal(results[0].score, 5);
    assert.equal(results[0].verdict, 'O');
    assert.equal(results[0].credited_count, 3);
  });

  await t.test('N을 초과해 맞혀도 5점을 넘지 않는다', async () => {
    const { results } = await call('POST', '/submit', {
      answers: [
        {
          question_id: 1,
          answer_text: '사상균 증식, 용존산소 부족, F/M비 불균형, 영양염류 질소 불균형',
        },
      ],
    });
    assert.equal(results[0].matched_count, 4);
    assert.equal(results[0].credited_count, 3);
    assert.equal(results[0].score, 5);
  });

  await t.test('일부만 맞히면 부분점수와 △ 판정', async () => {
    const { results } = await call('POST', '/submit', {
      answers: [{ question_id: 1, answer_text: '사상균이 증식하고 용존산소가 부족하다.' }],
    });
    assert.equal(results[0].score, 3.5); // 2/3 × 5 = 3.33 → 3.5
    assert.equal(results[0].verdict, 'TRIANGLE');
    assert.equal(results[0].missing_groups.length, 2);
  });

  await t.test('빈 답안은 0점 X', async () => {
    const { results } = await call('POST', '/submit', {
      answers: [{ question_id: 1, answer_text: '   ' }],
    });
    assert.equal(results[0].score, 0);
    assert.equal(results[0].verdict, 'X');
  });

  await t.test('flat 문제는 키워드 비율로 채점된다', async () => {
    const { results } = await call('POST', '/submit', {
      answers: [{ question_id: 2, answer_text: '최적 응집제 주입량을 정한다.' }],
    });
    assert.equal(results[0].mode, 'flat');
    assert.equal(results[0].total_candidates, 4);
    assert.equal(results[0].matched_count, 3); // 응집제, 주입량, 최적
    assert.equal(results[0].score, 4); // 3/4 × 5 = 3.75 → 4
    assert.equal(results[0].verdict, 'TRIANGLE');
  });

  await t.test('연습 모드 시도는 채점은 되지만 오답노트에 쌓이지 않는다', async () => {
    const before = await call('GET', '/notes?period=all');
    const beforeCount = before.totals.attempt_count;

    const { results, mode } = await call('POST', '/submit', {
      mode: 'practice',
      answers: [{ question_id: 1, answer_text: '전혀 모르겠습니다' }],
    });
    assert.equal(mode, 'practice');
    assert.equal(results[0].verdict, 'X', '채점은 정상적으로 이뤄진다');
    assert.equal(results[0].counts_in_notes, false);

    const after = await call('GET', '/notes?period=all');
    assert.equal(after.totals.attempt_count, beforeCount, '오답노트 집계가 늘지 않는다');
  });

  await t.test('채점 후 오답노트에서 뺐다가 다시 넣을 수 있다', async () => {
    const { results } = await call('POST', '/submit', {
      mode: 'exam',
      answers: [{ question_id: 1, answer_text: '모르겠습니다' }],
    });
    const attemptId = results[0].attempt_id;
    assert.equal(results[0].counts_in_notes, true);

    const withAttempt = await call('GET', '/notes?period=all');
    const wrongWith = withAttempt.rows.find((r) => r.question_id === 1).wrong_count;

    await call('PATCH', `/attempts/${attemptId}`, { counts_in_notes: false });
    const without = await call('GET', '/notes?period=all');
    assert.equal(
      without.rows.find((r) => r.question_id === 1).wrong_count,
      wrongWith - 1,
      '뺀 시도만큼 오답 횟수가 줄어든다'
    );

    await call('PATCH', `/attempts/${attemptId}`, { counts_in_notes: true });
    const again = await call('GET', '/notes?period=all');
    assert.equal(again.rows.find((r) => r.question_id === 1).wrong_count, wrongWith);

    // 다시 빼서 이후 테스트에 영향을 주지 않도록 한다.
    await call('PATCH', `/attempts/${attemptId}`, { counts_in_notes: false });
  });

  await t.test('잘못된 제외 요청은 거부된다', async () => {
    const bad = await fetch(`${BASE}/attempts/1`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ counts_in_notes: 'yes' }),
    });
    assert.equal(bad.status, 400);

    const missing = await fetch(`${BASE}/attempts/999999`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ counts_in_notes: false }),
    });
    assert.equal(missing.status, 404);
  });

  await t.test('오답노트는 X+△를 누적하고 오답 많은 순으로 정렬한다', async () => {
    const notes = await call('GET', '/notes?period=all');
    assert.equal(notes.rows.length, 2);
    assert.equal(notes.rows[0].question_id, 1);
    assert.equal(notes.rows[0].wrong_count, 2); // △ 1 + X 1
    assert.equal(notes.rows[0].x_count, 1);
    assert.equal(notes.rows[0].triangle_count, 1);
    assert.equal(notes.rows[0].o_count, 2);
    assert.equal(notes.totals.attempt_count, 5);
    // 오답 횟수가 같지 않으면 내림차순이어야 한다.
    assert.ok(notes.rows[0].wrong_count >= notes.rows[1].wrong_count);
  });

  await t.test('시도 이력이 최신순으로 영구 저장된다', async () => {
    const { attempts } = await call('GET', '/notes/1');
    assert.equal(attempts.length, 4);
    assert.ok(attempts.every((a) => a.submitted_at));
    assert.ok(Array.isArray(attempts[0].matched_groups));
  });

  await t.test('팩을 교체하면 출제 대상이 바뀐다', async () => {
    const other = await call('POST', '/packs', { name: '대기환경기사', activate: true });
    const quiz = await fetch(`${BASE}/quiz?count=1`).then((r) => r.json());
    assert.equal(quiz.pack.name, '대기환경기사');
    assert.equal(quiz.questions.length, 0, '새 팩에는 아직 문제가 없다');

    // 이전 팩의 오답노트도 팩 기준으로 분리된다.
    const notes = await call('GET', '/notes?period=all');
    assert.equal(notes.rows.length, 0);

    await call('POST', '/packs/1/activate');
    const back = await call('GET', '/notes?period=all');
    assert.equal(back.rows.length, 2, '팩을 되돌리면 오답노트도 되돌아온다');
  });
});
