import mammoth from 'mammoth';

/** 업로드된 파일에서 평문 텍스트를 추출한다. (docx / pdf / txt·md) */
export async function extractText(buffer, filename = '') {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'docx') return normalize((await mammoth.extractRawText({ buffer })).value);
  if (ext === 'doc') {
    throw new Error('구형 .doc 형식은 지원하지 않습니다. .docx로 저장 후 업로드해 주세요.');
  }
  if (ext === 'pdf') return normalize(await extractPdf(buffer));
  if (['txt', 'md', 'text'].includes(ext)) return normalize(buffer.toString('utf8'));
  throw new Error(`지원하지 않는 파일 형식입니다: .${ext} (docx, pdf, txt 지원)`);
}

async function extractPdf(buffer) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;

  const pages = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(joinTextItems(content.items));
  }
  await doc.destroy();
  return pages.join('\n\n');
}

// PDF 텍스트 아이템은 줄바꿈 정보가 없으므로 y 좌표 변화로 줄을 복원한다.
function joinTextItems(items) {
  let out = '';
  let lastY = null;
  for (const item of items) {
    if (!('str' in item)) continue;
    const y = item.transform?.[5];
    if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2) out += '\n';
    out += item.str;
    if (item.hasEOL) out += '\n';
    lastY = y ?? lastY;
  }
  return out;
}

function normalize(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ ​]/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const KOREAN_NUMERALS = {
  한: 1, 하나: 1, 두: 2, 둘: 2, 세: 3, 셋: 3, 네: 4, 넷: 4,
  다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10,
};

/**
 * 문제 텍스트에서 요구 항목 수(N)를 추출한다. 예: "3가지 서술하시오" → 3
 * 매칭이 없으면 null (일반 서술형).
 */
export function detectRequiredCount(questionText = '') {
  const pattern = /(\d+|한|하나|두|둘|세|셋|네|넷|다섯|여섯|일곱|여덟|아홉|열)\s*가지/g;
  const found = [...questionText.matchAll(pattern)].map((m) =>
    /^\d+$/.test(m[1]) ? Number(m[1]) : KOREAN_NUMERALS[m[1]]
  );
  const valid = found.filter((n) => Number.isInteger(n) && n >= 1 && n <= 20);
  if (valid.length === 0) return null;
  // "3가지 중 2가지를 쓰시오" 처럼 여러 번 나오면 실제 요구치인 마지막 값을 쓴다.
  return valid[valid.length - 1];
}
