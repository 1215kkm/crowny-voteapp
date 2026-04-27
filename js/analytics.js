// ========================================
// Analytics - pageview 이벤트 기록
// ========================================

import { db } from "./firebase-config.js";
import {
  collection, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

function getReferrerSource() {
  const ref = document.referrer || "";
  if (!ref) return "direct";
  try {
    const url = new URL(ref);
    const host = url.hostname.toLowerCase();
    if (host.includes("google.")) return "google";
    if (host.includes("naver.")) return "naver";
    if (host.includes("daum.") || host.includes("kakao.")) return "kakao";
    if (host.includes("bing.")) return "bing";
    if (host.includes("instagram.") || host.includes("ig.me")) return "instagram";
    if (host.includes("facebook.") || host.includes("fb.com")) return "facebook";
    if (host.includes("twitter.") || host.includes("x.com")) return "twitter";
    if (host.includes("youtube.")) return "youtube";
    if (host.includes("threads.")) return "threads";
    if (host === window.location.hostname) return "internal";
    return host;
  } catch (e) { return "unknown"; }
}

const SESSION_KEY = "appter_session_id";
function getSessionId() {
  try {
    let s = sessionStorage.getItem(SESSION_KEY);
    if (!s) {
      s = "s_" + Math.random().toString(36).substring(2, 14) + Date.now().toString(36);
      sessionStorage.setItem(SESSION_KEY, s);
    }
    return s;
  } catch (e) { return "s_anon"; }
}

export async function trackPageview() {
  try {
    const data = {
      type: "pageview",
      page: window.location.pathname || "/",
      source: getReferrerSource(),
      referrer: (document.referrer || "").substring(0, 200),
      session: getSessionId(),
      ua: (navigator.userAgent || "").substring(0, 200),
      lang: navigator.language || "",
      createdAt: serverTimestamp()
    };
    await addDoc(collection(db, "events"), data);
  } catch (e) {
    // 분석 실패해도 사용자 경험에 영향 X
    console.warn("pageview tracking failed:", e?.message);
  }
}

// 페이지 로드 시 1회 자동 기록
if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => trackPageview());
  } else {
    trackPageview();
  }
}
