// Shootable things in the test range: red training dummies and a destructible wall.
import { Weapon } from './weapon.js';
import { compose, mat4 } from './math.js';
import { makeBox, moveBoxTo } from './world.js';

const RED = [0.92, 0.1, 0.08];

// Crash-test style training dummy on a steel stand. Parts relative to its feet: centre, size, colour.
const YEL = [0.98, 0.76, 0.12];      // painted body shells
const BLK = [0.09, 0.09, 0.1];       // rubber joints
const GRY = [0.32, 0.33, 0.36];
const STL = [0.55, 0.56, 0.6];
// faces +z (toward the firing line in the range)
const P = (c, s, col, shape, mat, head = false) => ({ c: [c[0], c[1], -c[2]], s, col, shape, mat, head });
const DUMMY = [
  P([0, 0.025, 0.12], [0.62, 0.05, 0.52], GRY, 0.02, 'metal'),                 // stand base
  P([0, 0.62, 0.2], [0.05, 1.2, 0.05], STL, 'cyl', 'steel'),                   // stand pole
  P([0, 1.2, 0.16], [0.16, 0.08, 0.06], GRY, 0.02, 'metal'),                   // back clamp
  ...[-1, 1].flatMap((s) => [
    P([s * 0.11, 0.05, -0.04], [0.12, 0.1, 0.27], BLK, 0.04, 'rubber'),        // boot
    P([s * 0.11, 0.32, 0], [0.13, 0.44, 0.14], YEL, 0.06, 'paint'),           // shin
    P([s * 0.11, 0.56, 0], [0.15, 0.13, 0.15], BLK, 'sphere', 'rubber'),       // knee
    P([s * 0.11, 0.79, 0], [0.17, 0.4, 0.18], YEL, 0.07, 'paint'),            // thigh
    P([s * 0.27, 1.47, 0], [0.15, 0.15, 0.15], BLK, 'sphere', 'rubber'),       // shoulder
    P([s * 0.3, 1.29, 0], [0.11, 0.3, 0.12], YEL, 0.05, 'paint'),             // upper arm
    P([s * 0.31, 1.13, 0], [0.1, 0.09, 0.1], BLK, 'sphere', 'rubber'),         // elbow
    P([s * 0.31, 0.99, -0.03], [0.095, 0.26, 0.1], YEL, 0.045, 'paint'),      // forearm
    P([s * 0.31, 0.82, -0.03], [0.08, 0.12, 0.09], BLK, 0.03, 'rubber'),       // hand
    P([s * 0.123, 1.77, 0], [0.01, 0.09, 0.09], BLK, 0.004, 'rubber', true),   // head target marks
    P([s * 0.124, 1.77, 0], [0.01, 0.045, 0.045], YEL, 0.002, 'paint', true),
  ]),
  P([0, 1.0, 0], [0.38, 0.2, 0.22], BLK, 0.08, 'rubber'),                      // pelvis
  P([0, 1.15, 0], [0.3, 0.16, 0.2], GRY, 0.07, 'rubber'),                      // abdomen
  P([0, 1.37, 0], [0.45, 0.34, 0.25], YEL, 0.11, 'paint'),                     // chest
  P([0, 1.39, -0.127], [0.13, 0.13, 0.01], BLK, 0.005, 'rubber'),              // chest target
  P([0, 1.39, -0.132], [0.065, 0.065, 0.01], YEL, 0.003, 'paint'),
  P([0, 1.6, 0], [0.1, 0.1, 0.1], BLK, 'cyl', 'rubber', true),                 // neck
  P([0, 1.77, 0], [0.24, 0.27, 0.25], YEL, 'sphere', 'paint', true),           // head
  P([0, 1.79, -0.11], [0.15, 0.04, 0.05], BLK, 0.015, 'rubber', true),         // brow line
];

