// ========================================
// Authentication Module - Google Login + 이메일 회원가입/로그인
// ========================================

import { auth, db } from "./firebase-config.js";
import { ADMIN_EMAIL } from "./ai-config.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const provider = new GoogleAuthProvider();

let currentUser = null;
const authCallbacks = [];

export function loginWithGoogle() {
  return signInWithPopup(auth, provider).catch((error) => {
    if (error.code !== "auth/popup-closed-by-user") {
      console.error("Login error:", error);
      alert("로그인에 실패했습니다. 다시 시도해주세요.");
    }
    throw error;
  });
}

const EMAIL_ERROR_MSG = {
  "auth/email-already-in-use": "이미 가입된 이메일이에요. 로그인을 시도해보세요.",
  "auth/invalid-email": "이메일 형식이 올바르지 않아요.",
  "auth/weak-password": "비밀번호는 6자 이상이어야 해요.",
  "auth/user-not-found": "가입되지 않은 이메일이에요.",
  "auth/wrong-password": "비밀번호가 올바르지 않아요.",
  "auth/invalid-credential": "이메일 또는 비밀번호가 올바르지 않아요.",
  "auth/too-many-requests": "시도가 너무 많아요. 잠시 후 다시 시도해주세요."
};
function friendlyAuthError(error) {
  return EMAIL_ERROR_MSG[error && error.code] || "처리 중 오류가 발생했어요. 다시 시도해주세요.";
}

export async function signUpWithEmail(email, password, name) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (name) {
      try { await updateProfile(cred.user, { displayName: name }); } catch (e) {}
    }
    return cred.user;
  } catch (error) {
    throw new Error(friendlyAuthError(error));
  }
}

export async function loginWithEmail(email, password) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  } catch (error) {
    throw new Error(friendlyAuthError(error));
  }
}

export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    throw new Error(friendlyAuthError(error));
  }
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

// 로그인 시 프로필(email/name/photo/provider) users/{uid} 문서에 자가 갱신 — 관리자 회원목록 노출용
async function upsertUserProfile(user) {
  try {
    await setDoc(doc(db, "users", user.uid), {
      email: user.email || "",
      name: user.displayName || "",
      photo: user.photoURL || "",
      provider: (user.providerData && user.providerData[0] && user.providerData[0].providerId) || "unknown",
      lastLoginAt: serverTimestamp()
    }, { merge: true });
  } catch (e) { /* 규칙상 프로필 필드만 허용 — 실패해도 로그인 자체는 유지 */ }
}

// Listen for auth state changes
onAuthStateChanged(auth, (user) => {
  currentUser = user || null;
  if (currentUser) upsertUserProfile(currentUser);
  // analytics 이벤트에 uid 첨부
  import("./analytics.js").then((m) => {
    m.setAnalyticsUid?.(currentUser?.uid || "");
  }).catch(() => {});
  // 전역에 노출 — access-guard 가 관리자 면제 판단에 사용
  window.__currentUser = currentUser;
  authCallbacks.forEach((cb) => cb(currentUser));
});

// Expose to window for inline onclick handlers
window.appAuth = { loginWithGoogle, logout, signUpWithEmail, loginWithEmail, resetPassword };

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
