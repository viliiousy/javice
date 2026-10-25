// js/jarvis-actions.js — AI 비서가 앱을 실제로 바꾸는 부분 (명령 목록 · 실행 · 이름 찾기 · 스마트홈)
//
// 예전 비서는 모델의 답을 먼저 띄우고 명령은 그 뒤에 조용히 실행했다. 명령이 없거나 대상을 못 찾아도
// 화면에는 '바꿨습니다' 가 그대로 남았다 — "100 익스텐션 대신 덤벨 로우" 를 바꿨다고 하고 아무것도 안 바뀐 일.
// 이제는 명령을 먼저 실행하고, 실행기가 돌려준 결과로만 '했다' 를 말한다. 못 하면 왜 못 했는지와 비슷한 후보를 말한다.
//
// 이름은 음성 인식을 거쳐 온다. '백 익스텐션' 이 '100 익스텐션' 으로, '원암' 이 '1암' 으로 들린다.
// 그래서 사용자가 말한 이름을 실제 목록과 맞춰 본다(JMatch): 숫자 ↔ 한글 읽기, 띄어쓰기 무시, 자모 단위 편집 거리.
// 이 파일은 다른 모듈(Fitness·Habits·Diet …)의 기존 함수만 부른다 — 저장 규칙을 따로 만들지 않는다.

// ── 이름 맞추기 ─────────────────────────────────────────
const JMatch = {
  SINO: ['영','일','이','삼','사','오','육','칠','팔','구'],
  EN:   ['제로','원','투','쓰리','포','파이브','식스','세븐','에잇','나인','텐'],
  KO:   ['','한','두','세','네','다섯','여섯','일곱','여덟','아홉','열'],
  // 정수 → 한자어 읽기 (100 → 백, 12 → 십이, 2026 → 이천이십육)
  sino(n) {
    n = Math.floor(Number(n)); if (!isFinite(n)) return '';
    if (n === 0) return '영';
    if (n >= 100000000) return String(n).split('').map(d => this.SINO[+d]).join('');
    let out = '';
    const man = Math.floor(n / 10000), rest = n % 10000;
    if (man) out += (man === 1 ? '' : this._four(man)) + '만';
    return out + this._four(rest);
  },
  _four(n) {
    const U = ['천','백','십',''], v = [Math.floor(n/1000), Math.floor(n/100)%10, Math.floor(n/10)%10, n%10];
    return v.map((d, i) => !d ? '' : (d === 1 && i < 3 ? '' : this.SINO[d]) + U[i]).join('');
  },
  _units(s) {
    return String(s || '')
      .replace(/(\d)\s*kg\b/gi, '$1킬로').replace(/(\d)\s*km\b/gi, '$1킬로미터').replace(/(\d)\s*ml\b/gi, '$1밀리리터')
      .replace(/(\d)\s*l\b/gi, '$1리터').replace(/(\d)\s*%/g, '$1퍼센트');
  },
  _base(s) { return this._units(s).toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); },
  // 비교할 모양 여러 개: 숫자를 한자어·영어·고유어로 읽은 것, 끝의 조사를 뗀 것
  variants(s) {
    const b = this._base(s), out = new Set([b]);
    if (/\d/.test(b)) {
      const rd = [n => this.sino(n), n => this.EN[n] || '', n => this.KO[n] || ''];
      rd.forEach(f => { const v = b.replace(/\d+/g, m => f(+m) || this.sino(+m)); if (v) out.add(v); });
    }
    for (const v of [...out]) { const t = v.replace(/(으로|에서|이랑|하고|을|를|이|가|은|는|로|도|랑)$/, ''); if (t.length >= 2 && t !== v) out.add(t); }
    return [...out].filter(Boolean);
  },
  // 한글을 자모로 풀어 쓴다 — '로우' 와 '로우우', '익스텐션' 과 '익스텐숀' 이 가까워진다
  jamo(s) {
    let o = '';
    for (const ch of s) {
      const c = ch.charCodeAt(0) - 0xAC00;
      if (c >= 0 && c < 11172) { o += String.fromCharCode(0x1100 + Math.floor(c / 588), 0x1161 + Math.floor((c % 588) / 28)); const j = c % 28; if (j) o += String.fromCharCode(0x11A7 + j); }
      else o += ch;
    }
    return o;
  },
  cho(s) { let o = ''; for (const ch of s) { const c = ch.charCodeAt(0) - 0xAC00; o += (c >= 0 && c < 11172) ? 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'[Math.floor(c / 588)] : ch; } return o; },
  lev(a, b) {
    if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
    let p = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const q = [i];
      for (let j = 1; j <= b.length; j++) q[j] = Math.min(p[j] + 1, q[j-1] + 1, p[j-1] + (a[i-1] === b[j-1] ? 0 : 1));
      p = q;
    }
    return p[b.length];
  },
  _one(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (/^[ㄱ-ㅎ]+$/.test(a)) { const c = this.cho(b); return c === a ? 0.95 : c.startsWith(a) ? 0.8 : c.includes(a) ? 0.7 : 0; }
    const [s, l] = a.length <= b.length ? [a, b] : [b, a];
    let sc = 0;
    if (s.length >= 2 && l.includes(s)) sc = 0.72 + 0.26 * (s.length / l.length);
    const ja = this.jamo(a), jb = this.jamo(b);
    sc = Math.max(sc, 1 - this.lev(ja, jb) / Math.max(ja.length, jb.length));
    return sc;
  },
  score(q, name) {
    const qa = this.variants(q), na = this.variants(name);
    let best = 0;
    for (const x of qa) for (const y of na) { const v = this._one(x, y); if (v > best) best = v; if (best === 1) return 1; }
    return best;
  },
  // items 에서 q 와 가장 가까운 것. o.name(item)→이름, o.bonus(item)→가산점(오늘 목록 등)
  find(q, items, o = {}) {
    const nameOf = o.name || (x => typeof x === 'string' ? x : x.name);
    q = String(q || '').trim();
    if (!q || !items || !items.length) return { item: null, score: 0, top: [] };
    const ranked = items.map(it => ({ it, s: Math.min(1, this.score(q, nameOf(it)) + (o.bonus ? o.bonus(it) : 0)) }))
      .sort((a, b) => b.s - a.s);
    const top = ranked.slice(0, 3).filter(r => r.s >= 0.35).map(r => nameOf(r.it));
    const b = ranked[0], s2 = ranked[1];
    const min = o.min ?? 0.62;
    if (!b || b.s < min) return { item: null, score: b ? b.s : 0, top };
    // 두 후보가 거의 같으면 고르지 않는다 — 엉뚱한 것을 바꾸는 것보다 묻는 게 낫다
    if (s2 && b.s < 0.97 && b.s - s2.s < 0.03 && nameOf(s2.it) !== nameOf(b.it)) return { item: null, score: b.s, top, ambiguous: true };
    return { item: b.it, score: b.s, top };
  },
  // 찾지 못했을 때 돌려줄 한 줄
  miss(kind, q, r) {
    if (r.ambiguous) return `'${q}' 이(가) 어느 ${kind}인지 확실하지 않습니다 — ${r.top.map(x => `'${x}'`).join(', ')} 중에서 골라 말씀해 주세요`;
    return `${kind} 중에 '${q}' 은(는) 찾지 못했습니다${r.top.length ? ` — 비슷한 것: ${r.top.map(x => `'${x}'`).join(', ')}` : ''}`;
  },
};

