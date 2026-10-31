// 넣는 방법: 휴대폰 앱(복사·붙여넣기, 공유), 웹사이트(브라우저 단추, 크롬 확장), 스크린샷·사진, 북마크·인스타 가져오기
import { html, useEffect, useRef, useState } from '../h.js';
import { Icon } from '../icons.js';
import { app, toast } from '../state.js';
import { PageBar } from '../parts/shell.js';
import { APP_URL, EXTENSION_ID, EXTENSION_ZIP } from '../../config.js';
import { isStandalone } from '../../store/auth.js';

const ua = navigator.userAgent;
const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/.test(ua);
const appUrl = () => (location.protocol.startsWith('http') && !location.hostname.match(/^(localhost|127\.)/) ? location.origin + location.pathname : APP_URL);

async function copy(text, what) {
  try { await navigator.clipboard.writeText(text); toast(`${what}을 복사했어요.`); } catch { toast('복사 실패. 길게 눌러 복사하세요.'); }
}

function QR({ text }) {
  const ref = useRef();
  useEffect(() => {
    import('../../vendor/editor.bundle.js').then(({ qrcode }) => {
      const q = qrcode(0, 'M');
      q.addData(text);
      q.make();
      if (ref.current) ref.current.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    }).catch(() => {});
  }, [text]);
  return html`<div class="qr" ref=${ref} role="img" aria-label="앱 주소 QR 코드"></div>`;
}

function Copyable({ value, label }) {
  return html`<div class="code-box"><input class="input mono" readonly value=${value} onFocus=${(e) => e.target.select()} aria-label=${label} />
    <button type="button" class="btn" onClick=${() => copy(value, label)}><${Icon} name="copy" />복사</button></div>`;
}

// 브라우저 단추(북마클릿): 어느 브라우저든 북마크바에 두고 누르면 보던 페이지(와 고른 글)가 들어간다
const bookmarklet = (url) => `javascript:(()=>{const e=encodeURIComponent,s=String(getSelection()).slice(0,2000);window.open('${url}#/share?via=browser&url='+e(location.href)+'&title='+e(document.title)+'&text='+e(s),'_blank')})();`;

const TABS = [['phone', '휴대폰 앱', 'phone'], ['web', '웹사이트', 'globe'], ['photo', '스크린샷·사진', 'capture'], ['import', '북마크·인스타', 'download']];

