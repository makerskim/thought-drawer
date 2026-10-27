// 체험 모드 저장소: 구글 연결 없이 이 기기 안(IndexedDB)에만 저장한다.
// 처음 열면 예시 카드를 채워 넣어 앱이 어떻게 보이는지 바로 볼 수 있게 한다.

import { INBOX_DIR, ATTACH_DIR } from '../config.js';
import { serializeNote, fileNameFor, isoLocal } from '../core/note.js';
import { openStore } from './idb.js';

const svg = (inner, bg) => new Blob([
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 750"><rect width="600" height="750" fill="${bg}"/>${inner}</svg>`,
], { type: 'image/svg+xml' });

const ART = {
  'shirt.svg': () => svg(`
    <path d="M210 150 L300 190 L390 150 L500 230 L455 320 L410 295 L410 610 L190 610 L190 295 L145 320 L100 230 Z" fill="#fbfbf7" stroke="#c9cfd6" stroke-width="4"/>
    <path d="M262 168 L300 232 L338 168" fill="none" stroke="#c9cfd6" stroke-width="4"/>
    <g fill="#c9cfd6">${[290, 350, 410, 470, 530].map((y) => `<circle cx="300" cy="${y}" r="6"/>`).join('')}</g>
    <rect x="335" y="300" width="50" height="58" fill="none" stroke="#c9cfd6" stroke-width="4"/>`, '#dfe6ec'),
  'sneaker.svg': () => svg(`
    <path d="M90 470 C 120 360, 200 330, 270 330 L 330 380 C 380 420, 470 430, 520 455 C 545 470, 545 520, 520 530 L 100 530 C 80 525, 80 495, 90 470 Z" fill="#9ea4aa"/>
    <path d="M85 520 L 525 520 L 525 560 L 85 560 Z" fill="#f2f2ee"/>
    <path d="M200 350 L 230 470 M 245 345 L 270 460 M 290 360 L 305 450" stroke="#f2f2ee" stroke-width="10" stroke-linecap="round"/>
    <text x="380" y="490" font-family="sans-serif" font-size="64" font-weight="700" fill="#e8e8e2">N</text>`, '#e9e5dc'),
  'noodle.svg': () => svg(`
    <ellipse cx="300" cy="420" rx="230" ry="70" fill="#3a3530"/>
    <path d="M70 420 C 90 560, 510 560, 530 420 Z" fill="#2a2622"/>
    <g stroke="#e8d9b0" stroke-width="7" fill="none" stroke-linecap="round">
      <path d="M150 410 C 200 380, 260 440, 320 400 S 420 420, 450 400"/>
      <path d="M140 430 C 210 400, 270 460, 330 420 S 430 440, 460 425"/>
      <path d="M170 445 C 230 425, 290 470, 350 440 S 420 455, 440 445"/></g>
    <g fill="#5d7a3a"><circle cx="250" cy="395" r="12"/><circle cx="350" cy="385" r="10"/><circle cx="300" cy="430" r="9"/></g>
    <path d="M420 200 L 300 380 M 450 210 L 330 385" stroke="#8a6a44" stroke-width="9" stroke-linecap="round"/>`, '#d9d2c5'),
  'sale.svg': () => svg(`
    <rect x="40" y="40" width="520" height="670" rx="28" fill="#ffffff"/>
    <rect x="40" y="40" width="520" height="90" rx="28" fill="#1b2430"/>
    <text x="80" y="100" font-family="sans-serif" font-size="34" font-weight="700" fill="#fff">OAKWOOD STUDIO</text>
    <text x="80" y="210" font-family="sans-serif" font-size="56" font-weight="800" fill="#1b2430">가을 시즌오프</text>
    <text x="80" y="290" font-family="sans-serif" font-size="80" font-weight="900" fill="#d2463a">최대 40%</text>
    <text x="80" y="360" font-family="sans-serif" font-size="30" fill="#55606c">10.28 (화) – 11.03 (월)</text>
    <rect x="80" y="410" width="440" height="200" rx="16" fill="#eef1f4"/>
    <text x="110" y="470" font-family="sans-serif" font-size="30" fill="#1b2430">옥스포드 셔츠 59,000 → 35,400</text>
    <text x="110" y="530" font-family="sans-serif" font-size="30" fill="#1b2430">울 가디건 129,000 → 89,000</text>
    <text x="110" y="590" font-family="sans-serif" font-size="26" fill="#55606c">앱 회원 추가 5% 쿠폰</text>`, '#c8d0d8'),
};

