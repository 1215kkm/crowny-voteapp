// ========================================
// Admin Page - 관리자 대시보드 / 글 관리 / AI / 차단
// ========================================

import { onAuthChange, getCurrentUser } from "./auth.js";
import {
  subscribeToIdeas,
  adminUpdateIdea,
  adminDeleteIdea,
  adminDeleteComment,
  banUser,
  unbanUser,
  listBannedUsers,
  getSettings,
  setSettings,
  enqueueScheduledComment,
  listScheduledComments,
  deleteScheduledComment,
  postAiComment,
  postAiIdea,
  fetchEventsSince,
  subscribeToComments,
  personaLikeIdea,
  personaPostComment,
  personaPostIdea,
  aggregateUserActivities,
  listSubscribers,
  listEmailsByIdea
} from "./firestore.js";
import {
  listPersonas,
  createPersona,
  deletePersona,
  updatePersona,
  seedDefaultPersonasIfNeeded,
  personaToAuthor
} from "./personas.js";
import { ADMIN_EMAIL } from "./ai-config.js";
import {
  generateCommentsForIdea,
  generateNewIdea,
  isAiKeyValid,
  pickFakeAuthor,
  generateOneCommentAsPersona,
  generateNewIdeaAsPersona
} from "./ai.js";

// ---- DOM ----
const gateEl = document.getElementById("admin-gate");
const gateMsg = document.getElementById("admin-gate-msg");
const contentEl = document.getElementById("admin-content");
const tabs = document.querySelectorAll(".admin-tab");
const sections = {
  dashboard: document.getElementById("tab-dashboard"),
  ideas: document.getElementById("tab-ideas"),
  personas: document.getElementById("tab-personas"),
  ai: document.getElementById("tab-ai"),
  members: document.getElementById("tab-members"),
  emails: document.getElementById("tab-emails"),
  bans: document.getElementById("tab-bans")
};

const loginBtn = document.getElementById("login-btn");
const userInfo = document.getElementById("user-info");
const userPhoto = document.getElementById("user-photo");
const userName = document.getElementById("user-name");

// 분석
const rangeBtns = document.querySelectorAll(".range-btn");
const summaryEl = document.getElementById("analytics-summary");
const sourcesEl = document.getElementById("analytics-sources");
const dailyEl = document.getElementById("analytics-daily");

// 글 관리
const ideasListEl = document.getElementById("admin-ideas-list");

// AI
const aiBanner = document.getElementById("ai-status-banner");
const autoCommentToggle = document.getElementById("auto-comment-toggle");
const autoPostToggle = document.getElementById("auto-post-toggle");
const settingsSave = document.getElementById("settings-save");
const aiTargetIdea = document.getElementById("ai-target-idea");
const aiCommentCount = document.getElementById("ai-comment-count");
const aiGenComments = document.getElementById("ai-gen-comments");
const aiDripDays = document.getElementById("ai-drip-days");
const aiGenDrip = document.getElementById("ai-gen-drip");
const aiGenIdea = document.getElementById("ai-gen-idea");
const scheduledListEl = document.getElementById("scheduled-list");

// 차단
const banUidInput = document.getElementById("ban-uid");
const banEmailInput = document.getElementById("ban-email");
const banReasonInput = document.getElementById("ban-reason");
const banAddBtn = document.getElementById("ban-add");
const bannedListEl = document.getElementById("banned-list");

// 인물·회원·자동좋아요
const personasListEl = document.getElementById("personas-list");
const personaForm = document.getElementById("persona-form");
const aiPersonaSelect = document.getElementById("ai-persona-select");
const autoLikeToggle = document.getElementById("auto-like-toggle");
const memberSearch = document.getElementById("member-search");
const memberRefresh = document.getElementById("member-refresh");
const membersListEl = document.getElementById("members-list");

let personasCache = [];
let allMembersCache = [];

let allRealIdeas = [];
let unsubIdeas = null;
let currentRange = 1;
const expandedAdminIdeas = new Set();
const adminCommentSubs = {}; // ideaId -> unsub

// ---- Init ----

onAuthChange(handleAuth);

async function handleAuth(user) {
  if (user) {
    loginBtn.classList.add("hidden");
    userInfo.classList.remove("hidden");
    userPhoto.src = user.photoURL || "";
    userName.textContent = user.displayName || "사용자";

    if (user.email === ADMIN_EMAIL) {
      gateEl.classList.add("hidden");
      contentEl.classList.remove("hidden");
      await initAdminFeatures();
    } else {
      gateEl.classList.remove("hidden");
      gateMsg.textContent = `현재 ${user.email} 로 로그인되어 있어요. 관리자 계정(${ADMIN_EMAIL})만 접근 가능합니다.`;
      contentEl.classList.add("hidden");
    }
  } else {
    loginBtn.classList.remove("hidden");
    userInfo.classList.add("hidden");
    gateEl.classList.remove("hidden");
    gateMsg.textContent = `관리자(${ADMIN_EMAIL})로 로그인이 필요합니다.`;
    contentEl.classList.add("hidden");
  }
}

