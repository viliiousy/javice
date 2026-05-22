// js/google-tasks.js — Google Tasks API v1

const GoogleTasks = {
  BASE: 'https://tasks.googleapis.com/tasks/v1',

  async fetchTaskLists() {
    const res  = await Auth.fetch(`${this.BASE}/users/@me/lists?maxResults=20`);
    const data = await res.json();
    return data.items || [];
  },

  async fetchTasks(listId) {
    const p = new URLSearchParams({ showCompleted: 'true', showHidden: 'false', maxResults: '100' });
    const res  = await Auth.fetch(`${this.BASE}/lists/${enc(listId)}/tasks?${p}`);
    const data = await res.json();
    return data.items || [];
  },

  async createTask(listId, title, due = null) {
    const body = { title };
    if (due) body.due = new Date(due).toISOString();
    const res = await Auth.fetch(`${this.BASE}/lists/${enc(listId)}/tasks`, {
      method: 'POST',
      body:   JSON.stringify(body),
    });
    return res.json();
  },

  async toggleTask(listId, taskId, completed) {
    const body = { status: completed ? 'completed' : 'needsAction' };
    if (!completed) body.completed = null;
    const res = await Auth.fetch(`${this.BASE}/lists/${enc(listId)}/tasks/${enc(taskId)}`, {
      method: 'PATCH',
      body:   JSON.stringify(body),
    });
    return res.json();
  },

  async deleteTask(listId, taskId) {
    await Auth.fetch(
      `${this.BASE}/lists/${enc(listId)}/tasks/${enc(taskId)}`,
      { method: 'DELETE' }
    );
  },
};

function enc(s) { return encodeURIComponent(s); }
