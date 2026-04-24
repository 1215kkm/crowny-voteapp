// ========================================
// App Module - DOM, Events, Rendering
// ========================================

import { onAuthChange, getCurrentUser } from "./auth.js";
import {
  subscribeToIdeas,
  addIdea,
  toggleWaitlist,
  getWaitlistMembers,
  checkUserWaitlistBatch,
  subscribeEmail,
  unsubscribeEmail,
  checkSubscription,
  subscribeToTotalWaitlistCount
} from "./firestore.js";
import { isPlaceholder } from "./firebase-config.js";
import { SAMPLE_IDEAS, SAMPLE_MEMBERS, SAMPLE_TOTAL } from "./sample-data.js";

let usingSampleData = false;

// ---- State ----
let currentSort = "createdAt";
let currentIdeas = [];
let userWaitlistMap = {};
let unsubIdeas = null;
let expandedCardId = null;
let pendingSubmit = false;

// ---- DOM Elements ----
const ideasContainer = document.getElementById("ideas-container");
const ideasCount = document.getElementById("ideas-count");
const loadingState = document.getElementById("loading-state");
const emptyState = document.getElementById("empty-state");
const totalWaitlistCount = document.getElementById("total-waitlist-count");

// Auth-related
const loginBtn = document.getElementById("login-btn");
const userInfo = document.getElementById("user-info");
const userPhoto = document.getElementById("user-photo");
const userName = document.getElementById("user-name");
const formLoginPrompt = document.getElementById("form-login-prompt");
const ideaForm = document.getElementById("idea-form");

// Subscribe
const subscribeEmailForm = document.getElementById("subscribe-email-form");
const subscribeCheckboxArea = document.getElementById("subscribe-checkbox-area");
const subscribeEmailDisplay = document.getElementById("subscribe-email-display");
const subscribeCheck = document.getElementById("subscribe-check");
const subscribeSuccess = document.getElementById("subscribe-success");

// Form inputs
const ideaTitle = document.getElementById("idea-title");
const ideaDesc = document.getElementById("idea-desc");
const titleCount = document.getElementById("title-count");
const descCount = document.getElementById("desc-count");
const submitBtn = document.getElementById("submit-btn");

// ---- Initialize ----

// If Firebase is not configured, use sample data immediately
if (isPlaceholder) {
  usingSampleData = true;
  loadingState.classList.add("hidden");
  emptyState.classList.add("hidden");
  loadSampleData();
  // Show form always (no login required to write)
  if (formLoginPrompt) formLoginPrompt.classList.add("hidden");
  ideaForm.classList.remove("hidden");
} else {
  onAuthChange(handleAuthState);
  try {
    subscribeToTotalWaitlistCount((count) => {
      totalWaitlistCount.textContent = count.toLocaleString();
    });
  } catch (e) { /* ignore */ }
  startIdeasSubscription();
  // Fallback timeout
  setTimeout(() => {
    if (currentIdeas.length === 0 && !usingSampleData) {
      loadSampleData();
    }
  }, 3000);
}

// Always show form regardless of login state
if (formLoginPrompt) formLoginPrompt.classList.add("hidden");
ideaForm.classList.remove("hidden");

// Sort controls
document.querySelectorAll(".sort-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const sort = btn.dataset.sort;
    if (sort === currentSort) return;
    currentSort = sort;
    document.querySelectorAll(".sort-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    if (usingSampleData) {
      loadSampleData();
    } else {
      startIdeasSubscription();
    }
  });
});

// Hero typing reaction
const heroEl = document.getElementById("hero");
const heroNeural = document.querySelector(".hero-neural");
let typingTimer = null;

