// ========================================
// AI Config - Gemini API 키 (관리자 전용)
// ========================================
// 보안: AI 생성 기능은 관리자(admin.js)만 사용한다. 키를 정적 번들에 박으면
// 공개 사이트의 누구나 js/ai-config.js 를 그대로 받아 키를 추출할 수 있어
// (키 분할 저장은 스캐너만 피할 뿐 F12 한 번이면 복원됨) 쿼터 소진·과금 폭탄 위험.
// 그래서 키는 코드/저장소에 두지 않고, 관리자가 자기 브라우저(localStorage)에 1회 입력한다.
//   - 키 발급: https://aistudio.google.com → Get API key
//   - 입력/변경: 관리자 화면(admin.html)의 "Gemini 키 설정" 버튼
// ========================================

const GEMINI_KEY_STORAGE = "crowny_gemini_key";

// 관리자가 이 브라우저에 입력해 둔 키를 읽는다. 없으면 빈 문자열.
export function getGeminiKey() {
  try {
    return localStorage.getItem(GEMINI_KEY_STORAGE) || "";
  } catch {
    return "";
  }
}

// 키 저장/삭제 (빈 값이면 삭제). 이 브라우저의 localStorage 에만 보관된다.
export function setGeminiKey(key) {
  try {
    const v = (key || "").trim();
    if (v) localStorage.setItem(GEMINI_KEY_STORAGE, v);
    else localStorage.removeItem(GEMINI_KEY_STORAGE);
  } catch {
    /* localStorage 불가 환경은 무시 */
  }
}

export const GEMINI_MODEL = "gemini-2.5-flash"; // 빠르고 무료 한도 큼

export const ADMIN_EMAIL = "rute20002@gmail.com";
