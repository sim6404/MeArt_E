// 테스트 스크립트 - 브라우저 콘솔에서 실행
(() => {
  console.log('🧪 MeArt 하드 언락 시스템 테스트 시작');
  
  // 1) SW/캐시 삭제 강제 실행
  console.log('1️⃣ SW/캐시 삭제 중...');
  (async () => {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
      console.log('✅ ServiceWorker 해제 완료');
    }
    if (window.caches) {
      const ks = await caches.keys();
      await Promise.all(ks.map(k => caches.delete(k)));
      console.log('✅ 캐시 삭제 완료');
    }
    console.log('🔄 페이지 강제 새로고침...');
    location.reload(true);
  })();
  
  // 2) 합성/브러시 상태 확인
  console.log('2️⃣ 현재 상태 확인:');
  console.log('- currentFile:', !!window.currentFile);
  console.log('- nobgBlob:', !!window.nobgBlob);
  console.log('- lastNobgPath:', !!window.lastNobgPath);
  console.log('- currentEmotion:', window.currentEmotion);
  
  // 3) 하드 언락 시스템 상태 확인
  console.log('3️⃣ 하드 언락 시스템 상태:');
  console.log('- __CONFIG__:', window.__CONFIG__);
  console.log('- __FETCH_GUARD__:', window.__FETCH_GUARD__);
  console.log('- commitPreviewAtomic:', typeof window.commitPreviewAtomic);
  console.log('- hardHideIntroShowMain:', typeof window.hardHideIntroShowMain);
  
  // 4) 문제 문구 검사
  console.log('4️⃣ 문제 문구 검사:');
  const blockers = document.querySelectorAll('body *');
  let found = false;
  blockers.forEach(el => {
    try {
      if (el.innerText && el.innerText.includes('먼저 배경이 제거된 이미지가 필요합니다')) {
        console.log('❌ 문제 문구 발견:', el);
        found = true;
      }
    } catch {}
  });
  if (!found) console.log('✅ 문제 문구 없음');
  
  // 5) 썸네일 렌더링 테스트
  console.log('5️⃣ 썸네일 렌더링 테스트:');
  const artworkGrid = document.querySelector('.artwork-grid');
  if (artworkGrid) {
    const items = artworkGrid.querySelectorAll('.artwork-item');
    console.log(`- 썸네일 개수: ${items.length}`);
    items.forEach((item, i) => {
      const img = item.querySelector('img');
      const bg = item.dataset.bg;
      console.log(`  ${i+1}. 이미지: ${img?.src}, 배경: ${bg}`);
    });
  } else {
    console.log('- 썸네일 그리드 없음');
  }
  
  console.log('🧪 테스트 완료!');
})();
