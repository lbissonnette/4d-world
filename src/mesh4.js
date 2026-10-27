// Geometry for axis-aligned hyperboxes (N-dimensional boxes) and the 4D
// tetrahedral slicer.
//
// A 4D hyperbox's surface is eight cubic cells (two per axis). Each cube is
// cut into six tetrahedra, so the surface is 48 tetrahedra. Slicing a
// tetrahedron with the camera's 3D hyperplane gives a triangle or a quad, and
// the union of those polygons is the surface of the 3D cross-section the
// player sees. This is what Engine4D (4D Golf) does in a vertex shader; here
// it runs on the CPU so it stays easy to read and test. For 5D the surface
// cells would be 4-simplices sliced twice; the box helpers below already work
// for any DIM, the slicer does not.

import { DIM, lerp } from './math4.js';

const PERMS3 = [
  [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
];

// Returns { tets: Float32Array(n*16), cells: Int8Array(n*2) } where cells
// holds [axis, sign] per tetrahedron so the renderer can tint faces by cell.
export function hyperboxTets(min, max) {
  if (DIM !== 4) throw new Error('hyperboxTets is 4D only');
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

// Edges of a DIM-dimensional box as pairs of corner indices (corner bit k = axis k at max).
export const HYPERBOX_EDGES = (() => {
  const edges = [];
  for (let i = 0; i < (1 << DIM); i++) {
    for (let b = 0; b < DIM; b++) {
      if (!(i & (1 << b))) edges.push([i, i | (1 << b)]);
    }
  }
  return edges;
})();

export function hyperboxCorner(min, max, i) {
  const p = new Array(DIM);
  for (let k = 0; k < DIM; k++) p[k] = i & (1 << k) ? max[k] : min[k];
  return p;
}

// Transform a box by a point mapping and return the axis-aligned bounds of the
// result. Exact for 90-degree rotations, since those map boxes to boxes.
export function transformBoxBounds(min, max, fn) {
  const nmin = new Array(DIM).fill(Infinity), nmax = new Array(DIM).fill(-Infinity);
  for (let i = 0; i < (1 << DIM); i++) {
    const p = fn(hyperboxCorner(min, max, i));
    for (let k = 0; k < DIM; k++) {
      nmin[k] = Math.min(nmin[k], p[k]);
      nmax[k] = Math.max(nmax[k], p[k]);
    }
  }
  // Snap to a fine grid so repeated rotations don't accumulate float noise.
  const snap = (v) => Math.round(v * 1000) / 1000;
  return { min: nmin.map(snap), max: nmax.map(snap) };
}

// Slice one tetrahedron (world-space corners at tets[offset..offset+16]) against
// the hyperplane dot(n, p - origin) = 0. Calls emit(a, b, c) per triangle.
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

export function nearestPointOnBox(min, max, p) {
  return p.map((x, k) => Math.min(max[k], Math.max(min[k], x)));
}

export function boxContains(min, max, p, pad = 0) {
  return p.every((x, k) => x >= min[k] - pad && x <= max[k] + pad);
}

// True when the box crosses the play plane: every axis other than sideways
// (0) and up (1) has 0 strictly inside its range.
export function boxInPlayPlane(min, max) {
  for (let k = 2; k < DIM; k++) if (min[k] >= 0 || max[k] <= 0) return false;
  return true;
}
