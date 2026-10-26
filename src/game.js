// Game state: player, camera frame, input, levels and the fixed-step loop.

import { addScaled, scale, normalize, lerpFrame } from './math4.js';
import { boxContains } from './mesh4.js';
import { Body4D } from './physics.js';
import { LEVELS } from './levels.js';

const DEG = Math.PI / 180;
const FIXED_DT = 1 / 120;

export const MOVE = {
  accel: 60, maxSpeed: 6.5, jumpSpeed: 9, groundDrag: 0.06, airDrag: 0.5,
  slopeLimit: 0.7, coyote: 0.12, jumpBuffer: 0.12, eyeHeight: 1.1, radius: 0.4, killY: -8,
};

const VOID_FLOOR = { min: [-80, -14, -80, -40], max: [80, -12, 80, 40], color: '#1b2b36', noCollide: true, noGhost: true };

export class Game {
  constructor(renderer, hud) {
    this.renderer = renderer;
    this.hud = hud;
    this.keys = new Set();
    this.body = new Body4D(MOVE.radius);
    this.yaw = 0;       // turn within the XZ plane
    this.wturn = 0;     // turn of forward into w (ZW plane)
    this.pitch = 0;
    this.volume = false;        // volume (top-down XZW) view
    this.volumeBlend = 0;       // 0 = first person, 1 = volume view
    this.ghosts = true;
    this.state = 'ready';       // ready | playing | complete | finished
    this.stateTime = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.time = 0;
    this.levelIndex = 0;
    this.accumulator = 0;
    this.fov = 80;
    this.mouseSensitivity = 0.14;
    this.loadLevel(0);
  }

  get level() { return LEVELS[this.levelIndex]; }

  loadLevel(i) {
    this.levelIndex = i;
    const level = LEVELS[i];
    this.boxes = level.boxes.map((b, k) => ({ color: LEVEL_PALETTE[k % LEVEL_PALETTE.length], ...b }));
    this.boxes.push(VOID_FLOOR);
    this.goal = { ...level.goal, color: '#ffd166' };
    this.renderer.setLevel(this.boxes, this.goal);
    this.respawn();
    this.yaw = 0; this.wturn = 0; this.pitch = 0;
    this.state = this.state === 'ready' ? 'ready' : 'playing';
    this.stateTime = 0;
    this.deaths = 0;
    this.levelTime = 0;
    this.hud?.setLevel(level, i, LEVELS.length);
    this.hud?.setState(this.state, this);
  }

  respawn() {
    this.body.pos = this.level.spawn.slice();
    this.body.vel = [0, 0, 0, 0];
    this.body.grounded = false;
  }

  start() { if (this.state === 'ready') this.state = 'playing'; }

  // Mouse look. dx/dy in pixels; fourD true when the right button or Shift is held.
  look(dx, dy, fourD) {
    const s = this.mouseSensitivity * DEG;
    if (fourD) {
      this.wturn += dx * s;
    } else {
      this.yaw -= dx * s;
      this.pitch = Math.max(-89 * DEG, Math.min(89 * DEG, this.pitch - dy * s));
    }
  }

  // Camera basis for the current angles. Returns the first-person frame and
  // the flattened movement axes (all with y = 0).
  axes() {
    const st = Math.sin(this.yaw), ct = Math.cos(this.yaw);
    const sp = Math.sin(this.wturn), cp = Math.cos(this.wturn);
    const f0 = [st, 0, ct, 0], r0 = [ct, 0, -st, 0];
    const f1 = [cp * f0[0], 0, cp * f0[2], sp];
    const a1 = [-sp * f0[0], 0, -sp * f0[2], cp];
    return { r: r0, f: f1, a: a1 };
  }

  firstPersonFrame() {
    const { r, f, a } = this.axes();
    const sy = Math.sin(this.pitch), cy = Math.cos(this.pitch);
    const up = [0, 1, 0, 0];
    return {
      right: r,
      up: addScaled(scale(up, cy), f, -sy),
      forward: addScaled(scale(f, cy), up, sy),
      ana: a,
    };
  }

  volumeFrame() {
    const { r, f, a } = this.axes();
    const tilt = 35 * DEG, s = Math.sin(tilt), c = Math.cos(tilt);
    return {
      right: r,
      up: addScaled(scale(a, c), f, s),
      forward: addScaled(scale(f, c), a, -s),
      ana: [0, 1, 0, 0],
    };
  }