export function Connect() {
  const [canInstall, setCanInstall] = useState(!!app.installPrompt);
  const [tab, setTab] = useState(isIOS || isAndroid ? 'phone' : 'web');
  const url = appUrl();
  const redirect = `https://${EXTENSION_ID}.chromiumapp.org/`;
  const project = String(app.auth?.clientId ?? '').split('-')[0];
  useEffect(() => {
    const on = () => setCanInstall(!!app.installPrompt);
    window.addEventListener('td-installable', on);
    return () => window.removeEventListener('td-installable', on);
  }, []);
  const install = async () => {
    const p = app.installPrompt;
    if (!p) return;
    p.prompt();
    const r = await p.userChoice.catch(() => null);
    if (r?.outcome === 'accepted') toast('홈 화면에 설치했어요.');
    app.installPrompt = null;
    setCanInstall(false);
  };
  const bm = bookmarklet(url);
  const installCard = html`<section class="connect-card">
    <div class="cc-head"><${Icon} name="phone" /><div><h2>휴대폰에 설치하기</h2><p>홈 화면에 두면 앱처럼 열립니다.</p></div></div>
    ${isStandalone() ? html`<div class="banner"><${Icon} name="check" /><p>설치된 앱으로 사용 중</p></div>` : html`
      ${canInstall && html`<button type="button" class="btn btn-primary btn-lg" onClick=${install}><${Icon} name="download" />이 기기에 설치</button>`}
      ${!isIOS && !isAndroid && html`<div class="qr-row"><${QR} text=${url} /><div><b>폰 카메라로 찍어 열기</b><p class="muted">아이폰은 사파리, 안드로이드는 크롬.</p></div></div>`}`}
    <div class="two-col">
      <div><h3>아이폰</h3><ol class="steps">
        <li><span><b>사파리</b>로 <a href=${url}>앱 주소</a>를 열어요.</span></li>
        <li><span>아래 <b>공유 버튼</b> → <b>홈 화면에 추가</b>.</span></li>
        <li><span>홈 화면의 Thought Drawer를 열고 구글로 로그인해요.</span></li></ol></div>
      <div><h3>안드로이드</h3><ol class="steps">
        <li><span><b>크롬</b>으로 앱 주소를 열어요.</span></li>
        <li><span>⋮ 메뉴 → <b>앱 설치</b>(또는 홈 화면에 추가).</span></li>
        <li><span>설치하면 다른 앱의 <b>공유</b> 목록에 Thought Drawer가 생겨요.</span></li></ol></div>
    </div>
  </section>`;

  const panels = {
    phone: html`
      <section class="connect-card">
        <div class="cc-head"><${Icon} name="paste" /><div><h2>링크 복사 → 붙여넣기</h2><p>어느 앱이든, 설정 없이.</p></div></div>
        <ol class="steps">
          <li><span>앱에서 <b>공유</b> → <b>링크 복사</b>(또는 글을 길게 눌러 복사)를 눌러요.</span></li>
          <li><span>Thought Drawer를 열고 넣는 칸의 <b>+</b> → <b>붙여넣기</b>를 눌러요. 아이폰이 물으면 「붙여넣기 허용」.</span></li>
          <li><span><b>넣기</b>를 누르면 링크 노트가 되고, 사이트를 보고 서랍에 들어가요.</span></li>
        </ol>
      </section>
      <section class="connect-card">
        <div class="cc-head"><${Icon} name="external" /><div><h2>공유 버튼에서 바로 넣기</h2><p>공유 한 번으로.</p></div></div>
        <div class="two-col">
          <div><h3>안드로이드</h3><p class="small">위처럼 앱을 설치하면 공유 목록에 <b>Thought Drawer</b>가 바로 나와요. 고르면 끝.</p></div>
          <div><h3>아이폰</h3><p class="small">아이폰은 웹 앱이 공유 목록에 직접 들어가지 못해서, 단축어 「메모로 보내기」를 한 번 만들어 두면 공유 목록에서 바로 넣을 수 있어요. <a href="https://github.com/makerskim/thought-drawer/blob/main/docs/%EB%8B%A8%EC%B6%95%EC%96%B4.md" target="_blank" rel="noopener">만드는 순서 (3분)</a></p>
            <${Copyable} value=${`${url}?text=`} label="단축어 주소" /></div>
        </div>
      </section>
      ${installCard}`,
    web: html`
      <section class="connect-card">
        <div class="cc-head"><${Icon} name="globe" /><div><h2>브라우저 단추</h2><p>모든 브라우저. 보던 페이지를 클릭 한 번에.</p></div></div>
        <ol class="steps">
          <li><span>북마크바를 켜요 (크롬·엣지 Ctrl+Shift+B, 맥은 ⌘+Shift+B).</span></li>
          <li><span>아래 단추를 <b>북마크바로 끌어다 놓아요</b>.<span class="bm-row"><a class="btn bm-btn" href=${bm} onClick=${(e) => { e.preventDefault(); toast('북마크바로 끌어다 놓으세요.'); }}><${Icon} name="plus" />Thought Drawer에 넣기</a></span></span></li>
          <li><span>넣고 싶은 페이지에서 북마크바의 <b>Thought Drawer에 넣기</b>를 누르면 끝.</span></li>
        </ol>
        <details class="small"><summary>끌어다 놓기가 안 될 때 (아이폰 사파리 포함)</summary>
          <p class="muted">아무 페이지나 북마크로 추가한 뒤, 그 북마크를 편집해서 주소를 아래 코드로 바꿔요.</p>
          <${Copyable} value=${bm} label="브라우저 단추 코드" /></details>
      </section>
      <section class="connect-card">
        <div class="cc-head"><${Icon} name="puzzle" /><div><h2>크롬 확장 프로그램</h2><p>페이지, 선택한 글, 화면 캡처를 바로 저장. 단축키 Ctrl+Shift+Y.</p></div></div>
        <ol class="steps">
          <li><span><a class="btn btn-primary" href=${EXTENSION_ZIP} download><${Icon} name="download" />확장 프로그램 받기 (zip)</a></span></li>
          <li><span>받은 zip의 <b>압축을 풀어요</b>. 풀린 폴더는 지우지 말고 둬요.</span></li>
          <li><span>크롬 주소창에 붙여 넣어 확장 프로그램 화면을 열어요.<${Copyable} value="chrome://extensions" label="크롬 확장 프로그램 주소" /></span></li>
          <li><span>오른쪽 위 <b>개발자 모드</b>를 켜고 <b>압축해제된 확장 프로그램 로드</b>로 푼 폴더를 골라요.</span></li>
          <li><span>퍼즐 아이콘에서 Thought Drawer를 <b>고정</b>하고 한 번 눌러 구글로 연결해요.</span></li>
        </ol>
        <div class="note-box">
          <b>처음 한 번, 구글 클라우드 설정</b>
          <p>확장 프로그램이 같은 구글 로그인을 쓰도록, 구글 클라우드의 <b>클라이언트 → 웹 애플리케이션 → 승인된 리디렉션 URI</b>에 아래 주소를 추가해요.</p>
          <${Copyable} value=${redirect} label="리디렉션 주소" />
          <a class="btn btn-ghost" target="_blank" rel="noopener" href=${`https://console.cloud.google.com/auth/clients${project ? `?project=${project}` : ''}`}><${Icon} name="external" />구글 클라우드 클라이언트 열기</a>
        </div>
      </section>`,
    photo: html`
      <section class="connect-card">
        <div class="cc-head"><${Icon} name="capture" /><div><h2>스크린샷과 사진</h2><p>원본 저장, 사진 속 글자도 검색됩니다.</p></div></div>
        <div class="two-col">
          <div><h3>휴대폰</h3><ol class="steps">
            <li><span>맨 위 칸 아래 <b>사진·캡처</b>를 누르고 앨범에서 여러 장 골라요.</span></li>
            <li><span>또는 스크린샷을 찍고 미리보기 → <b>복사</b> 후, 앱에서 <b>붙여넣기</b>.</span></li></ol></div>
          <div><h3>PC</h3><ol class="steps">
            <li><span>캡처(Win+Shift+S, 맥 ⌘+Ctrl+Shift+4) 후 앱 아무 데서나 <b>Ctrl+V</b>.</span></li>
            <li><span>사진 파일은 화면에 <b>끌어다 놓기</b>. 크롬 확장은 보이는 화면을 바로 캡처해요.</span></li></ol></div>
        </div>
        <button type="button" class="btn btn-primary" onClick=${() => app.pickPhotos()}><${Icon} name="capture" />지금 사진 고르기</button>
      </section>`,
    import: html`
      <section class="connect-card">
        <div class="cc-head"><${Icon} name="star" /><div><h2>인터넷 북마크</h2><p>북마크 파일을 올리면 자동 분류됩니다.</p></div></div>
        <a class="btn btn-primary" href="#/bookmarks"><${Icon} name="upload" />북마크 가져오기</a>
      </section>
      <section class="connect-card">
        <div class="cc-head"><${Icon} name="instagram" /><div><h2>인스타 저장한 게시물</h2><p>「내 정보 다운로드」 파일로 한 번에.</p></div></div>
        <a class="btn btn-primary" href="#/import"><${Icon} name="upload" />인스타 가져오기</a>
      </section>`,
  };
  return html`
    <${PageBar} title="넣는 방법" />
    <div class="page narrow">
      <div class="page-head"><h1>어디서든 넣기</h1>
        <p>무엇을 넣을지 고르세요.</p></div>
      <div class="seg tabs-row" role="tablist" aria-label="넣을 것">${TABS.map(([k, label, icon]) => html`<button type="button" key=${k} role="tab" aria-selected=${tab === k} aria-pressed=${tab === k} onClick=${() => setTab(k)}><${Icon} name=${icon} />${label}</button>`)}</div>
      <div role="tabpanel">${panels[tab]}</div>
    </div>`;
}
