// 크롬 확장 프로그램 맞추기: 웹앱과 같은 코드(노트 형식, 드라이브 저장소)를 extension/app/ 에 복사하고,
// 받기용 zip(downloads/thought-drawer-chrome.zip)을 만든다. 웹앱 코드를 바꿨으면 다시 실행한다.
//   node tools/sync-extension.mjs
// zip은 같은 파일이면 언제 만들어도 똑같은 바이트가 나오도록 날짜를 고정한다.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const EXT = join(ROOT, 'extension');
export const ZIP = join(ROOT, 'downloads', 'thought-drawer-chrome.zip');
const ZIP_DIR = 'thought-drawer-chrome';

// 웹앱 경로 → 확장 프로그램 경로 (서로 부르는 상대 경로가 그대로 맞도록 같은 모양으로 둔다)
export const SHARED = [
  ['js/config.js', 'app/config.js'],
  ['js/core/note.js', 'app/core/note.js'],
  ['js/core/instagram.js', 'app/core/instagram.js'],
  ['js/core/compose.js', 'app/core/compose.js'],
  ['js/store/drive.js', 'app/store/drive.js'],
  ['js/store/auth.js', 'app/store/auth.js'],
];

export function syncShared() {
  for (const [from, to] of SHARED) {
    const dest = join(EXT, to);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, readFileSync(join(ROOT, from)));
  }
}

function walk(dir) {
  return readdirSync(dir).sort().flatMap((name) => {
    const p = join(dir, name);
    if (name.startsWith('.')) return [];
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// 2026-01-01 00:00 (DOS 형식)
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
const DOS_TIME = 0;

export function buildZip() {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of walk(EXT)) {
    const name = Buffer.from(`${ZIP_DIR}/${relative(EXT, file).split('\\').join('/')}`, 'utf8');
    const data = readFileSync(file);
    const packed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // 파일 이름은 UTF-8
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, packed);
    centrals.push(central, name);
    offset += local.length + name.length + packed.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(centrals.length / 2, 8);
  end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  syncShared();
  const zip = buildZip();
  mkdirSync(dirname(ZIP), { recursive: true });
  writeFileSync(ZIP, zip);
  console.log(`extension/app 에 ${SHARED.length}개 파일을 맞추고 ${relative(ROOT, ZIP)} (${Math.round(zip.length / 1024)}KB)를 만들었어요.`);
}
