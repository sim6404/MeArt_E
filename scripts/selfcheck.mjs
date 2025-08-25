#!/usr/bin/env node

import http from 'node:http';

const ORIGIN = process.env.ORIGIN || `http://localhost:${process.env.PORT||10000}`;
const get = p => new Promise(r => http.get(ORIGIN+p+'?t='+Date.now(), res => { 
  res.resume(); 
  r(res.statusCode); 
}).on('error', ()=>r(0)));

(async () => {
  const h = await get('/healthz'); 
  if (h !== 200) throw new Error('/healthz != 200');
  
  let ok = await get('/readyz'); 
  if (![200,503].includes(ok)) throw new Error('/readyz unexpected '+ok);
  
  const start = Date.now(); 
  while (ok !== 200 && Date.now()-start<30000) { 
    await new Promise(s=>setTimeout(s,500)); 
    ok = await get('/readyz'); 
  }
  
  if (ok !== 200) throw new Error('readyz not 200 after wait');
  console.log('selfcheck OK');
})().catch(e => { 
  console.error('selfcheck failed:', e.message); 
  process.exit(1); 
});
