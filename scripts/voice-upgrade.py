#!/usr/bin/env python3
"""
예전 회의록에 읽어주기(▶) 플레이어를 붙인다.

왜 필요한가
----------
회의록은 만들어질 때 templates/meeting.html 을 *복사*한다. 그래서 읽어주기 기능이
템플릿에 추가되기 *전에* 만든 회의록에는 ▶ 버튼이 아예 없다. 녹음을 돌려 음성을
파일 안에 넣어도 그걸 재생할 버튼이 없어서 소리가 나지 않는다.
이 도구가 템플릿에서 읽어주기 부분(스타일 + 버튼 + 재생 코드)만 떼어 붙여준다.

쓰는 법
------
    python3 scripts/voice-upgrade.py .ai-team/meetings/2026-07-12-주제/meeting.html
    python3 scripts/voice-upgrade.py --all                  # 지금 폴더의 회의록 전부
    python3 scripts/voice-upgrade.py --all --base ../다른레포

붙인 다음
--------
그 회의록을 열면 좌측 하단에 ▶ 컨트롤이 생기고, 아이폰·PC 브라우저의 내장 음성으로
바로 읽어준다. 멤버마다 진짜 남/여 성우로 듣고 싶으면 그 뒤에 녹음까지 돌린다:
    python3 scripts/voice-record.py <그 meeting.html>

두 번 돌려도 안전하다 — 붙인 구간만 새 것으로 갈아 끼운다.
"""

import argparse
import os
import re
import sys

# 윈도우 한국어 환경에서는 표준 출력이 cp949 라 '—' 같은 글자를 찍다가 죽는다
# (UnicodeEncodeError). PowerShell 은 UTF-8 이라 안 걸리고 Git Bash 에서만 터진다.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# 붙인 구간을 나중에 알아보고 갈아 끼우기 위한 표시
CSS_START = "/* TTS_PLAYER_CSS_START (scripts/voice-upgrade.py 가 넣음 — 손대지 마세요) */"
CSS_END = "/* TTS_PLAYER_CSS_END */"
BODY_START = "<!-- TTS_PLAYER_START (scripts/voice-upgrade.py 가 넣음 — 손대지 마세요) -->"
BODY_END = "<!-- TTS_PLAYER_END -->"

# 대본형 회의록인지 알아보는 표시 — 이 역할 클래스가 있어야 읽을 대사를 찾을 수 있다
ROLES = ("daepyo", "gdi", "gdev", "gchk", "abang", "gtok")


def find_template(explicit=None):
    """templates/meeting.html 찾기 — 이 스크립트 옆의 레포를 먼저 본다"""
    if explicit:
        if not os.path.exists(explicit):
            sys.exit(f"템플릿이 없습니다: {explicit}")
        return explicit
    here = os.path.dirname(os.path.abspath(__file__))
    for cand in (
        os.path.join(os.path.dirname(here), "templates", "meeting.html"),
        os.path.join(os.getcwd(), "templates", "meeting.html"),
        os.path.expanduser("~/.claude/templates/meeting.html"),
    ):
        if os.path.exists(cand):
            return cand
    sys.exit(
        "templates/meeting.html 을 못 찾았습니다.\n"
        "  강팀 레포(Ai_Team) 안에서 실행하거나 --template 으로 경로를 알려주세요."
    )


def slice_between(text, start_mark, end_mark, what, path):
    """표시 사이를 (표시까지 포함해서) 잘라낸다"""
    i = text.find(start_mark)
    j = text.find(end_mark)
    if i < 0 or j < 0 or j < i:
        sys.exit(
            f"템플릿에서 {what} 구간을 못 찾았습니다: {path}\n"
            f"  찾는 표시: {start_mark} ... {end_mark}\n"
            f"  누가 템플릿에서 이 표시를 지운 것 같습니다. 표시를 되살려야 합니다."
        )
    return text[i : j + len(end_mark)]


def extract_player(template_path):
    """템플릿에서 읽어주기 스타일·버튼·재생 코드 세 조각을 떼어낸다"""
    src = open(template_path, encoding="utf-8").read()
    css = slice_between(src, "/* TTS_CSS_START", "/* TTS_CSS_END */", "스타일", template_path)
    ui = slice_between(src, "<!-- TTS_UI_START -->", "<!-- TTS_UI_END -->", "버튼", template_path)
    js = slice_between(src, "<!-- TTS_JS_START -->", "<!-- TTS_JS_END -->", "재생 코드", template_path)
    return css, ui, js


def replace_or_insert(html, start_mark, end_mark, block, anchor):
    """이미 붙여둔 구간이 있으면 갈아 끼우고, 없으면 anchor 앞에 새로 넣는다"""
    if start_mark in html and end_mark in html:
        s = html.index(start_mark)
        e = html.index(end_mark) + len(end_mark)
        return html[:s] + block + html[e:], "갈아끼움"
    i = html.find(anchor)
    if i < 0:
        return None, f"{anchor} 를 못 찾음"
    return html[:i] + block + "\n" + html[i:], "새로 넣음"


