// 보고 있는 페이지에서 제목, 주소, 고른 글, 설명을 읽는다 (activeTab 권한: 아이콘이나 메뉴를 누른 탭만)

function pageInfo() {
  const meta = (sel) => document.querySelector(sel)?.getAttribute('content')?.trim() || '';
  const sel = String(getSelection?.() ?? '').replace(/\n{3,}/g, '\n\n').trim();
  return {
    url: location.href,
    title: meta('meta[property="og:title"]') || document.title || '',
    description: meta('meta[name="description"]') || meta('meta[property="og:description"]'),
    image: meta('meta[property="og:image"]'),
    selection: sel.slice(0, 5000),
  };
}

export async function readPage(tabId) {
  if (tabId == null) return null;
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: pageInfo });
  return res?.result ?? null;
}

// 크롬 설정, 웹 스토어 같은 곳은 확장 프로그램이 읽을 수 없다
export const canRead = (url) => /^https?:|^file:/.test(url ?? '') && !/^https:\/\/chromewebstore\.google\.com|^https:\/\/chrome\.google\.com\/webstore/.test(url);
