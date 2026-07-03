// ========================================
// Firebase Configuration
// ========================================
// TODO: 아래 placeholder 값을 Firebase Console에서 발급받은 실제 값으로 교체하세요.
// Firebase Console > 프로젝트 설정 > 일반 > 내 앱 > Firebase SDK snippet > 구성
// ========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";
import { initializeAppCheck, ReCaptchaV3Provider, getToken } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-check.js";

// Firebase 콘솔 → App Check → reCAPTCHA v3 사이트키. 비어 있으면 App Check 미적용(사이트 정상 동작).
const APPCHECK_SITE_KEY = "";

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

let app, auth, db, functions, appCheck = null;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  functions = getFunctions(app, "us-central1");
  if (APPCHECK_SITE_KEY) {
    try {
      appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(APPCHECK_SITE_KEY),
        isTokenAutoRefreshEnabled: true
      });
    } catch (e) { console.warn("App Check init failed:", e); }
  }
} catch (e) {
  console.warn("Firebase init failed:", e);
}

// App Check 토큰 (없으면 빈 문자열 — enforce 전까지 서버가 허용)
export async function getAppCheckToken() {
  if (!appCheck) return "";
  try { const t = await getToken(appCheck, false); return t.token || ""; }
  catch (e) { return ""; }
}

export { app, auth, db, functions, isPlaceholder };
