// 설정: 아이폰 설정처럼 묶음마다 한 줄씩 (이름 왼쪽, 조절 오른쪽, 설명은 이름 아래 작게).
// 화면 · 입력(이 기기에만) / 자동 분류 · 분류 규칙 · 내 명령어(모든 기기에 함께, 드라이브 _시스템/settings.json) / 데이터 / Claude 자동 정리.
// 계정은 오른쪽 위 사진, 단축키·기본 명령어·도움말은 「사용법」에 있다.
import { html, useState, useEffect, useLayoutEffect, useRef, cx } from '../h.js';
import { Icon } from '../icons.js';
import { app, useLib, usePref, applyAppearance, toast } from '../state.js';
import { PageBar, Footer } from '../parts/shell.js';
import { modal } from '../parts/layers.js';
import { ConfirmDialog } from '../parts/dialogs.js';
import { settingsOf, drawerTargets } from '../categories.js';
import { normalizeSettings } from '../../core/settings.js';
import { keyOk, fillVars } from '../../core/slash.js';
import { topOf } from '../../core/classify.js';
import { SORTS } from '../../core/filter.js';
import { preview, GuessLine } from '../parts/guess.js';
import { convertForExport } from '../../core/export.js';
import { ATTACH_DIR } from '../../config.js';
import { relTime } from '../format.js';
import { loadScript, JSZIP } from './more.js';

// ---------- 부품 ----------
function Group({ id, title, foot, children }) {
  return html`<section class="sg-sec" id=${id ? `s-${id}` : undefined}>
    <h2 class="sg-title">${title}</h2>
    <div class="sg">${children}</div>
    ${foot && html`<p class="sg-foot">${foot}</p>`}
  </section>`;
}
function Row({ label, desc, children, stack = false }) {
  return html`<div class=${cx('sg-row', stack && 'stack')}>
    <div class="sg-label"><b>${label}</b>${desc && html`<small>${desc}</small>`}</div>
    <div class="sg-ctl">${children}</div>
  </div>`;
}
const Toggle = ({ label, checked, onChange }) => html`<input type="checkbox" role="switch" class="switch" aria-label=${label} checked=${checked} onChange=${(e) => onChange(e.target.checked)} />`;
const Seg = ({ label, value, set, opts }) => html`<div class="seg" role="group" aria-label=${label}>${opts.map(([v, l]) => html`<button type="button" key=${String(v)} aria-pressed=${value === v} onClick=${() => { set(v); applyAppearance(); }}>${l}</button>`)}</div>`;
const Select = ({ label, value, set, opts }) => html`<select class="sg-select" aria-label=${label} value=${value} onChange=${(e) => set(e.target.value)}>${opts.map(([v, l]) => html`<option key=${v} value=${v}>${l}</option>`)}</select>`;

// 함께 쓰는 설정(드라이브) 저장
function useShared(lib) {
  const s = settingsOf(lib);
  const save = async (patch) => {
    try { await lib.saveSettings(normalizeSettings({ ...s, ...patch })); return true; } catch (e) { toast(e.message); return false; }
  };
  return [s, save];
}

// 서랍 고르기: 큰 서랍마다 묶어서 (작은 서랍은 「› 이름」)
function drawerOptions(lib) {
  const tree = new Map();
  for (const p of drawerTargets(lib)) {
    const top = topOf(p);
    if (!tree.has(top)) tree.set(top, []);
    if (p.includes('/')) tree.get(top).push(p);
  }
  return [...tree].sort((a, b) => a[0].localeCompare(b[0], 'ko'));
}

