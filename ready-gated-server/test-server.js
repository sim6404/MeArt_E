#!/usr/bin/env node

const http = require('http');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

console.log('🧪 Ready-Gated Server 테스트 시작...\n');

// Test 1: Health Check
function testHealthCheck() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      port: PORT,
      path: '/healthz',
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (res.statusCode === 200 && response.ok === true) {
            console.log('✅ Health Check 통과');
            resolve();
          } else {
            console.log('❌ Health Check 실패:', response);
            reject(new Error('Health check failed'));
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// Test 2: Readiness Check (초기 상태)
function testReadinessCheck() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      port: PORT,
      path: '/readyz',
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (res.statusCode === 503 && response.ready === false) {
            console.log('✅ Readiness Check (초기 상태) 통과');
            resolve();
          } else {
            console.log('❌ Readiness Check (초기 상태) 실패:', response);
            reject(new Error('Readiness check failed'));
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// Test 3: API Call (준비 전)
function testApiCallBeforeReady() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      port: PORT,
      path: '/api/hello',
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (res.statusCode === 503 && response.error === 'server not ready') {
            console.log('✅ API Call (준비 전) 통과');
            resolve();
          } else {
            console.log('❌ API Call (준비 전) 실패:', response);
            reject(new Error('API call before ready failed'));
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// Test 4: Wait for Ready
function waitForReady() {
  return new Promise((resolve, reject) => {
    let retryCount = 0;
    const maxRetries = 30;
    const retryInterval = 2000;

    function checkReady() {
      const options = {
        hostname: HOST,
        port: PORT,
        path: '/readyz',
        method: 'GET'
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (res.statusCode === 200 && response.ready === true) {
              console.log('✅ 서버 준비 완료');
              resolve();
            } else {
              retryCount++;
              if (retryCount >= maxRetries) {
                reject(new Error('Server ready timeout'));
              } else {
                setTimeout(checkReady, retryInterval);
              }
            }
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', reject);
      req.end();
    }

    checkReady();
  });
}

// Test 5: API Call (준비 후)
function testApiCallAfterReady() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      port: PORT,
      path: '/api/hello',
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (res.statusCode === 200 && response.message === 'Hello after ready!') {
            console.log('✅ API Call (준비 후) 통과');
            resolve();
          } else {
            console.log('❌ API Call (준비 후) 실패:', response);
            reject(new Error('API call after ready failed'));
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// Run all tests
async function runTests() {
  try {
    console.log('1️⃣ Health Check 테스트...');
    await testHealthCheck();

    console.log('2️⃣ Readiness Check (초기 상태) 테스트...');
    await testReadinessCheck();

    console.log('3️⃣ API Call (준비 전) 테스트...');
    await testApiCallBeforeReady();

    console.log('4️⃣ 서버 준비 대기...');
    await waitForReady();

    console.log('5️⃣ API Call (준비 후) 테스트...');
    await testApiCallAfterReady();

    console.log('\n🎉 모든 테스트 통과!');
  } catch (error) {
    console.error('\n❌ 테스트 실패:', error.message);
    process.exit(1);
  }
}

// Start tests
runTests();
