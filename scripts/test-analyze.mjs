import http from 'node:http';

const ORIGIN = process.env.ORIGIN || `http://localhost:${process.env.PORT||10000}`;

const postJson = (p,d)=>fetch(ORIGIN+p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)})
  .then(r=>r.text().then(t=>({code:r.status,body:t})));

(async ()=>{
  const img = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottQAAAABJRU5ErkJggg==';
  for (const path of ['/api/analyze-emotion','/analyze-emotion']) {
    const r = await postJson(path, { imageBase64: 'data:image/png;base64,'+img });
    try {
      const j = JSON.parse(r.body);
      console.log(path, r.code, j.ok, j.result?.dominant);
    } catch { throw new Error(`invalid JSON from ${path}: ${r.code} ${r.body.slice(0,200)}`); }
  }
  console.log('test-analyze OK');
})().catch(e=>{ console.error('test-analyze failed:', e.message); process.exit(1); });
