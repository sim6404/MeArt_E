const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const Queue = require('p-queue');
const compression = require('compression');
const morgan = require('morgan');

// 환경변수 설정
const PORT = Number(process.env.PORT || 10000);
const HOST = '0.0.0.0';
const MAX_BODY = process.env.MAX_BODY || '50mb';
const CONCURRENCY = Number(process.env.REMOVE_BG_CONCURRENCY || 1);
const JOB_TIMEOUT_MS = Number(process.env.REMOVE_BG_TIMEOUT_MS || 45000);
const BOOT_DELAY_MS = Number(process.env.BOOT_DELAY_MS || 0);

// 서버 준비 상태
let isReady = false;

// 이미지 처리 큐
const imageQueue = new Queue({ concurrency: CONCURRENCY });

const app = express();

// 미들웨어 설정
app.use(morgan('combined'));
app.use(compression());
app.use(express.json({ limit: MAX_BODY }));
app.use(express.urlencoded({ extended: true, limit: MAX_BODY }));
app.use(cors());

// 정적 파일 서빙
app.use(express.static('public'));

// 서버 준비 상태 체크 미들웨어
app.use((req, res, next) => {
  // 헬스체크, 준비상태 체크, 정적 파일, HEAD, OPTIONS 요청은 허용
  const allowedPaths = ['/healthz', '/readyz', '/favicon.ico'];
  const isStaticFile = req.path.startsWith('/') && req.path.includes('.');
  const isAllowedMethod = ['HEAD', 'OPTIONS'].includes(req.method);
  
  if (!isReady && !allowedPaths.includes(req.path) && !isStaticFile && !isAllowedMethod) {
    return res.status(503).json({
      error: 'SERVER_NOT_READY',
      message: '서버가 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.',
      retryAfter: 5
    });
  }
  next();
});

// 헬스체크 엔드포인트 (항상 200)
app.get('/healthz', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 준비상태 체크 엔드포인트 (준비되면 200, 아니면 503)
app.get('/readyz', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (isReady) {
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  } else {
    res.status(503).json({
      status: 'not_ready',
      message: '서버가 아직 초기화 중입니다.',
      timestamp: new Date().toISOString()
    });
  }
});

// 서버 초기화 함수
async function init() {
  console.log('🚀 서버 초기화 시작...');
  
  // 부팅 지연 (필요시)
  if (BOOT_DELAY_MS > 0) {
    console.log(`⏳ 부팅 지연: ${BOOT_DELAY_MS}ms`);
    await new Promise(resolve => setTimeout(resolve, BOOT_DELAY_MS));
  }
  
  // 기본 초기화 완료
  console.log('✅ 기본 초기화 완료');
  isReady = true;
  console.log('SERVER_READY');
}

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

// 서버 생성 및 설정
const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 서버가 ${HOST}:${PORT}에서 시작되었습니다.`);
  console.log(`📊 환경: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔧 설정: MAX_BODY=${MAX_BODY}, CONCURRENCY=${CONCURRENCY}, TIMEOUT=${JOB_TIMEOUT_MS}ms`);
});

// 서버 설정
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

// 프로세스 종료 핸들러
process.on('SIGINT', () => {
  console.log('\n🛑 서버 종료 중...');
  server.close(() => {
    console.log('✅ 서버가 정상적으로 종료되었습니다.');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 서버 종료 중...');
  server.close(() => {
    console.log('✅ 서버가 정상적으로 종료되었습니다.');
    process.exit(0);
  });
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

// 서버 초기화 시작
init().catch(error => {
  console.error('❌ 서버 초기화 실패:', error);
  process.exit(1);
});