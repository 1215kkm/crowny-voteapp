// ========================================
// App Module - Main Page (메인 목록 + 글쓰기)
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
  DAILY_POST_LIMIT,
  MAX_IMAGES,
  THRESHOLD_PAID_ALONE,
  THRESHOLD_PAID_MIXED,
  THRESHOLD_FREE_MIXED,
  meetsDesignThreshold
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
let pendingImages = []; // [{ dataUrl, sizeKb }]

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

// 관심 아이디어 모달
const favBtn = document.getElementById("favorites-btn");
const favModal = document.getElementById("favorites-modal");
const favModalClose = document.getElementById("favorites-modal-close");
const favModalList = document.getElementById("favorites-list");

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

function eqBounce() {
  eqBars.forEach((bar) => { bar.style.height = (6 + Math.random() * 34) + "px"; });
}
function eqIdle() {
  eqBars.forEach((bar) => { bar.style.height = "4px"; });
}
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
      const origDur = a.getAttribute("data-orig-dur") || a.getAttribute("dur");
      if (!a.getAttribute("data-orig-dur")) a.setAttribute("data-orig-dur", origDur);
      a.setAttribute("dur", (parseFloat(origDur) * 0.3) + "s");
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
        const orig = a.getAttribute("data-orig-dur");
        if (orig) a.setAttribute("dur", orig);
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
if (imageInput) {
  imageInput.addEventListener("change", handleImageSelect);
}

ideaForm.addEventListener("submit", handleSubmit);
ideasContainer.addEventListener("click", handleIdeasClick);

// ---- 관심 모달 ----
if (favBtn) {
  favBtn.addEventListener("click", openFavoritesModal);
}
if (favModalClose) {
  favModalClose.addEventListener("click", closeFavoritesModal);
}
if (favModal) {
  favModal.addEventListener("click", (e) => {
    if (e.target === favModal) closeFavoritesModal();
  });
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
      const title = ideaTitle.value.trim();
      const desc = ideaDesc.value.trim();
      if (title && desc) {
        if (confirm("글을 남기겠습니까?")) await submitIdea(title, desc, user);
      }
    }
  } else {
    loginBtn.classList.remove("hidden");
    userInfo.classList.add("hidden");
    if (subscribeEmailForm) subscribeEmailForm.classList.remove("hidden");
    if (subscribeCheckboxArea) subscribeCheckboxArea.classList.add("hidden");
    userWaitlistMap = {};
    userLikeMap = {};
    if (dailyLimitInfo) {
      dailyLimitInfo.textContent = `하루에 최대 ${DAILY_POST_LIMIT}개까지 등록할 수 있어요. 로그인 후 글을 작성하세요.`;
    }
    renderAll();
  }
}

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

// ---- Subscription ----

