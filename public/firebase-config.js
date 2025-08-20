// Firebase 설정
const firebaseConfig = {
  apiKey: "AIzaSyBvAvG7c_ADEf2Ut0dw-GsOAgE7FRx759c",
  authDomain: "meart-471c2.firebaseapp.com",
  projectId: "meart-471c2",
  storageBucket: "meart-471c2.appspot.com",
  messagingSenderId: "808563988399",
  appId: "1:808563988399:web:your-app-id-here"
};

// Firebase 초기화
firebase.initializeApp(firebaseConfig);

// Firebase 서비스들
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage(); 