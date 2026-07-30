#!/usr/bin/env bash
# 회의록을 진짜 목소리로 녹음 — 경로 타이핑 없이 한 줄로
#
#   bash scripts/voice.sh              ← 제일 최근 회의록을 녹음
#   bash scripts/voice.sh 2026-07-30   ← 그 날짜 회의록을 녹음
#
# 하는 일: 파이썬 확인 → edge-tts 없으면 설치 → 최신 회의록 찾아서 녹음
set -uo pipefail

# ── 1. 파이썬 찾기 ────────────────────────────────────────────────
PY=""
for c in python3 python py; do
  if command -v "$c" >/dev/null 2>&1; then
    if "$c" -c 'import sys; sys.exit(0 if sys.version_info>=(3,8) else 1)' 2>/dev/null; then PY="$c"; break; fi
  fi
done
if [[ -z "$PY" ]]; then
  echo "❌ 파이썬 3.8 이상이 필요해요."
  echo "   윈도우: https://www.python.org/downloads/ 에서 설치 (설치 중 'Add to PATH' 꼭 체크)"
  echo "   맥:     터미널에 brew install python3"
  exit 1
fi

# ── 2. edge-tts 확인 (없으면 설치) ────────────────────────────────
if ! "$PY" -c "import edge_tts" 2>/dev/null; then
  echo "🔧 음성 도구(edge-tts)를 설치할게요… (무료, 한 번만)"
  "$PY" -m pip install --quiet --disable-pip-version-check edge-tts || {
    echo "❌ 설치 실패. 인터넷 연결을 확인하고 다시 해보세요."; exit 1; }
  echo "✅ 설치 완료"
fi

# ── 3. 녹음할 회의록 찾기 ─────────────────────────────────────────
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SELF_DIR/.." && pwd)"

# 파이썬 도우미는 항상 이 스크립트 *옆*에 있다. 설치 형태에 따라 위치가 달라진다.
#   · 레포에 설치: <레포>/scripts/voice.sh   옆에 voice-record.py
#   · 전역에 설치: ~/.claude/bin/voice.sh    옆에 voice-record.py
# 예전에는 "<루트>/scripts/" 만 봤는데, 전역 설치본은 bin/ 에 들어가므로 못 찾았다.
helper() {
  local name="$1" cand
  for cand in "$SELF_DIR/$name" "$ROOT/scripts/$name"; do
    if [[ -f "$cand" ]]; then printf '%s' "$cand"; return 0; fi
  done
  echo "❌ $name 를 찾을 수 없어요. 찾아본 곳:" >&2
  echo "     $SELF_DIR/$name" >&2
  echo "     $ROOT/scripts/$name" >&2
  echo "   강팀을 다시 불러오면 채워집니다:  bash ~/.claude/bin/pull-team.sh" >&2
  return 1
}
BASE="$ROOT/.ai-team/meetings"
[[ -d "$BASE" ]] || BASE="$PWD/.ai-team/meetings"
if [[ ! -d "$BASE" ]]; then
  echo "❌ 회의록 폴더(.ai-team/meetings)가 없어요."
  echo "   먼저 회의를 해야 해요 — 클로드에게 '회의 시작해' 라고 하세요."
  exit 1
fi

FILTER="${1:-}"
TARGET=""
while IFS= read -r d; do
  [[ -f "$d/meeting.html" ]] || continue
  [[ -n "$FILTER" && "$(basename "$d")" != *"$FILTER"* ]] && continue
  TARGET="$d"; break
done < <(ls -1dt "$BASE"/*/ 2>/dev/null)

if [[ -z "$TARGET" ]]; then
  echo "❌ 녹음할 회의록을 못 찾았어요${FILTER:+ (조건: $FILTER)}."
  echo "   있는 회의록:"
  ls -1t "$BASE" 2>/dev/null | head -10 | sed 's/^/     /'
  exit 1
fi

echo "🎙  녹음할 회의록: $(basename "$TARGET")"
echo ""

# ── 4. ▶ 플레이어가 없는 예전 회의록이면 먼저 붙인다 ──────────────
# 회의록은 만들어질 때 템플릿을 복사하므로, 읽어주기 기능이 추가되기 전에
# 만든 회의록엔 재생 버튼이 아예 없다. 녹음만 하면 소리를 들을 방법이 없다.
if ! grep -q "ttsToggle(" "$TARGET/meeting.html" 2>/dev/null; then
  echo "이 회의록엔 ▶ 재생 버튼이 없어서 먼저 붙일게요 (예전 템플릿으로 만든 회의록)."
  UPGRADE=$(helper voice-upgrade.py) || exit 1
  "$PY" "$UPGRADE" "$TARGET/meeting.html" || {
    echo "❌ 플레이어를 붙이지 못했어요. 위 메시지를 확인해 주세요."; exit 1; }
  echo ""
fi

RECORD=$(helper voice-record.py) || exit 1
"$PY" "$RECORD" "$TARGET/meeting.html"