// ---- 탭 전환 ----
tabs.forEach((t) => {
  t.addEventListener("click", () => {
    tabs.forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    Object.values(sections).forEach((s) => s.classList.add("hidden"));
    sections[t.dataset.tab].classList.remove("hidden");
    if (t.dataset.tab === "dashboard") loadAnalytics();
    if (t.dataset.tab === "bans") loadBannedList();
    if (t.dataset.tab === "ai") loadScheduledList();
    if (t.dataset.tab === "personas") loadPersonasList();
    if (t.dataset.tab === "members") loadMembersList();
    if (t.dataset.tab === "emails") loadEmailLists();
  });
});

async function initAdminFeatures() {
  showAiKeyStatus();
  refreshTargetIdeaSelect();
  startIdeasListSubscription();
  await loadSettings();
  await loadAnalytics();
  setupRangeButtons();
  setupAiButtons();
  setupBanButtons();
  setupPersonaForm();
  setupMembersTab();

  // 인물 시드 + 인물 셀렉트 채우기
  try {
    personasCache = await seedDefaultPersonasIfNeeded();
    refreshPersonaSelect();
  } catch (e) { console.warn("personas init failed", e); }

  // 자동 큐 처리 / 자동 새 글 / 자동 좋아요는 이 페이지에 들어왔을 때만
  await processQueueIfEnabled();
  await maybeGenerateAutoIdea();
  await maybeAutoLike();
}

function showAiKeyStatus() {
  if (isAiKeyValid()) {
    aiBanner.textContent = "✅ Gemini API 키 설정 완료. AI 기능 사용 가능.";
    aiBanner.className = "ai-status-banner ok";
  } else {
    aiBanner.innerHTML = "⚠️ Gemini API 키가 설정되지 않았어요. <code>js/ai-config.js</code> 파일에서 <code>GEMINI_API_KEY</code> 값을 채워주세요.";
    aiBanner.className = "ai-status-banner warn";
  }
}

// ---- 분석 ----

function setupRangeButtons() {
  rangeBtns.forEach((b) => {
    b.addEventListener("click", () => {
      rangeBtns.forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      currentRange = parseInt(b.dataset.range, 10);
      loadAnalytics();
    });
  });
}

async function loadAnalytics() {
  summaryEl.textContent = "불러오는 중...";
  sourcesEl.innerHTML = "";
  dailyEl.innerHTML = "";
  try {
    const events = await fetchEventsSince(currentRange);
    const pageviews = events.filter((e) => e.type === "pageview");
    const uniqueSessions = new Set(pageviews.map((e) => e.session)).size;
    summaryEl.innerHTML = `
      <div class="stat"><span class="stat-num">${pageviews.length}</span><span class="stat-lbl">총 페이지뷰</span></div>
      <div class="stat"><span class="stat-num">${uniqueSessions}</span><span class="stat-lbl">고유 세션</span></div>
      <div class="stat"><span class="stat-num">${currentRange}일</span><span class="stat-lbl">기간</span></div>
    `;

    // 유입 경로
    const bySource = {};
    pageviews.forEach((e) => {
      const s = e.source || "direct";
      bySource[s] = (bySource[s] || 0) + 1;
    });
    const sorted = Object.entries(bySource).sort((a,b) => b[1] - a[1]);
    sourcesEl.innerHTML = `
      <table class="adm-table">
        <thead><tr><th>유입 경로</th><th>방문수</th><th>비율</th></tr></thead>
        <tbody>
          ${sorted.map(([s, n]) => `
            <tr>
              <td>${escapeHtml(s)}</td>
              <td>${n}</td>
              <td>${pageviews.length ? Math.round((n / pageviews.length) * 100) : 0}%</td>
            </tr>
          `).join("") || '<tr><td colspan="3">데이터 없음</td></tr>'}
        </tbody>
      </table>
    `;

    // 일자별
    const byDay = {};
    pageviews.forEach((e) => {
      const t = e.createdAt?.toMillis?.() || 0;
      if (!t) return;
      const d = new Date(t);
      const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      byDay[k] = (byDay[k] || 0) + 1;
    });
    const days = Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0]));
    dailyEl.innerHTML = `
      <table class="adm-table">
        <thead><tr><th>날짜</th><th>방문수</th><th>그래프</th></tr></thead>
        <tbody>
          ${days.map(([k, n]) => {
            const w = Math.min(100, Math.round((n / Math.max(...days.map(([,v])=>v))) * 100));
            return `<tr><td>${k}</td><td>${n}</td><td><div class="bar" style="width:${w}%"></div></td></tr>`;
          }).join("") || '<tr><td colspan="3">데이터 없음</td></tr>'}
        </tbody>
      </table>
    `;
  } catch (e) {
    console.error(e);
    summaryEl.textContent = "분석 데이터를 불러오지 못했어요. firestore 규칙이 배포됐는지 확인해주세요.";
  }
}

// ---- 글 관리 (실시간) ----

function startIdeasListSubscription() {
  if (unsubIdeas) unsubIdeas();
  unsubIdeas = subscribeToIdeas("createdAt", (ideas) => {
    allRealIdeas = ideas;
    renderAdminIdeas();
    refreshTargetIdeaSelect();
  });
}