function heroTypingPulse() {
  heroEl.classList.add("typing");
  heroEl.classList.remove("pulse");
  void heroEl.offsetWidth;
  heroEl.classList.add("pulse");

  // Speed up SVG animations during typing
  if (heroNeural) {
    heroNeural.querySelectorAll("animate, animateMotion").forEach((a) => {
      const origDur = a.getAttribute("data-orig-dur") || a.getAttribute("dur");
      if (!a.getAttribute("data-orig-dur")) a.setAttribute("data-orig-dur", origDur);
      const fast = parseFloat(origDur) * 0.3;
      a.setAttribute("dur", fast + "s");
    });
  }

  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    heroEl.classList.remove("typing", "pulse");
    if (heroNeural) {
      heroNeural.querySelectorAll("animate, animateMotion").forEach((a) => {
        const orig = a.getAttribute("data-orig-dur");
        if (orig) a.setAttribute("dur", orig);
      });
    }
  }, 2000);
}

// Form char counts
ideaTitle.addEventListener("input", () => {
  titleCount.textContent = ideaTitle.value.length;
  heroTypingPulse();
});

ideaDesc.addEventListener("input", () => {
  descCount.textContent = ideaDesc.value.length;
  heroTypingPulse();
});

// Form submit
ideaForm.addEventListener("submit", handleSubmit);

// Ideas container - event delegation
ideasContainer.addEventListener("click", handleIdeasClick);

// ---- Auth State Handler ----

async function handleAuthState(user) {
  if (user) {
    loginBtn.classList.add("hidden");
    userInfo.classList.remove("hidden");
    userPhoto.src = user.photoURL || "";
    userPhoto.alt = user.displayName || "";
    userName.textContent = user.displayName || "사용자";

    // Subscribe section
    if (subscribeEmailForm) subscribeEmailForm.classList.add("hidden");
    if (subscribeCheckboxArea) subscribeCheckboxArea.classList.remove("hidden");
    if (subscribeEmailDisplay) subscribeEmailDisplay.textContent = user.email;

    try {
      const isSubscribed = await checkSubscription(user.email);
      subscribeCheck.checked = isSubscribed;
    } catch (e) {
      console.warn("Subscription check failed:", e);
    }

    await updateUserWaitlistStatus();

    // If user just logged in and had pending submit
    if (pendingSubmit) {
      pendingSubmit = false;
      const title = ideaTitle.value.trim();
      const desc = ideaDesc.value.trim();
      if (title && desc) {
        const doSubmit = confirm("글을 남기겠습니까?");
        if (doSubmit) {
          await submitIdea(title, desc, user);
        }
      }
    }
  } else {
    loginBtn.classList.remove("hidden");
    userInfo.classList.add("hidden");

    if (subscribeEmailForm) subscribeEmailForm.classList.remove("hidden");
    if (subscribeCheckboxArea) subscribeCheckboxArea.classList.add("hidden");

    userWaitlistMap = {};
    renderIdeas(currentIdeas);
  }
}

// ---- Sample Data ----

function loadSampleData() {
  usingSampleData = true;
  let ideas = [...SAMPLE_IDEAS];
  if (currentSort === "waitlistCount") {
    ideas.sort((a, b) => b.waitlistCount - a.waitlistCount);
  } else {
    ideas.sort((a, b) => b.createdAt.toDate() - a.createdAt.toDate());
  }
  currentIdeas = ideas;
  loadingState.classList.add("hidden");
  emptyState.classList.add("hidden");
  ideasCount.textContent = ideas.length;
  totalWaitlistCount.textContent = SAMPLE_TOTAL.toLocaleString();
  renderIdeas(ideas);
  setTimeout(loadAllAvatarStacks, 300);
}

// ---- Ideas Subscription ----

