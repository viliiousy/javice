// js/google-tasks.js — Google Tasks API v1

const GoogleTasks = {
  BASE: 'https://tasks.googleapis.com/tasks/v1',

  async fetchTaskLists() {
    const res  = await Auth.fetch(`${this.BASE}/users/@me/lists?maxResults=20`);
    const data = await res.json();
    return data.items || [];
  },

  async fetchTasks(listId) {
    const p = new URLSearchParams({ showCompleted:'true', showHidden:'false', maxResults:'100' });
    const res  = await Auth.fetch(`${this.BASE}/lists/${enc(listId)}/tasks?${p}`);
    const data = await res.json();
    return data.items || [];
  },

  async createTask(listId, title, due = null, notes = '') {
    const body = { title };
    if (due)   body.due   = new Date(due + 'T00:00:00').toISOString();
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
      body.due = changes.due ? new Date(changes.due + 'T00:00:00').toISOString() : null;
    }
    if (changes.status !== undefined) body.status = changes.status;
    const res = await Auth.fetch(`${this.BASE}/lists/${enc(listId)}/tasks/${enc(taskId)}`, {
      method: 'PATCH', body: JSON.stringify(body),
    });
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

  // 다른 목록으로 이동
  async moveTask(fromListId, toListId, taskId, title, notes, due) {
    const created = await this.createTask(toListId, title, due, notes);
    await this.deleteTask(fromListId, taskId);
    return created;
  },
};

function enc(s) { return encodeURIComponent(s); }
