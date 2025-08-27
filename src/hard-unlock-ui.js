// src/hard-unlock-ui.js
export function installUndefinedFetchGuardOnce() {
  if (window.__FETCH_GUARD__) return;
  window.__FETCH_GUARD__ = true;
  const _fetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = String(typeof input === 'string' ? input : (input?.url || ''));
    if (!url || url === 'undefined' || /\/undefined(\?|$)/.test(url)) {
      console.warn('[guard] blocked fetch →', url);
      return Promise.resolve(new Response(JSON.stringify({ ok:false, error:'blocked_undefined' }), {
        status: 400, headers: { 'content-type':'application/json' }
      }));
    }
    return _fetch(input, init);
  };
}

export function hardHideIntroShowMain() {
  // 인트로/오버레이 강제 비활성화
  const blockers = [
    '#intro-screen','.intro','.splash','.overlay',
    '[data-screen="intro"]','[aria-busy="true"]'
  ];
  for (const sel of blockers) {
    document.querySelectorAll(sel).forEach(el=>{
      el.style.display='none';
      el.style.opacity='0';
      el.style.pointerEvents='none';
      el.setAttribute('aria-hidden','true');
    });
  }
  // 메인 강제 표시
  const mains = ['#main-screen','[data-screen="main"]','#app','#root','main'];
  for (const sel of mains) {
    document.querySelectorAll(sel).forEach(el=>{
      el.style.removeProperty('display');
      el.style.visibility='visible';
      el.style.opacity='1';
      el.style.pointerEvents='auto';
      el.style.zIndex='2';
    });
  }
  // 문제 문구가 담긴 요소 제거/비활성
  const text = '먼저 배경이 제거된 이미지가 필요합니다';
  document.querySelectorAll('body *').forEach(el=>{
    try {
      if (el.innerText && el.innerText.includes(text)) {
        el.style.display='none';
        el.setAttribute('data-blocking-removed','true');
      }
    } catch {}
  });
}

export async function commitPreviewAtomic(src) {
  // data URL 또는 절대/상대 URL 모두 허용
  if (!src || src === 'undefined') {
    console.warn('[commit] empty src → skip commit'); 
    hardHideIntroShowMain();
    return false;
  }
  const targets = [
    '#preview-image','#resultImage','img[data-role="preview"]',
    '.preview img','.result img','img#preview','img.result'
  ];
  // decode 로드 경쟁 제거
  const img = new Image();
  img.decoding = 'async';
  img.loading = 'eager';
  img.src = src;
  if ('decode' in img) {
    try { await img.decode(); } catch {}
  }
  if (!img.complete || !img.naturalWidth) {
    await new Promise((res, rej)=>{
      img.addEventListener('load', ()=>res(), { once:true });
      img.addEventListener('error', ()=>rej(new Error('image_load_error')), { once:true });
    });
  }
  let applied = false;
  for (const sel of targets) {
    const el = document.querySelector(sel);
    if (el && el.tagName === 'IMG') {
      el.src = img.src;
      el.alt = 'preview';
      applied = true;
    }
  }
  // 대상이 없으면 마지막 수단으로 동적 추가
  if (!applied) {
    const host = document.querySelector('#main-screen') || document.body;
    const ctn = document.createElement('div');
    const im = document.createElement('img');
    im.id='preview-image';
    im.style.cssText='display:block;max-width:100%;height:auto;';
    im.alt='preview';
    im.src=img.src;
    ctn.appendChild(im);
    host.appendChild(ctn);
    applied = true;
  }
  // 화면 전환 강제
  hardHideIntroShowMain();
  // watchdog: 레이아웃 2프레임 확인
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const rect = (document.querySelector('#preview-image')||{}).getBoundingClientRect?.();
  if (rect && (rect.width===0 || rect.height===0)) {
    // display:none 등 남아있으면 다시 한 번 강제 표시
    hardHideIntroShowMain();
  }
  console.debug('✅ preview committed', { applied, w: img.naturalWidth, h: img.naturalHeight });
  return true;
}
