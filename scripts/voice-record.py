#!/usr/bin/env python3
"""
강팀 회의록 → 진짜 목소리로 녹음 (무료)

회의록 HTML 을 읽어 대사 한 줄씩 음성 파일(mp3)로 만든다.
멤버마다 *실제로 다른 성우* — 남/여, 나이대까지 나뉜다.
브라우저 내장 음성(아이폰 1개뿐)의 한계를 넘는 방법.

쓰는 법
------
    pip install edge-tts
    python3 scripts/voice-record.py .ai-team/meetings/2026-07-30-주제/meeting.html

끝나면 회의록 옆에 voices/ 폴더가 생기고, meeting.html 을 열면
▶ 버튼이 자동으로 그 파일들을 재생한다 (내장 음성 대신).

무료 여부
--------
edge-tts 는 마이크로소프트 엣지 브라우저의 읽어주기 음성을 쓴다.
가입·API 키·요금 없음. 인터넷만 필요(만들 때만. 만든 뒤 재생은 오프라인).

목소리 배정
----------
CAST 에 'voice' 로 성우를 못 박아 둔다 — CEO 가 직접 들어보고 고른 값이다.
'voice' 가 없는 멤버만 성별에 맞는 한국어 성우를 돌려 쓴다.
나이대·성격은 높낮이(Hz)·속도(%)로 만든다.
- 강팀장 45세 남 → en-AU-William (여러 언어를 읽는 성우), 조작 없는 원본 그대로
- 강개발 35세 남 → 남성(가능하면 다른 성우), 보통
- 강톡   32세 남 → 남성, 낮고 느리게
- 아뱅   남 자문위원 → 남성, 빠르고 들뜨게
- 강체크 28세 여 → 여성, 또박또박
- 강디   26세 여 → 여성, 높고 빠르게
- CEO(강사님) → 남성, 차분하게
- 지문·정리 → 해설자
성별 배정을 바꾸려면 아래 CAST 의 'gender' 만 고치면 된다.
"""

import argparse
import asyncio
import base64
import json
import os
import re
import sys
from html.parser import HTMLParser

# 윈도우 한국어 환경에서는 표준 출력이 cp949 라 '—' 같은 글자를 찍다가 죽는다
# (UnicodeEncodeError). PowerShell 은 UTF-8 이라 안 걸리고 Git Bash 에서만 터진다.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

try:
    import edge_tts
except ImportError:
    sys.exit("edge-tts 가 없습니다. 먼저:  pip install edge-tts")

# ── 멤버별 목소리 성격 ────────────────────────────────────────────────
# gender: 어떤 성우를 쓸지 / pitch·rate: 나이·성격 표현 (Hz, %)
#
# 'voice' 를 적으면 그 성우로 고정된다. 비워두면 성별에 맞는 한국어 성우를 돌려 쓴다.
# 아래 값은 CEO 가 실제로 들어보고 고른 것이라 함부로 바꾸지 않는다 (2026-07-30).
#   · 강팀장 → en-AU-WilliamMultilingualNeural, 높낮이·속도 조작 없음("원본"으로 지정).
#     한국어 전용 성우가 아니라 여러 언어를 읽는 성우다. 한국어 전용 성우가 3명뿐이라
#     멤버끼리 목소리가 겹치는 문제를 이렇게 풀었다.
#   · 강개발·아뱅이 Hyunsu 를, 강체크·강디가 SunHi 를 나눠 쓴다 — CEO 가 이대로 괜찮다고 확인함.
#     둘을 갈라야 하면 지금 강톡만 쓰는 ko-KR-InJoonNeural 을 한쪽에 주면 된다.
#
CAST = {
    "ceo":    {"name": "CEO",    "gender": "Male",   "pitch": -8,  "rate": 0,
               "voice": "ko-KR-HyunsuMultilingualNeural"},
    "daepyo": {"name": "강팀장",  "gender": "Male",   "pitch": 0,   "rate": 0,
               "voice": "en-AU-WilliamMultilingualNeural"},
    "gdev":   {"name": "강개발",  "gender": "Male",   "pitch": -6,  "rate": 8,
               "voice": "ko-KR-HyunsuMultilingualNeural"},
    "gtok":   {"name": "강톡",    "gender": "Male",   "pitch": -14, "rate": -10,
               "voice": "ko-KR-InJoonNeural"},
    "abang":  {"name": "아뱅",    "gender": "Male",   "pitch": 8,   "rate": 18,
               "voice": "ko-KR-HyunsuMultilingualNeural"},
    "gchk":   {"name": "강체크",  "gender": "Female", "pitch": 4,   "rate": 0,
               "voice": "ko-KR-SunHiNeural"},
    "gdi":    {"name": "강디",    "gender": "Female", "pitch": 22,  "rate": 12,
               "voice": "ko-KR-SunHiNeural"},
}
NARRATOR = {"gender": "Female", "pitch": -4, "rate": -5, "voice": "ko-KR-SunHiNeural"}
# 속마음 연기 보정 (원래 값에서 더 낮고 느리고 작게)
THINK_PITCH, THINK_RATE, THINK_VOL = -14, -12, -22

