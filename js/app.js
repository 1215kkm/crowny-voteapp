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
  subscribeToTotalWaitlistCount,
  getTodayPostCount,
  DAILY_POST_LIMIT
} from "./firestore.js";
import { isPlaceholder } from "./firebase-config.js";
import { SAMPLE_IDEAS, SAMPLE_MEMBERS, SAMPLE_TOTAL } from "./sample-data.js";

// Firebase 사용 여부 (true면 firestore에서 실시간 구독)
let firebaseAvailable = !isPlaceholder;

// ---- 이미지 리사이즈 설정 ----
const MAX_IMAGE_WIDTH = 1400;
const IMAGE_JPEG_QUALITY = 0.8;
const MAX_IMAGE_BYTES = 900 * 1024; // base64 기준 900KB 상한 (Firestore 1MB 문서 한계 고려)

// ---- State ----
let currentSort = "createdAt";
let currentRealIdeas = []; // 실제 Firestore 아이디어
let userWaitlistMap = {};
let unsubIdeas = null;
let expandedCardId = null;
let pendingSubmit = false;
let pendingImageData = null; // 첨부된 (리사이즈 된) 이미지 base64

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
const ideaImageInput = document.getElementById("idea-image");
const imagePreview = document.getElementById("image-preview");
const imagePreviewImg = document.getElementById("image-preview-img");
const imagePreviewInfo = document.getElementById("image-preview-info");
const imageRemoveBtn = document.getElementById("image-remove-btn");
const dailyLimitInfo = document.getElementById("daily-limit-info");

// ---- Initialize ----

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
      // 실제 대기자 수 + 샘플 대기자 수
      totalWaitlistCount.textContent = (count + SAMPLE_TOTAL).toLocaleString();
    });
  } catch (e) { /* ignore */ }
  startIdeasSubscription();
  // Fallback: 3초 안에 실제 데이터가 안 와도 샘플 + 빈 실제 리스트로 렌더
  setTimeout(() => {
    if (currentRealIdeas.length === 0) {
      loadingState.classList.add("hidden");
      renderAll();
    }
  }, 3000);
}

// 폼은 항상 표시
if (formLoginPrompt) formLoginPrompt.classList.add("hidden");
ideaForm.classList.remove("hidden");

// ---- Sort 컨트롤 ----
document.querySelectorAll(".sort-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const sort = btn.dataset.sort;
    if (sort === currentSort) return;
    currentSort = sort;
    document.querySelectorAll(".sort-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    if (firebaseAvailable) {
      startIdeasSubscription();
    }
    renderAll();
  });
});

// ---- Hero typing reaction + equalizer ----
const heroEl = document.getElementById("hero");
const heroNeural = document.querySelector(".hero-neural");
const equalizer = document.getElementById("equalizer");
const eqBars = equalizer ? [...equalizer.querySelectorAll(".eq-bar")] : [];
let typingTimer = null;
let eqInterval = null;

function eqBounce() {
  eqBars.forEach((bar) => {
    const h = 6 + Math.random() * 34;
    bar.style.height = h + "px";
  });
}

function eqIdle() {
  eqBars.forEach((bar) => {
    bar.style.height = "4px";
  });
}

function heroTypingPulse() {
  heroEl.classList.add("typing");

  if (equalizer) {
    equalizer.classList.add("active");
    eqBounce();
    if (!eqInterval) {
      eqInterval = setInterval(eqBounce, 180);
    }
  }

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
    heroEl.classList.remove("typing");
    if (equalizer) {
      equalizer.classList.remove("active");
      clearInterval(eqInterval);
      eqInterval = null;
      eqIdle();
    }
    if (heroNeural) {
      heroNeural.querySelectorAll("animate, animateMotion").forEach((a) => {
        const orig = a.getAttribute("data-orig-dur");
        if (orig) a.setAttribute("dur", orig);
      });
    }
  }, 500);
}

// ---- Form 입력 ----
ideaTitle.addEventListener("input", () => {
  titleCount.textContent = ideaTitle.value.length;
  heroTypingPulse();
});

ideaDesc.addEventListener("input", () => {
  descCount.textContent = ideaDesc.value.length;
  heroTypingPulse();
});

// 이미지 첨부
if (ideaImageInput) {
  ideaImageInput.addEventListener("change", handleImageSelect);
}
if (imageRemoveBtn) {
  imageRemoveBtn.addEventListener("click", clearImagePreview);
}

ideaForm.addEventListener("submit", handleSubmit);
ideasContainer.addEventListener("click", handleIdeasClick);

// ---- Auth State ----

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
    } catch (e) {
      console.warn("Subscription check failed:", e);
    }

    await updateUserWaitlistStatus();
    await refreshDailyLimitInfo();

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
    if (dailyLimitInfo) {
      dailyLimitInfo.textContent = `하루에 최대 ${DAILY_POST_LIMIT}개까지 등록할 수 있어요. 로그인 후 글을 작성하세요.`;
    }
    renderAll();
  }
}

