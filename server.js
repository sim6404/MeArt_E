// server.js — Render 502/503 근본대응
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const multer = require('multer');
const PQueue = require('p-queue').default;

const PORT = Number(process.env.PORT || 10000);
const HOST = '0.0.0.0';

const MAX_BODY = process.env.MAX_BODY || '25mb';
const REMOVE_BG_CONCURRENCY = Number(process.env.REMOVE_BG_CONCURRENCY || 1);
const REMOVE_BG_TIMEOUT_MS = Number(process.env.REMOVE_BG_TIMEOUT_MS || 45000);

const app = express();
app.set('trust proxy', true);
app.use(morgan('combined'));
app.use(cors({ origin: true, credentials: true }));
app.use(compression());
app.use(express.json({ limit: MAX_BODY }));
app.use(express.urlencoded({ extended: true, limit: MAX_BODY }));
app.use(express.static('public', { maxAge: 0, etag: false }));

let isReady = false;

// 헬스/레디니스
app.get('/healthz', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(200).json({ ok: true, ts: new Date().toISOString() });
});

app.get('/readyz', (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.status(isReady ? 200 : 503).json({ ready: !!isReady, ts: Date.now() });
});

// 준비 전 게이트 (화이트리스트 경로/메서드는 통과)
const allow = new Set(['/healthz', '/readyz', '/favicon.ico']);
app.use((req, res, next) => {
  if (allow.has(req.path) || req.path.startsWith('/static/')) return next();
  if (req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (!isReady) return res.status(503).json({ error: 'server not ready' });
  next();
});

// remove-bg — 업로드 처리 + 동시성 제한 + 타임아웃
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const queue = new PQueue({ concurrency: REMOVE_BG_CONCURRENCY, timeout: REMOVE_BG_TIMEOUT_MS, throwOnTimeout: true });

app.post('/api/remove-bg', upload.single('image'), async (req, res) => {
  const started = Date.now();
  try {
    await queue.add(async () => {
      let input = null;
      if (req.file?.buffer) input = req.file.buffer;
      else if (req.body?.imageBase64) {
        const b64 = String(req.body.imageBase64).split(',').pop();
        input = Buffer.from(b64, 'base64');
      }
      if (!input) return res.status(400).json({ error: 'no image provided' });

      // TODO: 실제 배경제거 로직으로 교체
      if (process.env.DEMO_DELAY_MS) await new Promise(r => setTimeout(r, Number(process.env.DEMO_DELAY_MS)));

      res.set('Cache-Control', 'no-store');
      res.status(200).json({ ok: true, size: input.length, tookMs: Date.now() - started });
    });
  } catch (err) {
    const msg = err?.message || String(err);
    const isTimeout = /timeout/i.test(msg);
    res.status(isTimeout ? 503 : 429).json({
      error: 'remove-bg failed',
      reason: isTimeout ? 'timeout/overload' : msg,
      queue: { pending: queue.size, running: queue.pending },
      ts: Date.now()
    });
  }
});

const server = app.listen(PORT, HOST, () => {
  console.log(`listening on http://${HOST}:${PORT}`);
  init();
});

// Render 프록시 안정화를 위한 타임아웃 조정
server.keepAliveTimeout = 61000;
server.headersTimeout = 62000;

async function init() {
  try {
    // 의존성 초기화(DB/캐시/시크릿 등). 오래 걸리면 BOOT_DELAY_MS로 시뮬레이션 가능
    if (process.env.BOOT_DELAY_MS) await new Promise(r => setTimeout(r, Number(process.env.BOOT_DELAY_MS)));
    isReady = true;
    console.log('SERVER_READY');
  } catch (e) {
    console.error('INIT_FAILED', e);
    process.exit(1);
  }
}

process.on('uncaughtException', e => console.error('uncaughtException', e));
process.on('unhandledRejection', e => console.error('unhandledRejection', e));
process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));