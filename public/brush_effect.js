// brush_effect.js
// 유화풍 붓터치 효과: 알파 채널 기반 엄격한 전경 감지, 배경 완전 제외
// 사용법: brushEffect(canvas, {strokeCount, minSize, maxSize, alphaThreshold, strokeStrength, directionMode, colorJitter})

// 브러쉬 효과를 알파 PNG(전경)에만 적용하는 함수
function brushEffectOnAlphaForeground(foregroundImg, options = {}) {
    // foregroundImg: 알파 PNG 이미지 객체 (Image 또는 HTMLCanvasElement)
    // options: strokeCount, minSize, maxSize, ...
    const {
        strokeCount = 1000,
        minSize = 3,
        maxSize = 8,
        alphaThreshold = 250,
        strokeStrength = 1.5,
        colorJitter = 0.25
    } = options;

    // 1. 알파 PNG를 별도의 캔버스에 그리기
    const w = foregroundImg.width;
    const h = foregroundImg.height;
    const fgCanvas = document.createElement('canvas');
    fgCanvas.width = w;
    fgCanvas.height = h;
    const fgCtx = fgCanvas.getContext('2d', { willReadFrequently: true });
    fgCtx.drawImage(foregroundImg, 0, 0);

    // 2. 픽셀 데이터 추출
    const src = fgCtx.getImageData(0, 0, w, h);
    const data = src.data;

    // 3. 전경 마스크 생성 (알파 250 이상만)
    let foregroundPixels = [];
    let foregroundMask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
        if (data[i * 4 + 3] >= 250) {
            foregroundMask[i] = 1;
            foregroundPixels.push({ x: i % w, y: Math.floor(i / w) });
        }
    }
    if (foregroundPixels.length === 0) return fgCanvas; // 전경 없음

    // 4. 브러쉬 효과 적용 (전경에만)
    let appliedStrokes = 0;
    const maxAttempts = strokeCount * 2;
    let attempts = 0;
    while (appliedStrokes < strokeCount && attempts < maxAttempts) {
        attempts++;
        // 전경 픽셀 중 랜덤 선택
        const randomPixel = foregroundPixels[Math.floor(Math.random() * foregroundPixels.length)];
        const x = randomPixel.x;
        const y = randomPixel.y;
        // 브러쉬 크기/방향
        const size = minSize + Math.random() * (maxSize - minSize);
        const rad = size / 2;
        const aspect = 0.7 + Math.random() * 0.6;
        const angle = Math.random() * Math.PI * 2;
        // 타원 내 모든 픽셀 알파 250 이상인지 검사
        let isValidStroke = true;
        for (let dy = -rad; dy <= rad; dy++) {
            for (let dx = -rad; dx <= rad; dx++) {
                const a = rad, b = rad * aspect;
                if ((dx*dx)/(a*a) + (dy*dy)/(b*b) > 1) continue;
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                const idx = (ny * w + nx) * 4;
                if (data[idx + 3] < 250) {
                    isValidStroke = false;
                    break;
                }
            }
            if (!isValidStroke) break;
        }
        if (!isValidStroke) continue;
        // 색상 샘플링 (알파 250 이상만)
        let r = 0, g = 0, b = 0, a = 0, cnt = 0;
        for (let dy = -rad; dy <= rad; dy++) {
            for (let dx = -rad; dx <= rad; dx++) {
                const a_ = rad, b_ = rad * aspect;
                if ((dx*dx)/(a_*a_) + (dy*dy)/(b_*b_) > 1) continue;
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                const nidx = (ny * w + nx) * 4;
                if (data[nidx + 3] >= 250) {
                    r += data[nidx];
                    g += data[nidx + 1];
                    b += data[nidx + 2];
                    a += data[nidx + 3];
                    cnt++;
                }
            }
        }
        if (cnt === 0) continue;
        r = Math.round(r / cnt);
        g = Math.round(g / cnt);
        b = Math.round(b / cnt);
        a = Math.round(a / cnt);
        // 브러쉬 스트로크 그리기
        const strokeAlpha = 0.5 + Math.random() * 0.5;
        fgCtx.save();
        fgCtx.globalAlpha = strokeAlpha;
        fgCtx.translate(x, y);
        fgCtx.rotate(angle);
        fgCtx.beginPath();
        fgCtx.ellipse(0, 0, rad, rad * aspect, 0, 0, 2 * Math.PI);
        fgCtx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
        fgCtx.fill();
        fgCtx.restore();
        appliedStrokes++;
    }
    // 5. 결과 캔버스 반환 (이후 별도 합성 함수에서 배경과 합성)
    return fgCanvas;
}

// 사용 예시 (합성은 별도 함수에서):
// const brushedFgCanvas = brushEffectOnAlphaForeground(foregroundImg, options);
// compositeBackground(brushedFgCanvas, backgroundImg);

// RGB→HSL 변환
function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return [h, s, l];
}

// HSL→RGB 변환
function hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
} 