function refreshTargetIdeaSelect() {
  if (!aiTargetIdea) return;
  if (!allRealIdeas || allRealIdeas.length === 0) {
    aiTargetIdea.innerHTML = '<option value="" disabled selected>실제 글이 없어요 — 메인에서 글 작성 또는 "AI 새 글 즉시 생성"으로 만들어주세요</option>';
    aiTargetIdea.disabled = true;
    return;
  }
  aiTargetIdea.disabled = false;
  const cur = aiTargetIdea.value;
  aiTargetIdea.innerHTML = allRealIdeas.map((i) => {
    const title = (i.title || '(제목 없음)').substring(0, 60);
    return `<option value="${i.id}">${escapeHtml(title)}${i.isAi ? ' [AI]' : ''}</option>`;
  }).join("");
  if (cur && allRealIdeas.find((i) => i.id === cur)) aiTargetIdea.value = cur;
}

function renderAdminIdeas() {
  if (allRealIdeas.length === 0) {
    ideasListEl.innerHTML = '<p class="empty">아직 실제 글이 없어요.</p>';
    return;
  }
  ideasListEl.innerHTML = allRealIdeas.map((i) => `
    <div class="admin-idea" data-id="${i.id}">
      <div class="admin-idea-head">
        <strong>${escapeHtml(i.title)}</strong>
        <span class="muted">${escapeHtml(i.authorName || '')}</span>
        <span class="muted">${new Date(i.createdAt?.toMillis?.() || 0).toLocaleString("ko-KR")}</span>
        <span class="muted">상태: ${i.status || 'waiting'}</span>
        ${i.isAi ? '<span class="badge-ai">AI</span>' : ''}
        <button class="btn-mini btn-text" data-action="toggle-admin">펼치기/접기</button>
      </div>
      <div class="admin-idea-body hidden">
        <label>제목 <input class="adm-input" data-field="title" value="${escapeHtml(i.title)}"></label>
        <label>설명 <textarea class="adm-input" data-field="description" rows="4">${escapeHtml(i.description || '')}</textarea></label>
        <label>상태
          <select class="adm-input" data-field="status">
            ${["waiting","ready","building","completed","cancelled"].map((s) =>
              `<option value="${s}" ${i.status === s ? 'selected' : ''}>${s}</option>`
            ).join("")}
          </select>
        </label>
        <div class="admin-idea-actions">
          <button class="btn-mini btn-comment-submit" data-action="save">변경 저장</button>
          <button class="btn-mini btn-text-danger" data-action="delete">글 삭제</button>
        </div>
        <h4>댓글</h4>
        <div class="admin-comments" data-idea="${i.id}">댓글 불러오는 중...</div>
      </div>
    </div>
  `).join("");

  ideasListEl.querySelectorAll(".admin-idea").forEach((el) => {
    el.addEventListener("click", async (e) => {
      const action = e.target.closest("[data-action]")?.dataset.action;
      const ideaId = el.dataset.id;
      if (action === "toggle-admin") {
        const body = el.querySelector(".admin-idea-body");
        body.classList.toggle("hidden");
        if (!body.classList.contains("hidden")) {
          subscribeAdminComments(ideaId, el);
        } else {
          unsubAdminComments(ideaId);
        }
      }
      if (action === "save") {
        const fields = {};
        el.querySelectorAll(".adm-input[data-field]").forEach((inp) => {
          fields[inp.dataset.field] = inp.value;
        });
        try {
          await adminUpdateIdea(ideaId, fields);
          showToast("저장됐어요", "success");
        } catch (err) {
          console.error(err);
          showToast("저장 실패: " + (err.message || ""), "");
        }
      }
      if (action === "delete") {
        if (!confirm("이 글과 모든 댓글/대기자/관심을 삭제합니다. 진행할까요?")) return;
        try {
          await adminDeleteIdea(ideaId);
          showToast("삭제됐어요", "");
        } catch (err) { showToast("삭제 실패: " + err.message, ""); }
      }
      if (action === "delete-comment") {
        const cid = e.target.closest("[data-cid]")?.dataset.cid;
        if (!cid || !confirm("댓글을 삭제할까요?")) return;
        try {
          await adminDeleteComment(ideaId, cid);
          showToast("댓글 삭제됨", "");
        } catch (err) { showToast("실패: " + err.message, ""); }
      }
    });
  });
}

function subscribeAdminComments(ideaId, rowEl) {
  if (adminCommentSubs[ideaId]) return;
  const target = rowEl.querySelector(`.admin-comments[data-idea="${cssEscape(ideaId)}"]`);
  adminCommentSubs[ideaId] = subscribeToComments(ideaId, (comments) => {
    if (comments.length === 0) {
      target.innerHTML = '<p class="empty">댓글 없음</p>';
      return;
    }
    target.innerHTML = comments.map((c) => `
      <div class="admin-comment ${c.parentId ? 'reply' : ''}">
        <strong>${escapeHtml(c.authorName || '익명')}</strong>
        ${c.isAi ? '<span class="badge-ai-mini">AI</span>' : ''}
        <span class="muted">${formatTime(c.createdAt)}</span>
        <button class="btn-mini btn-text-danger" data-action="delete-comment" data-cid="${c.id}">삭제</button>
        <div>${escapeHtml(c.text)}</div>
      </div>
    `).join("");
  });
}

function unsubAdminComments(ideaId) {
  if (adminCommentSubs[ideaId]) {
    adminCommentSubs[ideaId]();
    delete adminCommentSubs[ideaId];
  }
}

