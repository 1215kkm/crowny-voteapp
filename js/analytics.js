// ========================================
// Analytics - pageview / behavior events with UTM, device, country
// ========================================

import { db } from "./firebase-config.js";
import {
  collection, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ---- Referrer / Search keyword ----

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
    if (host.includes("tistory.")) return "tistory";
    if (host.includes("brunch.")) return "brunch";
    if (host.includes("medium.")) return "medium";
    if (host.includes("reddit.")) return "reddit";
    if (host.includes("linkedin.")) return "linkedin";
    if (host.includes("discord.")) return "discord";
    if (host === window.location.hostname) return "internal";
    return host;
  } catch (e) { return "unknown"; }
}

function getSearchKeyword() {
  const ref = document.referrer || "";
  if (!ref) return "";
  try {
    const url = new URL(ref);
    const params = url.searchParams;
    const candidates = ["q", "query", "wd", "keyword"];
    for (const k of candidates) {
      const v = params.get(k);
      if (v) return String(v).substring(0, 80);
    }
  } catch (e) {}
  return "";
}

// ---- Session ----

const SESSION_KEY = "appter_session_id";
const SESSION_STARTED_KEY = "appter_session_started";

function getSessionId() {
  try {
    let s = sessionStorage.getItem(SESSION_KEY);
    if (!s) {
      s = "s_" + Math.random().toString(36).substring(2, 14) + Date.now().toString(36);
      sessionStorage.setItem(SESSION_KEY, s);
      sessionStorage.setItem(SESSION_STARTED_KEY, String(Date.now()));
    }
    return s;
  } catch (e) { return "s_anon"; }
}

function getSessionStartedAt() {
  try {
    const v = sessionStorage.getItem(SESSION_STARTED_KEY);
    return v ? parseInt(v, 10) : Date.now();
  } catch (e) { return Date.now(); }
}

// ---- UTM (sticky for whole session) ----

const UTM_KEY = "appter_utm";

function captureUtm() {
  try {
    const cached = sessionStorage.getItem(UTM_KEY);
    if (cached) return JSON.parse(cached);
    const sp = new URLSearchParams(window.location.search);
    const utm = {
      utm_source: (sp.get("utm_source") || "").substring(0, 60),
      utm_medium: (sp.get("utm_medium") || "").substring(0, 60),
      utm_campaign: (sp.get("utm_campaign") || "").substring(0, 60),
      utm_term: (sp.get("utm_term") || "").substring(0, 60),
      utm_content: (sp.get("utm_content") || "").substring(0, 60)
    };
    sessionStorage.setItem(UTM_KEY, JSON.stringify(utm));
    return utm;
  } catch (e) {
    return { utm_source: "", utm_medium: "", utm_campaign: "", utm_term: "", utm_content: "" };
  }
}

// ---- User Agent parsing ----

function parseUserAgent(ua) {
  ua = String(ua || "");
  let os = "unknown";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser = "unknown";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/SamsungBrowser/i.test(ua)) browser = "Samsung";
  else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = "Opera";
  else if (/Chrome\//i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua)) browser = "Safari";

  let device = "desktop";
  if (/iPad|Tablet/i.test(ua)) device = "tablet";
  else if (/Mobile|iPhone|Android.*Mobile/i.test(ua)) device = "mobile";
  else if (/Android/i.test(ua)) device = "tablet"; // Android without Mobile

  return { os, browser, device };
}

// ---- Country detection (client-side IP geo) ----

const COUNTRY_KEY = "appter_country";
const COUNTRY_TS_KEY = "appter_country_ts";
const COUNTRY_TTL_MS = 30 * 60 * 1000; // 30분 캐시

let countryPromise = null;

export async function getCountryInfo() {
  // 캐시 확인
  try {
    const ts = parseInt(sessionStorage.getItem(COUNTRY_TS_KEY) || "0", 10);
    const cached = sessionStorage.getItem(COUNTRY_KEY);
    if (cached && Date.now() - ts < COUNTRY_TTL_MS) {
      return JSON.parse(cached);
    }
  } catch (e) {}

  if (countryPromise) return countryPromise;

  // 무료 IP geolocation API. CORS 가능, 키 불필요. 실패 시 빈 결과.
  countryPromise = (async () => {
    const endpoints = [
      "https://ipapi.co/json/",
      "https://ipwho.is/"
    ];
    for (const url of endpoints) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(t);
        if (!res.ok) continue;
        const j = await res.json();
        const info = {
          country: (j.country_code || j.country_code_iso3 || j.country || "").toString().substring(0, 3).toUpperCase(),
          countryName: (j.country_name || j.country || "").toString().substring(0, 60),
          city: (j.city || "").toString().substring(0, 60),
          region: (j.region || j.region_name || "").toString().substring(0, 60)
        };
        if (info.country) {
          try {
            sessionStorage.setItem(COUNTRY_KEY, JSON.stringify(info));
            sessionStorage.setItem(COUNTRY_TS_KEY, String(Date.now()));
          } catch (e) {}
          return info;
        }
      } catch (e) { /* try next */ }
    }
    return { country: "", countryName: "", city: "", region: "" };
  })();

  return countryPromise;
}

