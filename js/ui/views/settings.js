// 설정과 시작 화면

import { esc, icon, toast, loadScript, JSZIP, idStamp } from '../dom.js';
import { convertForExport } from '../../core/export.js';
import { ATTACH_DIR } from '../../config.js';

const THEMES = [['', '기기 설정'], ['light', '밝게'], ['dark', '어둡게']];

export function applyTheme() {
  let t = '';
  try { t = localStorage.getItem('td.theme') || ''; } catch { /* 저장소 없음 */ }
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
}

export function welcome(ctx) {
  const can = ctx.auth.configured;
  ctx.el.innerHTML = `
    <div class="welcome"><div class="welcome-inner">
      <div class="stack" aria-hidden="true">
        <div class="card"><div class="card-head"><span class="card-type">인스타</span><span class="card-id">2026.10.03 12:00</span></div><div class="card-body"><h3 class="card-title">가을 레이어드 코디</h3><p class="card-text">흰 셔츠 위에 가디건, 그레이 스니커즈로 마무리</p></div></div>
        <div class="card"><div class="card-head"><span class="card-type">캡처</span><span class="card-id">2026.09.12 21:45</span></div><div class="card-body"><h3 class="card-title">흰색 옥스포드 셔츠</h3><p class="card-text">100 사이즈가 어깨에 맞음. 시즌오프 때 사기.</p></div><div class="card-foot"><span>패션 / 상의</span><span>#위시리스트</span></div></div>
      </div>
      <h1>생각서랍</h1>
      <p class="lead">메모, 캡처, 링크, 인스타 저장을 던져 넣으면 Claude가 서랍별로 정리해요. 내 구글 드라이브에 저장돼서 폰과 PC 어디서든 열려요.</p>
      <div class="actions">
        ${can ? `<button class="btn primary wide" id="google">${icon('drawer')}구글로 시작하기</button>` : ''}
        <button class="btn wide" id="demo">먼저 체험해 보기</button>
      </div>
      <p class="fine">${can
        ? '앱은 자기가 만든 파일에만 접근해요. 내 드라이브의 다른 파일은 볼 수 없어요.'
        : '구글 연결은 설정 가이드(docs/설정가이드.md)의 1~2단계를 마치면 켜져요. 체험 모드는 이 기기에만 저장돼요.'}</p>
    </div></div>`;
  ctx.el.querySelector('#demo').onclick = () => ctx.start('demo');
  const g = ctx.el.querySelector('#google');
  if (g) g.onclick = () => ctx.start('drive');
}

