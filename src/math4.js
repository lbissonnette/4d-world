// N-dimensional vector helpers. Vectors are plain arrays of length DIM.
// Axis 0 is sideways (x), 1 is up (y), 2 is depth (z), 3 is the hidden
// fourth axis (w). DIM is 4 for now; the vector, box and rotation code below
// works for any DIM, the tetrahedral slicer in mesh4.js is 4D only.

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

// A camera frame is DIM orthonormal row vectors. The first three (right, up,
// forward) place the point for the 3D renderer; the rest are slice normals:
// the slice is where every one of those coordinates is zero.
export function toCam(frame, camPos, p) {
  const d = sub(p, camPos);
  return frame.rows.map((r) => dot(r, d));
}
