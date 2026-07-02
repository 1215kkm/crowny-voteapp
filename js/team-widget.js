// 강팀 회의 위젯 — 큐브 플립 + 무료횟수 + 회의 실행 + 공유(스레드/인스타)
// 백엔드: Firebase Functions runMeeting (Gemini). 호출 실패 시에만 데모 결과.
(function () {
  "use strict";

  var CREATOR_THREADS = "kkm450815";
  // GitHub Pages(appter.co.kr) 등 Firebase 호스팅 밖에서는 /api/meeting rewrite가 없으므로 함수 URL을 직접 호출
  var MEETING_API = "https://us-central1-crowny-appter.cloudfunctions.net/runMeeting";
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

  // 회의록 헤더 — 라벨 + 날짜시간 + 참여 멤버 칩 (강팀 회의록 양식)
  function metaHtml() {
    var d = new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    var dt = d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
    return '<div class="tw-m-meta">' +
      '<span class="tw-m-label">강팀 회의록</span><span class="tw-m-date">' + dt + '</span>' +
      '<div class="tw-m-members"><span class="tw-m-mlabel">참여</span>' +
        '<span class="tw-chip daepyo">강대표</span><span class="tw-chip gdi">강디</span>' +
        '<span class="tw-chip gdev">강개발</span><span class="tw-chip gchk">강체크</span>' +
        '<span class="tw-chip abang">아뱅</span>' +
      '</div></div>';
  }

  function renderResult(html, title, isDemo) {
    resultEl.innerHTML =
      (isDemo ? '<div class="tw-demo-note">데모 미리보기 — 실제 강팀 AI(Gemini) 연결은 다음 단계입니다.</div>' : "") +
      '<div class="tw-result-body">' + metaHtml() + html + "</div>" +
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
      '<div class="tw-m-act gdi"><b>강디</b> "첫인상·흐름부터 볼게요~ 사용자 목표가 뭔지 3단계로 줄여봐요." <span class="tw-think">(카드형이 안전하지…)</span></div>' +
      '<div class="tw-m-act gdev"><b>강개발</b> "됩니다/안 됩니다부터. 무료 배포면 서버·키 비용 구조 먼저 잡죠."</div>' +
      '<div class="tw-m-act gchk"><b>강체크</b> "개인정보·키 노출·무료 남용 3개 봅니다. 증거로 잡을게요."</div>' +
      '<div class="tw-m-act abang"><b>아뱅</b> "오~ 이거 스레드로 퍼뜨리면 유입 도는데? 수익 경로 한 줄 박자." <span class="tw-think">(판을 뒤집어야 재밌지)</span></div>' +
      '<div class="tw-m-act daepyo"><b>강대표</b> "좋아. 방향 잡혔어. 가자."</div>' +
      '<div class="tw-m-sum"><b>정리</b><ul><li>결정: 방향 확정 후 착수</li><li>다음 액션: 구현·홍보 투트랙</li></ul></div>';
  }

  // ---- 회의 로딩 애니메이션 (멤버 칩이 차례로 발언하듯 점멸 + 진행 문구 순환) ----
  var LOAD_MSGS = [
    "강팀이 모여 안건을 읽는 중",
    "강대표가 회의를 여는 중",
    "강디가 사용자 흐름을 그려보는 중",
    "강개발이 구현 가능성을 따져보는 중",
    "강체크가 리스크를 점검하는 중",
    "아뱅이 판을 뒤집을 아이디어를 꺼내는 중",
    "회의록을 정리하는 중"
  ];
  var loadTimer = null;

  function showLoading(afterRemain) {
    resultEl.innerHTML =
      '<div class="tw-notice">체험 <b>3회</b> 중 <b>' + afterRemain + '회</b> 남았습니다. ' +
        '가입·로그인 후 SNS로 퍼가실 때마다 <b>3회씩</b> 더 늘어나요. 퍼가기 적립은 하루 최대 <b>3번</b>까지예요.</div>' +
      '<div class="tw-loading">' +
        '<div class="tw-load-chips">' +
          '<span class="tw-chip daepyo">강대표</span><span class="tw-chip gdi">강디</span>' +
          '<span class="tw-chip gdev">강개발</span><span class="tw-chip gchk">강체크</span>' +
          '<span class="tw-chip abang">아뱅</span>' +
        '</div>' +
        '<div class="tw-load-text"><span id="tw-load-msg">' + LOAD_MSGS[0] + '</span><span class="tw-load-dots"></span></div>' +
      '</div>';
    resultEl.classList.remove("hidden");
    var i = 0;
    var msgEl = resultEl.querySelector("#tw-load-msg");
    loadTimer = setInterval(function () {
      i = (i + 1) % LOAD_MSGS.length;
      if (msgEl) msgEl.textContent = LOAD_MSGS[i];
    }, 2200);
    resultEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function stopLoading() {
    if (loadTimer) { clearInterval(loadTimer); loadTimer = null; }
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
    showLoading(remaining() - 1);

    try {
      var html = null, isDemo = false;
      try {
        var res = await fetch(MEETING_API, {
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
      stopLoading();
      running = false;
      runBtn.textContent = remaining() > 0 ? orig : "무료 소진 — 아래 '더 받기'";
      runBtn.disabled = remaining() <= 0;
    }
  });

  // ---- 더 받기 (체험 3회 → 가입·로그인 후 SNS 퍼가기 1회당 +3회, 하루 최대 3번) ----
  function showMore() {
    var loggedIn = !!(window.appAuth && window.appAuth.getCurrentUser && window.appAuth.getCurrentUser());
    var msg = loggedIn
      ? "무료 횟수를 다 썼어요.\n\nSNS로 퍼가실 때마다 3회씩 더 드려요 (하루 최대 3번):\n" + myRefLink()
      : "체험 3회를 다 썼어요.\n\n가입·로그인 후 SNS로 퍼가실 때마다 3회씩 더 늘어나요.\n(퍼가기 적립은 하루 최대 3번)\n\n지금 가입할까요?";
    if (loggedIn) {
      shareOther("Appter 강팀 무료 회의");
    } else {
      if (confirm(msg) && window.appAuth && window.appAuth.loginWithGoogle) window.appAuth.loginWithGoogle();
    }
  }
  if (moreBtn) moreBtn.addEventListener("click", showMore);

  renderQuota();
})();
