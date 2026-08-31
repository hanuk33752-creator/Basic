import ExcelJS from 'exceljs';
import { detectRequiredCount } from './parse.js';
import { keywordsFromText } from './extract.js';

/* ────────────────────────────────────────────────────────────
 * 엑셀 양식 정의
 * 행 = 문제 1건, 열 = 문제 관리에 필요한 항목
 * ──────────────────────────────────────────────────────────── */

export const ITEM_COLUMNS = 8; // 항목1 ~ 항목8

const COLUMNS = [
  { key: 'no', header: '번호', width: 7, hint: '문제 번호. 본인 정리용이며 앱은 순서만 사용합니다.' },
  { key: 'question', header: '문제', width: 52, hint: '필수. 문제 발문을 그대로 적습니다. 예) 슬러지 벌킹의 원인을 3가지 서술하시오.' },
  {
    key: 'answer',
    header: '모범답안',
    width: 52,
    hint:
      '필수. 채점 근거가 되는 정답/해설 전문. 비우면 채점 기준을 만들 수 없어 출제에서 제외됩니다.\n' +
      '여러 항목을 적을 때는 셀 안에서 Alt+Enter 로 줄을 바꾸세요. 쉼표·슬래시는 구분자로 쓰지 마세요.',
  },
  { key: 'required', header: '요구항목수', width: 12, hint: '선택. "3가지 서술" 같은 문제의 3. 비우면 문제 본문에서 자동 인식합니다.' },
];

const ITEM_HINT =
  '선택. "n가지" 문제에서 정답으로 인정할 항목을 하나씩 나눠 적습니다.\n' +
  '채우면 이 항목들이 그대로 채점 기준이 되고, 비우면 모범답안에서 AI가 자동 추출합니다.\n' +
  '항목 앞에 *를 붙이면 필수 항목이 되어 반드시 답안에 있어야 합니다. 예) *정의: 조류가 과다 번식하는 현상';

/** 헤더 이름 → 내부 키. 표기 흔들림을 흡수한다. */
const ALIASES = {
  no: ['번호', '문제번호', '연번', 'no', 'no.', '#'],
  question: ['문제', '문제본문', '문항', '발문', 'question'],
  answer: ['모범답안', '정답', '참고자료', '해설', '풀이', '답', 'answer'],
  required: ['요구항목수', '항목수', '요구개수', '가지수', 'n', 'required'],
};

const norm = (v) => String(v ?? '').replace(/\s+/g, '').toLowerCase();

function classifyHeader(raw) {
  const key = norm(raw);
  if (!key) return null;
  for (const [field, names] of Object.entries(ALIASES)) {
    if (names.some((n) => norm(n) === key)) return { field };
  }
  // 항목1, 정답2, 요소3 ...
  const item = key.match(/^(?:항목|정답|요소|item)(\d{1,2})$/);
  if (item) return { field: 'item', index: Number(item[1]) };
  return null;
}

/* ────────────────────────────────────────────────────────────
 * 읽기
 * ──────────────────────────────────────────────────────────── */

/**
 * 업로드된 엑셀에서 문제 후보를 읽는다.
 * 항목 열이 채워져 있으면 그대로 채점 기준(groups)이 되어 AI 호출 없이 등록된다.
 */
export async function readQuestionWorkbook(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const sheet = pickSheet(wb);
  if (!sheet) throw new Error('엑셀에서 시트를 찾지 못했습니다.');

  const header = findHeaderRow(sheet);
  if (!header) {
    throw new Error(
      "'문제' 열을 찾지 못했습니다. 제공된 양식(문제 관리 화면에서 내려받기)을 사용하거나, 첫 행에 '문제'·'모범답안' 열 제목을 넣어주세요."
    );
  }

  const candidates = [];
  const skipped = [];

  for (let r = header.rowNumber + 1; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const questionText = cellText(row, header.map.question);
    const answerText = cellText(row, header.map.answer);
    const noText = cellText(row, header.map.no);

    if (!questionText && !answerText) continue; // 빈 행
    if (!questionText) {
      skipped.push({ row: r, reason: '문제 본문이 비어 있음' });
      continue;
    }
    if (isExampleRow(noText, questionText)) continue;

    const items = header.items
      .map(({ col }) => parseItem(cellText(row, col)))
      .filter((item) => item.label);

    const requiredRaw = cellText(row, header.map.required);
    const explicitRequired =
      requiredRaw && Number.isFinite(Number(requiredRaw)) && Number(requiredRaw) >= 1
        ? Number(requiredRaw)
        : null;
    const hasRequiredItem = items.some((item) => item.is_required);
    // 필수 표시(*)를 썼는데 요구항목수도 "n가지"도 없으면 적어둔 항목 전부를 요구 항목으로 본다.
    const required =
      explicitRequired ?? detectRequiredCount(questionText) ?? (hasRequiredItem ? items.length : null);

    candidates.push({
      question_text: questionText,
      source_text: answerText || itemsAsSource(items),
      required_count: required,
      required_count_locked: !!requiredRaw,
      // 항목 열을 채웠으면 AI 추출을 건너뛰고 이걸 그대로 채점 기준으로 쓴다.
      groups: items.map((item) => ({
        label: item.label,
        keywords: keywordsFromText(item.label, 4),
        is_required: item.is_required,
      })),
    });
  }

  return { candidates, skipped, sheet_name: sheet.name };
}

