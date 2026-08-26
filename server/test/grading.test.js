import test from 'node:test';
import assert from 'node:assert/strict';
import { computeRatio, scoreOf, verdictOf, roundToHalf } from '../src/services/grading.js';

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
