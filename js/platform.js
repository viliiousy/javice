// js/platform.js — 지금 웹인가, 앱인가
//
// 앱으로 감싸면 화면이 capacitor://localhost 에서 뜬다. 그러면 '/api/food' 같은
// 상대 경로가 갈 곳을 잃는다 — 서버는 bashy.app 에 있고 앱 번들 안에는 없다.
// 그 갈림을 여기 한 곳에만 두고, 부르는 쪽은 Platform.api('/api/food') 만 쓴다.
//
// 이 파일은 다른 모든 스크립트보다 먼저 로드돼야 한다.
const Platform = {
  // 웹에서는 window.Capacitor 자체가 없다. 앱에서만 채워진다.
  get native(){
    const C = window.Capacitor;
    return !!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform());
  },
  get ios(){
    return this.native && window.Capacitor.getPlatform() === 'ios';
  },

  // 앱에서 서버를 부를 주소. 여기를 바꾸면 앱 전체가 따라간다.
  ORIGIN: 'https://bashy.app',

  // 웹에서는 상대 경로 그대로 — 지금 동작을 한 글자도 바꾸지 않는다.
  api(path){
    const p = String(path || '');
    if (!this.native) return p;
    return this.ORIGIN + (p.startsWith('/') ? p : '/' + p);
  },
};