// ---- AI 설정 ----

async function loadSettings() {
  try {
    const sv = await getSettings();
    autoCommentToggle.checked = !!sv.autoCommentEnabled;
    autoPostToggle.checked = !!sv.autoPostEnabled;
    if (autoLikeToggle) autoLikeToggle.checked = !!sv.autoLikeEnabled;
  } catch (e) { /* ignore */ }
}

settingsSave?.addEventListener("click", async () => {
  try {
    await setSettings({
      autoCommentEnabled: autoCommentToggle.checked,
      autoPostEnabled: autoPostToggle.checked,
      autoLikeEnabled: autoLikeToggle?.checked || false
    });
    showToast("설정 저장됐어요", "success");
  } catch (e) {
    showToast("저장 실패: " + e.message, "");
  }
});

// ---- AI 수동 생성 버튼 ----

function setupAiButtons() {
  aiGenComments?.addEventListener("click", async () => {
    if (!isAiKeyValid()) { showToast("Gemini 키 설정 필요", ""); return; }
    const ideaId = aiTargetIdea.value;
    if (!ideaId) { showToast("글을 선택해주세요", ""); return; }
    const idea = allRealIdeas.find((i) => i.id === ideaId);
    if (!idea) return;
    aiGenComments.disabled = true;
    showToast("AI에 댓글을 요청하는 중...", "info");
    try {
      const n = parseInt(aiCommentCount.value, 10) || 3;
      const persona = getSelectedPersona();
      if (persona) {
        // 선택된 인물의 말투로 N개 (각 호출이 1개씩, 호출 사이 1초 대기)
        let posted = 0;
        for (let i = 0; i < n; i++) {
          if (i > 0) await new Promise((r) => setTimeout(r, 1500));
          const c = await generateOneCommentAsPersona(idea.title, idea.description, persona);
          await postAiComment(ideaId, c);
          posted++;
        }
        showToast(`${persona.name}으로 ${posted}개 댓글 등록`, "success");
      } else {
        const comments = await generateCommentsForIdea(idea.title, idea.description, n);
        for (const c of comments) await postAiComment(ideaId, c);
        showToast(`${comments.length}개 댓글 등록 완료`, "success");
      }
    } catch (e) {
      console.error(e);
      showToast("실패: " + e.message, "");
    } finally {
      throttleBtn(aiGenComments, 30000);
    }
  });

  aiGenDrip?.addEventListener("click", async () => {
    if (!isAiKeyValid()) { showToast("Gemini 키 설정 필요", ""); return; }
    const ideaId = aiTargetIdea.value;
    if (!ideaId) { showToast("글을 선택해주세요", ""); return; }
    const idea = allRealIdeas.find((i) => i.id === ideaId);
    if (!idea) return;
    const days = Math.max(1, Math.min(14, parseInt(aiDripDays.value, 10) || 3));
    const totalCount = days * 2 + Math.floor(Math.random() * days); // 하루 2~3개
    aiGenDrip.disabled = true;
    showToast(`${days}일에 걸쳐 ${totalCount}개 예약 댓글 생성 중...`, "info");
    try {
      const comments = await generateCommentsForIdea(idea.title, idea.description, Math.min(totalCount, 10));
      // 부족하면 한번 더 호출 (10개 한도)
      let remaining = totalCount - comments.length;
      while (remaining > 0) {
        // 분당 15회 한도 회피 - 호출 사이 5초 대기
        await new Promise((r) => setTimeout(r, 5000));
        const more = await generateCommentsForIdea(idea.title, idea.description, Math.min(remaining, 10));
        comments.push(...more);
        remaining -= more.length;
        if (more.length === 0) break;
      }
      // 1~7일 사이 분산: 각 댓글마다 random delay (1일~days일)
      const now = Date.now();
      for (const c of comments) {
        const delayMs = (1 + Math.random() * (days - 1)) * 86400000;
        const scheduledAt = new Date(now + delayMs);
        await enqueueScheduledComment({
          ideaId,
          text: c.text,
          authorName: c.authorName,
          authorPhoto: c.authorPhoto,
          authorUid: c.authorUid,
          scheduledAt
        });
      }
      showToast(`예약 ${comments.length}건 큐에 추가됐어요`, "success");
      loadScheduledList();
    } catch (e) {
      console.error(e);
      showToast("실패: " + e.message, "");
    } finally {
      throttleBtn(aiGenDrip, 30000);
    }
  });

  aiGenIdea?.addEventListener("click", async () => {
    if (!isAiKeyValid()) { showToast("Gemini 키 설정 필요", ""); return; }
    aiGenIdea.disabled = true;
    showToast("AI에 새 글 작성 요청 중...", "info");
    try {
      const persona = getSelectedPersona();
      if (persona) {
        const r = await generateNewIdeaAsPersona(persona);
        await postAiIdea({ title: r.title, description: r.description, author: r.author });
        showToast(`${persona.name}으로 새 글 등록`, "success");
      } else {
        const newIdea = await generateNewIdea();
        await postAiIdea(newIdea);
        showToast("AI 새 글이 등록됐어요", "success");
      }
    } catch (e) {
      console.error(e);
      showToast("실패: " + e.message, "");
    } finally {
      throttleBtn(aiGenIdea, 30000);
    }
  });
}

