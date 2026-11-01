// 한 글자 단축키 표: 옆 메뉴에 글자를 보여 주고, App이 같은 표로 키를 받는다.
// 자판 위치(e.code)로 받아서 한글 입력 상태(ㅗ, ㅇ …)에서도 그대로 동작한다.
export const NAV_KEYS = [
  { id: 'home', code: 'KeyH', key: 'H', label: '홈', href: '#/' },
  { id: 'drawers', code: 'KeyD', key: 'D', label: '모든 서랍', href: '#/drawers' },
  { id: 'all', code: 'KeyA', key: 'A', label: '모든 노트·필터', href: '#/all' },
  { id: 'tasks', code: 'KeyC', key: 'C', label: '할 일', href: '#/tasks' },
  { id: 'today', code: 'KeyT', key: 'T', label: '오늘 노트' },
  { id: 'graph', code: 'KeyG', key: 'G', label: '생각 지도', href: '#/graph' },
  { id: 'star', code: 'KeyF', key: 'F', label: '즐겨찾기', href: '#/star' },
  { id: 'new', code: 'KeyN', key: 'N', label: '새 노트', href: '#/new' },
  { id: 'settings', code: 'Comma', key: ',', label: '설정', href: '#/settings' },
  { id: 'help', code: 'Slash', shift: true, key: '?', label: '사용법', href: '#/help' },
];
export const keyOf = (id) => NAV_KEYS.find((k) => k.id === id)?.key ?? '';
export const navFor = (e) => NAV_KEYS.find((k) => k.code === e.code && !!k.shift === !!e.shiftKey);
