// js/reorder.js — 꾹누르기(longpress) 순서변경

const Reorder = {
  _dragging:    null,
  _placeholder: null,
  _onReorder:   null,
  _lpTimer:     null,
  _container:   null,

  enable(container, onReorder) {
    if (!container) return;
    this._onReorder  = onReorder;
    this._container  = container;

    // 기존 리스너 제거
    const clone = container.cloneNode(false);
    while (container.firstChild) clone.appendChild(container.firstChild);
    container.parentNode?.replaceChild(clone, container);
    this._container = clone;

    // touch
    clone.addEventListener('touchstart',  e => this._tStart(e),  { passive: false });
    clone.addEventListener('touchmove',   e => this._tMove(e),   { passive: false });
    clone.addEventListener('touchend',    e => this._tEnd(e));
    clone.addEventListener('touchcancel', e => this._cancel());
    // mouse
    clone.addEventListener('mousedown',   e => this._mStart(e));
    document.addEventListener('mouseup',  () => this._cancel());
    document.addEventListener('mousemove',e => this._mMove(e));
  },

  _getHandle(el) { return el.closest?.('[data-reorderable]'); },

  // ── Touch ──────────────────────────────
  _tStart(e) {
    const item = this._getHandle(e.target);
    if (!item) return;
    this._lpTimer = setTimeout(() => {
      this._startDrag(item, e.touches[0].clientY);
      // 진동 피드백
      try { navigator.vibrate?.(30); } catch {}
    }, 400);
  },
  _tMove(e) {
    if (!this._dragging) {
      clearTimeout(this._lpTimer);
      return;
    }
    e.preventDefault();
    this._moveDrag(e.touches[0].clientY);
  },
  _tEnd(e) {
    clearTimeout(this._lpTimer);
    if (this._dragging) { e.preventDefault(); this._endDrag(); }
  },

  // ── Mouse ──────────────────────────────
  _mStart(e) {
    const item = this._getHandle(e.target);
    if (!item) return;
    this._lpTimer = setTimeout(() => {
      this._startDrag(item, e.clientY);
    }, 400);
  },
  _mMove(e) {
    if (!this._dragging) return;
    this._moveDrag(e.clientY);
  },

  _cancel() {
    clearTimeout(this._lpTimer);
    if (this._dragging) this._endDrag(true);
  },

  // ── 드래그 시작 ────────────────────────
  _startDrag(item, y) {
    this._dragging = item;
    this._startY   = y;

    // placeholder 삽입
    this._placeholder = document.createElement('div');
    this._placeholder.className = 'reorder-placeholder';
    this._placeholder.style.height = item.offsetHeight + 'px';
    item.after(this._placeholder);

    // item을 fixed로 띄우기
    const rect = item.getBoundingClientRect();
    item.classList.add('reorder-dragging');
    item.dataset.origWidth = item.offsetWidth;
    item.style.cssText = `
      position:fixed;z-index:9999;width:${rect.width}px;
      left:${rect.left}px;top:${rect.top}px;
      pointer-events:none;transition:none;
    `;
    this._itemTop = rect.top;
  },

  // ── 드래그 이동 ────────────────────────
  _moveDrag(y) {
    if (!this._dragging) return;
    const dy = y - this._startY;
    this._itemTop += dy;
    this._startY   = y;
    this._dragging.style.top = this._itemTop + 'px';

    // placeholder 위치 업데이트
    const siblings = [...this._container.querySelectorAll('[data-reorderable]')]
      .filter(el => el !== this._dragging);

    for (const sib of siblings) {
      const rect = sib.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) {
        sib.before(this._placeholder);
        return;
      }
    }
    // 마지막으로
    const last = siblings[siblings.length - 1];
    if (last) last.after(this._placeholder);
  },

  // ── 드래그 종료 ────────────────────────
  _endDrag(cancel = false) {
    if (!this._dragging) return;
    const item = this._dragging;

    // 스타일 복원
    item.style.cssText = '';
    item.classList.remove('reorder-dragging');

    if (!cancel && this._placeholder) {
      // placeholder 위치에 item 삽입
      this._placeholder.after(item);
    }
    this._placeholder?.remove();
    this._placeholder = null;
    this._dragging    = null;

    if (!cancel && this._onReorder) {
      const newOrder = [...this._container.querySelectorAll('[data-reorderable]')]
        .map(el => el.dataset.reorderable);
      this._onReorder(newOrder);
    }
  },
};