async function loadScheduledList() {
  try {
    const list = await listScheduledComments(50);
    if (list.length === 0) {
      scheduledListEl.innerHTML = '<p class="empty">예약 댓글이 없어요.</p>';
      return;
    }
    scheduledListEl.innerHTML = `
      <table class="adm-table">
        <thead><tr><th>예정 시각</th><th>상태</th><th>대상 글</th><th>댓글</th><th>작업</th></tr></thead>
        <tbody>
          ${list.map((s) => {
            const idea = allRealIdeas.find((i) => i.id === s.ideaId);
            return `
              <tr>
                <td>${s.scheduledAt ? new Date(s.scheduledAt.toMillis()).toLocaleString("ko-KR") : '-'}</td>
                <td>${s.status === 'done' ? '✅ 완료' : '⏳ 대기'}</td>
                <td>${escapeHtml((idea?.title || s.ideaId || '').substring(0, 40))}</td>
                <td>${escapeHtml((s.text || '').substring(0, 60))}</td>
                <td><button class="btn-mini btn-text-danger" data-id="${s.id}" data-action="del-sched">삭제</button></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;
    scheduledListEl.querySelectorAll('[data-action="del-sched"]').forEach((b) => {
      b.addEventListener("click", async () => {
        if (!confirm("예약 댓글을 삭제할까요?")) return;
        try {
          await deleteScheduledComment(b.dataset.id);
          loadScheduledList();
        } catch (e) { showToast("실패: " + e.message, ""); }
      });
    });
  } catch (e) {
    scheduledListEl.innerHTML = '<p class="empty">큐를 불러오지 못했어요.</p>';
  }
}

// 큐 처리 - 관리자 페이지 진입 시, 단 30분 쿨다운
async function processQueueIfEnabled() {
  try {
    const s = await getSettings();
    if (!s.autoCommentEnabled) return;
    const lastRun = s.lastQueueRunAt?.toMillis?.() || 0;
    const QUEUE_COOLDOWN_MS = 30 * 60 * 1000; // 30분
    if (Date.now() - lastRun < QUEUE_COOLDOWN_MS) {
      console.log("[queue] cooldown active, skip");
      return;
    }
    // 락 먼저 기록 (race 방지)
    await setSettings({ lastQueueRunAt: new Date() });

    const { getDuePendingScheduledComments, markScheduledCommentDone } =
      await import("./firestore.js");
    const due = await getDuePendingScheduledComments(30);
    let processed = 0;
    for (let i = 0; i < due.length; i++) {
      const item = due[i];
      try {
        await postAiComment(item.ideaId, {
          authorName: item.authorName,
          authorPhoto: item.authorPhoto,
          authorUid: item.authorUid,
          text: item.text
        });
        await markScheduledCommentDone(item.id);
        processed++;
        if (i < due.length - 1) await new Promise((r) => setTimeout(r, 500));
      } catch (e) { console.warn("queue item failed", e); }
    }
    if (processed > 0) showToast(`예약 댓글 ${processed}건 처리됨`, "success");
  } catch (e) { console.warn(e); }
}

// 자동 새 글 생성 - 24시간 동안 글 없을 때, 시도 자체는 1시간 쿨다운
async function maybeGenerateAutoIdea() {
  try {
    const s = await getSettings();
    if (!s.autoPostEnabled) return;
    if (!isAiKeyValid()) return;

    const lastAuto = s.lastAutoPostAt?.toMillis?.() || 0;
    const AUTO_POST_COOLDOWN_MS = 60 * 60 * 1000; // 1시간
    if (Date.now() - lastAuto < AUTO_POST_COOLDOWN_MS) {
      console.log("[auto-post] cooldown active, skip");
      return;
    }

    const { getLatestIdeaCreatedAt } = await import("./firestore.js");
    const latest = await getLatestIdeaCreatedAt();
    const now = Date.now();
    const gap = latest ? (now - latest) : Infinity;
    if (gap < 24 * 3600 * 1000) return; // 24시간 안 됐으면 skip

    // AI 호출 직전에 락 기록 (race 방지)
    await setSettings({ lastAutoPostAt: new Date() });

    const newIdea = await generateNewIdea();
    await postAiIdea(newIdea);
    showToast("자동 글 1개 생성됨", "success");
  } catch (e) { console.warn("auto idea failed", e); }
}

// ---- 차단 ----

function setupBanButtons() {
  banAddBtn?.addEventListener("click", async () => {
    const uid = banUidInput.value.trim();
    const email = banEmailInput.value.trim();
    const reason = banReasonInput.value.trim();
    if (!uid && !email) { showToast("UID 또는 이메일 입력 필요", ""); return; }
    try {
      await banUser({ uid, email, reason });
      banUidInput.value = ""; banEmailInput.value = ""; banReasonInput.value = "";
      showToast("차단됨", "success");
      loadBannedList();
    } catch (e) { showToast("실패: " + e.message, ""); }
  });
}

