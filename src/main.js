import { Renderer4D } from './render.js';
import { Game } from './game.js';
import { Hud } from './hud.js';

const canvas = document.getElementById('view');
const renderer = new Renderer4D(canvas);
const hud = new Hud(document.getElementById('hud'));
const game = new Game(renderer, hud);
hud.setState('ready', game);

let autoRun = true;
let rightDown = false;
let leftDown = false;

window.addEventListener('resize', () => renderer.resize());

// Pointer lock gives proper mouse look. Where it is unavailable (some embedded
// views), dragging with a mouse button held works instead.
canvas.addEventListener('click', () => {
  if (document.pointerLockElement !== canvas) {
    try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch (_) { /* unsupported */ }
  }
  if (game.state === 'ready') { game.start(); hud.setState('playing', game); }
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('mousedown', (e) => { if (e.button === 2) rightDown = true; if (e.button === 0) leftDown = true; });
window.addEventListener('mouseup', (e) => { if (e.button === 2) rightDown = false; if (e.button === 0) leftDown = false; });
window.addEventListener('mousemove', (e) => {
  const locked = document.pointerLockElement === canvas;
  if (!locked && !leftDown && !rightDown) return;
  game.look(e.movementX, e.movementY, rightDown || e.shiftKey);
});
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  game.keys.add(e.code);
  if (game.state === 'playing') {
    if (e.code === 'KeyE') game.snapTurn(1);
    if (e.code === 'KeyQ') game.snapTurn(-1);
    if (e.code === 'KeyV') game.volume = !game.volume;
    if (e.code === 'KeyR') game.loadLevel(game.levelIndex);
  }
  if (e.code === 'KeyG') game.ghosts = !game.ghosts;
  if (e.code === 'KeyR' && game.state === 'finished') { game.state = 'playing'; game.loadLevel(0); }
  if (e.code === 'Space' && game.state === 'ready') { game.start(); hud.setState('playing', game); }
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => game.keys.delete(e.code));
window.addEventListener('blur', () => game.keys.clear());

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (autoRun) game.update(dt);
  game.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Exposed for the automated level-solver test and for poking at in devtools.
window.game = game;
window.gameControl = {
  setAutoRun(v) { autoRun = v; },
  step(dt) { game.update(dt); },
  render() { game.render(); },
};
