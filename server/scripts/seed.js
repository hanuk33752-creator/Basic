#!/usr/bin/env node
/**
 * 샘플 문서를 자격증 팩으로 적재한다.
 *   node server/scripts/seed.js <문서경로> [팩이름]
 * 팩 이름을 생략하면 파일명에서 유추한다.
 */
import '../src/env.js';
import fs from 'node:fs';
import path from 'node:path';
import * as repo from '../src/repo.js';
import { extractText } from '../src/services/parse.js';
import { proposeQuestions, buildKeywords } from '../src/services/extract.js';
import { isClaudeAvailable } from '../src/services/claude.js';

const [, , filePath, packNameArg] = process.argv;

if (!filePath) {
  console.error('사용법: node server/scripts/seed.js <문서경로> [팩이름]');
  process.exit(1);
}
if (!fs.existsSync(filePath)) {
  console.error(`파일을 찾을 수 없습니다: ${filePath}`);
  process.exit(1);
}

const packName = packNameArg || path.basename(filePath).replace(/\.[^.]+$/, '');

console.log(`문서: ${filePath}`);
console.log(`채점/추출 엔진: ${isClaudeAvailable() ? 'Claude API' : '로컬 폴백 (ANTHROPIC_API_KEY 미설정)'}`);

const text = await extractText(fs.readFileSync(filePath), filePath);
const { candidates } = await proposeQuestions(text);
console.log(`문제 후보 ${candidates.length}개 추출`);

const existing = repo.listPacks().find((p) => p.name === packName);
const pack = existing ?? repo.createPack(packName, { activate: true });
if (existing) console.log(`기존 팩 '${packName}'에 추가합니다.`);

let saved = 0;
for (const c of candidates) {
  const kw = await buildKeywords(c);
  repo.saveQuestion({
    packId: pack.pack_id,
    questionText: c.question_text,
    yearRound: c.year_round,
    requiredCount: kw.required_count ?? c.required_count ?? null,
    sourceText: c.source_text || null,
    groups: kw.groups,
  });
  saved += 1;
  process.stdout.write(`\r  저장 ${saved}/${candidates.length}`);
}

repo.activatePack(pack.pack_id);
console.log(`\n완료: '${packName}' 팩에 ${saved}개 문제 저장 (활성 팩으로 전환)`);
