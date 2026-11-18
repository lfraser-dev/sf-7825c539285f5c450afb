// ZOMBIES (build 0.69): a map of its own, THE BUNKER, deep underground, and a round-based survival mode.
//
// You start in the bunker's entrance room with a pistol and a knife. Zombies come from the dark yard outside, tear the
// boards off the windows and climb through. Hits and kills earn points. Spend them on:
//   - doors to the other three rooms (each opens up more windows, guns and machines),
//   - guns drawn in chalk on the walls (buy again for ammo),
//   - the MYSTERY BOX (a random gun, sometimes something special),
//   - four drink machines (perks: once the power is on),
//   - the AMPLIFIER (upgrades the gun in your hands: once the power is on).
// Hold E at a window to nail the boards back up (10 points a board). Zombies sometimes drop power-ups: MAX AMMO,
// INSTA-KILL, DOUBLE POINTS, NUKE and CARPENTER. Each round brings more of them, tougher and faster. Go down and it's
// over (unless you drank REVIVE RUSH).
import { makeBox, boxAt } from './world.js';
import { Bot } from './bots.js';
import { Deathmatch } from './tdm.js';
import { compose, mat4, clamp } from './math.js';
import { blockText } from './props.js';

// ---------------------------------------------------------------- the map
const O = [4200, -60, -700];          // deep underground: lamp light, no sun (see UNDER_Y in the renderer)
const H = 4;                           // ceiling height
const L = (x, y, z) => [O[0] + x, O[1] + y, O[2] + z];
const CONC = [0.42, 0.42, 0.43], PLASTER = [0.55, 0.53, 0.5], DARK = [0.26, 0.25, 0.24], RUST = [0.4, 0.22, 0.14], WOOD = [0.42, 0.3, 0.18];
const ROOMS = {
  spawn: { name: 'ENTRANCE', min: [-10, -10], max: [10, 10] },
  labs: { name: 'LABS', min: [10, -10], max: [32, 10] },
  hall: { name: 'BARRACKS', min: [-10, 10], max: [10, 34] },
  power: { name: 'GENERATOR ROOM', min: [10, 10], max: [32, 34] },
};
// doors: between two rooms, centred at (x, z) in a wall running along `axis` (0 = the wall runs along x)
const DOORS = [
  { a: 'spawn', b: 'labs', x: 10, z: 0, axis: 2, cost: 750 },
  { a: 'spawn', b: 'hall', x: 0, z: 10, axis: 0, cost: 1000 },
  { a: 'labs', b: 'power', x: 21, z: 10, axis: 0, cost: 1000 },
  { a: 'hall', b: 'power', x: 10, z: 22, axis: 2, cost: 1250 },
];
// windows: in an outer wall, (x, z) and the way out (nx, nz)
const WINDOWS = [
  ['spawn', -10, -5, -1, 0], ['spawn', -10, 5, -1, 0], ['spawn', 4, -10, 0, -1],
  ['labs', 16, -10, 0, -1], ['labs', 27, -10, 0, -1], ['labs', 32, 0, 1, 0],
  ['hall', -10, 18, -1, 0], ['hall', -10, 28, -1, 0], ['hall', 0, 34, 0, 1],
  ['power', 18, 34, 0, 1], ['power', 28, 34, 0, 1], ['power', 32, 22, 1, 0],
];
// guns in chalk on the walls: [room, x, z, facing (nx, nz), gun, cost]
const WALLBUYS = [
  ['spawn', -5, -10, 0, 1, 'dmr', 500], ['spawn', 10, -6, -1, 0, 'double', 500],
  ['labs', 15, 10, 0, -1, 'smg', 1000], ['labs', 32, 6, -1, 0, 'shotgun', 1500],
  ['hall', -10, 23, 1, 0, 'ar', 1200], ['hall', 10, 29, -1, 0, 'kv', 1200],
  ['power', 28, 10, 0, 1, 'lmg', 2000], ['power', 32, 29, -1, 0, 'burst', 1200],
];
// drink machines (perks): [id, room, x, z, facing]
export const PERKS = {
  revive: { name: 'REVIVE RUSH', cost: 500, col: [0.3, 0.75, 1], desc: 'Get back up once when you go down', power: false },
  tank: { name: 'TANK TONIC', cost: 2500, col: [1, 0.2, 0.15], desc: 'Two and a half times the health' },
  speed: { name: 'SPEED SPLASH', cost: 3000, col: [0.35, 1, 0.4], desc: 'Reload twice as fast' },
  brew: { name: 'DOUBLE BREW', cost: 2000, col: [1, 0.75, 0.15], desc: 'Fire a third faster' },
};
const MACHINES = [['revive', 'spawn', 7, 9.2, 0, -1], ['speed', 'labs', 21, -9.2, 0, 1], ['tank', 'hall', -6, 33.2, 0, -1], ['brew', 'power', 14, 33.2, 0, -1]];
const BOX = { room: 'labs', x: 27, z: 9.3, yaw: 0, cost: 950 };
const AMP = { room: 'power', x: 21, z: 22, cost: 5000 };
const POWER = { room: 'power', x: 31.75, z: 15, nx: -1, nz: 0 };
export const BOX_POOL = ['rg1', 'ak_p19', 'ak_zu9', 'ak_hc50', 'minigun', 'amr', 'sniper_x', 'shotgun_d', 'lmg', 'rk74', 'autoshotgun', 'dmr_i', 'kv_d', 'bruiser', 'hc50', 'revolver_h',
  'burst_a', 'pistol_a', 'cr56', 'rt7', 'zu9', 'pdx', 'hx17', 'slug', 'sniper'];

