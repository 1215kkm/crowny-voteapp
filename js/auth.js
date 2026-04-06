// ========================================
// Authentication Module - Google Login
// ========================================

import { auth } from "./firebase-config.js";
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
  authCallbacks.forEach((cb) => cb(currentUser));
});

// Expose to window for inline onclick handlers
window.appAuth = { loginWithGoogle, logout };
