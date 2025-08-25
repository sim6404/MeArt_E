// server.js
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const PORT = Number(process.env.PORT || 10000);
const HOST = '0.0.0.0';

const app = express();
app.set('trust proxy', true);
app.use(morgan('combined'));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: process.env.MAX_BODY || '25mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.MAX_BODY || '25mb' }));
app.use(express.static('public', { maxAge: 0, etag: false }));

let isReady = false;

// --- Health ---
app.get('/healthz', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(200).json({ ok: true, ts: new Date().toISOString(), uptime: Math.floor(process.uptime()) });
});

// --- Readiness (AI와 분리) ---
app.get('/readyz', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(isReady ? 200 : 503).json({ ready: !!isReady, ts: Date.now() });
});

// --- Status (항상 200, 절대 404 금지) ---
app.get('/api/status', (req, res) => {
  const provider = (process.env.AI_PROVIDER || 'none').toLowerCase(); // 'openai' | 'replicate' | 'none'
  const keys = {
    openai: !!process.env.OPENAI_API_KEY,
    replicate: !!process.env.REPLICATE_API_TOKEN
  };
  let aiReady = false, reason = 'disabled';
  if (provider === 'openai') { aiReady = keys.openai; reason = aiReady ? 'ok' : 'missing OPENAI_API_KEY'; }
  else if (provider === 'replicate') { aiReady = keys.replicate; reason = aiReady ? 'ok' : 'missing REPLICATE_API_TOKEN'; }
  res.set('Cache-Control', 'no-store');
  res.status(200).json({
    ok: true,
    env: process.env.NODE_ENV || 'production',
    uptime: Math.floor(process.uptime()),
    ready: isReady,                  // 서버 레디니스
    ai: { provider, ready: aiReady, reason } // AI는 정보 제공용이지 게이트 아님
  });
});

// --- Readiness Gate ---
const allow = new Set(['/healthz','/readyz','/api/status','/favicon.ico']);
app.use((req, res, next) => {
  if (allow.has(req.path) || req.path.startsWith('/static/') || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (!isReady) return res.status(503).json({ error: 'server not ready' });
  next();
});

// 샘플 API
app.get('/api/hello', (_req, res) => res.json({ message: 'Hello after ready!' }));

// 서버 시작 + 초기화
const server = app.listen(PORT, HOST, () => {
  console.log(`listening on http://${HOST}:${PORT}`);
  init();
});
server.keepAliveTimeout = 61000;
server.headersTimeout = 62000;

async function init() {
  try {
    // TODO: DB/캐시/시크릿 로드 등 필수 의존성만을 '레디니스' 기준으로 삼는다.
    if (process.env.BOOT_DELAY_MS) await new Promise(r => setTimeout(r, Number(process.env.BOOT_DELAY_MS)));
    isReady = true; // AI 키 부재/비활성이어도 서버는 준비 완료로 본다.
    console.log('SERVER_READY');
  } catch (e) { console.error('INIT_FAILED', e); process.exit(1); }
}

process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('uncaughtException', e => console.error('uncaughtException', e));
process.on('unhandledRejection', e => console.error('unhandledRejection', e));