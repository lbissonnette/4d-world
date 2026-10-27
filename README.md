# 4D World

Proof of concept for a side-on platformer whose levels live in four spatial
dimensions. The player only ever moves left, right and up on a 2D plane, and
sees that plane with depth, like a 2.5D platformer. Buttons in the level turn
the whole world a quarter turn in one of the extra planes (sideways/depth,
sideways/4th, depth/4th), swinging geometry that was hidden in the 4th
dimension into the play plane. Think Fez, with two more planes to rotate in.

Rendering follows 4D Golf: the level is a set of 4D boxes, and the view is a
3D cross-section of them, taken at the player's position in the 4th
dimension. Geometry hidden in the 4th dimension can be shown as ghost
wireframes (pink is +w, cyan is -w).

Everything runs in the browser with no build step. Open `index.html` over a
local web server and click to play.

```
npm start            # python3 -m http.server 8080, then open http://localhost:8080
npm test             # drives a bot through every level in headless Chromium
```

## Controls

| Input | Action |
| --- | --- |
| A / D or arrow keys | Move sideways |
| Space, W or up | Jump |
| Stand on a button | Turn the level 90° about that button in the button's plane |
| G | Toggle ghost wireframes of geometry hidden in the 4th dimension |
| R | Restart the level |

Orange buttons turn sideways into depth (the Fez rotation). Pink buttons turn
sideways into the 4th dimension. Cyan buttons swap depth with the 4th
dimension, which brings hidden geometry into view as a preview. Every button
can be pressed again once you step off it, and four presses bring the level
back to where it was.

## How it works

- `src/math4.js`: N-dimensional vectors and a rotation in any axis plane.
  `DIM` is 4; the vector, box and rotation code works for any value. The
  tetrahedral slicer is the one 4D-only piece (5D needs 4-simplices sliced
  twice, which is how Engine4D's 5D mode works).
- `src/mesh4.js`: each hyperbox's surface is eight cubes cut into 48
  tetrahedra. Slicing a tetrahedron with the view's 3D hyperplane gives a
  triangle or a quad; together they are the surface of the cross-section.
  Also the axis-aligned bounds of a box after a 90° rotation.
- `src/render.js`: rebuilds the sliced mesh in camera space every frame,
  applying the in-progress rotation to the tetrahedra while a turn animates.
  A clipping plane cuts open anything between the camera and the play plane
  so the player is never hidden.
- `src/physics.js`: the player is a sphere confined to the play plane. It
  collides with the (x, y) rectangle of every box that crosses the plane,
  with Engine4D-style push-out and velocity cancelling.
- `src/game.js`: movement, jump buffering and coyote time, button presses,
  the rotation animation (the player is frozen while the world turns, as in
  Fez), and the axis readout that tracks where the level's axes have gone.
- `src/levels.js`: three levels. Turn (sideways/depth), Ana (sideways/4th),
  Two turns (depth/4th then sideways/depth).

The first version of this prototype was a first-person 4D platformer with a
blind strafe along the 4th axis; it is in the git history.

## Licences

`vendor/three.module.min.js` is three.js r160, MIT licence (see
`vendor/THREE-LICENSE`).
