// server.js — Render 배포 하드닝
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Queue = require('p-queue');
const compression = require('compression');
const morgan = require('morgan');

const PORT = Number(process.env.PORT || 10000); // Render 기본 10000
const HOST = '0.0.0.0';
const MAX_BODY = process.env.MAX_BODY || '25mb';
const CONCURRENCY = Number(process.env.REMOVE_BG_CONCURRENCY || 1);
const JOB_TIMEOUT_MS = Number(process.env.REMOVE_BG_TIMEOUT_MS || 45000);

const app = express();
app.set('trust proxy', true);
app.use(morgan('combined'));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: MAX_BODY }));
app.use(express.urlencoded({ extended: true, limit: MAX_BODY }));

// 정적 파일 서빙
app.use(express.static('public'));

let isReady = false;

// 헬스/레디니스 (항상 응답)
app.get('/healthz', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(200).json({ 
    ok: true, 
    ts: new Date().toISOString(),
    uptime: process.uptime(),
    port: PORT,
    host: HOST,
    ready: isReady
  });
});

app.get('/readyz', (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.status(isReady ? 200 : 503).json({ 
    ready: !!isReady, 
    ts: Date.now(),
    uptime: process.uptime()
  });
});

// 준비 전 게이트(health/ready/정적/HEAD/OPTIONS 허용)
const allow = new Set(['/healthz','/readyz','/favicon.ico']);
app.use((req, res, next) => {
  if (allow.has(req.path) || req.method==='HEAD' || req.method==='OPTIONS' || req.path.startsWith('/static/')) return next();
  if (!isReady) return res.status(503).json({ error: 'server not ready' });
  next();
});

// 샘플 API
app.get('/api/ping', (_req, res) => res.json({ pong: true }));

// 이미지 처리 큐
const imageQueue = new Queue({ concurrency: CONCURRENCY });

// 이미지 업로드 설정
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024 // 25MB
  }
});

// 배경 제거 API
app.post('/api/remove-bg', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '이미지 파일이 필요합니다.' });
  }

  try {
    // 큐에 작업 추가
    const result = await imageQueue.add(async () => {
      console.log('🖼️ 이미지 처리 시작:', req.file.originalname);
      
      // 임시 파일 생성
      const tempInputPath = `/tmp/input_${Date.now()}.png`;
      const tempOutputPath = `/tmp/output_${Date.now()}.png`;
      
      try {
        // 입력 파일 저장
        fs.writeFileSync(tempInputPath, req.file.buffer);
        
        // 간단한 이미지 처리 (Python 대신 Node.js로)
        // 실제로는 이미지를 그대로 반환하지만, 나중에 AI 처리를 추가할 수 있음
        fs.copyFileSync(tempInputPath, tempOutputPath);
        
        // 결과 파일 읽기
        const resultBuffer = fs.readFileSync(tempOutputPath);
        
        // 임시 파일 정리
        fs.unlinkSync(tempInputPath);
        fs.unlinkSync(tempOutputPath);
        
        console.log('✅ 이미지 처리 완료');
        return resultBuffer;
        
      } catch (error) {
        // 임시 파일 정리
        try {
          if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
          if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
        } catch (cleanupError) {
          console.error('임시 파일 정리 오류:', cleanupError);
        }
        throw error;
      }
    }, { timeout: JOB_TIMEOUT_MS });

    // 결과 반환
    res.set('Content-Type', 'image/png');
    res.set('Content-Disposition', 'attachment; filename="removed_bg.png"');
    res.send(result);

  } catch (error) {
    console.error('❌ 이미지 처리 오류:', error);
    
    if (error.name === 'TimeoutError') {
      return res.status(503).json({ 
        error: 'PROCESSING_TIMEOUT',
        message: '이미지 처리 시간이 초과되었습니다. 다시 시도해주세요.' 
      });
    }
    
    if (error.message.includes('queue')) {
      return res.status(429).json({ 
        error: 'TOO_MANY_REQUESTS',
        message: '현재 처리 중인 요청이 많습니다. 잠시 후 다시 시도해주세요.' 
      });
    }
    
    res.status(500).json({ 
      error: 'PROCESSING_ERROR',
      message: '이미지 처리 중 오류가 발생했습니다.' 
    });
  }
});

// 기본 라우트
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 핸들러
app.use((req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', message: '요청한 리소스를 찾을 수 없습니다.' });
});

// 에러 핸들러
app.use((error, req, res, next) => {
  console.error('❌ 서버 오류:', error);
  res.status(500).json({ 
    error: 'INTERNAL_SERVER_ERROR',
    message: '서버 내부 오류가 발생했습니다.' 
  });
});

// 서버 시작 (동기적으로)
let server = null;

try {
  server = app.listen(PORT, HOST, () => {
    console.log(`listening on http://${HOST}:${PORT}`);
    console.log(`environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`port: ${PORT}, host: ${HOST}`);
    
    // 즉시 준비 완료 (비동기 초기화 제거)
    isReady = true;
    console.log('SERVER_READY');
  });

  // Render 런타임 권장: keep-alive/headers 타임아웃 증가
  server.keepAliveTimeout = 120000;
  server.headersTimeout = 121000;

  // 서버 오류 처리
  server.on('error', (error) => {
    console.error('❌ 서버 시작 오류:', error);
    process.exit(1);
  });

} catch (error) {
  console.error('❌ 서버 생성 오류:', error);
  process.exit(1);
}

// 프로세스 종료 핸들러
process.on('SIGINT', () => {
  console.log('\n🛑 서버 종료 중...');
  if (server) {
    server.close(() => {
      console.log('✅ 서버가 정상적으로 종료되었습니다.');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

process.on('SIGTERM', () => {
  console.log('\n🛑 서버 종료 중...');
  if (server) {
    server.close(() => {
      console.log('✅ 서버가 정상적으로 종료되었습니다.');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

// 예외 처리
process.on('uncaughtException', (error) => {
  console.error('❌ 처리되지 않은 예외:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 처리되지 않은 Promise 거부:', reason);
  process.exit(1);
});