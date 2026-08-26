#!/usr/bin/env node
/**
 * 실사용 실행: 화면이 준비돼 있지 않으면 빌드하고, 서버를 띄운 뒤 브라우저를 연다.
 *   npm start
 */
import '../src/env.js';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');
const indexHtml = path.join(root, 'web', 'dist', 'index.html');

if (!fs.existsSync(indexHtml)) {
  console.log('화면이 아직 준비되지 않았습니다. 빌드를 시작합니다. (처음 한 번만, 1분 내외)\n');
  const built = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: true });
  if (built.status !== 0) {
    console.error('\n빌드에 실패했습니다. 위 메시지를 확인해 주세요.');
    process.exit(1);
  }
  console.log('');
}

process.env.OPEN_BROWSER ??= '1';
await import('../src/index.js');
