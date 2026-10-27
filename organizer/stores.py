"""정리기가 카드를 읽고 쓰는 저장소.

- DriveStore: 구글 드라이브 「메모」 폴더 (예약 작업에서 쓰는 기본값)
- LocalStore: PC에 동기화된 폴더나 시험용 폴더

둘 다 같은 함수를 갖는다: list, read_text, read_bytes, write_note, write_file, search_text.
파일 하나는 {'id', 'name', 'dir', 'modifiedTime'} 사전으로 다룬다. dir은 「메모」 아래 경로.
"""
from __future__ import annotations

import json
import os
import shutil
import ssl
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT_FOLDER = '메모'
FOLDER_MIME = 'application/vnd.google-apps.folder'
API = 'https://www.googleapis.com/drive/v3'
UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
FIELDS = 'id,name,parents,mimeType,modifiedTime'


def _ssl_context():
    cafile = os.environ.get('SSL_CERT_FILE') or os.environ.get('REQUESTS_CA_BUNDLE')
    return ssl.create_default_context(cafile=cafile) if cafile and os.path.exists(cafile) else ssl.create_default_context()


class DriveError(RuntimeError):
    pass


class DriveStore:
    def __init__(self, client_id: str, client_secret: str, refresh_token: str):
        self._cred = (client_id, client_secret, refresh_token)
        self._token = None
        self._ctx = _ssl_context()
        self.root_id = None
        self.dir_ids: dict[str, str] = {}
        self.dir_of: dict[str, str] = {}

    @classmethod
    def from_env(cls) -> 'DriveStore':
        missing = [k for k in ('TD_GOOGLE_CLIENT_ID', 'TD_GOOGLE_CLIENT_SECRET', 'TD_GOOGLE_REFRESH_TOKEN') if not os.environ.get(k)]
        if missing:
            raise DriveError('환경 변수가 없어요: ' + ', '.join(missing) + ' (docs/설정가이드.md 4단계 참고)')
        return cls(os.environ['TD_GOOGLE_CLIENT_ID'], os.environ['TD_GOOGLE_CLIENT_SECRET'], os.environ['TD_GOOGLE_REFRESH_TOKEN'])

    # --- HTTP ---------------------------------------------------------------
    def _auth(self):
        cid, secret, refresh = self._cred
        data = urllib.parse.urlencode({'client_id': cid, 'client_secret': secret, 'refresh_token': refresh, 'grant_type': 'refresh_token'}).encode()
        try:
            with urllib.request.urlopen('https://oauth2.googleapis.com/token', data=data, timeout=20, context=self._ctx) as r:
                self._token = json.load(r)['access_token']
        except urllib.error.HTTPError as e:
            raise DriveError(f'구글 인증 실패 ({e.code}): {e.read().decode(errors="replace")[:200]} — 새 토큰이 필요할 수 있어요.') from e

    def _call(self, method: str, url: str, body: bytes | None = None, headers: dict | None = None, raw: bool = False):
        if not self._token:
            self._auth()
        for attempt in range(2):
            req = urllib.request.Request(url, data=body, method=method, headers={**(headers or {}), 'Authorization': f'Bearer {self._token}'})
            try:
                with urllib.request.urlopen(req, timeout=60, context=self._ctx) as r:
                    data = r.read()
                    if raw:
                        return data
                    return json.loads(data) if data else None
            except urllib.error.HTTPError as e:
                if e.code == 401 and attempt == 0:
                    self._auth()
                    continue
                raise DriveError(f'드라이브 요청 실패 {method} {url.split("?")[0]} ({e.code}): {e.read().decode(errors="replace")[:300]}') from e
        return None

    def _list(self, q: str) -> list[dict]:
        out, token = [], None
        while True:
            p = {'q': q, 'fields': f'nextPageToken,files({FIELDS},appProperties)', 'pageSize': '1000', 'spaces': 'drive'}
            if token:
                p['pageToken'] = token
            r = self._call('GET', f'{API}/files?{urllib.parse.urlencode(p)}')
            out += r.get('files', [])
            token = r.get('nextPageToken')
            if not token:
                return out

    def _multipart(self, meta: dict, content: bytes, mime: str):
        boundary = 'td' + uuid.uuid4().hex
        body = (
            f'--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{json.dumps(meta)}\r\n'
            f'--{boundary}\r\nContent-Type: {mime}\r\n\r\n'
        ).encode() + content + f'\r\n--{boundary}--'.encode()
        return body, {'Content-Type': f'multipart/related; boundary={boundary}'}

    # --- 폴더 ---------------------------------------------------------------
    def _ensure_root(self):
        if self.root_id:
            return
        hits = self._list("appProperties has { key='tdRole' and value='root' } and trashed=false")
        if hits:
            self.root_id = hits[0]['id']
        else:
            f = self._call('POST', f'{API}/files?fields={FIELDS}', json.dumps({'name': ROOT_FOLDER, 'mimeType': FOLDER_MIME, 'parents': ['root'], 'appProperties': {'tdRole': 'root'}}).encode(), {'Content-Type': 'application/json'})
            self.root_id = f['id']
        self.dir_ids[''] = self.root_id
        self.dir_of[self.root_id] = ''

    def ensure_dir(self, path: str) -> str:
        self._ensure_root()
        if path in self.dir_ids:
            return self.dir_ids[path]
        cur, parent = '', self.root_id
        for part in [p for p in path.split('/') if p]:
            cur = f'{cur}/{part}' if cur else part
            if cur not in self.dir_ids:
                f = self._call('POST', f'{API}/files?fields={FIELDS}', json.dumps({'name': part, 'mimeType': FOLDER_MIME, 'parents': [parent]}).encode(), {'Content-Type': 'application/json'})
                self.dir_ids[cur] = f['id']
                self.dir_of[f['id']] = cur
            parent = self.dir_ids[cur]
        return parent

    # --- 공통 함수 ------------------------------------------------------------
    def list(self) -> list[dict]:
        self._ensure_root()
        folders = self._list(f"mimeType='{FOLDER_MIME}' and trashed=false")
        by_id = {f['id']: f for f in folders}

        def path_of(fid, depth=0):
            if fid in self.dir_of:
                return self.dir_of[fid]
            f = by_id.get(fid)
            if not f or depth > 12:
                return None
            parent = path_of((f.get('parents') or [None])[0], depth + 1)
            if parent is None:
                return None
            p = f'{parent}/{f["name"]}' if parent else f['name']
            self.dir_of[fid] = p
            self.dir_ids[p] = fid
            return p

        for f in folders:
            path_of(f['id'])
        files = self._list(f"mimeType!='{FOLDER_MIME}' and trashed=false")
        out = []
        for f in files:
            d = self.dir_of.get((f.get('parents') or [None])[0])
            if d is not None:
                out.append({'id': f['id'], 'name': f['name'], 'dir': d, 'modifiedTime': f['modifiedTime'], 'mimeType': f.get('mimeType', '')})
        return out

    def read_text(self, fid: str) -> str:
        return self._call('GET', f'{API}/files/{fid}?alt=media', raw=True).decode('utf-8')

    def read_bytes(self, fid: str) -> bytes:
        return self._call('GET', f'{API}/files/{fid}?alt=media', raw=True)

    def write_note(self, fid: str | None, dir: str, name: str, text: str, from_dir: str | None = None) -> dict:
        content = text.encode('utf-8')
        if not fid:
            parent = self.ensure_dir(dir)
            body, h = self._multipart({'name': name, 'parents': [parent], 'mimeType': 'text/markdown'}, content, 'text/markdown')
            f = self._call('POST', f'{UPLOAD}/files?uploadType=multipart&fields={FIELDS}', body, h)
        else:
            p = {'uploadType': 'multipart', 'fields': FIELDS}
            if from_dir is not None and from_dir != dir:
                p['addParents'] = self.ensure_dir(dir)
                p['removeParents'] = self.ensure_dir(from_dir)
            body, h = self._multipart({'name': name}, content, 'text/markdown')
            f = self._call('PATCH', f'{UPLOAD}/files/{fid}?{urllib.parse.urlencode(p)}', body, h)
        return {'id': f['id'], 'name': f['name'], 'dir': dir, 'modifiedTime': f['modifiedTime']}

    def write_file(self, dir: str, name: str, content: bytes, mime: str, existing_id: str | None = None) -> dict:
        if existing_id:
            body, h = self._multipart({'name': name}, content, mime)
            f = self._call('PATCH', f'{UPLOAD}/files/{existing_id}?uploadType=multipart&fields={FIELDS}', body, h)
        else:
            parent = self.ensure_dir(dir)
            body, h = self._multipart({'name': name, 'parents': [parent]}, content, mime)
            f = self._call('POST', f'{UPLOAD}/files?uploadType=multipart&fields={FIELDS}', body, h)
        return {'id': f['id'], 'name': f['name'], 'dir': dir, 'modifiedTime': f['modifiedTime']}

    def search_text(self, needle: str) -> list[str]:
        safe = needle.replace("\\", "\\\\").replace("'", "\\'")
        return [f['id'] for f in self._list(f"fullText contains '{safe}' and mimeType='text/markdown' and trashed=false")]


