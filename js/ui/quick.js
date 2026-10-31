// 글 한 덩어리를 노트로 넣기: 가운데 입력창, 공유 받기, 붙여넣기 화면이 함께 쓴다
import { app, toast, say, prefs } from './state.js';
import { go, noteHref } from './router.js';
import { categoryOf, drawerTargets } from './categories.js';
import { takeTokens } from '../core/slash.js';

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
  if (prefs.get('firstLineTitle', true) && lines.length > 1 && lines[0].length <= 60) return { kind: 'titled', title: lines[0].trim() };
  return { kind: 'memo' };
}

// 글 속 #태그 는 태그로, @서랍 은 그 서랍으로 (글에서는 뺀다) → { text, extra }
// allow: 목록에서 고른 새 서랍 이름 (아직 폴더가 없어도 받아 준다)
export function withTokens(text, extra = {}, allow = []) {
  const got = takeTokens(text, { drawers: app.lib ? drawerTargets(app.lib) : [], allow });
  const out = { ...extra };
  if (got.tags.length) out.tags = [...new Set([...(extra.tags ?? []), ...got.tags])];
  if (got.drawer) { out.category = got.drawer; out.status = 'organized'; }
  return { text: got.text, extra: out, drawer: got.drawer };
}

// 한 줄이면 내용만, 여러 줄이면 첫 줄을 제목으로 쓴다. 주소로 시작하면 링크 노트.
// extra: 어디서 넣었는지(via) 같은 머리말 값
export async function saveQuick(raw, extra0 = {}, allow = []) {
  const { text, extra } = withTokens(raw, extra0, allow);
  const t = text.trim();
  if (!t) return null;
  const m = URL_RE.exec(t);
  if (m) return app.lib.addLink(m[1], m[2], '', extra);
  const lines = t.split('\n');
  if (prefs.get('firstLineTitle', true) && lines.length > 1 && lines[0].length <= 60) return app.lib.create({ type: 'memo', title: lines[0].trim(), body: lines.slice(1).join('\n').trim(), ...extra });
  return app.lib.create({ type: 'memo', body: t, ...extra });
}

// 넣고 나서 실수였으면 바로 되돌린다. 알림에는 자동으로 고른 서랍을 보여 준다
export async function quickSave(text, { open: open0 = false, allow = [] } = {}) {
  const open = open0 || prefs.get('openAfterSave', false);
  const n = await saveQuick(text, {}, allow);
  if (!n) return null;
  if (open) go(noteHref(n.id));
  else {
    const c = categoryOf(n, app.lib);
    const where = c.sub ? `${c.name} › ${c.sub}` : c.name;
    say(c.name === '기타' ? '넣었어요! 어울리는 서랍을 찾으면 옮겨 둘게요.' : `좋아요, ${where} 서랍에 넣어 둘게요.`, { mood: 'happy', hop: true });
    toast(`${where} 서랍에 넣었어요`, { mascot: true,
      action: '되돌리기', duration: 5000,
      onAction: async () => { try { await app.lib.remove(app.lib.get(n.id) ?? n); toast('방금 넣은 노트를 뺐어요'); } catch (e) { toast(e.message); } },
    });
  }
  return n;
}
