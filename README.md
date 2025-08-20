# MeArt - AI 감정 아트 생성기 🎨

사진을 업로드하면 AI가 자동으로 **배경 제거**, **감정 분석**, **브러시 효과** 적용을 통해 명화 스타일의 예술 작품으로 변환해주는 고급 웹 애플리케이션입니다.

## ✨ 주요 기능

### 🎯 **완전 자동화된 AI 파이프라인**
1. **스마트 배경 제거**: U2Net + REMBG 모델을 사용한 정밀 배경 제거
2. **실시간 감정 분석**: ONNX 기반 얼굴 감정 인식 (7가지 감정)
3. **명화 스타일 추천**: 감정에 맞는 64개의 유명 명화 배경 자동 추천
4. **Neural Style Transfer**: TensorFlow Hub 기반 브러시 효과 적용
5. **고품질 합성**: Sharp 라이브러리를 통한 프로페셔널 이미지 합성

### 📱 **사용자 경험**
- 🖱️ 직관적인 드래그 앤 드롭 업로드
- 👀 실시간 처리 상태 표시
- 📊 감정 분석 결과 시각화
- 💾 고품질 결과 다운로드
- 📱 모바일 최적화 지원

### 🛠️ **기술 스택**
- **Backend**: Node.js + Express.js
- **Frontend**: HTML5 + CSS3 + Vanilla JavaScript
- **AI/ML**: U2Net, ONNX Runtime, TensorFlow Hub, REMBG
- **Image Processing**: Python + OpenCV + Pillow + Sharp
- **Database**: Firebase (옵션)
- **Deployment**: Docker, Vercel, Railway, **Render 최적화**

## 🚀 빠른 시작

### 1. **환경 요구사항**
- Node.js 18.x 이상
- Python 3.8 이상
- 8GB RAM 이상 권장

### 2. **설치**

```bash
# 1. 저장소 클론
git clone https://github.com/your-username/meart.git
cd meart

# 2. Node.js 의존성 설치
npm install

# 3. Python 의존성 설치
pip install -r requirements.txt
```

### 3. **모델 파일 확인**
다음 파일들이 자동으로 다운로드됩니다:
- `models/emotion-ferplus-8.onnx`: 감정 분석 모델 (자동 다운로드)
- `TensorFlow Hub 모델`: Neural Style Transfer (자동 다운로드)
- `REMBG 모델`: 배경 제거 (자동 다운로드)

### 4. **서버 실행**

```bash
# 개발 환경
npm start
# 또는
node server.js

# 프로덕션 환경 (Docker)
docker build -t meart .
docker run -p 9000:9000 meart
```

### 5. **접속**
- 로컬: http://localhost:9000
- 헬스체크: http://localhost:9000/health



## 📖 사용법

### **Step 1**: 이미지 업로드 📤
- 🖱️ 드래그 앤 드롭으로 간편 업로드
- 📄 지원 형식: JPG, PNG, WEBP
- 📏 최대 크기: 50MB (자동 최적화)

### **Step 2**: AI 자동 처리 🤖
1. **배경 제거** → U2Net + REMBG로 정밀 분리
2. **감정 분석** → 얼굴에서 7가지 감정 인식  
3. **명화 추천** → 감정 맞춤 배경 자동 선택
4. **브러시 효과** → Neural Style Transfer로 예술적 변환
5. **최종 합성** → 고품질 4K 결과 생성

### **Step 3**: 작품 완성 🎨
- 💾 고해상도 PNG 다운로드
- 🔍 처리 단계별 미리보기
- 📊 감정 분석 상세 결과

## 🔌 API 문서

### **헬스체크**
```http
GET /health
```
서버 상태, 메모리 사용량, 서비스 연결 상태 확인

### **완전 자동 처리**
```http
POST /api/remove-bg
Content-Type: multipart/form-data

Body:
- image: 이미지 파일 (필수)
- backgroundPath: 배경 이미지 경로 (선택)
- emotion: 감정 강제 지정 (선택)
```

