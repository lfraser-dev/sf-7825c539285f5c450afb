// Two offline modes built on the deathmatch machinery (tdm.js): ZOMBIES and BATTLE ROYALE.
//
// ZOMBIES: you (and up to three AI teammates) against waves of zombies. Each round brings more of them, tougher and
// faster. Hits and kills earn points; spend them at the buy stations around the arena for better guns (or ammo for
// the one you're holding). When you go down it's over: how many rounds did you last?
//
// BATTLE ROYALE: you and seven AI, every one for themselves. Everyone starts with a pistol; crates around the arena
// hold better guns. A ring closes in and hurts anyone caught outside it. No respawns: last one standing wins.
import { Agent, Deathmatch } from './tdm.js';
import { Bot, teamPalette } from './bots.js';
import { compose, mat4, clamp } from './math.js';

const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const box = (pos, rot, s, color, o = {}) => { const m = mat4(); compose(m, pos, rot, s); return { model: m, scale: s, color, emissive: o.em || 0, shape: o.shape, mat: o.mat, alpha: o.alpha, edges: 0 }; };

// nav points on the ground floor, spread out: greedy farthest-point picks
function spreadPoints(nav, n, avoid = [], minD = 0) {
  const ground = [];
  const floor = nav.levels?.[0] ?? 0;
  for (let i = 0; i < nav.N; i++) if (nav.Y[i] < floor + 0.6) ground.push(i);
  const out = [];
  for (let k = 0; k < n && ground.length; k++) {
    let best = null, bs = -1;
    for (let t = 0; t < 60; t++) {
      const i = pick(ground), p = nav.point(i);
      let d = Infinity;
      for (const q of [...out, ...avoid]) d = Math.min(d, dist2(p, q));
      if (d < minD && t < 59) continue;
      if (d > bs) { bs = d; best = p; }
    }
    if (best) out.push(best);
  }
  return out;
}

// ================================================================ ZOMBIES
const HORDE = '#6a9a3c';
export const BUYS = [
  { id: 'smg', cost: 500 }, { id: 'shotgun', cost: 750 }, { id: 'ar', cost: 1000 }, { id: 'autoshotgun', cost: 1250 },
  { id: 'lmg', cost: 1500 }, { id: 'dmr_i', cost: 1750 }, { id: 'shotgun_d', cost: 2000 }, { id: 'rg1', cost: 2500 },
];
export const AMMO_COST = 250;

