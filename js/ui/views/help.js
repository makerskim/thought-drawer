// 사용법: 처음 시작부터 넣기, 가져오기, 자동 분류, 명령어, 찾기, 노트, 계정, 설정, 단축키, 자주 묻는 질문, 도움말까지.
// 옆 메뉴의 「사용법」(설정 아래)으로 연다. 왼쪽 목차(폰은 위쪽 칩)를 누르면 그 장으로 간다.
import { html, useEffect } from '../h.js';
import { Icon } from '../icons.js';
import { useLib } from '../state.js';
import { PageBar, Footer } from '../parts/shell.js';
import { openTutorial } from '../parts/tutorial.js';
import { BUILTINS, VARS } from '../../core/slash.js';
import { CATEGORIES } from '../../core/classify.js';
import { DATES, HAS } from '../../core/filter.js';
import { settingsOf } from '../categories.js';
import { modKey } from '../format.js';

export const SHORTCUTS = [
  ['Enter', '넣는 칸으로 (다른 화면에서는 가운데 입력창)'],
  ['Shift Enter', '줄바꿈'],
  [`${modKey} Enter`, '넣고 바로 열기'],
  ['/', '찾기·빠른 실행 (입력칸 안에서는 명령어)'],
  [`${modKey} K`, '찾기·빠른 실행'],
  ['T', '오늘 노트'],
  ['N', '새 노트'],
  ['J / K', '다음·이전 노트'],
  [`${modKey} S`, '바로 저장'],
  ['Esc', '닫기'],
];

export function Keys({ keys }) {
  return html`<span class="keys">${keys.split(' ').map((k) => html`<kbd key=${k}>${k}</kbd>`)}</span>`;
}

export function CommandTable({ lib }) {
  const mine = settingsOf(lib).keywords;
  return html`<table class="help-table">
    <thead><tr><th>입력</th><th>하는 일</th></tr></thead>
    <tbody>
      ${mine.map((k) => html`<tr key=${`m:${k.key}`}><td><code>/${k.key}</code></td><td>${k.text.split('\n')[0] || k.text}<span class="mine-badge">내 키워드</span></td></tr>`)}
      ${BUILTINS.map((b) => html`<tr key=${b.key}><td><code>/${b.key}</code></td><td>${b.label}${b.desc ? html` <span class="muted">· ${b.desc}</span>` : ''}</td></tr>`)}
    </tbody>
  </table>`;
}

const CHAPTERS = [
  ['start', 'sparkle', '시작하기'],
  ['input', 'plus', '넣기'],
  ['import', 'download', '가져오기'],
  ['classify', 'drawer', '자동 분류'],
  ['slash', 'slash', '/ 명령어'],
  ['tokens', 'tag', '# 태그 · @ 서랍'],
  ['find', 'filter', '찾기와 필터'],
  ['note', 'pen', '노트 쓰기'],
  ['tasks', 'check', '할 일 · 오늘 노트'],
  ['account', 'gear', '계정과 설정'],
  ['keys', 'enter', '단축키'],
  ['faq', 'help', '자주 묻는 질문'],
  ['more', 'external', '도움말'],
];

function Chapter({ id, n, children }) {
  const [, icon, title] = CHAPTERS.find(([k]) => k === id);
  return html`<section class="man-sec" id=${`m-${id}`}>
    <h2><span class="hc-ic"><${Icon} name=${icon} /></span><span class="man-n">${n}</span>${title}</h2>
    ${children}
  </section>`;
}

