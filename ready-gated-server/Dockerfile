# Node 18 이상 기반
FROM node:18-alpine

# 작업 디렉토리 설정
WORKDIR /app

# package.json 및 package-lock.json 복사
COPY package*.json ./

# 의존성 설치
RUN npm ci --only=production

# 앱 소스 복사
COPY . .

# 포트 노출
EXPOSE 3000

# 헬스체크 추가
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/healthz', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# 앱 실행 (서버와 대기 스크립트 함께 실행)
CMD ["npm", "run", "start:with-wait"]
