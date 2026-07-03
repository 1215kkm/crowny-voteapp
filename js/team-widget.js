// 강팀 회의 위젯 — 큐브 플립 + 무료횟수 + 회의 실행 + 공유(스레드/인스타)
// 백엔드: Firebase Functions runMeeting (Gemini). 호출 실패 시에만 데모 결과.
(function () {
  "use strict";

  var CREATOR_THREADS = "kkm450815";
  // GitHub Pages(appter.co.kr) 등 Firebase 호스팅 밖에서는 /api/meeting rewrite가 없으므로 함수 URL을 직접 호출
  var MEETING_API = "https://us-central1-crowny-appter.cloudfunctions.net/runMeeting";
  var FREE_ANON = 3;               // 익명 기본 질문 횟수 (관리자 설정으로 덮임)
  var followBonusN = 3;            // 스친추가 보너스 (관리자 설정)
  var signupBonusN = 0;           // 가입(로그인) 보너스 (관리자 설정)
  var shareBonusN = 3;            // SNS 공유 보너스 (관리자 설정)
  var REGEN_MS = 12 * 60 * 60 * 1000;  // 12시간마다 질문 1회 재충전
  var LS_COUNT = "appter_team_used";   // 사용한 횟수
  var LS_BONUS = "appter_team_bonus";  // 적립 횟수 (스친추가 등)
  var LS_REGEN = "appter_team_regen";  // 마지막 재충전 기준 시각
  var LS_FOLLOW = "appter_followed_kkm"; // 스친추가 적립 1회 플래그
  var LS_SIGNUP = "appter_signup_bonus"; // 가입 보너스 지급 플래그
  var LS_SHARE_DAY = "appter_share_day"; // 공유 보너스 집계 날짜
  var LS_SHARE_CNT = "appter_share_cnt"; // 오늘 공유 보너스 지급 횟수
  var LS_REF = "appter_ref_id";        // 내 추천 링크용 id (익명 게스트)

  // 관리자 설정(무료·가입·스친추가·공유 보너스) 로드
  function loadConfig() {
    if (!(window.appMeetings && window.appMeetings.config)) return;
    window.appMeetings.config().then(function (c) {
      if (!c) return;
      FREE_ANON = c.freeBase;
      followBonusN = c.followBonus;
      signupBonusN = c.signupBonus;
      shareBonusN = c.shareBonus;
      renderQuota();
    });
  }

  // SNS 공유 시 보너스 (하루 최대 3번)
  function grantShareBonus() {
    if (shareBonusN <= 0) return;
    var today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(LS_SHARE_DAY) !== today) {
      localStorage.setItem(LS_SHARE_DAY, today);
      localStorage.setItem(LS_SHARE_CNT, "0");
    }
    var cnt = parseInt(localStorage.getItem(LS_SHARE_CNT) || "0", 10) || 0;
    if (cnt >= 3) return;
    localStorage.setItem(LS_SHARE_CNT, String(cnt + 1));
    addBonus(shareBonusN);
  }

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

  // ---- 질문 횟수 ----
  var adminGrant = 0; // 관리자가 회원관리에서 부여한 추가 질문 횟수 (Firestore)
  function used() { return parseInt(localStorage.getItem(LS_COUNT) || "0", 10) || 0; }
  function bonus() { return parseInt(localStorage.getItem(LS_BONUS) || "0", 10) || 0; }
  function remaining() { return Math.max(0, FREE_ANON + bonus() + adminGrant - used()); }

  // 12시간마다 질문 1회 자동 재충전 (기본 3회 한도까지 회복)
  function applyRegen() {
    var u = used();
    if (u <= 0) { localStorage.removeItem(LS_REGEN); return; }
    var last = parseInt(localStorage.getItem(LS_REGEN) || "0", 10);
    if (!last) { localStorage.setItem(LS_REGEN, String(Date.now())); return; }
    var periods = Math.floor((Date.now() - last) / REGEN_MS);
    if (periods > 0) {
      var give = Math.min(periods, u);
      localStorage.setItem(LS_COUNT, String(u - give));
      localStorage.setItem(LS_REGEN, String(last + give * REGEN_MS));
      if (used() <= 0) localStorage.removeItem(LS_REGEN);
    }
  }
  // 다음 재충전까지 남은 ms (없으면 0)
  function nextRegenMs() {
    var last = parseInt(localStorage.getItem(LS_REGEN) || "0", 10);
    if (!last || used() <= 0) return 0;
    return Math.max(0, (last + REGEN_MS) - Date.now());
  }
  function fmtRegen() {
    var ms = nextRegenMs();
    if (!ms) return "";
    var h = Math.ceil(ms / (60 * 60 * 1000));
    if (h <= 1) return "약 1시간 이내";
    return "약 " + h + "시간 뒤";
  }

  function renderQuota() {
    applyRegen();
    if (remainEl) remainEl.textContent = remaining();
    if (remaining() <= 0) {
      runBtn.disabled = true;
      runBtn.textContent = "질문 소진 · " + (fmtRegen() || "12시간 뒤") + " 1회 충전";
    } else if (!running && runBtn.textContent.indexOf("질문 소진") === 0) {
      runBtn.disabled = false;
      runBtn.textContent = "→ 강팀 회의시작해";
    }
  }
  function consumeOne() {
    localStorage.setItem(LS_COUNT, String(used() + 1));
    // 재충전 기준 시각 시작 (처음 소진 시)
    if (used() >= FREE_ANON + bonus() + adminGrant && !localStorage.getItem(LS_REGEN)) {
      localStorage.setItem(LS_REGEN, String(Date.now()));
    }
    renderQuota();
  }
  function addBonus(n) {
    localStorage.setItem(LS_BONUS, String(bonus() + n));
    renderQuota();
  }

  // ---- 로그인 사용자 회의 내역 ----
  function currentUid() {
    var u = window.__currentUser;
    return (u && u.uid) ? u.uid : null;
  }
  var historyCache = [];   // 최근 회의 목록 (최신순)

  // html 조각에서 회의 제목 추출 (tw-m-title) — 없으면 프롬프트 앞부분
  function extractTitle(html, prompt) {
    var m = /class="tw-m-title"[^>]*>([\s\S]*?)<\/div>/i.exec(html || "");
    if (m) {
      var t = m[1].replace(/<[^>]+>/g, "").trim();
      if (t) return t;
    }
    return (prompt || "강팀 회의").slice(0, 40);
  }

  function fmtStamp(createdAt) {
    var d;
    if (createdAt && typeof createdAt.toDate === "function") d = createdAt.toDate();
    else if (typeof createdAt === "number") d = new Date(createdAt);
    else d = new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return { date: d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()),
             time: p(d.getHours()) + ":" + p(d.getMinutes()) };
  }

  function historyListHtml() {
    if (!historyCache.length) return '';
    var rows = historyCache.map(function (m, i) {
      var s = fmtStamp(m.createdAt);
      return '<button type="button" class="tw-hist-item" data-hidx="' + i + '">' +
        '<span class="tw-hist-when">' + s.date + ' ' + s.time + '</span>' +
        '<span class="tw-hist-title">' + esc(m.title || "강팀 회의") + '</span></button>';
    }).join("");
    return '<div class="tw-history"><div class="tw-history-head">내 회의 내역</div>' +
      '<div class="tw-history-list">' + rows + '</div></div>';
  }

  function loadHistory() {
    var uid = currentUid();
    if (!uid || !window.appMeetings) { historyCache = []; return Promise.resolve([]); }
    return window.appMeetings.list(uid).then(function (list) {
      historyCache = list || [];
      return historyCache;
    });
  }

  // 저장된 회의 열기 (횟수 차감·재저장 없이)
  function openSaved(idx) {
    var m = historyCache[idx];
    if (!m) return;
    renderResult(m.html, m.title, false, true);
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
    return "상품기획천재 강팀 AI의 회의내용이에요\n\"" + (title || "내 앱 아이디어") +
      "\"\n\n너도 아이디어를 얻어봐 → " + myRefLink() + "\n제작 @" + CREATOR_THREADS + " #Appter #강팀";
  }

  // 회의 화면 캡처 (meeting.html의 이미지 저장과 같은 html2canvas 방식 — 필요할 때만 로드)
  var h2cPromise = null;
  function loadH2C() {
    if (window.html2canvas) return Promise.resolve();
    if (!h2cPromise) {
      h2cPromise = new Promise(function (res, rej) {
        var s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }
    return h2cPromise;
  }

  function captureMeetingBlob() {
    var body = resultEl && resultEl.querySelector(".tw-result-body");
    if (!body) return Promise.resolve(null);
    return loadH2C().then(function () {
      var bg = getComputedStyle(document.body).backgroundColor;
      if (!bg || bg === "rgba(0, 0, 0, 0)") bg = "#0b0a14";
      var pad = document.createElement("div");
      pad.style.cssText = "position:fixed;left:-99999px;top:0;width:560px;padding:26px;box-sizing:border-box;background:" + bg;
      pad.appendChild(body.cloneNode(true));
      document.body.appendChild(pad);
      return window.html2canvas(pad, { scale: 2, backgroundColor: bg, useCORS: true })
        .then(function (canvas) {
          return new Promise(function (res) { canvas.toBlob(res, "image/png"); });
        })
        .finally(function () { document.body.removeChild(pad); });
    }).catch(function () { return null; });
  }

  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function copyText(t) {
    var ta = document.createElement("textarea");
    ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
  }

  function openThreadsIntent(caption) {
    var url = "https://www.threads.net/intent/post?text=" + encodeURIComponent(caption);
    window.open(url, "_blank", "noopener");
  }

  function isMobileDevice() {
    var ua = navigator.userAgent || "";
    if (/Mobi|Android|iPhone|iPod|Windows Phone/i.test(ua)) return true;
    if (/iPad/i.test(ua)) return true;
    if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true; // iPadOS 13+
    return false;
  }

  // 회의 화면 이미지를 자동 첨부해서 공유.
  // 모바일: 공유시트(navigator.share)에 이미지 파일 자동 첨부 → 스레드/인스타 앱 선택.
  // PC: 윈도우 공유창엔 스레드가 없으므로 이미지 자동 저장 + 스레드 글쓰기 창(문구 채워짐)을 연다.
  function shareMeeting(title, mode) {
    grantShareBonus(); // SNS 공유 보너스 (하루 최대 3번)
    var caption = shareCaption(title);
    return captureMeetingBlob().then(function (blob) {
      if (isMobileDevice() && blob && navigator.canShare) {
        var file = new File([blob], "강팀회의록.png", { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          return navigator.share({ files: [file], text: caption }).catch(function (e) {
            if (e && e.name === "AbortError") return;
            fallbackShare(blob, caption, mode);
          });
        }
      }
      fallbackShare(blob, caption, mode);
    });
  }

  function fallbackShare(blob, caption, mode) {
    if (blob) downloadBlob(blob, "강팀회의록.png");
    if (mode === "threads") {
      if (blob) alert("회의 화면 이미지를 저장했어요. 스레드 글에 첨부해 주세요!");
      openThreadsIntent(caption);
    } else {
      copyText(caption);
      alert(blob
        ? "회의 화면 이미지를 저장하고 공유 문구를 복사했어요. 인스타/스레드에 붙여넣고 이미지를 첨부하세요!"
        : "공유 문구를 복사했어요. 인스타/스레드에 붙여넣기 하세요!");
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

  function renderResult(html, title, isDemo, fromHistory) {
    resultEl.innerHTML =
      historyListHtml() +
      (isDemo ? '<div class="tw-demo-note">데모 미리보기 — 실제 강팀 AI(Gemini) 연결은 다음 단계입니다.</div>' : "") +
      (!fromHistory && remaining() <= 1 ? quotaNoticeHtml(remaining()) : "") +
      '<div class="tw-result-body">' + metaHtml() + html + "</div>" +
      '<div class="tw-share">' +
        '<button type="button" class="tw-share-btn tw-share-threads">스레드로 퍼가기</button>' +
        '<button type="button" class="tw-share-btn tw-share-other">인스타·기타 공유</button>' +
      "</div>" +
      '<div class="tw-credit">이 회의 만든 곳 · <a href="https://www.threads.net/@' + CREATOR_THREADS + '" target="_blank" rel="noopener">@' + CREATOR_THREADS + "</a></div>";
    resultEl.classList.remove("hidden");
    resultEl.querySelector(".tw-share-threads").addEventListener("click", function () { shareMeeting(title, "threads"); });
    resultEl.querySelector(".tw-share-other").addEventListener("click", function () { shareMeeting(title, "other"); });
    bindHistoryClicks();
    resultEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function bindHistoryClicks() {
    var items = resultEl.querySelectorAll(".tw-hist-item");
    for (var i = 0; i < items.length; i++) {
      items[i].addEventListener("click", function () {
        openSaved(parseInt(this.getAttribute("data-hidx"), 10));
      });
    }
  }

  // 결과 없이 내역만 보여주기 (로그인 후 목록 열기)
  function showHistoryOnly() {
    if (!historyCache.length) return;
    resultEl.innerHTML = historyListHtml() +
      '<div class="tw-hist-hint">지난 회의를 눌러 다시 열어볼 수 있어요.</div>';
    resultEl.classList.remove("hidden");
    bindHistoryClicks();
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

  function quotaNoticeHtml(remain) {
    if (remain <= 0) {
      var when = fmtRegen() || "약 12시간 뒤";
      return '<div class="tw-notice tw-warn">질문 횟수를 모두 사용했어요.<br>' +
        '<b>' + when + '</b> 질문 1회가 자동으로 충전돼요. ' +
        'SNS에 공유하면 바로 <b>3회</b>를 더 받을 수 있어요!</div>';
    }
    if (remain <= 1) {
      return '<div class="tw-notice tw-warn">이용 가능한 질문이 <b>' + Math.max(0, remain) + '회</b> 남았습니다.<br>' +
        'SNS에 공유하고 <b>3회</b> 더 이용해 보세요! (하루 최대 3회 추가) · 12시간마다 1회 자동 충전</div>';
    }
    return '<div class="tw-notice">질문 <b>3회</b> 중 <b>' + remain + '회</b> 남았습니다. ' +
      '가입·로그인 후 SNS로 퍼가실 때마다 <b>3회씩</b> 더 늘어나요. (퍼가기 적립은 하루 최대 <b>3번(9회질문)</b>)</div>';
  }

  function showLoading(afterRemain) {
    resultEl.innerHTML =
      quotaNoticeHtml(afterRemain) +
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

      // 로그인 사용자면 회의 내역 저장 후 목록 갱신
      var uid = currentUid();
      var title = extractTitle(html, prompt);
      if (!isDemo && uid && window.appMeetings) {
        try {
          await window.appMeetings.add({ uid: uid, title: title, prompt: prompt, html: html });
          await loadHistory();
        } catch (e) { /* 저장 실패해도 결과는 보여줌 */ }
      }
      renderResult(html, title, isDemo);
    } finally {
      stopLoading();
      running = false;
      renderQuota();
      if (remaining() > 0) runBtn.textContent = orig;
    }
  });

  // ---- 더 받기 (체험 3회 → 가입·로그인 후 SNS 퍼가기 1회당 +3회, 하루 최대 3번) ----
  function showMore() {
    var loggedIn = !!(window.appAuth && window.appAuth.getCurrentUser && window.appAuth.getCurrentUser());
    var regen = fmtRegen() ? "\n(" + fmtRegen() + " 질문 1회가 자동 충전돼요)" : "";
    var msg = loggedIn
      ? "질문 횟수를 다 썼어요.\n\nSNS로 공유하실 때마다 3회씩 더 드려요 (하루 최대 3번(9회질문)):\n" + myRefLink() + regen
      : "질문 3회를 다 썼어요.\n\n가입·로그인 후 SNS로 공유하실 때마다 3회씩 더 늘어나요.\n(퍼가기 적립은 하루 최대 3번(9회질문))" + regen + "\n\n지금 가입할까요?";
    if (loggedIn) {
      shareMeeting("Appter 강팀 질문 결과", "other");
    } else {
      if (confirm(msg) && window.appAuth && window.appAuth.loginWithGoogle) window.appAuth.loginWithGoogle();
    }
  }
  if (moreBtn) moreBtn.addEventListener("click", showMore);

  // ---- 로그인 감지 → 회의 내역 미리 로드 (plain script라 폴링으로 감시) ----
  var lastUid = null;
  setInterval(function () {
    var uid = currentUid();
    if (uid === lastUid) return;
    lastUid = uid;
    if (uid) {
      // 관리자 부여 무료 횟수 반영
      if (window.appMeetings && window.appMeetings.grant) {
        window.appMeetings.grant(uid).then(function (g) {
          adminGrant = g || 0;
          renderQuota();
        });
      }
      // 가입(로그인) 보너스 — 이 기기에서 1회만
      if (!localStorage.getItem(LS_SIGNUP) && signupBonusN > 0) {
        localStorage.setItem(LS_SIGNUP, "1");
        addBonus(signupBonusN);
      }
      loadHistory().then(function () {
        // 결과창이 비어 있을 때만 내역 목록을 띄운다 (열람 중 방해 X)
        if (historyCache.length && (resultEl.classList.contains("hidden") || !resultEl.innerHTML.trim())) {
          showHistoryOnly();
        }
      });
    } else {
      historyCache = [];
      adminGrant = 0;
      renderQuota();
    }
  }, 1500);

  // ---- 스친추가 적립: 버튼 눌러 스레드 프로필 열면 1회에 한해 +3회 ----
  var followBtn = document.querySelector(".tw-follow");
  if (followBtn) followBtn.addEventListener("click", function () {
    if (localStorage.getItem(LS_FOLLOW)) return;
    if (followBonusN <= 0) return;
    localStorage.setItem(LS_FOLLOW, "1");
    addBonus(followBonusN);
    setTimeout(function () { alert("스친추가 고마워요! 질문 " + followBonusN + "회가 추가됐어요."); }, 400);
  });

  renderQuota();
  // 관리자 설정(무료·가입·스친추가·공유 보너스) 로드 (app.js가 window.appMeetings 세팅한 뒤)
  loadConfig();
  setTimeout(loadConfig, 800);
  // 12시간 재충전·카운트다운 갱신 (1분마다)
  setInterval(renderQuota, 60000);
})();