class Zombie extends Agent {
  constructor(co, team, info, slot, pos, round) {
    super(co, team, info, slot);
    this.zombie = true;
    const b = this.bot;
    b.pos = [...pos]; b.lastPos = [...pos];
    const hp = 70 + round * 18, sp = Math.min(6.2, 2.9 + round * 0.22 + Math.random() * 0.8);
    b.t = { ...b.t, hp, speed: sp };
    b.hp = b.maxHp = hp;
    b.zombie = true;
    b.state = 'fight';
    b.place();
    this.dmg = 14 + round * 2;
    this.atkCd = 0;
    this.groanT = Math.random() * 4;
  }
  update(dt, g) {
    const co = this.co, b = this.bot;
    if (!b.human && g.humanFor) { const h = g.humanFor(this); if (h) Object.assign(b, { human: h.skin, gunDef: null, gunPartsOf: null }); }
    if (!b.alive) {
      if (!this.dead) { this.dead = true; b.downed = false; this.goneT = 3; co.onDeath(this); }
      if (b.dying >= 0) {
        b.dying += dt; b.flash -= dt;
        if (!b.removed) g.settleBody?.(b, dt);
        if (b.dying > 0.9 && !b.shattered) { b.shattered = true; b.remove(); b.removed = true; g.onShatter?.(b); }
      }
      this.goneT -= dt;
      return;
    }
    this.animate(dt);
    // the nearest living survivor
    let tgt = null, bd = Infinity;
    for (const e of co.survivors()) { if (!e.alive) continue; const d = dist2(e.pos, b.pos) + Math.abs(e.pos[1] - b.pos[1]) * 3; if (d < bd) { bd = d; tgt = e; } }
    this.repathT = (this.repathT ?? 0) - dt;
    let moved = 0;
    const d = tgt ? dist2(tgt.pos, b.pos) : 99;
    if (tgt && d > 1.1) {
      if (d < 3 && Math.abs(tgt.pos[1] - b.pos[1]) < 1.2) {
        // close: straight at them
        const dx = tgt.pos[0] - b.pos[0], dz = tgt.pos[2] - b.pos[2], l = Math.hypot(dx, dz) || 1, st = Math.min(l - 0.9, b.t.speed * dt);
        const nx = [b.pos[0] + dx / l * st, b.pos[1], b.pos[2] + dz / l * st];
        if (st > 0 && !b.blocked(nx)) { b.pos[0] = nx[0]; b.pos[2] = nx[2]; moved = st; }
      } else {
        if (this.repathT <= 0 || !this.path) { this.repathT = 0.7 + Math.random() * 0.5; this.path = co.nav.path(co.nav.nearest(b.pos), co.nav.nearest(tgt.pos)); this.pi = 0; this.seg = null; }
        if (this.path && this.pi < this.path.length) moved = this.follow(dt, b.t.speed);
      }
    }
    b.moving += ((moved > 0.001 ? 1 : 0) - b.moving) * Math.min(1, dt * 8);
    b.walk += dt * (moved / Math.max(dt, 1e-4)) * 2.0;
    if (tgt) {
      let dy = Math.atan2(-(tgt.pos[0] - b.pos[0]), -(tgt.pos[2] - b.pos[2])) - b.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      b.yaw += dy * Math.min(1, dt * 7);
    }
    // swipe at them when in reach
    this.atkCd -= dt;
    if (tgt && d < 1.5 && Math.abs(tgt.pos[1] - b.pos[1]) < 1.4 && this.atkCd <= 0) {
      this.atkCd = 0.9 + Math.random() * 0.3;
      b.recoil = 1; b.lunge = 1;
      if (tgt.isPlayer) g.hitPlayer(this.dmg, b, b.eye());
      else if (tgt.bot) { tgt.lastHitBy = this; if (tgt.bot.damage(this.dmg, [0, 0, 0])) g.onBotKill?.(this, tgt); }
      g.zombieHit?.(b);
    }
    b.lunge = Math.max(0, (b.lunge || 0) - dt * 3);
    this.groanT -= dt;
    if (this.groanT <= 0) { this.groanT = 3 + Math.random() * 5; g.groan?.(b.pos); }
    b.place();
  }
}

export class Zombies extends Deathmatch {
  constructor(world) { super(world); this.mode = 'zombies'; this.noRespawn = true; }
  takedown(by, victim) { this.events.push({ type: 'takedown', team: by.team, by, victim }); }

  start(match, map, player, classOf) {
    const allies = match.teams.find((t) => t.mine).players;
    super.start({ teams: [{ name: 'SURVIVORS', col: '#ff7a1a', mine: true, players: allies }, { name: 'THE HORDE', col: HORDE, mine: false, players: [] }] }, map, player, classOf);
    this.events.length = 0;
    this.horde = this.teams[1];
    this.round = 0; this.points = 500; this.queue = 0; this.spawnCd = 0; this.breakT = 5; this.kills = 0; this.zid = 0;
    // buy stations: one near the start, the rest spread round the arena
    const sp = this.teams[0].spawn.pos;
    const pts = spreadPoints(this.nav, BUYS.length, [sp], 7);
    this.stations = pts.map((p, i) => ({ pos: p, buy: BUYS[i], t: Math.random() * 6 }));
    this.events.push({ type: 'start' });
  }

  survivors() { return [this.you, ...this.agents.filter((a) => !a.zombie)]; }

