const admin = require('firebase-admin');

// 서비스 계정 키 파일이 있는지 확인
let serviceAccount;
try {
  serviceAccount = require('./serviceAccountKey.json');
} catch (error) {
  console.log('서비스 계정 키 파일을 찾을 수 없습니다. 환경 변수나 기본 설정을 사용합니다.');
  // 서비스 계정 키 파일이 없을 경우 환경 변수나 기본 설정 사용
  serviceAccount = {
    type: "service_account",
    project_id: "meart-471c2",
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL
  };
}

// Firebase Admin 초기화
try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: "meart-471c2",
    storageBucket: "meart-471c2.appspot.com"
  });
  console.log('Firebase Admin 초기화 성공');
} catch (error) {
  console.error('Firebase Admin 초기화 실패:', error.message);
  // Firebase Admin이 초기화되지 않아도 서버는 계속 실행
}

module.exports = admin; 