function startIdeasSubscription() {
  if (unsubIdeas) unsubIdeas();
  try {
    unsubIdeas = subscribeToIdeas(currentSort, async (ideas) => {
      currentRealIdeas = ideas;
      loadingState.classList.add("hidden");
      emptyState.classList.add("hidden");
      const user = getCurrentUser();
      if (user && ideas.length > 0) await updateUserStatusMaps();
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
    userWaitlistMap = wl;
    userLikeMap = lk;
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
  const total = idea.waitlistCount || (paid + free);
  const isJoinedTier = userWaitlistMap[idea.id] || null; // 'paid' | 'free' | null
  const isLiked = userLikeMap[idea.id] === true;
  const status = statusLabel(idea.status || "waiting");
  const meetsThreshold = meetsDesignThreshold(paid, free);

  const thumb = (idea.imageDataList && idea.imageDataList[0])
    ? `<div class="card-thumb"><img src="${escapeHtml(idea.imageDataList[0])}" alt=""></div>`
    : "";
  const moreBadge = idea.imageDataList && idea.imageDataList.length > 1
    ? `<span class="card-thumb-more">+${idea.imageDataList.length - 1}</span>`
    : "";

  card.innerHTML = `
    <div class="card-row">
      <div class="card-main">
        <div class="card-line-top">
          <span class="status-badge ${status.cls}">${status.txt}</span>
          ${idea.isSample ? '<span class="badge-sample">예시</span>' : ''}
          ${isHot ? '<span class="badge-popular">HOT</span>' : ''}
          ${meetsThreshold ? '<span class="badge-threshold">설계 진입 ✓</span>' : ''}
        </div>
        <h3 class="idea-title">${escapeHtml(idea.title)}</h3>
        <p class="idea-preview">${escapeHtml(truncate(idea.description, 100))}</p>
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
          <button class="btn-mini btn-detail" data-action="detail" data-idea-id="${idea.id}">댓글·상세</button>
        </div>
      </div>
      ${thumb ? `<div class="card-thumbs">${thumb}${moreBadge}</div>` : ''}
    </div>
  `;
  return card;
}

// ---- Click handler ----

async function handleIdeasClick(e) {
  const btn = e.target.closest(".btn-mini");
  if (btn) {
    e.stopPropagation();
    const action = btn.dataset.action;
    const ideaId = btn.dataset.ideaId;
    if (action === "paid" || action === "free") {
      await onWaitlistClick(btn, ideaId, action);
    } else if (action === "like") {
      await onLikeClick(btn, ideaId);
    } else if (action === "share") {
      await onShareClick(ideaId);
    } else if (action === "detail") {
      goToIdeaDetail(ideaId);
    }
    return;
  }

  // 카드 영역 다른 곳 (썸네일·본문) 클릭 → 상세로 이동
  const card = e.target.closest(".idea-card");
  if (card) {
    goToIdeaDetail(card.dataset.id);
  }
}

function goToIdeaDetail(ideaId) {
  if (String(ideaId).startsWith("sample_")) {
    showToast("이 아이디어는 예시입니다. 실제 글에서만 상세 페이지가 동작합니다.", "info");
    return;
  }
  window.location.href = `idea.html?id=${encodeURIComponent(ideaId)}`;
}

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
  const url = `${window.location.origin}/idea.html?id=${encodeURIComponent(ideaId)}`;
  try {
    await navigator.clipboard.writeText(url);
    showToast("주소가 복사되었어요. 다른 곳에 붙여넣기 해주세요.", "success");
  } catch (e) {
    // 폴백: prompt
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
      showToast("이미지가 너무 큽니다 (최대 20MB)", "");
      continue;
    }
    try {
      let dataUrl = await resizeImageToDataUrl(file, MAX_IMAGE_WIDTH, IMAGE_JPEG_QUALITY);
      if (dataUrl.length > MAX_IMAGE_BYTES) {
        dataUrl = await resizeImageToDataUrl(file, MAX_IMAGE_WIDTH, 0.6);
      }
      if (dataUrl.length > MAX_IMAGE_BYTES) {
        showToast(`'${file.name}' 이미지 용량이 너무 커요. 다른 이미지를 시도해주세요.`, "");
        continue;
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
    btn.addEventListener("click", (e) => {
      const idx = parseInt(btn.dataset.idx, 10);
      pendingImages.splice(idx, 1);
      renderImagePreviews();
    });
  });
  if (imageAddBtn) {
    const remaining = MAX_IMAGES - pendingImages.length;
    imageAddBtn.title = remaining > 0 ? `이미지 첨부 (${pendingImages.length}/${MAX_IMAGES})` : "더 이상 추가할 수 없어요";
    imageAddBtn.classList.toggle("disabled", remaining <= 0);
  }
}

function clearImagePreviews() {
  pendingImages = [];
  renderImagePreviews();
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
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
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
    const todayCount = await getTodayPostCount(user.uid);
    if (todayCount >= DAILY_POST_LIMIT) {
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
      showToast(error.message, "");
      await refreshDailyLimitInfo();
    } else {
      showToast("제출에 실패했어요. 다시 시도해주세요.", "");
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
    showToast("유효한 이메일 주소를 입력해주세요", ""); emailInput.focus(); return;
  }
  try {
    await subscribeEmail(email, "", null);
    emailInput.value = "";
    subscribeSuccess.classList.remove("hidden");
    setTimeout(() => subscribeSuccess.classList.add("hidden"), 3000);
    showToast("구독이 완료되었어요! 📧", "success");
  } catch (error) {
    showToast("구독에 실패했어요.", "");
  }
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

// ---- 관심 아이디어 모달 ----

async function openFavoritesModal() {
  if (!favModal) return;
  const user = getCurrentUser();
  if (!user) {
    showToast("로그인 후 사용할 수 있어요", "info");
    return;
  }
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
            <div class="fav-item-row">
              <span class="status-badge ${sl.cls}">${sl.txt}</span>
              <strong>${escapeHtml(i.title)}</strong>
            </div>
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
        } catch (e) {
          showToast("해제에 실패했어요.", "");
        } finally {
          btn.disabled = false;
        }
      });
    });
  } catch (e) {
    console.error(e);
    favModalList.innerHTML = '<p style="color:#ef4444;text-align:center;padding:20px;">불러오기에 실패했어요.</p>';
  }
}

function closeFavoritesModal() {
  if (favModal) favModal.classList.add("hidden");
}

// ---- Toast ----

function showToast(message, type) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3000);
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

window.app = { handleSubscribe, handleSubscribeToggle };