export function Help({ params }) {
  const lib = useLib();
  const go = (id) => document.getElementById(`m-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  useEffect(() => { const s = params?.get('s'); if (s) setTimeout(() => go(s), 80); }, [params?.get('s')]);
  return html`<div class="help-page">
    <${PageBar} title="사용법" />
    <div class="page-hero"><h1>사용법.</h1><p>처음부터 하나씩.</p>
      <div class="row-ctl" style="margin-top:16px"><button type="button" class="btn" onClick=${() => { location.hash = '#/'; setTimeout(openTutorial, 200); }}><${Icon} name="help" />화면 안내 다시 보기</button></div>
    </div>
    <div class="manual">
      <nav class="man-toc" aria-label="목차">${CHAPTERS.map(([id, , title], i) => html`<button type="button" key=${id} onClick=${() => go(id)}><span>${i + 1}</span>${title}</button>`)}</nav>
      <div class="man-body">
        <${Chapter} id="start" n="1">
          <ol class="help-list">
            <li><b>구글로 계속하기</b>를 누릅니다. 노트는 내 구글 드라이브 「메모」 폴더에 저장됩니다.</li>
            <li>휴대폰은 홈 화면에 추가하면 앱처럼 열립니다. 아이폰: 사파리 공유 → 홈 화면에 추가. 안드로이드: 메뉴 → 앱 설치.</li>
            <li>처음 한 번 화면 안내가 나옵니다. 위의 「화면 안내 다시 보기」로 언제든 다시 봅니다.</li>
          </ol>
        </${Chapter}>
        <${Chapter} id="input" n="2">
          <ul class="help-list">
            <li>첫 화면 가운데 칸에 적고 <${Keys} keys="Enter" />. 줄바꿈은 <${Keys} keys="Shift Enter" />.</li>
            <li>여러 줄이면 첫 줄이 제목이 됩니다.</li>
            <li>링크·사진·스크린샷은 붙여 넣거나 끌어다 놓습니다.</li>
            <li>칸 왼쪽 <b>+</b>: 사진·스크린샷, 붙여넣기, 북마크·인스타 가져오기, 다른 앱에서 넣기.</li>
            <li>다른 화면에서는 <${Keys} keys="Enter" />나 옆 메뉴의 「넣기」로 가운데 입력창이 뜹니다.</li>
          </ul>
        </${Chapter}>
        <${Chapter} id="import" n="3">
          <ul class="help-list">
            <li><b>휴대폰 앱</b>(인스타, 유튜브, 쇼핑 앱): 공유 → 링크 복사 → 이 앱에서 붙여넣기. 아이폰은 단축어로 공유 목록에서 바로.</li>
            <li><b>웹사이트</b>: 브라우저 북마크바의 「Thought Drawer에 넣기」 단추, 또는 PC 크롬 확장 프로그램.</li>
            <li><b>북마크</b>: 크롬·사파리·엣지·파이어폭스의 북마크 파일을 올리면 링크마다 노트가 됩니다.</li>
            <li><b>인스타 저장</b>: 인스타 「내 정보 다운로드」 파일을 올리면 저장한 게시물이 한 번에 들어옵니다.</li>
          </ul>
          <div class="row-ctl man-links"><a class="btn" href="#/connect"><${Icon} name="phone" />다른 앱·사이트</a><a class="btn btn-ghost" href="#/bookmarks"><${Icon} name="star" />북마크</a><a class="btn btn-ghost" href="#/import"><${Icon} name="instagram" />인스타 저장</a></div>
        </${Chapter}>
        <${Chapter} id="classify" n="4">
          <p class="help-p">넣는 즉시 <b>서랍 › 세부 서랍</b>과 <b>태그</b>를 정합니다. 기기 안에서 계산해서 비용이 없습니다.</p>
          <ol class="help-list">
            <li><b>내 분류 규칙</b>: 설정에서 만든 것이 가장 먼저.</li>
            <li><b>사이트</b>: 쿠팡 → 쇼핑, 아고다 → 여행 › 숙소.</li>
            <li><b>낱말</b>: 레시피 → 요리·맛집 › 레시피.</li>
            <li><b>배운 것</b>: 직접 옮긴 노트와 비슷하면 그 서랍.</li>
          </ol>
          <p class="help-p">서랍이 틀리면 노트를 열어 「서랍」을 바꾸세요. 그때 드라이브 폴더로 옮기고, 다음부터 더 잘 맞습니다.</p>
          <details class="help-tree"><summary>기본 서랍 ${CATEGORIES.length}개 · 세부 서랍 ${CATEGORIES.reduce((s, c) => s + c.subs.length, 0)}개</summary>
            <ul>${CATEGORIES.map((c) => html`<li key=${c.name}><b>${c.name}</b> ${c.subs.map((x) => x.name).join(' · ')}</li>`)}</ul>
          </details>
          <div class="row-ctl man-links"><a class="btn btn-ghost" href="#/settings?s=rules"><${Icon} name="gear" />분류 규칙 만들기</a></div>
        </${Chapter}>
        <${Chapter} id="slash" n="5">
          <p class="help-p">넣는 칸, 가운데 입력창, 노트에서 <code>/</code> 다음에 낱말. ↑↓로 고르고 <${Keys} keys="Enter" />.</p>
          <${CommandTable} lib=${lib} />
          <p class="help-p muted">내 키워드에 쓸 수 있는 값: ${VARS.map(([v, l]) => html`<code key=${v}>${v}</code> ${l} `)}</p>
          <div class="row-ctl man-links"><a class="btn btn-ghost" href="#/settings?s=keywords"><${Icon} name="gear" />내 명령어 만들기</a></div>
        </${Chapter}>
        <${Chapter} id="tokens" n="6">
          <ul class="help-list">
            <li><code>#가전</code> 태그를 직접 답니다. <code>#</code>만 치면 쓰던 태그 목록.</li>
            <li><code>@쇼핑/가전</code> 그 서랍에 바로 넣습니다. <code>@</code>만 치면 서랍 목록.</li>
            <li>예: <code>가습기 비교 #가전 @쇼핑</code> → 「쇼핑」 서랍, 태그 가전.</li>
          </ul>
        </${Chapter}>
        <${Chapter} id="find" n="7">
          <ul class="help-list">
            <li>위쪽 돋보기, <${Keys} keys="/" /> 또는 <${Keys} keys=${`${modKey} K`} />: 노트 찾기와 빠른 실행.</li>
            <li>옆 메뉴 「모든 노트·필터」, 서랍·태그·찾기 화면 위에 필터 막대가 있습니다.</li>
            <li><b>날짜</b>: ${DATES.map(([, l]) => l).join(', ')} (넣은 날·고친 날)</li>
            <li><b>종류</b>, <b>서랍</b> › 세부 서랍, <b>태그</b>(여러 개), <b>사이트</b></li>
            <li><b>조건</b>: ${HAS.map(([, l]) => l).join(', ')}</li>
          </ul>
        </${Chapter}>
        <${Chapter} id="note" n="8">
          <ul class="help-list">
            <li><code>/</code> 제목, 목록, 할 일, 인용, 코드, 사진, 날짜, 내 키워드.</li>
            <li><code>[[</code> 다른 노트 잇기. 오른쪽에 연결·목차·그래프.</li>
            <li><code># </code> 제목, <code>- </code> 목록, <code>[] </code> 할 일, <code>${'> '}</code> 인용.</li>
            <li>글자를 고르면 서식 막대. <${Keys} keys="J / K" />로 다음·이전 노트.</li>
          </ul>
        </${Chapter}>
        <${Chapter} id="tasks" n="9">
          <ul class="help-list">
            <li>노트에 <code>- [ ]</code>로 적으면 「할 일」 화면에 모입니다. 거기서 바로 체크.</li>
            <li><${Keys} keys="T" /> 또는 옆 메뉴 「오늘 노트」: 날짜별 노트를 하루에 하나.</li>
            <li>「생각 지도」: 노트 사이의 연결을 한눈에.</li>
          </ul>
        </${Chapter}>
        <${Chapter} id="account" n="10">
          <ul class="help-list">
            <li>오른쪽 위 사진: 연결 상태, 저장 공간, 메모 폴더 열기, 동기화, 로그아웃.</li>
            <li>옆 메뉴 「설정」: 화면, 입력, 자동 분류, 분류 규칙, 내 명령어, 데이터, Claude 자동 정리.</li>
            <li>옆 메뉴는 핀으로 왼쪽·오른쪽에 고정할 수 있습니다.</li>
          </ul>
        </${Chapter}>
        <${Chapter} id="keys" n="11">
          <dl class="help-keys">${SHORTCUTS.map(([k, l]) => html`<div key=${k}><dt><${Keys} keys=${k} /></dt><dd>${l}</dd></div>`)}</dl>
        </${Chapter}>
        <${Chapter} id="faq" n="12">
          <dl class="man-faq">
            <div><dt>비용이 드나요?</dt><dd>아니요. 분류는 기기 안에서 하고, 저장은 내 구글 드라이브 무료 공간을 씁니다.</dd></div>
            <div><dt>구글 연결이 끊겼다고 나와요.</dt><dd>구글 연결은 한 시간마다 새로 받습니다. 보통은 저절로 이어지고, 안 되면 「다시 연결」을 한 번 누르세요.</dd></div>
            <div><dt>노트는 어디에 있나요?</dt><dd>구글 드라이브 「메모」 폴더에 마크다운 파일로. 옵시디언에서 그 폴더를 열어도 됩니다.</dd></div>
            <div><dt>폰과 PC에서 같이 쓰나요?</dt><dd>네. 같은 구글 계정으로 로그인하면 같은 노트, 같은 규칙·키워드가 보입니다.</dd></div>
          </dl>
        </${Chapter}>
        <${Chapter} id="more" n="13">
          <ul class="help-list">
            <li><a href="privacy.html">개인정보처리방침</a>: 어떤 정보를 쓰고, 어디에 저장하는지.</li>
            <li><a href="terms.html">서비스 약관</a></li>
            <li>궁금한 점이나 고칠 점: <a href="https://github.com/makerskim/thought-drawer/issues" target="_blank" rel="noopener">문의 게시판</a></li>
          </ul>
        </${Chapter}>
      </div>
    </div>
    <${Footer} />
  </div>`;
}
export { Help as Manual };
