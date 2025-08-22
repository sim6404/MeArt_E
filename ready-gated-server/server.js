const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// 정적 파일 서빙 (public 폴더)
app.use(express.static('public'));

let isReady = false;

// Health check endpoint (프로세스 살아있음 확인)
app.get('/healthz', (_req, res) => res.status(200).json({ ok: true, ts: Date.now() }));

// Readiness check endpoint (서버 준비 상태 확인)
app.get('/readyz', (_req, res) => {
  if (isReady) return res.status(200).json({ ready: true, ts: Date.now() });
  return res.status(503).json({ ready: false, ts: Date.now() });
});

// Readiness gate middleware (헬스/레디니스/정적자원은 통과)
const readinessGate = (req, res, next) => {
  const allowlist = ['/healthz', '/readyz', '/favicon.ico'];
  if (allowlist.includes(req.path) || req.path.startsWith('/static/')) return next();
  if (!isReady) return res.status(503).json({ error: 'server not ready' });
  next();
};
app.use(readinessGate);

// 예시 API
app.get('/api/hello', (_req, res) => res.json({ message: 'Hello after ready!' }));

const port = process.env.PORT || 3000;
let server;

// Database connection (실제 DB 연결 또는 Mock)
async function connectDB() {
  // 실제 DB 연결이 있는 경우 (예: MongoDB, PostgreSQL 등)
  if (process.env.DB_TYPE === 'mongodb') {
    console.log('🔄 MongoDB 연결 중...');
    // const mongoose = require('mongoose');
    // await mongoose.connect(process.env.MONGODB_URI);
    // console.log('✅ MongoDB 연결 완료');
    throw new Error('MongoDB 연결 예시 (실제 구현 필요)');
  } else if (process.env.DB_TYPE === 'postgres') {
    console.log('🔄 PostgreSQL 연결 중...');
    // const { Pool } = require('pg');
    // const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    // await pool.query('SELECT 1');
    // console.log('✅ PostgreSQL 연결 완료');
    throw new Error('PostgreSQL 연결 예시 (실제 구현 필요)');
  } else {
    // Mock DB 연결 (기본값)
    const ms = Number(process.env.BOOT_DELAY_MS || 1500);
    console.log(`🔄 Mock DB 연결 중... (${ms}ms)`);
    await new Promise(r => setTimeout(r, ms));
    console.log('✅ Mock DB 연결 완료');
  }
}

// Warmup function
async function warmup() {
  // 캐시 프리로드 등
  console.log('🔄 서버 워밍업 중...');
  await new Promise(r => setTimeout(r, 300));
  console.log('✅ 서버 워밍업 완료');
}

// Server initialization
async function init() {
  try {
    console.log('🚀 서버 초기화 시작...');
    await connectDB();
    await warmup();
    isReady = true;
    console.log('SERVER_READY'); // 외부 스크립트가 파싱하기 쉬운 토큰
  } catch (err) {
    console.error('INIT_FAILED', err);
    process.exit(1);
  }
}

// Start server
server = app.listen(port, () => {
  console.log(`🌐 서버가 http://localhost:${port} 에서 실행 중입니다`);
  console.log('📊 서버 소켓은 열렸지만 아직 isReady=false -> gate가 503을 유지');
  init();
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`🛑 ${signal} 신호 수신, 서버 종료 중...`);
  server?.close(() => {
    console.log('✅ HTTP 서버 종료 완료');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
