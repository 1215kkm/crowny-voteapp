# Crowny VoteApp 수정 사항 적용 가이드

## 변경 요약
1. ✅ **'나도 대기자로 등록하기' permission-denied 에러 수정** — 샘플(예시) 아이디어에 클릭 시 firestore 호출 안 함, 실제 사용자 글에서만 동작
2. ✅ **새 글 등록해도 샘플 글이 사라지지 않음** — 실제 + 샘플 병합 렌더링
3. ✅ **하루 사용자당 최대 2개 글 제한** — 폼에 안내 표시 (`오늘 작성 X/2건`), 클라이언트 + 서버측 카운트 검증
4. ✅ **이미지 첨부 기능** — 캔버스에서 최대 폭 1400px로 자동 리사이즈, JPEG q=0.8로 base64 변환 후 firestore 저장
5. ✅ **모바일에서 '공유된 아이디어' 헤더 어두운색** (768px 이하)

## 이미지 용량 추정 (1400px 폭 자동 변환)
- 사진/스크린샷: 일반적으로 **150~400KB**
- 매우 큰/복잡한 사진: 최대 ~700KB
- 클라이언트에서 950KB 초과 시 q=0.6으로 재압축, 그래도 크면 사용자에게 다른 이미지 요청
- Firestore 1MB 문서 한계 안에 안전하게 들어감

## 적용 방법 — 두 가지 중 하나 선택

### 방법 A: 단일 patch 파일 (가장 간단)
```bash
cd /path/to/crowny-voteapp
git checkout main
git pull
git checkout -b feat/post-improvements
git apply all-changes.patch
git add -A
git commit -m "feat: 샘플글 항상 표시 + 일일 2개 제한 + 이미지 첨부 + 모바일 헤더 색상"
git push -u origin feat/post-improvements
```
그런 다음 GitHub에서 PR 생성.

### 방법 B: format-patch (커밋 메시지 보존)
```bash
cd /path/to/crowny-voteapp
git checkout main && git pull
git checkout -b feat/post-improvements
git am 0001-feat-2.patch    # 커밋 메시지까지 자동 적용됨
git push -u origin feat/post-improvements
```

### 방법 C: 파일 직접 덮어쓰기 (Git 모를 때)
`changed-files.zip` 의 압축을 풀면 `js/app.js`, `js/firestore.js`, `index.html`, `css/style.css`, `firestore.rules` 5개 파일이 나옴. 이 파일들을 각자 같은 경로에 덮어쓴 뒤:
```bash
git add -A
git commit -m "feat: 샘플글 + 일일 2개 제한 + 이미지 첨부 + 모바일 색상"
git push
```

## ⚠️ 추가 작업 — Firestore 규칙 배포
`firestore.rules` 가 변경되었으므로 Firebase에 재배포 필요:
```bash
firebase deploy --only firestore:rules
```
또는 Firebase 콘솔 → Firestore → 규칙 탭에서 `firestore.rules` 내용 붙여넣고 게시.

## 실제 push 가능?
GitHub로의 직접 push는 인증 자격증명이 필요해서 내(Claude) 환경에서 직접은 못해. 위 방법으로 너가 push 하면 돼.
