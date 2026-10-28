// "묻기": 기기 안에서 관련 노트를 찾아 폴더별로 묶어 보여주고,
// 더 깊은 답이 필요하면 관련 노트 요약을 붙인 질문을 Claude 앱으로 넘긴다(구독 사용, API 비용 없음).

import { search, parseQuery } from './search.js';
import { displayTitle, TYPES } from './note.js';

export function answerLocally(notes, question, { limit = 40 } = {}) {
  const q = parseQuery(question);
  const results = search(notes, q, { limit });
  const groups = new Map();
  for (const r of results) {
    const cat = r.note.meta.category || '정리 대기';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(r);
  }
  const ordered = [...groups.entries()]
    .map(([category, items]) => ({ category, items, score: items.reduce((s, r) => s + r.score, 0) }))
    .sort((a, b) => b.score - a.score);
  return { terms: q.terms, total: results.length, groups: ordered, results };
}

const MAX_PROMPT = 5500;

export function buildClaudePrompt(question, results) {
  const head = [
    '아래는 내 노트 앱 "Thought Drawer"에 저장된 노트 중 질문과 관련된 것들이야.',
    '이 노트들만 근거로 질문에 답해줘. 답할 때 근거가 된 노트 번호를 [번호]로 붙여줘.',
    '노트에 없는 내용은 추측이라고 밝혀줘.',
    '',
    `질문: ${question}`,
    '',
    '노트:',
  ].join('\n');
  let text = head;
  results.forEach((r, i) => {
    const m = r.note.meta;
    const parts = [
      `[${i + 1}] ${displayTitle(m, r.note.body ?? r.note.snippet)}`,
      `폴더: ${m.category || '인박스'}`,
      `종류: ${TYPES[m.type] ?? m.type}`,
      m.tags?.length ? `태그: ${m.tags.join(', ')}` : '',
      m.summary ? `요약: ${m.summary}` : '',
      m.thought ? `내 생각: ${m.thought}` : '',
      m.source ? `출처: ${m.source}` : '',
      !m.summary && r.note.snippet ? `내용: ${r.note.snippet}` : '',
    ].filter(Boolean);
    const block = `\n${parts.join('\n')}\n`;
    if (text.length + block.length < MAX_PROMPT) text += block;
  });
  return text;
}

export function claudeUrl(prompt) {
  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
}
