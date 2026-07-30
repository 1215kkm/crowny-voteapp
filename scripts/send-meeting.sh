#!/usr/bin/env bash
# send-meeting.sh — 강팀 회의록을 텔레그램으로 전송
#
# 사용:
#   bash send-meeting.sh [회의 폴더 경로]
#     - 인자가 없으면 ./.ai-team/meetings/ 안에서 *가장 최근* 폴더 자동 선택
#
# 전송 내용 (개인 봇 → 본인 DM):
#   1) 텍스트 요약  (마감 턴의 SUMMARY 마커 안 내용)
#   2) meeting.html  (sendDocument)
#   3) mockup.html   (sendDocument · 있을 때만)
#   4) meeting/mockup PNG 스크린샷 (헤드리스 크롬 있을 때만)
#
# 설정:
#   ~/.claude/team-config/telegram.env 에서 TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID 로드.
#   처음이면 `bash setup-telegram.sh` 실행해서 생성.
#
# 옵션:
#   --dry-run    실제 전송 없이 어떤 내용 갈지만 출력
#   --no-png     PNG 스크린샷 생략
#   --no-html    HTML 파일 첨부 생략
#   --quiet      성공 메시지 최소화

set -euo pipefail

DRY_RUN=0
NO_PNG=0
NO_HTML=0
NO_TEXT=0
QUIET=0
MEETING_DIR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --no-png)  NO_PNG=1; shift ;;
    --no-html) NO_HTML=1; shift ;;
    --no-text) NO_TEXT=1; shift ;;   # 요약 메시지는 건너뛰고 파일만 (전송 실패 후 다시 보낼 때)
    --quiet)   QUIET=1; shift ;;
    -h|--help)
      sed -n '2,/^set -e/p' "$0" | sed 's/^# \{0,1\}//;/^set -e/d'
      exit 0 ;;
    *) MEETING_DIR="$1"; shift ;;
  esac
done

log() { [[ $QUIET -eq 0 ]] && echo "$@" >&2 || true; }
err() { echo "오류: $*" >&2; exit 1; }

# ---------- 1. 회의 폴더 찾기 ----------
if [[ -z "$MEETING_DIR" ]]; then
  if [[ ! -d ".ai-team/meetings" ]]; then
    err "회의 폴더가 없습니다. 인자로 경로를 주거나 .ai-team/meetings/ 가 있는 위치에서 실행해주세요."
  fi
  MEETING_DIR=$(find .ai-team/meetings -mindepth 1 -maxdepth 1 -type d -print0 \
    | xargs -0 ls -dt 2>/dev/null | head -1 || true)
  [[ -z "$MEETING_DIR" ]] && err ".ai-team/meetings/ 안에 회의 폴더가 없습니다."
fi

[[ -d "$MEETING_DIR" ]] || err "회의 폴더 없음: $MEETING_DIR"
MEETING_HTML="$MEETING_DIR/meeting.html"
MOCKUP_HTML="$MEETING_DIR/mockup.html"
[[ -f "$MEETING_HTML" ]] || err "meeting.html 없음: $MEETING_HTML"

# 성우 목소리가 녹음된 사본이 있으면 그걸 보낸다.
# (voice-record.py 는 git 이 추적하는 회의록을 부풀리지 않으려고 음성을
#  meeting-voice.html 이라는 사본에 넣는다. 폰에서 들으려면 그 사본이 필요하다.)
if [[ -f "$MEETING_DIR/meeting-voice.html" ]]; then
  MEETING_HTML="$MEETING_DIR/meeting-voice.html"
  log "성우 목소리가 녹음된 사본을 보냅니다: meeting-voice.html"
fi

# 회의 제목 추출
TITLE=$(grep -m1 -oE '<title>[^<]*</title>' "$MEETING_HTML" | sed 's/<[^>]*>//g' || echo "강팀 회의")
DATE=$(grep -m1 -oE '날짜: [0-9-]+' "$MEETING_HTML" | sed 's/날짜: //' || date +%F)

