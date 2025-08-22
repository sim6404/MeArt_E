#!/usr/bin/env node

import { execSync } from 'node:child_process';
import http from 'node:http';

function get(path) {
    return new Promise((resolve) => {
        http.get('http://localhost:9000' + path, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve({ code: res.statusCode, body: data }));
        }).on('error', () => resolve({ code: 0, body: '' }));
    });
}

(async () => {
    try {
        console.log('🧪 Ready-Gated Server 셀프 테스트 시작...\n');
        
        // 1. Health Check 테스트
        console.log('1️⃣ Health Check 테스트...');
        const health = await get('/health');
        if (health.code !== 200) throw new Error('/health != 200');
        console.log('✅ Health Check 통과');
        
        // 2. Readiness Check (초기 상태) 테스트
        console.log('2️⃣ Readiness Check (초기 상태) 테스트...');
        const ready1 = await get('/readyz');
        if (![200, 503].includes(ready1.code)) throw new Error('/readyz unexpected status');
        console.log('✅ Readiness Check (초기 상태) 통과:', ready1.code);
        
        // 3. API Call (준비 전) 테스트
        console.log('3️⃣ API Call (준비 전) 테스트...');
        const api1 = await get('/api/hello');
        if (ready1.code === 503 && api1.code !== 503) throw new Error('/api/hello not blocked before ready');
        console.log('✅ API Call (준비 전) 통과:', api1.code);
        
        // 4. 서버 준비 대기
        console.log('4️⃣ 서버 준비 대기...');
        try {
            execSync('node scripts/wait-ready.js', { stdio: 'inherit' });
            console.log('✅ 서버 준비 대기 완료');
        } catch (error) {
            console.log('⚠️ 서버 준비 대기 실패 (정상일 수 있음)');
        }
        
        // 5. Readiness Check (준비 후) 테스트
        console.log('5️⃣ Readiness Check (준비 후) 테스트...');
        const ready2 = await get('/readyz');
        if (ready2.code !== 200) throw new Error('/readyz not 200 after wait');
        console.log('✅ Readiness Check (준비 후) 통과');
        
        // 6. API Call (준비 후) 테스트
        console.log('6️⃣ API Call (준비 후) 테스트...');
        const api2 = await get('/api/hello');
        if (api2.code !== 200) throw new Error('/api/hello blocked after ready');
        console.log('✅ API Call (준비 후) 통과');
        
        console.log('\n🎉 모든 테스트 통과!');
        console.log('✅ Ready-Gated Server가 정상적으로 작동합니다.');
        
    } catch (error) {
        console.error('\n❌ 셀프 테스트 실패:', error.message);
        process.exit(1);
    }
})();
