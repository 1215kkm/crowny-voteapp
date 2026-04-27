// ========================================
// App Module - Main Page (인라인 펼치기 + 댓글)
// ========================================

import { onAuthChange, getCurrentUser } from "./auth.js";
import {
  subscribeToIdeas,
  addIdea,
  toggleWaitlist,
  toggleLike,
  checkUserLikeBatch,
  checkUserWaitlistBatch,
  subscribeEmail,
  unsubscribeEmail,
  checkSubscription,
  subscribeToTotalWaitlistCount,
  getTodayPostCount,
  getUserLikedIdeas,
  addComment,
  subscribeToComments,
  deleteComment,
  DAILY_POST_LIMIT,
  MAX_IMAGES,
  THRESHOLD_PAID_ALONE,
  THRESHOLD_PAID_MIXED,
  THRESHOLD_FREE_MIXED,
  meetsDesignThreshold,
  userUpdateOwnIdea,
  userDeleteOwnIdea
} from "./firestore.js";
import { isPlaceholder } from "./firebase-config.js";
import { SAMPLE_IDEAS, SAMPLE_TOTAL } from "./sample-data.js";

let firebaseAvailable = !isPlaceholder;

const MAX_IMAGE_WIDTH = 1400;
const IMAGE_JPEG_QUALITY = 0.8;
const MAX_IMAGE_BYTES = 900 * 1024;

let currentSort = "createdAt";
let currentRealIdeas = [];
let userWaitlistMap = {};
let userLikeMap = {};
let unsubIdeas = null;
let pendingSubmit = false;
let pendingImages = [];
let expandedCardId = null;
const commentUnsubMap = {}; // ideaId -> unsub function
const commentsCacheMap = {}; // ideaId -> last comments[]

// ---- DOM ----
const ideasContainer = document.getElementById("ideas-container");
const ideasCount = document.getElementById("ideas-count");
const loadingState = document.getElementById("loading-state");
const emptyState = document.getElementById("empty-state");
const totalWaitlistCount = document.getElementById("total-waitlist-count");

const loginBtn = document.getElementById("login-btn");
const userInfo = document.getElementById("user-info");
const userPhoto = document.getElementById("user-photo");
const userName = document.getElementById("user-name");
const formLoginPrompt = document.getElementById("form-login-prompt");
const ideaForm = document.getElementById("idea-form");

const subscribeEmailForm = document.getElementById("subscribe-email-form");
const subscribeCheckboxArea = document.getElementById("subscribe-checkbox-area");
const subscribeEmailDisplay = document.getElementById("subscribe-email-display");
const subscribeCheck = document.getElementById("subscribe-check");
const subscribeSuccess = document.getElementById("subscribe-success");

const ideaTitle = document.getElementById("idea-title");
const ideaDesc = document.getElementById("idea-desc");
const titleCount = document.getElementById("title-count");
const descCount = document.getElementById("desc-count");
const submitBtn = document.getElementById("submit-btn");

const imageAddBtn = document.getElementById("image-add-btn");
const imageInput = document.getElementById("idea-image");
const imagePreviews = document.getElementById("image-previews");
const dailyLimitInfo = document.getElementById("daily-limit-info");

const favBtn = document.getElementById("favorites-btn");
const favModal = document.getElementById("favorites-modal");
const favModalClose = document.getElementById("favorites-modal-close");
const favModalList = document.getElementById("favorites-list");

// ---- Init ----

if (!firebaseAvailable) {
  loadingState.classList.add("hidden");
  emptyState.classList.add("hidden");
  renderAll();
  if (formLoginPrompt) formLoginPrompt.classList.add("hidden");
  ideaForm.classList.remove("hidden");
} else {
  onAuthChange(handleAuthState);
  try {
    subscribeToTotalWaitlistCount((count) => {
      totalWaitlistCount.textContent = (count + SAMPLE_TOTAL).toLocaleString();
    });
  } catch (e) { /* ignore */ }
  startIdeasSubscription();
  setTimeout(() => {
    if (currentRealIdeas.length === 0) {
      loadingState.classList.add("hidden");
      renderAll();
    }
  }, 3000);
}

if (formLoginPrompt) formLoginPrompt.classList.add("hidden");
ideaForm.classList.remove("hidden");

// ---- Sort ----
document.querySelectorAll(".sort-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const sort = btn.dataset.sort;
    if (sort === currentSort) return;
    currentSort = sort;
    document.querySelectorAll(".sort-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    if (firebaseAvailable) startIdeasSubscription();
    renderAll();
  });
});

// ---- Hero animation ----
const heroEl = document.getElementById("hero");
const heroNeural = document.querySelector(".hero-neural");
const equalizer = document.getElementById("equalizer");
const eqBars = equalizer ? [...equalizer.querySelectorAll(".eq-bar")] : [];
let typingTimer = null;
let eqInterval = null;

function eqBounce() { eqBars.forEach((b) => { b.style.height = (6 + Math.random() * 34) + "px"; }); }
function eqIdle() { eqBars.forEach((b) => { b.style.height = "4px"; }); }

