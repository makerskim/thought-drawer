// 화면 시험용 노트 묶음 (메모리 저장소에 넣는다). 사진은 여기서 PNG로 그린다.
import { deflateSync } from 'node:zlib';
import { serializeNote, fileNameFor } from '../../js/core/note.js';
import { INBOX_DIR, ATTACH_DIR } from '../../js/config.js';

function png(w, h, draw) {
  const px = Buffer.alloc(w * h * 4);
  const set = (x, y, [r, g, b]) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255; };
  const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(x, y, c); };
  const ellipse = (cx, cy, rx, ry, c) => { for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) set(x, y, c); };
  draw({ rect, ellipse });
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return `data:image/png;base64,${Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]).toString('base64')}`;
}

const shirt = png(360, 300, ({ rect, ellipse }) => {
  rect(0, 0, 360, 300, [234, 230, 224]);
  rect(110, 60, 250, 270, [250, 249, 244]); rect(60, 70, 120, 170, [250, 249, 244]); rect(240, 70, 300, 170, [250, 249, 244]);
  for (const y of [100, 140, 180, 220]) ellipse(180, y, 4, 4, [150, 150, 145]);
});
const bowl = png(360, 300, ({ rect, ellipse }) => {
  rect(0, 0, 360, 300, [222, 214, 200]);
  ellipse(180, 170, 120, 70, [40, 36, 34]); ellipse(180, 140, 112, 34, [205, 170, 110]); rect(60, 170, 300, 172, [40, 36, 34]);
});
const receipt = png(300, 380, ({ rect }) => {
  rect(0, 0, 300, 380, [245, 245, 242]); rect(40, 30, 260, 350, [255, 255, 255]);
  for (let y = 60; y < 330; y += 28) rect(60, y, 60 + ((y * 7) % 140) + 40, y + 8, [190, 190, 186]);
});

let seq = 0;
const at = (d) => d.replace(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)$/, '$1-$2-$3T$4:$5:$6+09:00');
function note(id, meta, body) {
  const m = { id, type: 'memo', status: 'organized', created: at(id), updated: at(id), ...meta };
  for (const k of Object.keys(m)) if (m[k] === undefined) delete m[k];
  const dir = m.status === 'inbox' ? INBOX_DIR : m.category;
  seq++;
  return { dir, name: fileNameFor(m), text: serializeNote({ meta: m, body }) };
}

export const seed = {
  profile: { name: '나', email: 'me@example.com' },
  files: [
    note('20261020093000', { title: '흰색 옥스포드 셔츠', type: 'capture', category: '패션/상의', tags: ['셔츠', '위시리스트'], summary: '오크우드 스튜디오 옥스포드 셔츠 59,000원, 100 사이즈가 맞음.', attachments: ['20261020093000.png'] },
      '![[20261020093000.png]]\n\n매장에서 입어봤는데 100이 어깨에 맞았다. 기장이 짧아 넣어 입지 않아도 된다.\n\n## 사진 속 글자\n옥스포드 셔츠 59,000'),
    note('20261018190000', { title: '들기름 막국수', type: 'capture', category: '요리/레시피', tags: ['면요리'], attachments: ['20261018190000.png'] },
      '![[20261018190000.png]]\n\n메밀면 삶아 찬물에 헹구고 들기름, 간장, 김가루. 10분이면 끝.'),
    note('20261012120000', { title: '토마토 달걀볶음', category: '요리/레시피', tags: ['10분요리'] }, '토마토를 먼저 볶아 즙을 내고 달걀은 따로 반숙으로.'),
    note('20261001100000', { title: '제주 동쪽 카페 7곳', type: 'bookmark', category: '여행/제주', source: 'https://brunch.co.kr/@jeju/42', tags: ['카페'] }, '세화, 월정리 쪽 바다가 보이는 카페 정리 글.'),
    note('20260920090000', { title: '제텔카스텐은 연결이 핵심', type: 'bookmark', category: '공부/메모법', source: 'https://medium.com/@notes/zettel' }, '한 장에 생각 하나, 고유 번호, 다른 메모와의 연결이 있어야 다시 살아난다.'),
    note('20261026180000', { title: '오크우드 시즌오프', type: 'capture', category: '패션/쇼핑', attachments: ['20261026180000.png'] }, '![[20261026180000.png]]\n\n10.28~11.03 최대 40%, 옥스포드 셔츠 35,400원.'),
    note('20261022120000', { title: '가을 레이어드 코디', category: '패션/코디', tags: ['출근룩'] }, '흰 셔츠에 차콜 가디건, 그레이 스니커즈로 마무리하는 출근룩.'),
    note('20261027100000', { title: '', type: 'instagram', status: 'inbox', author: 'homecafe.kim', source: 'https://www.instagram.com/reel/ABC123/' }, 'homecafe.kim의 릴스를 저장했어요.\n\n집에서 만드는 바닐라 라떼 레시피, 시럽은 설탕과 바닐라빈.'),
    note('20261028090000', { title: '', status: 'inbox' }, '주말에 성수 팝업 가볼 것. 오크우드 매장도 근처.'),
    note('20261029083000', { title: '', type: 'bookmark', status: 'inbox', source: 'https://www.coupang.com/vp/products/7012' }, '전기 포트 최저가 비교'),
    note('20261029220000', { title: '분기 회의 준비', status: 'inbox' }, '- [ ] 지난 분기 숫자 정리\n- [ ] 발표 자료 초안\n- [x] 회의실 예약'),
  ],
};
seed.files.push(
  { dir: ATTACH_DIR, name: '20261020093000.png', dataUrl: shirt },
  { dir: ATTACH_DIR, name: '20261018190000.png', dataUrl: bowl },
  { dir: ATTACH_DIR, name: '20261026180000.png', dataUrl: receipt },
);
