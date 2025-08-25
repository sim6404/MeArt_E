import http from 'node:http';

const ORIGIN = process.env.ORIGIN || `http://localhost:${process.env.PORT||10000}`;
const get = (p) => new Promise(r=>http.get(ORIGIN+p+`?t=${Date.now()}`,res=>{let b='';res.on('data',c=>b+=c);res.on('end',()=>r({code:res.statusCode,body:b}))}).on('error',e=>r({code:0,body:String(e)})));
const postJson = (p,d)=>fetch(ORIGIN+p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)}).then(r=>r.text().then(t=>({code:r.status,body:t})));

(async ()=>{
  const h = await get('/healthz'); if (h.code!==200) throw new Error('/healthz != 200');
  let rz = await get('/readyz'); if (![200,503].includes(rz.code)) throw new Error('/readyz unexpected '+rz.code);
  const img = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottQAAAABJRU5ErkJggg==';
  const r = await postJson('/api/remove-bg', { imageBase64: 'data:image/png;base64,'+img });
  try { const j = JSON.parse(r.body); if (r.code!==200 || !j.ok) throw new Error('remove-bg failed '+r.code); }
  catch(e){ throw new Error('remove-bg invalid response '+r.code+': '+r.body.slice(0,200)); }
  console.log('selftest OK');
})().catch(e=>{ console.error('selftest failed:', e.message); process.exit(1); });
