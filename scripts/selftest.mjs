import http from 'node:http';
import https from 'node:https';

const ORIGIN = process.env.ORIGIN || 'http://localhost:3000';
const agent = ORIGIN.startsWith('https') ? https : http;

function get(path) {
  return new Promise(resolve => {
    agent.get(ORIGIN + path + `?t=${Date.now()}`, res => {
      let body = ''; res.on('data', c => body += c); res.on('end', () => resolve({ code: res.statusCode, body }));
    }).on('error', e => resolve({ code: 0, body: String(e) }));
  });
}

async function run() {
  console.log('🧪 자동 테스트 시작:', ORIGIN);
  
  // 1. Health Check 테스트
  console.log('1️⃣ Health Check 테스트...');
  const h = await get('/healthz'); 
  if (h.code !== 200) throw new Error('/healthz fail ' + h.code);
  console.log('✅ Health Check 통과');
  
  // 2. Ready Check 테스트
  console.log('2️⃣ Ready Check 테스트...');
  const r1 = await get('/readyz'); 
  if (![200,503].includes(r1.code)) throw new Error('/readyz unexpected ' + r1.code);
  console.log('✅ Ready Check 초기 상태:', r1.code);

  // 3. 준비될 때까지 대기
  console.log('3️⃣ 서버 준비 대기...');
  const start = Date.now();
  while (Date.now() - start < 30000) {
    const r = await get('/readyz');
    if (r.code === 200) {
      console.log('✅ 서버 준비 완료');
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  
  const r2 = await get('/readyz'); 
  if (r2.code !== 200) throw new Error('ready not 200 after wait');
  console.log('✅ Ready Check 최종 확인');

  // 4. 샘플 POST 테스트(베이스64 1x1 PNG)
  console.log('4️⃣ Remove-bg API 테스트...');
  const img = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottQAAAABJRU5ErkJggg==','base64');
  
  const response = await fetch(ORIGIN + '/api/remove-bg', {
    method: 'POST', 
    headers: {'content-type':'application/json'},
    body: JSON.stringify({ 
      imageBase64: 'data:image/png;base64,' + img.toString('base64') 
    })
  });
  
  if (response.status !== 200) {
    const errorText = await response.text();
    throw new Error(`/api/remove-bg fail ${response.status}: ${errorText}`);
  }
  
  const result = await response.json();
  console.log('✅ Remove-bg API 성공:', result.success);
  
  console.log('🎉 모든 테스트 통과!');
}

run().catch(e => { 
  console.error('❌ selftest failed:', e.message); 
  process.exit(1); 
});