# ── 괄호 지문을 읽지 않고 말투로 연기 ──────────────────────────────
# "(웃으며)" 처럼 *어떻게 말하라는 지시*는 소리로 읽지 않고 말투만 바꾼다.
# "(안 되면 곤란한데)" 처럼 *속마음 내용*은 그대로 읽는다.
# 12자 이하 + 아래 표에 걸리면 지시로 본다.
# ⚠️ templates/meeting.html 의 TTS_DIRECTION 과 같은 규칙 — 한쪽만 고치지 말 것.
DIRECTIONS = [
    (r"속삭이|작게|조용히|낮은 목소리|나직", {"pitch": -6, "rate": -18, "vol": -55}),
    (r"웃으며|웃음|웃는|피식|킥킥|씩 웃|밝게", {"pitch": +9, "rate": +8}),
    (r"한숨|지친|힘없|맥없|축 처", {"pitch": -8, "rate": -20, "vol": -22}),
    (r"버럭|소리치|고함|크게|화내|짜증|발끈", {"pitch": +7, "rate": +16, "vol": +12}),
    (r"단호|딱 잘라|못 박|확신|힘주어", {"pitch": -5, "rate": -12}),
    (r"급하게|빠르게|서둘러|다급|허둥", {"rate": +28}),
    (r"천천히|느리게|또박또박|차분", {"rate": -20}),
    (r"망설이|머뭇|주저|말끝을 흐|더듬", {"rate": -16, "pause": 420}),
    (r"놀라|깜짝|헉|당황", {"pitch": +11, "rate": +14}),
    (r"진지|무겁게|심각|굳은", {"pitch": -7, "rate": -14}),
    (r"비꼬|시니컬|비아냥|삐딱", {"pitch": -3, "rate": -10}),
    (r"^\s*(사이|침묵|정적|잠깐|멈춤|정색)\s*$", {"pause_only": 900}),
]
DIR_MAXLEN = 12


def direction_of(text):
    """지문이면 연기 지시를 돌려주고, 속마음 내용이면 None"""
    t = (text or "").strip()
    if not t or len(t) > DIR_MAXLEN:
        return None
    for pat, delta in DIRECTIONS:
        if re.search(pat, t):
            return delta
    return None

CONTAINERS = ("act", "dir", "l", "sum", "end")


