// server.js — Railway 하드닝 + 필수 라우트 + JSON 에러 통일 + 진단 시스템
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Jimp = require('jimp');

// == 진단 시스템: 버전/라우트/캐시 정보 ==
const GIT_REV = process.env.GIT_REV || process.env.RAILWAY_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || 'unknown';
const BUILD_AT = process.env.BUILD_AT || new Date().toISOString();

function listRoutes(app) {
  const out = [];
  app._router?.stack?.forEach((m) => {
    if (m.route) {
      const methods = Object.keys(m.route.methods).filter(Boolean).map(x => x.toUpperCase()).join(',');
      out.push({ methods, path: m.route.path });
    } else if (m.name === 'router' && m.handle?.stack) {
      m.handle.stack.forEach((h) => {
        if (h.route) {
          const methods = Object.keys(h.route.methods).map(x => x.toUpperCase()).join(',');
          out.push({ methods, path: (m.regexp?.fast_slash ? '' : (m?.regexp?.toString().includes('/api') ? '/api' : '')) + h.route.path });
        }
      });
    }
  });
  return out;
}

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const MAX_BODY = process.env.MAX_BODY || '25mb';
const ORIGIN = process.env.ALLOWED_ORIGIN || '*'; // Railway 도메인으로 제한 가능

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');

// == 0) 공통: 최상단 미들웨어에 삽입 ==
app.use((req, res, next) => {
  const tid = (req.headers['x-trace-id'] || crypto.randomBytes(8).toString('hex'));
  res.setHeader('X-Trace-Id', tid);
  req.__tid = tid;
  next();
});

app.use(morgan('combined'));
app.use(cors({ origin: ORIGIN === '*' ? true : ORIGIN, credentials: ORIGIN !== '*' }));
app.use(compression());
app.use(express.json({ limit: MAX_BODY }));
app.use(express.urlencoded({ extended: true, limit: MAX_BODY }));

// == 2) HTML/엔트리 no-cache (디버그시 캐시 무력화) ==
app.use((req, res, next) => {
  if (req.method === 'GET' && (req.path === '/' || req.path.endsWith('.html'))) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
  }
  next();
});

// ====== BG_image 정적 서빙 + 관대한 리졸버 ======
const BG_DIR = path.join(process.cwd(), 'public', 'BG_image');

// 1) 정적 서빙 (정확 매치)
app.use('/BG_image',
  express.static(BG_DIR, {
    fallthrough: true,
    immutable: true,
    maxAge: '30d',
    extensions: ['jpg','jpeg','png','webp']
  })
);

// 2) 관대한 리졸버 (대소문자/구분자/특수문자 차이를 흡수)
const cache = new Map();
function normKey(s) {
  const dec = decodeURIComponent(s || '');
  const i = dec.lastIndexOf('.');
  const name = i >= 0 ? dec.slice(0, i) : dec;
  const ext  = i >= 0 ? dec.slice(i+1) : '';
  const keyBase = name.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const keyExt  = ext.toLowerCase();
  return keyBase + '.' + keyExt;
}

function buildIndex(dir) {
  const idx = new Map();
  if (!fs.existsSync(dir)) return idx;
  for (const f of fs.readdirSync(dir)) {
    const stat = fs.statSync(path.join(dir, f));
    if (!stat.isFile()) continue;
    const k = normKey(f);
    if (k.endsWith('.jpg') || k.endsWith('.jpeg') || k.endsWith('.png') || k.endsWith('.webp')) {
      idx.set(k, f);
    }
  }
  return idx;
}

let index = buildIndex(BG_DIR);

app.get('/BG_image/:file', (req, res, next) => {
  const want = req.params.file;
  const key = normKey(want);
  
  if (cache.has(key)) {
    const real = cache.get(key);
    const abs = path.join(BG_DIR, real);
    if (fs.existsSync(abs)) return res.sendFile(abs, { headers: { 'Cache-Control': 'public, max-age=2592000, immutable' } });
    cache.delete(key);
  }
  
  if (!index.size) index = buildIndex(BG_DIR);
  const real = index.get(key);
  if (real) {
    cache.set(key, real);
    const abs = path.join(BG_DIR, real);
    return res.sendFile(abs, { headers: { 'Cache-Control': 'public, max-age=2592000, immutable' } });
  }
  
  const [base, ext] = key.split('.');
  const candidates = [...index.entries()].filter(([k]) => k.endsWith('.' + ext));
  const similar = candidates.find(([k]) => k.includes(base.slice(0, Math.max(6, Math.floor(base.length*0.6)))));
  if (similar) {
    const abs = path.join(BG_DIR, similar[1]);
    cache.set(key, similar[1]);
    return res.sendFile(abs, { headers: { 'Cache-Control': 'public, max-age=2592000, immutable' } }); 
  }
  
  return res.status(404).json({ error: 'image not found', path: '/BG_image/' + want });
});

