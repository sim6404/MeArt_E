const admin = require('firebase-admin');

// 환경 변수 우선, 없으면 로컬 파일 사용
let serviceAccount;

if (process.env.FIREBASE_PRIVATE_KEY) {
  // Render 배포 환경: 환경 변수 사용
  console.log('🔧 환경 변수를 사용하여 Firebase 설정');
  
  // 필수 환경 변수 검증
  const requiredEnvVars = [
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_PRIVATE_KEY_ID', 
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_CLIENT_ID',
    'FIREBASE_CLIENT_CERT_URL'
  ];
  
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    console.error('❌ Firebase 환경 변수 누락:', missingVars);
    serviceAccount = null;
  } else {
    try {
      // PEM 키 형식 검증 및 수정
      let privateKey = process.env.FIREBASE_PRIVATE_KEY;
      
      // 다양한 PEM 키 형식 처리
      if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
        // 환경 변수에서 개행 문자 처리
        privateKey = privateKey.replace(/\\n/g, '\n');
        
        // PEM 헤더/푸터가 없는 경우 추가
        if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
          privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;
        }
      }
      
      console.log('✅ Firebase 환경 변수 검증 완료');
      
      serviceAccount = {
        type: "service_account",
        project_id: "meart-471c2",
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: privateKey,
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
        universe_domain: "googleapis.com"
      };
    } catch (error) {
      console.error('❌ Firebase 환경 변수 처리 실패:', error.message);
      serviceAccount = null;
    }
  }
} else {
  // 로컬 개발 환경: JSON 파일 사용
  try {
    console.log('로컬 serviceAccountKey.json 파일 사용');
    serviceAccount = require('./serviceAccountKey.json');
  } catch (error) {
    console.log('Firebase 설정을 찾을 수 없습니다. Firebase 기능을 비활성화합니다.');
    serviceAccount = null;
  }
}

// Firebase Admin 초기화
if (serviceAccount) {
  try {
    // 기존 앱이 있는지 확인하고 제거
    if (admin.apps.length > 0) {
      admin.apps.forEach(app => {
        if (app) {
          app.delete();
        }
      });
    }
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: "meart-471c2",
      storageBucket: "meart-471c2.appspot.com"
    });
    console.log('✅ Firebase Admin 초기화 성공');
  } catch (error) {
    console.error('❌ Firebase Admin 초기화 실패:', error.message);
    console.error('📍 오류 상세:', error.stack);
    
    // Firebase Admin이 초기화되지 않아도 서버는 계속 실행
    // null을 반환하여 Firebase 기능 비활성화
    module.exports = null;
    return;
  }
} else {
  console.log('⚠️ Firebase 설정 없음 - Firebase 기능 비활성화');
  // null을 반환하여 Firebase 기능 비활성화
  module.exports = null;
  return;
}

module.exports = admin; 