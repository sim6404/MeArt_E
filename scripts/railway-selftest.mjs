import http from 'node:http';
const ORIGIN = process.env.ORIGIN || `http://localhost:${process.env.PORT||3000}`;
const get = p => new Promise(r=>http.get(ORIGIN+p+`?t=${Date.now()}`,res=>{res.resume();r(res.statusCode)}).on('error',()=>r(0)));
const postJson = (p,d)=>fetch(ORIGIN+p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)}).then(r=>r.text().then(t=>({code:r.status,body:t})));

(async ()=>{
  console.log('🚀 Railway Self-Test 시작:', ORIGIN);
  
  // 1. 헬스 체크
  const h = await get('/healthz'); 
  if (h !== 200) throw new Error('/healthz != 200');
  console.log('✅ /healthz OK');
  
  // 2. 레디니스 체크 (503 → 200 전환 확인)
  let rz = await get('/readyz'); 
  if (![200,503].includes(rz)) throw new Error('/readyz unexpected '+rz);
  console.log('✅ /readyz OK (' + rz + ')');
  
  // 3. 상태 체크
  const status = await get('/api/status');
  if (status !== 200) throw new Error('/api/status != 200');
  console.log('✅ /api/status OK');
  
  // 4. 배경제거 API 테스트
  const img = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottQAAAABJRU5ErkJggg==';
  const r = await postJson('/api/remove-bg', { imageBase64: 'data:image/png;base64,'+img });
  try { 
    const j = JSON.parse(r.body); 
    if (r.code !== 200 || !j.ok) throw new Error('remove-bg not ok '+r.code); 
  } catch(e){ 
    throw new Error('remove-bg invalid '+r.code+': '+r.body.slice(0,200)); 
  }
  console.log('✅ /api/remove-bg OK');
  
  // 5. 정적 파일 체크
  const bg = await get('/BG_image/the_harbor_at_lorient_1970.17.48.jpg');
  if (bg !== 200) throw new Error('BG_image != 200');
  console.log('✅ BG_image OK');
  
  console.log('🎉 Railway Self-Test 완료!');
})().catch(e=>{ 
  console.error('❌ Railway Self-Test 실패:', e.message); 
  process.exit(1); 
});
