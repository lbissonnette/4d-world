import { Renderer4D } from './render.js';
import { Game } from './game.js';
import { Hud } from './hud.js';

const canvas = document.getElementById('view');
const renderer = new Renderer4D(canvas);
const hud = new Hud(document.getElementById('hud'));
const game = new Game(renderer, hud);
hud.setState('ready', game);

let autoRun = true;

window.addEventListener('resize', () => renderer.resize());

function begin() {
  if (game.state === 'ready') { game.start(); hud.setState('playing', game); }
}
canvas.addEventListener('click', begin);
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  game.keys.add(e.code);
  if (e.code === 'KeyG') game.ghosts = !game.ghosts;
  if (e.code === 'KeyR') {
    if (game.state === 'finished') { game.state = 'playing'; game.loadLevel(0); }
    else if (game.state === 'playing') game.loadLevel(game.levelIndex);
  }
  if (e.code === 'Space') begin();
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
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
