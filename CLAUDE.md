# Bashy — 작업 메모 (Claude 용)

## 앱 업데이트(빌드)는 사용자가 "업데이트해" 라고 할 때만
- 자동으로 빌드하지 않는다. 사용자가 앱 업데이트를 요청하면 둘 다 실행한다.
  1. **아이폰(맥미니)**: 맥미니의 다운로드 폴더에 요청 파일을 쓴다 — 연결된 기기 셸에서
     `date > $HOME/mnt/Downloads/.bashy-build-request`
     맥미니 launchd(app/scripts/ios-auto.sh, WatchPaths)가 깨어나 깃허브 최신을 받아 TestFlight 에 올린다.
     진행·결과: `$HOME/mnt/Downloads/bashy-ios-build.log` 마지막 줄('✅ 업로드 완료' / '❌ 빌드 실패' / '이미 최신').
  2. **안드로이드**: `gh workflow run android-release.yml` (APK → 릴리스 android-latest, 앱이 업데이트 알림).
- 업로드는 App Store Connect API 키(~/.appstoreconnect, Admin 권한)로 한다 — Xcode 로그인과 무관.
- 요청 전에 바꾼 코드를 main 에 먼저 push 해 둘 것.
