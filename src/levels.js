// Level data. Every piece is an axis-aligned hyperbox given as [x, y, z, w]
// min and max corners. Floors are 0.6 thick with their top at the given
// height and normally span 2 units in w, so the player (a sphere of radius
// 0.4) is supported while within about 1.4 of the lane's centre.
//
// The ladder: each level says which turning controls the player has.
//   walk  - no way to change your heading in w; buttons turn the world for you
//   snap  - Q / E turn you 90 degrees into the 4th dimension
//   free  - also hold the right mouse button (or Z / C) to turn continuously
//
// Buttons rotate the whole level 90 degrees in one plane about the button's
// centre. Pieces that only matter after a button press are authored in the
// state the level is in after that press (`stage: n`) and rotated back to
// their starting position when the level loads, so the coordinates below read
// as the layout the player walks across, not where the pieces start.

import { rotateInPlane } from './math4.js';
import { transformBoxBounds } from './mesh4.js';

const floor = (x0, x1, z0, z1, w0 = -1, w1 = 1, top = 0, extra = {}) => ({
  min: [x0, top - 0.6, z0, w0],
  max: [x1, top, z1, w1],
  ...extra,
});

const button = (cx, cz, plane, angle, label, extra = {}) => ({
  min: [cx - 0.5, 0, cz - 0.5, -0.5],
  max: [cx + 0.5, 0.3, cz + 0.5, 0.5],
  button: { plane, angle, label },
  ...extra,
});

const goal = (x0, x1, z0, z1, w0 = -1, w1 = 1, bottom = 0) => ({ min: [x0, bottom, z0, w0], max: [x1, bottom + 2.4, z1, w1] });

// A level's rotations, in the order the player triggers them. Each is
// { plane, angle (degrees), pivot }. Piece coordinates given at `stage: k`
// are undone through rotations k-1 .. 0 to find where the piece starts.
function buildLevel(level) {
  const DEG = Math.PI / 180;
  const rots = level.rotations || [];
  const toStart = (box) => {
    let { min, max } = box;
    for (let k = (box.stage || 0) - 1; k >= 0; k--) {
      const r = rots[k];
      const b = transformBoxBounds(min, max, (p) => rotateInPlane(p, r.plane[0], r.plane[1], -r.angle * DEG, r.pivot));
      min = b.min; max = b.max;
    }
    return { ...box, min, max, stage: undefined };
  };
  return { ...level, boxes: level.boxes.map(toStart), goal: toStart(level.goal) };
}

const ZW = [2, 3], XW = [0, 3];

export const LEVELS = [
  {
    name: 'Walk',
    controls: 'walk',
    hint: 'Just a corridor. Walk with WASD, jump with Space, look with the mouse. The gold box is the goal.',
    spawn: [0, 0.4, -4, 0],
    goal: goal(-1.2, 1.2, 18.5, 20),
    boxes: [
      floor(-2, 2, -6, 5),
      floor(-2, 2, 7.5, 13),
      floor(-2, 2, 15, 21, -1, 1, 1),
    ],
  },
  {
    name: 'Watch',
    controls: 'walk',
    hint: 'The path ends, but there is more level in the 4th dimension. Step on the cyan button and watch the world turn so the rest swings in front of you.',
    spawn: [0, 0.4, -4, 0],
    rotations: [{ plane: ZW, angle: -90, pivot: [0, 0, 0, 0] }],
    goal: { ...goal(-1.2, 1.2, 10, 11.5), stage: 1 },
    boxes: [
      floor(-2, 2, -6, 1),
      button(0, 0, ZW, -90, 'depth ↔ 4th'),
      { ...floor(-1, 1, 1.5, 7.5, -0.5, 0.5), stage: 1 },
      { ...floor(-2, 2, 8, 12), stage: 1 },
    ],
  },
  {
    name: 'Twice',
    controls: 'walk',
    hint: 'Two buttons this time. Each one turns the world about itself, so the second only works once you are standing on it.',
    spawn: [0, 0.4, -4, 0],
    rotations: [
      { plane: ZW, angle: -90, pivot: [0, 0, 0, 0] },
      { plane: ZW, angle: -90, pivot: [0, 0, 9, 0] },
    ],
    goal: { ...goal(-1.2, 1.2, 19, 20.5), stage: 2 },
    boxes: [
      floor(-2, 2, -6, 1),
      button(0, 0, ZW, -90, 'depth ↔ 4th'),
      { ...floor(-1, 1, 1.5, 7.5, -0.5, 0.5), stage: 1 },
      { ...floor(-2, 2, 8, 10), stage: 1 },
      { ...button(0, 9, ZW, -90, 'depth ↔ 4th'), stage: 1 },
      { ...floor(-1, 1, 10.5, 16.5, -0.5, 0.5), stage: 2 },
      { ...floor(-2, 2, 17, 21), stage: 2 },
    ],
  },
  {
    name: 'Your turn',
    controls: 'snap',
    hint: 'Now you turn. Press E to turn a quarter turn into the 4th dimension (ana). The platforms that were beside you in w line up ahead; jump across them. Q turns back.',
    spawn: [0, 0.4, 0, 0],
    goal: goal(-1.2, 1.2, -1.2, 1.2, 11, 13.5),
    boxes: [
      floor(-1.5, 1.5, -1.5, 1.5, -1.5, 1.5),
      floor(-1.5, 1.5, -1.5, 1.5, 3, 5.5),
      floor(-1.5, 1.5, -1.5, 1.5, 7, 9.5),
      floor(-1.5, 1.5, -1.5, 1.5, 11, 13.5),
    ],
  },
  {
    name: 'Hyperstairs',
    controls: 'free',
    hint: 'Free turning is on: hold the right mouse button and move the mouse (or hold Z / C) to turn as far into the 4th dimension as you like. The stairs step ana and kata as they climb.',
    spawn: [0, 0.4, 0, 0],
    goal: goal(-1.2, 1.2, 21, 23.5, -1.2, 1.2, 7),
    boxes: [
      floor(-2, 2, -2, 2, -1, 1, 0),
      floor(-2, 2, 3, 6, -1, 1, 1),
      floor(-2, 2, 3, 6, 1.2, 3.5, 2),
      floor(-2, 2, 7.5, 10.5, 1.2, 3.5, 3),
      floor(-2, 2, 7.5, 10.5, -1.2, 1, 4),
      floor(-2, 2, 12, 15, -1.2, 3.5, 5),
      { min: [-2, 4.4, 16.5, -1.2], max: [2, 9, 19, 1] },   // tower blocking lane w=0
      floor(-2, 2, 16.5, 19, 1.2, 3.5, 6),                   // way around on lane w=2.4
      floor(-2, 2, 20.5, 24, -1.2, 3.5, 7),                  // summit, goal on lane w=0
    ],
  },
].map(buildLevel);
