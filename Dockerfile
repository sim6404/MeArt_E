# ---- deps stage: lock 기반 설치 (필수) ----
FROM node:20-alpine AS deps
WORKDIR /app

# 시스템 패키지 설치 (Python 의존성 + Alpine Linux 호환성 + bcrypt 빌드 도구)
RUN apk add --no-cache \
    python3 \
    python3-dev \
    py3-pip \
    build-base \
    libc6-compat \
    musl-dev \
    linux-headers \
    gcc \
    g++ \
    make \
    && rm -rf /var/cache/apk/*

# package.json과 package-lock.json 복사
COPY package.json package-lock.json ./

# lock 파일 존재 확인 (단호하게)
RUN test -f package-lock.json

# npm ci로 의존성 설치 (bcrypt 호환성을 위한 추가 설정)
RUN npm ci --omit=dev --no-audit --no-fund --build-from-source

# Python 의존성 설치 (Alpine Linux 호환성 최적화)
COPY requirements.txt ./
# 가상환경 생성 및 활성화
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
# pip 업그레이드 (안정적인 버전 사용)
RUN pip install --upgrade pip==23.0.1 setuptools==67.7.2 wheel==0.40.0
# 패키지 설치 (단계별로 진행하여 오류 추적)
RUN pip install --no-cache-dir numpy==1.21.6
RUN pip install --no-cache-dir pillow==9.5.0
RUN pip install --no-cache-dir requests==2.28.2
RUN pip install --no-cache-dir onnxruntime==1.15.1
RUN pip install --no-cache-dir scikit-image==0.19.3
RUN pip install --no-cache-dir imageio==2.25.1
RUN pip install --no-cache-dir rembg==2.0.43

# ---- runner stage ----
FROM node:20-alpine AS runner
WORKDIR /app

# 시스템 패키지 설치 (런타임용)
RUN apk add --no-cache \
    python3 \
    libc6-compat \
    curl \
    && rm -rf /var/cache/apk/*

# 환경변수 설정
ENV NODE_ENV=production
ENV MODEL_DIR=/tmp/u2net

# U2Net 모델 디렉토리 생성
RUN mkdir -p /tmp/u2net && chmod 755 /tmp/u2net

# 의존성 복사
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# 앱 소스 복사
COPY . .

# uploads 디렉토리 생성 및 권한 설정
RUN mkdir -p uploads && chmod 755 uploads

# 포트 노출
EXPOSE 9000

# 헬스체크
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:9000/healthz || exit 1

# 앱 실행
CMD ["node", "server.js"]