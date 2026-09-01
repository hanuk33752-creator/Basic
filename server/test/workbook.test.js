import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildTemplateWorkbook, readQuestionWorkbook } from '../src/services/workbook.js';

/**
 * 생성된 양식을 열어 사용자가 채운 것처럼 값을 넣고 다시 읽는다.
 * fill 에는 시트와 '첫 빈 입력행 번호'를 넘겨 예시 행이 늘어도 테스트가 깨지지 않게 한다.
 */
async function fillTemplate(fill) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await buildTemplateWorkbook());
  const sheet = wb.getWorksheet('문제');
  fill(sheet, firstInputRow(sheet));
  return readQuestionWorkbook(Buffer.from(await wb.xlsx.writeBuffer()));
}

/** 예시 행을 지나 사용자가 처음 입력하게 되는 행 번호 */
function firstInputRow(sheet) {
  for (let r = 2; r <= sheet.rowCount; r += 1) {
    if (!String(sheet.getRow(r).getCell(2).value ?? '').trim()) return r;
  }
  throw new Error('빈 입력행을 찾지 못했습니다');
}

test('양식에는 문제 시트와 안내 시트가 있다', async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await buildTemplateWorkbook());
  assert.ok(wb.getWorksheet('문제'));
  assert.ok(wb.getWorksheet('작성 안내'));

  const header = wb.getWorksheet('문제').getRow(1);
  const names = [];
  header.eachCell((c) => names.push(String(c.value)));
  assert.deepEqual(names.slice(0, 4), ['번호', '문제', '모범답안', '요구항목수']);
  assert.deepEqual(names.slice(4), [
    '항목1', '항목2', '항목3', '항목4', '항목5', '항목6', '항목7', '항목8',
  ]);
});

test('예시 행은 등록되지 않는다', async () => {
  const { candidates } = await fillTemplate(() => {});
  assert.equal(candidates.length, 0, '아무것도 안 채우면 등록할 문제가 없다');
});

test('항목 열을 채우면 그대로 채점 기준이 된다', async () => {
  const { candidates } = await fillTemplate((sheet, top) => {
    const row = sheet.getRow(top);
    row.getCell(2).value = '전기집진장치의 역전리 대책을 3가지 서술하시오.';
    row.getCell(3).value = '조습제 주입, 탈진 주기 단축, 펄스 하전 적용.';
    row.getCell(5).value = '조습제(SO3) 주입으로 전기비저항 저감';
    row.getCell(6).value = '탈진 주기 단축으로 분진층 관리';
    row.getCell(7).value = '펄스 하전 또는 2단식 집진기 적용';
  });

  assert.equal(candidates.length, 1);
  const c = candidates[0];
  assert.equal(c.required_count, 3, '문제 본문의 "3가지"에서 자동 인식');
  assert.equal(c.groups.length, 3);
  assert.equal(c.groups[0].label, '조습제(SO3) 주입으로 전기비저항 저감');
  assert.ok(c.groups[0].keywords.length > 0, '항목마다 키워드가 뽑힌다');
});

test('항목이 없으면 모범답안만 싣고 그룹은 비운다 (나중에 AI가 추출)', async () => {
  const { candidates } = await fillTemplate((sheet, top) => {
    const row = sheet.getRow(top);
    row.getCell(2).value = 'BOD와 COD의 차이를 설명하시오.';
    row.getCell(3).value = 'BOD는 생물학적 산소요구량이고 COD는 화학적 산소요구량이다.';
  });

  assert.equal(candidates[0].required_count, null, '"n가지"가 없으면 일반 서술형');
  assert.equal(candidates[0].groups.length, 0);
  assert.ok(candidates[0].source_text.includes('BOD'));
});

test('요구항목수를 직접 적으면 그 값이 우선한다', async () => {
  const { candidates } = await fillTemplate((sheet, top) => {
    const row = sheet.getRow(top);
    row.getCell(2).value = '원인을 3가지 서술하시오.';
    row.getCell(3).value = '가나다 라마바';
    row.getCell(4).value = 5;
  });
  assert.equal(candidates[0].required_count, 5);
  assert.equal(candidates[0].required_count_locked, true);
});

test('모범답안이 비어도 항목이 있으면 그것을 참고자료로 삼는다', async () => {
  const { candidates } = await fillTemplate((sheet, top) => {
    const row = sheet.getRow(top);
    row.getCell(2).value = '방지대책을 2가지 쓰시오.';
    row.getCell(5).value = '고도처리로 영양염류 제거';
    row.getCell(6).value = '비점오염원 관리';
  });
  assert.equal(candidates[0].groups.length, 2);
  assert.match(candidates[0].source_text, /1\. 고도처리로 영양염류 제거/);
});

test('문제 본문이 비면 건너뛰고 이유를 알려준다', async () => {
  const { candidates, skipped } = await fillTemplate((sheet, top) => {
    sheet.getRow(top).getCell(3).value = '문제 없이 답만 적힌 행';
    sheet.getRow(top + 1).getCell(2).value = '정상 문제입니다.';
    sheet.getRow(top + 1).getCell(3).value = '정상 답안입니다.';
  });
  assert.equal(candidates.length, 1);
  assert.equal(skipped.length, 1);
  assert.match(skipped[0].reason, /문제 본문/);
});

