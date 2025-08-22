#!/usr/bin/env node

const http = require('http');
const url = require('url');

// 환경변수 설정
const READY_URL = process.env.READY_URL || 'http://localhost:3000/readyz';
const READY_TIMEOUT_MS = parseInt(process.env.READY_TIMEOUT_MS) || 30000;
const READY_POLL_MS = parseInt(process.env.READY_POLL_MS) || 500;

// URL 파싱
const parsedUrl = url.parse(READY_URL);
const hostname = parsedUrl.hostname;
const port = parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80);
const path = parsedUrl.path;

console.log(`🔄 서버 준비 상태 확인 중... (${READY_URL})`);
console.log(`⏱️ 최대 대기 시간: ${READY_TIMEOUT_MS}ms`);
console.log(`📊 폴링 간격: ${READY_POLL_MS}ms`);

let startTime = Date.now();
let pollCount = 0;

function checkReady() {
  pollCount++;
  const elapsed = Date.now() - startTime;
  
  // 타임아웃 체크
  if (elapsed >= READY_TIMEOUT_MS) {
    console.error(`❌ 서버 준비 대기 시간 초과 (${elapsed}ms >= ${READY_TIMEOUT_MS}ms)`);
    process.exit(1);
  }

  const options = {
    hostname: hostname,
    port: port,
    path: path,
    method: 'GET',
    timeout: Math.min(5000, READY_POLL_MS)
  };

  const req = http.request(options, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      try {
        const response = JSON.parse(data);
        
        if (res.statusCode === 200 && response.ready === true) {
          console.log(`✅ 서버가 준비되었습니다! (${elapsed}ms, ${pollCount}회 시도)`);
          console.log(`📊 응답: ${JSON.stringify(response)}`);
          process.exit(0);
        } else {
          console.log(`⏳ 서버 준비 대기 중... (${pollCount}회, ${elapsed}ms 경과)`);
          console.log(`📊 상태: ${res.statusCode}, 응답: ${JSON.stringify(response)}`);
          
          // 다음 폴링 예약
          setTimeout(checkReady, READY_POLL_MS);
        }
      } catch (error) {
        console.error('❌ 응답 파싱 오류:', error);
        process.exit(1);
      }
    });
  });

  req.on('error', (error) => {
    console.log(`⏳ 서버 연결 대기 중... (${pollCount}회, ${elapsed}ms 경과)`);
    console.log(`📊 오류: ${error.message}`);
    
    // 다음 폴링 예약
    setTimeout(checkReady, READY_POLL_MS);
  });

  req.on('timeout', () => {
    console.log(`⏳ 서버 응답 대기 중... (${pollCount}회, ${elapsed}ms 경과)`);
    req.destroy();
    
    // 다음 폴링 예약
    setTimeout(checkReady, READY_POLL_MS);
  });

  req.end();
}

// Start checking
checkReady();