function heroTypingPulse() {
  if (!heroEl) return;
  heroEl.classList.add("typing");
  if (equalizer) {
    equalizer.classList.add("active");
    eqBounce();
    if (!eqInterval) eqInterval = setInterval(eqBounce, 180);
  }
  if (heroNeural) {
    heroNeural.querySelectorAll("animate, animateMotion").forEach((a) => {
      const o = a.getAttribute("data-orig-dur") || a.getAttribute("dur");
      if (!a.getAttribute("data-orig-dur")) a.setAttribute("data-orig-dur", o);
      a.setAttribute("dur", (parseFloat(o) * 0.3) + "s");
    });
  }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    heroEl.classList.remove("typing");
    if (equalizer) {
      equalizer.classList.remove("active");
      clearInterval(eqInterval); eqInterval = null;
      eqIdle();
    }
    if (heroNeural) {
      heroNeural.querySelectorAll("animate, animateMotion").forEach((a) => {
        const o = a.getAttribute("data-orig-dur");
        if (o) a.setAttribute("dur", o);
      });
    }
  }, 500);
}

ideaTitle.addEventListener("input", () => {
  titleCount.textContent = ideaTitle.value.length;
  heroTypingPulse();
});
ideaDesc.addEventListener("input", () => {
  descCount.textContent = ideaDesc.value.length;
  heroTypingPulse();
});

// ---- 이미지 + 버튼 ----
if (imageAddBtn) {
  imageAddBtn.addEventListener("click", () => {
    if (pendingImages.length >= MAX_IMAGES) {
      showToast(`이미지는 최대 ${MAX_IMAGES}장까지 첨부할 수 있어요`, "");
      return;
    }
    imageInput.click();
  });
}
if (imageInput) imageInput.addEventListener("change", handleImageSelect);

ideaForm.addEventListener("submit", handleSubmit);
ideasContainer.addEventListener("click", handleIdeasClick);

// ---- 관심 모달 ----
if (favBtn) favBtn.addEventListener("click", openFavoritesModal);
if (favModalClose) favModalClose.addEventListener("click", closeFavoritesModal);
if (favModal) {
  favModal.addEventListener("click", (e) => { if (e.target === favModal) closeFavoritesModal(); });
}

// ---- Auth ----

async function handleAuthState(user) {
  if (user) {
    loginBtn.classList.add("hidden");
    userInfo.classList.remove("hidden");
    userPhoto.src = user.photoURL || "";
    userPhoto.alt = user.displayName || "";
    userName.textContent = user.displayName || "사용자";

    if (subscribeEmailForm) subscribeEmailForm.classList.add("hidden");
    if (subscribeCheckboxArea) subscribeCheckboxArea.classList.remove("hidden");
    if (subscribeEmailDisplay) subscribeEmailDisplay.textContent = user.email;

    try {
      const isSubscribed = await checkSubscription(user.email);
      subscribeCheck.checked = isSubscribed;
    } catch (e) { /* ignore */ }

    await updateUserStatusMaps();
    await refreshDailyLimitInfo();

    if (pendingSubmit) {
      pendingSubmit = false;
      const t = ideaTitle.value.trim(); const d = ideaDesc.value.trim();
      if (t && d && confirm("글을 남기겠습니까?")) await submitIdea(t, d, user);
    }
  } else {
    loginBtn.classList.remove("hidden");
    userInfo.classList.add("hidden");
    if (subscribeEmailForm) subscribeEmailForm.classList.remove("hidden");
    if (subscribeCheckboxArea) subscribeCheckboxArea.classList.add("hidden");
    userWaitlistMap = {}; userLikeMap = {};
    if (submitBtn) submitBtn.textContent = `글 남기기 (오늘 0/${DAILY_POST_LIMIT})`;
    renderAll();
  }
}

async function refreshDailyLimitInfo() {
  // submit 버튼 텍스트에 오늘 작성 카운트 표시
  const user = getCurrentUser();
  if (!user) {
    if (submitBtn) submitBtn.textContent = `글 남기기 (오늘 0/${DAILY_POST_LIMIT})`;
    return;
  }
  try {
    const c = await getTodayPostCount(user.uid);
    if (submitBtn) {
      submitBtn.textContent = `글 남기기 (오늘 ${c}/${DAILY_POST_LIMIT})`;
      submitBtn.disabled = c >= DAILY_POST_LIMIT;
    }
  } catch (e) {
    if (submitBtn) submitBtn.textContent = `글 남기기 (오늘 0/${DAILY_POST_LIMIT})`;
  }
}

// ---- Subscription ----

function startIdeasSubscription() {
  if (unsubIdeas) unsubIdeas();
  try {
    unsubIdeas = subscribeToIdeas(currentSort, async (ideas) => {
      currentRealIdeas = ideas;
      loadingState.classList.add("hidden");
      emptyState.classList.add("hidden");
      const u = getCurrentUser();
      if (u && ideas.length > 0) await updateUserStatusMaps();
      renderAll();
    });
  } catch (e) {
    console.warn("Firestore subscription failed:", e);
    renderAll();
  }
}

async function updateUserStatusMaps() {
  const user = getCurrentUser();
  if (!user || currentRealIdeas.length === 0) return;
  try {
    const ids = currentRealIdeas.map((i) => i.id);
    const [wl, lk] = await Promise.all([
      checkUserWaitlistBatch(ids, user.uid),
      checkUserLikeBatch(ids, user.uid)
    ]);
    userWaitlistMap = wl; userLikeMap = lk;
  } catch (e) { /* ignore */ }
}

