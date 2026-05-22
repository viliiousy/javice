// js/jarvis.js — ⚡ JARVIS AI 어시스턴트 (Groq 무료 API)

const JARVIS = {
  history:     [],
  recognition: null,
  synthesis:   window.speechSynthesis,
  listening:   false,
  isOpen:      false,
  _proactiveShown: false,

  init() {
    this._injectHTML();
    this._initSpeech();
    this._setupListeners();
    setTimeout(() => this._proactiveCheck(), 4000);
    setInterval(() => this._proactiveCheck(), 30 * 60 * 1000);
  },

  _injectHTML() {
    const wrap = document.createElement('div');
    wrap.id = 'jarvisWrap';
    wrap.innerHTML = `
      <button id="jarvisBtn" class="jarvis-btn" onclick="JARVIS.toggle()" title="JARVIS AI 열기">
        <span class="jarvis-btn-glyph">⚡</span>
        <span id="jarvisDot" class="jarvis-dot hidden"></span>
      </button>
      <div id="jarvisPanel" class="jarvis-panel hidden">
        <div class="jarvis-head">
          <div class="j-head-l">
            <span class="j-logo">⚡ JARVIS</span>
            <span id="jStatus" class="j-status">대기 중</span>
          </div>
          <div class="j-head-r">
            <button id="jKeyBtn" class="j-icon-btn" onclick="JARVIS.showKeySetup()" title="API 키 설정">🔑</button>
            <button id="jMicBtn" class="j-icon-btn" onclick="JARVIS.toggleMic()" title="음성 입력">🎤</button>
            <button class="j-icon-btn" onclick="JARVIS.toggle()">✕</button>
          </div>
        </div>
        <div id="jMsgs" class="j-msgs">
          <div class="j-msg j-ai">
            <div class="j-avatar">⚡</div>
            <div class="j-bubble">안녕하세요. JARVIS입니다.<br>무엇이든 말씀하거나 입력해주세요.<br><span style="font-size:11px;color:var(--accent-l)">예: "치킨 먹었어" · "내일 10시 회의 잡아줘" · "오늘 운동 어때?"</span></div>
          </div>
        </div>
        <div class="j-input-wrap">
          <div id="jVoiceBar" class="j-voice-bar hidden">
            <span class="j-pulse"></span> 듣고 있습니다...
          </div>
          <div class="j-input-row">
            <input id="jInput" type="text" class="inp" placeholder="메시지 입력 또는 🎤 음성..." style="flex:1">
            <button onclick="JARVIS.send()" class="btn-sm accent" style="flex-shrink:0">전송</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap);
  },

  _setupListeners() {
    setTimeout(() => {
      const inp = document.getElementById('jInput');
      if (inp) inp.onkeypress = e => { if (e.key === 'Enter') this.send(); };
    }, 200);
  },

  toggle() {
    this.isOpen = !this.isOpen;
    document.getElementById('jarvisPanel').classList.toggle('hidden', !this.isOpen);
    document.getElementById('jarvisDot').classList.add('hidden');
    if (this.isOpen) setTimeout(() => document.getElementById('jInput')?.focus(), 100);
  },

  async send(text = null) {
    const inp = document.getElementById('jInput');
    const msg = (text || inp?.value || '').trim();
    if (!msg) return;
    if (inp) inp.value = '';

    this._addMsg('user', msg);
    this._setStatus('생각 중...');

    const key = this._getKey();
    if (!key) {
      this._addMsg('ai', '⚠️ API 키가 없습니다. 🔑 버튼을 눌러 Groq API 키를 설정해주세요.\nconsole.groq.com 에서 무료로 발급받을 수 있습니다.');
      this._setStatus('대기 중');
      return;
    }

    try {
      const raw = await this._callAPI(key, msg);
      this._handleReply(raw);
    } catch (err) {
      this._addMsg('ai', `오류가 발생했습니다: ${err.message}`);
      console.error('[JARVIS]', err);
    }
    this._setStatus('대기 중');
  },

  async _callAPI(apiKey, userMsg) {
    this.history.push({ role: 'user', content: userMsg });
    const msgs = this.history.slice(-12);
    const ctx  = this._buildCtx();
    const sys  = this._buildSys(ctx);

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:      'llama-3.1-8b-instant',
        max_tokens: 1024,
        messages: [
          { role: 'system', content: sys },
          ...msgs,
        ],
      }),
    });

    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error?.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    this.history.push({ role: 'assistant', content: text });
    return text;
  },

  _handleReply(raw) {
    let parsed = { response: raw, actions: [], tips: [] };
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) parsed = { response: '', actions: [], tips: [], ...JSON.parse(m[0]) };
    } catch { /* plain text fallback */ }

    const reply = parsed.response || parsed.message || raw;
    if (reply) {
      this._addMsg('ai', reply);
      this._speak(reply);
    }
    if (Array.isArray(parsed.actions)) parsed.actions.forEach(a => this._exec(a));
    if (Array.isArray(parsed.tips) && parsed.tips.length) {
      parsed.tips.forEach(t => this._addMsg('tip', t));
    }
  },

  async _exec(action) {
    try {
      switch (action.type) {
        case 'add_task': {
          if (!Auth.isLoggedIn()) { App.showToast('할일 추가는 로그인 후 가능합니다', 'error'); break; }
          const lid = App.S.lists[0]?.id; if (!lid) break;
          const t = await GoogleTasks.createTask(lid, action.title, action.due || null);
          if (!App.S.tasks[lid]) App.S.tasks[lid] = [];
          App.S.tasks[lid].unshift(t);
          App._renderTasks();
          App.showToast(`✅ 할일 추가: ${action.title}`, 'success');
          break;
        }
        case 'add_event': {
          if (!Auth.isLoggedIn()) { App.showToast('일정 추가는 로그인 후 가능합니다', 'error'); break; }
          const ev = await GoogleCalendar.createEvent(
            action.summary, action.start, action.end,
            action.description || '', action.location || ''
          );
          App.S.events.push(ev);
          App.S.events.sort((a,b) => new Date(a.start?.dateTime||a.start?.date) - new Date(b.start?.dateTime||b.start?.date));
          CalendarUI.render(document.getElementById('miniCal'), App.S.calDate, App.S.events, App.S.selDate);
          App._renderEventsFor(App.S.selDate);
          App.showToast(`📅 일정 추가: ${action.summary}`, 'success');
          break;
        }
        case 'log_food': {
          const d = Diet.getData();
          const meal = action.meal || '간식';
          if (!d[meal]) d[meal] = [];
          d[meal].push({
            name:    action.name,
            cal:     action.cal     || action.calories || 0,
            protein: action.protein || 0,
            carb:    action.carb    || 0,
            fat:     action.fat     || 0,
          });
          Diet.saveData(d);
          Diet.render();
          App.showToast(`🥗 ${meal}: ${action.name} 추가됨`, 'success');
          break;
        }
        case 'complete_habit': {
          const chk = Habits.getChecked();
          if (!chk.includes(action.habitId)) {
            chk.push(action.habitId);
            Habits.setChecked(chk);
            Habits.render();
            const h = Habits.getList().find(x => x.id === action.habitId);
            App.showToast(`✅ 습관 완료: ${h?.name || ''}`, 'success');
          }
          break;
        }
        case 'complete_exercise': {
          const dow = new Date().getDay();
          const plan = Fitness.PLAN[dow];
          const idx = plan?.exercises.findIndex(e =>
            e.name.includes(action.exercise) || action.exercise.includes(e.name)
          );
          if (idx >= 0) {
            Fitness.toggle(idx, dow);
            App.showToast(`💪 운동 완료: ${plan.exercises[idx].name}`, 'success');
          }
          break;
        }
        case 'uncheck_habit': {
          const uchk = Habits.getChecked();
          const ui   = uchk.indexOf(action.habitId);
          if (ui !== -1) {
            uchk.splice(ui, 1);
            Habits.setChecked(uchk);
            Habits.render();
            const uh = Habits.getList().find(x => x.id === action.habitId);
            App.showToast(`↩ 습관 체크 해제: ${uh?.name || ''}`, 'success');
          }
          break;
        }
        case 'uncheck_exercise': {
          const udow  = new Date().getDay();
          const uplan = Fitness.PLAN[udow];
          const uidx  = uplan?.exercises.findIndex(e =>
            e.name.includes(action.exercise) || action.exercise.includes(e.name)
          );
          if (uidx >= 0) {
            const uc2 = Fitness._checked();
            const uei = uc2.indexOf(uidx);
            if (uei !== -1) {
              uc2.splice(uei, 1);
              Fitness._save(uc2);
              Fitness.render(udow);
              App.showToast(`↩ 운동 체크 해제: ${uplan.exercises[uidx].name}`, 'success');
            }
          }
          break;
        }
                case 'delete_task': {
          if (!Auth.isLoggedIn()) break;
          const lid2 = action.listId || App.S.lists[0]?.id;
          if (!lid2 || !action.taskId) break;
          await GoogleTasks.deleteTask(lid2, action.taskId);
          App.S.tasks[lid2] = App.S.tasks[lid2]?.filter(t => t.id !== action.taskId);
          App._renderTasks();
          App.showToast('🗑 할일 삭제됨', 'success');
          break;
        }
        case 'open_food_log':
          Diet.showAdd(action.meal || '간식');
          break;
        case 'open_add_event':
          App._showAddEventModal();
          break;
      }
    } catch (err) {
      console.error('[JARVIS action]', action.type, err);
    }
  },

  async _proactiveCheck() {
    const key = this._getKey();
    if (!key || this._proactiveShown) return;

    const now  = new Date();
    const hour = now.getHours();
    const issues = [];

    if (hour >= 17) {
      const plan = Fitness.PLAN[now.getDay()];
      const chk  = Fitness._checked();
      if (plan.exercises.length > 0 && chk.length === 0) {
        issues.push(`오늘 운동(${plan.name})을 아직 시작하지 않았습니다.`);
      }
    }
    if (hour >= 15) {
      const t = Diet.totals(Diet.getData());
      const g = Diet.getSettings();
      if (t.cal < g.calorieGoal * 0.35) {
        issues.push(`칼로리가 많이 부족합니다 (${t.cal} / ${g.calorieGoal} kcal, 목표의 ${Math.round(t.cal/g.calorieGoal*100)}%)`);
      }
      if (t.protein < g.proteinGoal * 0.3) {
        issues.push(`단백질이 부족합니다 (${t.protein}g / 목표 ${g.proteinGoal}g)`);
      }
    }
    if (hour >= 11) {
      const list = Habits.getList();
      const chk  = Habits.getChecked();
      const miss = list.filter(h => !chk.includes(h.id));
      if (miss.length >= 3) {
        issues.push(`아직 완료 안 된 습관이 ${miss.length}개 있습니다: ${miss.map(h=>h.name).slice(0,3).join(', ')}`);
      }
    }

    if (!issues.length) return;
    this._proactiveShown = true;

    const msg = `[프로액티브 분석] 다음 항목들을 확인해주세요:\n${issues.join('\n')}\n격려와 구체적 조언을 1-2문장으로 짧게 해주세요.`;
    try {
      const raw = await this._callAPI(key, msg);
      this._handleReply(raw);
      if (!this.isOpen) document.getElementById('jarvisDot')?.classList.remove('hidden');
    } catch { /* 조용히 실패 */ }
  },

  _buildCtx() {
    const now    = new Date();
    const dow    = now.getDay();
    const plan   = Fitness.PLAN[dow];
    const fitChk = Fitness._checked();
    const hList  = Habits.getList();
    const hChk   = Habits.getChecked();
    const dd     = Diet.getData();
    const dt     = Diet.totals(dd);
    const ds     = Diet.getSettings();
    const evToday = (App.S.events||[]).filter(e =>
      new Date(e.start?.dateTime||e.start?.date).toDateString() === now.toDateString()
    );
    const pending = [];
    Object.values(App.S.tasks||{}).forEach(l =>
      l.filter(t => t.status === 'needsAction').forEach(t => pending.push(t.title))
    );
    return {
      now:     now.toLocaleString('ko-KR'),
      weekday: now.toLocaleDateString('ko-KR', { weekday:'long' }),
      habits: {
        done:    hList.filter(h => hChk.includes(h.id)).map(h=>h.name),
        missing: hList.filter(h => !hChk.includes(h.id)).map(h=>({id:h.id,name:h.name})),
      },
      fitness: {
        plan:      plan.name,
        exercises: plan.exercises.map((e,i) => ({ name:e.name, sets:e.sets, done:fitChk.includes(i) })),
      },
      diet: {
        cal: dt.cal, calGoal: ds.calorieGoal,
        protein: dt.protein, proteinGoal: ds.proteinGoal,
        carb: dt.carb, fat: dt.fat,
        meals: Object.fromEntries(
          Object.entries(dd).map(([k,v]) => [k, v.map(f=>`${f.name}(${f.cal}kcal)`)])
        ),
      },
      schedule: {
        today:   evToday.map(e => ({ title:e.summary, time:e.start?.dateTime ? new Date(e.start.dateTime).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}) : '종일' })),
        pending: pending.slice(0,10),
      },
      habitIds: hList.reduce((o,h) => { o[h.name]=h.id; return o; }, {}),
    };
  },

  _buildSys(ctx) {
    return `당신은 JARVIS입니다 — 갓생 대시보드의 AI 어시스턴트.
아이언맨의 JARVIS처럼 간결하고 분석적이며 프로액티브합니다.
사용자는 수훈님, 피트니스와 자기개발을 중시합니다. 반드시 한국어로 대화합니다.

현재 대시보드 상태:
${JSON.stringify(ctx, null, 2)}

반드시 아래 JSON만 출력 (다른 텍스트 없이):
{
  "response": "2-3문장 자연스러운 한국어 답변",
  "actions": [],
  "tips": []
}

사용 가능한 actions:
{"type":"add_task","title":"할일 제목","due":null}
{"type":"add_event","summary":"일정 제목","start":"2026-05-22T14:00:00+09:00","end":"2026-05-22T15:00:00+09:00","description":"","location":""}
{"type":"log_food","meal":"아침|점심|저녁|간식","name":"음식명","cal":0,"protein":0,"carb":0,"fat":0}
{"type":"complete_habit","habitId":"h1"}
{"type":"complete_exercise","exercise":"운동이름 일부"}
{"type":"delete_task","taskId":"id","listId":"id"}
{"type":"open_food_log","meal":"저녁"}
{"type":"open_add_event"}
{"type":"uncheck_habit","habitId":"h1"}
{"type":"uncheck_exercise","exercise":"운동이름"}

식품 칼로리 기준:
닭가슴살100g:165kcal/단31g, 삶은달걀1개:77kcal/단6g, 흰쌀밥200g:260kcal/탄57g,
삼겹살100g:331kcal/지28g, 치킨1조각80g:213kcal/단18g, 김밥1줄:420kcal,
아메리카노:5kcal, 프로틴쉐이크:120kcal/단25g, 오트밀100g:389kcal/탄66g/단17g,
고구마100g:130kcal/탄30g, 브로콜리100g:34kcal/탄7g/단3g`;
  },

  _initSpeech() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isIOS) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    this.recognition = new SR();
    this.recognition.lang            = 'ko-KR';
    this.recognition.interimResults  = false;
    this.recognition.maxAlternatives = 1;
    this.recognition.onresult = e => {
      const text = e.results[0][0].transcript;
      this._setVoice(false);
      this.send(text);
    };
    this.recognition.onerror = () => { this.listening = false; this._setVoice(false); };
    this.recognition.onend   = () => { this.listening = false; this._setVoice(false); };
  },

  toggleMic() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isIOS) {
      App.showToast('iOS는 키보드 🎤 버튼으로 음성 입력하세요', '');
      document.getElementById('jInput')?.focus();
      return;
    }
    if (!this.recognition) {
      App.showToast('Chrome 브라우저에서만 음성 인식이 지원됩니다', 'error');
      return;
    }
    if (this.listening) {
      this.recognition.stop();
    } else {
      try {
        this.recognition.start();
        this.listening = true;
        this._setVoice(true);
      } catch (e) {
        App.showToast('마이크 접근 권한이 필요합니다', 'error');
      }
    }
  },

  _speak(text) {
    if (!this.synthesis) return;
    this.synthesis.cancel();
    const clean = text.replace(/[*`#\[\]{}]/g, '').trim().slice(0, 200);
    const u = new SpeechSynthesisUtterance(clean);
    u.lang  = 'ko-KR';
    u.rate  = 1.05;
    u.pitch = 0.9;
    const voices = this.synthesis.getVoices();
    const ko = voices.find(v => v.lang === 'ko-KR' || v.lang === 'ko_KR');
    if (ko) u.voice = ko;
    this.synthesis.speak(u);
  },

  _addMsg(type, text) {
    const wrap = document.getElementById('jMsgs');
    if (!wrap) return;
    const isAI = type !== 'user';
    const d = document.createElement('div');
    d.className = `j-msg ${isAI ? 'j-ai' : 'j-user'}`;
    const clean = esc(text).replace(/\n/g, '<br>');
    d.innerHTML = isAI
      ? `<div class="j-avatar">⚡</div><div class="j-bubble${type==='tip'?' j-tip':''}">${clean}</div>`
      : `<div class="j-bubble j-bubble-user">${clean}</div>`;
    wrap.appendChild(d);
    wrap.scrollTop = wrap.scrollHeight;
  },

  _setStatus(s) { const el = document.getElementById('jStatus'); if (el) el.textContent = s; },

  _setVoice(on) {
    document.getElementById('jVoiceBar')?.classList.toggle('hidden', !on);
    const btn = document.getElementById('jMicBtn');
    if (btn) btn.style.color = on ? 'var(--red)' : '';
  },

  _getKey() { return localStorage.getItem('gl_ai_key') || ''; },

  showKeySetup() {
    App.openModal('🔑 JARVIS API 키 설정', `
      <p style="color:var(--text2);font-size:13px;margin-bottom:14px">
        AI 기능에 Groq API 키가 필요합니다. (완전 무료)<br>
        <a href="https://console.groq.com" target="_blank" style="color:var(--accent-l)">console.groq.com</a>에서 발급 후 입력해주세요.<br>
        <span style="font-size:11px;color:var(--text3)">키는 브라우저 localStorage에만 저장됩니다.</span>
      </p>
      <div class="modal-row">
        <label class="modal-lbl">Groq API Key (무료)</label>
        <input id="aiKeyInp" type="password" placeholder="gsk_..." class="inp" value="${this._getKey()}">
      </div>
      <div class="modal-btns">
        <button onclick="JARVIS._saveKey()" class="btn-sm accent">저장 후 활성화</button>
        <button onclick="App.closeModal()" class="btn-sm">취소</button>
      </div>`);
    setTimeout(() => document.getElementById('aiKeyInp')?.focus(), 100);
  },

  _saveKey() {
    const k = document.getElementById('aiKeyInp')?.value.trim();
    if (!k) { App.showToast('API 키를 입력해주세요', 'error'); return; }
    localStorage.setItem('gl_ai_key', k);
    App.closeModal();
    App.showToast('✓ JARVIS 활성화됨 (Groq)', 'success');
    setTimeout(() => {
      this.isOpen = true;
      document.getElementById('jarvisPanel').classList.remove('hidden');
      this.send('안녕! 오늘 대시보드 상태 분석해줘.');
    }, 400);
  },
};
