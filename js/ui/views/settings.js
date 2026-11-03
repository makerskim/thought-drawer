// 설정: 아이폰 설정처럼 묶음마다 한 줄씩 (이름 왼쪽, 조절 오른쪽, 설명은 이름 아래 작게).
// 화면 · 입력(이 기기에만) / 자동 분류 · 분류 규칙 · 바꾼 서랍 이름 · 내 명령어(모든 기기에 함께, 드라이브 _시스템/settings.json) / 데이터 / Claude 자동 정리.
// 계정은 오른쪽 위 사진, 단축키·기본 명령어·도움말은 「사용법」에 있다.
import { html, useState, useEffect, useLayoutEffect, useRef, cx } from '../h.js';
import { Icon } from '../icons.js';
import { app, useLib, usePref, applyAppearance, toast } from '../state.js';
import { PageBar, Footer } from '../parts/shell.js';
import { modal } from '../parts/layers.js';
import { ConfirmDialog } from '../parts/dialogs.js';
import { settingsOf, drawerTargets, leftovers, moveLeftovers, forgetRename, ruleTargets, applyRule } from '../categories.js';
import { normalizeSettings } from '../../core/settings.js';
import { keyOk, fillVars, BUILTINS } from '../../core/slash.js';
import { topOf } from '../../core/classify.js';
import { SORTS } from '../../core/filter.js';
import { preview, GuessLine } from '../parts/guess.js';
import { convertForExport } from '../../core/export.js';
import { ATTACH_DIR } from '../../config.js';
import { relTime, fullDate } from '../format.js';
import { noteHref } from '../router.js';
import { categoryParts } from '../../core/note.js';
import { titleOf } from '../parts/common.js';
import { loadScript, JSZIP } from './more.js';

const GUIDE = 'https://github.com/makerskim/thought-drawer/blob/main/docs/%EC%84%A4%EC%A0%95%EA%B0%80%EC%9D%B4%EB%93%9C.md';

// ---------- 부품 ----------
function Group({ id, title, scope, foot, children }) {
  return html`<section class="sg-sec" id=${id ? `s-${id}` : undefined}>
    <h2 class="sg-title">${title}${scope && html`<span class="sg-scope">${scope}</span>`}</h2>
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
    <label class="fld"><span>이 낱말·사이트가 나오면</span>
      <input ref=${first} class="input" value=${match} onInput=${(e) => { setMatch(e.target.value); setErr(''); }} placeholder="다이슨, 가습기, musinsa.com" aria-label="낱말 또는 사이트" />
      <small>쉼표로 여러 개</small></label>
    <label class="fld"><span>넣을 서랍</span>
      <select class="input" value=${known || drawer === '__new' || !drawer ? drawer : '__new'} onChange=${(e) => { setDrawer(e.target.value); setErr(''); }} aria-label="서랍">
        <option value="">자동 (그대로)</option>
        ${opts.map(([top, subs]) => html`<optgroup key=${top} label=${top}><option value=${top}>${top}</option>${subs.map((p) => html`<option key=${p} value=${p}>${top} › ${p.split('/')[1]}</option>`)}</optgroup>`)}
        <option value="__new">새 서랍 직접 적기…</option>
      </select></label>
    ${(drawer === '__new' || (drawer && !known)) && html`<label class="fld"><span>새 서랍 이름</span>
      <input class="input" value=${drawer === '__new' ? fresh : drawer} onInput=${(e) => { setDrawer('__new'); setFresh(e.target.value); }} placeholder="예: 쇼핑/가전/노트북 또는 캠핑" aria-label="새 서랍 이름" /><small>세부 서랍·소분류는 빗금(/)으로</small></label>`}
    <label class="fld"><span>달 태그 <em>선택</em></span>
      <input class="input" value=${tags} onInput=${(e) => { setTags(e.target.value); setErr(''); }} placeholder="가전, 계절" aria-label="태그" /></label>
    <p class="sdlg-prev">${word
      ? html`<span>예</span>「${word} …」 → <b>${to ? to.replaceAll('/', ' › ') : '자동 분류'}</b>${tagList.map((t) => html` <span class="cap-tag" key=${t}>#${t}</span>`)}`
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
    <label class="fld"><span>이름</span>
      <div class="kw-key"><span>/</span><input ref=${keyRef} class="input" value=${key} onInput=${(e) => { setKey(e.target.value); setErr(''); }} placeholder="회의" aria-label="명령어 이름" /></div></label>
    <label class="fld"><span>넣을 글</span>
      <textarea ref=${area} class="input" rows="4" value=${text} onInput=${(e) => { setText(e.target.value); setErr(''); }} placeholder="회의 {오늘}" aria-label="들어갈 글"></textarea></label>
    <div class="kw-chips" role="group" aria-label="끼워 넣기"><span>끼워 넣기</span>${CHIPS.map(([l, v]) => html`<button type="button" key=${l} class="chip" onMouseDown=${(e) => e.preventDefault()} onClick=${() => put(v)}>${l}</button>`)}</div>
    ${text.trim() && html`<div class="sdlg-prev col"><span>미리 보기</span><pre>${fillVars(text)}</pre></div>`}
    ${err && html`<p class="sdlg-err" role="alert">${err}</p>`}
    <div class="actions"><button type="button" class="btn btn-ghost" onClick=${close}>취소</button><button class="btn btn-primary">저장</button></div>
  </form>`;
}

