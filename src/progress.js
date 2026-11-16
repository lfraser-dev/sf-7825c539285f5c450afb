// Levels and unlocks. You earn XP in matches (offline and online): kills, takedowns and the result. Levels unlock
// guns, takedowns and the top weapon skins, and each level up pays out some credits. Saved per browser.

const KEY = 'semifinals.progress';
export const MAX_LEVEL = 50;
export const XP = { kill: 100, takedown: 150, win: 600, loss: 300 };
export const LEVEL_CREDITS = 500;

// XP needed to go from level n to n + 1
export const xpToNext = (n) => 800 + 200 * n;

export function levelInfo(xp) {
  let lv = 1, rest = xp;
  while (lv < MAX_LEVEL && rest >= xpToNext(lv)) { rest -= xpToNext(lv); lv++; }
  return { level: lv, into: rest, need: lv >= MAX_LEVEL ? 0 : xpToNext(lv), max: lv >= MAX_LEVEL };
}

// ranks: a name and colour per band of levels (used for badges on the menu, scoreboard and lobby)
const RANKS = [
  [1, 'ROOKIE', [0.62, 0.66, 0.72]],
  [5, 'CONTENDER', [0.35, 0.8, 0.45]],
  [10, 'PRO', [0.25, 0.6, 1]],
  [20, 'ELITE', [0.7, 0.35, 1]],
  [30, 'CHAMPION', [1, 0.42, 0.15]],
  [40, 'LEGEND', [1, 0.15, 0.25]],
  [50, 'FINALIST', [1, 0.8, 0.2]],
];
export function rankOf(level) {
  let r = RANKS[0];
  for (const x of RANKS) if (level >= x[0]) r = x;
  return { name: r[1], color: r[2], css: `rgb(${r[2].map((v) => Math.round(v * 255)).join(',')})` };
}
// a small badge: the rank colour as a chevron with the level number
export function badgeHTML(level) {
  const r = rankOf(level || 1);
  return `<span class="rk" style="--rk:${r.css}" title="${r.name}"><i></i>${level || 1}</span>`;
}

// what unlocks when. Anything not listed is available from level 1.
export const GUN_LV = {
  // light
  zu9: 4, lever: 7, kr45: 10, pdx: 14, rg1: 24,
  // medium
  dmr: 3, bullpup: 5, hx17: 8, double: 11, rt7: 13, cr56: 16, slug: 20,
  // heavy
  autoshotgun: 2, rk74: 6, amr: 9, minigun: 12, bruiser: 18,
  // sidearms
  mp: 3, hc50: 9, bx9: 15,
  // variants (build 0.57): each a few levels after the gun it's built on
  ar_sd: 4, ar_hb: 7, burst_r: 6, hx17_c: 12, cr56_x: 19, dmr_h: 9, bullpup_s: 10,
  smg_r: 5, kv_x: 8, kr45_s: 13, pdx_a: 17, zu9_h: 11,
  shotgun_l: 6, auto_s: 8, double_s: 14, rt7_t: 16,
  sniper_l: 10, rg1_c: 28, lever_b: 12, amr_d: 15,
  lmg_s: 5, rk74_d: 11, bruiser_ap: 22, minigun_t: 17,
  pistol_m: 4, revolver_s: 6, hc50_l: 13, bx9_d: 18, mp_r: 7,
};
export const TD_LV = { flipkick: 6, shockpalm: 12, pocketnade: 6, elbowdrop: 12, sledge: 6, bodyslam: 12 };
export const SKIN_LV = { w_circuit: 8, w_molten: 12, w_bloodline: 16, w_darkmatter: 20, w_diamond: 30, w_aurum: 40, w_gold: 25 };

export function loadProgress() {
  try { const p = JSON.parse(localStorage.getItem(KEY)); if (p && Number.isFinite(p.xp)) return { xp: Math.max(0, p.xp), total: p.total || p.xp }; } catch { /* fresh */ }
  return { xp: 0, total: 0 };
}
export function saveProgress(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private window */ } }

export const levelOf = (p) => levelInfo(p.xp).level;
export const gunLocked = (p, id) => (GUN_LV[id] || 1) > levelOf(p);
export const tdLocked = (p, id) => (TD_LV[id] || 1) > levelOf(p);
export const skinLocked = (p, id) => (SKIN_LV[id] || 1) > levelOf(p);

// everything that unlocks exactly at a level (for the level-up screen)
export function unlocksAt(level, names) {
  const out = [];
  for (const [id, lv] of Object.entries(GUN_LV)) if (lv === level) out.push(names.gun(id));
  for (const [id, lv] of Object.entries(TD_LV)) if (lv === level) out.push(names.td(id));
  for (const [id, lv] of Object.entries(SKIN_LV)) if (lv === level) out.push(names.skin(id));
  return out;
}

// add XP; returns the levels gained (each with what it unlocked filled in by the caller)
export function addXp(p, n) {
  const before = levelOf(p);
  p.xp += n; p.total = (p.total || 0) + n;
  saveProgress(p);
  const after = levelOf(p);
  const ups = [];
  for (let l = before + 1; l <= after; l++) ups.push(l);
  return ups;
}
