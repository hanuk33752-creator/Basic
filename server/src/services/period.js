/**
 * 오답노트와 복습 출제가 함께 쓰는 기간 필터.
 * submitted_at 은 서버 로컬 시간으로 저장되므로 경계값도 localtime 기준으로 만든다.
 */
export const PERIODS = {
  all: null,
  '7d': "datetime('now', 'localtime', '-7 days')",
  '30d': "datetime('now', 'localtime', '-30 days')",
  month: "datetime('now', 'localtime', 'start of month')",
};

export function isValidPeriod(period) {
  return period in PERIODS;
}

/** `AND a.submitted_at >= …` 조각. 전체 기간이면 빈 문자열. */
export function periodClause(period, alias = 'a') {
  const boundary = PERIODS[period] ?? null;
  return boundary ? `AND ${alias}.submitted_at >= ${boundary}` : '';
}
