import test from 'node:test';
import assert from 'node:assert/strict';
import { computeRatio, creditGroups, scoreOf, verdictOf, roundToHalf } from '../src/services/grading.js';

test('0.5점 단위 반올림', () => {
  assert.equal(roundToHalf(1.24), 1);
  assert.equal(roundToHalf(1.25), 1.5);
  assert.equal(roundToHalf(3.33), 3.5);
  assert.equal(roundToHalf(5), 5);
});

test('N이 있는 문제: min(맞춘 그룹, N) / N × 5', () => {
  const ratio = (matched, n) => computeRatio({ requiredCount: n, matchedCount: matched });
  assert.equal(scoreOf(ratio(3, 3)), 5);
  assert.equal(scoreOf(ratio(2, 3)), 3.5); // 2/3×5 = 3.33 → 3.5
  assert.equal(scoreOf(ratio(1, 3)), 1.5); // 1/3×5 = 1.67 → 1.5
  assert.equal(scoreOf(ratio(0, 3)), 0);
  assert.equal(scoreOf(ratio(2, 4)), 2.5);
});

test('N 초과 작성분은 추가 점수도 감점도 없음', () => {
  assert.equal(computeRatio({ requiredCount: 3, matchedCount: 5 }), 1);
  assert.equal(scoreOf(computeRatio({ requiredCount: 3, matchedCount: 5 })), 5);
});

test('N이 없는 문제: 매칭 키워드 수 / 전체 키워드 수 × 5', () => {
  const ratio = (m, t) => computeRatio({ requiredCount: null, matchedCount: m, totalCount: t });
  assert.equal(scoreOf(ratio(10, 10)), 5);
  assert.equal(scoreOf(ratio(5, 10)), 2.5);
  assert.equal(scoreOf(ratio(3, 10)), 1.5);
  assert.equal(scoreOf(ratio(0, 10)), 0);
});

test('O / △ / X 판정 경계', () => {
  assert.equal(verdictOf(1), 'O');
  assert.equal(verdictOf(0.999), 'TRIANGLE');
  assert.equal(verdictOf(0.5), 'TRIANGLE');
  assert.equal(verdictOf(0.4999), 'X');
  assert.equal(verdictOf(0), 'X');
});

test('키워드가 없으면 비율 0', () => {
  assert.equal(computeRatio({ requiredCount: null, matchedCount: 0, totalCount: 0 }), 0);
  assert.equal(computeRatio({ requiredCount: 0, matchedCount: 3 }), 0);
});

/* ── 필수 항목(*)이 섞인 복합 문제 ────────────────────────── */

const credit = (opts) => creditGroups({ requiredCount: 4, requiredTotal: 1, ...opts });

test('필수 항목: 정의(필수 1) + 대책 후보 5개, N=4', () => {
  // 정의를 쓰고 대책 3개 → 만점
  let r = credit({ matchedRequired: 1, matchedOptional: 3 });
  assert.equal(r.credited, 4);
  assert.equal(scoreOf(r.credited / r.effectiveRequiredCount), 5);

  // 정의를 빼먹고 대책만 5개 → 선택 자리는 3개까지만 → 3/4
  r = credit({ matchedRequired: 0, matchedOptional: 5 });
  assert.equal(r.credited, 3, '필수를 빼먹으면 만점이 될 수 없다');
  assert.equal(scoreOf(r.credited / r.effectiveRequiredCount), 4);
  assert.equal(verdictOf(r.credited / r.effectiveRequiredCount), 'TRIANGLE');

  // 정의만 → 1/4
  r = credit({ matchedRequired: 1, matchedOptional: 0 });
  assert.equal(r.credited, 1);

  // 정의 + 대책 5개 → 초과분은 가감 없음
  r = credit({ matchedRequired: 1, matchedOptional: 5 });
  assert.equal(r.credited, 4);
});

test('필수 항목이 여러 개면 모두 맞혀야 만점', () => {
  const c = (mr, mo) =>
    creditGroups({ requiredCount: 4, requiredTotal: 2, matchedRequired: mr, matchedOptional: mo });
  assert.equal(c(2, 2).credited, 4);
  assert.equal(c(1, 3).credited, 3, '선택 자리는 2개뿐이라 3개를 다 인정하지 않는다');
  assert.equal(c(0, 4).credited, 2);
});

test('필수 항목이 없으면 기존 규칙과 같다', () => {
  const c = (matched) =>
    creditGroups({ requiredCount: 3, requiredTotal: 0, matchedRequired: 0, matchedOptional: matched });
  assert.equal(c(2).credited, 2);
  assert.equal(c(3).credited, 3);
  assert.equal(c(5).credited, 3, 'N 초과분은 인정하지 않는다');
});

test('필수 항목 수가 N보다 많으면 N을 필수 개수로 올린다', () => {
  const r = creditGroups({ requiredCount: 2, requiredTotal: 3, matchedRequired: 2, matchedOptional: 0 });
  assert.equal(r.effectiveRequiredCount, 3);
  assert.equal(r.credited, 2);
  assert.equal(scoreOf(r.credited / r.effectiveRequiredCount), 3.5);
});

/* ── 번호로 답이 대응되는 문제 ("1. 커진다 / 2. 작아진다") ── */

import { numberedGroups, splitNumberedAnswer } from '../src/services/grading.js';

test('모든 항목에 서로 다른 번호가 붙어야 번호형으로 본다', () => {
  assert.deepEqual(numberedGroups([{ label: '1. 커진다' }, { label: '2. 작아진다' }]), [1, 2]);
  assert.deepEqual(numberedGroups([{ label: '1) 가' }, { label: '2) 나' }, { label: '3) 다' }]), [1, 2, 3]);

  assert.equal(numberedGroups([{ label: '1. 커진다' }, { label: '작아진다' }]), null, '하나라도 번호가 없으면 아님');
  assert.equal(numberedGroups([{ label: '1. 가' }, { label: '1. 나' }]), null, '번호가 겹치면 아님');
  assert.equal(numberedGroups([{ label: '사상균 증식' }]), null);
});

test('답안을 번호별 조각으로 나눈다', () => {
  const segments = splitNumberedAnswer('1. 커진다 2. 작아진다 3. 커진다');
  assert.equal(segments.size, 3);
  assert.equal(segments.get(1).trim(), '커진다');
  assert.equal(segments.get(2).trim(), '작아진다');
  assert.equal(segments.get(3).trim(), '커진다');
});

test('줄바꿈·쉼표로 구분해도 번호를 찾는다', () => {
  const segments = splitNumberedAnswer('1) 커진다\n2) 작아진다');
  assert.equal(segments.get(1).trim(), '커진다');
  assert.equal(segments.get(2).trim(), '작아진다');
});

test('번호가 없으면 조각이 나오지 않는다', () => {
  assert.equal(splitNumberedAnswer('커진다, 작아진다, 커진다').size, 0);
});

test('일부 번호만 답해도 그 번호만 잡는다', () => {
  const segments = splitNumberedAnswer('2. 작아진다 3. 커진다');
  assert.equal(segments.size, 2);
  assert.equal(segments.has(1), false);
});
