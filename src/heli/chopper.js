// DEAD AIR: the helicopter. Its model (built from the fitted upgrades, so every upgrade shows) and its flight.
//
// Flying works like the helicopters in Battlefield 2042:
//   W / S      collective: more or less lift from the rotor (let go to hover, with FLIGHT ASSIST on)
//   A / D      yaw: turn the nose left / right on the spot (tail rotor)
//   mouse      pitch (up / down) and roll (left / right). Tilt the helicopter to fly that way.
//   arrows     pitch and roll too, for trackpads
// FLIGHT ASSIST (on by default) levels you out when you let go of the mouse, holds your height and keeps your speed
// when you tip forward. Turn it off in the hangar for full control.
// Local frame: -Z forward, +Y up, +X right. Body rates: w[0] pitch (+ = nose up), w[1] yaw (+ = left), w[2] roll (+ = left).
import { compose, mul, mat4, clamp, damp } from '../math.js';

// ---------------------------------------------------------------- quaternions
export const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
export function qrot(q, v) {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}
export const qaxis = (ax, a) => { const s = Math.sin(a / 2); return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(a / 2)]; };
const qnorm = (q) => { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return q.map((v) => v / l); };
export function qmat(out, q, p) {
  const [x, y, z, w] = q;
  out[0] = 1 - 2 * (y * y + z * z); out[1] = 2 * (x * y + z * w); out[2] = 2 * (x * z - y * w); out[3] = 0;
  out[4] = 2 * (x * y - z * w); out[5] = 1 - 2 * (x * x + z * z); out[6] = 2 * (y * z + x * w); out[7] = 0;
  out[8] = 2 * (x * z + y * w); out[9] = 2 * (y * z - x * w); out[10] = 1 - 2 * (x * x + y * y); out[11] = 0;
  out[12] = p[0]; out[13] = p[1]; out[14] = p[2]; out[15] = 1;
  return out;
}

