// Vector Protocol — input: keyboard state, pointer lock mouse look, fixed-step consumption.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.dx = 0;
    this.dy = 0;
    this.fire = false;
    this.fireQueued = false;
    this.locked = false;
    this.sens = 0.0021;

    this._down = (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Tab') e.preventDefault();
    };
    this._up = (e) => this.keys.delete(e.code);
    this._move = (e) => {
      if (!this.locked) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    };
    this._mdown = (e) => {
      if (!this.locked) return;
      if (e.button === 0) { this.fire = true; this.fireQueued = true; }
    };
    this._mup = (e) => {
      if (e.button === 0) this.fire = false;
    };
    this._lockchange = () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) { this.fire = false; this.keys.clear(); }
    };

    window.addEventListener('keydown', this._down);
    window.addEventListener('keyup', this._up);
    window.addEventListener('mousemove', this._move);
    window.addEventListener('mousedown', this._mdown);
    window.addEventListener('mouseup', this._mup);
    document.addEventListener('pointerlockchange', this._lockchange);
  }

  lock() {
    if (!this.locked) this.canvas.requestPointerLock();
  }

  unlock() {
    if (this.locked) document.exitPointerLock();
  }

  // consume accumulated mouse delta (called once per render frame)
  takeMouse() {
    const d = { dx: this.dx, dy: this.dy };
    this.dx = 0;
    this.dy = 0;
    return d;
  }

  down(code) { return this.keys.has(code); }

  dispose() {
    window.removeEventListener('keydown', this._down);
    window.removeEventListener('keyup', this._up);
    window.removeEventListener('mousemove', this._move);
    window.removeEventListener('mousedown', this._mdown);
    window.removeEventListener('mouseup', this._mup);
    document.removeEventListener('pointerlockchange', this._lockchange);
  }
}
