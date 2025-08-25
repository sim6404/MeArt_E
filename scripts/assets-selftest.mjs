import http from 'node:http';

const ORIGIN = process.env.ORIGIN || `http://localhost:${process.env.PORT||10000}`;

const targets = [
  '/BG_image/the_harbor_at_lorient_1970.17.48.jpg',
  '/BG_image/farmhouse_in_provence_1970.17.34.jpg',
  '/BG_image/seascape_at_port-en-bessin_normandy_1972.9.21.jpg',
  '/BG_image/hampton_court_green_1970.17.53.jpg',
];

function head(p) {
  return new Promise(r => 
    http.get(ORIGIN + p + '?t=' + Date.now(), res => {
      res.resume();
      r(res.statusCode);
    }).on('error', () => r(0))
  );
}

(async () => {
  console.log('🧪 Testing BG_image assets...');
  let fail = 0;
  
  for (const p of targets) {
    const code = await head(p);
    console.log(`${p} → ${code}`);
    if (code !== 200) fail++;
  }
  
  if (fail) { 
    console.error(`❌ Missing assets: ${fail}/${targets.length}`);
    process.exit(1); 
  }
  
  console.log('✅ All BG_image assets are accessible!');
})().catch(e => { 
  console.error('❌ Assets selftest failed:', e.message); 
  process.exit(1); 
});
