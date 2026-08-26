import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildTemplateWorkbook, readQuestionWorkbook } from '../src/services/workbook.js';

/** 생성된 양식을 열어 사용자가 채운 것처럼 값을 넣고 다시 읽는다. */
async function fillTemplate(fill) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await buildTemplateWorkbook());
  fill(wb.getWorksheet('문제'));
  return readQuestionWorkbook(Buffer.from(await wb.xlsx.writeBuffer()));
}

test('양식에는 문제 시트와 안내 시트가 있다', async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await buildTemplateWorkbook());
  assert.ok(wb.getWorksheet('문제'));
  assert.ok(wb.getWorksheet('작성 안내'));

  const header = wb.getWorksheet('문제').getRow(1);
  const names = [];
  header.eachCell((c) => names.push(String(c.value)));
  assert.deepEqual(names.slice(0, 5), ['번호', '문제', '모범답안', '요구항목수', '연도회차']);
  assert.deepEqual(names.slice(5), ['항목1', '항목2', '항목3', '항목4', '항목5']);
});

test('예시 행은 등록되지 않는다', async () => {
  const { candidates } = await fillTemplate(() => {});
  assert.equal(candidates.length, 0, '아무것도 안 채우면 등록할 문제가 없다');
});

test('항목 열을 채우면 그대로 채점 기준이 된다', async () => {
  const { candidates } = await fillTemplate((sheet) => {
    const row = sheet.getRow(4);
    row.getCell(2).value = '전기집진장치의 역전리 대책을 3가지 서술하시오.';
    row.getCell(3).value = '조습제 주입, 탈진 주기 단축, 펄스 하전 적용.';
    row.getCell(6).value = '조습제(SO3) 주입으로 전기비저항 저감';
    row.getCell(7).value = '탈진 주기 단축으로 분진층 관리';
    row.getCell(8).value = '펄스 하전 또는 2단식 집진기 적용';
  });

  assert.equal(candidates.length, 1);
  const c = candidates[0];
  assert.equal(c.required_count, 3, '문제 본문의 "3가지"에서 자동 인식');
  assert.equal(c.groups.length, 3);
  assert.equal(c.groups[0].label, '조습제(SO3) 주입으로 전기비저항 저감');
  assert.ok(c.groups[0].keywords.length > 0, '항목마다 키워드가 뽑힌다');
});

test('항목이 없으면 모범답안만 싣고 그룹은 비운다 (나중에 AI가 추출)', async () => {
  const { candidates } = await fillTemplate((sheet) => {
    const row = sheet.getRow(4);
    row.getCell(2).value = 'BOD와 COD의 차이를 설명하시오.';
    row.getCell(3).value = 'BOD는 생물학적 산소요구량이고 COD는 화학적 산소요구량이다.';
  });

  assert.equal(candidates[0].required_count, null, '"n가지"가 없으면 일반 서술형');
  assert.equal(candidates[0].groups.length, 0);
  assert.ok(candidates[0].source_text.includes('BOD'));
});

test('요구항목수를 직접 적으면 그 값이 우선한다', async () => {
  const { candidates } = await fillTemplate((sheet) => {
    const row = sheet.getRow(4);
    row.getCell(2).value = '원인을 3가지 서술하시오.';
    row.getCell(3).value = '가나다 라마바';
    row.getCell(4).value = 5;
  });
  assert.equal(candidates[0].required_count, 5);
  assert.equal(candidates[0].required_count_locked, true);
});

test('모범답안이 비어도 항목이 있으면 그것을 참고자료로 삼는다', async () => {
  const { candidates } = await fillTemplate((sheet) => {
    const row = sheet.getRow(4);
    row.getCell(2).value = '방지대책을 2가지 쓰시오.';
    row.getCell(6).value = '고도처리로 영양염류 제거';
    row.getCell(7).value = '비점오염원 관리';
  });
  assert.equal(candidates[0].groups.length, 2);
  assert.match(candidates[0].source_text, /1\. 고도처리로 영양염류 제거/);
});

test('문제 본문이 비면 건너뛰고 이유를 알려준다', async () => {
  const { candidates, skipped } = await fillTemplate((sheet) => {
    sheet.getRow(4).getCell(3).value = '문제 없이 답만 적힌 행';
    sheet.getRow(5).getCell(2).value = '정상 문제입니다.';
    sheet.getRow(5).getCell(3).value = '정상 답안입니다.';
  });
  assert.equal(candidates.length, 1);
  assert.equal(skipped.length, 1);
  assert.match(skipped[0].reason, /문제 본문/);
});

test('열 제목 표기가 달라도 인식한다', async () => {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('내가만든시트');
  sheet.addRow(['문제번호', '문항', '정답', '항목수', '회차', '정답1', '정답2']);
  sheet.addRow([1, '원인을 2가지 쓰시오.', '가나다. 라마바.', '', '2024년 2회', '첫째 원인', '둘째 원인']);

  const { candidates } = await readQuestionWorkbook(Buffer.from(await wb.xlsx.writeBuffer()));
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].year_round, '2024년 2회');
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
