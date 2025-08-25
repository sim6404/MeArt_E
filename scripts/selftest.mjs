import http from 'node:http';

const ORIGIN = process.env.ORIGIN || `http://localhost:${process.env.PORT||10000}`;
const get = p => new Promise(r => http.get(ORIGIN+p+`?t=${Date.now()}`,res=>{res.resume();r(res.statusCode)}).on('error',()=>r(0)));

(async ()=>{
  const h = await get('/healthz'); if (h!==200) throw new Error('/healthz != 200');
  let rz = await get('/readyz'); if (![200,503].includes(rz)) throw new Error('/readyz unexpected '+rz);
  const t0=Date.now(); while(rz!==200 && Date.now()-t0<30000){ await new Promise(s=>setTimeout(s,500)); rz=await get('/readyz'); }
  if (rz!==200) throw new Error('readyz not 200 after wait');
  const st = await get('/api/status'); if (st!==200) throw new Error('/api/status != 200');
  const fv = await get('/favicon.ico'); if (![200,204,304].includes(fv)) throw new Error('/favicon.ico not served');
  console.log('selftest OK');
})().catch(e=>{ console.error('selftest failed:', e.message); process.exit(1); });
