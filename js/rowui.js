// js/rowui.js — 목록 한 줄을 다루는 방식 한 벌
//
// 세 카드가 저마다 다르게 굴었다. 할일만 PC 에서 줄에 올리면 ✕ 가 떴고,
// 습관·체크리스트는 ⚙️ 편집 모드에 들어가야 지울 수 있었다.
// 스와이프·길게누르기 코드는 두 파일에 있었지만 DOM 에 한 번도 붙은 적이 없는 죽은 코드였다.
//
// 여기서 한 벌로 정한다.
//   손가락 — 길게 누르면 수정, 왼쪽으로 밀면 삭제 버튼이 나온다
//   마우스 — 글씨를 누르면 수정, 줄에 올리면 ✕ 가 나온다
//
// 미는 즉시 지우지 않는다. 버튼이 나오고, 그걸 한 번 더 눌러야 지워진다 —
// 주머니 속에서 스치기만 해도 사라지면 그건 기능이 아니라 사고다.
//
// 줄을 그리는 쪽은 마크업을 거의 안 바꾼다. 줄에 data-row 만 달고
// 그린 뒤 RowUI.paint(칸, {edit, del}) 를 부르면 된다.

const RowUI = {
  LP:   550,   // 길게 누르기로 치는 시간(ms)
  MOVE: 10,    // 이만큼 움직이면 누른 게 아니라 미는 것
  SNAP: 56,    // 이만큼 밀면 삭제 버튼이 열린 채로 멈춘다
  _open: null, // 지금 열려 있는 줄 (한 번에 하나만)

  closeOpen() {
    if (!this._open) return;
    this._open.classList.remove('rw-on');
    this._open.style.transform = '';
    this._open = null;
  },

  paint(root, h) {
    if (!root || !h) return;
    root.querySelectorAll('[data-row]').forEach(row => {
      if (row.dataset.rowOn) return;
      row.dataset.rowOn = '1';
      const id = row.dataset.i;
      const label = row.dataset.label || '항목';

      // 줄을 감싸고, 뒤에 삭제 버튼을 깐다
      const wrap = document.createElement('div');
      wrap.className = 'rw';
      row.parentNode.insertBefore(wrap, row);
      wrap.appendChild(row);
      row.classList.add('rw-slide');

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'rw-del';
      del.textContent = '삭제';
      del.setAttribute('aria-label', `${label} 삭제`);
      del.onclick = (e) => { e.stopPropagation(); this.closeOpen(); h.del(id); };
      wrap.appendChild(del);

      // PC 용 ✕ — DOM 에는 늘 있고 보이기만 숨는다.
      // 호버해야만 존재하는 버튼은 키보드로는 없는 버튼이라서다.
      // 이미 제 ✕ 를 가진 줄(할일)은 data-nox 로 빠진다. 두 개가 나란히 뜨면 그게 더 나쁘다.
      if (!row.hasAttribute('data-nox')) {
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'rw-x';
      x.innerHTML = '✕';
      x.setAttribute('aria-label', `${label} 삭제`);
      x.onclick = (e) => { e.stopPropagation(); h.del(id); };
      row.appendChild(x);
      }

      // ── 손가락 ──────────────────────────────
      let sx = 0, sy = 0, moved = false, sliding = false, lp = null, fired = false;
      const startedOpen = () => this._open === row;

      row.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        sx = t.clientX; sy = t.clientY;
        moved = false; sliding = false; fired = false;
        // 다른 줄이 열려 있으면 먼저 닫는다
        if (this._open && this._open !== row) this.closeOpen();
        lp = setTimeout(() => {
          if (moved) return;
          fired = true;
          if (navigator.vibrate) { try { navigator.vibrate(12); } catch {} }
          this.closeOpen();
          h.edit(id);
        }, this.LP);
      }, { passive: true });

      row.addEventListener('touchmove', (e) => {
        const t = e.touches[0];
        const dx = t.clientX - sx, dy = t.clientY - sy;
        if (!moved && Math.abs(dx) < this.MOVE && Math.abs(dy) < this.MOVE) return;
        moved = true;
        clearTimeout(lp);
        // 세로로 더 움직이면 그건 스크롤이다. 가로로 확실할 때만 잡는다.
        if (!sliding && Math.abs(dx) > Math.abs(dy) * 1.5) sliding = true;
        if (!sliding) return;
        e.preventDefault();
        row.classList.add('rw-drag');
        const base = startedOpen() ? -this.SNAP : 0;
        // 오른쪽으로는 제자리까지만, 왼쪽으로는 버튼 너비보다 조금 더까지
        const x2 = Math.max(-this.SNAP - 20, Math.min(0, base + dx));
        row.style.transform = `translateX(${x2}px)`;
      }, { passive: false });

      const end = (e) => {
        clearTimeout(lp);
        if (!sliding) return;
        const dx = (e.changedTouches ? e.changedTouches[0].clientX : sx) - sx;
        const base = startedOpen() ? -this.SNAP : 0;
        const x2 = base + dx;
        row.style.transform = '';
        row.classList.remove('rw-drag');
        if (x2 < -this.SNAP / 2) { row.classList.add('rw-on'); this._open = row; }
        else { row.classList.remove('rw-on'); if (startedOpen()) this._open = null; }
      };
      row.addEventListener('touchend', end);
      row.addEventListener('touchcancel', end);

      // 열려 있을 때의 탭은 '닫기'다. 길게 눌러 수정을 띄운 뒤의 탭도 삼킨다.
      row.addEventListener('click', (e) => {
        if (fired || sliding || this._open === row) {
          e.stopPropagation(); e.preventDefault();
          if (this._open === row) this.closeOpen();
        }
      }, true);
    });
  },
};

// 빈 곳을 누르면 열린 줄을 닫는다
document.addEventListener('click', (e) => {
  if (RowUI._open && !e.target.closest('.rw')) RowUI.closeOpen();
});
document.addEventListener('scroll', () => RowUI.closeOpen(), true);