async function loadBannedList() {
  try {
    const list = await listBannedUsers();
    if (list.length === 0) {
      bannedListEl.innerHTML = '<p class="empty">차단된 사용자 없음.</p>';
      return;
    }
    bannedListEl.innerHTML = `
      <table class="adm-table">
        <thead><tr><th>ID</th><th>UID</th><th>Email</th><th>사유</th><th>일시</th><th>작업</th></tr></thead>
        <tbody>
          ${list.map((b) => `
            <tr>
              <td><code>${escapeHtml(b.id)}</code></td>
              <td>${escapeHtml(b.uid || '')}</td>
              <td>${escapeHtml(b.email || '')}</td>
              <td>${escapeHtml(b.reason || '')}</td>
              <td>${b.bannedAt ? new Date(b.bannedAt.toMillis()).toLocaleString("ko-KR") : ''}</td>
              <td><button class="btn-mini" data-id="${b.id}" data-action="unban">해제</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
    bannedListEl.querySelectorAll('[data-action="unban"]').forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("차단을 해제할까요?")) return;
        try { await unbanUser(btn.dataset.id); loadBannedList(); }
        catch (e) { showToast("실패: " + e.message, ""); }
      });
    });
  } catch (e) {
    bannedListEl.innerHTML = '<p class="empty">목록을 불러오지 못했어요.</p>';
  }
}


// 버튼 30초 throttle
function throttleBtn(btn, ms) {
  if (!btn) return;
  btn.disabled = true;
  const orig = btn.textContent;
  let remain = Math.ceil(ms / 1000);
  const updateText = () => { btn.textContent = `${orig} (${remain}s)`; };
  updateText();
  const id = setInterval(() => {
    remain--;
    if (remain <= 0) {
      clearInterval(id);
      btn.disabled = false;
      btn.textContent = orig;
    } else updateText();
  }, 1000);
}


// ============================================
// 가상 인물 관리 탭
// ============================================

async function loadPersonasList() {
  if (!personasListEl) return;
  personasListEl.innerHTML = '<p class="empty">불러오는 중...</p>';
  try {
    personasCache = await listPersonas();
    refreshPersonaSelect();
    if (personasCache.length === 0) {
      personasListEl.innerHTML = '<p class="empty">인물이 없습니다. 아래에서 추가해주세요.</p>';
      return;
    }
    personasListEl.innerHTML = personasCache.map((p) => `
      <div class="persona-card" data-id="${p.id}">
        <img class="persona-avatar" src="${escapeHtml(p.photoURL || '')}" alt="">
        <div class="persona-info">
          <div class="persona-row">
            <strong>${escapeHtml(p.name || '익명')}</strong>
            <span class="muted">${escapeHtml(p.gender || '')} · ${p.age || '-'}세 · ${escapeHtml(p.job || '')}</span>
          </div>
          <div class="persona-row">
            <span class="badge-personality">${escapeHtml(p.personality || '')}</span>
            <span class="muted persona-style">${escapeHtml((p.speechStyle || '').substring(0, 100))}</span>
          </div>
          ${p.bio ? `<p class="persona-bio">${escapeHtml(p.bio)}</p>` : ''}
        </div>
        <button class="btn-mini btn-text-danger" data-action="del-persona" data-id="${p.id}">삭제</button>
      </div>
    `).join("");

    personasListEl.querySelectorAll('[data-action="del-persona"]').forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("이 인물을 삭제할까요?")) return;
        try {
          await deletePersona(btn.dataset.id);
          await loadPersonasList();
          showToast("삭제됨", "");
        } catch (e) { showToast("실패: " + e.message, ""); }
      });
    });
  } catch (e) {
    console.error(e);
    personasListEl.innerHTML = '<p class="empty">불러오기 실패</p>';
  }
}

function setupPersonaForm() {
  if (!personaForm) return;
  personaForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("p-name").value.trim();
    const age = parseInt(document.getElementById("p-age").value, 10) || 0;
    const gender = document.getElementById("p-gender").value;
    const job = document.getElementById("p-job").value.trim();
    const personality = document.getElementById("p-personality").value.trim();
    const speechStyle = document.getElementById("p-speech").value.trim();
    const bio = document.getElementById("p-bio").value.trim();
    if (!name) { showToast("이름을 입력해주세요", ""); return; }
    try {
      await createPersona({ name, age, gender, job, personality, speechStyle, bio });
      personaForm.reset();
      await loadPersonasList();
      showToast("인물 추가됨", "success");
    } catch (e) { showToast("실패: " + e.message, ""); }
  });
}

function refreshPersonaSelect() {
  if (!aiPersonaSelect) return;
  aiPersonaSelect.innerHTML = '<option value="">(랜덤 가상 사용자)</option>' + personasCache.map((p) =>
    `<option value="${p.id}">${escapeHtml(p.name || '익명')} (${escapeHtml(p.personality || '')})</option>`
  ).join("");
}

function getSelectedPersona() {
  if (!aiPersonaSelect || !aiPersonaSelect.value) return null;
  return personasCache.find((p) => p.id === aiPersonaSelect.value) || null;
}

// ============================================
// 자동 좋아요 - 가상 인물이 랜덤한 글에 ❤️
// ============================================

