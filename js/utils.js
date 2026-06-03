// ========================================
// Utils - 공용 유틸리티 (빌드 툴 없이 ES 모듈 import 로 공유)
// ========================================

// HTML 이스케이프 (XSS 방지). 사용자 입력을 innerHTML 에 넣기 전 반드시 통과시킨다.
// 0 등 falsy 한 숫자도 보존하고, 비문자열은 String 으로 강제한다.
export function escapeHtml(str) {
  if (!str && str !== 0) return "";
  const d = document.createElement("div");
  d.textContent = String(str);
  return d.innerHTML;
}