test('열 제목 표기가 달라도 인식한다', async () => {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('내가만든시트');
  sheet.addRow(['문제번호', '문항', '정답', '항목수', '정답1', '정답2']);
  sheet.addRow([1, '원인을 2가지 쓰시오.', '가나다. 라마바.', '', '첫째 원인', '둘째 원인']);

  const { candidates } = await readQuestionWorkbook(Buffer.from(await wb.xlsx.writeBuffer()));
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].groups.length, 2);
  assert.equal(candidates[0].required_count, 2);
});

test("'문제' 열이 없으면 친절한 오류를 낸다", async () => {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('아무거나');
  sheet.addRow(['이름', '점수']);
  sheet.addRow(['홍길동', 90]);

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  await assert.rejects(() => readQuestionWorkbook(buffer), /'문제' 열을 찾지 못했습니다/);
});

test('항목 앞의 *는 필수 항목 표시가 된다', async () => {
  const { candidates } = await fillTemplate((sheet, top) => {
    const row = sheet.getRow(top);
    row.getCell(2).value = '부영양화의 정의를 쓰고 방지대책을 3가지 서술하시오.';
    row.getCell(3).value = '부영양화란 조류가 과다 번식하는 현상이다. 고도처리, 무린세제, 준설로 막는다.';
    row.getCell(4).value = 4; // 정의 1 + 대책 3
    row.getCell(5).value = '*정의: 영양염류 유입으로 조류가 과다 번식하는 현상';
    row.getCell(6).value = '고도처리로 질소·인 제거';
    row.getCell(7).value = '무린세제 사용과 비점오염원 관리';
    row.getCell(8).value = '저니토 준설로 내부부하 제거';
    row.getCell(9).value = '살조제 살포 또는 폭기';
  });

  const c = candidates[0];
  assert.equal(c.required_count, 4);
  assert.equal(c.groups.length, 5);
  assert.equal(c.groups[0].is_required, true);
  assert.ok(!c.groups[0].label.startsWith('*'), '별표는 라벨에서 떼어낸다');
  assert.match(c.groups[0].label, /^정의:/);
  assert.deepEqual(c.groups.slice(1).map((g) => g.is_required), [false, false, false, false]);
});

test('연도회차 열은 양식에서 빠졌다', async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await buildTemplateWorkbook());
  const names = [];
  wb.getWorksheet('문제').getRow(1).eachCell((c) => names.push(String(c.value)));
  assert.ok(!names.includes('연도회차'));
  assert.deepEqual(names, [
    '번호', '문제', '모범답안', '요구항목수',
    '항목1', '항목2', '항목3', '항목4', '항목5', '항목6', '항목7', '항목8',
  ]);
});

test('필수 표시만 있고 요구항목수·"n가지"가 없으면 항목 수를 요구 항목으로 본다', async () => {
  const { candidates } = await fillTemplate((sheet, top) => {
    const row = sheet.getRow(top);
    row.getCell(2).value = '전기집진장치의 원리와 장점을 설명하시오.';
    row.getCell(3).value = '하전된 분진을 집진극에 부착시켜 제거한다. 미세입자 제거 효율이 높다.';
    row.getCell(5).value = '*원리: 하전된 분진을 집진극에 부착';
    row.getCell(6).value = '*장점: 미세입자 제거 효율이 높음';
  });
  assert.equal(candidates[0].required_count, 2);
  assert.deepEqual(candidates[0].groups.map((g) => g.is_required), [true, true]);
});

test('항목 8칸을 모두 채운 복합 문제를 읽는다', async () => {
  const { candidates } = await fillTemplate((sheet, top) => {
    const row = sheet.getRow(top);
    row.getCell(2).value =
      '전기집진기에서 비저항이 10^4 이하일 때와 10^11 이상일 때의 발생현상과 방지책을 각각 쓰시오.';
    row.getCell(3).value = '재비산과 역전리가 각각 발생한다.';
    row.getCell(4).value = 8;
    const items = [
      '*저비저항: 재비산 발생',
      'NH3 투입',
      '가스 증습으로 습도 조절',
      '처리가스 속도 낮춤',
      '*고비저항: 역전리 발생',
      'SO3 투입',
      '탈진 주기 단축',
      '전극 청결 유지',
    ];
    items.forEach((text, i) => { row.getCell(5 + i).value = text; });
  });

  assert.equal(candidates.length, 1);
  const c = candidates[0];
  assert.equal(c.required_count, 8);
  assert.equal(c.groups.length, 8, '항목 8개가 모두 읽혀야 한다');
  assert.deepEqual(
    c.groups.filter((g) => g.is_required).map((g) => g.label),
    ['저비저항: 재비산 발생', '고비저항: 역전리 발생']
  );
});

test('엑셀의 번호 열을 문제 번호로 읽는다', async () => {
  const { candidates } = await fillTemplate((sheet, top) => {
    const row = sheet.getRow(top);
    row.getCell(1).value = 17;
    row.getCell(2).value = '번호가 붙은 문제입니다.';
    row.getCell(3).value = '모범답안입니다.';
  });
  assert.equal(candidates[0].source_no, '17');
});

test('번호를 비워도 문제는 정상 등록된다', async () => {
  const { candidates } = await fillTemplate((sheet, top) => {
    const row = sheet.getRow(top + 1); // 번호가 미리 채워지지 않은 행
    row.getCell(1).value = null;
    row.getCell(2).value = '번호 없는 문제입니다.';
    row.getCell(3).value = '모범답안입니다.';
  });
  const target = candidates.find((c) => c.question_text.startsWith('번호 없는'));
  assert.ok(target);
  assert.equal(target.source_no, null);
});
