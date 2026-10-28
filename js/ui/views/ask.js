// 묻기: 문장으로 물으면 관련 노트를 폴더별로 모으고, 깊은 답은 Claude 앱으로 넘긴다
import { html, useState, useMemo } from '../h.js';
import { Icon } from '../icons.js';
import { useLib, toast } from '../state.js';
import { setUrl, folderHref } from '../router.js';
import { Topbar } from '../parts/shell.js';
import { NoteRow, Empty, highlighter } from '../parts/common.js';
import { answerLocally, buildClaudePrompt, claudeUrl } from '../../core/ask.js';
import { categoryParts } from '../../core/note.js';

export function Ask({ params }) {
  const lib = useLib();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [asked, setAsked] = useState(params.get('q') ?? '');
  const result = useMemo(() => (asked.trim() ? answerLocally(lib.all, asked) : null), [asked, lib.all.length]);
  const submit = (e) => { e?.preventDefault(); setAsked(q); setUrl(`#/ask?q=${encodeURIComponent(q)}`); };
  const suggestions = useMemo(() => {
    const folders = lib.folders().slice(0, 2).map((f) => `${f.name}에 뭐가 있었지?`);
    const tags = lib.tags().slice(0, 2).map(([t]) => `${t} 관련 노트 보여줘`);
    return [...folders, ...tags, '요즘 저장한 것 중에 다시 볼 만한 것'].slice(0, 4);
  }, [lib.all.length]);
  const hl = result ? highlighter(result.terms) : null;
  const prompt = result?.total ? buildClaudePrompt(asked, result.results.slice(0, 15)) : '';
  return html`
    <${Topbar} crumbs=${[{ label: '묻기' }]} />
    <div class="page narrow">
      <div class="page-head"><${Icon} name="ask" class="icon-lg" /><h1>무엇이 궁금하세요?</h1><p>문장으로 물으면 관련 노트를 폴더별로 모아 보여 줘요.</p></div>
      <form class="capture" style="margin-top:0" onSubmit=${submit}>
        <textarea rows="1" value=${q} aria-label="질문" placeholder="예: 사고 싶었던 셔츠 뭐 있었지?"
          onInput=${(e) => setQ(e.target.value)} onKeyDown=${(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) submit(e); }}></textarea>
        <div class="bar"><span class="hint">↵ 묻기</span><button class="btn btn-primary" disabled=${!q.trim()}>묻기</button></div>
      </form>
      ${!result && suggestions.length > 0 && html`<div class="chips" style="margin-top:14px">${suggestions.map((s) => html`
        <button type="button" class="chip" key=${s} onClick=${() => { setQ(s); setAsked(s); setUrl(`#/ask?q=${encodeURIComponent(s)}`); }}>${s}</button>`)}</div>`}
      ${result && !result.total && html`<${Empty} icon="search" title="관련된 노트를 찾지 못했어요" text=${result.terms.length ? `“${result.terms.join(', ')}”이 들어간 노트가 없어요. 다른 말로 물어보세요.` : '질문에서 찾을 말을 고르지 못했어요. 다른 말로 물어보세요.'} />`}
      ${result?.total > 0 && html`
        <div class="banner" style="margin-top:18px">
          <${Icon} name="sparkle" />
          <p><b>${result.total}개</b> 노트를 찾았어요. 이 노트들을 바탕으로 정리된 답이 필요하면 Claude에게 넘기세요. 지금 쓰는 구독으로 답해요.</p>
          <a class="btn btn-primary" href=${claudeUrl(prompt)} target="_blank" rel="noopener"><${Icon} name="external" />Claude에게 묻기</a>
          <button type="button" class="btn" onClick=${async () => { try { await navigator.clipboard.writeText(prompt); toast('질문과 관련 노트를 복사했어요.'); } catch { toast('복사하지 못했어요.'); } }}><${Icon} name="copy" />복사</button>
        </div>
        ${result.groups.map((g) => html`<section class="section" key=${g.category}>
          <div class="section-head"><h2>${g.category === '정리 대기' ? '인박스' : categoryParts(g.category).join(' / ')}</h2>
            ${g.category !== '정리 대기' && html`<a href=${folderHref(g.category)}>폴더 열기</a>`}</div>
          <div class="rows">${g.items.map(({ note }) => html`<${NoteRow} key=${note.id} note=${note} showFolder=${false} hl=${hl} />`)}</div>
        </section>`)}`}
    </div>`;
}
