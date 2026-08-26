import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 프로젝트 루트의 .env 를 읽어 process.env 에 채운다.
 *
 * 다른 모듈이 process.env 를 읽기 전에 실행되어야 하므로, index.js 와 스크립트에서
 * 가장 먼저 import 한다. 이미 셸에 설정된 값은 덮어쓰지 않는다.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = process.env.ENV_FILE || path.join(__dirname, '..', '..', '.env');

if (fs.existsSync(envPath)) {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(envPath);
  } else {
    console.warn('[env] 이 Node 버전은 .env 자동 로드를 지원하지 않습니다. Node 22 이상을 사용하세요.');
  }
}

export { envPath };
