// Sphere-vs-hyperbox physics for the player, modelled on Engine4D's
// Physical4D: integrate velocity, then push the sphere out of every box it
// overlaps and cancel the velocity component along each push. Works in any
// number of dimensions; gravity is always along -y.

import { sub, dot, len, addScaled, scale, unit, DIM } from './math4.js';
import { nearestPointOnBox } from './mesh4.js';

export const GRAVITY = 22;
const UP = unit(1);

export class Body4D {
  constructor(radius) {
    this.radius = radius;
    this.pos = new Array(DIM).fill(0);
    this.vel = new Array(DIM).fill(0);
    this.grounded = false;
    this.lastHit = null;
  }

  // accel: world-space movement acceleration, perpendicular to gravity.
  step(dt, accel, boxes, opts) {
    const { maxSpeed, groundDrag, airDrag, slopeLimit } = opts;
    const v = this.vel;
    const vy = v[1];
    let h = v.slice(); h[1] = 0;
    h = addScaled(h, accel, dt);
    h = scale(h, Math.pow(0.5, dt / (this.grounded ? groundDrag : airDrag)));
    const hs = len(h);
    if (hs > maxSpeed) h = scale(h, maxSpeed / hs);
    h[1] = vy - GRAVITY * dt;
    this.vel = h;

    let p = addScaled(this.pos, this.vel, dt);
    this.grounded = false;
    this.lastHit = null;

    // Two passes so corner cases (two boxes at once) settle.
    for (let pass = 0; pass < 2; pass++) {
      for (const box of boxes) {
        if (box.noCollide) continue;
        const np = nearestPointOnBox(box.min, box.max, p);
        const d = sub(p, np);
        let dist = len(d);
        let n;
        if (dist < 1e-6) { n = UP; dist = 0; }       // centre inside: push up
        else n = scale(d, 1 / dist);
        if (dist < this.radius) {
          p = addScaled(p, n, this.radius - dist);
          const vn = dot(this.vel, n);
          if (vn < 0) this.vel = addScaled(this.vel, n, -vn);
          this.lastHit = box;
          if (n[1] > slopeLimit) this.grounded = true;
        }
      }
    }
    this.pos = p;
  }
}