function Rules() {
  const lib = useLib();
  const [s, save] = useShared(lib);
  // 저장한 뒤, 이미 정리된 노트 중 이 규칙에 맞는 게 있으면 원할 때만 맞춘다 (새 노트는 저절로 규칙대로)
  const saved = (r) => {
    const hits = ruleTargets(lib, r);
    if (!hits.length) { toast('규칙을 저장했어요'); return; }
    toast(`규칙을 저장했어요 · 이미 정리된 노트 ${hits.length}개도 맞아요`, {
      action: r.drawer ? '그 노트도 옮기기' : '태그 달기', duration: 9000,
      onAction: async () => {
        const t = toast('맞추는 중', { busy: true });
        try { const n = await applyRule(lib, r, hits, (k, all) => t.update(`맞추는 중 ${k}/${all}`, { busy: true })); t.update(`노트 ${n}개를 규칙대로 맞췄어요`); } catch (e) { t.update(e.message, { duration: 6000 }); }
      },
    });
  };
  const edit = (rule, i) => modal((close) => html`<${RuleDialog} rule=${rule} close=${close}
    onSave=${(r) => save({ rules: i == null ? [...s.rules.filter((x) => x.match !== r.match), r] : s.rules.map((x, j) => (j === i ? r : x)) }).then((ok) => ok && saved(r))} />`);
  return html`
    ${s.rules.length
      ? s.rules.map((r, i) => html`<div class="sg-row item-row" key=${`${r.match}:${i}`}>
          <div class="item-main"><span class="rl-match">${r.match}</span><${Icon} name="chevron" /><span class="rl-to">${r.drawer ? html`<b>${r.drawer.replaceAll('/', ' › ')}</b>` : ''}${r.tags.map((t) => html`<span class="cap-tag" key=${t}>#${t}</span>`)}</span></div>
          <button type="button" class="icon-btn" aria-label=${`${r.match} 규칙 고치기`} onClick=${() => edit(r, i)}><${Icon} name="pen" /></button>
          <button type="button" class="icon-btn" aria-label=${`${r.match} 규칙 지우기`} onClick=${() => save({ rules: s.rules.filter((_, j) => j !== i) })}><${Icon} name="trash" /></button>
        </div>`)
      : html`<div class="sg-row empty-row">없음</div>`}
    <button type="button" class="sg-add" onClick=${() => edit(null)}><${Icon} name="plus" />규칙 추가</button>`;
}