  // no team scoring: points for you, and the game ends when you go down
  score() {}
  onDeath(a) {
    if (!a.zombie) return;
    const by = a.lastHitBy;
    this.kills++;
    if (by === this.you || by?.isPlayer) { this.points += a.bot.lastHead ? 100 : 60; this.events.push({ type: 'zkill', head: !!a.bot.lastHead }); }
  }
  // the player's shots: 10 points a hit
  onHit(bot) { if (bot?.zombie) this.points += 10; }

  update(dt, g) {
    if (!this.active) return;
    this.t += dt;
    for (const a of this.agents) a.update(dt, g);
    this.agents = this.agents.filter((a) => !(a.zombie && a.dead && a.goneT <= 0));
    if (this.over) return;
    if (!this.you.alive) {
      this.over = { winner: this.horde, standings: this.teams, rounds: this.round, kills: this.kills };
      this.events.push({ type: 'end', winner: this.horde });
      return;
    }
    const alive = this.agents.filter((a) => a.zombie && a.alive).length;
    if (this.round === 0 || (alive === 0 && this.queue === 0)) {
      if (this.breakT === null) { this.breakT = 6; this.events.push({ type: 'cleared', n: this.round }); }
      this.breakT -= dt;
      if (this.breakT <= 0) {
        this.breakT = null;
        this.round++;
        this.queue = 5 + this.round * 3;
        this.events.push({ type: 'round', n: this.round });
        // fallen teammates come back each round
        for (const a of this.agents) if (!a.zombie && !a.alive) { a.spawnBot(); }
      }
      return;
    }
    // keep the horde coming, a few at a time, from somewhere you aren't looking
    this.spawnCd -= dt;
    if (this.queue > 0 && alive < Math.min(12, 4 + this.round) && this.spawnCd <= 0) {
      this.spawnCd = Math.max(0.35, 1.1 - this.round * 0.06);
      const far = spreadPoints(this.nav, 1, this.survivors().filter((e) => e.alive).map((e) => e.pos), 14)[0];
      if (far) {
        this.queue--;
        this.agents.push(new Zombie(this, this.horde, { name: `ZOMBIE ${++this.zid}`, cls: 'light' }, this.zid % 4, far, this.round));
      }
    }
  }

  // the buy station you're standing at (within 2.3 m)
  stationAt(pos) { return this.stations?.find((s) => dist2(s.pos, pos) < 2.3 && Math.abs(s.pos[1] - pos[1]) < 1.5) || null; }

  drawParts(g) {
    const out = super.drawParts();
    for (const s of this.stations || []) {
      s.t += 0.016;
      const p = s.pos;
      out.push(box([p[0], p[1] + 0.5, p[2]], [0, 0, 0], [0.9, 1, 0.9], [0.14, 0.15, 0.17], { mat: 'metal' }));
      out.push(box([p[0], p[1] + 1.01, p[2]], [0, 0, 0], [0.96, 0.03, 0.96], [0.4, 1, 0.3], { em: 0.6 + 0.3 * Math.sin(s.t * 3) }));
      for (const sx of [-1, 1]) out.push(box([p[0] + sx * 0.46, p[1] + 0.5, p[2]], [0, 0, 0], [0.02, 0.9, 0.7], [0.4, 1, 0.3], { em: 0.8 }));
      // the gun, turning slowly above it
      const def = g?.gunDef?.(s.buy.id);
      if (def && g.gunPartsOf) {
        const m = mat4(), a = s.t * 0.8;
        m.set([Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, p[0], p[1] + 1.55 + Math.sin(s.t * 2) * 0.05, p[2], 1]);
        out.push(...g.gunPartsOf(def, m));
      }
    }
    return out;
  }

