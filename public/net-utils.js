// public/net-utils.js - 안전한 네트워크 호출 유틸
export async function safeFetchJson(url, opt = {}, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opt, signal: ctrl.signal, cache: 'no-store' });
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      if (!res.ok || json?.ok === false) throw new Error(json?.error || `http ${res.status}`);
      return json;
    } catch {
      throw new Error(`non-json ${res.status}: ${text.slice(0,180)}`);
    }
  } finally {
    clearTimeout(t);
  }
}

export async function safeFetchImage(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`http ${res.status}`);
    return URL.createObjectURL(await res.blob());
  } finally {
    clearTimeout(t);
  }
}

// 전역으로 노출 (기존 코드와 호환)
if (typeof window !== 'undefined') {
  window.safeFetchJson = safeFetchJson;
  window.safeFetchImage = safeFetchImage;
}
