// 글 한 덩어리를 노트로 넣기: 가운데 입력창, 공유 받기, 붙여넣기 화면이 함께 쓴다
import { app, toast } from './state.js';
import { go, noteHref } from './router.js';

const URL_RE = /^(https?:\/\/\S+)\s*([\s\S]*)$/i;

// 무엇으로 저장될지 (입력창 아래 안내에 쓴다)
export function kindOfText(text) {
  const t = text.trim();
  if (!t) return { kind: 'empty' };
  const m = URL_RE.exec(t);
  if (m) {
    let host = m[1];
    try { host = new URL(m[1]).hostname.replace(/^www\./, ''); } catch { /* 주소 그대로 */ }
    return { kind: /instagram\.com\//i.test(m[1]) ? 'instagram' : 'link', host };
  }
  const lines = t.split('\n');
  if (lines.length > 1 && lines[0].length <= 60) return { kind: 'titled', title: lines[0].trim() };
  return { kind: 'memo' };
}

// 한 줄이면 내용만, 여러 줄이면 첫 줄을 제목으로 쓴다. 주소로 시작하면 링크 노트.
// extra: 어디서 넣었는지(via) 같은 머리말 값
export async function saveQuick(text, extra = {}) {
  const t = text.trim();
  if (!t) return null;
  const m = URL_RE.exec(t);
  if (m) return app.lib.addLink(m[1], m[2], '', extra);
  const lines = t.split('\n');
  if (lines.length > 1 && lines[0].length <= 60) return app.lib.create({ type: 'memo', title: lines[0].trim(), body: lines.slice(1).join('\n').trim(), ...extra });
  return app.lib.create({ type: 'memo', body: t, ...extra });
}

// 넣고 나서 실수였으면 바로 되돌린다
export async function quickSave(text, { open = false } = {}) {
  const n = await saveQuick(text);
  if (!n) return null;
  if (open) go(noteHref(n.id));
  else {
    toast('인박스에 넣었어요', {
      action: '되돌리기', duration: 5000,
      onAction: async () => { try { await app.lib.remove(app.lib.get(n.id) ?? n); toast('방금 넣은 노트를 뺐어요'); } catch (e) { toast(e.message); } },
    });
  }
  return n;
}
