// Player physics on the play plane. The player is a sphere that only moves
// sideways (x) and up (y); its depth and hidden coordinates stay at 0. It
// collides with the (x, y) rectangle of every box that crosses the play plane,
// using the same push-out scheme as Engine4D's Physical4D: move, then push the
// sphere out of each overlap and cancel the velocity along the push.

import { DIM } from './math4.js';
import { boxInPlayPlane } from './mesh4.js';

export const GRAVITY = 26;

export class Body2D {
  constructor(radius) {
    this.radius = radius;
    this.pos = new Array(DIM).fill(0);
    this.vx = 0;
    this.vy = 0;
    this.grounded = false;
    this.lastHit = null;
  }

  // ax: sideways acceleration from input.
  step(dt, ax, boxes, opts) {
    const { maxSpeed, groundDrag, airDrag, slopeLimit } = opts;
    this.vx += ax * dt;
    this.vx *= Math.pow(0.5, dt / (this.grounded ? groundDrag : airDrag));
    this.vx = Math.max(-maxSpeed, Math.min(maxSpeed, this.vx));
    this.vy -= GRAVITY * dt;

    let x = this.pos[0] + this.vx * dt;
    let y = this.pos[1] + this.vy * dt;
    this.grounded = false;
    this.lastHit = null;

    for (let pass = 0; pass < 2; pass++) {
      for (const box of boxes) {
        if (box.noCollide || !boxInPlayPlane(box.min, box.max)) continue;
        const nx = Math.min(box.max[0], Math.max(box.min[0], x));
        const ny = Math.min(box.max[1], Math.max(box.min[1], y));
        let dx = x - nx, dy = y - ny;
        let d = Math.hypot(dx, dy);
        if (d < 1e-6) { dx = 0; dy = 1; d = 0; }        // centre inside: push up
        else { dx /= d; dy /= d; }
        if (d < this.radius) {
          const push = this.radius - d;
          x += dx * push; y += dy * push;
          const vn = this.vx * dx + this.vy * dy;
          if (vn < 0) { this.vx -= dx * vn; this.vy -= dy * vn; }
          this.lastHit = box;
          if (dy > slopeLimit) this.grounded = true;
        }
      }
    }
    this.pos[0] = x;
    this.pos[1] = y;
  }
}
