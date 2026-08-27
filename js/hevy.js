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

  // ── 주간 볼륨 ──────────────────────────
  // 하루 단위로 보면 요일 구성 때문에 들쭉날쭉해서 추세가 안 보인다.
  // 주로 묶어야 '요즘 늘고 있나' 가 읽힌다.
  _ds(d) {
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  },
  _monday(ds) {
    const d = new Date(ds + 'T00:00:00');
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));   // 월요일이 주의 시작
    return this._ds(d);
  },
  weeks(n) {
    n = n || 8;
    const by = new Map();
    for (const w of this.all()) {
      if (!w || !w.dt) continue;
      const k = this._monday(w.dt);
      const cur = by.get(k) || { vol: 0, cnt: 0 };
      cur.vol += Number(w.vol) || 0; cur.cnt++;
      by.set(k, cur);
    }
    // 기록이 없는 주도 0 으로 채운다. 빈 주를 건너뛰면 '쉰 주' 가 안 보이고,
    // 그러면 그래프가 실제보다 성실해 보인다.
    const out = [];
    const thisMon = new Date(this._monday(this._ds(new Date())) + 'T00:00:00');
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(thisMon); d.setDate(d.getDate() - i * 7);
      const k = this._ds(d);
      const v = by.get(k) || { vol: 0, cnt: 0 };
      out.push({ mon: k, vol: Math.round(v.vol), cnt: v.cnt, now: i === 0 });
    }
    return out;
  },

  _md(ds) { const p = ds.split('-'); return Number(p[1]) + '/' + Number(p[2]); },
  _range(mon) {
    const a = new Date(mon + 'T00:00:00'), b = new Date(a); b.setDate(a.getDate() + 6);
    return this._md(mon) + '~' + this._md(this._ds(b));
  },
  _label(w) {
    if (!w.cnt) return this._range(w.mon) + ' · 쉼';
    return this._range(w.mon) + ' · ' + w.vol.toLocaleString('ko-KR') + 'kg · ' + w.cnt + '회';
  },

  weeklyHtml(n) {
    const ws = this.weeks(n || 8);
    // 두 주는 있어야 '추이' 다. 한 주짜리 막대 하나는 그래프가 아니라 장식이다.
    if (ws.filter(w => w.cnt).length < 2) return '';

    const max  = Math.max.apply(null, ws.map(w => w.vol).concat([1]));
    const cur  = ws[ws.length - 1];
    this._wk   = ws;

    const bars = ws.map((w, i) => {
      // 쉰 주는 짧은 막대가 아니라 바닥 눈금으로 둔다.
      // 2px 짜리 막대를 남기면 '조금은 했다' 로 읽힌다. 안 한 건 안 한 거다.
      const zero = !w.vol;
      const h = zero ? 0 : Math.max(3, Math.round(w.vol / max * 100));
      return '<button class="hw-col' + (w.now ? ' now' : '') + (zero ? ' zero' : '') + '" data-i="' + i + '"'
           + ' onpointerenter="Hevy._wkHover(' + i + ')" onfocus="Hevy._wkHover(' + i + ')"'
           + ' onpointerleave="Hevy._wkHover(-1)" onblur="Hevy._wkHover(-1)"'
           + ' aria-label="' + this._label(w) + '">'
           + '<span class="hw-bar" style="height:' + h + '%"></span>'
           + '<span class="hw-lb">' + this._md(w.mon) + '</span></button>';
    }).join('');

    return '<div class="hw">'
      + '<div class="hw-head"><span class="hw-t">주간 볼륨</span>'
      + '<span class="hw-n">최근 ' + ws.length + '주</span></div>'
      + '<div class="hw-bars">' + bars + '</div>'
      + '<div class="hw-read" id="hwRead">' + this._label(cur)
      + (cur.now ? ' <span class="hw-wip">진행 중</span>' : '') + '</div>'
      + '</div>';
  },

  // 막대 위에 상자를 띄우지 않고 아래 한 줄을 바꾼다. 겹칠 일이 없고 손가락으로도 읽힌다.
  _wkHover(i) {
    const el = document.getElementById('hwRead');
    if (!el || !this._wk) return;
    const w = i < 0 ? this._wk[this._wk.length - 1] : this._wk[i];
    if (!w) return;
    el.innerHTML = this._label(w) + (w.now ? ' <span class="hw-wip">진행 중</span>' : '');
    document.querySelectorAll('.hw-col').forEach(function (c, j) {
      c.classList.toggle('on', i >= 0 && j === i);
    });
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
