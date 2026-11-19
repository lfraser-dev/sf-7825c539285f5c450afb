// DEAD AIR: the map. A ruined city on a grid of streets, an army outpost with the helipad at its south edge, and the
// hangar (where you fit upgrades) off to one side. Everything is boxes in its own World, so it never touches the
// Semi-Finals maps.
import { World, makeBox } from '../world.js';
import { compose } from '../math.js';

export const NB = 8, PITCH = 62, STREET = 16, HALF = (NB * PITCH) / 2;
export const BASE = [0, 0, HALF + 70];         // the outpost
export const HANGAR = [1600, 0, 0];             // the hangar (the helicopter stands here between missions)
export const streetX = (k) => -HALF + k * PITCH;  // street centre lines, k = 0..NB

// a little seeded random, so the city is the same every time (and for everyone)
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

const ASPH = [0.19, 0.19, 0.2], PAVE = [0.5, 0.49, 0.46], GRASS = [0.22, 0.3, 0.15], DIRT = [0.33, 0.29, 0.22];
const FACADES = [
  { tex: 13, col: [0.55, 0.32, 0.24] }, { tex: 13, col: [0.45, 0.28, 0.22] }, { tex: 6, col: [0.62, 0.6, 0.56] },
  { tex: 6, col: [0.45, 0.47, 0.5] }, { tex: 3, col: [0.55, 0.54, 0.5] }, { tex: 2, col: [0.4, 0.55, 0.62] }, { tex: 6, col: [0.7, 0.66, 0.58] },
];
const CARS = [[0.6, 0.1, 0.08], [0.15, 0.25, 0.5], [0.75, 0.75, 0.72], [0.12, 0.12, 0.13], [0.5, 0.48, 0.3], [0.2, 0.4, 0.3], [0.85, 0.7, 0.15]];

