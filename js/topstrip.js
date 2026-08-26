// js/topstrip.js — 대시보드 맨 위 한 줄 요약
//
// 카드가 아홉 개가 되면서 "지금 어떤 상태인가"를 알려면 스크롤을 해야 했다.
// 자주 보는 숫자만 한 줄로 올리고, 누르면 해당 카드로 데려간다.
//
// 이 줄은 스스로 데이터를 만들지 않는다. 각 모듈(InBody, Econ)이 이미 가진 값을 읽어
// 보여주기만 한다. 그래서 어느 모듈이 없거나 비어 있으면 그 칸만 조용히 빠진다.

const TopStrip = {
  EL: 'topStrip',

  render() {
    const el = document.getElementById(this.EL);
    if (!el) return;
    const cells = [this._inbody(), this._econ()].filter(Boolean);
    el.innerHTML = cells.join('');
    el.style.display = cells.length ? '' : 'none';
  },

  _cell(id, icon, label, body, onclick) {
    return `<button class="ts-cell" id="${id}" onclick="${onclick}">
      <span class="ts-lbl">${icon} ${label}</span>
      <span class="ts-body">${body}</span>
    </button>`;
  },

  // ── 인바디 최근 기록 ─────────────────
  _inbody() {
    if (typeof InBody === 'undefined') return '';
    let recs = [];
    try { recs = InBody.getRecords() || []; } catch { return ''; }
    const la = recs[recs.length - 1];
    if (!la) return '';

    const v = (val, unit, est) =>
      val ? `<b>${val}</b><i>${unit}</i>${est ? '<u>추정</u>' : ''}` : '<b>—</b>';
    const body =
      `<span class="ts-v">${v(la.wt, 'kg')}</span>` +
      `<span class="ts-v">${v(la.ms, 'kg', la.msEst)}</span>` +
      `<span class="ts-v">${v(la.bf, '%')}</span>`;
    const when = la.dt ? la.dt.slice(5).replace('-', '/') : '';
    return this._cell('tsInbody', '📊', `인바디 <em>${when}</em>`, body, "TopStrip.go('card-inbody')");
  },

  // ── 시세 ────────────────────────────
  // 보유 주식 평가액·수익률은 아직 없다. 있으면 그걸, 없으면 즐겨찾기 시세를 보여준다.
  // 없는 걸 0원이라고 쓰지 않는다 — 0원과 '아직 안 넣음'은 다르다.
  _econ() {
    if (typeof Econ === 'undefined') return '';
    let c;
    try { c = Econ.cfg(); } catch { return ''; }
    const favs = (c && c.favorites) || [];
    if (!favs.length) return '';

    const parts = favs.slice(0, 3).map(it => {
      const q = Econ.PRICES[Econ.keyOf(it)] || {};
      const pct = q.pct;
      const cls = pct > 0 ? 'ts-up' : pct < 0 ? 'ts-dn' : 'ts-flat';
      const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '–';
      const nm = String(it.name || '').slice(0, 6);
      return `<span class="ts-v ts-tick">${esc(nm)} <b class="${cls}">${
        pct == null ? '—' : arrow + Math.abs(pct).toFixed(1) + '%'}</b></span>`;
    }).join('');

    const more = favs.length > 3 ? `<span class="ts-more">+${favs.length - 3}</span>` : '';
    return this._cell('tsEcon', '📈', '시세', parts + more, "Econ.open('main')");
  },

  // 카드로 데려간다. 스크롤만 하면 어디로 갔는지 모르니 잠깐 테두리를 밝힌다.
  go(cls) {
    const card = document.querySelector('.' + cls);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.remove('ts-flash');
    void card.offsetWidth;
    card.classList.add('ts-flash');
    setTimeout(() => card.classList.remove('ts-flash'), 1400);
  },
};
