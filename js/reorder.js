// js/reorder.js — 순서변경 (PC: 꾹누르기 400ms, 모바일: 터치 500ms)

const Reorder = {
  _dragging:  null,
  _placeholder: null,
  _onReorder: null,
  _container: null,
  _startX: 0,
  _startY: 0,
  _itemTop: 0,
  _itemLeft: 0,
  _lpTimer: null,
  _active: false,
  _handlers: [],

  enable(container, onReorder) {
    if(!container) return;
    this._onReorder = onReorder;
    this._container = container;
    this._active    = true;

    // 기존 핸들러 제거
    this._handlers.forEach(([el,t,fn]) => el.removeEventListener(t,fn));
    this._handlers = [];

    const add = (el, type, fn, opts) => {
      el.addEventListener(type, fn, opts);
      this._handlers.push([el, type, fn]);
    };

    // 터치 이벤트
    add(container, 'touchstart', e => this._onTouchStart(e), {passive:false});
    add(container, 'touchmove',  e => this._onTouchMove(e),  {passive:false});
    add(container, 'touchend',   e => this._onTouchEnd(e));
    add(container, 'touchcancel',() => this._cancel());

    // 마우스 이벤트 (document 레벨)
    add(container, 'mousedown', e => this._onMouseDown(e));
    const onMove = e => this._onMouseMove(e);
    const onUp   = e => this._onMouseUp(e);
    add(document, 'mousemove', onMove);
    add(document, 'mouseup',   onUp);
  },

  disable() {
    this._active = false;
    this._cancel();
    this._handlers.forEach(([el,t,fn]) => el.removeEventListener(t,fn));
    this._handlers = [];
  },

  _getItem(el) {
    // 버튼류 제외
    if(el.closest('button, .cl-check, .habit-chk, .cl-del-btn, .reorder-toggle-btn')) return null;
    return el.closest('[data-reorderable]');
  },

  // ── TOUCH ──────────────────────────────
  _onTouchStart(e) {
    if(!this._active) return;
    const item = this._getItem(e.target);
    if(!item) return;
    this._startX = e.touches[0].clientX;
    this._startY = e.touches[0].clientY;
    clearTimeout(this._lpTimer);
    this._lpTimer = setTimeout(() => {
      this._startDrag(item, e.touches[0].clientX, e.touches[0].clientY);
      try { navigator.vibrate?.(40); } catch {}
    }, 500);
  },

  _onTouchMove(e) {
    const dx = Math.abs(e.touches[0].clientX - this._startX);
    const dy = Math.abs(e.touches[0].clientY - this._startY);
    if(!this._dragging) {
      if(dx > 8 || dy > 8) clearTimeout(this._lpTimer);
      return;
    }
    e.preventDefault();
    this._moveDrag(e.touches[0].clientX, e.touches[0].clientY);
  },

  _onTouchEnd(e) {
    clearTimeout(this._lpTimer);
    if(this._dragging) { e.preventDefault(); this._endDrag(); }
  },

  // ── MOUSE ──────────────────────────────
  _onMouseDown(e) {
    if(!this._active || e.button !== 0) return;
    const item = this._getItem(e.target);
    if(!item) return;
    this._startX = e.clientX;
    this._startY = e.clientY;
    clearTimeout(this._lpTimer);
    this._lpTimer = setTimeout(() => {
      this._startDrag(item, e.clientX, e.clientY);
    }, 400);
  },

  _onMouseMove(e) {
    const dx = Math.abs(e.clientX - this._startX);
    const dy = Math.abs(e.clientY - this._startY);
    if(!this._dragging) {
      if(dx > 5 || dy > 5) clearTimeout(this._lpTimer);
      return;
    }
    e.preventDefault();
    this._moveDrag(e.clientX, e.clientY);
  },

  _onMouseUp(e) {
    clearTimeout(this._lpTimer);
    if(this._dragging) this._endDrag();
  },

  _cancel() {
    clearTimeout(this._lpTimer);
    if(this._dragging) this._endDrag(true);
  },

  // ── 드래그 시작 ────────────────────────
  _startDrag(item, x, y) {
    this._dragging = item;
    this._startX   = x;
    this._startY   = y;

    // placeholder
    this._placeholder = document.createElement('div');
    this._placeholder.className = 'reorder-placeholder';
    this._placeholder.style.height = item.offsetHeight + 'px';
    item.after(this._placeholder);

    const rect = item.getBoundingClientRect();
    this._itemTop  = rect.top;
    this._itemLeft = rect.left;

    item.classList.add('reorder-dragging');
    item.style.cssText = [
      'position:fixed',
      'z-index:9999',
      `width:${rect.width}px`,
      `left:${rect.left}px`,
      `top:${rect.top}px`,
      'pointer-events:none',
      'transition:none',
      'box-shadow:0 8px 24px rgba(0,0,0,0.18)',
    ].join(';');
  },

  // ── 드래그 이동 ────────────────────────
  _moveDrag(x, y) {
    if(!this._dragging) return;
    const dy = y - this._startY;
    this._itemTop  += dy;
    this._startY    = y;
    this._dragging.style.top = this._itemTop + 'px';

    const siblings = [...this._container.querySelectorAll('[data-reorderable]')]
      .filter(el => el !== this._dragging);

    for(const sib of siblings) {
      const r = sib.getBoundingClientRect();
      if(y < r.top + r.height / 2) {
        sib.before(this._placeholder);
        return;
      }
    }
    const last = siblings[siblings.length-1];
    if(last) last.after(this._placeholder);
  },

  // ── 드래그 종료 ────────────────────────
  _endDrag(cancel=false) {
    if(!this._dragging) return;
    const item = this._dragging;

    item.style.cssText = '';
    item.classList.remove('reorder-dragging');

    if(!cancel && this._placeholder) {
      this._placeholder.before(item);
    }
    this._placeholder?.remove();
    this._placeholder = null;
    this._dragging    = null;

    if(!cancel && this._onReorder) {
      const newOrder = [...this._container.querySelectorAll('[data-reorderable]')]
        .map(el => el.dataset.reorderable);
      this._onReorder(newOrder);
    }
  },
};
