// three.js rendering of the 3D cross-section plus ghost projections.
// All geometry is rebuilt each frame in camera space, so the three.js camera
// sits at the origin looking down -z and never moves.

import * as THREE from '../vendor/three.module.min.js';
import { hyperboxTets, sliceTet, HYPERBOX_EDGES, hyperboxCorner } from './mesh4.js';
import { toCam } from './math4.js';

const ANA = new THREE.Color('#f06aa8');
const KATA = new THREE.Color('#4cc3e6');
const GHOST_RANGE = 7;

function cellTint(base, axis, sign) {
  const c = base.clone();
  if (axis === 3) c.lerp(sign > 0 ? ANA : KATA, 0.5);
  else if (axis === 1) c.lerp(new THREE.Color(sign > 0 ? '#ffffff' : '#000000'), sign > 0 ? 0.25 : 0.35);
  else c.lerp(new THREE.Color('#000000'), 0.12);
  return c;
}

// Holds the tetrahedra for a set of boxes and rebuilds the sliced mesh.
class SliceMesh {
  constructor(boxes, material) {
    this.boxes = boxes;
    this.parts = boxes.map((b) => {
      const { tets, cells } = hyperboxTets(b.min, b.max);
      const base = new THREE.Color(b.color || '#8aa0b0');
      const colors = new Float32Array((tets.length / 16) * 3);
      for (let i = 0; i < cells.length / 2; i++) {
        const c = cellTint(base, cells[i * 2], cells[i * 2 + 1]);
        colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      }
      return { box: b, tets, colors };
    });
    const tetCount = this.parts.reduce((n, p) => n + p.tets.length / 16, 0);
    const maxVerts = tetCount * 6;
    this.positions = new Float32Array(maxVerts * 3);
    this.normals = new Float32Array(maxVerts * 3);
    this.colors = new Float32Array(maxVerts * 3);
    this.worldPos = new Float32Array(maxVerts * 4);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(this.normals, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('wpos', new THREE.BufferAttribute(this.worldPos, 4).setUsage(THREE.DynamicDrawUsage));
    this.geometry = geo;
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.triangles = 0;
  }

  rebuild(frame, camPos) {
    let v = 0;
    const P = this.positions, N = this.normals, C = this.colors, W = this.worldPos;
    const emit = (r, g, b) => (a, bb, c) => {
      const ca = toCam(frame, camPos, a), cb = toCam(frame, camPos, bb), cc = toCam(frame, camPos, c);
      for (const [k, q] of [a, bb, c].entries()) {
        W[(v + k) * 4] = q[0]; W[(v + k) * 4 + 1] = q[1]; W[(v + k) * 4 + 2] = q[2]; W[(v + k) * 4 + 3] = q[3];
      }
      // Flat normal from the camera-space triangle (three.js flips it for back faces).
      const ux = cb[0] - ca[0], uy = cb[1] - ca[1], uz = -(cb[2] - ca[2]);
      const vx = cc[0] - ca[0], vy = cc[1] - ca[1], vz = -(cc[2] - ca[2]);
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      for (const q of [ca, cb, cc]) {
        P[v * 3] = q[0]; P[v * 3 + 1] = q[1]; P[v * 3 + 2] = -q[2];
        N[v * 3] = nx; N[v * 3 + 1] = ny; N[v * 3 + 2] = nz;
        C[v * 3] = r; C[v * 3 + 1] = g; C[v * 3 + 2] = b;
        v++;
      }
    };
    for (const part of this.parts) {
      if (part.box.hidden) continue;
      // Skip boxes whose w-range cannot touch the slice: cheap AABB reject.
      const n = frame.ana;
      let lo = 0, hi = 0;
      for (let k = 0; k < 4; k++) {
        const a = n[k] * (part.box.min[k] - camPos[k]), b = n[k] * (part.box.max[k] - camPos[k]);
        lo += Math.min(a, b); hi += Math.max(a, b);
      }
      if (lo > 0 || hi < 0) continue;
      const count = part.tets.length / 16;
      for (let i = 0; i < count; i++) {
        sliceTet(part.tets, i * 16, n, camPos, emit(part.colors[i * 3], part.colors[i * 3 + 1], part.colors[i * 3 + 2]));
      }
    }
    this.triangles = v / 3;
    this.geometry.setDrawRange(0, v);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.wpos.needsUpdate = true;
  }
}

// Adds a 4D checkerboard (1-unit cells in x, y, z and w) to a material so
// surfaces show depth and movement, including movement along w.
function withChecker(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 wpos;\nvarying vec4 vWpos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWpos = wpos;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vWpos;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec4 f = floor(vWpos + 0.002);
        float ch = mod(f.x + f.y + f.z + f.w, 2.0);
        vec4 e = abs(fract(vWpos + 0.002) - 0.5);
        float edge = smoothstep(0.47, 0.5, max(max(e.x, e.y), max(e.z, e.w)));
        diffuseColor.rgb *= mix(0.84, 1.0, ch) * (1.0 - 0.25 * edge);
      }`);
  };
  return material;
}

// Translucent wireframes of boxes that lie off the slice, projected by
// dropping the camera-space w coordinate. Pink means ana, cyan means kata.
class GhostLines {
  constructor(boxes) {
    this.boxes = boxes;
    const maxVerts = boxes.length * HYPERBOX_EDGES.length * 2;
    this.positions = new Float32Array(maxVerts * 3);
    this.colors = new Float32Array(maxVerts * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry = geo;
    this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.45, depthTest: false,
    }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 2;
  }

  rebuild(frame, camPos, enabled) {
    let v = 0;
    if (enabled) {
      const P = this.positions, C = this.colors;
      for (const box of this.boxes) {
        if (box.hidden || box.noGhost) continue;
        const corners = [];
        let minW = Infinity, maxW = -Infinity;
        for (let i = 0; i < 16; i++) {
          const c = toCam(frame, camPos, hyperboxCorner(box.min, box.max, i));
          corners.push(c);
          minW = Math.min(minW, c[3]); maxW = Math.max(maxW, c[3]);
        }
        if (minW <= 0 && maxW >= 0) continue;           // visible directly, no ghost needed
        const w = minW > 0 ? minW : maxW;
        if (Math.abs(w) > GHOST_RANGE) continue;
        const col = (w > 0 ? ANA : KATA).clone();
        col.multiplyScalar(1 - Math.abs(w) / GHOST_RANGE * 0.7);
        for (const [i, j] of HYPERBOX_EDGES) {
          for (const q of [corners[i], corners[j]]) {
            P[v * 3] = q[0]; P[v * 3 + 1] = q[1]; P[v * 3 + 2] = -q[2];
            C[v * 3] = col.r; C[v * 3 + 1] = col.g; C[v * 3 + 2] = col.b;
            v++;
          }
        }
      }
    }
    this.geometry.setDrawRange(0, v);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }
}

export class Renderer4D {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0d1a24');
    this.scene.fog = new THREE.Fog('#0d1a24', 18, 60);
    this.camera = new THREE.PerspectiveCamera(80, 1, 0.05, 200);
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(0, 0, -1);

    const sun = new THREE.DirectionalLight('#fff4e0', 1.5);
    sun.position.set(0.5, 1, 0.8);
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight('#cfe3f0', '#2a3a46', 1.3));

    this.solidMat = withChecker(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    this.glowMat = withChecker(new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.5, depthWrite: false,
    }));

    const markerGeo = new THREE.SphereGeometry(0.4, 24, 16);
    this.marker = new THREE.Mesh(markerGeo, new THREE.MeshLambertMaterial({ color: '#fff3b0', emissive: '#6b5a1a' }));
    this.marker.visible = false;
    this.scene.add(this.marker);

    this.solid = null;
    this.goal = null;
    this.ghosts = null;
    this.resize();
  }

  resize() {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setLevel(boxes, goalBox) {
    for (const obj of [this.solid?.mesh, this.goal?.mesh, this.ghosts?.lines]) if (obj) this.scene.remove(obj);
    this.solid = new SliceMesh(boxes, this.solidMat);
    this.goal = new SliceMesh([goalBox], this.glowMat);
    this.ghosts = new GhostLines([...boxes, goalBox]);
    this.scene.add(this.solid.mesh, this.goal.mesh, this.ghosts.lines);
  }

  render(frame, camPos, opts) {
    this.solid.rebuild(frame, camPos);
    this.goal.rebuild(frame, camPos);
    this.ghosts.rebuild(frame, camPos, opts.ghosts);
    this.camera.fov = opts.fov;
    this.camera.updateProjectionMatrix();
    if (opts.marker) {
      const m = toCam(frame, camPos, opts.marker);
      this.marker.position.set(m[0], m[1], -m[2]);
      this.marker.visible = true;
    } else {
      this.marker.visible = false;
    }
    this.renderer.render(this.scene, this.camera);
  }
}
