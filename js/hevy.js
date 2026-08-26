// js/hevy.js — Hevy 에서 받아온 운동 기록을 읽어 화면에 붙인다
//
// 쓰기는 하지 않는다. 서버(api/hevy.js)가 Firebase 에 넣어둔 걸 읽기만 한다.
// 그래서 이 파일에는 API 키도, 네트워크 호출도 없다.
//
// 보여줄 값은 '볼륨(Σ 중량×횟수)' 이다. 세트 수만으로는 늘었는지 줄었는지 알 수 없고,
// 최고 중량만으로는 그날 얼마나 했는지 알 수 없다.

const Hevy = {
  KEY: 'gl_hevy_v1',

  all() {
    try {
      const v = JSON.parse(UserStore.get(this.KEY) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  },
  byDate(ds) { return this.all().filter(w => w && w.dt === ds); },

  _n(v) { return String(Math.round(Number(v) * 10) / 10); },

  _setTxt(s) {
    if (s.w != null && s.r != null) return this._n(s.w) + 'kg × ' + s.r;
    if (s.r != null) return s.r + '회';
    if (s.t != null) return s.t >= 60 ? Math.round(s.t / 60) + '분' : s.t + '초';
    if (s.d != null) return s.d >= 1000 ? (s.d / 1000).toFixed(1) + 'km' : s.d + 'm';
    return '—';
  },

  // 같은 무게·횟수가 이어지면 "60kg × 12 × 3세트" 로 접는다.
  // 안 접으면 한 종목이 다섯 줄이 되어 카드가 기록장이 아니라 로그가 된다.
  _sets(sets) {
    const out = [];
    for (const s of (sets || [])) {
      const t = this._setTxt(s);
      const last = out[out.length - 1];
      if (last && last.t === t) last.n++;
      else out.push({ t: t, n: 1 });
    }
    return out.map(o => o.n > 1 ? o.t + ' × ' + o.n + '세트' : o.t).join(' · ');
  },

  // ── 계획 항목 자동 체크 ────────────────
  // 계획의 '벤치프레스' 와 기록의 '스미스 머신 벤치프레스' 를 같은 것으로 본다.
  // 한쪽이 다른 쪽을 품으면 맞다고 친다 — 이름 표기가 서로 조금씩 다르기 때문이다.
  _key(s) { return String(s || '').replace(/[\s()]/g, '').toLowerCase(); },
  doneNames(ds) {
    const out = new Set();
    for (const w of this.byDate(ds)) for (const it of (w.items || [])) out.add(it.name);
    return out;
  },
  isDone(planName, ds) {
    const k = this._key(planName);
    if (k.length < 2) return false;
    for (const n of this.doneNames(ds)) {
      const m = this._key(n);
      if (!m) continue;
      if (m.includes(k) || k.includes(m)) return true;
    }
    return false;
  },

  // ── 렌더 ───────────────────────────────
  html(ds) {
    const ws = this.byDate(ds);
    if (!ws.length) return '';
    const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

    return ws.map(w => {
      const rows = (w.items || []).map(it => `
        <div class="hv-row">
          <span class="hv-nm">${esc(it.name)}</span>
          <span class="hv-sets">${esc(this._sets(it.sets))}</span>
          ${it.vol ? `<span class="hv-vol">${it.vol.toLocaleString('ko-KR')}kg</span>` : '<span class="hv-vol"></span>'}
        </div>`).join('');

      const meta = [];
      if (w.min) meta.push(w.min + '분');
      if (w.vol) meta.push('총 볼륨 ' + w.vol.toLocaleString('ko-KR') + 'kg');

      return `<div class="hv-box">
        <div class="hv-head">
          <span class="hv-title">${esc(w.title || '운동 기록')}</span>
          <span class="hv-src">Hevy</span>
        </div>
        ${rows}
        ${meta.length ? `<div class="hv-foot">${meta.join(' · ')}</div>` : ''}
      </div>`;
    }).join('');
  },
};
