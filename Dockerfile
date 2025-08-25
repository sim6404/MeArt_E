# ---- deps ----
FROM node:20.19.4-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN test -f package-lock.json
RUN npm ci --omit=dev --no-audit --no-fund

# ---- runner ----
FROM node:20.19.4-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=10000

# 시스템 패키지 설치 (최소한만)
RUN apk add --no-cache \
    curl \
    && rm -rf /var/cache/apk/*

# 의존성 복사
COPY --from=deps /app/node_modules ./node_modules

# 앱 소스 복사
COPY . .

# uploads 디렉토리 생성
RUN mkdir -p uploads && chmod 755 uploads

# 포트 노출
EXPOSE 10000

# 헬스체크
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:10000/healthz || exit 1

# 앱 실행
CMD ["node", "server.js"]