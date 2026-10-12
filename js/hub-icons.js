// js/hub-icons.js — 허브 기기 아이콘 (24×24 선 아이콘, 한 가지 굵기)
// 기기마다 사람이 고를 수 있게 이름표를 붙여 둔다. 순서가 고르는 목록의 순서다.
window.HubIcons = {
  LIST: [
    ['bulb',      '전구',        '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z"/>'],
    ['ceiling',   '천장등',      '<path d="M12 3v4"/><path d="M5 14a7 7 0 0 1 14 0Z"/><path d="M10 17.5a2 2 0 0 0 4 0"/>'],
    ['lamp',      '스탠드',      '<path d="M8 3h8l3 8H5Z"/><path d="M12 11v9M8 21h8"/>'],
    ['strip',     'LED 줄조명',  '<path d="M3 15c3-6 6 6 9 0s6 6 9 0"/><circle cx="6" cy="12" r=".6"/><circle cx="12" cy="15" r=".6"/><circle cx="18" cy="12" r=".6"/>'],
    ['outlet',    '콘센트',      '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9.5 9v2.5M14.5 9v2.5M10 15.5h4"/>'],
    ['plug',      '멀티탭·플러그','<path d="M9 3v5M15 3v5"/><path d="M6 8h12v3a6 6 0 0 1-12 0Z"/><path d="M12 17v4"/>'],
    ['switch',    '스위치',      '<rect x="6" y="3" width="12" height="18" rx="3"/><path d="M12 7v4"/>'],
    ['fan',       '선풍기',      '<circle cx="12" cy="10" r="1.4"/><path d="M12 8.6C12 4.5 13 2.5 15 2.5s3 3-3 6.1ZM13.4 10c4.1 0 6.1 1 6.1 3s-3 3-6.1-3ZM12 11.4c0 4.1-1 6.1-3 6.1s-3-3 3-6.1ZM10.6 10C6.5 10 4.5 9 4.5 7s3-3 6.1 3Z"/><path d="M12 17.5V21M9 21h6"/>'],
    ['ac',        '에어컨',      '<rect x="3" y="5" width="18" height="8" rx="2"/><path d="M6 10h12"/><path d="M8 16v3M12 16v4M16 16v3"/>'],
    ['heater',    '난방·보일러', '<path d="M8 21c-2-2-2-5 0-7s2-5 0-7"/><path d="M12 21c-2-2-2-5 0-7s2-5 0-7"/><path d="M16 21c-2-2-2-5 0-7s2-5 0-7"/>'],
    ['purifier',  '공기청정기',  '<rect x="6" y="3" width="12" height="18" rx="3"/><path d="M9 8h6M9 11h6M9 14h6"/><circle cx="12" cy="18" r=".6"/>'],
    ['humidifier','가습기',      '<path d="M7 21h10l-1-9H8Z"/><path d="M12 12V9"/><path d="M10 3c0 2 4 2 4 4"/>'],
    ['tv',        'TV',          '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8"/>'],
    ['speaker',   '스피커',      '<rect x="6" y="3" width="12" height="18" rx="2"/><circle cx="12" cy="14" r="3"/><circle cx="12" cy="7" r=".8"/>'],
    ['pc',        '컴퓨터',      '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M9 20h6M12 16v4"/>'],
    ['blind',     '블라인드',    '<path d="M4 3h16"/><path d="M5 7h14M5 11h14M5 15h14"/><path d="M12 15v5"/>'],
    ['curtain',   '커튼',        '<path d="M3 3h18"/><path d="M5 3c0 6 3 12 6 18H5ZM19 3c0 6-3 12-6 18h6Z"/>'],
    ['door',      '문',          '<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M4 21h16"/><path d="M14 12h.01"/>'],
    ['window',    '창문',        '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M12 3v18M4 12h16"/>'],
    ['lock',      '도어락',      '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'],
    ['vacuum',    '로봇청소기',  '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.5"/><path d="M12 3.5v3"/>'],
    ['washer',    '세탁기',      '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="13" r="4.5"/><path d="M7 6.5h2"/>'],
    ['fridge',    '냉장고',      '<rect x="6" y="2.5" width="12" height="19" rx="2"/><path d="M6 10h12M9 6v1.5M9 13v3"/>'],
    ['kettle',    '주방가전',    '<path d="M6 20h11l-1-11H7Z"/><path d="M8 9V6h7v3"/><path d="M16 11h2a2 2 0 0 1 0 4h-1.5"/>'],
    ['camera',    '카메라',      '<path d="M4 7h3l2-2h6l2 2h3v12H4Z"/><circle cx="12" cy="13" r="3.5"/>'],
    ['temp',      '온도',        '<path d="M10 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0Z"/>'],
    ['drop',      '습도',        '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/>'],
    ['motion',    '움직임',      '<circle cx="12" cy="5" r="2"/><path d="m10 22 2-8 3 3v5M8 10l3-2 3 2 2 3"/>'],
    ['media',     '미디어',      '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5Z"/>'],
    ['toggle',    '토글',        '<rect x="3" y="7" width="18" height="10" rx="5"/><circle cx="16" cy="12" r="3"/>'],
    ['star',      '기타',        '<path d="M12 3.5 14.5 9l6 .5-4.6 4 1.4 6-5.3-3.2L6.7 19.5l1.4-6-4.6-4 6-.5Z"/>'],
  ],
  _map: null,
  get(key) {
    if (!this._map) this._map = Object.fromEntries(this.LIST.map(x => [x[0], x]));
    return this._map[key] || this._map.star;
  },
  svg(key, cls) { return `<svg class="${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${this.get(key)[2]}</svg>`; },
};
