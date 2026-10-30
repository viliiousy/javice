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
  // 마지막으로 읽은 결과를 남겨 둔다(설정 › 상단바 정보 › 걸음 수 아래에 보임) — 걸음이 안 들어올 때 어디서 막혔는지 알 수 있게
  DIAG: 'gl_steps_diag',
  diag() { try { return JSON.parse(localStorage.getItem(this.DIAG) || 'null'); } catch (e) { return null; } },
  // 폰(앱)이 읽은 결과는 계정에도 남긴다(gl_steps_diag_ios / _android) — 웹·허브에서도 폰 쪽에서 어디서 막혔는지 보이게
  _note(ok, msg) { const v = JSON.stringify({ at: Date.now(), ok, msg });
    try { localStorage.setItem(this.DIAG, v); } catch (e) {}
    try { const p = HealthBridge.plat(); if (p && typeof UserStore !== 'undefined') { UserStore.set(this.DIAG + '_' + p, v); window.FirebaseSync?.scheduleSave?.(); } } catch (e) {}
    return msg; },
  phoneDiag() { const out = [];
    for (const [p, n] of [['ios', '아이폰'], ['android', '갤럭시']]) { try { const d = JSON.parse(UserStore.get(this.DIAG + '_' + p) || 'null'); if (d && d.at) out.push({ ...d, who: n }); } catch (e) {} }
    return out; },
  // 이 기기에 들어와 있는 가장 최근 걸음 날짜(폰에서 넘어온 마지막 날)
  lastDay() { const a = this.all(), ks = Object.keys(a).filter(k => a[k] > 0).sort(); return ks[ks.length - 1] || null; },
  async refresh(force) {
    if (!this.avail()) { this._note(false, window.Capacitor?.isNativePlatform?.() ? '이 앱에는 건강 앱 연결이 없습니다 — 새 앱으로 업데이트해 주세요' : '웹에서는 걸음을 읽을 수 없습니다 — 아이폰·갤럭시 앱에서 읽어 옵니다'); return; }
    if (!this.on()) return;
    if (!force && this._at && Date.now() - this._at < 5 * 60000) return;
    if (this._busy) return; this._busy = true; this._at = Date.now();
    try {
      let r;
      try { r = await HealthBridge.steps(this._first ? 2 : 7); }
      catch (e) { const m = String(e && e.message || e); this._note(false, /not implemented|is not a function|UNIMPLEMENTED/i.test(m) ? '이 앱 버전은 걸음 읽기가 없습니다 — 새 앱으로 업데이트해 주세요' : '걸음을 읽지 못했습니다: ' + m); return; }
      this._first = true;
      if (!r || !r.ok || !r.days) { this._note(false, HealthBridge.plat() === 'android' ? (r && r.install ? 'Health Connect 가 없거나 꺼져 있습니다' : 'Health Connect 에서 Bashy 의 걸음 읽기를 허용해 주세요') : '건강 앱 권한이 없습니다 — 아이폰 설정 › 건강 › 데이터 접근 및 기기 › Bashy › 걸음을 켜 주세요' + (r && r.error ? ` (${r.error})` : '')); return; }
      { const today = r.days[this._ds()] || 0, any = Object.values(r.days).some(v => Number(v) > 0);
        this._note(any, any ? `오늘 ${Number(today).toLocaleString('ko-KR')}걸음 읽음` : (HealthBridge.plat() === 'android' ? 'Health Connect 에 걸음이 없습니다 — 삼성 헬스 › 설정 › Health Connect 연결과 Bashy 걸음 권한을 확인해 주세요' : '건강 앱에서 걸음이 0으로 옵니다 — 아이폰 설정 › 건강 › 데이터 접근 및 기기 › Bashy › 걸음이 꺼져 있을 가능성이 큽니다')); }
      const K = this._key(), m = this._rd(K); let ch = false;
      for (const [k, v] of Object.entries(r.days)) { const n = Math.round(Number(v) || 0); if (m[k] !== n) { m[k] = n; ch = true; } }
      // 60일보다 오래된 날은 지운다
      const cut = this._ds(Date.now() - 60 * 86400000);
      for (const k of Object.keys(m)) if (k < cut) { delete m[k]; ch = true; }
      if (!ch) return;
      UserStore.set(K, JSON.stringify(m)); window.FirebaseSync?.scheduleSave?.();
      try { App._updateStatsBanner(); } catch (e) {}
      try { if (document.getElementById('dietWrap')) Diet.render(App.S && App.S.selDate ? new Date(App.S.selDate) : new Date()); } catch (e) {}
    } catch (e) { console.warn('[steps]', e); this._note(false, '걸음을 읽다 오류: ' + (e && e.message || e)); }
    finally { this._busy = false; try { if (document.getElementById('stepsDiag')) TopInfo._diagPaint(); } catch (e) {} }
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
