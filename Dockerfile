# Ubuntu 기반으로 변경 (Alpine 대신 안정성 우선)
FROM node:18-bullseye-slim

# 시스템 패키지 업데이트 및 필수 도구 설치
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-dev \
    build-essential \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libgl1-mesa-glx \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 작업 디렉토리 설정
WORKDIR /app

# Python 의존성 먼저 설치 (캐싱 최적화)
COPY requirements.txt .
RUN pip3 install --no-cache-dir --upgrade pip
RUN pip3 install --no-cache-dir --root-user-action=ignore -r requirements.txt

# U2Net 모델 디렉토리 생성 및 환경변수 설정
RUN mkdir -p /tmp/u2net && chmod 755 /tmp/u2net
ENV MODEL_DIR=/tmp/u2net

# Python 스크립트 파일 복사 (모델 다운로드용)
COPY u2net_remove_bg.py ./

# U2Net 모델 다운로드 (선택적)
RUN python3 -c "import u2net_remove_bg; print('U2Net 모델 다운로드 완료')" 2>/dev/null || echo "모델 다운로드는 런타임에 수행됩니다"

# package.json 및 package-lock.json 복사
COPY package*.json ./

# Node.js 의존성 설치 (lock 파일 충돌 방지)
RUN npm ci --only=production

# 나머지 앱 소스 복사
COPY . .

# uploads 디렉토리 생성 및 권한 설정
RUN mkdir -p uploads && chmod 755 uploads

# 포트 노출
EXPOSE 9000

# 헬스체크 추가
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:9000/health || exit 1

# 앱 실행 (Ready-Gated Server 패턴)
CMD ["npm", "run", "start:with-wait"]