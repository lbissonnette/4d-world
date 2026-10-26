// 4D geometry. Level pieces are axis-aligned hyperboxes (4D boxes).
//
// A hyperbox's surface is eight cubic cells (two per axis). Each cube is cut
// into six tetrahedra, so the surface is 48 tetrahedra. Slicing a tetrahedron
// with the camera's 3D hyperplane gives a triangle or a quad, and the union of
// those polygons is the surface of the 3D cross-section the player sees.
// This is the same idea Engine4D (4D Golf) uses, done on the CPU instead of in
// a vertex shader so the proof of concept stays easy to read and test.

import { dot, sub, lerp } from './math4.js';

const PERMS3 = [
  [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
];

// Returns { tets: Float32Array(n*16), cells: Int8Array(n*2) } where cells
// holds [axis, sign] per tetrahedron so the renderer can tint ana/kata faces.
export function hyperboxTets(min, max) {
  const tets = [];
  const cells = [];
  for (let axis = 0; axis < 4; axis++) {
    const free = [0, 1, 2, 3].filter((k) => k !== axis);
    for (const sign of [-1, 1]) {
      const base = [0, 0, 0, 0];
      base[axis] = sign < 0 ? min[axis] : max[axis];
      for (const f of free) base[f] = min[f];
      for (const perm of PERMS3) {
        // Kuhn triangulation: walk from the min corner, adding one axis at a time.
        let p = base.slice();
        const verts = [p.slice()];
        for (const pi of perm) {
          p = p.slice();
          p[free[pi]] = max[free[pi]];
          verts.push(p);
        }
        for (const v of verts) tets.push(v[0], v[1], v[2], v[3]);
        cells.push(axis, sign);
      }
    }
  }
  return { tets: new Float32Array(tets), cells: new Int8Array(cells) };
}

// The 32 edges of a hyperbox, as pairs of corner indices (corner bits = xyzw).
export const HYPERBOX_EDGES = (() => {
  const edges = [];
  for (let i = 0; i < 16; i++) {
    for (let b = 0; b < 4; b++) {
      if (!(i & (1 << b))) edges.push([i, i | (1 << b)]);
    }
  }
  return edges;
})();

export function hyperboxCorner(min, max, i) {
  return [
    i & 1 ? max[0] : min[0],
    i & 2 ? max[1] : min[1],
    i & 4 ? max[2] : min[2],
    i & 8 ? max[3] : min[3],
  ];
}

// Slice one tetrahedron (world-space corners) against the hyperplane
// dot(n, p - origin) = 0. Calls emit(a, b, c) for each world-space triangle.
// Returns the number of triangles emitted (0, 1 or 2).
const corner = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
const dist = [0, 0, 0, 0];
const pos = [], neg = [];

export function sliceTet(tets, offset, n, origin, emit) {
  pos.length = 0;
  neg.length = 0;
  for (let i = 0; i < 4; i++) {
    const c = corner[i];
    c[0] = tets[offset + i * 4];
    c[1] = tets[offset + i * 4 + 1];
    c[2] = tets[offset + i * 4 + 2];
    c[3] = tets[offset + i * 4 + 3];
    dist[i] = n[0] * (c[0] - origin[0]) + n[1] * (c[1] - origin[1]) + n[2] * (c[2] - origin[2]) + n[3] * (c[3] - origin[3]);
    (dist[i] >= 0 ? pos : neg).push(i);
  }
  if (pos.length === 0 || neg.length === 0) return 0;

  const cut = (i, j) => {
    const t = dist[i] / (dist[i] - dist[j]);
    return lerp(corner[i], corner[j], t);
  };

  if (pos.length === 1 || neg.length === 1) {
    const lone = pos.length === 1 ? pos[0] : neg[0];
    const others = pos.length === 1 ? neg : pos;
    emit(cut(lone, others[0]), cut(lone, others[1]), cut(lone, others[2]));
    return 1;
  }
  // Two on each side: the cut is a quad. Walk around it in cyclic order.
  const a = cut(pos[0], neg[0]);
  const b = cut(pos[0], neg[1]);
  const c = cut(pos[1], neg[1]);
  const d = cut(pos[1], neg[0]);
  emit(a, b, c);
  emit(a, c, d);
  return 2;
}

// Nearest point on a hyperbox to p, in world space.
export function nearestPointOnBox(min, max, p) {
  return [
    Math.min(max[0], Math.max(min[0], p[0])),
    Math.min(max[1], Math.max(min[1], p[1])),
    Math.min(max[2], Math.max(min[2], p[2])),
    Math.min(max[3], Math.max(min[3], p[3])),
  ];
}

export function boxContains(min, max, p, pad = 0) {
  return p[0] >= min[0] - pad && p[0] <= max[0] + pad &&
    p[1] >= min[1] - pad && p[1] <= max[1] + pad &&
    p[2] >= min[2] - pad && p[2] <= max[2] + pad &&
    p[3] >= min[3] - pad && p[3] <= max[3] + pad;
}

export { dot, sub };