  objective() {
    if (this.over) return { text: `ROUND ${this.round}`, col: HORDE, sub: `YOU LASTED ${this.round} ROUND${this.round === 1 ? '' : 'S'} · ${this.kills} KILLS` };
    const left = this.queue + this.agents.filter((a) => a.zombie && a.alive).length;
    if (this.breakT !== null && this.breakT > 0) return { text: this.round ? `ROUND ${this.round} CLEARED` : 'GET READY', col: '#7dff9a', sub: `ROUND ${this.round + 1} IN ${Math.ceil(this.breakT)} · ${this.points.toLocaleString('en-GB')} POINTS` };
    return { text: `ROUND ${this.round}`, col: '#9fe06a', sub: `${left} ZOMBIES LEFT · ${this.points.toLocaleString('en-GB')} POINTS` };
  }
}

// ================================================================ BATTLE ROYALE
const BR_COLS = ['#ff7a1a', '#2f8cff', '#e8e04a', '#3ad16b', '#c050ff', '#ff4fa0', '#4ae0e0', '#f0f0f0'];
// what the crates hold, by rarity: [colour, chance, guns]
export const LOOT = [
  ['COMMON', [0.75, 0.77, 0.8], 0.42, ['smg', 'kv', 'shotgun', 'zu9', 'cr56']],
  ['RARE', [0.25, 0.6, 1], 0.32, ['ar', 'burst', 'pdx', 'autoshotgun', 'dmr', 'kr45']],
  ['EPIC', [0.7, 0.35, 1], 0.19, ['sniper', 'lmg', 'hx17', 'rk74', 'shotgun_d', 'dmr_i']],
  ['LEGENDARY', [1, 0.72, 0.15], 0.07, ['rg1', 'minigun', 'sniper_x', 'amr']],
];
export function rollLoot() {
  let r = Math.random();
  for (const L of LOOT) { if (r < L[2]) return { tier: L, id: pick(L[3]) }; r -= L[2]; }
  return { tier: LOOT[0], id: pick(LOOT[0][3]) };
}
// the ring: [time it starts, time it finishes shrinking, radius it shrinks to (fraction of the start), damage/s outside]
const RING = [[25, 50, 0.62, 3], [65, 90, 0.34, 6], [100, 125, 0.14, 10], [135, 160, 0.02, 16]];

class Contender extends Agent {
  spawnBot() {
    if (this.out) { this.respawnT = 1e9; return; }
    super.spawnBot();
    const b = this.bot, sp = this.team.spawn;
    b.pos = [...sp.pos]; b.lastPos = [...sp.pos]; b.yaw = sp.yaw;
    b.state = 'fight';
    this.base = b.t;
    b.t = { ...b.t, dmg: 3, rpm: 320, range: [4, 10], burst: [2, 3], acc: 0.8 };        // a pistol to start
    this.armed = false;
    this.role = 'push';
    b.place();
  }
  update(dt, g) {
    const wasAlive = this.bot.alive;
    super.update(dt, g);
    if (wasAlive && !this.bot.alive) { this.out = true; this.respawnT = 1e9; }
    if (!this.bot.alive) return;
    // a crate within reach: open it
    if (!this.armed) {
      const c = this.co.crateNear(this.bot.pos, 1.5);
      if (c) { this.co.openCrate(c, this); this.armed = true; this.bot.t = { ...this.base, dmg: Math.round(this.base.dmg * (c.loot.tier[0] === 'LEGENDARY' ? 2 : c.loot.tier[0] === 'EPIC' ? 1.5 : 1.15)) }; }
    }
  }
}

export class Royale extends Deathmatch {
  constructor(world) { super(world); this.mode = 'royale'; this.noRespawn = true; }
  takedown(by, victim) { this.events.push({ type: 'takedown', team: by.team, by, victim }); }

