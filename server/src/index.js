import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './db.js';
import packs from './routes/packs.js';
import questions from './routes/questions.js';
import upload from './routes/upload.js';
import quiz from './routes/quiz.js';

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

// 빌드된 프론트엔드를 함께 서빙 (npm run build 이후)
const webDist = path.join(__dirname, '..', '..', 'web', 'dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || '서버 오류' });
});

app.listen(PORT, () => console.log(`[server] http://localhost:${PORT}`));