async function maybeAutoLike() {
  try {
    const sv = await getSettings();
    if (!sv.autoLikeEnabled) return;
    const lastRun = sv.lastAutoLikeAt?.toMillis?.() || 0;
    const COOLDOWN = 30 * 60 * 1000; // 30분 쿨다운
    if (Date.now() - lastRun < COOLDOWN) return;

    if (personasCache.length === 0) {
      personasCache = await listPersonas();
      if (personasCache.length === 0) return;
    }
    if (allRealIdeas.length === 0) return;

    // 락 먼저
    await setSettings({ lastAutoLikeAt: new Date() });

    // 랜덤 인물 1~3명, 각자 랜덤 글 1개에 좋아요
    const n = 1 + Math.floor(Math.random() * 3);
    let liked = 0;
    for (let i = 0; i < n; i++) {
      const persona = personasCache[Math.floor(Math.random() * personasCache.length)];
      const idea = allRealIdeas[Math.floor(Math.random() * allRealIdeas.length)];
      try {
        const r = await personaLikeIdea(idea.id, persona);
        if (r.liked) liked++;
        await new Promise((res) => setTimeout(res, 400));
      } catch (e) { /* skip */ }
    }
    if (liked > 0) showToast(`자동 좋아요 ${liked}건 실행됨`, "success");
  } catch (e) { console.warn("auto-like failed", e); }
}

// ============================================
// 회원 관리 탭
// ============================================

function setupMembersTab() {
  if (memberRefresh) memberRefresh.addEventListener("click", () => loadMembersList(true));
  if (memberSearch) memberSearch.addEventListener("input", () => filterMembers());
}

async function loadMembersList(force) {
  if (!membersListEl) return;
  membersListEl.innerHTML = '<p class="empty">집계 중... (글 수에 따라 1~10초 걸립니다)</p>';
  try {
    if (force || allMembersCache.length === 0) {
      allMembersCache = await aggregateUserActivities();
    }
    filterMembers();
  } catch (e) {
    console.error(e);
    membersListEl.innerHTML = '<p class="empty">불러오기 실패</p>';
  }
}

function filterMembers() {
  if (!membersListEl) return;
  const kw = (memberSearch?.value || "").trim().toLowerCase();
  const list = allMembersCache.filter((m) => {
    if (!kw) return true;
    return (m.name || "").toLowerCase().includes(kw) || (m.uid || "").toLowerCase().includes(kw);
  });
  // 활동량 기준 정렬
  list.sort((a, b) => (b.ideas.length + b.comments.length + b.likes.length) - (a.ideas.length + a.comments.length + a.likes.length));

  if (list.length === 0) {
    membersListEl.innerHTML = '<p class="empty">검색 결과 없음</p>';
    return;
  }

  membersListEl.innerHTML = list.map((m) => `
    <div class="member-row" data-uid="${escapeHtml(m.uid)}">
      <div class="member-head">
        <img class="member-avatar" src="${escapeHtml(m.photo || '')}" alt="">
        <strong>${escapeHtml(m.name)}</strong>
        <code class="muted">${escapeHtml(m.uid)}</code>
        <span class="member-counts">
          글 ${m.ideas.length} · 댓글 ${m.comments.length} · 관심 ${m.likes.length} · 대기 ${m.waitlists.length}
        </span>
        <button class="btn-mini btn-text" data-action="toggle-member">펼치기</button>
      </div>
      <div class="member-body hidden">
        ${memberActivitiesHtml(m)}
      </div>
    </div>
  `).join("");

  membersListEl.querySelectorAll('[data-action="toggle-member"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const body = btn.closest(".member-row").querySelector(".member-body");
      body.classList.toggle("hidden");
      btn.textContent = body.classList.contains("hidden") ? "펼치기" : "접기";
    });
  });
}

function memberActivitiesHtml(m) {
  function listSection(title, items, render) {
    if (!items || items.length === 0) return `<div class="member-section"><h5>${title} (0)</h5><p class="empty">없음</p></div>`;
    return `<div class="member-section"><h5>${title} (${items.length})</h5><ul>${items.slice(0, 50).map(render).join("")}</ul></div>`;
  }
  return `
    ${listSection("작성 글", m.ideas, (x) => `<li>${escapeHtml(x.title || x.id)}</li>`)}
    ${listSection("댓글", m.comments, (x) => `<li>"${escapeHtml((x.text||'').substring(0,80))}" — <span class="muted">${escapeHtml(x.ideaTitle||'')}</span></li>`)}
    ${listSection("관심", m.likes, (x) => `<li>${escapeHtml(x.ideaTitle||x.ideaId)}</li>`)}
    ${listSection("대기자 등록", m.waitlists, (x) => `<li>${escapeHtml(x.ideaTitle||x.ideaId)} <span class="muted">(${x.tier === 'paid' ? '유료' : '무료'})</span></li>`)}
  `;
}



// ============================================
// 메일 리스트 탭
// ============================================