// ---- 합치기 ----
function getMergedIdeas() {
  const samples = SAMPLE_IDEAS.map((s) => ({ ...s, isSample: true }));
  const reals = currentRealIdeas.map((r) => ({ ...r, isSample: false }));
  const merged = [...reals, ...samples];
  if (currentSort === "waitlistCount") {
    merged.sort((a, b) => (b.waitlistCount || 0) - (a.waitlistCount || 0));
  } else {
    merged.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  }
  return merged;
}
function toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.toDate === "function") return ts.toDate().getTime();
  return 0;
}

// ---- Render ----

function renderAll() {
  const ideas = getMergedIdeas();
  ideasCount.textContent = ideas.length;
  loadingState.classList.add("hidden");
  if (ideas.length === 0) emptyState.classList.remove("hidden");
  else emptyState.classList.add("hidden");
  renderIdeas(ideas);
}

function renderIdeas(ideas) {
  ideasContainer.querySelectorAll(".idea-card").forEach((el) => el.remove());
  ideas.forEach((idea) => ideasContainer.appendChild(createIdeaCard(idea)));
  if (expandedCardId) {
    const card = ideasContainer.querySelector(`.idea-card[data-id="${cssEscape(expandedCardId)}"]`);
    if (card) {
      card.classList.add("expanded");
      const cached = commentsCacheMap[expandedCardId];
      if (cached) renderInlineComments(card, cached);
    }
  }
}

function statusLabel(status) {
  switch (status) {
    case "ready":     return { txt: "필요인원 채움", cls: "status-ready" };
    case "building":  return { txt: "제작 중", cls: "status-building" };
    case "completed": return { txt: "출시 완료", cls: "status-completed" };
    case "cancelled": return { txt: "취소", cls: "status-cancelled" };
    default:          return { txt: "대기 중", cls: "status-waiting" };
  }
}

function createIdeaCard(idea) {
  const card = document.createElement("article");
  card.className = "idea-card" + (idea.isSample ? " sample-card" : "");
  card.dataset.id = idea.id;
  card.dataset.sample = idea.isSample ? "1" : "0";

  const isHot = (idea.waitlistCount || 0) >= 10;
  const paid = idea.paidWaitlistCount || 0;
  const free = idea.freeWaitlistCount || 0;
  const isJoinedTier = userWaitlistMap[idea.id] || null;
  const isLiked = userLikeMap[idea.id] === true;
  const status = statusLabel(idea.status || "waiting");
  const meetsThreshold = meetsDesignThreshold(paid, free);

  const thumb = (idea.imageDataList && idea.imageDataList[0])
    ? `<div class="card-thumb"><img src="${escapeHtml(idea.imageDataList[0])}" alt=""></div>`
    : "";
  const moreBadge = idea.imageDataList && idea.imageDataList.length > 1
    ? `<span class="card-thumb-more">+${idea.imageDataList.length - 1}</span>`
    : "";

  const allImages = (idea.imageDataList || []).map((src) =>
    `<img class="expanded-image" src="${escapeHtml(src)}" alt="">`
  ).join("");

  card.innerHTML = `
    <div class="card-row card-clickable">
      <div class="card-main">
        <div class="card-line-top">
          <span class="status-badge ${status.cls}">${status.txt}</span>
          ${idea.isSample ? '<span class="badge-sample">예시</span>' : ''}
          ${isHot ? '<span class="badge-popular">HOT</span>' : ''}
          ${meetsThreshold ? '<span class="badge-threshold">설계 진입 ✓</span>' : ''}
          <span class="expand-icon" aria-hidden="true">▾</span>
        </div>
        <h3 class="idea-title">${escapeHtml(idea.title)}</h3>
        <p class="idea-desc">${escapeHtml(idea.description).replace(/\n/g, "<br>")}</p>
        <div class="idea-meta">
          <span class="idea-author">
            ${idea.authorPhoto ? `<img src="${escapeHtml(idea.authorPhoto)}" alt="">` : ''}
            ${escapeHtml(idea.authorName)}
          </span>
          <span class="idea-counts">
            <span class="cnt-paid" title="유료라도 사용할 대기자">💎 ${paid}</span>
            <span class="cnt-free" title="무료라면 사용할 대기자">👥 ${free}</span>
            <span class="cnt-like" title="관심">${isLiked ? '❤️' : '🤍'} ${idea.likeCount || 0}</span>
            <span class="cnt-comment" title="댓글">💬 ${idea.commentCount || 0}</span>
          </span>
        </div>
        <div class="card-actions">
          <button class="btn-mini btn-paid ${isJoinedTier === 'paid' ? 'active' : ''}" data-action="paid" data-idea-id="${idea.id}">
            ${isJoinedTier === 'paid' ? '✓ 유료대기 중' : '💎 유료라도 사용'}
          </button>
          <button class="btn-mini btn-free ${isJoinedTier === 'free' ? 'active' : ''}" data-action="free" data-idea-id="${idea.id}">
            ${isJoinedTier === 'free' ? '✓ 무료대기 중' : '👥 무료라면 사용'}
          </button>
          <button class="btn-mini btn-like ${isLiked ? 'active' : ''}" data-action="like" data-idea-id="${idea.id}" title="관심">
            ${isLiked ? '❤️' : '🤍'}
          </button>
          <button class="btn-mini btn-share" data-action="share" data-idea-id="${idea.id}" title="링크 복사">🔗</button>
        </div>
      </div>
      ${thumb ? `<div class="card-thumbs">${thumb}${moreBadge}</div>` : ''}
    </div>

    <div class="card-body">
      <div class="card-body-inner">
        ${allImages ? `<div class="expanded-images">${allImages}</div>` : ''}
        ${renderProgressBlock(paid, free, meetsThreshold)}

        ${(!idea.isSample && getCurrentUser()?.uid === idea.authorUid) ? `
          <div class="owner-actions">
            <button class="btn-mini btn-text" data-action="owner-edit" data-idea-id="${idea.id}">✏️ 수정</button>
            <button class="btn-mini btn-text-danger" data-action="owner-delete" data-idea-id="${idea.id}">🗑️ 삭제</button>
          </div>
          <div class="owner-edit-form hidden" data-edit="${idea.id}">
            <input type="text" class="adm-input" data-edit-field="title" value="${escapeHtml(idea.title)}" maxlength="100">
            <textarea class="adm-input" data-edit-field="description" rows="6" maxlength="1000">${escapeHtml(idea.description || '')}</textarea>
            <div class="owner-edit-actions">
              <button class="btn-mini btn-text" data-action="owner-edit-cancel" data-idea-id="${idea.id}">취소</button>
              <button class="btn-mini btn-comment-submit" data-action="owner-edit-save" data-idea-id="${idea.id}">저장</button>
            </div>
          </div>
        ` : ''}

        <section class="inline-comments">
          <h4 class="inline-comments-title">댓글 <span class="inline-comments-count">${idea.commentCount || 0}</span></h4>
          ${idea.isSample ? '<p class="comment-sample-note">예시 글에는 댓글을 남길 수 없어요.</p>' : `
            <div class="inline-comment-form">
              <textarea class="inline-comment-input" rows="2" maxlength="1000" placeholder="댓글을 남겨주세요"></textarea>
              <button class="btn-mini btn-comment-submit" data-action="comment-submit" data-idea-id="${idea.id}">댓글 등록</button>
            </div>
          `}
          <div class="inline-comments-list">
            ${idea.isSample ? '<p class="empty-comment">예시 글입니다.</p>' : '<p class="empty-comment">댓글을 불러옵니다...</p>'}
          </div>
        </section>
      </div>
    </div>
  `;
  return card;
}

