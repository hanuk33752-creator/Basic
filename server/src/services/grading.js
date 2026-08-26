import { askJson, isClaudeAvailable } from './claude.js';

/* ────────────────────────────────────────────────────────────
 * 점수 계산 (스펙 6장)
 *  - 모든 문제 5점 만점, 백분율 부분점수, 0.5점 단위 반올림
 *  - N 있음: score = min(맞춘 그룹 수, N) / N × 5
 *  - N 없음: score = 매칭 키워드 수 / 전체 키워드 수 × 5
 *  - O: 100%, △: 50% 이상 100% 미만, X: 50% 미만
 * ──────────────────────────────────────────────────────────── */

export const MAX_SCORE = 5;

export function roundToHalf(value) {
  return Math.round(value * 2) / 2;
}

export function computeRatio({ requiredCount, matchedCount, totalCount }) {
  if (requiredCount) {
    if (requiredCount <= 0) return 0;
    // 초과 작성분은 추가 점수도 감점도 없다.
    return Math.min(matchedCount, requiredCount) / requiredCount;
  }
  if (!totalCount) return 0;
  return Math.min(matchedCount, totalCount) / totalCount;
}

export function verdictOf(ratio) {
  if (ratio >= 1) return 'O';
  if (ratio >= 0.5) return 'TRIANGLE';
  return 'X';
}

export function scoreOf(ratio) {
  return roundToHalf(Math.max(0, Math.min(1, ratio)) * MAX_SCORE);
}

/* ────────────────────────────────────────────────────────────
 * 채점
 * ──────────────────────────────────────────────────────────── */

const GROUP_SCHEMA = {
  type: 'object',
  properties: {
    matched_group_indexes: {
      type: 'array',
      items: { type: 'integer' },
      description: '답안이 의미상 충족한 항목의 group_index 목록',
    },
    notes: {
      type: 'array',
      description: '항목별 판정 근거',
      items: {
        type: 'object',
        properties: {
          group_index: { type: 'integer' },
          matched: { type: 'boolean' },
          reason: { type: 'string', description: '한 문장 근거' },
        },
        required: ['group_index', 'matched', 'reason'],
      },
    },
    feedback: { type: 'string', description: '학습자에게 줄 2~3문장 피드백' },
  },
  required: ['matched_group_indexes', 'notes', 'feedback'],
};

const FLAT_SCHEMA = {
  type: 'object',
  properties: {
    matched_keywords: {
      type: 'array',
      items: { type: 'string' },
      description: '답안이 의미상 담고 있는 키워드 (주어진 키워드 목록에서 그대로 골라 쓴다)',
    },
    feedback: { type: 'string', description: '학습자에게 줄 2~3문장 피드백' },
  },
  required: ['matched_keywords', 'feedback'],
};

const GRADER_SYSTEM = `너는 자격증 실기 서술형 답안을 채점한다.

핵심 원칙:
- 단순 문자열 포함 여부가 아니라 "의미"로 판정한다. 같은 뜻을 다른 표현·동의어·풀어쓴 설명으로
  적었으면 맞은 것으로 인정한다. (예: "DO 부족" ≡ "용존산소가 모자람")
- 반대로 키워드만 나열하고 문맥이 틀렸다면 인정하지 않는다.
- 채점 근거는 반드시 주어진 참고자료/키워드 안에서만 찾는다. 없는 항목을 지어내지 않는다.
- 애매하면 인정하지 않는 쪽으로 판정한다.`;

/**
 * 답안 1건을 채점한다.
 * question: repo.getQuestion() 결과 (keyword_groups, references 포함)
 */
export async function gradeAnswer(question, answerText) {
  const answer = (answerText ?? '').trim();
  const isFlat = question.required_count == null;
  const groups = question.keyword_groups ?? [];
  const reference = (question.references ?? []).map((r) => r.source_text).join('\n\n');

  if (!answer) return emptyResult(question, isFlat, groups);
  if (groups.length === 0) {
    return {
      ...emptyResult(question, isFlat, groups),
      feedback: '이 문제에는 채점 기준(키워드)이 등록되어 있지 않습니다. 문제 관리에서 참고자료를 추가해 주세요.',
    };
  }

  if (isClaudeAvailable()) {
    try {
      return isFlat
        ? await gradeFlatWithClaude(question, groups[0], answer, reference)
        : await gradeGroupsWithClaude(question, groups, answer, reference);
    } catch (err) {
      console.error('[grading] Claude 채점 실패, 로컬 채점으로 대체:', err.message);
    }
  }
  return gradeLocally(question, groups, answer, isFlat);
}

async function gradeGroupsWithClaude(question, groups, answer, reference) {
  const groupList = groups
    .map((g, i) => `- group_index ${i}: ${g.label ?? `항목 ${i + 1}`} (키워드: ${g.keywords.join(', ')})`)
    .join('\n');

  const result = await askJson({
    system: GRADER_SYSTEM,
    prompt:
      `<question>\n${question.question_text}\n</question>\n\n` +
      `<required_count>${question.required_count}</required_count>\n\n` +
      `<answer_candidates>\n${groupList}\n</answer_candidates>\n\n` +
      `<reference>\n${reference || '(없음)'}\n</reference>\n\n` +
      `<student_answer>\n${answer}\n</student_answer>\n\n` +
      `학생 답안이 위 항목들 중 어떤 것을 의미상 충족했는지 판정해라. ` +
      `같은 항목을 중복해서 적어도 1회만 인정한다.`,
    schema: GROUP_SCHEMA,
    toolName: 'grade_groups',
    maxTokens: 3000,
  });

  const validIndexes = [...new Set(result.matched_group_indexes ?? [])].filter(
    (i) => Number.isInteger(i) && i >= 0 && i < groups.length
  );
  return buildGroupResult(question, groups, validIndexes, result.feedback, 'claude', result.notes);
}

