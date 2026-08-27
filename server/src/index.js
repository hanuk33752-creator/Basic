import './env.js'; // 다른 모듈이 process.env 를 읽기 전에 .env 를 먼저 로드한다.
import { lanAddresses } from './services/network.js';
import express from 'express';
import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './db.js';
import packs from './routes/packs.js';
import questions from './routes/questions.js';
import upload from './routes/upload.js';
import quiz from './routes/quiz.js';
import notes from './routes/notes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.use(express.json({ limit: '10mb' }));

app.get('/api/health', async (req, res) => {
  const { isClaudeAvailable, MODEL } = await import('./services/claude.js');
  res.json({
    ok: true,
    claude_available: isClaudeAvailable(),
    model: MODEL,
    // 같은 네트워크의 다른 기기(휴대폰 등)에서 접속할 주소
    lan_urls: lanAddresses(PORT),
  });
});

/**
 * 앱 종료. 화면의 종료 버튼이 부른다.
 * 커스텀 헤더를 요구해 다른 사이트가 브라우저를 통해 이 주소를 부르는 것을 막는다.
 */
app.post('/api/shutdown', (req, res) => {
  if (req.get('x-app-shutdown') !== '1') {
    return res.status(403).json({ error: '잘못된 종료 요청입니다.' });
  }
  res.json({ ok: true });
  console.log('[server] 종료 요청을 받았습니다.');
  setTimeout(() => {
    server.close(() => process.exit(0));
    // 남은 연결 때문에 close 가 지연되어도 확실히 끝낸다.
    setTimeout(() => process.exit(0), 1500).unref();
  }, 100);
});

app.use('/api/packs', packs);
app.use('/api/questions', questions);
app.use('/api/upload', upload);
app.use('/api', quiz);
app.use('/api', notes);

// 빌드된 프론트엔드를 함께 서빙 (npm run build 이후)
const webDist = path.join(__dirname, '..', '..', 'web', 'dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(webDist, 'index.html')));
} else {
  console.log('[server] 화면이 아직 빌드되지 않았습니다. `npm run build` 를 먼저 실행하세요.');
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || '서버 오류' });
});

const server = app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`[server] ${url}`);
  // 바로가기로 실행할 때 서버가 실제로 뜬 다음 브라우저를 연다.
  if ((process.env.OPEN_BROWSER ?? '').trim() === '1') openBrowser(url);
});

function openBrowser(url) {
  const command =
    process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(command, (err) => {
    if (err) console.log(`[server] 브라우저를 열지 못했습니다. 직접 접속해 주세요: ${url}`);
  });
}
