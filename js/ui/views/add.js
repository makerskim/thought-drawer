// 카드 넣기: 고르기, 사진·캡처, 링크, 붙여넣기, 단축어로 받은 공유, 인스타 일괄 가져오기

import { esc, icon, toast, loadScript, JSZIP } from '../dom.js';
import { parseInstagramFile, mergeSaved, isInstagramUrl } from '../../core/instagram.js';

export function chooser(ctx) {
  ctx.top({ title: '카드 넣기', back: '#/' });
  ctx.el.innerHTML = `
    <div class="page-head"><h1>무엇을 넣을까요?</h1><p>넣기만 하면 돼요. 분류와 요약은 Claude가 해요.</p></div>
    <div class="choices">
      <a class="choice" href="#/new">${icon('memo')}<b>메모</b><span>생각, 할 일, 사고 싶은 것</span></a>
      <a class="choice" href="#/add/photo">${icon('photo')}<b>사진·캡처</b><span>사진 속 글자까지 읽어 둬요</span></a>
      <a class="choice" href="#/add/link">${icon('link')}<b>링크</b><span>웹사이트, 인스타 게시물 주소</span></a>
      <a class="choice" href="#/import">${icon('insta')}<b>인스타 저장함</b><span>저장해 둔 게시물을 한 번에</span></a>
    </div>
    <div class="section-head"><h2>아이폰에서 더 빠르게</h2></div>
    <div class="note-box">인스타, 사파리, 사진 앱의 공유 버튼에서 <b>「메모로 보내기」</b>를 누르면 바로 이 앱으로 들어와요. 단축어 만드는 법은 설정에 있어요.</div>`;
}

async function capturePhotos(ctx, files, memo, status) {
  const list = [...files].filter((f) => f.type.startsWith('image/'));
  if (!list.length) { toast('사진 파일을 골라 주세요.'); return null; }
  let last = null;
  for (let i = 0; i < list.length; i++) {
    last = await ctx.lib.addCapture(list[i], i === 0 ? memo : '', (step) => {
      status.textContent = list.length > 1 ? `${i + 1}/${list.length}장, ${step}` : step;
    });
  }
  return { last, count: list.length };
}

export function photo(ctx) {
  ctx.top({ title: '사진·캡처', back: '#/add' });
  ctx.el.classList.add('narrow');
  ctx.el.innerHTML = `
    <div class="page-head"><h1>사진·캡처 넣기</h1><p>${ctx.lib.adapter.canOcr ? '사진 속 글자는 구글 드라이브가 무료로 읽어 카드에 적어 둬요.' : '체험 모드에서는 사진 속 글자 읽기가 동작하지 않아요. 구글로 연결하면 동작해요.'}</p></div>
    <label class="drop" id="drop">${icon('upload')}<b>사진을 고르거나 여기로 끌어다 놓으세요</b><span>여러 장도 돼요. 캡처를 복사했다면 붙여넣기를 눌러요.</span>
      <input type="file" accept="image/*" multiple class="sr" id="file"></label>
    <div class="toolbar"><button class="btn" id="paste" type="button">${icon('paste')}붙여넣기</button></div>
    <div class="previews" id="pv"></div>
    <label class="field"><span>메모 (선택)</span><input class="input" id="memo" placeholder="예: 이 셔츠 흰색으로 사고 싶음" autocomplete="off"></label>
    <button class="btn primary wide" id="go" disabled>서랍에 넣기</button>
    <p class="hint" id="status" style="margin-top:10px"></p>`;
  let picked = [];
  const pv = ctx.el.querySelector('#pv');
  const go = ctx.el.querySelector('#go');
  const status = ctx.el.querySelector('#status');
  const show = () => {
    pv.innerHTML = picked.map((f) => `<img src="${URL.createObjectURL(f)}" alt="고른 사진">`).join('');
    go.disabled = !picked.length;
  };
  const add = (files) => { picked = [...picked, ...[...files].filter((f) => f.type.startsWith('image/'))]; show(); };
  ctx.el.querySelector('#file').onchange = (e) => add(e.target.files);
  const drop = ctx.el.querySelector('#drop');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); add(e.dataTransfer.files); });
  const onPaste = (e) => { const files = [...(e.clipboardData?.files ?? [])]; if (files.length) { e.preventDefault(); add(files); } };
  document.addEventListener('paste', onPaste);
  ctx.cleanup(() => document.removeEventListener('paste', onPaste));
  ctx.el.querySelector('#paste').onclick = async () => {
    const files = await readClipboardImages();
    if (files.length) add(files); else toast('복사해 둔 사진이 없어요. 캡처한 뒤 복사해 주세요.');
  };
  go.onclick = async () => {
    go.disabled = true;
    try {
      const r = await capturePhotos(ctx, picked, ctx.el.querySelector('#memo').value, status);
      if (!r) { go.disabled = false; return; }
      toast(`사진 ${r.count}장을 정리 대기에 넣었어요.`);
      ctx.go(r.count === 1 ? `#/n/${r.last.id}` : '#/inbox', { replace: true });
    } catch (e) { status.textContent = e.message; go.disabled = false; }
  };
  if (ctx.params.get('paste')) ctx.el.querySelector('#paste').focus();
}