// ---- UID ----

let _currentUid = "";
export function setAnalyticsUid(uid) {
  _currentUid = uid || "";
}

// ---- 동의 게이팅 (PIPA / 쿠키·분석 사전 동의) ----

const CONSENT_KEY = "appter_analytics_consent"; // 'granted' | 'denied'

function getConsent() {
  try { return localStorage.getItem(CONSENT_KEY) || ""; } catch (e) { return ""; }
}
function setConsent(v) {
  try { localStorage.setItem(CONSENT_KEY, v); } catch (e) {}
}
function hasConsent() {
  return getConsent() === "granted";
}

// ---- Google Analytics (gtag) — 동의 후에만 로드 ----

const GA_ID = "G-86ZZWE6PJ6";
let _gaLoaded = false;

function loadGoogleAnalytics() {
  if (_gaLoaded || document.querySelector('script[src*="googletagmanager.com/gtag"]')) {
    _gaLoaded = true;
    return;
  }
  _gaLoaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", GA_ID);
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
  document.head.appendChild(s);
}

// ---- Core write ----

async function writeEvent(payload) {
  // 동의 게이팅: 동의(granted) 전·거부 시에는 아무것도 기록하지 않는다.
  if (!hasConsent()) return;
  try {
    const utm = captureUtm();
    const { os, browser, device } = parseUserAgent(navigator.userAgent || "");
    const geo = await getCountryInfo();
    const data = {
      page: window.location.pathname || "/",
      session: getSessionId(),
      sessionStartedAt: getSessionStartedAt(),
      uid: _currentUid || "",
      source: getReferrerSource(),
      referrer: (document.referrer || "").substring(0, 200),
      searchKeyword: getSearchKeyword(),
      ua: (navigator.userAgent || "").substring(0, 200),
      lang: navigator.language || "",
      os, browser, device,
      country: geo.country || "",
      countryName: geo.countryName || "",
      city: geo.city || "",
      region: geo.region || "",
      ...utm,
      ...payload,
      createdAt: serverTimestamp()
    };
    await addDoc(collection(db, "events"), data);
  } catch (e) {
    console.warn("event tracking failed:", e?.message);
  }
}

export async function trackPageview() {
  return writeEvent({ type: "pageview" });
}

export async function trackEvent(type, extra) {
  if (!type) return;
  return writeEvent({
    type: String(type).substring(0, 50),
    ...(extra || {})
  });
}

// ---- 동의 배너 (모든 페이지 공통, JS로 1회 동적 삽입 — DRY) ----

function buildConsentBanner() {
  if (document.getElementById("consent-banner")) return;

  const banner = document.createElement("div");
  banner.id = "consent-banner";
  banner.setAttribute("role", "dialog");
  banner.setAttribute("aria-live", "polite");
  banner.setAttribute("aria-label", "분석 데이터 수집 동의");
  banner.innerHTML = `
    <div class="consent-text">
      <strong>Appter</strong>는 서비스 개선을 위해 익명 방문 데이터(방문 경로·기기 등)를 수집해요. 동의하시겠어요?
      <span class="consent-sub">거부하셔도 투표·아이디어 등록 등 서비스 이용엔 전혀 지장이 없어요.</span>
    </div>
    <div class="consent-actions">
      <button type="button" class="consent-deny" id="consent-deny-btn">거부</button>
      <button type="button" class="consent-allow" id="consent-allow-btn">동의</button>
    </div>
  `;
  document.body.appendChild(banner);
  // 트랜지션을 위해 다음 프레임에 visible
  requestAnimationFrame(() => banner.classList.add("is-visible"));

  const close = () => {
    banner.classList.remove("is-visible");
    setTimeout(() => banner.remove(), 400);
  };

  banner.querySelector("#consent-allow-btn").addEventListener("click", () => {
    setConsent("granted");
    close();
    // 동의 직후 그 시점부터 추적 시작 — GA 로드 + 현재 페이지 pageview 1회 기록
    loadGoogleAnalytics();
    trackPageview();
  });
  banner.querySelector("#consent-deny-btn").addEventListener("click", () => {
    setConsent("denied");
    close();
    // 거부 시 아무것도 기록하지 않음 (writeEvent 게이팅으로 차단됨)
  });
}

// ---- 부팅: 동의 확인 후에만 추적, 미선택 시 배너 ----

function bootAnalytics() {
  const consent = getConsent();
  if (consent === "granted") {
    // 이미 동의함 → GA 로드 + 평소처럼 자동 pageview
    loadGoogleAnalytics();
    trackPageview();
  } else if (consent === "denied") {
    // 이미 거부함 → 아무것도 안 함, 배너도 다시 안 띄움
  } else {
    // 미선택 → 동의 배너 노출 (선택 전까지 trackPageview 호출 안 함)
    buildConsentBanner();
  }
}

if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootAnalytics);
  } else {
    bootAnalytics();
  }
}
