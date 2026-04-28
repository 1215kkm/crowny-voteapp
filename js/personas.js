// ========================================
// Personas - 가상 인물 풀 (이름/나이/성격/말투/직업)
// ========================================
//
// firestore /personas/{personaId} 에 저장.
// 관리자가 직접 추가 가능하고, 처음에 3명 기본으로 자동 시드.
// AI 댓글·글 생성 시 선택된 인물의 말투·성격대로 작성됨.

import { db } from "./firebase-config.js";
import {
  collection, addDoc, doc, getDoc, getDocs, setDoc, deleteDoc,
  query, orderBy, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ---- 기본 시드 인물 3명 ----
export const DEFAULT_PERSONAS = [
  {
    name: "김지현",
    age: 28,
    gender: "여",
    job: "IT 기업 UX 디자이너",
    personality: "신중한",
    speechStyle: "차분하고 꼼꼼하게 따져보는 말투. 존댓말 위주. '~인 것 같아요', '~한 부분이 궁금해요' 같은 부드러운 어조. 데이터/근거를 묻는 질문 자주 함",
    bio: "사용자 경험에 민감하고 디테일 좋아함. 실용적인 앱 아이디어에 관심"
  },
  {
    name: "박준호",
    age: 35,
    gender: "남",
    job: "자영업 (작은 카페 운영)",
    personality: "호탕한",
    speechStyle: "직설적이고 시원시원한 반말 섞임. 'ㅋㅋㅋ', '대박', '진짜?' 같은 표현 자주. 솔직한 반응. 가끔 농담조",
    bio: "현실적이고 비즈니스 감각 있음. 자영업자 입장에서 실용성 중시"
  },
  {
    name: "이수진",
    age: 24,
    gender: "여",
    job: "사회학과 대학원생",
    personality: "웃음많은",
    speechStyle: "긍정적이고 활기찬 어조. '오~', 'ㅎㅎ', '재밌네요!' 자주. 약간 가벼운 반말+존댓말 섞임. 새로운 시도에 호의적",
    bio: "트렌드 민감, 새로운 서비스 시도 좋아함. 자주 SNS 사용"
  }
];

// ---- CRUD ----

export async function listPersonas() {
  const q = query(collection(db, "personas"), orderBy("createdAt", "asc"), limit(200));
  const snap = await getDocs(q);
  const list = [];
  snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
  return list;
}

export async function getPersona(id) {
  const snap = await getDoc(doc(db, "personas", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function createPersona(persona) {
  const data = {
    name: String(persona.name || "").substring(0, 50),
    age: Number(persona.age) || 0,
    gender: String(persona.gender || "기타").substring(0, 10),
    job: String(persona.job || "").substring(0, 100),
    personality: String(persona.personality || "").substring(0, 100),
    speechStyle: String(persona.speechStyle || "").substring(0, 500),
    bio: String(persona.bio || "").substring(0, 500),
    photoURL: makeAvatar(persona.name),
    fakeUid: "p_" + Math.random().toString(36).substring(2, 12),
    active: true,
    createdAt: serverTimestamp()
  };
  const ref = await addDoc(collection(db, "personas"), data);
  return ref.id;
}

export async function updatePersona(id, fields) {
  const allowed = {};
  ["name","age","gender","job","personality","speechStyle","bio","active"].forEach((k) => {
    if (k in fields) allowed[k] = fields[k];
  });
  if ("name" in allowed) allowed.photoURL = makeAvatar(allowed.name);
  await setDoc(doc(db, "personas", id), allowed, { merge: true });
}

export async function deletePersona(id) {
  await deleteDoc(doc(db, "personas", id));
}

// 기본 인물 시드 (없을 때만 1회)
export async function seedDefaultPersonasIfNeeded() {
  const existing = await listPersonas();
  if (existing.length > 0) return existing;
  for (const p of DEFAULT_PERSONAS) {
    await createPersona(p);
  }
  return await listPersonas();
}

function makeAvatar(name) {
  const colors = ["6366f1","ec4899","10b981","f59e0b","0ea5e9","8b5cf6","f43f5e","14b8a6","eab308","06b6d4"];
  const bg = colors[Math.abs(hashStr(name)) % colors.length];
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || "익명")}&background=${bg}&color=fff&size=128&bold=true`;
}
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < (s||"").length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}

export function personaToAuthor(p) {
  return {
    uid: p.fakeUid || ("p_" + p.id),
    displayName: p.name || "익명",
    photoURL: p.photoURL || makeAvatar(p.name || "익명"),
    email: ""
  };
}