// 바꾼 서랍 이름 (장부): 옛 이름 → 새 이름. 앱과 Claude 정리기가 이 장부대로 이름만 바꿔 쓴다.
function Names() {
  const lib = useLib();
  const s = settingsOf(lib);
  const left = leftovers(lib);
  const label = (p) => p.replaceAll('/', ' › ');
  const move = async () => {
    const t = toast('옮기는 중', { busy: true });
    try { const n = await moveLeftovers(lib, (i, all) => t.update(`옮기는 중 ${i}/${all}`, { busy: true })); t.update(`노트 ${n}개를 새 이름으로 옮겼어요`); } catch (e) { t.update(e.message, { duration: 6000 }); }
  };
  const forget = (r) => modal((close) => html`<${ConfirmDialog} close=${close} title="이 기록을 지울까요?" yes="지우기"
    text=${`옮긴 노트는 그대로예요. 새 노트는 다시 「${label(r.from)}」(으)로 분류돼요.`}
    onYes=${async () => { try { await forgetRename(lib, r.from); toast('기록을 지웠어요'); } catch (e) { toast(e.message); } }} />`);
  return html`
    ${s.renames.length
      ? s.renames.map((r) => html`<div class="sg-row item-row" key=${r.from}>
          <div class="item-main"><span class="rl-match rn-from">${label(r.from)}</span><${Icon} name="chevron" /><b class="rl-to">${label(r.to)}</b>${r.at && html`<small class="muted rn-at">${relTime(r.at)}</small>`}</div>
          <button type="button" class="icon-btn" aria-label=${`${label(r.from)} 바꾼 기록 지우기`} title="기록 지우기" onClick=${() => forget(r)}><${Icon} name="trash" /></button>
        </div>`)
      : html`<div class="sg-row empty-row">없음 · 서랍 화면 오른쪽 위 메뉴에서 바꿔요</div>`}
    ${left.length > 0 && html`<${Row} label=${`남은 노트 ${left.length}개`} desc="옛 이름 서랍에"><button type="button" class="btn btn-sm" onClick=${move}>옮기기</button></${Row}>`}`;
}

function Keywords() {
  const lib = useLib();
  const [s, save] = useShared(lib);
  const edit = (kw) => modal((close) => html`<${KeywordDialog} kw=${kw} taken=${s.keywords.map((k) => k.key)} close=${close}
    onSave=${(k) => save({ keywords: kw ? s.keywords.map((x) => (x.key === kw.key ? k : x)) : [...s.keywords, k] }).then((ok) => ok && toast(`/${k.key} 를 저장했어요`))} />`);
  return html`
    ${s.keywords.length
      ? s.keywords.map((k) => html`<div class="sg-row item-row" key=${k.key}>
          <div class="item-main"><code class="rl-key">/${k.key}</code><span class="rl-text">${k.text.trim() === '- [ ]' ? '체크 상자' : fillVars(k.text).replace(/\n/g, ' ⏎ ')}</span></div>
          <button type="button" class="icon-btn" aria-label=${`/${k.key} 고치기`} onClick=${() => edit(k)}><${Icon} name="pen" /></button>
          <button type="button" class="icon-btn" aria-label=${`/${k.key} 지우기`} onClick=${() => save({ keywords: s.keywords.filter((x) => x.key !== k.key) })}><${Icon} name="trash" /></button>
        </div>`)
      : html`<div class="sg-row empty-row">없음</div>`}
    <button type="button" class="sg-add" onClick=${() => edit(null)}><${Icon} name="plus" />명령어 추가</button>
    <div class="sg-row fixed-row"><span>바꿀 수 없음</span>${BUILTINS.map((c) => html`<code key=${c.key}>/${c.key}</code>`)}</div>`;
}

function TryIt() {
  const lib = useLib();
  const [t, setT] = useState('');
  const pre = t.trim() ? preview(t, lib) : null;
  return html`<div class="sg-row stack try-row">
    <div class="sg-label"><b>해 보기</b></div>
    <div class="sg-ctl"><input class="input" value=${t} onInput=${(e) => setT(e.target.value)} placeholder="글을 적으면 서랍과 태그가 나와요" aria-label="분류 해 보기" />
      ${pre && html`<${GuessLine} pre=${pre} />`}</div>
  </div>`;
}

// ---------- Claude 자동 정리: 상태창 (켜는 법은 설정 가이드 4단계) ----------
const copyText = async (text, what = '복사') => { try { await navigator.clipboard.writeText(text); toast(`${what}했어요.`); } catch { toast('복사 실패. 직접 선택해 복사하세요.'); } };
const DAY = 86_400_000;

