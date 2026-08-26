// js/icons.js — 카드 머리글과 하단 탭에 쓰는 선 아이콘 한 벌
//
// 원래는 카드마다 컬러 이모지(📋 📅 ✍️ …)가 붙어 있었다. 두 가지가 걸렸다.
// 하나, 이모지는 기기가 그린다 — 같은 📊 라도 아이폰·안드로이드·윈도우가 전부 다른 그림이다.
// 둘, 색이 제각각이라 정작 봐야 할 숫자("2,800kcal 남음")보다 아이콘이 먼저 눈에 들어왔다.
//
// 그래서 굵기·크기·색이 하나로 묶인 선 아이콘으로 바꿨다. 색은 CSS 가 정한다(currentColor).
// 외부 아이콘 라이브러리는 쓰지 않는다 — 이 한 벌 쓰자고 CDN 하나를 더 매달 이유가 없다.
//
// 이모지를 전부 없애자는 게 아니다. 휴식일 😴 이나 빈 화면 안내처럼
// '표정'이 의미를 만드는 자리는 그대로 둔다. 여기 있는 건 이름표 자리의 아이콘뿐이다.

const Icons = {
  // Lucide 계열 24×24 패스. fill 없음, stroke 만 쓴다.
  P: {
    tasks:    '<path d="M9 3h6a1 1 0 0 1 1 1v1H8V4a1 1 0 0 1 1-1Z"/><path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><path d="m9 13 2 2 4-4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    pen:      '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>',
    check:    '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
    diet:     '<path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10"/><path d="M17 3c-1.7 1.5-2.5 3.5-2.5 6 0 1.7.8 3 2.5 3s2.5-1.3 2.5-3c0-2.5-.8-4.5-2.5-6Z"/><path d="M17 12v9"/>',
    book:     '<path d="M12 7c-1.5-1.3-3.5-2-6-2H3v13h3c2.5 0 4.5.7 6 2"/><path d="M12 7c1.5-1.3 3.5-2 6-2h3v13h-3c-2.5 0-4.5.7-6 2"/><path d="M12 7v13"/>',
    dumbbell: '<rect x="2.5" y="6.5" width="3.5" height="11" rx="1"/><rect x="18" y="6.5" width="3.5" height="11" rx="1"/><path d="M6 12h12"/>',
    chart:    '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><rect x="7" y="12" width="3" height="6" rx="1"/><rect x="12.5" y="8" width="3" height="10" rx="1"/><rect x="18" y="14" width="3" height="4" rx="1"/>',
    trend:    '<path d="m4 16 5-5 3.5 3.5L20 7"/><path d="M15 7h5v5"/>',
    memo:     '<path d="M5 4a1 1 0 0 1 1-1h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4Z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
    sun:      '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  },

  svg(name, cls) {
    const d = this.P[name];
    if (!d) return '';                       // 이름을 잘못 쓰면 조용히 빈칸. 깨진 네모보다 낫다.
    return `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  },

  // index.html 의 <span class="card-title" data-ic="tasks">할일</span> 을 채운다.
  // 마크업에 SVG 패스를 열 번 적어 넣지 않기 위해서다 — 아이콘을 바꿀 곳이 한 군데로 남는다.
  paint(root) {
    (root || document).querySelectorAll('[data-ic]').forEach(el => {
      if (el.dataset.icOn) return;           // 두 번 그리지 않는다
      const s = this.svg(el.dataset.ic);
      if (!s) return;
      el.insertAdjacentHTML('afterbegin', s);
      el.dataset.icOn = '1';
    });
  },
};

document.addEventListener('DOMContentLoaded', () => Icons.paint());