async function readClipboardImages() {
  const out = [];
  try {
    for (const item of await navigator.clipboard.read()) {
      const type = item.types.find((t) => t.startsWith('image/'));
      if (type) out.push(new File([await item.getType(type)], `붙여넣기.${type.split('/')[1]}`, { type }));
    }
  } catch { /* 권한 없음 또는 지원 안 함 */ }
  return out;
}

export function link(ctx) {
  ctx.top({ title: '링크', back: '#/add' });
  ctx.el.classList.add('narrow');
  ctx.el.innerHTML = `
    <div class="page-head"><h1>링크 넣기</h1><p>페이지 내용은 다음 정리 때 Claude가 읽고 요약해요. 인스타 주소면 캡션을 읽어요.</p></div>
    <form id="f">
      <label class="field"><span>주소</span><input class="input" name="url" type="url" inputmode="url" required placeholder="https://" autocomplete="off"></label>
      <label class="field"><span>메모 (선택)</span><input class="input" name="memo" placeholder="왜 저장하는지 한 줄" autocomplete="off"></label>
      <button class="btn primary wide" type="submit">서랍에 넣기</button>
    </form>`;
  const f = ctx.el.querySelector('#f');
  f.url.focus();
  f.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const n = await ctx.lib.addLink(f.url.value.trim(), f.memo.value);
      toast('정리 대기에 넣었어요.');
      ctx.go(`#/n/${n.id}`, { replace: true });
    } catch (err) { toast(err.message); }
  };
}

// 단축어 「메모로 보내기」가 여는 주소: #/share?url=...&text=...&title=...
export async function share(ctx) {
  ctx.top({ title: '받는 중', back: '#/' });
  const p = ctx.params;
  const text = (p.get('text') ?? '').trim();
  const urlInText = /https?:\/\/\S+/.exec(text)?.[0];
  const url = (p.get('url') ?? '').trim() || urlInText || '';
  const memo = (urlInText && !p.get('url') ? text.replace(urlInText, '') : (url ? text : '')).trim();
  ctx.el.innerHTML = '<div class="loading">공유한 내용을 카드로 만드는 중</div>';
  try {
    let n;
    if (url) n = await ctx.lib.addLink(url, memo, p.get('title') ?? '');
    else if (text) n = await ctx.lib.create({ type: 'memo', body: text });
    else { ctx.go('#/add/photo?paste=1', { replace: true }); return; }
    toast(isInstagramUrl(url) ? '인스타 게시물을 넣었어요.' : '정리 대기에 넣었어요.');
    ctx.go(`#/n/${n.id}`, { replace: true });
  } catch (e) {
    ctx.el.innerHTML = `<div class="empty"><h3>카드를 만들지 못했어요</h3><p>${esc(e.message)}</p><a class="btn" href="#/">서랍장으로</a></div>`;
  }
}

async function readExport(files) {
  const lists = [];
  for (const file of files) {
    if (/\.zip$/i.test(file.name) || file.type === 'application/zip') {
      await loadScript(JSZIP);
      const zip = await window.JSZip.loadAsync(file);
      const entries = Object.values(zip.files).filter((f) => !f.dir && /saved/i.test(f.name) && /\.(json|html?)$/i.test(f.name));
      for (const e of entries) lists.push(parseInstagramFile(e.name, await e.async('string')));
    } else {
      lists.push(parseInstagramFile(file.name, await file.text()));
    }
  }
  return mergeSaved(lists);
}