function buildBunker(world, A) {
  const add = (b) => { world.add(b); return b; };
  const box = (min, max, o = {}) => add(makeBox(L(...min), L(...max), { grid: false, ...o }));
  const at = (x, y, z, sx, sy, sz, o = {}) => add(boxAt(O[0] + x, O[1] + y, O[2] + z, sx, sy, sz, { grid: false, ...o }));
  const deco = (min, max, o = {}) => box(min, max, { solid: false, noShadow: true, edges: false, ...o });
  const t = 0.4;
  // the yard: a dark concrete pit round the building, walled and roofed
  const Y = { x0: -20, x1: 42, z0: -20, z1: 44 };
  box([Y.x0, -1, Y.z0], [Y.x1, 0, Y.z1], { color: [0.3, 0.29, 0.27], tex: 3 });
  box([Y.x0 - 1, 0, Y.z0 - 1], [Y.x1 + 1, H + 3, Y.z0], { color: DARK, tex: 3 });
  box([Y.x0 - 1, 0, Y.z1], [Y.x1 + 1, H + 3, Y.z1 + 1], { color: DARK, tex: 3 });
  box([Y.x0 - 1, 0, Y.z0], [Y.x0, H + 3, Y.z1], { color: DARK, tex: 3 });
  box([Y.x1, 0, Y.z0], [Y.x1 + 1, H + 3, Y.z1], { color: DARK, tex: 3 });
  box([Y.x0 - 1, H + 3, Y.z0 - 1], [Y.x1 + 1, H + 3.5, Y.z1 + 1], { color: [0.08, 0.08, 0.09], noShadow: true });
  // inside: a cleaner concrete floor, plaster walls with a dark lower band, a low ceiling with pipes and lamps
  box([-10, -0.02, -10], [32, 0.01, 34], { color: CONC, tex: 11, solid: false, noShadow: true });
  box([-10 - t, H, -10 - t], [32 + t, H + 0.4, 34 + t], { color: [0.2, 0.2, 0.21], noShadow: true });
  // outer walls, with window openings (sill 0.9, top 2.3)
  const W0 = 1.7, SILL = 0.9, TOP = 2.3;
  const wallRun = (fixed, a0, a1, axis, holes, o) => {
    // a wall along `axis` (0: along x at z = fixed; 2: along z at x = fixed) from a0 to a1, with holes [[centre, width, y0, y1]]
    const seg = (s0, s1, y0, y1) => {
      if (s1 - s0 < 0.01) return;
      if (axis === 0) box([s0, y0, fixed - t / 2], [s1, y1, fixed + t / 2], o);
      else box([fixed - t / 2, y0, s0], [fixed + t / 2, y1, s1], o);
    };
    const hs = [...holes].sort((p, q) => p[0] - q[0]);
    let cur = a0;
    for (const [c, w, y0, y1] of hs) {
      seg(cur, c - w / 2, 0, H);
      if (y0 > 0) seg(c - w / 2, c + w / 2, 0, y0);
      seg(c - w / 2, c + w / 2, y1, H);
      cur = c + w / 2;
    }
    seg(cur, a1, 0, H);
  };
  const wallO = { color: PLASTER, tex: 10 };
  const winHoles = (pred) => WINDOWS.filter(pred).map((w) => [w[3] !== 0 ? w[2] : w[1], W0, SILL, TOP]);
  wallRun(-10, -10 - t / 2, 32 + t / 2, 0, winHoles((w) => w[4] === -1), wallO);            // south (z = -10)
  wallRun(34, -10 - t / 2, 32 + t / 2, 0, winHoles((w) => w[4] === 1), wallO);              // north (z = 34)
  wallRun(-10, -10, 34, 2, winHoles((w) => w[3] === -1), wallO);                            // west (x = -10)
  wallRun(32, -10, 34, 2, winHoles((w) => w[3] === 1), wallO);                              // east (x = 32)
  // inner walls, each with a doorway (2.4 wide, 3 tall)
  const DW = 2.4, DH = 3;
  wallRun(10, -10, 10, 2, [[0, DW, 0, DH]], wallO);           // spawn | labs (x = 10, z -10..10)
  wallRun(10, -10, 10, 0, [[0, DW, 0, DH]], wallO);           // spawn | hall (z = 10, x -10..10)
  wallRun(10, 10, 32, 0, [[21, DW, 0, DH]], wallO);           // labs | power (z = 10, x 10..32)
  wallRun(10, 10, 34, 2, [[22, DW, 0, DH]], wallO);           // hall | power (x = 10, z 10..34)
  // a dark band round the bottom of every inside wall, and pipes along the ceiling
  for (const [rid, R] of Object.entries(ROOMS)) {
    const [x0, z0] = R.min, [x1, z1] = R.max, e = t / 2 + 0.005;
    deco([x0 + e, 0, z0 + e], [x1 - e, 1.0, z0 + e + 0.01], { color: [0.24, 0.26, 0.24] });
    deco([x0 + e, 0, z1 - e - 0.01], [x1 - e, 1.0, z1 - e], { color: [0.24, 0.26, 0.24] });
    deco([x0 + e, 0, z0 + e], [x0 + e + 0.01, 1.0, z1 - e], { color: [0.24, 0.26, 0.24] });
    deco([x1 - e - 0.01, 0, z0 + e], [x1 - e, 1.0, z1 - e], { color: [0.24, 0.26, 0.24] });
    // the room's name stencilled on a wall
    const nm = R.name, cx = (x0 + x1) / 2;
    blockText(nm, O[0] + cx + (rid === 'labs' || rid === 'power' ? -4 : 4), O[1] + 3.3, O[2] + z0 + e + 0.012, 0.32, 's', [0.75, 0.7, 0.55], 0.15).forEach(add);
    // pipes and lamps
    for (const k of [0.3, 0.7]) at(x0 + (x1 - x0) * k, H - 0.25, (z0 + z1) / 2, 0.14, 0.14, z1 - z0 - 0.6, { color: RUST, mat: 'metal', solid: false, shape: 'cyl', noShadow: true });
    // (the lamps sit where the renderer puts its pools of underground light: world x, z = 8k + 4)
    const fx = (v, o) => Math.ceil((v - o) / 8) * 8 + o;
    for (let x = fx(x0 + 1, 4 - (O[0] % 8)); x < x1 - 1; x += 8) for (let z = fx(z0 + 1, ((4 - (O[2] % 8)) % 8 + 8) % 8); z < z1 - 1; z += 8) {
      at(x, H - 0.12, z, 0.9, 0.08, 0.2, { color: DARK, solid: false, noShadow: true });
      at(x, H - 0.15, z, 0.8, 0.03, 0.12, { color: [1, 0.85, 0.55], emissive: 1, solid: false, noShadow: true });
    }
  }
  // clutter along the walls (never in the middle, so zombies can walk straight across)
  const crate = (x, z, s = 0.9, h = 0.9) => at(x, 0, z, s, h, s, { color: WOOD, tex: 12 });
  crate(-8.8, -8.8); crate(-8.8, -7.7, 0.8, 0.8); crate(-7.8, -8.8, 0.8, 1.6);
  crate(30.8, -8.8); crate(30.8, 8.8, 1, 1.2);
  crate(-8.8, 32.8); crate(-7.7, 32.8, 0.8, 0.8);
  // labs: benches along the north and east walls
  for (const x of [13.5, 17.5]) { at(x, 0, 8.9, 3, 0.95, 1.2, { color: [0.3, 0.32, 0.34], mat: 'metal' }); at(x, 0.95, 8.9, 2.8, 0.04, 1.1, { color: [0.75, 0.78, 0.8], solid: false }); }
  // barracks: bunks along the west wall
  for (const z of [13, 16]) { at(-8.9, 0, z, 1.0, 0.5, 2.1, { color: [0.25, 0.3, 0.22] }); at(-8.9, 1.4, z, 1.0, 0.12, 2.1, { color: [0.25, 0.3, 0.22] }); }
  // generator room: the generator against the east wall
  at(30.6, 0, 26, 2, 2.2, 3.4, { color: [0.32, 0.36, 0.28], mat: 'metal' });
  at(30.6, 2.2, 26, 0.5, 1.6, 0.5, { color: RUST, shape: 'cyl', mat: 'metal' });
  // window colliders: you can't climb out, bullets go through, zombies climb in
  A.winBoxes = WINDOWS.map(([, x, z, nx]) => box(nx !== 0 ? [x - t / 2 - 0.05, SILL, z - W0 / 2] : [x - W0 / 2, SILL, z - t / 2 - 0.05], nx !== 0 ? [x + t / 2 + 0.05, TOP + 0.1, z + W0 / 2] : [x + W0 / 2, TOP + 0.1, z + t / 2 + 0.05], { hidden: true, noBullet: true }));
  // static colliders for the machines, the box and the amplifier (drawn as moving parts)
  for (const [, , x, z, nx, nz] of MACHINES) at(x - nx * 0, 0, z - nz * 0.15, 1.1, 2.3, 0.8, { hidden: true });
  at(BOX.x, 0, BOX.z, 1.6, 0.9, 0.75, { hidden: true });
  at(AMP.x, 0, AMP.z, 1.8, 1.5, 1.4, { hidden: true });
}

