// ========================================
// Idea Detail Page - 단일 아이디어 + 댓글/답글
// ========================================

import { onAuthChange, getCurrentUser } from "./auth.js";
import {
  subscribeToIdea,
  toggleWaitlist,
  toggleLike,
  checkUserWaitlist,
  checkUserLike,
  addComment,
  subscribeToComments,
  deleteComment,
  meetsDesignThreshold,
  THRESHOLD_PAID_ALONE,
  THRESHOLD_PAID_MIXED,
  THRESHOLD_FREE_MIXED
} from "./firestore.js";

const params = new URLSearchParams(window.location.search);
const ideaId = params.get("id");

const detailArticle = document.getElementById("detail-article");
const detailLoading = document.getElementById("detail-loading");
const detailActions = document.getElementById("detail-actions");
const commentsSection = document.getElementById("comments-section");
const commentsList = document.getElementById("comments-list");
const commentsCount = document.getElementById("comments-count");
const commentInput = document.getElementById("comment-input");
const commentSubmit = document.getElementById("comment-submit");

const btnPaid = document.getElementById("btn-paid");
const btnFree = document.getElementById("btn-free");
const btnLike = document.getElementById("btn-like");
const btnShare = document.getElementById("btn-share");
const thresholdMsg = document.getElementById("threshold-msg");
const loginBtn = document.getElementById("login-btn");
const userInfo = document.getElementById("user-info");
const userPhoto = document.getElementById("user-photo");
const userName = document.getElementById("user-name");

let currentIdea = null;
let currentUser = null;
let unsubIdea = null;
let unsubComments = null;
let myWaitlistTier = null; // 'paid' | 'free' | null
let myLiked = false;
let replyParentId = null;

if (!ideaId) {
  detailArticle.innerHTML = '<p style="padding:20px;text-align:center;color:#ef4444;">잘못된 주소입니다.</p>';
} else {
  init();
}

function init() {
  onAuthChange(handleAuth);

  unsubIdea = subscribeToIdea(ideaId, async (idea) => {
    if (!idea) {
      detailArticle.innerHTML = `
        <div class="not-found">
          <p>이 아이디어를 찾을 수 없어요. 삭제되었거나 잘못된 주소일 수 있어요.</p>
          <p><a href="board.html">← 게시판으로</a></p>
        </div>`;
      return;
    }
    currentIdea = idea;
    renderIdea(idea);
    detailLoading?.classList.add("hidden");
    detailActions.classList.remove("hidden");
    commentsSection.classList.remove("hidden");
    if (currentUser) {
      myWaitlistTier = await checkUserWaitlist(ideaId, currentUser.uid);
      myLiked = await checkUserLike(ideaId, currentUser.uid);
      updateActionButtons();
    }
    updateThresholdMessage();
  });

  unsubComments = subscribeToComments(ideaId, (comments) => {
    renderComments(comments);
    commentsCount.textContent = comments.length;
  });

  btnPaid.addEventListener("click", () => onWaitlist("paid"));
  btnFree.addEventListener("click", () => onWaitlist("free"));
  btnLike.addEventListener("click", onLike);
  btnShare.addEventListener("click", onShare);
  commentSubmit.addEventListener("click", () => onCommentSubmit(null));
}

async function handleAuth(user) {
  currentUser = user;
  if (user) {
    loginBtn.classList.add("hidden");
    userInfo.classList.remove("hidden");
    userPhoto.src = user.photoURL || "";
    userName.textContent = user.displayName || "사용자";
    if (currentIdea) {
      myWaitlistTier = await checkUserWaitlist(ideaId, user.uid);
      myLiked = await checkUserLike(ideaId, user.uid);
      updateActionButtons();
      }
  } else {
    loginBtn.classList.remove("hidden");
    userInfo.classList.add("hidden");
    myWaitlistTier = null;
    myLiked = false;
    updateActionButtons();
  }
}

// ---- Render ----

function statusLabel(s) {
  switch (s) {
    case "ready":     return { txt: "필요인원 채움", cls: "status-ready" };
    case "building":  return { txt: "제작 중", cls: "status-building" };
    case "completed": return { txt: "출시 완료", cls: "status-completed" };
    case "cancelled": return { txt: "취소", cls: "status-cancelled" };
    default:          return { txt: "대기 중", cls: "status-waiting" };
  }
}

