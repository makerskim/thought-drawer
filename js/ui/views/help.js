// 사용법: 넣기, / 명령어, # 태그와 @ 서랍, 자동 분류, 필터, 편집기, 단축키를 한 장에.
import { html } from '../h.js';
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

function Card({ id, icon, title, children }) {
  return html`<section class="help-card" id=${id}><h2><span class="hc-ic"><${Icon} name=${icon} /></span>${title}</h2>${children}</section>`;
}

export function Help() {
  const lib = useLib();
  return html`<div class="help-page">
    <${PageBar} title="사용법" />
    <div class="page-hero"><h1>사용법.</h1><p>넣기, 명령어, 자동 분류, 필터.</p>
      <div class="row-ctl" style="margin-top:16px"><button type="button" class="btn" onClick=${() => { location.hash = '#/'; setTimeout(openTutorial, 200); }}><${Icon} name="help" />화면 안내 다시 보기</button><a class="btn btn-ghost" href="#/settings?s=keywords"><${Icon} name="gear" />키워드 설정</a></div>
    </div>
    <div class="help-grid">
      <${Card} id="h-input" icon="plus" title="넣기">
        <ul class="help-list">
          <li>적고 <${Keys} keys="Enter" />. 줄바꿈은 <${Keys} keys="Shift Enter" />.</li>
          <li>여러 줄이면 첫 줄이 제목.</li>
          <li>링크·사진은 붙여 넣거나 끌어다 놓기.</li>
          <li>칸 왼쪽 <b>+</b>: 사진, 붙여넣기, 북마크·인스타 가져오기, 다른 앱에서 넣기.</li>
        </ul>
      </${Card}>
      <${Card} id="h-slash" icon="slash" title="/ 명령어">
        <p class="help-p">넣는 칸, 가운데 입력창, 노트 편집기에서 <code>/</code> 다음에 낱말. ↑↓로 고르고 <${Keys} keys="Enter" />.</p>
        <${CommandTable} lib=${lib} />
        <p class="help-p muted">내 키워드에 쓸 수 있는 값: ${VARS.map(([v, l]) => html`<code key=${v}>${v}</code> ${l} `)}</p>
      </${Card}>
      <${Card} id="h-tokens" icon="tag" title="# 태그 · @ 서랍">
        <ul class="help-list">
          <li><code>#가전</code> 태그를 직접 답니다. <code>#</code>만 치면 쓰던 태그 목록.</li>
          <li><code>@쇼핑/가전</code> 그 서랍에 바로 넣습니다. <code>@</code>만 치면 서랍 목록.</li>
          <li>예: <code>가습기 비교 #가전 @쇼핑</code> → 「쇼핑」 서랍, 태그 가전.</li>
        </ul>
      </${Card}>
      <${Card} id="h-classify" icon="sparkle" title="자동 분류">
        <ol class="help-list">
          <li><b>내 분류 규칙</b> (설정에서 만든 것)</li>
          <li><b>사이트</b>: 쿠팡 → 쇼핑, 유튜브 → 영상</li>
          <li><b>낱말</b>: 레시피 → 요리·맛집 › 레시피</li>
          <li><b>배운 것</b>: 직접 옮긴 노트와 비슷하면 그 서랍</li>
        </ol>
        <p class="help-p">서랍 › 세부 서랍까지 나누고 태그도 답니다. 드라이브 폴더는 노트에서 서랍을 바꿀 때 옮깁니다.</p>
        <details class="help-tree"><summary>기본 서랍 ${CATEGORIES.length}개 · 세부 서랍 ${CATEGORIES.reduce((s, c) => s + c.subs.length, 0)}개</summary>
          <ul>${CATEGORIES.map((c) => html`<li key=${c.name}><b>${c.name}</b> ${c.subs.map((x) => x.name).join(' · ')}</li>`)}</ul>
        </details>
      </${Card}>
      <${Card} id="h-filter" icon="filter" title="필터">
        <p class="help-p">모든 노트, 서랍, 태그, 찾기 화면 위에 있습니다.</p>
        <ul class="help-list">
          <li><b>날짜</b>: ${DATES.map(([, l]) => l).join(', ')} (넣은 날·고친 날)</li>
          <li><b>종류</b>: 메모, 링크, 사진, 인스타</li>
          <li><b>서랍</b> › 세부 서랍, <b>태그</b>(여러 개), <b>사이트</b></li>
          <li><b>조건</b>: ${HAS.map(([, l]) => l).join(', ')}</li>
        </ul>
        <p class="help-p muted">고른 필터는 주소에 남습니다.</p>
      </${Card}>
      <${Card} id="h-editor" icon="pen" title="노트 편집기">
        <ul class="help-list">
          <li><code>/</code> 제목, 목록, 할 일, 인용, 코드, 사진, 날짜, 내 키워드</li>
          <li><code>[[</code> 다른 노트 잇기</li>
          <li><code># </code> 제목, <code>- </code> 목록, <code>[] </code> 할 일, <code>${'> '}</code> 인용</li>
          <li>글자를 고르면 서식 막대</li>
        </ul>
      </${Card}>
      <${Card} id="h-keys" icon="enter" title="단축키">
        <dl class="help-keys">${SHORTCUTS.map(([k, l]) => html`<div key=${k}><dt><${Keys} keys=${k} /></dt><dd>${l}</dd></div>`)}</dl>
      </${Card}>
      <${Card} id="h-more" icon="phone" title="다른 앱에서 넣기">
        <p class="help-p">휴대폰 앱은 링크 복사 후 붙여넣기. 브라우저 단추, 크롬 확장, 아이폰 단축어도 됩니다.</p>
        <a class="btn" href="#/connect"><${Icon} name="phone" />넣는 방법 보기</a>
      </${Card}>
    </div>
    <${Footer} />
  </div>`;
}
