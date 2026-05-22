// js/drive-sync.js — Google Drive AppData 기반 기기간 동기화

const DriveSync = {
  BASE: 'https://www.googleapis.com/drive/v3',
  UPLOAD: 'https://www.googleapis.com/upload/drive/v3',
  FILENAME: 'javice-data.json',
  _fileId: null,
  _saveTimer: null,
  _syncing: false,

  // 동기화할 localStorage 키 패턴
  SYNC_PATTERNS: [
    /^gl_habits_/,
    /^gl_checklist_/,
    /^gl_memos_/,
    /^gl_diet_/,
    /^gl_fitness_/,
    /^gl_star_/,
    /^gl_task_extra_/,
    /^gl_cal_settings/,
    /^gl_ai_key/,
    /^gl_tts/,
  ],

  shouldSync(key) {
    return this.SYNC_PATTERNS.some(p => p.test(key));
  },

  // ── 전체 데이터 수집 ──────────────────
  collectData() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && this.shouldSync(key)) {
        data[key] = localStorage.getItem(key);
      }
    }
    return data;
  },

  // ── 데이터 복원 ───────────────────────
  restoreData(data) {
    if (!data || typeof data !== 'object') return;
    Object.entries(data).forEach(([key, val]) => {
      if (val !== null && val !== undefined) {
        localStorage.setItem(key, val);
      }
    });
  },

  // ── Drive에서 파일 ID 검색 ────────────
  async findFile() {
    const res = await Auth.fetch(
      `${this.BASE}/files?spaces=appDataFolder&q=name='${this.FILENAME}'&fields=files(id,modifiedTime)`
    );
    const data = await res.json();
    return data.files?.[0] || null;
  },

  // ── Drive에서 불러오기 ────────────────
  async load() {
    if (!Auth.isLoggedIn()) return;
    try {
      const file = await this.findFile();
      if (!file) { console.log('[DriveSync] 저장된 데이터 없음 (최초 기기)'); return false; }
      this._fileId = file.id;
      const res = await Auth.fetch(`${this.BASE}/files/${file.id}?alt=media`);
      const text = await res.text();
      const data = JSON.parse(text);
      this.restoreData(data);
      console.log('[DriveSync] 불러오기 완료:', Object.keys(data).length, '개 키');
      return true;
    } catch (err) {
      console.warn('[DriveSync] 불러오기 실패:', err.message);
      return false;
    }
  },

  // ── Drive에 저장 ──────────────────────
  async save() {
    if (!Auth.isLoggedIn() || this._syncing) return;
    this._syncing = true;
    try {
      const data = this.collectData();
      const body = JSON.stringify(data);
      const blob = new Blob([body], { type: 'application/json' });

      if (this._fileId) {
        // 기존 파일 업데이트
        await Auth.fetch(`${this.UPLOAD}/files/${this._fileId}?uploadType=media`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: blob,
        });
      } else {
        // 새 파일 생성
        const meta = { name: this.FILENAME, parents: ['appDataFolder'] };
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
        form.append('file', blob);
        const res = await fetch(`${this.UPLOAD}/files?uploadType=multipart`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${Auth.accessToken}` },
          body: form,
        });
        const created = await res.json();
        this._fileId = created.id;
      }
      console.log('[DriveSync] 저장 완료');
    } catch (err) {
      console.warn('[DriveSync] 저장 실패:', err.message);
    } finally {
      this._syncing = false;
    }
  },

  // ── 변경 시 디바운스 저장 (3초) ───────
  scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.save(), 3000);
  },

  // ── localStorage 변경 감시 ────────────
  watchChanges() {
    const orig = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (key, val) => {
      orig(key, val);
      if (this.shouldSync(key)) this.scheduleSave();
    };
  },
};