  start(match, map, player, classOf) {
    // everyone on their own team, spread round the arena
    const players = match.teams.flatMap((t) => t.players);
    // (the AI are added below, once everyone's spawn point is known)
    super.start({ teams: players.map((p, i) => ({ name: p.you ? 'YOU' : p.name, col: BR_COLS[i % BR_COLS.length], mine: !!p.you, players: p.you ? [p] : [] })) }, map, player, classOf);
    this.events.length = 0;
    const spots = spreadPoints(this.nav, this.teams.length, [], 10);
    this.teams.forEach((t, i) => { const p = spots[i] || map.spawns[i % 2].pos; t.spawn = { pos: [...p], yaw: Math.atan2(p[0] - map.origin[0], p[2] - map.origin[2]) }; });
    players.forEach((p, i) => { if (!p.you) this.agents.push(new Contender(this, this.teams[i], { name: p.name, cls: p.cls }, 0)); });
    // crates: about two per contender
    this.crates = spreadPoints(this.nav, 18, spots, 5).map((p) => ({ pos: p, loot: rollLoot(), open: false, t: Math.random() * 6 }));
    // the ring: centred somewhere near the middle, starting big enough to cover the whole arena
    const o = map.origin, W = map.W || 30, D = map.D || 20;
    this.c = [o[0] + (Math.random() - 0.5) * W * 0.5, o[1], o[2] + (Math.random() - 0.5) * D * 0.5];
    this.R0 = Math.hypot(W, D) + 6;
    this.R = this.R0;
    this.place = 0;
    this.events.push({ type: 'start' });
  }

  get radius() { return this.R; }
  ringPhase() {
    for (const [a, b, f, dps] of RING) {
      if (this.t < a) return { next: a - this.t, shrinking: false, dps };
      if (this.t < b) return { next: b - this.t, shrinking: true, dps };
    }
    return { next: 0, shrinking: false, dps: RING[RING.length - 1][3] };
  }
  ringRadius() {
    let r = this.R0, prev = 1;
    for (const [a, b, f] of RING) {
      if (this.t < a) break;
      const k = clamp((this.t - a) / (b - a), 0, 1);
      r = this.R0 * (prev + (f - prev) * k);
      prev = f;
    }
    return r;
  }
  outside(p) { return dist2(p, this.c) > this.R; }

  crateNear(p, r) { return this.crates?.find((c) => !c.open && dist2(c.pos, p) < r && Math.abs(c.pos[1] - p[1]) < 1.5) || null; }
  openCrate(c, by) { c.open = true; this.events.push({ type: 'crate', crate: c, by }); }

  entitiesAlive() { return this.entities().filter((e) => e.alive); }

  score(victim, killer) {
    if (this.over) return;
    if (killer) killer.kills = (killer.kills || 0) + 1;
    this.events.push({ type: 'kill', team: killer?.team || victim.team, victim, killer });
  }
  onDeath(a) { a.deaths = 1; this.score(a, a.lastHitBy || null); a.lastHitBy = null; }

  // what an AI does: get out of the ring's way, find a gun, then hunt
  goalFor(a) {
    if (this.over) return { pos: a.pos, mode: 'idle' };
    const d = dist2(a.pos, this.c), R = this.R;
    if (d > R * 0.8) {
      const k = (R * 0.45) / (d || 1);
      return { pos: [this.c[0] + (a.pos[0] - this.c[0]) * k, this.c[1], this.c[2] + (a.pos[2] - this.c[2]) * k], mode: 'ring', r: 2 };
    }
    if (!a.armed) {
      let best = null, bd = Infinity;
      for (const c of this.crates) if (!c.open && dist2(c.pos, this.c) < R * 0.9) { const dd = dist2(c.pos, a.pos); if (dd < bd) { bd = dd; best = c; } }
      if (best) return { pos: [...best.pos], mode: 'loot', r: 0.8 };
    }
    const intel = this.nearestIntel(a);
    if (intel) return { pos: [...intel.pos], mode: 'hunt', r: 2.5 };
    // nothing known: wander toward the middle of the ring
    const ang = Math.random() * Math.PI * 2, rr = Math.random() * R * 0.5;
    return { pos: [this.c[0] + Math.cos(ang) * rr, this.c[1], this.c[2] + Math.sin(ang) * rr], mode: 'sweep', r: 3 };
  }
  retreatGoal(a) { return this.goalFor(a); }