# 프로젝트명 추출 — 한 텔레그램 채팅으로 여러 프로젝트 회의록이 들어와도 한눈에 구분되도록
PROJECT_NAME=""
if git rev-parse --show-toplevel >/dev/null 2>&1; then
  PROJECT_NAME="$(basename "$(git rev-parse --show-toplevel)")"
  REMOTE_URL="$(git config --get remote.origin.url 2>/dev/null || true)"
  if [[ -n "$REMOTE_URL" ]]; then
    REPO_SLUG="$(echo "$REMOTE_URL" | sed -E 's#.*[:/]([^/]+/[^/.]+)(\.git)?$#\1#')"
    [[ -n "$REPO_SLUG" && "$REPO_SLUG" != "$REMOTE_URL" ]] && PROJECT_NAME="$REPO_SLUG"
  fi
fi
[[ -z "$PROJECT_NAME" ]] && PROJECT_NAME="$(basename "$(pwd)")"

log "프로젝트: $PROJECT_NAME"
log "회의: $TITLE ($DATE)"
log "폴더: $MEETING_DIR"

# ---------- 2. 텔레그램 설정 로드 ----------
CONFIG="$HOME/.claude/team-config/telegram.env"
if [[ $DRY_RUN -eq 0 ]]; then
  # 우선순위: 1) 환경변수, 2) ~/.claude/team-config/telegram.env
  if [[ -z "${TELEGRAM_BOT_TOKEN:-}" || -z "${TELEGRAM_CHAT_ID:-}" ]]; then
    if [[ -f "$CONFIG" ]]; then
      # shellcheck disable=SC1090
      source "$CONFIG"
    fi
  fi
  [[ -n "${TELEGRAM_BOT_TOKEN:-}" ]] || err "TELEGRAM_BOT_TOKEN 없음. 'bash setup-telegram.sh' 실행하거나 환경변수로 주입."
  [[ -n "${TELEGRAM_CHAT_ID:-}"   ]] || err "TELEGRAM_CHAT_ID 없음. 'bash setup-telegram.sh' 실행하거나 환경변수로 주입."
fi

API="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN:-DRY}"

# ---------- 3. 요약 추출 ----------
extract_summary() {
  # 마커는 두 형태가 섞여 있다.
  #   (가) 템플릿·실제 회의록:  "<!-- SUMMARY_START"  …  "SUMMARY_END -->"
  #   (나) 예전 표기:           "<!-- SUMMARY_START -->" … "<!-- SUMMARY_END -->"
  # 예전에는 (나)만 찾아서 (가)로 쓰인 회의록의 요약이 전부 빈 채로 발송됐다.
  # 줄 시작에 붙여서 찾는다 — 템플릿 설명문의 "SUMMARY_START ~ SUMMARY_END 마커는…"
  # 같은 문장에 걸려 엉뚱한 구간을 잡지 않도록.
  awk '
    /^[[:space:]]*<!--[[:space:]]*SUMMARY_START/       { flag=1; next }
    /^[[:space:]]*(<!--[[:space:]]*)?SUMMARY_END/      { flag=0 }
    flag
  ' "$MEETING_HTML" \
    | sed -e 's/<br[^>]*>/\n/gi' -e 's/<\/li>/\n/gi' -e 's/<li[^>]*>/• /gi' \
          -e 's/<\/h[1-6]>/\n/gi' -e 's/<h[1-6][^>]*>/\n■ /gi' \
          -e 's/<[^>]*>//g' \
    | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
    | awk 'NF || prev { print; prev=NF } NF==0 { prev=0 }'
}

SUMMARY=$(extract_summary)
if [[ -z "$SUMMARY" ]]; then
  # 폴백: 본문 첫 줄 + "(요약 마커 비어있음)"
  SUMMARY="(SUMMARY 마커가 비어있습니다. 강팀장이 마감 턴에 채워주세요.)"
fi

# 텔레그램 메시지 본문 (HTML 모드)
# 헤더는 한 줄로 "프로젝트 · 주제 · 날짜" — 여러 프로젝트 회의록이 한 채팅에 와도 즉시 구분
HEADER="<b>📦 ${PROJECT_NAME}</b>
🎯 <b>강팀 회의록</b> · <i>${TITLE}</i>
<code>${DATE}</code>
"
MESSAGE="${HEADER}
${SUMMARY}"

