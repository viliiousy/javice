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
    moon:     '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',
    sun:      '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    // 여기부터는 모달 제목에 쓰는 것들
    plus:     '<path d="M12 5v14M5 12h14"/>',
    list:     '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    palette:  '<path d="M12 3a9 9 0 0 0 0 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1a1.5 1.5 0 0 1 1.06-2.56h1.77A5.06 5.06 0 0 0 21 10.88C20.97 6.5 16.94 3 12 3Z"/><circle cx="8" cy="8.5" r="1"/><circle cx="12.5" cy="6.5" r="1"/><circle cx="16.5" cy="9.5" r="1"/><circle cx="7" cy="13" r="1"/>',
    camera:   '<path d="M14.5 4h-5L8 6.5H5a2 2 0 0 0-2 2V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5a2 2 0 0 0-2-2h-3L14.5 4Z"/><circle cx="12" cy="13" r="3.5"/>',
    gear:     '<circle cx="12" cy="12" r="3"/><path d="M20.3 14.2a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 0 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H4a2 2 0 0 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V4a2 2 0 0 1 4 0v.2a1.6 1.6 0 0 0 2.8 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 0 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1Z"/>',
    bell:     '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    download: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 19h16"/>',
    key:      '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m11 12 9-9"/><path d="m15.5 7.5 3 3 2.5-2.5-3-3"/>',
    checkbox: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="m8 12 3 3 5-6"/>',
    copy:     '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    clock:    '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
    cloud:    '<path d="M17.5 19a4.5 4.5 0 0 0 .5-8.97A6 6 0 0 0 6.2 11.3 3.5 3.5 0 0 0 6.5 19Z"/>',
    user:     '<circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
    grid:     '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
  },

  svg(name, cls) {
    const d = this.P[name];
    if (!d) return '';                       // 이름을 잘못 쓰면 조용히 빈칸. 깨진 네모보다 낫다.
    return `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  },

  // 빈 화면 한가운데 놓는 큰 아이콘.
  big(name) { return this.svg(name, 'ic-empty'); },

  // 카드 머리글을 렌더할 때마다 통째로 다시 쓰는 모듈이 있다(운동·습관).
  // 거기서 textContent 를 쓰면 아이콘이 같이 지워진다. 그래서 제목을 바꾸는 길을
  // 여기 하나로 모은다 — 아이콘과 글자를 늘 함께 놓는다.
  title(el, name, text) {
    if (!el) return;
    const esc = String(text).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
    el.innerHTML = this.svg(name) + esc;
    el.dataset.icOn = '1';
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
