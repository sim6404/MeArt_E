# Node.js 18 LTS 이미지 사용
FROM node:18-alpine

# 시스템 패키지 업데이트 및 Python 설치
RUN apk add --no-cache \
    python3 \
    py3-pip \
    python3-dev \
    build-base \
    linux-headers \
    libffi-dev \
    jpeg-dev \
    zlib-dev

# Python 의존성 설치 (requirements.txt 기반)
COPY requirements.txt .
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

# 작업 디렉토리 설정
WORKDIR /app

# package.json 및 package-lock.json 복사
COPY package*.json ./

# Node.js 의존성 설치
RUN npm ci --only=production

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