// [폴더, 카드] — 날짜는 고정해서 번호가 늘 같게 한다
function seedNotes() {
  const d = (s) => new Date(s);
  const note = (meta, body) => ({ meta: { status: 'organized', ...meta }, body });
  return [
    note({ id: '20260912214510', title: '흰색 옥스포드 셔츠', type: 'capture', category: '패션/상의', tags: ['셔츠', '위시리스트', '오크우드'], summary: '오크우드 스튜디오 흰색 옥스포드 셔츠, 100 사이즈가 어깨에 맞음.', created: isoLocal(d('2026-09-12T21:45:10')), attachments: ['shirt.svg'], links: ['20261027093012', '20261003120044'] },
      '![[shirt.svg]]\n\n매장에서 입어봤는데 100이 어깨에 딱 맞았다. 기장이 짧아서 넣어 입지 않아도 됨.\n\n## 사진 속 글자\n\nOXFORD BUTTON-DOWN / WHITE / 59,000\n\n## 연결\n\n- [[20261027093012]] (같은 셔츠 할인 소식)\n- [[20261003120044 가을 레이어드 코디]] (이 셔츠로 따라 할 코디)'),
    note({ id: '20260925101530', title: '오버핏 울 가디건', type: 'instagram', category: '패션/상의', tags: ['가디건', '니트'], summary: '@knit.lab 의 차콜 울 가디건 착용 사진. 오버핏이라 한 치수 작게 추천.', author: 'knit.lab', source: 'https://www.instagram.com/p/DEMO1/', created: isoLocal(d('2026-09-25T10:15:30')), links: ['20261003120044'] },
      '@knit.lab 의 게시물을 저장했어요.\n\n[인스타그램에서 보기](https://www.instagram.com/p/DEMO1/)\n\n## 캡션\n\n차콜 울 가디건, 오버핏이라 평소보다 한 치수 작게 입으세요. 키 175 / L 착용.\n\n## 연결\n\n- [[20261003120044 가을 레이어드 코디]] (코디에 같은 가디건이 나옴)'),
    note({ id: '20261003120044', title: '가을 레이어드 코디', type: 'instagram', category: '패션/코디', tags: ['코디', '가을', '릴스'], summary: '흰 셔츠 위에 가디건, 그레이 스니커즈로 마무리하는 가을 코디 릴스.', author: 'daily.fit', source: 'https://www.instagram.com/reel/DEMO2/', created: isoLocal(d('2026-10-03T12:00:44')), links: ['20260912214510', '20260925101530', '20260918190210'] },
      '@daily.fit 의 릴스를 저장했어요.\n\n[인스타그램에서 보기](https://www.instagram.com/reel/DEMO2/)\n\n## 캡션\n\n흰 셔츠 + 차콜 가디건 + 그레이 스니커즈. 가을 출근룩 3초 완성.\n\n## 연결\n\n- [[20260912214510 흰색 옥스포드 셔츠]] (갖고 싶은 셔츠와 같은 조합)\n- [[20260925101530 오버핏 울 가디건]]\n- [[20260918190210 뉴발란스 993 그레이]]'),
    note({ id: '20260918190210', title: '뉴발란스 993 그레이', type: 'bookmark', category: '패션/신발', tags: ['스니커즈', '위시리스트'], summary: '993 그레이 정가 299,000원, 260 사이즈 재입고 알림 신청해 둠.', source: 'https://www.newbalance.co.kr/', created: isoLocal(d('2026-09-18T19:02:10')), attachments: ['sneaker.svg'] },
      '![[sneaker.svg]]\n\n[뉴발란스 공식몰](https://www.newbalance.co.kr/)\n\n260 재입고 알림 신청함. 발볼이 넓어서 D 말고 2E.'),
    note({ id: '20261008083522', title: '들기름 막국수', type: 'instagram', category: '요리/레시피', tags: ['면요리', '릴스', '10분요리'], summary: '메밀면에 들기름, 간장, 김가루, 깨만 넣는 10분 레시피.', author: 'cook.minji', source: 'https://www.instagram.com/reel/DEMO3/', created: isoLocal(d('2026-10-08T08:35:22')), attachments: ['noodle.svg'], links: ['20261015200301'] },
      '![[noodle.svg]]\n\n@cook.minji 의 릴스를 저장했어요.\n\n## 캡션\n\n메밀면 삶아서 찬물에 헹구고, 들기름 2큰술 + 진간장 1큰술 + 설탕 반 큰술. 김가루, 깨 듬뿍.\n\n## 연결\n\n- [[20261015200301 토마토 달걀볶음]] (같이 해 먹기 좋은 10분 요리)'),
    note({ id: '20261015200301', title: '토마토 달걀볶음', type: 'memo', category: '요리/레시피', tags: ['10분요리', '달걀'], summary: '토마토는 먼저 볶아 즙을 내고 달걀은 따로 반숙으로.', created: isoLocal(d('2026-10-15T20:03:01')) },
      '토마토를 먼저 센 불에 볶아서 즙을 낸다. 달걀은 따로 반숙으로 익혀서 마지막에 합치기. 굴소스 반 큰술이 핵심.'),
    note({ id: '20260830151200', title: '제주 동쪽 카페 지도', type: 'bookmark', category: '여행/제주', tags: ['카페', '제주'], summary: '세화·월정리 쪽 바다 보이는 카페 7곳 정리 글.', source: 'https://example.com/jeju-east-cafe', created: isoLocal(d('2026-08-30T15:12:00')), links: ['20260901093000'] },
      '[제주 동쪽 바다 카페 7곳](https://example.com/jeju-east-cafe)\n\n세화 쪽 두 곳은 주차가 어려움.\n\n## 연결\n\n- [[20260901093000 비자림 아침 산책]] (같은 동선)'),
    note({ id: '20260901093000', title: '비자림 아침 산책', type: 'memo', category: '여행/제주', tags: ['제주', '산책'], summary: '오전 9시 전에 가면 한적함. 한 바퀴 50분.', created: isoLocal(d('2026-09-01T09:30:00')) },
      '9시 전에 도착하면 사람이 거의 없다. 송이길 한 바퀴 50분. 끝나고 세화 카페로.'),
    note({ id: '20260720221010', title: '제텔카스텐은 연결이 핵심', type: 'bookmark', category: '공부/메모법', tags: ['제텔카스텐', '메모법'], summary: '메모는 한 장에 생각 하나, 고유 번호, 다른 메모와의 연결이 있어야 나중에 다시 살아난다.', thought: '폴더보다 링크가 먼저다. 분류는 AI에게 맡기고 나는 연결 이유만 적자.', source: 'https://zettelkasten.de/introduction/', created: isoLocal(d('2026-07-20T22:10:10')), links: ['20260722083000'] },
      '[Introduction to the Zettelkasten Method](https://zettelkasten.de/introduction/)\n\n- 한 장에 생각 하나 (원자성)\n- 고유 번호로 부르기\n- 내 말로 다시 쓰기\n- 연결 이유를 적기\n\n## 연결\n\n- [[20260722083000 메모는 연결될 때 쓸모가 생긴다]] (이 글을 읽고 쓴 내 생각)'),
    note({ id: '20260722083000', title: '메모는 연결될 때 쓸모가 생긴다', type: 'memo', category: '생각', tags: ['제텔카스텐', '내생각'], summary: '저장만 하면 잊는다. 다른 메모와 이어 둘 때 다시 꺼내 쓰게 된다.', created: isoLocal(d('2026-07-22T08:30:00')), links: ['20260720221010'] },
      '저장만 하는 건 쌓아두는 것과 같다. 옷 캡처도 "어떤 코디에 쓸지"와 이어 두면 다시 보게 된다.\n\n## 연결\n\n- [[20260720221010 제텔카스텐은 연결이 핵심]]'),
    note({ id: '20261020111500', title: '동네 빵집 지도 앱', type: 'memo', category: '일/아이디어', tags: ['아이디어', '앱'], summary: '갓 구운 빵 나오는 시간을 알려주는 동네 빵집 지도.', created: isoLocal(d('2026-10-20T11:15:00')) },
      '빵 나오는 시간표를 사장님이 올리면 알림을 받는 지도. 우리 동네 6곳부터.'),
    note({ id: '20261027093012', type: 'capture', status: 'inbox', tags: [], created: isoLocal(d('2026-10-27T09:30:12')), attachments: ['sale.svg'] },
      '![[sale.svg]]\n\n## 사진 속 글자\n\nOAKWOOD STUDIO\n가을 시즌오프 최대 40%\n10.28 (화) – 11.03 (월)\n옥스포드 셔츠 59,000 → 35,400\n울 가디건 129,000 → 89,000\n앱 회원 추가 5% 쿠폰'),
    note({ id: '20261026213300', type: 'instagram', status: 'inbox', author: 'homecafe.kim', source: 'https://www.instagram.com/reel/DEMO4/', created: isoLocal(d('2026-10-26T21:33:00')), tags: ['릴스'] },
      '@homecafe.kim 의 릴스를 저장했어요.\n\n[인스타그램에서 보기](https://www.instagram.com/reel/DEMO4/)'),
    note({ id: '20261025180000', type: 'memo', status: 'inbox', created: isoLocal(d('2026-10-25T18:00:00')) },
      '주말에 성수 팝업 가볼 것. 오크우드 스튜디오 오프라인 매장도 그 근처.'),
  ];
}