function renderProgressBlock(paid, free, met) {
  const need1 = Math.max(0, THRESHOLD_PAID_ALONE - paid);
  const need2P = Math.max(0, THRESHOLD_PAID_MIXED - paid);
  const need2F = Math.max(0, THRESHOLD_FREE_MIXED - free);
  const html = met
    ? `<div class="expanded-threshold met">🎉 <strong>설계 진입 조건 충족!</strong> 곧 제작 단계로 넘어갑니다.</div>`
    : `<div class="expanded-threshold">
        🎯 진입 조건: <strong>유료 ${THRESHOLD_PAID_ALONE}명</strong> 또는 <strong>유료 ${THRESHOLD_PAID_MIXED} + 무료 ${THRESHOLD_FREE_MIXED}명</strong><br>
        현재 <strong>유료 ${paid}</strong> · <strong>무료 ${free}</strong>
        ${need1 > 0 ? ` (유료 단독까지 ${need1}명, 혼합까지 유료 ${need2P}·무료 ${need2F}명)` : ''}
      </div>`;
  return html;
}

// ---- Click handler ----

async function handleIdeasClick(e) {
  // 1) 액션 버튼
  const btn = e.target.closest(".btn-mini");
  if (btn) {
    e.stopPropagation();
    const action = btn.dataset.action;
    const ideaId = btn.dataset.ideaId;
    if (action === "paid" || action === "free") return onWaitlistClick(btn, ideaId, action);
    if (action === "like") return onLikeClick(btn, ideaId);
    if (action === "share") return onShareClick(ideaId);
    if (action === "comment-submit") return onCommentSubmit(btn, ideaId, null);
    if (action === "reply-submit") return onCommentSubmit(btn, ideaId, btn.dataset.parent);
    if (action === "reply-toggle") return onReplyToggle(btn);
    if (action === "comment-delete") return onDeleteComment(ideaId, btn.dataset.commentId);
    if (action === "owner-edit") return onOwnerEditToggle(btn, ideaId, true);
    if (action === "owner-edit-cancel") return onOwnerEditToggle(btn, ideaId, false);
    if (action === "owner-edit-save") return onOwnerEditSave(btn, ideaId);
    if (action === "owner-delete") return onOwnerDelete(btn, ideaId);
    return;
  }

  // 2) 텍스트영역 또는 input 클릭은 펼침 토글에 영향 없도록
  if (e.target.closest("textarea, input")) return;

  // 3) 카드 클릭 → 토글
  const card = e.target.closest(".idea-card");
  if (card) toggleAccordion(card);
}