class MeetingParser(HTMLParser):
    """회의록에서 읽을 조각을 화면 순서대로 뽑는다. meeting.html 의 JS 와 같은 순서."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.items = []          # {el_index, kind, role, text}
        self.el_index = -1       # .act/.dir/.l/.sum/.end 를 만난 순번 (JS 와 일치)
        self.stack = []          # (tag, classes)
        self.cur = None          # 현재 컨테이너 정보
        self.buf = []            # 일반 텍스트 모으는 곳
        self.grab = None         # 'who' | 'think' | 'no' | 'h2' | 'li' 수집 중

    # -- 도우미 ---------------------------------------------------------
    def _classes(self, attrs):
        for k, v in attrs:
            if k == "class":
                return (v or "").split()
        return []

    def _flush_text(self):
        """모아둔 일반 텍스트를 대사로 확정"""
        if not self.cur:
            self.buf = []
            return
        t = clean(" ".join(self.buf))
        self.buf = []
        if not t:
            return
        kind = "line" if self.cur["type"] == "l" else "narr"
        self.items.append({
            "el_index": self.cur["el_index"],
            "kind": kind,
            "role": self.cur["role"],
            "text": t,
        })

    # -- 파서 콜백 -------------------------------------------------------
    def handle_starttag(self, tag, attrs):
        cls = self._classes(attrs)
        self.stack.append((tag, cls))

        # 우리가 넣은 ▶ 버튼은 무시
        if "ttsbtn" in cls:
            self.grab = "skip"
            return

        # 컨테이너 진입
        ctype = next((c for c in CONTAINERS if c in cls), None)
        if ctype and self.cur is None:
            self.el_index += 1
            role = next((r for r in CAST if r in cls), None) if ctype == "l" else None
            self.cur = {"type": ctype, "role": role, "el_index": self.el_index}
            self.buf = []
            return

        if self.cur is None:
            return
        # 컨테이너 안의 특수 조각
        if "who" in cls:
            self._flush_text()
            self.grab = "who"
        elif "think" in cls or "beat" in cls:
            self._flush_text()
            self.grab = "think"
        elif self.cur["type"] == "act" and ("no" in cls or tag == "h2"):
            self.grab = "actline"
        elif self.cur["type"] == "sum" and tag == "li":
            self.grab = "li"

    def handle_endtag(self, tag):
        if self.grab in ("who", "think", "actline", "li", "skip"):
            txt = clean(" ".join(self.buf))
            self.buf = []
            g, self.grab = self.grab, None
            if g == "skip" or not txt or self.cur is None:
                pass
            elif g == "who":
                self.items.append({"el_index": self.cur["el_index"], "kind": "who",
                                   "role": self.cur["role"], "text": txt})
            elif g == "think":
                self.items.append({"el_index": self.cur["el_index"], "kind": "think",
                                   "role": self.cur["role"], "text": txt})
            else:  # actline, li → 해설자
                self.items.append({"el_index": self.cur["el_index"], "kind": "narr",
                                   "role": None, "text": txt})
        # 컨테이너 종료 판단
        if self.stack:
            _, cls = self.stack.pop()
            if self.cur and next((c for c in CONTAINERS if c in cls), None) == self.cur["type"]:
                self._flush_text()
                self.cur = None

    def handle_data(self, data):
        if self.cur is not None or self.grab:
            self.buf.append(data)


def clean(s: str) -> str:
    """읽기 좋게 — 따옴표·괄호·이모지·도형기호 제거 (JS ttsClean 과 같은 규칙)"""
    if not s:
        return ""
    s = re.sub(r"[\U0001F300-\U0001FAFF☀-➿️←-⇿■-◿⬀-⯿]", " ", s)
    s = re.sub(r"[\"“”'‘’()\[\]（）]", " ", s)
    s = re.sub(r"[·•]", ", ", s)
    return re.sub(r"\s+", " ", s).strip()


async def all_voice_names():
    """엣지가 지금 제공하는 성우 이름 전체 — 지정한 성우가 살아있는지 확인하는 용도"""
    try:
        return {v["ShortName"] for v in await edge_tts.list_voices()}
    except Exception:
        return set()


async def korean_voices():
    """엣지 음성 목록에서 한국어만 골라 남/여로 나눈다 (이름을 미리 박지 않고 그때그때 조회)"""
    try:
        vs = await edge_tts.list_voices()
    except Exception as e:
        sys.exit(
            "\n성우 목록을 가져오지 못했습니다.\n"
            "  원인: 인터넷에 연결되지 않았거나, 회사·기관 네트워크가 막고 있습니다.\n"
            "  (녹음할 때만 인터넷이 필요하고, 만든 뒤 듣는 건 오프라인에서 됩니다.)\n"
            "  해볼 것: 와이파이 확인 → 다시 실행. 회사망이면 개인 네트워크에서 시도.\n"
            f"  자세한 내용: {type(e).__name__}: {e}\n"
        )
    ko = [v for v in vs if str(v.get("Locale", "")).lower().startswith("ko")]
    if not ko:
        raise SystemExit("한국어 음성을 못 찾았습니다. 인터넷 연결을 확인해 주세요.")
    male = [v["ShortName"] for v in ko if v.get("Gender") == "Male"]
    female = [v["ShortName"] for v in ko if v.get("Gender") == "Female"]
    # 한쪽이 없으면 있는 쪽으로 대체 (성별 구분은 못 하지만 높낮이로는 구분됨)
    if not male:
        male = female[:]
    if not female:
        female = male[:]
    return male, female


def assign_voices(male, female, available=None):
    """멤버별로 실제 성우를 배정.

    CAST 에 'voice' 가 적힌 멤버는 그 성우를 그대로 쓴다 (CEO 가 직접 고른 목소리).
    적혀 있지 않은 멤버만 성별 풀에서 돌려 쓴다.

    ⚠️ 지정 멤버가 풀 순번을 건너뛰면 나머지 멤버의 배정이 밀려서 목소리가 바뀐다.
       그래서 순번은 CAST 순서대로 *모든* 멤버에 대해 돌리고, 지정된 멤버는
       그 순번을 소모한 뒤 자기 성우로 덮어쓴다. 이렇게 하면 한 명을 바꿔도
       다른 멤버의 목소리는 그대로 유지된다.
    """
    out, mi, fi = {}, 0, 0
    for role, c in CAST.items():
        pool, idx = (male, mi) if c["gender"] == "Male" else (female, fi)
        pick = pool[idx % len(pool)]
        if c["gender"] == "Male":
            mi += 1
        else:
            fi += 1

        want = c.get("voice")
        if want:
            if available and want not in available:
                print(f"  ⚠ {c['name']} 로 지정한 성우 '{want}' 를 지금 쓸 수 없어 "
                      f"'{pick}' 로 대체합니다. (마이크로소프트가 이름을 바꿨거나 없앤 경우)")
            else:
                pick = want
        out[role] = pick

    want_narr = NARRATOR.get("voice")
    if want_narr and (not available or want_narr in available):
        out["_narr"] = want_narr
    else:
        out["_narr"] = (female if NARRATOR["gender"] == "Female" else male)[0]
    return out


def apply_directions(items):
    """괄호 지문을 골라내 그 줄의 말투로 바꾼다 (지문 자체는 읽지 않는다)"""
    out, i = [], 0
    while i < len(items):
        j = i
        while j < len(items) and items[j]["el_index"] == items[i]["el_index"]:
            j += 1
        group, act, kept = items[i:j], {}, []
        for it in group:
            if it["kind"] == "think":
                d = direction_of(it["text"])
                if d:
                    if d.get("pause_only"):          # (사이) → 소리 없이 쉼
                        kept.append({**it, "kind": "pause", "ms": d["pause_only"], "text": ""})
                    else:
                        for k, v in d.items():
                            act[k] = max(act.get(k, 0), v) if k == "pause" else act.get(k, 0) + v
                    continue
            kept.append(it)
        for it in kept:
            if act and it["kind"] in ("line", "think"):
                it = {**it, "act": act}
            out.append(it)
        i = j
    return out


def prosody(item):
    """조각별 목소리 파라미터 (성우 + 높낮이 + 속도 + 크기)"""
    role, kind = item.get("role"), item["kind"]
    if kind == "narr" or not role or role not in CAST:
        p, r, vol = NARRATOR["pitch"], NARRATOR["rate"], 0
        key = "_narr"
    else:
        c = CAST[role]
        p, r, vol, key = c["pitch"], c["rate"], 0, role
        if kind == "who":
            r += 4
            vol -= 8
        elif kind == "think":
            p += THINK_PITCH
            r += THINK_RATE
            vol += THINK_VOL
    # 괄호 지문에서 뽑은 연기 지시 (이름 부르는 조각엔 적용 안 함)
    act = item.get("act")
    if act and kind != "who":
        p += act.get("pitch", 0)
        r += act.get("rate", 0)
        vol += act.get("vol", 0)
    # 엣지 음성이 받아주는 범위로 자른다
    p = max(-50, min(50, p))
    r = max(-90, min(100, r))
    vol = max(-90, min(50, vol))
    return key, p, r, vol


VOICE_START = "<!-- VOICES_START (voice-record.py 가 자동 생성 — 손대지 마세요) -->"
VOICE_END = "<!-- VOICES_END -->"


def is_git_tracked(path):
    """이 파일이 git 이 추적하는 파일인가 (커밋하면 레포에 그대로 쌓이는가)"""
    import subprocess
    try:
        r = subprocess.run(
            ["git", "ls-files", "--error-unmatch", "--", os.path.basename(path)],
            cwd=os.path.dirname(os.path.abspath(path)),
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10,
        )
        return r.returncode == 0
    except Exception:
        return False


def inject(html_path, manifest, folder, out_path=None):
    """음성을 회의록 HTML 에 심는다. 다시 녹음하면 이 블록만 갈아 끼운다.
    out_path 를 주면 원본은 그대로 두고 그 경로에 음성이 담긴 사본을 만든다."""
    html = open(html_path, encoding="utf-8").read()
    items = []
    for i in manifest["items"]:
        if "pause" in i:
            items.append({"p": i["pause"], "e": i["elIndex"]})
        elif "data" in i:                 # 파일 하나로 합치는 방식 — 음성을 HTML 안에 넣음
            items.append({"d": i["data"], "e": i["elIndex"]})
        else:
            items.append({"f": i["file"], "e": i["elIndex"]})
    slim = {"dir": folder, "items": items, "voices": manifest["voices"]}
    block = (
        VOICE_START
        + '\n<script>window.__ttsManifest='
        + json.dumps(slim, ensure_ascii=False, separators=(",", ":"))
        + ";</script>\n"
        + VOICE_END
    )
    if VOICE_START in html and VOICE_END in html:
        s = html.index(VOICE_START)
        e = html.index(VOICE_END) + len(VOICE_END)
        html = html[:s] + block + html[e:]
    elif "</body>" in html:
        html = html.replace("</body>", block + "\n</body>", 1)
    else:
        html += "\n" + block + "\n"
    dest = out_path or html_path
    open(dest, "w", encoding="utf-8").write(html)
    print(f"회의록에 음성 목록을 심었습니다: {os.path.basename(dest)}")
    return dest


async def main():
    ap = argparse.ArgumentParser(description="강팀 회의록을 진짜 목소리로 녹음")
    ap.add_argument("meeting", help="meeting.html 경로")
    ap.add_argument("--out", default=None, help="음성 폴더 (--split 일 때만 씀. 기본: 회의록 옆 voices/)")
    ap.add_argument("--split", action="store_true",
                    help="음성을 mp3 파일로 따로 저장 (기본은 meeting.html 안에 넣어 파일 하나로 만듦)")
    ap.add_argument("--to", default=None, metavar="경로",
                    help="음성이 담긴 사본을 이 경로에 만든다 (원본 meeting.html 은 그대로)")
    ap.add_argument("--in-place", action="store_true",
                    help="git 이 추적하는 회의록이어도 그 파일에 직접 음성을 넣는다")
    args = ap.parse_args()
    embed = not args.split

    path = os.path.abspath(args.meeting)
    if not os.path.exists(path):
        sys.exit(f"파일이 없습니다: {path}")
    outdir = args.out or os.path.join(os.path.dirname(path), "voices")

    # ── 음성을 어느 파일에 넣을지 결정 ────────────────────────────────
    # 음성은 base64 로 바뀌어 파일에 그대로 박히므로 회의록이 6~8MB 로 커진다.
    # 그 회의록이 git 이 추적하는 파일이면 커밋할 때마다 그 용량이 레포 역사에
    # 영구히 쌓인다. 그래서 추적 중인 파일은 건드리지 않고 옆에 사본을 만든다.
    out_path = os.path.abspath(args.to) if args.to else None
    if embed and out_path is None and not args.in_place and is_git_tracked(path):
        out_path = os.path.join(os.path.dirname(path), "meeting-voice.html")
        print(
            "이 회의록은 git 이 추적하는 파일입니다.\n"
            "  음성을 그 파일에 직접 넣으면 회의록이 6~8MB 로 커지고, 커밋할 때\n"
            "  그 용량이 레포 역사에 영구히 남습니다. 그래서 원본은 그대로 두고\n"
            "  옆에 meeting-voice.html 을 만들어 거기에 음성을 넣겠습니다.\n"
            "  (원본에 직접 넣고 싶으면 --in-place 를 주세요.)\n"
        )

    html = open(path, encoding="utf-8").read()
    p = MeetingParser()
    p.feed(html)
    items = apply_directions([i for i in p.items if i["text"]])
    items = [i for i in items if i["text"] or i["kind"] == "pause"]
    if not items:
        sys.exit("읽을 대사가 없습니다. 회의록이 아직 비어 있는 것 같아요.")

    male, female = await korean_voices()
    voices = assign_voices(male, female, available=await all_voice_names())
    print(f"한국어 성우 — 남성 {len(male)}명, 여성 {len(female)}명")
    for role, c in CAST.items():
        print(f"  {c['name']:<6} {voices[role]}  (높낮이 {c['pitch']:+d}Hz, 속도 {c['rate']:+d}%)")
    mode = "회의록 파일 하나에 넣기" if embed else f"따로 저장 → {outdir}"
    print(f"\n대사 {len(items)}개 녹음 시작 ({mode})")

    if not embed:
        os.makedirs(outdir, exist_ok=True)
    manifest = {"version": 1, "engine": "edge-tts", "voices": voices, "items": []}
    total_bytes = 0

    for n, item in enumerate(items, 1):
        if item["kind"] == "pause":                  # (사이) → 파일 없이 쉼만 기록
            manifest["items"].append({"pause": item.get("ms", 800), "elIndex": item["el_index"]})
            print(f"  [{n}/{len(items)}] (쉼 {item.get('ms', 800)}ms)")
            continue
        key, pitch, rate, vol = prosody(item)
        comm = edge_tts.Communicate(
            item["text"], voices[key],
            rate=f"{rate:+d}%", pitch=f"{pitch:+d}Hz", volume=f"{vol:+d}%",
        )
        audio = bytearray()
        async for chunk in comm.stream():
            if chunk.get("type") == "audio" and chunk.get("data"):
                audio.extend(chunk["data"])
        if not audio:
            print(f"  [{n}/{len(items)}] ⚠ 소리가 비어 건너뜀: {item['text'][:24]}")
            continue
        total_bytes += len(audio)

        rec = {"elIndex": item["el_index"], "kind": item["kind"],
               "role": item["role"], "text": item["text"]}
        if embed:
            rec["data"] = "data:audio/mpeg;base64," + base64.b64encode(bytes(audio)).decode("ascii")
        else:
            fname = f"{n:03d}.mp3"
            with open(os.path.join(outdir, fname), "wb") as f:
                f.write(audio)
            rec["file"] = fname
        manifest["items"].append(rec)
        print(f"  [{n}/{len(items)}] {len(audio)//1024}KB  {item['text'][:32]}")

    if not embed:
        with open(os.path.join(outdir, "manifest.json"), "w", encoding="utf-8") as f:
            json.dump({**manifest, "items": [
                {k: v for k, v in i.items() if k != "data"} for i in manifest["items"]]},
                f, ensure_ascii=False, indent=1)

    # 회의록 HTML 에 심는다. (별도 파일로 두고 불러오면 file:// 에서 브라우저가 막는다)
    dest = inject(path, manifest, os.path.basename(outdir), out_path=out_path if embed else None)

    size_mb = os.path.getsize(dest) / 1048576
    print(f"\n완료 — 음성 {total_bytes//1024}KB")
    if embed:
        print(f"  회의록 한 파일에 다 들어갔습니다: {os.path.basename(dest)} ({size_mb:.1f}MB)")
        print("  이 파일 하나만 있으면 어디서든 재생됩니다 (voices 폴더 필요 없음).")
        print("\n📱 아이폰에서 듣는 법 — 둘 중 편한 걸로:")
        print("  1) 텔레그램:  bash scripts/send-meeting.sh   → 폰에서 받은 파일 열고 ▶")
        print("  2) 카톡·에어드롭·메일로 이 파일 하나만 보내도 됩니다.")
    else:
        print(f"  {outdir}/ 에 mp3 저장 + manifest.json")
        print("  ⚠️ 이 방식은 meeting.html 과 voices 폴더를 *같이* 옮겨야 소리가 납니다.")
        print("     아이폰으로 보낼 거면 --split 없이 다시 실행하세요 (파일 하나로 합쳐집니다).")


if __name__ == "__main__":
    asyncio.run(main())