// the door blocks: built when a game starts, removed when bought
function doorBox(d) {
  const w = 2.4, h = 3, t = 0.3;
  const min = d.axis === 0 ? [d.x - w / 2, 0, d.z - t / 2] : [d.x - t / 2, 0, d.z - w / 2];
  const max = d.axis === 0 ? [d.x + w / 2, h, d.z + t / 2] : [d.x + t / 2, h, d.z + w / 2];
  return makeBox(L(...min), L(...max), { color: [0.36, 0.3, 0.24], tex: 12, grid: false });
}

export const ZMAP = {
  name: 'THE BUNKER', hidden: true, zombies: true,
  W: 30, D: 32, fog: 0.012, shadowHalf: 30, voidY: O[1] - 30, voidText: ['OUT', 'FELL OUT'], fallLethal: 0, fallHurt: 0, hook: false,
  pads: [], lifts: [], dummies: [], walls: [], cargo: [], glassBoxes: [], refs: {}, dwalls: [], spawnGlass: () => [],
  build(world) {
    buildBunker(world, this);
    this.origin = [O[0] + 11, O[1], O[2] + 12];
    this.spawns = [{ pos: L(0, 0, -2), yaw: Math.PI }, { pos: L(0, 0, -2), yaw: Math.PI }];
    this.spawn = this.spawns[0];
    this.area = { min: [O[0] - 40, O[1] - 40, O[2] - 40], max: [O[0] + 60, O[1] + 40, O[2] + 70] };
    this.nav = { levels: [{ y: O[1], rects: Object.values(ROOMS).map((R) => [O[0] + R.min[0] + 0.6, O[2] + R.min[1] + 0.6, O[0] + R.max[0] - 0.6, O[2] + R.max[1] - 0.6]) }], chains: [], exclude: [] };
    this.room = [O[0] - 10, O[2] - 10, O[0] + 32, O[2] + 34, O[1] + H];
  },
};

// ---------------------------------------------------------------- the zombies
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const roomAt = (p) => { const x = p[0] - O[0], z = p[2] - O[2]; for (const [id, R] of Object.entries(ROOMS)) if (x >= R.min[0] && x <= R.max[0] && z >= R.min[1] && z <= R.max[1]) return id; return null; };

class Zombie {
  constructor(co, team, n, round, win) {
    Object.assign(this, { co, team, name: `Z${n}`, zombie: true, isPlayer: false, win });
    const b = new Bot(co.world, 'rusher', win.spawn, Math.atan2(win.n[0], win.n[1]), 0);
    b.state = 'wait'; b.landed = true; b.dropT = 1;
    b.name = 'ZOMBIE'; b.team = team.idx; b.agent = this; b.zombie = true;
    const hp = round < 10 ? 100 + 55 * (round - 1) : 595 * Math.pow(1.1, round - 9);
    // walkers early on; from round 4 some run, and from round 8 most sprint
    const run = Math.random() < clamp((round - 3) * 0.16, 0, 0.85);
    b.t = { ...b.t, hp, speed: run ? 4.4 + Math.random() * 1.2 : 1.7 + Math.random() * 0.7 };
    b.hp = b.maxHp = hp;
    this.runner = run;
    this.bot = b;
    this.state = 'approach';     // approach → tear → climb → inside
    this.room = null;
    this.atkCd = 0.5; this.tearCd = 1; this.groanT = Math.random() * 4; this.dead = false;
    b.place();
  }
  get pos() { return this.bot.pos; }
  get alive() { return this.bot.alive; }
  get downed() { return false; }
  get hpFrac() { return this.bot.hp / this.bot.maxHp; }
  eye() { return this.bot.eye(); }