function toggleAccordion(card) {
  const ideaId = card.dataset.id;
  const wasExpanded = card.classList.contains("expanded");

  // 모두 접기
  ideasContainer.querySelectorAll(".idea-card.expanded").forEach((c) => {
    c.classList.remove("expanded");
  });

  // 이전 expanded 댓글 구독 해제
  if (expandedCardId && expandedCardId !== ideaId) {
    const u = commentUnsubMap[expandedCardId];
    if (u) { u(); delete commentUnsubMap[expandedCardId]; }
  }

  if (!wasExpanded) {
    card.classList.add("expanded");
    expandedCardId = ideaId;
    // 댓글 구독 (실제 글만)
    if (card.dataset.sample !== "1") {
      subscribeCommentsForCard(ideaId, card);
    }
  } else {
    expandedCardId = null;
    if (commentUnsubMap[ideaId]) {
      commentUnsubMap[ideaId]();
      delete commentUnsubMap[ideaId];
    }
  }
}

function subscribeCommentsForCard(ideaId, card) {
  if (commentUnsubMap[ideaId]) return;
  try {
    commentUnsubMap[ideaId] = subscribeToComments(ideaId, (comments) => {
      commentsCacheMap[ideaId] = comments;
      const c = ideasContainer.querySelector(`.idea-card[data-id="${cssEscape(ideaId)}"]`);
      if (c) renderInlineComments(c, comments);
    });
  } catch (e) {
    console.warn("comments subscription failed", e);
  }
}

function renderInlineComments(card, comments) {
  const list = card.querySelector(".inline-comments-list");
  const cnt = card.querySelector(".inline-comments-count");
  if (cnt) cnt.textContent = comments.length;
  if (!list) return;

  if (comments.length === 0) {
    list.innerHTML = '<p class="empty-comment">첫 댓글을 남겨주세요!</p>';
    return;
  }

  const byParent = new Map();
  byParent.set(null, []);
  comments.forEach((c) => {
    const p = c.parentId || null;
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p).push(c);
  });
  const top = byParent.get(null) || [];
  const ideaId = card.dataset.id;

  list.innerHTML = top.map((c) => commentInlineHtml(c, byParent.get(c.id) || [], ideaId)).join("");
}

function commentInlineHtml(c, replies, ideaId) {
  const myUid = getCurrentUser()?.uid;
  const canDelete = myUid && c.authorUid === myUid;
  const repliesHtml = replies.map((r) => {
    const canDelR = myUid && r.authorUid === myUid;
    return `
      <div class="comment reply">
        <div class="comment-head">
          ${r.authorPhoto ? `<img class="comment-avatar" src="${escapeHtml(r.authorPhoto)}">` : ''}
          <strong>${escapeHtml(r.authorName || '익명')}</strong>
          <span class="comment-time">${formatTime(r.createdAt)}</span>
          ${canDelR ? `<button class="btn-mini btn-text-danger" data-action="comment-delete" data-idea-id="${ideaId}" data-comment-id="${r.id}">삭제</button>` : ''}
        </div>
        <div class="comment-body">${escapeHtml(r.text).replace(/\n/g, "<br>")}</div>
      </div>
    `;
  }).join("");

  return `
    <div class="comment top">
      <div class="comment-head">
        ${c.authorPhoto ? `<img class="comment-avatar" src="${escapeHtml(c.authorPhoto)}">` : ''}
        <strong>${escapeHtml(c.authorName || '익명')}</strong>
        <span class="comment-time">${formatTime(c.createdAt)}</span>
        ${canDelete ? `<button class="btn-mini btn-text-danger" data-action="comment-delete" data-idea-id="${ideaId}" data-comment-id="${c.id}">삭제</button>` : ''}
      </div>
      <div class="comment-body">${escapeHtml(c.text).replace(/\n/g, "<br>")}</div>
      <div class="comment-actions">
        <button class="btn-mini btn-text" data-action="reply-toggle" data-parent="${c.id}">답글</button>
      </div>
      <div class="reply-form hidden" data-parent="${c.id}">
        <textarea rows="2" maxlength="1000" placeholder="답글 작성..." class="reply-input"></textarea>
        <div class="reply-form-actions">
          <button class="btn-mini btn-text" data-action="reply-toggle" data-parent="${c.id}">취소</button>
          <button class="btn-mini btn-comment-submit" data-action="reply-submit" data-idea-id="${ideaId}" data-parent="${c.id}">답글 등록</button>
        </div>
      </div>
      ${repliesHtml ? `<div class="reply-list">${repliesHtml}</div>` : ''}
    </div>
  `;
}

function onReplyToggle(btn) {
  const parentId = btn.dataset.parent;
  const card = btn.closest(".idea-card");
  if (!card) return;
  const form = card.querySelector(`.reply-form[data-parent="${cssEscape(parentId)}"]`);
  if (!form) return;
  form.classList.toggle("hidden");
  if (!form.classList.contains("hidden")) {
    form.querySelector("textarea")?.focus();
  }
}

async function onCommentSubmit(btn, ideaId, parentId) {
  const user = getCurrentUser();
  if (!user) {
    showToast("댓글 작성은 로그인이 필요합니다", "info");
    setTimeout(() => window.appAuth.loginWithGoogle(), 800);
    return;
  }
  if (String(ideaId).startsWith("sample_")) {
    showToast("예시 글에는 댓글을 남길 수 없어요.", "info");
    return;
  }
  const card = btn.closest(".idea-card");
  let text = "";
  let textarea;
  if (parentId) {
    const form = card.querySelector(`.reply-form[data-parent="${cssEscape(parentId)}"]`);
    textarea = form?.querySelector("textarea");
    text = textarea ? textarea.value.trim() : "";
  } else {
    textarea = card.querySelector(".inline-comment-input");
    text = textarea ? textarea.value.trim() : "";
  }
  if (!text) { showToast("내용을 입력해주세요", ""); return; }

  btn.disabled = true;
  try {
    await addComment(ideaId, user, text, parentId);
    if (textarea) textarea.value = "";
    if (parentId) {
      const form = card.querySelector(`.reply-form[data-parent="${cssEscape(parentId)}"]`);
      form?.classList.add("hidden");
    }
    showToast(parentId ? "답글이 등록되었어요" : "댓글이 등록되었어요", "success");
  } catch (e) {
    console.error(e);
    showToast(e.message || "댓글 등록에 실패했어요.", "");
  } finally {
    btn.disabled = false;
  }
}

