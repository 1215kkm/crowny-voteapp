# 강개발 플레이북

> 코딩 컨벤션·CSS 변수 전체 표·디버깅 패턴.

---

## 1. 프론트엔드 컨벤션 (CEO 직접 룰, 절대)

### CSS 라이브러리 금지 — 순수 CSS 만
Tailwind / Bootstrap / Bulma / Foundation / MUI / Chakra / styled-components 도입 금지. CSS Modules / `<style>` 만.
이유: CEO 가 직접 값을 손볼 수 있어야 함. 추상 한 겹 끼면 못 고침.

### 모든 디자인 값은 CSS 변수
`:root` 에 전부 모음. 새 페이지 만들 때 임의 HEX·px 박지 말고 변수 통함.

### 아이콘은 Lucide 만
`<i data-lucide="icon-name">` + `lucide.createIcons()`. Font Awesome / Material Icons 금지.

### 폰트는 활성 스타일 정의 것만
기본 #1 = Pretendard Variable (본문) + Agbalumo (로고만).

### PC·모바일 동일 토큰
색·폰트·radius 그대로. **레이아웃만** 분기 (사이드바→탭바, 모달→바닥 시트).

---

## 2. CSS 변수 전체 표 (활성 스타일 #1 기준 — 다른 스타일이면 그 파일 §15)

| 분류 | 변수 |
|---|---|
| 메인 컬러 | `--primary`, `--primary-dark`, `--primary-light`, `--primary-rgb` |
| 서브 컬러 | `--secondary`, `--secondary-light` |
| 그라데이션 | `--gradient` |
| 역할별 컬러 | `--success`, `--warning`, `--error`, `--info` (+ 각 `-light`) |
| 다크 영역 | `--dark-bg`, `--dark-secondary`, `--dark-tertiary`, `--dark-border` |
| 라이트 영역 | `--light-bg`, `--light-card`, `--light-border`, `--light-hover` |
| 텍스트 컬러 | `--text-primary`, `--text-dark`, `--text-secondary`, `--text-muted` |
| 글자 크기 | `--font-xs`, `--font-sm`, `--font-md`(16), `--font-lg`, `--font-xl`, `--font-2xl`, `--font-3xl` |
| 글꼴 | `--font-family-base`(Pretendard), `--font-family-display`(Agbalumo) |
| 모서리 | `--radius-sm`, `--radius-md`(10), `--radius-lg`, `--radius-xl`(16), `--radius-2xl`, `--radius-full` |
| 그림자 | `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-xl`, `--shadow-primary` |
| 간격 (8px 그리드) | `--spacing-xs`(4), `--spacing-sm`(8), `--spacing-md`(16), `--spacing-lg`(24), `--spacing-xl`(32) |
| 섹션 간격 | `--section-gap`, `--section-padding-y`, `--section-padding-x` |
| 컨텐츠 간격 | `--content-gap`, `--content-padding`, `--card-padding` |
| 레이아웃 | `--sidebar-width`, `--header-height`, `--content-max-width` |
| 트랜지션 | `--transition-fast`, `--transition-normal`, `--transition-slow` |
| 보더 | `--border-color`, `--border` |

전체 복붙 가능 묶음은 `.claude/knowledge/ui-designer/styles/01-crowny-class.md` §15.

### 새 페이지 *섹션 한 곳만* 다른 간격이면?
새 변수 만들지 말고, 그 섹션에 *기존 다른 토큰* 인라인 (예: `padding: var(--spacing-lg)`).

---

## 3. 디버깅 — 근본 원인까지

1. 증상 사라져도 *원인* 모르면 다시 터진다.
2. 단계: 재현 → 가장 작은 케이스로 좁힘 → 가설 1개 → 검증 → 반증
3. 가설이 5개 넘으면 *어디 잘못 봤는지* 의심 (전제 점검).
4. 추측으로 고치지 말 것.

### 기능 단위를 *통째로* 감사할 땐 — 전수조사
단일 버그 대응이 아니라 "이 기능 전체를 점검하라"는 요청이면 **전수조사 패턴**을 쓴다: 표본 아닌 *전 경로 sweep* → 결함마다 `파일:라인`+재현 → 버그 1개 찾으면 *같은 유형*을 코드 전체에서 재탐(ACK 없음·끊김 잔여물·틱 기반 시간·세션 꼬임·빈 catch·스냅샷 함정) → 프로토콜이면 *양쪽 병렬* → *수정 전 진단 먼저 제시* → 부수영향("기존 기능 깨나?") 명시 → 계측으로 검증.
상세: [`.claude/knowledge/team-memory/patterns/exhaustive-audit.md`](../team-memory/patterns/exhaustive-audit.md)

---

## 4. 응답 패턴

1. **요구사항 재확인** — 입력/출력/제약 한 줄
2. **구현 가능성·비용** — 가능 / 조건부 / 불가 + 시간 추정
3. **가장 단순한 접근** — 추상화는 *세 번째 비슷한 케이스* 보일 때만
4. **위험·롤백** — 부서지기 쉬운 지점·외부 의존성·롤백 가능성
5. **테스트 계획** — 골든 패스 + 엣지 2~3개

---

## 5. 금기

- 추측 수정 / 선제 추상화 / 의미 없는 주석 / 에러 삼키기 / 테스트 없는 "끝났습니다"
- CSS 라이브러리 / 임의 HEX / 임의 폰트 / Lucide 외 아이콘 — *PreToolUse 훅이 자동 차단*

---

## 6. Ralph Wiggum Loop 인풋

강체크가 🔴/🟡 잡으면 → `last-qa-findings.txt` 가 다음 강개발 호출 컨텍스트 첫 줄에 박힘. *그 지적부터* 순서대로 해결. 안 되는 지적은 *왜 못 하는지* 한 줄 — 그게 다음 미결정 후보.

상세: `.claude/knowledge/qa/feedback-loop.md`

---

## 7. PostToolUse 훅 — 테스트 결과 자동 적재

`npm test` / `pytest` / `vitest` 등 실행하면 *자동으로* `.ai-team/last-test-output.txt` 에 마지막 30줄이 쌓임 → 다음 강체크·강개발 호출 컨텍스트에 자동 포함됨. 테스트 실패하면 그 결과를 *컨텍스트로 받아* 스스로 수정.

---

## 증거 적층 생태계 — 구현 자가 점검

구현 시 묻기: **"사용자 활동이 *영구 데이터 자산*으로 보관되나?"** 회원가입·SNS 공유·임베드는 *자산 누수 방지*. export 기능은 신중 (자산이 *나가는* 문).

큰지도 모드: *자동화 가능 영역* 표시 — 어떤 자산이 수동 누적되나, SEO·SNS 발행·이메일 시퀀스로 자동화 가능한가.

상세: `.claude/knowledge/team-memory/patterns/owned-ecosystem-receipt-stacking.md`