export function settings(ctx) {
  const { lib, auth } = ctx;
  ctx.top({ title: '설정', back: '#/' });
  ctx.el.classList.add('narrow');
  let theme = '';
  try { theme = localStorage.getItem('td.theme') || ''; } catch { /* 없음 */ }
  const p = auth.profile;
  const shareUrl = `${location.origin}${location.pathname}#/share?url=`;
  const idx = lib.index;
  ctx.el.innerHTML = `
    <div class="page-head"><h1>설정</h1></div>
    <div class="settings">
      <section><h2>계정</h2>
        ${ctx.mode === 'drive'
          ? `<div class="profile">${p?.picture ? `<img src="${esc(p.picture)}" alt="">` : ''}<div><b>${esc(p?.name ?? '')}</b><br><span class="hint">${esc(p?.email ?? '')}</span></div></div>
             <p>카드는 내 구글 드라이브의 「메모」 폴더에 저장돼요.</p>
             <div class="row"><button class="btn" id="out">로그아웃</button></div>`
          : `<p>지금은 체험 모드예요. 카드는 이 기기에만 있어요.</p>
             <div class="row">${auth.configured ? `<button class="btn primary" id="google">${icon('drawer')}구글로 연결하기</button>` : ''}<button class="btn" id="reset">예시 카드로 되돌리기</button><button class="btn ghost" id="leave">처음 화면으로</button></div>`}
      </section>
      <section><h2>화면</h2>
        <div class="chips">${THEMES.map(([v, l]) => `<button class="chip" data-theme="${v}" aria-pressed="${theme === v}">${l}</button>`).join('')}</div>
      </section>
      <section><h2>자동 정리</h2>
        <p>Claude Code 예약 작업이 하루 몇 번 「00_인박스」의 새 카드만 읽고, 제목, 요약, 태그를 붙여 서랍에 넣고 관련 카드끼리 이어 줘요. 지금 쓰는 Claude 구독으로 돌아서 추가 비용이 없어요.</p>
        <div class="stat-row"><div><b>${lib.inbox().length}</b><span>정리 대기</span></div><div><b>${lib.organized().length}</b><span>정리된 카드</span></div><div><b>${idx?.generatedAt ? esc(idStamp(idx.generatedAt.replace(/\D/g, '').slice(0, 14))) : '아직 없음'}</b><span>마지막 정리</span></div></div>
        ${ctx.mode === 'drive' ? `
        <div id="offline"></div>
        <form id="of" class="field" style="margin-top:6px">
          <span>정리기 연결 (처음 한 번)</span>
          <input class="input" name="secret" type="password" autocomplete="off" placeholder="구글 클라우드의 클라이언트 보안 비밀">
          <small>보안 비밀은 이 브라우저에서 구글로만 보내고 저장하지 않아요. 받은 토큰은 Claude Code 환경 설정에 넣어요. 순서는 docs/설정가이드.md 4단계에 있어요.</small>
          <div class="row" style="margin-top:6px"><button class="btn" type="submit">정리기용 토큰 받기</button></div>
        </form>` : '<p class="hint">자동 정리는 구글로 연결한 뒤에 켤 수 있어요.</p>'}
      </section>
      <section><h2>아이폰 「메모로 보내기」</h2>
        <p>단축어 앱에서 공유 시트용 단축어를 만들고, 마지막 동작의 주소를 아래 주소 + 공유한 내용으로 열게 하면 돼요. 자세한 순서는 docs/단축어.md에 있어요.</p>
        <div class="row"><input class="input" readonly value="${esc(shareUrl)}" id="su" style="flex:1 1 260px"><button class="btn" id="copy">${icon('copy')}복사</button></div>
        <p class="hint" style="margin-top:8px">홈 화면에 추가: 사파리에서 이 앱을 열고 공유 버튼 → 홈 화면에 추가.</p>
      </section>
      <section><h2>내보내기</h2>
        <p><b>옵시디언</b>: 구글 드라이브 데스크톱 앱으로 「메모」 폴더를 PC에 동기화하고, 옵시디언에서 그 폴더를 보관함으로 열면 그대로 보여요.</p>
        <p><b>노션</b>: 아래 zip을 받아 노션의 가져오기 → 마크다운에서 올려요. 링크와 사진 경로를 노션이 읽는 형식으로 바꿔서 담아요.</p>
        <div class="row"><button class="btn" id="zip">${icon('upload')}노션용 zip 받기</button></div>
        <div class="progress" hidden id="zp"><i></i></div>
      </section>
    </div>`;
  const $ = (s) => ctx.el.querySelector(s);
  const off = ctx.takeOffline?.();
  if (off && $('#offline')) {
    $('#offline').innerHTML = off.refreshToken
      ? `<div class="banner" style="border-left-color:var(--brass)"><p><b>정리기용 토큰을 받았어요.</b> 아래 값을 복사해서 Claude Code 환경 설정의 <b>TD_GOOGLE_REFRESH_TOKEN</b>에 넣으세요. 이 화면을 벗어나면 다시 볼 수 없어요. 채팅창에는 붙여 넣지 마세요.</p>
         <input class="input" readonly id="rt" value="${esc(off.refreshToken)}"><button class="btn small" id="rtc" type="button">${icon('copy')}복사</button></div>`
      : `<div class="banner"><p>${esc(off.error)}</p></div>`;
    $('#rtc')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(off.refreshToken); toast('토큰을 복사했어요.'); } catch { $('#rt').select(); } });
    $('#offline').scrollIntoView({ block: 'center' });
  }
  $('#of')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const secret = e.target.secret.value.trim();
    if (!secret) { toast('클라이언트 보안 비밀을 넣어 주세요.'); return; }
    auth.requestOfflineCode(secret);
  });
  $('#out')?.addEventListener('click', () => { auth.signOut(); ctx.start(null); });
  $('#google')?.addEventListener('click', () => ctx.start('drive'));
  $('#reset')?.addEventListener('click', async () => {
    if (!confirm('체험 카드를 모두 지우고 예시 카드로 되돌릴까요?')) return;
    await lib.adapter.reset(); await lib.load(); toast('예시 카드로 되돌렸어요.'); ctx.go('#/');
  });
  $('#leave')?.addEventListener('click', () => ctx.start(null));
  ctx.el.querySelectorAll('[data-theme]').forEach((b) => {
    b.onclick = () => {
      try { b.dataset.theme ? localStorage.setItem('td.theme', b.dataset.theme) : localStorage.removeItem('td.theme'); } catch { /* 없음 */ }
      applyTheme();
      ctx.el.querySelectorAll('[data-theme]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    };
  });
  $('#copy').onclick = async () => { try { await navigator.clipboard.writeText(shareUrl); toast('주소를 복사했어요.'); } catch { $('#su').select(); } };
  $('#zip').onclick = async () => {
    const bar = $('#zp');
    bar.hidden = false;
    try {
      await loadScript(JSZIP);
      const { notes, attachments } = await lib.exportFiles((d, t) => { bar.firstElementChild.style.width = `${(d / t) * 80}%`; });
      const zip = new window.JSZip();
      for (const f of convertForExport(notes, ATTACH_DIR)) zip.file(`메모/${f.path}`, f.text);
      let i = 0;
      for (const a of attachments) {
        try { zip.file(`메모/${ATTACH_DIR}/${a.name}`, await a.load()); } catch { /* 빠진 첨부는 건너뜀 */ }
        bar.firstElementChild.style.width = `${80 + (++i / Math.max(1, attachments.length)) * 20}%`;
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `생각서랍-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast(`카드 ${notes.length}장을 zip으로 담았어요.`);
    } catch (e) { toast(e.message); }
    bar.hidden = true;
  };
}
