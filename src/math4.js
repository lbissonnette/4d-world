// N-dimensional vector helpers. Vectors are plain arrays of length DIM.
// Axis 0 is x, 1 is y (up), 2 is z, 3 is the fourth axis w (+w is "ana",
// -w is "kata"). DIM is 4 for now; the vector, box and rotation code works
// for any DIM, the tetrahedral slicer in mesh4.js is 4D only.

export const DIM = 4;
export const AXIS_NAMES = ['X', 'Y', 'Z', 'W', 'V'];

export const zero = () => new Array(DIM).fill(0);
export const unit = (k) => { const v = zero(); v[k] = 1; return v; };
export const add = (a, b) => a.map((x, i) => x + b[i]);
export const sub = (a, b) => a.map((x, i) => x - b[i]);
export const scale = (a, s) => a.map((x) => x * s);
export const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
export const len = (a) => Math.sqrt(dot(a, a));
export const lerp = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
export const addScaled = (a, b, s) => a.map((x, i) => x + b[i] * s);

export function normalize(a) {
  const l = len(a);
  return l > 1e-9 ? scale(a, 1 / l) : zero();
}

// Remove the component of a along unit vector n.
export const reject = (a, n) => addScaled(a, n, -dot(a, n));

// Rotate point p by `angle` radians in the plane spanned by axes a and b,
// about `pivot`. Positive angle turns axis a toward axis b.
export function rotateInPlane(p, a, b, angle, pivot) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const pa = p[a] - pivot[a], pb = p[b] - pivot[b];
  const out = p.slice();
  out[a] = pivot[a] + c * pa - s * pb;
  out[b] = pivot[b] + s * pa + c * pb;
  return out;
}

// A camera frame is DIM orthonormal row vectors: right, up, forward, then
// the slice normals. A world point becomes camera-space (x, y, z, w...) where
// the 3D renderer draws (x, y, -z) and w is the signed distance from the slice.
export function toCam(frame, camPos, p) {
  const d = sub(p, camPos);
  return frame.rows.map((r) => dot(r, d));
}

// Gram-Schmidt a set of row vectors back to orthonormal, used after
// interpolating between two camera frames.
export function orthonormalize(rows) {
  const out = [];
  for (const r of rows) {
    let v = r;
    for (const o of out) v = reject(v, o);
    out.push(normalize(v));
  }
  return out;
}

export function lerpFrame(a, b, t) {
  return { rows: orthonormalize(a.rows.map((r, i) => lerp(r, b.rows[i], t))) };
}
