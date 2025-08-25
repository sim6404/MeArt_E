import http from 'node:http';

const ORIGIN = process.env.ORIGIN || `http://localhost:${process.env.PORT||10000}`;
const get = p => new Promise(r => http.get(ORIGIN+p+`?t=${Date.now()}`, res => { res.resume(); r(res.statusCode); }).on('error', () => r(0)));

(async () => {
  const h = await get('/healthz'); if (h!==200) throw new Error('/healthz != 200');
  let s = await get('/readyz'); if (![200,503].includes(s)) throw new Error('/readyz unexpected '+s);
  const t0 = Date.now(); while (s!==200 && Date.now()-t0<30000) { await new Promise(z=>setTimeout(z,500)); s = await get('/readyz'); }
  if (s!==200) throw new Error('readyz not 200 after wait');
  const st = await get('/api/status'); if (st!==200) throw new Error('/api/status != 200');
  console.log('selftest OK');
})().catch(e => { console.error('selftest failed:', e.message); process.exit(1); });