function pickSheet(wb) {
  // '안내' 시트는 건너뛰고 데이터가 있는 첫 시트를 쓴다.
  const sheets = wb.worksheets.filter((s) => !/안내|guide|readme/i.test(s.name));
  return sheets.find((s) => s.rowCount > 1) ?? sheets[0] ?? wb.worksheets[0];
}

function findHeaderRow(sheet) {
  const limit = Math.min(sheet.rowCount, 10);
  for (let r = 1; r <= limit; r += 1) {
    const row = sheet.getRow(r);
    const map = {};
    const items = [];
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const hit = classifyHeader(cell.value);
      if (!hit) return;
      if (hit.field === 'item') items.push({ index: hit.index, col });
      else if (map[hit.field] === undefined) map[hit.field] = col;
    });
    if (map.question !== undefined) {
      items.sort((a, b) => a.index - b.index);
      return { rowNumber: r, map, items };
    }
  }
  return null;
}

function cellText(row, col) {
  if (!col) return '';
  const value = row.getCell(col).value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    // 수식·리치텍스트·하이퍼링크 셀
    if ('result' in value) return String(value.result ?? '').trim();
    if ('richText' in value) return value.richText.map((t) => t.text).join('').trim();
    if ('text' in value) return String(value.text).trim();
    return '';
  }
  return String(value).trim();
}

/** 양식에 넣어둔 예시 행은 등록 대상에서 뺀다. */
function isExampleRow(noText, questionText) {
  return /^예시/.test(noText) || /^\(예시\)/.test(questionText);
}

/** 항목 셀을 읽는다. 앞의 *(또는 ＊)는 '필수 항목' 표시이며 라벨에서 떼어낸다. */
function parseItem(raw) {
  const text = (raw ?? '').trim();
  const marked = /^[*＊]\s*/.test(text);
  return { label: text.replace(/^[*＊]\s*/, '').trim(), is_required: marked };
}

function itemsAsSource(items) {
  return items.length ? items.map((item, i) => `${i + 1}. ${item.label}`).join('\n') : '';
}

/* ────────────────────────────────────────────────────────────
 * 양식 생성
 * ──────────────────────────────────────────────────────────── */

