// Small 4D vector helpers. Vectors are plain arrays [x, y, z, w].
// y is up, w is the fourth spatial axis: +w is "ana", -w is "kata".

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s, a[3] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
export const len = (a) => Math.sqrt(dot(a, a));
export const lerp = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
  a[3] + (b[3] - a[3]) * t,
];

export function normalize(a) {
  const l = len(a);
  return l > 1e-9 ? scale(a, 1 / l) : [0, 0, 0, 0];
}

export function addScaled(a, b, s) {
  return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s, a[3] + b[3] * s];
}

// Remove the component of a along unit vector n.
export function reject(a, n) {
  return addScaled(a, n, -dot(a, n));
}

// A camera frame is four orthonormal row vectors: right, up, forward, ana.
// A world point p becomes camera-space (x, y, z, w) where w is the signed
// distance from the slice hyperplane. The 3D renderer draws (x, y, -z).
export function toCam(frame, camPos, p) {
  const d = sub(p, camPos);
  return [dot(frame.right, d), dot(frame.up, d), dot(frame.forward, d), dot(frame.ana, d)];
}

// Gram-Schmidt a set of four row vectors back to orthonormal. Used after
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
  const rows = orthonormalize([
    lerp(a.right, b.right, t),
    lerp(a.up, b.up, t),
    lerp(a.forward, b.forward, t),
    lerp(a.ana, b.ana, t),
  ]);
  return { right: rows[0], up: rows[1], forward: rows[2], ana: rows[3] };
}
