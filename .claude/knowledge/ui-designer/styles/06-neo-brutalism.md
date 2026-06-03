# Neo-Brutalism · 비비드 하드섀도 디자인 시스템

> 강팀 디자인 스타일 카탈로그 #06 — 슬러그 `neo-brutalism`
> 두꺼운 검정 보더 + 하드 오프셋 그림자 + 쨍한 원색. 개성·기억성 최강.
> 캠페인·랜딩처럼 ‘각인’이 목적일 때 강력.

## 1. 브랜드 아이덴티티
- 키워드: 대담함 · 원색 · 각짐 · 손맛.
- 두꺼운 검정 윤곽선과 흐림 없는(no blur) 오프셋 그림자가 정체성.
- 한 화면에 쨍한 컬러 블록을 과감히 배치.

## 2. 색상 팔레트 (Color Tokens)

### 2.1 베이스
```
--color-bg:      #fffdf5   /* 살짝 크림빛 흰색 */
--color-surface: #ffffff
--color-ink:     #111111   /* 검정 보더·텍스트 */
--color-text:    #111111
--color-border:  #111111   /* 보더는 항상 진한 검정 */
```

### 2.2 비비드 컬러 블록
```
--vivid-yellow: #FFD93D
--vivid-lime:   #C6F432
--vivid-pink:   #FFB3C7
--vivid-blue:   #7CC6FE
--vivid-purple: #8A38F5   /* 브랜드 보라 — 액센트로 결합 */
```

### 2.3 상태
```
--color-success: #00C853  --color-warning: #FFD93D  --color-danger: #FF5252
```

## 3. 타이포그래피
- 폰트: Space Grotesk / 굵은 산세리프. 한글은 Pretendard Bold.
- 본문 ≥ 16px. 헤드라인 아주 굵게(800~900), 큼직하게.

## 4. 모서리 (Border Radius)
```
--radius-sm: 0px   --radius-md: 4px   --radius-lg: 8px
```
- 거의 각지게. 둥글려도 8px 이내.

## 5. 그림자 (하드 오프셋이 핵심)
```
--shadow-hard: 5px 5px 0 #111111;   /* blur 0, 검정 */
--shadow-hard-lg: 8px 8px 0 #111111;
```
- 호버 시 그림자 줄이며 눌리는 느낌(`transform: translate(2px,2px); box-shadow: 3px 3px 0`).

## 6. 핵심 컴포넌트
- **버튼**: 비비드 배경 + 3px 검정 보더 + 하드 그림자. 클릭 시 눌림 모션.
- **카드**: 흰/원색 배경 + 3px 검정 보더 + 하드 그림자.
- **칩/뱃지**: 원색 블록 + 검정 보더.
- 모든 면에 두꺼운 검정 윤곽선 필수.

## 7. 접근성
- ⚠️ 비비드 배경 위 텍스트 대비 주의 — 텍스트는 검정 고정, 너무 옅은 컬러 배경 회피.
- 모션 과할 수 있으니 `prefers-reduced-motion` 시 눌림 애니메이션 축소.

## 8. 복붙용 CSS 변수
```css
:root {
  --color-bg: #fffdf5;
  --color-surface: #ffffff;
  --color-text: #111111;
  --color-border: #111111;
  --radius-sm: 0px; --radius-md: 4px; --radius-lg: 8px;
  --shadow-hard: 5px 5px 0 #111111;
}
.btn, .card { border: 3px solid #111; box-shadow: var(--shadow-hard); }
```

## 9. 라이선스
- 오픈 트렌드 / 스타일 컨벤션 — 자유, 무료.

## 10. Crowny 적합도
- **주목도 1위 / 신뢰감은 손해.** 투표앱 ‘도파민’엔 잘 맞지만, 존댓말 톤·브랜드 정돈감과 충돌.
- 접근성 리스크 있음. 상시 UI보다 **캠페인·이벤트 랜딩** 한정 추천.
