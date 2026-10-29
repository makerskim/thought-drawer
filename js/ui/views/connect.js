// 폰과 크롬에서 쓰기: 휴대폰 설치(QR, 아이폰, 안드로이드), 크롬 확장 프로그램
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
  try { await navigator.clipboard.writeText(text); toast(`${what}을 복사했어요.`); } catch { toast('복사하지 못했어요. 길게 눌러 복사해 주세요.'); }
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

export function Connect() {
  const [canInstall, setCanInstall] = useState(!!app.installPrompt);
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
  return html`
    <${PageBar} title="폰과 크롬에서 쓰기" />
    <div class="page narrow">
      <div class="page-head"><h1>어디서든 바로 넣기</h1>
        <p>폰에서는 앱처럼 설치하고 공유 버튼으로, PC에서는 크롬 확장 프로그램으로 보는 페이지를 바로 넣어요. 모두 같은 구글 드라이브에 저장돼서 어디서 봐도 같아요.</p></div>

      <section class="connect-card">
        <div class="cc-head"><${Icon} name="phone" /><div><h2>휴대폰</h2><p>홈 화면에 설치하면 앱처럼 열리고, 인터넷이 끊겨도 저장해 둔 노트를 볼 수 있어요.</p></div></div>
        ${isStandalone() ? html`<div class="banner"><${Icon} name="check" /><p>지금 설치된 앱으로 쓰고 있어요.</p></div>` : html`
          ${canInstall && html`<button type="button" class="btn btn-primary btn-lg" onClick=${install}><${Icon} name="download" />이 기기에 설치</button>`}
          ${!isIOS && !isAndroid && html`<div class="qr-row"><${QR} text=${url} /><div><b>폰 카메라로 찍어 열기</b><p class="muted">아이폰은 사파리, 안드로이드는 크롬에서 열려요. 열린 뒤 아래 순서대로 설치해요.</p></div></div>`}`}
        <div class="two-col">
          <div>
            <h3>아이폰</h3>
            <ol class="steps">
              <li><span><b>사파리</b>로 ${html`<a href=${url}>앱 주소</a>`}를 열어요.</span></li>
              <li><span>아래 가운데 <b>공유 버튼</b>을 누르고 <b>홈 화면에 추가</b>를 골라요.</span></li>
              <li><span>홈 화면의 Thought Drawer를 열고 구글로 로그인해요.</span></li>
            </ol>
            <p class="muted small">인스타·사진·사파리의 공유 버튼에서 바로 넣으려면 「메모로 보내기」 단축어를 만들어요. <a href="https://github.com/makerskim/thought-drawer/blob/main/docs/%EB%8B%A8%EC%B6%95%EC%96%B4.md" target="_blank" rel="noopener">만드는 순서</a></p>
            <${Copyable} value=${`${url}?text=`} label="단축어 주소" />
          </div>
          <div>
            <h3>안드로이드</h3>
            <ol class="steps">
              <li><span><b>크롬</b>으로 앱 주소를 열어요.</span></li>
              <li><span>오른쪽 위 <b>⋮ 메뉴</b>에서 <b>앱 설치</b>(또는 홈 화면에 추가)를 눌러요.</span></li>
              <li><span>설치하면 다른 앱의 <b>공유</b> 메뉴에 Thought Drawer가 나타나요. 인스타 게시물, 링크, 글을 바로 넣을 수 있어요.</span></li>
            </ol>
          </div>
        </div>
      </section>

      <section class="connect-card">
        <div class="cc-head"><${Icon} name="puzzle" /><div><h2>크롬 확장 프로그램</h2><p>보고 있는 페이지, 고른 글, 화면 캡처, 이미지를 버튼 하나나 오른쪽 클릭으로 인박스에 넣어요. 단축키는 Ctrl+Shift+Y (맥은 ⌘+Shift+Y)예요.</p></div></div>
        <ol class="steps">
          <li><span><a class="btn btn-primary" href=${EXTENSION_ZIP} download><${Icon} name="download" />확장 프로그램 받기 (zip)</a></span></li>
          <li><span>받은 zip의 <b>압축을 풀어요</b>. 풀린 폴더는 지우지 말고 둬요.</span></li>
          <li><span>크롬 주소창에 아래 주소를 붙여 넣어 확장 프로그램 화면을 열어요.<${Copyable} value="chrome://extensions" label="크롬 확장 프로그램 주소" /></span></li>
          <li><span>오른쪽 위 <b>개발자 모드</b>를 켜고, <b>압축해제된 확장 프로그램 로드</b>를 눌러 푼 폴더를 골라요.</span></li>
          <li><span>주소창 옆 퍼즐 모양 아이콘에서 Thought Drawer를 <b>고정</b>하고, 한 번 눌러 구글로 연결해요.</span></li>
        </ol>
        <div class="note-box">
          <b>처음 한 번, 구글 클라우드 설정</b>
          <p>확장 프로그램이 같은 구글 로그인을 쓰도록, 구글 클라우드의 <b>클라이언트 → 웹 애플리케이션 → 승인된 리디렉션 URI</b>에 아래 주소를 하나 더 추가하고 저장해요.</p>
          <${Copyable} value=${redirect} label="리디렉션 주소" />
          <a class="btn btn-ghost" target="_blank" rel="noopener" href=${`https://console.cloud.google.com/auth/clients${project ? `?project=${project}` : ''}`}><${Icon} name="external" />구글 클라우드 클라이언트 열기</a>
        </div>
      </section>
    </div>`;
}