function startIdeasSubscription() {
  if (unsubIdeas) unsubIdeas();

  try {
    unsubIdeas = subscribeToIdeas(currentSort, async (ideas) => {
      if (usingSampleData) return;
      const isFirstLoad = currentIdeas.length === 0 && ideas.length > 0;
      const prevIdeas = currentIdeas;
      currentIdeas = ideas;

      loadingState.classList.add("hidden");

      if (ideas.length === 0) {
        loadSampleData();
        return;
      } else {
        emptyState.classList.add("hidden");
      }

      ideasCount.textContent = ideas.length;

      const user = getCurrentUser();
      if (user && ideas.length > 0) {
        await updateUserWaitlistStatus();
      }

      renderIdeas(ideas);

      if (!isFirstLoad && prevIdeas.length > 0) {
        ideas.forEach((idea) => {
          const prev = prevIdeas.find((p) => p.id === idea.id);
          if (prev && idea.waitlistCount > prev.waitlistCount) {
            showToast(`누군가 "${truncate(idea.title, 20)}"에 대기자로 등록했습니다!`, "info");
          }
        });
      }
    });
  } catch (e) {
    console.warn("Firestore subscription failed:", e);
    loadSampleData();
  }
}

async function updateUserWaitlistStatus() {
  const user = getCurrentUser();
  if (!user || currentIdeas.length === 0) return;

  try {
    const ideaIds = currentIdeas.map((i) => i.id);
    userWaitlistMap = await checkUserWaitlistBatch(ideaIds, user.uid);
  } catch (e) {
    console.warn("Waitlist status check failed:", e);
  }
}

// ---- Render Ideas ----

function renderIdeas(ideas) {
  ideasContainer.querySelectorAll(".idea-card").forEach((el) => el.remove());

  ideas.forEach((idea) => {
    const card = createIdeaCard(idea);
    ideasContainer.appendChild(card);
  });
}

function createIdeaCard(idea) {
  const card = document.createElement("article");
  card.className = "idea-card";
  card.dataset.id = idea.id;

  if (expandedCardId === idea.id) {
    card.classList.add("expanded");
  }

  const isHot = idea.waitlistCount >= 10;
  const isLow = idea.waitlistCount < 3 && idea.waitlistCount >= 0;
  const isJoined = userWaitlistMap[idea.id] || false;
  const user = getCurrentUser();
  const progressPercent = Math.min((idea.waitlistCount / 100) * 100, 100);

  card.innerHTML = `
    <div class="idea-header">
      <div class="idea-header-top">
        <h3 class="idea-title">
          ${isHot ? '<span class="badge-popular">HOT</span> ' : ''}
          ${escapeHtml(idea.title)}
        </h3>
        <span class="expand-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </span>
      </div>
      <p class="idea-preview">${escapeHtml(truncate(idea.description, 100))}</p>
      <div class="idea-meta">
        <span class="idea-author">
          ${idea.authorPhoto ? `<img src="${escapeHtml(idea.authorPhoto)}" alt="">` : ''}
          ${escapeHtml(idea.authorName)}
        </span>
        ${isLow && idea.waitlistCount < 3 ? '<span class="badge-closing">참여 부족</span>' : ''}
      </div>
      <div class="waitlist-info">
        <span class="waitlist-count ${isHot ? 'hot' : ''}">
          ${isHot ? '🔥' : '👥'} ${idea.waitlistCount}명 대기 중
        </span>
        <div class="avatar-stack" id="avatar-stack-${idea.id}"></div>
      </div>
    </div>
    <div class="idea-body">
      <div class="idea-body-inner">
        <p class="idea-description">${escapeHtml(idea.description)}</p>

        <div class="progress-section">
          <div class="progress-label">
            <span>목표 100명</span>
            <span>${idea.waitlistCount}명 달성</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${progressPercent}%"></div>
          </div>
        </div>

        ${isLow ? '<div class="card-trigger danger">참여가 부족하면 이 아이디어는 실현되지 않을 수 있습니다.</div>' : ''}
        ${isHot ? '<div class="card-trigger">이 아이디어는 곧 비공개 베타로 출시될 수 있습니다!</div>' : ''}

        <div class="waitlist-members">
          <p class="waitlist-members-title">대기자 명단</p>
          <div class="waitlist-members-list" id="members-${idea.id}">
            <span style="font-size:0.8rem;color:#94a3b8;">로딩 중...</span>
          </div>
        </div>

        <button
          class="btn-join-waitlist ${isJoined ? 'joined' : ''}"
          data-idea-id="${idea.id}"
          ${!user ? 'title="로그인이 필요합니다"' : ''}
        >
          ${isJoined ? '✓ 대기자 등록 완료 (취소하려면 클릭)' : '나도 대기자로 등록하기'}
        </button>
      </div>
    </div>
  `;

  return card;
}

