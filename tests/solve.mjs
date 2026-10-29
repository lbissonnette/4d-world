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

// Bot routes: legs walked in order. `to` is a world target (x, z, w); the bot
// steers with WASD in whatever direction it currently faces. `turns` waits
// for that many button-driven world turns; `snap` presses E (+1) or Q (-1)
// before the leg; `jumpAt` jumps when near that world point.
const ROUTES = [
  [{ to: [0, 3, 0] }, { to: [0, 10, 0], jumpAt: [0, 4.3, 0] }, { to: [0, 19, 0], jumpAt: [0, 12.3, 0] }],
  [{ to: [0, 0, 0], turns: 1 }, { to: [0, 10.75, 0] }],
  [{ to: [0, 0, 0], turns: 1 }, { to: [0, 9, 0], turns: 2 }, { to: [0, 19.75, 0] }],
  [{ snap: 1, to: [0, 0, 4.25], jumpAt: [0, 0, 1.3] }, { to: [0, 0, 8.25], jumpAt: [0, 0, 5.3] }, { to: [0, 0, 12.25], jumpAt: [0, 0, 9.3] }],
  [
    { to: [0, 4.5, 0], jumpAt: [0, 1.8, 0] },
    { snap: 1, to: [0, 4.5, 2.4], jumpAt: [0, 4.5, 0.6] },
    { snap: -1, to: [0, 9, 2.4], jumpAt: [0, 5.8, 2.4] },
    { snap: -1, to: [0, 9, -0.1], jumpAt: [0, 9, 1.6] },
    { snap: 1, to: [0, 13.5, -0.1], jumpAt: [0, 10.3, -0.1] },
    { snap: 1, to: [0, 13.5, 2.4] },
    { snap: -1, to: [0, 17.75, 2.4], jumpAt: [0, 14.8, 2.4] },
    { to: [0, 22, 2.4], jumpAt: [0, 18.8, 2.4] },
    { snap: -1, to: [0, 22, 0] },
  ],
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
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    for (const leg of route) {
      let legSteps = 0, jumped = false, snapped = !leg.snap;
      const from = g.body.pos.slice();
      const dir = [leg.to[0] - from[0], 0, leg.to[1] - from[2], leg.to[2] - from[3]];
      const dl = Math.hypot(dir[0], dir[2], dir[3]) || 1;
      dir[0] /= dl; dir[2] /= dl; dir[3] /= dl;
      while (true) {
        const p = g.body.pos;
        const d = [leg.to[0] - p[0], 0, leg.to[1] - p[2], leg.to[2] - p[3]];
        // Only the components the player can steer count (no strafing in w).
        const { r, f } = g.axes();
        const fw = dot(d, f), rt = dot(d, r);
        const dist = Math.hypot(fw, rt);
        const busy = g.rotation || g.snap;
        const turnsDone = g.rotations >= (leg.turns || 0);
        if (dist < 0.3 && g.body.grounded && turnsDone && !busy && snapped) break;
        if (g.state === 'complete') break;
        g.keys.clear();
        if (!busy) {
          if (!snapped) { g.snapTurn(leg.snap); snapped = true; }
          else {
            if (fw > 0.08) g.keys.add('KeyW'); else if (fw < -0.08) g.keys.add('KeyS');
            if (rt > 0.08) g.keys.add('KeyD'); else if (rt < -0.08) g.keys.add('KeyA');
            if (leg.jumpAt && !jumped && g.body.grounded) {
              // Jump once the player reaches the line through jumpAt across the leg's direction.
              const ahead = dot([leg.jumpAt[0] - p[0], 0, leg.jumpAt[1] - p[2], leg.jumpAt[2] - p[3]], dir);
              if (ahead < 0.3) { g.keys.add('Space'); jumped = true; }
            }
          }
        }
        c.step(dt);
        if (steps % 10 === 0) c.render();
        steps++; legSteps++;
        if (g.deaths > 0) { g.keys.clear(); return { ok: false, why: `fell during leg to ${leg.to}`, at: p, log }; }
        if (legSteps > 60 * 15) { g.keys.clear(); return { ok: false, why: `timed out on leg to ${leg.to}`, at: p, log }; }
      }
      log.push({ to: leg.to, at: g.body.pos.map((v) => +v.toFixed(2)), turns: g.rotations, wturn: +(g.wturn * 180 / Math.PI).toFixed(0), t: +(steps / 60).toFixed(2) });
      if (g.state === 'complete') break;
    }
    g.keys.clear();
    c.render();
    return { ok: g.state === 'complete', why: g.state, at: g.body.pos, log, time: steps / 60, tris: g.renderer.solid.triangles };
  }, { i, route });
  console.log(`level ${i + 1}: ${result.ok ? 'solved' : 'FAILED'} (${result.why}) in ${result.time?.toFixed?.(1) ?? '?'} s, ${result.tris ?? '?'} tris`);
  for (const l of result.log) console.log('   reached', l.to, 'at', l.at, `turns=${l.turns} wturn=${l.wturn} t=${l.t}`);
  if (!result.ok) { failed = true; console.log('   pos', result.at); }
  await page.screenshot({ path: path.join(OUT, `level${i + 1}-end.png`) });
}

// Snapshots: start of each level, mid world-turn on level 2, mid snap on level 4.
for (let i = 0; i < ROUTES.length; i++) {
  await page.evaluate((i) => {
    const g = window.game; g.keys.clear(); g.state = 'playing'; g.loadLevel(i);
    g.hud.flashUntil = 0; g.hud.el.flash.hidden = true; g.pitch = -0.12;
    for (let k = 0; k < 30; k++) window.gameControl.step(1 / 60);
    window.gameControl.render();
  }, i);
  await page.screenshot({ path: path.join(OUT, `level${i + 1}-start.png`) });
}
await page.evaluate(() => {
  const g = window.game; g.keys.clear(); g.state = 'playing'; g.loadLevel(1); g.pitch = -0.12;
  g.keys.add('KeyW');
  for (let k = 0; k < 600 && !g.rotation; k++) window.gameControl.step(1 / 60);
  g.keys.clear();
  for (let k = 0; k < 27; k++) window.gameControl.step(1 / 60);
  window.gameControl.render();
});
await page.screenshot({ path: path.join(OUT, 'level2-midturn.png') });
await page.evaluate(() => {
  const g = window.game; g.keys.clear(); g.state = 'playing'; g.loadLevel(3); g.pitch = -0.12;
  for (let k = 0; k < 20; k++) window.gameControl.step(1 / 60);
  g.snapTurn(1);
  for (let k = 0; k < 13; k++) window.gameControl.step(1 / 60);
  window.gameControl.render();
});
await page.screenshot({ path: path.join(OUT, 'level4-midsnap.png') });
await page.evaluate(() => {
  const g = window.game; g.volume = true;
  for (let k = 0; k < 60; k++) window.gameControl.step(1 / 60);
  window.gameControl.render();
});
await page.screenshot({ path: path.join(OUT, 'level4-volume.png') });

await browser.close();
server.close();
if (errors.length) { console.log('page errors:', errors); failed = true; }
console.log(failed ? 'FAIL' : 'PASS');
process.exit(failed ? 1 : 0);
