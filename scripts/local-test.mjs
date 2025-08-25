import http from 'node:http';
import { spawn } from 'node:child_process';

const ORIGIN = process.env.ORIGIN || `http://localhost:${process.env.PORT||10000}`;

// 서버 시작 함수
function startServer() {
  return new Promise((resolve, reject) => {
    const server = spawn('node', ['server.js'], {
      env: { ...process.env, PORT: process.env.PORT || '10000' },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    server.stdout.on('data', (data) => {
      output += data.toString();
      if (output.includes('SERVER_READY')) {
        resolve(server);
      }
    });

    server.stderr.on('data', (data) => {
      console.error('Server error:', data.toString());
    });

    server.on('error', reject);

    // 30초 타임아웃
    setTimeout(() => {
      server.kill();
      reject(new Error('Server startup timeout'));
    }, 30000);
  });
}

// HTTP 요청 함수
async function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, ORIGIN);
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// 테스트 함수들
async function testHealth() {
  const res = await makeRequest('/healthz');
  console.log('✅ Health check:', res.status === 200 ? 'PASS' : 'FAIL');
  return res.status === 200;
}

async function testReady() {
  const res = await makeRequest('/readyz');
  console.log('✅ Ready check:', res.status === 200 ? 'PASS' : 'FAIL');
  return res.status === 200;
}

async function testStatus() {
  const res = await makeRequest('/api/status');
  console.log('✅ Status check:', res.status === 200 ? 'PASS' : 'FAIL');
  return res.status === 200;
}

async function testAnalyzeEmotion() {
  const img = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottQAAAABJRU5ErkJggg==';
  const body = JSON.stringify({ imageBase64: 'data:image/png;base64,' + img });
  
  const res = await makeRequest('/api/analyze-emotion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });
  
  console.log('✅ Analyze emotion:', res.status === 200 ? 'PASS' : 'FAIL');
  return res.status === 200;
}

async function testRemoveBg() {
  const img = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottQAAAABJRU5ErkJggg==';
  const body = JSON.stringify({ imageBase64: 'data:image/png;base64,' + img });
  
  const res = await makeRequest('/api/remove-bg', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });
  
  console.log('✅ Remove background:', res.status === 200 ? 'PASS' : 'FAIL');
  return res.status === 200;
}

async function testStaticFiles() {
  const res = await makeRequest('/BG_image/seascape_at_port-en-bessin_normandy_1972.9.21.jpg');
  console.log('✅ Static files:', res.status === 200 ? 'PASS' : 'FAIL');
  return res.status === 200;
}

// 메인 테스트 실행
async function runTests() {
  let server;
  try {
    console.log('🚀 Starting server...');
    server = await startServer();
    console.log('✅ Server started successfully');
    
    // 잠시 대기
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('\n🧪 Running tests...');
    
    const tests = [
      testHealth,
      testReady,
      testStatus,
      testAnalyzeEmotion,
      testRemoveBg,
      testStaticFiles
    ];
    
    const results = await Promise.all(tests.map(test => test().catch(() => false)));
    const passed = results.filter(Boolean).length;
    const total = tests.length;
    
    console.log(`\n📊 Test Results: ${passed}/${total} tests passed`);
    
    if (passed === total) {
      console.log('🎉 All tests passed! Ready for deployment.');
      process.exit(0);
    } else {
      console.log('❌ Some tests failed. Please fix before deploying.');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  } finally {
    if (server) {
      server.kill();
      console.log('🛑 Server stopped');
    }
  }
}

runTests();
