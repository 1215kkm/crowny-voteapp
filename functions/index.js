// 강팀 AI 회의 백엔드 (Firebase Cloud Functions, 2nd gen)
// 키를 서버 시크릿(GEMINI_KEY)에만 두고, 클라이언트는 /api/meeting 만 호출한다.
// 모델 공급자는 아래 runMeetingModel 한 곳만 바꾸면 Claude 등으로 교체 가능.

const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

const GEMINI_KEY = defineSecret("GEMINI_KEY");

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models";

// ── 강팀 회의 프롬프트 ─────────────────────────────────────────────
function buildPrompt(userText) {
  return `너는 '강팀'이라는 5명짜리 한국어 AI 팀의 회의를 진행한다.
멤버(말투 지켜라):
- 강대표: 리더. 짧고 묵직. 마지막에 결정. "좋아.", "가자."
- 강디: 디자이너. 자신만만·밝음. UX/UI 관점. "이거 완전 예쁘죠?"
- 강개발: 개발자. 직설·건조. 된다/안된다와 비용·시간. "됩니다. 2시간.", "그거 안 됩니다."
- 강체크: QA·보안. 까칠·꼼꼼. 리스크와 우회안. "여기서 깨져요."
- 아뱅: 마케터. 긍정·호전적. 수익 경로와 홍보. "야, 이거 뒤집자!"

아래 사용자의 앱/상황을 읽고 **'구현'과 '홍보마케팅' 두 관점으로** 짧은 회의를 해라.
규칙: 전원 찬성 금지(최소 1명은 반대·의문). 쉬운 말. 어려운 전문용어는 괄호로 풀이. 각 발언 1~2문장.

[사용자 입력]
${userText}

출력은 **아래 HTML 조각만** 내놔라. 마크다운/코드펜스/설명 금지. 다른 태그·class 쓰지 마라.
<div class="tw-m-title">강팀 회의 결과</div>
<div class="tw-m-act"><b>강대표</b> "회의 여는 한 줄."</div>
(구현 관점 3~4줄: 강디·강개발·강체크가 각자 발언 — class는 전부 tw-m-act, 이름은 <b>…</b>)
(홍보마케팅 관점 3~4줄: 아뱅 중심 + 다른 멤버 반응)
<div class="tw-m-act"><b>강대표</b> "정리: (결정 한 줄) / 다음 액션: (한 줄)"</div>`;
}

// ── 모델 호출 (여기만 바꾸면 Claude 등으로 교체) ─────────────────
async function runMeetingModel(userText, apiKey) {
  const url = `${GEMINI_API}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: buildPrompt(userText) }] }],
    generationConfig: {
      temperature: 0.9,
      maxOutputTokens: 2048,
      thinkingConfig: { thinkingBudget: 0 } // flash 2.5 thinking 끄기(비용·잘림 방지)
    }
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  let html = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  // 혹시 코드펜스가 붙어오면 제거
  html = html.replace(/^```html\s*/i, "").replace(/```$/i, "").trim();
  return html;
}

// ── HTTP 엔드포인트 (/api/meeting 으로 rewrite) ──────────────────
exports.runMeeting = onRequest(
  { secrets: [GEMINI_KEY], cors: true, region: "us-central1", memory: "256MiB", timeoutSeconds: 60 },
  async (req, res) => {
    if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
    const prompt = String((req.body && req.body.prompt) || "").trim();
    if (!prompt) { res.status(400).json({ error: "prompt required" }); return; }
    if (prompt.length > 2000) { res.status(400).json({ error: "prompt too long" }); return; }

    try {
      const html = await runMeetingModel(prompt, GEMINI_KEY.value());
      if (!html) { res.status(502).json({ error: "empty result" }); return; }
      res.set("Cache-Control", "no-store");
      res.json({ html });
    } catch (e) {
      console.error("runMeeting failed:", e && e.message);
      res.status(500).json({ error: "generation_failed" });
    }
  }
);