  animate(dt) {
    const b = this.bot;
    b.flash -= dt; b.recoil *= Math.exp(-10 * dt); b.flinch *= Math.exp(-7 * dt); b.breath += dt;
    const vx = (b.pos[0] - b.lastPos[0]) / Math.max(dt, 1e-4), vz = (b.pos[2] - b.lastPos[2]) / Math.max(dt, 1e-4);
    b.lastPos = [...b.pos];
    const cy = Math.cos(b.yaw), sy = Math.sin(b.yaw);
    b.localVel[0] += (cy * vx - sy * vz - b.localVel[0]) * Math.min(1, dt * 10);
    b.localVel[1] += (sy * vx + cy * vz - b.localVel[1]) * Math.min(1, dt * 10);
  }
  // walk toward (x, z) at speed; returns how far it went
  step(tx, tz, sp, dt) {
    const b = this.bot, dx = tx - b.pos[0], dz = tz - b.pos[2], l = Math.hypot(dx, dz);
    if (l < 0.02) return 0;
    const s = Math.min(l, sp * dt);
    b.pos[0] += dx / l * s; b.pos[2] += dz / l * s;
    return s;
  }
  face(tx, tz, dt, k = 8) {
    const b = this.bot;
    let dy = Math.atan2(-(tx - b.pos[0]), -(tz - b.pos[2])) - b.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    b.yaw += dy * Math.min(1, dt * k);
  }
  update(dt, g) {
    const co = this.co, b = this.bot, w = this.win;
    if (!b.human && g.humanFor) { const h = g.humanFor(this); if (h) Object.assign(b, { human: h.skin, gunDef: null, gunPartsOf: null }); }
    if (!b.alive) {
      if (!this.dead) { this.dead = true; this.goneT = 2.5; co.onZombieDeath(this); }
      if (b.dying >= 0) {
        b.dying += dt; b.flash -= dt;
        if (!b.removed) g.settleBody?.(b, dt);
        if (b.dying > 1.1 && !b.shattered) { b.shattered = true; b.remove(); b.removed = true; g.onShatter?.(b); }
      }
      this.goneT -= dt;
      return;
    }
    this.animate(dt);
    const P = co.player, sp = b.t.speed * (co.slowT > 0 ? 0.5 : 1);
    let moved = 0;
    if (this.state === 'approach') {
      moved = this.step(w.outside[0], w.outside[2], sp, dt);
      this.face(w.outside[0] - w.n[0], w.outside[2] - w.n[1], dt);
      if (dist2(b.pos, w.outside) < 0.15) this.state = 'tear';
    } else if (this.state === 'tear') {
      this.face(w.inside[0], w.inside[2], dt);
      if (w.boards > 0) {
        this.tearCd -= dt;
        if (this.tearCd <= 0) { this.tearCd = this.runner ? 0.8 : 1.3; w.boards--; b.lunge = 1; g.boardTorn?.(w); }
        // reach through at you if you're right at the window
        this.atkCd -= dt;
        if (!P.dead && dist2(P.pos, w.inside) < 1.3 && this.atkCd <= 0) { this.atkCd = 1.2; b.lunge = 1; g.hitPlayer(co.zdmg(), b, b.eye()); }
      } else { this.state = 'climb'; this.climbT = 0; }
    } else if (this.state === 'climb') {
      this.climbT += dt / 0.8;
      const k = Math.min(1, this.climbT);
      for (const i of [0, 2]) b.pos[i] = w.outside[i] + (w.inside[i] - w.outside[i]) * k;
      b.pos[1] = O[1] + Math.sin(k * Math.PI) * 0.9;
      if (k >= 1) { b.pos[1] = O[1]; this.state = 'inside'; this.room = w.room; }
    } else {
      // inside: go for you, through whichever open doors lead to your room
      const myRoom = roomAt(b.pos) || this.room;
      if (myRoom) this.room = myRoom;
      const pr = roomAt(P.pos);
      let tx = P.pos[0], tz = P.pos[2];
      if (pr && pr !== this.room) {
        const d = co.nextDoor(this.room, pr);
        if (d) {
          const c = L(d.x, 0, d.z), dd = dist2(b.pos, c);
          // walk to the doorway, then through it along the wall's normal
          const nrm = d.axis === 0 ? [0, 1] : [1, 0], sgn = Math.sign((d.axis === 0 ? c[2] - b.pos[2] : c[0] - b.pos[0])) || 1;
          if (dd > 0.6) { tx = c[0] - nrm[0] * sgn * 0.3; tz = c[2] - nrm[1] * sgn * 0.3; }
          else { tx = c[0] + nrm[0] * sgn * 1.5; tz = c[2] + nrm[1] * sgn * 1.5; }
        }
      }
      const dp = dist2(P.pos, b.pos);
      if (!(pr === this.room && dp < 1.0)) moved = this.step(tx, tz, sp, dt);
      this.face(tx, tz, dt);
      // keep out of the furniture and off each other
      co.pushOut(this);
      this.atkCd -= dt;
      if (!P.dead && dp < 1.35 && Math.abs(P.pos[1] - b.pos[1]) < 1.5 && this.atkCd <= 0) {
        this.atkCd = 1.0 + Math.random() * 0.3;
        b.lunge = 1;
        g.hitPlayer(co.zdmg(), b, b.eye());
      }
    }
    b.lunge = Math.max(0, (b.lunge || 0) - dt * 3);
    b.moving += ((moved > 0.001 ? 1 : 0) - b.moving) * Math.min(1, dt * 8);
    b.walk += moved * (this.runner ? 1.6 : 2.3);
    this.groanT -= dt;
    if (this.groanT <= 0) { this.groanT = 3 + Math.random() * 6; g.groan?.(b.pos); }
    b.place();
  }
}

