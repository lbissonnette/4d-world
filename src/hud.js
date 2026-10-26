// DOM overlay: level info, the w-strip compass, facing readout and overlays.

const AXES = ['X', 'Y', 'Z', 'W'];

function axisName(v) {
  let best = 0;
  for (let k = 1; k < 4; k++) if (Math.abs(v[k]) > Math.abs(v[best])) best = k;
  return (v[best] < 0 ? '−' : '+') + AXES[best];
}

export class Hud {
  constructor(root) {
    this.el = {
      title: root.querySelector('#level-title'),
      hint: root.querySelector('#level-hint'),
      facing: root.querySelector('#facing'),
      wPlayer: root.querySelector('#w-player'),
      wGoal: root.querySelector('#w-goal'),
      wValue: root.querySelector('#w-value'),
      overlay: root.querySelector('#overlay'),
      overlayTitle: root.querySelector('#overlay-title'),
      overlayText: root.querySelector('#overlay-text'),
      flash: root.querySelector('#flash'),
      mode: root.querySelector('#mode'),
      stats: root.querySelector('#stats'),
    };
    this.wRange = [-4, 4];
    this.flashUntil = 0;
  }

  setLevel(level, index, count) {
    this.el.title.textContent = `${index + 1} / ${count} · ${level.name}`;
    this.el.hint.textContent = level.hint;
    let lo = Infinity, hi = -Infinity;
    for (const b of level.boxes) { lo = Math.min(lo, b.min[3]); hi = Math.max(hi, b.max[3]); }
    this.wRange = [Math.min(lo, -2) - 1, Math.max(hi, 2) + 1];
    const gw = (level.goal.min[3] + level.goal.max[3]) / 2;
    this.el.wGoal.style.left = `${this.pct(gw)}%`;
  }

  pct(w) {
    const [lo, hi] = this.wRange;
    return Math.max(0, Math.min(100, ((w - lo) / (hi - lo)) * 100));
  }

  setState(state, game) {
    const o = this.el;
    if (state === 'ready') {
      o.overlayTitle.textContent = '4D platformer, proof of concept';
      o.overlayText.innerHTML = 'Click to play. <b>WASD</b> move · <b>Space</b> jump · <b>Q / E</b> move kata / ana · mouse looks · <b>right mouse + move</b> (or <b>Z / C</b>) turns into the 4th dimension · <b>V</b> volume map · <b>G</b> ghosts · <b>R</b> restart level';
      o.overlay.hidden = false;
    } else if (state === 'complete') {
      o.overlayTitle.textContent = 'Level complete';
      o.overlayText.textContent = `${game.levelTime.toFixed(1)} s, ${game.deaths} fall${game.deaths === 1 ? '' : 's'}.`;
      o.overlay.hidden = false;
    } else if (state === 'finished') {
      o.overlayTitle.textContent = 'That is the whole proof of concept';
      o.overlayText.textContent = 'Press R to play the levels again.';
      o.overlay.hidden = false;
    } else {
      o.overlay.hidden = true;
    }
  }

  flash(text) {
    this.el.flash.textContent = text;
    this.el.flash.hidden = false;
    this.flashUntil = performance.now() + 1800;
  }

  update(game) {
    const { f, a } = game.axes();
    this.el.facing.textContent = `Forward ${axisName(f)}  ·  Ana ${axisName(a)}`;
    const w = game.body.pos[3];
    this.el.wPlayer.style.left = `${this.pct(w)}%`;
    this.el.wValue.textContent = `w = ${w.toFixed(1)}`;
    this.el.mode.textContent = game.volume ? 'Volume map (x, z, w)' : game.ghosts ? 'Slice view · ghosts on' : 'Slice view · ghosts off';
    this.el.stats.textContent = `${game.renderer.solid.triangles + game.renderer.goal.triangles} tris`;
    if (this.flashUntil && performance.now() > this.flashUntil) {
      this.el.flash.hidden = true;
      this.flashUntil = 0;
    }
  }
}
