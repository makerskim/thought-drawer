// 카드 펼쳐 보기와 고쳐 쓰기

import { esc, icon, idStamp, dateLabel, toast, confirmInline, TYPE_ICON } from '../dom.js';
import { linkCardHtml } from '../cards.js';
import { renderMarkdown, hydrateAttachments } from '../render.js';
import { TYPES, displayTitle, categoryParts } from '../../core/note.js';

function drawerOptions(lib) {
  const out = [];
  const walk = (list) => list.forEach((d) => { out.push(d.path); walk(d.children); });
  walk(lib.drawers());
  return out.map((p) => `<option value="${esc(p)}"></option>`).join('');
}

// 본문의 "## 연결" 목록에서 링크 이유를 읽어 연결 카드 옆에 보여 준다
function linkReasons(body) {
  const out = new Map();
  const re = /^- \[\[(\d{14})[^\]]*\]\]\s*\(([^)]+)\)/gm;
  let m;
  while ((m = re.exec(body ?? ''))) out.set(m[1], m[2]);
  return out;
}

export async function noteView(ctx, id) {
  const { lib } = ctx;
  let note = lib.get(id);
  if (!note) {
    ctx.top({ title: '카드', back: '#/' });
    ctx.el.innerHTML = '<div class="empty"><h3>카드를 찾지 못했어요</h3><p>지워졌거나 아직 불러오지 못한 카드예요.</p><a class="btn" href="#/">서랍장으로</a></div>';
    return;
  }
  const back = note.meta.status === 'inbox' ? '#/inbox' : (note.meta.category ? `#/d/${encodeURIComponent(note.meta.category)}` : '#/');
  ctx.top({ title: '', back, actions: `<a class="icon-btn" href="#/e/${esc(note.id)}" aria-label="고쳐 쓰기">${icon('pen')}</a>` });
  if (note.body === undefined) {
    ctx.el.innerHTML = '<div class="loading">카드를 펼치는 중</div>';
    try { note = await lib.ensureBody(note); } catch (e) { ctx.el.innerHTML = `<div class="empty"><h3>카드를 불러오지 못했어요</h3><p>${esc(e.message)}</p></div>`; return; }
  }
  const m = note.meta;
  const title = displayTitle(m, note.body);
  const links = lib.connections(note);
  const reasons = linkReasons(note.body);
  const bodyWithoutLinks = String(note.body ?? '').replace(/\n## 연결\n[\s\S]*$/, '').trim();
  const where = m.status === 'inbox'
    ? '<a href="#/inbox">정리 대기</a>'
    : categoryParts(m.category).map((p, i, a) => `<a href="#/d/${encodeURIComponent(a.slice(0, i + 1).join('/'))}">${esc(p)}</a>`).join(' / ');
  ctx.el.classList.add('narrow');
  ctx.el.innerHTML = `
    <article class="sheet">
      <div class="sheet-head"><span class="card-type">${icon(TYPE_ICON[m.type] ?? 'memo')}${esc(TYPES[m.type] ?? '카드')}</span><span class="card-id" title="카드 번호">${esc(idStamp(note.id))}</span></div>
      <div class="sheet-inner">
        <h1>${esc(title)}</h1>
        <div class="meta">
          <span>${where}</span>
          <span>${esc(dateLabel(m.created))}</span>
          ${m.author ? `<span>@${esc(m.author)}</span>` : ''}
          ${m.source ? `<a href="${esc(m.source)}" target="_blank" rel="noopener">원문 열기</a>` : ''}
        </div>
        ${(m.tags ?? []).length ? `<div class="chips">${m.tags.map((t) => `<a class="chip" href="#/s?q=${encodeURIComponent(`#${t}`)}">#${esc(t)}</a>`).join('')}</div>` : ''}
        ${m.summary ? `<div class="summary"><b>Claude 요약</b>${esc(m.summary)}</div>` : ''}
        <div class="thought">
          <label for="thought">내 생각 한 줄</label>
          <textarea id="thought" class="textarea" placeholder="이걸 왜 저장했는지, 어디에 쓸지 내 말로 적어 두면 나중에 다시 꺼내 쓰기 쉬워요.">${esc(m.thought ?? '')}</textarea>
          <small id="thought-state">입력을 멈추면 저장돼요.</small>
        </div>
        <div class="prose" id="prose">${renderMarkdown(bodyWithoutLinks, lib)}</div>
        ${links.length ? `<div class="section-head"><h2>연결된 카드</h2><span class="hint">${links.length}장</span></div>
          <div class="links-list">${links.map((l) => linkCardHtml(l, reasons.get(l.note.id))).join('')}</div>` : ''}
        <div class="toolbar">
          <a class="btn" href="#/e/${esc(note.id)}">${icon('pen')}고쳐 쓰기</a>
          <button class="btn" id="move">${icon('move')}서랍 정하기</button>
          <button class="btn ghost danger" id="del">${icon('trash')}지우기</button>
        </div>
        <form id="move-form" class="field" hidden style="margin-top:14px">
          <span>어느 서랍에 넣을까요?</span>
          <input class="input" name="cat" list="drawer-list" placeholder="예: 패션/상의" value="${esc(m.category ?? '')}" autocomplete="off">
          <datalist id="drawer-list">${drawerOptions(lib)}</datalist>
          <small>"큰 서랍/작은 서랍"처럼 빗금으로 나눠요. 비우면 정리 대기로 돌아가요.</small>
          <div class="row" style="display:flex;gap:8px;margin-top:6px"><button class="btn primary" type="submit">옮기기</button><button class="btn ghost" type="button" id="move-cancel">닫기</button></div>
        </form>
      </div>
    </article>`;
  hydrateAttachments(ctx.el, lib);

  const ta = ctx.el.querySelector('#thought');
  const state = ctx.el.querySelector('#thought-state');
  let timer;
  ta.addEventListener('input', () => {
    clearTimeout(timer);
    state.textContent = '입력 중';
    timer = setTimeout(async () => {
      try {
        note = await lib.update(note, { meta: { thought: ta.value.trim() } });
        state.textContent = '저장했어요.';
      } catch (e) { state.textContent = e.message; }
    }, 900);
  });

  const form = ctx.el.querySelector('#move-form');
  ctx.el.querySelector('#move').onclick = () => { form.hidden = !form.hidden; if (!form.hidden) form.cat.focus(); };
  ctx.el.querySelector('#move-cancel').onclick = () => { form.hidden = true; };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const cat = categoryParts(form.cat.value).join('/');
    try {
      note = await lib.update(note, { meta: { category: cat || undefined, status: cat ? 'organized' : 'inbox' } });
      toast(cat ? `${cat} 서랍에 넣었어요.` : '정리 대기로 돌렸어요.');
      ctx.go(`#/n/${note.id}`, { replace: true });
    } catch (err) { toast(err.message); }
  };
  ctx.el.querySelector('#del').onclick = async (e) => {
    const where = ctx.mode === 'drive' ? '드라이브 휴지통으로 가서 30일 안에는 되살릴 수 있어요.' : '체험 카드는 되살릴 수 없어요.';
    if (!await confirmInline(e.currentTarget, `이 카드를 지울까요? ${where}`, '카드 지우기')) return;
    try { await lib.remove(note); toast('카드를 지웠어요.'); ctx.go(back, { replace: true }); } catch (err) { toast(err.message); }
  };
}

export async function editor(ctx, id) {
  const { lib } = ctx;
  let note = id ? lib.get(id) : null;
  if (id && !note) { ctx.go('#/', { replace: true }); return; }
  if (note) note = await lib.ensureBody(note);
  const m = note?.meta ?? {};
  ctx.top({ title: note ? '고쳐 쓰기' : '새 메모', back: note ? `#/n/${note.id}` : '#/' });
  ctx.el.classList.add('narrow');
  ctx.el.innerHTML = `
    <form id="ed" class="sheet"><div class="sheet-head"><span class="card-type">${icon(TYPE_ICON[m.type ?? 'memo'])}${esc(TYPES[m.type ?? 'memo'])}</span><span class="card-id">${esc(note ? idStamp(note.id) : '새 카드')}</span></div>
      <div class="sheet-inner">
        <label class="field"><span>제목</span><input class="input" name="title" value="${esc(m.title ?? '')}" placeholder="비워 두면 Claude가 붙여요" autocomplete="off"></label>
        <label class="field"><span>내용</span><textarea class="textarea" name="body" placeholder="떠오른 생각, 사고 싶은 것, 기억할 것. 한 장에 한 가지만 적으면 연결하기 좋아요.">${esc(note?.body ?? '')}</textarea>
          <small>[[카드 제목]]으로 다른 카드를 이어 둘 수 있어요.</small></label>
        <label class="field"><span>태그</span><input class="input" name="tags" value="${esc((m.tags ?? []).join(', '))}" placeholder="쉼표로 나눠요. 예: 셔츠, 위시리스트" autocomplete="off"></label>
        <label class="field"><span>서랍</span><input class="input" name="cat" list="drawer-list2" value="${esc(m.status === 'organized' ? (m.category ?? '') : '')}" placeholder="비워 두면 Claude가 정해요" autocomplete="off">
          <datalist id="drawer-list2">${drawerOptions(lib)}</datalist></label>
        <label class="field"><span>내 생각 한 줄</span><input class="input" name="thought" value="${esc(m.thought ?? '')}" placeholder="왜 저장했는지 내 말로" autocomplete="off"></label>
        <div class="toolbar"><button class="btn primary" type="submit">${note ? '저장' : '서랍에 넣기'}</button><a class="btn ghost" href="${note ? `#/n/${esc(note.id)}` : '#/'}">취소</a></div>
      </div></form>`;
  const form = ctx.el.querySelector('#ed');
  if (!note) form.body.focus();
  const save = async () => {
    const cat = categoryParts(form.cat.value).join('/');
    const tags = form.tags.value.split(/[,#]/).map((t) => t.trim()).filter(Boolean);
    const meta = { title: form.title.value.trim(), tags, thought: form.thought.value.trim(), category: cat || undefined, status: cat ? 'organized' : 'inbox' };
    if (!form.body.value.trim() && !meta.title) { toast('내용이나 제목을 적어 주세요.'); return; }
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const saved = note
        ? await lib.update(note, { meta, body: form.body.value })
        : await lib.create({ type: 'memo', body: form.body.value, ...meta });
      toast(note ? '저장했어요.' : (cat ? `${cat} 서랍에 넣었어요.` : '정리 대기에 넣었어요.'));
      ctx.go(`#/n/${saved.id}`, { replace: true });
    } catch (e) { toast(e.message); btn.disabled = false; }
  };
  form.onsubmit = (e) => { e.preventDefault(); save(); };
  form.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); } });
}