const EXAMPLES = [
  {
    no: '예시1',
    question: '활성슬러지법 운전 중 발생하는 슬러지 벌킹(Bulking)의 원인을 3가지 서술하시오.',
    answer:
      '사상성 미생물의 과다 증식이 대표적인 원인이다.\n폭기조 내 용존산소(DO)가 부족하면 사상균이 우점한다.\n유입수의 F/M비가 지나치게 낮거나 높을 때 침강성이 나빠진다.\n질소·인 등 영양염류의 불균형도 벌킹을 유발한다.',
    required: 3,
    items: [
      '사상성 미생물의 과다 증식',
      '폭기조 용존산소(DO) 부족',
      '유입수 F/M비 불균형',
      '질소·인 영양염류 불균형',
      '',
    ],
  },
  {
    no: '예시2',
    question: '응집침전 공정에서 자테스트(Jar test)의 목적을 설명하시오.',
    answer:
      '최적 응집제 주입량과 최적 pH를 실험적으로 결정하기 위한 시험이다. 교반 강도와 시간을 달리하며 플록 형성 상태와 상등수 탁도를 관찰해 응집 조건을 도출한다.',
    required: '',
    items: [],
  },
  {
    no: '예시3',
    question: '부영양화의 정의를 쓰고 방지대책을 3가지 서술하시오.',
    answer:
      '부영양화란 질소·인 등 영양염류가 유입되어 조류가 과다 번식하고 수질이 악화되는 현상이다.\n' +
      '고도처리로 질소·인을 제거한다.\n무린세제 사용을 확대하고 비점오염원을 관리한다.\n' +
      '호소 바닥의 저니토를 준설해 내부부하를 제거한다.\n황산동 등 살조제를 살포하거나 폭기해 성층을 파괴한다.',
    required: 4,
    items: [
      '*정의: 영양염류 유입으로 조류가 과다 번식해 수질이 악화되는 현상',
      '고도처리로 질소·인 제거',
      '무린세제 사용과 비점오염원 관리',
      '저니토 준설로 내부부하 제거',
      '살조제 살포 또는 폭기로 성층 파괴',
    ],
  },
  {
    no: '예시4',
    question:
      '전기집진기 운전 시 분진의 비저항이 10^4 Ω·cm 이하일 때와 10^11 Ω·cm 이상일 때의 ' +
      '발생현상과 방지책을 각각 쓰시오.',
    answer:
      '비저항이 낮으면 집진극에서 전하를 잃은 분진이 다시 날리는 재비산이 일어난다.\n' +
      'NH3를 투입하고, 습도를 조절하며, 처리가스 속도를 낮춘다.\n' +
      '비저항이 높으면 분진층에서 역방향 방전이 일어나는 역전리가 발생한다.\n' +
      'SO3를 투입하고, 습도를 조절하며, 전극을 청결하게 유지한다.',
    required: 8,
    items: [
      '*저비저항: 재비산 발생',
      'NH3(암모니아) 투입',
      '가스 증습으로 습도 조절',
      '처리가스 속도 낮춤',
      '*고비저항: 역전리 발생',
      'SO3 투입',
      '탈진 주기 단축',
      '전극 청결 유지',
    ],
  },
];

/** 문제 등록용 엑셀 양식을 만들어 버퍼로 돌려준다. */
export async function buildTemplateWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = '실기 서술형 연습';
  wb.created = new Date();

  const sheet = wb.addWorksheet('문제', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }],
  });

  const columns = [
    ...COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width })),
    ...Array.from({ length: ITEM_COLUMNS }, (_, i) => ({
      header: `항목${i + 1}`,
      key: `item${i + 1}`,
      width: 30,
    })),
  ];
  sheet.columns = columns;

  const headerRow = sheet.getRow(1);
  headerRow.height = 26;
  headerRow.eachCell((cell, col) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: col >= 2 && col <= 3 ? 'FF2563EB' : 'FF64748B' }, // 필수 열은 진한 파랑
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
    const hint = COLUMNS[col - 1]?.hint ?? ITEM_HINT;
    cell.note = hint;
  });

  for (const ex of EXAMPLES) {
    // 예시가 채우지 않은 항목 칸은 빈칸으로 남긴다.
    const items = Array.from({ length: ITEM_COLUMNS }, (_, i) => [`item${i + 1}`, ex.items[i] ?? '']);
    const row = sheet.addRow({
      no: ex.no,
      question: ex.question,
      answer: ex.answer,
      required: ex.required,
      ...Object.fromEntries(items),
    });
    row.height = 92;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.font = { color: { argb: 'FF94A3B8' }, italic: true };
    });
  }

  // 빈 입력 행 (번호만 미리 채워둔다)
  for (let i = 1; i <= 300; i += 1) {
    const row = sheet.addRow({ no: i });
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = { vertical: 'top', wrapText: true };
    });
  }

  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  addGuideSheet(wb);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

