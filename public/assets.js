// assets.js - BG_image 경로 헬퍼 함수
// 클라이언트에서 정확한 경로를 사용하도록 통일

/**
 * BG_image URL을 생성하는 헬퍼 함수
 * @param {string} name - 이미지 파일명 (표기용 이름도 가능)
 * @returns {string} 완전한 URL
 */
export function getBgImageUrl(name) {
  // 호출부에서 정확한 파일명 대신 "표기용 이름"을 써도 됨.
  // 서버의 관대한 리졸버가 매칭을 시도해줌.
  return `${location.origin}/BG_image/${encodeURIComponent(name)}`;
}

/**
 * BG_image URL을 상대 경로로 생성하는 헬퍼 함수
 * @param {string} name - 이미지 파일명
 * @returns {string} 상대 경로
 */
export function getBgImagePath(name) {
  return `/BG_image/${encodeURIComponent(name)}`;
}

/**
 * 사용 가능한 BG_image 목록 (서버의 _index.json과 동기화)
 */
export const BG_IMAGES = [
  'farmhouse_in_provence_1970.17.34.jpg',
  'the_harbor_at_lorient_1970.17.48.jpg',
  'hampton_court_green_1970.17.53.jpg',
  'seascape_at_port-en-bessin_normandy_1972.9.21.jpg'
];

/**
 * 랜덤 BG_image URL을 반환하는 헬퍼 함수
 * @returns {string} 랜덤 BG_image URL
 */
export function getRandomBgImageUrl() {
  const randomImage = BG_IMAGES[Math.floor(Math.random() * BG_IMAGES.length)];
  return getBgImageUrl(randomImage);
}

// 전역 함수로도 사용 가능하도록 window 객체에 추가
if (typeof window !== 'undefined') {
  window.getBgImageUrl = getBgImageUrl;
  window.getBgImagePath = getBgImagePath;
  window.getRandomBgImageUrl = getRandomBgImageUrl;
  window.BG_IMAGES = BG_IMAGES;
}