function ClaudeStatus({ token, setToken, secret, setSecret }) {
  const lib = useLib();
  const last = lib.index?.generatedAt ?? '';
  const on = !!last;
  const done = lib.all.filter((n) => n.meta.organized);
  // Claude에게 보낼 노트: 아직 한 번도 정리되지 않은 인박스 노트만 (한 번 정리한 노트는 다시 보내지 않는다)
  const waiting = lib.all.filter((n) => n.meta.status !== 'organized' && !n.meta.organized).length;
  // 정리할 노트가 쌓였는데 이틀 넘게 정리가 없으면 예약 작업이 멈췄을 수 있다 (새 노트가 없으면 정리기는 바로 끝나서 시각이 안 바뀐다)
  const stale = on && waiting > 0 && Date.now() - Date.parse(last) > 2 * DAY;
  const recent = [...done].sort((a, b) => String(b.meta.organized).localeCompare(String(a.meta.organized))).slice(0, 3);
  return html`
    <${Row} label="상태"><span class=${cx('cl-state', on && !stale && 'on', stale && 'warn')}><i></i>${!on ? '꺼짐' : stale ? '확인 필요' : '켜짐'}</span></${Row}>
    ${on && html`<${Row} label="마지막 정리"><span class="cl-val" title=${fullDate(last)}>${relTime(last)}</span></${Row}>`}
    ${on && html`<${Row} label="정리한 노트"><span class="cl-val">${done.length}개</span></${Row}>`}
    <${Row} label="정리 대기"><span class="cl-val">${waiting}개</span></${Row}>
    <${Row} label="보내는 노트" desc="한 번 정리한 건 제외"><span class="cl-val">새 노트만</span></${Row}>
    <${Row} label="비용"><span class="cl-val">0원 · 구독 안에서</span></${Row}>
    ${stale && html`<div class="banner warn cl-banner"><${Icon} name="alert" /><p>정리 대기 노트가 있는데 이틀 넘게 정리가 없어요. claude.ai/code의 예약 작업 실행 기록을 확인하세요.</p></div>`}
    ${recent.length > 0 && html`<div class="cl-recent"><span class="cl-cap">최근 정리</span>
      ${recent.map((n) => html`<a key=${n.id} href=${noteHref(n.id)}><b>${titleOf(n)}</b><small>${categoryParts(n.meta.category).join(' › ')} · ${relTime(n.meta.organized)}</small></a>`)}</div>`}
    <details class="sg-details" open=${!!(token?.refreshToken || token?.error) || undefined}>
      <summary>정리기 연결 (토큰 받기)</summary>
      <form class="code-box" onSubmit=${(e) => { e.preventDefault(); if (!secret.trim()) { toast('클라이언트 보안 비밀을 넣어 주세요.'); return; } app.auth.requestOfflineCode(secret.trim()); }}>
        <input class="input" type="password" autocomplete="off" value=${secret} onInput=${(e) => setSecret(e.target.value)} placeholder="클라이언트 보안 비밀" aria-label="클라이언트 보안 비밀" /><button class="btn">토큰 받기</button>
      </form>
      ${token?.refreshToken && html`<div class="code-box"><input class="input mono" readonly value=${token.refreshToken} onFocus=${(e) => e.target.select()} aria-label="정리기용 토큰" /><button type="button" class="btn" onClick=${() => copyText(token.refreshToken, '토큰 복사')}><${Icon} name="copy" />복사</button></div>`}
      ${token?.error && html`<div class="banner warn"><${Icon} name="alert" /><p>${token.error}</p><button type="button" class="btn btn-ghost" onClick=${() => setToken(null)}>닫기</button></div>`}
      <small class="muted">보안 비밀은 저장하지 않아요. 토큰은 채팅창에 붙여 넣지 마세요.</small>
    </details>`;
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
  const [follow, setFollow] = usePref('mascotFollow', true);
  const [openAfter, setOpenAfter] = usePref('openAfterSave', false);
  const [firstTitle, setFirstTitle] = usePref('firstLineTitle', true);
  const [shared, save] = useShared(lib);
  const [secret, setSecret] = useState('');
  const [zip, setZip] = useState(null);
  const [token, setToken] = useState(offline);
  const cls = shared.classify;
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

      <${Group} id="screen" title="화면" scope="이 기기">
        <${Row} label="밝기" desc=${theme === '' ? '낮 밝게 · 밤 어둡게' : theme === 'system' ? '기기 설정 따라' : ''}><${Seg} label="밝기" value=${theme} set=${setTheme} opts=${[['', '자동'], ['system', '기기'], ['light', '밝게'], ['dark', '어둡게']]} /></${Row}>
        <${Row} label="글꼴"><${Seg} label="글꼴" value=${font} set=${setFont} opts=${[['', '기본'], ['serif', '명조'], ['mono', '고정폭']]} /></${Row}>
        <${Row} label="보기"><${Seg} label="보기" value=${view} set=${setView} opts=${[['wall', '카드'], ['list', '목록']]} /></${Row}>
        <${Row} label="정렬"><${Select} label="정렬" value=${sort} set=${setSort} opts=${SORTS} /></${Row}>
        <${Row} label="메뉴 고정"><${Toggle} label="메뉴 고정" checked=${navPinned} onChange=${setNavPinned} /></${Row}>
        ${navPinned && html`<${Row} label="메뉴 위치"><${Seg} label="메뉴 위치" value=${navSide} set=${setNavSide} opts=${[['left', '왼쪽'], ['right', '오른쪽']]} /></${Row}>`}
        <${Row} label="서랍이 동행" desc="어디서나 오른쪽 아래에"><${Toggle} label="서랍이 동행" checked=${follow} onChange=${setFollow} /></${Row}>
        <${Row} label="서랍이 말"><${Seg} label="서랍이 말" value=${talk} set=${setTalk} opts=${[['on', '자주'], ['quiet', '가끔'], ['off', '끔']]} /></${Row}>
      </${Group}>

      <${Group} id="input" title="입력" scope="이 기기">
        <${Row} label="넣고 바로 열기"><${Toggle} label="넣고 바로 열기" checked=${openAfter} onChange=${setOpenAfter} /></${Row}>
        <${Row} label="첫 줄은 제목"><${Toggle} label="첫 줄은 제목" checked=${firstTitle} onChange=${setFirstTitle} /></${Row}>
      </${Group}>

      <${Group} id="classify" title="자동 분류" scope="모든 기기">
        <${TryIt} />
        <${Row} label="세부 서랍" desc="가전 › 노트북"><${Toggle} label="세부 서랍" checked=${cls.subs} onChange=${(v) => save({ classify: { ...cls, subs: v } })} /></${Row}>
        <${Row} label="태그 개수"><${Seg} label="태그 개수" value=${cls.tags} set=${(v) => save({ classify: { ...cls, tags: v } })} opts=${[[0, '끔'], [2, '2'], [3, '3'], [4, '4'], [6, '6']]} /></${Row}>
        <${Row} label="내 정리 배우기" desc="서랍을 바꾸면 기억"><${Toggle} label="내 정리 배우기" checked=${cls.learn} onChange=${(v) => save({ classify: { ...cls, learn: v } })} /></${Row}>
      </${Group}>

      <${Group} id="rules" title="분류 규칙" scope="모든 기기" foot="자동 분류보다 먼저 적용">
        <${Rules} />
      </${Group}>

      <${Group} id="names" title="바꾼 서랍 이름" scope="모든 기기" foot="이름만 바꾸고 다시 분류하지 않아요 · Claude 사용 없음">
        <${Names} />
      </${Group}>

      <${Group} id="keywords" title="내 명령어" scope="모든 기기" foot="입력창에서 /이름">
        <${Keywords} />
      </${Group}>

      <${Group} id="data" title="데이터">
        <${Row} label="노션 내보내기"><button type="button" class="btn btn-sm" onClick=${exportZip} disabled=${zip !== null}><${Icon} name="download" />${zip !== null ? `${zip}%` : 'zip 받기'}</button></${Row}>
        <${Row} label="다시 받기" desc="드라이브에서 새로"><button type="button" class="btn btn-sm" onClick=${refetch}><${Icon} name="refresh" />다시 받기</button></${Row}>
      </${Group}>

      <${Group} id="claude" title="Claude 자동 정리" scope="선택" foot=${html`필요할 때 켜는 정밀 분류. 켜는 법은 <a href=${GUIDE} target="_blank" rel="noopener">설정 가이드 4단계</a>.`}>
        <${ClaudeStatus} token=${token} setToken=${setToken} secret=${secret} setSecret=${setSecret} />
      </${Group}>
    </div>
    <${Footer} />`;
}
