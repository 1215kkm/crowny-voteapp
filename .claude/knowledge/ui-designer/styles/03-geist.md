# Vercel Geist · 미니멀 하이콘트라스트 디자인 시스템

> 강팀 디자인 스타일 카탈로그 #03 — 슬러그 `geist`
> Vercel 의 Geist 디자인 시스템. 극도의 미니멀 · 고대비 · 정밀한 그리드.
> **구현 난이도 가장 낮음.** 정보 밀도와 전문성·신뢰감이 강점.

## 1. 브랜드 아이덴티티
- 키워드: 절제 · 정밀 · 고대비 · 군더더기 0.
- 흑백 기반 + 강조색 1개. 얇은 보더, 작은 radius, 절제된 그림자.
- 콘텐츠가 주인공 — 장식은 최소.

## 2. 색상 팔레트 (Color Tokens)

### 2.1 그레이스케일 (핵심)
```
--gray-100: #fafafa   --gray-200: #ededed   --gray-300: #e0e0e0
--gray-500: #8f8f8f   --gray-700: #444444   --gray-900: #171717
--color-bg:      #ffffff
--color-surface: #ffffff
--color-text:    #171717
--color-text-secondary: #666666
--color-border:  #eaeaea
```

### 2.2 강조색 (1개만)
```
--color-accent: #0070f3   /* Vercel 블루. Crowny 적용 시 보라 #8A38F5 로 치환 가능 */
```

### 2.3 상태
```
--color-success: #0070f3(or #16a34a)  --color-warning: #f5a623  --color-danger: #e00
```

## 3. 타이포그래피
- 폰트: **Geist Sans** (OFL/MIT, 무료). 한글은 Pretendard 병행.
- 본문 ≥ 16px. 자간 살짝 타이트(-0.01em). 고대비(거의 검정 텍스트 on 흰 배경).
- 굵기 대비 강함: 본문 400 / 강조 600 / 헤드라인 700.

## 4. 모서리 (Border Radius)
```
--radius-sm: 5px   --radius-md: 8px   --radius-lg: 12px
```
- 작게. 카드·버튼 모두 6~8px.

## 5. 그림자 / 보더
- 그림자보다 **얇은 1px 보더**로 면을 구분(`1px solid var(--color-border)`).
- 그림자는 아주 절제: `0 1px 2px rgba(0,0,0,0.04)`.

## 6. 핵심 컴포넌트
- **버튼(주요)**: 검정 배경(#171717) + 흰 텍스트, radius 6~8. 호버 시 약간 밝게.
- **버튼(보조)**: 흰 배경 + 얇은 보더.
- **카드**: 흰 배경 + 1px 보더 + 작은 radius. 그림자 거의 없음.
- **입력**: 얇은 보더, 포커스 시 강조색 1px 링.
- 정밀한 그리드·정렬이 핵심 — 여백 단위를 4px 그리드로.

## 7. 접근성
- 고대비라 가독성 우수(검정 on 흰). 강조색은 대비 4.5:1 확인.
- 포커스 링 명확(2px). 다크 모드 시 흑백 반전(#000 배경 + #ededed 텍스트).

## 8. 복붙용 CSS 변수
```css
:root {
  --color-bg: #ffffff;
  --color-surface: #ffffff;
  --color-text: #171717;
  --color-text-secondary: #666666;
  --color-border: #eaeaea;
  --color-accent-start: #171717;  /* 검정 솔리드 CTA */
  --color-accent-end: #171717;
  --radius-sm: 5px; --radius-md: 8px; --radius-lg: 12px;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
}
```

## 9. 라이선스
- Geist 폰트: OFL/MIT (무료, 상업 가능). 디자인 컨벤션 자유 재현.

## 10. Crowny 적합도
- **적합 — 신뢰감·전문성.** 구현 속도 1위.
- 단점: 개성·도파민이 약함. Crowny의 ‘투표 재미’엔 다소 밋밋. 그라데이션은 포인트로만.
