// Drives a bot through every level in headless Chromium to prove each one is
// completable with the shipped controls and physics, and saves screenshots
// to tests/out/. Run with `npm test` (needs playwright installed).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'tests', 'out');
fs.mkdirSync(OUT, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

// Bot routes: legs the bot walks in order. `x` is the target; `turns` is how
// many level rotations must have completed before the leg counts as done
// (standing on a button triggers one); `jumpAt` presses jump near that x.
const ROUTES = [
  [{ x: 1, turns: 1 }, { x: 11.75 }],
  [{ x: 1, turns: 1 }, { x: 11.75 }],
  [{ x: -1, turns: 1 }, { x: 3, turns: 2 }, { x: 13.75 }],
];

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.waitForFunction(() => window.game && window.gameControl);
await page.evaluate(() => { window.gameControl.setAutoRun(false); window.game.start(); });

let failed = false;
for (let i = 0; i < ROUTES.length; i++) {
  const route = ROUTES[i];
  const result = await page.evaluate(async ({ i, route }) => {
    const g = window.game, c = window.gameControl;
    g.keys.clear();
    g.state = 'playing';
    g.loadLevel(i);
    const dt = 1 / 60;
    let steps = 0;
    const log = [];
    let shotTaken = false;
    for (const leg of route) {
      let legSteps = 0, jumped = false;
      while (true) {
        const x = g.body.pos[0];
        const d = leg.x - x;
        const turnsDone = g.rotations >= (leg.turns || 0) && !g.rotation;
        if (Math.abs(d) < 0.2 && g.body.grounded && turnsDone) break;
        if (g.state === 'complete') break;
        g.keys.clear();
        if (!g.rotation) {
          if (d > 0.08) g.keys.add('KeyD'); else if (d < -0.08) g.keys.add('KeyA');
          if (leg.jumpAt !== undefined && !jumped && g.body.grounded && Math.abs(leg.jumpAt - x) < 0.3) {
            g.keys.add('Space'); jumped = true;
          }
        }
        c.step(dt);
        if (steps % 10 === 0) c.render();
        if (g.rotation && g.rotation.t > 0.45 && g.rotation.t < 0.55 && !shotTaken) {
          c.render(); shotTaken = true; window.__midTurn = true;
          await new Promise((r) => setTimeout(r, 0));
        }
        steps++; legSteps++;
        if (g.deaths > 0) { g.keys.clear(); return { ok: false, why: `fell during leg to x=${leg.x}`, at: g.body.pos, log }; }
        if (legSteps > 60 * 15) { g.keys.clear(); return { ok: false, why: `timed out on leg to x=${leg.x}`, at: g.body.pos, log }; }
      }
      log.push({ x: leg.x, at: g.body.pos.map((v) => +v.toFixed(2)), turns: g.rotations, t: +(steps / 60).toFixed(2) });
      if (g.state === 'complete') break;
    }
    g.keys.clear();
    c.render();
    return { ok: g.state === 'complete', why: g.state, at: g.body.pos, log, time: steps / 60, tris: g.renderer.solid.triangles, axes: [0, 2, 3].map((k) => g.axisLabel(k)) };
  }, { i, route });
  console.log(`level ${i + 1}: ${result.ok ? 'solved' : 'FAILED'} (${result.why}) in ${result.time?.toFixed?.(1) ?? '?'} s, ${result.tris ?? '?'} tris, axes ${result.axes?.join(' ') ?? '?'}`);
  for (const l of result.log) console.log('   reached x', l.x, 'at', l.at, `turns=${l.turns} t=${l.t}`);
  if (!result.ok) { failed = true; console.log('   pos', result.at); }
  await page.screenshot({ path: path.join(OUT, `level${i + 1}-end.png`) });
}

// Snapshots: start of each level, and mid-rotation on level 1.
for (let i = 0; i < ROUTES.length; i++) {
  await page.evaluate((i) => {
    const g = window.game; g.keys.clear(); g.state = 'playing'; g.loadLevel(i);
    g.hud.flashUntil = 0; g.hud.el.flash.hidden = true;
    for (let k = 0; k < 30; k++) window.gameControl.step(1 / 60);
    window.gameControl.render();
  }, i);
  await page.screenshot({ path: path.join(OUT, `level${i + 1}-start.png`) });
}
await page.evaluate(() => {
  const g = window.game; g.keys.clear(); g.state = 'playing'; g.loadLevel(0);
  g.keys.add('KeyD');
  for (let k = 0; k < 600 && !g.rotation; k++) window.gameControl.step(1 / 60);
  g.keys.clear();
  for (let k = 0; k < 24; k++) window.gameControl.step(1 / 60);
  window.gameControl.render();
});
await page.screenshot({ path: path.join(OUT, 'level1-midturn.png') });

await browser.close();
server.close();
if (errors.length) { console.log('page errors:', errors); failed = true; }
console.log(failed ? 'FAIL' : 'PASS');
process.exit(failed ? 1 : 0);
