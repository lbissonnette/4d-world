// Drives a bot through every level in headless Chromium to prove each one is
// completable with the shipped controls and physics, and saves a screenshot
// per level to tests/out/. Run with `npm test` (needs playwright installed).

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

// Bot routes: waypoints in (x, z, w). The bot faces along the given angles,
// steers toward `to`, and presses jump once it is grounded within 0.35 of `jumpAt`.
const DEG = Math.PI / 180;
const ROUTES = [
  { yaw: 0, wturn: 0, legs: [
    { to: [0, 7.5, 0] }, { to: [0, 7.5, 3] }, { to: [0, 14.5, 3] }, { to: [0, 14.5, 0] }, { to: [0, 19.5, 0] },
  ] },
  { yaw: 0, wturn: 90 * DEG, legs: [
    { to: [0, 0, 4.25], jumpAt: [0, 0, 1.3] },
    { to: [0, 0, 8.25], jumpAt: [0, 0, 5.3] },
    { to: [0, 0, 11.75], jumpAt: [0, 0, 9.3] },
  ] },
  { yaw: 0, wturn: 0, legs: [
    { to: [0, 4.5, 0], jumpAt: [0, 1.8, 0] },
    { to: [0, 4.5, 2.4], jumpAt: [0, 4.5, 0.6] },
    { to: [0, 9, 2.4], jumpAt: [0, 5.8, 2.4] },
    { to: [0, 9, -0.1], jumpAt: [0, 9, 1.6] },
    { to: [0, 13.5, -0.1], jumpAt: [0, 10.3, -0.1] },
    { to: [0, 13.5, 2.4] },
    { to: [0, 17.75, 2.4], jumpAt: [0, 14.8, 2.4] },
    { to: [0, 22, 2.4], jumpAt: [0, 18.8, 2.4] },
    { to: [0, 22, 0] },
  ] },
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
    g.loadLevel(i);
    g.state = 'playing';
    g.yaw = route.yaw; g.wturn = route.wturn; g.pitch = 0;
    const dt = 1 / 60;
    let steps = 0;
    const log = [];
    for (const leg of route.legs) {
      let legSteps = 0, jumped = false;
      while (true) {
        const p = g.body.pos;
        const cur = [p[0], p[2], p[3]];
        const d = leg.to.map((t, k) => t - cur[k]);
        const dist = Math.hypot(...d);
        if (dist < 0.3 && g.body.grounded) break;
        if (g.state === 'complete') break;
        g.keys.clear();
        // Bang-bang steering in the bot's own frame (yaw 0): x -> A/D, z -> W/S, w -> Q/E.
        // With wturn 90°, W/S move along w and Q/E along -z, so swap the key roles.
        const fw = route.wturn > 0.1 ? [d[0], d[2], -d[1]] : d;
        if (fw[0] > 0.08) g.keys.add('KeyD'); else if (fw[0] < -0.08) g.keys.add('KeyA');
        if (fw[1] > 0.08) g.keys.add('KeyW'); else if (fw[1] < -0.08) g.keys.add('KeyS');
        if (fw[2] > 0.08) g.keys.add('KeyE'); else if (fw[2] < -0.08) g.keys.add('KeyQ');
        if (leg.jumpAt && !jumped && g.body.grounded) {
          const jd = Math.hypot(...leg.jumpAt.map((t, k) => t - cur[k]));
          if (jd < 0.35) { g.keys.add('Space'); jumped = true; }
        }
        c.step(dt);
        if (steps % 15 === 0) c.render();
        steps++; legSteps++;
        if (g.deaths > 0) { g.keys.clear(); return { ok: false, why: `fell during leg to ${leg.to}`, at: p, log }; }
        if (legSteps > 60 * 12) { g.keys.clear(); return { ok: false, why: `timed out on leg to ${leg.to}`, at: p, log }; }
      }
      log.push({ to: leg.to, at: g.body.pos.map((v) => +v.toFixed(2)), t: +(steps / 60).toFixed(2) });
      if (g.state === 'complete') break;
    }
    g.keys.clear();
    c.render();
    return { ok: g.state === 'complete', why: g.state, at: g.body.pos, log, time: steps / 60, tris: g.renderer.solid.triangles };
  }, { i, route });
  console.log(`level ${i + 1}: ${result.ok ? 'solved' : 'FAILED'} (${result.why}) in ${result.time?.toFixed?.(1) ?? '?'} s, ${result.tris ?? '?'} tris`);
  for (const l of result.log) console.log('   reached', l.to, 'at', l.at, `t=${l.t}`);
  if (!result.ok) { failed = true; console.log('   pos', result.at); }
  await page.screenshot({ path: path.join(OUT, `level${i + 1}.png`) });
}

// A couple of rendering snapshots from the player's point of view.
await page.evaluate(() => {
  const g = window.game; g.keys.clear(); g.state = 'playing'; g.loadLevel(0); g.yaw = 0; g.wturn = 0; g.pitch = -0.15;
  g.hud.flashUntil = 0; g.hud.el.flash.hidden = true;
  for (let k = 0; k < 30; k++) window.gameControl.step(1 / 60);
  window.gameControl.render();
});
await page.screenshot({ path: path.join(OUT, 'view-level1.png') });
await page.evaluate(() => {
  const g = window.game; g.wturn = Math.PI / 2; window.gameControl.render();
});
await page.screenshot({ path: path.join(OUT, 'view-level1-turned.png') });
await page.evaluate(() => {
  const g = window.game; g.wturn = 0; g.volume = true;
  for (let k = 0; k < 60; k++) window.gameControl.step(1 / 60);
  window.gameControl.render();
});
await page.screenshot({ path: path.join(OUT, 'view-level1-volume.png') });

await browser.close();
server.close();
if (errors.length) { console.log('page errors:', errors); failed = true; }
console.log(failed ? 'FAIL' : 'PASS');
process.exit(failed ? 1 : 0);
