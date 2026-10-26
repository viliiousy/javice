// js/steps.js — 하루 걸음 수(아이폰 건강 앱) · 걸으며 쓴 열량
//
// 아이폰 앱은 건강 앱, 갤럭시(안드로이드 앱)는 Health Connect 의 하루 걸음 합계를 읽는다(HealthBridge.steps). 읽은 값은 계정에 날짜별로 저장해서
// 웹·태블릿에서도 같은 걸음 수가 보인다. 상단바 '걸음' 칩(설정 › 디자인 › 상단바 정보)과 식단의 '+ 도보' 에 쓴다.
//
// 열량: 걸음 × 몸무게(kg) × 0.0005 kcal — 가만히 있을 때보다 더 쓴 몫(70kg 이면 만 보에 약 350kcal).
// 그날 체크한 유산소(걷기·러닝·트레드밀 등)는 이미 운동 열량으로 센다 → 그 시간에 걸었을 걸음(분당 걷기 110 · 달리기 160)을
// 걸음 수에서 빼고 남은 걸음만 도보 열량으로 센다(같은 걸음을 두 번 세지 않게).
// ── 건강 데이터 다리: 아이폰은 애플 건강(BashyNative — 우리 네이티브 코드), 갤럭시·안드로이드는 Health Connect(@capgo/capacitor-health) ──
//   삼성 헬스 › 설정 › Health Connect 를 켜 두면 삼성 헬스의 걸음·체중·체지방이 Health Connect 로 들어오고, Bashy 는 거기서 읽기만 한다.
const HealthBridge = {
  plat() { try { const p = window.Capacitor?.getPlatform?.(), P = window.Capacitor?.Plugins || {};
    if (p === 'ios' && P.BashyNative && P.BashyNative.healthRead) return 'ios';
    if (p === 'android' && P.Health) return 'android'; } catch (e) {} return null; },
  avail() { return !!this.plat(); },
  name() { return this.plat() === 'android' ? '삼성 헬스(Health Connect)' : '애플 건강'; },
  app() { return this.plat() === 'android' ? 'Health Connect' : '건강 앱'; },
  _iso(t) { return new Date(t).toISOString(); },
  async _hc(read) {
    const H = window.Capacitor.Plugins.Health;
    const a = await H.isAvailable().catch(() => ({ available: false }));
    if (!a || !a.available) return { ok: false, error: 'Health Connect 가 없거나 꺼져 있습니다', install: true };
    const st = await H.requestAuthorization({ read }).catch(e => ({ readAuthorized: [], error: e && e.message }));
    const ok = (st.readAuthorized || []).filter(x => read.includes(x));
    return ok.length ? { ok: true, H, granted: ok } : { ok: false, error: '권한이 없습니다' };
  },
  // 최근 days 일 걸음 { 'YYYY-MM-DD': n }
  async steps(days) {
    const p = this.plat(); if (!p) return { ok: false };
    if (p === 'ios') return window.Capacitor.Plugins.BashyNative.healthSteps({ days });
    const c = await this._hc(['steps']); if (!c.ok) return c;
    const d0 = new Date(); d0.setHours(0, 0, 0, 0); d0.setDate(d0.getDate() - (days - 1));
    const r = await c.H.queryAggregated({ dataType: 'steps', startDate: this._iso(d0), endDate: this._iso(Date.now()), bucket: 'day', aggregation: 'sum' });
    const out = {};
    for (const x of (r && r.samples) || []) out[Steps._ds(new Date(x.startDate))] = Math.round(Number(x.value) || 0);
    return { ok: true, days: out };
  },
  // 체성분: 아이폰 healthRead 와 같은 모양 { ok, data:{ wt:[{t,v}], bf:[…], ht:[{v}] }, me:{} }
  async body(days) {
    const p = this.plat(); if (!p) return { ok: false };
    if (p === 'ios') return window.Capacitor.Plugins.BashyNative.healthRead({ days });
    const c = await this._hc(['weight', 'bodyFat', 'height']); if (!c.ok) return c;
    const start = this._iso(Date.now() - days * 86400000), end = this._iso(Date.now());
    const rd = async (t, lim) => { if (!c.granted.includes(t)) return [];
      try { const r = await c.H.readSamples({ dataType: t, startDate: t === 'height' ? this._iso(0) : start, endDate: end, limit: lim || 2000, ascending: true });
        return ((r && r.samples) || []).map(x => ({ t: new Date(x.startDate).getTime(), v: Number(x.value), src: x.sourceName || '' })); } catch (e) { return []; } };
    const [wt, bf, ht] = await Promise.all([rd('weight'), rd('bodyFat'), rd('height', 1000)]);
    // 키는 cm 로(Health Connect 는 m 로 줄 수 있다), 가장 최근 한 건만
    const h = ht.length ? ht[ht.length - 1] : null; if (h && h.v < 3) h.v = h.v * 100;
    return { ok: true, data: { wt, bf, ht: h ? [h] : [] }, me: {} };
  },
  openSettings() {
    try { if (this.plat() === 'android') window.Capacitor.Plugins.Health.openHealthConnectSettings(); else Settings.openExt('x-apple-health://'); } catch (e) {}
  },
};
window.HealthBridge = HealthBridge;

