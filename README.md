# 4D World

Proof of concept for a first-person 4D platformer that could grow into a Steam
game. The player walks, jumps and sidesteps through four spatial dimensions,
and sees the world the way 4D Golf shows it: as a 3D cross-section of the 4D
level, with translucent "ghosts" of the geometry that lies ana or kata of
the current slice.

Everything runs in the browser with no build step. Open `index.html` over a
local web server and click to play.

```
npm start            # python3 -m http.server 8080, then open http://localhost:8080
npm test             # drives a bot through every level in headless Chromium
```

## Controls

| Input | Action |
| --- | --- |
| W A S D | Move within your current 3D slice |
| Q / E | Move kata (−w) / ana (+w) |
| Space | Jump |
| Mouse | Look (click the view to lock the pointer) |
| Right mouse + move, or Z / C | Turn into the 4th dimension (rotate forward into w) |
| V | Volume map: a view of the level with w shown as height |
| G | Toggle ghost projections |
| R | Restart the level |

## How it works

The design follows [Engine4D](https://github.com/HackerPoet/Engine4D), the
MIT-licensed 4D layer behind 4D Golf, with the numerics simplified for a
proof of concept:

- `src/mesh4.js`: level pieces are axis-aligned hyperboxes. Each one's surface
  is eight cubic cells cut into 48 tetrahedra. Slicing a tetrahedron with the
  camera's 3D hyperplane yields a triangle or a quad, and the union of those
  polygons is the surface of the 3D cross-section.
- `src/render.js`: rebuilds the sliced mesh in camera space every frame and
  hands it to three.js. Ghosts are the hyperbox edges projected by dropping
  the camera-space w coordinate, pink for ana and cyan for kata. A 4D
  checkerboard shader gives surfaces texture that changes as you move in w.
- `src/physics.js`: the player is a sphere. Each fixed step pushes it out of
  every hyperbox it overlaps along the nearest-point direction and cancels
  the velocity along that push, which is the same scheme as `Physical4D`.
- `src/game.js`: camera frame from yaw, a "w-turn" (rotation of forward into
  w) and pitch; movement in the camera's flattened frame; jump buffering and
  coyote time; the volume view as an interpolated second camera frame.
- `src/levels.js`: three teaching levels. Sidestep (move ana/kata), Quarter
  turn (look into w), Hyperstairs (both while climbing).

Engine4D slices in a vertex shader with a lookup table; here it is done on
the CPU so it stays easy to read and test. At a few hundred tetrahedra per
level this is far from any limit.

## Next steps

See the research and MVP plan in the project. The intended path is to port
these mechanics to Unity on a fork of Engine4D once the controls and level
language feel right.

## Licences

`vendor/three.module.min.js` is three.js r160, MIT licence (see
`vendor/THREE-LICENSE`).