class LocalStore:
    """폴더 하나를 「메모」 폴더처럼 다룬다. 파일 id는 상대 경로."""

    def __init__(self, root: str | Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _mtime(p: Path) -> str:
        return datetime.fromtimestamp(p.stat().st_mtime_ns / 1e9, tz=timezone.utc).isoformat(timespec='microseconds').replace('+00:00', 'Z')

    def _info(self, p: Path) -> dict:
        rel = p.relative_to(self.root)
        d = '/'.join(rel.parts[:-1])
        return {'id': rel.as_posix(), 'name': p.name, 'dir': d, 'modifiedTime': self._mtime(p), 'mimeType': ''}

    def list(self) -> list[dict]:
        return [self._info(p) for p in sorted(self.root.rglob('*')) if p.is_file() and not p.name.startswith('.')]

    def read_text(self, fid: str) -> str:
        return (self.root / fid).read_text(encoding='utf-8')

    def read_bytes(self, fid: str) -> bytes:
        return (self.root / fid).read_bytes()

    def write_note(self, fid: str | None, dir: str, name: str, text: str, from_dir: str | None = None) -> dict:
        target = self.root / dir / name
        target.parent.mkdir(parents=True, exist_ok=True)
        if fid and (self.root / fid).resolve() != target.resolve():
            shutil.move(str(self.root / fid), str(target))
        target.write_text(text, encoding='utf-8')
        return self._info(target)

    def write_file(self, dir: str, name: str, content: bytes, mime: str, existing_id: str | None = None) -> dict:
        target = self.root / dir / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        return self._info(target)

    def search_text(self, needle: str) -> list[str]:
        out = []
        for p in self.root.rglob('*.md'):
            try:
                if needle in p.read_text(encoding='utf-8'):
                    out.append(p.relative_to(self.root).as_posix())
            except OSError:
                pass
        return out