# 4096자 컷
if [[ ${#MESSAGE} -gt 3900 ]]; then
  MESSAGE="${MESSAGE:0:3900}
...(잘림 — 전체는 첨부된 meeting.html 참조)"
fi

# ---------- 4. PNG 스크린샷 (선택) ----------
SCREEN_MEETING=""
SCREEN_MOCKUP=""
render_png() {
  local src="$1" out="$2"
  local browser=""
  for cand in chromium chromium-browser google-chrome chrome "google-chrome-stable"; do
    if command -v "$cand" >/dev/null 2>&1; then browser="$cand"; break; fi
  done
  # 윈도우(Git Bash)에서는 크롬·엣지가 PATH 에 없고 Program Files 에 설치된다.
  # 그래서 이름만 찾으면 항상 실패하고 PNG 가 조용히 빠진다 — 설치 경로도 직접 본다.
  if [[ -z "$browser" ]]; then
    local wcand
    for wcand in \
      "/c/Program Files/Google/Chrome/Application/chrome.exe" \
      "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe" \
      "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
      "/c/Program Files/Microsoft/Edge/Application/msedge.exe"; do
      if [[ -x "$wcand" ]]; then browser="$wcand"; break; fi
    done
  fi
  [[ -z "$browser" ]] && return 1

  "$browser" --headless --disable-gpu --no-sandbox \
             --hide-scrollbars --virtual-time-budget=3000 \
             --window-size=1200,1800 \
             --screenshot="$out" \
             "file://$(cd "$(dirname "$src")" && pwd)/$(basename "$src")" \
             >/dev/null 2>&1 || return 1
  [[ -s "$out" ]]
}

# ── 업로드용 임시 폴더 ────────────────────────────────────────────
# 회의 폴더명이 한글이라 윈도우(Git Bash)의 curl 이 그 경로를 열지 못한다
# — curl: (26) Failed to open/read local data. 그래서 올릴 파일을 ASCII 경로로
# 옮겨 두고 그 사본을 올린다. 텔레그램에 보이는 파일 이름은 그대로 유지된다.
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

stage_for_upload() {
  local src="$1" name
  name=$(basename "$src")
  # 파일 이름 자체에 ASCII 아닌 글자가 있으면 그것까지 바꾼다
  case "$name" in
    *[!\ -~]*) name="upload-$(printf '%s' "$name" | sha1sum | cut -c1-8).${name##*.}" ;;
  esac
  local out="$src"
  cp -f "$src" "$TMP_DIR/$name" 2>/dev/null && out="$TMP_DIR/$name"

  # 윈도우(Git Bash)의 curl 은 네이티브 프로그램이라 /tmp/... 같은 POSIX 경로를
  # 그대로는 못 읽는다. 보통은 MSYS 가 알아서 C:/... 로 바꿔주지만,
  # "-F document=@경로;type=text/html" 처럼 세미콜론이 붙으면 그 자동 변환이
  # 걸리지 않아 curl 이 POSIX 경로를 받고 실패한다 (curl: (26)).
  # 그래서 여기서 직접 C:/... 형태로 바꿔 넘긴다.
  if command -v cygpath >/dev/null 2>&1; then
    out=$(cygpath -m "$out" 2>/dev/null || printf '%s' "$out")
  fi
  printf '%s' "$out"
}

if [[ $NO_PNG -eq 0 ]]; then
  if render_png "$MEETING_HTML" "$TMP_DIR/meeting.png"; then
    SCREEN_MEETING="$TMP_DIR/meeting.png"
    log "✓ meeting.png 렌더링"
  else
    log "⚠ 헤드리스 크롬 없음 또는 렌더링 실패 — PNG 스킵"
  fi

  if [[ -f "$MOCKUP_HTML" ]]; then
    if render_png "$MOCKUP_HTML" "$TMP_DIR/mockup.png"; then
      SCREEN_MOCKUP="$TMP_DIR/mockup.png"
      log "✓ mockup.png 렌더링"
    fi
  fi
fi

# ---------- 5. Dry run 출력 ----------
if [[ $DRY_RUN -eq 1 ]]; then
  echo "── DRY RUN ──"
  echo "[메시지]"
  echo "$MESSAGE"
  echo
  echo "[첨부]"
  [[ $NO_HTML -eq 0 ]] && echo "  - $MEETING_HTML"
  [[ $NO_HTML -eq 0 && -f "$MOCKUP_HTML" ]] && echo "  - $MOCKUP_HTML"
  [[ -n "$SCREEN_MEETING" ]] && echo "  - $SCREEN_MEETING (PNG)"
  [[ -n "$SCREEN_MOCKUP"  ]] && echo "  - $SCREEN_MOCKUP (PNG)"
  exit 0
fi

# ---------- 6. 텔레그램 전송 ----------
tg_call() {
  local method="$1"; shift
  local resp
  resp=$(curl -sS --max-time 30 -X POST "$API/$method" "$@")
  if ! echo "$resp" | grep -q '"ok":true'; then
    echo "텔레그램 $method 실패:" >&2
    echo "$resp" >&2
    return 1
  fi
}

# Windows Git Bash curl은 비ASCII argv를 CP949로 망가뜨려 텔레그램이 UTF-8 거부함.
# JSON 본문을 파일로 직렬화해 --data-binary 로 보내면 우회 가능.
# 환경에 node가 있으면 JSON 경로, 아니면 기존 argv 경로 (mac/linux 회귀 방지).
HAVE_NODE=0
command -v node >/dev/null 2>&1 && HAVE_NODE=1

tg_send_message() {
  if [[ $HAVE_NODE -eq 1 ]]; then
    local json_tmp
    json_tmp=$(mktemp)
    TG_CHAT="$TELEGRAM_CHAT_ID" TG_TEXT="$MESSAGE" TG_KB="$KEYBOARD" \
      node -e '
        const fs=require("fs");
        const payload={
          chat_id: process.env.TG_CHAT,
          text: process.env.TG_TEXT,
          parse_mode: "HTML",
          disable_web_page_preview: true,
          reply_markup: JSON.parse(process.env.TG_KB)
        };
        fs.writeFileSync(1, JSON.stringify(payload));
      ' > "$json_tmp"
    local resp
    resp=$(curl -sS --max-time 30 -X POST "$API/sendMessage" \
      -H "Content-Type: application/json; charset=utf-8" \
      --data-binary "@$json_tmp")
    rm -f "$json_tmp"
    if ! echo "$resp" | grep -q '"ok":true'; then
      echo "텔레그램 sendMessage 실패:" >&2
      echo "$resp" >&2
      return 1
    fi
  else
    tg_call sendMessage \
      --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
      --data-urlencode "text=${MESSAGE}" \
      --data-urlencode "parse_mode=HTML" \
      --data-urlencode "disable_web_page_preview=true" \
      --data-urlencode "reply_markup=${KEYBOARD}"
  fi
}

# 한국어/이모지 캡션을 UTF-8 임시 파일에 써서 -F "caption=<file" 로 넘기는 헬퍼.
# 사용: cap_arg=$(tg_caption_file "📋 회의 흐름"); tg_call sendPhoto ... -F "caption=<${cap_arg}"
tg_caption_file() {
  local f
  f=$(mktemp)
  printf '%s' "$1" > "$f"
  echo "$f"
}

# 회의 식별자 = 폴더명 (callback_data 에 박아 polling 에서 매칭)
MEETING_ID=$(basename "$MEETING_DIR")

# 텔레그램은 버튼의 callback_data 를 1~64byte 로 제한한다.
# 여기서 가장 긴 접두어가 "learn-all:" (10byte) 이므로 식별자는 54byte 안에 들어가야 한다.
# 그런데 회의 폴더명은 한글이라 바이트 수로 자르면 글자 중간이 잘려 깨진 UTF-8 이 되고,
# 텔레그램이 그걸 BUTTON_DATA_INVALID 로 거부한다 (버튼이 붙은 메시지 전체가 안 나감).
# 그래서 날짜(사람이 알아보는 부분) + 짧은 해시(같은 날 회의 구분) 로 ASCII 화한다.
# 이 식별자는 telegram-poll.yml 에서 이슈 제목·본문에 표시하는 용도라 폴더를 찾는 데는 쓰지 않는다.
MEETING_DATE=$(printf '%s' "$MEETING_ID" | grep -oE '^[0-9]{4}-[0-9]{2}-[0-9]{2}' || true)
MEETING_HASH=$(printf '%s' "$MEETING_ID" | sha1sum | cut -c1-8)
SHORT_ID="${MEETING_DATE:-meeting}-${MEETING_HASH}"

# 안전장치 — 접두어까지 더해도 64byte 를 넘지 않는지 확인
LONGEST_PREFIX="learn-all:"
CB_BYTES=$(printf '%s%s' "$LONGEST_PREFIX" "$SHORT_ID" | wc -c)
if [[ $CB_BYTES -gt 64 ]]; then
  err "버튼 데이터가 ${CB_BYTES}byte 로 텔레그램 한도(64byte)를 넘습니다. SHORT_ID 생성 규칙을 줄여주세요."
fi

# inline keyboard JSON
# 버튼: 진행 / 보류 / 🧠 결정 저장 / 🧠 전체 저장 / 회의 다시
KEYBOARD=$(cat <<JSON
{"inline_keyboard":[
  [
    {"text":"✅ 진행","callback_data":"go:${SHORT_ID}"},
    {"text":"⏸ 보류","callback_data":"pause:${SHORT_ID}"}
  ],
  [
    {"text":"🧠 결정만 강팀에 저장","callback_data":"learn-d:${SHORT_ID}"},
    {"text":"🧠 전체 저장","callback_data":"learn-all:${SHORT_ID}"}
  ],
  [
    {"text":"🔄 회의 다시","callback_data":"redo:${SHORT_ID}"}
  ]
]}
JSON
)

if [[ $NO_TEXT -eq 0 ]]; then
  log "→ 요약 텍스트 + 버튼 전송"
  tg_send_message
else
  log "  요약 텍스트 건너뜀 (--no-text)"
fi

if [[ $NO_HTML -eq 0 ]]; then
  MEETING_NAME=$(basename "$MEETING_HTML")
  MEETING_UPLOAD=$(stage_for_upload "$MEETING_HTML")
  log "→ ${MEETING_NAME} 전송"
  tg_call sendDocument \
    -F "chat_id=${TELEGRAM_CHAT_ID}" \
    -F "document=@${MEETING_UPLOAD};type=text/html" \
    -F "caption=${MEETING_NAME}"

  if [[ -f "$MOCKUP_HTML" ]]; then
    # mockup.html이 거의 비어있으면 (템플릿 그대로면) 스킵
    if grep -q "SCREENS_START" "$MOCKUP_HTML" && \
       ! awk '/<!-- SCREENS_START -->/,/<!-- SCREENS_END -->/' "$MOCKUP_HTML" \
         | grep -q 'class="screen"'; then
      log "  mockup.html 비어있음 — 스킵"
    else
      log "→ mockup.html 전송"
      MOCKUP_UPLOAD=$(stage_for_upload "$MOCKUP_HTML")
      tg_call sendDocument \
        -F "chat_id=${TELEGRAM_CHAT_ID}" \
        -F "document=@${MOCKUP_UPLOAD};type=text/html" \
        -F "caption=mockup.html"
    fi
  fi
fi

if [[ -n "$SCREEN_MEETING" ]]; then
  log "→ meeting PNG 전송"
  cap_meeting=$(tg_caption_file "📋 회의 흐름")
  tg_call sendPhoto \
    -F "chat_id=${TELEGRAM_CHAT_ID}" \
    -F "photo=@${SCREEN_MEETING}" \
    -F "caption=<${cap_meeting}"
  rm -f "$cap_meeting"
fi

if [[ -n "$SCREEN_MOCKUP" ]]; then
  log "→ mockup PNG 전송"
  cap_mockup=$(tg_caption_file "🎨 화면 목업")
  tg_call sendPhoto \
    -F "chat_id=${TELEGRAM_CHAT_ID}" \
    -F "photo=@${SCREEN_MOCKUP}" \
    -F "caption=<${cap_mockup}"
  rm -f "$cap_mockup"
fi

log "✓ 전송 완료 — 텔레그램에서 확인하세요."
