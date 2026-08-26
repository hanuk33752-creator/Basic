import test from 'node:test';
import assert from 'node:assert/strict';
import { detectRequiredCount } from '../src/services/parse.js';
import { localSplit, localKeywords } from '../src/services/extract.js';

test('요구 항목 수(N) 검출', () => {
  assert.equal(detectRequiredCount('원인을 3가지 서술하시오.'), 3);
  assert.equal(detectRequiredCount('세 가지를 쓰시오'), 3);
  assert.equal(detectRequiredCount('다섯가지 설명하시오'), 5);
  assert.equal(detectRequiredCount('개념을 설명하시오.'), null);
  assert.equal(detectRequiredCount('5가지 중 두 가지를 쓰시오'), 2, '마지막 값이 실제 요구치');
  assert.equal(detectRequiredCount('99가지'), null, '비현실적인 값은 무시');
});

test('번호 기반 문제/참고자료 분리', () => {
  const doc = [
    '1. 슬러지 벌킹의 원인을 3가지 서술하시오.',
    '답) 사상균 증식. DO 부족. F/M비 불균형.',
    '2. 자테스트의 목적을 설명하시오.',
    '정답: 최적 응집제 주입량 결정.',
  ].join('\n');

  const out = localSplit(doc);
  assert.equal(out.length, 2);
  assert.equal(out[0].question_text, '슬러지 벌킹의 원인을 3가지 서술하시오.');
  assert.equal(out[0].required_count, 3);
  assert.match(out[0].source_text, /사상균 증식/);
  assert.equal(out[1].required_count, null);
  assert.match(out[1].source_text, /최적 응집제/);
});

test('N이 있으면 항목별 그룹, 없으면 flat 키워드', () => {
  const ref = '사상성 미생물 증식\n용존산소 부족\n영양염류 불균형';
  const groups = localKeywords(ref, '원인 3가지를 쓰시오', 3);
  assert.equal(groups.length, 3);
  assert.ok(groups.every((g) => g.keywords.length > 0));

  const flat = localKeywords(ref, '설명하시오', null);
  assert.equal(flat.length, 1);
  assert.equal(flat[0].label, null);
});