// power-ups: what they're called and their colour
export const DROPS = {
  maxammo: { name: 'MAX AMMO', col: [0.4, 1, 0.4] },
  insta: { name: 'INSTA-KILL', col: [1, 0.25, 0.2] },
  double: { name: 'DOUBLE POINTS', col: [1, 0.85, 0.2] },
  nuke: { name: 'NUKE', col: [1, 0.55, 0.15] },
  carpenter: { name: 'CARPENTER', col: [0.5, 0.75, 1] },
};

export class ZombieMode extends Deathmatch {
  constructor(world) { super(world); this.mode = 'zombies'; this.noRespawn = true; this.perks = new Set(); this.doors = []; }
  takedown() {}
  score() {}
  onDeath() {}

  start(match, map, player, classOf) {
    super.start({ teams: [{ name: 'SURVIVOR', col: '#ff7a1a', mine: true, players: [{ name: 'YOU', cls: classOf, you: true }] }, { name: 'THE DEAD', col: '#6a9a3c', mine: false, players: [] }] }, map, player, classOf);
    this.events.length = 0;
    this.horde = this.teams[1];
    this.round = 0; this.points = 500; this.queue = 0; this.spawnCd = 0; this.breakT = 4; this.kills = 0; this.heads = 0; this.zid = 0;
    this.power = false; this.perks.clear(); this.reviveUsed = false;
    this.insta = 0; this.double = 0; this.drops = []; this.dropsThisRound = 0; this.slowT = 0; this.boardPts = 0;
    this.doors = DOORS.map((d) => ({ ...d, pos: L(d.x, 1.5, d.z), open: false, box: this.world.add(doorBox(d)) }));
    this.open = new Set(['spawn']);
    this.windows = WINDOWS.map(([room, x, z, nx, nz]) => ({
      room, x, z, n: [nx, nz], boards: 5,
      inside: L(x - nx * 0.9, 0, z - nz * 0.9), outside: L(x + nx * 0.9, 0, z + nz * 0.9), spawn: L(x + nx * 7, 0, z + nz * 7),
    }));
    this.wallbuys = WALLBUYS.map(([room, x, z, nx, nz, id, cost]) => ({ room, x, z, n: [nx, nz], id, cost, pos: L(x + nx * 0.35, 1.5, z + nz * 0.35) }));
    this.machines = MACHINES.map(([id, room, x, z, nx, nz]) => ({ id, room, x, z, n: [nx, nz], pos: L(x, 0, z), ...PERKS[id] }));
    this.box = { ...BOX, pos: L(BOX.x, 0, BOX.z), state: 'closed', t: 0, gun: null, shown: null };
    this.amp = { ...AMP, pos: L(AMP.x, 0, AMP.z), state: 'idle', t: 0, gun: null };
    this.lever = { ...POWER, pos: L(POWER.x, 1.4, POWER.z) };
    this.obstacles = [
      ...this.machines.map((m) => [m.pos[0], m.pos[2], 0.75]), [this.box.pos[0], this.box.pos[2], 1.0], [this.amp.pos[0], this.amp.pos[2], 1.2],
    ];
    this.events.push({ type: 'start' });
  }
  stop() {
    for (const d of this.doors || []) if (d.box && !d.open) { this.world.remove(d.box); }
    this.doors = [];
    super.stop();
  }

  zdmg() { return 45 + Math.min(30, this.round * 2); }
  survivors() { return [this.you]; }
  nextDoor(from, to) {
    // breadth-first over open doors
    const prev = new Map([[from, null]]), q = [from];
    while (q.length) {
      const r = q.shift();
      if (r === to) break;
      for (const d of this.doors) {
        if (!d.open) continue;
        const o = d.a === r ? d.b : d.b === r ? d.a : null;
        if (o && !prev.has(o)) { prev.set(o, [r, d]); q.push(o); }
      }
    }
    if (!prev.has(to)) return null;
    let cur = to, door = null;
    while (prev.get(cur) && prev.get(cur)[0] !== from) cur = prev.get(cur)[0];
    door = prev.get(cur)?.[1] || null;
    return door;
  }
  pushOut(z) {
    const p = z.bot.pos;
    for (const [x, zz, r] of this.obstacles) {
      const dx = p[0] - x, dz = p[2] - zz, d = Math.hypot(dx, dz);
      if (d < r && d > 1e-3) { p[0] = x + dx / d * r; p[2] = zz + dz / d * r; }
    }
    for (const o of this.agents) {
      if (o === z || !o.alive || o.state !== 'inside') continue;
      const dx = p[0] - o.pos[0], dz = p[2] - o.pos[2], d = Math.hypot(dx, dz);
      if (d < 0.6 && d > 1e-3) { const k = (0.6 - d) * 0.5; p[0] += dx / d * k; p[2] += dz / d * k; }
    }
    // and off you: they crowd you, they don't stand inside you
    { const P = this.player.pos, dx = p[0] - P[0], dz = p[2] - P[2], d = Math.hypot(dx, dz);
      if (d < 0.75 && d > 1e-3) { p[0] = P[0] + dx / d * 0.75; p[2] = P[2] + dz / d * 0.75; } }
    // stay in the building (rooms you can reach plus the doorways)
    const x = p[0] - O[0], zz = p[2] - O[2];
    p[0] = O[0] + clamp(x, -9.6, 31.6); p[2] = O[2] + clamp(zz, -9.6, 33.6);
  }

