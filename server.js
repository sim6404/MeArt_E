// server.js
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const multer = require('multer');

const PORT = Number(process.env.PORT || 10000);
const HOST = '0.0.0.0';
const MAX_BODY = process.env.MAX_BODY || '25mb';

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');

app.use(morgan('combined'));
app.use(cors({ origin: true, credentials: true }));
app.use(compression());
app.use(express.json({ limit: MAX_BODY }));
app.use(express.urlencoded({ extended: true, limit: MAX_BODY }));
app.use(express.static('public', { maxAge: 0, etag: false }));

let isReady = false;

// Health / Ready / Status
app.get('/healthz', (req, res) => res.status(200).json({ ok: true, ts: new Date().toISOString() }));
app.get('/readyz', (req, res) => res.status(isReady ? 200 : 503).json({ ready: !!isReady, ts: Date.now() }));
app.get('/api/status', (req, res) => {
  const aiProvider = (process.env.AI_PROVIDER || 'none').toLowerCase();
  const aiReady = aiProvider === 'openai' ? !!process.env.OPENAI_API_KEY
                : aiProvider === 'replicate' ? !!process.env.REPLICATE_API_TOKEN : false;
  res.status(200).json({
    ok: true, ready: isReady,
    ai: { provider: aiProvider, ready: aiReady }
  });
});

// 준비 전 게이트(화이트리스트 통과)
const allow = new Set(['/healthz','/readyz','/api/status','/favicon.ico']);
app.use((req, res, next) => {
  if (allow.has(req.path) || req.path.startsWith('/static/') || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (!isReady) return res.status(503).json({ error: 'server not ready' });
  next();
});

// ---- /api router ----
const api = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// 핵심 라우트: POST /api/remove-bg  (GET은 405로 거절)
api.post('/remove-bg', upload.single('image'), async (req, res, next) => {
  try {
    let input = null;
    if (req.file?.buffer) input = req.file.buffer;
    else if (req.body?.imageBase64) {
      const b64 = String(req.body.imageBase64).split(',').pop();
      input = Buffer.from(b64, 'base64');
    }
    if (!input) return res.status(400).json({ error: 'no image provided' });

    // TODO: 실제 배경제거 로직 호출
    if (process.env.DEMO_DELAY_MS) await new Promise(r => setTimeout(r, Number(process.env.DEMO_DELAY_MS)));
    res.status(200).json({ ok: true, size: input.length });
  } catch (e) { next(e); }
});
api.all('/remove-bg', (req, res) => res.status(405).json({ error: 'method not allowed', allow: ['POST'] }));

app.use('/api', api);

// favicon 없을 때 소음 제거
app.get('/favicon.ico', (req, res) => res.status(204).end());

// JSON 404 & 공통 에러 핸들러 (HTML 금지)
app.use((req, res) => res.status(404).json({ error: 'not found', path: req.path }));
app.use((err, req, res, next) => {
  console.error('error:', err);
  const code = Number(err?.status || err?.statusCode || 500);
  res.status(code).json({ error: err?.message || 'internal error' });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`listening on http://${HOST}:${PORT}`);
  logRoutes(app);
  init();
});
server.keepAliveTimeout = 61000;
server.headersTimeout = 62000;

async function init() {
  try {
    if (process.env.BOOT_DELAY_MS) await new Promise(r => setTimeout(r, Number(process.env.BOOT_DELAY_MS)));
    isReady = true;
    console.log('SERVER_READY');
  } catch (e) { console.error('INIT_FAILED', e); process.exit(1); }
}

// 라우트 테이블 출력(경로/메서드 확인용)
function logRoutes(app) {
  const list = [];
  app._router.stack.forEach((m) => {
    if (m.route) {
      const methods = Object.keys(m.route.methods).map(k => k.toUpperCase()).join(',');
      list.push(`${methods} ${m.route.path}`);
    } else if (m.name === 'router' && m.handle?.stack) {
      m.handle.stack.forEach((h) => {
        const p = h.route?.path;
        const methods = h.route ? Object.keys(h.route.methods).map(k => k.toUpperCase()).join(',') : '';
        if (p) list.push(`${methods} /api${p}`);
      });
    }
  });
  console.log('[routes]\n' + list.join('\n'));
}

process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('uncaughtException', e => console.error('uncaughtException', e));
process.on('unhandledRejection', e => console.error('unhandledRejection', e));