// People in matches. Bots and players used to be drawn as armoured robots; with `bot.human` set (an outfit),
// they're drawn with the same human rig as the menu character, driven live by the bot's state: walking, aiming
// a real gun from the shoulder, flinching, landing, takedown animations, and falling over when downed.
import { Contestant } from './contestant.js';
import { takedownPose } from './takedown.js';

const ZERO = [0, 0, 0];
const leanV = (v, a) => (a ? [v[0], v[1] * Math.cos(a) + v[2] * Math.sin(a), -v[1] * Math.sin(a) + v[2] * Math.cos(a)] : v);

// the live pose, in character space (feet at the origin, facing -z)
function livePose(bot, dyingT, td) {
  const g = bot.moving || 0, w = bot.walk || 0, lv = bot.localVel || ZERO, ls = Math.hypot(lv[0], lv[1]);
  const md = ls > 0.2 ? [lv[0] / ls, lv[1] / ls] : [0, -1];
  const dying = dyingT >= 0;
  const crouch = (bot.landK || 0) * 0.26 + (dying ? Math.min(1, dyingT / 0.5) * 0.3 : 0) + (td ? td.crouch * 0.95 : 0);
  const bob = Math.abs(Math.sin(w)) * 0.035 * g;
  const pelvisY = 0.95 - crouch - bob;
  const p = { breath: bot.breath || 0 };
  if (td) {
    // a takedown: the choreography's hands and feet; the body leans from the hips (or the whole body turns: see root)
    const lean = td.spin ? 0 : td.rot;
    p.pelvis = [0, pelvisY, 0]; p.lean = lean; p.twist = 0; p.head = [0, lean * 0.25];
    const pv = p.pelvis, hl = (v) => { const d = leanV([v[0] - pv[0], v[1] - 0.95, v[2] - pv[2]], lean); return [pv[0] + d[0], pv[1] + d[1], pv[2] + d[2]]; };
    p.hands = [hl(td.hands[0]), hl(td.hands[1])];
    p.feet = [[-0.14, 0.05, 0.04], td.footR ? [td.footR[0] + 0.02, Math.max(0.05, td.footR[1]), td.footR[2]] : [0.14, 0.05, -0.04]];
    p.elbowOut = 1.0;
    return p;
  }
  if (dying) {
    // limp: arms loose, head rolled
    p.pelvis = [0, pelvisY, 0]; p.lean = 0.12; p.twist = 0.1; p.head = [0.3, 0.25];
    p.feet = [[-0.15, 0.05, 0.03], [0.17, 0.05, -0.06]];
    p.hands = [[-0.34, 0.95, -0.12], [0.36, 1.02, 0.1]];
    p.elbowOut = 1.3;
    return p;
  }
  const flinch = bot.flinch || 0, recoil = bot.recoil || 0, pitch = bot.aimPitch || 0;
  const rush = bot.type === 'rusher' ? 0.1 : 0;
  p.pelvis = [0, pelvisY, 0];
  p.lean = (0.1 + rush) * g - flinch * 0.3 + (bot.landK || 0) * 0.18 - pitch * 0.25;
  p.twist = 0.3 + Math.sin(w) * 0.08 * g + flinch * (bot.flinchTwist || 0);      // bladed: gun shoulder back
  p.head = [-0.28, -pitch * 0.55];
  // legs: a proper stride in the direction of travel
  p.feet = [-1, 1].map((side) => {
    const ph = w + (side > 0 ? Math.PI : 0), s = Math.sin(ph), c = Math.cos(ph);
    return [side * 0.13 + md[0] * s * 0.34 * g, 0.05 + Math.max(0, c) * 0.16 * g, md[1] * s * 0.34 * g + (side > 0 ? -0.05 : 0.06) * (1 - g)];
  });
  // the gun: shouldered, pointing where they aim; the hands go to its grips
  p.gun = { c: [0.13, 1.43 - crouch - bob * 0.5 + recoil * 0.012, -0.2 + recoil * 0.05], rx: pitch + recoil * 0.05, ry: 0 };
  p.holdGun = true;
  p.hands = [[-0.08, 1.36 - crouch, -0.5], [0.16, 1.34 - crouch, -0.14]];
  p.armHint = [[-0.7, -0.75, 0.25], [0.75, -0.65, 0.5]];
  return p;
}

const WHITE = [1, 1, 1];
// the parts to draw for a human-bodied bot (and its gun), also filling in what the game reads back:
// bot.armW (hands and elbows), bot.footW, bot.muzzlePt, bot.gunMatrix
export function humanParts(bot, dyingT) {
  const fig = (bot.fig ||= new Contestant(bot.human, bot.pos, bot.yaw));
  if (fig.skin !== bot.human) fig.skin = bot.human;
  fig.pos = bot.pos; fig.yaw = bot.yaw; fig.t = bot.breath || 0;
  fig.gunDef = bot.gunDef || null; fig.realGun = true;
  const td = bot.pose || (bot.tdAnim && bot.alive ? takedownPose(bot.tdAnim.kind, bot.tdAnim.t) : null);
  // the whole-body transform: falling over when downed, flips and slams, lunges, the drop-in
  const strain = !bot.alive && bot.downed && bot.struggle ? bot.struggle * 0.34 : 0;
  const fa = dyingT >= 0 ? Math.min(1, dyingT / 0.6) ** 2 * 1.5 - strain : 0;
  if (fa) fig.root = { rot: -fa * (bot.fallSign || 1), pivot: 0, off: [0, 0.1 * Math.min(1, fa), 0] };
  else if (td) fig.root = { rot: td.spin ? td.rot : 0, pivot: 0.95, off: td.off };
  else if (bot.dropY) fig.root = { rot: 0, pivot: 0, off: [0, bot.dropY, 0] };
  else fig.root = null;
  fig.poseFn = () => livePose(bot, dyingT, td);
  let out = fig.parts();
  bot.armW = fig.armW; bot.footW = fig.footW;
  if (fig.hasGun && bot.gunDef && bot.gunPartsOf && dyingT < 0) {
    out = out.concat(bot.gunPartsOf(bot.gunDef, fig.gunMatrix));
    // where shots come from: the gun's muzzle
    const m = fig.gunMatrix, q = bot.gunDef.muzzle || [0, 0.02, -0.5];
    bot.muzzlePt = [m[0] * q[0] + m[4] * q[1] + m[8] * q[2] + m[12], m[1] * q[0] + m[5] * q[1] + m[9] * q[2] + m[13], m[2] * q[0] + m[6] * q[1] + m[10] * q[2] + m[14]];
  } else if (dyingT < 0) bot.muzzlePt = bot.toWorld([0.13, 1.4, -0.6]);
  bot.gunMatrix = fig.gunMatrix;
  // hit flash: everything whites out for a moment
  if (bot.flash > 0) out = out.map((p) => (p.tex >= 40 ? p : { ...p, color: p.color.map((v) => v + (1 - v) * 0.85), emissive: 0.9 }));
  return out;
}
export { WHITE };
