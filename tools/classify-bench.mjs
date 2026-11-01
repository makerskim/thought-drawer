// 자동 분류 대량 점검: 공개 한국어 말뭉치 수십만 줄을 넣어 보고
// 「기타」 수, 단서가 없어 메모로 간 수, 소분류가 없는 수, 출처별로 기대한 서랍에 간 비율, 사전에 없는 잦은 낱말을 센다.
//
// 쓰는 법: node tools/classify-bench.mjs <말뭉치 폴더> [--mine 300] [--sample 서랍이름] [--json 결과.json]
// 말뭉치 폴더에는 아래 파일 중 있는 것만 읽는다 (내려받는 주소는 docs/설계.md 「자동 분류 점검」).
//   nsmc/ratings.txt, shopping/naver_shopping.txt, steam/steam.txt, chatbot/ChatbotData.csv, 3i4k/fci.txt,
//   qpair/kor_pair_train.csv, hate/train.tsv, unsmile/train.tsv, kornli/multinli.train.ko.tsv,
//   ynat/train.json, ynat/dev.json, koalpaca/v10.json, koalpaca/v11.jsonl
// 말뭉치는 저장소에 넣지 않는다 (용량·저작권). 글은 데이터로만 읽는다.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { classify, scan } from '../js/core/classify.js';
import { tokenize } from '../js/core/search.js';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
if (!dir) { console.error('말뭉치 폴더를 적어 주세요.'); process.exit(1); }

const read = (p) => (existsSync(join(dir, p)) ? readFileSync(join(dir, p), 'utf8') : null);
const tsv = (p, col, skip = 1) => (read(p)?.split('\n').slice(skip).map((l) => l.split('\t')[col]).filter(Boolean) ?? []);
const csvCol = (p, col) => (read(p)?.split('\n').slice(1).map((l) => l.replace(/^﻿/, '').split(',')[col]).filter(Boolean) ?? []);

// 출처마다 「이 서랍들 중 하나면 맞다」고 볼 기대값 (없으면 고르게 퍼져야 하는 글)
const SOURCES = [
  { src: '영화 리뷰', texts: () => tsv('nsmc/ratings.txt', 1), expect: ['영상·음악'] },
  { src: '쇼핑 리뷰', texts: () => tsv('shopping/naver_shopping.txt', 1, 0), expect: ['쇼핑', '패션·뷰티', '요리·맛집', '집·생활', '건강·운동'] },
  { src: '게임 리뷰', texts: () => tsv('steam/steam.txt', 1, 0), expect: ['취미·여가/게임'] },
  { src: '일상 대화', texts: () => csvCol('chatbot/ChatbotData.csv', 0) },
  { src: '말 의도', texts: () => tsv('3i4k/fci.txt', 1, 0) },
  { src: '고민 질문', texts: () => (read('qpair/kor_pair_train.csv')?.split('\n').slice(1).flatMap((l) => l.split(',').slice(3, 5)).filter(Boolean) ?? []) },
  { src: '연예 댓글', texts: () => tsv('hate/train.tsv', 0) },
  { src: '댓글', texts: () => tsv('unsmile/train.tsv', 0) },
  { src: '여러 글', texts: () => [...new Set(tsv('kornli/multinli.train.ko.tsv', 0))] },
  { src: '뉴스 제목', texts: () => ['ynat/train.json', 'ynat/dev.json'].flatMap((p) => (read(p) ? JSON.parse(read(p)).map((x) => [x.title, x.label]) : [])), labeled: true },
  { src: '질문(지식인)', texts: () => [...(read('koalpaca/v11.jsonl')?.split('\n').filter(Boolean).map((l) => JSON.parse(l).instruction) ?? []), ...(read('koalpaca/v10.json') ? JSON.parse(read('koalpaca/v10.json')).map((x) => x.instruction) : [])] },
];
// 뉴스 주제 → 맞다고 볼 서랍
const NEWS = {
  IT과학: ['디지털·IT', '뉴스·이슈/IT·테크', '쇼핑/가전', '뉴스·이슈'], 경제: ['돈·재테크', '뉴스·이슈/경제', '일·업무', '뉴스·이슈'],
  사회: ['뉴스·이슈', '정보·서류', '집·생활', '건강·운동', '공부·자료/학교'], 정치: ['뉴스·이슈'], 세계: ['뉴스·이슈', '여행/해외'],
  스포츠: ['취미·여가/스포츠', '건강·운동/운동', '뉴스·이슈'], 생활문화: null,
};
const okFor = (r, list) => !list || list.some((e) => (e.includes('/') ? `${r.category}/${r.sub}` === e : r.category === e));

