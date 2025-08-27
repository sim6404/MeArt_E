// Railway 최적화된 API 헬퍼 함수들
function apiBase() {
  const envBase =
    window.__API_BASE_URL__ ||
    (window.env && (window.env.API_BASE_URL || window.env.VITE_API_URL)) ||
    '';
  // 기본은 동일 출처
  return (envBase || window.location.origin).replace(/\/$/, '');
}

async function waitForReady({ maxWaitMs = 60000, baseDelay = 300 } = {}) {
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

async function callRemoveBg({ file, imageBase64 }) {
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

async function callAnalyzeEmotion({ file, imageBase64 }) {
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

async function callComposite({ fgBase64, fgUrl, bgKey, bgUrl, mode='contain', out='png' }) {
  const url = `${apiBase()}/api/composite`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type':'application/json', 'accept':'application/json' },
    body: JSON.stringify({ fgBase64, fgUrl, bgKey, bgUrl, mode, out })
  });
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    if (!res.ok || json?.ok === false) throw new Error(json?.error || `composite_failed_${res.status}`);
    
    // 새로운 API 응답 형식에 맞춰 클라이언트에서 합성 처리
    if (json.fgImage && json.bgImage) {
      // 클라이언트에서 CSS로 합성
      const compositeImage = await createClientComposite(json.fgImage, json.bgImage, json.mode, json.opacity);
      return {
        ...json,
        compositeBase64: compositeImage
      };
    }
    
    return json;
  } catch {
    throw new Error(`composite non-JSON (${res.status}): ${text.slice(0,180)}`);
  }
}

// 클라이언트에서 CSS로 이미지 합성
async function createClientComposite(fgImage, bgImage, mode = 'contain', opacity = 1.0) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 1024;
    canvas.height = 1024;
    
    const bgImg = new Image();
    const fgImg = new Image();
    
    bgImg.onload = () => {
      // 배경 그리기
      ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
      
      fgImg.onload = () => {
        // 전경 그리기 (중앙 정렬)
        const scale = mode === 'cover' ? 
          Math.max(canvas.width / fgImg.width, canvas.height / fgImg.height) :
          Math.min(canvas.width / fgImg.width, canvas.height / fgImg.height);
        
        const fgWidth = fgImg.width * scale;
        const fgHeight = fgImg.height * scale;
        const x = (canvas.width - fgWidth) / 2;
        const y = (canvas.height - fgHeight) / 2;
        
        ctx.globalAlpha = opacity;
        ctx.drawImage(fgImg, x, y, fgWidth, fgHeight);
        
        // Base64로 변환
        const dataUrl = canvas.toDataURL('image/png');
        resolve(dataUrl);
      };
      
      fgImg.onerror = () => {
        // 전경 로드 실패 시 배경만 반환
        const dataUrl = canvas.toDataURL('image/png');
        resolve(dataUrl);
      };
      
      fgImg.src = fgImage;
    };
    
    bgImg.onerror = () => {
      // 배경 로드 실패 시 기본 흰색 배경
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      fgImg.onload = () => {
        const scale = Math.min(canvas.width / fgImg.width, canvas.height / fgImg.height);
        const fgWidth = fgImg.width * scale;
        const fgHeight = fgImg.height * scale;
        const x = (canvas.width - fgWidth) / 2;
        const y = (canvas.height - fgHeight) / 2;
        
        ctx.globalAlpha = opacity;
        ctx.drawImage(fgImg, x, y, fgWidth, fgHeight);
        
        const dataUrl = canvas.toDataURL('image/png');
        resolve(dataUrl);
      };
      
      fgImg.onerror = () => {
        const dataUrl = canvas.toDataURL('image/png');
        resolve(dataUrl);
      };
      
      fgImg.src = fgImage;
    };
    
    bgImg.src = bgImage;
  });
}

// 전역으로 노출 (기존 코드와 호환)
if (typeof window !== 'undefined') {
  window.apiBase = apiBase;
  window.waitForReady = waitForReady;
  window.callRemoveBg = callRemoveBg;
  window.callAnalyzeEmotion = callAnalyzeEmotion;
  window.callComposite = callComposite;
  
  // 디버깅을 위한 전역 함수들
  console.log('🔧 API 함수들이 전역에 노출되었습니다:', {
    apiBase: typeof window.apiBase,
    waitForReady: typeof window.waitForReady,
    callRemoveBg: typeof window.callRemoveBg,
    callAnalyzeEmotion: typeof window.callAnalyzeEmotion,
    callComposite: typeof window.callComposite
  });
}
