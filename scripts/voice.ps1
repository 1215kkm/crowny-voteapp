# 회의록을 진짜 목소리로 녹음 — 경로 타이핑 없이 한 줄로 (윈도우)
#
#   pwsh scripts/voice.ps1              ← 제일 최근 회의록을 녹음
#   pwsh scripts/voice.ps1 2026-07-30   ← 그 날짜 회의록을 녹음
#
# 하는 일: 파이썬 확인 → edge-tts 없으면 설치 → 최신 회의록 찾아서 녹음

param([string]$Filter = "")

$ErrorActionPreference = "Stop"

# ── 1. 파이썬 찾기 ────────────────────────────────────────────────
$PY = $null
foreach ($c in @("python", "python3", "py")) {
  $cmd = Get-Command $c -ErrorAction SilentlyContinue
  if ($cmd) {
    try {
      & $c -c "import sys; sys.exit(0 if sys.version_info>=(3,8) else 1)" 2>$null
      if ($LASTEXITCODE -eq 0) { $PY = $c; break }
    } catch { }
  }
}
if (-not $PY) {
  Write-Host "X 파이썬 3.8 이상이 필요해요." -ForegroundColor Red
  Write-Host "   https://www.python.org/downloads/ 에서 설치하세요."
  Write-Host "   설치 화면에서 'Add Python to PATH' 를 꼭 체크해야 해요."
  exit 1
}

# ── 2. edge-tts 확인 (없으면 설치) ────────────────────────────────
& $PY -c "import edge_tts" 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "설치 중: 음성 도구(edge-tts) — 무료, 한 번만" -ForegroundColor Yellow
  & $PY -m pip install --quiet --disable-pip-version-check edge-tts
  if ($LASTEXITCODE -ne 0) {
    Write-Host "X 설치 실패. 인터넷 연결을 확인하고 다시 해보세요." -ForegroundColor Red
    exit 1
  }
  Write-Host "OK 설치 완료" -ForegroundColor Green
}

# ── 3. 녹음할 회의록 찾기 ─────────────────────────────────────────
$root = Split-Path -Parent $PSScriptRoot

# 파이썬 도우미는 항상 이 스크립트 *옆*에 있다. 설치 형태에 따라 위치가 달라진다.
#   · 레포에 설치: <레포>\scripts\voice.ps1  옆에 voice-record.py
#   · 전역에 설치: ~\.claude\bin\voice.ps1   옆에 voice-record.py
# 예전에는 "<루트>\scripts\" 만 봤는데, 전역 설치본은 bin\ 에 들어가므로 못 찾았다.
function Get-Helper($name) {
  foreach ($cand in @((Join-Path $PSScriptRoot $name), (Join-Path $root "scripts\$name"))) {
    if (Test-Path $cand) { return $cand }
  }
  Write-Host "X $name 를 찾을 수 없어요. 찾아본 곳:" -ForegroundColor Red
  Write-Host "     $(Join-Path $PSScriptRoot $name)"
  Write-Host "     $(Join-Path $root "scripts\$name")"
  Write-Host "   강팀을 다시 불러오면 채워집니다:  bash ~/.claude/bin/pull-team.sh"
  exit 1
}
$base = Join-Path $root ".ai-team\meetings"
if (-not (Test-Path $base)) { $base = Join-Path (Get-Location) ".ai-team\meetings" }
if (-not (Test-Path $base)) {
  Write-Host "X 회의록 폴더(.ai-team\meetings)가 없어요." -ForegroundColor Red
  Write-Host "   먼저 회의를 해야 해요 - 클로드에게 '회의 시작해' 라고 하세요."
  exit 1
}

$target = Get-ChildItem $base -Directory |
  Where-Object { (Test-Path (Join-Path $_.FullName "meeting.html")) -and
                 ($Filter -eq "" -or $_.Name -like "*$Filter*") } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $target) {
  Write-Host "X 녹음할 회의록을 못 찾았어요.$(if($Filter){" (조건: $Filter)"})" -ForegroundColor Red
  Write-Host "   있는 회의록:"
  Get-ChildItem $base -Directory | Sort-Object LastWriteTime -Descending |
    Select-Object -First 10 | ForEach-Object { Write-Host "     $($_.Name)" }
  exit 1
}

Write-Host "녹음할 회의록: $($target.Name)" -ForegroundColor Cyan
Write-Host ""

$html = Join-Path $target.FullName "meeting.html"

# ── 4. ▶ 플레이어가 없는 예전 회의록이면 먼저 붙인다 ──────────────
# 회의록은 만들어질 때 템플릿을 복사하므로, 읽어주기 기능이 추가되기 전에
# 만든 회의록엔 재생 버튼이 아예 없다. 녹음만 하면 소리를 들을 방법이 없다.
if (-not (Select-String -Path $html -Pattern "ttsToggle\(" -Quiet)) {
  Write-Host "이 회의록엔 ▶ 재생 버튼이 없어서 먼저 붙일게요 (예전 템플릿으로 만든 회의록)." -ForegroundColor Yellow
  & $PY (Get-Helper "voice-upgrade.py") $html
  if ($LASTEXITCODE -ne 0) {
    Write-Host "X 플레이어를 붙이지 못했어요. 위 메시지를 확인해 주세요." -ForegroundColor Red
    exit 1
  }
  Write-Host ""
}

& $PY (Get-Helper "voice-record.py") $html
