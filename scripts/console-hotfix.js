// 즉시 확인용 콘솔 핫픽스 — 브라우저 DevTools 콘솔에 붙여 실행
(() => {
  // 1) undefined 요청 차단
  if (!window.__FETCH_GUARD__) {
    const _f = window.fetch.bind(window);
    window.__FETCH_GUARD__ = true;
    window.fetch = (i,o)=>{
      const u = String(typeof i==='string'? i : (i?.url||''));
      if (!u || u==='undefined' || /\/undefined(\?|$)/.test(u)) {
        console.warn('[guard] blocked', u);
        return Promise.resolve(new Response(JSON.stringify({ok:false,error:'blocked_undefined'}),{status:400,headers:{'content-type':'application/json'}}));
      }
      return _f(i,o);
    };
  }
  // 2) 하드 화면 전환
  const hide = s=>document.querySelectorAll(s).forEach(el=>{el.style.display='none';el.style.opacity='0';el.style.pointerEvents='none';el.setAttribute('aria-hidden','true');});
  hide('#intro-screen,.intro,.splash,.overlay,[data-screen="intro"]');
  const show = s=>document.querySelectorAll(s).forEach(el=>{el.style.removeProperty('display');el.style.visibility='visible';el.style.opacity='1';el.style.pointerEvents='auto';el.style.zIndex='2';});
  show('#main-screen,[data-screen="main"],#app,#root,main');
  // 3) 문제 문구 제거
  const text='먼저 배경이 제거된 이미지가 필요합니다';
  document.querySelectorAll('body *').forEach(el=>{try{ if(el.innerText?.includes(text)){ el.style.display='none'; el.setAttribute('data-blocking-removed','true'); }}catch{}});
  // 4) 합성 결과가 전역에 있다면 강제 커밋
  const r = window.__lastCompositeResult;
  const src = r?.compositeBase64 || r?.fgImage || r?.resultBase64 || window.__originalBase64;
  if (src) {
    const img = document.querySelector('#preview-image') || (()=>{ const i=document.createElement('img'); i.id='preview-image'; i.style='display:block;max-width:100%'; (document.querySelector('#main-screen')||document.body).appendChild(i); return i; })();
    img.src = src;
    console.log('✅ forced preview commit');
  }
})();
