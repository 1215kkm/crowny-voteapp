// ========================================
// AI Module - Gemini API 클라이언트 + 가상 댓글/글 생성기
// ========================================

import { GEMINI_API_KEY, GEMINI_MODEL } from "./ai-config.js";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// 가상 사용자 풀 (생성된 글/댓글에 사용)
export const FAKE_AUTHORS = [
  { name: "이준서", bg: "6366f1" },
  { name: "박서연", bg: "ec4899" },
  { name: "정하윤", bg: "10b981" },
  { name: "김도현", bg: "f59e0b" },
  { name: "조수빈", bg: "0ea5e9" },
  { name: "양지우", bg: "8b5cf6" },
  { name: "류시현", bg: "f43f5e" },
  { name: "홍예린", bg: "14b8a6" },
  { name: "배준서", bg: "eab308" },
  { name: "문소율", bg: "06b6d4" },
  { name: "신윤아", bg: "a855f7" },
  { name: "권태양", bg: "84cc16" },
  { name: "장민서", bg: "f97316" },
  { name: "안지호", bg: "3b82f6" },
  { name: "임나은", bg: "d946ef" }
];

export function fakeAvatar(name, bg) {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${bg}&color=fff&size=128&bold=true`;
}

export function pickFakeAuthor() {
  const a = FAKE_AUTHORS[Math.floor(Math.random() * FAKE_AUTHORS.length)];
  return {
    uid: "ai_" + Math.random().toString(36).substring(2, 12),
    displayName: a.name,
    photoURL: fakeAvatar(a.name, a.bg),
    email: ""
  };
}

function isKeyValid() {
  return GEMINI_API_KEY && !GEMINI_API_KEY.startsWith("PASTE_");
}

async function callGemini(prompt, maxTokens) {
  if (!isKeyValid()) {
    throw new Error("Gemini API 키가 설정되지 않았습니다. js/ai-config.js 를 수정해주세요.");
  }
  const url = `${API_BASE}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.95,
      maxOutputTokens: maxTokens || 4096,
      responseMimeType: "application/json",
      // gemini-2.5 시리즈는 기본적으로 "thinking 모드" 라 답변 전에 많은 토큰을 추론에 씀.
      // 우리가 짧은 JSON만 필요하므로 thinking 비활성화로 토큰 절약 + 응답 잘림 방지
      thinkingConfig: { thinkingBudget: 0 }
    }
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API 오류 ${res.status}: ${err.substring(0, 200)}`);
  }
  const data = await res.json();
  // 응답 종료 사유 확인 (MAX_TOKENS면 잘린 거)
  const finishReason = data?.candidates?.[0]?.finishReason;
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (finishReason === "MAX_TOKENS") {
    console.warn("[Gemini] response truncated due to MAX_TOKENS, text:", text.substring(0, 200));
  }
  return text;
}

// ---- 댓글 N개 생성 ----
// 반환: [{ authorName, authorPhoto, text }] 배열
export async function generateCommentsForIdea(ideaTitle, ideaDescription, count) {
  count = Math.max(1, Math.min(10, count || 3));
  const prompt = `너는 한국어 앱 아이디어 커뮤니티 사용자들이야. 아래 아이디어 글에 대한 자연스러운 한국어 댓글 ${count}개를 만들어줘.

[아이디어 글]
제목: ${ideaTitle}
설명: ${ideaDescription}

[규칙]
- 각 댓글은 1~3문장 (40~150자)
- 다양한 어조: 질문/의문, 동의·찬성, 우려·반대, 기능 제안, 사용 의향 등 골고루
- 한국어 인터넷 댓글 톤 (격식 X, 너무 짧지도 너무 길지도 않게)
- 욕설 금지, 광고 금지

[출력 형식]
다음 JSON 형식으로만 응답:
{
  "comments": [
    { "tone": "질문|동의|우려|제안|의향", "text": "댓글 내용" }
  ]
}`;

  const text = await callGemini(prompt);
  let json;
  try { json = JSON.parse(text); } catch (e) {
    // JSON 파싱 실패 시 fallback: 최소 1개라도 추출
    json = { comments: [{ text: text.substring(0, 200), tone: "기타" }] };
  }
  const comments = (json.comments || []).slice(0, count);
  return comments.map((c) => {
    const author = pickFakeAuthor();
    return {
      authorUid: author.uid,
      authorName: author.displayName,
      authorPhoto: author.photoURL,
      text: String(c.text || "").substring(0, 990),
      tone: c.tone || "기타"
    };
  });
}

// ---- 새 가상 글(아이디어) 1개 생성 ----
export async function generateNewIdea() {
  const prompt = `너는 한국어 앱 아이디어 커뮤니티의 가상 사용자야. 아직 시장에 없는 새로운 모바일/웹 앱 아이디어 1개를 제안해줘.

[규칙]
- 너무 평범하거나 이미 흔한 앱은 제외 (예: 단순 배달, 단순 메신저)
- 일상의 작은 불편을 해결하거나 새로운 라이프스타일을 만드는 아이디어
- 한국 사용자 맥락
- 욕설/정치/혐오 표현 금지

[출력 형식]
다음 JSON 형식으로만 응답:
{
  "title": "한 줄 요약 (60자 이내)",
  "description": "왜 필요한지, 어떤 기능이 있으면 좋겠는지 자유롭게 (200~500자)"
}`;

  const text = await callGemini(prompt);
  let json;
  try { json = JSON.parse(text); }
  catch (e) {
    throw new Error("AI 응답 파싱 실패. 응답: " + text.substring(0, 300));
  }
  const author = pickFakeAuthor();
  return {
    title: String(json.title || "").substring(0, 100),
    description: String(json.description || "").substring(0, 990),
    author
  };
}

export { isKeyValid as isAiKeyValid };