async function onDeleteComment(ideaId, commentId) {
  if (!confirm("댓글을 삭제하시겠습니까?")) return;
  try {
    await deleteComment(ideaId, commentId);
    showToast("삭제되었어요", "");
  } catch (e) {
    showToast("삭제에 실패했어요", "");
  }
}

// ---- 액션 ----

async function onWaitlistClick(btn, ideaId, tier) {
  if (String(ideaId).startsWith("sample_")) {
    showToast("이 아이디어는 예시입니다. 실제 글에서만 등록할 수 있어요.", "info");
    return;
  }
  const user = getCurrentUser();
  if (!user) {
    showToast("대기자 등록은 로그인이 필요합니다", "info");
    setTimeout(() => window.appAuth.loginWithGoogle(), 800);
    return;
  }
  btn.disabled = true;
  try {
    const result = await toggleWaitlist(ideaId, user, tier);
    if (result.joined) {
      userWaitlistMap[ideaId] = result.tier;
      showToast(
        result.switched
          ? `${result.tier === 'paid' ? '유료' : '무료'} 대기로 전환됐어요`
          : `${result.tier === 'paid' ? '유료라도 사용' : '무료라면 사용'} 대기자로 등록됐어요!`,
        "success"
      );
    } else {
      userWaitlistMap[ideaId] = null;
      showToast("대기자 등록이 취소됐어요", "");
    }
  } catch (err) {
    console.error("waitlist error", err);
    showToast("오류가 발생했어요. 잠시 후 다시 시도해주세요.", "");
  } finally {
    btn.disabled = false;
    renderAll();
  }
}

async function onLikeClick(btn, ideaId) {
  if (String(ideaId).startsWith("sample_")) {
    showToast("이 아이디어는 예시입니다.", "info");
    return;
  }
  const user = getCurrentUser();
  if (!user) {
    showToast("관심 등록은 로그인이 필요합니다", "info");
    setTimeout(() => window.appAuth.loginWithGoogle(), 800);
    return;
  }
  btn.disabled = true;
  try {
    const r = await toggleLike(ideaId, user);
    userLikeMap[ideaId] = r.liked;
    showToast(r.liked ? "관심 아이디어로 등록됐어요 ❤️" : "관심 등록이 취소됐어요", r.liked ? "success" : "");
  } catch (err) {
    console.error(err);
    showToast("오류가 발생했어요.", "");
  } finally {
    btn.disabled = false;
    renderAll();
  }
}

async function onShareClick(ideaId) {
  if (String(ideaId).startsWith("sample_")) {
    showToast("예시 글은 공유 주소가 없습니다.", "info");
    return;
  }
  const url = `${window.location.origin}/idea.html?id=${encodeURIComponent(ideaId)}`;
  try {
    await navigator.clipboard.writeText(url);
    showToast("주소가 복사되었어요. 다른 곳에 붙여넣기 해주세요.", "success");
  } catch (e) {
    window.prompt("아래 주소를 복사하세요", url);
  }
}

// ---- 이미지 처리 ----

async function handleImageSelect(e) {
  const files = Array.from(e.target.files || []);
  e.target.value = "";
  if (files.length === 0) return;

  for (const file of files) {
    if (pendingImages.length >= MAX_IMAGES) {
      showToast(`최대 ${MAX_IMAGES}장까지 첨부할 수 있어요`, "");
      break;
    }
    if (!file.type.startsWith("image/")) continue;
    if (file.size > 20 * 1024 * 1024) {
      showToast("이미지가 너무 큽니다 (최대 20MB)", ""); continue;
    }
    try {
      let dataUrl = await resizeImageToDataUrl(file, MAX_IMAGE_WIDTH, IMAGE_JPEG_QUALITY);
      if (dataUrl.length > MAX_IMAGE_BYTES) {
        dataUrl = await resizeImageToDataUrl(file, MAX_IMAGE_WIDTH, 0.6);
      }
      if (dataUrl.length > MAX_IMAGE_BYTES) {
        showToast(`'${file.name}' 이미지 용량이 너무 커요.`, ""); continue;
      }
      pendingImages.push({
        dataUrl,
        sizeKb: Math.round((dataUrl.length * 3) / 4 / 1024)
      });
    } catch (err) {
      console.error(err);
      showToast(`'${file.name}' 처리 실패`, "");
    }
  }
  renderImagePreviews();
}

