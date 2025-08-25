import fs from 'node:fs';
import path from 'node:path';

// 1x1 픽셀 투명 PNG (base64)
const transparentPNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottQAAAABJRU5ErkJggg==', 'base64');

// 누락된 이미지 파일 목록
const missingImages = [
  'seascape_at_port-en-bessin_normandy_1972.9.21.jpg',
  'hampton_court_green_1970.17.53.jpg',
  'the_harbor_at_lorient_1970.17.48.jpg',
  'farmhouse_in_provence_1970.17.34.jpg'
];

const bgImageDir = 'public/BG_image';

// 디렉토리가 없으면 생성
if (!fs.existsSync(bgImageDir)) {
  fs.mkdirSync(bgImageDir, { recursive: true });
  console.log(`Created directory: ${bgImageDir}`);
}

// 각 이미지 파일 생성
for (const imageName of missingImages) {
  const filePath = path.join(bgImageDir, imageName);
  
  // 파일이 없으면 생성
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, transparentPNG);
    console.log(`Created placeholder: ${imageName}`);
  } else {
    console.log(`Already exists: ${imageName}`);
  }
}

console.log('Placeholder images created successfully!');
