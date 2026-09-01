#!/usr/bin/env node
/**
 * 최신 버전으로 갱신한다.
 *   1. 실행 중인 앱을 끈다
 *   2. 최신 코드를 내려받아 압축을 푼다
 *   3. 앱 폴더에 덮어쓴다 (문제은행·.env·설치된 부품은 건드리지 않는다)
 *
 * 터미널에서 `npm run update`, 또는 업데이트.vbs 로 실행된다.
 */
import '../src/env.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');
const PORT = Number(process.env.PORT) || 4000;

const ZIP_URL =
  process.env.UPDATE_ZIP_URL ||
  'https://github.com/hanuk33752-creator/Basic/archive/refs/heads/claude/app-development-spec-f9rs2d.zip';

console.log('실기 서술형 연습 - 업데이트');
console.log('─'.repeat(44));

await stopRunningApp();
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quizapp-update-'));

try {
  const zipPath = path.join(workDir, 'app.zip');
  console.log('\n[1/3] 최신 버전을 내려받는 중...');
  await download(ZIP_URL, zipPath);
  console.log(`      ${(fs.statSync(zipPath).size / 1024).toFixed(0)} KB 받았습니다.`);

  console.log('[2/3] 압축을 푸는 중...');
  const extractDir = path.join(workDir, 'extracted');
  fs.mkdirSync(extractDir);
  extract(zipPath, extractDir);

  const source = findExtractedRoot(extractDir);
  verifyPayload(source);

  console.log('[3/3] 앱 폴더에 덮어쓰는 중...');
  fs.cpSync(source, root, { recursive: true, force: true });

  console.log('\n업데이트를 마쳤습니다.');
  console.log('문제은행(server/data/app.db)과 .env 는 그대로 유지됩니다.');

  const missingLaunchers = ['앱실행.vbs', '앱종료.vbs'].filter(
    (name) => !fs.existsSync(path.join(root, name))
  );
  if (missingLaunchers.length > 0) {
    console.log(`\n참고: ${missingLaunchers.join(', ')} 를 찾지 못했습니다.`);
    console.log('터미널에서 npm start 로 실행할 수 있습니다.');
  } else {
    console.log('\n앱실행 아이콘으로 다시 시작하세요.');
  }
} catch (err) {
  console.error(`\n업데이트에 실패했습니다: ${err.message}`);
  console.error('앱은 그대로 남아 있으니 계속 쓰셔도 됩니다.');
  console.error('인터넷 연결을 확인한 뒤 다시 시도해 주세요.');
  process.exitCode = 1;
} finally {
  fs.rmSync(workDir, { recursive: true, force: true });
}

/* ── 도우미 ──────────────────────────────────────────────── */

/** 실행 중인 앱이 있으면 끈다. 파일이 잠겨 있으면 덮어쓸 수 없다. */
async function stopRunningApp() {
  try {
    const res = await fetch(`http://localhost:${PORT}/api/shutdown`, {
      method: 'POST',
      headers: { 'x-app-shutdown': '1' },
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      console.log('실행 중인 앱을 종료했습니다.');
      await new Promise((r) => setTimeout(r, 1500));
    }
  } catch {
    // 실행 중이 아니면 그대로 진행한다.
  }
}

async function download(url, destination) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`내려받기 실패 (HTTP ${res.status}) — 인터넷 연결을 확인해 주세요.`);
  fs.writeFileSync(destination, Buffer.from(await res.arrayBuffer()));
}

/** 윈도우는 기본 탑재된 tar, 그 외에는 unzip 을 쓴다. */
function extract(zipPath, destination) {
  const attempts =
    process.platform === 'win32'
      ? [
          ['tar', ['-xf', zipPath, '-C', destination]],
          [
            'powershell',
            ['-NoProfile', '-Command', `Expand-Archive -Path '${zipPath}' -DestinationPath '${destination}' -Force`],
          ],
        ]
      : [['unzip', ['-q', '-o', zipPath, '-d', destination]]];

  for (const [command, args] of attempts) {
    const result = spawnSync(command, args, { stdio: 'ignore' });
    if (result.status === 0) return;
  }
  throw new Error('압축을 풀지 못했습니다.');
}

/** 내려받은 내용이 이 앱이 맞는지 확인한다. 잘못 덮어써서 앱을 망가뜨리지 않도록. */
function verifyPayload(source) {
  const required = ['package.json', path.join('server', 'src', 'index.js'), path.join('web', 'src', 'main.jsx')];
  const missing = required.filter((rel) => !fs.existsSync(path.join(source, rel)));
  if (missing.length > 0) {
    throw new Error(`내려받은 내용이 올바르지 않습니다 (${missing.join(', ')} 없음). 덮어쓰지 않았습니다.`);
  }
}

/** 압축 안에는 폴더가 하나 들어 있다. 그 안이 실제 앱 내용이다. */
function findExtractedRoot(extractDir) {
  const entries = fs
    .readdirSync(extractDir, { withFileTypes: true })
    .filter((e) => e.isDirectory());
  if (entries.length === 1) return path.join(extractDir, entries[0].name);
  if (fs.existsSync(path.join(extractDir, 'package.json'))) return extractDir;
  throw new Error('내려받은 압축의 내용을 알아볼 수 없습니다.');
}