const total = { n: 0, other: 0, weak: 0, noSub: 0, noLeaf: 0, ms: 0 };
const tops = new Map();
const subs = new Map();
const unknown = new Map(); // 메모로 간 글의 낱말 → 수
const rows = [];
const want = opt('sample', '');
const samples = [];
for (const s of SOURCES) {
  const list = s.texts();
  if (!list.length) continue;
  const st = { src: s.src, n: 0, weak: 0, noLeaf: 0, ok: 0, okN: 0 };
  for (const item of list) {
    const [text, label] = s.labeled ? item : [item, null];
    const body = String(text).trim();
    if (!body) continue;
    const t0 = performance.now();
    const r = classify({ meta: {}, body });
    total.ms += performance.now() - t0;
    st.n++; total.n++;
    if (r.category === '기타') total.other++;
    if (r.weak) { st.weak++; total.weak++; }
    if (!r.sub) total.noSub++;
    if (!r.leaf) { st.noLeaf++; total.noLeaf++; }
    tops.set(r.category, (tops.get(r.category) ?? 0) + 1);
    subs.set(`${r.category}/${r.sub}`, (subs.get(`${r.category}/${r.sub}`) ?? 0) + 1);
    const exp = s.labeled ? NEWS[label] : s.expect;
    if (exp) { st.okN++; if (okFor(r, exp)) st.ok++; }
    if (r.weak) {
      const known = scan(body.toLowerCase());
      for (const w of new Set(tokenize(body))) if (w.length >= 2 && !/\d/.test(w) && !known.has(w)) unknown.set(w, (unknown.get(w) ?? 0) + 1);
    }
    if (want && (r.path.startsWith(want) || (want === 'weak' && r.weak)) && samples.length < 60 && Math.random() < 0.05) samples.push(`${body.slice(0, 70)} → ${r.path} (${r.why})`);
  }
  rows.push(st);
}

const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '-');
console.log(`글 ${total.n.toLocaleString()}개 · 기타 ${total.other} · 단서 없음(메모) ${pct(total.weak, total.n)} · 세부 서랍 없음 ${total.noSub} · 소분류 없음 ${pct(total.noLeaf, total.n)} · 글 하나 ${(total.ms / total.n).toFixed(3)}ms`);
console.log('\n출처별: 글 수 · 단서 없음 · 소분류 없음 · 기대한 서랍');
for (const r of rows) console.log(`  ${r.src.padEnd(10)} ${String(r.n).padStart(7)} · ${pct(r.weak, r.n).padStart(6)} · ${pct(r.noLeaf, r.n).padStart(6)} · ${r.okN ? pct(r.ok, r.okN) : '-'}`);
console.log('\n서랍별:', [...tops].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v, total.n)}`).join(', '));
const mine = Number(opt('mine', 0));
if (mine) {
  console.log(`\n메모로 간 글에 자주 나온, 사전에 없는 낱말 ${mine}개:`);
  console.log([...unknown].sort((a, b) => b[1] - a[1]).slice(0, mine).map(([w, n]) => `${w}:${n}`).join(' '));
}
if (samples.length) console.log('\n예시:\n' + samples.join('\n'));
const out = opt('json', '');
if (out) writeFileSync(out, JSON.stringify({ total, rows, tops: [...tops], subs: [...subs].sort((a, b) => b[1] - a[1]), unknown: [...unknown].sort((a, b) => b[1] - a[1]).slice(0, 5000) }, null, 1));
