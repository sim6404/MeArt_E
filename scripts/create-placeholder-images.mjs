import fs from 'node:fs';
import path from 'node:path';

// 실제 사용 가능한 배경 이미지 (더 큰 크기의 색상 이미지)
const createColorImage = (width, height, color) => {
  // 간단한 색상 이미지 생성 (PNG 형식)
  const canvas = Buffer.alloc(width * height * 3);
  for (let i = 0; i < canvas.length; i += 3) {
    canvas[i] = color.r;     // Red
    canvas[i + 1] = color.g; // Green
    canvas[i + 2] = color.b; // Blue
  }
  
  // 간단한 PNG 헤더 생성
  const pngHeader = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, // IHDR chunk length
    0x49, 0x48, 0x44, 0x52, // IHDR
    0x00, 0x00, 0x00, 0x80, // width (128)
    0x00, 0x00, 0x00, 0x80, // height (128)
    0x08, 0x02, 0x00, 0x00, 0x00 // bit depth, color type, compression, filter, interlace
  ]);
  
  return Buffer.concat([pngHeader, canvas]);
};

// 각 명화별 색상 정의
const artworkColors = {
  'seascape_at_port-en-bessin_normandy_1972.9.21.jpg': { r: 100, g: 150, b: 200 }, // 바다색
  'hampton_court_green_1970.17.53.jpg': { r: 50, g: 150, b: 50 },   // 초록색
  'the_harbor_at_lorient_1970.17.48.jpg': { r: 150, g: 100, b: 50 }, // 항구색
  'farmhouse_in_provence_1970.17.34.jpg': { r: 200, g: 150, b: 100 } // 농가색
};

const bgImageDir = 'public/BG_image';

// 디렉토리가 없으면 생성
if (!fs.existsSync(bgImageDir)) {
  fs.mkdirSync(bgImageDir, { recursive: true });
  console.log(`Created directory: ${bgImageDir}`);
}

// 각 이미지 파일 생성
for (const [imageName, color] of Object.entries(artworkColors)) {
  const filePath = path.join(bgImageDir, imageName);
  
  // 실제 색상 이미지 생성
  const imageData = createColorImage(128, 128, color);
  fs.writeFileSync(filePath, imageData);
  console.log(`Created background image: ${imageName} (${color.r},${color.g},${color.b})`);
}

// _index.json 파일 생성
const indexData = {
  "artworks": Object.keys(artworkColors).map(filename => ({
    "id": filename.replace('.jpg', ''),
    "title": filename.replace('.jpg', '').replace(/_/g, ' '),
    "artist": "Generated",
    "image": `/BG_image/${filename}`,
    "path": `/BG_image/${filename}`
  }))
};

fs.writeFileSync(path.join(bgImageDir, '_index.json'), JSON.stringify(indexData, null, 2));
console.log('Created _index.json');

console.log('Background images created successfully!');
