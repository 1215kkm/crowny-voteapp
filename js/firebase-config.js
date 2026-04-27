// ========================================
// Firebase Configuration
// ========================================
// TODO: 아래 placeholder 값을 Firebase Console에서 발급받은 실제 값으로 교체하세요.
// Firebase Console > 프로젝트 설정 > 일반 > 내 앱 > Firebase SDK snippet > 구성
// ========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA2qYgn9-sFX3k0W1kDjV9eZjgo9ozsT3Y",
  authDomain: "crowny-appter.firebaseapp.com",
  projectId: "crowny-appter",
  storageBucket: "crowny-appter.firebasestorage.app",
  messagingSenderId: "85855432249",
  appId: "1:85855432249:web:318c24b01a9be166daa7e8",
  measurementId: "G-86ZZWE6PJ6"
};

const isPlaceholder = false;

let app, auth, db;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  console.warn("Firebase init failed:", e);
}

export { app, auth, db, isPlaceholder };