// ── 스마트홈 ────────────────────────────────────────────
// 허브 설정은 계정(/users/<uid>/_link/hubCfg)에 있다. SmartThings 는 서버(/api/hub stMine)가 로그인 토큰으로
// 그 사람의 SmartThings 토큰을 꺼내 대신 부르고, Home Assistant 는 이 기기에서 WebSocket 으로 바로 붙는다.
// 애플 홈은 아이폰·아이패드 앱의 BashyHome 플러그인으로만 된다.
const JHome = {
  _link: null, _linkAt: 0, _devs: null, _devAt: 0,
  async cfg(fresh) {
    if (typeof FirebaseSync === 'undefined' || !FirebaseSync.ready?.()) return { prov: null, why: 'login' };
    if (fresh || !this._link || Date.now() - this._linkAt > 5 * 60e3) {
      const l = await FirebaseSync.getLink().catch(() => null);
      // 토큰은 들고 다니지 않는다 — 연결 여부와 HA 접속 정보만
      const c = (l && l.hubCfg) || {};
      this._link = { hub: { provider: c.provider, haUrl: c.haUrl, haUrlExt: c.haUrlExt, haToken: c.haToken }, st: !!(l && l.st && l.st.rt) };
      this._linkAt = Date.now();
    }
    const h = this._link.hub, st = this._link.st;
    let prov = h.provider || (h.haToken ? 'ha' : st ? 'st' : null);
    if (prov === 'st' && !st) prov = h.haToken ? 'ha' : null;
    if (prov === 'ha' && !(h.haToken && (h.haUrl || h.haUrlExt))) prov = st ? 'st' : null;
    if (prov === 'apple' && !this._apple()) return { prov: null, why: 'apple' };
    return { prov, hub: h };
  },
  // 대화 맥락에 넣을 한 줄(기기 이름은 받아 둔 게 있을 때만)
  summary() {
    if (!this._link) return null;
    const h = this._link.hub, p = h.provider || (h.haToken ? 'ha' : this._link.st ? 'st' : null);
    const name = { st: 'SmartThings', ha: 'Home Assistant', apple: '애플 홈' }[p];
    if (!name) return '연결 안 됨';
    // 이름·종류·상태를 짧게 — 모델이 device 에 실제 이름을 그대로 넣게 한다
    const KO = { light: '조명', switch: '스위치', fan: '팬', climate: '냉난방', cover: '커튼', lock: '도어락', vacuum: '청소기', media: 'TV', appliance: '가전', scene: '장면' };
    const d = this._devs && Date.now() - this._devAt < 30 * 60e3 ? this._devs.filter(x => x.kind !== 'sensor').slice(0, 40).map(x => {
      if (x.kind === 'scene') return `${x.name}(장면)`;
      const st = this.qdead(x) ? '끊김' : x.kind === 'climate' ? `${this.qisOn(x) ? '켜짐' : '꺼짐'}${x.target != null ? ' ' + x.target + '도' : ''}` : x.kind === 'light' && this.qisOn(x) && x.level != null ? `켜짐 ${x.level}%` : this.qisOn(x) ? '켜짐' : '꺼짐';
      return `${x.room && !String(x.name).startsWith(x.room) ? x.room + ' ' : ''}${x.name}(${KO[x.kind] || x.kind}·${st})`;
    }) : null;
    return d ? { via: name, devices: d } : name;
  },
  _apple() { const C = window.Capacitor; if (!C?.isNativePlatform?.()) return null; if (C.isPluginAvailable && !C.isPluginAvailable('BashyHome')) return null; return C.Plugins?.BashyHome || null; },
  notReady(why) {
    if (why === 'login') return '스마트홈은 로그인한 뒤 설정 › 스마트홈 허브 › 스마트홈 연결에서 SmartThings 나 Home Assistant 를 연결하면 쓸 수 있습니다';
    if (why === 'apple') return '애플 홈은 아이폰·아이패드의 Bashy 앱에서만 조작할 수 있습니다';
    return '아직 스마트홈이 연결되어 있지 않습니다 — 설정 › 스마트홈 허브 › 스마트홈 연결에서 SmartThings 계정이나 Home Assistant 를 연결해 주세요';
  },

  async _st(body) {
    const idToken = await Auth._firebaseIdToken();
    if (!idToken) throw new Error('로그인이 필요합니다');
    const r = await fetch(Platform.api('/api/hub'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ act: 'stMine', idToken, ...body }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { nolink: !!j.nolink });
    return j;
  },
  _stNorm(j) {
    const out = [], rooms = j.rooms || {};
    for (const d of j.devices || []) {
      const s = d.st || {}, caps = d.caps || [], cat = String(d.cat || '').toLowerCase(), has = c => caps.includes(c);
      let kind = 'sensor';
      if (has('airConditionerMode') || /airconditioner|thermostat/.test(cat)) kind = 'climate';
      else if (has('windowShade')) kind = 'cover';
      else if (has('lock')) kind = 'lock';
      else if (has('robotCleanerMovement')) kind = 'vacuum';
      else if (has('washerOperatingState') || has('dryerOperatingState')) kind = 'appliance';
      else if (has('switch')) kind = /light/.test(cat) || has('switchLevel') ? 'light' : /fan/.test(cat) || has('fanSpeed') ? 'fan' : 'switch';
      out.push({ prov: 'st', id: d.id, name: d.name, room: rooms[d.room] || '', kind, caps,
        state: s.health === 'OFFLINE' ? '연결 끊김' : kind === 'cover' ? s.windowShade : kind === 'lock' ? s.lock : kind === 'vacuum' ? s.robotCleanerMovement : kind === 'appliance' ? s.machineState : s.switch,
        level: s.level, temp: s.temperature, target: s.coolingSetpoint ?? s.heatingSetpoint, humidity: s.humidity, mode: s.airConditionerMode });
    }
    for (const x of j.scenes || []) out.push({ prov: 'st', id: x.id, name: x.name, kind: 'scene', room: '' });
    return out;
  },

  // Home Assistant — 짧게 붙었다가 끊는다
  _haUrls(h) {
    const ws = u => { const b = String(u || '').trim().replace(/\/+$/, ''); return /^https?:\/\//.test(b) ? b.replace(/^http/, 'ws') + '/api/websocket' : null; };
    let L = [ws(h.haUrl), ws(h.haUrlExt)].filter(Boolean);
    if (location.protocol === 'https:') L = L.filter(u => u.startsWith('wss:')).concat(L.filter(u => !u.startsWith('wss:')));   // https 페이지에서는 ws:// 가 막힌다
    return [...new Set(L)];
  },
  async _haRun(h, fn) {
    let last = null;
    for (const url of this._haUrls(h)) {
      try { return await this._haOnce(url, h.haToken, fn); } catch (e) { last = e; }
    }
    throw last || new Error('Home Assistant 주소가 없습니다');
  },
  _haOnce(url, token, fn) {
    return new Promise((res, rej) => {
      let ws, id = 1, done = false; const pend = new Map();
      const fin = (e, v) => { if (done) return; done = true; clearTimeout(t); try { ws.close(); } catch {} e ? rej(e) : res(v); };
      const t = setTimeout(() => fin(new Error('Home Assistant 에 닿지 않습니다 (집 Wi-Fi 이거나 외부 주소가 필요합니다)')), 8000);
      try { ws = new WebSocket(url); } catch (e) { fin(e); return; }
      const send = m => new Promise((ok, no) => { const i = id++; pend.set(i, { ok, no }); ws.send(JSON.stringify({ ...m, id: i })); });
      ws.onerror = () => fin(new Error('Home Assistant 연결 실패'));
      ws.onmessage = async ev => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.type === 'auth_required') ws.send(JSON.stringify({ type: 'auth', access_token: token }));
        else if (m.type === 'auth_invalid') fin(new Error('Home Assistant 토큰이 맞지 않습니다 — 스마트홈 연결에서 다시 넣어 주세요'));
        else if (m.type === 'auth_ok') { try { fin(null, await fn(send)); } catch (e) { fin(e); } }
        else if (m.type === 'result' && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.success ? p.ok(m.result) : p.no(new Error(m.error?.message || '요청 실패')); }
      };
    });
  },
  HA_DOM: { light: 'light', switch: 'switch', input_boolean: 'switch', fan: 'fan', climate: 'climate', cover: 'cover', lock: 'lock', vacuum: 'vacuum', scene: 'scene', script: 'scene', media_player: 'media', humidifier: 'switch', sensor: 'sensor' },
  async _haList(h) {
    return this._haRun(h, async send => {
      const [st, areas, ents, devs] = await Promise.all([send({ type: 'get_states' }),
        send({ type: 'config/area_registry/list' }).catch(() => []), send({ type: 'config/entity_registry/list' }).catch(() => []), send({ type: 'config/device_registry/list' }).catch(() => [])]);
      const an = {}; (areas || []).forEach(a => an[a.area_id] = a.name);
      const da = {}; (devs || []).forEach(d => da[d.id] = d.area_id);
      const ea = {}; (ents || []).forEach(e => { ea[e.entity_id] = e.area_id || da[e.device_id]; if (e.hidden_by || e.disabled_by) ea[e.entity_id] = '__hide'; });
      return (st || []).filter(s => this.HA_DOM[s.entity_id.split('.')[0]] && ea[s.entity_id] !== '__hide')
        .filter(s => s.entity_id.split('.')[0] !== 'sensor' || /temperature|humidity|pm25|carbon_dioxide/.test(s.attributes?.device_class || ''))
        .map(s => { const dom = s.entity_id.split('.')[0], a = s.attributes || {};
          return { prov: 'ha', id: s.entity_id, name: a.friendly_name || s.entity_id, room: an[ea[s.entity_id]] || '', kind: this.HA_DOM[dom], dom,
            state: s.state, level: a.brightness != null ? Math.round(a.brightness / 2.55) : undefined, dim: dom === 'light' && (a.brightness != null || (a.supported_color_modes || []).some(m => m !== 'onoff')), temp: dom === 'sensor' ? s.state : a.current_temperature, target: a.temperature, unit: a.unit_of_measurement }; });
    });
  },
  async _appleList() {
    const P = this._apple(); if (!P) throw new Error(this.notReady('apple'));
    const j = await P.list(), rooms = j.rooms || {};
    const K = { light: 'light', switch: 'switch', fan: 'fan', climate: 'climate', cover: 'cover', lock: 'lock', temp: 'sensor', humidity: 'sensor' };
    const out = (j.items || []).filter(it => K[it.kind]).map(it => { const v = it.v || {}, on = v.on != null ? !!v.on : v.active != null ? !!Number(v.active) : false;
      return { prov: 'apple', id: it.id, name: it.name, room: rooms[it.room] || '', kind: K[it.kind], akind: it.kind, state: it.reachable === false ? '연결 끊김' : it.kind === 'cover' ? (Number(v.pos) > 0 ? 'open' : 'closed') : it.kind === 'lock' ? (Number(v.lock) === 1 ? 'locked' : 'unlocked') : (on ? 'on' : 'off'), level: v.brightness, dim: v.brightness != null, temp: v.cur, target: v.target, humidity: v.humidity }; });
    (j.scenes || []).forEach(x => out.push({ prov: 'apple', id: x.id, name: x.name, kind: 'scene', room: '' }));
    return out;
  },
  async devices(fresh) {
    if (!fresh && this._devs && Date.now() - this._devAt < 60e3) return this._devs;
    const c = await this.cfg();
    if (!c.prov) throw new Error(this.notReady(c.why));
    let list;
    if (c.prov === 'st') {
      try { list = this._stNorm(await this._st({})); }
      catch (e) { if (e.nolink) { this._linkAt = 0; throw new Error(this.notReady()); } throw e; }
    } else if (c.prov === 'ha') list = await this._haList(c.hub);
    else list = await this._appleList();
    this._devs = list; this._devAt = Date.now();
    return list;
  },
  KIND_WORD: [[/불|조명|전등|라이트|램프/, 'light'], [/에어컨|냉방|난방|온도|보일러/, 'climate'], [/커튼|블라인드|셔터/, 'cover'], [/선풍기|팬|환풍/, 'fan'], [/청소기/, 'vacuum'], [/도어락|잠금|문/, 'lock'], [/플러그|콘센트|스위치/, 'switch']],
  // '거실 불' 처럼 방 + 종류로 말하면 그 방의 그 종류 전부, 아니면 이름이 가장 가까운 하나
  resolve(list, q, want) {
    q = String(q || '').trim();
    const pool = want === 'scene' ? list.filter(d => d.kind === 'scene') : list.filter(d => d.kind !== 'scene');
    const r = JMatch.find(q, pool, { min: 0.6 });
    if (r.item && r.score >= 0.8) return { items: [r.item] };
    const kw = (this.KIND_WORD.find(([re]) => re.test(q)) || [])[1];
    const rooms = [...new Set(pool.map(d => d.room).filter(Boolean))];
    const room = rooms.find(rm => q.replace(/\s/g, '').includes(rm.replace(/\s/g, '')));
    if (kw || room) {
      const hit = pool.filter(d => (!kw || d.kind === kw) && (!room || d.room === room) && d.kind !== 'sensor');
      if (hit.length && (kw || hit.length <= 6) && (room || /전부|모두|다\b|전체/.test(q) || hit.length === 1)) return { items: hit };
    }
    if (r.item) return { items: [r.item] };
    return { items: [], miss: JMatch.miss('기기', q, r) };
  },
  ST: (d, cap, cmd, args) => JHome._st({ cmd: { device: d.id, commands: [{ capability: cap, command: cmd, arguments: args || [] }] } }),
  // 기기 하나에 명령 하나. 돌려주는 것은 사람에게 보일 한 줄
  async _do(d, cmd, val, hub) {
    const on = !['off', 'closed', 'locked', 'docked', '연결 끊김', 'unavailable'].includes(String(d.state));
    if (d.state === '연결 끊김' || d.state === 'unavailable') throw new Error(`'${d.name}' 이(가) 연결 끊김 상태입니다`);
    if (d.kind === 'lock' && (cmd === 'off' || cmd === 'open' || cmd === 'unlock')) throw new Error('잠금 해제는 안전을 위해 AI 로 하지 않습니다 — 앱에서 직접 열어 주세요');
    if (d.kind === 'sensor') throw new Error(`'${d.name}' 은(는) 센서라 켜고 끌 수 없습니다`);
    if (cmd === 'toggle') cmd = on ? 'off' : 'on';
    if (d.kind === 'cover' && (cmd === 'on' || cmd === 'off')) cmd = cmd === 'on' ? 'open' : 'close';
    if (d.kind === 'vacuum' && (cmd === 'on' || cmd === 'off')) cmd = cmd === 'on' ? 'start' : 'dock';
    if (d.kind === 'lock' && cmd === 'on') cmd = 'lock';
    if (d.kind === 'scene') cmd = 'scene';
    const P = d.prov;
    const ha = (domain, service, data = {}) => this._haRun(hub, send => send({ type: 'call_service', domain, service, service_data: { entity_id: d.id, ...data } }));
    const ap = (key, value) => this._apple().set({ id: d.id, key, value });
    if (cmd === 'scene') {
      if (P === 'st') await this._st({ cmd: { scene: d.id } }); else if (P === 'ha') await ha(d.dom, 'turn_on'); else await this._apple().scene({ id: d.id });
      return `'${d.name}' 장면을 실행했습니다`;
    }
    if (cmd === 'level') {
      const v = Math.max(0, Math.min(100, Math.round(Number(val))));
      if (!isFinite(v)) throw new Error('밝기 값을 알려 주세요 (0~100)');
      if (d.kind !== 'light') throw new Error(`'${d.name}' 은(는) 밝기를 바꿀 수 없습니다`);
      if (P === 'st') { if (!d.caps.includes('switchLevel')) throw new Error(`'${d.name}' 은(는) 밝기 조절이 없습니다`); await this.ST(d, 'switchLevel', 'setLevel', [v]); }
      else if (P === 'ha') await ha('light', v ? 'turn_on' : 'turn_off', v ? { brightness_pct: v } : {});
      else { await ap('brightness', v); await ap('on', v > 0).catch(() => {}); }
      return `'${d.name}' 밝기를 ${v}% 로 맞췄습니다`;
    }
    if (cmd === 'temp') {
      const v = Number(val); if (!isFinite(v) || v < 10 || v > 35) throw new Error('온도는 10~35도 사이로 말씀해 주세요');
      if (d.kind !== 'climate') throw new Error(`'${d.name}' 은(는) 온도를 맞출 수 없습니다`);
      if (P === 'st') await this.ST(d, d.mode === 'heat' ? 'thermostatHeatingSetpoint' : 'thermostatCoolingSetpoint', d.mode === 'heat' ? 'setHeatingSetpoint' : 'setCoolingSetpoint', [v]);
      else if (P === 'ha') await ha('climate', 'set_temperature', { temperature: v });
      else await ap('target', v);
      return `'${d.name}' 온도를 ${v}도로 맞췄습니다`;
    }
    if (cmd === 'open' || cmd === 'close') {
      if (d.kind !== 'cover') throw new Error(`'${d.name}' 은(는) 열고 닫는 기기가 아닙니다`);
      if (P === 'st') await this.ST(d, 'windowShade', cmd); else if (P === 'ha') await ha('cover', cmd === 'open' ? 'open_cover' : 'close_cover'); else await ap('pos', cmd === 'open' ? 100 : 0);
      return `'${d.name}' 을(를) ${cmd === 'open' ? '열었습니다' : '닫았습니다'}`;
    }
    if (cmd === 'lock') {
      if (P === 'st') await this.ST(d, 'lock', 'lock'); else if (P === 'ha') await ha('lock', 'lock'); else await ap('lock', 1);
      return `'${d.name}' 을(를) 잠갔습니다`;
    }
    if (cmd === 'start' || cmd === 'dock') {
      if (d.kind !== 'vacuum') throw new Error(`'${d.name}' 은(는) 청소기가 아닙니다`);
      if (P === 'st') await this.ST(d, 'robotCleanerMovement', 'setRobotCleanerMovement', [cmd === 'start' ? 'cleaning' : 'homing']);
      else if (P === 'ha') await ha('vacuum', cmd === 'start' ? 'start' : 'return_to_base');
      else throw new Error('애플 홈 청소기는 지원하지 않습니다');
      return `'${d.name}' ${cmd === 'start' ? '청소를 시작했습니다' : '을(를) 충전대로 보냈습니다'}`;
    }
    if (cmd === 'on' || cmd === 'off') {
      const want = cmd === 'on';
      if (d.kind === 'appliance') throw new Error(`'${d.name}' 은(는) 상태만 볼 수 있습니다`);
      if (P === 'st') await this.ST(d, 'switch', want ? 'on' : 'off');
      else if (P === 'ha') await ha(d.dom === 'input_boolean' ? 'input_boolean' : d.dom, want ? 'turn_on' : 'turn_off');
      else await ap(d.akind === 'climate' ? 'active' : 'on', want);
      return `'${d.name}' 을(를) ${want ? '켰습니다' : '껐습니다'}`;
    }
    throw new Error(`'${cmd}' 은(는) 모르는 명령입니다`);
  },
  _stateTxt(d) {
    const S = { on: '켜짐', off: '꺼짐', open: '열림', closed: '닫힘', partially: '조금 열림', locked: '잠김', unlocked: '열림', cleaning: '청소 중', docked: '충전 중', homing: '돌아가는 중', run: '동작 중', stop: '대기', cool: '냉방', heat: '난방', auto: '자동', dry: '제습' };
    let t = S[d.state] || d.state || '';
    if (d.kind === 'light' && d.state === 'on' && d.level != null) t += ` ${d.level}%`;
    if (d.kind === 'climate') t += `${d.temp != null ? ` · 실내 ${d.temp}도` : ''}${d.target != null ? ` · 설정 ${d.target}도` : ''}`;
    if (d.kind === 'sensor') t = `${d.temp ?? d.state}${d.unit || ''}${d.humidity != null ? ` · 습도 ${d.humidity}%` : ''}`;
    return t;
  },
  async run(a) {
    const cmd = String(a.cmd || a.command || 'list').toLowerCase();
    const list = await this.devices(cmd === 'list' || cmd === 'status');
    const c = await this.cfg();
    if (cmd === 'list') {
      const by = {};
      list.filter(d => d.kind !== 'scene').forEach(d => (by[d.room || '방 없음'] = by[d.room || '방 없음'] || []).push(`${d.name}(${this._stateTxt(d)})`));
      const sc = list.filter(d => d.kind === 'scene').map(d => d.name);
      const lines = Object.entries(by).map(([r, v]) => `${r}: ${v.join(', ')}`);
      if (sc.length) lines.push(`장면: ${sc.join(', ')}`);
      return { ok: true, show: lines.length ? lines.join('\n') : '연결된 기기가 없습니다' };
    }
    if (cmd === 'status') {
      const r = a.device ? this.resolve(list, a.device) : { items: list.filter(d => d.kind !== 'scene').slice(0, 20) };
      if (!r.items.length) return { ok: false, msg: r.miss };
      return { ok: true, show: r.items.map(d => `${d.name}: ${this._stateTxt(d)}`).join('\n') };
    }
    const r = this.resolve(list, a.device || a.name, cmd === 'scene' ? 'scene' : null);
    if (!r.items.length) return { ok: false, msg: r.miss };
    const done = [], fail = [];
    for (const d of r.items.slice(0, 12)) {
      try { done.push(await this._do(d, cmd, a.value, c.hub)); } catch (e) { fail.push(e.message || String(e)); }
    }
    this._devAt = 0;   // 다음 조회는 새로
    if (!done.length) return { ok: false, msg: fail.join(' / ') };
    return { ok: !fail.length, msg: done.join(', ') + (fail.length ? ` (실패: ${fail.join(' / ')})` : '') };
  },
};

