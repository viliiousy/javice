# 🔥 갓생 대시보드

구글 캘린더·할일 완전 양방향 동기화 + 운동 / 식단 / 습관 / 날씨 올인원 대시보드  
GitHub Pages 무료 호스팅 · PWA 지원 (홈 화면 추가 가능)

---

## ✅ 설치 & 배포 방법 (3단계)

### 1단계 — Google Cloud 설정

1. [console.cloud.google.com](https://console.cloud.google.com/) 접속 → 새 프로젝트 생성
2. **API 및 서비스 > 라이브러리** 에서 두 API 활성화:
   - `Google Calendar API`
   - `Tasks API`
3. **API 및 서비스 > OAuth 동의 화면**:
   - 사용자 유형: **외부** 선택
   - 앱 이름, 이메일 입력 후 저장
   - 테스트 사용자에 본인 Gmail 추가
4. **API 및 서비스 > 사용자 인증 정보** → **+ 사용자 인증 정보 만들기 > OAuth 2.0 클라이언트 ID**:
   - 애플리케이션 유형: **웹 애플리케이션**
   - **승인된 JavaScript 원본**에 추가:
     ```
     https://YOUR_USERNAME.github.io
     http://localhost:8080  (로컬 테스트용)
     ```
   - 생성 후 **클라이언트 ID** 복사 (`.apps.googleusercontent.com` 로 끝나는 문자열)

### 2단계 — config.js 수정

`js/config.js` 파일을 열고 아래 부분을 교체:

```js
GOOGLE_CLIENT_ID: 'YOUR_GOOGLE_CLIENT_ID_HERE.apps.googleusercontent.com',
```

붙여넣기 예시:
```js
GOOGLE_CLIENT_ID: '123456789-abcdefg.apps.googleusercontent.com',
```

날씨 도시를 바꾸려면 위경도도 수정:
```js
WEATHER_LAT:  37.5665,   // 서울
WEATHER_LON:  126.9780,
WEATHER_CITY: '서울',
```

### 3단계 — GitHub Pages 배포

```bash
# 1. GitHub에 새 저장소 생성 (예: god-life-dashboard)
# 2. 이 폴더를 push

git init
git add .
git commit -m "🔥 갓생 대시보드 초기 배포"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/god-life-dashboard.git
git push -u origin main

# 3. GitHub 저장소 > Settings > Pages > Source: main 브랜치 선택 > Save
# 4. https://YOUR_USERNAME.github.io/god-life-dashboard 접속!
```

---

## 🧩 기능 요약

| 섹션 | 기능 |
|------|------|
| 📋 할일 | 구글 Tasks 연동 · 목록별 관리 · 완료 / 삭제 · 마감일 설정 |
| 📅 캘린더 | 구글 Calendar 연동 · 미니 달력 · 일정 추가 / 삭제 |
| ✅ 습관 | 커스텀 습관 · 연속 달성 스트릭 🔥 · 오늘 완료율 |
| 💪 운동 | 4분할 커팅 루틴 · 크로스핏 · 주짓수 · 운동별 완료 체크 |
| 🥗 식단 | 칼로리 링 게이지 · 식사별 음식 추가 · 3대 영양소 트래킹 |
| 🌤 날씨 | Open-Meteo API (무료 · API키 불필요) · 5일 예보 |

---

## 💡 자주 묻는 질문

**Q. 팝업이 차단되었다고 나와요**  
→ 브라우저 주소창 오른쪽 팝업 차단 아이콘 클릭 → 허용

**Q. "이 앱은 Google에서 확인하지 않았습니다" 경고가 나와요**  
→ 개발 중인 앱으로 정상입니다. "계속" 또는 "고급 > 이동" 클릭

**Q. 로그인했는데 할일/캘린더가 안 불러와져요**  
→ Google Cloud Console에서 Calendar API · Tasks API가 활성화되어 있는지 확인

**Q. 날씨 도시를 바꾸려면?**  
→ `js/config.js`에서 `WEATHER_LAT`, `WEATHER_LON`, `WEATHER_CITY` 수정  
→ 위경도는 [Google Maps](https://maps.google.com)에서 원하는 위치 우클릭으로 확인 가능

---

## 🔒 개인정보

모든 데이터는 본인의 Google 계정과 브라우저 `localStorage`에만 저장됩니다.  
별도 서버가 없으므로 데이터가 외부로 전송되지 않습니다.