async function loadEmailLists() {
  const subEl = document.getElementById("emails-subscribers");
  const byIdeaEl = document.getElementById("emails-by-idea");
  const refreshBtn = document.getElementById("emails-refresh");
  if (!subEl || !byIdeaEl) return;

  if (refreshBtn && !refreshBtn._wired) {
    refreshBtn._wired = true;
    refreshBtn.addEventListener("click", () => loadEmailLists());
  }

  subEl.innerHTML = '<p class="empty">불러오는 중...</p>';
  byIdeaEl.innerHTML = '<p class="empty">불러오는 중...</p>';

  // 1) 구독자
  try {
    const subs = await listSubscribers();
    if (subs.length === 0) {
      subEl.innerHTML = '<p class="empty">구독자 없음</p>';
    } else {
      const emails = subs.map((s) => s.email).filter(Boolean);
      subEl.innerHTML = renderEmailGroup("구독자 (출시 소식 받기 신청)", emails, subs);
    }
  } catch (e) {
    subEl.innerHTML = '<p class="empty">불러오기 실패: ' + escapeHtml(e.message || '') + '</p>';
  }

  // 2) 아이디어별
  try {
    const groups = await listEmailsByIdea();
    if (groups.length === 0) {
      byIdeaEl.innerHTML = '<p class="empty">아직 대기자 등록한 사람이 없어요.</p>';
      return;
    }
    byIdeaEl.innerHTML = groups.map((g) => {
      const paidEmails = g.paid.map((p) => p.email);
      const freeEmails = g.free.map((p) => p.email);
      const allEmails = [...paidEmails, ...freeEmails];
      return `
        <div class="email-idea-block">
          <div class="email-idea-head">
            <strong>${escapeHtml(g.title || g.ideaId)}</strong>
            <span class="muted">— 작성자: ${escapeHtml(g.authorName || '')}</span>
            <span class="muted">유료 ${g.paid.length} · 무료 ${g.free.length} · 전체 ${allEmails.length}</span>
          </div>
          ${g.paid.length > 0 ? `
            <div class="email-tier-block">
              <h5>💎 유료라도 사용 (${g.paid.length})</h5>
              ${renderEmailGroup("", paidEmails, g.paid, "paid-" + g.ideaId)}
            </div>` : ''}
          ${g.free.length > 0 ? `
            <div class="email-tier-block">
              <h5>👥 무료라면 사용 (${g.free.length})</h5>
              ${renderEmailGroup("", freeEmails, g.free, "free-" + g.ideaId)}
            </div>` : ''}
          ${allEmails.length > 1 ? `
            <div class="email-tier-block">
              <h5>📋 전체 합치기 (${allEmails.length})</h5>
              ${renderEmailGroup("", allEmails, [...g.paid, ...g.free], "all-" + g.ideaId)}
            </div>` : ''}
        </div>
      `;
    }).join("");
    wireCopyButtons();
  } catch (e) {
    byIdeaEl.innerHTML = '<p class="empty">불러오기 실패: ' + escapeHtml(e.message || '') + '</p>';
  }
}

function renderEmailGroup(title, emails, items, gid) {
  const id = gid || ("eg-" + Math.random().toString(36).substring(2, 8));
  const joined = emails.join(", ");
  return `
    ${title ? `<h5>${escapeHtml(title)}</h5>` : ''}
    <textarea class="email-textarea" id="${id}" readonly rows="2">${escapeHtml(joined)}</textarea>
    <div class="email-actions-row">
      <button class="btn-mini btn-copy-emails" data-target="${id}">전체 복사 (쉼표)</button>
      <button class="btn-mini btn-copy-emails-semi" data-target="${id}">세미콜론 구분</button>
      <button class="btn-mini btn-text" data-toggle="${id}-detail">상세 보기</button>
      <span class="muted">${emails.length}명</span>
    </div>
    <div id="${id}-detail" class="email-detail hidden">
      <ul>
        ${items.map((it) => `<li>${escapeHtml(it.email)} ${it.displayName ? '<span class="muted">— ' + escapeHtml(it.displayName) + '</span>' : ''}</li>`).join("")}
      </ul>
    </div>
  `;
}

function wireCopyButtons() {
  document.querySelectorAll(".btn-copy-emails").forEach((b) => {
    b.addEventListener("click", () => {
      const t = document.getElementById(b.dataset.target);
      if (!t) return;
      const text = t.value.split(",").map((x) => x.trim()).filter(Boolean).join(", ");
      navigator.clipboard.writeText(text).then(
        () => showToast("쉼표 구분으로 복사됨", "success"),
        () => { window.prompt("아래 주소를 복사하세요", text); }
      );
    });
  });
  document.querySelectorAll(".btn-copy-emails-semi").forEach((b) => {
    b.addEventListener("click", () => {
      const t = document.getElementById(b.dataset.target);
      if (!t) return;
      const text = t.value.split(",").map((x) => x.trim()).filter(Boolean).join("; ");
      navigator.clipboard.writeText(text).then(
        () => showToast("세미콜론 구분으로 복사됨", "success"),
        () => { window.prompt("아래 주소를 복사하세요", text); }
      );
    });
  });
  document.querySelectorAll("[data-toggle]").forEach((b) => {
    b.addEventListener("click", () => {
      const t = document.getElementById(b.dataset.toggle);
      if (t) t.classList.toggle("hidden");
    });
  });
}

// ---- Helpers ----

function escapeHtml(str) {
  if (!str && str !== 0) return "";
  const d = document.createElement("div");
  d.textContent = String(str);
  return d.innerHTML;
}

function formatTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("ko-KR");
}

function cssEscape(s) {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => "\\" + c);
}

function showToast(message, type) {
  const c = document.getElementById("toast-container");
  if (!c) return;
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = message;
  c.appendChild(t);
  setTimeout(() => { if (t.parentNode) t.remove(); }, 3000);
}
