// js/econ-ko.js — 해외 종목 한글 이름
//
// 종목 목록(tickers.json)의 미국 종목은 영어 이름뿐이라 '테슬라' 로 치면 아무것도 안 나왔다.
// 한국 투자자가 한글로 많이 찾는 종목·ETF 를 티커와 짝지어 둔다. 검색은 이 표를 먼저 본다.
// 한 티커에 이름을 여러 개 달 수 있다 (예: 구글/알파벳).
const EconKo = {
  // '한글 이름|다른 이름': 'TICKER'
  RAW: {
    '테슬라':'TSLA', '애플':'AAPL', '아마존':'AMZN', '마이크로소프트|마소|MS':'MSFT',
    '엔비디아':'NVDA', '구글|알파벳':'GOOGL', '구글C|알파벳C':'GOOG', '메타|페이스북':'META',
    '넷플릭스':'NFLX', '브로드컴':'AVGO', 'AMD|에이엠디':'AMD', '인텔':'INTC', '퀄컴':'QCOM',
    'TSMC|대만반도체':'TSM', 'ASML':'ASML', '마이크론':'MU', '어플라이드머티리얼즈|어플라이드':'AMAT',
    '램리서치':'LRCX', 'KLA':'KLAC', 'ARM|암홀딩스':'ARM', '슈퍼마이크로':'SMCI', '마벨':'MRVL',
    '텍사스인스트루먼트':'TXN', '팔란티어':'PLTR', '스노우플레이크':'SNOW', '세일즈포스':'CRM',
    '오라클':'ORCL', '어도비':'ADBE', 'IBM':'IBM', '시스코':'CSCO', '서비스나우':'NOW',
    '크라우드스트라이크':'CRWD', '팔로알토':'PANW', '데이터독':'DDOG', '유니티':'U', '로블록스':'RBLX',
    '쇼피파이':'SHOP', '우버':'UBER', '에어비앤비':'ABNB', '도어대시':'DASH', '리프트':'LYFT',
    '줌':'ZM', '스포티파이':'SPOT', '핀터레스트':'PINS', '스냅':'SNAP', '레딧':'RDDT', '듀오링고':'DUOL',
    '페이팔':'PYPL', '블록|스퀘어':'XYZ', '코인베이스':'COIN', '로빈후드':'HOOD', '마이크로스트래티지|스트래티지':'MSTR',
    '비자':'V', '마스터카드':'MA', '아메리칸익스프레스|아멕스':'AXP', 'JP모건|제이피모건':'JPM',
    '뱅크오브아메리카|BOA':'BAC', '골드만삭스':'GS', '모건스탠리':'MS', '웰스파고':'WFC', '씨티그룹':'C',
    '블랙록':'BLK',
    '코카콜라':'KO', '펩시':'PEP', '맥도날드':'MCD', '스타벅스':'SBUX', '나이키':'NKE', '월마트':'WMT',
    '코스트코':'COST', '타겟':'TGT', '홈디포':'HD', '디즈니':'DIS', '치폴레':'CMG', '룰루레몬':'LULU',
    '프록터앤갬블|P&G|피앤지':'PG', '존슨앤존슨':'JNJ', '화이자':'PFE', '모더나':'MRNA', '일라이릴리|릴리':'LLY',
    '노보노디스크':'NVO', '머크':'MRK', '애브비':'ABBV', '유나이티드헬스':'UNH', '암젠':'AMGN', '인튜이티브서지컬':'ISRG',
    '보잉':'BA', '록히드마틴':'LMT', 'GE|제너럴일렉트릭':'GE', 'GE버노바':'GEV', '캐터필러':'CAT', '디어':'DE',
    '엑슨모빌':'XOM', '셰브론':'CVX', '포드':'F', 'GM|제너럴모터스':'GM', '리비안':'RIVN', '루시드':'LCID',
    '니오':'NIO', '샤오펑':'XPEV', '리오토':'LI', '알리바바':'BABA', '바이두':'BIDU', '징둥|JD':'JD', '핀둬둬|테무|PDD':'PDD',
    '아이온큐':'IONQ', '리게티':'RGTI', '디웨이브':'QBTS', '퀀텀컴퓨팅':'QUBT', '로켓랩':'RKLB', '조비':'JOBY',
    '비스트라':'VST', '컨스텔레이션에너지|컨스텔레이션':'CEG', '오클로':'OKLO', '뉴스케일':'SMR', '템퍼스AI':'TEM',
    '버티브':'VRT', '델':'DELL', 'HP|에이치피':'HPQ', '코어위브':'CRWV', '서클':'CRCL', '소파이':'SOFI',
    'AT&T':'T', '버라이즌':'VZ', 'T모바일':'TMUS', '컴캐스트':'CMCSA', '워너브라더스':'WBD',
    // ETF
    'S&P500|SPY|에스앤피':'SPY', 'VOO|뱅가드S&P':'VOO', 'IVV':'IVV', '나스닥100|QQQ|큐큐큐':'QQQ', 'QQQM':'QQQM',
    '다우|DIA':'DIA', '러셀2000|IWM':'IWM', '전세계주식|VT':'VT', '미국전체|VTI':'VTI',
    '배당|SCHD|슈드':'SCHD', 'JEPI|제피':'JEPI', 'JEPQ|젭큐':'JEPQ', '고배당|VYM':'VYM', '배당성장|DGRO':'DGRO',
    '반도체ETF|SOXX':'SOXX', 'SMH':'SMH', '반도체3배|SOXL|속슬':'SOXL', '반도체인버스3배|SOXS':'SOXS',
    '나스닥3배|TQQQ|티큐':'TQQQ', '나스닥인버스3배|SQQQ':'SQQQ', '테슬라2배|TSLL':'TSLL', '엔비디아2배|NVDL':'NVDL',
    '미국채20년|TLT':'TLT', '미국채3배|TMF':'TMF', '단기채|SGOV':'SGOV', '금ETF|GLD':'GLD', 'IAU':'IAU', '은ETF|SLV':'SLV',
    '원유|USO':'USO', '아크|ARKK':'ARKK', '비트코인ETF|IBIT':'IBIT', '이더리움ETF|ETHA':'ETHA',
    '커버드콜|QYLD':'QYLD', '리츠|VNQ':'VNQ', '기술주|XLK':'XLK', '헬스케어|XLV':'XLV', '에너지|XLE':'XLE', '금융|XLF':'XLF',
  },
  _idx: null,
  index() {
    if (this._idx) return this._idx;
    this._idx = [];
    for (const [names, tk] of Object.entries(this.RAW))
      names.split('|').forEach((n, i) => this._idx.push({ ko: n.toLowerCase(), label: names.split('|')[0], tk, main: i === 0 }));
    return this._idx;
  },
  // 검색어에 맞는 티커들 → [{tk, label, score}]
  match(q) {
    q = q.toLowerCase().replace(/\s+/g, '');
    if (!q) return [];
    const best = new Map();
    for (const e of this.index()) {
      let s = -1;
      if (e.ko === q) s = 0; else if (e.ko.startsWith(q)) s = 1; else if (e.ko.includes(q)) s = 3;
      if (s < 0) continue;
      const prev = best.get(e.tk);
      if (!prev || s < prev.score) best.set(e.tk, { tk: e.tk, label: e.label, score: s });
    }
    return [...best.values()].sort((a, b) => a.score - b.score);
  },
};
