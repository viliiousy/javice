// js/topstrip.js — 헤더 오른쪽 두 줄: 인바디 · 자산
//
// 원래 이 자리에는 날씨 3일 예보가 있었다. 매일 보는 화면에서 날씨는
// 폰 잠금화면에도, 위젯에도, 창밖에도 있다 — 여기서만 볼 수 있는 게 아니다.
// 대신 여기서만 볼 수 있는 두 줄을 넣는다: 내 몸과 내 돈.
//
// 이 파일은 스스로 데이터를 만들지 않는다. InBody·Econ 이 이미 가진 값을 읽어
// 보여주기만 한다. 어느 모듈이 없거나 비어 있으면 그 줄만 조용히 빠진다.

const TopStrip = {
  SLOT: 'hSummary',

  render() {
    const el = document.getElementById(this.SLOT);
    if (!el) return;
    const rows = [this._inbody(), this._econ()].filter(Boolean);
    el.innerHTML = rows.join('');
    el.classList.toggle('is-empty', !rows.length);
  },

  _ic(name) {
    return (typeof Icons !== 'undefined') ? Icons.svg(name, 'ts-ic') : '';
  },
  _row(id, icon, body, onclick, title) {
    return `<button class="ts-row" id="${id}" onclick="${onclick}" title="${title}">
      ${this._ic(icon)}<span class="ts-body">${body}</span></button>`;
  },

  // ── 인바디 최근 기록 ─────────────────
  _inbody() {
    if (typeof InBody === 'undefined') return '';
    let recs = [];
    try { recs = InBody.getRecords() || []; } catch (e) { return ''; }
    const la = recs[recs.length - 1];
    if (!la) return '';
    // 추정치는 실측처럼 보이면 안 된다. 근육량 옆에 '추정' 을 붙여 둔다.
    const v = (val, unit, est) => val ? `<b>${val}</b><i>${unit}</i>${est ? '<u>추정</u>' : ''}` : '';
    const body = [v(la.wt,'kg'), v(la.ms,'kg',la.msEst), v(la.bf,'%')].filter(Boolean).join('<s></s>');
    if (!body) return '';
    return this._row('tsInbody', 'chart', body, "TopStrip.go('card-inbody')",
                     la.dt ? la.dt.slice(2).replace(/-/g,'.') + ' 기준' : '인바디');
  },

  // ── 자산 ────────────────────────────
  // 보유가 있으면 평가액·수익률을 먼저 보여준다. 시세 나열보다 이게 알고 싶은 숫자다.
  // 없는 걸 0원이라고 쓰지 않는다 — 0원과 '아직 안 넣음' 은 다르다.
  _econ() {
    if (typeof Econ === 'undefined') return '';
    let c;
    try { c = Econ.cfg(); } catch (e) { return ''; }

    const hs = (c && c.holdings) || [];
    if (hs.length && typeof Econ.holdSummary === 'function') {
      const s = Econ.holdSummary();
      if (s.cost > 0) {
        const cls  = s.profit > 0 ? 'ts-up' : s.profit < 0 ? 'ts-dn' : '';
        const sign = s.profit > 0 ? '+' : '';
        const won  = v => Math.round(v).toLocaleString('ko-KR');
        const body = `<b>${won(s.value)}</b><i>원</i><s></s>` +
          `<b class="${cls}">${s.pct == null ? '—' : sign + s.pct.toFixed(1) + '%'}</b>`;
        return this._row('tsEcon', 'trend', body, "Econ.open('hold')", '보유 주식 평가액');
      }
    }

    // 보유가 없으면 관심종목 등락으로 대신한다. 두 개까지만 — 훑어보는 자리다.
    const favs = (c && c.favorites) || [];
    if (!favs.length) return '';
    const SHOW = 2;
    const parts = favs.slice(0, SHOW).map(it => {
      const pct = (Econ.PRICES[Econ.keyOf(it)] || {}).pct;
      const cls = pct > 0 ? 'ts-up' : pct < 0 ? 'ts-dn' : '';
      const ar  = pct > 0 ? '▲' : pct < 0 ? '▼' : '–';
      return `${esc(String(it.name || '').slice(0, 5))} <b class="${cls}">${
        pct == null ? '—' : ar + Math.abs(pct).toFixed(1) + '%'}</b>`;
    }).join('<s></s>');
    const more = favs.length > SHOW ? `<s></s><i>+${favs.length - SHOW}</i>` : '';
    return this._row('tsEcon', 'trend', parts + more, "Econ.open('main')", '관심종목');
  },

  // 카드로 데려간다. 스크롤만 하면 어디로 갔는지 모르니 잠깐 테두리를 밝힌다.
  go(cls) {
    const card = document.querySelector('.' + cls);
    if (!card) return;
    // 모바일에서는 그 카드가 다른 탭에 있을 수 있다. 탭부터 맞추지 않으면
    // scrollIntoView 가 '숨겨진 요소' 를 향해 스크롤해서 아무 일도 안 일어난다.
    if (typeof Tabs !== 'undefined') Tabs.set(Tabs.tabOf(cls), true);
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.remove('ts-flash');
    void card.offsetWidth;
    card.classList.add('ts-flash');
    setTimeout(() => card.classList.remove('ts-flash'), 1400);
  },
};