export function buildCity() {
  const world = new World(), R = rng(1337);
  const roofs = [], spawns = [], burning = [], lamps = [];
  const add = (min, max, o = {}) => world.add(makeBox(min, max, { grid: false, edges: false, ...o }));
  const at = (x, y, z, sx, sy, sz, o) => add([x - sx / 2, y, z - sz / 2], [x + sx / 2, y + sy, z + sz / 2], o);
  // a box turned by yaw about (cx, cz): collision uses the box's upright bounds, the picture is turned
  const rot = (cx, cy, cz, yaw, lx, ly, lz, sx, sy, sz, o = {}) => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const x = cx + lx * c + lz * s, z = cz - lx * s + lz * c;
    const ex = Math.abs(c) * sx + Math.abs(s) * sz, ez = Math.abs(s) * sx + Math.abs(c) * sz;
    const b = at(x, cy + ly, z, ex, sy, ez, o);
    b.scale = [sx, sy, sz];
    compose(b.model, b.center, [0, yaw, 0], b.scale);
    return b;
  };

  // ground, then the blocks
  add([-900, -1, -900], [900, 0, 900], { color: DIRT, tex: 7 });
  add([-HALF - 8, -0.98, -HALF - 8], [HALF + 8, 0.02, HALF + 8], { color: ASPH, tex: 7, noShadow: true });
  for (let k = 0; k <= NB; k++) {
    add([streetX(k) - 0.12, 0.02, -HALF], [streetX(k) + 0.12, 0.04, HALF], { color: [0.75, 0.62, 0.2], noShadow: true, solid: false });
    add([-HALF, 0.02, streetX(k) - 0.12], [HALF, 0.04, streetX(k) + 0.12], { color: [0.75, 0.62, 0.2], noShadow: true, solid: false });
  }
  const car = (x, z, yaw, burn) => {
    const col = burn ? [0.08, 0.07, 0.06] : CARS[Math.floor(R() * CARS.length)];
    rot(x, 0, z, yaw, 0, 0.35, 0, 1.9, 0.75, 4.3, { color: col, shape: 0.2, mat: 'paint' });
    rot(x, 0, z, yaw, 0, 1.1, 0.3, 1.7, 0.6, 2.1, { color: burn ? col : [0.1, 0.13, 0.16], shape: 0.15, mat: 'glass', solid: false });
    if (burn) burning.push([x, 1.2, z]);
  };

  for (let i = 0; i < NB; i++) for (let j = 0; j < NB; j++) {
    const x0 = streetX(i) + STREET / 2, x1 = streetX(i + 1) - STREET / 2, z0 = streetX(j) + STREET / 2, z1 = streetX(j + 1) - STREET / 2;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, W = x1 - x0;
    const centre = Math.abs(i - 3.5) + Math.abs(j - 3.5);
    const r = R();
    const kind = centre < 1.5 && r < 0.75 ? 'tower' : r < 0.12 ? 'park' : r < 0.22 ? 'lot' : r < 0.42 && centre < 4 ? 'tower' : 'mid';
    add([x0, 0, z0], [x1, 0.18, z1], { color: kind === 'park' ? GRASS : PAVE, tex: kind === 'park' ? 0 : 4 });
    const building = (bx, bz, sx, sz, h, roofOk = true) => {
      const f = FACADES[Math.floor(R() * FACADES.length)];
      const b = at(bx, 0.18, bz, sx, h, sz, { color: f.col, tex: f.tex });
      const top = 0.18 + h;
      // parapet round the roof
      const pc = f.col.map((v) => v * 0.8);
      at(bx, top, bz - sz / 2 + 0.2, sx, 0.7, 0.4, { color: pc, tex: 3 });
      at(bx, top, bz + sz / 2 - 0.2, sx, 0.7, 0.4, { color: pc, tex: 3 });
      at(bx - sx / 2 + 0.2, top, bz, 0.4, 0.7, sz - 0.8, { color: pc, tex: 3 });
      at(bx + sx / 2 - 0.2, top, bz, 0.4, 0.7, sz - 0.8, { color: pc, tex: 3 });
      // roof clutter, kept to the edges so there's room to land
      const nAc = 1 + Math.floor(R() * 3);
      for (let a = 0; a < nAc; a++) {
        const side = R() < 0.5 ? -1 : 1, along = (R() - 0.5) * 0.6;
        const ax = R() < 0.5 ? bx + side * (sx / 2 - 2.2) : bx + along * sx, az = ax === bx + side * (sx / 2 - 2.2) ? bz + along * sz : bz + side * (sz / 2 - 2.2);
        at(ax, top, az, 2.2, 1.3, 1.6, { color: [0.62, 0.62, 0.6], tex: 5, mat: 'metal' });
      }
      if (h > 22 && R() < 0.4) {
        const wx = bx + (sx / 2 - 3) * (R() < 0.5 ? -1 : 1), wz = bz + (sz / 2 - 3) * (R() < 0.5 ? -1 : 1);
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) at(wx + dx * 1.1, top, wz + dz * 1.1, 0.2, 2.6, 0.2, { color: [0.25, 0.2, 0.15] });
        at(wx, top + 2.6, wz, 3.2, 3, 3.2, { color: [0.42, 0.3, 0.2], shape: 'cylY', tex: 12 });
      }
      if (roofOk && h > 7 && h < 46 && sx >= 13 && sz >= 13) roofs.push({ box: b, top: top, x: bx, z: bz, sx, sz, h });
      return b;
    };
    if (kind === 'tower') {
      const s = W - 10 - R() * 6, h = 42 + R() * 34;
      building(cx, cz, s, s, h, false);
      // a helipad on top of some towers
      if (R() < 0.5) at(cx, 0.18 + h, cz, 10, 0.1, 10, { color: [0.2, 0.2, 0.22], solid: false });
      // plaza planters
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) at(cx + dx * (W / 2 - 2), 0.18, cz + dz * (W / 2 - 2), 2.4, 0.8, 2.4, { color: [0.4, 0.38, 0.35], tex: 3 });
    } else if (kind === 'mid') {
      const g = 3, hw = (W - g) / 2;
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        if (R() < 0.15) continue;           // an empty lot
        const sx = hw - R() * 4, sz = hw - R() * 4;
        const bx = cx + dx * (W / 2 - sx / 2), bz = cz + dz * (W / 2 - sz / 2);
        building(bx, bz, sx, sz, 9 + R() * 24);
      }
    } else if (kind === 'park') {
      for (let t = 0; t < 9; t++) {
        const tx = x0 + 4 + R() * (W - 8), tz = z0 + 4 + R() * (W - 8), th = 3 + R() * 2;
        at(tx, 0.18, tz, 0.5, th, 0.5, { color: [0.3, 0.22, 0.15], shape: 'cylY' });
        at(tx, 0.18 + th - 0.6, tz, 4 + R() * 2, 3.6 + R(), 4 + R() * 2, { color: [0.18 + R() * 0.08, 0.28 + R() * 0.08, 0.12], shape: 'sphere', solid: false });
      }
      at(cx, 0.18, cz, 3, 2.5, 3, { color: [0.6, 0.6, 0.58], tex: 3, shape: 'cylY' });
    } else {
      for (let c = 0; c < 6; c++) car(x0 + 5 + (c % 3) * 12, z0 + 10 + Math.floor(c / 3) * 22, (R() - 0.5) * 0.4, R() < 0.1);
      at(cx, 0.18, z1 - 3, W - 4, 3.5, 4, { color: [0.6, 0.58, 0.55], tex: 3 });
    }
    // street lamps on the block corners
    for (const [dx, dz] of [[x0 + 0.8, z0 + 0.8], [x1 - 0.8, z1 - 0.8]]) {
      at(dx, 0.18, dz, 0.2, 7, 0.2, { color: [0.2, 0.2, 0.22], mat: 'metal' });
      at(dx, 7.1, dz, 0.6, 0.25, 0.6, { color: [1, 0.85, 0.55], emissive: R() < 0.55 ? 0.9 : 0, noShadow: true });
      lamps.push([dx, 7, dz]);
    }
  }
  // wrecked and burning cars along the streets, and barricades
  for (let n = 0; n < 70; n++) {
    const k = Math.floor(R() * (NB + 1)), along = -HALF + 10 + R() * (2 * HALF - 20), alongX = R() < 0.5;
    const off = (R() - 0.5) * (STREET - 5);
    const x = alongX ? along : streetX(k) + off, z = alongX ? streetX(k) + off : along;
    car(x, z, (alongX ? Math.PI / 2 : 0) + (R() - 0.5) * 0.9, R() < 0.18);
  }
  for (let n = 0; n < 20; n++) {
    const k = 1 + Math.floor(R() * (NB - 1)), along = -HALF + 20 + R() * (2 * HALF - 40);
    const vert = R() < 0.5, x = vert ? streetX(k) + (R() - 0.5) * 8 : along, z = vert ? along : streetX(k) + (R() - 0.5) * 8;
    rot(x, 0, z, vert ? 0 : Math.PI / 2, 0, 0, 0, 3.2, 1.1, 0.6, { color: [0.62, 0.6, 0.56], tex: 3, shape: 0.12 });
  }
  // zombies come in from the far streets
  for (let k = 0; k <= NB; k++) for (let m = 0; m <= NB; m++) {
    const x = streetX(k), z = streetX(m);
    if (z > HALF - PITCH * 1.5 && Math.abs(x) < PITCH * 2) continue;     // not right next to the outpost
    spawns.push([x, z]);
  }

  // ---- the outpost
  const [bx, , bz] = BASE;
  add([bx - 62, 0, bz - 48], [bx + 62, 0.2, bz + 48], { color: [0.48, 0.47, 0.44], tex: 3 });
  const HESCO = [0.6, 0.55, 0.42];
  const wall = (x0, z0, x1, z1) => { add([Math.min(x0, x1) - 1, 0.2, Math.min(z0, z1) - 1], [Math.max(x0, x1) + 1, 2.6, Math.max(z0, z1) + 1], { color: HESCO, tex: 4 }); };
  wall(bx - 60, bz - 46, bx - 12, bz - 46); wall(bx + 12, bz - 46, bx + 60, bz - 46);      // north wall with a gate
  wall(bx - 60, bz + 46, bx + 60, bz + 46);
  wall(bx - 60, bz - 46, bx - 60, bz + 46); wall(bx + 60, bz - 46, bx + 60, bz + 46);
  // the helipad
  const PAD = [bx, bz + 6];
  const pad = add([PAD[0] - 12, 0.2, PAD[1] - 12], [PAD[0] + 12, 0.5, PAD[1] + 12], { color: [0.2, 0.2, 0.22], tex: 7, tag: 'pad' });
  add([PAD[0] - 11, 0.5, PAD[1] - 11], [PAD[0] + 11, 0.52, PAD[1] + 11], { color: [0.95, 0.75, 0.15], solid: false, noShadow: true });
  add([PAD[0] - 10.4, 0.5, PAD[1] - 10.4], [PAD[0] + 10.4, 0.54, PAD[1] + 10.4], { color: [0.2, 0.2, 0.22], solid: false, noShadow: true });
  add([PAD[0] - 4, 0.54, PAD[1] - 5], [PAD[0] - 2.6, 0.56, PAD[1] + 5], { color: [0.95, 0.95, 0.92], solid: false, noShadow: true });
  add([PAD[0] + 2.6, 0.54, PAD[1] - 5], [PAD[0] + 4, 0.56, PAD[1] + 5], { color: [0.95, 0.95, 0.92], solid: false, noShadow: true });
  add([PAD[0] - 2.6, 0.54, PAD[1] - 0.7], [PAD[0] + 2.6, 0.56, PAD[1] + 0.7], { color: [0.95, 0.95, 0.92], solid: false, noShadow: true });
  for (let a = 0; a < 16; a++) {
    const t = (a / 16) * Math.PI * 2;
    at(PAD[0] + Math.cos(t) * 12.6, 0.2, PAD[1] + Math.sin(t) * 12.6, 0.35, 0.3, 0.35, { color: [0.3, 1, 0.4], emissive: 1, noShadow: true, solid: false });
  }
  // tents, containers, fuel, towers
  for (const [x, z] of [[-40, 20], [-40, 0], [-40, -20], [40, 24]]) {
    at(bx + x, 0.2, bz + z, 9, 3.2, 14, { color: [0.3, 0.34, 0.22], shape: 0.5, mat: 'cloth' });
  }
  for (const [x, z, c] of [[36, -10, [0.5, 0.2, 0.15]], [36, -16, [0.2, 0.3, 0.45]], [46, -10, [0.35, 0.4, 0.3]]]) at(bx + x, 0.2, bz + z, 6, 2.6, 2.5, { color: c, tex: 5, mat: 'metal' });
  for (const x of [28, 34]) at(bx + x, 0.2, bz + 32, 4, 3.4, 4, { color: [0.6, 0.62, 0.6], shape: 'cylY', mat: 'paint' });
  const turrets = [];
  for (const x of [-22, 22]) {
    const tx = bx + x, tz = bz - 40;
    for (const [dx, dz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) at(tx + dx, 0.2, tz + dz, 0.3, 7, 0.3, { color: [0.3, 0.25, 0.18] });
    at(tx, 7.2, tz, 4, 0.3, 4, { color: [0.36, 0.3, 0.22] });
    at(tx, 7.5, tz - 1.9, 4, 1.1, 0.2, { color: HESCO, tex: 4 });
    turrets.push({ pos: [tx, 8.7, tz], yaw: 0, cd: 0, flash: 0 });
  }
  // jersey barriers outside the gate
  for (const x of [-16, -8, 8, 16]) at(bx + x, 0, bz - 54, 3.2, 1.1, 0.6, { color: [0.62, 0.6, 0.56], tex: 3, shape: 0.12 });

  // ---- the hangar (between missions)
  const [hx, , hz] = HANGAR;
  add([hx - 40, 0, hz - 40], [hx + 40, 0.1, hz + 40], { color: [0.36, 0.36, 0.38], tex: 3 });
  add([hx - 20, 0.1, hz - 20], [hx + 20, 0.12, hz + 20], { color: [0.22, 0.24, 0.26], noShadow: true, solid: false });
  add([hx - 21, 0.1, hz + 18], [hx + 21, 18, hz + 20], { color: [0.4, 0.42, 0.44], tex: 5, mat: 'metal' });
  add([hx - 21, 0.1, hz - 22], [hx - 19, 18, hz + 20], { color: [0.4, 0.42, 0.44], tex: 5, mat: 'metal' });
  add([hx + 19, 0.1, hz - 22], [hx + 21, 18, hz + 20], { color: [0.4, 0.42, 0.44], tex: 5, mat: 'metal' });
  // roof trusses (open between, so the sun gets in)
  for (const z of [-16, -6, 4, 14]) add([hx - 21, 17, hz + z - 0.4], [hx + 21, 18, hz + z + 0.4], { color: [0.3, 0.31, 0.33], mat: 'metal' });
  for (const x of [-12, 0, 12]) add([hx + x - 0.4, 16.6, hz - 20], [hx + x + 0.4, 17, hz + 18], { color: [1, 0.96, 0.85], emissive: 1, noShadow: true, solid: false });
  for (let s = 0; s < 4; s++) at(hx - 16 + s * 2.4, 0.1, hz + 16, 2, 1.2, 1.6, { color: [0.55, 0.42, 0.22], tex: 12 });
  at(hx + 15, 0.1, hz + 14, 3, 1.1, 1.2, { color: [0.75, 0.15, 0.1], mat: 'paint', shape: 0.08 });
  at(hx + 15, 1.2, hz + 14, 3, 0.9, 1.2, { color: [0.6, 0.1, 0.08], mat: 'paint', shape: 0.08 });
  at(hx - 15, 0.1, hz - 8, 1.4, 1.6, 1.4, { color: [0.2, 0.3, 0.6], shape: 'cylY', mat: 'paint' });
  // hazard edge on the pad
  for (let s = -9; s <= 9; s++) for (const zz of [-19.6, 19.6]) at(hx + s * 2, 0.12, hz + zz, 1, 0.02, 0.4, { color: s % 2 ? [0.95, 0.75, 0.1] : [0.08, 0.08, 0.08], noShadow: true, solid: false });

  return { world, roofs, spawns, burning, lamps, turrets, pad, padAt: [PAD[0], 0.5, PAD[1]] };
}
