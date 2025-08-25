import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { platform } from 'node:os';

if (!existsSync('package.json')) { 
  console.error('No package.json'); 
  process.exit(1); 
}

try {
  // Windows 호환 삭제
  if (existsSync('node_modules')) {
    rmSync('node_modules', { recursive: true, force: true });
  }
  if (existsSync('package-lock.json')) {
    rmSync('package-lock.json', { force: true });
  }
  
  execSync('npm install --package-lock-only', { stdio: 'inherit' }); // lock만 생성
  execSync('npm ci', { stdio: 'inherit' }); // lock 일치 검증
  console.log('lock sync OK');
} catch (e) {
  console.error('lock sync failed:', e.message); 
  process.exit(1);
}