export class Dummy {
  constructor(world, effects, pos, move = null) {
    this.world = world;
    this.effects = effects;
    this.base = [...pos];
    this.pos = [...pos];
    this.move = move; // { axis: 0|2, range, speed }
    this.alive = false;
    this.respawnIn = 0;
    this.boxes = [];
    this.phase = Math.random() * 10;
    this.spawn();
  }

  spawn() {
    this.alive = true;
    this.hp = 100;
    this.flash = 0;
    this.boxes = DUMMY.map((p) => this.world.add(makeBox([0, 0, 0], p.s, {
      color: [...p.col], grid: false, edges: false, emissive: 0, tag: 'dummy', ref: this, shape: p.shape, mat: p.mat,
    })));
    this.boxes.forEach((b, i) => { b.head = !!DUMMY[i].head; });
    this.place();
  }

  // returns true if this hit killed it
  damage(amount, dir) {
    if (!this.alive) return false;
    this.hp -= amount;
    this.flash = 0.07;
    if (this.hp <= 0) { this.kill(dir); return true; }
    return false;
  }

  place() {
    this.boxes.forEach((b, i) => {
      const c = DUMMY[i].c;
      moveBoxTo(b, [this.pos[0] + c[0], this.pos[1] + c[1], this.pos[2] + c[2]]);
    });
  }

  kill(dir) {
    if (!this.alive) return;
    this.alive = false;
    this.respawnIn = 2.5;
    for (const [i, b] of this.boxes.entries()) {
      b.color = [...DUMMY[i].col];
      this.world.remove(b);
      this.effects.shatter(b, dir, 3, 4.5, 0.18);
    }
    this.boxes = [];
  }

  update(dt, time) {
    if (!this.alive) {
      this.respawnIn -= dt;
      if (this.respawnIn <= 0) this.spawn();
      return;
    }
    this.flash -= dt;
    const f = this.flash > 0 ? 1 : 0;
    this.boxes.forEach((b, i) => {
      const col = DUMMY[i].col;
      for (let k = 0; k < 3; k++) b.color[k] = col[k] + (1 - col[k]) * f * 0.85;
      b.emissive = f ? 0.9 : 0;
    });
    this.held = Math.max(0, (this.held || 0) - dt);      // tethered: it can't keep walking its line
    if (this.move && !this.held) {
      const m = this.move;
      this.pos[m.axis] = this.base[m.axis] + Math.sin((time + this.phase) * m.speed / m.range) * m.range;
      this.place();
    }
  }

  reset() {
    for (const b of this.boxes) this.world.remove(b);
    this.boxes = [];
    this.pos = [...this.base];
    this.spawn();
  }
}

// A wall made of small chunks. Shoot chunks out; anything no longer connected
// to the ground collapses. With `hp` (the arenas), each chunk soaks up that much damage before it breaks, so
// bullets chip a wall away and explosions blow holes in it; without it (the test range) every hit breaks chunks.
export class DestructibleWall {
  // origin = min corner. Runs along +X (axis 0) or +Z (axis 2). ch = chunk height (defaults to chunk).
  constructor(world, effects, origin, { cols = 12, rows = 6, chunk = 0.5, ch = null, thick = 0.35, axis = 0, color = null, hp = 0, tex = 0 } = {}) {
    Object.assign(this, { world, effects, origin, cols, rows, chunk, thick, axis, hp, tex });
    this.ch = ch || chunk;
    this.color = color || [0.9, 0.9, 0.92];
    this.cells = [];
    this.build();
  }

  build() {
    for (const row of this.cells) for (const b of row) if (b) this.world.remove(b);
    this.cells = [];
    const { origin: o, chunk: c, thick: t } = this;
    for (let r = 0; r < this.rows; r++) {
      const row = [];
      for (let k = 0; k < this.cols; k++) {
        const min = [...o], max = [...o];
        const along = this.axis, across = this.axis === 0 ? 2 : 0;
        min[along] += k * c; max[along] += (k + 1) * c;
        min[1] += r * this.ch; max[1] += (r + 1) * this.ch;
        max[across] += t;
        const b = makeBox(min, max, { color: this.color, grid: !this.tex, tex: this.tex, tag: 'chunk', ref: this });
        b.cell = [r, k];
        b.hp = this.hp;
        row.push(this.world.add(b));
      }
      this.cells.push(row);
    }
  }

