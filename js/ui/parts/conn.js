// 드라이브 연결 문제를 원인별로 알려 주고, 바로 고칠 수 있는 버튼을 준다
import { html, useState } from '../h.js';
import { Icon } from '../icons.js';
import { toast } from '../state.js';

const COPY = {
  auth: {
    title: '구글 연결을 다시 받아야 해요',
    text: '구글 연결은 한 시간마다 새로 받습니다. 보통은 저절로 이어지는데, 구글 로그인이 풀렸거나 창이 막히면 한 번 눌러 주세요.',
  },
  scope: {
    title: '드라이브 권한이 허용되지 않았어요',
    text: '구글 동의 화면에서 "Google Drive 파일 보기, 수정, 생성, 삭제" 항목을 체크해야 노트를 저장할 수 있어요. 아래 버튼을 눌러 다시 허용해 주세요.',
  },
  api_disabled: {
    title: 'Google Drive API가 꺼져 있어요',
    text: '구글 클라우드 프로젝트에서 Drive API를 한 번 켜야 해요. 아래 버튼으로 들어가 "사용"을 누르고, 1~2분 뒤 다시 시도해 주세요.',
  },
  network: {
    title: '인터넷에 연결되지 않았어요',
    text: '지금은 이 기기에 저장해 둔 사본을 보여 줘요. 연결되면 다시 시도해 주세요.',
  },
  rate: {
    title: '드라이브가 잠시 바빠요',
    text: '조금 뒤에 다시 시도해 주세요.',
  },
};

export function ConnBanner({ conn, onRetry, onReconnect, clientId }) {
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const copy = COPY[conn.code] ?? { title: '드라이브에 연결하지 못했어요', text: conn.message };
  const project = conn.project || String(clientId ?? '').split('-')[0];
  const run = async (fn) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  return html`<div class="conn" role="alert">
    <${Icon} name=${conn.code === 'network' ? 'cloudOff' : 'alert'} />
    <div class="conn-body">
      <b>${copy.title}</b>
      <p>${copy.text}</p>
      <div class="conn-actions">
        ${conn.code === 'auth' && html`<button type="button" class="btn btn-primary" disabled=${busy} onClick=${() => run(() => onReconnect())}>다시 연결</button>`}
        ${conn.code === 'scope' && html`<button type="button" class="btn btn-primary" disabled=${busy} onClick=${() => run(() => onReconnect({ consent: true }))}>드라이브 권한 다시 허용</button>`}
        ${conn.code === 'api_disabled' && html`<a class="btn btn-primary" target="_blank" rel="noopener" href=${`https://console.cloud.google.com/apis/library/drive.googleapis.com${project ? `?project=${project}` : ''}`}><${Icon} name="external" />Drive API 켜러 가기</a>`}
        ${conn.code !== 'auth' && conn.code !== 'scope' && html`<button type="button" class="btn" disabled=${busy} onClick=${() => run(onRetry)}><${Icon} name="refresh" />${busy ? '맞추는 중' : '다시 시도'}</button>`}
        ${conn.detail && html`<button type="button" class="btn btn-ghost" aria-expanded=${more} onClick=${() => setMore(!more)}>자세히</button>`}
      </div>
      ${more && html`<div class="conn-detail"><code>${conn.detail}</code>
        <button type="button" class="btn btn-ghost" onClick=${async () => { try { await navigator.clipboard.writeText(conn.detail); toast('오류 내용을 복사했어요.'); } catch { toast('복사하지 못했어요.'); } }}><${Icon} name="copy" />복사</button></div>`}
    </div>
  </div>`;
}
