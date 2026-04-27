// ========================================
// Board Page - 탭별 아이디어 목록
// ========================================

import { onAuthChange } from "./auth.js";
import { subscribeToIdeas, meetsDesignThreshold } from "./firestore.js";
import { SAMPLE_IDEAS } from "./sample-data.js";

const boardList = document.getElementById("board-list");
const tabs = document.querySelectorAll(".board-tab");
const loginBtn = document.getElementById("login-btn");
const userInfo = document.getElementById("user-info");
const userPhoto = document.getElementById("user-photo");
const userName = document.getElementById("user-name");

let currentTab = "waiting";
let currentRealIdeas = [];
let unsubIdeas = null;

onAuthChange((user) => {
  if (user) {
    loginBtn.classList.add("hidden");
    userInfo.classList.remove("hidden");
    userPhoto.src = user.photoURL || "";
    userName.textContent = user.displayName || "사용자";
  } else {
    loginBtn.classList.remove("hidden");
    userInfo.classList.add("hidden");
  }
});

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    currentTab = tab.dataset.tab;
    renderList();
  });
});

// 즉시 샘플 노출 + 백그라운드로 firestore 구독
renderList();
startSubscription();

function startSubscription() {
  if (unsubIdeas) unsubIdeas();
  try {
    // 서버측 status 필터 없이 모든 아이디어를 받아서 클라이언트에서 분류
    unsubIdeas = subscribeToIdeas("createdAt", (ideas) => {
      currentRealIdeas = ideas;
      renderList();
    });
  } catch (e) {
    console.warn("board subscription failed", e);
  }
}

function renderList() {
  // 샘플 글 - 현재 탭에 맞는 status 만
  const samples = SAMPLE_IDEAS
    .filter((s) => (s.status || "waiting") === currentTab)
    .map((s) => ({ ...s, isSample: true }));
  // 실제 아이디어도 클라이언트에서 분류
  const reals = currentRealIdeas
    .filter((r) => (r.status || "waiting") === currentTab)
    .map((r) => ({ ...r, isSample: false }));
  const merged = [...reals, ...samples];

  // 인기순(대기자 수)로 정렬
  merged.sort((a, b) => (b.waitlistCount || 0) - (a.waitlistCount || 0));

  if (merged.length === 0) {
    boardList.innerHTML = `
      <div class="board-empty">
        <p>이 분류에 해당하는 아이디어가 아직 없어요.</p>
      </div>`;
    return;
  }

  boardList.innerHTML = merged.map((idea) => boardCardHtml(idea)).join("");

  boardList.querySelectorAll(".board-card").forEach((card) => {
    card.addEventListener("click", () => {
      const id = card.dataset.id;
      if (String(id).startsWith("sample_")) {
        showToast("이 아이디어는 예시입니다. 실제 글에서만 상세 페이지가 동작합니다.", "info");
        return;
      }
      window.location.href = `idea.html?id=${encodeURIComponent(id)}`;
    });
  });
}

function boardCardHtml(idea) {
  const paid = idea.paidWaitlistCount || 0;
  const free = idea.freeWaitlistCount || 0;
  const meets = meetsDesignThreshold(paid, free);
  const thumb = (idea.imageDataList && idea.imageDataList[0])
    ? `<div class="board-card-thumb"><img src="${escapeHtml(idea.imageDataList[0])}" alt=""></div>`
    : "";
  return `
    <article class="board-card${idea.isSample ? ' sample-card' : ''}" data-id="${idea.id}">
      <div class="board-card-main">
        <div class="board-card-line">
          ${idea.isSample ? '<span class="badge-sample">예시</span>' : ''}
          ${meets ? '<span class="badge-threshold">설계 진입 ✓</span>' : ''}
        </div>
        <h3 class="board-card-title">${escapeHtml(idea.title)}</h3>
        <p class="board-card-desc">${escapeHtml(truncate(idea.description, 140))}</p>
        <div class="board-card-meta">
          <span class="board-author">
            ${idea.authorPhoto ? `<img src="${escapeHtml(idea.authorPhoto)}" alt="">` : ''}
            ${escapeHtml(idea.authorName || '익명')}
          </span>
          <span class="board-counts">
            <span class="cnt-paid">💎 ${paid}</span>
            <span class="cnt-free">👥 ${free}</span>
            <span class="cnt-like">❤️ ${idea.likeCount || 0}</span>
            <span class="cnt-comment">💬 ${idea.commentCount || 0}</span>
          </span>
        </div>
      </div>
      ${thumb}
    </article>
  `;
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
function truncate(str, n) {
  if (!str) return "";
  return str.length > n ? str.substring(0, n) + "..." : str;
}
function showToast(message, type) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = message;
  container.appendChild(t);
  setTimeout(() => { if (t.parentNode) t.remove(); }, 3000);
}