function renderIdea(idea) {
  const sl = statusLabel(idea.status || "waiting");
  const paid = idea.paidWaitlistCount || 0;
  const free = idea.freeWaitlistCount || 0;
  const images = (idea.imageDataList || []).map((src) =>
    `<img class="detail-image" src="${escapeHtml(src)}" alt="">`
  ).join("");

  detailArticle.innerHTML = `
    <div class="detail-head">
      <span class="status-badge ${sl.cls}">${sl.txt}</span>
      <h1 class="detail-title">${escapeHtml(idea.title)}</h1>
      <div class="detail-author">
        ${idea.authorPhoto ? `<img src="${escapeHtml(idea.authorPhoto)}" alt="">` : ''}
        <span>${escapeHtml(idea.authorName || '익명')}</span>
        <span class="detail-counts">
          <span class="cnt-paid">💎 ${paid}</span>
          <span class="cnt-free">👥 ${free}</span>
          <span class="cnt-like">❤️ ${idea.likeCount || 0}</span>
        </span>
      </div>
    </div>
    ${images ? `<div class="detail-images">${images}</div>` : ''}
    <div class="detail-body">${escapeHtml(idea.description).replace(/\n/g, "<br>")}</div>
  `;
}

function updateActionButtons() {
  if (!currentIdea) return;
  btnPaid.classList.toggle("active", myWaitlistTier === "paid");
  btnFree.classList.toggle("active", myWaitlistTier === "free");
  btnPaid.querySelector("span").textContent = myWaitlistTier === "paid" ? "✓ 유료대기 중" : "💎 유료라도 사용";
  btnFree.querySelector("span").textContent = myWaitlistTier === "free" ? "✓ 무료대기 중" : "👥 무료라면 사용";
  btnLike.classList.toggle("active", myLiked);
  btnLike.querySelector("span").textContent = myLiked ? "❤️" : "🤍";
}

function updateThresholdMessage() {
  if (!currentIdea) return;
  const paid = currentIdea.paidWaitlistCount || 0;
  const free = currentIdea.freeWaitlistCount || 0;
  const met = meetsDesignThreshold(paid, free);

  if (met) {
    thresholdMsg.innerHTML = `🎉 <strong>설계 진입 조건 충족!</strong> 유료 ${paid}명 / 무료 ${free}명이 모였어요. 곧 제작 단계로 넘어갑니다.`;
    thresholdMsg.className = "detail-threshold met";
  } else {
    const need1 = Math.max(0, THRESHOLD_PAID_ALONE - paid);
    const need2Paid = Math.max(0, THRESHOLD_PAID_MIXED - paid);
    const need2Free = Math.max(0, THRESHOLD_FREE_MIXED - free);
    thresholdMsg.innerHTML = `
      🎯 설계 진입 조건: <strong>유료 ${THRESHOLD_PAID_ALONE}명</strong> 또는 <strong>유료 ${THRESHOLD_PAID_MIXED} + 무료 ${THRESHOLD_FREE_MIXED}명</strong>.
      현재 유료 ${paid} / 무료 ${free} (유료 단독까지 ${need1}명, 혼합까지 유료 ${need2Paid}·무료 ${need2Free}명)
    `;
    thresholdMsg.className = "detail-threshold";
  }
}

  if (currentIdea.authorUid === currentUser.uid) {
    statusControls.classList.remove("hidden");
    statusSelect.value = currentIdea.status || "waiting";
  } else {
    statusControls.classList.add("hidden");
  }
}

// ---- Comments ----

function renderComments(comments) {
  const byParent = new Map();
  byParent.set(null, []);
  comments.forEach((c) => {
    const p = c.parentId || null;
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p).push(c);
  });
  const top = byParent.get(null) || [];

  if (top.length === 0) {
    commentsList.innerHTML = '<p class="empty-comment">첫 댓글을 남겨주세요!</p>';
    return;
  }

  commentsList.innerHTML = top.map((c) => commentHtml(c, byParent.get(c.id) || [])).join("");
  commentsList.querySelectorAll(".reply-btn").forEach((btn) => {
    btn.addEventListener("click", () => openReply(btn.dataset.parent));
  });
  commentsList.querySelectorAll(".reply-cancel").forEach((btn) => {
    btn.addEventListener("click", () => closeReply(btn.dataset.parent));
  });
  commentsList.querySelectorAll(".reply-submit").forEach((btn) => {
    btn.addEventListener("click", () => onCommentSubmit(btn.dataset.parent));
  });
  commentsList.querySelectorAll(".comment-delete").forEach((btn) => {
    btn.addEventListener("click", () => onDeleteComment(btn.dataset.id));
  });
}

