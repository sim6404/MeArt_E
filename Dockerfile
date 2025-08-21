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

# package.json 및 package-lock.json 복사
COPY package*.json ./

# Node.js 의존성 설치 (lock 파일 충돌 방지)
RUN npm install --omit=dev --no-audit --no-fund

# 앱 소스 복사
COPY . .

# uploads 디렉토리 생성 및 권한 설정
RUN mkdir -p uploads && chmod 755 uploads

# 포트 노출
EXPOSE 9000

# 헬스체크 추가
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:9000/health || exit 1

# 앱 실행
CMD ["node", "server.js"]