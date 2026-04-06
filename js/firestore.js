// ========================================
// Firestore Module - Ideas, Waitlist, Subscriptions, Email
// ========================================

import { db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  runTransaction,
  increment,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ---- Ideas ----

export function subscribeToIdeas(sortField, callback) {
  const q = query(
    collection(db, "ideas"),
    orderBy(sortField, "desc"),
    limit(50)
  );

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

export async function addIdea(title, description, user) {
  const docRef = await addDoc(collection(db, "ideas"), {
    title,
    description,
    authorUid: user.uid,
    authorName: user.displayName || "익명",
    authorPhoto: user.photoURL || "",
    waitlistCount: 0,
    createdAt: serverTimestamp()
  });
  return docRef.id;
}

// ---- Waitlist ----

export async function toggleWaitlist(ideaId, user) {
  const ideaRef = doc(db, "ideas", ideaId);
  const waitlistRef = doc(db, "ideas", ideaId, "waitlist", user.uid);

  const result = await runTransaction(db, async (transaction) => {
    const waitlistDoc = await transaction.get(waitlistRef);

    if (waitlistDoc.exists()) {
      // Remove from waitlist
      transaction.delete(waitlistRef);
      transaction.update(ideaRef, { waitlistCount: increment(-1) });
      return { joined: false };
    } else {
      // Add to waitlist
      transaction.set(waitlistRef, {
        displayName: user.displayName || "익명",
        email: user.email || "",
        photoURL: user.photoURL || "",
        joinedAt: serverTimestamp()
      });
      transaction.update(ideaRef, { waitlistCount: increment(1) });
      return { joined: true };
    }
  });

  // Send welcome email if joined
  if (result.joined && user.email) {
    await sendWelcomeEmail(user.email, user.displayName, ideaId);
  }

  return result;
}

export async function getWaitlistMembers(ideaId) {
  const q = query(
    collection(db, "ideas", ideaId, "waitlist"),
    orderBy("joinedAt", "desc"),
    limit(20)
  );
  const snapshot = await getDocs(q);
  const members = [];
  snapshot.forEach((docSnap) => {
    members.push({ uid: docSnap.id, ...docSnap.data() });
  });
  return members;
}

export async function checkUserWaitlist(ideaId, uid) {
  const waitlistRef = doc(db, "ideas", ideaId, "waitlist", uid);
  const waitlistDoc = await getDoc(waitlistRef);
  return waitlistDoc.exists();
}

export async function checkUserWaitlistBatch(ideaIds, uid) {
  const results = {};
  const checks = ideaIds.map(async (ideaId) => {
    results[ideaId] = await checkUserWaitlist(ideaId, uid);
  });
  await Promise.all(checks);
  return results;
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

// ---- Email (Trigger Email Extension) ----

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
            <div style="margin: 30px 0; padding: 20px; background: #f8fafc; border-radius: 12px; text-align: center;">
              <p style="color: #6366f1; font-weight: 600; font-size: 1.1rem;">
                대기자에게만 우선 초대됩니다
              </p>
              <p style="color: #94a3b8; font-size: 0.9rem;">
                출시 4주 전, 대기자에게만 먼저 알려드립니다.
              </p>
            </div>
            <p style="color: #94a3b8; font-size: 0.8rem;">
              &copy; 2026 Crowny. All rights reserved.
            </p>
          </div>
        `
      },
      createdAt: serverTimestamp()
    });
  } catch (error) {
    // Email sending is non-critical, don't break the flow
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
