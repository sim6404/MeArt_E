const admin = require('firebase-admin');

// 환경 변수 우선, 없으면 로컬 파일 사용
let serviceAccount;

if (process.env.FIREBASE_PRIVATE_KEY) {
  // Render 배포 환경: 환경 변수 사용
  console.log('환경 변수를 사용하여 Firebase 설정');
  serviceAccount = {
    type: "service_account",
    project_id: "meart-471c2",
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
    universe_domain: "googleapis.com"
  };
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
} else {
  console.log('Firebase 설정 없음 - Firebase 기능 비활성화');
}

module.exports = admin; 