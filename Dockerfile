# 단일 스테이지 빌드로 단순화
FROM node:20-alpine

# 작업 디렉토리 설정
WORKDIR /app

# 시스템 패키지 설치 (최소한만)
RUN apk add --no-cache \
    curl \
    && rm -rf /var/cache/apk/*

# 환경변수 설정
ENV NODE_ENV=production
ENV PORT=10000

# package.json과 package-lock.json 복사
COPY package*.json ./

# 의존성 설치
RUN npm ci --only=production --no-audit --no-fund

# 앱 소스 복사
COPY . .

# uploads 디렉토리 생성
RUN mkdir -p uploads && chmod 755 uploads

# 포트 노출
EXPOSE 10000

# 헬스체크 (간단한 설정)
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:10000/healthz || exit 1

# 앱 실행
CMD ["node", "server.js"]