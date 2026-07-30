# 강팀 디자인 스타일 카탈로그

강팀의 시각 산출물은 *번호가 매겨진* 디자인 스타일 중 하나를 따른다.
*활성 스타일*은 `active.txt` 한 줄에 박혀 있으며, 강디가 새 프로젝트·새 화면을
짤 때 *반드시 먼저* 이 파일을 읽어 어떤 토큰을 쓸지 정한다.

## 활성 스타일

```
$(cat active.txt)
```

## 등록된 스타일

| 번호 | 이름 | 슬러그 | 한 줄 | 파일 |
|---|---|---|---|---|
| **1** | Crowny Class | crowny-class | 보라→분홍 그라데이션, Pretendard, 16px 본문, radius 10/16 | [`01-crowny-class.md`](./01-crowny-class.md) |
| **2** | Apple Liquid Glass | liquid-glass | 반투명 유리·backdrop-blur·컬러 배경광, 떠있는 알약 헤더 (다크 친화) | [`02-liquid-glass.md`](./02-liquid-glass.md) |
| **3** | Vercel Geist | geist | 극미니멀·고대비 흑백 + 강조색 1개, 얇은 보더, 작은 radius | [`03-geist.md`](./03-geist.md) |
| **5** | Untitled UI | untitled-ui | 프리미엄 화이트 SaaS, 중성 회색조, 다단계 그림자, radius 12~16 | [`05-untitled-ui.md`](./05-untitled-ui.md) |
| **6** | Neo-Brutalism | neo-brutalism | 두꺼운 검정 보더·하드 오프셋 그림자·쨍한 원색, radius 0~8 | [`06-neo-brutalism.md`](./06-neo-brutalism.md) |

> Crowny 프로젝트 메모: **라이트 모드 = #5 Untitled UI, 다크 모드 = #2 Liquid Glass** 로 운영(헤더 토글). #4 shadcn/ui 는 React/Tailwind 전제라 순수 HTML/JS Crowny엔 미등록.

> 새 스타일을 추가하려면:
> 1. `NN-슬러그.md` 형식으로 파일 생성 (기존 스타일의 §2~§17 구조 그대로 따라야 함)
> 2. 이 표에 한 줄 추가
> 3. 활성으로 쓰려면 `active.txt` 의 번호만 바꿈

## 활성 스타일 전환 방법

세 가지 다 같은 결과:

```bash
# 1) 셸에서
echo "1" > .claude/knowledge/ui-designer/styles/active.txt

# 2) 슬래시 커맨드
/디자인스타일 1

# 3) 자연어
"디자인 스타일 1번 적용해"
```

자연어/슬래시 커맨드로 바꾸면 강디가 `active.txt` 를 수정한 뒤,
프로젝트의 `styles/tokens.css` 도 해당 스타일의 토큰으로 갱신한다.

## 강디 룰 (반드시 지킬 것)

- 새 화면 짜기 *전*에 반드시 `active.txt` → 해당 스타일 파일을 *처음부터 끝까지* 읽는다.
- 토큰 외 임의 HEX·새 폰트·새 radius·새 shadow 금지. 정말 필요하면 활성 스타일 파일에 *먼저* 추가하고 사용.
- 회의 첫 턴에 "현재 활성 스타일: #N (이름)" 을 *한 줄로 명시*. 회의 시작 시 이게 빠지면 강팀장이 반려.
- 프로젝트별 *Primary/Secondary HEX 두 개*만 바꾸는 건 "스타일 1.X" 가 아니다 — 그건 *테마 컬러 오버라이드* 이며 활성 스타일 번호는 그대로 유지한다 (스타일 1번의 §18 참고).
