// server.js — status/readyz/favicon/게이트 확정 제공
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');

const PORT = Number(process.env.PORT || 10000);
const HOST = '0.0.0.0';
const MAX_BODY = process.env.MAX_BODY || '25mb';

const app = express();
app.set('trust proxy', true);
app.use(morgan('combined'));
app.use(cors({ origin: true, credentials: true }));
app.use(compression());
app.use(express.json({ limit: MAX_BODY }));
app.use(express.urlencoded({ extended: true, limit: MAX_BODY }));
app.use(express.static('public', { maxAge: 0, etag: false }));

// 1) 표준 헬스/레디니스
let isReady = false;
app.get('/healthz', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(200).json({
    ok: true,
    ts: new Date().toISOString(),
    uptime: Math.floor(process.uptime())
  });
});

app.get('/readyz', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(isReady ? 200 : 503).json({ ready: !!isReady, ts: Date.now() });
});

// 2) /api/status — AI 기능/환경 점검 결과 제공(클라 진단용)
app.get('/api/status', (req, res) => {
  const aiProvider = process.env.AI_PROVIDER || 'none';
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasReplicate = !!process.env.REPLICATE_API_TOKEN;

  // 실제 사용 제공자에 맞게 키 확인
  let aiReady = false, aiReason = 'disabled';
  if (aiProvider === 'openai') {
    aiReady = hasOpenAI; aiReason = hasOpenAI ? 'ok' : 'missing OPENAI_API_KEY';
  } else if (aiProvider === 'replicate') {
    aiReady = hasReplicate; aiReason = hasReplicate ? 'ok' : 'missing REPLICATE_API_TOKEN';
  }

  res.set('Cache-Control', 'no-store');
  res.json({
    ok: true,
    env: process.env.NODE_ENV || 'production',
    uptime: Math.floor(process.uptime()),
    routes: ['/healthz','/readyz','/api/status','/api/*'],
    ai: { provider: aiProvider, ready: aiReady, reason: aiReason },
    ready: isReady
  });
});

// 3) 준비 전 게이트(화이트리스트는 통과)
const allow = new Set(['/healthz','/readyz','/api/status','/favicon.ico']);
app.use((req, res, next) => {
  if (allow.has(req.path) || req.path.startsWith('/static/') || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  if (!isReady) return res.status(503).json({ error: 'server not ready' });
  next();
});

// 4) favicon — 파일 없으면 204로 무음 처리(404 소음 제거)
app.get('/favicon.ico', (req, res) => {
  res.set('Cache-Control', 'max-age=86400, immutable');
  res.status(204).end(); // public/favicon.ico 있으면 정적 서빙이 우선됨
});

// 5) (선택) 샘플 API
app.get('/api/hello', (_req, res) => res.json({ message: 'Hello after ready!' }));

// 서버 시작 및 초기화
const server = app.listen(PORT, HOST, () => {
  console.log(`listening on http://${HOST}:${PORT}`);
  init();
});
server.keepAliveTimeout = 61000;
server.headersTimeout = 62000;

async function init() {
  try {
    // TODO: DB/캐시/키 로딩 등 실제 초기화
    if (process.env.BOOT_DELAY_MS) await new Promise(r => setTimeout(r, Number(process.env.BOOT_DELAY_MS)));
    isReady = true;
    console.log('SERVER_READY');
  } catch (e) {
    console.error('INIT_FAILED', e);
    process.exit(1);
  }
}

process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('uncaughtException', e => console.error('uncaughtException', e));
process.on('unhandledRejection', e => console.error('unhandledRejection', e));