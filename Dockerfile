# ---- deps stage: lock 기반 설치 (필수) ----
FROM node:20-alpine AS deps
WORKDIR /app

# 시스템 패키지 설치 (기본 도구만)
RUN apk add --no-cache \
    build-base \
    libc6-compat \
    musl-dev \
    gcc \
    g++ \
    make \
    curl \
    && rm -rf /var/cache/apk/*

# package.json과 package-lock.json 복사
COPY package.json package-lock.json ./

# lock 파일 존재 확인 (단호하게)
RUN test -f package-lock.json

# npm ci로 의존성 설치 (bcrypt 호환성을 위한 추가 설정)
RUN npm ci --omit=dev --no-audit --no-fund --build-from-source

# ---- runner stage ----
FROM node:20-alpine AS runner
WORKDIR /app

# 시스템 패키지 설치 (런타임용)
RUN apk add --no-cache \
    libc6-compat \
    curl \
    && rm -rf /var/cache/apk/*

# 환경변수 설정
ENV NODE_ENV=production
ENV PORT=10000

# U2Net 모델 디렉토리 생성
RUN mkdir -p /tmp/u2net && chmod 755 /tmp/u2net

# 의존성 복사
COPY --from=deps /app/node_modules ./node_modules

# 앱 소스 복사
COPY . .

# uploads 디렉토리 생성 및 권한 설정
RUN mkdir -p uploads && chmod 755 uploads

# 포트 노출
EXPOSE 10000

# 헬스체크
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:10000/healthz || exit 1

# 앱 실행
CMD ["node", "server.js"]