// ========================================
// Firestore Module - Ideas, Waitlist, Comments, Likes, Status
// ========================================

import { db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  runTransaction,
  increment,
  limit,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// 사용자가 하루에 쓸 수 있는 최대 글 수
export const DAILY_POST_LIMIT = 2;

// 이미지 첨부 한도
export const MAX_IMAGES = 5;

// 진행 단계 상태값
export const IDEA_STATUS = {
  WAITING: "waiting",       // 대기 중 (모집 중)
  READY: "ready",           // 필요 인원 채움 (설계 진입)
  BUILDING: "building",     // 제작 중
  COMPLETED: "completed",   // 출시 완료
  CANCELLED: "cancelled"    // 취소
};

// 설계 진입 임계값
export const THRESHOLD_PAID_ALONE = 20;
export const THRESHOLD_PAID_MIXED = 10;
export const THRESHOLD_FREE_MIXED = 10;

export function meetsDesignThreshold(paidCount, freeCount) {
  if (paidCount >= THRESHOLD_PAID_ALONE) return true;
  if (paidCount >= THRESHOLD_PAID_MIXED && freeCount >= THRESHOLD_FREE_MIXED) return true;
  return false;
}

// ---- Ideas ----

export function subscribeToIdeas(sortField, callback, statusFilter) {
  const constraints = [orderBy(sortField, "desc"), limit(50)];
  if (statusFilter) {
    constraints.unshift(where("status", "==", statusFilter));
  }
  const q = query(collection(db, "ideas"), ...constraints);

  return onSnapshot(q, (snapshot) => {
    const ideas = [];
    snapshot.forEach((docSnap) => {
      ideas.push({ id: docSnap.id, ...docSnap.data() });
    });
    callback(ideas);
  }, (error) => {
    console.error("Ideas subscription error:", error);
  });
}

export async function getIdea(ideaId) {
  const ref = doc(db, "ideas", ideaId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export function subscribeToIdea(ideaId, callback) {
  const ref = doc(db, "ideas", ideaId);
  return onSnapshot(ref, (snap) => {
    if (snap.exists()) callback({ id: snap.id, ...snap.data() });
    else callback(null);
  });
}

function startOfTodayLocal() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getTodayPostCount(uid) {
  if (!uid) return 0;
  const startTs = Timestamp.fromDate(startOfTodayLocal());
  const q = query(
    collection(db, "ideas"),
    where("authorUid", "==", uid),
    limit(50)
  );
  const snap = await getDocs(q);
  let count = 0;
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    const created = data.createdAt && data.createdAt.toMillis ? data.createdAt.toMillis() : 0;
    if (created >= startTs.toMillis()) count++;
  });
  return count;
}

export async function addIdea(title, description, user, imageDataList) {
  const todayCount = await getTodayPostCount(user.uid);
  if (todayCount >= DAILY_POST_LIMIT) {
    const err = new Error(`하루에 최대 ${DAILY_POST_LIMIT}개까지만 등록할 수 있습니다.`);
    err.code = "daily-limit-exceeded";
    throw err;
  }

  const images = Array.isArray(imageDataList)
    ? imageDataList.filter((s) => typeof s === "string" && s.length > 0).slice(0, MAX_IMAGES)
    : [];

  const payload = {
    title,
    description,
    authorUid: user.uid,
    authorName: user.displayName || "익명",
    authorPhoto: user.photoURL || "",
    waitlistCount: 0,           // 호환을 위해 유지
    paidWaitlistCount: 0,
    freeWaitlistCount: 0,
    likeCount: 0,
    commentCount: 0,
    status: IDEA_STATUS.WAITING,
    createdAt: serverTimestamp()
  };

  if (images.length > 0) {
    payload.imageDataList = images;
  }

  const docRef = await addDoc(collection(db, "ideas"), payload);
  return docRef.id;
}

// 작성자만 자신의 글 상태 변경
export async function updateIdeaStatus(ideaId, newStatus) {
  const ref = doc(db, "ideas", ideaId);
  await updateDoc(ref, { status: newStatus });
}

// ---- Waitlist (free / paid) ----

export async function toggleWaitlist(ideaId, user, tier) {
  if (tier !== "paid" && tier !== "free") tier = "free";

  const ideaRef = doc(db, "ideas", ideaId);
  const waitlistRef = doc(db, "ideas", ideaId, "waitlist", user.uid);

  const result = await runTransaction(db, async (transaction) => {
    const waitlistDoc = await transaction.get(waitlistRef);

    if (waitlistDoc.exists()) {
      const prevTier = waitlistDoc.data().tier === "paid" ? "paid" : "free";
      if (prevTier === tier) {
        // 같은 티어 다시 누름 → 탈퇴
        transaction.delete(waitlistRef);
        const updates = { waitlistCount: increment(-1) };
        if (prevTier === "paid") updates.paidWaitlistCount = increment(-1);
        else updates.freeWaitlistCount = increment(-1);
        transaction.update(ideaRef, updates);
        return { joined: false, tier: null };
      } else {
        // 티어 전환
        transaction.update(waitlistRef, { tier, switchedAt: serverTimestamp() });
        const updates = {};
        if (prevTier === "paid") {
          updates.paidWaitlistCount = increment(-1);
          updates.freeWaitlistCount = increment(1);
        } else {
          updates.freeWaitlistCount = increment(-1);
          updates.paidWaitlistCount = increment(1);
        }
        transaction.update(ideaRef, updates);
        return { joined: true, tier, switched: true };
      }
    } else {
      // 신규 가입
      transaction.set(waitlistRef, {
        displayName: user.displayName || "익명",
        email: user.email || "",
        photoURL: user.photoURL || "",
        tier,
        joinedAt: serverTimestamp()
      });
      const updates = { waitlistCount: increment(1) };
      if (tier === "paid") updates.paidWaitlistCount = increment(1);
      else updates.freeWaitlistCount = increment(1);
      transaction.update(ideaRef, updates);
      return { joined: true, tier, switched: false };
    }
  });

  if (result.joined && !result.switched && user.email) {
    await sendWelcomeEmail(user.email, user.displayName, ideaId);
  }

  return result;
}

export async function getWaitlistMembers(ideaId) {
  const q = query(
    collection(db, "ideas", ideaId, "waitlist"),
    orderBy("joinedAt", "desc"),
    limit(50)
  );
  const snapshot = await getDocs(q);
  const members = [];
  snapshot.forEach((docSnap) => {
    members.push({ uid: docSnap.id, ...docSnap.data() });
  });
  return members;
}

export async function checkUserWaitlist(ideaId, uid) {
  const ref = doc(db, "ideas", ideaId, "waitlist", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data().tier === "paid" ? "paid" : "free";
}

export async function checkUserWaitlistBatch(ideaIds, uid) {
  const results = {};
  const checks = ideaIds.map(async (ideaId) => {
    results[ideaId] = await checkUserWaitlist(ideaId, uid);
  });
  await Promise.all(checks);
  return results;
}

// ---- Comments ----

export async function addComment(ideaId, user, text, parentId) {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("댓글 내용을 입력해주세요");
  if (trimmed.length > 1000) throw new Error("댓글은 1000자까지 작성할 수 있어요");

  const data = {
    authorUid: user.uid,
    authorName: user.displayName || "익명",
    authorPhoto: user.photoURL || "",
    text: trimmed,
    parentId: parentId || null,
    createdAt: serverTimestamp()
  };

  const ref = await addDoc(collection(db, "ideas", ideaId, "comments"), data);

  // 카운트 증가
  try {
    await updateDoc(doc(db, "ideas", ideaId), { commentCount: increment(1) });
  } catch (e) { /* permission 무시 가능 */ }

  return ref.id;
}

export function subscribeToComments(ideaId, callback) {
  const q = query(
    collection(db, "ideas", ideaId, "comments"),
    orderBy("createdAt", "asc"),
    limit(200)
  );
  return onSnapshot(q, (snap) => {
    const list = [];
    snap.forEach((docSnap) => list.push({ id: docSnap.id, ...docSnap.data() }));
    callback(list);
  });
}

export async function deleteComment(ideaId, commentId) {
  await deleteDoc(doc(db, "ideas", ideaId, "comments", commentId));
  try {
    await updateDoc(doc(db, "ideas", ideaId), { commentCount: increment(-1) });
  } catch (e) { /* ignore */ }
}

// ---- Likes (관심) ----

export async function toggleLike(ideaId, user) {
  const likeRef = doc(db, "ideas", ideaId, "likes", user.uid);
  const ideaRef = doc(db, "ideas", ideaId);

  return await runTransaction(db, async (transaction) => {
    const likeDoc = await transaction.get(likeRef);
    if (likeDoc.exists()) {
      transaction.delete(likeRef);
      transaction.update(ideaRef, { likeCount: increment(-1) });
      return { liked: false };
    } else {
      transaction.set(likeRef, {
        uid: user.uid,
        displayName: user.displayName || "익명",
        likedAt: serverTimestamp()
      });
      transaction.update(ideaRef, { likeCount: increment(1) });
      return { liked: true };
    }
  });
}

export async function checkUserLike(ideaId, uid) {
  const snap = await getDoc(doc(db, "ideas", ideaId, "likes", uid));
  return snap.exists();
}

export async function checkUserLikeBatch(ideaIds, uid) {
  const results = {};
  const checks = ideaIds.map(async (id) => {
    results[id] = await checkUserLike(id, uid);
  });
  await Promise.all(checks);
  return results;
}

// 사용자가 관심 등록한 모든 아이디어 ID (그리고 관련 idea 정보)
export async function getUserLikedIdeas(uid) {
  // 콜렉션 그룹 쿼리 사용
  const { collectionGroup } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
  const cg = collectionGroup(db, "likes");
  const q = query(cg, where("uid", "==", uid), limit(100));
  const snap = await getDocs(q);
  const ideaIds = [];
  snap.forEach((docSnap) => {
    // 부모 경로: ideas/{ideaId}/likes/{uid}
    const parts = docSnap.ref.path.split("/");
    const ideaId = parts[1];
    ideaIds.push(ideaId);
  });
  // idea 데이터 가져오기
  const ideas = [];
  await Promise.all(ideaIds.map(async (id) => {
    const ideaSnap = await getDoc(doc(db, "ideas", id));
    if (ideaSnap.exists()) {
      ideas.push({ id, ...ideaSnap.data() });
    }
  }));
  return ideas;
}

// ---- Subscribers ----

export async function subscribeEmail(email, displayName, uid) {
  const subscriberRef = doc(db, "subscribers", email);
  await setDoc(subscriberRef, {
    email,
    displayName: displayName || "",
    uid: uid || null,
    subscribedAt: serverTimestamp(),
    interests: []
  }, { merge: true });
}

export async function unsubscribeEmail(email) {
  const subscriberRef = doc(db, "subscribers", email);
  await deleteDoc(subscriberRef);
}

export async function checkSubscription(email) {
  const subscriberRef = doc(db, "subscribers", email);
  const subscriberDoc = await getDoc(subscriberRef);
  return subscriberDoc.exists();
}

// ---- Email ----

async function sendWelcomeEmail(toEmail, displayName, ideaId) {
  try {
    await addDoc(collection(db, "mail"), {
      to: toEmail,
      message: {
        subject: "[Crowny] 대기자 등록이 완료되었습니다!",
        html: `
          <div style="font-family: 'Noto Sans KR', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <h2 style="color: #1e293b;">안녕하세요, ${displayName || '회원'}님!</h2>
            <p style="color: #64748b; line-height: 1.7;">
              대기자 명단에 성공적으로 등록되었습니다.<br>
              비공개 베타 출시 시 가장 먼저 초대해 드리겠습니다.
            </p>
            <p style="color: #94a3b8; font-size: 0.8rem;">&copy; 2026 Crowny. All rights reserved.</p>
          </div>
        `
      },
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.warn("Welcome email trigger failed:", error);
  }
}

// ---- Total Waitlist Count ----

export function subscribeToTotalWaitlistCount(callback) {
  const q = query(collection(db, "ideas"));
  return onSnapshot(q, (snapshot) => {
    let total = 0;
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      total += data.waitlistCount || 0;
    });
    callback(total);
  });
}
