// DEAD AIR: the zombies. Hundreds at a time, so they're simple: each is a few boxes drawn in one instanced batch.
//
// They find their way through the streets with flow fields (a map of "how far to the goal" for every 3 m square),
// one per goal: each rooftop with survivors on it, and the outpost. At a survivor building they climb the walls
// in a pile, and on the roof they go for the survivors. If you fly low they jump up and hang off the skids (shake
// them off by rolling and turning hard).
//   WALKER   slow, the bulk of the horde
//   RUNNER   fast, comes in rushes
//   SPITTER  bloated and glowing: spits acid at you from the ground
//   BRUTE    huge, throws lumps of concrete when you fly low
//   TITAN    the boss: as tall as a building, throws cars and heads for the outpost
import { compose, mat4, clamp } from '../math.js';
import { INST_FLOATS } from '../renderer.js';
import { HALF, BASE } from './city.js';

export const TYPES = {
  walker: { hp: 45, spd: [2.0, 3.0], s: 1, climb: 1.3, scrap: 2 },
  runner: { hp: 32, spd: [6.2, 7.4], s: 0.95, climb: 2.6, scrap: 3 },
  spitter: { hp: 80, spd: [1.7, 2.2], s: 1.15, climb: 0, scrap: 6 },
  brute: { hp: 480, spd: [2.4, 2.8], s: 2.3, climb: 0, scrap: 15 },
  titan: { hp: 12000, spd: [4.6, 4.6], s: 14, climb: 0, scrap: 600 },
};
const SKINS = [[0.42, 0.5, 0.36], [0.5, 0.52, 0.4], [0.36, 0.42, 0.33], [0.55, 0.5, 0.42]];
const SHIRT = [[0.3, 0.12, 0.1], [0.15, 0.2, 0.32], [0.38, 0.36, 0.3], [0.2, 0.25, 0.18], [0.45, 0.42, 0.38], [0.12, 0.12, 0.13], [0.42, 0.28, 0.12]];
const PANTS = [[0.15, 0.17, 0.24], [0.22, 0.2, 0.16], [0.12, 0.12, 0.12], [0.3, 0.28, 0.22]];

