const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const FormData = require('form-data');
const { execSync } = require('child_process');
const crypto = require('crypto'); // 파일 해시 계산용
// MIME 타입 감지를 위한 간단한 맵 (호환성 개선)
const mimeTypes = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.json': 'application/json',
    '.js': 'application/javascript',
    '.html': 'text/html',
    '.css': 'text/css'
};

// 환경 변수 설정 (Render 배포 최적화)
const PORT = process.env.PORT || 9000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const JWT_SECRET = process.env.JWT_SECRET || 'your-default-jwt-secret-change-in-production';
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

// Python 경로 설정 (Windows/Linux 환경 대응)
const PYTHON_PATH = process.env.PYTHON_PATH || (process.platform === 'win32' ? 'python' : 'python3');
// 유틸 함수들 직접 구현
function toAbsPath(relativePath) {
    return path.isAbsolute(relativePath) ? relativePath : path.join(__dirname, relativePath);
}

function fileExists(filePath) {
    try {
        return fs.existsSync(filePath);
    } catch (error) {
        return false;
    }
}

function safeUnlink(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return true;
        }
    } catch (error) {
        console.error('파일 삭제 실패:', error);
    }
    return false;
}

// Firebase Admin 설정 (선택적)
let admin, db;
try {
    admin = require('./firebase-admin-config');
    db = admin.firestore();
    console.log('Firebase Admin 초기화 성공');
} catch (error) {
    console.log('Firebase Admin 초기화 실패, 기본 기능만 사용:', error.message);
    admin = null;
    db = null;
}

const app = express();
const port = PORT;

// JWT 시크릿 키는 환경변수에서 이미 설정됨

// 사용자 데이터 저장소 (실제 프로덕션에서는 데이터베이스 사용)
const users = [];
const usersFile = path.join(__dirname, 'users.json');

// My Art DB 파일 경로
const MYART_DB = path.join(__dirname, 'myart.json');

// 시스템 Python 사용 (Render 환경 대응)
const pythonPath = PYTHON_PATH;

// multer 업로드 파일 확장자 보존을 위한 storage 설정
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const randomId = crypto.randomBytes(16).toString('hex');
    cb(null, randomId + ext);
  }
});
const upload = multer({ storage });

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

// Firebase 인증 미들웨어 (Firebase Admin이 있을 때만)
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
        console.log('🔐 토큰 검증 시작:', token.substring(0, 50) + '...');
        
        // 토큰 형식 검증
        if (!token.includes('.') || token.split('.').length !== 3) {
            console.error('❌ 잘못된 토큰 형식:', token.substring(0, 50) + '...');
            return res.status(403).json({ error: '잘못된 토큰 형식입니다.' });
        }

        console.log('✅ 토큰 형식 검증 통과');
        
        // 먼저 Firebase ID 토큰 검증 시도
    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
            console.log('✅ Firebase 토큰 검증 성공, 사용자 ID:', decodedToken.uid);
        req.user = decodedToken;
        next();
            return;
        } catch (firebaseError) {
            console.log('⚠️ Firebase 토큰 검증 실패, 커스텀 JWT 시도:', firebaseError.message);
            
            // Firebase 토큰이 아닌 경우 커스텀 JWT 검증
            try {
                const customDecoded = jwt.verify(token, JWT_SECRET);
                console.log('✅ 커스텀 JWT 검증 성공, 사용자 ID:', customDecoded.userId);
                req.user = { 
                    uid: customDecoded.userId, 
                    custom: true,
                    ...customDecoded 
                };
                next();
                return;
            } catch (customError) {
                console.error('❌ 커스텀 JWT 검증도 실패:', customError.message);
                console.error('🔍 원본 Firebase 오류:', firebaseError.message);
                throw firebaseError; // 원래 Firebase 오류를 던짐
            }
        }
    } catch (error) {
        console.error('토큰 검증 실패:', error);
        
        // 토큰 만료 등의 경우 클라이언트가 갱신할 수 있도록 특별한 응답
        if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
            return res.status(401).json({ 
                error: '토큰이 만료되었거나 유효하지 않습니다. 다시 로그인해주세요.',
                code: 'TOKEN_EXPIRED'
            });
        }
        
        return res.status(403).json({ error: '유효하지 않은 토큰입니다.' });
    }
}

// CORS 설정
app.use(cors({
    origin: ['http://localhost:9000', 'http://127.0.0.1:9000', 'null'],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'], // Authorization 헤더 추가
    credentials: true
}));

// 기본 미들웨어 설정
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 정적 파일 제공 (public 폴더를 가장 먼저!)
app.use(express.static(path.join(__dirname, 'public')));

// BG_image 폴더를 정적 파일로 제공
app.use('/BG_image', express.static(path.join(__dirname, 'BG_image')));

// models 폴더를 정적 파일로 제공
app.use('/models', express.static(path.join(__dirname, 'models')));

// onnix 폴더를 정적 파일로 제공
app.use('/onnix', express.static(path.join(__dirname, 'onnix')));

// 헬스체크 엔드포인트 (호스팅 서비스용)
app.get('/health', (req, res) => {
    const healthData = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: NODE_ENV,
        uptime: Math.floor(process.uptime()),
        memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
        },
        services: {
            firebase: admin ? 'connected' : 'disabled',
            python: 'available' // Python 가용성은 실제 체크하지 않음 (빠른 응답을 위해)
        }
    };
    
    res.status(200).json(healthData);
});

// API 상태 체크 엔드포인트
app.get('/api/status', (req, res) => {
    res.json({ 
        status: 'running',
        message: 'MeArt API is running',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

// uploads 폴더를 정적 파일로 제공 (강력한 캐시 방지)
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    setHeaders: (res, filepath) => {
        // 강력한 캐시 방지 헤더 설정
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, private, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Last-Modified', new Date().toUTCString());
        res.setHeader('ETag', Math.random().toString(36).substr(2, 9));
        
        // CORS 헤더 추가 (브라우저 호환성)
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET');
        
        console.log('정적 파일 제공:', filepath);
    }
}));

// uploads 폴더 생성
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// ====== 임시 파일 자동 정리 스케줄러 ======
setInterval(() => {
    const now = Date.now();
    fs.readdirSync(uploadDir).forEach(file => {
        const filePath = path.join(uploadDir, file);
        try {
            const stats = fs.statSync(filePath);
            if (now - stats.mtimeMs > 24 * 60 * 60 * 1000) fs.unlinkSync(filePath);
        } catch {}
    });
}, 12 * 60 * 60 * 1000); // 12시간마다 실행

// Python 스크립트 실행 함수 최적화
const runPythonScript = (scriptName, args = [], timeout = 120000) => {
    return new Promise((resolve, reject) => {
        console.log(`Python 스크립트 실행: ${scriptName}`);
        console.log(`인자:`, args);
        console.log(`Python 경로: ${pythonPath}`);
        
        // 시스템 Python 환경변수 설정
        const cleanEnv = {
            ...process.env,
            PYTHONUNBUFFERED: '1'
        };
        
        const command = `"${pythonPath}" "${scriptName}" ${args.map(arg => `"${arg}"`).join(' ')}`;
        console.log(`실행 명령어: ${command}`);
        
        const pythonProcess = exec(command, {
            cwd: __dirname,
            env: cleanEnv,
            timeout: timeout
        }, (error, stdout, stderr) => {
            if (error) {
                console.error(`Python 스크립트 실행 오류: ${error.message}`);
                console.error(`Python stderr: ${stderr}`);
                reject(new Error(`Python 스크립트 실패: ${error.message}`));
                return;
            }
            
            console.log(`Python stdout: ${stdout}`);
            if (stderr) {
                console.log(`Python stderr: ${stderr}`);
            }
            console.log(`Python 프로세스 종료 코드: ${pythonProcess.exitCode}`);
            
            if (pythonProcess.exitCode === 0) {
                resolve(stdout);
            } else {
                reject(new Error(`Python 스크립트 실패 (코드: ${pythonProcess.exitCode})`));
            }
        });
    });
};

// Python 실행 환경 확인 함수 추가
function checkPythonEnvironment() {
    return new Promise((resolve, reject) => {
        const pythonProcess = spawn(pythonPath, ['--version']);
        
        pythonProcess.stdout.on('data', (data) => {
            console.log('Python 버전:', data.toString());
        });

        pythonProcess.stderr.on('data', (data) => {
            console.error('Python 버전 확인 중 에러:', data.toString());
        });

        pythonProcess.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error('Python이 설치되어 있지 않거나 실행할 수 없습니다.'));
            }
        });
    });
}

// 감정별 피드백 메시지
const emotionPhrases = {
        happy: [
        "오늘도 멋진 미소네요! 당신의 행복이 주변을 밝혀줘요.",
        "기분 좋은 하루 보내고 계신 것 같아요! 계속 그 에너지 유지하세요!",
        "행복한 얼굴에서 좋은 일이 가득 느껴져요. 응원합니다!",
        "웃는 모습이 정말 인상적이에요. 당신의 하루가 더 반짝이길 바라요.",
        "지금 이 순간, 당신의 긍정이 세상에 전달되고 있어요!"
        ],
        sad: [
        "지금은 조금 힘들어도, 분명히 지나갈 거예요. 당신은 강한 사람이에요.",
        "마음이 무거운 날엔, 잠시 쉬어가도 괜찮아요.",
        "당신의 슬픔을 이해해요. 오늘은 스스로를 따뜻하게 안아주세요.",
        "감정은 숨기지 않아도 돼요. 눈물도 치유의 일부랍니다.",
        "지금은 슬퍼도, 곧 다시 빛나는 순간이 찾아올 거예요."
    ],
    neutral: [
        "차분한 모습이 인상적이에요. 집중이 잘 되는 시간인가요?",
        "마음이 고요할 땐, 내면의 지혜가 깨어나요.",
        "지금 이 평온함이 당신의 안정된 에너지를 보여줘요.",
        "무언가에 몰입하고 있는 것 같아요. 계속 좋은 흐름을 이어가세요.",
        "균형 잡힌 지금 이 순간, 중요한 결정을 내리기에 좋은 시간이에요."
    ],
    fear: [
        "불안한 마음이 드나요? 잠시 깊게 숨 쉬어보세요. 괜찮아요.",
        "용기는 두려움을 마주하는 순간 생겨요. 지금 당신은 충분히 잘하고 있어요.",
        "두려움은 변화의 신호예요. 곧 더 나은 일이 올 거예요.",
        "걱정이 많을 땐, 한 걸음만 내딛어도 큰 변화가 시작돼요.",
        "마음이 불안할 땐, 스스로에게 친절해져보세요. 당신은 혼자가 아니에요."
    ],
    surprise: [
        "무언가 예상 못한 일이 있었나요? 새로운 기회일 수도 있어요!",
        "깜짝 놀랐나요? 때로는 변화가 더 나은 길을 보여줘요.",
        "놀라는 순간, 또 다른 호기심이 생겨나죠. 지금을 즐겨보세요.",
        "새로운 발견은 놀람에서 시작돼요. 흥미로운 일이 생길 것 같아요!",
        "그 감정, 당신이 뭔가에 진심이라는 증거예요. 그대로 멋져요."
    ]
};