  // ---- points
  add(n) { const v = n * (this.double > 0 ? 2 : 1); this.points += v; this.events.push({ type: 'pts', n: v }); return v; }
  onHit(bot, head, dmg, melee) {
    if (!bot?.zombie) return dmg;
    this.add(10);
    if (this.insta > 0) return 1e6;
    return dmg;
  }
  onZombieDeath(z) {
    this.kills++;
    const b = z.bot;
    if (z.bot.lastByMelee) this.add(130); else if (b.lastHead) { this.add(100); this.heads++; } else this.add(50);
    // sometimes it drops a power-up
    if (this.dropsThisRound < 4 && Math.random() < 0.035) {
      const kinds = Object.keys(DROPS).filter((k) => k !== 'carpenter' || this.windows.some((w) => this.open.has(w.room) && w.boards < 5));
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      this.drops.push({ kind, pos: [b.pos[0], b.pos[1] + 0.9, b.pos[2]], t: 0 });
      this.dropsThisRound++;
      this.events.push({ type: 'dropSpawn' });
    }
  }

  // ---- what you can use where you're standing: returns { text, cost, ok, use(), hold }
  useAt(P, fwd) {
    if (this.over) return null;
    const near = (p, r) => dist2(p, P.pos) < r && Math.abs(p[1] - P.pos[1]) < 2.5;
    const look = (p) => { const d = [p[0] - P.pos[0], p[2] - P.pos[2]], l = Math.hypot(...d) || 1; return (d[0] * fwd[0] + d[1] * fwd[2]) / l > 0.25; };
    const pts = this.points;
    for (const d of this.doors) {
      if (d.open) continue;
      const c = L(d.x, 1, d.z);
      if (near(c, 2.8) && look(c)) return { kind: 'door', d, text: `OPEN DOOR TO <b>${ROOMS[this.open.has(d.a) ? d.b : d.a].name}</b>`, cost: d.cost, ok: pts >= d.cost };
    }
    for (const m of this.machines) if (near(m.pos, 1.9) && look(m.pos)) {
      if (this.perks.has(m.id)) return { kind: 'info', text: `<b>${m.name}</b> · YOU HAVE IT` };
      if (m.power !== false && !this.power) return { kind: 'info', text: `<b>${m.name}</b> · TURN THE POWER ON FIRST` };
      return { kind: 'perk', m, text: `DRINK <b>${m.name}</b> · ${m.desc}`, cost: m.cost, ok: pts >= m.cost };
    }
    if (near(this.box.pos, 2) && look(this.box.pos)) {
      const B = this.box;
      if (B.state === 'ready') return { kind: 'boxtake', text: `TAKE <b>${B.gunName}</b>` };
      if (B.state === 'closed') return { kind: 'box', text: 'MYSTERY BOX · A RANDOM GUN', cost: B.cost, ok: pts >= B.cost };
      return null;
    }
    if (near(this.amp.pos, 2.3) && look(this.amp.pos)) {
      const A = this.amp;
      if (!this.power) return { kind: 'info', text: '<b>AMPLIFIER</b> · TURN THE POWER ON FIRST' };
      if (A.state === 'ready') return { kind: 'amptake', text: `TAKE <b>${A.gunName}</b>` };
      if (A.state === 'idle') return { kind: 'amp', text: 'AMPLIFY YOUR GUN · DOUBLE DAMAGE, BIGGER MAG', cost: A.cost, ok: pts >= A.cost };
      return null;
    }
    if (!this.power && near(this.lever.pos, 2) && look(this.lever.pos)) return { kind: 'power', text: 'TURN THE <b>POWER</b> ON' };
    for (const wb of this.wallbuys) if (near(wb.pos, 1.9) && look(wb.pos) && this.open.has(wb.room)) return { kind: 'wall', wb, text: `BUY ${'<b>' + wb.id + '</b>'}`, cost: wb.cost, ok: pts >= wb.cost };
    for (const w of this.windows) if (this.open.has(w.room) && w.boards < 5 && near(w.inside, 1.8)) return { kind: 'board', w, text: 'HOLD TO <b>REBUILD</b> THE BARRIER', hold: true };
    return null;
  }
  openDoor(d) {
    d.open = true;
    this.world.remove(d.box);
    for (const r of [d.a, d.b]) this.open.add(r);
    this.events.push({ type: 'door', d });
  }

  // ---- per frame
  update(dt, g) {
    if (!this.active) return;
    this.t += dt;
    this.insta = Math.max(0, this.insta - dt); this.double = Math.max(0, this.double - dt);
    for (const z of this.agents) z.update(dt, g);
    this.agents = this.agents.filter((z) => !(z.dead && z.goneT <= 0));
    // the mystery box and the amplifier play out
    const B = this.box;
    if (B.state === 'spin') {
      B.t += dt;
      if (B.t < 3.4) { if ((B.flip -= dt) <= 0) { B.flip = 0.06 + B.t * 0.05; B.shown = g.boxPick?.() || 'smg'; } }
      else { B.state = 'ready'; B.t = 0; B.shown = B.gun; this.events.push({ type: 'boxReady' }); }
    } else if (B.state === 'ready') { B.t += dt; if (B.t > 9) { B.state = 'closed'; B.shown = null; B.gun = null; } }
    const A = this.amp;
    if (A.state === 'work') { A.t += dt; if (A.t > 3) { A.state = 'ready'; A.t = 0; this.events.push({ type: 'ampReady' }); } }
    else if (A.state === 'ready') { A.t += dt; if (A.t > 12) { A.state = 'idle'; A.gun = null; } }
    // power-ups: bob, time out, picked up by walking over them
    for (const d of this.drops) d.t += dt;
    this.drops = this.drops.filter((d) => d.t < 25);
    const P = this.player;
    for (const d of [...this.drops]) if (!P.dead && dist2(d.pos, P.pos) < 1.3 && Math.abs(d.pos[1] - P.pos[1] - 0.9) < 1.5) { this.drops.splice(this.drops.indexOf(d), 1); this.collect(d.kind, g); }
    if (this.over) return;
    if (!this.you.alive) {
      this.over = { winner: this.horde, standings: this.teams, rounds: this.round, kills: this.kills };
      this.events.push({ type: 'end', winner: this.horde });
      return;
    }
    const alive = this.agents.filter((z) => z.alive).length;
    if (this.round === 0 || (alive === 0 && this.queue === 0)) {
      if (this.breakT === null) { this.breakT = 8; this.events.push({ type: 'cleared', n: this.round }); }
      this.breakT -= dt;
      if (this.breakT <= 0) {
        this.breakT = null;
        this.round++;
        this.queue = this.round <= 4 ? [6, 8, 13, 18][this.round - 1] : Math.min(60, 18 + (this.round - 4) * 4);
        this.dropsThisRound = 0; this.boardPts = 0;
        this.events.push({ type: 'round', n: this.round });
      }
      return;
    }
    // keep them coming, through the windows of rooms you've opened
    this.spawnCd -= dt;
    if (this.queue > 0 && alive < Math.min(16, 5 + this.round * 2) && this.spawnCd <= 0) {
      this.spawnCd = Math.max(0.5, 2.2 - this.round * 0.15);
      const wins = this.windows.filter((w) => this.open.has(w.room));
      // prefer windows near you
      wins.sort((a, b) => dist2(a.inside, P.pos) - dist2(b.inside, P.pos));
      const w = wins[Math.floor(Math.random() * Math.min(wins.length, 4))];
      if (w) { this.queue--; this.agents.push(new Zombie(this, this.horde, ++this.zid, this.round, w)); }
    }
  }
  collect(kind, g) {
    this.events.push({ type: 'drop', kind });
    if (kind === 'insta') this.insta = 30;
    else if (kind === 'double') this.double = 30;
    else if (kind === 'maxammo') g.maxAmmo?.();
    else if (kind === 'nuke') {
      for (const z of this.agents) if (z.alive) { z.bot.lastHead = false; z.bot.damage(1e6, [0, 1, 0]); }
      this.add(400);
    } else if (kind === 'carpenter') { for (const w of this.windows) w.boards = 5; this.add(200); }
  }