// ---------------------------------------------------------------- the model
const DARK = [0.05, 0.05, 0.06], GLASS = [0.1, 0.15, 0.19], STEEL = [0.32, 0.33, 0.35], GUNM = [0.13, 0.13, 0.14], PLATE = [0.27, 0.28, 0.29];
const SKIN = [[0.86, 0.68, 0.55], [0.6, 0.42, 0.3], [0.42, 0.29, 0.2], [0.95, 0.8, 0.68]];
const SHIRTS = [[0.7, 0.2, 0.2], [0.2, 0.4, 0.75], [0.85, 0.75, 0.3], [0.3, 0.6, 0.35], [0.85, 0.85, 0.85], [0.55, 0.3, 0.6]];
const backOut = (t) => { t = clamp(t, 0, 1); const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

// rotor sizes per rotor tier: [blades, radius, hub height]
export const ROTOR = [[4, 6.4, 2.25], [5, 7.1, 2.25], [4, 6.2, 2.1]];

// st: { rotorA, tailA, rpm, spin, t, install: {slot: 0..1}, riders, rockets (left), rocketMax, bombs, bombMax,
//       boost (0..1), doorAim: [[yaw, pitch], [yaw, pitch]], flash }
export function chopperParts(eq, paint, st, H) {
  const out = [], loc = mat4();
  const body = paint.body, trim = paint.trim, pm = paint.mat || 'paint', glow = paint.glow;
  const add = (slot, p, r, s, col, o = {}) => {
    let k = 1;
    if (slot && st.install && st.install[slot] != null && st.install[slot] < 1) {
      const t = st.install[slot];
      k = backOut(t);
      p = [p[0], p[1] + (1 - clamp(t * 1.4, 0, 1)) * 1.6, p[2]];
    }
    if (k <= 0.001) return;
    const sc = [s[0] * k, s[1] * k, s[2] * k];
    compose(loc, p, r, sc);
    const m = new Float32Array(16);
    mul(m, H, loc);
    out.push({ model: m, scale: sc, color: col, emissive: o.em || 0, shape: o.shape, mat: o.mat, alpha: o.alpha, edges: o.edges ?? 0 });
  };
  const B = (p, s, col = body, o = {}) => add(null, p, o.r || [0, 0, 0], s, col, { mat: pm, shape: 0.06, ...o });

  // ---- fuselage
  B([0, 0, 0.2], [2.3, 2.1, 3.8], body, { shape: 0.5 });
  B([0, -0.25, -2.5], [2.0, 1.55, 1.9], body, { shape: 0.55 });
  B([0, -0.45, -3.42], [1.35, 0.95, 0.8], body, { shape: 0.4 });
  B([0, 0.32, -2.3], [1.92, 1.05, 1.75], GLASS, { shape: 0.42, mat: 'glass' });
  B([0, 0.02, -3.12], [1.45, 0.72, 0.62], GLASS, { shape: 0.3, mat: 'glass', r: [0.55, 0, 0] });
  B([0, -1.12, 0.2], [1.95, 0.3, 3.5], trim, { shape: 0.12 });
  B([0, 1.34, 0.6], [1.6, 0.72, 2.9], body, { shape: 0.3 });
  for (const x of [-0.72, 0.72]) B([x, 1.36, -0.55], [0.32, 0.42, 0.5], DARK, { shape: 0.1, mat: 'metal' });
  // doors and side windows
  for (const x of [-1.165, 1.165]) {
    B([x, 0.02, 0.75], [0.04, 1.35, 1.65], DARK, { shape: undefined, mat: 'metal' });
    B([x, 0.48, -0.75], [0.04, 0.45, 0.6], GLASS, { shape: undefined, mat: 'glass' });
  }
  // tail
  B([0, 0.42, 3.3], [0.9, 0.9, 2.6], body, { shape: 0.35 });
  B([0, 0.5, 6.0], [0.6, 0.6, 3.2], body, { shape: 0.25 });
  B([0, 1.35, 7.85], [0.16, 2.1, 1.25], body, { r: [-0.35, 0, 0], shape: 0.06 });
  B([0, 0.52, 7.0], [2.6, 0.1, 0.62], trim, { shape: 0.04 });
  B([0.2, 2.0, 8.2], [0.22, 0.22, 0.22], STEEL, { shape: 'sphere', mat: 'steel' });
  for (let i = 0; i < 2; i++) B([0.3, 2.0, 8.2], [0.06, 1.7, 0.2], DARK, { r: [st.tailA + i * Math.PI / 2, 0, 0], shape: undefined, mat: 'metal' });
  if (st.rpm > 0.4) B([0.31, 2.0, 8.2], [1.72, 1.72, 0.03], [0.2, 0.2, 0.2], { shape: 'cyl', r: [0, Math.PI / 2, 0], alpha: 0.12 * st.rpm });
  // skids
  for (const x of [-1.25, 1.25]) {
    B([x, -1.85, 0.25], [0.14, 0.14, 4.8], GUNM, { shape: 'cyl', mat: 'metal' });
    B([x, -1.72, -2.3], [0.14, 0.14, 0.55], GUNM, { shape: 'cyl', mat: 'metal', r: [-0.7, 0, 0] });
    for (const z of [-1.0, 1.4]) B([x * 0.86, -1.5, z], [0.1, 0.78, 0.1], GUNM, { r: [0, 0, x > 0 ? 0.4 : -0.4], shape: 0.03, mat: 'metal' });
  }
  // nav lights: red on the left, green on the right, a white strobe on the tail
  const wingX = eq.rockets || eq.bombs ? 2.35 : 1.2;
  B([-wingX, -0.33, 0.5], [0.12, 0.12, 0.12], [1, 0.1, 0.05], { em: 1, shape: 'sphere' });
  B([wingX, -0.33, 0.5], [0.12, 0.12, 0.12], [0.1, 1, 0.2], { em: 1, shape: 'sphere' });
  B([0, 2.45, 8.25], [0.12, 0.12, 0.12], [1, 1, 1], { em: (st.t * 1.2) % 1 < 0.08 ? 1 : 0.1, shape: 'sphere' });
  // stub wings carry pods and bombs
  if (eq.rockets || eq.bombs) add(eq.rockets ? 'rockets' : 'bombs', [0, -0.35, 0.5], [0, 0, 0], [4.5, 0.16, 0.9], trim, { mat: pm, shape: 0.05 });

  // ---- paint patterns
  if (paint.stripe) {
    for (const z of [4.4, 5.6, 6.8]) B([0, z < 5 ? 0.45 : 0.5, z], [z < 5 ? 0.92 : 0.62, z < 5 ? 0.92 : 0.62, 0.32], paint.stripe, { shape: 0.2, em: glow ? 0.8 : 0 });
    for (const x of [-1.17, 1.17]) B([x, -0.62, 0.2], [0.03, 0.16, 3.6], paint.stripe, { shape: undefined, em: glow ? 0.9 : 0 });
  }
  if (paint.shark) {
    for (const x of [-1, 1]) {
      B([x * 0.92, -0.62, -2.95], [0.04, 0.42, 1.2], [0.6, 0.06, 0.08], { r: [0, x * 0.32, 0], shape: undefined });
      for (let i = 0; i < 5; i++) B([x * (0.93 - i * 0.04), -0.5 - (i % 2) * 0.03, -3.4 + i * 0.22], [0.05, 0.16, 0.16], [0.96, 0.96, 0.94], { r: [0, x * 0.32, 0.785], shape: undefined });
      B([x * 0.96, -0.15, -2.6], [0.04, 0.2, 0.2], [0.95, 0.95, 0.95], { shape: 'sphere' });
    }
  }

  // ---- engine
  const en = eq.engine;
  const exS = [0.38, 0.5, 0.5, 0.6][en], exL = [0.5, 0.8, 0.8, 1.0][en];
  const hot = en >= 1 ? 0.35 + (st.rpm || 0) * 0.3 : 0;
  for (const x of [-0.55, 0.55]) {
    add('engine', [x, 1.45, 2.1], [0, 0, 0], [exS, exS, exL], GUNM, { mat: 'metal', shape: 'cyl' });
    if (en >= 1) add('engine', [x, 1.45, 2.1 + exL / 2 + 0.01], [0, 0, 0], [exS * 0.7, exS * 0.7, 0.03], [1, 0.45, 0.12], { em: hot, shape: 'cyl' });
  }
  if (en >= 2) for (const x of [-1.0, 1.0]) {
    add('engine', [x, 1.32, 0.9], [0, 0, 0], [0.72, 0.72, 2.3], body, { mat: pm, shape: 'cyl' });
    add('engine', [x, 1.32, -0.28], [0, 0, 0], [0.6, 0.6, 0.06], DARK, { shape: 'cyl' });
    add('engine', [x, 1.32, 2.1], [0, 0, 0], [0.55, 0.55, 0.3], GUNM, { mat: 'metal', shape: 'cyl' });
  }
  if (en === 3) for (const x of [-1.0, 1.0]) {
    const b = st.boost || 0;
    add('engine', [x, 1.32, 2.35], [0, 0, 0], [0.62, 0.62, 0.22], STEEL, { mat: 'steel', shape: 'cyl' });
    add('engine', [x, 1.32, 2.47], [0, 0, 0], [0.42, 0.42, 0.03], b > 0.05 ? [0.55, 0.8, 1] : [1, 0.5, 0.15], { em: 0.4 + b * 0.6, shape: 'cyl' });
    if (b > 0.05) add(null, [x, 1.32, 2.5 + b * 1.4], [0, 0, 0], [0.4, 0.4, b * 2.8], [0.5, 0.75, 1], { em: 1, shape: 'cyl', alpha: 0.5 });
  }

  // ---- rotor
  const [nb, R, hy] = ROTOR[eq.rotor];
  const coax = eq.rotor === 2;
  add('rotor', [0, 1.9, 0.3], [0, 0, 0], [0.3, coax ? 0.9 : 0.5, 0.3], STEEL, { mat: 'steel', shape: 'cylY' });
  const rotorAt = (y, a0, dir) => {
    add('rotor', [0, y, 0.3], [0, a0 * dir, 0], [0.75, 0.24, 0.75], GUNM, { mat: 'metal', shape: 'cylY' });
    for (let i = 0; i < nb; i++) {
      const a = a0 * dir + (i * Math.PI * 2) / nb;
      add('rotor', [-Math.sin(a) * R / 2, y + 0.04, 0.3 - Math.cos(a) * R / 2], [0.0, a, 0.05], [0.42, 0.07, R], DARK, { mat: 'metal', shape: 0.03 });
      add('rotor', [-Math.sin(a) * (R - 0.2), y + 0.05, 0.3 - Math.cos(a) * (R - 0.2)], [0, a, 0], [0.43, 0.075, 0.4], paint.stripe || [0.9, 0.8, 0.2], { shape: undefined, em: glow ? 0.8 : 0 });
    }
    if (st.rpm > 0.35) add(null, [0, y + 0.04, 0.3], [0, 0, 0], [R * 2, 0.03, R * 2], [0.15, 0.15, 0.15], { shape: 'cylY', alpha: 0.1 * st.rpm });
  };
  rotorAt(hy, st.rotorA, 1);
  if (coax) rotorAt(hy + 0.6, st.rotorA, -1);

  // ---- nose gun
  const g = eq.gun, spin = st.spin || 0;
  add('gun', [0, -1.0, -3.0], [0, 0, 0], [0.7, 0.6, 0.7], trim, { mat: 'metal', shape: 'sphere' });
  const barrelsAt = (x) => {
    if (g === 0) {
      add('gun', [x, -1.05, -3.35], [0, 0, 0], [0.32, 0.32, 0.7], GUNM, { mat: 'metal', shape: 0.05 });
      add('gun', [x, -1.05, -4.1], [0, 0, 0], [0.13, 0.13, 1.5], GUNM, { mat: 'metal', shape: 'cyl' });
      add('gun', [x, -1.05, -4.85], [0, 0, 0], [0.2, 0.2, 0.18], GUNM, { mat: 'metal', shape: 'cyl' });
    } else if (g <= 2) {
      add('gun', [x, -1.05, -3.35], [0, 0, 0], [0.4, 0.4, 0.75], GUNM, { mat: 'metal', shape: 0.06 });
      for (let i = 0; i < 6; i++) {
        const a = spin + (i * Math.PI) / 3;
        add('gun', [x + Math.cos(a) * 0.1, -1.05 + Math.sin(a) * 0.1, -4.15], [0, 0, 0], [0.055, 0.055, 1.6], STEEL, { mat: 'steel', shape: 'cyl' });
      }
      for (const z of [-3.85, -4.85]) add('gun', [x, -1.05, z], [0, 0, spin], [0.32, 0.32, 0.07], GUNM, { mat: 'metal', shape: 'cyl' });
    } else {
      const pulse = 0.55 + 0.45 * Math.sin(st.t * 6);
      add('gun', [x, -1.05, -3.4], [0, 0, 0], [0.46, 0.46, 0.8], GUNM, { mat: 'metal', shape: 0.08 });
      add('gun', [x, -1.05, -4.15], [0, 0, 0], [0.26, 0.26, 1.5], [0.08, 0.09, 0.1], { mat: 'metal', shape: 'cyl' });
      for (const z of [-3.75, -4.15, -4.55]) add('gun', [x, -1.05, z], [0, 0, 0], [0.4, 0.4, 0.08], [0.3, 0.9, 1], { em: pulse, shape: 'cyl' });
      add('gun', [x, -1.05, -4.95], [0, 0, 0], [0.3, 0.3, 0.3], [0.5, 0.95, 1], { em: 1, shape: 'sphere', alpha: 0.8 });
    }
  };
  if (g === 2) { add('gun', [0, -1.0, -3.2], [0, 0, 0], [1.25, 0.28, 0.55], GUNM, { mat: 'metal', shape: 0.06 }); barrelsAt(-0.42); barrelsAt(0.42); } else barrelsAt(0);
  if (st.flash > 0) for (const x of g === 2 ? [-0.42, 0.42] : [0]) add(null, [x, -1.05, -5.1], [0, 0, st.t * 40], [0.45, 0.45, 0.6], g === 3 ? [0.5, 0.95, 1] : [1, 0.8, 0.4], { em: 1, shape: 'sphere', alpha: 0.85 });

  // ---- rockets
  const rk = eq.rockets;
  if (rk === 1 || rk === 2) {
    const xs = rk === 1 ? [-1.75, 1.75] : [-1.35, 1.35, -2.15, 2.15];
    const show = st.rocketMax ? st.rockets / st.rocketMax : 1;
    xs.forEach((x, j) => {
      add('rockets', [x, -0.66, 0.45], [0, 0, 0], [0.58, 0.58, 1.75], trim, { mat: 'metal', shape: 'cyl' });
      add('rockets', [x, -0.66, -0.43], [0, 0, 0], [0.5, 0.5, 0.04], DARK, { shape: 'cyl' });
      add('rockets', [x, -0.66, 0.45], [0, 0, 0], [0.6, 0.6, 0.12], paint.stripe || [0.7, 0.62, 0.2], { shape: 'cyl' });
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + 0.785;
        if (show <= (j * 4 + i) / (xs.length * 4)) continue;
        add('rockets', [x + Math.cos(a) * 0.15, -0.66 + Math.sin(a) * 0.15, -0.44], [0, 0, 0], [0.1, 0.1, 0.1], [0.85, 0.15, 0.1], { shape: 'sphere' });
      }
    });
  } else if (rk === 3) {
    const show = st.rocketMax ? Math.ceil((st.rockets / st.rocketMax) * 4) : 4;
    [[-1.5, 0], [1.5, 1], [-2.15, 2], [2.15, 3]].forEach(([x, i]) => {
      add('rockets', [x, -0.5, 0.5], [0, 0, 0], [0.12, 0.18, 1.7], GUNM, { mat: 'metal', shape: 0.03 });
      if (i >= show) return;
      add('rockets', [x, -0.75, 0.45], [0, 0, 0], [0.24, 0.24, 1.7], [0.82, 0.82, 0.78], { mat: 'paint', shape: 'cyl' });
      add('rockets', [x, -0.75, -0.48], [0, 0, 0], [0.24, 0.24, 0.32], [0.85, 0.12, 0.1], { shape: 'sphere' });
      for (const r of [0, Math.PI / 2]) add('rockets', [x, -0.75, 1.15], [0, 0, r], [0.5, 0.04, 0.3], GUNM, { shape: undefined });
    });
  }

  // ---- bombs
  if (eq.bombs) {
    const show = st.bombMax ? st.bombs : 4;
    add('bombs', [0, -1.38, 0.4], [0, 0, 0], [1.3, 0.1, 1.8], GUNM, { mat: 'metal', shape: 0.03 });
    [[-0.42, -0.1], [0.42, -0.1], [-0.42, 0.95], [0.42, 0.95]].forEach(([x, z], i) => {
      if (i >= show) return;
      if (eq.bombs === 1) {
        add('bombs', [x, -1.62, z], [0, 0, 0], [0.4, 0.4, 0.95], [0.3, 0.32, 0.25], { mat: 'paint', shape: 'sphere' });
        add('bombs', [x, -1.62, z], [0, 0, 0], [0.42, 0.42, 0.1], [0.9, 0.3, 0.08], { shape: 'cyl' });
      } else {
        add('bombs', [x, -1.62, z], [0, 0, 0], [0.38, 0.38, 0.9], [0.3, 0.3, 0.3], { mat: 'metal', shape: 'cyl' });
        for (const dz of [-0.3, 0.3]) add('bombs', [x, -1.62, z + dz], [0, 0, 0], [0.4, 0.4, 0.08], [0.95, 0.8, 0.1], { shape: 'cyl' });
      }
    });
  }

  // ---- armour
  const ar = eq.armor;
  if (ar >= 1) {
    const th = ar >= 2 ? 0.14 : 0.08;
    for (const x of [-1, 1]) {
      add('armor', [x * (1.2 + th / 2), -0.2, -0.3], [0, 0, 0], [th, 1.1, 1.4], PLATE, { mat: 'metal', shape: 0.03 });
      add('armor', [x * (1.2 + th / 2), -0.62, 1.4], [0, 0, 0], [th, 0.5, 1.8], PLATE, { mat: 'metal', shape: 0.03 });
      for (const z of [-0.85, 0.25]) for (const y of [-0.6, 0.2]) add('armor', [x * (1.21 + th), y, z], [0, 0, 0], [0.05, 0.07, 0.07], STEEL, { mat: 'steel', shape: 'sphere' });
    }
    add('armor', [0, -0.55, -3.5], [0.35, 0, 0], [1.3, 0.55, 0.1], PLATE, { mat: 'metal', shape: 0.03 });
  }
  if (ar >= 2) {
    for (const x of [-0.45, 0, 0.45]) add('armor', [x, 0.06, -3.2], [0.55, 0, 0], [0.06, 0.95, 0.06], GUNM, { mat: 'metal', shape: 'cyl' });
    add('armor', [0, 0.32, -3.0], [0.55, 0, 0], [1.4, 0.06, 0.06], GUNM, { mat: 'metal', shape: 'cyl' });
    add('armor', [0, 1.75, 0.6], [0, 0, 0], [1.5, 0.1, 2.4], PLATE, { mat: 'metal', shape: 0.03 });
    add('armor', [0, -1.3, 0.2], [0, 0, 0], [1.8, 0.12, 3.0], PLATE, { mat: 'metal', shape: 0.03 });
  }
  if (ar >= 3) {
    add('armor', [0, -0.85, -4.0], [-0.35, 0, 0], [1.7, 0.14, 1.1], PLATE, { mat: 'metal', shape: 0.03 });
    for (const x of [-0.6, -0.2, 0.2, 0.6]) add('armor', [x, -0.95, -4.55], [0, 0.785, 0], [0.18, 0.18, 0.18], STEEL, { mat: 'steel', shape: undefined });
    for (const z of [3.0, 4.6, 6.2]) add('armor', [0, z < 4 ? 0.42 : 0.5, z], [0, 0, 0], [z < 4 ? 1.0 : 0.72, z < 4 ? 1.0 : 0.72, 0.22], PLATE, { mat: 'metal', shape: 0.1 });
    for (const x of [-1.25, 1.25]) add('armor', [x, -1.6, 0.25], [0, 0, 0], [0.08, 0.35, 3.4], PLATE, { mat: 'metal', shape: 0.02 });
  }

  // ---- cabin: side pods for 12 seats, and the survivors you're carrying
  if (eq.cabin === 2) for (const x of [-1, 1]) {
    add('cabin', [x * 1.55, -0.6, 0.9], [0, 0, 0], [0.75, 0.95, 2.4], body, { mat: pm, shape: 0.3 });
    add('cabin', [x * 1.93, -0.4, 0.9], [0, 0, 0], [0.04, 0.3, 1.6], GLASS, { mat: 'glass' });
  }
  const seats = [[0.7, -0.4, 0.2], [-0.7, -0.4, 0.2], [0.7, -0.4, 1.2], [-0.7, -0.4, 1.2], [0.3, -0.4, 0.7], [-0.3, -0.4, 0.7], [0.7, -0.4, -0.5], [-0.7, -0.4, -0.5], [1.55, -0.5, 0.4], [-1.55, -0.5, 0.4], [1.55, -0.5, 1.4], [-1.55, -0.5, 1.4]];
  for (let i = 0; i < Math.min(st.riders || 0, seats.length); i++) {
    const [x, y, z] = seats[i];
    B([x, y, z], [0.42, 0.55, 0.35], SHIRTS[i % SHIRTS.length], { shape: 0.08, mat: 'cloth' });
    B([x, y + 0.45, z], [0.26, 0.28, 0.26], SKIN[i % SKIN.length], { shape: 'sphere', mat: 'skin' });
  }

  // ---- door gunners (they turn their guns to shoot)
  for (let sd = 0; sd < eq.door; sd++) {
    const x = sd === 0 ? 1 : -1, aim = (st.doorAim && st.doorAim[sd]) || [x > 0 ? -Math.PI / 2 : Math.PI / 2, -0.3];
    add('door', [x * 0.75, -0.35, 0.65], [0, 0, 0], [0.5, 0.65, 0.45], [0.3, 0.34, 0.24], { mat: 'cloth', shape: 0.1 });
    add('door', [x * 0.75, 0.15, 0.65], [0, 0, 0], [0.32, 0.32, 0.34], [0.86, 0.68, 0.55], { mat: 'skin', shape: 'sphere' });
    add('door', [x * 0.75, 0.26, 0.65], [0, 0, 0], [0.38, 0.22, 0.4], [0.25, 0.3, 0.2], { shape: 'sphere' });
    add('door', [x * 1.25, -0.3, 0.6], [0, 0, 0], [0.08, 0.7, 0.08], GUNM, { mat: 'metal', shape: 'cylY' });
    const [yw, pt] = aim, d = [-Math.sin(yw) * Math.cos(pt), Math.sin(pt), -Math.cos(yw) * Math.cos(pt)];
    add('door', [x * 1.25 + d[0] * 0.5, 0.1 + d[1] * 0.5, 0.6 + d[2] * 0.5], [pt, yw, 0], [0.14, 0.16, 1.1], GUNM, { mat: 'metal', shape: 0.03 });
    add('door', [x * 1.25 + d[0] * 1.15, 0.1 + d[1] * 1.15, 0.6 + d[2] * 1.15], [pt, yw, 0], [0.06, 0.06, 0.5], STEEL, { mat: 'steel', shape: 'cyl' });
    if (st.doorFlash && st.doorFlash[sd] > 0) add(null, [x * 1.25 + d[0] * 1.5, 0.1 + d[1] * 1.5, 0.6 + d[2] * 1.5], [0, 0, 0], [0.3, 0.3, 0.3], [1, 0.8, 0.4], { em: 1, shape: 'sphere', alpha: 0.85 });
  }
  return out;
}

