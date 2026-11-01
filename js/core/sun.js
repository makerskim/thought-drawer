// 해 뜨고 지는 시각 (NOAA 근사식, 몇 분 오차). 밝기 「자동」이 낮엔 밝게, 밤엔 어둡게 바꿀 때 쓴다.
// 위치를 묻지 않으려고 기기 시간대로 경도를 어림한다. 한국 시간대(UTC+9)면 서울(37.57, 126.98)을 쓴다.
const rad = (d) => (d * Math.PI) / 180;

// → { rise, set } 그 날 0시부터 몇 분 (기기 시간)
export function sunTimes(date = new Date(), { lat, lon, tz } = {}) {
  const offset = tz ?? -date.getTimezoneOffset(); // 분, 한국 +540
  const la = lat ?? (offset === 540 ? 37.57 : 37.5);
  const lo = lon ?? (offset === 540 ? 126.98 : (offset / 60) * 15);
  const start = Date.UTC(date.getFullYear(), 0, 1);
  const n = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - start) / 86_400_000) + 1;
  const g = ((2 * Math.PI) / 365) * (n - 1);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const c = Math.cos(rad(90.833)) / (Math.cos(rad(la)) * Math.cos(decl)) - Math.tan(rad(la)) * Math.tan(decl);
  const ha = (Math.acos(Math.min(1, Math.max(-1, c))) * 180) / Math.PI; // 백야·극야면 0 또는 180
  const rise = 720 - 4 * (lo + ha) - eq + offset;
  const set = 720 - 4 * (lo - ha) - eq + offset;
  return { rise: Math.round(rise), set: Math.round(set) };
}

// 지금 낮인가 → 'light' | 'dark'
export function themeByTime(date = new Date(), where) {
  const { rise, set } = sunTimes(date, where);
  const m = date.getHours() * 60 + date.getMinutes();
  return m >= rise && m < set ? 'light' : 'dark';
}