**응답 예시:**
```json
{
  "success": true,
  "preview": "data:image/png;base64,iVBOR...",
  "emotionAnalysis": {
    "emotion": "happiness",
    "confidence": 0.94,
    "top_emotions": [...]
  },
  "artworkRecommendations": [...],
  "metadata": {
    "processingTime": 8.5,
    "imageSize": "1200x800"
  }
}
```

### **브러시 효과 적용**
```http
POST /api/apply-brush-effect
Content-Type: application/json

Body:
{
  "nobgPath": "/uploads/image_nobg.png",
  "backgroundPath": "/BG_image/artwork.jpg",
  "emotion": "happiness"
}
```

## 📁 프로젝트 구조

```
MeArt/
├── 🌐 Frontend
│   └── public/
│       └── index.html              # 메인 웹 페이지
│
├── 🖼️ Assets
│   ├── BG_image/                   # 64개 명화 배경 (4K 고화질)
│   │   ├── green_wheat_fields_auvers_2013.122.1.jpg
│   │   ├── landscape_1969.14.1.jpg
│   │   └── ... (반 고흐, 모네, 피카소 등)
│   ├── uploads/                    # 임시 업로드 파일
│   └── models/
│       └── emotion-ferplus-8.onnx  # 감정 분석 모델
│
├── 🤖 AI Scripts
│   ├── emotion_analysis.py         # ONNX 감정 분석
│   ├── u2net_remove_bg.py         # REMBG 배경 제거
│   └── brush_effect.py            # Neural Style Transfer
│
├── 🚀 Backend
│   └── server.js                  # Express.js 메인 서버
│
├── 🐳 Deployment
│   ├── Dockerfile                 # 컨테이너 설정
│   ├── vercel.json               # Vercel 배포
│   ├── railway.toml              # Railway 배포
│   ├── render.yaml               # Render 배포
│   └── .dockerignore             # Docker 최적화
│
└── 📋 Configuration
    ├── package.json              # Node.js 의존성
    ├── requirements.txt          # Python 의존성
    ├── env.example              # 환경변수 템플릿
    └── .gitignore               # Git 제외 파일
```

## 🎭 AI 감정 분석 & 명화 매칭

### **지원 감정 (7가지)**
| 감정 | 설명 | 추천 명화 스타일 | 예시 작품 |
|------|------|-----------------|----------|
| 😊 **Happiness** | 기쁨, 즐거움 | 밝고 화려한 인상주의 | 르누아르, 모네 |
| 😢 **Sadness** | 슬픔, 우울 | 깊이 있는 표현주의 | 피카소 청색시대 |
| 😠 **Anger** | 분노, 격정 | 강렬하고 극적인 작품 | 고야, 들라크루아 |
| 😲 **Surprise** | 놀람, 경이 | 독특하고 신비로운 작품 | 달리, 마그리트 |
| 😨 **Fear** | 두려움, 불안 | 어둡고 신비로운 작품 | 뭉크, 고야 |
| 🤢 **Disgust** | 혐오, 거부 | 강렬한 대비의 작품 | 베이컨, 프랜시스 |
| 😐 **Neutral** | 중립, 평온 | 평화롭고 고전적인 작품 | 다 빈치, 베르메르 |

### **명화 컬렉션 (64개 작품)**
- 🎨 **고전주의**: 다 빈치, 미켈란젤로, 라파엘로
- 🌈 **인상주의**: 모네, 르누아르, 드가
- ⭐ **후기인상주의**: 반 고흐, 세잔, 고갱
- 🎭 **표현주의**: 뭉크, 칸딘스키, 키르히너
- 🔮 **초현실주의**: 달리, 마그리트, 미로

## ⚡ 성능 & 최적화

### **처리 속도 (최적화됨)**
- 🔍 **배경 제거**: 3-8초 (이미지 크기별)
- 🧠 **감정 분석**: 1-3초 (CPU 최적화)
- 🎨 **브러시 효과**: 5-15초 (Neural Style Transfer)
- 🖼️ **최종 합성**: 1-2초 (Sharp 가속)

