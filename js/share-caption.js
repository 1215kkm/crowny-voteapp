// ========================================
// 공유 캡션 빌더 — 저장된 회의를 스레드로 퍼갈 때 팀원 발언을 '각각 일부만' 담는다.
// 위젯(team-widget.js)의 shareCaption 과 동일한 규칙(팀원 균등 배분 + 각자 말줄임).
// 마이페이지 활동내역 재공유(app.js)·관리자 지난회의 공유(admin.js)가 공유해서 쓴다.
// ========================================

// 회의 HTML 문자열에서 팀원별 발언을 뽑아 그룹으로 묶는다.
// <b>이름</b> 과 속마음(.tw-think) 은 제외하고 실제 발언만, 같은 이름은 이어붙인다.
function meetingGroupsFromHtml(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = String(html || "");
  const acts = tmp.querySelectorAll(".tw-m-act");
  const order = [];
  const byName = {};
  for (let i = 0; i < acts.length; i++) {
    const clone = acts[i].cloneNode(true);
    const b = clone.querySelector("b");
    const name = b ? b.textContent.trim() : "";
    if (b) b.parentNode.removeChild(b);
    const thinks = clone.querySelectorAll(".tw-think");
    for (let j = 0; j < thinks.length; j++) thinks[j].parentNode.removeChild(thinks[j]);
    let rest = clone.textContent.replace(/\s+/g, " ").trim();
    rest = rest.replace(/^["“”'']+|["“”'']+$/g, "").trim();
    if (!name && !rest) continue;
    const key = name || ("_" + i);
    if (!byName[key]) { byName[key] = { name: name, text: rest }; order.push(key); }
    else if (rest) { byName[key].text += (byName[key].text ? " " : "") + rest; }
  }
  return order.map((k) => byName[k]);
}

// 형식: ★★ 제목 ★★ / (빈줄) / 이름 : 대사(말줄임) / … / 전체 회의 보기 → 링크
// 팀원 전원이 반드시 들어가도록 예산(470자)을 팀원 수로 균등 배분하고, 각자 말줄임한다.
export function buildMeetingCaption(html, title, url) {
  const head = "★★ " + (title || "내 앱 아이디어") + " ★★";
  const foot = "\n\n전체 회의 보기 → " + url;
  const LIMIT = 470; // 스레드 500자 제한 안전선
  const groups = meetingGroupsFromHtml(html);
  if (!groups.length) return head + foot;

  const budget = LIMIT - head.length - foot.length;
  const SEP = 2; // "\n\n"
  let perLine = Math.floor(budget / groups.length) - SEP;
  if (perLine < 16) perLine = 16;
  let mid = "";
  for (let i = 0; i < groups.length; i++) {
    const prefix = groups[i].name ? groups[i].name + " : " : "";
    let avail = perLine - prefix.length;
    if (avail < 8) avail = 8;
    let t = groups[i].text || "";
    if (t.length > avail) t = t.slice(0, avail).trim() + "…";
    mid += "\n\n" + prefix + t;
  }
  let full = head + mid + foot;
  if (full.length > LIMIT) {
    const room = Math.max(0, LIMIT - head.length - foot.length);
    full = head + mid.slice(0, room) + foot;
  }
  return full;
}
