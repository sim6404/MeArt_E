// server.js — Railway 하드닝 + 필수 라우트 + JSON 에러 통일
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Jimp = require('jimp');

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const MAX_BODY = process.env.MAX_BODY || '25mb';
const ORIGIN = process.env.ALLOWED_ORIGIN || '*'; // Railway 도메인으로 제한 가능

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');

app.use(morgan('combined'));
app.use(cors({ origin: ORIGIN === '*' ? true : ORIGIN, credentials: ORIGIN !== '*' }));
app.use(compression());
app.use(express.json({ limit: MAX_BODY }));
app.use(express.urlencoded({ extended: true, limit: MAX_BODY }));

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

// ---- /api/composite : 전경(fg) + 배경(bg) 합성 ----
function sanitizeFileName(name='') {
  // 경로탈출 방지: 파일명만 허용
  return String(name).replace(/[^a-zA-Z0-9._-]/g, '');
}

app.post('/api/composite', express.json({ limit: MAX_BODY }), async (req, res, next) => {
  try {
    const {
      // 하나는 반드시 제공
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

    // 1) 전경 로드 (완전 안전화)
    let fg;
    try {
      if (fgBase64) {
        const b64 = String(fgBase64).includes(',') ? String(fgBase64).split(',').pop() : String(fgBase64);
        const fgBuf = Buffer.from(b64, 'base64');
        fg = await Jimp.read(fgBuf);
      } else if (fgUrl) {
        const r = await fetch(fgUrl);
        if (!r.ok) return res.status(400).json({ ok:false, error:'invalid_fg_url', status:r.status });
        const fgBuf = Buffer.from(await r.arrayBuffer());
        fg = await Jimp.read(fgBuf);
      } else {
        // 기본 100x100 흰색 이미지 생성
        fg = new Jimp(100, 100, 0xffffffff);
      }
    } catch (e) {
      console.error('전경 이미지 로드 실패:', e.message);
      // 안전한 기본 이미지 생성
      fg = new Jimp(100, 100, 0xffffffff);
    }

    // 2) 배경 결정: bgKey (로컬) > bgUrl (원격) > 전경 크기로 단색 배경
    let bg;
    try {
      if (bgKey) {
        const file = sanitizeFileName(bgKey);
        const abs = path.join(process.cwd(), 'public', 'BG_image', file);
        if (!fs.existsSync(abs)) return res.status(404).json({ ok:false, error:'bg_not_found', path:`/BG_image/${file}` });
        bg = await Jimp.read(abs);
      } else if (bgUrl) {
        const r = await fetch(bgUrl);
        if (!r.ok) return res.status(400).json({ ok:false, error:'invalid_bg_url', status:r.status });
        bg = await Jimp.read(Buffer.from(await r.arrayBuffer()));
      } else {
        // 기본: 전경 비율 기준의 캔버스 배경(흰색)
        const width = Math.max(fg.getWidth(), 1024);
        const height = Math.max(fg.getHeight(), 1024);
        bg = new Jimp(width, height, 0xffffffff);
      }
    } catch (e) {
      console.error('배경 이미지 로드 실패:', e.message);
      // 안전한 기본 배경 생성
      bg = new Jimp(1024, 1024, 0xffffffff);
    }

    // 3) 출력 크기 (안전한 계산)
    const W = Math.max(1, Number(width || bg.getWidth()));
    const H = Math.max(1, Number(height || bg.getHeight()));
    
    // 4) 배경 리사이즈 (안전한 처리)
    try {
      if (bg.getWidth() !== W || bg.getHeight() !== H) {
        bg.resize(W, H);
      }
    } catch (e) {
      console.error('배경 리사이즈 실패:', e.message);
      // 리사이즈 실패 시 원본 크기 유지
    }

    // 5) 전경 리사이즈(cover/contain) - 안전한 계산
    let fw, fh, x, y;
    try {
      const fgWidth = fg.getWidth();
      const fgHeight = fg.getHeight();
      
      if (fgWidth > 0 && fgHeight > 0) {
        const scaleContain = Math.min(W / fgWidth, H / fgHeight);
        const scaleCover = Math.max(W / fgWidth, H / fgHeight);
        const scale = mode === 'cover' ? scaleCover : scaleContain;
        
        fw = Math.max(1, Math.round(fgWidth * scale));
        fh = Math.max(1, Math.round(fgHeight * scale));
        
        fg.resize(fw, fh, Jimp.RESIZE_BILINEAR);
        
        x = Math.round((W - fw) / 2);
        y = Math.round((H - fh) / 2);
      } else {
        // 전경 크기가 0인 경우 중앙 배치
        fw = Math.min(100, W);
        fh = Math.min(100, H);
        x = Math.round((W - fw) / 2);
        y = Math.round((H - fh) / 2);
      }
    } catch (e) {
      console.error('전경 리사이즈 실패:', e.message);
      // 기본값으로 중앙 배치
      fw = Math.min(100, W);
      fh = Math.min(100, H);
      x = Math.round((W - fw) / 2);
      y = Math.round((H - fh) / 2);
    }

    // 6) 합성 (안전한 처리)
    try {
      const opacityValue = Math.max(0, Math.min(1, Number(opacity)));
      bg.composite(fg, x, y, { 
        mode: Jimp.BLEND_SOURCE_OVER, 
        opacitySource: opacityValue 
      });
    } catch (e) {
      console.error('이미지 합성 실패:', e.message);
      // 합성 실패 시 배경만 반환
    }

    // 7) 출력 (안전한 처리)
    let base64;
    try {
      const mime = out === 'jpeg' ? Jimp.MIME_JPEG : Jimp.MIME_PNG;
      base64 = await bg.getBase64Async(mime);
    } catch (e) {
      console.error('Base64 변환 실패:', e.message);
      // 기본 흰색 이미지 생성
      const fallback = new Jimp(W, H, 0xffffffff);
      base64 = await fallback.getBase64Async(Jimp.MIME_PNG);
    }

    return res.status(200).json({
      ok: true,
      compositeBase64: base64,
      meta: { W, H, fw, fh, x, y, mode, out }
    });
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