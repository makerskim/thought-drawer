// 가짜 구글 드라이브: 앱이 쓰는 드라이브 API 만큼을 실제처럼 흉내 낸다.
// 폴더·부모 관계, 휴지통, 없는 부모를 가리키면 404, 요청마다 조금씩 늦게 답하기(폰 인터넷처럼).
// 공유 시험(share.e2e.cjs)이 「실제로 드라이브의 어느 폴더에 무엇이 저장됐는지」를 확인할 때 쓴다.
const FOLDER = 'application/vnd.google-apps.folder';

exports.fakeDrive = ({ latency = 120, owner = { email: 'me@example.com', name: '나' } } = {}) => {
  const files = new Map();
  const log = [];
  let seq = 0;
  const now = () => new Date(Date.now() + seq).toISOString();
  const add = (f) => {
    const id = f.id ?? `id${++seq}`;
    const x = { trashed: false, parents: [], appProperties: {}, data: Buffer.alloc(0), mimeType: 'application/octet-stream', ...f, id, modifiedTime: now() };
    files.set(id, x);
    return x;
  };
  const pub = (f) => ({ id: f.id, name: f.name, parents: f.parents, mimeType: f.mimeType, modifiedTime: f.modifiedTime, size: String(f.data?.length ?? 0), appProperties: f.appProperties });
  const unq = (s) => s.replace(/\\'/g, "'").replace(/\\\\/g, '\\');

  // 드라이브 검색 글(q)을 앱이 쓰는 꼴만큼 읽는다
  function matches(f, q) {
    if (q.includes("appProperties has { key='tdRole' and value='root' }")) return f.appProperties?.tdRole === 'root' && !f.trashed;
    return q.split(' and ').every((c) => {
      c = c.trim();
      let m;
      if (c === 'trashed=false') return !f.trashed;
      if ((m = /^mimeType='(.*)'$/.exec(c))) return f.mimeType === m[1];
      if ((m = /^mimeType!='(.*)'$/.exec(c))) return f.mimeType !== m[1];
      if ((m = /^name='((?:[^'\\]|\\.)*)'$/.exec(c))) return f.name === unq(m[1]);
      if ((m = /^'(.*)' in parents$/.exec(c))) return f.parents.includes(m[1]);
      throw new Error(`fakeDrive: 모르는 조건 ${c}`);
    });
  }
  const parentOk = (id) => id === 'root' || (files.get(id)?.mimeType === FOLDER && !files.get(id).trashed);

  function multipart(buf, ctype) {
    const boundary = /boundary=([^;]+)/.exec(ctype)?.[1];
    const parts = [];
    let at = buf.indexOf(`--${boundary}`);
    while (at >= 0) {
      const start = at + boundary.length + 2;
      const next = buf.indexOf(`\r\n--${boundary}`, start);
      if (next < 0) break;
      const chunk = buf.subarray(start, next);
      const head = chunk.indexOf('\r\n\r\n');
      if (head >= 0) parts.push({ headers: chunk.subarray(0, head).toString(), body: chunk.subarray(head + 4) });
      at = next + 2;
    }
    const meta = JSON.parse(parts[0].body.toString());
    const type = /Content-Type:\s*([^\r\n;]+)/i.exec(parts[1]?.headers ?? '')?.[1] ?? meta.mimeType;
    return { meta, data: parts[1]?.body ?? Buffer.alloc(0), type };
  }

  async function handle(route) {
    const req = route.request();
    const u = new URL(req.url());
    const method = req.method();
    log.push(`${method} ${u.pathname}`);
    await new Promise((r) => setTimeout(r, latency));
    const json = (obj, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(obj) });
    const fail = (status, message) => json({ error: { code: status, message, errors: [{ reason: status === 404 ? 'notFound' : 'invalid', message }] } }, status);
    if (u.pathname === '/oauth2/v3/userinfo') return json(owner);
    let m;
    if (u.pathname === '/drive/v3/about') return json({ storageQuota: { limit: String(15 * 1024 ** 3), usage: '1000', usageInDrive: '1000' } });
    if (u.pathname === '/drive/v3/files' && method === 'GET') {
      const q = u.searchParams.get('q') ?? '';
      for (const pm of q.matchAll(/'([^']+)' in parents/g)) if (!parentOk(pm[1])) return fail(404, `File not found: ${pm[1]}.`);
      return json({ files: [...files.values()].filter((f) => matches(f, q)).map(pub) });
    }
    if (u.pathname === '/drive/v3/files' && method === 'POST') {
      const meta = JSON.parse(req.postData() || '{}');
      if (!(meta.parents ?? []).every(parentOk)) return fail(404, `File not found: ${meta.parents}.`);
      return json(pub(add({ name: meta.name, mimeType: meta.mimeType, parents: meta.parents ?? [], appProperties: meta.appProperties ?? {} })));
    }
    if (u.pathname === '/upload/drive/v3/files' && method === 'POST') {
      const { meta, data, type } = multipart(req.postDataBuffer(), req.headers()['content-type']);
      if (!(meta.parents ?? []).every(parentOk)) return fail(404, `File not found: ${meta.parents}.`);
      return json(pub(add({ name: meta.name, mimeType: meta.mimeType || type, parents: meta.parents ?? [], data })));
    }
    if ((m = /^\/upload\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname)) && method === 'PATCH') {
      const f = files.get(m[1]);
      if (!f) return fail(404, 'File not found.');
      const { meta, data } = multipart(req.postDataBuffer(), req.headers()['content-type']);
      const addP = u.searchParams.get('addParents');
      const rmP = u.searchParams.get('removeParents');
      if (addP && !parentOk(addP)) return fail(404, `File not found: ${addP}.`);
      if (rmP && !f.parents.includes(rmP)) return fail(400, 'removeParents: not a parent');
      if (rmP) f.parents = f.parents.filter((p) => p !== rmP);
      if (addP) f.parents = [...f.parents, addP];
      Object.assign(f, { name: meta.name ?? f.name, data, modifiedTime: new Date(Date.now() + ++seq).toISOString() });
      return json(pub(f));
    }
    if ((m = /^\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname))) {
      const f = files.get(m[1]);
      if (!f) return fail(404, 'File not found.');
      if (method === 'GET' && u.searchParams.get('alt') === 'media') return route.fulfill({ status: 200, contentType: f.mimeType, body: f.data });
      if (method === 'PATCH') { Object.assign(f, JSON.parse(req.postData() || '{}')); return json(pub(f)); }
      if (method === 'DELETE') { files.delete(f.id); return route.fulfill({ status: 204, body: '' }); }
    }
    return fail(400, `fakeDrive: 모르는 요청 ${method} ${u.pathname}`);
  }

  // 「메모/00_인박스/…md」 같은 실제 경로 (휴지통 빼고)
  const pathOf = (f) => {
    const names = [f.name];
    let p = f.parents[0];
    for (let i = 0; i < 12 && p && p !== 'root'; i++) { const d = files.get(p); if (!d) return `(부모 없음)/${names.join('/')}`; names.unshift(d.name); p = d.parents[0]; }
    return p === 'root' ? names.join('/') : `(부모 없음)/${names.join('/')}`;
  };
  const live = () => [...files.values()].filter((f) => !f.trashed);
  return {
    handle,
    log,
    files,
    paths: () => live().map(pathOf).sort(),
    notes: () => live().filter((f) => f.name.endsWith('.md') && !pathOf(f).includes('/_시스템/')).map((f) => ({ path: pathOf(f), text: f.data.toString() })),
    // 앱을 써 오던 사람의 드라이브: 「메모」 폴더와 노트 n개
    seed(n = 0) {
      const root = add({ name: '메모', mimeType: FOLDER, parents: ['root'], appProperties: { tdRole: 'root' } });
      const inbox = add({ name: '00_인박스', mimeType: FOLDER, parents: [root.id] });
      const food = add({ name: '요리·맛집', mimeType: FOLDER, parents: [root.id] });
      for (let i = 0; i < n; i++) {
        const id = `202610${String(1 + (i % 28)).padStart(2, '0')}${String(100000 + i).slice(-6)}`;
        add({ name: `${id} 예전 노트 ${i}.md`, mimeType: 'text/markdown', parents: [i % 3 ? food.id : inbox.id],
          data: Buffer.from(`---\nid: "${id}"\ntitle: "예전 노트 ${i}"\ntype: "memo"\nstatus: "${i % 3 ? 'organized' : 'inbox'}"\n${i % 3 ? 'category: "요리·맛집"\n' : ''}created: "2026-10-01T10:00:00"\n---\n\n김치찌개 레시피 ${i}\n`) });
      }
      return root;
    },
  };
};