function addGuideSheet(wb) {
  const guide = wb.addWorksheet('작성 안내');
  guide.columns = [
    { header: '열 제목', key: 'name', width: 16 },
    { header: '필수', key: 'req', width: 8 },
    { header: '설명', key: 'desc', width: 96 },
  ];
  guide.getRow(1).font = { bold: true };
  guide.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

  const rows = [
    ['번호', '', COLUMNS[0].hint],
    ['문제', '필수', COLUMNS[1].hint],
    ['모범답안', '필수', COLUMNS[2].hint],
    ['요구항목수', '', COLUMNS[3].hint],
    [`항목1~${ITEM_COLUMNS}`, '', ITEM_HINT],
  ];
  rows.forEach((r) => {
    const row = guide.addRow({ name: r[0], req: r[1], desc: r[2] });
    row.alignment = { vertical: 'top', wrapText: true };
    if (r[1]) row.getCell('req').font = { bold: true, color: { argb: 'FFDC2626' } };
  });

  guide.addRow({});
  const notes = [
    '■ 채점 방식',
    '  · 모든 문제는 5점 만점이며 맞춘 비율만큼 부분점수가 매겨집니다 (0.5점 단위).',
    '  · "n가지" 문제: 맞춘 항목 수 ÷ n × 5점. n개를 넘겨 써도 가점·감점 없습니다.',
    '  · 일반 서술형: 매칭된 키워드 수 ÷ 전체 키워드 수 × 5점.',
    '  · 매칭은 단순 단어 일치가 아니라 의미로 판정합니다. 같은 뜻을 다르게 써도 인정됩니다.',
    '',
    '■ 항목 열을 채우면 좋은 이유',
    '  · 채운 항목이 그대로 채점 기준이 되어 AI 추출을 거치지 않습니다. 등록이 즉시 끝나고 API 비용도 들지 않습니다.',
    '  · 정답 후보가 요구항목수보다 많아도 됩니다. 예) 3가지 문제에 항목 5개 → 그중 3개만 맞히면 만점.',
    '  · 비워두면 모범답안을 읽고 AI가 항목을 나눠줍니다.',
    '',
    '■ 필수 항목 (*) — "정의를 쓰고 대책 3가지" 같은 복합 문제용',
    '  · 항목 앞에 *를 붙이면 반드시 답안에 있어야 하는 필수 항목이 됩니다. 예) *정의: 조류가 과다 번식하는 현상',
    '  · 필수 항목은 맞힌 만큼 그대로 인정되고, 나머지 항목은 (요구항목수 - 필수 개수)개까지만 인정됩니다.',
    '  · 예) 요구항목수 4, *정의 1개 + 대책 후보 5개 → 정의는 반드시, 대책은 후보 중 3개면 만점.',
    '        정의를 빼먹고 대책만 5개 써도 3/4 = 4점(부분정답)에 그칩니다.',
    '  · 복합 문제는 요구항목수를 직접 적어주세요. 비우면 문제 본문의 "3가지"가 잡혀 정의 몫이 빠집니다.',
    '  · 필수 항목이 요구항목수보다 많으면 요구항목수를 필수 개수로 올려서 채점합니다.',
    '',
    '■ 모범답안에 여러 항목을 적을 때',
    '  · 가장 정확한 방법은 항목 열에 하나씩 나눠 적는 것입니다. "5가지" 문제면 항목 5칸을 쓰면 됩니다.',
    '  · 항목 열은 ' + ITEM_COLUMNS + '개까지 있습니다. 정의와 대책이 섞인 복합 문제도 한 행에 담을 수 있습니다.',
    '  · 모범답안 칸에 몰아서 적는다면 셀 안에서 Alt+Enter 로 줄을 바꿔 항목을 나누세요.',
    '  · 줄바꿈 외에 "1. 2. 3.", "①②③", "- " 불릿, 문장 종결(…다.)도 항목 경계로 인식합니다.',
    '  · 쉼표(,)와 슬래시(/)는 구분자로 쓰지 마세요. "질소, 인 등 영양염류"나 "F/M비"처럼',
    '    항목 내용 안에 자주 들어가는 문자라 멀쩡한 항목이 잘못 잘립니다.',
    '',
    '■ 주의',
    '  · 모범답안이 비어 있고 항목도 없으면 채점 기준을 만들 수 없어 랜덤 출제에서 제외됩니다.',
    '  · 요구항목수를 비우면 문제 본문의 "3가지"에서 자동 인식하고, 그것도 없으면 일반 서술형으로 처리합니다.',
    '  · 회색 기울임꼴로 적힌 예시 행(예시1, 예시2)은 등록되지 않습니다. 지우지 않아도 됩니다.',
    '  · 한 번에 최대 500문제까지 등록할 수 있습니다.',
  ];
  notes.forEach((text) => {
    const row = guide.addRow({ name: text });
    guide.mergeCells(`A${row.number}:C${row.number}`);
    row.getCell('name').alignment = { vertical: 'top', wrapText: true };
    if (text.startsWith('■')) row.getCell('name').font = { bold: true };
  });

  return guide;
}