// 감정별 피드백 메시지 반환 함수
function getEmotionFeedback(emotion) {
    const phrases = emotionPhrases[emotion] || emotionPhrases.neutral;
    return phrases[Math.floor(Math.random() * phrases.length)];
}

// util: 동적 배경 이미지 추천 함수
// 배경 이미지 캐시 (성능 최적화)
let bgImageCache = null;
let bgImageCacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5분

function getAvailableBackgroundImages() {
    const now = Date.now();
    
    // 캐시가 유효한 경우 캐시된 결과 반환
    if (bgImageCache && (now - bgImageCacheTime) < CACHE_DURATION) {
        return bgImageCache;
    }
    
    // BG_image 폴더에서 실제 존재하는 이미지 파일들을 동적으로 스캔
    const bgImageDir = path.join(__dirname, 'BG_image');
    let availableImages = [];
    
    try {
        if (fs.existsSync(bgImageDir)) {
            const files = fs.readdirSync(bgImageDir);
            availableImages = files
                .filter(file => {
                    const ext = path.extname(file).toLowerCase();
                    return ['.jpg', '.jpeg', '.png', '.gif', '.bmp'].includes(ext);
                })
                .map(file => `/BG_image/${file}`)
                .filter(imagePath => {
                    // 실제 파일 존재 여부 확인
                    const absPath = path.join(__dirname, imagePath.replace(/^\//, ''));
                    return fs.existsSync(absPath);
                });
            
            console.log('BG_image 폴더 스캔 결과 - 전체 파일 수:', files.length);
        }
    } catch (error) {
        console.error('BG_image 폴더 스캔 오류:', error);
        // 폴더 접근 실패 시 기본 이미지들 반환 (존재하는 것만)
        const defaultImages = [
            '/BG_image/farmhouse_in_provence_1970.17.34.jpg',
            '/BG_image/the_harbor_at_lorient_1970.17.48.jpg',
            '/BG_image/landscape_1969.14.1.jpg',
            '/BG_image/hampton_court_green_1970.17.53.jpg',
            '/BG_image/seascape_at_port-en-bessin_normandy_1972.9.21.jpg'
        ];
        availableImages = defaultImages.filter(imagePath => {
            const absPath = path.join(__dirname, imagePath.replace(/^\//, ''));
            return fs.existsSync(absPath);
        });
    }
    
    // 캐시 업데이트
    bgImageCache = availableImages;
    bgImageCacheTime = now;
    
    return availableImages;
}

// 썸네일 경로 생성 함수
function getThumbnailPath(imagePath) {
    try {
        // /BG_image/filename.jpg -> /BG_image/thumbnails/filename_thumb.jpg
        const fileName = path.basename(imagePath, path.extname(imagePath));
        return `/BG_image/thumbnails/${fileName}_thumb.jpg`;
    } catch (error) {
        console.error('썸네일 경로 생성 오류:', error);
        return imagePath; // 실패 시 원본 경로 반환
    }
}

// 명화 추천 리스트 생성 함수 (썸네일 포함)
function getArtworkRecommendations(emotion, selectedBackground, limit = 6) {
    try {
        console.log('🎨 명화 추천 리스트 생성:', emotion);
        
        const availableImages = getAvailableBackgroundImages();
        let emotionImages = [];
        
        // 감정별 색인 파일 로드
        const emotionIndexPath = path.join(__dirname, 'BG_image', 'emotion_index.json');
        let emotionIndex = null;
        
        try {
            const indexData = fs.readFileSync(emotionIndexPath, 'utf8');
            emotionIndex = JSON.parse(indexData);
        } catch (error) {
            console.log('색인 파일 로드 실패, 키워드 방식 사용');
        }
        
        // 감정 매핑
        const emotionMapping = {
            'happy': 'happiness',
            'sad': 'sadness', 
            'angry': 'anger',
            'surprised': 'surprise',
            'fear': 'fear',
            'disgust': 'disgust',
            'neutral': 'neutral'
        };
        
        const normalizedEmotion = emotionMapping[emotion] || emotion;
        
        // 색인 기반 추천
        if (emotionIndex && emotionIndex.emotions && emotionIndex.emotions[normalizedEmotion]) {
            const emotionArtworks = emotionIndex.emotions[normalizedEmotion].artworks;
            const sortedArtworks = emotionArtworks.sort((a, b) => (b.emotion_score || 0) - (a.emotion_score || 0));
            
            for (const artwork of sortedArtworks) {
                const imagePath = `/BG_image/${artwork.filename}`;
                const fullPath = path.join(__dirname, 'BG_image', artwork.filename);
                
                if (fs.existsSync(fullPath)) {
                    emotionImages.push({
                        path: imagePath,
                        thumbnail: getThumbnailPath(imagePath),
                        title: artwork.title || artwork.filename,
                        artist: artwork.artist || '알수없음',
                        score: artwork.emotion_score || 0.5
                    });
                }
            }
        }
        
        // 키워드 기반 보완
        if (emotionImages.length < limit) {
            const emotionKeywords = {
                'happiness': ['happy', 'joy', 'smile', 'laugh', 'cheer', 'festival', 'dance', 'harvest', 'bloom', 'breeze', 'irises', 'flowers', 'kyoto'],
                'sadness': ['sad', 'sorrow', 'grief', 'tear', 'crucifixion', 'deluge', 'distress', 'saint', 'winter', 'ghost'],
                'anger': ['angry', 'rage', 'fury', 'battle', 'devil', 'tiger', 'snake', 'legend', 'wetting', 'storm'],
                'surprise': ['surprise', 'shock', 'amaze', 'ark', 'noah', 'manhattan', 'sunrise'],
                'fear': ['fear', 'swell', 'church', 'sebastian', 'distress'],
                'disgust': ['bubble', 'squeak'],
                'neutral': ['hampton', 'landscape', 'calm', 'louveciennes', 'orchard', 'wheat', 'olive', 'farmhouse', 'harvest', 'hare', 'table', 'bathers', 'interior']
            };
            
            const keywords = emotionKeywords[normalizedEmotion] || [];
            
            for (const imagePath of availableImages) {
                if (emotionImages.length >= limit) break;
                
                const fileName = path.basename(imagePath).toLowerCase();
                const isKeywordMatch = keywords.some(keyword => fileName.includes(keyword.toLowerCase()));
                const alreadyAdded = emotionImages.some(item => item.path === imagePath);
                
                if (isKeywordMatch && !alreadyAdded) {
                    const cleanFileName = path.basename(imagePath, path.extname(imagePath))
                        .replace(/_\d+\.\d+\.\d+/g, '') // 연도 제거
                        .replace(/_/g, ' ') // 언더스코어를 공백으로
                        .replace(/\b\w/g, l => l.toUpperCase()); // 첫글자 대문자
                    
                    emotionImages.push({
                        path: imagePath,
                        thumbnail: getThumbnailPath(imagePath),
                        title: cleanFileName,
                        artist: '클래식 마스터',
                        score: 0.6
                    });
                }
            }
        }
        
        // 전체에서 랜덤 보완
        if (emotionImages.length < limit) {
            const shuffled = [...availableImages].sort(() => 0.5 - Math.random());
            for (const imagePath of shuffled) {
                if (emotionImages.length >= limit) break;
                
                const alreadyAdded = emotionImages.some(item => item.path === imagePath);
                if (!alreadyAdded) {
                    const cleanFileName = path.basename(imagePath, path.extname(imagePath))
                        .replace(/_\d+\.\d+\.\d+/g, '')
                        .replace(/_/g, ' ')
                        .replace(/\b\w/g, l => l.toUpperCase());
                    
                    emotionImages.push({
                        path: imagePath,
                        thumbnail: getThumbnailPath(imagePath),
                        title: cleanFileName,
                        artist: '마스터피스',
                        score: 0.4
                    });
                }
            }
        }
        
        // 선택된 배경을 맨 앞으로 이동
        if (selectedBackground) {
            const selectedIndex = emotionImages.findIndex(item => item.path === selectedBackground);
            if (selectedIndex > 0) {
                const selected = emotionImages.splice(selectedIndex, 1)[0];
                emotionImages.unshift(selected);
            }
        }
        
        console.log(`📊 추천 리스트 생성 완료: ${emotionImages.length}개`);
        return emotionImages.slice(0, limit);
        
    } catch (error) {
        console.error('명화 추천 리스트 생성 오류:', error);
        return [];
    }
}

function recommendBackgroundByEmotion(emotion) {
    console.log('🎨 배경 추천 함수 호출 - 입력 감정:', emotion);
    
    try {
        // 감정별 색인 파일 로드
        const emotionIndexPath = path.join(__dirname, 'BG_image', 'emotion_index.json');
        let emotionIndex = null;
        
        try {
            const indexData = fs.readFileSync(emotionIndexPath, 'utf8');
            emotionIndex = JSON.parse(indexData);
            console.log('✅ 감정별 색인 파일 로드 성공');
        } catch (error) {
            console.log('⚠️ 감정별 색인 파일 로드 실패, 기존 키워드 방식 사용:', error.message);
        }
        
        const availableImages = getAvailableBackgroundImages();
        let emotionImages = [];
        
        // 감정 매핑 (다양한 감정 표현을 통일)
        const emotionMapping = {
            'happy': 'happiness',
            'sad': 'sadness', 
            'angry': 'anger',
            'surprised': 'surprise',
            'fear': 'fear',
            'disgust': 'disgust',
            'neutral': 'neutral'
        };
        
        const normalizedEmotion = emotionMapping[emotion] || emotion;
        console.log('🔄 정규화된 감정:', normalizedEmotion);
        
        // 새로운 색인 파일을 사용할 수 있는 경우
        if (emotionIndex && emotionIndex.emotions && emotionIndex.emotions[normalizedEmotion]) {
            const emotionArtworks = emotionIndex.emotions[normalizedEmotion].artworks;
            console.log(`📚 색인에서 ${normalizedEmotion} 감정 작품 ${emotionArtworks.length}개 발견`);
            
            // 감정 점수순으로 정렬하여 높은 점수부터 선택
            const sortedArtworks = emotionArtworks.sort((a, b) => (b.emotion_score || 0) - (a.emotion_score || 0));
            
            // 실제 파일이 존재하는지 확인하면서 추가
            for (const artwork of sortedArtworks) {
                const imagePath = `/BG_image/${artwork.filename}`;
                const fullPath = path.join(__dirname, 'BG_image', artwork.filename);
                
                if (fs.existsSync(fullPath)) {
                    emotionImages.push(imagePath);
                    console.log(`✅ 색인 기반 추가: ${artwork.filename} (점수: ${artwork.emotion_score})`);
                } else {
                    console.log(`❌ 파일 없음: ${artwork.filename}`);
                }
            }
        }
        
        // 색인 기반으로 찾은 이미지가 없거나 부족한 경우 기존 키워드 방식 보완
        if (emotionImages.length < 3) {
            console.log('🔍 색인 기반 이미지가 부족하여 키워드 방식으로 보완');
            
            const emotionKeywords = {
                'happiness': ['happy', 'joy', 'smile', 'laugh', 'cheer', 'festival', 'dance', 'harvest', 'bloom', 'breeze', 'irises', 'flowers', 'kyoto'],
                'sadness': ['sad', 'sorrow', 'grief', 'tear', 'crucifixion', 'deluge', 'distress', 'saint', 'winter', 'ghost'],
                'anger': ['angry', 'rage', 'fury', 'battle', 'devil', 'tiger', 'snake', 'legend', 'wetting', 'storm'],
                'surprise': ['surprise', 'shock', 'amaze', 'ark', 'noah', 'manhattan', 'sunrise'],
                'fear': ['fear', 'swell', 'church', 'sebastian', 'distress'],
                'disgust': ['bubble', 'squeak'],
                'neutral': ['hampton', 'landscape', 'calm', 'louveciennes', 'orchard', 'wheat', 'olive', 'farmhouse', 'harvest', 'hare', 'table', 'bathers', 'interior']
            };
            
            const keywords = emotionKeywords[normalizedEmotion] || [];
            
            const keywordImages = availableImages.filter(imagePath => {
                const fileName = path.basename(imagePath).toLowerCase();
                return keywords.some(keyword => fileName.toLowerCase().includes(keyword.toLowerCase()));
            });
            
            // 중복 제거하면서 추가
            for (const imagePath of keywordImages) {
                if (!emotionImages.includes(imagePath)) {
                    emotionImages.push(imagePath);
                }
            }
            
            console.log(`🔍 키워드 기반으로 ${keywordImages.length}개 추가 발견`);
        }
        
        // 감정별 이미지가 없으면 전체에서 랜덤 선택
        if (emotionImages.length === 0) {
            console.log('❌ 감정별 매칭 이미지가 없어서 전체 이미지에서 선택');
            emotionImages = availableImages;
        }
        
        // 이미지가 전혀 없으면 기본 이미지 반환
        if (emotionImages.length === 0) {
            console.log('❌ 사용 가능한 이미지가 없어서 기본 이미지 반환');
            return '/BG_image/hampton_court_green_1970.17.53.jpg';
        }
        
        // 가중 랜덤 선택 (앞쪽 이미지일수록 높은 확률)
        let selectedImage;
        if (emotionImages.length <= 3) {
            // 이미지가 적으면 단순 랜덤
            const randomIndex = Math.floor(Math.random() * emotionImages.length);
            selectedImage = emotionImages[randomIndex];
        } else {
            // 이미지가 많으면 가중 랜덤 (앞쪽 40% 확률, 나머지 60%)
            const isTopChoice = Math.random() < 0.4;
            if (isTopChoice && emotionImages.length > 0) {
                // 상위 3개 중에서 선택
                const topCount = Math.min(3, emotionImages.length);
                const randomIndex = Math.floor(Math.random() * topCount);
                selectedImage = emotionImages[randomIndex];
            } else {
                // 전체에서 랜덤 선택
                const randomIndex = Math.floor(Math.random() * emotionImages.length);
                selectedImage = emotionImages[randomIndex];
            }
        }
        
        console.log('📊 추천 결과:');
        console.log('  - 전체 이미지 수:', availableImages.length);
        console.log('  - 감정별 매칭 수:', emotionImages.length);
        console.log('  - 선택된 이미지:', selectedImage);
        console.log('  - 매칭된 이미지들:', emotionImages.slice(0, 5), emotionImages.length > 5 ? '...' : '');
        
        return selectedImage;
        
    } catch (error) {
        console.error('❌ 배경 추천 중 오류:', error);
        return '/BG_image/hampton_court_green_1970.17.53.jpg';
    }
}

// 모바일 감지 함수 (User-Agent 기반)
function isMobileDevice(userAgent) {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(userAgent);
}

// 모바일 최적화된 이미지 크기 최적화 함수 (EXIF 정보 보존)
async function optimizeImageSize(inputPath, userAgent = '', maxSize = 1500) {
    return new Promise((resolve, reject) => {
        const sharp = require('sharp');
        
        // 원본 파일 크기 확인
        const stats = fs.statSync(inputPath);
        const fileSizeMB = stats.size / (1024 * 1024);
        
        const isMobile = isMobileDevice(userAgent);
        
        // 모바일 디바이스에 따른 최적화 임계값 조정
        const mobileThreshold = isMobile ? 1.0 : 2.0; // 모바일: 1MB, 데스크톱: 2MB
        const mobileMaxSize = isMobile ? 1200 : maxSize; // 모바일: 더 작은 크기
        const mobileQuality = isMobile ? 80 : 85; // 모바일: 더 높은 압축
        
        // 임계값 이상인 경우에만 최적화 수행
        if (fileSizeMB < mobileThreshold) {
            console.log(`📱 ${isMobile ? '모바일' : '데스크톱'} 이미지 크기가 ${fileSizeMB.toFixed(2)}MB로 작아서 최적화를 건너뜁니다.`);
            resolve(inputPath);
            return;
        }
        
        console.log(`📱 ${isMobile ? '모바일' : '데스크톱'} 대용량 이미지 감지: ${fileSizeMB.toFixed(2)}MB, 최적화 시작...`);
        
        sharp(inputPath)
            .rotate() // EXIF Orientation 정보를 기반으로 자동 회전
            .resize(mobileMaxSize, mobileMaxSize, { 
                fit: 'inside', 
                withoutEnlargement: true 
            })
            .jpeg({ 
                quality: mobileQuality,
                progressive: true,
                mozjpeg: true
            })
            .withMetadata() // EXIF 메타데이터 보존
            .toFile(inputPath + '_optimized.jpg')
            .then(() => {
                // 원본 파일을 최적화된 파일로 교체
                fs.renameSync(inputPath + '_optimized.jpg', inputPath);
                const newStats = fs.statSync(inputPath);
                const newSizeMB = newStats.size / (1024 * 1024);
                console.log(`📱 ${isMobile ? '모바일' : '데스크톱'} 이미지 최적화 완료: ${fileSizeMB.toFixed(2)}MB → ${newSizeMB.toFixed(2)}MB`);
                resolve(inputPath);
            })
            .catch((error) => {
                console.error('이미지 최적화 실패:', error);
                // 최적화 실패 시 원본 파일 그대로 사용
                resolve(inputPath);
            });
    });
}

// 파일 유효성 검사 함수
function isValidImage(filePath) {
    try {
        const buffer = fs.readFileSync(filePath);
        return buffer.length > 1024; // 1KB 이상이면 일단 통과
    } catch {
        return false;
    }
}

// 파일 저장 대기 함수
function waitForFileReady(filePath, minSize = 1024, timeout = 2000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        try {
            const stats = fs.statSync(filePath);
            if (stats.size >= minSize) return true;
        } catch (e) {}
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
    return false;
}

async function validateImage(filePath) {
    try {
        const stats = fs.statSync(filePath);
        if (stats.size < 1024) throw new Error('파일 크기가 너무 작음');
        if (!/\.(png|jpg|jpeg)$/i.test(filePath)) throw new Error('지원하지 않는 확장자');
        // python → py로 변경
        const result = execSync(`py check_alpha_file.py "${filePath}"`).toString();
        if (result.includes('cannot identify image file') || result.includes('오류 발생')) throw new Error('이미지 파일이 손상되었거나 유효하지 않습니다.');
        return true;
    } catch (e) {
        // 유효하지 않은 파일은 즉시 삭제
        try { fs.unlinkSync(filePath); } catch (err) {}
        throw new Error(e.message || '이미지 유효성 검사 실패');
    }
}

// ====== 유틸 함수 ======
// (중복 선언부 삭제)
// (이후 경로 변환, 파일 체크, 삭제 등은 toAbsPath, fileExists, safeUnlink 사용)

// [추가] 파일의 MD5 해시 계산 함수
function getFileHashSync(filePath) {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(fileBuffer).digest('hex');
}

// 🧹 임시 파일 정리 시스템
async function cleanupOldFiles() {
    try {
        const files = await fs.promises.readdir(uploadDir);
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24시간
        let cleanedCount = 0;

        for (const file of files) {
            // 임시 파일만 정리 (preview, brush, nobg 제외하고 원본만)
            if (file.match(/^[a-f0-9-]{36}\.(jpg|jpeg|png)$/i)) {
                const filePath = path.join(uploadDir, file);
                const stats = await fs.promises.stat(filePath);
                
                if (now - stats.mtime.getTime() > maxAge) {
                    await safeUnlink(filePath);
                    cleanedCount++;
                    console.log('🗑️ 오래된 임시 파일 정리:', file);
                }
            }
        }
        
        if (cleanedCount > 0) {
            console.log(`✅ ${cleanedCount}개의 오래된 파일 정리 완료`);
        }
    } catch (error) {
        console.error('❌ 파일 정리 중 오류:', error.message);
    }
}

// 🎯 브러시 효과 처리 상태 관리
const brushProcessingState = {
    isProcessing: false,
    currentRequest: null,
    queue: []
};

// 서버 시작 시 및 주기적으로 정리 실행
setInterval(cleanupOldFiles, 60 * 60 * 1000); // 1시간마다

// FastAPI 연동 함수 및 관련 코드 제거
// 기존 Python 직접 실행 방식 복구

// 예시: 배경 제거 API 복구
app.post('/api/remove-bg', upload.single('image'), async (req, res) => {
    console.log('🎯 배경 제거 API 호출됨');
    console.log('📂 요청 파일:', req.file);
    console.log('📋 요청 헤더:', req.headers);
    try {
        if (!req.file) {
            throw new Error('이미지가 업로드되지 않았습니다.');
        }
        await checkPythonEnvironment();
        
        // 🎯 업로드된 이미지로 감정 분석 수행
        let emotion = null;
        let emotionData = null;
        try {
            console.log('🔍 감정 분석 요청:', req.file.path);
            const rawOutput = await runPythonScript('emotion_analysis.py', [req.file.path]);
            console.log('📊 감정 분석 결과:', rawOutput);
            
            // JSON 파싱: 마지막 줄이 JSON 결과
            const lines = rawOutput.trim().split('\n');
            const jsonLine = lines[lines.length - 1];
            emotionData = JSON.parse(jsonLine);
            emotion = emotionData.emotion;
            console.log('✅ 파싱된 감정 데이터:', emotionData);
            console.log('🎯 최종 감정:', emotion);
        } catch (emotionError) {
            console.error('❌ 감정 분석 실패:', emotionError.message);
            emotion = req.body.emotion || 'neutral'; // 실패시 전달받은 값이나 neutral 사용
        }
        
        let backgroundPath = req.body.backgroundPath;
        
        console.log('=== backgroundPath 확인 ===');
        console.log('backgroundPath:', backgroundPath);
        console.log('backgroundPath 타입:', typeof backgroundPath);
        console.log('req.body:', req.body);
        
        // backgroundPath가 없으면 기본 배경 이미지 사용
        if (!backgroundPath) {
            backgroundPath = '/BG_image/hampton_court_green_1970.17.53.jpg';
            console.log('기본 배경 이미지 사용:', backgroundPath);
        }
        
        // 🎯 파일 해시 기반 중복 방지 시스템
        let inputPath = req.file.path;
        if (!path.isAbsolute(inputPath)) inputPath = path.resolve(inputPath);
        
        // 이미지 크기 최적화 (User-Agent 기반 모바일 최적화)
        try {
            const userAgent = req.headers['user-agent'] || '';
            inputPath = await optimizeImageSize(inputPath, userAgent, 1500);
            console.log('이미지 크기 최적화 완료:', inputPath);
        } catch (error) {
            console.log('이미지 최적화 실패, 원본 사용:', error.message);
        }
        
        // 파일 해시로 고유 식별자 생성
        const fileHash = getFileHashSync(inputPath);
        const hashPrefix = fileHash.substring(0, 8); // 처음 8자리만 사용
        
        const nobgPath = path.join(uploadDir, `${hashPrefix}_nobg.png`);
        const previewPath = path.join(uploadDir, `${hashPrefix}_preview_${Date.now()}.png`);
        
        console.log('🔍 파일 해시:', fileHash);
        console.log('🔍 해시 접두사:', hashPrefix);
        console.log('inputPath:', inputPath);
        console.log('nobgPath:', nobgPath);
        console.log('previewPath:', previewPath);
        // BG 이미지 경로 절대경로 변환
        let bgAbsPath = backgroundPath;
        console.log('=== bgAbsPath 변환 과정 ===');
        console.log('초기 bgAbsPath:', bgAbsPath);
        
        if (bgAbsPath && bgAbsPath.startsWith('/BG_image/')) {
            bgAbsPath = path.join(__dirname, bgAbsPath.replace(/^\//, ''));
            console.log('/BG_image/로 시작하는 경우:', bgAbsPath);
        } else if (bgAbsPath && !path.isAbsolute(bgAbsPath)) {
            bgAbsPath = path.join(__dirname, 'BG_image', bgAbsPath);
            console.log('상대경로인 경우:', bgAbsPath);
        } else {
            console.log('변환 조건에 맞지 않음:', bgAbsPath);
        }
        
        console.log('최종 bgAbsPath:', bgAbsPath);
        
        // 🎯 1단계: 배경 제거 (중복 방지)
        console.log('=== 1단계: 배경 제거 시작 ===');
        
        // 기존 nobg 파일이 있는지 확인
        let nobgStats;
        if (fileExists(nobgPath)) {
            console.log('✅ 기존 nobg 파일 재사용:', nobgPath);
            nobgStats = await fs.promises.stat(nobgPath);
            console.log('기존 nobg 파일 크기:', nobgStats.size, 'bytes');
        } else {
            console.log('🔄 새로운 배경 제거 실행');
            await runPythonScript('u2net_remove_bg.py', [inputPath, nobgPath, 'false', '120', '60', '1']);
            await fs.promises.access(nobgPath, fs.constants.F_OK).catch(() => { throw new Error('배경 제거 실패'); });
            
            console.log('배경 제거 완료:', nobgPath);
            nobgStats = await fs.promises.stat(nobgPath);
            console.log('nobg 파일 크기:', nobgStats.size, 'bytes');
        }
        
        // 🎯 1단계: Sharp로 단순 배경 합성 (미리보기용)
        console.log('🚀 Sharp 단순 배경 합성 시작');
        console.log('nobgPath:', nobgPath);
        console.log('bgAbsPath:', bgAbsPath);
        console.log('previewPath:', previewPath);
        
        try {
            const sharp = require('sharp');
            
            // nobg 이미지 크기 확인
            const nobgMetadata = await sharp(nobgPath).metadata();
            console.log('nobg 이미지 크기:', nobgMetadata.width, 'x', nobgMetadata.height);
            
            // 배경 이미지 크기 확인
            const bgMetadata = await sharp(bgAbsPath).metadata();
            console.log('배경 이미지 크기:', bgMetadata.width, 'x', bgMetadata.height);
            
            // 인물 이미지가 작을 경우를 고려한 크기 조정
            let targetWidth = nobgMetadata.width;
            let targetHeight = nobgMetadata.height;
            
            // 인물 이미지가 너무 작으면 최소 크기로 확대
            const minSize = 800; // 최소 크기 설정
            if (targetWidth < minSize || targetHeight < minSize) {
                const scale = minSize / Math.max(targetWidth, targetHeight);
                targetWidth = Math.round(targetWidth * scale);
                targetHeight = Math.round(targetHeight * scale);
                console.log(`인물 이미지 크기 조정: ${nobgMetadata.width}x${nobgMetadata.height} → ${targetWidth}x${targetHeight}`);
            }
            
            // 배경 이미지를 목표 크기에 맞게 리사이즈하고 크롭
            const resizedBackgroundBuffer = await sharp(bgAbsPath)
                .resize(targetWidth, targetHeight, { 
                    fit: 'cover',
                    position: 'center'
                })
                .png()
                .toBuffer();
            
            // nobg 이미지를 목표 크기로 확대 (고품질 보간)
            const resizedNobgBuffer = await sharp(nobgPath)
                .resize(targetWidth, targetHeight, { 
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 },
                    kernel: sharp.kernel.lanczos3  // 고품질 보간 알고리즘
                })
                .png()
                .toBuffer();
            
            // 배경과 nobg 합성
            await sharp(resizedBackgroundBuffer)
                .composite([{ 
                    input: resizedNobgBuffer, 
                    top: 0, 
                    left: 0, 
                    blend: 'over' 
                }])
                .png()
                .toFile(previewPath);
            
            console.log('✅ Sharp 배경 합성 완료:', previewPath);
        } catch (sharpError) {
            console.error('❌ Sharp 합성 실패:', sharpError.message);
            
            // 폴백: nobg 파일을 그대로 복사
            await fs.promises.copyFile(nobgPath, previewPath);
            console.log('✅ 폴백으로 nobg 파일 복사 완료');
        }
        
        // 🔥 단순 파일 확인
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 대기
        
        try {
            const stats = await fs.promises.stat(previewPath);
            console.log('✅ 미리보기 파일 생성 완료:', stats.size, 'bytes');
            } catch (error) {
            console.error('❌ 미리보기 파일 확인 실패:', error.message);
            throw new Error('미리보기 파일 생성 실패');
        }
        
        // 파일 크기 재확인
        const finalStats = await fs.promises.stat(previewPath);
        console.log('미리보기 파일 최종 크기:', finalStats.size, 'bytes');
        
        if (finalStats.size === 0) {
            throw new Error('미리보기 파일이 비어있습니다.');
        }
        
        // 🎯 Base64 인코딩으로 이미지 데이터 직접 전송
        let imageBase64 = null;
        // Render 환경에서는 메모리 절약을 위해 Base64 인코딩 최적화
        try {
            const stats = await fs.promises.stat(previewPath);
            if (stats.size < 5 * 1024 * 1024) { // 5MB 미만만 Base64 인코딩
                const imageBuffer = await fs.promises.readFile(previewPath);
                imageBase64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;
                console.log('✅ Base64 인코딩 완료:', imageBase64.length, 'chars');
            } else {
                console.log('⚠️ 파일이 너무 큽니다. URL로 제공:', stats.size, 'bytes');
                imageBase64 = `/uploads/${path.basename(previewPath)}`;
            }
        } catch (base64Error) {
            console.error('❌ Base64 인코딩 실패:', base64Error.message);
            imageBase64 = `/uploads/${path.basename(previewPath)}`;
        }
        
        // 1단계 결과: 배경 합성된 미리보기 + nobg 파일 경로 저장
        // 명화 추천 리스트 생성 (썸네일 포함)
        const artworkRecommendations = getArtworkRecommendations(emotion, backgroundPath, 6);
        
        res.json({
            processedImageUrl: '/uploads/' + path.basename(previewPath), // 배경 합성된 미리보기 표시
            imageBase64, // 🎯 Base64 이미지 데이터 추가
            nobgPath: '/uploads/' + path.basename(nobgPath), // 브러쉬 효과 적용을 위해 저장
            emotion,
            background: backgroundPath,
            feedback: getEmotionFeedback(emotion),
            emotionAnalysis: emotionData, // 🎯 감정 분석 세부 정보 포함
            artworkRecommendations, // 🎨 썸네일 포함 명화 추천 리스트
            savedToGallery: false,
            step: 1 // 1단계 완료 표시
        });
    } catch (error) {
        console.error('❌ 배경 제거 API 오류:', error);
        console.error('📍 오류 스택:', error.stack);
        res.status(500).json({ 
            error: error.message || '배경 제거 중 오류가 발생했습니다.',
            debug: NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// 이미지 직접 제공 API (강력한 캐시 제어)
app.get('/api/image/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const imagePath = path.join(__dirname, 'uploads', filename);
        
        console.log('이미지 직접 제공 요청:', imagePath);
        
        // 파일 존재 및 크기 확인
        await fs.promises.access(imagePath, fs.constants.F_OK | fs.constants.R_OK);
        const stats = await fs.promises.stat(imagePath);
        
        if (stats.size < 1000) {
            console.log('이미지 파일이 너무 작음:', stats.size, 'bytes');
            return res.status(404).json({ error: 'Image file too small' });
        }
        
        // 강력한 캐시 방지 헤더 설정
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, private, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Last-Modified', new Date().toUTCString());
        res.setHeader('ETag', Math.random().toString(36).substr(2, 9));
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Length', stats.size);
        res.setHeader('Access-Control-Allow-Origin', '*');
        
        console.log('이미지 스트림 전송 시작:', stats.size, 'bytes');
        
        // 파일 스트림으로 전송
        const fileStream = require('fs').createReadStream(imagePath);
        fileStream.pipe(res);
        
        fileStream.on('end', () => {
            console.log('이미지 스트림 전송 완료:', filename);
        });
        
        fileStream.on('error', (error) => {
            console.error('이미지 스트림 전송 오류:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Stream error' });
            }
        });
        
    } catch (error) {
        console.error('이미지 직접 제공 오류:', error);
        res.status(404).json({ error: 'Image not found' });
    }
});

// 이미지 준비 상태 확인 API
app.get('/api/check-image/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const imagePath = path.join(__dirname, 'uploads', filename);
        
        console.log('이미지 준비 상태 확인:', imagePath);
        
        // 파일 존재 및 크기 확인
        try {
            await fs.promises.access(imagePath, fs.constants.F_OK | fs.constants.R_OK);
            const stats = await fs.promises.stat(imagePath);
            
            if (stats.size > 1000) { // 최소 1KB
                console.log(`이미지 준비 완료: ${stats.size} bytes`);
                res.json({ ready: true, size: stats.size });
            } else {
                console.log(`이미지 아직 준비중: ${stats.size} bytes`);
                res.json({ ready: false, size: stats.size });
            }
        } catch (error) {
            console.log('이미지 아직 생성중:', error.message);
            res.json({ ready: false, error: error.message });
        }
    } catch (error) {
        console.error('이미지 상태 확인 오류:', error);
        res.status(500).json({ ready: false, error: error.message });
    }
});

// 브러쉬 효과 적용 API (2단계) - 최적화됨
app.post('/api/apply-brush-effect', async (req, res) => {
    try {
        console.log('🎨 브러시 효과 API 요청 받음:', req.body);
        const { nobgPath, backgroundPath, emotion } = req.body;
        
        if (!nobgPath || !backgroundPath) {
            console.error('❌ 필수 파라미터 누락:', { nobgPath, backgroundPath, emotion });
            throw new Error(`필수 파라미터가 누락되었습니다. nobgPath: ${nobgPath}, backgroundPath: ${backgroundPath}`);
        }
        
        // 🎯 동일한 요청 중복 체크
        const requestKey = `${nobgPath}_${backgroundPath}_${emotion}`;
        
        if (brushProcessingState.isProcessing && 
            brushProcessingState.currentRequest === requestKey) {
            console.log('⏸️ 동일한 브러시 효과 요청 중복 - 대기');
            return res.status(202).json({ 
                message: '이미 처리 중인 요청입니다. 잠시 후 다시 시도해주세요.',
                processing: true 
            });
        }
        
        brushProcessingState.isProcessing = true;
        brushProcessingState.currentRequest = requestKey;
        
        // 경로 변환 (상대 경로 → 절대 경로)
        const nobgAbsPath = nobgPath.startsWith('/uploads/') ? 
            path.join(__dirname, nobgPath.replace(/^\//, '')) : nobgPath;
        const bgAbsPath = backgroundPath.startsWith('/BG_image/') ? 
            path.join(__dirname, backgroundPath.replace(/^\//, '')) : backgroundPath;
        
        console.log('브러시 효과 적용 시작');
        console.log('nobgPath 변환:', nobgPath, '→', nobgAbsPath);
        console.log('backgroundPath 변환:', backgroundPath, '→', bgAbsPath);
        
        // 배경 파일 존재 확인
        if (!fs.existsSync(bgAbsPath)) {
            throw new Error(`배경 파일을 찾을 수 없습니다: ${bgAbsPath}`);
        }
        
        // nobg 파일 존재 확인 및 복구 로직
        if (!fs.existsSync(nobgAbsPath)) {
            console.log('⚠️ nobg 파일이 없습니다. 복구를 시도합니다:', nobgAbsPath);
            
            // 원본 파일 경로 추출 (해시를 통해)
            const fileName = path.basename(nobgAbsPath);
            const hashPrefix = fileName.replace('_nobg.png', '');
            
            // uploads 폴더에서 해당 해시로 시작하는 원본 파일 찾기
            const uploadsDir = path.join(__dirname, 'uploads');
            let originalFile = null;
            
            try {
                const files = fs.readdirSync(uploadsDir);
                for (const file of files) {
                    if (file.includes(hashPrefix) && !file.includes('_nobg') && !file.includes('_preview') && !file.includes('_brush')) {
                        originalFile = path.join(uploadsDir, file);
                        break;
                    }
                }
            } catch (readdirError) {
                console.error('❌ uploads 디렉토리 읽기 실패:', readdirError);
            }
            
            if (originalFile && fs.existsSync(originalFile)) {
                console.log('🔄 원본 파일을 찾았습니다. nobg 파일을 재생성합니다:', originalFile);
                
                try {
                    // 배경 제거 재실행
                    await runPythonScript('u2net_remove_bg.py', [
                        originalFile,
                        nobgAbsPath,
                        'false', // alpha_matting
                        '120',   // fg_threshold
                        '60',    // bg_threshold  
                        '1'      // erode_size
                    ]);
                    
                    // 재생성된 파일 확인
                    if (fs.existsSync(nobgAbsPath)) {
                        console.log('✅ nobg 파일 재생성 성공:', nobgAbsPath);
                    } else {
                        throw new Error('nobg 파일 재생성에 실패했습니다');
                    }
                } catch (regenerateError) {
                    console.error('❌ nobg 파일 재생성 실패:', regenerateError);
                    throw new Error(`nobg 파일을 재생성할 수 없습니다: ${regenerateError.message}`);
                }
            } else {
                throw new Error(`nobg 파일과 원본 파일을 모두 찾을 수 없습니다: ${nobgAbsPath}`);
            }
        }
        
        // 브러쉬 효과 적용 (전경에만)
        const brushPath = nobgAbsPath.replace('_nobg.png', '_brush.png');
        console.log('🎨 Python 브러시 효과 스크립트 실행:', brushPath);
        
        try {
            await runPythonScript('brush_effect_light.py', [nobgAbsPath, brushPath]);
        } catch (pythonError) {
            console.error('❌ Python 브러시 효과 스크립트 실행 실패:', pythonError);
            throw new Error(`브러시 효과 스크립트 실행 실패: ${pythonError.message}`);
        }
        
        // 브러시 효과 결과 파일 존재 확인
        try {
            await fs.promises.access(brushPath, fs.constants.F_OK);
            console.log('✅ 브러시 효과 파일 생성 완료:', brushPath);
        } catch (accessError) {
            console.error('❌ 브러시 효과 파일 생성 실패:', brushPath);
            throw new Error(`브러시 효과 적용 실패: 결과 파일이 생성되지 않았습니다`);
        }
        
        // 최종 합성 (브러시 효과 적용된 전경 + 배경) - Sharp 사용
        const outputPath = nobgAbsPath.replace('_nobg.png', `_brush_${emotion || 'neutral'}_${Date.now()}.png`);
        console.log('🔧 Sharp로 최종 합성 시작...');
        try {
            const sharp = require('sharp');
            
            // 브러시 이미지 크기 확인
            const brushMetadata = await sharp(brushPath).metadata();
            let finalWidth = brushMetadata.width;
            let finalHeight = brushMetadata.height;
            
            // 브러시 이미지가 작으면 최소 크기로 확대
            const minFinalSize = 1200; // 최종 출력 최소 크기
            if (finalWidth < minFinalSize || finalHeight < minFinalSize) {
                const scale = minFinalSize / Math.max(finalWidth, finalHeight);
                finalWidth = Math.round(finalWidth * scale);
                finalHeight = Math.round(finalHeight * scale);
                console.log(`최종 출력 크기 조정: ${brushMetadata.width}x${brushMetadata.height} → ${finalWidth}x${finalHeight}`);
            }
            
            // 배경 이미지를 최종 크기로 리사이즈
            const backgroundBuffer = await sharp(bgAbsPath)
                .resize(finalWidth, finalHeight, { fit: 'cover' })
                .png()
                .toBuffer();
            
            // 브러쉬 이미지를 최종 크기에 맞게 리사이즈 (고품질 보간)
            const resizedBrushBuffer = await sharp(brushPath)
                .resize(finalWidth, finalHeight, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 },
                    kernel: sharp.kernel.lanczos3  // 고품질 보간
                })
                .png()
                .toBuffer();
            
            // 합성
            await sharp(backgroundBuffer)
                .composite([{ input: resizedBrushBuffer, top: 0, left: 0, blend: 'over' }])
                .png()
                .toFile(outputPath);
            console.log('✅ Sharp 최종 합성 완료:', outputPath);
        } catch (sharpError) {
            console.error('❌ Sharp 최종 합성 실패:', sharpError.message);
            // 폴백: 브러시 파일을 그대로 복사
            await fs.promises.copyFile(brushPath, outputPath);
        }
        
        await fs.promises.access(outputPath, fs.constants.F_OK).catch(() => { throw new Error('최종 합성 실패'); });
        
        console.log('브러시 효과 완료:', outputPath);
        
        // 임시 파일 정리 (nobg, brush, preview 파일 삭제)
        fs.promises.unlink(nobgAbsPath).catch(() => {});
        fs.promises.unlink(brushPath).catch(() => {});
        
        // 기존 preview 파일들도 정리
        const uploadsDir = path.join(__dirname, 'uploads');
        fs.readdir(uploadsDir, (err, files) => {
            if (!err) {
                files.filter(file => file.includes('_preview_')).forEach(file => {
                    fs.promises.unlink(path.join(uploadsDir, file)).catch(() => {});
                });
            }
        });

        res.json({
            processedImageUrl: '/uploads/' + path.basename(outputPath),
            emotion,
            background: backgroundPath,
            feedback: getEmotionFeedback(emotion),
            savedToGallery: false,
            step: 2 // 2단계 완료 표시
        });
        
    } catch (error) {
        console.error('브러시 효과 API 오류:', error);
        res.status(500).json({ error: error.message });
    } finally {
        // 🎯 처리 상태 초기화
        brushProcessingState.isProcessing = false;
        brushProcessingState.currentRequest = null;
        console.log('🔄 브러시 효과 처리 상태 초기화');
    }
});

// 예시: processImagePipeline 복구
async function processImagePipeline({ inputPath, outputPath, emotion, backgroundPath }) {
    const nobgPath = inputPath.replace(path.extname(inputPath), '_nobg.png');
    
    // 1. 배경 제거
    await runPythonScript('u2net_remove_bg.py', [inputPath, nobgPath, 'false', '120', '60', '1']);
    await fs.promises.access(nobgPath, fs.constants.F_OK).catch(() => { throw new Error('배경 제거 실패'); });
    
    // 2. 브러쉬 효과 + 합성 (Sharp 사용)
    const brushPath = nobgPath.replace('_nobg.png', '_brush.png');
    await runPythonScript('brush_effect_light.py', [nobgPath, brushPath]);
    
    // Sharp로 합성
    const sharp = require('sharp');
    const backgroundBuffer = await sharp(backgroundPath)
        .resize(1121, 1500, { fit: 'cover' })
        .png()
        .toBuffer();
    
    await sharp(backgroundBuffer)
        .composite([{ input: brushPath, top: 0, left: 0, blend: 'over' }])
        .png()
        .toFile(outputPath);
    
    await fs.promises.access(outputPath, fs.constants.F_OK).catch(() => { throw new Error('이미지 합성 결과가 생성되지 않았습니다.'); });
    
    // 3. 임시 파일 정리
    fs.promises.unlink(nobgPath).catch(() => {});
    
    return outputPath;
}

// 예시: 감정 분석 API 복구
app.post('/analyze-emotion', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) throw new Error('이미지가 업로드되지 않았습니다.');
        // Python 직접 실행 방식
        console.log('🔍 감정 분석 요청:', req.file.path);
        const rawOutput = await runPythonScript('emotion_analysis.py', [req.file.path]);
        console.log('📊 감정 분석 원시 결과:', rawOutput);
        
        // JSON 파싱: 마지막 줄이 JSON 결과
        const lines = rawOutput.trim().split('\n');
        const jsonLine = lines[lines.length - 1];
        const emotionData = JSON.parse(jsonLine);
        console.log('📊 파싱된 감정 분석 결과:', emotionData);
        
        // 결과에 추가 정보 포함
        if (emotionData && emotionData.emotion) {
            emotionData.analysis_timestamp = new Date().toISOString();
            emotionData.image_path = req.file.path;
            // 감정별 피드백 메시지 추가
            emotionData.feedback = getEmotionFeedback(emotionData.emotion);
        }
        
        res.json(emotionData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 감정에 따른 명화 추천 API
app.get('/api/recommend-artworks/:emotion', (req, res) => {
    const emotion = req.params.emotion;
    
    // 감정별 명화 매핑
    const artworkMap = {
        'happy': [
            {
                id: 'breezing_up',
                title: '바람을 타고',
                artist: 'Winslow Homer',
                image: '/BG_image/breezing_up_a_fair_wind_1943.13.1.jpg',
                style: 'impressionist'
            },
            {
                id: 'dance_hall',
                title: '댄스 홀',
                artist: 'Pierre-Auguste Renoir',
                image: '/BG_image/dance_hall_bellevue_obverse_1989.60.1.a.jpg',
                style: 'impressionist'
            },
            {
                id: 'harvest',
                title: '수확',
                artist: 'Vincent van Gogh',
                image: '/BG_image/the_harvest_1985.64.91.jpg',
                style: 'post_impressionist'
            },
            {
                id: 'orchard',
                title: '꽃 핀 과수원',
                artist: 'Alfred Sisley',
                image: '/BG_image/orchard_in_bloom_louveciennes_1970.17.51.jpg',
                style: 'impressionist'
            }
        ],
        'sad': [
            {
                id: 'crucifixion',
                title: '작은 십자가',
                artist: 'Grunewald',
                image: '/BG_image/the_small_crucifixion_1961.9.19.jpg',
                style: 'expressionist'
            },
            {
                id: 'evening_deluge',
                title: '대홍수의 저녁',
                artist: 'John Martin',
                image: '/BG_image/the_evening_of_the_deluge_1960.6.40.jpg',
                style: 'romantic'
            },
            {
                id: 'ships_distress',
                title: '위험에 처한 배들',
                artist: 'Claude-Joseph Vernet',
                image: '/BG_image/ships_in_distress_off_a_rocky_coast_1985.29.1.jpg',
                style: 'romantic'
            },
            {
                id: 'sebastian',
                title: '성 세바스티안',
                artist: 'Georges de La Tour',
                image: '/BG_image/saint_sebastian_succored_by_the_holy_women_1960.6.4.jpg',
                style: 'baroque'
            }
        ],
        'angry': [
            {
                id: 'devil_words',
                title: '악마의 말',
                artist: 'Paul Gauguin',
                image: '/BG_image/parau_na_te_varua_ino_words_of_the_devil_1972.9.12.jpg',
                style: 'post_impressionist'
            },
            {
                id: 'battle_love',
                title: '사랑의 전투',
                artist: 'Nicolas Poussin',
                image: '/BG_image/the_battle_of_love_1972.9.2.jpg',
                style: 'classical'
            },
            {
                id: 'tiger_snake',
                title: '호랑이와 뱀',
                artist: 'Henri Rousseau',
                image: '/BG_image/tiger_and_snake_2014.136.30.jpg',
                style: 'naive'
            },
            {
                id: 'scenes_legend',
                title: '전설의 장면',
                artist: 'Unknown',
                image: '/BG_image/scenes_from_a_legend_1939.1.344.b.jpg',
                style: 'medieval'
            }
        ],
        'surprised': [
            {
                id: 'bathers',
                title: '목욕하는 사람들',
                artist: 'Paul Cézanne',
                image: '/BG_image/the_bathers_1951.5.1.jpg',
                style: 'post_impressionist'
            },
            {
                id: 'festival_harbor',
                title: '항구의 축제',
                artist: 'Eugène Boudin',
                image: '/BG_image/festival_in_the_harbor_of_honfleur_1983.1.10.jpg',
                style: 'impressionist'
            },
            {
                id: 'colza_harvest',
                title: '유채 수확',
                artist: 'Vincent van Gogh',
                image: '/BG_image/the_colza_harvesting_rapeseed_2014.136.21.jpg',
                style: 'post_impressionist'
            },
            {
                id: 'dance_class',
                title: '댄스 클래스',
                artist: 'Edgar Degas',
                image: '/BG_image/the_dance_class_2014.79.710.jpg',
                style: 'impressionist'
            }
        ],
        'neutral': [
            {
                id: 'intro_bg',
                title: '풍경',
                artist: 'Claude Monet',
                image: '/BG_image/intro_bg.jpg',
                style: 'impressionist'
            },
            {
                id: 'landscape_auvergne',
                title: '오베르뉴 풍경',
                artist: 'Jean-Baptiste-Camille Corot',
                image: '/BG_image/landscape_1969.14.1.jpg',
                style: 'realist'
            },
            {
                id: 'farmhouse_provence',
                title: '프로방스의 농가',
                artist: 'Vincent van Gogh',
                image: '/BG_image/farmhouse_in_provence_1970.17.34.jpg',
                style: 'post_impressionist'
            },
            {
                id: 'harbor_lorient',
                title: '로리앙 항구',
                artist: 'Berthe Morisot',
                image: '/BG_image/the_harbor_at_lorient_1970.17.48.jpg',
                style: 'impressionist'
            }
        ]
    };

    const artworks = artworkMap[emotion] || artworkMap['neutral'];
    
    res.json({
        emotion: emotion,
        artworks: artworks
    });
});

// 스타일 변환 API
app.post('/style-transfer', upload.single('image'), async (req, res) => {
    console.log('스타일 변환 API 호출됨');
    
    try {
        if (!req.file) {
            throw new Error('이미지가 업로드되지 않았습니다.');
        }

        const style = req.body.style || 'impressionism';
        console.log('선택된 스타일:', style);

        // Python 환경 확인
        await checkPythonEnvironment();

        const inputPath = req.file.path;
        const outputPath = inputPath.replace(path.extname(inputPath), '_styled.png');

        console.log('입력 파일:', inputPath);
        console.log('출력 파일:', outputPath);

        // 배경 이미지 선택 (감정과 스타일에 따라)
        let bgImagePath;
        switch (style) {
            case 'impressionist':
                bgImagePath = path.join(__dirname, 'BG_image', 'breezing_up_a_fair_wind_1943.13.1.jpg');
                break;
            case 'expressionist':
                bgImagePath = path.join(__dirname, 'BG_image', 'the_small_crucifixion_1961.9.19.jpg');
                break;
            case 'abstract':
                bgImagePath = path.join(__dirname, 'BG_image', 'parau_na_te_varua_ino_words_of_the_devil_1972.9.12.jpg');
                break;
            case 'realistic':
                bgImagePath = path.join(__dirname, 'BG_image', 'the_bathers_1951.5.1.jpg');
                break;
            default:
                bgImagePath = path.join(__dirname, 'BG_image', 'intro_bg.jpg');
        }

        console.log('배경 이미지:', bgImagePath);

        // Python 스크립트를 사용하여 이미지 합성
        await runPythonScript('emotion_art_style.py', [
            inputPath, 
            outputPath, 
            'neutral', // 기본 감정
            style, 
            bgImagePath
        ]);

        if (!fs.existsSync(outputPath)) {
            throw new Error('결과 파일이 생성되지 않았습니다.');
        }

        const relativePath = path.relative(__dirname, outputPath).replace(/\\/g, '/');
        res.json({
            styledImageUrl: '/' + relativePath
        });

    } catch (error) {
        console.error('스타일 변환 중 오류:', error);
        res.status(500).json({
            error: error.message || '스타일 변환 중 오류가 발생했습니다.'
        });
    }
});

// /api/emotion-art 파이프라인 FastAPI 연동
app.post('/api/emotion-art', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) throw new Error('이미지가 업로드되지 않았습니다.');
        const { style, emotion, backgroundImage } = req.body;
        const userEmotion = emotion || 'neutral';
        let bgImage;
        if (backgroundImage) {
            bgImage = path.basename(backgroundImage);
        } else {
            switch (userEmotion) {
                case 'happy': bgImage = 'breezing_up_a_fair_wind_1943.13.1.jpg'; break;
                case 'sad': bgImage = 'the_small_crucifixion_1961.9.19.jpg'; break;
                case 'angry': bgImage = 'parau_na_te_varua_ino_words_of_the_devil_1972.9.12.jpg'; break;
                case 'surprised': bgImage = 'the_bathers_1951.5.1.jpg'; break;
                default: bgImage = 'intro_bg.jpg';
            }
        }
        const inputPath = req.file.path;
        const outputPath = inputPath.replace(path.extname(inputPath), `_art_${Date.now().toString().slice(-6)}.png`);
        const backgroundPath = path.join(__dirname, 'BG_image', bgImage);
        await processImagePipeline({ inputPath, outputPath, style, emotion: userEmotion, backgroundPath });
        const relativePath = path.relative(__dirname, outputPath).replace(/\\/g, '/');
        res.json({ success: true, styledImageUrl: '/' + relativePath, nobgImageUrl: '/uploads/...' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// /generate-art 파이프라인 FastAPI 연동
app.post('/generate-art', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) throw new Error('이미지가 업로드되지 않았습니다.');
        const { style, emotion } = req.body;
        if (!style || !emotion) throw new Error('스타일과 감정 정보가 필요합니다.');
        const inputPath = req.file.path;
        const outputPath = inputPath.replace(path.extname(inputPath), `_art_${Date.now().toString().slice(-6)}.png`);
        let bgImagePath;
        switch (style) {
            case 'impressionist': bgImagePath = path.join(__dirname, 'BG_image', 'breezing_up_a_fair_wind_1943.13.1.jpg'); break;
            case 'expressionist': bgImagePath = path.join(__dirname, 'BG_image', 'the_small_crucifixion_1961.9.19.jpg'); break;
            case 'abstract': bgImagePath = path.join(__dirname, 'BG_image', 'parau_na_te_varua_ino_words_of_the_devil_1972.9.12.jpg'); break;
            case 'realistic': bgImagePath = path.join(__dirname, 'BG_image', 'the_bathers_1951.5.1.jpg'); break;
            default: bgImagePath = path.join(__dirname, 'BG_image', 'intro_bg.jpg');
        }
        await processImagePipeline({ inputPath, outputPath, style, emotion, backgroundPath: bgImagePath });
        const relativePath = path.relative(__dirname, outputPath).replace(/\\/g, '/');
        res.json({ success: true, artImageUrl: '/' + relativePath, nobgImageUrl: '/uploads/...' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 브러쉬 효과만 적용 API
app.post('/api/brush-effect-only', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) throw new Error('이미지가 업로드되지 않았습니다.');
        const ext = path.extname(req.file.originalname) || '.png';
        const baseName = path.basename(req.file.filename, path.extname(req.file.filename));
        const brushedPath = path.join('uploads', `${baseName}_brush.png`);
        await runPythonScript('brush_effect_light.py', [req.file.path, brushedPath]);
        if (!fs.existsSync(brushedPath)) throw new Error('브러쉬 효과 적용 실패');
        // 임시 파일 정리 (원본)
        fs.promises.unlink(req.file.path).catch(()=>{});
        res.json({ resultUrl: `/${brushedPath.replace(/\\/g, '/')}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 브러쉬 효과 + 배경 합성 API 복구 (Python 직접 실행)
app.post('/api/brush-composite', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) throw new Error('이미지가 업로드되지 않았습니다.');
        const emotion = req.body.emotion || 'neutral';
        const backgroundPath = req.body.backgroundPath;
        if (!backgroundPath) throw new Error('배경 이미지가 지정되지 않았습니다.');
        let bgAbsPath = backgroundPath;
        if (bgAbsPath.startsWith('/BG_image/')) {
            bgAbsPath = path.join(__dirname, bgAbsPath.replace(/^\//, ''));
        } else if (!path.isAbsolute(bgAbsPath)) {
            bgAbsPath = path.join(__dirname, 'BG_image', bgAbsPath);
        }
        // 이미지 크기 최적화 (User-Agent 기반 모바일 최적화)
        let optimizedInputPath = req.file.path;
        try {
            const userAgent = req.headers['user-agent'] || '';
            optimizedInputPath = await optimizeImageSize(req.file.path, userAgent, 1500);
            console.log('이미지 크기 최적화 완료:', optimizedInputPath);
        } catch (error) {
            console.log('이미지 최적화 실패, 원본 사용:', error.message);
        }
        
        const ext = path.extname(optimizedInputPath);
        const baseName = path.basename(optimizedInputPath, ext);
        const nobgPath = optimizedInputPath.replace(ext, '_nobg.png');
        const brushPath = optimizedInputPath.replace(ext, '_brush.png');
        const outputPath = path.join(uploadDir, `${baseName}_final_${Date.now()}.png`);
        // 1. 배경 제거 (Python 직접 실행)
        await runPythonScript('u2net_remove_bg.py', [optimizedInputPath, nobgPath, 'false', '240', '10', '1']);
        await fs.promises.access(nobgPath, fs.constants.F_OK).catch(() => { throw new Error('배경 제거 실패'); });
        
        // 2. 브러쉬 효과 (Python 직접 실행)
        await runPythonScript('brush_effect_light.py', [nobgPath, brushPath]);
        await fs.promises.access(brushPath, fs.constants.F_OK).catch(() => { throw new Error('브러쉬 효과 적용 실패'); });
        // 3. 배경 합성 (Sharp 사용)
        const sharp = require('sharp');
        const backgroundBuffer = await sharp(bgAbsPath)
            .resize(1121, 1500, { fit: 'cover' })
            .png()
            .toBuffer();
        
        await sharp(backgroundBuffer)
            .composite([{ input: brushPath, top: 0, left: 0, blend: 'over' }])
            .png()
            .toFile(outputPath);
        
        await fs.promises.access(outputPath, fs.constants.F_OK).catch(() => { throw new Error('최종 합성 이미지 생성 실패'); });
        // 중간 파일 삭제
        fs.promises.unlink(brushPath).catch(() => {});
        
        // 중간 파일 삭제
        fs.promises.unlink(nobgPath).catch(() => {});
        // 결과 반환
        res.json({
            resultUrl: '/' + path.relative(__dirname, outputPath).replace(/\\/g, '/'),
            savedToGallery: false // 필요시 갤러리 저장 로직 추가
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 사용자 인증 관련 API

// 회원가입 API
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        // 입력 검증
        if (!username || !email || !password) {
            return res.status(400).json({
                error: '모든 필드를 입력해주세요.'
            });
        }
        
        if (password.length < 6) {
            return res.status(400).json({
                error: '비밀번호는 최소 6자 이상이어야 합니다.'
            });
        }
        
        // 이메일 형식 검증
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                error: '올바른 이메일 형식을 입력해주세요.'
            });
        }
        
        // 중복 사용자 확인
        const existingUser = users.find(user => 
            user.email === email || user.username === username
        );
        
        if (existingUser) {
            return res.status(409).json({
                error: '이미 존재하는 사용자입니다.'
            });
        }
        
        // 비밀번호 해싱
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // 새 사용자 생성
        const newUser = {
            id: Date.now().toString(),
            username,
            email,
            password: hashedPassword,
            createdAt: new Date().toISOString()
        };
        
        users.push(newUser);
        saveUsers();
        
        // JWT 토큰 생성
        const token = jwt.sign(
            { userId: newUser.id, email: newUser.email },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.status(201).json({
            message: '회원가입이 완료되었습니다.',
            token,
            user: {
                id: newUser.id,
                username: newUser.username,
                email: newUser.email
            }
        });
        
    } catch (error) {
        console.error('회원가입 오류:', error);
        res.status(500).json({
            error: '회원가입 중 오류가 발생했습니다.'
        });
    }
});

// 로그인 API
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // 입력 검증
        if (!email || !password) {
            return res.status(400).json({
                error: '이메일과 비밀번호를 입력해주세요.'
            });
        }
        
        // 사용자 찾기
        const user = users.find(u => u.email === email);
        
        if (!user) {
            return res.status(401).json({
                error: '이메일 또는 비밀번호가 올바르지 않습니다.'
            });
        }
        
        // 비밀번호 확인
        const isValidPassword = await bcrypt.compare(password, user.password);
        
        if (!isValidPassword) {
            return res.status(401).json({
                error: '이메일 또는 비밀번호가 올바르지 않습니다.'
            });
        }
        
        // JWT 토큰 생성
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json({
            message: '로그인이 완료되었습니다.',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email
            }
        });
        
    } catch (error) {
        console.error('로그인 오류:', error);
        res.status(500).json({
            error: '로그인 중 오류가 발생했습니다.'
        });
    }
});

// 사용자 정보 조회 API
app.get('/api/auth/profile', (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({
                error: '인증 토큰이 필요합니다.'
            });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = users.find(u => u.id === decoded.userId);
        
        if (!user) {
            return res.status(404).json({
                error: '사용자를 찾을 수 없습니다.'
            });
        }
        
        res.json({
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                createdAt: user.createdAt
            }
        });
        
    } catch (error) {
        console.error('사용자 정보 조회 오류:', error);
        res.status(401).json({
            error: '유효하지 않은 토큰입니다.'
        });
    }
});

// 로그아웃 API (클라이언트에서 토큰 삭제)
app.post('/api/auth/logout', (req, res) => {
    res.json({
        message: '로그아웃되었습니다.'
    });
});

// My Art DB 초기화
if (!fs.existsSync(MYART_DB)) fs.writeFileSync(MYART_DB, '[]', 'utf-8');

// My Art 저장 API
app.post('/api/my-art', (req, res) => {
    const { imageUrl, createdAt } = req.body;
    if (!imageUrl) return res.status(400).json({ success: false, error: 'imageUrl required' });
    let db = JSON.parse(fs.readFileSync(MYART_DB, 'utf-8'));
    db.unshift({ imageUrl, createdAt: createdAt || Date.now() });
    fs.writeFileSync(MYART_DB, JSON.stringify(db, null, 2), 'utf-8');
    res.json({ success: true });
});

// My Art 갤러리 API
app.get('/api/my-art', async (req, res) => {
    try {
        // myart.json 파일에서 데이터 읽기
        if (!fs.existsSync(MYART_DB)) {
            return res.json({
                success: true,
                items: []
            });
        }

        const data = JSON.parse(fs.readFileSync(MYART_DB, 'utf-8'));
        
        res.json({
            success: true,
            items: data
        });

    } catch (error) {
        console.error('My Art 갤러리 조회 중 오류:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'My Art 갤러리 조회 중 오류가 발생했습니다.'
        });
    }
});

// [추가] 인증된 사용자의 갤러리 반환 API (Firestore 기반)
app.get('/api/gallery', authenticateToken, async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: 'Firebase Admin이 초기화되지 않았습니다.' });
    }
    try {
        const userId = req.user.uid;
        const isCustomUser = req.user.custom;
        console.log('🔍 갤러리 조회 요청:', { userId, isCustomUser });
        
        const snapshot = await db.collection('gallery').where('userId', '==', userId).get();
        const gallery = [];
        snapshot.forEach(doc => gallery.push({ id: doc.id, ...doc.data() }));
        console.log(`✅ 갤러리 조회 완료: ${gallery.length}개 항목`);
        res.json({ success: true, gallery });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// [추가] 갤러리에 이미지 저장 API
app.post('/api/gallery', authenticateToken, async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: 'Firebase Admin이 초기화되지 않았습니다.' });
    }
    
    try {
        const userId = req.user.uid;
        const isCustomUser = req.user.custom;
        const { imageUrl, title, emotion, background } = req.body;
        
        console.log('🏠 갤러리 저장 요청:', {
            userId,
            isCustomUser,
            imageUrl: imageUrl?.substring(0, 50) + '...',
            title,
            emotion,
            background: background?.substring(0, 50) + '...'
        });
        
        if (!imageUrl) {
            return res.status(400).json({ success: false, error: '이미지 URL이 필요합니다.' });
        }
        
        // 갤러리 항목 생성
        const galleryItem = {
            userId,
            userType: isCustomUser ? 'custom' : 'firebase',
            imageUrl,
            title: title || '나의 작품',
            emotion: emotion || 'neutral',
            background: background || '',
            createdAt: new Date().toISOString(),
            date: new Date().toLocaleDateString('ko-KR')
        };
        
        const docRef = await db.collection('gallery').add(galleryItem);
        console.log(`✅ 갤러리에 저장 완료: ${docRef.id}`);
        
        res.json({ 
            success: true, 
            id: docRef.id,
            message: '갤러리에 성공적으로 저장되었습니다.'
        });
        
    } catch (error) {
        console.error('갤러리 저장 오류:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// [추가] 갤러리 선택삭제 API
app.post('/api/gallery/batch-delete', authenticateToken, async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: 'Firebase Admin이 초기화되지 않았습니다.' });
    }
    
    try {
        const userId = req.user.uid;
        const isCustomUser = req.user.custom;
        const { ids } = req.body;
        
        console.log('🗑️ 갤러리 선택삭제 요청:', {
            userId,
            isCustomUser,
            itemCount: ids?.length || 0,
            ids: ids
        });
        
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, error: '삭제할 항목 ID가 필요합니다.' });
        }
        
        // 배치 삭제 실행
        const batch = db.batch();
        let deletedCount = 0;
        
        for (const id of ids) {
            try {
                // 먼저 해당 문서가 현재 사용자의 것인지 확인
                const docRef = db.collection('gallery').doc(id);
                const doc = await docRef.get();
                
                if (doc.exists) {
                    const data = doc.data();
                    if (data.userId === userId) {
                        batch.delete(docRef);
                        deletedCount++;
                        console.log(`📝 삭제 예정: ${id}`);
                    } else {
                        console.log(`⚠️ 권한 없음: ${id} (다른 사용자 소유)`);
                    }
                } else {
                    console.log(`❌ 문서 없음: ${id}`);
                }
            } catch (error) {
                console.error(`❌ 문서 ${id} 처리 오류:`, error);
            }
        }
        
        if (deletedCount === 0) {
            return res.status(400).json({ 
                success: false, 
                error: '삭제할 수 있는 항목이 없습니다.' 
            });
        }
        
        // 배치 실행
        await batch.commit();
        
        console.log(`✅ 갤러리 선택삭제 완료: ${deletedCount}개 항목`);
        
        res.json({ 
            success: true, 
            deletedCount,
            message: `${deletedCount}개 항목이 성공적으로 삭제되었습니다.`
        });
        
    } catch (error) {
        console.error('갤러리 선택삭제 오류:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// [추가] 갤러리 전체삭제 API
app.delete('/api/gallery/all', authenticateToken, async (req, res) => {
    if (!db) {
        return res.status(503).json({ success: false, error: 'Firebase Admin이 초기화되지 않았습니다.' });
    }
    
    try {
        const userId = req.user.uid;
        const isCustomUser = req.user.custom;
        
        console.log('🗑️ 갤러리 전체삭제 요청:', { userId, isCustomUser });
        
        // 현재 사용자의 모든 갤러리 항목 조회
        const snapshot = await db.collection('gallery').where('userId', '==', userId).get();
        
        if (snapshot.empty) {
            return res.json({ 
                success: true, 
                deletedCount: 0,
                message: '삭제할 항목이 없습니다.' 
            });
        }
        
        // 배치 삭제 실행
        const batch = db.batch();
        let deletedCount = 0;
        
        snapshot.forEach(doc => {
            batch.delete(doc.ref);
            deletedCount++;
        });
        
        await batch.commit();
        
        console.log(`✅ 갤러리 전체삭제 완료: ${deletedCount}개 항목`);
        
        res.json({ 
            success: true, 
            deletedCount,
            message: `${deletedCount}개 항목이 성공적으로 삭제되었습니다.`
        });
        
    } catch (error) {
        console.error('갤러리 전체삭제 오류:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// SPA용 catch-all 라우트
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 건강 확인 엔드포인트 (Render 배포용)
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        env: NODE_ENV
    });
});

// 에러 핸들링 미들웨어
app.use((err, req, res, next) => {
    console.error('서버 에러:', err);
    res.status(500).json({
        error: err.message || '서버 에러가 발생했습니다.'
    });
});

// 서버 시작
const server = app.listen(port, async () => {
    console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
    console.log('업로드 디렉토리:', uploadDir);
    try {
        await checkPythonEnvironment();
        console.log('Python 환경 확인 완료');
    } catch (error) {
        console.error('Python 환경 확인 실패:', error);
    }
});

// 포트 충돌 등 서버 에러 핸들링
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`포트 ${port}가 이미 사용 중입니다. 다른 프로세스를 종료하거나, 포트를 변경하세요.`);
    } else {
        console.error('서버 실행 중 에러:', err);
    }
}); 

// [신규] 서버 내 파일 경로만 받아 합성하는 API
app.post('/api/composite', async (req, res) => {
    try {
        const { nobgPath, backgroundPath, emotion } = req.body;
        console.log('[DEBUG] 전달받은 nobgPath:', nobgPath);
        if (!nobgPath || !backgroundPath) {
            return res.status(400).json({ error: 'nobgPath, backgroundPath가 필요합니다.' });
        }
        // 절대경로 변환 (경로 보정)
        const fgAbsPath = path.resolve(__dirname, nobgPath.replace(/^\\|^\//, '').replace(/\//g, path.sep));
        console.log('[DEBUG] 변환된 fgAbsPath:', fgAbsPath);
        const fgExists = fs.existsSync(fgAbsPath);
        console.log('[DEBUG] 파일 존재 여부:', fgExists);
        if (!fgExists) return res.status(404).json({ error: '전경 이미지가 존재하지 않습니다.' });
        const bgAbsPath = path.resolve(__dirname, backgroundPath.replace(/^\\|^\//, '').replace(/\//g, path.sep));
        if (!fs.existsSync(bgAbsPath)) return res.status(404).json({ error: '배경 이미지가 존재하지 않습니다.' });
        // 결과 파일명 생성
        const baseName = path.basename(fgAbsPath, path.extname(fgAbsPath));
        const shortTimestamp = Date.now().toString().slice(-6);
        const outputPath = path.join(uploadDir, `${baseName}_${emotion||'neutral'}_${shortTimestamp}_composite.png`);
        // 합성 실행 (Sharp 사용)
        const sharp = require('sharp');
        const backgroundBuffer = await sharp(bgAbsPath)
            .resize(1121, 1500, { fit: 'cover' })
            .png()
            .toBuffer();
        
        await sharp(backgroundBuffer)
            .composite([{ input: fgAbsPath, top: 0, left: 0, blend: 'over' }])
            .png()
            .toFile(outputPath);
        
        if (!fs.existsSync(outputPath)) throw new Error('합성 결과 파일이 생성되지 않았습니다.');
        const stats = fs.statSync(outputPath);
        if (stats.size < 1024) throw new Error('합성 결과 파일이 손상되었습니다.');
        const relativePath = '/' + path.relative(__dirname, outputPath).replace(/\\/g, '/');
        res.json({ success: true, compositeImageUrl: relativePath });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}); 

// 반드시 맨 마지막에 위치!
app.get('/uploads/:filename', (req, res) => {
    console.log('커스텀 업로드 라우터 동작:', req.params.filename);
    const filePath = path.join(__dirname, 'uploads', req.params.filename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    fs.createReadStream(filePath).pipe(res);
}); 

function resizeImageForMobile(file, maxSize = 1024) {
    return new Promise((resolve) => {
        const img = new Image();
        const reader = new FileReader();
        reader.onload = (e) => {
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                if (width > maxSize || height > maxSize) {
                    if (width > height) {
                        height *= maxSize / width;
                        width = maxSize;
                    } else {
                        width *= maxSize / height;
                        height = maxSize;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    resolve(blob);
                }, 'image/jpeg', 0.92);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function downloadImage(url, filename = 'meart_result.png') {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}