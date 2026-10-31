// README 스크린샷 만들기: npm run screens (npm run serve 를 켜 둔 채)
const path = require('path');
const { open, launch } = require('./harness.cjs');
const out = path.resolve(__dirname, '../../docs/screens');
(async () => {
  const b = await launch();
  const shot = async (name, opts, act) => {
    const p = await open(b, opts);
    await p.waitForSelector('.row .poster, .tour-card', { timeout: 10000 });
    if (act) await act(p);
    await p.waitForTimeout(900);
    await p.screenshot({ path: `${out}/${name}.png` });
    await p.context().close();
  };
  const desk = { viewport: { width: 1440, height: 900 } };
  await shot('home', desk);
  await shot('rows', desk, async (p) => { await p.evaluate(() => window.scrollTo(0, document.querySelector('.rows.drawers').offsetTop - 70)); });
  await shot('note', desk, async (p) => { await p.evaluate(() => { location.hash = '#/n/20261020093000'; }); await p.waitForSelector('.ws .props'); await p.click('.rp-tabs button:has-text("그래프")'); await p.evaluate(() => document.activeElement?.blur()); });
  await shot('spotlight', desk, async (p) => { await p.keyboard.press('Control+k'); await p.waitForSelector('.spot'); await p.keyboard.type('셔츠'); });
  await shot('mobile', { viewport: { width: 390, height: 844 } });
  await shot('tour', { ...desk, tutorial: true }, async (p) => { await p.click('.tour-card .btn-primary'); await p.waitForTimeout(400); });
  await b.close();
})();
