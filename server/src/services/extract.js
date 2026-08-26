import { askJson, isClaudeAvailable } from './claude.js';
import { detectRequiredCount } from './parse.js';

/* ────────────────────────────────────────────────────────────
 * 1차: 문서 → 문제 후보 + 참고자료 분리 (스펙 4장 2단계)
 * ──────────────────────────────────────────────────────────── */

const CANDIDATE_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question_text: { type: 'string', description: '문제 본문 전체. 발문을 그대로 옮긴다.' },
          year_round: { type: 'string', description: '연도/회차 (예: 2023년 1회). 없으면 빈 문자열.' },
          source_text: {
            type: 'string',
            description: '이 문제의 정답·해설에 해당하는 참고자료 원문 발췌. 없으면 빈 문자열.',
          },
        },
        required: ['question_text', 'year_round', 'source_text'],
      },
    },
  },
  required: ['questions'],
};

const CANDIDATE_SYSTEM = `너는 자격증 실기(서술형) 기출 문서를 정리하는 도우미다.
주어진 문서 텍스트에서 서술형 문제와 그에 대응하는 정답/해설(참고자료)을 짝지어 추출한다.

규칙:
- 문제 본문은 원문 그대로 옮긴다. 요약하거나 바꿔 쓰지 않는다.
- 문제 번호("1.", "문제 3" 등)와 배점 표기는 본문에서 제외한다.
- 정답/해설 부분은 source_text에 원문 그대로 넣는다. 새로 지어내지 않는다.
- 계산 문제, 단답형, 목차·표지 같은 비문제 텍스트는 제외하고 서술형만 추출한다.
- 문서에 없는 내용을 만들어내지 않는다.`;

/** 문서 텍스트에서 문제 후보를 뽑는다. Claude 키가 없으면 로컬 휴리스틱을 쓴다. */
export async function proposeQuestions(text) {
  if (!isClaudeAvailable()) {
    return { source: 'local', candidates: localSplit(text) };
  }
  const chunks = chunkText(text, 14000);
  const candidates = [];
  for (const chunk of chunks) {
    const result = await askJson({
      system: CANDIDATE_SYSTEM,
      prompt: `다음 문서에서 서술형 문제와 참고자료를 추출해라.\n\n<document>\n${chunk}\n</document>`,
      schema: CANDIDATE_SCHEMA,
      toolName: 'extract_questions',
    });
    for (const q of result.questions ?? []) {
      if (q.question_text?.trim()) {
        candidates.push({
          question_text: q.question_text.trim(),
          year_round: q.year_round?.trim() || null,
          source_text: q.source_text?.trim() || '',
          required_count: detectRequiredCount(q.question_text),
        });
      }
    }
  }
  return { source: 'claude', candidates };
}

/* ────────────────────────────────────────────────────────────
 * 2차: 확정 시점의 키워드 그룹 / flat 키워드 추출 (스펙 4장 4단계)
 * ──────────────────────────────────────────────────────────── */

const KEYWORD_SCHEMA = {
  type: 'object',
  properties: {
    required_count: {
      type: ['integer', 'null'],
      description: '"n가지 서술" 패턴에서 요구하는 항목 수. 해당 패턴이 없으면 null.',
    },
    groups: {
      type: 'array',
      description:
        'required_count가 있으면 정답으로 인정 가능한 항목별 그룹. null이면 항목 하나에 flat 키워드를 모두 담은 그룹 1개.',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', description: '항목을 한 줄로 요약한 이름' },
          keywords: {
            type: 'array',
            items: { type: 'string' },
            description: '이 항목을 식별하는 핵심 키워드 2~6개',
          },
        },
        required: ['label', 'keywords'],
      },
    },
  },
  required: ['required_count', 'groups'],
};

const KEYWORD_SYSTEM = `너는 서술형 답안 채점용 키워드를 설계한다.
문제와 참고자료를 보고 채점 기준을 만든다.

규칙:
- 문제가 "n가지를 서술하시오" 형태면 required_count = n 이고, 참고자료에서 정답으로 인정 가능한
  개별 항목을 각각 하나의 그룹으로 만든다. 그룹 수는 n개 이상이어도 된다(정답 후보가 더 많을 수 있음).
- "n가지" 패턴이 없으면 required_count = null 이고, groups에는 그룹 1개만 넣되
  그 안에 채점에 필요한 핵심 키워드를 모두 나열한다.
- 키워드는 참고자료에 실제로 등장하는 용어를 기준으로 뽑는다. 동의어까지 나열할 필요는 없다
  (채점은 의미 기반으로 이뤄진다).
- 조사·서술어가 아닌 핵심 명사구를 쓴다.`;

/** 문제 1건에 대한 키워드 그룹을 만든다. */
export async function buildKeywords({ question_text, source_text, required_count }) {
  const n = required_count ?? detectRequiredCount(question_text);
  if (!isClaudeAvailable()) {
    return { source: 'local', required_count: n, groups: localKeywords(source_text, question_text, n) };
  }
  const result = await askJson({
    system: KEYWORD_SYSTEM,
    prompt:
      `<question>\n${question_text}\n</question>\n\n` +
      `<reference>\n${source_text || '(참고자료 없음 — 문제 본문에서 추론)'}\n</reference>\n\n` +
      `참고: 문제 본문에서 정규식으로 추출한 요구 항목 수는 ${n ?? '없음'} 이다. 판단이 다르면 네 판단을 우선한다.`,
    schema: KEYWORD_SCHEMA,
    toolName: 'build_keywords',
    maxTokens: 4000,
  });

  const groups = (result.groups ?? [])
    .map((g) => ({ label: g.label?.trim() || null, keywords: (g.keywords ?? []).map((k) => k.trim()).filter(Boolean) }))
    .filter((g) => g.keywords.length > 0);

  return {
    source: 'claude',
    required_count: result.required_count ?? null,
    groups: groups.length > 0 ? groups : localKeywords(source_text, question_text, n),
  };
}