// ---------------------------------------------------------------- flight
const G = 9.8;
// collision spheres in the local frame: [x, y, z, radius]
const BODY = [[0, 0, 0.2, 1.35], [0, -0.3, -2.8, 1.0], [0, 0.45, 3.6, 0.55], [0, 0.5, 6.2, 0.45], [0, 1.3, 7.9, 0.6], [0, 1.4, 0.6, 0.8]];
const SKIDS = [[-1.25, -1.92, -1.9], [1.25, -1.92, -1.9], [-1.25, -1.92, 2.4], [1.25, -1.92, 2.4]];

export class Chopper {
  constructor() { this.reset([0, 0, 0], 0, {}); }

  reset(pos, yaw, stats) {
    this.pos = [...pos];
    this.vel = [0, 0, 0];
    this.q = qaxis([0, 1, 0], yaw);
    this.w = [0, 0, 0];
    this.rpm = 0;
    this.rotorA = 0; this.tailA = 0;
    this.stats = stats;
    this.landed = null;     // the box it's sitting on
    this.contacts = 0;
    this.boostT = 1;        // afterburner fuel
    this.boost = 0;
    this.stickP = 0; this.stickR = 0;
    this.dead = false;
    this.spinOut = 0;
    this.extraMass = 0;      // zombies hanging off the skids
    this.events = [];
    this.H = mat4();
    this.m = mat4();
    qmat(this.H, this.q, this.pos);
  }

