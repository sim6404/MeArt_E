import { execSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';

const ORIGIN = process.env.ORIGIN || 'http://localhost:3000';
const H = ORIGIN.startsWith('https') ? https : http;

function get(p) {
  return new Promise(r => H.get(ORIGIN + p + (p.includes('?') ? '&' : '?') + 't=' + Date.now(), res => {
    const chunks = [];
    res.on('data', c => chunks.push(c));
    res.on('end', () => {
      const buf = Buffer.concat(chunks);
      const hash = crypto.createHash('sha1').update(buf).digest('hex');
      r({ 
        code: res.statusCode, 
        hash, 
        len: buf.length, 
        headers: res.headers, 
        snippet: buf.toString('utf8', 0, 160) 
      });
    });
  }).on('error', e => r({ code: 0, err: String(e) })));
}

function pidByPort_win(port) {
  try {
    const out = execSync(`powershell -NoProfile "Get-NetTCPConnection -LocalPort ${port} -State Listen | Select -Expand OwningProcess | Sort-Object -Unique"`).toString().trim();
    return out ? out.split(/\s+/).map(Number) : [];
  } catch {
    try {
      const out = execSync(`cmd /c "netstat -abno | findstr :${port} | findstr LISTENING"`).toString();
      return [...out.matchAll(/\s(\d+)\s*$/gm)].map(m => Number(m[1]));
    } catch {
      return [];
    }
  }
}

function pidByPort_nix(port) {
  try {
    const out = execSync(`ss -lptnH 'sport = :${port}' || lsof -iTCP:${port} -sTCP:LISTEN -n -P`).toString();
    const pids = [...out.matchAll(/pid=(\d+)/g)].map(m => Number(m[1]));
    const pids2 = [...out.matchAll(/^\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+(\d+)\//gm)].map(m => Number(m[1]));
    return [...new Set([...pids, ...pids2])];
  } catch {
    return [];
  }
}

function procInfo(pid) {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`wmic process where (ProcessId=${pid}) get CommandLine,ExecutablePath /value`).toString();
      return out.replace(/\r?\n/g, ' ').trim();
    } else {
      const cmd = execSync(`ps -p ${pid} -o pid,ppid,etime,cmd --no-headers`).toString().trim();
      return cmd;
    }
  } catch {
    return 'n/a';
  }
}

(async () => {
  const urls = ['/', '/index.html', '/sw.js', '/__version', '/__routes', '/__whoami'];
  console.log('=== HTTP Fingerprints ===', ORIGIN);
  for (const u of urls) {
    const r = await get(u);
    console.log(u, '→', r.code, r.len, r.hash, (r.headers && r.headers['etag']) || '', (r.snippet || '').replace(/\s+/g, ' ').slice(0, 120));
  }

  console.log('\n=== Port 3000 Ownership ===');
  const pids = process.platform === 'win32' ? pidByPort_win(3000) : pidByPort_nix(3000);
  console.log('PIDs:', pids.join(', ') || 'none');
  for (const pid of pids) console.log('PID', pid, '→', procInfo(pid));

  console.log('\nHint: /__version.git 가 최신 커밋과 다르거나, /__routes 에 필요한 API가 없으면 "구서버/다른 앱"이 3000을 점유 중일 수 있습니다.');
})().catch(e => {
  console.error(e);
  process.exit(1);
});