/* ────────────────────────────────────────────────────────────
 * 로컬 폴백 (API 키 없이도 파이프라인이 동작하도록)
 * ──────────────────────────────────────────────────────────── */

const QUESTION_ENDINGS = /(하시오|하라|쓰시오|서술하시오|설명하시오|구하시오|기술하시오|답하시오)\s*[.?]?\s*$/;
const NUMBERING = /^\s*(?:\[?\d{1,2}[\].)]|문제\s*\d{1,2}[.)]?|Q\s*\d{1,2}[.)]?)\s*/;

/** 번호 매김을 기준으로 문서를 문제 단위로 쪼개는 휴리스틱. */
export function localSplit(text) {
  const lines = text.split('\n');
  const blocks = [];
  let current = null;

  for (const line of lines) {
    if (NUMBERING.test(line) && line.replace(NUMBERING, '').trim().length > 4) {
      if (current) blocks.push(current);
      current = [line.replace(NUMBERING, '').trim()];
    } else if (current) {
      current.push(line);
    }
  }
  if (current) blocks.push(current);
  if (blocks.length === 0) blocks.push(lines);

  return blocks
    .map((block) => {
      const joined = block.join('\n').trim();
      const { question, reference } = splitQuestionAndReference(joined);
      return {
        question_text: question,
        year_round: null,
        source_text: reference,
        required_count: detectRequiredCount(question),
      };
    })
    .filter((c) => c.question_text.length > 4);
}

function splitQuestionAndReference(block) {
  const lines = block.split('\n');
  const qLines = [];
  let i = 0;
  for (; i < lines.length; i += 1) {
    qLines.push(lines[i]);
    if (QUESTION_ENDINGS.test(lines[i].trim())) { i += 1; break; }
  }
  const rest = lines.slice(i).join('\n').trim();
  return {
    question: qLines.join('\n').trim(),
    // "답)", "정답:", "해설-" 같은 머리표를 떼어낸다.
    reference: rest.replace(/^\s*(?:답안?|정답|해설|풀이)\s*[):\-.]?\s*/, '').trim(),
  };
}

const STOPWORDS = new Set([
  '위해', '경우', '때문', '그리고', '또는', '이나', '등의', '것을', '것이', '통해', '대한',
  '따라', '가지', '다음', '해당', '이때', '지나치게', '대표적', '또한', '가장', '매우', '함께',
]);
const JOSA = /(?:으로서|으로써|에서의|에게|에서|으로|이라|과의|와의|은|는|이|가|을|를|의|에|와|과|도|만|로)$/;

/** 참고자료에서 키워드를 뽑는 단순 폴백. 항목 구분은 줄/불릿 기준. */
export function localKeywords(sourceText = '', questionText = '', n = null) {
  const base = (sourceText || questionText || '').trim();
  if (!base) return [];

  if (n) {
    // 줄바꿈·불릿으로 먼저 나누고, 그래도 항목 수가 모자라면 문장 단위로 더 쪼갠다.
    let items = splitItems(base);
    if (items.length < n) items = items.flatMap(splitSentences);
    const chosen = items.length >= 1 ? items : [base];
    return chosen.map((item) => ({
      label: item.length > 40 ? `${item.slice(0, 40)}…` : item,
      keywords: topTokens(item, 4),
    }));
  }
  return [{ label: null, keywords: topTokens(base, 10) }];
}

function splitItems(text) {
  return text
    .split(/\n+|(?:^|\s)[①②③④⑤⑥⑦⑧⑨⑩]|(?:^|\s)[-•*]\s|(?:^|\s)\d+[.)]\s/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);
}

function splitSentences(text) {
  return text
    .split(/(?<=다)\.\s+|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);
}

function topTokens(text, limit) {
  const counts = new Map();
  for (const raw of text.split(/[^가-힣A-Za-z0-9/]+/)) {
    const token = normalizeToken(raw);
    if (!token) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, limit)
    .map(([token]) => token);
}

/** 조사를 떼고 용언(…다)은 버려 명사구만 남긴다. */
function normalizeToken(raw) {
  let token = raw.trim();
  if (!token) return null;
  if (/^[가-힣]+다$/.test(token)) return null; // 있다, 나빠진다 …
  if (/^[가-힣]{3,}$/.test(token)) token = token.replace(JOSA, '');
  if (token.length < 2 || STOPWORDS.has(token)) return null;
  return token;
}

/** 긴 문서를 문단 경계에서 잘라 AI 호출 단위로 나눈다. */
function chunkText(text, size) {
  if (text.length <= size) return [text];
  const paragraphs = text.split(/\n\n+/);
  const chunks = [];
  let buf = '';
  for (const p of paragraphs) {
    if (buf.length + p.length + 2 > size && buf) {
      chunks.push(buf);
      buf = '';
    }
    buf += (buf ? '\n\n' : '') + p;
  }
  if (buf) chunks.push(buf);
  return chunks;
}
