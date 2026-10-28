// Thought Drawer 시작점
import { html, render } from './ui/h.js';
import { App } from './ui/App.js';
import { applyAppearance } from './ui/state.js';
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

applyAppearance();
adoptShareQuery();
render(html`<${App} auth=${createAuth(GOOGLE_CLIENT_ID)} />`, document.getElementById('root'));

if ('serviceWorker' in navigator && location.protocol === 'https:' && window.self === window.top && !window.__TD_TEST__) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
