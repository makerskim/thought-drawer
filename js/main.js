// Thought Drawer 시작점
import { html, render } from './ui/h.js';
import { App } from './ui/App.js';
import { syncFromLocation } from './ui/router.js';
import { app, applyAppearance, keepAppearance } from './ui/state.js';
import { createAuth } from './store/auth.js';
import { GOOGLE_CLIENT_ID } from './config.js';
import { shareTarget, SHARE_IMG, SHARE_IMG_LEN } from './core/shortcut.js';

// 아이폰 단축어 「사진 보내기」: #img=Base64 로 온 사진은 이 탭에 옮겨 두고, 긴 주소는 바로 지운다 (구글에 다녀와도 남게)
function adoptSharedImage(live = false) {
  if (!location.hash.startsWith('#img=')) return;
  try { sessionStorage.removeItem(SHARE_IMG); sessionStorage.setItem(SHARE_IMG_LEN, String(location.hash.length - 5)); sessionStorage.setItem(SHARE_IMG, location.hash.slice(5)); } catch { /* 너무 크면 받기 화면이 알려 준다 */ }
  const target = `${location.pathname}#/share?img=${Date.now().toString(36)}`;
  // 이미 열려 있던 탭이면(주소의 # 뒤만 바뀜) 화면도 받기 화면으로 옮긴다
  if (live) location.replace(target); else history.replaceState(null, '', target);
}
window.addEventListener('hashchange', () => adoptSharedImage(true));

// 단축어·공유가 ?text=... 처럼 쿼리로 열었을 때도 받기 화면으로 보낸다 (js/core/shortcut.js)
function adoptShareQuery() {
  const target = shareTarget(location.search, location.hash);
  if (!target) return;
  try { history.replaceState(null, '', location.pathname + target); } catch { location.hash = target; }
}

// 안드로이드 크롬의 "앱 설치" 제안을 받아 두었다가 버튼으로 띄운다
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  app.installPrompt = e;
  window.dispatchEvent(new Event('td-installable'));
});

applyAppearance();
keepAppearance();
adoptSharedImage();
adoptShareQuery();
syncFromLocation(); // 화면 고르기가 바뀐 주소(#/share…)를 바로 보게 (안 그러면 동기화가 끝날 때까지 첫 화면에 머문다)
render(html`<${App} auth=${createAuth(GOOGLE_CLIENT_ID)} />`, document.getElementById('root'));

if ('serviceWorker' in navigator && location.protocol === 'https:' && window.self === window.top && !window.__TD_TEST__) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