  hit(box, dir, dmg) {
    if (this.hp && dmg != null) return this.hitCell(box.cell[0], box.cell[1], dmg, dir);
    const [r, k] = box.cell;
    const remove = [[r, k]];
    for (const [dr, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (Math.random() < 0.3) remove.push([r + dr, k + dk]);
    let count = 0;
    for (const [rr, kk] of remove) {
      const b = this.cells[rr]?.[kk];
      if (!b) continue;
      this.cells[rr][kk] = null;
      this.world.remove(b);
      this.effects.shatter(b, dir, 2, 3);
      count++;
    }
    count += this.collapse(dir);
    return count;
  }

  // a chunk with health takes a hit; returns how many chunks came down
  hitCell(r, k, dmg, dir = [0, 0, 0]) {
    const b = this.cells[r]?.[k];
    if (!b) return 0;
    b.hp -= dmg;
    if (b.hp > 0) { if (Math.random() < 0.5) this.effects.dust(b.center, 1); return 0; }
    this.cells[r][k] = null;
    this.world.remove(b);
    this.effects.shatter(b, dir, 2, 3);
    return 1 + this.collapse(dir);
  }

  // an explosion: chunks close in are blown out, ones further away take damage
  blast(pos, r, dmg) {
    let n = 0;
    for (let rr = 0; rr < this.rows; rr++) for (let k = 0; k < this.cols; k++) {
      const b = this.cells[rr][k];
      if (!b) continue;
      const d = Math.hypot(b.center[0] - pos[0], b.center[1] - pos[1], b.center[2] - pos[2]);
      if (d > r) continue;
      const dir = [(b.center[0] - pos[0]) / (d || 1), 0.4, (b.center[2] - pos[2]) / (d || 1)];
      b.hp -= d < r * 0.55 ? Infinity : dmg * (1 - d / r);
      if (b.hp > 0) continue;
      this.cells[rr][k] = null;
      this.world.remove(b);
      this.effects.shatter(b, dir, 2, 5);
      n++;
    }
    if (n) n += this.collapse([0, 0, 0]);
    return n;
  }

  // Flood-fill from the bottom row; drop everything not reached.
  collapse(dir) {
    const seen = new Set(), q = [];
    for (let k = 0; k < this.cols; k++) if (this.cells[0][k]) { q.push([0, k]); seen.add(`0,${k}`); }
    while (q.length) {
      const [r, k] = q.pop();
      for (const [dr, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nr = r + dr, nk = k + dk, key = `${nr},${nk}`;
        if (seen.has(key) || !this.cells[nr]?.[nk]) continue;
        seen.add(key);
        q.push([nr, nk]);
      }
    }
    let dropped = 0;
    for (let r = 0; r < this.rows; r++) for (let k = 0; k < this.cols; k++) {
      const b = this.cells[r][k];
      if (b && !seen.has(`${r},${k}`)) {
        this.cells[r][k] = null;
        this.world.remove(b);
        this.effects.spawnPiece(b.center, b.scale.map((v) => v * 0.95),
          [dir[0] * 1.5 + (Math.random() - 0.5), Math.random() * 1.5, dir[2] * 1.5 + (Math.random() - 0.5)],
          this.color, 3 + Math.random());
        dropped++;
      }
    }
    return dropped;
  }

  reset() { this.build(); }
}

// ---------------------------------------------------------------- weapon cases

const CASE_DARK = [0.22, 0.23, 0.26];
const GLASS = [0.75, 0.85, 0.95];

// A glass display case with a slowly spinning gun. Walk up and press E.
export class WeaponCase {
  constructor(world, def, center, slot) {
    this.def = def;
    this.center = center;          // centre of the case floor
    this.slot = slot;
    const [x, y, z] = center;
    const add = (min, max, o) => world.add(makeBox(min, max, o));
    add([x - 0.75, y, z - 0.45], [x + 0.75, y + 1.0, z + 0.45], { color: CASE_DARK, grid: false });
    add([x - 0.76, y + 0.78, z - 0.46], [x + 0.76, y + 0.84, z - 0.4], { color: [0.95, 0.15, 0.1], grid: false, emissive: 0.85, solid: false, noShadow: true });
    this.glass = add([x - 0.7, y + 1.0, z - 0.4], [x + 0.7, y + 2.1, z + 0.4], { color: GLASS, grid: false, alpha: 0.16, noBullet: true, noShadow: true });
    add([x - 0.75, y + 2.1, z - 0.45], [x + 0.75, y + 2.22, z + 0.45], { color: CASE_DARK, grid: false });
    add([x - 0.6, y + 2.08, z - 0.3], [x + 0.6, y + 2.1, z + 0.3], { color: [1, 1, 0.97], grid: false, emissive: 1, solid: false, noShadow: true });
    // wall panel behind the case
    add([x - 1.1, y, z + 0.5], [x + 1.1, y + 3.6, z + 0.75], { color: [0.97, 0.97, 0.98], grid: false });
    add([x - 1.1, y + 3.6, z + 0.45], [x + 1.1, y + 3.75, z + 0.75], { color: CASE_DARK, grid: false });
    digitBoxes(String(slot), x + 0.18, y + 2.55, z + 0.48, 0.7, -1, [0.95, 0.15, 0.1], 0.9).forEach((b) => world.add(b));
    this.matrix = mat4();
  }

  parts(time) {
    const [x, y, z] = this.center;
    const s = 1.5;
    compose(this.matrix, [x, y + 1.5 + Math.sin(time * 1.5 + this.slot) * 0.03, z], [0, time * 0.6 + this.slot, 0], [s, s, s]);
    return Weapon.worldParts(this.def, this.matrix).map((p) => ({ ...p, scale: p.scale.map((v) => v * s) }));
  }
}

// ---------------------------------------------------------------- 7-seg digits
const SEGS = {
  0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd',
  6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g',
};
// Builds boxes spelling `text` on a wall. dir = +1 reads from +Z side, -1 from -Z side
// (text runs along -X when read from -Z). (x, y, z) = bottom-left from the reader's view.
export function digitBoxes(text, x, y, z, h, dir, color, emissive = 0) {
  const w = h * 0.55, t = h * 0.13, gap = h * 0.25, depth = 0.04;
  const segs = {
    a: [w / 2, h - t / 2, w, t], b: [w - t / 2, h * 0.75, t, h / 2], c: [w - t / 2, h * 0.25, t, h / 2],
    d: [w / 2, t / 2, w, t], e: [t / 2, h * 0.25, t, h / 2], f: [t / 2, h * 0.75, t, h / 2], g: [w / 2, h / 2, w, t],
  };
  const out = [];
  [...text].forEach((ch, i) => {
    const u0 = i * (w + gap);
    for (const s of SEGS[ch] || '') {
      const [u, v, sw, sh] = segs[s];
      const cx = x + dir * (u0 + u);
      out.push(makeBox([cx - sw / 2, y + v - sh / 2, z - depth / 2], [cx + sw / 2, y + v + sh / 2, z + depth / 2],
        { color, grid: false, edges: false, emissive, solid: false, noShadow: true }));
    }
  });
  return out;
}

// ---------------------------------------------------------------- workbench
// A gunsmith bench against the wall. Walk up and press E to change attachments.
export class Workbench {
  constructor(world, center) {
    this.center = center;   // front-centre of the bench at floor level
    const [x, y, z] = center;
    const add = (min, max, o) => world.add(makeBox(min, max, { grid: false, ...o }));
    const STEEL = [0.32, 0.33, 0.36], TOP = [0.45, 0.36, 0.26], PEG = [0.78, 0.74, 0.66];
    // legs, frame, wooden top, lower shelf
    for (const dx of [-1.4, 1.4]) for (const dz of [0.1, 0.85]) add([x + dx - 0.05, y, z + dz - 0.05], [x + dx + 0.05, y + 0.9, z + dz + 0.05], { color: STEEL });
    add([x - 1.5, y + 0.9, z], [x + 1.5, y + 0.98, z + 0.95], { color: TOP });
    add([x - 1.45, y + 0.25, z + 0.05], [x + 1.45, y + 0.3, z + 0.9], { color: STEEL });
    // pegboard + frame
    add([x - 1.6, y + 1.1, z + 1.0], [x + 1.6, y + 2.8, z + 1.05], { color: PEG });
    add([x - 1.65, y + 2.8, z + 0.95], [x + 1.65, y + 2.9, z + 1.06], { color: STEEL });
    // tools and parts on the pegboard
    const tool = (x0, y0, w, h, col) => add([x + x0, y + y0, z + 0.97], [x + x0 + w, y + y0 + h, z + 1.0], { color: col, solid: false, noShadow: true });
    tool(-1.4, 1.5, 0.5, 0.08, [0.15, 0.15, 0.17]);   // barrel blanks
    tool(-1.4, 1.7, 0.4, 0.06, [0.15, 0.15, 0.17]);
    tool(-0.8, 1.4, 0.06, 0.5, [0.6, 0.15, 0.1]);     // wrench
    tool(-0.6, 1.4, 0.06, 0.4, [0.2, 0.22, 0.25]);
    tool(-0.3, 2.0, 0.35, 0.12, [0.12, 0.12, 0.13]);  // scope
    tool(0.2, 1.3, 0.08, 0.25, [0.12, 0.12, 0.13]);   // mags
    tool(0.35, 1.3, 0.08, 0.25, [0.12, 0.12, 0.13]);
    tool(0.5, 1.3, 0.08, 0.25, [0.12, 0.12, 0.13]);
    tool(0.8, 1.6, 0.5, 0.06, [0.3, 0.3, 0.32]);      // suppressor
    tool(0.8, 2.2, 0.25, 0.25, [0.95, 0.15, 0.1]);    // red sign
    // stuff on the bench top
    add([x - 1.1, y + 0.98, z + 0.4], [x - 0.6, y + 1.08, z + 0.7], { color: [0.12, 0.12, 0.13] });   // ammo can
    add([x + 0.5, y + 0.98, z + 0.3], [x + 1.2, y + 1.0, z + 0.65], { color: [0.2, 0.42, 0.3] });    // mat
    add([x + 0.7, y + 1.0, z + 0.42], [x + 1.0, y + 1.04, z + 0.5], { color: [0.1, 0.1, 0.11] });   // part on the mat
    // hanging work light
    add([x - 0.03, y + 2.9, z + 0.4], [x + 0.03, y + 3.4, z + 0.46], { color: STEEL, solid: false });
    add([x - 0.5, y + 2.8, z + 0.25], [x + 0.5, y + 2.9, z + 0.6], { color: STEEL, solid: false });
    add([x - 0.45, y + 2.78, z + 0.3], [x + 0.45, y + 2.8, z + 0.55], { color: [1, 0.97, 0.88], emissive: 1, solid: false, noShadow: true });
    // floor mat marking the spot
    add([x - 1.6, y, z - 1.3], [x + 1.6, y + 0.015, z], { color: [0.3, 0.31, 0.34], solid: false, edges: false });
    add([x - 1.6, y, z - 1.32], [x + 1.6, y + 0.02, z - 1.25], { color: [0.95, 0.15, 0.1], emissive: 0.7, solid: false, edges: false });
  }
}

// ---------------------------------------------------------------- block lettering
// Signs: capital letters built from little boxes on a 5x7 grid (runs in a row are merged into one box).
const FONT = {
  A: '01110100011000111111100011000110001', B: '11110100011000111110100011000111110', C: '01110100011000010000100001000101110',
  D: '11110100011000110001100011000111110', E: '11111100001000011110100001000011111', F: '11111100001000011110100001000010000',
  G: '01110100011000010111100011000101111', H: '10001100011000111111100011000110001', I: '01110001000010000100001000010001110',
  K: '10001100101010011000101001001010001', L: '10000100001000010000100001000011111', M: '10001110111010110001100011000110001',
  N: '10001110011010110011100011000110001', O: '01110100011000110001100011000101110', P: '11110100011000111110100001000010000',
  R: '11110100011000111110101001001010001', S: '01111100001000001110000010000111110', T: '11111001000010000100001000010000100',
  U: '10001100011000110001100011000101110', V: '10001100011000110001100010101000100', W: '10001100011000110101101011010101010',
  Y: '10001100010101000100001000010000100', '+': '00000001000010011111001000010000000', '-': '00000000000000011111000000000000000', ' ': '00000000000000000000000000000000000',
  '0': '01110100011001110101110011000101110', '1': '00100011000010000100001000010001110', '2': '01110100010000100010001000100011111',
  '3': '11110000010000101110000010000111110', '4': '00010001100101010010111110001000010', '5': '11111100001111000001000011000101110',
  '6': '00110010001000011110100011000101110', '7': '11111000010001000100010000100001000', '8': '01110100011000101110100011000101110', '9': '01110100011000101111000010001001100',
};
// text centred at (x, y) on a wall facing `face` (one of 'n', 's', 'e', 'w': the direction the sign looks), letter
// height h. Returns boxes to add to the world.
export function blockText(text, x, y, z, h, face, color, emissive = 0.6) {
  const px = h / 7, adv = px * 6, w = text.length * adv - px, out = [];
  // along: the reading direction for someone looking at the sign
  const along = { n: [-1, 0], s: [1, 0], e: [0, -1], w: [0, 1] }[face], out0 = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[face];
  [...text.toUpperCase()].forEach((ch, ci) => {
    const g = FONT[ch] || FONT[' '];
    for (let r = 0; r < 7; r++) {
      let c = 0;
      while (c < 5) {
        if (g[r * 5 + c] !== '1') { c++; continue; }
        let e = c; while (e < 5 && g[r * 5 + e] === '1') e++;
        const a0 = -w / 2 + ci * adv + c * px, a1 = -w / 2 + ci * adv + e * px, y1 = y + h / 2 - r * px, y0 = y1 - px;
        const p0 = [x + along[0] * a0, z + along[1] * a0], p1 = [x + along[0] * a1, z + along[1] * a1];
        const d0 = 0, d1 = 0.012;
        const xs = [p0[0], p1[0], p0[0] + out0[0] * d1, p1[0] + out0[0] * d1], zs = [p0[1], p1[1], p0[1] + out0[1] * d1, p1[1] + out0[1] * d1];
        out.push(makeBox([Math.min(...xs), y0, Math.min(...zs)], [Math.max(...xs), y1, Math.max(...zs)], { color, emissive, grid: false, solid: false, noShadow: true, edges: false }));
        c = e;
      }
    }
  });
  return out;
}

// ---------------------------------------------------------------- armoury gun walls
// Every gun hangs on its own panel on the armoury walls. A panel with a variant has the variant mounted on its back:
// press E on a gun you're already holding and the panel spins round on its axle to show (and hand you) the
// variant; press E again and it spins back. Look at the ammo station and press E to fill up both guns.
// racks: [{ o: centre of the row, n: the way the wall faces, ids: [base gun ids], w: panel width, gap: spacing,
//   col: the rack's colour }]; defFor(id) builds a gun; variantOf(id) gives the variant's id (or null).
const PANEL = [0.11, 0.115, 0.13], PANEL_E = [0.2, 0.21, 0.24];
export function gunWalls(racks, defFor, variantOf) {
  const items = [];
  const box = (B, p, c, s, color, o = {}) => {
    const m = mat4(), [x, y, z] = B;
    const w = [p[0] + x[0] * c[0] + y[0] * c[1] + z[0] * c[2], p[1] + x[1] * c[0] + y[1] * c[1] + z[1] * c[2], p[2] + x[2] * c[0] + y[2] * c[1] + z[2] * c[2]];
    m.set([x[0] * s[0], x[1] * s[0], x[2] * s[0], 0, y[0] * s[1], y[1] * s[1], y[2] * s[1], 0, z[0] * s[2], z[1] * s[2], z[2] * s[2], 0, w[0], w[1], w[2], 1]);
    return { model: m, scale: s, color, emissive: o.em || 0, shape: o.shape, mat: o.mat || 'metal', edges: 0 };
  };
  const rot = (v, a, t) => {            // v rotated about unit axis a by t (Rodrigues)
    const c = Math.cos(t), s = Math.sin(t), d = v[0] * a[0] + v[1] * a[1] + v[2] * a[2];
    const cr = [a[1] * v[2] - a[2] * v[1], a[2] * v[0] - a[0] * v[2], a[0] * v[1] - a[1] * v[0]];
    return [0, 1, 2].map((k) => v[k] * c + cr[k] * s + a[k] * d * (1 - c));
  };
  for (const r of racks) {
    const n = [r.n[0], 0, r.n[1]], up = [0, 1, 0];
    const a = [n[1] * up[2] - n[2] * up[1], n[2] * up[0] - n[0] * up[2], n[0] * up[1] - n[1] * up[0]];      // along the wall
    r.ids.forEach((id, i) => {
      const off = (i - (r.ids.length - 1) / 2) * r.gap;
      const c = [r.o[0] + a[0] * off + n[0] * 0.13, r.o[1], r.o[2] + a[2] * off + n[2] * 0.13];
      const vid = variantOf(id);
      const it = {
        id, vid, side: 0, flipT: 1, col: r.col, rack: r.name, w: r.w,
        defs: [defFor(id), vid ? defFor(vid) : null],
        get def() { return this.defs[this.side]; },
        get other() { return this.vid ? this.defs[1 - this.side] : null; },
        aim: c, center: [c[0], 0, c[2]], normal: n,
        refresh(df) { this.defs = [df(this.id), this.vid ? df(this.vid) : null]; },
        flip() { if (!this.vid || this.flipT < 1) return false; this.side = 1 - this.side; this.flipT = 0; return true; },
        update(dt) { if (this.flipT < 1) this.flipT = Math.min(1, this.flipT + dt / 0.75); },
        parts(time, hot) {
          // the angle: eased, with a little overshoot and settle as the panel locks in
          const k = this.flipT, e = k < 1 ? 1 - Math.pow(1 - k, 3) + Math.sin(k * Math.PI) * 0.12 : 1;
          const ang = this.vid ? (this.side ? Math.PI * e : Math.PI * (1 - e)) : 0;          // side 0 -> 0, side 1 -> pi
          const X = rot(n, a, ang), Y = rot(up, a, ang), B = [X, Y, a];
          const out = [];
          const glow = hot ? 0.55 + 0.25 * Math.sin(time * 6) : 0;
          // the panel: a dark plate, a frame, the rack's colour along the bottom edge (on both faces), an axle
          out.push(box(B, c, [0, 0, 0], [0.04, 0.46, this.w], PANEL, { mat: 'paint' }));
          for (const sy of [-1, 1]) out.push(box(B, c, [0, sy * 0.238, 0], [0.05, 0.016, this.w + 0.02], PANEL_E, { mat: 'metal' }));
          for (const sz of [-1, 1]) out.push(box(B, c, [0, 0, sz * (this.w / 2 + 0.002)], [0.05, 0.476, 0.016], PANEL_E, { mat: 'metal' }));
          for (const sx of [-1, 1]) out.push(box(B, c, [sx * 0.021, -0.205, 0], [0.004, 0.022, this.w - 0.06], hot ? [1, 1, 1].map((v, q) => r.col[q] + (v - r.col[q]) * glow * 0.6) : r.col, { em: 0.5 + glow }));
          out.push(box([n, up, a], c, [-0.07, 0, 0], [0.05, 0.05, this.w + 0.12], PANEL_E, { shape: 'cyl', mat: 'steel' }));
          // a little light in the corner if there's a variant on the back (blinks while it spins)
          if (this.vid) for (const sx of [-1, 1]) out.push(box(B, c, [sx * 0.022, 0.19, this.w / 2 - 0.05], [0.004, 0.02, 0.02], [1, 0.75, 0.15], { em: k < 1 ? (Math.sin(time * 30) > 0 ? 1 : 0.2) : 0.9 }));
          // the guns: the front one on the front face, the variant upside-down on the back
          const mount = (def, sx) => {
            if (!def) return;
            const ps = def.parts.filter((p) => !p.hidden);
            const z0 = Math.min(...ps.map((p) => p.c[2] - p.s[2] / 2)), z1 = Math.max(...ps.map((p) => p.c[2] + p.s[2] / 2));
            const y0 = Math.min(...ps.map((p) => p.c[1] - p.s[1] / 2)), y1 = Math.max(...ps.map((p) => p.c[1] + p.s[1] / 2));
            const sc = Math.min(1, (this.w - 0.08) / (z1 - z0), 0.36 / (y1 - y0));
            const gx = sx > 0 ? X : X.map((v) => -v), gy = sx > 0 ? Y : Y.map((v) => -v);
            const gz = [gx[1] * gy[2] - gx[2] * gy[1], gx[2] * gy[0] - gx[0] * gy[2], gx[0] * gy[1] - gx[1] * gy[0]];
            const lc = [0, (y0 + y1) / 2, (z0 + z1) / 2], d = 0.075;
            const pos = [0, 1, 2].map((q) => c[q] + X[q] * d * sx - (gx[q] * lc[0] + gy[q] * lc[1] + gz[q] * lc[2]) * sc);
            const m = mat4();
            m.set([gx[0] * sc, gx[1] * sc, gx[2] * sc, 0, gy[0] * sc, gy[1] * sc, gy[2] * sc, 0, gz[0] * sc, gz[1] * sc, gz[2] * sc, 0, pos[0], pos[1], pos[2], 1]);
            const gp = Weapon.worldParts(def, m).map((p) => ({ ...p, scale: p.scale.map((v) => v * sc) }));
            for (const p of gp) out.push(hot && sx > 0 === (ang < Math.PI / 2) ? { ...p, emissive: Math.max(p.emissive, 0.1) } : p);
            // two pegs it hangs on
            for (const t of [0.3, 0.7]) out.push(box(sx > 0 ? B : [X.map((v) => -v), Y.map((v) => -v), a], c, [0.035, y0 * sc - (y0 + y1) / 2 * sc - 0.01, ((z0 + (z1 - z0) * t) - (z0 + z1) / 2) * sc * (sx > 0 ? 1 : 1)], [0.04, 0.012, 0.012], PANEL_E, { mat: 'steel' }));
          };
          mount(this.defs[0], 1);
          mount(this.defs[1], -1);
          return out;
        },
      };
      items.push(it);
    });
  }
  return items;
}
