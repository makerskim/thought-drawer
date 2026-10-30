// 노트 본문의 체크 상자(- [ ] 할 일)를 찾고 끄고 켠다. 「할 일」 모아 보기와 오늘 노트가 쓴다.
const TASK = /^(\s*[-*+] \[)( |x|X)(\] )(.*\S.*)$/;

// [{ line, done, text }] (줄 번호는 0부터, 「## 연결」 아래는 보지 않는다)
export function findTasks(body) {
  const out = [];
  const lines = String(body ?? '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (/^## 연결\s*$/.test(lines[i])) break;
    const m = TASK.exec(lines[i]);
    if (m) out.push({ line: i, done: m[2] !== ' ', text: m[4].trim() });
  }
  return out;
}

export const openTasks = (body) => findTasks(body).filter((t) => !t.done);

// line 줄의 체크 상자를 done 으로. 그 줄이 그새 바뀌었으면(text가 다르면) null
export function setTask(body, line, done, text) {
  const lines = String(body ?? '').split('\n');
  const m = TASK.exec(lines[line] ?? '');
  if (!m || (text !== undefined && m[4].trim() !== text)) return null;
  lines[line] = `${m[1]}${done ? 'x' : ' '}${m[3]}${m[4]}`;
  return lines.join('\n');
}
