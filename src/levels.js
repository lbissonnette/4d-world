// Level data. Every piece is an axis-aligned hyperbox given as [x, y, z, w]
// min and max corners. Floors are 0.6 thick with their top at integer heights.
// Platforms normally span 2 units in w (centred on their lane) so the player,
// a sphere of radius 0.4, falls off after moving about 1.4 units ana or kata.

const floor = (x0, x1, z0, z1, w0, w1, top = 0, extra = {}) => ({
  min: [x0, top - 0.6, z0, w0],
  max: [x1, top, z1, w1],
  ...extra,
});

export const LEVELS = [
  {
    name: 'Sidestep',
    hint: 'A wall blocks the path. Press E to move ana (+w) onto the parallel lane, walk past it, then Q to come back.',
    spawn: [0, 0.4, 0, 0],
    goal: { min: [-1.2, 0, 18.5, -1.2], max: [1.2, 2.4, 20.5, 1.2] },
    boxes: [
      floor(-2, 2, -2, 10, -1, 1),                     // start corridor, lane w=0
      { min: [-2, 0, 10, -1], max: [2, 3, 11, 1] },   // the wall, only on lane w=0
      floor(-2, 2, 6, 9, -1, 4),                       // junction spanning both lanes
      floor(-2, 2, 9, 13, 2, 4),                       // parallel lane w=3 past the wall
      floor(-2, 2, 13, 16, -1, 4),                     // junction back
      floor(-2, 2, 16, 21, -1, 1),                     // final stretch and goal
    ],
  },
  {
    name: 'Quarter turn',
    hint: 'The next platforms are ana of you, not ahead. Hold the right mouse button and move the mouse (or press C) to turn into the 4th dimension until they line up in front of you, then jump across.',
    spawn: [0, 0.4, 0, 0],
    goal: { min: [-1.2, 0, -1.2, 10], max: [1.2, 2.4, 1.2, 12.5] },
    boxes: [
      floor(-1.5, 1.5, -1.5, 1.5, -1.5, 1.5),
      floor(-1.5, 1.5, -1.5, 1.5, 3, 5.5),
      floor(-1.5, 1.5, -1.5, 1.5, 7, 9.5),
      floor(-1.5, 1.5, -1.5, 1.5, 11, 13.5),
    ],
  },
  {
    name: 'Hyperstairs',
    hint: 'Climb. The stairs step ana and kata as they rise, and the tower at the top only blocks one lane.',
    spawn: [0, 0.4, 0, 0],
    goal: { min: [-1.2, 7, 21, -1.2], max: [1.2, 9.4, 23.5, 1.2] },
    boxes: [
      floor(-2, 2, -2, 2, -1, 1, 0),
      floor(-2, 2, 3, 6, -1, 1, 1),
      floor(-2, 2, 3, 6, 1.2, 3.5, 2),
      floor(-2, 2, 7.5, 10.5, 1.2, 3.5, 3),
      floor(-2, 2, 7.5, 10.5, -1.2, 1, 4),
      floor(-2, 2, 12, 15, -1.2, 3.5, 5),                    // landing below the tower, both lanes
      { min: [-2, 4.4, 16.5, -1.2], max: [2, 9, 19, 1] },   // tower blocking lane w=0
      floor(-2, 2, 16.5, 19, 1.2, 3.5, 6),                   // way around on lane w=2.4
      floor(-2, 2, 20.5, 24, -1.2, 3.5, 7),                  // summit, goal on lane w=0
    ],
  },
];
