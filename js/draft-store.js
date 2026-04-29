// ========================================
// Draft Store - localStorage 기반 자동 임시 저장
// 글 작성 폼 / 댓글 입력에서 사용. 데이터는 사용자 PC에만 저장됨.
// ========================================

const PREFIX = "appter_draft:";
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일 후 자동 만료

function key(name) {
  return PREFIX + String(name || "default");
}

export function saveDraft(name, data) {
  try {
    const payload = {
      v: 1,
      savedAt: Date.now(),
      data: data
    };
    localStorage.setItem(key(name), JSON.stringify(payload));
  } catch (e) { /* quota exceeded 등 무시 */ }
}

export function loadDraft(name) {
  try {
    const raw = localStorage.getItem(key(name));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.savedAt) return null;
    if (Date.now() - parsed.savedAt > TTL_MS) {
      localStorage.removeItem(key(name));
      return null;
    }
    return parsed.data;
  } catch (e) { return null; }
}

export function clearDraft(name) {
  try { localStorage.removeItem(key(name)); } catch (e) {}
}

// debounce 헬퍼: 입력 즉시 저장하지 않고 마지막 입력 후 delay ms 뒤에 저장
export function debouncedSaveDraft(name, getter, delay) {
  let timer = null;
  return function () {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const data = typeof getter === "function" ? getter() : getter;
        if (data && (data.title || data.description || data.text)) {
          saveDraft(name, data);
        } else {
          clearDraft(name);
        }
      } catch (e) {}
    }, delay || 400);
  };
}
