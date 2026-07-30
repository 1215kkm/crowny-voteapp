// ============================================================
// 강팀 회의록 음성 읽어주기 (TTS) — Appter 판
// · 브라우저 내장 음성(Web Speech API) 사용 — 인터넷·가입 불필요, 아이폰 사파리 지원
// · 멤버마다 목소리 톤(높낮이·속도)을 다르게 → 연기하듯이
// · (속마음)·지문은 낮고 느리게, 작게 = 연기. "(웃으며)" 같은 지시는 읽지 않고 말투로 표현
// · 각 발언 앞 ▶ 를 누르면 그 줄부터 읽음
// 사용법: MeetingTTS.attach(회의록루트엘리먼트)  — 렌더될 때마다 호출(재초기화 OK)
//        MeetingTTS.stop()                      — 재생 중지·바 숨김
// 마크업: .tw-m-act(daepyo|gdi|gdev|gchk|abang) > <b>이름</b> "대사" <span class="tw-think">(속마음)</span>
//        .tw-m-sum(정리 박스, li), .tw-m-h1 / h1(제목)
// ※ iOS: 화면이 꺼지거나 다른 앱으로 가면 음성이 멈춥니다(브라우저 정책).
// ============================================================
(function () {
  "use strict";

  // 멤버별 목소리 성격 (personas 를 소리로 — 높낮이 pitch / 속도 rate)
  var CAST = {
    daepyo: { name: "강대표", pitch: 0.72, rate: 0.94 }, // 45세 남, 짧고 묵직
    gdev:   { name: "강개발", pitch: 0.88, rate: 1.06 }, // 35세 직설, 딱딱 끊음
    abang:  { name: "아뱅",   pitch: 1.08, rate: 1.16 }, // 자문위원, 들뜨고 빠름
    gchk:   { name: "강체크", pitch: 1.18, rate: 0.98 }, // 28세 여, 꼼꼼·또박또박
    gdi:    { name: "강디",   pitch: 1.38, rate: 1.12 }  // 26세 여 신입, 발랄
  };
  var ROLES = ["daepyo", "gdev", "abang", "gchk", "gdi"];
  var NARR = { pitch: 0.98, rate: 0.95, vol: 0.85 }; // 지문·정리 읽는 해설자

  // 괄호 지문을 '읽지 않고' 말투로 연기 — 표에 걸리고 12자 이하면 지시로 본다
  var DIRECTION = [
    [/속삭이|작게|조용히|낮은 목소리|나직/,        { pitch: -0.10, rate: 0.85, vol: 0.45 }],
    [/웃으며|웃음|웃는|피식|킥킥|씩 웃|밝게/,      { pitch: +0.14, rate: 1.08 }],
    [/한숨|지친|힘없|맥없|축 처/,                 { pitch: -0.12, rate: 0.80, vol: 0.78 }],
    [/버럭|소리치|고함|크게|화내|짜증|발끈/,       { pitch: +0.10, rate: 1.16 }],
    [/단호|딱 잘라|못 박|확신|힘주어/,            { pitch: -0.07, rate: 0.88 }],
    [/급하게|빠르게|서둘러|다급|허둥/,            { rate: 1.28 }],
    [/천천히|느리게|또박또박|차분/,               { rate: 0.80 }],
    [/망설이|머뭇|주저|말끝을 흐|더듬/,           { rate: 0.84, pauseBefore: 420 }],
    [/놀라|깜짝|헉|당황/,                        { pitch: +0.16, rate: 1.14 }],
    [/진지|무겁게|심각|굳은/,                     { pitch: -0.11, rate: 0.86 }],
    [/비꼬|시니컬|비아냥|삐딱/,                   { pitch: -0.05, rate: 0.90 }],
    [/^\s*(사이|침묵|정적|잠깐|멈춤|정색)\s*$/,    { pauseOnly: 900 }]
  ];
  var DIR_MAXLEN = 12;
  var SPEEDS = [1.0, 1.25, 1.5, 0.85];

  var Q = [], I = 0, on = false, paused = false, actMode = true, rate = 1.0;
  var voices = {}, primed = false, timer = null, root = null, bar = null, hintEl = null;
  var curBtns = [];   // 현재 회의록의 줄앞 버튼들
  var curBtnEl = null; // 지금 읽고 있는 발언 요소(.tw-m-act) — 그 버튼만 ■(정지)로

  // 지금 읽는 줄의 버튼만 ■(정지)로, 나머지는 ▶(재생). 재생 중이 아니면 전부 ▶.
  function setInlineState() {
    for (var i = 0; i < curBtns.length; i++) {
      var b = curBtns[i];
      var act = b.parentNode; // 버튼은 .tw-m-act 의 첫 자식
      if (on && curBtnEl && act === curBtnEl) {
        b.textContent = "■"; b.title = "읽기 정지"; b.setAttribute("aria-label", "읽기 정지"); b.classList.add("playing");
      } else {
        b.textContent = "▶"; b.title = "여기서부터 읽어주기"; b.setAttribute("aria-label", "여기서부터 읽어주기"); b.classList.remove("playing");
      }
    }
  }

  function supported() {
    return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  }

  function direction(text) {
    var t = (text || "").trim();
    if (!t || t.length > DIR_MAXLEN) return null;
    for (var i = 0; i < DIRECTION.length; i++) if (DIRECTION[i][0].test(t)) return DIRECTION[i][1];
    return null;
  }
  function mergeAct(act, d) {
    if (!act) act = { pitch: 0, rate: 1, vol: 1, pauseBefore: 0 };
    if (d.pitch) act.pitch += d.pitch;
    if (d.rate) act.rate *= d.rate;
    if (d.vol) act.vol *= d.vol;
    if (d.pauseBefore) act.pauseBefore = Math.max(act.pauseBefore, d.pauseBefore);
    return act;
  }

  // 한국어 음성 확보 — 여러 개면 멤버별로 서로 다른 음성 배정
  function loadVoices() {
    if (!supported()) return;
    var all = window.speechSynthesis.getVoices() || [];
    var ko = all.filter(function (v) { return /^ko/i.test(v.lang || ""); });
    if (!ko.length) return;
    ROLES.forEach(function (r, idx) { voices[r] = ko[idx % ko.length]; });
    voices._narr = ko[0];
  }

  // 읽기 좋게 다듬기 — 따옴표·괄호·이모지·화살표·도형기호 제거
  function clean(s) {
    if (!s) return "";
    return s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}\u{25A0}-\u{25FF}\u{2B00}-\u{2BFF}]/gu, " ")
      .replace(/["“”'‘’()\[\]（）]/g, " ")
      .replace(/[·•]/g, ", ")
      .replace(/\s+/g, " ").trim();
  }
  // 요소의 글자만 — 우리가 넣은 ▶ 버튼은 빼고
  function ownText(el) {
    var c = el.cloneNode(true);
    c.querySelectorAll(".tw-ttsbtn").forEach(function (b) { b.remove(); });
    return c.textContent;
  }

  // 긴 문장은 잘라 담는다 — iOS 는 긴 문장을 읽다 끊기는 일이 있어서
  function push(item) {
    var MAX = 170;
    if (item.text.length <= MAX) { Q.push(item); return; }
    var parts = item.text.match(/[^.!?…]+[.!?…]*\s*/g) || [item.text], buf = "";
    parts.forEach(function (p) {
      if ((buf + " " + p).trim().length > MAX && buf) { Q.push(Object.assign({}, item, { text: buf.trim() })); buf = p; }
      else buf = (buf ? buf + " " : "") + p;
    });
    if (buf.trim()) Q.push(Object.assign({}, item, { text: buf.trim() }));
  }

  // 읽을 내용을 화면 순서대로 수집
  function build() {
    Q = [];
    if (!root) return;
    var nodes = root.querySelectorAll(".tw-m-h1, h1, .tw-m-act, .tw-m-sum");
    [].forEach.call(nodes, function (el) {
      if (el.matches(".tw-m-h1, h1")) {
        var t = clean(ownText(el));
        if (t) Q.push({ el: el, kind: "narr", text: "회의 제목. " + t });
        return;
      }
      if (el.classList.contains("tw-m-sum")) {
        var items = [].map.call(el.querySelectorAll("li"), function (li) { return clean(li.textContent); }).filter(Boolean);
        if (items.length) Q.push({ el: el, kind: "narr", text: "정리. " + items.join(". ") });
        return;
      }
      // .tw-m-act — 발언 한 줄
      var role = null;
      for (var i = 0; i < ROLES.length; i++) { if (el.classList.contains(ROLES[i])) { role = ROLES[i]; break; } }
      var chunks = [], act = null;
      [].forEach.call(el.childNodes, function (n) {
        if (n.nodeType === 3) {
          var t3 = clean(n.textContent);
          if (t3) chunks.push({ kind: "line", text: t3 });
        } else if (n.nodeType === 1 && n.classList && n.classList.contains("tw-think")) {
          var t4 = clean(n.textContent);
          if (!t4) return;
          var d = direction(t4);
          if (d) { act = mergeAct(act, d); if (d.pauseOnly) chunks.push({ kind: "pause", ms: d.pauseOnly }); }
          else chunks.push({ kind: "think", text: t4 });
        }
        // <b>이름</b> 등 그 외 요소는 아래에서 따로 처리
      });
      var b = el.querySelector("b");
      if (b) { var w = clean(b.textContent); if (w) Q.push({ el: el, kind: "who", role: role, text: w }); }
      chunks.forEach(function (c) {
        if (c.kind === "pause") { Q.push({ el: el, kind: "pause", ms: c.ms }); return; }
        push({ el: el, kind: c.kind, role: role, text: c.text, act: act });
      });
    });
  }

  function mark(el) {
    var prev = document.querySelector(".tts-now");
    if (prev) prev.classList.remove("tts-now");
    if (!el) return;
    el.classList.add("tts-now");
    // 버튼 있는 발언 줄이면 그 버튼을 ■(정지)로 옮긴다. 제목·정리(버튼 없음)일 땐 직전 ■ 유지.
    if (el.querySelector && el.querySelector(".tw-ttsbtn")) { curBtnEl = el; setInlineState(); }
    var r = el.getBoundingClientRect();
    if (r.top < 70 || r.bottom > window.innerHeight - 110) {
      el.scrollIntoView({ block: "center", behavior: (matchMedia("(prefers-reduced-motion:reduce)").matches ? "auto" : "smooth") });
    }
  }

  function speakAt(i) {
    if (i >= Q.length) { finish(); return; }
    I = i;
    var it = Q[i];
    if (it.kind === "pause") {
      mark(it.el);
      timer = setTimeout(function () { if (on && !paused) speakAt(I + 1); }, it.ms || 700);
      return;
    }
    // "(망설이며)" 같은 지문 → 말하기 전 잠깐 뜸
    if (it.act && actMode && it.act.pauseBefore && !it._waited) {
      it._waited = true; mark(it.el);
      timer = setTimeout(function () { if (on && !paused) speakAt(i); }, it.act.pauseBefore);
      return;
    }
    var u = new SpeechSynthesisUtterance(it.text);
    u.lang = "ko-KR";
    var cast = (it.role && CAST[it.role]) || null;
    if (it.kind === "narr") {
      u.pitch = NARR.pitch; u.rate = NARR.rate * rate; u.volume = NARR.vol;
      if (voices._narr) u.voice = voices._narr;
    } else if (cast) {
      u.pitch = cast.pitch; u.rate = cast.rate * rate; u.volume = 1;
      if (voices[it.role]) u.voice = voices[it.role];
      if (it.kind === "who") { u.rate = cast.rate * rate * 1.05; u.volume = 0.9; }
      if (it.kind === "think" && actMode) { // 속마음 = 낮고 느리게, 작게
        u.pitch = Math.max(0.1, cast.pitch - 0.18); u.rate = cast.rate * rate * 0.86; u.volume = 0.62;
      }
    } else {
      u.pitch = 1; u.rate = rate; u.volume = 1;
    }
    if (it.act && actMode && it.kind !== "who") {
      u.pitch = Math.max(0.1, Math.min(2, u.pitch + (it.act.pitch || 0)));
      u.rate = Math.max(0.1, Math.min(4, u.rate * (it.act.rate || 1)));
      u.volume = Math.max(0, Math.min(1, u.volume * (it.act.vol || 1)));
    }
    if (it.kind === "who") u.text = it.text + ","; // 이름 뒤 짧은 쉼
    u.onstart = function () { mark(it.el); };
    u.onend = function () { if (on && !paused) speakAt(I + 1); };
    u.onerror = function (e) { if (e && e.error === "interrupted") return; if (on && !paused) speakAt(I + 1); };
    try { window.speechSynthesis.speak(u); }
    catch (err) { hint("음성 재생에 실패했어요."); finish(); }
  }

  function sync() {
    setInlineState(); // 줄앞 버튼(재생↔정지)도 함께 갱신
    if (!bar) return;
    var p = bar.querySelector(".tts-play"), s = bar.querySelector(".tts-stop");
    p.textContent = (on && !paused) ? "❚❚" : "▶";
    p.title = (on && !paused) ? "일시정지" : "읽어주기";
    s.disabled = !on;
  }
  function finish() {
    on = false; paused = false; curBtnEl = null;
    var prev = document.querySelector(".tts-now"); if (prev) prev.classList.remove("tts-now");
    sync();
  }
  function halt() {
    if (timer) { clearTimeout(timer); timer = null; }
    try { window.speechSynthesis.cancel(); } catch (e) {}
  }
  function stop() {
    on = false; paused = false; halt(); I = 0; finish();
    if (bar) bar.style.display = "none";
  }
  // iOS 는 사용자가 직접 누른 순간에만 음성을 열어준다 — 첫 탭에서 잠금 해제
  function prime() {
    if (primed) return;
    try { var w = new SpeechSynthesisUtterance(" "); w.volume = 0; window.speechSynthesis.speak(w); primed = true; } catch (e) {}
  }
  function start(from) {
    if (!supported()) { hint("이 브라우저는 읽어주기를 지원하지 않아요. 사파리나 크롬으로 열어 주세요.", 5000); return; }
    prime(); loadVoices(); build();
    if (!Q.length) { hint("읽을 내용이 아직 없어요."); return; }
    halt();
    var s = 0;
    if (from) { for (var i = 0; i < Q.length; i++) { if (Q[i].el === from) { s = i; break; } } }
    // 누른 줄이 발언이면 바로 ■(정지)로 보이게
    curBtnEl = (from && from.querySelector && from.querySelector(".tw-ttsbtn")) ? from : null;
    on = true; paused = false; sync();
    setTimeout(function () { speakAt(s); }, 60);
  }
  function toggle() {
    if (!on) { start(null); return; }
    if (paused) { paused = false; sync(); speakAt(I); }
    else { paused = true; halt(); sync(); }
  }
  function cycleSpeed() {
    var i = SPEEDS.indexOf(rate); rate = SPEEDS[(i + 1) % SPEEDS.length];
    bar.querySelector(".tts-speed").textContent = rate.toFixed(2).replace(/0$/, "") + "×";
    if (on && !paused) { halt(); speakAt(I); }
  }
  function toggleAct() {
    actMode = !actMode;
    var b = bar.querySelector(".tts-act");
    b.classList.toggle("on", actMode);
    hint(actMode ? "속마음·지문을 연기하듯 읽습니다 (낮고 느리게)" : "전부 같은 톤으로 읽습니다");
  }
  function hint(msg, ms) {
    if (!hintEl) return;
    hintEl.textContent = msg; hintEl.style.display = "block";
    clearTimeout(hint._t); if (ms !== 0) hint._t = setTimeout(function () { hintEl.style.display = "none"; }, ms || 3600);
  }

  // 고정 컨트롤 바 — 없으면 만든다 (두 화면에서 공용)
  function ensureBar() {
    if (bar) return;
    bar = document.createElement("div");
    bar.id = "tw-tts-bar";
    bar.innerHTML =
      '<button type="button" class="tts-play" title="읽어주기">▶</button>' +
      '<button type="button" class="tts-stop" title="정지" disabled>■</button>' +
      '<button type="button" class="tts-speed wide" title="읽는 속도">1.0×</button>' +
      '<button type="button" class="tts-act wide on" title="속마음·지문을 연기하듯 읽기">🎭</button>';
    hintEl = document.createElement("div");
    hintEl.id = "tw-tts-hint";
    document.body.appendChild(bar);
    document.body.appendChild(hintEl);
    bar.querySelector(".tts-play").addEventListener("click", toggle);
    bar.querySelector(".tts-stop").addEventListener("click", stop);
    bar.querySelector(".tts-speed").addEventListener("click", cycleSpeed);
    bar.querySelector(".tts-act").addEventListener("click", toggleAct);
  }

  // 각 발언 앞에 ▶ — 그 줄부터 읽기 (재생 중엔 ⏹ 정지로 바뀌어, 누르면 멈춤)
  function injectButtons() {
    if (!root) return;
    root.querySelectorAll(".tw-m-act").forEach(function (el) {
      if (el.getAttribute("data-tts") === "1") return;
      el.setAttribute("data-tts", "1");
      var b = document.createElement("button");
      b.className = "tw-ttsbtn"; b.type = "button"; b.textContent = "▶";
      b.setAttribute("aria-label", "여기서부터 읽어주기");
      b.title = "여기서부터 읽어주기";
      b.addEventListener("click", function (ev) {
        ev.stopPropagation();
        if (on && curBtnEl === el) stop(); // 지금 읽는 줄의 ■ → 정지
        else start(el);                    // 그 외 → 이 줄부터 재생(읽는 중이면 여기로 점프)
      });
      el.insertBefore(b, el.firstChild);
    });
    curBtns = [].slice.call(root.querySelectorAll(".tw-ttsbtn"));
  }

  // 공개 API
  window.MeetingTTS = {
    attach: function (rootEl) {
      if (!supported() || !rootEl) return;
      halt(); on = false; paused = false; I = 0;
      root = rootEl;
      ensureBar();
      injectButtons();
      sync();
      bar.style.display = "flex";
    },
    stop: stop,
    supported: supported
  };

  if (supported()) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
  window.addEventListener("beforeunload", halt);
})();