  // ---- drawing everything that moves or changes
  drawParts(g) {
    const out = [];
    for (const z of this.agents) out.push(...z.bot.parts());
    const tm = this.t;
    const part = (pos, rot, s, color, o = {}) => { const m = mat4(); compose(m, pos, rot, s); out.push({ model: m, scale: s, color, emissive: o.em || 0, shape: o.shape, mat: o.mat, alpha: o.alpha, edges: 0, tex: o.tex }); };
    // window boards: nailed across the opening at slight angles
    for (const w of this.windows) {
      const yaw = w.n[0] !== 0 ? Math.PI / 2 : 0;
      for (let i = 0; i < w.boards; i++) {
        const y = 1.05 + i * 0.25, tilt = ((i * 37) % 7 - 3) * 0.03;
        part(L(w.x - w.n[0] * 0.25, y, w.z - w.n[1] * 0.25), [0, yaw, tilt], [2.0, 0.17, 0.05], [0.45 - i * 0.02, 0.32, 0.2], { mat: 'wood' });
      }
    }
    // closed doors: boarded across with two planks and a price stencilled on a sign
    for (const d of this.doors) {
      if (d.open) continue;
      const yaw = d.axis === 0 ? 0 : Math.PI / 2;
      for (const side of [-1, 1]) for (const [y, tilt] of [[0.9, 0.35], [2.1, -0.3]]) {
        const off = d.axis === 0 ? [0, 0, side * 0.2] : [side * 0.2, 0, 0];
        part(L(d.x + off[0], y, d.z + off[2]), [0, yaw, tilt], [2.7, 0.22, 0.06], [0.48, 0.34, 0.2], { mat: 'wood' });
      }
      for (const side of [-1, 1]) {
        const off = d.axis === 0 ? [0, 0, side * 0.2] : [side * 0.2, 0, 0];
        part(L(d.x + off[0], 1.5, d.z + off[2]), [0, yaw, 0], [0.9, 0.36, 0.04], this.points >= d.cost ? [0.95, 0.75, 0.15] : [0.6, 0.15, 0.1], { em: 0.6 });
      }
    }
    // chalk outlines of the guns on the walls
    for (const wb of this.wallbuys) {
      const def = g?.gunDef?.(wb.id);
      if (!def || !g.gunPartsOf) continue;
      const nx = wb.n[0], nz = wb.n[1], m = mat4();
      // gun x axis = the wall normal (flattened to nothing), z along the wall
      const ax = [nz, 0, -nx], sc = 1.5;
      m.set([nx * 0.02, 0, nz * 0.02, 0, 0, sc, 0, 0, ax[0] * sc, 0, ax[2] * sc, 0, O[0] + wb.x + nx * 0.22, O[1] + 1.55, O[2] + wb.z + nz * 0.22, 1]);
      const open = this.open.has(wb.room);
      for (const p of g.gunPartsOf(def, m)) out.push({ ...p, color: open ? [0.92, 0.92, 0.88] : [0.5, 0.5, 0.48], emissive: open ? 0.35 : 0.05, tex: 0, mat: 'paint' });
    }
    // drink machines: lit up in their colour once the power is on
    for (const m of this.machines) {
      const on = this.power || m.power === false, p = m.pos, yaw = Math.atan2(m.n[0], m.n[1]);
      const fwd = (d) => [p[0] + m.n[0] * d, p[1], p[2] + m.n[1] * d];
      part([p[0], p[1] + 1.1, p[2]], [0, yaw, 0], [1.05, 2.2, 0.75], m.col.map((v) => v * 0.45), { mat: 'paint' });
      const f = fwd(0.38);
      part([f[0], p[1] + 1.35, f[2]], [0, yaw, 0], [0.8, 1.1, 0.02], on ? m.col : m.col.map((v) => v * 0.2), { em: on ? 0.75 + 0.15 * Math.sin(tm * 3 + p[0]) : 0 });
      part([f[0], p[1] + 2.05, f[2]], [0, yaw, 0], [0.9, 0.22, 0.03], on ? [1, 1, 0.95] : [0.25, 0.25, 0.25], { em: on ? 0.9 : 0 });
      part([f[0], p[1] + 0.5, f[2]], [0, yaw, 0], [0.5, 0.18, 0.05], [0.08, 0.08, 0.09], { mat: 'metal' });
      if (this.perks.has(m.id)) part([f[0], p[1] + 2.4, f[2]], [0, tm, 0], [0.18, 0.18, 0.18], [0.5, 1, 0.5], { em: 1, shape: 'sphere' });
    }
    // the mystery box: a chest with a light above it; the lid opens and guns flicker over it
    {
      const B = this.box, p = B.pos, open = B.state === 'spin' || B.state === 'ready';
      part([p[0], p[1] + 0.32, p[2]], [0, 0, 0], [1.5, 0.64, 0.68], [0.3, 0.22, 0.14], { mat: 'wood', tex: 12 });
      for (const sx of [-0.62, 0, 0.62]) part([p[0] + sx, p[1] + 0.32, p[2]], [0, 0, 0], [0.06, 0.66, 0.7], [0.65, 0.5, 0.2], { mat: 'brass' });
      const lid = open ? -1.2 : 0;
      part([p[0], p[1] + 0.68 + (open ? 0.3 : 0), p[2] - (open ? 0.3 : 0)], [lid, 0, 0], [1.52, 0.08, 0.7], [0.28, 0.2, 0.12], { mat: 'wood' });
      part([p[0], p[1] + 2.4, p[2]], [0, 0, 0], [0.12, 3.6, 0.12], [0.4, 0.75, 1], { em: 1, alpha: 0.3 });
      part([p[0], p[1] + 0.33, p[2] - 0.345], [0, 0, 0], [0.22, 0.32, 0.01], [0.6, 0.85, 1], { em: 0.9 });
      if (open && B.shown && g?.gunDef) {
        const def = g.gunDef(B.shown), m = mat4(), rise = B.state === 'spin' ? Math.min(1, B.t / 1.5) : 1, a = B.state === 'spin' ? tm * 4 : Math.sin(tm * 1.5) * 0.3;
        m.set([Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, p[0], p[1] + 0.9 + rise * 0.7, p[2], 1]);
        out.push(...g.gunPartsOf(def, m));
      }
    }
    // the amplifier: a squat machine with rollers and a purple glow when the power's on
    {
      const A = this.amp, p = A.pos, on = this.power, work = A.state === 'work';
      part([p[0], p[1] + 0.6, p[2]], [0, 0, 0], [1.8, 1.2, 1.3], [0.22, 0.2, 0.26], { mat: 'metal' });
      part([p[0], p[1] + 1.25, p[2]], [0, 0, 0], [1.6, 0.12, 1.1], on ? [0.7, 0.35, 1] : [0.2, 0.15, 0.25], { em: on ? 0.8 + (work ? 0.2 * Math.sin(tm * 30) : 0) : 0 });
      for (const sx of [-0.5, 0.5]) part([p[0] + sx, p[1] + 1.45, p[2]], [work ? tm * 12 : 0, 0, Math.PI / 2], [0.3, 1.0, 0.3], [0.5, 0.5, 0.55], { shape: 'cyl', mat: 'steel' });
      for (const sz of [-1, 1]) part([p[0], p[1] + 0.6, p[2] + sz * 0.66], [0, 0, 0], [1.6, 0.9, 0.02], on ? [0.55, 0.25, 0.9] : [0.15, 0.1, 0.2], { em: on ? 0.5 : 0 });
      if (A.state === 'ready' && A.gun && g?.gunDef) {
        const m = mat4(), a = tm * 1.2;
        m.set([Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, p[0], p[1] + 1.9, p[2], 1]);
        out.push(...g.gunPartsOf(A.gun, m));
      }
    }
    // the power lever
    { const l = this.lever.pos, down = this.power;
      part([l[0] + 0.05, l[1], l[2]], [0, 0, 0], [0.1, 0.8, 0.6], [0.25, 0.25, 0.27], { mat: 'metal' });
      part([l[0] - 0.12, l[1] + (down ? -0.15 : 0.15), l[2]], [0, 0, down ? 0.6 : -0.6], [0.06, 0.5, 0.06], [0.8, 0.15, 0.1], { mat: 'paint' });
      part([l[0] - 0.02, l[1] + 0.5, l[2]], [0, 0, 0], [0.04, 0.1, 0.1], down ? [0.3, 1, 0.3] : [1, 0.2, 0.15], { em: 1 }); }
    // power-ups: a glowing token, spinning and bobbing, flickering before it vanishes
    for (const d of this.drops) {
      if (d.t > 20 && Math.sin(d.t * 20) < 0) continue;
      const c = DROPS[d.kind].col, y = d.pos[1] + Math.sin(d.t * 3) * 0.12;
      part([d.pos[0], y, d.pos[2]], [0, d.t * 2, 0], [0.5, 0.5, 0.1], c, { em: 0.9 });
      part([d.pos[0], y, d.pos[2]], [0, d.t * 2, 0], [0.75, 0.75, 0.75], c, { em: 1, alpha: 0.18, shape: 'sphere' });
    }
    return out;
  }

  objective() {
    const extra = [this.insta > 0 ? `INSTA-KILL ${Math.ceil(this.insta)}` : '', this.double > 0 ? `DOUBLE POINTS ${Math.ceil(this.double)}` : ''].filter(Boolean).join(' · ');
    if (this.over) return { text: `ROUND ${this.round}`, col: '#c8201a', sub: `YOU LASTED ${this.round} ROUND${this.round === 1 ? '' : 'S'}` };
    if (this.breakT !== null && this.breakT > 0) return { text: this.round ? `ROUND ${this.round}` : 'GET READY', col: '#c8201a', sub: `${this.points.toLocaleString('en-GB')} POINTS${extra ? ' · ' + extra : ''}` };
    return { text: `ROUND ${this.round}`, col: '#c8201a', sub: `${this.points.toLocaleString('en-GB')} POINTS${extra ? ' · ' + extra : ''}` };
  }
  markers() { return []; }
}
