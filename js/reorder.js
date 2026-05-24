// js/reorder.js — 순서변경 모듈 (reorder 모드일 때만 꾹누르기 드래그)

const Reorder = {
  _dragging:    null,
  _placeholder: null,
  _onReorder:   null,
  _lpTimer:     null,
  _container:   null,
  _startY:      0,
  _itemTop:     0,
  _active:      false, // reorder 모드 활성 여부

  enable(container, onReorder) {
    if (!container) return;
    this._onReorder = onReorder;
    this._container = container;
    this._active    = true;

    // 기존 이벤트 제거 후 재등록
    container._reorderHandlers?.forEach(([type, fn]) => container.removeEventListener(type, fn));
    container._reorderHandlers = [];

    const addEvt = (type, fn, opts) => {
      container.addEventListener(type, fn, opts);
      container._reorderHandlers.push([type, fn]);
    };

    addEvt('touchstart',  e => this._tStart(e),  { passive: false });
    addEvt('touchmove',   e => this._tMove(e),   { passive: false });
    addEvt('touchend',    e => this._tEnd(e),    { passive: false });
    addEvt('touchcancel', e => this._cancel());
    addEvt('mousedown',   e => this._mStart(e));

    document.addEventListener('mouseup',   () => this._cancel());
    document.addEventListener('mousemove', e => this._mMove(e));
  },

  disable(container) {
    if (!container) return;
    this._active = false;
    this._cancel();
    container._reorderHandlers?.forEach(([type, fn]) => container.removeEventListener(type, fn));
    container._reorderHandlers = [];
  },

  // 드래그 가능한 아이템 찾기 (핸들 아닌 아무 곳이나)
  _getItem(el) {
    // reorder-toggle-btn, cl-del-btn, cl-check 등 버튼은 제외
    if (el.closest('.reorder-toggle-btn, .cl-del-btn, .cl-check, .habit-chk, .cl-del-btn')) return null;
    return el.closest('[data-reorderable]');
  },

  // ── Touch ──────────────────────────────
  _tStart(e) {
    if (!this._active) return;
    const item = this._getItem(e.target);
    if (!item) return;

    this._startY = e.touches[0].clientY;
    clearTimeout(this._lpTimer);
    this._lpTimer = setTimeout(() => {
      e.preventDefault();
      this._startDrag(item, e.touches[0].clientY);
      try { navigator.vibrate?.(40); } catch {}
    }, 500);
  },

  _tMove(e) {
    if (this._dragging) {
      e.preventDefault();
      this._moveDrag(e.touches[0].clientY);
    } else {
      // 손가락 많이 움직이면 꾹누르기 취소
      if (Math.abs(e.touches[0].clientY - this._startY) > 8) {
        clearTimeout(this._lpTimer);
      }
    }
  },

  _tEnd(e) {
    clearTimeout(this._lpTimer);
    if (this._dragging) {
      e.preventDefault();
      this._endDrag();
    }
  },

  // ── Mouse ──────────────────────────────
  _mStart(e) {
    if (!this._active) return;
    const item = this._getItem(e.target);
    if (!item) return;

    this._startY = e.clientY;
    clearTimeout(this._lpTimer);
    this._lpTimer = setTimeout(() => {
      this._startDrag(item, e.clientY);
    }, 500);
  },

  _mMove(e) {
    if (this._dragging) {
      this._moveDrag(e.clientY);
    } else if (Math.abs(e.clientY - this._startY) > 8) {
      clearTimeout(this._lpTimer);
    }
  },

  _cancel() {
    clearTimeout(this._lpTimer);
    if (this._dragging) this._endDrag(true);
  },

  // ── 드래그 시작 ────────────────────────
  _startDrag(item, y) {
    this._dragging = item;
    this._startY   = y;

    this._placeholder = document.createElement('div');
    this._placeholder.className = 'reorder-placeholder';
    this._placeholder.style.height = item.offsetHeight + 'px';
    item.after(this._placeholder);

    const rect = item.getBoundingClientRect();
    this._itemTop = rect.top;
    item.classList.add('reorder-dragging');
    item.style.cssText = `
      position:fixed;z-index:9999;
      width:${rect.width}px;
      left:${rect.left}px;
      top:${rect.top}px;
      pointer-events:none;
      transition:none;
      box-shadow:0 8px 24px rgba(0,0,0,0.18);
    `;
  },

  // ── 드래그 이동 ────────────────────────
  _moveDrag(y) {
    if (!this._dragging) return;
    const dy = y - this._startY;
    this._itemTop += dy;
    this._startY   = y;
    this._dragging.style.top = this._itemTop + 'px';

    const siblings = [...this._container.querySelectorAll('[data-reorderable]')]
      .filter(el => el !== this._dragging && !el.classList.contains('reorder-dragging'));

    for (const sib of siblings) {
      const rect = sib.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) {
        sib.before(this._placeholder);
        return;
      }
    }
    const last = siblings[siblings.length - 1];
    if (last) last.after(this._placeholder);
  },

  // ── 드래그 종료 ────────────────────────
  _endDrag(cancel = false) {
    if (!this._dragging) return;
    const item = this._dragging;

    item.style.cssText = '';
    item.classList.remove('reorder-dragging');

    if (!cancel && this._placeholder) {
      this._placeholder.before(item);
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
