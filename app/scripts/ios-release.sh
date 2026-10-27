#!/bin/bash
# 맥미니에서 한 줄로: 앱을 빌드해 App Store Connect(TestFlight)에 올린다.
#   사용법:  TEAM=XXXXXXXXXX bash app/scripts/ios-release.sh
#   TEAM 은 developer.apple.com → Membership(멤버십) 의 Team ID(10자리).
# 필요: Xcode 설치 + Xcode → Settings → Accounts 에 개발자 Apple ID 로그인.
# 처음 한 번은 아이폰을 케이블로 맥미니에 연결해 둬야 한다(개발용 프로필에 기기 1대 필요).
set -euo pipefail
cd "$(dirname "$0")/.."                      # app/
: "${TEAM:?TEAM=팀ID 를 앞에 붙여 실행해 주세요}"

[ -f ios/App/App/GoogleService-Info.plist ] || { echo "GoogleService-Info.plist 가 없습니다 (ios/App/App/)"; exit 1; }

npm ci --no-audit --no-fund
# 화면 묶음 버전(커밋) — 앱 안 화면과 배포된 화면 업데이트(js/ota.js)를 견준다
export WEB_VER=$(git rev-parse --short=7 HEAD)
npm run sync

# 빌드 번호는 매번 올라가야 한다 — 날짜+시각으로 둔다.
BUILD=$(date +%Y%m%d%H%M)
OUT="$HOME/BashyBuild"; rm -rf "$OUT"; mkdir -p "$OUT"

cat > "$OUT/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>$TEAM</string>
  <key>signingStyle</key><string>automatic</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict></plist>
PLIST

xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$OUT/Bashy.xcarchive" \
  DEVELOPMENT_TEAM="$TEAM" CURRENT_PROJECT_VERSION="$BUILD" \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration archive | tail -30

xcodebuild -exportArchive -archivePath "$OUT/Bashy.xcarchive" \
  -exportOptionsPlist "$OUT/ExportOptions.plist" -exportPath "$OUT/export" \
  -allowProvisioningUpdates | tail -30

echo "✅ 업로드 완료 (빌드 $BUILD). 10~30분 뒤 App Store Connect → TestFlight 에 나타납니다."