### **자동 최적화 기능**
- 📱 **모바일 최적화**: 자동 해상도 조정
- 💾 **메모리 관리**: 스트리밍 처리로 메모리 절약
- 🚀 **캐싱 시스템**: 중복 요청 최적화
- 📊 **진행률 표시**: 실시간 처리 상태

## 🐳 호스팅 & 배포

### **지원 플랫폼**

| 플랫폼 | 설정파일 | 특징 | 추천용도 |
|--------|----------|------|---------|
| 🟦 **Vercel** | `vercel.json` | 서버리스, 무료 | 개발/테스트 |
| 🟪 **Railway** | `railway.toml` | 컨테이너, 간편 | 프로덕션 |
| 🟨 **Render** | `render.yaml` | 자동배포, 안정 | 상용서비스 |
| 🐳 **Docker** | `Dockerfile` | 어디서나 | 온프레미스 |

### **환경변수 설정**
```bash
# env.example 파일 참고
PORT=9000
NODE_ENV=production
JWT_SECRET=your-secret-key
```

### **원클릭 배포**

#### 🟨 **Render 배포 (추천)**
1. **GitHub 연동**:
   ```bash
   git push origin main
   ```

2. **Render 대시보드**:
   - Repository 연결
   - `render.yaml` 자동 감지
   - 환경변수 설정

3. **필수 환경변수**:
   ```bash
   NODE_ENV=production
   PYTHON_PATH=python3
   JWT_SECRET=your-secret-key
   ```

#### 기타 플랫폼
```bash
# Vercel
vercel --prod

# Railway  
railway up

# Docker
docker compose up -d
```

## 🛠️ 문제 해결

### **일반적인 문제**

| 문제 | 원인 | 해결방법 |
|------|------|---------|
| 🚫 배경 제거 실패 | 불분명한 전경 | 명확한 인물 사진 사용 |
| 😕 감정 분석 실패 | 얼굴 미검출 | 정면 얼굴, 충분한 조명 |
| 🐍 Python 오류 | 의존성 부족 | `pip install -r requirements.txt` |
| 💾 메모리 부족 | 대용량 이미지 | 이미지 크기 제한 (5MB) |
| 🔥 서버 크래시 | 동시 요청 과다 | 요청 제한 설정 확인 |

### **디버깅**
```bash
# 헬스체크
curl http://localhost:9000/health

# 로그 모니터링  
tail -f server.log

# Python 환경 확인
python --version
pip list | grep tensorflow
```

## 📊 시스템 요구사항

### **최소 사양**
- CPU: 2코어 2GHz
- RAM: 4GB
- 저장공간: 2GB
- 네트워크: 100Mbps

### **권장 사양**
- CPU: 4코어 3GHz+ (AVX 지원)
- RAM: 8GB+
- 저장공간: 10GB SSD
- 네트워크: 1Gbps

## 🤝 기여하기

1. 🍴 **Fork** 이 저장소
2. 🌿 **브랜치 생성**: `git checkout -b feature/amazing-feature`
3. 📝 **커밋**: `git commit -m 'Add amazing feature'`
4. 🚀 **푸시**: `git push origin feature/amazing-feature`
5. 📋 **Pull Request** 생성

### **코딩 스타일**
- ESLint + Prettier 사용
- 함수/변수명은 한국어 주석 포함
- 커밋 메시지: 한국어 OK

## 📄 라이선스

MIT License - 자유롭게 사용, 수정, 배포 가능

## 💬 지원 & 커뮤니티

- 🐛 **버그 리포트**: [Issues](https://github.com/your-username/meart/issues)
- 💡 **기능 제안**: [Discussions](https://github.com/your-username/meart/discussions)
- 📧 **문의**: your-email@example.com

---

### 🌟 **이 프로젝트가 마음에 드시나요?**
⭐ **Star**를 눌러주시면 큰 힘이 됩니다! 