const Steps = {
  KEY: 'gl_steps',
  KCAL_PER_STEP_KG: 0.0005,
  _ds(d) { const x = new Date(d || Date.now()); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; },
  // 아이폰·갤럭시를 같이 쓰는 사람: 기기마다 따로 저장하고(gl_steps_ios / gl_steps_android — 동기화 때 서로 덮지 않게),
  // 그날 걸음은 둘 중 많은 쪽을 쓴다(폰을 두고 다닌 시간이 있으면 적게 잡히므로, 더하면 같은 걸음을 두 번 센다).
  _rd(k) { try { return JSON.parse(UserStore.get(k) || '{}') || {}; } catch (e) { return {}; } },
  _key(p) { return this.KEY + '_' + (p || HealthBridge.plat() || 'x'); },
  all() { const out = {};
    for (const k of [this.KEY, this.KEY + '_ios', this.KEY + '_android']) for (const [d, v] of Object.entries(this._rd(k))) { const n = Number(v) || 0; if (!(out[d] >= n)) out[d] = n; }
    return out; },
  get(d) { const v = this.all()[this._ds(d)]; return Number(v) > 0 ? Math.round(v) : 0; },
  avail() { return HealthBridge.avail(); },
  on() { try { return typeof TopInfo === 'undefined' || TopInfo.get().steps !== false; } catch (e) { return true; } },

  // 건강 앱에서 최근 며칠 걸음을 받아 계정에 저장한다(5분에 한 번까지). 바뀌었으면 화면을 다시 그린다.
  async refresh(force) {
    if (!this.avail() || !this.on()) return;
    if (!force && this._at && Date.now() - this._at < 5 * 60000) return;
    if (this._busy) return; this._busy = true; this._at = Date.now();
    try {
      const r = await HealthBridge.steps(this._first ? 2 : 7);
      this._first = true;
      if (!r || !r.ok || !r.days) return;
      const K = this._key(), m = this._rd(K); let ch = false;
      for (const [k, v] of Object.entries(r.days)) { const n = Math.round(Number(v) || 0); if (m[k] !== n) { m[k] = n; ch = true; } }
      // 60일보다 오래된 날은 지운다
      const cut = this._ds(Date.now() - 60 * 86400000);
      for (const k of Object.keys(m)) if (k < cut) { delete m[k]; ch = true; }
      if (!ch) return;
      UserStore.set(K, JSON.stringify(m)); window.FirebaseSync?.scheduleSave?.();
      try { App._updateStatsBanner(); } catch (e) {}
      try { if (document.getElementById('dietWrap')) Diet.render(App.S && App.S.selDate ? new Date(App.S.selDate) : new Date()); } catch (e) {}
    } catch (e) { console.warn('[steps]', e); }
    finally { this._busy = false; }
  },

  // 그날 체크한 유산소 중 걷거나 뛰는 운동이 차지한 걸음(추정)
  WALK: /걷기|경보|제자리 걸음|워킹/, RUN: /러닝|달리기|조깅|트레드밀|런닝머신|러닝머신|제자리 뛰기|마라톤/,
  cardioSteps(d) {
    try {
      const b = Fitness.burn(d); let n = 0;
      for (const it of b.items || []) {
        const m = it.min || 0; if (!m) continue;
        if (this.RUN.test(it.name)) n += m * (it.kmh && it.kmh < 7 ? 110 : 160);
        else if (this.WALK.test(it.name)) n += m * 110;
      }
      return Math.round(n);
    } catch (e) { return 0; }
  },
  // 도보 열량(유산소와 겹치는 걸음은 뺀 값). { steps, net, kcal }
  kcal(d) {
    const steps = this.get(d); if (!steps) return { steps: 0, net: 0, kcal: 0 };
    const net = Math.max(0, steps - this.cardioSteps(d));
    let kg = 70; try { kg = Fitness.weightKg(); } catch (e) {}
    return { steps, net, kcal: Math.round(net * kg * this.KCAL_PER_STEP_KG) };
  },
};
window.Steps = Steps;

// 앱을 열 때, 다시 화면에 돌아올 때, 켜 둔 동안 10분마다 새로 읽는다
setTimeout(() => Steps.refresh(true), 2500);
document.addEventListener('visibilitychange', () => { if (!document.hidden) Steps.refresh(); });
setInterval(() => { if (!document.hidden) Steps.refresh(); }, 10 * 60000);
