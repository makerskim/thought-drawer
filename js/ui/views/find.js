// 찾기와 묻기

import { esc, icon, toast } from '../dom.js';
import { cardsHtml, hydrateThumbs } from '../cards.js';
import { search, parseQuery, highlight } from '../../core/search.js';
import { answerLocally, buildClaudePrompt, claudeUrl } from '../../core/ask.js';

const TYPE_CHIPS = [['', '전체'], ['메모', '메모'], ['캡처', '캡처'], ['북마크', '링크'], ['인스타', '인스타']];

export function find(ctx) {
  const { lib } = ctx;
  ctx.top({ title: '찾기', back: '#/' });
  const q0 = ctx.params.get('q') ?? '';
  ctx.el.innerHTML = `
    <form class="searchbox" role="search" id="sf">${icon('search')}<input class="input" name="q" type="search" value="${esc(q0)}" placeholder="셔츠, #위시리스트, 서랍:요리" autocomplete="off" aria-label="찾을 말"></form>
    <div class="chips" id="types" style="margin-bottom:12px">${TYPE_CHIPS.map(([v, l]) => `<button type="button" class="chip" data-type="${v}">${l}</button>`).join('')}</div>
    <p class="hint"><code>#태그</code> 태그로, <code>서랍:이름</code> 서랍 안에서, <code>종류:인스타</code> 종류별로 좁혀요.</p>
    <div id="res"></div>`;
  const f = ctx.el.querySelector('#sf');
  const res = ctx.el.querySelector('#res');
  const typesEl = ctx.el.querySelector('#types');
  let type = '';
  const run = () => {
    const raw = f.q.value.trim();
    const full = `${raw}${type ? ` 종류:${type}` : ''}`.trim();
    typesEl.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.type === type)));
    if (!full) {
      const tags = lib.tags().slice(0, 24);
      res.innerHTML = tags.length ? `<div class="section-head"><h2>자주 쓴 태그</h2></div><div class="chips">${tags.map(([t, n]) => `<a class="chip" href="#/s?q=${encodeURIComponent(`#${t}`)}">#${esc(t)} <span class="card-id">${n}</span></a>`).join('')}</div>` : '';
      return;
    }
    const q = parseQuery(full);
    const hits = search(lib.all, q);
    res.innerHTML = hits.length
      ? `<p class="hint">${hits.length}장 찾았어요.</p>${cardsHtml(hits, { terms: q.terms, hl: highlight })}`
      : `<div class="empty"><h3>"${esc(raw || type)}"에 맞는 카드가 없어요</h3><p>다른 말로 찾아보거나, 묻기에서 문장으로 물어보세요.</p><a class="btn" href="#/ask?q=${encodeURIComponent(raw)}">${icon('ask')}묻기로 가기</a></div>`;
    hydrateThumbs(res, lib);
    history.replaceState(null, '', `#/s${raw ? `?q=${encodeURIComponent(raw)}` : ''}`);
  };
  let t;
  f.q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 140); });
  f.onsubmit = (e) => { e.preventDefault(); run(); f.q.blur(); };
  typesEl.onclick = (e) => { const c = e.target.closest('[data-type]'); if (c) { type = c.dataset.type; run(); } };
  run();
  if (!q0) f.q.focus();
}

export function ask(ctx) {
  const { lib } = ctx;
  ctx.top({ title: '묻기', back: '#/' });
  const q0 = ctx.params.get('q') ?? '';
  ctx.el.classList.add('narrow');
  ctx.el.innerHTML = `
    <div class="page-head"><h1>서랍에 묻기</h1><p>문장으로 물으면 관련 카드를 서랍별로 모아 보여 줘요.</p></div>
    <form class="ask-form" id="af"><input class="input" name="q" value="${esc(q0)}" placeholder="내가 저장한 가을 셔츠 뭐 있었지?" autocomplete="off" aria-label="질문"><button class="btn primary" type="submit">묻기</button></form>
    <div class="chips" style="margin-bottom:22px">
      ${['사고 싶은 옷 뭐 있었지?', '10분 만에 할 수 있는 요리', '제주 여행 갈 때 볼 것', '요즘 무슨 생각을 저장했지?'].map((s) => `<button class="chip" type="button" data-s="${esc(s)}">${esc(s)}</button>`).join('')}
    </div>
    <div id="ans"></div>`;
  const f = ctx.el.querySelector('#af');
  const ans = ctx.el.querySelector('#ans');
  const run = () => {
    const question = f.q.value.trim();
    if (!question) { ans.innerHTML = ''; return; }
    history.replaceState(null, '', `#/ask?q=${encodeURIComponent(question)}`);
    const a = answerLocally(lib.all, question);
    if (!a.total) {
      ans.innerHTML = `<div class="empty"><h3>관련된 카드를 찾지 못했어요</h3><p>${a.terms.length ? `"${esc(a.terms.join(', '))}"이 들어간 카드가 없어요.` : '질문에서 찾을 말을 고르지 못했어요.'} 다른 말로 물어보세요.</p></div>`;
      return;
    }
    const prompt = buildClaudePrompt(question, a.results.slice(0, 15));
    ans.innerHTML = `
      <div class="ask-claude">
        <p><b>${a.total}장</b>을 찾아 ${a.groups.length}개 서랍으로 묶었어요. 카드를 바탕으로 정리된 답이 필요하면 Claude에게 넘기세요. 지금 쓰는 구독으로 답해요.</p>
        <div class="row"><a class="btn primary small" href="${esc(claudeUrl(prompt))}" target="_blank" rel="noopener">${icon('external')}Claude에게 더 묻기</a><button class="btn small" id="cp" type="button">${icon('copy')}질문 복사</button></div>
      </div>
      ${a.groups.map((g) => `<section class="group"><h3>${esc(g.category)} <span>${g.items.length}장</span></h3>${cardsHtml(g.items, { list: true, terms: a.terms, hl: highlight })}</section>`).join('')}`;
    ans.querySelector('#cp').onclick = async () => {
      try { await navigator.clipboard.writeText(prompt); toast('질문과 관련 카드를 복사했어요. Claude 앱에 붙여 넣으세요.'); } catch { toast('복사하지 못했어요.'); }
    };
    hydrateThumbs(ans, lib);
  };
  f.onsubmit = (e) => { e.preventDefault(); run(); };
  ctx.el.querySelectorAll('[data-s]').forEach((b) => { b.onclick = () => { f.q.value = b.dataset.s; run(); }; });
  if (q0) run(); else f.q.focus();
}
