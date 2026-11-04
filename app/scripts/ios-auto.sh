#!/bin/bash
# 맥미니 자동 iOS 빌드 — 10분마다(launchd) 깃허브를 보고, 앱에 들어가는 파일(화면 JS·CSS·HTML·그림·소리·
# 앱 네이티브 코드)이 바뀌었으면 ios-release.sh 를 돌려 TestFlight 에 올린다. 서버(api·functions)·문서만 바뀐 건 건너뛴다.
# 빌드 도중 새 커밋이 오면 끝난 뒤 다음 확인(10분 안)에서 최신으로 한 번 더 빌드한다.
#
# 설치(한 번):  bash ~/bashy-ios/app/scripts/ios-auto.sh install
# 지우기:       bash ~/bashy-ios/app/scripts/ios-auto.sh uninstall
# 지금 강제로:  bash ~/bashy-ios/app/scripts/ios-auto.sh force
# 기록:         ~/Library/Logs/bashy-ios.log
set -uo pipefail
# launchd 는 터미널과 달리 사용자 설정(.zprofile·.zshrc — nvm·brew 의 node 경로 등)을 읽지 않는다.
# 터미널에서 직접 칠 때와 똑같은 환경이 되도록 로그인 셸로 한 번 다시 실행한다.
if [ -z "${BASHY_LOGIN:-}" ] && [ "${1:-run}" != install ] && [ "${1:-run}" != uninstall ]; then
  exec /bin/zsh -lic 'BASHY_LOGIN=1 /bin/bash "$0" "$@"' "$0" "$@" </dev/null
fi
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
REPO="$HOME/bashy-ios"
TEAM="${TEAM:-4A96B688B4}"
STATE="$HOME/.bashy-ios-built"          # 마지막으로 빌드한 커밋
LOCK="/tmp/bashy-ios-auto.lock"
LOG="$HOME/Library/Logs/bashy-ios.log"
PL="$HOME/Library/LaunchAgents/app.bashy.ios-auto.plist"
# 이 경로가 바뀌면 앱을 새로 빌드한다(app/scripts/build-www.mjs 가 앱에 넣는 것 + 네이티브)
NATIVE='^(js/|css/|icons/|img/|sounds/|[^/]+\.html$|manifest\.json|hub\.webmanifest|app/(ios/|scripts/build-www|package\.json|package-lock\.json|capacitor\.config\.json))'

say() { echo "[$(date '+%m-%d %H:%M')] $*" >> "$LOG"; tail -n 200 "$LOG" > "$HOME/Downloads/bashy-ios-build.log" 2>/dev/null || true; }
note() { osascript -e "display notification \"$1\" with title \"Bashy 앱 빌드\"" >/dev/null 2>&1 || true; }

case "${1:-run}" in
  install)
    mkdir -p "$(dirname "$PL")" "$(dirname "$LOG")"
    cat > "$PL" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>app.bashy.ios-auto</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$REPO/app/scripts/ios-auto.sh</string><string>run</string></array>
  <key>StartInterval</key><integer>600</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
PLIST
    launchctl bootout "gui/$(id -u)" "$PL" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$PL"
    echo "✅ 자동 빌드를 켰습니다. 10분마다 확인합니다 (기록: $LOG)"
    echo "   지금 한 번 확인을 시작합니다 — 새 빌드가 필요하면 바로 빌드합니다(20~30분)."
    exit 0 ;;
  uninstall)
    launchctl bootout "gui/$(id -u)" "$PL" 2>/dev/null || true; rm -f "$PL"
    echo "자동 빌드를 껐습니다."; exit 0 ;;
  force) rm -f "$STATE" "$STATE.fail" ;;
esac

# 한 번에 하나만
if ! mkdir "$LOCK" 2>/dev/null; then
  # 3시간 넘게 남아 있는 잠금은 지난번 실패 흔적 — 치운다
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +180 2>/dev/null)" ]; then rm -rf "$LOCK"; mkdir "$LOCK"; else exit 0; fi
fi
trap 'rm -rf "$LOCK"' EXIT

cd "$REPO" || { say "저장소가 없습니다: $REPO"; exit 1; }
git fetch -q origin main 2>>"$LOG" || { say "깃허브에 닿지 못했습니다(인터넷?)"; exit 0; }
NEW=$(git rev-parse origin/main)
OLD=$(cat "$STATE" 2>/dev/null || true)
[ "$NEW" = "$OLD" ] && exit 0

if [ -n "$OLD" ] && git cat-file -e "$OLD" 2>/dev/null; then
  CH=$(git diff --name-only "$OLD" "$NEW" | grep -E "$NATIVE" || true)
  if [ -z "$CH" ]; then echo "$NEW" > "$STATE"; exit 0; fi   # 서버·문서만 바뀜 — 앱은 그대로
  say "앱 파일 변경 $(echo "$CH" | wc -l | tr -d ' ')개: $(echo "$CH" | head -8 | tr '\n' ' ')"
else
  say "처음 실행 — 지금 상태로 한 번 빌드합니다"
fi

# 방금 실패한 커밋이면 1시간 쉬었다가 다시
if read -r FC FT < "$STATE.fail" 2>/dev/null && [ "$FC" = "$NEW" ] && [ $(( $(date +%s) - FT )) -lt 3600 ]; then exit 0; fi
git reset -q --hard origin/main   # 이 폴더는 빌드 전용 — 손으로 고친 것은 없앤다
say "빌드 시작 ${NEW:0:7}"; note "새 앱 빌드를 시작합니다 (${NEW:0:7})"
if TEAM="$TEAM" bash app/scripts/ios-release.sh >> "$LOG" 2>&1; then
  echo "$NEW" > "$STATE"
  say "✅ 업로드 완료 ${NEW:0:7}"; note "TestFlight 에 올렸습니다 — 10~30분 뒤 업데이트하세요"
else
  say "도구: node=$(command -v node || echo 없음) npm=$(command -v npm || echo 없음) xcodebuild=$(command -v xcodebuild || echo 없음)"
  say "❌ 빌드 실패 ${NEW:0:7} — 위 기록 확인"; note "빌드 실패 — ~/Library/Logs/bashy-ios.log 확인"
  echo "$NEW $(date +%s)" > "$STATE.fail"   # 같은 커밋은 1시간 뒤에 다시 시도
fi
