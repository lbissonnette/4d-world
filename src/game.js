// Game state: player, side camera, input, rotation buttons, levels and the
// fixed-step loop.

import { DIM, AXIS_NAMES, unit, rotateInPlane } from './math4.js';
import { boxContains, transformBoxBounds } from './mesh4.js';
import { Body2D } from './physics.js';
import { LEVELS } from './levels.js';
import { CAMERA_DISTANCE } from './render.js';

const DEG = Math.PI / 180;
const FIXED_DT = 1 / 120;

export const MOVE = {
  accel: 70, maxSpeed: 7, jumpSpeed: 10.5, groundDrag: 0.05, airDrag: 0.4,
  slopeLimit: 0.7, coyote: 0.12, jumpBuffer: 0.12, radius: 0.4, killY: -9,
};
const ROTATE_TIME = 0.8;

const VOID_FLOOR = { min: [-80, -14, -80, -40], max: [80, -12, 80, 40], color: '#1b2b36', noCollide: true, noGhost: true, fixed: true };
const LEVEL_PALETTE = ['#6f8fa6', '#7c9c8a', '#8f8ba8', '#a08d78'];

export class Game {
  constructor(renderer, hud) {
    this.renderer = renderer;
    this.hud = hud;
    this.keys = new Set();
    this.body = new Body2D(MOVE.radius);
    this.ghosts = true;
    this.state = 'ready';       // ready | playing | complete | finished
    this.stateTime = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.time = 0;
    this.levelIndex = 0;
    this.accumulator = 0;
    this.rotation = null;       // { plane, angle, pivot, t } while the level turns
    this.rotations = 0;
    this.camX = 0; this.camY = 0;
    this.loadLevel(0);
  }

  get level() { return LEVELS[this.levelIndex]; }

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
    // Which level axis currently points along each world axis, for the HUD.
    this.axisMap = [0, 1, 2, 3].map((k) => ({ axis: k, sign: 1 }));
    this.rotation = null;
    this.rotations = 0;
    this.deaths = 0;
    this.levelTime = 0;
    this.renderer.setLevel(this.boxes, this.goal);
    this.respawn();
    this.camX = this.body.pos[0]; this.camY = this.body.pos[1];
    this.state = this.state === 'ready' ? 'ready' : 'playing';
    this.stateTime = 0;
    this.hud?.setLevel(level, i, LEVELS.length);
    this.hud?.setState(this.state, this);
  }

  respawn() {
    this.body.pos = this.level.spawn.slice();
    this.body.vx = 0; this.body.vy = 0;
    this.body.grounded = false;
  }

  start() { if (this.state === 'ready') this.state = 'playing'; }

  // Begin a 90-degree turn of the level about the button's centre.
  pressButton(box) {
    const b = box.button;
    b.pressed = true;
    const pivot = box.min.map((lo, k) => (lo + box.max[k]) / 2);
    this.rotation = { plane: b.plane, angle: b.angle * DEG, pivot, t: 0, label: b.label };
    this.renderer.setLevel(this.boxes, this.goal);   // picks up the pressed colour
    this.hud?.flash(`Turning: ${b.label}`);
  }

  // Current world-point transform for the in-progress rotation, or null.
  rotationTransform() {
    const r = this.rotation;
    if (!r) return null;
    const s = r.t * r.t * (3 - 2 * r.t);
    const angle = r.angle * s;
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
    // Track where the level's axes went: rotating a toward b by +90 sends
    // unit(a) to unit(b) and unit(b) to -unit(a).
    const dir = Math.sign(r.angle);
    const ea = this.axisMap[a], eb = this.axisMap[b];
    if (dir > 0) { this.axisMap[b] = ea; this.axisMap[a] = { axis: eb.axis, sign: -eb.sign }; }
    else { this.axisMap[a] = eb; this.axisMap[b] = { axis: ea.axis, sign: -ea.sign }; }
    this.rotation = null;
    this.rotations++;
    this.renderer.setLevel(this.boxes, this.goal);
  }

  axisLabel(worldAxis) {
    const m = this.axisMap[worldAxis];
    return (m.sign < 0 ? '−' : '') + AXIS_NAMES[m.axis];
  }

  cameraPose() {
    // The camera sits at negative depth looking along +z, so positive z is
    // "behind" the play plane, away from the viewer.
    const rows = [unit(0), unit(1), unit(2), unit(3)];
    const pos = [this.camX, this.camY + 1.2, -CAMERA_DISTANCE, 0];
    return { frame: { rows }, pos };
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
    // Camera follows the player with a little lag.
    const k = 1 - Math.pow(0.5, dt / 0.12);
    this.camX += (this.body.pos[0] - this.camX) * k;
    this.camY += (this.body.pos[1] - this.camY) * k;

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

    const keys = this.keys;
    let ax = 0;
    if (keys.has('KeyD') || keys.has('ArrowRight')) ax += MOVE.accel;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) ax -= MOVE.accel;

    this.coyote = this.body.grounded ? MOVE.coyote : Math.max(0, this.coyote - dt);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    const jumpKey = keys.has('Space') || keys.has('KeyW') || keys.has('ArrowUp');
    if (jumpKey && !this.jumpHeld) this.jumpBuffer = MOVE.jumpBuffer;
    this.jumpHeld = jumpKey;
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.body.vy = MOVE.jumpSpeed;
      this.body.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
    }

    this.body.step(dt, ax, this.boxes, MOVE);

    // Buttons: pressing happens when the player stands on one; it re-arms
    // once the player has left it.
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
    const { frame, pos } = this.cameraPose();
    this.renderer.render(frame, pos, { ghosts: this.ghosts, xform: this.rotationTransform(), player: this.body.pos });
    this.hud?.update(this);
  }
}

export { LEVELS, DIM };