function renderImagePreviews() {
  if (!imagePreviews) return;
  imagePreviews.innerHTML = pendingImages.map((img, idx) => `
    <div class="thumb-item">
      <img src="${escapeHtml(img.dataUrl)}" alt="">
      <button type="button" class="thumb-remove" data-idx="${idx}" aria-label="제거">×</button>
      <span class="thumb-size">${img.sizeKb}KB</span>
    </div>
  `).join("");
  imagePreviews.querySelectorAll(".thumb-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      pendingImages.splice(parseInt(btn.dataset.idx, 10), 1);
      renderImagePreviews();
    });
  });
  if (imageAddBtn) {
    const remaining = MAX_IMAGES - pendingImages.length;
    imageAddBtn.title = remaining > 0 ? `이미지 첨부 (${pendingImages.length}/${MAX_IMAGES})` : "더 이상 추가할 수 없어요";
    imageAddBtn.classList.toggle("disabled", remaining <= 0);
  }
}

function clearImagePreviews() { pendingImages = []; renderImagePreviews(); }

function resizeImageToDataUrl(file, maxWidth, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode failed"));
      img.onload = () => {
        const ratio = img.width > maxWidth ? maxWidth / img.width : 1;
        const w = Math.round(img.width * ratio); const h = Math.round(img.height * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ---- Submit ----

async function handleSubmit(e) {
  e.preventDefault();
  const title = ideaTitle.value.trim();
  const desc = ideaDesc.value.trim();
  if (title.length < 2) { showToast("제목을 2자 이상 입력해주세요", ""); ideaTitle.focus(); return; }
  if (desc.length < 10) { showToast("설명을 10자 이상 입력해주세요", ""); ideaDesc.focus(); return; }

  const user = getCurrentUser();
  if (!user) {
    pendingSubmit = true;
    showToast("로그인이 필요합니다. 잠시 후 로그인 페이지로 이동합니다.", "info");
    setTimeout(() => window.appAuth.loginWithGoogle(), 1000);
    return;
  }
  try {
    const c = await getTodayPostCount(user.uid);
    if (c >= DAILY_POST_LIMIT) {
      showToast(`하루에 최대 ${DAILY_POST_LIMIT}개까지만 등록할 수 있어요.`, "");
      await refreshDailyLimitInfo();
      return;
    }
  } catch (e) { /* ignore */ }
  await submitIdea(title, desc, user);
}

async function submitIdea(title, desc, user) {
  submitBtn.disabled = true;
  submitBtn.textContent = "제출 중...";
  try {
    const images = pendingImages.map((p) => p.dataUrl);
    await addIdea(title, desc, user, images);
    ideaTitle.value = ""; ideaDesc.value = "";
    titleCount.textContent = "0"; descCount.textContent = "0";
    clearImagePreviews();
    showToast("아이디어가 등록되었어요! 💡", "success");
    await refreshDailyLimitInfo();
  } catch (error) {
    console.error("submit", error);
    if (error?.code === "daily-limit-exceeded") {
      showToast(error.message, ""); await refreshDailyLimitInfo();
    } else {
      showToast("제출에 실패했어요. 다시 시도해주세요.", "");
    }
  } finally {
    submitBtn.disabled = false;
    // 버튼 텍스트는 refreshDailyLimitInfo 가 갱신
  }
}

// ---- Subscribe ----

async function handleSubscribe() {
  const emailInput = document.getElementById("subscribe-email");
  const email = emailInput.value.trim();
  if (!email || !email.includes("@")) { showToast("유효한 이메일 주소를 입력해주세요", ""); emailInput.focus(); return; }
  try {
    await subscribeEmail(email, "", null);
    emailInput.value = "";
    subscribeSuccess.classList.remove("hidden");
    setTimeout(() => subscribeSuccess.classList.add("hidden"), 3000);
    showToast("구독이 완료되었어요! 📧", "success");
  } catch (error) { showToast("구독에 실패했어요.", ""); }
}

async function handleSubscribeToggle(checked) {
  const user = getCurrentUser();
  if (!user || !user.email) return;
  try {
    if (checked) {
      await subscribeEmail(user.email, user.displayName, user.uid);
      showToast("구독이 완료되었어요! 📧", "success");
    } else {
      await unsubscribeEmail(user.email);
      showToast("구독이 취소되었어요", "");
    }
  } catch (error) {
    subscribeCheck.checked = !checked;
    showToast("오류가 발생했어요.", "");
  }
}

// ---- 관심 모달 ----

async function openFavoritesModal() {
  if (!favModal) return;
  const user = getCurrentUser();
  if (!user) { showToast("로그인 후 사용할 수 있어요", "info"); return; }
  favModal.classList.remove("hidden");
  favModalList.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:20px;">불러오는 중...</p>';
  try {
    const ideas = await getUserLikedIdeas(user.uid);
    if (ideas.length === 0) {
      favModalList.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:20px;">아직 관심 등록한 아이디어가 없어요.</p>';
      return;
    }
    favModalList.innerHTML = ideas.map((i) => {
      const sl = statusLabel(i.status || "waiting");
      return `
        <div class="fav-item">
          <a class="fav-item-main" href="idea.html?id=${encodeURIComponent(i.id)}">
            <div class="fav-item-row"><span class="status-badge ${sl.cls}">${sl.txt}</span><strong>${escapeHtml(i.title)}</strong></div>
            <p class="fav-item-desc">${escapeHtml(truncate(i.description, 80))}</p>
          </a>
          <button class="fav-remove" data-id="${i.id}" title="관심 해제">×</button>
        </div>
      `;
    }).join("");
    favModalList.querySelectorAll(".fav-remove").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          await toggleLike(btn.dataset.id, user);
          btn.closest(".fav-item").remove();
          if (favModalList.children.length === 0) {
            favModalList.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:20px;">관심 등록한 아이디어가 없어요.</p>';
          }
        } catch (e) { showToast("해제에 실패했어요.", ""); }
        finally { btn.disabled = false; }
      });
    });
  } catch (e) {
    favModalList.innerHTML = '<p style="color:#ef4444;text-align:center;padding:20px;">불러오기에 실패했어요.</p>';
  }
}

