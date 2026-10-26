// Sphere-vs-hyperbox physics for the player, modelled on Engine4D's
// Physical4D: integrate velocity, then push the sphere out of every box it
// overlaps and cancel the velocity component along each push.

import { sub, dot, len, addScaled, scale } from './math4.js';
import { nearestPointOnBox } from './mesh4.js';

export const GRAVITY = 22;
export const UP = [0, 1, 0, 0];

export class Body4D {
  constructor(radius) {
    this.radius = radius;
    this.pos = [0, 0, 0, 0];
    this.vel = [0, 0, 0, 0];
    this.grounded = false;
    this.groundNormalY = 0;
    this.lastHit = null;
  }

  // accel: world-space movement acceleration (already perpendicular to gravity).
  step(dt, accel, boxes, opts) {
    const { maxSpeed, groundDrag, airDrag, slopeLimit } = opts;
    const v = this.vel;
    // Horizontal (non-gravity) velocity gets drag; vertical keeps gravity only.
    const vy = v[1];
    let h = [v[0], 0, v[2], v[3]];
    h = addScaled(h, accel, dt);
    const drag = Math.pow(0.5, dt / (this.grounded ? groundDrag : airDrag));
    h = scale(h, drag);
    const hs = len(h);
    if (hs > maxSpeed) h = scale(h, maxSpeed / hs);
    this.vel = [h[0], vy - GRAVITY * dt, h[2], h[3]];

    let p = addScaled(this.pos, this.vel, dt);
    this.grounded = false;
    this.groundNormalY = 0;
    this.lastHit = null;

    // Two passes so corner cases (two boxes at once) settle.
    for (let pass = 0; pass < 2; pass++) {
      for (const box of boxes) {
        if (box.noCollide) continue;
        const np = nearestPointOnBox(box.min, box.max, p);
        const d = sub(p, np);
        let dist = len(d);
        let n;
        if (dist < 1e-6) {
          // Centre is inside the box: push straight up.
          n = UP;
          dist = 0;
        } else {
          n = scale(d, 1 / dist);
        }
        if (dist < this.radius) {
          p = addScaled(p, n, this.radius - dist);
          const vn = dot(this.vel, n);
          if (vn < 0) this.vel = addScaled(this.vel, n, -vn);
          this.lastHit = box;
          if (n[1] > slopeLimit) {
            this.grounded = true;
            this.groundNormalY = Math.max(this.groundNormalY, n[1]);
          }
        }
      }
    }
    this.pos = p;
  }
}
