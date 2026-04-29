// ========================================
// Authentication Module - Google Login
// ========================================

import { auth } from "./firebase-config.js";
import { ADMIN_EMAIL } from "./ai-config.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const provider = new GoogleAuthProvider();

let currentUser = null;
const authCallbacks = [];

export function loginWithGoogle() {
  return signInWithPopup(auth, provider).catch((error) => {
    if (error.code !== "auth/popup-closed-by-user") {
      console.error("Login error:", error);
      alert("로그인에 실패했습니다. 다시 시도해주세요.");
    }
  });
}

export function logout() {
  return signOut(auth).catch((error) => {
    console.error("Logout error:", error);
  });
}

export function onAuthChange(callback) {
  authCallbacks.push(callback);
  if (currentUser !== null) {
    callback(currentUser);
  }
}

export function getCurrentUser() {
  return currentUser;
}

// Listen for auth state changes
onAuthStateChanged(auth, (user) => {
  currentUser = user || null;
  // analytics 이벤트에 uid 첨부
  import("./analytics.js").then((m) => {
    m.setAnalyticsUid?.(currentUser?.uid || "");
  }).catch(() => {});
  // 전역에 노출 — access-guard 가 관리자 면제 판단에 사용
  window.__currentUser = currentUser;
  authCallbacks.forEach((cb) => cb(currentUser));
});

// Expose to window for inline onclick handlers
window.appAuth = { loginWithGoogle, logout };

// 관리자 링크 표시/숨김
function applyAdminUiOnce() {
  const apply = () => {
    const isAdmin = currentUser?.email === ADMIN_EMAIL;
    document.querySelectorAll("[data-admin-only]").forEach((el) => {
      el.style.display = isAdmin ? "" : "none";
    });
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply);
  } else {
    apply();
  }
}
applyAdminUiOnce();

// auth 변경 시 다시 적용
authCallbacks.push(() => {
  document.querySelectorAll("[data-admin-only]").forEach((el) => {
    el.style.display = (currentUser?.email === ADMIN_EMAIL) ? "" : "none";
  });
});
