# Ready-Gated Server

Node/Express 기반의 서버 준비 상태 관리 시스템입니다. 서버가 완전히 초기화되기 전에는 503으로 차단하고, 준비 완료 후에만 정상 트래픽을 허용합니다.

## 🚀 기능

- **Health Check**: `/healthz` - 프로세스 살아있음 확인
- **Readiness Check**: `/readyz` - 서버 준비 상태 확인
- **Readiness Gate**: 모든 API 요청에 대해 준비 상태 검증
- **Graceful Shutdown**: SIGINT/SIGTERM 시 안전한 종료
- **Wait Script**: 서버 준비 대기 스크립트

## 📦 설치

```bash
npm install
```

## 🏃‍♂️ 실행

### 기본 실행
```bash
npm start
# 또는
npm run dev
```

### 서버 준비 대기와 함께 실행
```bash
npm run start:with-wait
```

### 서버 준비 상태만 확인
```bash
npm run wait:ready
```

### Docker 실행
```bash
npm run docker:build
npm run docker:run
```

### 브라우저에서 테스트
서버 실행 후 브라우저에서 `http://localhost:3000` 접속

## 🔧 환경변수

### 서버 설정
- `PORT`: 서버 포트 (기본값: 3000)
- `BOOT_DELAY_MS`: 초기화 지연 시간 (기본값: 1500ms)
- `DB_TYPE`: 데이터베이스 타입 (mongodb, postgres, mock)

### 대기 스크립트 설정
- `READY_URL`: 준비 상태 확인 URL (기본값: http://localhost:3000/readyz)
- `READY_TIMEOUT_MS`: 최대 대기 시간 (기본값: 30000ms)
- `READY_POLL_MS`: 폴링 간격 (기본값: 500ms)

### 데이터베이스 설정 (실제 DB 사용 시)
- `MONGODB_URI`: MongoDB 연결 문자열
- `DATABASE_URL`: PostgreSQL 연결 문자열

## 📡 API 엔드포인트

### Health Check
```bash
GET /healthz
```
**응답:**
```json
{
  "ok": true,
  "ts": 1640995200000
}
```

### Readiness Check
```bash
GET /readyz
```
**준비 완료 시:**
```json
{
  "ready": true,
  "ts": 1640995200000
}
```
**준비 중일 때:**
```json
{
  "ready": false,
  "ts": 1640995200000
}
```

### 예시 API
```bash
GET /api/hello
```
**준비 완료 후:**
```json
{
  "message": "Hello after ready!"
}
```
**준비 중일 때:**
```json
{
  "error": "server not ready"
}
```

## 🔄 동작 흐름

1. **서버 시작**: Express 서버 시작, 소켓 열림
2. **초기화 시작**: `init()` 함수 실행
3. **DB 연결**: Mock DB 연결 (1.5초)
4. **워밍업**: 서버 워밍업 (0.3초)
5. **준비 완료**: `isReady = true` 설정
6. **정상 트래픽**: API 요청 허용

## 🛡️ Readiness Gate

다음 경로는 준비 상태와 관계없이 접근 가능:
- `/healthz`
- `/readyz`
- `/favicon.ico`
- `/static/*`

나머지 모든 경로는 서버가 준비된 후에만 접근 가능합니다.

## 📊 로그

### 서버 시작 시
```
🌐 서버가 http://localhost:3000 에서 실행 중입니다
📊 서버 소켓은 열렸지만 아직 isReady=false -> gate가 503을 유지
🚀 서버 초기화 시작...
🔄 Mock DB 연결 중... (1500ms)
✅ Mock DB 연결 완료
🔄 서버 워밍업 중...
✅ 서버 워밍업 완료
SERVER_READY
```

### Wait Script 실행 시
```
🔄 서버 준비 상태 확인 중... (http://localhost:3000/readyz)
⏱️ 최대 대기 시간: 60초
⏳ 서버 준비 대기 중... (1/30)
📊 상태: 503, 응답: {"ready":false,"ts":1640995200000}
✅ 서버가 준비되었습니다!
📊 응답: {"ready":true,"ts":1640995200000}
```

## 🚨 오류 처리

- **초기화 실패**: `INIT_FAILED` 로그 후 프로세스 종료 (코드 1)
- **준비 대기 시간 초과**: 60초 후 스크립트 종료 (코드 1)
- **연결 오류**: 재시도 후 최대 횟수 초과 시 종료

## 🔧 커스터마이징

### 실제 DB 연결
`mockConnectDB()` 함수를 실제 DB 연결 코드로 교체:

```javascript
async function connectDB() {
  // 실제 DB 연결 코드
  await mongoose.connect(process.env.MONGODB_URI);
}
```

### 추가 초기화 단계
`init()` 함수에 추가 단계 추가:

```javascript
async function init() {
  try {
    await connectDB();
    await loadCache();
    await validateConfig();
    await warmup();
    isReady = true;
    console.log('SERVER_READY');
  } catch (err) {
    console.error('INIT_FAILED', err);
    process.exit(1);
  }
}
```

## �� 라이선스

MIT License
