// js/google-tasks.js — Google Tasks API v1

const GoogleTasks = {
  BASE: 'https://tasks.googleapis.com/tasks/v1',

  // notes 필드에 별표 상태를 인코딩하는 마커 (Google Tasks API에 starred 필드 없음)
  _STAR_MARKER: '__⭐__',

  _hasStarMarker(notes) {
    return typeof notes === 'string' && notes.startsWith(this._STAR_MARKER);
  },
  _addStarMarker(notes) {
    const clean = this._removeStarMarker(notes);
    return this._STAR_MARKER + (clean || '');
  },
  _removeStarMarker(notes) {
    if (!notes) return notes || '';
    return notes.startsWith(this._STAR_MARKER) ? notes.slice(this._STAR_MARKER.length) : notes;
  },

  async fetchTaskLists() {
    const res  = await Auth.fetch(`${this.BASE}/users/@me/lists?maxResults=20`);
    const data = await res.json();
    return data.items || [];
  },

  async fetchTasks(listId) {
    const p = new URLSearchParams({ showCompleted:'true', showHidden:'false', maxResults:'100' });
    const res  = await Auth.fetch(`${this.BASE}/lists/${enc(listId)}/tasks?${p}`);
    const data = await res.json();
    const items = data.items || [];
    // notes 필드에서 별표 마커 감지 → _apiStarred 플래그 설정 후 마커 제거
    items.forEach(t => {
      if (this._hasStarMarker(t.notes)) {
        t._apiStarred = true;
        t.notes = this._removeStarMarker(t.notes);
      }
    });
    return items;
  },

  // due 날짜를 UTC 자정 RFC3339 문자열로 변환 (타임존 오프셋 방지)
  _dueToISO(due) {
    if (!due) return null;
    // 'YYYY-MM-DD' 형태인 경우 UTC 자정으로 고정
    if (/^\d{4}-\d{2}-\d{2}$/.test(due)) return due + 'T00:00:00.000Z';
    // 이미 ISO 문자열인 경우 날짜 부분만 추출 후 UTC 자정
    const dateOnly = due.split('T')[0];
    return dateOnly + 'T00:00:00.000Z';
  },

  async createTask(listId, title, due = null, notes = '') {
    const body = { title };
    if (due)   body.due   = this._dueToISO(due);
    if (notes) body.notes = notes;
    const res = await Auth.fetch(`${this.BASE}/lists/${enc(listId)}/tasks`, {
      method: 'POST', body: JSON.stringify(body),
    });
    return res.json();
  },

  // 제목, 메모, 마감일 등 수정
  async updateTask(listId, taskId, changes) {
    const body = {};
    if (changes.title !== undefined) body.title = changes.title;
    if (changes.notes !== undefined) body.notes = changes.notes;
    if (changes.due   !== undefined) {
      // due가 null이면 명시적으로 null을 보내야 Google API가 날짜를 제거함
      // due가 빈 문자열('')이어도 날짜 제거로 처리
      body.due = changes.due ? this._dueToISO(changes.due) : null;
    }
    if (changes.status !== undefined) body.status = changes.status;
    const res = await Auth.fetch(`${this.BASE}/lists/${enc(listId)}/tasks/${enc(taskId)}`, {
      method: 'PATCH', body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Tasks API ${res.status}: ${errText.slice(0, 100)}`);
    }
    return res.json();
  },

  // 완료/미완료 토글
  async toggleTask(listId, taskId, completed) {
    const body = { status: completed ? 'completed' : 'needsAction' };
    if (!completed) body.completed = null;
    const res = await Auth.fetch(`${this.BASE}/lists/${enc(listId)}/tasks/${enc(taskId)}`, {
      method: 'PATCH', body: JSON.stringify(body),
    });
    return res.json();
  },

  async deleteTask(listId, taskId) {
    await Auth.fetch(
      `${this.BASE}/lists/${enc(listId)}/tasks/${enc(taskId)}`,
      { method: 'DELETE' }
    );
  },

  // 별표 상태를 notes 필드에 저장 (Google Tasks에 starred API 필드 없음)
  async setTaskStar(listId, taskId, starred, currentNotes) {
    const hadMarker = this._hasStarMarker(currentNotes);
    if (starred === hadMarker) return; // API 상태와 일치 → 호출 불필요
    const cleanNotes = this._removeStarMarker(currentNotes || '');
    const newNotes = starred ? this._addStarMarker(cleanNotes) : cleanNotes;
    await this.updateTask(listId, taskId, { notes: newNotes }).catch(e => {
      console.warn('[Tasks] setTaskStar 실패:', e.message);
    });
  },

  // 다른 목록으로 이동
  async moveTask(fromListId, toListId, taskId, title, notes, due) {
    const created = await this.createTask(toListId, title, due, notes);
    await this.deleteTask(fromListId, taskId);
    return created;
  },
};

function enc(s) { return encodeURIComponent(s); }
