# Apple Liquid Glass · 반투명 유리 디자인 시스템

> 강팀 디자인 스타일 카탈로그 #02 — 슬러그 `liquid-glass`
> Apple iOS 26 / macOS Tahoe 의 "Liquid Glass" 디자인 언어를 웹에서 재현한 스타일.
> **다크 영역과 시너지가 가장 큼.** Crowny 다크 모드의 기본 스타일로 채택됨.

## 1. 브랜드 아이덴티티
- 키워드: 투명함 · 깊이 · 떠 있음(floating) · 빛의 굴절.
- 반투명 유리 패널이 배경 위에 떠 있고, 그 뒤로 컬러풀한 빛(글로우)이 비친다.
- Crowny 브랜드 보라(#8A38F5)→분홍(#D53A6B) 그라데이션을 배경광으로 활용해 유리에 색이 스민다.

## 2. 색상 팔레트 (Color Tokens)

### 2.1 유리 토큰 (핵심)
```
--glass:         rgba(255,255,255,0.08)   /* 패널 기본 반투명 */
--glass-strong:  rgba(255,255,255,0.14)   /* 헤더·강조 패널 */
--glass-border:  rgba(255,255,255,0.18)   /* 유리 테두리 */
--glass-hi:      rgba(255,255,255,0.45)   /* 윗변 inset 하이라이트 */
--blur:          blur(20px) saturate(160%)
```

### 2.2 배경 / 표면 (다크 베이스)
```
--color-bg:        #0b0d12   /* 가장 깊은 배경 */
--color-surface:   rgba(255,255,255,0.08)  /* = --glass */
--bg-glow-1:       radial-gradient 보라 #8A38F5 30% 투명
--bg-glow-2:       radial-gradient 분홍 #D53A6B 30% 투명
--bg-glow-3:       radial-gradient 시안 #38bdf8 20% 투명
```
> body 뒤에 3겹 radial-gradient 글로우를 깔고, 그 위에 유리 패널을 얹는다.

### 2.3 텍스트 (유리 위 = 밝게)
```
--color-text:           #f4f5f7
--color-text-secondary: #b8bfca
--color-text-light:     #8b93a1
```

### 2.4 액센트 / 상태
```
--color-accent-start: #8A38F5   /* 보라 */
--color-accent-end:   #D53A6B   /* 분홍 */
--color-success: #34d399  --color-warning: #fbbf24  --color-danger: #f87171
```

## 3. 타이포그래피
- 폰트: SF Pro 계열 → 웹은 Pretendard Variable 로 대체(한글 최적).
- 본문 ≥ 16px. 헤드라인은 굵게(800), 자간 -0.02em.
- 유리 위 텍스트는 가독성 위해 약한 text-shadow(`0 1px 2px rgba(0,0,0,.3)`) 허용.

## 4. 모서리 (Border Radius)
```
--radius-sm: 12px   --radius-md: 18px   --radius-lg: 24px   --radius-full: 9999px
```
- 카드 24px, 버튼 14px, 헤더·칩 full(알약형).

## 5. 그림자 / 깊이
- 그림자는 어둡고 부드럽게 + **윗변 inset 하이라이트**로 유리 두께를 표현:
```
box-shadow: 0 8px 32px rgba(0,0,0,0.37), inset 0 1px 0 var(--glass-hi);
```

## 6. 핵심 컴포넌트
- **헤더**: 떠 있는 알약형. `position: sticky; backdrop-filter: var(--blur); background: var(--glass-strong); border:1px solid var(--glass-border); border-radius: full;` 좌우 여백을 두고 부유.
- **카드**: `background: var(--glass); backdrop-filter: var(--blur); border:1px solid var(--glass-border); border-radius:24px;` + inset 하이라이트.
- **버튼(주요)**: 보라→분홍 그라데이션 솔리드(유리 위에서 또렷하게). 보조 버튼은 유리.
- **모달**: 강한 유리(`--glass-strong`) + 더 큰 blur. 배경은 어둡게 dim.

## 7. 접근성
- 유리 위 텍스트 대비 4.5:1 확보(밝은 텍스트 + 필요시 text-shadow).
- `@media (prefers-reduced-transparency)` 시 blur 제거하고 불투명 표면(`#12141a`)으로 폴백.
- `backdrop-filter` 미지원 브라우저는 반투명 단색으로 자연 폴백.

## 8. 복붙용 CSS 변수
```css
html[data-theme="dark"] {
  --color-bg: #0b0d12;
  --color-surface: rgba(255,255,255,0.08);
  --glass: rgba(255,255,255,0.08);
  --glass-strong: rgba(255,255,255,0.14);
  --glass-border: rgba(255,255,255,0.18);
  --glass-hi: rgba(255,255,255,0.45);
  --blur: blur(20px) saturate(160%);
  --color-text: #f4f5f7;
  --color-text-secondary: #b8bfca;
  --color-text-light: #8b93a1;
  --color-accent-start: #8A38F5;
  --color-accent-end: #D53A6B;
  --color-border: rgba(255,255,255,0.12);
}
body { background:#0b0d12; }
body::before { /* 3겹 컬러 글로우 */
  content:""; position:fixed; inset:0; z-index:-1;
  background:
    radial-gradient(60% 50% at 20% 10%, rgba(138,56,245,0.30), transparent 70%),
    radial-gradient(50% 50% at 85% 20%, rgba(213,58,107,0.28), transparent 70%),
    radial-gradient(60% 60% at 60% 100%, rgba(56,189,248,0.18), transparent 70%);
}
```

## 9. 라이선스
- "Liquid Glass"는 Apple의 **디자인 언어**다. 시각 컨벤션(반투명·blur·굴절) 재현은 자유.
- ⚠️ Apple의 **에셋(아이콘/이미지), SF Pro 폰트, 상표/명칭**은 사용 불가. "Apple" 명시 금지.

## 10. Crowny 적합도
- **최적 (CEO 픽).** 보라→분홍 배경광과 유리의 궁합이 뛰어남.
- 주의: 유리는 신뢰감이 살짝 흐려질 수 있으니 **투표·CTA 버튼만은 솔리드**로 또렷하게(‘글래스 셸 + 솔리드 액션’).
- Crowny에서는 **다크 모드 전용**으로 사용(라이트 모드는 #05 Untitled UI).
