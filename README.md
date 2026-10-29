# 4D World

Proof of concept for a first-person platformer in continuous four-dimensional
space, built the way 4D Golf does it: the level is a set of 4D boxes and the
player sees a 3D cross-section of them, plus ghost wireframes of what lies
ana (+w, pink) or kata (-w, cyan) of the slice.

The player never strafes blindly into the 4th dimension. Five levels form a
ladder that hands over control of w one rung at a time:

1. **Walk**: an ordinary corridor.
2. **Watch**: a button turns the world a quarter turn about itself, swinging
   the hidden rest of the level in front of you while you stand still.
3. **Twice**: two buttons in sequence.
4. **Your turn**: Q / E turn *you* a quarter turn into the 4th dimension, so
   what was beside you in w lines up ahead and you walk toward it.
5. **Hyperstairs**: free turning with the right mouse button (or Z / C).

Everything runs in the browser with no build step. Open `index.html` over a
local web server and click to play.

```
npm start            # python3 -m http.server 8080, then open http://localhost:8080
npm test             # drives a bot through every level in headless Chromium
```

## Controls

| Input | Action |
| --- | --- |
| W A S D | Move in the direction you face (forward may point into w) |
| Space | Jump |
| Mouse | Look (click the view to lock the pointer; dragging works too) |
| Q / E | Quarter turn into the 4th dimension (from level 4) |
| Right mouse + move, or Z / C | Turn freely into the 4th dimension (from level 5) |
| V | Volume map: the level with w shown as height |
| G | Toggle ghost wireframes of geometry off the slice |
| R | Restart the level |

## How it works

- `src/math4.js`: N-dimensional vectors, a rotation in any axis plane and
  camera-frame helpers. `DIM` is 4; the vector, box and rotation code works
  for any value. The tetrahedral slicer is the one 4D-only piece (5D needs
  4-simplices sliced twice, which is how Engine4D's 5D mode works).
- `src/mesh4.js`: each hyperbox's surface is eight cubes cut into 48
  tetrahedra. Slicing a tetrahedron with the view's 3D hyperplane gives a
  triangle or a quad; together they are the surface of the cross-section.
  Also the axis-aligned bounds of a box after a 90° rotation.
- `src/render.js`: rebuilds the sliced mesh in camera space every frame,
  applying the in-progress rotation to the tetrahedra while a button turn
  animates. A 4D checkerboard shader gives surfaces texture that changes as
  you move in w.
- `src/physics.js`: the player is a sphere pushed out of every box it
  overlaps along the nearest-point direction, with the velocity along the
  push cancelled, the same scheme as Engine4D's `Physical4D`.
- `src/game.js`: camera frame from yaw, a w-turn (rotation of forward into
  w) and pitch; movement in the camera's flattened frame; snap turns; button
  presses and the world-rotation animation (the player is frozen while the
  world turns); the volume view as an interpolated second camera frame.
- `src/levels.js`: the five levels. Pieces that only matter after a button
  press are authored in their post-press position and rotated back to their
  starting spot on load.

Engine4D slices in a vertex shader with a lookup table; here it is done on
the CPU so it stays easy to read and test.

Earlier versions in the git history: a first-person prototype with a blind
ana/kata strafe, and a side-on 2.5D prototype where only buttons rotated the
world.

## Licences

`vendor/three.module.min.js` is three.js r160, MIT licence (see
`vendor/THREE-LICENSE`).
