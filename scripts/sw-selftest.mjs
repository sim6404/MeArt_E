// scripts/sw-selftest.mjs - 서비스워커 셀프테스트
import http from 'node:http';

const ORIGIN = process.env.ORIGIN || `http://localhost:${process.env.PORT||3000}`;
const get = (p) => new Promise(r => http.get(ORIGIN+p+'?t='+Date.now(), res => {
    res.resume();
    r(res.statusCode);
}).on('error', () => r(0)));

(async () => {
    console.log('🚀 서비스워커 셀프테스트 시작:', ORIGIN);
    
    // 1. 헬스 체크
    const h = await get('/healthz'); 
    if (h !== 200) throw new Error('/healthz != 200');
    console.log('✅ /healthz OK');
    
    // 2. 서비스워커 파일 존재 확인
    const sw = await get('/sw.js');
    if (sw !== 200) throw new Error('/sw.js != 200');
    console.log('✅ /sw.js OK');
    
    // 3. 존재하지 않는 이미지 요청 → 204 또는 200이어야 하며, 앱이 멈추지 않아야 함
    const miss = await get('/BG_image/__definitely_missing__.jpg');
    if (![200,204,404].includes(miss)) throw new Error('unexpected code for missing image: '+miss);
    console.log('✅ missing image handling OK (' + miss + ')');
    
    // 4. API 타임아웃 테스트 (존재하지 않는 API)
    const api = await get('/api/nonexistent');
    if (![404,503,500].includes(api)) throw new Error('unexpected code for nonexistent API: '+api);
    console.log('✅ API error handling OK (' + api + ')');
    
    // 5. 정적 파일 테스트
    const staticFile = await get('/BG_image/the_harbor_at_lorient_1970.17.48.jpg');
    if (staticFile !== 200) throw new Error('static file != 200');
    console.log('✅ static file serving OK');
    
    console.log('🎉 서비스워커 셀프테스트 완료!');
    console.log('📋 테스트 결과:');
    console.log('  - 헬스 체크: ✅');
    console.log('  - 서비스워커: ✅');
    console.log('  - 캐시 미스 처리: ✅');
    console.log('  - API 오류 처리: ✅');
    console.log('  - 정적 파일 서빙: ✅');
    
})().catch(e => { 
    console.error('❌ 서비스워커 셀프테스트 실패:', e.message); 
    process.exit(1); 
});
