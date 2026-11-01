// 연관 노트(화면 쪽): 라이브러리가 바뀔 때만 다시 계산한다 (core/related.js).
import { buildIndex, relatedTo, relatedEdges } from '../core/related.js';
import { categoryOf, keyTags } from './categories.js';

let memo = { key: '', index: null, edges: null };
function indexFor(lib) {
  const key = `${lib.version ?? ''}:${lib.all.length}`;
  if (memo.key !== key) memo = { key, index: buildIndex(lib.all, { cat: (n) => categoryOf(n, lib), tags: (n) => keyTags(n, lib) }), edges: null };
  return memo;
}

// 아직 잇지 않은, 이어 볼 만한 노트 → [{ note, score, why }]
export function relatedNotes(note, lib, limit = 5) {
  const linked = new Set(lib.connections(note).map((c) => c.note.id));
  return relatedTo(indexFor(lib).index, note.id, { limit, skip: linked });
}

// 생각 지도의 추천 연결 (이미 이은 것은 빼고) → [{ a, b, score, why }]
export function suggestedEdges(lib) {
  const m = indexFor(lib);
  if (!m.edges) m.edges = relatedEdges(m.index, { linked: new Set(lib.edges().map(([a, b]) => [a, b].sort().join('|'))) });
  return m.edges;
}