// ── 말 한 줄로 바로 (허브와 같은 방식) ──────────────────────
// "조명 꺼 줘" · "거실 불 켜" · "침실1 조명 밝기 30" · "에어컨 24도로" · "다 꺼" 같은 짧은 기기 말은 AI 를 거치지 않는다.
// 태블릿 허브(js/hub.js 의 Cmd)와 같은 규칙으로 [동작] + [대상] 을 나눠 바로 실행하고, 실제 결과로 답한다.
//   대상: ① 기기 이름(방 이름 + 기기 이름 포함, 불·전등·라이트·램프 = 조명) — 가장 길게 겹치는 이름, 같은 길이면 전부
//         ② 음성 인식 오타는 JMatch 로 가까운 이름  ③ 공간(거실·침실1)  ④ 종류만(불·에어컨…) — '불 꺼' 는 켜진 조명 전부
//         ⑤ 대상 없이 '다 꺼' 는 켜진 기기 전부. 여럿 중 고를 수 없으면 되묻는다.
// 확실하지 않으면 null 을 돌려주고, 그때는 지금처럼 AI 가 home 명령으로 처리한다.
// 허브 쪽 Cmd 는 HA 상태 모양(HA.states·Dev 별명)에 묶여 있어 공유하지 않고 같은 규칙을 이 목록 모양에 옮겼다.
Object.assign(JHome, {
  qn: s => String(s || '').toLowerCase().replace(/[\s.,!?~'"·]/g, ''),
  QKW: s => String(s).replace(/(불|전등|라이트|램프)/g, '조명'),
  QPURE: /^(조명|난방|보일러|에어컨|컴퓨터|스위치|콘센트|플러그|switch)\d*$/,
  QCTRL: ['light', 'switch', 'fan', 'climate', 'cover', 'media', 'vacuum'],
  QKINDS: [
    { k: 'light', w: '조명', re: /(불|조명|전등|라이트|램프|스탠드)/, is: d => d.kind === 'light' || /(조명|불|램프|라이트|스탠드)/.test(d.name) },
    { k: 'ac', w: '에어컨', re: /(에어컨|에어콘|냉방)/, is: d => d.kind === 'climate' && !/(보일러|난방|히터)/.test(d.name) },
    { k: 'heat', w: '난방', re: /(난방|보일러|히터)/, is: d => d.kind === 'climate' && !/(에어컨|에어콘)/.test(d.name) },
    { k: 'climate', w: '냉난방기', re: /온도/, is: d => d.kind === 'climate' },
    { k: 'pc', w: '컴퓨터', re: /(컴퓨터|피씨|pc|데스크탑)/i, is: d => /(컴퓨터|pc|데스크탑)/i.test(d.name) },
    { k: 'air', w: '공기청정기', re: /(공기\s*청정기|청정기|청공)/, is: d => /(청정기|청공)/.test(d.name) || (d.kind === 'fan' && !/(선풍기|서큘|써큘|환풍)/.test(d.name)) },
    { k: 'fan', w: '선풍기', re: /(선풍기|서큘|써큘|환풍)/, is: d => /(선풍기|서큘|써큘|환풍)/.test(d.name) || (d.kind === 'fan' && !/(청정기|청공)/.test(d.name)) },
    { k: 'vacuum', w: '청소기', re: /(청소기|로청|로봇\s*청소|^\s*청소\s*(시작|해|돌려|멈춰|그만))/, is: d => d.kind === 'vacuum' },
    { k: 'tv', w: 'TV', re: /(티비|tv|텔레비전|테레비)/i, is: d => d.kind === 'media' || /(티비|tv|텔레비전)/i.test(d.name) },
    { k: 'cover', w: '커튼', re: /(커튼|블라인드|셔터|롤스크린)/, is: d => d.kind === 'cover' },
    { k: 'plug', w: '플러그', re: /(플러그|콘센트|멀티탭)/, is: d => d.kind === 'switch' },
    { k: 'lock', w: '도어락', re: /(도어락|도어\s*록|현관문|현관|자물쇠)/, is: d => d.kind === 'lock' },
  ],
  QUNLOCK: '잠금 해제는 안전을 위해 음성·AI 로 하지 않습니다 — 앱에서 직접 열어 주세요.',
  QAPP: /(알림|알람|일정|할\s*일|습관|운동|루틴|식단|메모|체크|리마인더|타이머|스톱워치|음악|노래|다크\s*모드|테마|화면|소리|진동|음성|읽어|TTS|tts)/,
  QALL: /(다\s*(꺼|켜|끄)|전부|모두|모든|전체|싹\s*다|싹|집\s*안)/,

  // 소리로 들어온 숫자 읽기: '이십사 도' → 24도, '밝기 삼십' → 밝기 30
  qnum(t) {
    const D = { 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9 };
    const conv = w => { let n = 0, m = w.match(/^(?:([이삼사오육칠팔구])?백)?(?:([이삼사오육칠팔구])?십)?([일이삼사오육칠팔구])?$/); if (!m) return w;
      if (/백/.test(w)) n += 100 * (m[1] ? D[m[1]] : 1); if (/십/.test(w)) n += 10 * (m[2] ? D[m[2]] : 1); if (m[3]) n += D[m[3]]; return String(n); };
    const NUM = '((?:[이삼사오육칠팔구]?백)?(?:[이삼사오육칠팔구]?십)?[일이삼사오육칠팔구]?)';
    return String(t)
      .replace(new RegExp(NUM + '(?=\\s*(?:퍼센트|프로|%|도(?!어)))', 'g'), w => /[십백]/.test(w) ? conv(w) : w)
      .replace(new RegExp('(밝기\\s*(?:를|을)?\\s*)' + NUM + '(?![가-힣])', 'g'), (all, a, w) => /[십백]/.test(w) ? a + conv(w) : all);
  },

  qverb(t) {
    if (/(켜져|꺼져|켜졌|꺼졌|열려|닫혀|잠겨)\s*(있|있어|있나|있니|있냐|있어요|있습니까)?\s*\??$|상태\s*(어때|알려|봐|확인)|(켜져|꺼져|열려|닫혀|잠겨)\s*있|몇\s*도(야|예요|에요|입니까|니|지|인지)?\s*\??$/.test(t)) return { act: 'ask' };
    if (/(도어락|도어\s*록|현관|자물쇠|잠금)/.test(t) && /(잠금\s*해제|해제|풀어|열어|열기|언락|unlock)/i.test(t)) return { act: 'unlock' };
    if (/(잠가|잠궈|잠그|잠금\s*해\s*줘|잠금해)/.test(t)) return { act: 'lock' };
    const deg = t.match(/(\d{2})(?:\.\d)?\s*도(?!어)/);
    if (deg && !/(밝기|%|퍼센트|프로)/.test(t)) return { act: 'temp', v: Number(deg[1]) };
    if (/(온도|난방|에어컨|에어콘|보일러)/.test(t) && /(올려|높여)/.test(t)) return { act: 'tstep', v: 1 };
    if (/(온도|난방|에어컨|에어콘|보일러)/.test(t) && /(내려|낮춰)/.test(t)) return { act: 'tstep', v: -1 };
    const pct = t.match(/(\d{1,3})\s*(%|퍼센트|프로)/) || (/밝기/.test(t) && (t.match(/밝기\D{0,6}?(\d{1,3})/) || t.match(/(\d{1,3})\D*$/)));
    if (pct) return { act: 'bri', v: Math.min(100, Number(pct[1])) };
    if (/(더\s*)?밝게|밝혀|환하게|밝기.*(올려|높여)/.test(t)) return { act: 'step', v: 25 };
    if (/(더\s*)?어둡게|어두워|밝기.*(줄여|내려|낮춰)/.test(t)) return { act: 'step', v: -25 };
    if (/(열어|열어\s*줘|걷어)/.test(t)) return { act: 'open' };
    if (/(닫아|쳐\s*줘)/.test(t)) return { act: 'close' };
    if (/(꺼(?!내)|끄(?!집|어|덕)|끔|끈|\boff\b|오프|멈춰|정지|중지|그만)/i.test(t)) return { act: 'off' };
    if (/(켜(?!보)|틀어|켬|\bon\b|시작|돌려|작동|실행)/i.test(t)) return { act: 'on' };
    return null;
  },

  qisOn(d) { return ['on', 'open', 'opening', 'heat', 'cool', 'heat_cool', 'auto', 'dry', 'fan_only', 'playing', 'unlocked', 'cleaning', 'partially'].includes(String(d.state)); },
  qdead(d) { return d.state === '연결 끊김' || d.state === 'unavailable'; },

  // 샤오미 통합처럼 '청공  Air Purifier Switch Status' · '모니터 조명 Mi Light Bar' 로 영어 설명이 붙은 이름은 앞의 한글만 (허브 HA.baseName 과 같음)
  qshort(n) {
    n = String(n || '');
    const two = n.split(/\s{2,}/);
    if (two.length > 1 && /[가-힣]/.test(two[0])) n = two[0];
    const k = n.replace(/(\s+[A-Za-z][A-Za-z0-9 ._()-]*)$/, '');
    if (k !== n && /[가-힣]/.test(k)) n = k;
    const w = n.trim().split(/\s+/);
    if (w.length === 2 && w[0] === w[1]) n = w[0];
    return n.trim();
  },
  // 답에 쓸 이름: 짧은 이름, 방 이름이 없으면 앞에 붙인다 ('조명1' → '침실1 조명1')
  qlabel(d) { const s = this.qshort(d.name); return d.room && d.kind !== 'scene' && !this.qn(s).startsWith(this.qn(d.room)) ? `${d.room} ${s}` : s; },
  // 기기 하나가 들을 수 있는 이름들: 이름, '방 + 이름', 되풀이 접기(침실1 침실1조명1), 끝 숫자 뗀 것, 종류 말 뗀 것
  qaliases(d) {
    if (d._qa) return d._qa;
    const out = new Set();
    const add = x => {
      const k = this.QKW(this.qn(x)); if (k.length < 2 || this.QPURE.test(k)) return;
      out.add(k);
      const bare = k.replace(/(조명|난방)/g, '');
      if (bare.length >= 2 && bare !== k && !/^\d+$/.test(bare)) out.add(bare);
    };
    const short = this.qshort(d.name);
    const base = [...new Set([d.name, short])];
    if (d.room && !this.qn(short).startsWith(this.qn(d.room))) base.push(d.room + ' ' + short);
    for (const nm of base) {
      add(nm);
      const w = String(nm).trim().split(/\s+/);
      if (w.length > 1 && w[1].startsWith(w[0])) add(w.slice(1).join(' '));
      add(String(nm).replace(/\s*\d+$/, ''));
    }
    Object.defineProperty(d, '_qa', { value: [...out], enumerable: false, configurable: true });
    return d._qa;
  },

  // 대상 말만 남긴다 (음성 오타 맞추기용)
  qphrase(t) {
    const V = /^(켜|꺼|끄|틀어|돌려|멈춰|정지|중지|그만|실행|시작|작동|열어|닫아|잠가|잠궈|잠그|밝게|어둡게|밝혀|환하게|맞춰|해|줘|주세요|줄래|올려|내려|높여|낮춰|부탁)/;
    return String(t).replace(/\d{1,3}\s*(%|퍼센트|프로|도)\S*/g, ' ').replace(/밝기\S*/g, ' ').replace(/[.,!?~]/g, ' ')
      .split(/\s+/).filter(w => w && !V.test(w) && !/^(좀|다|전부|모두|모든|전체|싹|그냥|지금|빨리|제발|자비스|헤이|같이|하나|좀만)$/.test(w))
      .map(w => w.length > 2 ? w.replace(/(을|를|은|는|이|가|도|좀|으로|로)$/, '') : w).join(' ').trim();
  },

  // 음성 오타 점수: 숫자 읽기(JMatch.variants)를 맞춘 뒤 자모 편집 거리만 본다.
  // (JMatch.score 의 '포함되면 높게' 는 쓰지 않는다 — '운동 시작' 이 '운동방 조명' 을 켜지 않게)
  qfz(q, name) {
    let best = 0;
    for (const x of JMatch.variants(q)) for (const y of JMatch.variants(name)) {
      if (x.length < 2 || y.length < 2) continue;
      const a = JMatch.jamo(x), b = JMatch.jamo(y);
      best = Math.max(best, 1 - JMatch.lev(a, b) / Math.max(a.length, b.length));
    }
    return best;
  },

  // { list } — 바로 실행할 대상 / { ask } — 되물을 말 / null — 모르겠음(AI 로)
  qfind(t, v, list) {
    const nt = this.QKW(this.qn(t));
    const ask = v.act === 'ask';
    let all = list.filter(d => d.kind !== 'scene' && (ask || (d.kind !== 'sensor' && d.kind !== 'appliance')));
    // 장면: 이름이 말 안에 있고 켜·실행이면
    if (v.act === 'on') {
      let sc = null, sl = 0;
      for (const d of list.filter(x => x.kind === 'scene')) {
        const ks = [this.qn(d.name), this.qn(d.name).replace(/(모드|장면|씬)$/, '')].filter(k => k.length >= 2);
        for (const k of ks) if (nt.includes(this.QKW(k)) || this.qn(t).includes(k)) { if (k.length > sl) { sc = d; sl = k.length; } }
      }
      if (sc) {
        const devLen = Math.max(0, ...all.map(d => Math.max(0, ...this.qaliases(d).filter(a => nt.includes(a)).map(a => a.length))));
        if (sl >= devLen) return { list: [sc] };
      }
    }
    let kind = this.QKINDS.find(k => k.re.test(t));
    if (!kind && (v.act === 'temp' || v.act === 'tstep')) kind = this.QKINDS.find(k => k.k === 'climate');
    if (!kind && (v.act === 'bri' || v.act === 'step')) kind = this.QKINDS[0];
    let pool = kind ? all.filter(kind.is) : all.filter(d => ask || this.QCTRL.includes(d.kind) || d.kind === 'lock');
    if (v.act === 'open' || v.act === 'close') pool = pool.filter(d => d.kind === 'cover' || d.kind === 'lock');
    const many = this.QALL.test(t);

    // ① 이름: 가장 길게 겹치는 이름. 같은 길이로 여럿이면 전부 (거실 조명 → 거실 조명1·2)
    let best = [], bestLen = 0;
    for (const d of pool) {
      let m = 0;
      for (const a of this.qaliases(d)) if (nt.includes(a) && a.length > m) m = a.length;
      if (!m) continue;
      if (m > bestLen) { best = [d]; bestLen = m; } else if (m === bestLen) best.push(d);
    }
    // ② 공간
    const rooms = [...new Set(list.map(d => d.room).filter(Boolean))];
    let area = null, alen = 0;
    for (const r of rooms) { const k = this.qn(r); if (k.length >= 2 && nt.includes(this.QKW(k)) && k.length > alen) { area = r; alen = k.length; } }
    if (best.length && !(area && bestLen <= alen)) return { list: best, how: 'name' };

    // ③ 음성 오타: 대상 말과 가장 가까운 이름 (JMatch)
    const ph = this.qphrase(t);
    const resid = this.QKW(this.qn(ph)).replace(/조명/g, '').replace(kind ? new RegExp(kind.re.source, 'gi') : /$^/, '').replace(area ? this.qn(area) : /$^/, '');
    if (ph && resid.length >= 2 && typeof JMatch !== 'undefined') {
      const q = this.QKW(ph);
      const sc = pool.map(d => ({ d, s: Math.max(this.qfz(q, this.QKW(d.name)), this.qfz(q, this.QKW(this.qshort(d.name))), d.room ? this.qfz(q, this.QKW(d.room + ' ' + this.qshort(d.name))) : 0) })).sort((a, b) => b.s - a.s);
      if (sc.length && sc[0].s >= 0.8) {
        const top = sc.filter(x => sc[0].s - x.s < 0.03);
        const stem = x => this.qn(this.qlabel(x.d)).replace(/\d+$/, '');
        if (top.length === 1 || top.every(x => stem(x) === stem(top[0]))) return { list: top.map(x => x.d) };
        return { ask: `어느 기기인지 말씀해 주세요 — ${top.slice(0, 4).map(x => this.qlabel(x.d)).join(', ')}` };
      }
    }
    if (best.length) return { list: best, how: 'name' };

    if (area) {
      let inArea = pool.filter(d => d.room === area);
      // 종류 없이 '거실 켜' 면 조명부터 (에어컨까지 켜지 않게)
      if (!kind && v.act === 'on' && inArea.some(d => d.kind === 'light')) inArea = inArea.filter(d => d.kind === 'light');
      if (inArea.length) return { list: inArea };
    }
    // ④ 종류만: 하나뿐이면 그것, '다' 가 붙었으면 전부
    if (kind) {
      if (!pool.length) return { ask: `연결된 기기 중에 ${kind.w}이(가) 없습니다.` };
      if (pool.length === 1 || many) return { list: pool };
      if (v.act === 'off') { const on = pool.filter(d => this.qisOn(d)); return { list: on.length ? on : pool }; }   // "불 꺼" = 켜진 것 전부
      if (v.act === 'ask') return { list: pool };
      if (v.act === 'on') { const off = pool.filter(d => !this.qisOn(d) && !this.qdead(d)); if (off.length === 1) return { list: off }; }
      return { ask: `어느 ${kind.w}인지 말씀해 주세요 — ${pool.slice(0, 4).map(d => this.qlabel(d)).join(', ')}${pool.length > 4 ? ' …' : ''}` };
    }
    // ⑤ 대상 없이 '다 꺼' / '집 안 전부 꺼'
    if (many && (v.act === 'off' || v.act === 'on')) {
      const rest = this.qn(t).replace(/(다|전부|모두|모든|전체|싹|집안|집|기기|가전|전기|꺼|끄|고|켜|줘|주세요|요|좀|해|줄래|봐|버려|놔|라)/g, '');
      if (!rest) {
        if (v.act === 'on') return { ask: '무엇을 켤까요? 조명·에어컨처럼 기기나 공간을 함께 말씀해 주세요.' };
        const on = pool.filter(d => ['light', 'switch', 'fan', 'climate', 'media'].includes(d.kind) && this.qisOn(d));
        return on.length ? { list: on } : { ask: '이미 모두 꺼져 있습니다.' };
      }
    }
    return null;
  },

  qj(w, a, b) {
    const s = String(w), ch = s[s.length - 1], c = s.charCodeAt(s.length - 1);
    if (/\d/.test(ch)) return s + ('013678'.includes(ch) ? a : b);
    return s + ((c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28) ? a : b);
  },
  // '거실 조명1, 거실 조명2' → '거실 조명1·2'
  qnames(ds) {
    const g = [];
    for (const d of ds) { const m = this.qlabel(d).match(/^(.*?)(\d+)$/); const p = m ? m[1] : null, x = p != null && g.find(e => e.p === p); if (x) x.n.push(m[2]); else g.push(m ? { p, n: [m[2]] } : { p: this.qlabel(d), n: [] }); }
    const parts = g.map(e => e.p + e.n.join('·'));
    return parts.length > 3 ? `${parts[0]} 등 ${ds.length}개` : parts.join(', ');
  },

  async qexec(v, hits, hub) {
    if (v.act === 'ask') return hits.slice(0, 12).map(d => `${this.qlabel(d)} ${this.qdead(d) ? '연결 안 됨' : this._stateTxt(d)}`).join(', ') + '.';
    if (v.act === 'unlock' || (hits.some(d => d.kind === 'lock') && ['on', 'open'].includes(v.act))) return this.QUNLOCK;
    if (v.act === 'off' && hits.every(d => d.kind === 'lock')) return `도어락은 '잠가 줘' 라고 말씀하시면 잠급니다.`;
    const dead = hits.filter(d => this.qdead(d)), live = hits.filter(d => !this.qdead(d));
    if (!live.length) return `${this.qj(this.qlabel(dead[0]), '이', '가')} 지금 연결되어 있지 않습니다.`;
    const jobs = [];   // [기기, 할 일]
    for (const d of live) {
      if (v.act === 'scene' || d.kind === 'scene') { jobs.push([d, () => this._do(d, 'scene', null, hub)]); continue; }
      if (v.act === 'bri' || v.act === 'step') {
        if (d.kind !== 'light' || !(d.dim || (d.caps || []).includes('switchLevel'))) continue;
        const cur = this.qisOn(d) ? (d.level ?? 100) : 0;
        const val = v.act === 'bri' ? v.v : Math.max(0, Math.min(100, cur + v.v));
        jobs.push([d, async () => { await this._do(d, 'level', val, hub); d.state = val ? 'on' : 'off'; d.level = val; }]);
        continue;
      }
      if (v.act === 'temp' || v.act === 'tstep') {
        if (d.kind !== 'climate') continue;
        const val = v.act === 'temp' ? v.v : Number(d.target ?? 24) + v.v;
        jobs.push([d, async () => { if (!this.qisOn(d)) { await this._do(d, 'on', null, hub); d._turnedOn = true; d.state = d.mode || 'on'; } await this._do(d, 'temp', val, hub); d.target = val; }]);
        continue;
      }
      if (v.act === 'open' || v.act === 'close') {
        if (d.kind !== 'cover') continue;
        jobs.push([d, async () => { await this._do(d, v.act, null, hub); d.state = v.act === 'open' ? 'open' : 'closed'; }]);
        continue;
      }
      if (v.act === 'lock') {
        if (d.kind !== 'lock' || d.state === 'locked') continue;
        jobs.push([d, async () => { await this._do(d, 'lock', null, hub); d.state = 'locked'; }]);
        continue;
      }
      if (d.kind === 'lock') continue;
      if (v.act === 'off' && !this.qisOn(d)) continue;   // 이미 꺼진 건 건너뛴다
      if (v.act === 'on' && this.qisOn(d) && d.kind !== 'vacuum') continue;
      jobs.push([d, async () => { await this._do(d, v.act, null, hub); d.state = d.kind === 'vacuum' ? (v.act === 'on' ? 'cleaning' : 'docked') : d.kind === 'cover' ? (v.act === 'on' ? 'open' : 'closed') : v.act; }]);
    }
    const tail = dead.length ? ` (${dead.map(d => this.qlabel(d)).join(', ')} 연결 안 됨)` : '';
    if (!jobs.length) {
      if (v.act === 'on' || v.act === 'off') return `이미 ${v.act === 'on' ? '켜져' : '꺼져'} 있습니다.${tail}`;
      if (v.act === 'lock') return `이미 잠겨 있습니다.${tail}`;
      if (v.act === 'bri' || v.act === 'step') return `${this.qj(this.qnames(live), '은', '는')} 밝기를 바꿀 수 없는 기기입니다.`;
      if (v.act === 'temp' || v.act === 'tstep') return `${this.qj(this.qnames(live), '은', '는')} 온도를 맞출 수 없는 기기입니다.`;
      return `${this.qj(this.qnames(live), '은', '는')} 그렇게 조작할 수 없는 기기입니다.`;
    }
    const res = await Promise.allSettled(jobs.map(([, f]) => f()));
    const ok = jobs.filter((_, i) => res[i].status === 'fulfilled').map(([d]) => d);
    const bad = res.filter(r => r.status === 'rejected').map(r => r.reason?.message || String(r.reason));
    const fail = bad.length ? ` (실패: ${[...new Set(bad)].join(' / ')})` : '';
    if (!ok.length) return `실패했습니다: ${[...new Set(bad)].join(' / ')}`;
    const nm = this.qnames(ok), obj = this.qj(nm, '을', '를');
    let msg;
    if (ok.every(d => d.kind === 'scene')) msg = `'${nm}' 장면을 실행했습니다.`;
    else if (v.act === 'bri') msg = `${nm} 밝기를 ${v.v}% 로 맞췄습니다.`;
    else if (v.act === 'step') msg = `${obj} ${v.v > 0 ? '밝게' : '어둡게'} 했습니다.`;
    else if (v.act === 'temp' || v.act === 'tstep') msg = `${ok.some(d => d._turnedOn) ? `${obj} 켜고 ` : `${nm} `}온도를 ${ok.map(d => d.target).filter((x, i, a) => a.indexOf(x) === i).join('·')}도로 맞췄습니다.`;
    else if (v.act === 'open' || v.act === 'close') msg = `${obj} ${v.act === 'open' ? '열었습니다' : '닫았습니다'}.`;
    else if (v.act === 'lock') msg = `${obj} 잠갔습니다.`;
    else if (ok.every(d => d.kind === 'vacuum')) msg = v.act === 'on' ? `${nm} 청소를 시작했습니다.` : `${obj} 충전대로 보냈습니다.`;
    else msg = `${obj} ${v.act === 'on' ? '켰습니다' : '껐습니다'}.`;
    ok.forEach(d => { delete d._turnedOn; });
    return msg + fail + tail;
  },

  async _qlist(maxAge) {
    if (this._devs && Date.now() - this._devAt < maxAge) return this._devs;
    return this.devices(true);
  },
  // 허브식 바로 처리. 답할 한 줄(문자열) 또는 null(AI 로 넘김)
  async quick(text) {
    const t = this.qnum(String(text || '').trim());
    if (!t || t.length > 60) return null;
    const v = this.qverb(t);
    if (!v) return null;
    if (v.act === 'unlock') return this.QUNLOCK;   // 연결 여부와 상관없이 늘 거절
    let c;
    try { c = await Promise.race([this.cfg(), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 4000))]); } catch (e) { return null; }
    if (!c || !c.prov) return null;
    let list;
    try { list = await Promise.race([this._qlist(5 * 60e3), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 6000))]); } catch (e) { return null; }
    let f = this.qfind(t, v, list);
    if (!f) return null;
    // 앱 기능 말('알림 켜 줘'·'운동 시작')이 섞이면 기기 이름이 정확히 들어 있을 때만 바로 처리한다
    if (this.QAPP.test(t) && f.how !== 'name') return null;
    if (f.ask) return f.ask;
    // 켜고 끄는 판단은 지금 상태로 — 받아 둔 목록이 오래됐으면 새로 받아 다시 고른다
    if (Date.now() - this._devAt > 20e3) {
      try { list = await this.devices(true); const g = this.qfind(t, v, list); if (g) f = g; if (f.ask) return f.ask; } catch (e) {}
    }
    try { return await this.qexec(v, f.list, c.hub); }
    catch (e) { return '실패했습니다: ' + (e.message || e); }
  },
});

