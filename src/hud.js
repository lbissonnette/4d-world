// DOM overlay: level info, axis readout, button prompt and overlays.

export class Hud {
  constructor(root) {
    this.el = {
      title: root.querySelector('#level-title'),
      hint: root.querySelector('#level-hint'),
      axes: root.querySelector('#axes'),
      overlay: root.querySelector('#overlay'),
      overlayTitle: root.querySelector('#overlay-title'),
      overlayText: root.querySelector('#overlay-text'),
      flash: root.querySelector('#flash'),
      mode: root.querySelector('#mode'),
      stats: root.querySelector('#stats'),
    };
    this.flashUntil = 0;
  }

  setLevel(level, index, count) {
    this.el.title.textContent = `${index + 1} / ${count} · ${level.name}`;
    this.el.hint.textContent = level.hint;
  }

  setState(state, game) {
    const o = this.el;
    if (state === 'ready') {
      o.overlayTitle.textContent = '4D rotation platformer, proof of concept';
      o.overlayText.innerHTML = 'Click or press Space to play. <b>A / D</b> or arrows move · <b>Space</b> jump · stand on a button to turn the level a quarter turn in one of the extra dimensions · <b>G</b> ghosts of hidden geometry · <b>R</b> restart level';
      o.overlay.hidden = false;
    } else if (state === 'complete') {
      o.overlayTitle.textContent = 'Level complete';
      o.overlayText.textContent = `${game.levelTime.toFixed(1)} s, ${game.rotations} turn${game.rotations === 1 ? '' : 's'}, ${game.deaths} fall${game.deaths === 1 ? '' : 's'}.`;
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
    this.el.axes.innerHTML = `Sideways <b>${game.axisLabel(0)}</b> · Depth <b>${game.axisLabel(2)}</b> · Hidden <b>${game.axisLabel(3)}</b>`;
    this.el.mode.textContent = game.ghosts ? 'Ghosts of hidden geometry: on' : 'Ghosts: off';
    this.el.stats.textContent = `${game.renderer.solid.triangles + game.renderer.goal.triangles} tris`;
    if (this.flashUntil && performance.now() > this.flashUntil) {
      this.el.flash.hidden = true;
      this.flashUntil = 0;
    }
  }
}
