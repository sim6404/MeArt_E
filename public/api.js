// Railway 최적화된 API 헬퍼 함수들
export function apiBase() {
  const envBase =
    window.__API_BASE_URL__ ||
    (window.env && (window.env.API_BASE_URL || window.env.VITE_API_URL)) ||
    '';
  // 기본은 동일 출처
  return (envBase || window.location.origin).replace(/\/$/, '');
}

export async function waitForReady({ maxWaitMs = 60000, baseDelay = 300 } = {}) {
  const base = apiBase(); 
  const url = `${base}/readyz`;
  const start = Date.now(); 
  let attempt = 0;
  
  while (Date.now()-start < maxWaitMs) {
    try {
      const r = await fetch(`${url}?t=${Date.now()}`, { 
        cache: 'no-store', 
        credentials: 'include' 
      });
      if (r.status === 200) return true;
    } catch { 
      /* 502/네트워크 에러도 재시도 */ 
    }
    const d = Math.min(2500, baseDelay * 2 ** attempt++);
    await new Promise(r => setTimeout(r, d));
  }
  
  // 준비가 오래 걸려도 앱은 계속 진행(교착 방지)
  console.warn('waitForReady timeout — proceeding with degraded mode');
  return false;
}

export async function callRemoveBg({ file, imageBase64 }) {
  const url = `${apiBase()}/api/remove-bg`;
  let res;
  
  if (file) {
    const fd = new FormData(); 
    fd.append('image', file);
    res = await fetch(url, { method: 'POST', body: fd });
  } else {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept': 'application/json' },
      body: JSON.stringify({ imageBase64 })
    });
  }
  
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    if (!res.ok || json?.ok === false) throw new Error(json?.error || `remove-bg ${res.status}`);
    return json;
  } catch {
    throw new Error(`remove-bg non-JSON (${res.status}): ${text.slice(0,180)}`);
  }
}

export async function callAnalyzeEmotion({ file, imageBase64 }) {
  const url = `${apiBase()}/api/analyze-emotion`;
  let res;
  
  if (file) {
    const fd = new FormData(); 
    fd.append('image', file);
    res = await fetch(url, { method: 'POST', body: fd });
  } else {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept': 'application/json' },
      body: JSON.stringify({ imageBase64 })
    });
  }
  
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    if (!res.ok || json?.ok === false) throw new Error(json?.error || `analyze-emotion ${res.status}`);
    return json;
  } catch {
    throw new Error(`analyze-emotion non-JSON (${res.status}): ${text.slice(0,180)}`);
  }
}

// 전역으로 노출 (기존 코드와 호환)
if (typeof window !== 'undefined') {
  window.apiBase = apiBase;
  window.waitForReady = waitForReady;
  window.callRemoveBg = callRemoveBg;
  window.callAnalyzeEmotion = callAnalyzeEmotion;
}