// ── 명령 실행기 ─────────────────────────────────────────
const JarvisActions = {
  DOW: '일월화수목금토',
  _ds(d) { return Fitness._dateStr(d || new Date()); },
  // '2026-10-21' · '오늘' · '내일' · '어제' · '모레' · '월요일' → 날짜
  _date(v) {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    if (!v) return t;
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) { const d = new Date(s.slice(0, 10) + 'T00:00:00'); return isNaN(d) ? t : d; }
    const rel = { 오늘: 0, 금일: 0, 내일: 1, 모레: 2, 어제: -1, 그제: -2, 그저께: -2 }[s];
    if (rel != null) { t.setDate(t.getDate() + rel); return t; }
    const w = this.DOW.indexOf(s[0]);
    if (w >= 0 && /요일/.test(s)) { t.setDate(t.getDate() + ((w - t.getDay() + 7) % 7)); return t; }
    const d = new Date(s); return isNaN(d) ? t : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  },
  _dow(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' || /^\d$/.test(String(v))) { const n = +v; return n >= 0 && n <= 6 ? n : n === 7 ? 0 : null; }
    const i = this.DOW.indexOf(String(v).trim()[0]); return i >= 0 ? i : null;
  },
  _md(d) { return `${d.getMonth() + 1}/${d.getDate()}(${this.DOW[d.getDay()]})`; },
  _rerender() {
    const sel = App?.S?.selDate || new Date();
    try { Fitness.render(sel); } catch (e) {}
    try { Habits.render(sel); } catch (e) {}
    try { Diet.render(sel); } catch (e) {}
    try { App._updateStatsBanner(); } catch (e) {}
  },

  // '3×12' · '3x12' · '3세트 12회' · '12회 3세트' · {sets:3,reps:12} · '30분' → 앱이 쓰는 모양
  _sets(a, cur) {
    let s = a.sets;
    if (a.reps != null && (typeof s === 'number' || /^\d+$/.test(String(s || '')))) return `${+s || 3}×${+a.reps}`;
    if (a.reps != null && s == null) return `${(cur && WorkoutMode._nSets(cur)) || 3}×${+a.reps}`;
    if (s == null || s === '') return null;
    if (typeof s === 'number') return `${s}×${(cur && WorkoutMode._reps(cur)) || 12}`;
    s = String(s).trim();
    let m;
    if ((m = s.match(/(\d+)\s*(?:분|min)/i))) return `${m[1]}분`;
    if ((m = s.match(/^(\d+)\s*[×xX*]\s*(\d+(?:\s*[-~]\s*\d+)?)$/))) return `${m[1]}×${m[2].replace(/\s/g, '')}`;
    if ((m = s.match(/(\d+)\s*세트\D*(\d+)\s*(?:회|개|번|렙)/))) return `${m[1]}×${m[2]}`;
    if ((m = s.match(/(\d+)\s*(?:회|개|번|렙)\D*(\d+)\s*세트/))) return `${m[2]}×${m[1]}`;
    if ((m = s.match(/^세트\s*(\d+)/))) return `${(cur && WorkoutMode._nSets(cur)) || 3}×${m[1]}`;
    if ((m = s.match(/^(\d+)\s*세트$/))) return `${m[1]}×${(cur && WorkoutMode._reps(cur)) || 12}`;
    if ((m = s.match(/^(\d+)\s*(?:회|개|번|렙)$/))) return `${(cur && WorkoutMode._nSets(cur)) || 3}×${m[1]}`;
    return s.slice(0, 20);
  },
  _setsTxt(x) {
    if (typeof PlanGen !== 'undefined' && PlanGen.timed(x.name)) return x.sets || '';
    return `${x.sets || ''}${x.w !== '' && x.w != null && Number(x.w) > 0 ? ` · ${x.w}kg` : ''}`;
  },
  // 운동 이름을 종목 사전의 이름으로 맞춘다(아주 가까울 때만). 사전에 없으면 말한 그대로 쓴다.
  _exName(n) {
    n = String(n || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!n || typeof EX_DB === 'undefined') return n;
    const all = [...new Set(Object.values(EX_DB).flat())];
    const r = JMatch.find(n, all, { min: 0.86 });
    return r.item || n;
  },
  _wList(d) {
    return Fitness.exercisesFor(d).list.map(x => ({ name: x.name, sets: x.sets || Fitness.defSets(x.name), w: x.w ?? '', ...(x.sess != null ? { sess: x.sess } : {}), ...(x.hp != null ? { hp: x.hp } : {}) }));
  },
  _wFind(list, q) {
    const r = JMatch.find(q, list);
    return r.item ? { i: list.indexOf(r.item), x: r.item } : { miss: JMatch.miss('운동', q, r) + (list.length ? '' : ' — 그날 운동 목록이 비어 있습니다') };
  },
  _scope(a) { return /plan|앞으로|루틴|계속/.test(String(a.scope || '')) ? 'plan' : 'day'; },
  _wApply(d, list, a, what) {
    const ds = this._ds(d), scope = this._scope(a);
    if (Fitness._ed && Fitness._ed.ds === ds) Fitness._ed = null;   // 열려 있던 수정 화면이 덮어쓰지 않게
    const m = Fitness.applyList(ds, list, scope);
    this._rerender();
    const when = ds === this._ds() ? '오늘' : this._md(d);
    return { ok: true, msg: `${what} (${scope === 'plan' ? m : when + '만'})` };
  },
  _isFuture(d) { return this._ds(d) > this._ds(); },
  // 요일 계획을 바꾸면 오늘 목록이 통째로 바뀐다 — 완료 표시는 번호가 아니라 운동 이름으로 다시 맞춘다
  _keepDone(fn) {
    const d = new Date(), before = Fitness.exercisesFor(d).list, done = new Set(Fitness._checked(d).map(i => before[i]?.name).filter(Boolean));
    const r = fn();
    const after = Fitness.exercisesFor(d).list; Fitness._save(after.map((x, i) => done.has(x.name) ? i : -1).filter(i => i >= 0), d);
    return r;
  },

  W: {
    ex_list(a) {
      const d = this._date(a.date), { plan, list } = Fitness.exercisesFor(d), chk = Fitness._checked(d), L = PlanGen.log(this._ds(d));
      if (!list.length) return { ok: true, show: `${this._md(d)} 운동: ${plan.name || '계획 없음'} — 운동이 없습니다` };
      return { ok: true, show: `${this._md(d)} ${plan.name}\n` + list.map((x, i) => `${i + 1}. ${x.name} ${this._setsTxt(x)}${chk.includes(i) ? ' (완료)' : ''}${L[x.name]?.length ? ` · 기록 ${L[x.name].map(s => s.w ? `${s.w}kg×${s.r}` : `${s.r}회`).join(', ')}` : ''}`).join('\n') };
    },
    // 그날 운동을 부위로 다시 짜기 — '오늘 하체 말고 가슴' (parts: ['가슴','팔'])
    ex_parts(a) {
      const d = this._date(a.date), ok = ['가슴', '등', '하체', '어깨', '팔', '복근'];
      const parts = [].concat(a.parts || a.part || []).map(x => String(x).replace(/이두|삼두|팔뚝/, '팔').replace(/다리|하체운동/, '하체').replace(/복부|코어/, '복근')).filter(x => ok.includes(x));
      if (!parts.length) return { ok: false, msg: '어느 부위로 바꿀지 알려 주세요 (가슴·등·하체·어깨·팔·복근)' };
      const list = PlanGen.dayFor(parts);
      if (!list.length) return { ok: false, msg: '고른 부위로 짤 수 있는 운동이 없습니다 — 맞춤 플랜의 기구 설정을 확인해 주세요' };
      Fitness.applyList(this._ds(d), list, a.scope === 'plan' ? 'plan' : 'day');
      try { Fitness.render(d); } catch (e) {}
      return { ok: true, msg: `${this._md(d)} 운동을 ${parts.join(' + ')}(으)로 바꿨습니다: ${list.map(x => x.name).join(', ')}` };
    },
    ex_swap(a) {
      const d = this._date(a.date), list = this._wList(d), f = this._wFind(list, a.from || a.name);
      if (f.miss) return { ok: false, msg: f.miss };
      const to = this._exName(a.to || a.new || a.newName);
      if (!to) return { ok: false, msg: '무엇으로 바꿀지 알려 주세요' };
      const x = f.x, old = x.name, timedChange = PlanGen.timed(to) !== PlanGen.timed(old);
      x.name = to; delete x.hp;
      const s = this._sets(a, x.sets);
      if (s) x.sets = s; else if (timedChange) x.sets = Fitness.defSets(to);
      x.w = a.w != null && Number(a.w) > 0 ? Number(a.w) : '';   // 다른 운동이라 예전 무게는 맞지 않는다 — 비우면 지난 기록으로 권장 무게가 나온다
      return this._wApply(d, list, a, `'${old}' 을(를) '${to}' ${this._setsTxt(x)} 로 바꿨습니다`);
    },
    ex_add(a) {
      const d = this._date(a.date), list = this._wList(d), name = this._exName(a.name || a.to);
      if (!name) return { ok: false, msg: '추가할 운동 이름을 알려 주세요' };
      const x = { name, sets: this._sets(a) || Fitness.defSets(name), w: a.w != null && Number(a.w) > 0 ? Number(a.w) : '' };
      const p = Number(a.pos);
      if (p >= 1 && p <= list.length) list.splice(p - 1, 0, x); else list.push(x);
      return this._wApply(d, list, a, `'${name}' ${this._setsTxt(x)} 을(를) 추가했습니다`);
    },
    ex_remove(a) {
      const d = this._date(a.date), list = this._wList(d), f = this._wFind(list, a.name);
      if (f.miss) return { ok: false, msg: f.miss };
      list.splice(f.i, 1);
      return this._wApply(d, list, a, `'${f.x.name}' 을(를) 뺐습니다`);
    },
    ex_set(a) {
      const d = this._date(a.date), list = this._wList(d), f = this._wFind(list, a.name);
      if (f.miss) return { ok: false, msg: f.miss };
      const s = this._sets(a, f.x.sets);
      if (!s && (a.w == null || a.w === '')) return { ok: false, msg: '세트·횟수나 무게 중 무엇을 바꿀지 알려 주세요' };
      if (s) f.x.sets = s;
      if (a.w != null && a.w !== '') f.x.w = Number(a.w) > 0 ? Number(a.w) : '';
      return this._wApply(d, list, a, `'${f.x.name}' 을(를) ${this._setsTxt(f.x)} 로 바꿨습니다`);
    },
    ex_move(a) {
      const d = this._date(a.date), list = this._wList(d), f = this._wFind(list, a.name);
      if (f.miss) return { ok: false, msg: f.miss };
      let p = Number(a.pos ?? a.to); if (a.pos === 'last' || a.to === 'last') p = list.length; if (a.pos === 'first') p = 1;
      if (!(p >= 1)) return { ok: false, msg: '몇 번째로 옮길지 알려 주세요' };
      p = Math.min(p, list.length);
      list.splice(f.i, 1); list.splice(p - 1, 0, f.x);
      return this._wApply(d, list, a, `'${f.x.name}' 을(를) ${p}번째로 옮겼습니다`);
    },
    ex_done(a) {
      const d = this._date(a.date);
      if (this._isFuture(d)) return { ok: false, msg: '아직 오지 않은 날은 완료로 표시할 수 없습니다' };
      const { list } = Fitness.exercisesFor(d), chk = Fitness._checked(d), want = a.done !== false;
      if (!list.length) return { ok: false, msg: `${this._md(d)} 에는 운동이 없습니다` };
      let idx;
      if (!a.name || /^(전체|전부|모두|다|all)$/i.test(String(a.name).trim())) idx = list.map((_, i) => i);
      else { const f = this._wFind(list, a.name); if (f.miss) return { ok: false, msg: f.miss }; idx = [f.i]; }
      const set = new Set(chk); idx.forEach(i => want ? set.add(i) : set.delete(i));
      Fitness._save([...set], d); this._rerender();
      return { ok: true, msg: `${idx.length > 1 ? `운동 ${idx.length}개를` : `'${list[idx[0]].name}' 을(를)`} ${want ? '완료로 표시했습니다' : '완료 해제했습니다'}` };
    },
    ex_log(a) {
      const d = this._date(a.date), ds = this._ds(d), { list } = Fitness.exercisesFor(d);
      if (this._isFuture(d)) return { ok: false, msg: '아직 오지 않은 날에는 기록할 수 없습니다' };
      const f = this._wFind(list, a.name);
      const name = f.miss ? this._exName(a.name) : f.x.name;
      if (!name) return { ok: false, msg: '어느 운동인지 알려 주세요' };
      let sets = Array.isArray(a.sets) ? a.sets : [];
      if (!sets.length && (a.r || a.reps)) sets = Array.from({ length: Number(a.n || a.count) || 1 }, () => ({ w: a.w, r: a.r || a.reps }));
      sets = sets.map(s => ({ w: Number(s.w ?? s.kg) || 0, r: Number(s.r ?? s.reps) || 0 })).filter(s => s.r > 0).slice(0, 20);
      if (!sets.length) return { ok: false, msg: '무게와 횟수를 알려 주세요 (예: 60kg 10회 3세트)' };
      const L = PlanGen.log(ds); L[name] = sets; PlanGen.saveLog(ds, L);
      if (!f.miss) { const chk = Fitness._checked(d); if (!chk.includes(f.i)) { chk.push(f.i); Fitness._save(chk, d); } }
      this._rerender();
      return { ok: true, msg: `'${name}' ${sets.map(s => s.w ? `${s.w}kg×${s.r}` : `${s.r}회`).join(', ')} 기록했습니다${f.miss ? ' (그날 목록에는 없는 운동이라 기록만 남겼습니다)' : ''}${(() => { const m = typeof VolTier !== 'undefined' ? VolTier.warn(name, sets, ds) : ''; return m ? '\n' + m : ''; })()}` };
    },
    workout_start(a) {
      const ds = this._ds(this._date(a.date));
      if (!Fitness.exercisesFor(new Date(ds + 'T00:00:00')).list.length) return { ok: false, msg: '그날 계획된 운동이 없습니다 — 먼저 운동을 추가해 주세요' };
      try { JARVIS.close(); } catch (e) {}
      WorkoutMode.startFor(ds);
      return { ok: true, msg: '운동 시작 화면을 열었습니다' };
    },
    routine_save(a) {
      const name = String(a.name || '').trim().slice(0, 30);
      if (!name) return { ok: false, msg: '루틴 이름을 알려 주세요' };
      const R = Fitness.routines();
      const old = JMatch.find(name, Object.entries(R).map(([id, r]) => ({ id, name: r.name })), { min: 0.9 }).item;
      const ex = (Array.isArray(a.exercises) ? a.exercises : []).map(e => typeof e === 'string' ? { name: e } : e).filter(e => e && e.name)
        .map(e => { const n = this._exName(e.name); const o = { name: n, sets: this._sets(e) || Fitness.defSets(n) }; if (Number(e.w) > 0) o.w = Number(e.w); return o; });
      if (!ex.length && !old) return { ok: false, msg: '루틴에 넣을 운동을 알려 주세요' };
      const id = old ? old.id : 'r_' + Date.now().toString(36);
      R[id] = { name, exercises: ex.length ? ex : R[id].exercises };
      Fitness.saveRoutines(R);
      const days = (Array.isArray(a.days) ? a.days : a.days != null ? [a.days] : []).map(v => this._dow(v)).filter(v => v != null);
      if (days.length) this._keepDone(() => {
        const dp = Fitness.dayPlan();
        days.forEach(i => { const cur = Fitness.picks(i).filter(x => x !== 'rest' && x !== 'none' && x !== id); Fitness._setPicks(dp, i, a.mode === 'add' && cur.length ? [...cur, id] : [id]); });
        Fitness.saveDayPlan(dp);
      });
      this._rerender();
      return { ok: true, msg: `'${name}' 루틴을 ${old ? '고쳤습니다' : '만들었습니다'} (${R[id].exercises.length}종목${days.length ? ` · ${days.map(i => this.DOW[i]).join('·')}요일` : ''})` };
    },
    day_assign(a) {
      const dows = (Array.isArray(a.dow) ? a.dow : [a.dow ?? a.day]).map(v => this._dow(v)).filter(v => v != null);
      if (!dows.length) return { ok: false, msg: '무슨 요일인지 알려 주세요' };
      const R = Fitness.routines();
      const opts = [...Object.entries(R).map(([id, r]) => ({ id, name: r.name })), { id: 'rest', name: '휴식' }, { id: 'cardio', name: '유산소' }, { id: 'none', name: '계획 없음' },
        { id: 'A', name: '홈트 DAY A 푸시' }, { id: 'B', name: '홈트 DAY B 풀' }, { id: 'C', name: '홈트 DAY C 하체 코어' }];
      const want = (Array.isArray(a.routines) ? a.routines : [a.routines ?? a.routine ?? a.name]).filter(Boolean);
      const ids = [], miss = [];
      want.forEach(w => { const r = /^(쉬|휴식|rest)/.test(String(w)) ? { item: opts.find(o => o.id === 'rest') } : JMatch.find(w, opts, { min: 0.55 }); r.item ? ids.push(r.item.id) : miss.push(JMatch.miss('루틴', w, r)); });
      if (miss.length) return { ok: false, msg: miss.join(' / ') };
      if (!ids.length) return { ok: false, msg: '어떤 루틴을 넣을지 알려 주세요' };
      this._keepDone(() => {
        const dp = Fitness.dayPlan();
        dows.forEach(i => { const cur = Fitness.picks(i).filter(x => x !== 'rest' && x !== 'none'); Fitness._setPicks(dp, i, a.mode === 'add' ? [...cur, ...ids] : ids); if (dp[i] === Fitness._defaultFor(i)) delete dp[i]; });
        Fitness.saveDayPlan(dp);
      });
      this._rerender();
      return { ok: true, msg: dows.map(i => `${this.DOW[i]}요일: ${Fitness.planFor(i).name}`).join(', ') + ' 로 정했습니다' };
    },
  },

  // ── 습관 ──
  _habits(d) { return Habits.getList().filter(h => !h.deletedFrom || this._ds(d) < h.deletedFrom); },
  _hFind(q, d, id) {
    const all = this._habits(d || new Date());
    if (id) { const h = all.find(x => x.id === id); if (h) return { h }; }
    const today = new Set(Habits.getHabitsForDate(d || new Date()).map(h => h.id));
    const r = JMatch.find(q, all, { bonus: h => today.has(h.id) ? 0.03 : 0 });
    return r.item ? { h: r.item } : { miss: JMatch.miss('습관', q, r) };
  },
  _time(v) { const m = String(v || '').match(/(\d{1,2})\s*[:시]\s*(\d{1,2})?/); if (!m) return null; const h = +m[1], mi = +(m[2] || 0); return h < 24 && mi < 60 ? `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}` : null; },
  H: {
    habit_check(a) {
      const d = this._date(a.date);
      if (this._isFuture(d)) return { ok: false, msg: '아직 오지 않은 날은 체크할 수 없습니다' };
      const f = this._hFind(a.name, d, a.habitId); if (f.miss) return { ok: false, msg: f.miss };
      const chk = Habits.getChecked(d), want = a.done !== false, has = chk.includes(f.h.id);
      if (want && !has) chk.push(f.h.id); if (!want && has) chk.splice(chk.indexOf(f.h.id), 1);
      if (want !== has) { Habits.setChecked(chk, d); this._rerender(); try { want ? Sounds?.check() : Sounds?.uncheck(); } catch (e) {} }
      return { ok: true, msg: `'${f.h.name}' ${want ? (has ? '은(는) 이미 완료되어 있습니다' : '완료했습니다') : (has ? '체크를 풀었습니다' : '은(는) 체크되어 있지 않았습니다')}` };
    },
    habit_add(a) {
      const name = String(a.name || '').trim().slice(0, 40);
      if (!name) return { ok: false, msg: '습관 이름을 알려 주세요' };
      const list = Habits.getList();
      const dup = JMatch.find(name, this._habits(new Date()), { min: 0.95 }).item;
      if (dup) return { ok: false, msg: `'${dup.name}' 습관이 이미 있습니다` };
      const days = (Array.isArray(a.days) ? a.days : []).map(v => this._dow(v)).filter(v => v != null);
      const h = { id: 'h' + Date.now(), name, emoji: a.emoji || '', cat: Habits.CATS?.[a.cat] ? a.cat : 'etc', days: days.length ? [...new Set(days)] : [0,1,2,3,4,5,6], createdAt: this._ds() };
      const t = this._time(a.time); if (t) { h.time = t; h.notify = true; }
      list.push(h); Habits.saveList(list); try { LocalNotify?.reschedule(); } catch (e) {}
      this._rerender();
      return { ok: true, msg: `'${name}' 습관을 추가했습니다${t ? ` (${t} 알림)` : ''}` };
    },
    habit_edit(a) {
      const f = this._hFind(a.name, new Date(), a.habitId); if (f.miss) return { ok: false, msg: f.miss };
      const list = Habits.getList(), h = list.find(x => x.id === f.h.id), ch = [];
      if (a.newName) { h.name = String(a.newName).trim().slice(0, 40); ch.push(`이름 '${h.name}'`); }
      if (Array.isArray(a.days) && a.days.length) { const ds = a.days.map(v => this._dow(v)).filter(v => v != null); if (ds.length) { h.days = [...new Set(ds)].sort(); ch.push(`요일 ${h.days.map(i => this.DOW[i]).join('·')}`); } }
      if (a.time != null) {
        if (/off|끄|없|해제|false/.test(String(a.time))) { if (h.cat === 'med') h.notify = false; else { delete h.time; delete h.notify; } ch.push('알림 끔'); }
        else { const t = this._time(a.time); if (!t) return { ok: false, msg: '알림 시각을 알아듣지 못했습니다 (예: 21:00)' }; h.time = t; h.notify = true; ch.push(`알림 ${t}`); }
      }
      if (!ch.length) return { ok: false, msg: '무엇을 바꿀지 알려 주세요 (이름·요일·알림 시각)' };
      Habits.saveList(list); try { LocalNotify?.reschedule(); } catch (e) {}
      this._rerender();
      return { ok: true, msg: `'${f.h.name}' 습관: ${ch.join(', ')} 로 바꿨습니다` };
    },
    habit_del(a) {
      const f = this._hFind(a.name, new Date(), a.habitId); if (f.miss) return { ok: false, msg: f.miss };
      const list = Habits.getList(), h = list.find(x => x.id === f.h.id);
      h.deletedFrom = this._ds();   // 지난 기록은 남기고 오늘부터 숨긴다(앱의 삭제와 같다)
      Habits.saveList(list); try { LocalNotify?.reschedule(); } catch (e) {}
      this._rerender();
      return { ok: true, msg: `'${h.name}' 습관을 삭제했습니다 (지난 기록은 남습니다)` };
    },
    habit_stats(a) {
      const n = Math.max(1, Math.min(365, Number(a.days) || 30)), today = new Date();
      const hs = a.name ? (() => { const f = this._hFind(a.name, today); return f.h ? [f.h] : null; })() : this._habits(today);
      if (!hs) return { ok: false, msg: this._hFind(a.name, today).miss };
      const rows = hs.map(h => {
        let due = 0, did = 0;
        for (let i = 0; i < n; i++) { const d = new Date(today); d.setDate(d.getDate() - i); const ds = this._ds(d);
          if ((h.createdAt && ds < h.createdAt) || (h.days && h.days.length && !h.days.includes(d.getDay()))) continue;
          due++; if (Habits.getChecked(d).includes(h.id)) did++; }
        return `${h.name}: 연속 ${Habits.streak(h.id) || 0}일 · 최근 ${n}일 ${did}/${due}회${due ? ` (${Math.round(did / due * 100)}%)` : ''}`;
      });
      return { ok: true, show: rows.join('\n') || '습관이 없습니다' };
    },
  },

  // ── 식단 ──
  _dietLeft(d) {
    const s = Diet.getSettings(), t = Diet.totals(Diet.getData(d));
    const b = (typeof Fitness !== 'undefined' && Fitness.burn) ? Fitness.burn(d) : { kcal: 0 };
    const bm = s.burnMode || 'half', bonus = bm === 'off' ? 0 : bm === 'full' ? b.kcal : Math.round(b.kcal / 2 / 10) * 10;
    return { t, s, burn: b.kcal, bonus, left: s.calorieGoal + bonus - t.cal };
  },
  D: {
    log_food(a) {
      const d = this._date(a.date), meal = Diet.MEALS.includes(a.meal) ? a.meal : Diet._suggestMeal(d);
      const name = String(a.name || '').trim(); if (!name) return { ok: false, msg: '무엇을 드셨는지 알려 주세요' };
      const data = Diet.getData(d); if (!data[meal]) data[meal] = [];
      const food = { name, cal: Math.round(Number(a.cal) || 0), protein: Number(a.protein) || 0, carb: Number(a.carb) || 0, fat: Number(a.fat) || 0 };
      data[meal].push(food); Diet.saveData(data, d); Diet.addToHistory(food);
      this._rerender();
      const L = this._dietLeft(d);
      return { ok: true, msg: `${this._ds(d) === this._ds() ? '' : this._md(d) + ' '}${meal}에 '${name}' ${food.cal}kcal 기록했습니다 (남은 열량 ${L.left.toLocaleString('ko-KR')}kcal)` };
    },
    delete_food(a) {
      const d = this._date(a.date), data = Diet.getData(d);
      const all = []; Diet.MEALS.forEach(m => (data[m] || []).forEach((f, i) => { if (!a.meal || a.meal === m || !Diet.MEALS.includes(a.meal)) all.push({ m, i, name: f.name, cal: f.cal }); }));
      const r = JMatch.find(a.name, all); if (!r.item) return { ok: false, msg: JMatch.miss('음식', a.name, r) };
      Diet.remove(r.item.m, r.item.i, this._ds(d)); this._rerender();
      return { ok: true, msg: `${r.item.m}의 '${r.item.name}' 을(를) 지웠습니다` };
    },
    diet_goal(a) {
      const s = Diet.getSettings(), ch = [];
      const set = (k, v, l) => { const n = Math.round(Number(v)); if (n > 0) { s[k] = n; ch.push(`${l} ${n}`); } };
      set('calorieGoal', a.cal, '열량'); set('proteinGoal', a.protein, '단백질'); set('carbGoal', a.carb, '탄수화물'); set('fatGoal', a.fat, '지방');
      if (!ch.length) return { ok: false, msg: '바꿀 목표 값을 알려 주세요' };
      UserStore.set(Diet._setKey(), JSON.stringify(s)); FirebaseSync?.scheduleSave(); this._rerender();
      return { ok: true, msg: `식단 목표를 ${ch.join(', ')} 로 바꿨습니다` };
    },
    diet_status(a) {
      const d = this._date(a.date), L = this._dietLeft(d), data = Diet.getData(d);
      const meals = Diet.MEALS.map(m => (data[m] || []).length ? `${m}: ${data[m].map(f => `${f.name} ${f.cal}`).join(', ')}` : '').filter(Boolean);
      return { ok: true, show: `${this._md(d)} 먹은 열량 ${L.t.cal.toLocaleString('ko-KR')} / 목표 ${L.s.calorieGoal.toLocaleString('ko-KR')}kcal${L.bonus ? ` + 운동 ${L.bonus}` : ''} → ${L.left >= 0 ? `남은 열량 ${L.left.toLocaleString('ko-KR')}` : `${(-L.left).toLocaleString('ko-KR')} 초과`}kcal\n단백질 ${Math.round(L.t.protein)}/${L.s.proteinGoal}g · 탄수 ${Math.round(L.t.carb)}g · 지방 ${Math.round(L.t.fat)}g${L.burn ? ` · 운동 소모 약 ${L.burn}kcal` : ''}${meals.length ? '\n' + meals.join('\n') : ''}` };
    },
    inbody_add(a) {
      const dt = this._ds(this._date(a.date)), num = (v, lo, hi) => { const n = Number(v); return n >= lo && n <= hi ? Math.round(n * 10) / 10 : 0; };
      const p = { wt: num(a.wt ?? a.weight, 20, 300), ms: num(a.ms ?? a.muscle, 5, 100), bf: num(a.bf ?? a.fat, 1, 70), bmr: Math.round(num(a.bmr, 500, 4000)) };
      if (!p.wt && !p.ms && !p.bf && !p.bmr) return { ok: false, msg: '체중·골격근량·체지방률 중 하나는 알려 주세요' };
      const all = InBody.getRecords(), prev = all.find(r => r.dt === dt) || {};
      const rec = { ...prev, dt }; Object.entries(p).forEach(([k, v]) => { if (v) rec[k] = v; });
      if (p.ms) delete rec.msEst;
      InBody.saveRecords(all.filter(r => r.dt !== dt).concat(rec)); try { InBody.render(); } catch (e) {}
      this._rerender();
      return { ok: true, msg: `${dt} 인바디 기록: ${[rec.wt && `체중 ${rec.wt}kg`, rec.ms && `골격근 ${rec.ms}kg`, rec.bf && `체지방 ${rec.bf}%`, rec.bmr && `기초대사 ${rec.bmr}kcal`].filter(Boolean).join(' · ')}` };
    },
    inbody_trend(a) {
      const n = Math.max(2, Math.min(20, Number(a.n) || 5)), r = InBody.getRecords().slice(-n);
      if (!r.length) return { ok: true, show: '인바디 기록이 없습니다' };
      const f = r[0], l = r[r.length - 1], dif = (k, lb, u) => f[k] && l[k] ? `${lb} ${l[k] - f[k] >= 0 ? '+' : ''}${Math.round((l[k] - f[k]) * 10) / 10}${u}` : '';
      const ch = r.length > 1 ? [dif('wt', '체중', 'kg'), dif('ms', '골격근', 'kg'), dif('bf', '체지방', '%p')].filter(Boolean).join(' · ') : '';
      return { ok: true, show: r.map(x => `${x.dt}: ${[x.wt && `${x.wt}kg`, x.ms && `골격근 ${x.ms}`, x.bf && `체지방 ${x.bf}%`].filter(Boolean).join(' · ')}`).join('\n') + (ch ? `\n${f.dt} 이후 변화: ${ch}` : '') };
    },
  },

  // ── 일정 · 할 일 ──
  _tasks(open = true) { const out = []; Object.entries(App.S.tasks || {}).forEach(([lid, l]) => (l || []).forEach(t => { if (!open || t.status === 'needsAction') out.push({ lid, t, name: t.title }); })); return out; },
  _tFind(a, open = true) {
    if (a.taskId) { const x = this._tasks(false).find(o => o.t.id === a.taskId); if (x) return x; }
    const r = JMatch.find(a.title || a.searchTitle, this._tasks(open)); return r.item || { miss: JMatch.miss('할 일', a.title || a.searchTitle, r) };
  },
  _evFind(a) {
    const evs = (App.S.events || []).map(e => ({ e, name: e.summary || '' }));
    if (a.eventId) { const x = evs.find(o => o.e.id === a.eventId); if (x) return x; }
    const sel = a.date ? this._ds(this._date(a.date)) : null;
    const r = JMatch.find(a.title || a.summary, evs, { bonus: o => { const s = String(o.e.start?.dateTime || o.e.start?.date || ''); return sel && s.startsWith(sel) ? 0.05 : 0; } });
    return r.item || { miss: JMatch.miss('일정', a.title || a.summary, r) };
  },
  _paintCal() { try { App._mergeEvents(); CalendarUI.render(document.getElementById('miniCal'), App.S.calDate, App.S.events, App.S.selDate); App._renderCalPanel(); App._updateStatsBanner(); } catch (e) {} },
  _paintTasks() { try { App._buildTaskFilters?.(); App._renderTasks(); CalendarUI.render(document.getElementById('miniCal'), App.S.calDate, App.S.events, App.S.selDate); App._updateStatsBanner(); } catch (e) {} },
  _when(e) { const s = e.start?.dateTime; return s ? `${this._md(new Date(s))} ${new Date(s).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}` : `${e.start?.date ? this._md(new Date(e.start.date + 'T00:00:00')) : ''} 종일`; },
  C: {
    async add_event(a) {
      const title = String(a.summary || a.title || '').trim(); if (!title) return { ok: false, msg: '일정 제목을 알려 주세요' };
      const s = new Date(a.start); if (isNaN(s)) return { ok: false, msg: '일정 시각을 알아듣지 못했습니다' };
      let e = a.end ? new Date(a.end) : new Date(s.getTime() + 3600e3); if (isNaN(e) || e < s) e = new Date(s.getTime() + 3600e3);
      const key = CalSources.defaultDest();
      const ev = await CalSources.createEvent(key, { title, start: s, end: e, description: a.description || '', location: a.location || '' });
      (App._srcEv[ev._src || 'google'] = App._srcEv[ev._src || 'google'] || []).push(ev); this._paintCal();
      return { ok: true, msg: `${this._when({ start: { dateTime: s.toISOString() } })} '${title}' 일정을 ${CalSources.srcName(ev)}에 넣었습니다` };
    },
    async edit_event(a) {
      const f = this._evFind(a); if (f.miss) return { ok: false, msg: f.miss };
      const ev = f.e;
      if (ev._readOnly || ev._src === 'ics') return { ok: false, msg: `'${ev.summary}' 은(는) 읽기 전용 캘린더 일정이라 고칠 수 없습니다` };
      if (ev._src === 'device') return { ok: false, msg: '아이폰 캘린더 일정은 캘린더 앱에서 고쳐 주세요' };
      const os = new Date(ev.start?.dateTime || (ev.start?.date + 'T09:00:00')), oe = new Date(ev.end?.dateTime || os.getTime() + 3600e3);
      let s = a.start ? new Date(a.start) : os, e = a.end ? new Date(a.end) : new Date(s.getTime() + (oe - os));
      if (isNaN(s) || isNaN(e)) return { ok: false, msg: '바꿀 시각을 알아듣지 못했습니다' };
      if (e < s) e = new Date(s.getTime() + 3600e3);
      const title = a.newTitle || ev.summary, loc = a.location ?? ev.location ?? '';
      if (ev._src === 'bashy') {
        const nev = BashyCal.updateEvent(ev.id, { title, start: s, end: e, description: ev.description || '', location: loc });
        App._srcEv.bashy = App._srcEv.bashy.map(x => x.id === ev.id ? nev : x);
      } else {
        const r = await Auth.fetch(`${GoogleCalendar.BASE}/calendars/${encodeURIComponent(ev._calId || 'primary')}/events/${encodeURIComponent(ev.id)}`, { method: 'PATCH',
          body: JSON.stringify({ summary: title, location: loc, start: { dateTime: s.toISOString(), timeZone: 'Asia/Seoul' }, end: { dateTime: e.toISOString(), timeZone: 'Asia/Seoul' } }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.id) return { ok: false, msg: '구글 캘린더 일정을 고치지 못했습니다' + (j.error?.message ? ': ' + j.error.message : '') };
        App._srcEv.google = (App._srcEv.google || []).map(x => x.id === ev.id ? { ...x, ...j, _src: 'google' } : x);
      }
      this._paintCal();
      return { ok: true, msg: `'${title}' 일정을 ${this._when({ start: { dateTime: s.toISOString() } })} 로 고쳤습니다` };
    },
    async delete_event(a) {
      const f = this._evFind(a); if (f.miss) return { ok: false, msg: f.miss };
      await CalSources.deleteEvent(f.e);
      Object.keys(App._srcEv).forEach(k => { App._srcEv[k] = App._srcEv[k].filter(e => e.id !== f.e.id); }); this._paintCal();
      return { ok: true, msg: `'${f.e.summary}' 일정을 지웠습니다` };
    },
    list_events(a) {
      const from = this._date(a.from || a.date), to = a.to ? this._date(a.to) : new Date(from); to.setHours(23, 59, 59);
      const evs = (App.S.events || []).filter(e => { const s = new Date(e.start?.dateTime || (e.start?.date + 'T00:00:00')); return s >= from && s <= to; })
        .sort((x, y) => new Date(x.start?.dateTime || x.start?.date) - new Date(y.start?.dateTime || y.start?.date));
      const head = this._ds(from) === this._ds(to) ? this._md(from) : `${this._md(from)}~${this._md(to)}`;
      return { ok: true, show: evs.length ? `${head} 일정\n` + evs.slice(0, 20).map(e => `${this._when(e)} ${e.summary}${e.location ? ` @${e.location}` : ''}`).join('\n') : `${head} 일정이 없습니다 (불러온 달 기준)` };
    },
    async add_task(a) {
      const title = String(a.title || '').trim(); if (!title) return { ok: false, msg: '할 일 내용을 알려 주세요' };
      let lid = a.listId;
      if (!lid && a.list) lid = JMatch.find(a.list, App.S.lists || [], { name: l => l.title }).item?.id;
      lid = lid || (Auth.isLoggedIn() ? App.S.lists[0]?.id : BashyCal.LIST_ID) || BashyCal.LIST_ID;
      const due = a.due ? this._ds(this._date(a.due)) : null;
      const t = await TaskStore.createTask(lid, title, due, a.notes || '');
      t.starred = false; (App.S.tasks[lid] = App.S.tasks[lid] || []).unshift(t); this._paintTasks();
      return { ok: true, msg: `할 일 '${title}'${due ? ` (${due} 마감)` : ''} 을(를) 추가했습니다` };
    },
    async edit_task(a) {
      const f = this._tFind(a); if (f.miss) return { ok: false, msg: f.miss };
      const c = { title: a.newTitle || f.t.title, notes: a.notes ?? f.t.notes ?? '', due: a.due ? this._ds(this._date(a.due)) : (f.t.due ? String(f.t.due).slice(0, 10) : null) };
      const u = await TaskStore.updateTask(f.lid, f.t.id, c);
      Object.assign(f.t, { title: u?.title || c.title, notes: u?.notes ?? c.notes, due: u?.due ? String(u.due).split('T')[0] + 'T00:00:00.000Z' : (c.due ? c.due + 'T00:00:00.000Z' : null) });
      this._paintTasks();
      return { ok: true, msg: `할 일 '${f.t.title}' 을(를) 고쳤습니다` };
    },
    async task_done(a) {
      const want = a.done !== false, f = this._tFind(a, want); if (f.miss) return { ok: false, msg: f.miss };
      await TaskStore.toggleTask(f.lid, f.t.id, want);
      f.t.status = want ? 'completed' : 'needsAction'; f.t.completed = want ? new Date().toISOString() : null; this._paintTasks();
      try { want ? Sounds?.check() : Sounds?.uncheck(); } catch (e) {}
      return { ok: true, msg: `할 일 '${f.t.title}' 을(를) ${want ? '완료했습니다' : '다시 할 일로 돌렸습니다'}` };
    },
    async delete_task(a) {
      const f = this._tFind(a, false); if (f.miss) return { ok: false, msg: f.miss };
      await TaskStore.deleteTask(f.lid, f.t.id);
      App.S.tasks[f.lid] = (App.S.tasks[f.lid] || []).filter(t => t.id !== f.t.id); this._paintTasks();
      return { ok: true, msg: `할 일 '${f.t.title}' 을(를) 지웠습니다` };
    },
  },

  // ── 체크리스트 · 메모 ──
  _clFind(a) {
    const items = Checklist.getItems();
    const it = a.id && items.find(i => i.id === a.id);
    if (it) return { items, it };
    const q = a.searchTitle || a.title, r = JMatch.find(q, items, { name: i => i.title });
    return r.item ? { items, it: r.item } : { items, miss: JMatch.miss('체크리스트 항목', q, r) };
  },
  // 잠긴 메모는 AI 가 읽지도 고치지도 지우지도 않는다 — 찾는 목록에서부터 뺀다
  _mFind(a) {
    const items = Memo.getItems(), open = items.filter(m => !m.locked);
    const it = a.id && open.find(m => m.id === a.id);
    if (it) return { items, it };
    const q = a.searchTitle || a.title, r = JMatch.find(q, open, { name: m => m.title || '' });
    if (r.item) return { items, it: r.item };
    const lk = items.some(m => m.locked && JMatch.score(q, m.title || '') > 0.8);
    return { items, miss: lk ? '잠긴 메모는 AI 가 건드리지 않습니다 — 메모를 열어 직접 고쳐 주세요' : JMatch.miss('메모', q, r) };
  },
  M: {
    add_checklist(a) {
      const title = String(a.title || '').trim(); if (!title) return { ok: false, msg: '항목 내용을 알려 주세요' };
      const items = Checklist.getItems();
      items.push({ id: 'cl_' + Date.now(), title, dueDate: a.dueDate ? this._ds(this._date(a.dueDate)) : null, done: false, createdAt: new Date().toISOString() });
      Checklist.saveItems(items); Checklist.render();
      return { ok: true, msg: `체크리스트에 '${title}' 을(를) 넣었습니다` };
    },
    edit_checklist(a) {
      const f = this._clFind(a); if (f.miss) return { ok: false, msg: f.miss };
      if (a.newTitle) f.it.title = a.newTitle; if (a.dueDate !== undefined) f.it.dueDate = a.dueDate ? this._ds(this._date(a.dueDate)) : null;
      Checklist.saveItems(f.items); Checklist.render();
      return { ok: true, msg: `체크리스트 '${f.it.title}' 을(를) 고쳤습니다` };
    },
    toggle_checklist(a) {
      const f = this._clFind(a); if (f.miss) return { ok: false, msg: f.miss };
      f.it.done = a.done !== undefined ? a.done !== false : !f.it.done;
      Checklist.saveItems(f.items); Checklist.render();
      return { ok: true, msg: `'${f.it.title}' 을(를) ${f.it.done ? '완료로 표시했습니다' : '미완료로 돌렸습니다'}` };
    },
    delete_checklist(a) {
      const f = this._clFind(a); if (f.miss) return { ok: false, msg: f.miss };
      Checklist.saveItems(f.items.filter(i => i !== f.it)); Checklist.render();
      return { ok: true, msg: `체크리스트 '${f.it.title}' 을(를) 지웠습니다` };
    },
    add_memo(a) {
      const title = String(a.title || '').trim() || String(a.content || '').slice(0, 20); if (!title) return { ok: false, msg: '메모 내용을 알려 주세요' };
      const items = Memo.getItems(), now = new Date().toISOString(), content = String(a.content || '');
      items.unshift({ id: 'memo_' + Date.now(), title, content, html: esc(content).replace(/\n/g, '<br>'), createdAt: now, updatedAt: now });
      Memo.saveItems(items); Memo.render();
      return { ok: true, msg: `메모 '${title}' 을(를) 남겼습니다` };
    },
    edit_memo(a) {
      const f = this._mFind(a); if (f.miss) return { ok: false, msg: f.miss };
      const m = f.it;
      if (a.newTitle || (a.title && a.searchTitle)) m.title = a.newTitle || a.title;
      if (a.content !== undefined) { m.content = String(a.content); m.html = esc(m.content).replace(/\n/g, '<br>'); }
      m.updatedAt = new Date().toISOString(); Memo.saveItems(f.items); Memo.render();
      return { ok: true, msg: `메모 '${m.title}' 을(를) 고쳤습니다` };
    },
    delete_memo(a) {
      const f = this._mFind(a); if (f.miss) return { ok: false, msg: f.miss };
      Memo.saveItems(f.items.filter(m => m !== f.it)); Memo.render();
      return { ok: true, msg: `메모 '${f.it.title}' 을(를) 지웠습니다` };
    },
  },

  // ── 경제 · 설정 · 스마트홈 ──
  X: {
    async econ(a) {
      if (typeof Econ === 'undefined') return { ok: false, msg: '경제 기능이 없습니다' };
      const c = Econ.cfg();
      if (!Object.keys(Econ.PRICES || {}).length) await Econ.refresh().catch(() => {});
      const items = [...c.favorites, ...c.watchlists.flatMap(w => w.items || []), ...c.holdings];
      const uniq = [...new Map(items.map(it => [Econ.keyOf(it), it])).values()];
      const line = it => { const q = Econ.PRICES[Econ.keyOf(it)] || {}; return `${it.name} ${Econ.fmt(it, q.price)}${q.pct != null ? ` (${q.pct > 0 ? '+' : ''}${Number(q.pct).toFixed(2)}%)` : ''}`; };
      if (a.name) {
        const r = JMatch.find(a.name, uniq, { name: it => it.name || it.code });
        if (!r.item) return { ok: false, msg: JMatch.miss('종목', a.name, r) + ' — 관심 종목에 넣은 것만 볼 수 있습니다' };
        const h = c.holdings.find(x => Econ.keyOf(x) === Econ.keyOf(r.item));
        return { ok: true, show: line(r.item) + (h && h.qty ? ` · 보유 ${h.qty}주 평단 ${Econ.fmt(h, h.avg)}` : '') };
      }
      const hs = Econ.holdSummary();
      const lines = c.favorites.slice(0, 10).map(line);
      if (hs.n) lines.push(`보유 ${hs.n}종목 평가 ${Econ._won(hs.value)} · 손익 ${hs.profit >= 0 ? '+' : ''}${Econ._won(hs.profit)}${hs.pct != null ? ` (${hs.pct.toFixed(1)}%)` : ''}`);
      if (Econ._err) lines.push(`(시세: ${Econ._err})`);
      return { ok: true, show: lines.join('\n') || '관심 종목이 없습니다 — 경제 탭에서 추가해 주세요' };
    },
    setting(a) {
      const k = String(a.key || '').toLowerCase(), v = a.value;
      const on = v === true || /^(on|true|켜|1|yes)/i.test(String(v));
      if (k === 'theme' || /테마|다크|어둡|밝/.test(k)) {
        const t = /dark|어둡|다크/.test(String(v)) ? 'dark' : /light|밝/.test(String(v)) ? 'light' : /system|시스템|자동/.test(String(v)) ? 'system' : null;
        if (!t) return { ok: false, msg: '테마는 밝게·어둡게·시스템 중 하나로 말씀해 주세요' };
        App._theme = t; App._applyTheme();
        return { ok: true, msg: `화면을 ${{ dark: '어둡게', light: '밝게', system: '시스템 설정대로' }[t]} 바꿨습니다` };
      }
      if (k === 'fx' || /애니|효과/.test(k)) { Fx.on = on; return { ok: true, msg: `체크 애니메이션을 ${on ? '켰습니다' : '껐습니다'}` }; }
      if (k === 'tts' || /소리|읽기|음성/.test(k)) { if (!!JARVIS._ttsEnabled !== on) JARVIS.toggleTTS(); return { ok: true, msg: `답 소리 읽기를 ${on ? '켰습니다' : '껐습니다'}` }; }
      return { ok: false, msg: `'${a.key}' 설정은 AI 로 바꿀 수 없습니다 — 설정 화면에서 바꿔 주세요` };
    },
    async home(a) { try { return await JHome.run(a); } catch (e) { return { ok: false, msg: e?.message || String(e) }; } },
  },

  // 예전 이름·필드로 온 명령도 받는다 (대화 기록에 남아 있는 옛 형식)
  ALIAS: {
    complete_habit: a => ['habit_check', { ...a, done: true }], uncheck_habit: a => ['habit_check', { ...a, done: false }],
    add_habit: a => ['habit_add', a], delete_habit: a => ['habit_del', a], edit_habit: a => ['habit_edit', a],
    swap_exercise: a => ['ex_swap', a], replace_exercise: a => ['ex_swap', a], add_exercise: a => ['ex_add', a], remove_exercise: a => ['ex_remove', a], delete_exercise: a => ['ex_remove', a],
    complete_task: a => ['task_done', a], toggle_task: a => ['task_done', a], smarthome: a => ['home', a], device: a => ['home', a],
  },
  _fn(type) {
    for (const g of ['W', 'H', 'D', 'C', 'M', 'X']) if (this[g][type]) return this[g][type].bind(this);
    return null;
  },
  // 명령 하나 실행 → { ok, msg?, show? } — 성공했다고 말하는 것은 이 결과뿐이다
  async exec(action) {
    if (!action || typeof action !== 'object') return { ok: false, msg: '명령 모양이 잘못되었습니다' };
    let type = String(action.type || action.action || '').trim(), a = action;
    if (this.ALIAS[type]) [type, a] = this.ALIAS[type](action);
    const fn = this._fn(type);
    if (!fn) return { ok: false, msg: `'${type}' 은(는) 아직 앱에서 할 수 없는 일입니다` };
    try {
      const r = await fn(a);
      return r && typeof r === 'object' ? r : { ok: !!r };
    } catch (e) {
      console.error('[JARVIS action]', type, e);
      return { ok: false, msg: `${type} 실행 중 오류: ${e?.message || e}` };
    }
  },

  // 모델 출력 → { response, actions, tips }. 코드 블록·앞뒤 말·여러 덩어리를 견딘다.
  parse(raw) {
    const txt = String(raw || '').replace(/```(?:json)?/gi, '');
    const tryJ = s => { try { const v = JSON.parse(s); return v && typeof v === 'object' ? v : null; } catch { return null; } };
    let p = null;
    const st = txt.indexOf('{');
    if (st >= 0) {
      // 처음 { 부터 짝이 맞는 } 까지
      let dep = 0, q = false, esc2 = false;
      for (let i = st; i < txt.length; i++) {
        const c = txt[i];
        if (q) { if (esc2) esc2 = false; else if (c === '\\') esc2 = true; else if (c === '"') q = false; continue; }
        if (c === '"') q = true; else if (c === '{') dep++; else if (c === '}' && --dep === 0) { p = tryJ(txt.slice(st, i + 1)); break; }
      }
      if (!p) { const m = txt.match(/\{[\s\S]*\}/); if (m) p = tryJ(m[0]); }
    }
    if (!p) return { response: txt.trim(), actions: [], tips: [], plain: true };
    let acts = p.actions ?? p.action ?? [];
    if (!Array.isArray(acts)) acts = acts && typeof acts === 'object' ? [acts] : [];
    if (!acts.length && p.type) acts = [p];
    return { response: String(p.response || p.message || p.reply || ''), actions: acts.filter(x => x && typeof x === 'object'), tips: Array.isArray(p.tips) ? p.tips : [] };
  },
  // 실행했다고 말하는데 명령이 없다 — 바로 그 일이 "100 익스텐션" 때 일어났다
  _claims(t) { return /(바꿨|바꾸었|변경했|변경되|추가했|추가되|삭제했|지웠|뺐|기록했|기록되|완료했|체크했|켰|껐|설정했|등록했|저장했|옮겼|교체했|넣었|만들었|해제했)/.test(String(t || '')); },

  _asksNutrition(t) { return /(영양|칼로리|열량|탄수화물|단백질|지방)/.test(String(t || '')) && /(알\s*수\s*없|모르|알려\s*주|어렵|없어)/.test(String(t || '')); },

  async runAll(actions) {
    const out = [];
    for (const a of actions.slice(0, 20)) out.push({ type: a.type, ...(await this.exec(a)) });
    return out;
  },
  // 결과로 보낼 말을 만든다. 하나라도 실패하면 모델의 말 대신 실행 결과를 그대로 보여 준다.
  compose(resp, results) {
    if (!results.length) return resp;
    const ok = results.filter(r => r.ok), bad = results.filter(r => !r.ok);
    const shows = results.filter(r => r.show).map(r => r.show);
    const okMsg = ok.filter(r => r.msg).map(r => r.msg);
    if (!bad.length) {
      const lines = [];
      if (okMsg.length) lines.push(okMsg.join('\n'));
      if (shows.length) lines.push(shows.join('\n\n'));
      // 조회만 했으면 모델 말(맥락 설명)을 앞에 짧게 둔다. 바꾼 게 있으면 실행기의 말이 곧 확인이다.
      if (!okMsg.length && resp && resp.length < 120 && !this._claims(resp)) lines.unshift(resp);
      return lines.join('\n') || resp;
    }
    const lines = [];
    if (okMsg.length) lines.push(okMsg.join('\n'));
    lines.push((ok.length ? '다만 ' : '') + bad.map(r => r.msg).join('\n'));
    if (shows.length) lines.push(shows.join('\n\n'));
    return lines.join('\n');
  },

  // JARVIS._handleReply 가 부른다. 화면에 띄우고 읽는 것은 JARVIS 가 한다.
  async handle(J, raw) {
    let p = this.parse(raw);
    // 했다고 말하면서 명령이 없으면 한 번만 다시 묻는다
    // 식단을 말했는데 '영양 정보를 몰라서 못 넣는다·알려 달라' 고 미루면 — 추정해서 넣으라고 한 번 더 시킨다
    const askNut = !p.actions.length && this._asksNutrition(p.response);
    if (!p.actions.length && (askNut || this._claims(p.response)) && J && J.history) {
      try {
        J._setStatus?.('다시 확인 중...');
        const ctx = await this.ctx(), sys = this.sys(ctx);
        const fix = askNut
          ? '[앱] 영양 정보를 사용자에게 묻지 마세요. 말한 음식마다 일반적인 한국 기준 1회 제공량으로 열량·단백질·탄수화물·지방을 당신이 추정해서, 음식마다 log_food 하나씩 actions 에 넣어 JSON 으로 다시 답하세요. 양(반 줄·1.5인분·300ml 등)은 그만큼 곱하고, 어제·요일은 date 에 YYYY-MM-DD 로 넣으세요.'
          : '[앱] 방금 답에서 실행했다고 했지만 actions 가 비어 있어 실제로는 아무것도 바뀌지 않았습니다. 사용자의 요청을 실행하는 actions 를 넣어 JSON 으로 다시 답하세요. 실행할 방법이 없으면 할 수 없다고 답하세요.';
        const d = await J.chat({ max_tokens: 4000, messages: [{ role: 'system', content: sys }, ...J.history.slice(-12), { role: 'user', content: fix }] });
        const raw2 = d.choices?.[0]?.message?.content || '';
        const p2 = this.parse(raw2);
        if (p2.actions.length || (!askNut && !this._claims(p2.response))) { p = p2; if (J.history.length && J.history[J.history.length - 1].role === 'assistant') J.history[J.history.length - 1].content = raw2; }
      } catch (e) { console.warn('[JARVIS retry]', e); }
    }
    let text, results = [];
    if (p.actions.length) {
      J?._setStatus?.('실행 중...');
      results = await this.runAll(p.actions);
      text = this.compose(p.response, results);
      // 다음 대화에서 모델이 실제 결과를 알게 남겨 둔다
      const h = J?.history, last = h && h[h.length - 1];
      if (last && last.role === 'assistant') last.content = String(last.content).slice(0, 1500) + `\n[실행 결과] ${results.map(r => `${r.type}:${r.ok ? '성공' : '실패'} ${r.msg || ''}${r.show ? ' ' + String(r.show).slice(0, 300) : ''}`).join(' | ')}`;
    } else {
      text = p.response;
      if (this._claims(text)) text += '\n(앱에서 실제로 바뀐 것은 없습니다 — 다시 한 번 구체적으로 말씀해 주세요)';
    }
    return { text, tips: p.tips, results };
  },

  // ── 모델에게 보낼 지금 상태(짧게) ──
  async ctx() {
    try { await Promise.race([JHome.cfg(), new Promise(r => setTimeout(r, 1500))]); } catch (e) {}
    const now = new Date(), sel = App?.S?.selDate ? new Date(App.S.selDate) : now, ds = this._ds(now);
    const out = { now: `${ds}(${this.DOW[now.getDay()]}) ${now.toTimeString().slice(0, 5)}` };
    const day = d => { const { plan, list } = Fitness.exercisesFor(d), chk = Fitness._checked(d); return { plan: plan.name, list: list.map((x, i) => `${x.name} ${this._setsTxt(x)}${chk.includes(i) ? ' ✓' : ''}`) }; };
    try {
      out.workout = { today: day(now) };
      if (this._ds(sel) !== ds) out.workout[this._ds(sel) + '(화면)'] = day(sel);
      const R = Fitness.routines(); out.routines = Object.values(R).map(r => r.name);
      out.week = [1, 2, 3, 4, 5, 6, 0].map(i => `${this.DOW[i]}:${Fitness.planFor(i).name}`).join(' ');
    } catch (e) {}
    try {
      const chk = Habits.getChecked(now);
      out.habits = Habits.getHabitsForDate(now).map(h => `${h.name}${chk.includes(h.id) ? ' ✓' : ''}${h.notify && h.time ? ` (${h.time}알림)` : ''}`);
    } catch (e) {}
    try { const L = this._dietLeft(now); out.diet = { kcal: L.t.cal, goal: L.s.calorieGoal, exBonus: L.bonus, left: L.left, protein: Math.round(L.t.protein), proteinGoal: L.s.proteinGoal }; } catch (e) {}
    try {
      const evT = (App.S.events || []).filter(e => { try { return new Date(e.start?.dateTime || e.start?.date + 'T00:00:00').toDateString() === now.toDateString(); } catch { return false; } });
      out.events = evT.map(e => `${e.start?.dateTime ? new Date(e.start.dateTime).toTimeString().slice(0, 5) : '종일'} ${e.summary}`);
      out.tasks = this._tasks(true).slice(0, 10).map(o => o.t.title + (o.t.due ? ` (~${String(o.t.due).slice(5, 10)})` : ''));
      { const V = typeof App.visLists === 'function' ? App.visLists() : (App.S.lists || []); if (V.length > 1) out.taskLists = V.map(l => l.title); }
    } catch (e) {}
    try { out.checklist = Checklist.getItems().filter(i => !i.done).slice(0, 10).map(i => i.title); } catch (e) {}
    try { const ms = Memo.getItems(); out.memos = ms.filter(m => !m.locked).slice(0, 5).map(m => m.title); const lk = ms.filter(m => m.locked).length; if (lk) out.memos.push(`(잠긴 메모 ${lk}개)`); } catch (e) {}
    try { const r = InBody.latest(); if (r) out.inbody = `${r.dt} ${r.wt || '-'}kg 골격근${r.ms || '-'} 체지방${r.bf || '-'}%`; } catch (e) {}
    const hm = JHome.summary(); if (hm) out.home = hm;
    return out;
  },

  sys(ctx) {
    return `당신은 Bashy(자기관리 앱)의 AI 비서입니다. 한국어 존댓말로 짧게 답합니다. 사용자: 수훈님.
사용자 말은 음성 인식으로 들어와 잘못 들린 글자가 섞일 수 있습니다(예: '백 익스텐션'→'100 익스텐션', '원 암'→'1암', '덤벨'→'덤블'). 아래 상태에 있는 실제 이름 중 가장 가까운 것으로 이해하고, 이름은 상태에 적힌 그대로 쓰세요(모르면 들은 대로 — 앱이 비슷한 것을 찾습니다).
앱을 바꾸거나 조회하는 요청은 반드시 actions 로 합니다. actions 없이 '했습니다' 라고 말하지 마세요. 앱이 실행 결과를 사용자에게 직접 알려 주므로 response 는 "바꾸겠습니다" 정도로 짧게 씁니다. 앱으로 할 수 없는 일은 할 수 없다고 말합니다.
식단 기록(log_food)의 열량·단백질·탄수·지방은 당신이 추정해서 넣습니다 — 사용자에게 영양 정보를 묻거나 몰라서 못 넣는다고 하지 마세요. 처음 보는 음식도 비슷한 음식의 일반적인 한국 기준 1회 제공량으로 어림합니다. 여러 음식을 말하면 음식마다 log_food 하나씩(최대 20개), name 에는 양까지 그대로 적고(예 '후라이드 치킨 6조각'), 열량·탄단지는 아래 식품 참고의 1개·1인분 값에 그 양(반 줄·반 그릇·1.5인분·6조각·300ml)을 곱한 값입니다. '어제·그제·○요일' 은 현재 상태의 now 날짜로 계산해 date 에 YYYY-MM-DD 로 넣습니다.
운동 변경의 scope 는 기본 "day"(그날만), 사용자가 '앞으로·계속·루틴에·플랜에' 라고 하면 "plan". date 는 YYYY-MM-DD(생략=오늘). sets 는 "3×12" 또는 "30분", w 는 kg. 요일(dow·days)은 0=일 … 6=토.

현재 상태: ${JSON.stringify(ctx)}

JSON 하나만 출력: {"response":"","actions":[{"type":"…",…}]}
actions (괄호 안 필드, ?는 생략 가능):
[운동] ex_list(date?) ex_parts(parts:["가슴|등|하체|어깨|팔|복근"],scope?,date?) ex_swap(from,to,sets?,w?,scope?,date?) ex_add(name,sets?,w?,pos?,scope?,date?) ex_remove(name,scope?,date?) ex_set(name,sets?,w?,scope?,date?) ex_move(name,pos) ex_done(name|"전체",done) ex_log(name,sets:[{w,r}],date?) workout_start(date?) routine_save(name,exercises:[{name,sets}],days?,mode?:"add|replace") day_assign(dow,routines:["루틴 이름|휴식|유산소"],mode?:"set|add")
[습관] habit_check(name,done,date?) habit_add(name,days?,time?) habit_edit(name,newName?,days?,time?:"HH:MM|off") habit_del(name) habit_stats(name?,days?)
[식단] log_food(meal:"아침|점심|저녁|간식",name,cal,protein,carb,fat,date?) delete_food(name,meal?,date?) diet_goal(cal?,protein?,carb?,fat?) diet_status(date?)
[인바디] inbody_add(wt?,ms?,bf?,bmr?,date?) inbody_trend(n?)
[일정] add_event(summary,start,end?,location?) edit_event(title,newTitle?,start?,end?,location?) delete_event(title) list_events(from,to?)
[할일] add_task(title,due?,notes?,list?) edit_task(title,newTitle?,due?,notes?) task_done(title,done?) delete_task(title)
[체크리스트] add_checklist(title,dueDate?) edit_checklist(title,newTitle?,dueDate?) toggle_checklist(title,done?) delete_checklist(title)
[메모] add_memo(title,content) edit_memo(title,newTitle?,content?) delete_memo(title) — 잠긴 메모는 못 건드림
[경제] econ(name?) 시세·보유 조회
[스마트홈] home(cmd:"list|status|on|off|toggle|level|temp|open|close|scene|start|dock",device?,value?) — device 는 상태 home.devices 의 이름 그대로(괄호 앞). '거실 불' 처럼 방+종류도 됨. 불·전등·라이트=조명. 대상 없이 '불 꺼' 는 켜진 조명 각각에 off. level 은 0~100, temp 는 도. 잠금 해제는 하지 않음. home 이 '연결 안 됨'이면 설정 › 스마트홈 허브 › 스마트홈 연결을 안내
[설정] setting(key:"theme|fx|tts",value)
예) "100 익스텐션 대신 덤벨 로우 3세트 12회로" → {"response":"바꾸겠습니다","actions":[{"type":"ex_swap","from":"백 익스텐션","to":"덤벨 로우","sets":"3×12"}]}
시각은 +09:00 ISO(예 2026-05-22T14:00:00+09:00). 식품 참고: 닭가슴살100g=165kcal/단31g, 달걀=77kcal/단6g, 흰밥200g=260kcal/탄57g, 삼겹살100g=331kcal, 치킨조각=213kcal/단14g/탄8g/지13g, 김밥1줄=420kcal, 우동1그릇=450kcal, 감자탕1인분=700kcal/단40g, 공깃밥=300kcal, 약과1개=230kcal, 스트링치즈1개=70kcal/단6g, 아이스크림100g=250kcal, 맥주100ml=43kcal, 라면=500kcal, 소주1병=400kcal, 아메리카노=5kcal, 프로틴=120kcal/단25g`;
  },
};

// 그룹 안의 함수들이 this 로 JarvisActions 를 쓰게 묶는다
['W', 'H', 'D', 'C', 'M', 'X'].forEach(g => Object.keys(JarvisActions[g]).forEach(k => { const f = JarvisActions[g][k]; JarvisActions[g][k] = function (a) { return f.call(JarvisActions, a); }; }));
// 체크리스트·메모 그룹의 도우미는 위에 있다(_clFind·_mFind) — 인바디는 D 그룹에 함께 둔다
window.JarvisActions = JarvisActions; window.JMatch = JMatch; window.JHome = JHome;