  update(dt, g) {
    if (!this.active) return;
    this.t += dt;
    this.R = this.ringRadius();
    const ph = this.ringPhase();
    for (const a of this.agents) if (a.alive && a.lastHitBy && a.hurtT === 0) this.spot(a.team, a.lastHitBy, a.lastHitBy.pos, false);
    for (const a of this.agents) a.update(dt, g);
    // the ring hurts
    for (const a of this.agents) if (a.alive && this.outside(a.pos)) { a.bot.hp -= ph.dps * dt; if (a.bot.hp <= 0) { a.bot.hp = 1; if (a.bot.damage(5, [0, 0, 0])) g.onBotKill?.({ name: 'THE RING' }, a); } }
    if (this.you.alive && this.outside(this.player.pos)) g.ringHurt?.(ph.dps * dt);
    if (this.over) return;
    const alive = this.entitiesAlive();
    if (!this.you.alive && !this.youDead) { this.youDead = true; this.you.deaths = 1; this.score(this.you, this.player.lastHitBy || null); this.place = alive.length + 1; }
    if (!this.you.alive || alive.length <= 1) {
      const winner = alive.length === 1 ? alive[0] : null;
      if (!this.place) this.place = 1;
      this.over = { winner: winner?.team || this.teams[0], standings: this.teams, place: this.place, won: winner === this.you };
      this.events.push({ type: 'end', winner: winner?.team || this.teams[0] });
    }
  }

  drawParts(g) {
    const out = super.drawParts();
    // crates, glowing in their rarity colour
    for (const c of this.crates || []) {
      if (c.open) continue;
      c.t += 0.016;
      const p = c.pos, col = c.loot.tier[1];
      out.push(box([p[0], p[1] + 0.32, p[2]], [0, 0, 0], [1.0, 0.64, 0.64], [0.2, 0.22, 0.18], { mat: 'paint' }));
      out.push(box([p[0], p[1] + 0.67, p[2]], [0, 0, 0], [1.04, 0.08, 0.68], col, { em: 0.5 + 0.3 * Math.sin(c.t * 3) }));
      for (const sx of [-1, 1]) out.push(box([p[0] + sx * 0.3, p[1] + 0.32, p[2] + 0.325], [0, 0, 0], [0.06, 0.5, 0.01], col, { em: 0.7 }));
      out.push(box([p[0], p[1] + 2.2, p[2]], [0, 0, 0], [0.05, 3.4, 0.05], col, { em: 1, alpha: 0.35 }));      // a beam to spot it from afar
    }
    // the ring: a wall of light
    const n = 72, R = this.R, h = 22;
    for (let i = 0; i < n; i++) {
      const a = (i + 0.5) / n * Math.PI * 2, w = 2 * R * Math.sin(Math.PI / n) + 0.05;
      out.push(box([this.c[0] + Math.cos(a) * R, this.c[1] + h / 2 - 1, this.c[2] + Math.sin(a) * R], [0, -a + Math.PI / 2, 0], [w, h, 0.04], [0.35, 0.55, 1], { em: 1, alpha: 0.16 }));
    }
    return out;
  }

  objective() {
    const alive = this.entitiesAlive().length, ph = this.ringPhase();
    const mm = (s) => `${Math.floor(s / 60)}:${String(Math.ceil(s) % 60).padStart(2, '0')}`;
    if (this.over) return { text: this.over.won ? 'VICTORY' : `#${this.over.place}`, col: this.over.won ? '#ffd04a' : '#ff5a3a', sub: this.over.won ? 'LAST ONE STANDING' : `${alive} LEFT` };
    return { text: `${alive} LEFT`, col: '#ffffff', sub: ph.next > 0 ? (ph.shrinking ? `RING CLOSING · ${mm(ph.next)}` : `RING CLOSES IN ${mm(ph.next)}`) : 'FINAL RING' };
  }
}

export { teamPalette, Bot, hex };
