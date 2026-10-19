#!/bin/bash
# 안드로이드 업로드 키를 한 번 만들고, GitHub 저장소 비밀값(Secrets)에 넣는다. 맥에서 한 번만 실행.
#   bash app/scripts/android-key.sh
# 만든 키 파일은 ~/BashyKeys/bashy-upload.jks 에 남는다 — 따로 백업해 두세요(잃어버리면 플레이 콘솔에서 '업로드 키 재설정' 요청).
# 비밀번호는 이 맥에서 임의로 만들어 ~/BashyKeys/password.txt 에만 적는다. 화면·저장소에는 남지 않는다.
set -euo pipefail
REPO="${REPO:-viliiousy/javice}"
DIR="$HOME/BashyKeys"; KS="$DIR/bashy-upload.jks"; ALIAS=bashy

# keytool 찾기: 설치된 자바 → 안드로이드 스튜디오에 들어 있는 자바
KT=$(command -v keytool 2>/dev/null || true)
if ! "$KT" -help >/dev/null 2>&1; then
  for j in "/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool" \
           "$(/usr/libexec/java_home 2>/dev/null)/bin/keytool"; do [ -x "$j" ] && KT="$j" && break; done
fi
"$KT" -help >/dev/null 2>&1 || { echo "자바(keytool)가 없습니다. 먼저:  brew install --cask temurin"; exit 1; }
command -v gh >/dev/null || { echo "GitHub CLI 가 없습니다. 먼저:  brew install gh && gh auth login"; exit 1; }

mkdir -p "$DIR"; chmod 700 "$DIR"
if [ ! -f "$KS" ]; then
  PW=$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 24)
  printf '%s\n' "$PW" > "$DIR/password.txt"; chmod 600 "$DIR/password.txt"
  "$KT" -genkeypair -v -keystore "$KS" -alias "$ALIAS" -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$PW" -keypass "$PW" -dname "CN=Bashy, O=Bashy, C=KR" >/dev/null
  echo "키를 만들었습니다: $KS"
else
  PW=$(cat "$DIR/password.txt"); echo "이미 있는 키를 씁니다: $KS"
fi

base64 < "$KS" | tr -d '\n' | gh secret set ANDROID_KEYSTORE_B64 -R "$REPO"
printf '%s' "$PW"    | gh secret set ANDROID_KEYSTORE_PASSWORD -R "$REPO"
printf '%s' "$PW"    | gh secret set ANDROID_KEY_PASSWORD -R "$REPO"
printf '%s' "$ALIAS" | gh secret set ANDROID_KEY_ALIAS -R "$REPO"
echo "✅ GitHub 비밀값 4개를 넣었습니다."
echo "업로드 키 SHA-1 (구글 클라우드 › 사용자 인증 정보 › Android 클라이언트에 넣을 값):"
"$KT" -list -v -keystore "$KS" -alias "$ALIAS" -storepass "$PW" | grep -E 'SHA1|SHA-1|SHA256' | head -2