// the flow-field grid
const CELL = 3, GX0 = -HALF - 60, GZ0 = -HALF - 60, NX = Math.ceil((2 * HALF + 120) / CELL), NZ = Math.ceil((2 * HALF + 200) / CELL);
const cellOf = (x, z) => { const i = Math.floor((x - GX0) / CELL), k = Math.floor((z - GZ0) / CELL); return i < 0 || k < 0 || i >= NX || k >= NZ ? -1 : k * NX + i; };
const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export class Horde {
  constructor(world, effects) {
    this.world = world; this.fx = effects;
    this.list = []; this.shots = []; this.events = [];
    this.data = new Float32Array(INST_FLOATS * 6000);
    this.m = mat4();
    this.fields = new Map();
    this.head = new Int32Array(NX * NZ); this.next = new Int32Array(4000);
    // which squares are blocked at waist height (buildings, walls)
    this.block = new Uint8Array(NX * NZ);
    for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
      const x = GX0 + (i + 0.5) * CELL, z = GZ0 + (k + 0.5) * CELL;
      if (world.pointInside([x, 2, z]) || world.pointInside([x + 1, 2, z + 1]) || world.pointInside([x - 1, 2, z - 1])) this.block[k * NX + i] = 1;
    }
  }

  clear() { this.list.length = 0; this.shots.length = 0; this.events.length = 0; }

  // distance-to-goal for every square, from the squares that count as "there"
  field(key, isGoal) {
    let f = this.fields.get(key);
    if (f) return f;
    f = new Uint16Array(NX * NZ).fill(65535);
    const q = new Int32Array(NX * NZ); let h = 0, t = 0;
    for (let c = 0; c < NX * NZ; c++) if (!this.block[c] && isGoal(GX0 + ((c % NX) + 0.5) * CELL, GZ0 + (Math.floor(c / NX) + 0.5) * CELL)) { f[c] = 0; q[t++] = c; }
    while (h < t) {
      const c = q[h++], i = c % NX, k = (c - i) / NX, d = f[c] + 1;
      for (let n = 0; n < 4; n++) {
        const ii = i + N8[n][0], kk = k + N8[n][1];
        if (ii < 0 || kk < 0 || ii >= NX || kk >= NZ) continue;
        const cc = kk * NX + ii;
        if (this.block[cc] || f[cc] <= d) continue;
        f[cc] = d; q[t++] = cc;
      }
    }
    this.fields.set(key, f);
    return f;
  }
  roofField(r) {
    const b = r.box;
    return this.field(`roof${b.id}`, (x, z) => x > b.min[0] - 4 && x < b.max[0] + 4 && z > b.min[2] - 4 && z < b.max[2] + 4);
  }
  baseField() { return this.field('base', (x, z) => Math.abs(x - BASE[0]) < 16 && Math.abs(z - (BASE[2] + 6)) < 16); }

  spawn(type, x, z, o = {}) {
    const T = TYPES[type], r = Math.random;
    const zb = {
      type, x, y: 0, z, yaw: r() * 6.28, hp: T.hp * (o.hpMul || 1), max: T.hp * (o.hpMul || 1), s: T.s * (type === 'walker' ? 0.9 + r() * 0.2 : 1),
      spd: T.spd[0] + r() * (T.spd[1] - T.spd[0]), ph: r() * 6.28, st: 'walk', tgt: o.tgt || null, cd: 1 + r() * 3,
      skin: SKINS[Math.floor(r() * SKINS.length)], shirt: SHIRT[Math.floor(r() * SHIRT.length)], pants: PANTS[Math.floor(r() * PANTS.length)],
      vel: [0, 0, 0], hitT: 0, grip: 0, slot: -1, think: r(), dx: 0, dz: 0, side: (r() - 0.5) * 2, alive: true,
    };
    if (type === 'titan') { zb.skin = [0.3, 0.33, 0.28]; zb.shirt = [0.2, 0.15, 0.12]; zb.pants = [0.1, 0.1, 0.1]; zb.tgt = 'base'; }
    if (type === 'brute') { zb.skin = [0.33, 0.38, 0.3]; zb.shirt = [0.18, 0.14, 0.12]; }
    if (type === 'spitter') zb.skin = [0.45, 0.6, 0.25];
    this.list.push(zb);
    return zb;
  }

  count(type) { let n = 0; for (const z of this.list) if (z.alive && (!type || z.type === type)) n++; return n; }

  // g: { heli (Chopper), heliAlt, roofs (active, with .count), phase2, time, grabbers, onBase(x,z) }
  update(dt, g) {
    const H = g.heli, hp = H.pos;
    // spatial hash for keeping them apart
    this.head.fill(-1);
    const L = this.list;
    for (let i = 0; i < L.length && i < 4000; i++) {
      const z = L[i]; if (!z.alive || z.st !== 'walk') continue;
      const c = cellOf(z.x, z.z); if (c < 0) continue;
      this.next[i] = this.head[c]; this.head[c] = i;
    }
    let grabbers = 0;
    for (const z of L) if (z.alive && z.st === 'grab') grabbers++;
    for (let i = 0; i < L.length; i++) {
      const z = L[i];
      if (!z.alive) continue;
      z.hitT = Math.max(0, z.hitT - dt);
      z.cd -= dt;
      const T = TYPES[z.type];
      if (z.st === 'walk') this.walk(z, i, dt, g, T);
      else if (z.st === 'climb') {
        z.y += T.climb * dt * (0.8 + 0.4 * Math.sin(z.ph));
        z.ph += dt * 9;
        const r = z.roof;
        if (!r || !r.active) { z.st = 'fall'; z.vel = [z.nx * 2, 0, z.nz * 2]; continue; }
        if (z.y >= r.top + 0.7) {
          z.st = 'roof'; z.y = r.top;
          z.x = clamp(z.x, r.box.min[0] + 1.2, r.box.max[0] - 1.2); z.z = clamp(z.z, r.box.min[2] + 1.2, r.box.max[2] - 1.2);
        }
      } else if (z.st === 'roof') {
        const r = z.roof;
        let gx = r ? r.x : z.x, gz = r ? r.z : z.z;
        const heliHere = H.landed && r && H.landed === r.box;
        if (heliHere || !r || !r.active || r.count <= 0) { gx = hp[0]; gz = hp[2]; }
        const dx = gx - z.x, dz = gz - z.z, d = Math.hypot(dx, dz);
        if (d > 1.2) {
          z.x += (dx / d) * z.spd * 0.8 * dt; z.z += (dz / d) * z.spd * 0.8 * dt; z.yaw = Math.atan2(-dx, -dz); z.ph += dt * z.spd * 2.4;
          if (r) { z.x = clamp(z.x, r.box.min[0] + 0.8, r.box.max[0] - 0.8); z.z = clamp(z.z, r.box.min[2] + 0.8, r.box.max[2] - 0.8); }
        } else if (r && r.active && r.count > 0 && !heliHere && z.cd <= 0) {
          z.cd = 3; r.count--; this.events.push({ type: 'eaten', roof: r });
        }
        this.tryGrab(z, H, grabbers, g) && grabbers++;
      } else if (z.st === 'grab') {
        const sk = [[-1.25, -1.95, -1.2], [1.25, -1.95, -1.2], [-1.25, -1.95, 1.6], [1.25, -1.95, 1.6], [-1.25, -1.95, 0.2], [1.25, -1.95, 0.2]][z.slot % 6];
        const p = H.toWorld(sk);
        z.x = p[0]; z.y = p[1] - 1.75 * z.s; z.z = p[2]; z.yaw = H.heading + (z.slot % 2 ? -1.57 : 1.57);
        z.ph += dt * 7;
        const shake = Math.hypot(H.w[0], H.w[1], H.w[2]) + Math.max(0, H.vel[1] - 6) * 0.15;
        if (shake > 1.0) z.grip -= dt * (shake - 0.7) * 1.4;
        if (z.cd <= 0) { z.cd = 0.5; this.events.push({ type: 'claw', z, dmg: 2.5 }); }
        if (z.grip <= 0 || H.dead) { z.st = 'fall'; z.vel = [H.vel[0] + (Math.random() - 0.5) * 6, H.vel[1] + 2, H.vel[2] + (Math.random() - 0.5) * 6]; z.slot = -1; this.events.push({ type: 'shook' }); }
      } else if (z.st === 'fall') {
        z.vel[1] -= 20 * dt;
        z.x += z.vel[0] * dt; z.y += z.vel[1] * dt; z.z += z.vel[2] * dt;
        z.ph += dt * 14;
        if (z.vel[1] < 0) {
          const hit = this.world.raycast([z.x, z.y + 1, z.z], [0, -1, 0], 1.0 - z.vel[1] * dt + 0.05);
          if (hit) {
            z.y = hit.point[1];
            if (z.vel[1] < -15) { this.kill(z, [z.vel[0] * 0.3, 4, z.vel[2] * 0.3], 'fall'); continue; }
            const r = g.roofs.find((rr) => rr.box === hit.box);
            z.st = r ? 'roof' : hit.point[1] > 3 ? 'roof' : 'walk'; z.roof = r || null;
            if (z.st === 'walk') z.y = 0;
          }
        }
        if (z.y < -5) z.alive = false;
      }
      // special attacks
      if (z.st === 'walk' || z.st === 'roof') this.attack(z, dt, H, g);
    }
    // zombie projectiles
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.life -= dt;
      s.vel[1] -= s.g * dt;
      for (let k = 0; k < 3; k++) s.pos[k] += s.vel[k] * dt;
      s.rot += dt * 6;
      if (s.kind === 'glob' && Math.random() < 0.6) this.fx.spawnPiece(s.pos, [0.18, 0.18, 0.18], [0, 0, 0], [0.4, 1, 0.2], 0.35, 1), (this.fx.debris[this.fx.debris.length - 1].noGravity = true);
      const dx = s.pos[0] - hp[0], dy = s.pos[1] - hp[1], dz = s.pos[2] - hp[2];
      if (!H.dead && dx * dx + dy * dy + dz * dz < (s.r + 2.4) * (s.r + 2.4)) { this.events.push({ type: 'hitHeli', shot: s }); this.shots.splice(i, 1); continue; }
      if (s.life <= 0 || s.pos[1] < 0 || this.world.pointInside(s.pos)) {
        if (s.kind === 'glob') this.fx.sparks(s.pos, 8, [0.4, 1, 0.2], 4, 0.5, 0.08, 1);
        else this.fx.sparks(s.pos, 6, [0.5, 0.48, 0.44], 5, 0.8, 0.2, 2);
        this.shots.splice(i, 1);
      }
    }
    // drop the dead
    let w = 0;
    for (let i = 0; i < L.length; i++) if (L[i].alive) L[w++] = L[i];
    L.length = w;
  }

  walk(z, idx, dt, g, T) {
    const H = g.heli, hp = H.pos;
    z.think -= dt;
    const dxh = hp[0] - z.x, dzh = hp[2] - z.z, dh = Math.hypot(dxh, dzh);
    // fly low near them and they come for you
    const chase = !H.dead && g.heliAlt < 22 && dh < 60 && z.type !== 'titan';
    let dirx = 0, dirz = 0, reached = false;
    if (z.type === 'titan') {
      // straight down the middle avenue to the outpost, smashing through anything in the way
      const gx = BASE[0] - z.x, gz = BASE[2] - 30 - z.z, gd = Math.hypot(gx, gz);
      if (gd < 4) reached = true; else { dirx = gx / gd; dirz = gz / gd; }
    } else if (chase) { dirx = dxh / (dh || 1); dirz = dzh / (dh || 1); }
    else {
      if (z.think <= 0) {
        z.think = 1.5 + Math.random();
        if (z.tgt !== 'base' && (!z.tgt || !z.tgt.active)) {
          const rs = g.roofs.filter((r) => r.active && r.count > 0);
          z.tgt = g.phase2 || !rs.length || z.type === 'brute' && Math.random() < 0.5 ? 'base' : rs[Math.floor(Math.random() * rs.length)];
        }
      }
      const f = z.tgt === 'base' || !z.tgt ? this.baseField() : this.roofField(z.tgt);
      const c = cellOf(z.x, z.z);
      if (c >= 0 && f[c] === 0) reached = true;
      else if (c >= 0 && f[c] < 65535) {
        const i = c % NX, k = (c - i) / NX;
        let best = f[c], bi = -1;
        for (let n = 0; n < 8; n++) {
          const ii = i + N8[n][0], kk = k + N8[n][1];
          if (ii < 0 || kk < 0 || ii >= NX || kk >= NZ) continue;
          const cc = kk * NX + ii, v = f[cc] + (n >= 4 ? 0.4 : 0);
          if (n >= 4 && (this.block[k * NX + ii] || this.block[kk * NX + i])) continue;     // don't cut corners
          if (v < best) { best = v; bi = cc; }
        }
        if (bi >= 0) {
          const tx = GX0 + ((bi % NX) + 0.5) * CELL + z.side * 0.9, tz = GZ0 + (Math.floor(bi / NX) + 0.5) * CELL + z.side * 0.9;
          const ddx = tx - z.x, ddz = tz - z.z, dd = Math.hypot(ddx, ddz) || 1;
          dirx = ddx / dd; dirz = ddz / dd;
        }
      } else { const gx = BASE[0] - z.x, gz = BASE[2] - z.z, gd = Math.hypot(gx, gz) || 1; dirx = gx / gd; dirz = gz / gd; }
    }
    if (reached) {
      if (z.tgt && z.tgt !== 'base' && T.climb > 0 && z.tgt.active) {
        const b = z.tgt.box, cx = clamp(z.x, b.min[0], b.max[0]), cz = clamp(z.z, b.min[2], b.max[2]);
        const nx = z.x - cx, nz = z.z - cz, nd = Math.hypot(nx, nz);
        if (nd < 1.6) {
          z.st = 'climb'; z.roof = z.tgt;
          z.nx = nd > 1e-3 ? nx / nd : 0; z.nz = nd > 1e-3 ? nz / nd : 1;
          z.x = cx + z.nx * 0.35 + (-z.nz) * z.side * 0.6; z.z = cz + z.nz * 0.35 + z.nx * z.side * 0.6;
          z.yaw = Math.atan2(z.nx, z.nz);
          z.y = 0.18 + Math.random() * 0.6;
          return;
        }
        const d = Math.hypot(cx - z.x, cz - z.z) || 1; dirx = (cx - z.x) / d; dirz = (cz - z.z) / d;
      } else if (z.tgt === 'base' || !z.tgt || z.type === 'titan') {
        // inside the outpost: tear it up
        if (z.cd <= 0) { z.cd = 1; this.events.push({ type: 'baseHit', dmg: z.type === 'titan' ? 90 : z.type === 'brute' ? 14 : 3 }); }
        const gx = BASE[0] - z.x, gz = BASE[2] + 6 - z.z, gd = Math.hypot(gx, gz) || 1;
        if (gd > 6) { dirx = gx / gd; dirz = gz / gd; }
      }
    }
    // keep apart
    let px = 0, pz = 0;
    if (z.type !== 'titan') {
      const c = cellOf(z.x, z.z);
      if (c >= 0) {
        const i = c % NX, k = (c - i) / NX;
        for (let kk = k - 1; kk <= k + 1; kk++) for (let ii = i - 1; ii <= i + 1; ii++) {
          if (ii < 0 || kk < 0 || ii >= NX || kk >= NZ) continue;
          for (let j = this.head[kk * NX + ii]; j >= 0; j = this.next[j]) {
            if (j === idx) continue;
            const o = this.list[j], ox = z.x - o.x, oz = z.z - o.z, d2 = ox * ox + oz * oz, rr = 0.42 * (z.s + o.s);
            if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2), k2 = (rr - d) / d; px += ox * k2; pz += oz * k2; }
          }
        }
      }
    }
    const sp = z.spd * (chase ? 1.15 : 1);
    z.dx += (dirx - z.dx) * Math.min(1, dt * 5); z.dz += (dirz - z.dz) * Math.min(1, dt * 5);
    const mx = z.dx * sp * dt + px * Math.min(1, dt * 8), mz = z.dz * sp * dt + pz * Math.min(1, dt * 8);
    const hy = z.type === 'titan' ? 6 : 2;
    if (z.type === 'titan' || !this.world.pointInside([z.x + mx * 3, hy, z.z])) z.x += mx;
    if (z.type === 'titan' || !this.world.pointInside([z.x, hy, z.z + mz * 3])) z.z += mz;
    if (Math.abs(mx) + Math.abs(mz) > 1e-4) z.yaw = Math.atan2(-z.dx, -z.dz);
    z.ph += dt * sp * (z.type === 'titan' ? 0.5 : 2.4) / z.s;
    z.y = 0;
    if (z.type === 'titan' && Math.sin(z.ph) * Math.sin(z.ph - dt * sp * 0.5 / z.s) < 0) this.events.push({ type: 'stomp', z });
    this.tryGrab(z, H, -1, g);
  }

  tryGrab(z, H, n, g) {
    if (z.type === 'titan' || z.type === 'brute' || H.dead) return false;
    const skidY = H.pos[1] - 1.9, dx = H.pos[0] - z.x, dz = H.pos[2] - z.z;
    if (dx * dx + dz * dz > 14 || skidY - z.y > 2.4 || skidY - z.y < -0.5) return false;
    if (n < 0) { n = 0; for (const o of this.list) if (o.alive && o.st === 'grab') n++; }
    if (n >= 6 || Math.random() > 0.08) return false;
    const used = new Set(this.list.filter((o) => o.alive && o.st === 'grab').map((o) => o.slot));
    let s = 0; while (used.has(s)) s++;
    z.st = 'grab'; z.slot = s; z.grip = 0.6 + Math.random() * 0.6; z.cd = 0.5;
    this.events.push({ type: 'grab', z });
    return true;
  }

  attack(z, dt, H, g) {
    if (H.dead || z.cd > 0) return;
    const hp = H.pos, dx = hp[0] - z.x, dy = hp[1] - (z.y + 1.6 * z.s), dz = hp[2] - z.z, d = Math.hypot(dx, dy, dz);
    const throwAt = (kind, speed, from, dmg, r, grav) => {
      const t = d / speed, aim = [hp[0] + H.vel[0] * t * 0.8, hp[1] + H.vel[1] * t * 0.5, hp[2] + H.vel[2] * t * 0.8];
      const v = [(aim[0] - from[0]) / t, (aim[1] - from[1]) / t + 0.5 * grav * t, (aim[2] - from[2]) / t];
      this.shots.push({ kind, pos: [...from], vel: v, life: t + 1.5, dmg, r, g: grav, rot: 0 });
    };
    if (z.type === 'spitter' && d < 85 && dy > 2) {
      z.cd = 3.2 + Math.random() * 1.5;
      throwAt('glob', 42, [z.x, z.y + 1.7 * z.s, z.z], 20, 0.5, 9.8);
      this.events.push({ type: 'spit', z });
    } else if (z.type === 'brute' && d < 60 && dy < 40) {
      z.cd = 4 + Math.random() * 2;
      throwAt('rock', 34, [z.x, z.y + 2.4 * z.s, z.z], 55, 0.9, 12);
      this.events.push({ type: 'throw', z });
    } else if (z.type === 'titan' && d < 140) {
      z.cd = 4.5;
      throwAt('car', 40, [z.x, z.y + 2.2 * z.s, z.z], 95, 2.2, 12);
      this.events.push({ type: 'throw', z, big: true });
    }
  }

  // nearest zombie a ray hits: { z, t } (or null)
  hitRay(o, d, maxT) {
    let best = null, bt = maxT;
    for (const z of this.list) {
      if (!z.alive) continue;
      const r = 0.55 * z.s, cy = z.y + 1.0 * z.s;
      const ox = z.x - o[0], oy = cy - o[1], oz = z.z - o[2];
      const tc = ox * d[0] + oy * d[1] + oz * d[2];
      if (tc < 0 || tc - r > bt) continue;
      const px = ox - d[0] * tc, py = (oy - d[1] * tc) / (z.type === 'titan' || z.type === 'brute' ? 1.6 : 1.8), pz = oz - d[2] * tc;
      const dd = px * px + py * py + pz * pz;
      if (dd > r * r) continue;
      const t = tc - Math.sqrt(r * r - dd);
      if (t < bt) { bt = t; best = { z, t }; }
    }
    return best;
  }

  damage(z, dmg, push, cause) {
    if (!z.alive) return false;
    z.hp -= dmg; z.hitT = 0.1;
    if (z.hp <= 0) { this.kill(z, push, cause); return true; }
    return false;
  }

  kill(z, push = [0, 2, 0], cause = '') {
    if (!z.alive) return;
    z.alive = false;
    if (z.st === 'grab') this.events.push({ type: 'shook' });
    // fall apart into the boxes it's made of
    const parts = this.parts(z, [], 1);
    const big = z.type === 'titan' ? 4 : 1;
    for (const p of parts) {
      const v = [push[0] + (Math.random() - 0.5) * 5 * big, push[1] + Math.random() * 4 * big, push[2] + (Math.random() - 0.5) * 5 * big];
      this.fx.spawnPiece(p.pos, p.size, v, p.col, z.type === 'titan' ? 6 : 2 + Math.random() * 1.2);
    }
    const gc = [0.32, 0.06, 0.05];
    for (let i = 0; i < (z.type === 'titan' ? 40 : 5); i++) {
      const s = 0.12 * z.s * (0.5 + Math.random());
      this.fx.spawnPiece([z.x, z.y + z.s, z.z], [s, s, s], [push[0] * 0.5 + (Math.random() - 0.5) * 6, 2 + Math.random() * 4, push[2] * 0.5 + (Math.random() - 0.5) * 6], gc, 1.2);
    }
    this.events.push({ type: 'kill', z, cause });
  }

  // splash damage: everything inside r, less further out, thrown away from the middle
  blast(pos, r, dmg, force, cause = 'blast') {
    let n = 0;
    for (const z of this.list) {
      if (!z.alive) continue;
      const dx = z.x - pos[0], dy = z.y + z.s - pos[1], dz = z.z - pos[2], d = Math.hypot(dx, dy, dz);
      if (d > r + z.s * 0.5) continue;
      const k = 1 - clamp(d / (r + 0.01), 0, 0.85), dl = d || 1;
      const push = [(dx / dl) * force * k, force * 0.7 * k + 3, (dz / dl) * force * k];
      if (this.damage(z, dmg * k, push, cause)) n++;
      else if (z.type !== 'titan' && z.type !== 'brute' && z.st !== 'climb') { z.st = 'fall'; z.vel = push; }
      else if (z.st === 'climb') { z.st = 'fall'; z.vel = [push[0] * 0.5, 2, push[2] * 0.5]; }
    }
    return n;
  }

  // the boxes a zombie is made of, in the world: [{ pos, rot, size, col, em }]
  parts(z, out, lod = 1) {
    const s = z.s, c = Math.cos(z.yaw), sn = Math.sin(z.yaw);
    const flash = z.hitT > 0;
    const tint = (col) => flash ? [Math.min(1, col[0] + 0.5), Math.min(1, col[1] + 0.4), Math.min(1, col[2] + 0.4)] : col;
    const P = (lx, ly, lz, rx, sx, sy, sz, col, em = 0) => {
      out.push({ pos: [z.x + (lx * c + lz * sn) * s, z.y + ly * s, z.z + (-lx * sn + lz * c) * s], rot: [rx, z.yaw, 0], size: [sx * s, sy * s, sz * s], col: tint(col), em });
    };
    const st = z.st, ph = z.ph, run = z.type === 'runner', big = z.type === 'brute' || z.type === 'titan';
    if (lod === 0) {
      P(0, 0.42, 0, 0, 0.42, 0.84, 0.24, z.pants);
      P(0, 1.3, 0, 0, 0.5, 0.95, 0.3, z.shirt);
      return out;
    }
    let lean = run ? -0.45 : big ? -0.3 : -0.18, armA = -0.1 + Math.sin(ph * 0.5) * 0.12, legA = Math.sin(ph) * (run ? 0.9 : 0.55);
    if (st === 'climb') { lean = 0.05; armA = 1.35 + Math.sin(ph) * 0.3; legA = Math.sin(ph) * 0.4; }
    else if (st === 'grab') { lean = 0; armA = 1.5; legA = Math.sin(ph) * 0.5; }
    else if (st === 'fall') { lean = Math.sin(ph) * 0.4; armA = 1 + Math.sin(ph * 1.3) * 1.2; legA = Math.sin(ph) * 1; }
    else if (z.type === 'spitter' && z.cd > 2.6) { lean = 0.35; armA = -0.6; }
    else if ((z.type === 'brute' || z.type === 'titan') && z.cd > (z.type === 'titan' ? 3.6 : 3.2)) { armA = 2.4; lean = 0.2; }
    for (const sd of [-1, 1]) {
      const a = legA * sd;
      P(sd * 0.13, 0.85 - 0.425 * Math.cos(a), -0.425 * Math.sin(a), a, big ? 0.28 : 0.2, 0.85, big ? 0.3 : 0.22, z.pants);
    }
    const tw = big ? 0.75 : z.type === 'spitter' ? 0.66 : run ? 0.42 : 0.48, td = z.type === 'spitter' ? 0.5 : big ? 0.42 : 0.28;
    const tl = Math.sin(lean);
    P(0, 1.18, -0.33 * tl, lean, tw, 0.66, td, z.shirt);
    P(0, 1.66, -0.62 * tl - 0.05, lean * 0.6 + 0.2, 0.28, 0.3, 0.28, z.skin);
    if (z.type === 'spitter') {
      P(0, 1.25, 0.25 - 0.33 * tl, lean, 0.42, 0.42, 0.24, [0.45, 1, 0.2], 0.85);
      P(0.22, 1.0, -0.22 - 0.3 * tl, lean, 0.18, 0.18, 0.12, [0.45, 1, 0.2], 0.85);
    }
    if (z.type === 'titan' || z.type === 'brute') for (const dx of [-0.07, 0.07]) P(dx, 1.7 - 0.62 * tl, -0.62 * tl - 0.2, lean * 0.6 + 0.2, 0.06, 0.04, 0.02, [1, 0.15, 0.05], 1);
    if (z.type === 'titan') for (const dx of [-0.25, 0, 0.25]) P(dx, 1.45, 0.25 - 0.4 * tl, lean - 0.5, 0.08, 0.3, 0.08, [0.85, 0.82, 0.7]);
    for (const sd of [-1, 1]) {
      const a = armA + (st === 'walk' ? Math.sin(ph + sd) * 0.15 : Math.sin(ph * 2 + sd) * 0.2) * sd;
      const sx = sd * (tw / 2 + 0.07), sy = 1.42 - 0.1 * (1 - Math.cos(lean)), sz = -0.45 * tl;
      P(sx, sy + Math.sin(a) * 0.31, sz - Math.cos(a) * 0.31, a, big ? 0.2 : 0.13, big ? 0.2 : 0.13, 0.62, z.skin);
    }
    return out;
  }

  // fill the instanced batch; returns how many boxes
  fill(r, batch, cam, fwd, kf) {
    const D = this.data, m = this.m, tmp = [];
    let n = 0;
    const put = (p) => {
      if (n >= 6000) return;
      compose(m, p.pos, p.rot, p.size);
      const o = n * INST_FLOATS;
      for (let k = 0; k < 16; k++) D[o + k] = m[k];
      D[o + 16] = p.size[0]; D[o + 17] = p.size[1]; D[o + 18] = p.size[2]; D[o + 19] = 1;
      D[o + 20] = p.col[0]; D[o + 21] = p.col[1]; D[o + 22] = p.col[2]; D[o + 23] = 1;
      D[o + 24] = 0; D[o + 25] = 0; D[o + 26] = p.em; D[o + 27] = 0;
      D[o + 28] = 0; D[o + 29] = 0.85; D[o + 30] = 0; D[o + 31] = 0;
      n++;
    };
    for (const z of this.list) {
      if (!z.alive) continue;
      const dx = z.x - cam[0], dy = z.y + z.s - cam[1], dz = z.z - cam[2], d2 = dx * dx + dy * dy + dz * dz;
      const al = dx * fwd[0] + dy * fwd[1] + dz * fwd[2], rr = 2 * z.s;
      if (al < -rr) continue;
      if (Math.sqrt(Math.max(0, d2 - al * al)) > al * kf + rr) continue;
      if (d2 > 520 * 520) continue;
      tmp.length = 0;
      this.parts(z, tmp, d2 > 150 * 150 && z.type !== 'titan' ? 0 : 1);
      for (const p of tmp) put(p);
    }
    // what they throw
    for (const s of this.shots) {
      if (s.kind === 'glob') put({ pos: s.pos, rot: [s.rot, s.rot, 0], size: [0.6, 0.6, 0.6], col: [0.4, 1, 0.2], em: 1 });
      else if (s.kind === 'rock') put({ pos: s.pos, rot: [s.rot, s.rot * 0.7, 0], size: [1.3, 1.0, 1.1], col: [0.5, 0.48, 0.44], em: 0 });
      else { put({ pos: s.pos, rot: [s.rot, s.rot * 0.5, 0], size: [1.9, 1.3, 4.3], col: [0.55, 0.15, 0.1], em: 0 }); }
    }
    r.fillBatch(batch, D, n, n);
    return n;
  }
}