// ---------- 분류 규칙 창 ----------
function RuleDialog({ rule, close, onSave }) {
  const lib = useLib();
  const [match, setMatch] = useState(rule?.match ?? '');
  const [drawer, setDrawer] = useState(rule?.drawer ?? '');
  const [fresh, setFresh] = useState('');
  const [tags, setTags] = useState((rule?.tags ?? []).join(', '));
  const [err, setErr] = useState('');
  const first = useRef();
  useEffect(() => { first.current?.focus(); }, []);
  const opts = drawerOptions(lib);
  const known = opts.some(([top, subs]) => top === drawer || subs.includes(drawer));
  const to = drawer === '__new' ? fresh.trim().replace(/\s*[›>]\s*/g, '/') : drawer;
  const tagList = tags.split(/[,\s]+/).map((t) => t.replace(/^#/, '')).filter(Boolean);
  const word = match.split(',')[0].trim();
  const save = () => {
    if (!match.trim()) { setErr('낱말이나 사이트를 적어 주세요.'); first.current?.focus(); return; }
    if (!to && !tagList.length) { setErr('서랍이나 태그 중 하나는 정해 주세요.'); return; }
    onSave({ match: match.trim(), drawer: to, tags: tagList });
    close();
  };
  return html`<form class="modal sdlg" role="dialog" aria-label=${rule ? '규칙 고치기' : '규칙 추가'} onSubmit=${(e) => { e.preventDefault(); save(); }}>
    <h2>${rule ? '규칙 고치기' : '규칙 추가'}</h2>
    <label class="fld"><span>이 낱말이나 사이트가 나오면</span>
      <input ref=${first} class="input" value=${match} onInput=${(e) => { setMatch(e.target.value); setErr(''); }} placeholder="예: 다이슨, 가습기, musinsa.com" aria-label="낱말 또는 사이트" />
      <small>쉼표로 여러 개</small></label>
    <label class="fld"><span>이 서랍에 넣고</span>
      <select class="input" value=${known || drawer === '__new' || !drawer ? drawer : '__new'} onChange=${(e) => { setDrawer(e.target.value); setErr(''); }} aria-label="서랍">
        <option value="">서랍은 자동 분류대로</option>
        ${opts.map(([top, subs]) => html`<optgroup key=${top} label=${top}><option value=${top}>${top}</option>${subs.map((p) => html`<option key=${p} value=${p}>${top} › ${p.split('/')[1]}</option>`)}</optgroup>`)}
        <option value="__new">새 서랍 직접 적기…</option>
      </select></label>
    ${(drawer === '__new' || (drawer && !known)) && html`<label class="fld"><span>새 서랍 이름</span>
      <input class="input" value=${drawer === '__new' ? fresh : drawer} onInput=${(e) => { setDrawer('__new'); setFresh(e.target.value); }} placeholder="예: 쇼핑/가전 또는 캠핑" aria-label="새 서랍 이름" /><small>세부 서랍은 빗금(/)으로</small></label>`}
    <label class="fld"><span>이 태그를 단다 <em>선택</em></span>
      <input class="input" value=${tags} onInput=${(e) => { setTags(e.target.value); setErr(''); }} placeholder="예: 가전, 계절" aria-label="태그" /></label>
    <p class="sdlg-prev">${word
      ? html`<span>예</span>「${word} …」 → <b>${to ? to.replace('/', ' › ') : '자동 분류'}</b>${tagList.map((t) => html` <span class="cap-tag" key=${t}>#${t}</span>`)}`
      : html`<span>예</span>낱말을 적으면 미리 보여 줘요.`}</p>
    ${err && html`<p class="sdlg-err" role="alert">${err}</p>`}
    <div class="actions"><button type="button" class="btn btn-ghost" onClick=${close}>취소</button><button class="btn btn-primary">저장</button></div>
  </form>`;
}

// ---------- 내 명령어 창 ----------
const CHIPS = [['오늘 날짜', '{오늘}'], ['지금 시각', '{지금}'], ['요일', '{요일}'], ['할 일 줄', '\n- [ ] '], ['태그', '#'], ['서랍', '@']];
function KeywordDialog({ kw, taken, close, onSave }) {
  const [key, setKey] = useState(kw?.key ?? '');
  const [text, setText] = useState(kw?.text ?? '');
  const [err, setErr] = useState('');
  const keyRef = useRef();
  const area = useRef();
  const caret = useRef(null); // 끼워 넣은 뒤 커서 자리 (다시 그린 직후 바로 옮긴다)
  useEffect(() => { keyRef.current?.focus(); }, []);
  useLayoutEffect(() => {
    const el = area.current;
    if (caret.current == null || !el) return;
    el.focus();
    el.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  });
  const put = (s) => {
    const el = area.current;
    const a = el?.selectionStart ?? text.length;
    const b = el?.selectionEnd ?? text.length;
    const ins = s.startsWith('\n') && (a === 0 || text[a - 1] === '\n') ? s.slice(1) : s;
    caret.current = a + ins.length;
    setText(text.slice(0, a) + ins + text.slice(b));
    setErr('');
  };
  const save = () => {
    const k = key.trim().replace(/^\//, '');
    if (!keyOk(k)) { setErr('명령어 이름은 띄어쓰기 없이 16자까지 적어 주세요.'); keyRef.current?.focus(); return; }
    if (k !== kw?.key && taken.includes(k)) { setErr(`/${k} 은(는) 이미 있어요.`); return; }
    if (!text.trim()) { setErr('들어갈 글을 적어 주세요.'); area.current?.focus(); return; }
    onSave({ key: k, text });
    close();
  };
  return html`<form class="modal sdlg" role="dialog" aria-label=${kw ? '명령어 고치기' : '명령어 추가'} onSubmit=${(e) => { e.preventDefault(); save(); }}>
    <h2>${kw ? '명령어 고치기' : '명령어 추가'}</h2>
    <label class="fld"><span>입력창에 이렇게 치면</span>
      <div class="kw-key"><span>/</span><input ref=${keyRef} class="input" value=${key} onInput=${(e) => { setKey(e.target.value); setErr(''); }} placeholder="회의" aria-label="명령어 이름" /></div></label>
    <label class="fld"><span>이 글이 들어가요</span>
      <textarea ref=${area} class="input" rows="4" value=${text} onInput=${(e) => { setText(e.target.value); setErr(''); }} placeholder="예: 회의 {오늘}" aria-label="들어갈 글"></textarea></label>
    <div class="kw-chips" role="group" aria-label="끼워 넣기"><span>끼워 넣기</span>${CHIPS.map(([l, v]) => html`<button type="button" key=${l} class="chip" onMouseDown=${(e) => e.preventDefault()} onClick=${() => put(v)}>${l}</button>`)}</div>
    ${text.trim() && html`<div class="sdlg-prev col"><span>미리 보기</span><pre>${fillVars(text)}</pre></div>`}
    ${err && html`<p class="sdlg-err" role="alert">${err}</p>`}
    <div class="actions"><button type="button" class="btn btn-ghost" onClick=${close}>취소</button><button class="btn btn-primary">저장</button></div>
  </form>`;
}

function Rules() {
  const lib = useLib();
  const [s, save] = useShared(lib);
  const edit = (rule, i) => modal((close) => html`<${RuleDialog} rule=${rule} close=${close}
    onSave=${(r) => save({ rules: i == null ? [...s.rules.filter((x) => x.match !== r.match), r] : s.rules.map((x, j) => (j === i ? r : x)) }).then((ok) => ok && toast('규칙을 저장했어요'))} />`);
  return html`
    ${s.rules.length
      ? s.rules.map((r, i) => html`<div class="sg-row item-row" key=${`${r.match}:${i}`}>
          <div class="item-main"><span class="rl-match">${r.match}</span><${Icon} name="chevron" /><span class="rl-to">${r.drawer ? html`<b>${r.drawer.replace('/', ' › ')}</b>` : ''}${r.tags.map((t) => html`<span class="cap-tag" key=${t}>#${t}</span>`)}</span></div>
          <button type="button" class="icon-btn" aria-label=${`${r.match} 규칙 고치기`} onClick=${() => edit(r, i)}><${Icon} name="pen" /></button>
          <button type="button" class="icon-btn" aria-label=${`${r.match} 규칙 지우기`} onClick=${() => save({ rules: s.rules.filter((_, j) => j !== i) })}><${Icon} name="trash" /></button>
        </div>`)
      : html`<div class="sg-row empty-row">아직 규칙이 없어요.</div>`}
    <button type="button" class="sg-add" onClick=${() => edit(null)}><${Icon} name="plus" />규칙 추가</button>`;
}

function Keywords() {
  const lib = useLib();
  const [s, save] = useShared(lib);
  const edit = (kw) => modal((close) => html`<${KeywordDialog} kw=${kw} taken=${s.keywords.map((k) => k.key)} close=${close}
    onSave=${(k) => save({ keywords: kw ? s.keywords.map((x) => (x.key === kw.key ? k : x)) : [...s.keywords, k] }).then((ok) => ok && toast(`/${k.key} 를 저장했어요`))} />`);
  return html`
    ${s.keywords.length
      ? s.keywords.map((k) => html`<div class="sg-row item-row" key=${k.key}>
          <div class="item-main"><code class="rl-key">/${k.key}</code><span class="rl-text">${fillVars(k.text).replace(/\n/g, ' ⏎ ')}</span></div>
          <button type="button" class="icon-btn" aria-label=${`/${k.key} 고치기`} onClick=${() => edit(k)}><${Icon} name="pen" /></button>
          <button type="button" class="icon-btn" aria-label=${`/${k.key} 지우기`} onClick=${() => save({ keywords: s.keywords.filter((x) => x.key !== k.key) })}><${Icon} name="trash" /></button>
        </div>`)
      : html`<div class="sg-row empty-row">아직 명령어가 없어요.</div>`}
    <button type="button" class="sg-add" onClick=${() => edit(null)}><${Icon} name="plus" />명령어 추가</button>`;
}

function TryIt() {
  const lib = useLib();
  const [t, setT] = useState('');
  const pre = t.trim() ? preview(t, lib) : null;
  return html`<div class="sg-row stack try-row">
    <div class="sg-label"><b>해 보기</b><small>아무 글이나 적으면 어디로 갈지 보여 줘요.</small></div>
    <div class="sg-ctl"><input class="input" value=${t} onInput=${(e) => setT(e.target.value)} placeholder="예: 다이슨 청소기 최저가 https://www.coupang.com/…" aria-label="분류 해 보기" />
      ${pre && html`<${GuessLine} pre=${pre} />`}</div>
  </div>`;
}

// ---------- 설정 화면 ----------
export function Settings({ offline, params }) {
  const lib = useLib();
  // ?s=keywords 처럼 오면 그 묶음으로 (명령어 목록의 「내 명령어 만들기」, 사용법의 단추)
  useEffect(() => {
    const id = params?.get('s');
    if (id) setTimeout(() => document.getElementById(`s-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }, [params?.get('s')]);
  const [theme, setTheme] = usePref('theme', '');
  const [font, setFont] = usePref('font', '');
  const [view, setView] = usePref('view', 'wall');
  const [sort, setSort] = usePref('sort', 'new');
  const [navPinned, setNavPinned] = usePref('navPinned', false);
  const [navSide, setNavSide] = usePref('navSide', 'left');
  const [talk, setTalk] = usePref('mascotTalk', 'on');
  const [openAfter, setOpenAfter] = usePref('openAfterSave', false);
  const [firstTitle, setFirstTitle] = usePref('firstLineTitle', true);
  const [shared, save] = useShared(lib);
  const [secret, setSecret] = useState('');
  const [zip, setZip] = useState(null);
  const [token, setToken] = useState(offline);
  const cls = shared.classify;
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); toast('복사했어요.'); } catch { toast('복사 실패. 직접 선택해 복사하세요.'); } };
  const exportZip = async () => {
    setZip(0);
    try {
      await loadScript(JSZIP);
      const { notes, attachments } = await lib.exportFiles((d, t) => setZip(Math.round((d / t) * 80)));
      const z = new window.JSZip();
      for (const f of convertForExport(notes, ATTACH_DIR)) z.file(`Thought Drawer/${f.path}`, f.text);
      let i = 0;
      for (const a of attachments) {
        try { z.file(`Thought Drawer/${ATTACH_DIR}/${a.name}`, await a.load()); } catch { /* 빠진 사진은 건너뜀 */ }
        setZip(80 + Math.round((++i / Math.max(1, attachments.length)) * 20));
      }
      const blob = await z.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `thought-drawer-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast(`노트 ${notes.length}개를 zip으로 담았어요.`);
    } catch (e) { toast(e.message); }
    setZip(null);
  };
  const refetch = () => modal((close) => html`<${ConfirmDialog} close=${close} title="다시 받을까요?" text="이 기기의 사본을 지우고 드라이브에서 새로 받아요. 드라이브의 노트는 그대로예요." yes="다시 받기"
    onYes=${async () => { await lib.clearCache(); toast('드라이브에서 다시 받는 중'); app.resync(); }} />`);
  return html`
    <${PageBar} title="설정" />
    <div class="page narrow set-page">
      <div class="page-head"><h1>설정</h1></div>

      <${Group} id="screen" title="화면" foot="이 기기에만 적용돼요.">
        <${Row} label="밝기"><${Seg} label="밝기" value=${theme} set=${setTheme} opts=${[['', '자동'], ['light', '밝게'], ['dark', '어둡게']]} /></${Row}>
        <${Row} label="노트 글꼴"><${Seg} label="노트 글꼴" value=${font} set=${setFont} opts=${[['', '기본'], ['serif', '명조'], ['mono', '고정폭']]} /></${Row}>
        <${Row} label="카드 보기"><${Seg} label="카드 보기" value=${view} set=${setView} opts=${[['wall', '카드'], ['list', '목록']]} /></${Row}>
        <${Row} label="정렬"><${Select} label="정렬" value=${sort} set=${setSort} opts=${SORTS} /></${Row}>
        <${Row} label="옆 메뉴 고정" desc="넓은 화면에서 메뉴를 늘 펼쳐 둬요."><${Toggle} label="옆 메뉴 고정" checked=${navPinned} onChange=${setNavPinned} /></${Row}>
        ${navPinned && html`<${Row} label="옆 메뉴 위치"><${Seg} label="옆 메뉴 위치" value=${navSide} set=${setNavSide} opts=${[['left', '왼쪽'], ['right', '오른쪽']]} /></${Row}>`}
        <${Row} label="서랍이 말풍선"><${Seg} label="서랍이 말풍선" value=${talk} set=${setTalk} opts=${[['on', '자주'], ['quiet', '가끔'], ['off', '끔']]} /></${Row}>
      </${Group}>

      <${Group} id="input" title="입력" foot="이 기기에만 적용돼요.">
        <${Row} label="넣은 뒤 노트 열기" desc="켜면 넣자마자 그 노트로 가요. 끄면 첫 화면에 그대로 있어요."><${Toggle} label="넣은 뒤 노트 열기" checked=${openAfter} onChange=${setOpenAfter} /></${Row}>
        <${Row} label="첫 줄을 제목으로" desc="여러 줄로 넣으면 첫 줄이 노트 제목이 돼요."><${Toggle} label="첫 줄을 제목으로" checked=${firstTitle} onChange=${setFirstTitle} /></${Row}>
      </${Group}>

      <${Group} id="classify" title="자동 분류" foot="넣는 순간 사이트와 낱말을 보고 서랍과 태그를 정해요. 기기 안에서 계산해 비용이 없어요. 모든 기기에 함께 적용돼요.">
        <${TryIt} />
        <${Row} label="세부 서랍까지 나누기" desc="쇼핑 › 가전처럼 한 단계 더 나눠요."><${Toggle} label="세부 서랍까지 나누기" checked=${cls.subs} onChange=${(v) => save({ classify: { ...cls, subs: v } })} /></${Row}>
        <${Row} label="자동 태그" desc="한 노트에 다는 태그 수"><${Seg} label="자동 태그 수" value=${cls.tags} set=${(v) => save({ classify: { ...cls, tags: v } })} opts=${[[0, '끔'], [2, '2'], [3, '3'], [4, '4'], [6, '6']]} /></${Row}>
        <${Row} label="내가 옮긴 노트에서 배우기" desc="노트의 서랍을 바꿀수록 더 잘 맞아요."><${Toggle} label="내가 옮긴 노트에서 배우기" checked=${cls.learn} onChange=${(v) => save({ classify: { ...cls, learn: v } })} /></${Row}>
      </${Group}>

      <${Group} id="rules" title="분류 규칙" foot="「이 낱말이 나오면 이 서랍」처럼 정해요. 자동 분류보다 먼저 적용돼요.">
        <${Rules} />
      </${Group}>

      <${Group} id="keywords" title="내 명령어" foot="입력창이나 노트에서 / 다음에 이름을 치면 정해 둔 글이 들어가요. 기본 명령어는 사용법에 있어요.">
        <${Keywords} />
      </${Group}>

      <${Group} id="data" title="데이터" foot="옵시디언은 드라이브의 「메모」 폴더를 보관함으로 열면 돼요.">
        <${Row} label="노션으로 내보내기" desc="모든 노트와 사진을 zip 하나로 받아요."><button type="button" class="btn btn-sm" onClick=${exportZip} disabled=${zip !== null}><${Icon} name="download" />${zip !== null ? `${zip}%` : 'zip 받기'}</button></${Row}>
        <${Row} label="처음부터 다시 받기" desc="화면이 이상할 때. 드라이브의 노트는 그대로예요."><button type="button" class="btn btn-sm" onClick=${refetch}><${Icon} name="refresh" />다시 받기</button></${Row}>
      </${Group}>

      <${Group} id="claude" title="Claude 자동 정리 (선택)" foot="안 켜도 앱은 그대로 돼요. 쓰는 Claude 구독 안에서 돌아서 추가 비용은 없어요.">
        <${Row} label="하는 일" desc="정해 둔 시간마다 Claude가 정리 안 된 노트를 읽고 제목·한 줄 요약·태그·노트 연결을 붙여 서랍 폴더로 옮겨요." />
        <${Row} label="마지막 정리"><span class="muted">${lib.index?.generatedAt ? relTime(lib.index.generatedAt) : '아직 안 함'}</span></${Row}>
        <details class="sg-details" open=${!!(token?.refreshToken || token?.error)}>
          <summary>켜는 방법</summary>
          <ol class="sg-steps">
            <li>docs/설정가이드.md 4단계대로 Claude Code 예약 작업을 만들어요.</li>
            <li>아래에 구글 클라우드의 클라이언트 보안 비밀을 넣고 「토큰 받기」. 보안 비밀은 이 브라우저에서 구글로만 보내고 저장하지 않아요.</li>
            <li>받은 토큰을 Claude Code 환경 설정의 TD_GOOGLE_REFRESH_TOKEN에 넣어요. 채팅창에는 붙여 넣지 마세요.</li>
          </ol>
          ${token?.refreshToken && html`<div class="code-box"><input class="input mono" readonly value=${token.refreshToken} onFocus=${(e) => e.target.select()} aria-label="정리기용 토큰" /><button type="button" class="btn" onClick=${() => copy(token.refreshToken)}><${Icon} name="copy" />복사</button></div>
            <small class="muted">이 화면을 벗어나면 다시 볼 수 없어요.</small>`}
          ${token?.error && html`<div class="banner warn"><${Icon} name="alert" /><p>${token.error}</p><button type="button" class="btn btn-ghost" onClick=${() => setToken(null)}>닫기</button></div>`}
          <form class="code-box" onSubmit=${(e) => { e.preventDefault(); if (!secret.trim()) { toast('클라이언트 보안 비밀을 넣어 주세요.'); return; } app.auth.requestOfflineCode(secret.trim()); }}>
            <input class="input" type="password" autocomplete="off" value=${secret} onInput=${(e) => setSecret(e.target.value)} placeholder="클라이언트 보안 비밀" aria-label="클라이언트 보안 비밀" /><button class="btn">토큰 받기</button>
          </form>
        </details>
      </${Group}>
    </div>
    <${Footer} />`;
}
