// 문의 모달 — 모든 페이지 공용. [data-open-contact] 클릭 또는 #문의 해시로 열림.
import { addInquiry } from "./firestore.js";

(function () {
  "use strict";

  function injectModal() {
    if (document.getElementById("contact-modal")) return;
    const wrap = document.createElement("div");
    wrap.id = "contact-modal";
    wrap.className = "modal-backdrop hidden";
    wrap.innerHTML =
      '<div class="modal-window">' +
        '<div class="modal-head"><h3>문의하기 ✉️</h3>' +
          '<button type="button" class="modal-close" id="contact-close" aria-label="닫기">×</button></div>' +
        '<div class="modal-body">' +
          '<p class="contact-note">궁금한 점·제안·제휴 등 무엇이든 남겨주세요. 확인 후 연락드립니다.</p>' +
          '<div class="form-group"><label for="contact-name">이름 (선택)</label>' +
            '<input type="text" id="contact-name" maxlength="100"></div>' +
          '<div class="form-group"><label for="contact-contact">연락처 (선택)</label>' +
            '<input type="text" id="contact-contact" placeholder="이메일 · 전화번호 · 카톡ID 등" maxlength="200"></div>' +
          '<div class="form-group"><label for="contact-message">문의 내용</label>' +
            '<textarea id="contact-message" rows="5" maxlength="3000" placeholder="내용을 입력해주세요" required></textarea></div>' +
          '<button type="button" id="contact-submit" class="btn-submit">보내기</button>' +
          '<div id="contact-done" class="contact-done hidden">문의가 접수됐어요. 확인 후 연락드릴게요. 감사합니다! 🙌</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);

    const close = document.getElementById("contact-close");
    const submit = document.getElementById("contact-submit");
    close.addEventListener("click", closeModal);
    wrap.addEventListener("click", function (e) { if (e.target === wrap) closeModal(); });
    submit.addEventListener("click", onSubmit);
  }

  function openModal() {
    injectModal();
    const m = document.getElementById("contact-modal");
    document.getElementById("contact-done").classList.add("hidden");
    m.classList.remove("hidden");
    document.body.classList.add("modal-open");
    setTimeout(function () { document.getElementById("contact-message").focus(); }, 50);
  }
  function closeModal() {
    const m = document.getElementById("contact-modal");
    if (m) m.classList.add("hidden");
    document.body.classList.remove("modal-open");
  }

  // 문의 접수 큰 중앙 확인 오버레이
  function showBigDone() {
    var o = document.createElement("div");
    o.className = "contact-done-overlay";
    o.innerHTML = '<div class="contact-done-box"><div class="contact-done-emoji">🙌</div>' +
      '<div class="contact-done-big">문의가 접수됐어요!</div>' +
      '<div class="contact-done-sub">확인 후 연락드릴게요. 감사합니다.</div></div>';
    document.body.appendChild(o);
    requestAnimationFrame(function () { o.classList.add("show"); });
    setTimeout(function () { o.classList.remove("show"); setTimeout(function () { o.remove(); }, 300); }, 2200);
  }

  async function onSubmit() {
    const btn = document.getElementById("contact-submit");
    const message = document.getElementById("contact-message").value.trim();
    if (message.length < 5) { alert("문의 내용을 5자 이상 입력해주세요."); return; }
    btn.disabled = true; btn.textContent = "보내는 중...";
    try {
      await addInquiry({
        name: document.getElementById("contact-name").value.trim(),
        contact: document.getElementById("contact-contact").value.trim(),
        message: message
      });
      document.getElementById("contact-message").value = "";
      document.getElementById("contact-name").value = "";
      document.getElementById("contact-contact").value = "";
      closeModal();
      showBigDone();
    } catch (e) {
      alert("전송에 실패했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      btn.disabled = false; btn.textContent = "보내기";
    }
  }

  // 트리거 바인딩
  document.addEventListener("click", function (e) {
    const t = e.target.closest("[data-open-contact]");
    if (t) { e.preventDefault(); openModal(); }
  });
  // #문의 / #contact 해시로도 열기
  function checkHash() {
    if (location.hash === "#문의" || location.hash === "#contact") openModal();
  }
  window.addEventListener("hashchange", checkHash);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", checkHash);
  else checkHash();
})();
