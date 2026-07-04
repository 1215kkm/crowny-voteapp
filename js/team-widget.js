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
  var MEETING_BASE = "https://crowny-appter.web.app/m/"; // 공유 회의 뷰어
  var currentMeetingId = null;         // 현재 표시중 회의 id (저장된 경우)
  var preCapturedBlob = null;          // 모바일 공유용 사전 캡처 이미지 (제스처 유지)
  var searchCreditsN = 0;              // 검색권 잔여 (검색 체크박스 노출용)

  var meetingProviderVal = "gemini";
  var ADMIN_EMAIL = "rute20002@gmail.com";
  function isAdminUser() {
    var u = window.__currentUser;
    return !!(u && u.email === ADMIN_EMAIL);
  }
  // 관리자만 보이는 현재 회의 모델 표시
  function renderModelBadge() {
    var el = document.getElementById("tw-model-badge");
    if (!el) return;
    if (isAdminUser()) {
      var name = meetingProviderVal === "claude" ? "Claude Haiku 4.5" : "Gemini 2.5 Flash";
      el.textContent = "🔧 관리자 전용 · 현재 회의 모델: " + name;
      el.style.display = "block";
    } else {
      el.style.display = "none";
    }
  }

  // 관리자 설정(무료·가입·스친추가·공유 보너스 + 회의 모델) 로드
  function loadConfig() {
    if (!(window.appMeetings && window.appMeetings.config)) return;
    window.appMeetings.config().then(function (c) {
      if (!c) return;
      FREE_ANON = c.freeBase;
      followBonusN = c.followBonus;
      signupBonusN = c.signupBonus;
      shareBonusN = c.shareBonus;
      meetingProviderVal = c.meetingProvider || "gemini";
      renderQuota();
      renderModelBadge();
      renderFollowBonus();
    });
  }
  // 스친추가 버튼의 +N회 표시 (관리자 설정값)
  function renderFollowBonus() {
    var el = document.getElementById("tw-follow-bonus");
    if (el) el.textContent = followBonusN > 0 ? "+" + followBonusN + "회" : "";
  }
  // 검색권 있으면 검색 체크박스 노출 + 잔여 표시
  function renderSearchUi() {
    var wrap = document.getElementById("tw-search-wrap");
    var left = document.getElementById("tw-search-left");
    if (left) left.textContent = searchCreditsN;
    if (wrap) wrap.style.display = searchCreditsN > 0 ? "flex" : "none";
  }
  // 검색권 서버에서 다시 읽기
  function refreshSearchCredits() {
    var uid = currentUid();
    if (uid && window.appMeetings && window.appMeetings.searchCredits) {
      window.appMeetings.searchCredits(uid).then(function (n) { searchCreditsN = n || 0; renderSearchUi(); });
    } else { searchCreditsN = 0; renderSearchUi(); }
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

  // 방문자 영구 id (analytics와 동일 키 공유)
  function visitorId() {
    try {
      var v = localStorage.getItem("appter_visitor_id");
      if (!v) { v = "v_" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36); localStorage.setItem("appter_visitor_id", v); }
      return v;
    } catch (e) { return ""; }
  }

  // URL ?ref=<공유자uid> 로 들어오면 실유입 보상 요청 (서버가 자기제외·중복·상한 판정)
  try {
    var p = new URLSearchParams(location.search);
    var ref = p.get("ref");
    if (ref) {
      localStorage.setItem("appter_came_from_ref", ref);
      setTimeout(function () {
        if (window.appMeetings && window.appMeetings.recordVisit) {
          window.appMeetings.recordVisit(ref, visitorId());
        }
      }, 1200);
    }
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
    renderModelBadge(); // 관리자 배지를 매 갱신마다 현재 로그인 상태로 재확인(비관리자엔 숨김)
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
    currentMeetingId = m.id || null;
    renderResult(m.html, m.title, false, true);
  }

  // 내 추천 id — 로그인 시 uid(실유입 크레딧 대상), 익명은 게스트 id(크레딧 안 됨)
  function myRefId() {
    var u = window.__currentUser;
    if (u && u.uid) return u.uid;
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
  // 회의 내용 앞부분 발췌 (약 1/3, 최대 220자) — 공유 멘트에 포함
  function meetingExcerpt() {
    var body = resultEl && resultEl.querySelector(".tw-result-body");
    if (!body) return "";
    var acts = body.querySelectorAll(".tw-m-act");
    var txt = "";
    for (var i = 0; i < acts.length; i++) {
      txt += acts[i].textContent.replace(/\s+/g, " ").trim() + "\n";
    }
    txt = txt.trim();
    if (!txt) return "";
    var cut = Math.min(Math.floor(txt.length / 3), 220);
    var ex = txt.slice(0, cut).trim();
    if (ex.length < txt.length) ex += "…";
    return ex;
  }

  // 제안자 이름: 로그인=이름, 비로그인=별명(한 번 물어보고 저장, 건너뛰면 '손님')
  function requesterName() {
    var u = window.__currentUser;
    if (u && u.displayName) return String(u.displayName).slice(0, 20);
    var nick = localStorage.getItem("appter_nickname") || "";
    return nick ? nick.slice(0, 20) : "손님";
  }
  function ensureNickname() {
    var u = window.__currentUser;
    if (u && u.displayName) return;
    if (localStorage.getItem("appter_nickname")) return;
    var n = prompt("회의록 참여 명단에 표시할 이름(별명)을 적어주세요. (선택 — 비워두면 '손님')") || "";
    n = n.replace(/[<>"']/g, "").trim().slice(0, 20);
    localStorage.setItem("appter_nickname", n || "손님");
  }

  // 공유 링크: 저장된 회의면 회의내용 페이지(/m/id)로, 아니면 메인으로 (둘 다 추천 ref 포함)
  function shareLink() {
    if (currentMeetingId) return MEETING_BASE + currentMeetingId + "?ref=" + encodeURIComponent(myRefId());
    return myRefLink();
  }

  function shareCaption(title) {
    var ex = meetingExcerpt();
    return "강팀 기능 및 마케팅 회의내용\n\"" + (title || "내 앱 아이디어") + "\"\n\n" +
      (ex ? ex + "\n\n" : "") +
      "전체 회의 보기 → " + shareLink() + "\n제작 @" + CREATOR_THREADS + " #Appter #강팀";
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
      // 저장 이미지는 항상 라이트모드 색상 + 모바일 폭(글자 크게 보이게)
      var pad = document.createElement("div");
      pad.style.cssText = "position:fixed;left:-99999px;top:0;width:400px;padding:22px;box-sizing:border-box;background:#ffffff;font-size:16px";
      var light = {
        "--color-bg": "#ffffff", "--color-surface": "#ffffff", "--color-subtle": "#f9fafb",
        "--color-border": "#eaecf0", "--color-text": "#101828", "--color-text-secondary": "#475467",
        "--color-text-light": "#667085", "--color-accent-start": "#8a38f5", "--color-accent-end": "#d53a6b"
      };
      for (var k in light) pad.style.setProperty(k, light[k]);
      pad.appendChild(body.cloneNode(true));
      document.body.appendChild(pad);
      var SCALE = 2;
      return window.html2canvas(pad, { scale: SCALE, backgroundColor: "#ffffff", useCORS: true })
        .then(function (canvas) {
          return new Promise(function (res) { finishCanvas(canvas).toBlob(res, "image/png"); });
        })
        .finally(function () { document.body.removeChild(pad); });
    }).catch(function () { return null; });
  }

  // 전체 회의 + 하단에 큰 URL 배너 (높이 제한 없음)
  function finishCanvas(src) {
    var W = src.width;
    var footerH = Math.round(W * 0.42);        // 폭 비례 배너 높이
    var contentH = src.height;
    var out = document.createElement("canvas");
    out.width = W; out.height = contentH + footerH;
    var ctx = out.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(src, 0, 0);
    // 하단 배너
    var fy = contentH;
    var g = ctx.createLinearGradient(0, fy, W, fy + footerH);
    g.addColorStop(0, "#8a38f5"); g.addColorStop(1, "#d53a6b");
    ctx.fillStyle = g; ctx.fillRect(0, fy, W, footerH);
    ctx.textAlign = "center"; ctx.fillStyle = "#ffffff";
    var cx = W / 2;
    ctx.font = "bold " + Math.round(W * 0.045) + "px Pretendard, -apple-system, sans-serif";
    ctx.fillText("나도 강팀에게 무료로 물어보기 👇", cx, fy + footerH * 0.34);
    ctx.font = "800 " + Math.round(W * 0.075) + "px Pretendard, -apple-system, sans-serif";
    ctx.fillText("appter.co.kr", cx, fy + footerH * 0.60);
    ctx.font = Math.round(W * 0.033) + "px Pretendard, -apple-system, sans-serif";
    ctx.fillText("강팀 AI 5명이 회의해서 아이디어를 만들어줘요", cx, fy + footerH * 0.82);
    return out;
  }

  // 주제 기반 파일명: appter.co.kr-꿩먹고알먹고회의.png
  function imgFileName(title) {
    var t = String(title || "강팀회의").replace(/[^가-힣a-zA-Z0-9]/g, "").slice(0, 24);
    return "appter.co.kr-" + (t || "강팀회의") + ".png";
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

  // 회의 화면 이미지 + 공유 문구(멘트)를 함께 스레드/인스타로.
  // 데스크톱: 클릭 즉시(제스처 유효) 멘트가 채워진 스레드 작성창을 먼저 열고, 이미지는 뒤이어 저장(첨부용).
  // 모바일: 공유시트(navigator.share)에 이미지+문구를 함께 전달.
  function shareMeeting(title, mode) {
    grantShareBonus(); // SNS 공유 보너스 (하루 최대 3번)
    var caption = shareCaption(title);
    var fname = imgFileName(title);

    if (!isMobileDevice()) {
      // 팝업 차단을 피하려면 window.open을 async(이미지 캡처) 이전, 클릭 제스처 안에서 호출해야 한다
      var win = null;
      if (mode === "threads") {
        win = window.open("https://www.threads.net/intent/post?text=" + encodeURIComponent(caption), "_blank");
      } else {
        copyText(caption);
      }
      captureMeetingBlob().then(function (blob) {
        if (blob) downloadBlob(blob, fname);
        if (mode === "threads") {
          if (win) {
            alert("스레드 작성창을 열었어요(멘트 자동 입력). 방금 저장된 회의 이미지를 글에 첨부해 주세요!");
          } else {
            copyText(caption);
            alert("팝업이 막혀 작성창을 못 열었어요. 공유 문구를 복사했으니 스레드에 붙여넣고, 저장된 이미지를 첨부하세요.");
          }
        } else {
          alert("공유 문구를 복사하고 회의 이미지를 저장했어요. 인스타/스레드에 붙여넣고 이미지를 첨부하세요!");
        }
      });
      return;
    }

    // 모바일: 멘트(회의 발췌+링크 포함)는 항상 복사해두고, 공유시트를 연다.
    // iOS는 이미지+텍스트 동시 자동입력을 막는 경우가 많아 → 이미지는 공유시트(사진첩 '이미지 저장' 가능), 멘트는 붙여넣기 안내.
    copyText(caption);
    if (preCapturedBlob && navigator.canShare) {
      var pfile = new File([preCapturedBlob], fname, { type: "image/png" });
      if (navigator.canShare({ files: [pfile] })) {
        navigator.share({ files: [pfile], text: caption }).then(function () {
          setTimeout(function () {
            alert("멘트를 복사해뒀어요!\n스레드 글쓰기에서 길게 눌러 '붙여넣기' 해주세요.\n(공유창에서 '이미지 저장'을 눌렀다면 사진첩에 저장돼 있어요)");
          }, 300);
        }).catch(function (e) {
          if (e && e.name === "AbortError") return;
          alert("복사됐습니다. 스레드에 가서 붙여넣기해주세요!");
        });
        return;
      }
    }
    // 이미지가 아직 준비 전이면: 문구만 즉시 공유(스레드 선택 시 글에 자동 입력됨)
    if (navigator.share) {
      navigator.share({ text: caption }).catch(function (e) {
        if (e && e.name === "AbortError") return;
        alert("복사됐습니다. 스레드에 가서 붙여넣기해주세요!");
      });
      return;
    }
    alert("복사됐습니다. 스레드에 가서 붙여넣기해주세요!");
  }

  // ---- 결과 렌더 ----
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // 회의록 헤더 — 라벨 → 강팀 주소 → 제목 → 날짜·안건 → 참여 칩 (강팀 회의록 양식)
  function metaHtml(title) {
    var d = new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    var dt = d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
    var t = esc(title || "강팀 회의");
    return '<div class="tw-m-head">' +
      '<div class="tw-m-label">강팀 회의록</div>' +
      '<div class="tw-m-addr">강팀 주소 : <a href="https://appter.co.kr" target="_blank" rel="noopener">appter.co.kr</a></div>' +
      '<div class="tw-m-h1">' + t + '</div>' +
      '<div class="tw-m-sub">' + dt + ' · 안건: ' + t + '</div>' +
      '<div class="tw-m-members"><span class="tw-m-mlabel">참여</span>' +
        '<span class="tw-chip daepyo">강대표</span><span class="tw-chip gdi">강디</span>' +
        '<span class="tw-chip gdev">강개발</span><span class="tw-chip gchk">강체크</span>' +
        '<span class="tw-chip abang">아뱅</span>' +
        '<span class="tw-chip req">제안 · ' + esc(requesterName()) + '</span>' +
      '</div></div>';
  }

  function renderResult(html, title, isDemo, fromHistory) {
    // 제목은 헤더로 옮기므로 본문의 tw-m-title 은 제거(중복 방지)
    var bodyHtml = String(html || "").replace(/<div class="tw-m-title"[^>]*>[\s\S]*?<\/div>/i, "");
    resultEl.innerHTML =
      historyListHtml() +
      (isDemo ? '<div class="tw-demo-note">데모 미리보기 — 실제 강팀 AI(Gemini) 연결은 다음 단계입니다.</div>' : "") +
      (!fromHistory && remaining() <= 1 ? quotaNoticeHtml(remaining()) : "") +
      '<div class="tw-result-body">' + metaHtml(title) + bodyHtml + "</div>" +
      '<div class="tw-share">' +
        '<button type="button" class="tw-share-btn tw-share-threads">스레드로 퍼가기</button>' +
        '<button type="button" class="tw-share-btn tw-share-other">인스타·기타 공유</button>' +
      "</div>" +
      '<button type="button" class="tw-share-btn tw-share-img" disabled>📷 이미지 준비 중…</button>' +
      '<div class="tw-credit">이 회의 만든 곳 · <a href="https://www.threads.net/@' + CREATOR_THREADS + '" target="_blank" rel="noopener">@' + CREATOR_THREADS + "</a></div>";
    resultEl.classList.remove("hidden");
    resultEl.querySelector(".tw-share-threads").addEventListener("click", function () { shareMeeting(title, "threads"); });
    resultEl.querySelector(".tw-share-other").addEventListener("click", function () { shareMeeting(title, "other"); });
    var imgBtn = resultEl.querySelector(".tw-share-img");
    imgBtn.addEventListener("click", function () { saveMeetingImage(title); });
    bindHistoryClicks();
    resultEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    // 이미지 미리 캡처 → 준비되면 이미지 저장 버튼 활성화 (모바일은 제스처 안에서 즉시 공유 가능해짐)
    preCapturedBlob = null;
    captureMeetingBlob().then(function (b) {
      preCapturedBlob = b;
      if (b && imgBtn) { imgBtn.disabled = false; imgBtn.textContent = "📷 회의 이미지 저장"; }
      else if (imgBtn) { imgBtn.textContent = "📷 이미지 생성 실패"; }
    }).catch(function () { if (imgBtn) imgBtn.textContent = "📷 이미지 생성 실패"; });
  }

  // 이미지 저장: 모바일=공유창(사진첩 '이미지 저장' 가능), PC=다운로드
  function saveMeetingImage(title) {
    var fname = imgFileName(title);
    if (!preCapturedBlob) { alert("이미지가 아직 준비 중이에요. 잠시 후 다시 눌러주세요."); return; }
    if (isMobileDevice() && navigator.canShare) {
      var f = new File([preCapturedBlob], fname, { type: "image/png" });
      if (navigator.canShare({ files: [f] })) {
        navigator.share({ files: [f] }).catch(function (e) {
          if (e && e.name === "AbortError") return;
          downloadBlob(preCapturedBlob, fname);
        });
        return;
      }
    }
    downloadBlob(preCapturedBlob, fname);
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
    // 입력창 위에 떠있는 원형 로딩 켜기
    var floatEl = document.getElementById("tw-load-float");
    if (floatEl) floatEl.classList.remove("hidden");
    var floatMsg = document.getElementById("tw-load-float-msg");
    var i = 0;
    var msgEl = resultEl.querySelector("#tw-load-msg");
    loadTimer = setInterval(function () {
      i = (i + 1) % LOAD_MSGS.length;
      if (msgEl) msgEl.textContent = LOAD_MSGS[i];
      if (floatMsg) floatMsg.textContent = LOAD_MSGS[i];
    }, 2200);
    resultEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function stopLoading() {
    if (loadTimer) { clearInterval(loadTimer); loadTimer = null; }
    var floatEl = document.getElementById("tw-load-float");
    if (floatEl) floatEl.classList.add("hidden");
  }

  // ---- 실행 ----
  var running = false;
  runBtn.addEventListener("click", async function () {
    if (running) return;
    var prompt = (input.value || "").trim();
    if (!prompt) { input.focus(); return; }
    if (remaining() <= 0) { showMore(); return; }
    ensureNickname(); // 비로그인이면 회의록 표시용 별명 1회 확인

    running = true;
    var orig = runBtn.textContent;
    runBtn.disabled = true;
    runBtn.textContent = "강팀 회의 중…";
    showLoading(remaining() - 1);

    try {
      var html = null, isDemo = false;
      try {
        var headers = { "Content-Type": "application/json" };
        // App Check 토큰(설정돼 있으면) — 스크립트 직접 호출 방지
        try {
          if (window.appMeetings && window.appMeetings.appCheckToken) {
            var tk = await window.appMeetings.appCheckToken();
            if (tk) headers["X-Firebase-AppCheck"] = tk;
          }
        } catch (e) {}
        // 검색 옵션: 체크 + 검색권 있으면 ID토큰 붙여 서버가 검증·차감 후 그라운딩
        var useSearch = false;
        var searchChk = document.getElementById("tw-search-check");
        if (searchChk && searchChk.checked && searchCreditsN > 0) {
          try {
            if (window.appMeetings && window.appMeetings.idToken) {
              var idt = await window.appMeetings.idToken();
              if (idt) { headers["Authorization"] = "Bearer " + idt; useSearch = true; }
            }
          } catch (e) {}
        }
        var res = await fetch(MEETING_API, {
          method: "POST",
          headers: headers,
          body: JSON.stringify({ prompt: prompt, ref: myRefId(), useSearch: useSearch })
        });
        if (res.ok) {
          var data = await res.json();
          html = data.html || null;
        }
      } catch (e) { /* 백엔드 미연결 — 데모로 */ }

      // AI가 임의로 넣은 인라인 style 제거(시각화 width:% 만 허용) — 배경색으로 글자 안 보이는 사고 방지
      if (html) {
        html = html.replace(/\sstyle="([^"]*)"/gi, function (mm, v) {
          return /^\s*width:\s*\d{1,3}%\s*;?\s*$/i.test(v) ? mm : "";
        });
      }
      if (!html) { html = demoMeetingHtml(prompt); isDemo = true; }
      consumeOne();

      // 로그인 사용자면 회의 내역 저장 후 목록 갱신
      var uid = currentUid();
      var title = extractTitle(html, prompt);
      currentMeetingId = null;
      if (!isDemo && uid && window.appMeetings) {
        try {
          var savedId = await window.appMeetings.add({ uid: uid, title: title, prompt: prompt, html: html, requesterName: requesterName() });
          currentMeetingId = savedId || null;
          await loadHistory();
        } catch (e) { /* 저장 실패해도 결과는 보여줌 */ }
      }
      renderResult(html, title, isDemo);
    } finally {
      stopLoading();
      running = false;
      renderQuota();
      refreshSearchCredits(); // 검색권 차감 반영
      if (remaining() > 0) runBtn.textContent = orig;
    }
  });

  // ---- 더 받기 (체험 3회 → 가입·로그인 후 SNS 퍼가기 1회당 +3회, 하루 최대 3번) ----
  function showMore() {
    var loggedIn = !!(window.appAuth && window.appAuth.getCurrentUser && window.appAuth.getCurrentUser());
    var regen = fmtRegen() ? "\n(" + fmtRegen() + " 질문 1회가 자동 충전돼요)" : "";
    var cap = 3; // 하루 공유 적립 최대 횟수
    var maxAdd = shareBonusN * cap;
    var msg = loggedIn
      ? "질문 횟수를 다 썼어요.\n\nSNS로 공유하실 때마다 " + shareBonusN + "회씩 더 드려요 (하루 최대 " + cap + "번(" + maxAdd + "회질문)):\n" + myRefLink() + regen
      : "질문 " + FREE_ANON + "회를 다 썼어요.\n\n가입·로그인 후 SNS로 공유하실 때마다 " + shareBonusN + "회씩 더 늘어나요.\n(퍼가기 적립은 하루 최대 " + cap + "번(" + maxAdd + "회질문))" + regen + "\n\n지금 가입할까요?";
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
    renderModelBadge(); // 로그인 상태 바뀔 때 관리자 모델 배지 갱신
    refreshSearchCredits(); // 검색권 표시 갱신
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

  // 충전 등으로 서버 크레딧이 바뀌면 app.js가 호출해 즉시 잔여 갱신
  window.__refreshTeamGrant = function () {
    refreshSearchCredits();
    var uid = currentUid();
    if (uid && window.appMeetings && window.appMeetings.grant) {
      window.appMeetings.grant(uid).then(function (g) { adminGrant = g || 0; renderQuota(); });
    }
  };

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
  // 강팀 캐릭터 — 접속자마다 랜덤 (gang1~5 = 강대표·강디·강개발·강체크·아뱅)
  (function () {
    var NAMES = ["강대표", "강디", "강개발", "강체크", "아뱅"];
    var n = 1 + Math.floor(Math.random() * 5);
    var img = document.getElementById("tw-chara");
    var tag = document.getElementById("tw-chara-name");
    if (img) img.src = "images/gang" + n + ".png";
    if (tag) tag.textContent = NAMES[n - 1];
  })();
  // 관리자 설정(무료·가입·스친추가·공유 보너스) 로드 (app.js가 window.appMeetings 세팅한 뒤)
  loadConfig();
  setTimeout(loadConfig, 800);
  // 12시간 재충전·카운트다운 갱신 (1분마다)
  setInterval(renderQuota, 60000);
})();
