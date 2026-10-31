// 넣기 전에 미리 보기 (넣는 칸, 가운데 입력창): 어느 서랍(› 세부 서랍)으로, 어떤 태그가 붙을지
import { html } from '../h.js';
import { Icon } from '../icons.js';
import { withTokens, kindOfText } from '../quick.js';
import { guessCategory, settingsOf, categoryLook } from '../categories.js';

export function draftMeta(text) {
  const k = kindOfText(text);
  const t = text.trim();
  if (k.kind === 'link' || k.kind === 'instagram') {
    const [url, ...rest] = t.split(/\s+/);
    return { meta: { type: k.kind === 'instagram' ? 'instagram' : 'bookmark', source: url }, body: rest.join(' ') };
  }
  const lines = t.split('\n');
  return k.kind === 'titled' ? { meta: { title: lines[0] }, body: lines.slice(1).join('\n') } : { meta: {}, body: t };
}

// 넣기 전에 미리 보기: 어느 서랍(› 세부 서랍)으로, 어떤 태그가 붙을지. 직접 적은 @서랍·#태그가 먼저.
export function preview(text, lib, allow = []) {
  const tok = withTokens(text, {}, allow);
  const d = draftMeta(tok.text || text);
  const g = guessCategory(d.meta, d.body, lib);
  const mine = tok.extra.tags ?? [];
  const max = Math.max(mine.length, settingsOf(lib).classify.tags);
  const tags = [...new Set([...mine, ...g.tags])].slice(0, max);
  const path = tok.drawer || g.path;
  const [top, sub = ''] = path.split('/');
  return { text: tok.text, top, sub, path, tags, mine: !!tok.drawer, label: sub ? `${top} › ${sub}` : top };
}

export function GuessLine({ pre }) {
  return html`<p class="cap-hint">
    <span class="cap-guess"><${Icon} name=${categoryLook(pre.top).icon} /><b>${pre.top}</b>${pre.sub && html`<span class="cap-sub">› ${pre.sub}</span>`}${pre.mine ? ' (직접)' : ''}</span>
    ${pre.tags.map((t) => html`<span class="cap-tag" key=${t}>#${t}</span>`)}
  </p>`;
}

