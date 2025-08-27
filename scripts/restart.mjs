import { spawn, execSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const PORT   = Number(process.env.PORT || 3000);
const START  = process.env.START  || 'npm run start';
const HEALTH = process.env.HEALTH || `http://localhost:${PORT}/healthz`;
const DEADLINE_MS = Number(process.env.TIMEOUT_MS || 60000);

function now(){ return new Date().toISOString().slice(11,19) }

function pidsByPortWin(port){
  try {
    const out = execSync(`powershell -NoProfile "Get-NetTCPConnection -LocalPort ${port} -State Listen | Select -Expand OwningProcess | Sort-Object -Unique"`, { stdio: ['ignore','pipe','ignore'] }).toString().trim();
    return out ? out.split(/\s+/).map(Number) : [];
  } catch {
    try {
      const out = execSync(`netstat -ano | findstr ":${port}" | findstr LISTENING`, { stdio: ['ignore','pipe','ignore'] }).toString();
      const pids = [...out.matchAll(/\s(\d+)\s*$/gm)].map(m=>Number(m[1]));
      return [...new Set(pids)];
    } catch {
      return [];
    }
  }
}

async function killByPort(port){
  const isWin = process.platform === 'win32';
  if (!isWin) {
    try { execSync(`fuser -k ${port}/tcp`); return; } catch {}
    try { execSync(`lsof -ti tcp:${port} | xargs kill -9`); return; } catch {}
    return;
  }
  const pids = pidsByPortWin(port);
  for (const pid of pids) {
    try { execSync(`powershell -NoProfile "Stop-Process -Id ${pid} -Force"`) } catch {}
    try { execSync(`taskkill /PID ${pid} /F`) } catch {}
  }
}

async function waitHealth(url, deadlineMs){
  const t0 = Date.now();
  while (Date.now()-t0 < deadlineMs) {
    try {
      const r = await fetch(url, { cache:'no-store', signal: AbortSignal.timeout(3000) });
      if (r.status === 200) return true;
    } catch {}
    await delay(300);
  }
  return false;
}

(async()=>{
  console.log(`[${now()}] kill old on :${PORT}`);
  await killByPort(PORT);
  console.log(`[${now()}] start: ${START}`);
  const child = spawn(START, { shell:true, stdio:'inherit' });
  const ok = await waitHealth(HEALTH, DEADLINE_MS);
  if (!ok) { console.error(`[${now()}] health check failed: ${HEALTH}`); process.exit(3); }
  console.log(`[${now()}] restarted OK`);
})();
