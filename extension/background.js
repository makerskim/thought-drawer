// 백그라운드: 오른쪽 클릭 메뉴, 단축키, 저장과 구글 연결을 맡는다.
// 팝업은 창이 닫히면 하던 일이 멈추므로, 저장과 로그인은 모두 여기서 한다.

import { APP_URL } from './app/config.js';
import { AuthRequired } from './app/store/auth.js';
import * as auth from './ext/auth.js';
import { save } from './ext/save.js';
import { readPage } from './ext/page.js';

const MENUS = [
  { id: 'page', title: '이 페이지 넣기', contexts: ['page', 'frame'] },
  { id: 'selection', title: '고른 글 넣기', contexts: ['selection'] },
  { id: 'link', title: '이 링크 넣기', contexts: ['link'] },
  { id: 'image', title: '이 이미지 넣기 (글자 읽기)', contexts: ['image'] },
  { id: 'capture', title: '보이는 화면 캡처해서 넣기', contexts: ['page', 'frame'] },
];

chrome.runtime.onInstalled.addListener(({ reason }) => {
  chrome.contextMenus.removeAll(() => MENUS.forEach((m) => chrome.contextMenus.create(m)));
  if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?welcome=1') });
});

const noteUrl = (id) => `${APP_URL}#/n/${id}`;

async function remember(meta, kind) {
  const { td_recent: list = [] } = await chrome.storage.local.get('td_recent');
  const item = { id: meta.id, title: meta.title || '', kind, at: Date.now() };
  await chrome.storage.local.set({ td_recent: [item, ...list.filter((x) => x.id !== meta.id)].slice(0, 5) });
}

function badge(text, color) {
  chrome.action.setBadgeBackgroundColor({ color: color ?? '#5157d6' });
  chrome.action.setBadgeText({ text });
}

function notify(id, title, message) {
  chrome.notifications.create(id, { type: 'basic', iconUrl: 'icons/128.png', title, message, priority: 0 });
}

const LABEL = { memo: '메모', page: '페이지', image: '이미지', capture: '화면 캡처' };

// 팝업이 닫혀도 끝까지 저장하고, 결과는 배지와 알림으로 알린다
async function run(kind, data, { quiet = false } = {}) {
  badge('…');
  try {
    const meta = await save(kind, data, (step) => chrome.runtime.sendMessage({ type: 'progress', step }).catch(() => {}));
    await remember({ ...meta, title: meta.title || data.title || '' }, kind);
    badge('✓', '#2d855a');
    setTimeout(() => badge(''), 2500);
    if (!quiet) notify(`td:${meta.id}`, `${data.quote ? '고른 글' : LABEL[kind]}${data.quote ? '을' : '를'} 인박스에 넣었어요`, data.title || data.url || '눌러서 앱에서 보기');
    return { id: meta.id, url: noteUrl(meta.id) };
  } catch (e) {
    badge('!', '#cf3f36');
    setTimeout(() => badge(''), 5000);
    if (!quiet) {
      notify('td:error', '넣지 못했어요', e instanceof AuthRequired
        ? '확장 프로그램 아이콘을 눌러 구글 드라이브에 연결해 주세요.'
        : e.message);
    }
    throw e;
  }
}

async function capture(tab) {
  return chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 92 });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const page = { url: tab?.url ?? info.pageUrl, title: tab?.title ?? '' };
  try {
    if (info.menuItemId === 'page') await run('page', page);
    if (info.menuItemId === 'selection') {
      // 메뉴가 주는 글은 줄바꿈이 사라져 있어서, 되면 페이지에서 직접 읽는다
      const live = await readPage(tab?.id).catch(() => null);
      await run('page', { ...page, quote: live?.selection || info.selectionText || '' });
    }
    if (info.menuItemId === 'link') await run('page', { url: info.linkUrl, title: '', memo: page.url ? `찾은 곳: ${page.url}` : '' });
    if (info.menuItemId === 'image') await run('image', { ...page, image: info.srcUrl });
    if (info.menuItemId === 'capture') await run('capture', { ...page, image: await capture(tab) });
  } catch (e) {
    if (e instanceof AuthRequired) auth.signIn().catch(() => {});
  }
});

chrome.notifications.onClicked.addListener((id) => {
  chrome.notifications.clear(id);
  if (id.startsWith('td:') && id !== 'td:error') chrome.tabs.create({ url: noteUrl(id.slice(3)) });
  else chrome.action.openPopup?.().catch(() => {});
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'save-page' || !tab) return;
  run('page', { url: tab.url, title: tab.title }).catch(() => {});
});

const handlers = {
  status: () => auth.status(),
  async signin({ consent }) {
    const profile = await auth.signIn({ consent });
    // 구글 창이 뜨면 팝업이 닫히므로, 연결이 끝나면 다시 열어 준다
    chrome.action.openPopup?.().catch(() => {});
    return { profile };
  },
  signout: () => auth.signOut(),
  save: ({ kind, data }) => run(kind, data, { quiet: true }),
  recent: async () => (await chrome.storage.local.get('td_recent')).td_recent ?? [],
  redirect: () => ({ uri: auth.REDIRECT_URI }),
};

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const fn = handlers[msg?.type];
  if (!fn || sender.id !== chrome.runtime.id) return false;
  Promise.resolve(fn(msg)).then(
    (r) => reply({ ok: true, ...(Array.isArray(r) ? { list: r } : r) }),
    (e) => reply({ ok: false, error: e.message, code: e.code ?? (e instanceof AuthRequired ? 'auth_required' : 'other'), detail: e.detail ?? '' }),
  );
  return true;
});