function commentHtml(c, replies) {
  const myUid = currentUser?.uid;
  const canDelete = myUid && c.authorUid === myUid;
  const repliesHtml = replies.map((r) => {
    const canDelR = myUid && r.authorUid === myUid;
    return `
      <div class="comment reply">
        <div class="comment-head">
          ${r.authorPhoto ? `<img class="comment-avatar" src="${escapeHtml(r.authorPhoto)}">` : ''}
          <strong>${escapeHtml(r.authorName || '익명')}</strong>
          <span class="comment-time">${formatTime(r.createdAt)}</span>
          ${canDelR ? `<button class="comment-delete" data-id="${r.id}">삭제</button>` : ''}
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
        ${canDelete ? `<button class="comment-delete" data-id="${c.id}">삭제</button>` : ''}
      </div>
      <div class="comment-body">${escapeHtml(c.text).replace(/\n/g, "<br>")}</div>
      <div class="comment-actions">
        <button class="reply-btn" data-parent="${c.id}">답글</button>
      </div>
      <div class="reply-form hidden" id="reply-form-${c.id}">
        <textarea rows="2" maxlength="1000" placeholder="답글 작성..." class="reply-input"></textarea>
        <div class="reply-form-actions">
          <button class="reply-cancel" data-parent="${c.id}">취소</button>
          <button class="reply-submit" data-parent="${c.id}">답글 등록</button>
        </div>
      </div>
      ${repliesHtml ? `<div class="reply-list">${repliesHtml}</div>` : ''}
    </div>
  `;
}

function openReply(parentId) {
  const form = document.getElementById(`reply-form-${parentId}`);
  if (form) {
    form.classList.remove("hidden");
    form.querySelector("textarea").focus();
  }
}
function closeReply(parentId) {
  const form = document.getElementById(`reply-form-${parentId}`);
  if (form) form.classList.add("hidden");
}

async function onCommentSubmit(parentId) {
  if (!currentUser) {
    showToast("댓글 작성은 로그인이 필요합니다", "info");
    setTimeout(() => window.appAuth.loginWithGoogle(), 800);
    return;
  }
  let text;
  if (parentId) {
    const form = document.getElementById(`reply-form-${parentId}`);
    text = form.querySelector("textarea").value.trim();
  } else {
    text = commentInput.value.trim();
  }
  if (!text) {
    showToast("내용을 입력해주세요", "");
    return;
  }
  try {
    await addComment(ideaId, currentUser, text, parentId);
    if (parentId) {
      const form = document.getElementById(`reply-form-${parentId}`);
      form.querySelector("textarea").value = "";
      form.classList.add("hidden");
    } else {
      commentInput.value = "";
    }
    showToast(parentId ? "답글이 등록되었어요" : "댓글이 등록되었어요", "success");
  } catch (e) {
    console.error(e);
    showToast(e.message || "댓글 등록에 실패했어요.", "");
  }
}

async function onDeleteComment(commentId) {
  if (!confirm("댓글을 삭제하시겠습니까?")) return;
  try {
    await deleteComment(ideaId, commentId);
    showToast("삭제되었어요", "");
  } catch (e) {
    showToast("삭제에 실패했어요", "");
  }
}

// ---- 액션 ----

async function onWaitlist(tier) {
  if (!currentUser) {
    showToast("대기자 등록은 로그인이 필요합니다", "info");
    setTimeout(() => window.appAuth.loginWithGoogle(), 800);
    return;
  }
  try {
    const result = await toggleWaitlist(ideaId, currentUser, tier);
    if (result.joined) {
      myWaitlistTier = result.tier;
      showToast(result.switched ? `${result.tier === 'paid' ? '유료' : '무료'} 대기로 전환됐어요` : "대기자 등록 완료!", "success");
    } else {
      myWaitlistTier = null;
      showToast("대기자 등록이 취소됐어요", "");
    }
    updateActionButtons();
  } catch (e) {
    console.error(e);
    showToast("오류가 발생했어요", "");
  }
}

async function onLike() {
  if (!currentUser) {
    showToast("관심 등록은 로그인이 필요합니다", "info");
    setTimeout(() => window.appAuth.loginWithGoogle(), 800);
    return;
  }
  try {
    const r = await toggleLike(ideaId, currentUser);
    myLiked = r.liked;
    updateActionButtons();
    showToast(r.liked ? "관심 등록되었어요 ❤️" : "관심 해제됐어요", r.liked ? "success" : "");
  } catch (e) {
    showToast("오류가 발생했어요", "");
  }
}

async function onShare() {
  const url = `${window.location.origin}/idea.html?id=${encodeURIComponent(ideaId)}`;
  try {
    await navigator.clipboard.writeText(url);
    showToast("주소가 복사되었어요. 다른 곳에 붙여넣기 해주세요.", "success");
  } catch (e) {
    window.prompt("아래 주소를 복사하세요", url);
  }
}


// ---- Helpers ----

function formatTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60_000) return "방금 전";
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + "분 전";
  if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + "시간 전";
  return d.toLocaleDateString("ko-KR");
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function showToast(message, type) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3000);
}
