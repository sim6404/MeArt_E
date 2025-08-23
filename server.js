const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const multer = require('multer');
const PQueue = require('p-queue').default;
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const FormData = require('form-data');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 10000); // Render 주입 PORT
const HOST = process.env.HOST || '0.0.0.0';
const MAX_BODY = process.env.MAX_BODY || '25mb'; // 업로드/바디 제한
const CONCURRENCY = Number(process.env.REMOVE_BG_CONCURRENCY || 1);
const JOB_TIMEOUT_MS = Number(process.env.REMOVE_BG_TIMEOUT_MS || 45000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const JWT_SECRET = process.env.JWT_SECRET || 'your-default-jwt-secret-change-in-production';
const PYTHON_PATH = process.env.PYTHON_PATH || (process.platform === 'win32' ? 'python' : 'python3');

const app = express();
app.set('trust proxy', true);
app.use(morgan('combined'));
app.use(cors({ origin: true, credentials: true }));
app.use(compression());
app.use(express.json({ limit: MAX_BODY }));
app.use(express.urlencoded({ extended: true, limit: MAX_BODY }));
app.use(express.static('public', { maxAge: 0, etag: false }));

// 멀터: 메모리 저장(필요시 디스크로 전환)
const upload = multer({ 
    storage: multer.memoryStorage(), 
    limits: { fileSize: 25 * 1024 * 1024 } 
});

// 레디니스 상태
let isReady = false;
let aiFeaturesReady = false;

// Firebase Admin 설정 (선택적)
let admin, db;
try {
    admin = require('./firebase-admin-config');
    if (admin === null) {
        console.log('⚠️ Firebase Admin이 비활성화됨 - 기본 기능만 사용');
        admin = null;
        db = null;
    } else {
        db = admin.firestore();
        console.log('✅ Firebase Admin 초기화 성공');
    }
} catch (error) {
    console.log('❌ Firebase Admin 초기화 실패, 기본 기능만 사용:', error.message);
    admin = null;
    db = null;
}

// 사용자 데이터 저장소
const users = [];
const usersFile = path.join(__dirname, 'users.json');
const MYART_DB = path.join(__dirname, 'myart.json');

// 사용자 데이터 로드
function loadUsers() {
    try {
        if (fs.existsSync(usersFile)) {
            const data = fs.readFileSync(usersFile, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('사용자 데이터 로드 실패:', error);
    }
    return [];
}

// 사용자 데이터 저장
function saveUsers() {
    try {
        fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    } catch (error) {
        console.error('사용자 데이터 저장 실패:', error);
    }
}

// 초기 사용자 데이터 로드
users.push(...loadUsers());

// Firebase 인증 미들웨어
async function authenticateToken(req, res, next) {
    if (!admin) {
        return res.status(503).json({ error: 'Firebase Admin이 초기화되지 않았습니다.' });
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: '액세스 토큰이 필요합니다.' });
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken;
        next();
    } catch (error) {
        console.error('토큰 검증 실패:', error);
        return res.status(403).json({ error: '유효하지 않은 토큰입니다.' });
    }
}

// 헬스체크 엔드포인트
app.get('/healthz', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: NODE_ENV,
        uptime: Math.floor(process.uptime()),
        memory: process.memoryUsage()
    });
});

// 레디니스 체크 엔드포인트
app.get('/readyz', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (isReady) {
        return res.status(200).json({ 
            ready: true, 
            aiFeaturesReady: aiFeaturesReady,
            ts: Date.now(),
            uptime: Math.floor(process.uptime()),
            memory: process.memoryUsage()
        });
    }
    return res.status(503).json({ 
        ready: false, 
        aiFeaturesReady: false,
        ts: Date.now(),
        message: 'Server is initializing'
    });
});

// 준비 전 차단 게이트
const allow = new Set(['/healthz', '/readyz', '/favicon.ico']);
app.use((req, res, next) => {
    if (allow.has(req.path) || req.path.startsWith('/static/')) return next();
    if (req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    if (!isReady) return res.status(503).json({ error: 'server not ready' });
    next();
});

// remove-bg 동시성 제한 큐
const q = new PQueue({ concurrency: CONCURRENCY, timeout: JOB_TIMEOUT_MS, throwOnTimeout: true });

// Python 스크립트 실행 함수
const runPythonScript = (scriptName, args = [], timeout = 300000) => {
    return new Promise((resolve, reject) => {
        console.log(`Python 스크립트 실행: ${scriptName}`);
        console.log(`인자:`, args);
        console.log(`Python 경로: ${PYTHON_PATH}`);
        
        const cleanEnv = {
            ...process.env,
            PYTHONUNBUFFERED: '1'
        };
        
        const command = `"${PYTHON_PATH}" "${scriptName}" ${args.map(arg => `"${arg}"`).join(' ')}`;
        console.log(`실행 명령어: ${command}`);
        
        const pythonProcess = exec(command, {
            cwd: __dirname,
            env: cleanEnv,
            timeout: timeout
        }, (error, stdout, stderr) => {
            if (error) {
                console.error('Python 스크립트 실행 오류:', error);
                reject(error);
                return;
            }
            
            if (stderr) {
                console.error('Python 스크립트 stderr:', stderr);
            }
            
            console.log('Python 스크립트 stdout:', stdout);
            resolve(stdout);
        });
    });
};

// AI 기능 초기화 함수
async function initializeAIFeatures() {
    try {
        console.log('🤖 AI 기능 초기화 시작...');
        
        // Python 환경 확인
        await new Promise((resolve, reject) => {
            const pythonProcess = spawn(PYTHON_PATH, ['--version']);
            pythonProcess.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error('Python이 설치되어 있지 않거나 실행할 수 없습니다.'));
            });
        });
        console.log('✅ Python 환경 확인 완료');
        
        // U2Net 모델 상태 확인 (간단한 체크)
        const modelDir = process.env.MODEL_DIR || '/tmp/u2net';
        const modelPath = path.join(modelDir, 'u2net.onnx');
        
        if (!fs.existsSync(modelPath)) {
            console.log('🐍 U2Net 모델 다운로드 필요 (런타임에 처리)');
        } else {
            console.log('🐍 U2Net 모델 존재 확인');
        }
        
        // AI 기능 준비 완료
        aiFeaturesReady = true;
        console.log('🎉 AI 기능 초기화 완료');
        
    } catch (error) {
        console.error('❌ AI 기능 초기화 실패:', error.message);
        throw error;
    }
}

