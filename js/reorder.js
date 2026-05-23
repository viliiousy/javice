// js/reorder.js — 재사용 가능한 꾹누르기 순서변경 모듈

const Reorder = {
  _active: null,     // 현재 드래그 중인 요소
  _placeholder: null,
  _startY: 0,
  _items: null,
  _onReorder: null,

  // containerId: 부모 컨테이너 id, onReorder: 순서 변경 후 콜백
  enable(container, onReorder) {
    this._onReorder = onReorder;
    // 기존 리스너 제거 후 재등록
    container.addEventListener('touchstart', e => this._onTouchStart(e), { passive: false });
    container.addEventListener('touchmove',  e => this._onTouchMove(e),  { passive: false });
    container.addEventListener('touchend',   e => this._onTouchEnd(e));
    container.addEventListener('mousedown',  e => this._onMouseDown(e));
  },

  _findItem(el) {
    // [data-reorderable] 속성을 가진 부모 찾기
    while (el && !el.dataset.reorderable) el = el.parentElement;
    return el;
  },

  _isHandle(el) {
    // .reorder-handle 클릭 시에만 드래그 허용
    return el.closest?.('.reorder-handle');
  },

  _onTouchStart(e) {
    if (!this._isHandle(e.target)) return;
    e.preventDefault();
    const item = this._findItem(e.target);
    if (!item) return;
    this._startDrag(item, e.touches[0].clientY);
  },

  _onMouseDown(e) {
    if (!this._isHandle(e.target)) return;
    e.preventDefault();
    const item = this._findItem(e.target);
    if (!item) return;
    this._startDrag(item, e.clientY);
    const onMove = ev => this._moveDrag(ev.clientY);
    const onUp   = ()  => { this._endDrag(); document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  },

  _startDrag(item, startY) {
    this._active = item;
    this._startY = startY;
    item.classList.add('reorder-dragging');
    // placeholder
    this._placeholder = document.createElement('div');
    this._placeholder.className = 'reorder-placeholder';
    this._placeholder.style.height = item.offsetHeight + 'px';
    item.parentNode.insertBefore(this._placeholder, item.nextSibling);
    item.style.position = 'fixed';
    item.style.zIndex   = '9999';
    item.style.width    = item.offsetWidth + 'px';
    item.style.left     = item.getBoundingClientRect().left + 'px';
    item.style.top      = item.getBoundingClientRect().top  + 'px';
  },

  _onTouchMove(e) {
    if (!this._active) return;
    e.preventDefault();
    this._moveDrag(e.touches[0].clientY);
  },

  _moveDrag(clientY) {
    if (!this._active) return;
    const dy = clientY - this._startY;
    const rect = this._active.getBoundingClientRect();
    this._active.style.top = (parseFloat(this._active.style.top) + dy) + 'px';
    this._startY = clientY;

    // placeholder 위치 업데이트
    const container = this._placeholder.parentNode;
    const siblings  = [...container.querySelectorAll('[data-reorderable]')].filter(el => el !== this._active);
    for (const sib of siblings) {
      const sibRect = sib.getBoundingClientRect();
      const sibMid  = sibRect.top + sibRect.height / 2;
      if (clientY < sibMid) {
        container.insertBefore(this._placeholder, sib);
        return;
      }
    }
    container.appendChild(this._placeholder);
  },

  _onTouchEnd(e) {
    if (!this._active) return;
    this._endDrag();
  },

  _endDrag() {
    if (!this._active) return;
    const item = this._active;
    const container = this._placeholder.parentNode;

    // placeholder 위치에 item 삽입
    container.insertBefore(item, this._placeholder);
    this._placeholder.remove();

    // 스타일 복원
    item.style.position = '';
    item.style.zIndex   = '';
    item.style.width    = '';
    item.style.left     = '';
    item.style.top      = '';
    item.classList.remove('reorder-dragging');

    // 새 순서 추출
    const newOrder = [...container.querySelectorAll('[data-reorderable]')].map(el => el.dataset.reorderable);
    this._active = null;

    if (this._onReorder) this._onReorder(newOrder);
  },
};
