#!/usr/bin/env node

const http = require('http');
const https = require('https');
const { URL } = require('url');

const READY_URL = process.env.READY_URL || 'http://localhost:9000/readyz';
const TIMEOUT = Number(process.env.READY_TIMEOUT_MS || 30000);
const INTERVAL = Number(process.env.READY_POLL_MS || 500);

const deadline = Date.now() + TIMEOUT;
const u = new URL(READY_URL);
const agent = u.protocol === 'https:' ? https : http;

console.log(`🔄 서버 준비 상태 확인 중... (${READY_URL})`);
console.log(`⏱️ 최대 대기 시간: ${TIMEOUT}ms`);
console.log(`📊 폴링 간격: ${INTERVAL}ms`);

function once() {
    return new Promise(resolve => {
        const req = agent.get(
            { 
                hostname: u.hostname, 
                port: u.port, 
                path: `${u.pathname}?t=${Date.now()}`, 
                protocol: u.protocol, 
                timeout: 2000 
            },
            res => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        resolve(res.statusCode === 200 && response.ready === true);
                    } catch (error) {
                        resolve(false);
                    }
                });
            }
        );
        req.on('error', () => resolve(false));
        req.setTimeout(2000, () => { 
            req.destroy(); 
            resolve(false); 
        });
    });
}

(async () => {
    let attempt = 0;
    while (Date.now() < deadline) {
        attempt++;
        const elapsed = Date.now() - (deadline - TIMEOUT);
        
        console.log(`⏳ 서버 준비 대기 중... (${attempt}회, ${elapsed}ms 경과)`);
        
        if (await once()) {
            console.log('✅ 서버가 준비되었습니다!');
            process.exit(0);
        }
        
        await new Promise(r => setTimeout(r, INTERVAL));
    }
    
    console.error(`❌ 서버 준비 대기 시간 초과: ${READY_URL}`);
    process.exit(1);
})();