// ---- Event Delegation ----

async function handleIdeasClick(e) {
  const joinBtn = e.target.closest(".btn-join-waitlist");
  if (joinBtn) {
    e.stopPropagation();
    await handleJoinWaitlist(joinBtn);
    return;
  }

  const header = e.target.closest(".idea-header");
  if (header) {
    const card = header.closest(".idea-card");
    toggleAccordion(card);
    return;
  }
}

function toggleAccordion(card) {
  const ideaId = card.dataset.id;
  const body = card.querySelector(".idea-body");
  const wasExpanded = card.classList.contains("expanded");

  ideasContainer.querySelectorAll(".idea-card.expanded").forEach((c) => {
    c.classList.remove("expanded");
    c.querySelector(".idea-body").style.maxHeight = "0";
  });

  if (!wasExpanded) {
    card.classList.add("expanded");
    body.style.maxHeight = body.scrollHeight + "px";
    expandedCardId = ideaId;
    loadWaitlistMembers(ideaId);
    loadAvatarStack(ideaId);
  } else {
    expandedCardId = null;
  }
}

async function loadWaitlistMembers(ideaId) {
  const container = document.getElementById(`members-${ideaId}`);
  if (!container) return;

  try {
    let members;
    if (usingSampleData) {
      members = SAMPLE_MEMBERS[ideaId] || [];
    } else {
      members = await getWaitlistMembers(ideaId);
    }
    if (members.length === 0) {
      container.innerHTML = '<span style="font-size:0.8rem;color:#94a3b8;">아직 대기자가 없습니다</span>';
      return;
    }

    container.innerHTML = members.map((m) => `
      <div class="waitlist-member">
        ${m.photoURL ? `<img src="${escapeHtml(m.photoURL)}" alt="">` : ''}
        <span class="member-name">${escapeHtml(m.displayName || '익명')}</span>
        ${m.type === "paid" ? '<span class="badge-paid">유료 참여</span>' : '<span class="badge-free">무료 참여</span>'}
      </div>
    `).join("");
  } catch (e) {
    container.innerHTML = '<span style="font-size:0.8rem;color:#94a3b8;">명단을 불러올 수 없습니다</span>';
  }
}

async function loadAvatarStack(ideaId) {
  const container = document.getElementById(`avatar-stack-${ideaId}`);
  if (!container) return;

  try {
    let members;
    if (usingSampleData) {
      members = SAMPLE_MEMBERS[ideaId] || [];
    } else {
      members = await getWaitlistMembers(ideaId);
    }
    const displayMembers = members.slice(0, 5);
    const remaining = members.length > 5 ? members.length - 5 : 0;

    container.innerHTML = displayMembers.map((m) =>
      m.photoURL ? `<img src="${escapeHtml(m.photoURL)}" alt="${escapeHtml(m.displayName || '')}">` : ''
    ).join("") + (remaining > 0 ? `<span class="avatar-more">+${remaining}</span>` : '');
  } catch (e) {
    // Silent fail
  }
}

async function loadAllAvatarStacks() {
  for (const idea of currentIdeas) {
    loadAvatarStack(idea.id);
  }
}

// ---- Join Waitlist ----