export function createDemoAdapter() {
  const store = openStore('td-demo');
  let files = new Map();
  const dirs = new Set();
  let seq = 0;
  const nextId = () => `demo-${Date.now().toString(36)}-${(seq++).toString(36)}`;
  const now = () => new Date().toISOString();

  const save = () => store.set('files', [...files.values()]).catch(() => {});

  function addFile(dir, name, data, mimeType) {
    const f = { id: nextId(), name, dir, mimeType, modifiedTime: now(), data };
    files.set(f.id, f);
    dirs.add(dir);
    return f;
  }

  function seed() {
    files = new Map();
    for (const [name, make] of Object.entries(ART)) addFile(ATTACH_DIR, name, make(), 'image/svg+xml');
    for (const n of seedNotes()) {
      const dir = n.meta.status === 'inbox' ? INBOX_DIR : n.meta.category;
      n.meta.updated = n.meta.created;
      addFile(dir, fileNameFor(n.meta), serializeNote(n), 'text/markdown');
    }
    save();
  }

  const pub = (f) => ({ id: f.id, name: f.name, dir: f.dir, mimeType: f.mimeType, modifiedTime: f.modifiedTime });

  return {
    kind: 'demo',
    canOcr: false,
    async init() {
      const saved = await store.get('files');
      if (saved?.length) {
        files = new Map(saved.map((f) => [f.id, f]));
        for (const f of saved) dirs.add(f.dir);
      } else {
        seed();
      }
      dirs.add(INBOX_DIR);
      return { name: '체험 중', email: '' };
    },
    async reset() { await store.clear(); dirs.clear(); seed(); dirs.add(INBOX_DIR); },
    async list() {
      return { dirs: [...dirs], files: [...files.values()].map(pub) };
    },
    async readText(id) {
      const f = files.get(id);
      if (!f) throw new Error('카드를 찾지 못했어요.');
      return typeof f.data === 'string' ? f.data : f.data.text();
    },
    async readBlob(id) {
      const f = files.get(id);
      if (!f) throw new Error('첨부 파일을 찾지 못했어요.');
      return f.data;
    },
    async writeNote({ id, dir, name, text }) {
      if (id && files.has(id)) {
        const f = files.get(id);
        Object.assign(f, { dir, name, data: text, modifiedTime: now() });
        dirs.add(dir);
        save();
        return pub(f);
      }
      const f = addFile(dir, name, text, 'text/markdown');
      save();
      return pub(f);
    },
    async trash(id) { files.delete(id); save(); },
    async uploadAttachment(blob, name) {
      const f = addFile(ATTACH_DIR, name, blob, blob.type);
      save();
      return pub(f);
    },
    async ocr() { return ''; },
  };
}