async function gradeFlatWithClaude(question, flatGroup, answer, reference) {
  const result = await askJson({
    system: GRADER_SYSTEM,
    prompt:
      `<question>\n${question.question_text}\n</question>\n\n` +
      `<keywords>\n${flatGroup.keywords.join(', ')}\n</keywords>\n\n` +
      `<reference>\n${reference || '(없음)'}\n</reference>\n\n` +
      `<student_answer>\n${answer}\n</student_answer>\n\n` +
      `학생 답안이 위 키워드들 중 어떤 것을 의미상 담고 있는지 판정해라.`,
    schema: FLAT_SCHEMA,
    toolName: 'grade_flat',
    maxTokens: 2000,
  });

  const keywords = flatGroup.keywords;
  const matched = keywords.filter((k) =>
    (result.matched_keywords ?? []).some((m) => m.trim() === k || m.trim().includes(k) || k.includes(m.trim()))
  );
  return buildFlatResult(question, keywords, matched, result.feedback, 'claude');
}

/* ── 로컬 폴백 채점 (API 키 없이도 동작) ───────────────────── */

function gradeLocally(question, groups, answer, isFlat) {
  const normalizedAnswer = normalize(answer);

  if (isFlat) {
    const keywords = groups[0].keywords;
    const matched = keywords.filter((k) => containsKeyword(normalizedAnswer, k));
    return buildFlatResult(
      question,
      keywords,
      matched,
      '로컬 규칙(키워드 포함 여부)으로 채점했습니다. 의미 기반 채점을 쓰려면 ANTHROPIC_API_KEY를 설정하세요.',
      'local'
    );
  }

  // 그룹의 키워드 절반 이상이 답안에 등장하면 그 항목을 맞춘 것으로 본다.
  const matchedIndexes = [];
  groups.forEach((g, i) => {
    const hits = g.keywords.filter((k) => containsKeyword(normalizedAnswer, k)).length;
    if (g.keywords.length > 0 && hits / g.keywords.length >= 0.5) matchedIndexes.push(i);
  });
  return buildGroupResult(
    question,
    groups,
    matchedIndexes,
    '로컬 규칙(키워드 포함 여부)으로 채점했습니다. 의미 기반 채점을 쓰려면 ANTHROPIC_API_KEY를 설정하세요.',
    'local'
  );
}

function normalize(text) {
  return text.toLowerCase().replace(/\s+/g, '');
}

function containsKeyword(normalizedAnswer, keyword) {
  const k = normalize(keyword);
  return k.length >= 2 && normalizedAnswer.includes(k);
}

/* ── 결과 조립 ────────────────────────────────────────────── */

function buildGroupResult(question, groups, matchedIndexes, feedback, gradedBy, notes = []) {
  const n = question.required_count;
  const matchedGroups = matchedIndexes.map((i) => ({
    group_index: i,
    label: groups[i].label ?? `항목 ${i + 1}`,
    keywords: groups[i].keywords,
  }));
  const missingGroups = groups
    .map((g, i) => ({ group_index: i, label: g.label ?? `항목 ${i + 1}`, keywords: g.keywords }))
    .filter((g) => !matchedIndexes.includes(g.group_index));

  const ratio = computeRatio({ requiredCount: n, matchedCount: matchedGroups.length });
  const creditedCount = Math.min(matchedGroups.length, n);

  return {
    mode: 'group',
    required_count: n,
    matched_count: matchedGroups.length,
    credited_count: creditedCount,
    total_candidates: groups.length,
    matched_groups: matchedGroups,
    missing_groups: missingGroups,
    ratio,
    score: scoreOf(ratio),
    verdict: verdictOf(ratio),
    feedback,
    notes,
    graded_by: gradedBy,
  };
}

function buildFlatResult(question, keywords, matched, feedback, gradedBy) {
  const missing = keywords.filter((k) => !matched.includes(k));
  const ratio = computeRatio({ requiredCount: null, matchedCount: matched.length, totalCount: keywords.length });

  return {
    mode: 'flat',
    required_count: null,
    matched_count: matched.length,
    credited_count: matched.length,
    total_candidates: keywords.length,
    matched_groups: matched.map((k) => ({ label: k, keywords: [k] })),
    missing_groups: missing.map((k) => ({ label: k, keywords: [k] })),
    ratio,
    score: scoreOf(ratio),
    verdict: verdictOf(ratio),
    feedback,
    notes: [],
    graded_by: gradedBy,
  };
}

function emptyResult(question, isFlat, groups) {
  const missing = isFlat
    ? (groups[0]?.keywords ?? []).map((k) => ({ label: k, keywords: [k] }))
    : groups.map((g, i) => ({ group_index: i, label: g.label ?? `항목 ${i + 1}`, keywords: g.keywords }));
  return {
    mode: isFlat ? 'flat' : 'group',
    required_count: question.required_count,
    matched_count: 0,
    credited_count: 0,
    total_candidates: isFlat ? (groups[0]?.keywords.length ?? 0) : groups.length,
    matched_groups: [],
    missing_groups: missing,
    ratio: 0,
    score: 0,
    verdict: 'X',
    feedback: '답안이 비어 있습니다.',
    notes: [],
    graded_by: 'local',
  };
}
