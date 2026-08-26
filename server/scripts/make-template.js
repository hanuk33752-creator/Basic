#!/usr/bin/env node
/** 문제 등록용 엑셀 양식을 파일로 내보낸다. (앱에서는 /api/upload/template.xlsx 로도 받을 수 있다) */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTemplateWorkbook } from '../src/services/workbook.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out =
  process.argv[2] ?? path.join(__dirname, '..', '..', 'data', 'templates', '문제등록_양식.xlsx');

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, await buildTemplateWorkbook());
console.log(`양식 생성 완료: ${out}`);