function closeFavoritesModal() { if (favModal) favModal.classList.add("hidden"); }



// ---- 작성자 본인 수정/삭제 ----

function onOwnerEditToggle(btn, ideaId, open) {
  const card = btn.closest(".idea-card");
  const form = card?.querySelector(`.owner-edit-form[data-edit="${cssEscape(ideaId)}"]`);
  if (!form) return;
  if (open) {
    form.classList.remove("hidden");
    form.querySelector('[data-edit-field="title"]')?.focus();
  } else {
    form.classList.add("hidden");
  }
}

async function onOwnerEditSave(btn, ideaId) {
  const card = btn.closest(".idea-card");
  const form = card?.querySelector(`.owner-edit-form[data-edit="${cssEscape(ideaId)}"]`);
  if (!form) return;
  const title = form.querySelector('[data-edit-field="title"]').value.trim();
  const desc = form.querySelector('[data-edit-field="description"]').value.trim();
  if (title.length < 2) { showToast("제목을 2자 이상 입력해주세요", ""); return; }
  if (desc.length < 10) { showToast("설명을 10자 이상 입력해주세요", ""); return; }
  btn.disabled = true;
  try {
    await userUpdateOwnIdea(ideaId, { title, description: desc });
    showToast("수정 완료", "success");
    form.classList.add("hidden");
  } catch (e) {
    console.error(e);
    showToast("수정 실패: " + (e.message || ""), "");
  } finally {
    btn.disabled = false;
  }
}

async function onOwnerDelete(btn, ideaId) {
  if (!confirm("이 글을 삭제할까요? 댓글/대기자/관심도 함께 사라집니다.")) return;
  btn.disabled = true;
  try {
    await userDeleteOwnIdea(ideaId);
    showToast("삭제됐어요", "");
  } catch (e) {
    console.error(e);
    showToast("삭제 실패: " + (e.message || ""), "");
  } finally {
    btn.disabled = false;
  }
}

// ---- Toast ----

function showToast(message, type) {
  const c = document.getElementById("toast-container");
  if (!c) return;
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = message;
  c.appendChild(t);
  setTimeout(() => { if (t.parentNode) t.remove(); }, 3000);
}

// ---- Utilities ----

function escapeHtml(str) {
  if (!str) return "";
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}
function truncate(str, n) {
  if (!str) return "";
  return str.length > n ? str.substring(0, n) + "..." : str;
}
function formatTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "방금 전";
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + "분 전";
  if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + "시간 전";
  return d.toLocaleDateString("ko-KR");
}
function cssEscape(s) {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => "\\" + c);
}

window.app = { handleSubscribe, handleSubscribeToggle };

// ========================================
// Hero Title Typing Cycle
// ========================================
const HERO_PHRASES = [
  "이런 앱",
  "지금바로 같이 밥 먹을 사람 매칭 앱",
  "사진찍고 SNS 감성으로 자동 편집 앱",
  "같은 시간에 운동 파트너 연결 앱",
  "내 옷 코디 공유 + 구매 연결 앱",
  "취향 맞는 영상 자동 추천 앱",
  "카페 자리·콘센트 정보 앱",
  "약속 중간 위치 + 최적 코스 추천 앱"
];

const heroTypingEl = document.getElementById("typing-app");
if (heroTypingEl) startHeroTypingCycle();

function startHeroTypingCycle() {
  let phraseIdx = 0;
  let charIdx = HERO_PHRASES[0].length;
  let mode = "hold-start";
  const TYPE_DELAY = 70, DEL_DELAY = 35, HOLD_AFTER_TYPE = 1800, HOLD_INITIAL = 1300, PAUSE_BETWEEN = 350;
  function render() { heroTypingEl.textContent = HERO_PHRASES[phraseIdx].substring(0, charIdx); }
  function tick() {
    const phrase = HERO_PHRASES[phraseIdx];
    if (mode === "hold-start") { mode = "deleting"; setTimeout(tick, HOLD_INITIAL); return; }
    if (mode === "deleting") {
      charIdx--; render();
      if (charIdx <= 0) {
        phraseIdx = (phraseIdx + 1) % HERO_PHRASES.length;
        if (phraseIdx === 0) phraseIdx = 1;
        mode = "typing"; setTimeout(tick, PAUSE_BETWEEN);
      } else setTimeout(tick, DEL_DELAY);
      return;
    }
    if (mode === "typing") {
      charIdx++; render();
      if (charIdx >= phrase.length) { mode = "holding"; setTimeout(tick, HOLD_AFTER_TYPE); }
      else setTimeout(tick, TYPE_DELAY);
      return;
    }
    if (mode === "holding") { mode = "deleting"; setTimeout(tick, 0); return; }
  }
  setTimeout(tick, 100);
}