export function importer(ctx) {
  ctx.top({ title: '인스타 저장함', back: '#/add' });
  ctx.el.classList.add('narrow');
  ctx.el.innerHTML = `
    <div class="page-head"><h1>인스타 저장함 가져오기</h1><p>비밀번호는 필요 없어요. 인스타가 주는 내 정보 파일을 올리면 저장한 게시물과 릴스가 카드가 돼요.</p></div>
    <ol class="steps">
      <li><span>인스타그램 앱에서 <b>설정 및 활동 → 계정 센터 → 내 정보 및 권한 → 내 정보 다운로드</b>로 가요.</span></li>
      <li><span><b>일부 정보</b>를 고르고 <b>저장됨</b>만 체크해요. 형식은 <b>JSON</b>, 기간은 <b>전체 기간</b>으로 해요.</span></li>
      <li><span>준비됐다는 알림이 오면 파일(zip)을 받아 아래에 올려요. 보통 몇 분에서 하루 걸려요.</span></li>
    </ol>
    <label class="drop" id="drop">${icon('upload')}<b>받은 zip 파일을 고르세요</b><span>압축을 푼 saved_posts.json, saved_collections.json도 돼요.</span>
      <input type="file" accept=".zip,.json,.html,application/zip,application/json,text/html" multiple class="sr" id="file"></label>
    <div id="result"></div>`;
  const result = ctx.el.querySelector('#result');
  ctx.el.querySelector('#file').onchange = async (e) => {
    const files = [...e.target.files];
    if (!files.length) return;
    result.innerHTML = '<p class="hint">파일을 읽는 중</p>';
    let items;
    try { items = await readExport(files); } catch (err) { result.innerHTML = `<div class="banner"><p>${esc(err.message)}</p></div>`; return; }
    if (!items.length) {
      result.innerHTML = '<div class="banner"><p>저장한 게시물을 찾지 못했어요. "저장됨" 항목을 JSON 형식으로 받았는지 확인해 주세요.</p></div>';
      return;
    }
    const reels = items.filter((i) => i.kind === 'reel').length;
    const cols = new Set(items.map((i) => i.collection).filter(Boolean));
    result.innerHTML = `
      <div class="stat-row"><div><b>${items.length}</b><span>저장한 게시물</span></div><div><b>${reels}</b><span>릴스</span></div><div><b>${cols.size}</b><span>컬렉션</span></div></div>
      ${cols.size ? `<p class="hint">컬렉션: ${esc([...cols].slice(0, 12).join(', '))}${cols.size > 12 ? ' 외' : ''}</p>` : ''}
      <div class="note-box">카드는 바로 만들어지고, 분류는 Claude가 <b>하루에 정해진 양씩 나눠서</b> 해요. 캡션과 계정 이름만 읽어서 구독 사용량을 아껴요.</div>
      <button class="btn primary wide" id="go">${items.length}장 카드로 만들기</button>
      <div class="progress" hidden><i></i></div><p class="hint" id="st"></p>`;
    const go = result.querySelector('#go');
    const bar = result.querySelector('.progress');
    const st = result.querySelector('#st');
    go.onclick = async () => {
      go.disabled = true;
      bar.hidden = false;
      try {
        const r = await ctx.lib.importInstagram(items, (d, t) => { bar.firstElementChild.style.width = `${(d / t) * 100}%`; st.textContent = `${d}/${t}장 만드는 중`; });
        st.textContent = `${r.made}장을 새로 넣었어요.${r.skipped ? ` 이미 있던 ${r.skipped}장은 건너뛰었어요.` : ''}`;
        toast(`인스타 카드 ${r.made}장을 넣었어요.`);
        go.textContent = '정리 대기 보기';
        go.disabled = false;
        go.onclick = () => ctx.go('#/inbox');
      } catch (err) { st.textContent = `멈췄어요: ${err.message} 다시 올리면 이어서 만들어요.`; go.disabled = false; }
    };
  };
}
