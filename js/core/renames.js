// 서랍 이름 바꿈 장부: [{ from: '옛 경로', to: '새 경로', at }].
// 서랍 이름이 바뀌어도 이미 정리된 노트는 다시 분류하지 않는다 (Claude 사용량을 쓰지 않게).
// 앱과 Claude 정리기가 이 장부를 보고 옛 이름을 새 이름으로 바꿔 쓰고, 파일은 새 폴더로 옮기기만 한다.
// organizer/td_note.py 의 rename_path 와 같은 규칙 (tests/fixtures/renames.json 으로 둘 다 확인).
import { RENAMED } from './taxonomy.js';

const parts = (p) => String(p ?? '').split('/').map((s) => s.trim()).filter(Boolean);
export const cleanPath = (p) => parts(p).slice(0, 3).join('/');

// 경로 앞부분이 from 과 같으면 to 로 바꾼다. 긴 from 이 먼저, 이어진 바꿈(A→B, B→C)은 끝까지 따라간다.
export function renamePath(path, renames = []) {
  let cur = cleanPath(path);
  if (!cur || !renames?.length) return cur;
  const list = renames
    .map((r) => ({ from: cleanPath(r?.from), to: cleanPath(r?.to) }))
    .filter((r) => r.from && r.to && r.from !== r.to)
    .sort((a, b) => parts(b.from).length - parts(a.from).length);
  const seen = new Set([cur]);
  for (let i = 0; i < 8; i++) {
    const r = list.find((x) => cur === x.from || cur.startsWith(`${x.from}/`));
    if (!r) break;
    const next = cleanPath(r.to + cur.slice(r.from.length));
    if (seen.has(next)) break; // 돌고 도는 바꿈(A→B, B→A)은 멈춘다
    seen.add(next);
    cur = next;
  }
  return cur;
}

// 장부 다듬기: 빈 것·같은 이름은 빼고, 같은 옛 이름이 둘이면 나중 것
export function normalizeRenames(list) {
  const out = new Map();
  for (const r of Array.isArray(list) ? list : []) {
    const from = cleanPath(r?.from);
    const to = cleanPath(r?.to);
    if (!from || !to || from === to) continue;
    out.delete(from);
    out.set(from, r?.at ? { from, to, at: String(r.at) } : { from, to });
  }
  return [...out.values()].slice(-300);
}

// 새 바꿈을 장부에 더한다. 예전 바꿈의 새 이름도 따라가고(A→B 뒤 B→C 면 A→C), 되돌리면(A→B 뒤 B→A) 지워진다.
export function addRename(list, from, to, at = '') {
  const f = cleanPath(from);
  const t = cleanPath(to);
  const now = normalizeRenames(list);
  if (!f || !t || f === t) return now;
  const kept = now.map((r) => ({ ...r, to: renamePath(r.to, [{ from: f, to: t }]) })).filter((r) => r.from !== r.to && r.from !== f);
  return normalizeRenames([...kept, { from: f, to: t, at }]);
}

// 장부를 차례로 접는다: 하나씩 addRename 으로 더해 돌고 도는 바꿈(A→B, B→A)이 생기지 않게
export const foldRenames = (list) => (Array.isArray(list) ? list : []).reduce((acc, r) => addRename(acc, r?.from, r?.to, r?.at), []);

// 이 이름으로 옮겨도 되나: 옮긴 뒤 다시 바뀌지 않는 이름이어야 한다 (장부가 꼬여도 파일이 왔다 갔다 하지 않게)
export const stableTarget = (path, renames) => { const to = renamePath(path, renames); return to !== cleanPath(path) && renamePath(to, renames) === to ? to : ''; };

// 앱이 처음부터 가진 이름 바꿈 (js/core/taxonomy.js 의 RENAMED)
export const BUILTIN_RENAMES = foldRenames(Object.entries(RENAMED).map(([from, to]) => ({ from, to })));

// 실제로 쓰는 장부: 앱의 것 + 내가 바꾼 것 (settings.json 의 renames, 내 것이 나중이라 이긴다)
let memo = [undefined, BUILTIN_RENAMES];
export function renamesOf(settings) {
  const mine = settings?.renames;
  if (memo[0] !== mine) memo = [mine, foldRenames([...BUILTIN_RENAMES, ...(Array.isArray(mine) ? mine : [])])];
  return memo[1];
}

// 서랍 이름으로 쓸 수 있나: 빈 이름, 「/」, 「_」·「00_」로 시작(앱이 쓰는 폴더), 20자 넘음은 안 된다
export function nameProblem(name) {
  const n = String(name ?? '').trim();
  if (!n) return '이름을 적어 주세요.';
  if (n.includes('/')) return '「/」는 쓸 수 없어요.';
  if (/^(_|00_)/.test(n)) return '「_」로 시작할 수 없어요.';
  if (/[\\:*?"<>|#^[\]]/.test(n)) return '쓸 수 없는 글자가 있어요.';
  if ([...n].length > 20) return '20자까지 쓸 수 있어요.';
  return '';
}
