// js/topstrip.js — 상단 칩 줄에 들어가는 인바디·경제 요약
//
// 원래는 대시보드 위에 따로 한 줄을 차지했는데, 습관·칼로리·할일 칩 줄 바로 아래에
// 비슷하게 생긴 줄이 하나 더 생겨서 "윗쪽에 줄이 두 개"가 됐다.
// 그래서 지금은 같은 칩 줄 안으로 들어간다 — App._updateStatsBanner() 가 chips() 를 불러 쓴다.
//
// 이 줄은 스스로 데이터를 만들지 않는다. 각 모듈(InBody, Econ)이 이미 가진 값을 읽어
// 보여주기만 한다. 그래서 어느 모듈이 없거나 비어 있으면 그 칩만 조용히 빠진다.

const TopStrip = {
  // 상단 칩 줄에 끼워 넣을 조각. 문자열만 돌려주고 DOM 은 건드리지 않는다.
  chips() {
    return [this._inbody(), this._econ()].filter(Boolean).join('');
  },

  // 값이 바뀌었을 때 밖에서 부르는 입구. 칩은 배너 안에 있으므로 배너에 맡긴다.
  render() {
    if (typeof App !== 'undefined' && App._updateStatsBanner) {
      try { App._updateStatsBanner(); } catch {}
    }
  },

  _chip(id, cls, body, onclick) {
    return `<div class="stat-chip stat-ts ${cls}" id="${id}" onclick="${onclick}">${body}</div>`;
  },

  // ── 인바디 최근 기록 ─────────────────
  _inbody() {
    if (typeof InBody === 'undefined') return '';
    let recs = [];
    try { recs = InBody.getRecords() || []; } catch { return ''; }
    const la = recs[recs.length - 1];
    if (!la) return '';
    const v = (val, unit, est) => val ? `<b>${val}</b><i>${unit}</i>${est ? '<u>추정</u>' : ''}` : '';
    const body = '📊 ' + [v(la.wt,'kg'), v(la.ms,'kg',la.msEst), v(la.bf,'%')].filter(Boolean).join('<s></s>');
    return this._chip('tsInbody', '', body, "TopStrip.go('card-inbody')");
  },

  // ── 경제 ────────────────────────────
  // 보유가 있으면 평가액·수익률을 먼저 보여준다. 시세 나열보다 이게 알고 싶은 숫자다.
  // 없는 걸 0원이라고 쓰지 않는다 — 0원과 '아직 안 넣음'은 다르다.
  // 칩 하나에 종목을 줄줄이 늘어놓지 않는다. 상단 줄은 훑어보는 곳이지 읽는 곳이 아니다.
  _econ() {
    if (typeof Econ === 'undefined') return '';
    let c;
    try { c = Econ.cfg(); } catch { return ''; }

    const hs = (c && c.holdings) || [];
    if (hs.length && typeof Econ.holdSummary === 'function') {
      const s = Econ.holdSummary();
      if (s.cost > 0) {
        const cls  = s.profit > 0 ? 'ts-up' : s.profit < 0 ? 'ts-dn' : '';
        const sign = s.profit > 0 ? '+' : '';
        const won  = v => Math.round(v).toLocaleString('ko-KR');
        const body = `💰 <b>${won(s.value)}</b><i>원</i><s></s>` +
          `<b class="${cls}">${sign}${s.pct == null ? '—' : s.pct.toFixed(1) + '%'}</b>`;
        return this._chip('tsEcon', '', body, "Econ.open('hold')");
      }
    }

    const favs = (c && c.favorites) || [];
    if (!favs.length) return '';
    const SHOW = 2;                       // 상단 줄에는 두 개까지만
    const parts = favs.slice(0, SHOW).map(it => {
      const pct = (Econ.PRICES[Econ.keyOf(it)] || {}).pct;
      const cls = pct > 0 ? 'ts-up' : pct < 0 ? 'ts-dn' : '';
      const ar  = pct > 0 ? '▲' : pct < 0 ? '▼' : '–';
      return `${esc(String(it.name || '').slice(0, 5))} <b class="${cls}">${
        pct == null ? '—' : ar + Math.abs(pct).toFixed(1) + '%'}</b>`;
    }).join('<s></s>');
    const more = favs.length > SHOW ? `<s></s><i>+${favs.length - SHOW}</i>` : '';
    return this._chip('tsEcon', '', '📈 ' + parts + more, "Econ.open('main')");
  },

  // 카드로 데려간다. 스크롤만 하면 어디로 갔는지 모르니 잠깐 테두리를 밝힌다.
  go(cls) {
    const card = document.querySelector('.' + cls);
    if (!card) return;
    // 모바일에서는 그 카드가 다른 탭에 있을 수 있다. 탭부터 맞추지 않으면
    // scrollIntoView 가 '숨겨진 요소'를 향해 스크롤해서 아무 일도 안 일어난다.
    if (typeof Tabs !== 'undefined') Tabs.set(Tabs.tabOf(cls), true);
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.remove('ts-flash');
    void card.offsetWidth;
    card.classList.add('ts-flash');
    setTimeout(() => card.classList.remove('ts-flash'), 1400);
  },
};