// remove-bg API 엔드포인트
app.post('/api/remove-bg', upload.single('image'), async (req, res) => {
    const started = Date.now();
    try {
        const job = async () => {
            // 입력 정규화
            let inputBuffer = null;
            if (req.file?.buffer) {
                inputBuffer = req.file.buffer;
            } else if (req.body?.imageBase64) {
                const b64 = (req.body.imageBase64 || '').split(',').pop();
                inputBuffer = Buffer.from(b64, 'base64');
            }
            
            if (!inputBuffer) {
                return res.status(400).json({ error: 'no image provided' });
            }

            // AI 기능이 준비되지 않은 경우
            if (!aiFeaturesReady) {
                return res.status(503).json({ 
                    error: 'AI 기능이 초기화 중입니다. 잠시 후 다시 시도해주세요.',
                    queue: { pending: q.size, running: q.pending }
                });
            }

            // 임시 파일 생성
            const tempDir = path.join(__dirname, 'uploads');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            
            const inputPath = path.join(tempDir, `input_${Date.now()}.png`);
            const outputPath = path.join(tempDir, `output_${Date.now()}.png`);
            
            fs.writeFileSync(inputPath, inputBuffer);

            try {
                // Python 스크립트 실행
                const result = await runPythonScript('u2net_remove_bg.py', [inputPath, outputPath]);
                
                if (fs.existsSync(outputPath)) {
                    const outputBuffer = fs.readFileSync(outputPath);
                    const base64Result = outputBuffer.toString('base64');
                    
                    // 임시 파일 정리
                    fs.unlinkSync(inputPath);
                    fs.unlinkSync(outputPath);
                    
                    res.set('Cache-Control', 'no-store');
                    res.status(200).json({
                        success: true,
                        processedImageUrl: `data:image/png;base64,${base64Result}`,
                        tookMs: Date.now() - started,
                        size: outputBuffer.length
                    });
                } else {
                    throw new Error('배경 제거 결과 파일이 생성되지 않았습니다.');
                }
            } catch (error) {
                // 임시 파일 정리
                if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                throw error;
            }
        };

        await q.add(job);
    } catch (err) {
        const took = Date.now() - started;
        const msg = err?.message || String(err);
        const isTimeout = msg.includes('Queue timeout') || msg.includes('timeout');
        const code = isTimeout ? 503 : 429;
        
        res.status(code).json({
            error: 'remove-bg failed',
            reason: isTimeout ? 'timeout or overload' : msg,
            queue: { pending: q.size, running: q.pending },
            tookMs: took
        });
    }
});

// 기존 API 엔드포인트들 유지
app.get('/api/status', (req, res) => {
    res.json({ 
        status: 'running',
        message: 'MeArt API is running',
        version: process.env.npm_package_version || '1.0.30',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        memory: process.memoryUsage(),
        pythonPath: PYTHON_PATH,
        nodeEnv: NODE_ENV,
        firebaseEnabled: admin !== null,
        serverReady: isReady,
        aiFeaturesReady: aiFeaturesReady
    });
});

// 정적 파일 서빙
app.use('/BG_image', express.static(path.join(__dirname, 'BG_image')));
app.use('/models', express.static(path.join(__dirname, 'models')));
app.use('/onnix', express.static(path.join(__dirname, 'onnix')));

// uploads 폴더를 정적 파일로 제공
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

app.use('/uploads', express.static(uploadDir, {
    setHeaders: (res, filepath) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, private, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Last-Modified', new Date().toUTCString());
        res.setHeader('ETag', Math.random().toString(36).substr(2, 9));
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET');
    }
}));

// 서버 초기화 함수
async function init() {
    try {
        console.log('🚀 서버 초기화 시작...');
        
        // 1단계: 기본 서버 기능 즉시 활성화 (빠른 시작)
        isReady = true;
        console.log('SERVER_READY'); // 외부 스크립트 파싱용 토큰
        console.log('✅ 기본 서버 기능 활성화 완료');
        
        // 2단계: 백그라운드에서 AI 기능 초기화 (점진적 초기화)
        initializeAIFeatures().catch(error => {
            console.error('⚠️ AI 기능 초기화 실패 (기본 기능은 정상 작동):', error.message);
        });
        
    } catch (e) {
        console.error('INIT_FAILED', e);
        process.exit(1);
    }
}

const server = app.listen(PORT, HOST, () => {
    console.log(`listening on http://${HOST}:${PORT}`);
    init(); // listen 후 초기화 → Render 포트 감지 OK
});

// Node 서버 타임아웃/Keep-Alive 보정(프록시 안정성)
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

// 예외/거부 핸들링(크래시 루프 방지 로그)
process.on('uncaughtException', (e) => console.error('uncaughtException', e));
process.on('unhandledRejection', (e) => console.error('unhandledRejection', e));
process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));