// ---- 일일 글 제한 표시 ----
async function refreshDailyLimitInfo() {
  if (!dailyLimitInfo) return;
  const user = getCurrentUser();
  if (!user) {
    dailyLimitInfo.textContent = `하루에 최대 ${DAILY_POST_LIMIT}개까지 등록할 수 있어요.`;
    return;
  }
  try {
    const count = await getTodayPostCount(user.uid);
    const remaining = Math.max(0, DAILY_POST_LIMIT - count);
    dailyLimitInfo.textContent = `오늘 작성 ${count}/${DAILY_POST_LIMIT}건 (남은 ${remaining}건) · 하루 최대 ${DAILY_POST_LIMIT}개`;
    dailyLimitInfo.classList.toggle("limit-reached", remaining === 0);
  } catch (e) {
    dailyLimitInfo.textContent = `하루에 최대 ${DAILY_POST_LIMIT}개까지 등록할 수 있어요.`;
  }
}

// ---- Ideas Subscription ----

function startIdeasSubscription() {
  if (unsubIdeas) unsubIdeas();

  try {
    unsubIdeas = subscribeToIdeas(currentSort, async (ideas) => {
      const isFirstLoad = currentRealIdeas.length === 0 && ideas.length > 0;
      const prevIdeas = currentRealIdeas;
      currentRealIdeas = ideas;

      loadingState.classList.add("hidden");
      emptyState.classList.add("hidden");

      const user = getCurrentUser();
      if (user && ideas.length > 0) {
        await updateUserWaitlistStatus();
      }

      renderAll();

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
    renderAll();
  }
}

async function updateUserWaitlistStatus() {
  const user = getCurrentUser();
  if (!user || currentRealIdeas.length === 0) return;

  try {
    const ideaIds = currentRealIdeas.map((i) => i.id);
    userWaitlistMap = await checkUserWaitlistBatch(ideaIds, user.uid);
  } catch (e) {
    console.warn("Waitlist status check failed:", e);
  }
}

// ---- 합쳐서 정렬 ----
function getMergedIdeas() {
  // 실제 아이디어를 우선, 그 뒤에 샘플
  const samples = SAMPLE_IDEAS.map((s) => ({ ...s, isSample: true }));
  const reals = currentRealIdeas.map((r) => ({ ...r, isSample: false }));

  const merged = [...reals, ...samples];

  if (currentSort === "waitlistCount") {
    merged.sort((a, b) => (b.waitlistCount || 0) - (a.waitlistCount || 0));
  } else {
    // createdAt 정렬 - 실제 데이터의 createdAt은 Firestore Timestamp, 샘플은 toDate() 객체
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
  if (ideas.length === 0) {
    emptyState.classList.remove("hidden");
  } else {
    emptyState.classList.add("hidden");
  }
  renderIdeas(ideas);
  setTimeout(loadAllAvatarStacks, 300);
}

function renderIdeas(ideas) {
  ideasContainer.querySelectorAll(".idea-card").forEach((el) => el.remove());

  ideas.forEach((idea) => {
    const card = createIdeaCard(idea);
    ideasContainer.appendChild(card);
  });
}

function createIdeaCard(idea) {
  const card = document.createElement("article");
  card.className = "idea-card" + (idea.isSample ? " sample-card" : "");
  card.dataset.id = idea.id;
  card.dataset.sample = idea.isSample ? "1" : "0";

  if (expandedCardId === idea.id) {
    card.classList.add("expanded");
  }

  const isHot = idea.waitlistCount >= 10;
  const isLow = idea.waitlistCount < 3 && idea.waitlistCount >= 0;
  const isJoined = userWaitlistMap[idea.id] || false;
  const user = getCurrentUser();
  const progressPercent = Math.min((idea.waitlistCount / 100) * 100, 100);

  const imageHtml = idea.imageData
    ? `<div class="idea-image-wrap"><img class="idea-image" src="${escapeHtml(idea.imageData)}" alt="" loading="lazy"></div>`
    : "";

  card.innerHTML = `
    <div class="idea-header">
      <div class="idea-header-top">
        <h3 class="idea-title">
          ${isHot ? '<span class="badge-popular">HOT</span> ' : ''}
          ${idea.isSample ? '<span class="badge-sample">예시</span> ' : ''}
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
        ${imageHtml}
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
    loadWaitlistMembers(ideaId, card.dataset.sample === "1");
    loadAvatarStack(ideaId, card.dataset.sample === "1");
  } else {
    expandedCardId = null;
  }
}

async function loadWaitlistMembers(ideaId, isSample) {
  const container = document.getElementById(`members-${ideaId}`);
  if (!container) return;

  try {
    let members;
    if (isSample) {
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

async function loadAvatarStack(ideaId, isSample) {
  const container = document.getElementById(`avatar-stack-${ideaId}`);
  if (!container) return;

  try {
    let members;
    if (isSample) {
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
  const cards = ideasContainer.querySelectorAll(".idea-card");
  cards.forEach((card) => {
    loadAvatarStack(card.dataset.id, card.dataset.sample === "1");
  });
}

// ---- Join Waitlist ----

async function handleJoinWaitlist(btn) {
  const card = btn.closest(".idea-card");
  const isSampleCard = card && card.dataset.sample === "1";

  if (isSampleCard) {
    showToast("이 아이디어는 예시입니다. 실제 등록은 사용자가 작성한 글에서만 가능합니다.", "info");
    return;
  }

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
      loadWaitlistMembers(ideaId, false);
    }
    loadAvatarStack(ideaId, false);
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

// ---- 이미지 첨부 처리 ----

async function handleImageSelect(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showToast("이미지 파일만 첨부할 수 있습니다", "");
    ideaImageInput.value = "";
    return;
  }

  // 원본 너무 큰 파일은 사전 차단 (20MB 초과)
  if (file.size > 20 * 1024 * 1024) {
    showToast("이미지가 너무 큽니다 (최대 20MB)", "");
    ideaImageInput.value = "";
    return;
  }

  try {
    const dataUrl = await resizeImageToDataUrl(file, MAX_IMAGE_WIDTH, IMAGE_JPEG_QUALITY);
    if (dataUrl.length > MAX_IMAGE_BYTES) {
      // 더 큰 압축 시도
      const dataUrl2 = await resizeImageToDataUrl(file, MAX_IMAGE_WIDTH, 0.6);
      if (dataUrl2.length > MAX_IMAGE_BYTES) {
        showToast("이미지 용량이 너무 큽니다. 다른 이미지를 선택해주세요.", "");
        ideaImageInput.value = "";
        return;
      }
      pendingImageData = dataUrl2;
    } else {
      pendingImageData = dataUrl;
    }
    showImagePreview(pendingImageData);
  } catch (err) {
    console.error("Image resize error:", err);
    showToast("이미지를 처리할 수 없습니다.", "");
    ideaImageInput.value = "";
  }
}

function showImagePreview(dataUrl) {
  if (!imagePreview) return;
  imagePreview.classList.remove("hidden");
  imagePreviewImg.src = dataUrl;
  // 대략적 사이즈 표시 (base64 length * 3/4 ≈ 바이트)
  const approxBytes = Math.round((dataUrl.length * 3) / 4);
  const kb = Math.round(approxBytes / 1024);
  imagePreviewInfo.textContent = `최대 폭 ${MAX_IMAGE_WIDTH}px로 자동 조정됨 · 약 ${kb}KB`;
}

function clearImagePreview() {
  pendingImageData = null;
  if (ideaImageInput) ideaImageInput.value = "";
  if (imagePreview) imagePreview.classList.add("hidden");
  if (imagePreviewImg) imagePreviewImg.src = "";
  if (imagePreviewInfo) imagePreviewInfo.textContent = "";
}

function resizeImageToDataUrl(file, maxWidth, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode failed"));
      img.onload = () => {
        const ratio = img.width > maxWidth ? maxWidth / img.width : 1;
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        // 흰 바탕 (PNG 투명 배경 → JPEG 변환 시 검정 방지)
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(dataUrl);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
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

  // 일일 제한 사전 체크 (UI 빠른 피드백)
  try {
    const todayCount = await getTodayPostCount(user.uid);
    if (todayCount >= DAILY_POST_LIMIT) {
      showToast(`하루에 최대 ${DAILY_POST_LIMIT}개까지만 등록할 수 있어요. 내일 다시 시도해주세요.`, "");
      await refreshDailyLimitInfo();
      return;
    }
  } catch (e) {
    console.warn("daily limit check failed:", e);
  }

  await submitIdea(title, desc, user);
}

async function submitIdea(title, desc, user) {
  submitBtn.disabled = true;
  submitBtn.textContent = "제출 중...";

  try {
    await addIdea(title, desc, user, pendingImageData);
    ideaTitle.value = "";
    ideaDesc.value = "";
    titleCount.textContent = "0";
    descCount.textContent = "0";
    clearImagePreview();
    showToast("아이디어가 성공적으로 제안되었습니다! 💡", "success");
    await refreshDailyLimitInfo();
  } catch (error) {
    console.error("Submit error:", error);
    if (error && error.code === "daily-limit-exceeded") {
      showToast(error.message, "");
      await refreshDailyLimitInfo();
    } else {
      showToast("제출에 실패했습니다. 다시 시도해주세요.", "");
    }
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
