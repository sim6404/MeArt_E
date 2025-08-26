// node scripts/diagnose.mjs  (PORT/ORIGIN 환경변수로 대상 지정 가능)
import http from 'node:http';
import https from 'node:https';

const ORIGIN = process.env.ORIGIN || `http://localhost:${process.env.PORT||3000}`;
const H = ORIGIN.startsWith('https') ? https : http;

function get(p) {
  return new Promise(r => H.get(ORIGIN+p+`?t=${Date.now()}`, res => {
    let b = '';
    res.on('data', c => b += c);
    res.on('end', () => r({code: res.statusCode, body: b, headers: res.headers}));
  }).on('error', e => r({code: 0, body: String(e)})));
}

function post(p, d) {
  return fetch(ORIGIN+p, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(d)
  }).then(r => r.text().then(t => ({
    code: r.status, 
    body: t, 
    headers: Object.fromEntries(r.headers)
  }))).catch(e => ({code: 0, body: String(e)}));
}

(async () => {
  console.log('🔍 진단 시작:', ORIGIN);
  console.log('─'.repeat(50));
  
  const vr = await get('/__version'); 
  console.log('/__version', vr.code, vr.body.slice(0, 120));
  
  const rt = await get('/__routes');  
  console.log('/__routes', rt.code, rt.body.slice(0, 120));
  
  const hz = await get('/healthz');   
  console.log('/healthz', hz.code);
  
  const rz = await get('/readyz');    
  console.log('/readyz', rz.code);
  
  const st = await get('/api/status');
  console.log('/api/status', st.code);

  // composite probe (1x1 PNG)
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottQAAAABJRU5ErkJggg==';
  const cp = await post('/api/composite', { 
    fgBase64: `data:image/png;base64,${b64}`, 
    bgKey: '' 
  });
  console.log('/api/composite', cp.code, cp.body.slice(0, 120));

  // BG_image 존재성
  const ex = await fetch(ORIGIN + '/__bg-exists?name=the_harbor_at_lorient_1970.17.48.jpg').then(r => r.text()).then(t => ({code: 200, body: t}));
  console.log('/__bg-exists', ex.code, ex.body);
  
  // 실제 파일 접근 테스트
  const bg = await get('/BG_image/the_harbor_at_lorient_1970.17.48.jpg');
  console.log('/BG_image/...', bg.code, bg.body ? 'OK' : 'FAIL');
  
  console.log('─'.repeat(50));
  console.log('🔍 진단 완료');
})();
