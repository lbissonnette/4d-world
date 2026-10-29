// Game state: player, first-person 4D camera, input, rotation buttons,
// snap and free turns into the 4th dimension, levels and the fixed-step loop.

import { DIM, unit, addScaled, scale, normalize, lerpFrame, rotateInPlane, dot } from './math4.js';
import { boxContains, transformBoxBounds } from './mesh4.js';
import { Body4D } from './physics.js';
import { LEVELS } from './levels.js';

const DEG = Math.PI / 180;
const FIXED_DT = 1 / 120;

export const MOVE = {
  accel: 60, maxSpeed: 6.5, jumpSpeed: 9, groundDrag: 0.06, airDrag: 0.5,
  slopeLimit: 0.7, coyote: 0.12, jumpBuffer: 0.12, eyeHeight: 1.1, radius: 0.4, killY: -8,
};
const ROTATE_TIME = 0.9;      // world turn from a button
const SNAP_TIME = 0.45;       // player's own quarter turn

const VOID_FLOOR = { min: [-80, -14, -80, -40], max: [80, -12, 80, 40], color: '#1b2b36', noCollide: true, noGhost: true, fixed: true };
const LEVEL_PALETTE = ['#6f8fa6', '#7c9c8a', '#8f8ba8', '#a08d78'];
const UP = unit(1);

export class Game {
  constructor(renderer, hud) {
    this.renderer = renderer;
    this.hud = hud;
    this.keys = new Set();
    this.body = new Body4D(MOVE.radius);
    this.yaw = 0;       // turn within the XZ plane
    this.wturn = 0;     // turn of forward into w (ZW plane)
    this.pitch = 0;
    this.snap = null;   // { from, to, t } while a quarter turn animates
    this.volume = false;
    this.volumeBlend = 0;
    this.ghosts = true;
    this.state = 'ready';       // ready | playing | complete | finished
    this.stateTime = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.time = 0;
    this.levelIndex = 0;
    this.accumulator = 0;
    this.rotation = null;       // { plane, angle, pivot, t } while a button turns the level
    this.rotations = 0;
    this.fov = 80;
    this.mouseSensitivity = 0.14;
    this.loadLevel(0);
  }

  get level() { return LEVELS[this.levelIndex]; }
  get canSnap() { return this.level.controls !== 'walk'; }
  get canFreeTurn() { return this.level.controls === 'free'; }

  loadLevel(i) {
    this.levelIndex = i;
    const level = LEVELS[i];
    let paletteIndex = 0;
    this.boxes = level.boxes.map((b) => ({
      ...b,
      min: b.min.slice(), max: b.max.slice(),
      color: b.button ? undefined : (b.color || LEVEL_PALETTE[paletteIndex++ % LEVEL_PALETTE.length]),
      button: b.button ? { ...b.button, pressed: false } : undefined,
    }));
    this.boxes.push(VOID_FLOOR);
    this.goal = { min: level.goal.min.slice(), max: level.goal.max.slice(), color: '#ffd166' };
    this.rotation = null;
    this.snap = null;
    this.rotations = 0;
    this.deaths = 0;
    this.levelTime = 0;
    this.yaw = 0; this.wturn = 0; this.pitch = 0;
    this.renderer.setLevel(this.boxes, this.goal);
    this.respawn();
    this.state = this.state === 'ready' ? 'ready' : 'playing';
    this.stateTime = 0;
    this.hud?.setLevel(level, i, LEVELS.length);
    this.hud?.setState(this.state, this);
  }

  respawn() {
    this.body.pos = this.level.spawn.slice();
    this.body.vel = new Array(DIM).fill(0);
    this.body.grounded = false;
  }

  start() { if (this.state === 'ready') this.state = 'playing'; }

  // Mouse look. dx/dy in pixels; fourD true when the right button or Shift is held.
  look(dx, dy, fourD) {
    const s = this.mouseSensitivity * DEG;
    if (fourD) {
      if (this.canFreeTurn && !this.snap) this.wturn += dx * s;
      else if (!this.canFreeTurn && Math.abs(dx) > 2) this.hud?.flash(this.canSnap ? 'Free turning unlocks later. Use Q / E for now.' : 'You cannot turn into the 4th dimension yet. Find a button.');
    } else {
      this.yaw -= dx * s;
      this.pitch = Math.max(-89 * DEG, Math.min(89 * DEG, this.pitch - dy * s));
    }
  }

  // Quarter turn into the 4th dimension: dir +1 is toward ana, -1 toward kata.
  snapTurn(dir) {
    if (!this.canSnap) { this.hud?.flash('You cannot turn into the 4th dimension yet. Find a button.'); return; }
    if (this.snap || this.rotation) return;
    const target = Math.round(this.wturn / (90 * DEG)) * 90 * DEG + dir * 90 * DEG;
    this.snap = { from: this.wturn, to: target, t: 0 };
  }

