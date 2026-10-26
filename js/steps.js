// js/steps.js — 하루 걸음 수(아이폰 건강 앱) · 걸으며 쓴 열량
//
// 아이폰 앱에서만 건강 앱의 걸음 수를 읽는다(BashyNative.healthSteps — 하루 합계). 읽은 값은 계정에 날짜별로 저장해서
// 웹·태블릿에서도 같은 걸음 수가 보인다. 상단바 '걸음' 칩(설정 › 디자인 › 상단바 정보)과 식단의 '+ 도보' 에 쓴다.
//
// 열량: 걸음 × 몸무게(kg) × 0.0005 kcal — 가만히 있을 때보다 더 쓴 몫(70kg 이면 만 보에 약 350kcal).
// 그날 체크한 유산소(걷기·러닝·트레드밀 등)는 이미 운동 열량으로 센다 → 그 시간에 걸었을 걸음(분당 걷기 110 · 달리기 160)을
// 걸음 수에서 빼고 남은 걸음만 도보 열량으로 센다(같은 걸음을 두 번 세지 않게).
const Steps = {
  KEY: 'gl_steps',
  KCAL_PER_STEP_KG: 0.0005,
  _ds(d) { const x = new Date(d || Date.now()); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; },
  all() { try { return JSON.parse(UserStore.get(this.KEY) || '{}') || {}; } catch (e) { return {}; } },
  get(d) { const v = this.all()[this._ds(d)]; return Number(v) > 0 ? Math.round(v) : 0; },
  avail() { try { const B = window.Capacitor?.Plugins?.BashyNative; return !!(B && B.healthSteps && window.Capacitor?.getPlatform?.() === 'ios'); } catch (e) { return false; } },
  on() { try { return typeof TopInfo === 'undefined' || TopInfo.get().steps !== false; } catch (e) { return true; } },

  // 건강 앱에서 최근 며칠 걸음을 받아 계정에 저장한다(5분에 한 번까지). 바뀌었으면 화면을 다시 그린다.
  async refresh(force) {
    if (!this.avail() || !this.on()) return;
    if (!force && this._at && Date.now() - this._at < 5 * 60000) return;
    if (this._busy) return; this._busy = true; this._at = Date.now();
    try {
      const r = await window.Capacitor.Plugins.BashyNative.healthSteps({ days: this._first ? 2 : 7 });
      this._first = true;
      if (!r || !r.ok || !r.days) return;
      const m = this.all(); let ch = false;
      for (const [k, v] of Object.entries(r.days)) { const n = Math.round(Number(v) || 0); if (m[k] !== n) { m[k] = n; ch = true; } }
      // 60일보다 오래된 날은 지운다
      const cut = this._ds(Date.now() - 60 * 86400000);
      for (const k of Object.keys(m)) if (k < cut) { delete m[k]; ch = true; }
      if (!ch) return;
      UserStore.set(this.KEY, JSON.stringify(m)); window.FirebaseSync?.scheduleSave?.();
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