  cameraPose() {
    const eye = addScaled(this.body.pos, [0, 1, 0, 0], MOVE.eyeHeight);
    const fp = this.firstPersonFrame();
    if (this.volumeBlend <= 0) return { frame: fp, pos: eye, marker: null };
    const vf = this.volumeFrame();
    const { f, a } = this.axes();
    let vpos = addScaled(this.body.pos, [0, 1, 0, 0], -0.5);
    vpos = addScaled(vpos, f, -7);
    vpos = addScaled(vpos, a, 5);
    const t = smooth(this.volumeBlend);
    const frame = lerpFrame(fp, vf, t);
    const pos = [0, 1, 2, 3].map((k) => eye[k] + (vpos[k] - eye[k]) * t);
    return { frame, pos, marker: t > 0.5 ? this.body.pos : null };
  }

  // Advance simulation by dt seconds in fixed steps.
  update(dt) {
    this.accumulator = Math.min(this.accumulator + dt, 0.1);
    while (this.accumulator >= FIXED_DT) {
      this.fixedStep(FIXED_DT);
      this.accumulator -= FIXED_DT;
    }
  }

  fixedStep(dt) {
    this.time += dt;
    this.stateTime += dt;
    const k = this.keys;
    // Keyboard look alternatives (arrows, Z/C for the 4D turn).
    const turn = 110 * DEG * dt;
    if (k.has('ArrowLeft')) this.yaw += turn;
    if (k.has('ArrowRight')) this.yaw -= turn;
    if (k.has('ArrowUp')) this.pitch = Math.min(89 * DEG, this.pitch + turn);
    if (k.has('ArrowDown')) this.pitch = Math.max(-89 * DEG, this.pitch - turn);
    if (k.has('KeyZ')) this.wturn -= turn;
    if (k.has('KeyC')) this.wturn += turn;
    this.volumeBlend = Math.max(0, Math.min(1, this.volumeBlend + (this.volume ? dt / 0.6 : -dt / 0.6)));

    if (this.state === 'complete') {
      if (this.stateTime > 1.6) {
        if (this.levelIndex + 1 < LEVELS.length) this.loadLevel(this.levelIndex + 1);
        else { this.state = 'finished'; this.hud?.setState('finished', this); }
      }
      return;
    }
    if (this.state !== 'playing') return;
    this.levelTime += dt;

    const { r, f, a } = this.axes();
    let move = [0, 0, 0, 0];
    if (k.has('KeyW')) move = addScaled(move, f, 1);
    if (k.has('KeyS')) move = addScaled(move, f, -1);
    if (k.has('KeyD')) move = addScaled(move, r, 1);
    if (k.has('KeyA')) move = addScaled(move, r, -1);
    if (k.has('KeyE')) move = addScaled(move, a, 1);
    if (k.has('KeyQ')) move = addScaled(move, a, -1);
    const accel = scale(normalize(move), MOVE.accel);

    this.coyote = this.body.grounded ? MOVE.coyote : Math.max(0, this.coyote - dt);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (k.has('Space') && !this.spaceHeld) this.jumpBuffer = MOVE.jumpBuffer;
    this.spaceHeld = k.has('Space');
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.body.vel[1] = MOVE.jumpSpeed;
      this.body.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
    }

    this.body.step(dt, accel, this.boxes, MOVE);

    if (this.body.pos[1] < MOVE.killY) {
      this.deaths++;
      this.respawn();
      this.hud?.flash('Fell into the void. Back to the start.');
    }
    if (boxContains(this.goal.min, this.goal.max, this.body.pos)) {
      this.state = 'complete';
      this.stateTime = 0;
      this.hud?.setState('complete', this);
    }
  }

  render() {
    const { frame, pos, marker } = this.cameraPose();
    this.renderer.render(frame, pos, { ghosts: this.ghosts, fov: this.fov, marker });
    this.hud?.update(this);
  }
}

const LEVEL_PALETTE = ['#6f8fa6', '#7c9c8a', '#8f8ba8', '#a08d78', '#6f8fa6', '#7c9c8a', '#8f8ba8', '#a08d78', '#6f8fa6'];

function smooth(t) { return t * t * (3 - 2 * t); }

export { LEVELS };
