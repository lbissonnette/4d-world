// Level data. Every piece is an axis-aligned hyperbox given as [x, y, z, w]
// min and max corners. The player lives on the play plane z = 0, w = 0 and
// only boxes that cross that plane are solid. Floors are 0.6 thick with their
// top at y = 0 and span z (depth) from -1 to 1 so they read as slabs.
//
// Buttons rotate the whole level by 90 degrees in one plane about the
// button's centre. `plane` names the two axes (0 x, 2 z, 3 w) and `angle` the
// direction. Levels are authored in their starting state; the comments give
// where each piece ends up after the intended rotation.

const floor = (x0, x1, z0 = -1, z1 = 1, w0 = -1, w1 = 1, top = 0, extra = {}) => ({
  min: [x0, top - 0.6, z0, w0],
  max: [x1, top, z1, w1],
  ...extra,
});

const button = (cx, plane, angle, label) => ({
  min: [cx - 0.5, 0, -0.5, -0.5],
  max: [cx + 0.5, 0.3, 0.5, 0.5],
  button: { plane, angle, label },
});

export const LEVELS = [
  {
    name: 'Turn',
    hint: 'The way across is lying in the depth behind you. Step on the orange button to turn the world a quarter turn and swing it around.',
    spawn: [-2, 0.4, 0, 0],
    goal: { min: [0, 0, 10, -1], max: [2, 2, 11.5, 1] },          // ends at x 11..12.5
    boxes: [
      floor(-3, 3),                                                 // start, becomes a stub x 0..2
      button(1, [0, 2], -90, 'sideways ↔ depth'),
      floor(0.5, 1.5, 1.5, 7.5),                                    // bridge, ends at x 2.5..8.5
      floor(0, 2, 8, 12),                                           // goal floor, ends at x 9..13
    ],
  },
  {
    name: 'Ana',
    hint: 'Nothing ahead and nothing behind. The pink button turns the sideways axis into the 4th dimension, where the rest of the level is waiting. Press G to see hidden geometry as ghosts.',
    spawn: [-2, 0.4, 0, 0],
    goal: { min: [0, 0, -1, 10], max: [2, 2, 1, 11.5] },          // ends at x 11..12.5
    boxes: [
      floor(-3, 3),
      button(1, [0, 3], -90, 'sideways ↔ 4th'),
      floor(0.5, 1.5, -1, 1, 1.5, 7.5),                             // bridge hidden in w, ends at x 2.5..8.5
      floor(0, 2, -1, 1, 8, 12),                                    // goal floor hidden in w, ends at x 9..13
    ],
  },
  {
    name: 'Two turns',
    hint: 'The bridge is hidden in the 4th dimension and pointing the wrong way. The cyan button swaps depth with the 4th dimension, the orange one turns depth sideways. Order matters, and every button can be pressed again.',
    spawn: [-2.5, 0.4, 0, 0],
    goal: { min: [2, 0, -1, -11.5], max: [4, 2, 1, -10] },        // ends at x 13..14.5
    boxes: [
      floor(-4, 4),                                                 // start; after the orange turn a stub x 2..4
      button(-1, [2, 3], 90, 'depth ↔ 4th'),
      button(3, [0, 2], -90, 'sideways ↔ depth'),
      floor(2.5, 3.5, -0.5, 0.5, -7.5, -1.5),                       // bridge: cyan brings it to depth z 1.5..7.5, orange to x 4.5..10.5
      floor(2, 4, -1, 1, -12, -8),                                  // goal floor: ends at x 11..15
    ],
  },
];