// 기존 정적 파일 서빙 (BG_image 제외)
app.use(express.static('public', { maxAge: 0, etag: false }));

// == 1) 버전/라우트/캐시 진단 ==
app.get('/__version', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, git: GIT_REV, buildAt: BUILD_AT, node: process.version, env: process.env.NODE_ENV, tid: req.__tid });
});

app.get('/__routes', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, routes: listRoutes(app), tid: req.__tid });
});

// == 3) 정적 BG_image 존재 점검 ==
app.get('/__bg-exists', (req, res) => {
  const name = (req.query.name || '').toString();
  const file = path.join(process.cwd(), 'public', 'BG_image', name);
  const ok = !!(name && fs.existsSync(file));
  console.log('🔍 BG exists check:', { name, file, exists: ok });
  res.json({ ok, file: `/public/BG_image/${name}`, tid: req.__tid });
});

let isReady = false;

// 헬스/레디니스/상태
app.get('/healthz', (_req, res) => res.status(200).json({ ok: true, ts: new Date().toISOString() }));
app.get('/readyz', (_req, res) => res.status(isReady ? 200 : 503).json({ ready: !!isReady, ts: Date.now() }));
app.get('/api/status', (_req, res) => {
  const provider = (process.env.AI_PROVIDER || 'none').toLowerCase();
  const aiReady = provider === 'openai' ? !!process.env.OPENAI_API_KEY
                : provider === 'replicate' ? !!process.env.REPLICATE_API_TOKEN
                : false;
  res.status(200).json({ 
    ok: true, 
    ready: isReady, 
    ai: { provider, ready: aiReady },
    routes: ['/api/analyze-emotion', '/api/remove-bg'],
    env: process.env.NODE_ENV || 'development'
  });
});

// 준비 전 게이트(화이트리스트만 통과)
const allow = new Set(['/healthz','/readyz','/api/status','/favicon.ico']);
app.use((req, res, next) => {
  if (allow.has(req.path) || req.path.startsWith('/static/') || req.method==='HEAD' || req.method==='OPTIONS') return next();
  if (!isReady) return res.status(503).json({ error: 'server not ready' });
  next();
});

// 배경제거 라우트(필수)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
app.post('/api/remove-bg', upload.single('image'), async (req, res, next) => {
  try {
    let input = null;
    if (req.file?.buffer) input = req.file.buffer;
    else if (req.body?.imageBase64) {
      const b64 = String(req.body.imageBase64).split(',').pop();
      input = Buffer.from(b64, 'base64');
    }
    if (!input) return res.status(400).json({ error: 'no image provided' });

    // TODO: 실제 배경제거 로직 호출(외부 API/내부 처리)
    if (process.env.DEMO_DELAY_MS) await new Promise(r => setTimeout(r, Number(process.env.DEMO_DELAY_MS)));

    return res.status(200).json({ ok: true, size: input.length });
  } catch (e) { next(e); }
});

// ---- /api/composite : 전경(fg) + 배경(bg) 합성 (Jimp 의존성 제거) ----
function sanitizeFileName(name='') {
  // 경로탈출 방지: 파일명만 허용
  return String(name).replace(/[^a-zA-Z0-9._-]/g, '');
}

