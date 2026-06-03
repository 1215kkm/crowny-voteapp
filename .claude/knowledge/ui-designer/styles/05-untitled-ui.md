# Untitled UI · 프리미엄 화이트 SaaS 디자인 시스템

> 강팀 디자인 스타일 카탈로그 #05 — 슬러그 `untitled-ui`
> SaaS 표준 컴포넌트의 정석. 깔끔한 중성톤 + 정교한 그림자 단계.
> **Crowny 라이트 모드의 기본 스타일로 채택됨.**

## 1. 브랜드 아이덴티티
- 키워드: 깔끔함 · 신뢰 · 여백 · 정교한 디테일.
- 화이트 SaaS 룩. 중성 회색조 위에 브랜드 보라 accent.
- 부드러운 다단계 그림자와 여유로운 여백으로 ‘고급스러운 기본기’.

## 2. 색상 팔레트 (Color Tokens)

### 2.1 중성 회색조 (핵심, Untitled UI gray 계열)
```
--color-bg:        #fcfcfd   /* 페이지 배경 */
--color-surface:   #ffffff   /* 카드·패널 */
--color-text:      #101828   /* 본문 (거의 검정) */
--color-text-secondary: #475467
--color-text-light:     #98a2b3
--color-border:    #eaecf0
--gray-50:#f9fafb  --gray-100:#f2f4f7  --gray-200:#eaecf0  --gray-500:#667085  --gray-900:#101828
```

### 2.2 브랜드 액센트 (유지)
```
--color-accent-start: #6366f1   /* 인디고→보라 (기존 Crowny accent 유지) */
--color-accent-end:   #8b5cf6
/* 히어로 '왕관' 그라데이션은 보라→분홍(#8A38F5→#D53A6B) 포인트 유지 */
```

### 2.3 상태(Semantic)
```
--color-success: #12b76a  --color-warning: #f79009  --color-danger: #f04438
```

## 3. 타이포그래피
- 폰트: Inter 계열 → 한글은 Pretendard / Noto Sans KR.
- 본문 ≥ 16px. 헤드라인 굵게(700~800).
- 색 대비: 본문 #101828 on #fcfcfd (높은 가독성).

## 4. 간격 (Spacing)
- 여유로운 여백이 정체성. 섹션 간 64~96px, 카드 패딩 24px.
- 4/8px 그리드.

## 5. 모서리 (Border Radius)
```
--radius-sm: 8px   --radius-md: 12px   --radius-lg: 16px   --radius-full: 9999px
```

## 6. 그림자 (다단계가 핵심)
```
--shadow-sm: 0 1px 2px rgba(16,24,40,0.05);
--shadow-md: 0 4px 8px -2px rgba(16,24,40,0.10), 0 2px 4px -2px rgba(16,24,40,0.06);
--shadow-lg: 0 12px 16px -4px rgba(16,24,40,0.08), 0 4px 6px -2px rgba(16,24,40,0.03);
```
> 그림자 단계 차이로 면의 높낮이(elevation)를 정교하게 표현.

## 7. 핵심 컴포넌트
- **버튼(주요)**: 브랜드 accent 솔리드 또는 그라데이션 + radius 8, --shadow-sm. (현재 Crowny의 검정 CTA도 이 톤과 호환)
- **카드**: 흰 배경 + 1px #eaecf0 보더 + --shadow-md, radius 12~16.
- **입력**: 흰 배경 + #d0d5dd 보더, 포커스 시 accent 링 + 옅은 그림자.
- **모달**: 흰 패널 + --shadow-lg, 둥근 16.
- **칩/뱃지**: 옅은 회색 또는 옅은 컬러 배경 + 진한 텍스트.

## 8. 접근성
- 본문 대비 매우 높음(#101828 on #fcfcfd ≈ 16:1).
- 포커스 링 명확, hover/active 상태 분리.

## 9. 복붙용 CSS 변수
```css
:root {
  --color-bg: #fcfcfd;
  --color-surface: #ffffff;
  --color-text: #101828;
  --color-text-secondary: #475467;
  --color-text-light: #98a2b3;
  --color-border: #eaecf0;
  --color-accent-start: #6366f1;
  --color-accent-end: #8b5cf6;
  --radius-sm: 8px; --radius-md: 12px; --radius-lg: 16px;
  --shadow-sm: 0 1px 2px rgba(16,24,40,0.05);
  --shadow-md: 0 4px 8px -2px rgba(16,24,40,0.10), 0 2px 4px -2px rgba(16,24,40,0.06);
  --shadow-lg: 0 12px 16px -4px rgba(16,24,40,0.08), 0 4px 6px -2px rgba(16,24,40,0.03);
}
```

## 10. 라이선스
- 디자인 컨벤션(레이아웃·간격·그림자 단계)은 자유 재현.
- ⚠️ Untitled UI의 **Figma 키트 에셋·컴포넌트 원본**은 유료 라이선스 필요. 직접 복제 금지.

## 11. Crowny 적합도
- **무난~적합.** 지금 Crowny 화이트 화면과 거의 일치 → 라이트 모드로 자연스러움.
- 단독으론 ‘범용 SaaS’라 개성이 약함 → 브랜드 보라→분홍 그라데이션과 ‘왕관’ 모티프로 차별화.
- Crowny에서는 **라이트 모드 전용**으로 사용(다크 모드는 #02 Liquid Glass).
