// ========================================
// Theme - 라이트(#5 Untitled UI) / 다크(#2 Liquid Glass) 토글
// data-theme 는 FOUC 방지를 위해 <head> 인라인 스크립트가 먼저 설정한다.
// ========================================

const KEY = "appter_theme";

function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function updateButtons(theme) {
  const dark = theme === "dark";
  document.querySelectorAll(".theme-toggle").forEach((btn) => {
    btn.textContent = dark ? "☀️" : "🌙";
    const label = dark ? "라이트 모드로 전환" : "다크 모드로 전환";
    btn.setAttribute("aria-label", label);
    btn.setAttribute("title", label);
  });
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(KEY, theme); } catch (e) { /* ignore */ }
  updateButtons(theme);
}

function init() {
  updateButtons(currentTheme());
  document.querySelectorAll(".theme-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyTheme(currentTheme() === "dark" ? "light" : "dark");
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
