// 사진 넣기: 어디서든(버튼, 붙여넣기, 끌어다 놓기) 같은 흐름으로 인박스에 저장한다
import { app, toast } from './state.js';
import { go, noteHref } from './router.js';

export async function capturePhotos(files, memo = '') {
  const list = [...files].filter((f) => f.type?.startsWith('image/'));
  if (!list.length) { toast('사진 파일만 넣을 수 있어요.'); return []; }
  const t = toast(list.length > 1 ? `사진 ${list.length}장을 올리는 중` : '사진을 올리는 중', { busy: true });
  const made = [];
  try {
    for (let i = 0; i < list.length; i++) {
      const n = await app.lib.addCapture(list[i], i === 0 ? memo : '', (step) => {
        t.update(list.length > 1 ? `${i + 1}/${list.length}장, ${step}` : step, { busy: true });
      });
      made.push(n);
    }
    const one = made.length === 1;
    t.update(one ? '사진을 인박스에 저장했어요.' : `사진 ${made.length}장을 인박스에 저장했어요.`, {
      action: '열기', onAction: () => go(one ? noteHref(made[0].id) : '#/inbox'), duration: 5000,
    });
  } catch (e) {
    t.update(`사진을 올리지 못했어요. ${e.message}`, { duration: 6000 });
  }
  return made;
}

let input;
export function pickPhotos(memo = '') {
  input?.remove();
  input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.hidden = true;
  input.onchange = () => { if (input.files.length) capturePhotos(input.files, memo); };
  document.body.append(input);
  input.click();
}
