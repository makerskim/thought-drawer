// Thought Drawer 시작점
import { html, render } from './ui/h.js';
import { App } from './ui/App.js';
import { app, applyAppearance } from './ui/state.js';
import { createAuth } from './store/auth.js';
import { GOOGLE_CLIENT_ID } from './config.js';

// 단축어가 ?text=... 처럼 쿼리로 열었을 때도 받기 화면으로 보낸다
function adoptShareQuery() {
  const q = new URLSearchParams(location.search);
  if (q.get('state') === 'td-code') return; // 정리기 토큰 받기에서 돌아온 경우
  if (!q.has('url') && !q.has('text') && !q.has('paste')) return;
  const target = q.has('paste') ? '#/paste' : `#/share?${q}`;
  try { history.replaceState(null, '', location.pathname + target); } catch { location.hash = target; }
}

// 안드로이드 크롬의 "앱 설치" 제안을 받아 두었다가 버튼으로 띄운다
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  app.installPrompt = e;
  window.dispatchEvent(new Event('td-installable'));
});

applyAppearance();
adoptShareQuery();
render(html`<${App} auth=${createAuth(GOOGLE_CLIENT_ID)} />`, document.getElementById('root'));

if ('serviceWorker' in navigator && location.protocol === 'https:' && window.self === window.top && !window.__TD_TEST__) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
