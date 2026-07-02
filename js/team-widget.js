// 강팀 회의 위젯 — 큐브 플립 + 무료횟수 + 회의 실행 + 공유(스레드/인스타)
// 백엔드(Vercel /api/meeting, Gemini)는 다음 단계. 지금은 호출 시도 후 실패 시 데모 결과.
(function () {
  "use strict";

  var CREATOR_THREADS = "kkm450815";
  var FREE_ANON = 3;               // 익명 무료 횟수 (캐시 저장)
  var LS_COUNT = "appter_team_used";   // 사용한 횟수
  var LS_REF = "appter_ref_id";        // 내 추천 링크용 id (익명 게스트)

  var rotor = document.getElementById("flip-rotor");
  var toAppter = document.getElementById("to-appter");
  var toTeam = document.getElementById("to-team");
  var input = document.getElementById("team-input");
  var runBtn = document.getElementById("team-run-btn");
  var remainEl = document.getElementById("tw-remaining");
  var moreBtn = document.getElementById("tw-more");
  var resultEl = document.getElementById("team-result");

  if (!rotor || !runBtn) return;

  // ---- 큐브 플립 ----
  if (toAppter) toAppter.addEventListener("click", function () { rotor.classList.add("show-appter"); });
  if (toTeam) toTeam.addEventListener("click", function () { rotor.classList.remove("show-appter"); });

  // URL ?ref= 로 들어온 방문 기록 (추천 검증용 — 백엔드에서 집계 예정)
  try {
    var p = new URLSearchParams(location.search);
    var ref = p.get("ref");
    if (ref) localStorage.setItem("appter_came_from_ref", ref);
  } catch (e) {}

  // ---- 무료 횟수 ----
  function used() { return parseInt(localStorage.getItem(LS_COUNT) || "0", 10) || 0; }
  function remaining() { return Math.max(0, FREE_ANON - used()); }
  function renderQuota() {
    if (remainEl) remainEl.textContent = remaining();
    if (remaining() <= 0) {
      runBtn.disabled = true;
      runBtn.textContent = "무료 소진 — 아래 '더 받기'";
    }
  }
  function consumeOne() {
    localStorage.setItem(LS_COUNT, String(used() + 1));
    renderQuota();
  }

  // 내 추천 id (익명 게스트 — 로그인 붙으면 UID로 교체)
  function myRefId() {
    var id = localStorage.getItem(LS_REF);
    if (!id) {
      id = "g" + Math.random().toString(36).slice(2, 9);
      localStorage.setItem(LS_REF, id);
    }
    return id;
  }
  function myRefLink() {
    return location.origin + location.pathname + "?ref=" + encodeURIComponent(myRefId());
  }

  // ---- 공유 ----
  function shareCaption(title) {
    return "강팀 AI가 회의해서 만든 결과예요 🤖\n\"" + (title || "내 앱 아이디어") +
      "\"\n\n너도 무료로 시켜봐 👉 " + myRefLink() + "\n제작 @" + CREATOR_THREADS + " #Appter #강팀";
  }
  function openThreads(title) {
    var url = "https://www.threads.net/intent/post?text=" + encodeURIComponent(shareCaption(title));
    window.open(url, "_blank", "noopener");
  }
  function shareOther(title) {
    if (navigator.share) {
      navigator.share({ title: "강팀 회의 결과", text: shareCaption(title), url: myRefLink() }).catch(function () {});
    } else {
      var ta = document.createElement("textarea");
      ta.value = shareCaption(title); document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
      alert("공유 문구를 복사했어요. 인스타/스레드에 붙여넣기 하세요!");
    }
  }

  // ---- 결과 렌더 ----
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function renderResult(html, title, isDemo) {
    resultEl.innerHTML =
      (isDemo ? '<div class="tw-demo-note">데모 미리보기 — 실제 강팀 AI(Gemini) 연결은 다음 단계입니다.</div>' : "") +
      '<div class="tw-result-body">' + html + "</div>" +
      '<div class="tw-share">' +
        '<button type="button" class="tw-share-btn tw-share-threads">스레드로 퍼가기</button>' +
        '<button type="button" class="tw-share-btn tw-share-other">인스타·기타 공유</button>' +
      "</div>" +
      '<div class="tw-credit">이 회의 만든 곳 · <a href="https://www.threads.net/@' + CREATOR_THREADS + '" target="_blank" rel="noopener">@' + CREATOR_THREADS + "</a></div>";
    resultEl.classList.remove("hidden");
    resultEl.querySelector(".tw-share-threads").addEventListener("click", function () { openThreads(title); });
    resultEl.querySelector(".tw-share-other").addEventListener("click", function () { shareOther(title); });
    resultEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function demoMeetingHtml(prompt) {
    var t = esc(prompt.slice(0, 60));
    return '' +
      '<div class="tw-m-title">강팀 회의 결과</div>' +
      '<div class="tw-m-req">요청: "' + t + (prompt.length > 60 ? "…" : "") + '"</div>' +
      '<div class="tw-m-act"><b>강디</b> "첫인상·흐름부터 볼게요~ 사용자 목표가 뭔지 3단계로 줄여봐요."</div>' +
      '<div class="tw-m-act"><b>강개발</b> "됩니다/안 됩니다부터. 무료 배포면 서버·키 비용 구조 먼저 잡죠."</div>' +
      '<div class="tw-m-act"><b>강체크</b> "개인정보·키 노출·무료 남용 3개 봅니다. 증거로 잡을게요."</div>' +
      '<div class="tw-m-act"><b>아뱅</b> "오~ 이거 스레드로 퍼뜨리면 유입 도는데? 수익 경로 한 줄 박자."</div>' +
      '<div class="tw-m-act"><b>강대표</b> "좋아. 방향 잡혔어. 가자."</div>';
  }

  // ---- 실행 ----
  var running = false;
  runBtn.addEventListener("click", async function () {
    if (running) return;
    var prompt = (input.value || "").trim();
    if (!prompt) { input.focus(); return; }
    if (remaining() <= 0) { showMore(); return; }

    running = true;
    var orig = runBtn.textContent;
    runBtn.disabled = true;
    runBtn.textContent = "강팀 회의 중…";

    try {
      var html = null, isDemo = false;
      try {
        var res = await fetch("/api/meeting", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: prompt, ref: myRefId() })
        });
        if (res.ok) {
          var data = await res.json();
          html = data.html || null;
        }
      } catch (e) { /* 백엔드 미연결 — 데모로 */ }

      if (!html) { html = demoMeetingHtml(prompt); isDemo = true; }
      consumeOne();
      renderResult(html, prompt, isDemo);
    } finally {
      running = false;
      runBtn.textContent = remaining() > 0 ? orig : "무료 소진 — 아래 '더 받기'";
      runBtn.disabled = remaining() <= 0;
    }
  });

  // ---- 더 받기 (3 → 가입 +5 → 추천 +10) ----
  function showMore() {
    var loggedIn = !!(window.appAuth && window.appAuth.getCurrentUser && window.appAuth.getCurrentUser());
    var msg = loggedIn
      ? "무료 횟수를 다 썼어요.\n\n내 추천 링크를 공유하고 친구가 쓰면 10회 더 드려요:\n" + myRefLink()
      : "무료 3회를 다 썼어요.\n\n· 가입하면 5회 더\n· 내 링크로 친구가 쓰면 10회 더\n\n지금 가입할까요?";
    if (loggedIn) {
      shareOther("Appter 강팀 무료 회의");
    } else {
      if (confirm(msg) && window.appAuth && window.appAuth.loginWithGoogle) window.appAuth.loginWithGoogle();
    }
  }
  if (moreBtn) moreBtn.addEventListener("click", showMore);

  renderQuota();
})();
