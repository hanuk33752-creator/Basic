#!/usr/bin/env node
/**
 * 실사용 실행 진입점.
 *   1. 부품·화면 빌드가 최신인지 확인하고 필요하면 준비한다
 *   2. 서버를 띄운다 (이미 떠 있으면 그대로 쓴다)
 *   3. 주소창 없는 앱 창으로 화면을 연다
 *
 * 터미널에서 `npm start`, 또는 앱실행.vbs 더블클릭으로 실행된다.
 */
import '../src/env.js';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromiumCandidates } from '../src/services/browser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');
const PORT = Number(process.env.PORT) || 4000;
const URL_ = `http://localhost:${PORT}`;

/* ── 이미 떠 있으면 창만 연다 ─────────────────────────────── */

if (await isServerUp()) {
  console.log(`이미 실행 중입니다. 창을 엽니다. (${URL_})`);
  openAppWindow(URL_);
  process.exit(0);
}

/* ── 준비 ────────────────────────────────────────────────── */

if (needsSetup()) {
  console.log('필요한 부품을 설치합니다. 몇 분 걸립니다...\n');
  runOrExit('npm', ['run', 'setup'], '부품 설치에 실패했습니다.');
  fs.writeFileSync(path.join(root, 'node_modules', '.setup-stamp'), new Date().toISOString());
  console.log('');
}

if (needsBuild()) {
  console.log('화면을 준비합니다...\n');
  runOrExit('npm', ['run', 'build'], '화면 빌드에 실패했습니다.');
  console.log('');
}

/* ── 서버 시작 → 창 열기 ─────────────────────────────────── */

process.env.OPEN_BROWSER = '0'; // 창은 아래에서 직접 연다
await import('../src/index.js');

for (let i = 0; i < 60; i += 1) {
  if (await isServerUp()) {
    openAppWindow(URL_);
    break;
  }
  await new Promise((r) => setTimeout(r, 500));
}

/* ── 도우미 ──────────────────────────────────────────────── */

async function isServerUp() {
  try {
    const res = await fetch(`${URL_}/api/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

function runOrExit(command, args, message) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.error(`\n${message} 위 메시지를 확인해 주세요.`);
    process.exit(1);
  }
}

/** package.json 이 마지막 설치보다 새로우면 다시 설치해야 한다. */
function needsSetup() {
  const stamp = path.join(root, 'node_modules', '.setup-stamp');
  const required = [
    path.join(root, 'node_modules'),
    path.join(root, 'server', 'node_modules'),
    path.join(root, 'web', 'node_modules'),
    stamp,
  ];
  if (required.some((p) => !fs.existsSync(p))) return true;

  const stampTime = fs.statSync(stamp).mtimeMs;
  return ['package.json', 'server/package.json', 'web/package.json'].some(
    (p) => fs.statSync(path.join(root, p)).mtimeMs > stampTime
  );
}

/** 화면 소스가 빌드 결과보다 새로우면 다시 빌드해야 한다. */
function needsBuild() {
  const built = path.join(root, 'web', 'dist', 'index.html');
  if (!fs.existsSync(built)) return true;
  const builtTime = fs.statSync(built).mtimeMs;
  const sources = ['web/src', 'web/index.html', 'web/vite.config.js'].map((p) => path.join(root, p));
  return newestMtime(sources) > builtTime;
}

function newestMtime(targets) {
  let newest = 0;
  for (const target of targets) {
    if (!fs.existsSync(target)) continue;
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(target)) {
        newest = Math.max(newest, newestMtime([path.join(target, entry)]));
      }
    } else {
      newest = Math.max(newest, stat.mtimeMs);
    }
  }
  return newest;
}

/**
 * 주소창·탭 없는 독립 창으로 연다 (Edge/Chrome 의 --app 모드).
 * 못 찾으면 기본 브라우저로 연다.
 */
function openAppWindow(url) {
  const exe = findChromiumBrowser();
  if (exe) {
    try {
      spawn(exe, [`--app=${url}`], { detached: true, stdio: 'ignore' }).unref();
      return;
    } catch {
      /* 아래 기본 브라우저로 넘어간다 */
    }
  }
  openInDefaultBrowser(url);
}

function findChromiumBrowser() {
  if (process.platform !== 'win32') return null;
  return chromiumCandidates(process.env).find((p) => fs.existsSync(p)) ?? null;
}

function openInDefaultBrowser(url) {
  const command =
    process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  spawnSync(command, { shell: true, stdio: 'ignore' });
  console.log(`창을 열지 못했다면 직접 접속하세요: ${url}`);
}