  // Camera basis for the current angles: right r, flattened forward f and
  // ana a, all perpendicular to gravity.
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
    return { rows: [r, addScaled(scale(UP, cy), f, -sy), addScaled(scale(f, cy), UP, sy), a] };
  }

  volumeFrame() {
    const { r, f, a } = this.axes();
    const tilt = 35 * DEG, s = Math.sin(tilt), c = Math.cos(tilt);
    return { rows: [r, addScaled(scale(a, c), f, s), addScaled(scale(f, c), a, -s), UP] };
  }

  cameraPose() {
    const eye = addScaled(this.body.pos, UP, MOVE.eyeHeight);
    const fp = this.firstPersonFrame();
    if (this.volumeBlend <= 0) return { frame: fp, pos: eye, marker: null };
    const vf = this.volumeFrame();
    const { f, a } = this.axes();
    let vpos = addScaled(this.body.pos, UP, -0.5);
    vpos = addScaled(vpos, f, -7);
    vpos = addScaled(vpos, a, 5);
    const t = smooth(this.volumeBlend);
    return { frame: lerpFrame(fp, vf, t), pos: eye.map((v, k) => v + (vpos[k] - v) * t), marker: t > 0.5 ? this.body.pos : null };
  }

  // Begin a 90-degree turn of the level about the button's centre.
  pressButton(box) {
    const b = box.button;
    b.pressed = true;
    const pivot = box.min.map((lo, k) => (lo + box.max[k]) / 2);
    this.rotation = { plane: b.plane, angle: b.angle * DEG, pivot, t: 0 };
    this.renderer.setLevel(this.boxes, this.goal);
    this.hud?.flash(`The world turns: ${b.label}`);
  }

  rotationTransform() {
    const r = this.rotation;
    if (!r) return null;
    const angle = r.angle * smooth(r.t);
    const [a, b] = r.plane;
    return (p) => rotateInPlane(p, a, b, angle, r.pivot);
  }

  finishRotation() {
    const r = this.rotation;
    const [a, b] = r.plane;
    const fn = (p) => rotateInPlane(p, a, b, r.angle, r.pivot);
    for (const box of [...this.boxes, this.goal]) {
      if (box.fixed) continue;
      const t = transformBoxBounds(box.min, box.max, fn);
      box.min = t.min; box.max = t.max;
    }
    this.rotation = null;
    this.rotations++;
    this.renderer.setLevel(this.boxes, this.goal);
  }

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
    const turn = 110 * DEG * dt;
    if (k.has('ArrowLeft')) this.yaw += turn;
    if (k.has('ArrowRight')) this.yaw -= turn;
    if (k.has('ArrowUp')) this.pitch = Math.min(89 * DEG, this.pitch + turn);
    if (k.has('ArrowDown')) this.pitch = Math.max(-89 * DEG, this.pitch - turn);
    if (this.canFreeTurn && !this.snap) {
      if (k.has('KeyZ')) this.wturn -= turn;
      if (k.has('KeyC')) this.wturn += turn;
    }
    if (this.snap) {
      this.snap.t = Math.min(1, this.snap.t + dt / SNAP_TIME);
      this.wturn = this.snap.from + (this.snap.to - this.snap.from) * smooth(this.snap.t);
      if (this.snap.t >= 1) this.snap = null;
    }
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

    if (this.rotation) {
      this.rotation.t = Math.min(1, this.rotation.t + dt / ROTATE_TIME);
      if (this.rotation.t >= 1) this.finishRotation();
      return;                                  // the player is frozen while the world turns
    }

    const { r, f } = this.axes();
    let move = new Array(DIM).fill(0);
    if (k.has('KeyW')) move = addScaled(move, f, 1);
    if (k.has('KeyS')) move = addScaled(move, f, -1);
    if (k.has('KeyD')) move = addScaled(move, r, 1);
    if (k.has('KeyA')) move = addScaled(move, r, -1);
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

    // Buttons fire when the player stands on one and re-arm once they leave.
    const hit = this.body.lastHit;
    for (const box of this.boxes) {
      if (!box.button) continue;
      const standing = hit === box && this.body.grounded;
      if (standing && !box.button.pressed) { this.pressButton(box); break; }
      if (!standing && box.button.pressed && !boxContains(box.min, box.max, this.body.pos, MOVE.radius + 0.1)) {
        box.button.pressed = false;
        this.renderer.setLevel(this.boxes, this.goal);
      }
    }

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
    this.renderer.render(frame, pos, { ghosts: this.ghosts, fov: this.fov, marker, xform: this.rotationTransform() });
    this.hud?.update(this);
  }
}

function smooth(t) { return t * t * (3 - 2 * t); }

export { LEVELS, dot };
