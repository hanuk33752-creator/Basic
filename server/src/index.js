import './env.js'; // 다른 모듈이 process.env 를 읽기 전에 .env 를 먼저 로드한다.
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
  res.json({ ok: true, claude_available: isClaudeAvailable(), model: MODEL });
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

app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`[server] ${url}`);
  // 바로가기로 실행할 때 서버가 실제로 뜬 다음 브라우저를 연다.
  if (process.env.OPEN_BROWSER === '1') openBrowser(url);
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