async function handleJoinWaitlist(btn) {
  const user = getCurrentUser();
  if (!user) {
    showToast("대기자로 등록하려면 로그인이 필요합니다", "info");
    return;
  }

  const ideaId = btn.dataset.ideaId;
  const wasJoined = btn.classList.contains("joined");

  btn.disabled = true;
  if (wasJoined) {
    btn.classList.remove("joined");
    btn.textContent = "나도 대기자로 등록하기";
  } else {
    btn.classList.add("joined");
    btn.textContent = "✓ 대기자 등록 완료 (취소하려면 클릭)";
  }

  try {
    const result = await toggleWaitlist(ideaId, user);
    userWaitlistMap[ideaId] = result.joined;

    if (result.joined) {
      showToast("대기자로 등록되었습니다! 🎉", "success");
    } else {
      showToast("대기자 등록이 취소되었습니다", "");
    }

    if (expandedCardId === ideaId) {
      loadWaitlistMembers(ideaId);
    }
    loadAvatarStack(ideaId);
  } catch (error) {
    console.error("Waitlist toggle error:", error);
    if (wasJoined) {
      btn.classList.add("joined");
      btn.textContent = "✓ 대기자 등록 완료 (취소하려면 클릭)";
    } else {
      btn.classList.remove("joined");
      btn.textContent = "나도 대기자로 등록하기";
    }
    showToast("오류가 발생했습니다. 다시 시도해주세요.", "");
  } finally {
    btn.disabled = false;
  }
}

// ---- Form Submit ----

async function handleSubmit(e) {
  e.preventDefault();

  const title = ideaTitle.value.trim();
  const desc = ideaDesc.value.trim();

  if (title.length < 2) {
    showToast("제목을 2자 이상 입력해주세요", "");
    ideaTitle.focus();
    return;
  }

  if (desc.length < 10) {
    showToast("설명을 10자 이상 입력해주세요", "");
    ideaDesc.focus();
    return;
  }

  const user = getCurrentUser();
  if (!user) {
    pendingSubmit = true;
    showToast("글을 남기려면 로그인이 필요합니다. 로그인 페이지로 이동합니다.", "info");
    setTimeout(() => {
      window.appAuth.loginWithGoogle();
    }, 1000);
    return;
  }

  await submitIdea(title, desc, user);
}

async function submitIdea(title, desc, user) {
  submitBtn.disabled = true;
  submitBtn.textContent = "제출 중...";

  try {
    await addIdea(title, desc, user);
    ideaTitle.value = "";
    ideaDesc.value = "";
    titleCount.textContent = "0";
    descCount.textContent = "0";
    showToast("아이디어가 성공적으로 제안되었습니다! 💡", "success");
  } catch (error) {
    console.error("Submit error:", error);
    showToast("제출에 실패했습니다. 다시 시도해주세요.", "");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "글남기기";
  }
}

// ---- Subscribe ----

async function handleSubscribe() {
  const emailInput = document.getElementById("subscribe-email");
  const email = emailInput.value.trim();

  if (!email || !email.includes("@")) {
    showToast("유효한 이메일 주소를 입력해주세요", "");
    emailInput.focus();
    return;
  }

  try {
    await subscribeEmail(email, "", null);
    emailInput.value = "";
    subscribeSuccess.classList.remove("hidden");
    setTimeout(() => subscribeSuccess.classList.add("hidden"), 3000);
    showToast("구독이 완료되었습니다! 📧", "success");
  } catch (error) {
    console.error("Subscribe error:", error);
    showToast("구독에 실패했습니다. 다시 시도해주세요.", "");
  }
}

async function handleSubscribeToggle(checked) {
  const user = getCurrentUser();
  if (!user || !user.email) return;

  try {
    if (checked) {
      await subscribeEmail(user.email, user.displayName, user.uid);
      showToast("출시 소식 구독이 완료되었습니다! 📧", "success");
    } else {
      await unsubscribeEmail(user.email);
      showToast("구독이 취소되었습니다", "");
    }
  } catch (error) {
    console.error("Subscribe toggle error:", error);
    subscribeCheck.checked = !checked;
    showToast("오류가 발생했습니다. 다시 시도해주세요.", "");
  }
}

// ---- Toast ----

function showToast(message, type) {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, 3000);
}

// ---- Utilities ----

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function truncate(str, maxLen) {
  if (!str) return "";
  return str.length > maxLen ? str.substring(0, maxLen) + "..." : str;
}

// Expose to window for inline handlers
window.app = { handleSubscribe, handleSubscribeToggle };
