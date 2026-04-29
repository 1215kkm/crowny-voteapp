// ========================================
// Access Guard - 국가 기반 접속 제어
// 페이지 로드 시 사용자의 국가를 확인하고
// config/access 문서의 차단/허용 목록과 비교해서
// 막힌 사용자에게는 안내 화면을 보여줌.
// ========================================

import { db } from "./firebase-config.js";
import {
  doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getCountryInfo } from "./analytics.js";
import { countryFlagEmoji, countryName } from "./countries.js";

const ADMIN_EMAIL_FALLBACK = "rute20002@gmail.com";

const DEFAULT_CONFIG = {
  mode: "blocklist",        // 'blocklist' | 'allowlist'
  countries: ["CN"],         // 기본: 중국 차단
  message: "죄송합니다. 현재 거주 지역에서는 이 서비스를 이용할 수 없습니다.\nThis service is currently not available in your region.",
  enabled: true
};

async function loadAccessConfig() {
  try {
    const snap = await getDoc(doc(db, "config", "access"));
    if (snap.exists()) {
      const d = snap.data();
      return {
        mode: d.mode === "allowlist" ? "allowlist" : "blocklist",
        countries: Array.isArray(d.countries) ? d.countries.map((c) => String(c).toUpperCase()) : [],
        message: typeof d.message === "string" ? d.message : DEFAULT_CONFIG.message,
        enabled: d.enabled !== false
      };
    }
  } catch (e) {
    console.warn("access config load failed", e?.message);
  }
  return DEFAULT_CONFIG;
}

function isCurrentUserAdmin() {
  try {
    const u = window.__currentUser;
    if (u && u.email === ADMIN_EMAIL_FALLBACK) return true;
  } catch (e) {}
  return false;
}

// auth 로드 대기 (최대 1500ms)
async function waitForAuth(maxMs) {
  const start = Date.now();
  while (Date.now() - start < (maxMs || 1500)) {
    if (window.__currentUser !== undefined) return window.__currentUser;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

function shouldBlock(country, config) {
  if (!config.enabled) return false;
  if (!country) return false; // 국가 미상이면 차단하지 않음 (오탐 방지)
  const list = (config.countries || []).map((c) => c.toUpperCase());
  const c = String(country).toUpperCase();
  if (config.mode === "allowlist") {
    return !list.includes(c);
  }
  return list.includes(c);
}

function renderBlockScreen(country, config) {
  const flag = countryFlagEmoji(country);
  const cname = countryName(country) || country || "감지된 지역";
  const msgHtml = String(config.message || DEFAULT_CONFIG.message)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  // 모든 페이지 콘텐츠를 가리고 차단 화면 표시
  const overlay = document.createElement("div");
  overlay.id = "access-block-overlay";
  overlay.setAttribute("role", "alertdialog");
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 99999;
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    color: #f8fafc;
    display: flex; align-items: center; justify-content: center;
    padding: 24px; text-align: center;
    font-family: 'Noto Sans KR', system-ui, -apple-system, sans-serif;
  `;
  overlay.innerHTML = `
    <div style="max-width: 520px;">
      <div style="font-size: 72px; line-height: 1; margin-bottom: 16px;">${flag || "🌐"}</div>
      <h1 style="font-size: 1.6rem; margin: 0 0 12px; font-weight: 700;">접속이 제한되었습니다</h1>
      <p style="font-size: 1rem; line-height: 1.7; color: #cbd5e1; margin: 0 0 24px; white-space: pre-line;">${msgHtml}</p>
      <div style="font-size: 0.85rem; color: #94a3b8; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1);">
        감지된 지역: <strong style="color:#e2e8f0;">${cname} (${country || "?"})</strong>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
}

let _guardRan = false;

export async function runAccessGuard(opts) {
  if (_guardRan) return;
  _guardRan = true;
  const isAdminPage = !!opts?.isAdminPage;

  try {
    const [config, geo] = await Promise.all([
      loadAccessConfig(),
      getCountryInfo()
    ]);

    if (!config.enabled) return;

    // 관리자 페이지는 차단하지 않음 (관리자가 자기 자신을 잠그는 것을 방지)
    if (isAdminPage) return;

    if (shouldBlock(geo.country, config)) {
      // 관리자 이메일이면 차단 면제. auth 로드를 잠깐 기다림.
      await waitForAuth(1500);
      if (isCurrentUserAdmin()) return;
      renderBlockScreen(geo.country, config);
    }
  } catch (e) {
    console.warn("access guard error", e?.message);
  }
}

// admin이 자기 페이지에서 사용 가능한 헬퍼
export async function getAccessConfig() {
  return loadAccessConfig();
}

// 자동 실행 (모듈 import 시)
const isAdminPage = (window.location.pathname || "").includes("admin.html");
runAccessGuard({ isAdminPage });