def upgrade(path, css, ui, js, force=False):
    """회의록 한 개에 플레이어를 붙인다. (성공여부, 한 줄 설명) 을 돌려준다"""
    html = open(path, encoding="utf-8").read()

    # 이미 플레이어가 있는 회의록(새 템플릿으로 만든 것)은 건드리지 않는다
    already = "ttsToggle(" in html and BODY_START not in html
    if already and not force:
        return True, "이미 플레이어가 있어 건너뜀"

    # 대본형 markup 이 아니면 읽을 대사를 못 찾는다
    has_lines = re.search(r'class="l\s+(?:' + "|".join(ROLES) + r')\b', html)
    if not has_lines and not force:
        return False, "대본형 회의록이 아님 (class=\"l 강팀장/강디…\" 없음) — 붙여도 읽을 대사를 못 찾습니다"

    # 스타일이 쓰는 색 변수가 있는지 (없으면 버튼 색만 빠지고 동작은 함)
    notes = []
    for var in ("--gchk", "--line"):
        if var not in html:
            notes.append(f"{var} 색 변수 없음 — 버튼 색이 기본값으로 나옵니다")

    # 1) 스타일 — 첫 </style> 앞에
    css_block = CSS_START + "\n" + css + "\n" + CSS_END
    html2, how_css = replace_or_insert(html, CSS_START, CSS_END, css_block, "</style>")
    if html2 is None:
        return False, f"스타일을 넣을 자리가 없음 ({how_css})"

    # 2) 버튼 + 재생 코드 — </body> 앞에.
    #    exportImg 보다 *뒤에* 놓아야 이미지 저장 시 ▶ 버튼을 가리는 보정이 걸린다.
    body_block = BODY_START + "\n" + ui + "\n\n" + js + "\n" + BODY_END
    html3, how_body = replace_or_insert(html2, BODY_START, BODY_END, body_block, "</body>")
    if html3 is None:
        return False, f"플레이어를 넣을 자리가 없음 ({how_body})"

    open(path, "w", encoding="utf-8").write(html3)
    msg = f"플레이어 붙였습니다 (스타일 {how_css}, 재생부 {how_body})"
    if notes:
        msg += " / 참고: " + " · ".join(notes)
    return True, msg


def collect_all(base):
    """.ai-team/meetings 아래 회의록 전부 (최근 것 먼저)"""
    root = os.path.join(base, ".ai-team", "meetings")
    if not os.path.isdir(root):
        sys.exit(
            f"회의록 폴더가 없습니다: {root}\n"
            "  강팀이 들어있는 프로젝트 폴더에서 실행하거나 --base 로 알려주세요."
        )
    found = []
    for name in os.listdir(root):
        p = os.path.join(root, name, "meeting.html")
        if os.path.exists(p):
            found.append(p)
    found.sort(key=lambda p: os.path.getmtime(p), reverse=True)
    return found


def main():
    ap = argparse.ArgumentParser(description="예전 회의록에 읽어주기(▶) 플레이어 붙이기")
    ap.add_argument("meetings", nargs="*", help="meeting.html 경로 (여러 개 가능)")
    ap.add_argument("--all", action="store_true", help="--base 폴더의 회의록 전부")
    ap.add_argument("--base", default=".", help="--all 일 때 기준 폴더 (기본: 지금 폴더)")
    ap.add_argument("--template", default=None, help="templates/meeting.html 경로 직접 지정")
    ap.add_argument("--force", action="store_true", help="이미 있어도 다시 붙이기")
    args = ap.parse_args()

    targets = list(args.meetings)
    if args.all:
        targets += collect_all(args.base)
    if not targets:
        ap.error("회의록 경로를 주거나 --all 을 쓰세요.")

    tpl = find_template(args.template)
    css, ui, js = extract_player(tpl)
    print(f"템플릿: {tpl}")
    print(f"떼어낸 조각 — 스타일 {len(css)}자, 버튼 {len(ui)}자, 재생 코드 {len(js)}자\n")

    ok = fail = 0
    for path in targets:
        label = os.path.basename(os.path.dirname(os.path.abspath(path)))
        if not os.path.exists(path):
            print(f"  X  {label}: 파일이 없습니다 ({path})")
            fail += 1
            continue
        good, msg = upgrade(path, css, ui, js, force=args.force)
        print(f"  {'OK' if good else 'X '}  {label}: {msg}")
        ok += 1 if good else 0
        fail += 0 if good else 1

    print(f"\n끝 — 성공 {ok}개, 실패 {fail}개")
    if ok:
        print("이제 그 회의록을 열면 좌측 하단 ▶ 로 브라우저 내장 음성이 읽어줍니다.")
        print("멤버마다 진짜 남/여 성우로 듣고 싶으면 녹음까지 돌리세요:")
        print("  python3 scripts/voice-record.py <meeting.html>   (또는 pwsh scripts/voice.ps1)")
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