// 간단한 Base64 이미지 생성 (Jimp 대신)
function createSimpleImage(width = 100, height = 100, color = '#ffffff') {
  const canvas = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="${color}"/>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(canvas).toString('base64')}`;
}

app.post('/api/composite', express.json({ limit: MAX_BODY }), async (req, res, next) => {
  try {
    const {
      fgBase64,           // "data:image/...;base64,...." 또는 순수 base64
      fgUrl,              // (선택) 전경 URL
      bgKey,              // (선택) public/BG_image/<bgKey>
      bgUrl,              // (선택) 외부/동일 출처 배경 URL
      mode = 'contain',   // 'contain' | 'cover'
      out = 'png',        // 'png' | 'jpeg'
      width, height,      // (선택) 강제 출력 크기
      opacity = 1.0       // 전경 투명도(0~1)
    } = req.body || {};

    if (!fgBase64 && !fgUrl) {
      return res.status(400).json({ ok:false, error:'missing_foreground', need:['fgBase64|fgUrl'] });
    }

    // 1) 전경 이미지 처리 (Jimp 의존성 제거)
    let fgImage = null;
    try {
      if (fgBase64) {
        // Base64 검증 및 정규화
        const cleanBase64 = String(fgBase64).replace(/^data:image\/[^;]+;base64,/, '');
        if (cleanBase64.length > 0) {
          fgImage = `data:image/png;base64,${cleanBase64}`;
        }
      } else if (fgUrl) {
        fgImage = fgUrl;
      }
    } catch (e) {
      console.error('전경 이미지 처리 실패:', e.message);
    }

    // 전경 이미지가 없으면 기본 이미지 생성
    if (!fgImage) {
      fgImage = createSimpleImage(100, 100, '#ffffff');
    }

    // 2) 배경 이미지 처리 (Jimp 의존성 제거)
    let bgImage = null;
    try {
      if (bgKey) {
        const file = sanitizeFileName(bgKey);
        const abs = path.join(process.cwd(), 'public', 'BG_image', file);
        if (!fs.existsSync(abs)) {
          return res.status(404).json({ ok:false, error:'bg_not_found', path:`/BG_image/${file}` });
        }
        // 배경 이미지 URL 반환
        bgImage = `/BG_image/${file}`;
      } else if (bgUrl) {
        bgImage = bgUrl;
      }
    } catch (e) {
      console.error('배경 이미지 처리 실패:', e.message);
    }

    // 배경 이미지가 없으면 기본 배경 생성
    if (!bgImage) {
      bgImage = createSimpleImage(1024, 1024, '#f0f0f0');
    }

    // 3) 합성 결과 생성 (클라이언트에서 처리하도록 단순화)
    const compositeResult = {
      ok: true,
      fgImage: fgImage,
      bgImage: bgImage,
      mode: mode,
      out: out,
      width: width || 1024,
      height: height || 1024,
      opacity: opacity,
      meta: { 
        mode, 
        out, 
        width: width || 1024, 
        height: height || 1024,
        opacity: opacity,
        message: '합성 정보를 클라이언트에서 처리하세요'
      }
    };

    return res.status(200).json(compositeResult);
  } catch (e) { next(e); }
});

// 감정 분석 라우트
const uploadAnalyze = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const analyzePaths = ['/api/analyze-emotion', '/analyze-emotion'];
app.post(analyzePaths, uploadAnalyze.single('image'), async (req, res, next) => {
  try {
    let input = null, source = 'unknown';
    if (req.file?.buffer) { input = req.file.buffer; source = 'file'; }
    else if (req.body?.imageBase64) {
      const b64 = String(req.body.imageBase64).split(',').pop();
      input = Buffer.from(b64, 'base64'); source = 'base64';
    }
    if (!input) return res.status(400).json({ error: 'no image provided' });

    // TODO: 실제 감정 분석 로직 호출
    const result = {
      dominant: 'neutral',
      scores: { neutral: 0.9, happy: 0.05, sad: 0.03, angry: 0.02 },
    };

    res.set('Cache-Control','no-store');
    return res.status(200).json({
      ok: true,
      source,
      result
    });
  } catch (e) { next(e); }
});

app.all(analyzePaths, (req, res, next) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed', allow: ['POST'] });
  next();
});

// favicon 소음 제거
app.get('/favicon.ico', (_req, res) => res.status(204).end());

// JSON 404/에러 핸들러
app.use((req, res) => res.status(404).json({ ok:false, error:'not_found', path:req.path }));
app.use((err, req, res, _next) => {
  console.error('error:', err);
  res.status(Number(err?.status || err?.statusCode || 500)).json({ ok:false, error: err?.message || 'internal_error' });
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
    // 필수 의존성 초기화(DB/캐시/시크릿)만 레디니스 기준
    if (process.env.BOOT_DELAY_MS) await new Promise(r => setTimeout(r, Number(process.env.BOOT_DELAY_MS)));
    isReady = true;                 // AI 비활성이어도 서버는 준비로 간주
    console.log('SERVER_READY');
  } catch (e) { console.error('INIT_FAILED', e); process.exit(1); }
}

// 라우트 테이블 출력
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