  get fwd() { return qrot(this.q, [0, 0, -1]); }
  get up() { return qrot(this.q, [0, 1, 0]); }
  get right() { return qrot(this.q, [1, 0, 0]); }
  toWorld(p) { const r = qrot(this.q, p); return [r[0] + this.pos[0], r[1] + this.pos[1], r[2] + this.pos[2]]; }
  get pitch() { return Math.asin(clamp(this.fwd[1], -1, 1)); }
  get rollL() { return Math.asin(clamp(this.right[1], -1, 1)); }
  get heading() { const f = this.fwd; return Math.atan2(-f[0], -f[2]); }

  // ctl: { coll -1..1, yaw -1..1 (+ = left), mx, my (mouse pixels), pk, rk (keys -1..1), boost, assist, sens, invert }
  step(dt, ctl, world) {
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) this.sub(h, ctl, world, i === 0);
    qmat(this.H, this.q, this.pos);
  }

  sub(dt, ctl, world, first) {
    const S = this.stats, ag = S.agility || 1;
    const assist = ctl.assist;
    // rotor spin
    const want = this.dead ? 0.55 : ctl.engineOn ? 1 : 0;
    this.rpm += (want - this.rpm) * damp(this.dead ? 0.6 : 0.9, dt);
    this.rotorA += this.rpm * 26 * dt; this.tailA += this.rpm * 70 * dt;

    // --- rotation
    // FLIGHT ASSIST: the mouse moves a "stick" that sets how far to tip (pitch) and lean (roll); the helicopter tips to
    // match and holds it. Roll eases back to level when you stop moving the mouse. Without assist the mouse sets the
    // turn rate directly, like Battlefield (and nothing levels you out).
    // Mouse forward = nose down (fly forward), like a joystick. INVERT MOUSE flips that.
    const w = this.w;
    const inv = ctl.invert ? -1 : 1, pitch = this.pitch, roll = this.rollL;
    if (assist) {
      if (first) {
        const k = 0.0022 * (ctl.sens || 1);
        this.stickP = clamp((this.stickP || 0) + ctl.my * k * inv, -0.75, 0.6);
        this.stickR = clamp((this.stickR || 0) - ctl.mx * k, -0.95, 0.95);
      }
      this.stickP = clamp(this.stickP + ctl.pk * 1.1 * dt, -0.75, 0.6);
      this.stickR = clamp(this.stickR - ctl.rk * 1.6 * dt, -0.95, 0.95);
      this.stickR *= Math.exp(-(ctl.mx || ctl.rk ? 0.3 : 1.4) * dt);
      this.stickP *= Math.exp(-0.08 * dt);
      if (this.dead) { this.stickP = 0.1; this.stickR = 0.3; }
      const tp = (this.stickP - pitch) * 4.5 * ag, tr = (this.stickR - roll) * 4.5 * ag;
      w[0] += (tp - w[0]) * damp(9, dt);
      w[2] += (tr - w[2]) * damp(9, dt);
    } else {
      if (first) {
        const k = 0.0058 * (ctl.sens || 1) * ag;
        w[0] += ctl.my * k * inv;
        w[2] -= ctl.mx * k;
      }
      w[0] += ctl.pk * 3.2 * ag * dt;
      w[2] -= ctl.rk * 3.2 * ag * dt;
      w[0] -= pitch * 0.6 * dt; w[2] -= roll * 0.6 * dt;
      const dmp = Math.exp(-3.4 * dt);
      w[0] *= dmp; w[2] *= dmp;
      this.stickP = pitch; this.stickR = roll;
    }
    const hs = Math.hypot(this.vel[0], this.vel[2]);
    const yawT = ctl.yaw * 1.7 * ag + roll * 1.5 * clamp(hs / 22, 0, 1) * (assist ? 1 : 0.6) + (this.dead ? 3.2 : 0);
    w[1] += (yawT - w[1]) * damp(3.8, dt);
    w[0] = clamp(w[0], -3, 3); w[2] = clamp(w[2], -3.5, 3.5);
    const wl = Math.hypot(w[0], w[1], w[2]);
    if (wl > 1e-6) this.q = qnorm(qmul(this.q, qaxis([w[0] / wl, w[1] / wl, w[2] / wl], wl * dt)));

    // --- forces
    const up = this.up, lr = (S.lift || 1) / (S.mass || 1);
    // hover is always 1 g; the engine and weight decide how hard you can climb. Zombies on the skids drag you down.
    let c = ctl.coll;
    if (assist && Math.abs(c) < 0.1) c = clamp(-this.vel[1] * 0.38, -0.45, 0.45);       // hold height
    const comp = assist ? 1 / Math.max(0.62, up[1]) : 1 / Math.max(0.85, up[1]) * 0.35 + 0.65;
    const T = G * this.rpm * this.rpm * comp * (this.dead ? 0.55 : Math.max(0, 1 - this.extraMass + 0.85 * c * lr));
    const a = [up[0] * T, up[1] * T - G, up[2] * T];
    // afterburner
    this.boost += ((ctl.boost && S.boost && this.boostT > 0 && !this.dead ? 1 : 0) - this.boost) * damp(6, dt);
    if (this.boost > 0.05) {
      const f = this.fwd, fl = Math.hypot(f[0], f[2]) || 1;
      a[0] += (f[0] / fl) * 22 * this.boost; a[2] += (f[2] / fl) * 22 * this.boost;
      this.boostT = Math.max(0, this.boostT - dt * 0.28 * this.boost);
    } else this.boostT = Math.min(1, this.boostT + dt * 0.12);
    // drag: a little linear, mostly quadratic (sets the top speed), and the rotor damps going up and down
    const v = this.vel, sp = Math.hypot(v[0], v[1], v[2]);
    const kq = 0.0017 / ((S.speed || 1) * (S.speed || 1)) * (1 - this.boost * 0.6);
    for (let i = 0; i < 3; i++) a[i] -= v[i] * (0.06 + kq * sp);
    a[1] -= v[1] * 0.45;
    for (let i = 0; i < 3; i++) { v[i] += a[i] * dt; this.pos[i] += v[i] * dt; }

    this.collide(dt, world);
  }

  collide(dt, world) {
    const v = this.vel;
    this.contacts = 0; let on = null;
    // the skids: stand on whatever is under them
    for (const s of SKIDS) {
      const p = this.toWorld(s);
      const b = world.firstOverlap([p[0] - 0.05, p[1] - 0.05, p[2] - 0.05], [p[0] + 0.05, p[1] + 0.05, p[2] + 0.05]);
      if (!b) continue;
      const pen = b.max[1] - p[1];
      if (pen > 1.0) continue;              // that's a wall, not a floor: the body spheres deal with it
      if (pen > 0) this.pos[1] += pen * 0.5;
      this.contacts++; on = b;
      if (v[1] < 0) {
        if (-v[1] > 7.5) this.events.push({ type: 'impact', speed: -v[1] - 7.5, point: p, hard: true });
        v[1] = 0;
      }
    }
    if (this.contacts) {
      const f = Math.exp(-5 * dt);
      v[0] *= f; v[2] *= f;
      this.w[0] *= Math.exp(-8 * dt); this.w[2] *= Math.exp(-8 * dt);
      // settle level on the ground
      this.w[0] -= this.pitch * 6 * dt; this.w[2] -= this.rollL * 6 * dt;
    }
    this.landed = this.contacts >= 3 && Math.hypot(v[0], v[1], v[2]) < 3 ? on : null;
    // the body: push out of buildings, and hurt
    for (const [x, y, z, r] of BODY) {
      const p = this.toWorld([x, y, z]);
      for (let it = 0; it < 2; it++) {
        const b = world.firstOverlap([p[0] - r, p[1] - r, p[2] - r], [p[0] + r, p[1] + r, p[2] + r]);
        if (!b) break;
        const c = [clamp(p[0], b.min[0], b.max[0]), clamp(p[1], b.min[1], b.max[1]), clamp(p[2], b.min[2], b.max[2])];
        let d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], dl = Math.hypot(d[0], d[1], d[2]), nrm, depth;
        if (dl > 1e-4) { if (dl >= r) break; nrm = d.map((q) => q / dl); depth = r - dl; } else {
          // centre inside: out along the shortest way
          let best = Infinity; nrm = [0, 1, 0];
          for (let ax = 0; ax < 3; ax++) for (const sg of [-1, 1]) {
            const dd = sg > 0 ? b.max[ax] - p[ax] : p[ax] - b.min[ax];
            if (dd < best) { best = dd; nrm = [0, 0, 0]; nrm[ax] = sg; }
          }
          depth = best + r;
        }
        for (let i = 0; i < 3; i++) { this.pos[i] += nrm[i] * depth; p[i] += nrm[i] * depth; }
        const vn = v[0] * nrm[0] + v[1] * nrm[1] + v[2] * nrm[2];
        if (vn < 0) {
          if (-vn > 5 && !(nrm[1] > 0.7 && this.contacts)) this.events.push({ type: 'impact', speed: -vn - 5, point: c, normal: nrm });
          for (let i = 0; i < 3; i++) v[i] -= nrm[i] * vn * 1.3;
        }
      }
    }
    // the rotor tips hitting walls
    if (this.rpm > 0.3) {
      const [, R, hy] = ROTOR[(this.stats.rotorTier) || 0];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const p = this.toWorld([Math.sin(a) * R * 0.95, hy, 0.3 + Math.cos(a) * R * 0.95]);
        if (!world.pointInside(p)) continue;
        const c = this.toWorld([0, hy, 0.3]), d = [c[0] - p[0], 0, c[2] - p[2]], dl = Math.hypot(d[0], d[2]) || 1;
        v[0] += (d[0] / dl) * 9 * dt * 10; v[2] += (d[2] / dl) * 9 * dt * 10;
        this.events.push({ type: 'rotor', point: p });
        break;
      }
    }
  }
}
