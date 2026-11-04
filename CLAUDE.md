# Bashy — 작업 메모 (Claude 용)

## 앱에 들어가는 코드를 고쳤으면 Claude 가 직접 빌드를 건다
- 맥미니·깃허브가 스스로 주기 검사하지 않는다. 사용자 요청으로 앱 화면(js·css·html·그림·소리)이나 app/ 를 고쳐
  main 에 push 했으면, 작업을 마치면서 Claude 가 바로 아래 둘을 실행한다(사용자가 따로 말하거나 터미널을 칠 필요 없음).
  서버(api·functions)·문서만 고쳤으면 걸지 않는다.
  1. **아이폰(맥미니)**: 맥미니의 다운로드 폴더에 요청 파일을 쓴다 — 연결된 기기 셸에서
     `date > $HOME/mnt/Downloads/.bashy-build-request`
     맥미니 launchd(app/scripts/ios-auto.sh, WatchPaths)가 깨어나 깃허브 최신을 받아 TestFlight 에 올린다.
     진행·결과: `$HOME/mnt/Downloads/bashy-ios-build.log` 마지막 줄('✅ 업로드 완료' / '❌ 빌드 실패' / '이미 최신').
  2. **안드로이드**: `gh api -X POST repos/viliiousy/javice/actions/workflows/android-release.yml/dispatches -f ref=main -f "inputs[track]=none"` (gh workflow run 은 GraphQL 이라 막힘) (APK → 릴리스 android-latest, 앱이 업데이트 알림).
- 업로드는 App Store Connect API 키(~/.appstoreconnect, Admin 권한)로 한다 — Xcode 로그인과 무관.
- 요청 전에 바꾼 코드를 main 에 먼저 push 해 둘 것.
