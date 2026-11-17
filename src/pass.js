// The battle pass: SEASON 1. Fifty tiers, one every 1,000 XP (the same XP you earn in matches). Each tier pays a
// free reward, and a premium reward if you've bought the premium pass (with credits). Rewards are credits and
// pass-only cosmetics (they never appear in the shop). Rewards are handed over as soon as you reach the tier;
// buying premium later pays out every premium reward you've already passed. Saved per browser.
import { ITEMS } from './cosmetics.js';

const KEY = 'semifinals.pass';
export const PASS = { season: 1, name: 'SEASON 1: QUALIFIERS', tiers: 50, perTier: 1000, premiumCost: 9500 };

// ---- pass-only cosmetics (price -1: not sold, not free; you own them once the pass gives them to you)
const SF = [0.92, 0.1, 0.08], VOID = [0.06, 0.05, 0.1], NEON = [0.2, 1, 0.6], SUNSET = [1, 0.45, 0.2], ICE = [0.6, 0.85, 1];
const ROYAL = [0.4, 0.2, 0.85], GOLD = [1, 0.78, 0.22], CHROME = [0.8, 0.82, 0.86], TOXIC = [0.6, 1, 0.1], ROSE = [1, 0.4, 0.6], WHITE = [0.95, 0.95, 0.96], BLACK = [0.08, 0.08, 0.09];
const P = (slot, name, rarity, extra) => ({ slot, name, price: -1, rarity, pass: true, ...extra });
const PASS_ITEMS = {
  // free track
  bp_t_s1: P('top', 'SEASON 1 TEE', 'common', { apply: { top: SF, topStyle: 'tee', logo: null, print: WHITE } }),
  bp_w_sf: P('wskin', 'SEMI-FINAL RED', 'rare', { gun: { main: SF, dark: [0.2, 0.02, 0.02] } }),
  bp_n_s1: P('neck', 'FAN SCARF', 'rare', { apply: { scarf: SF, neckStyle: 'scarf', scarfStripe: WHITE } }),
  bp_s_s1: P('shoes', 'CONTENDER RUNNERS', 'rare', { apply: { shoes: BLACK, shoeStyle: 'runner', soleCol: SF } }),
  bp_o_s1: P('outer', 'QUALIFIER TRACK TOP', 'epic', { apply: { jacket: SF, jacketStyle: 'track', stripe: WHITE, trim: [0.7, 0.07, 0.06], vest: null } }),
  // premium track
  bp_w_void: P('wskin', 'VOID', 'rare', { gun: { main: VOID, dark: [0.02, 0.02, 0.04] } }),
  bp_g_neon: P('gloves', 'NEON GRIP', 'rare', { apply: { gloves: NEON, gloveStyle: 'tactical' } }),
  bp_l_sunset: P('legs', 'SUNSET TRACKIES', 'rare', { apply: { bottom: SUNSET, legStyle: 'track', stripe: WHITE } }),
  bp_n_royal: P('neck', 'ROYAL SCARF', 'rare', { apply: { scarf: ROYAL, neckStyle: 'scarf', scarfStripe: GOLD } }),
  bp_l_chrome: P('legs', 'CHROME CHINOS', 'rare', { apply: { bottom: CHROME, legStyle: 'chino' } }),
  bp_t_ice: P('top', 'GLACIER HOODIE', 'epic', { apply: { top: ICE, topStyle: 'hoodie', accent: WHITE, logo: WHITE } }),
  bp_w_sunset: P('wskin', 'SUNSET', 'epic', { gun: { main: SUNSET, dark: [0.35, 0.08, 0.12], glow: true } }),
  bp_o_void: P('outer', 'VOIDWALKER BOMBER', 'epic', { apply: { jacket: VOID, jacketStyle: 'bomber', trim: ROYAL, vest: null } }),
  bp_s_chrome: P('shoes', 'CHROME KICKS', 'epic', { apply: { shoes: CHROME, shoeStyle: 'kicks', accent: BLACK } }),
  bp_hc_rose: P('haircol', 'ROSE GLOW', 'epic', { apply: { hair: ROSE, hairGlow: 0.7 }, fx: 'Hair that glows pink.', live: true }),
  bp_w_toxic: P('wskin', 'BIOHAZARD', 'epic', { gun: { main: TOXIC, dark: [0.05, 0.08, 0.03], glow: true } }),
  bp_g_sf: P('gloves', 'RED CARPET GLOVES', 'epic', { apply: { gloves: SF, gloveStyle: 'host' } }),
  bp_t_void: P('top', 'NIGHT SHIFT HOODIE', 'epic', { apply: { top: VOID, topStyle: 'hoodie', accent: NEON, logo: NEON } }),
  bp_o_ice: P('outer', 'ICE CHAMPION JACKET', 'legendary', { apply: { jacket: ICE, jacketStyle: 'champion', trim: ROYAL, vest: null } }),
  bp_w_royal: P('wskin', 'ROYALTY', 'legendary', { gun: { main: ROYAL, dark: [0.12, 0.05, 0.25], glow: true } }),
  bp_s_gold: P('shoes', 'GOLD RUSH RUNNERS', 'legendary', { apply: { shoes: GOLD, shoeStyle: 'runner', soleCol: BLACK } }),
  bp_o_gold: P('outer', 'FINALIST JACKET', 'legendary', { apply: { jacket: GOLD, jacketStyle: 'champion', trim: BLACK, vest: null }, fx: 'Only for those who finish the season.' }),
  bp_w_final: P('wskin', 'THE FINALIST', 'legendary', { gun: { main: GOLD, dark: VOID, glow: true }, fx: 'Black and gold. The top of the season 1 pass.' }),
};
Object.assign(ITEMS, PASS_ITEMS);

// ---- what each tier pays: { cr } credits or { item }
const FREE_ITEMS = { 5: 'bp_t_s1', 15: 'bp_w_sf', 25: 'bp_n_s1', 35: 'bp_s_s1', 45: 'bp_o_s1' };
const PREM_ITEMS = { 2: 'bp_w_void', 4: 'bp_g_neon', 7: 'bp_l_sunset', 10: 'bp_t_ice', 12: 'bp_n_royal', 15: 'bp_w_sunset', 18: 'bp_l_chrome',
  20: 'bp_o_void', 23: 'bp_s_chrome', 25: 'bp_hc_rose', 28: 'bp_g_sf', 30: 'bp_w_toxic', 33: 'bp_t_void', 36: 'bp_o_ice',
  40: 'bp_w_royal', 44: 'bp_s_gold', 48: 'bp_o_gold', 50: 'bp_w_final' };
export const REWARDS = [];
for (let t = 1; t <= PASS.tiers; t++) {
  REWARDS.push({
    tier: t,
    free: FREE_ITEMS[t] ? { item: FREE_ITEMS[t] } : t === 50 ? { cr: 3000 } : t % 2 === 0 ? { cr: 300 } : null,
    prem: PREM_ITEMS[t] ? { item: PREM_ITEMS[t] } : { cr: t % 5 === 0 ? 1000 : 400 },
  });
}

export function loadPass() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.season === PASS.season && Number.isFinite(s.xp)) return { season: s.season, xp: s.xp, premium: !!s.premium, paid: s.paid | 0, paidPrem: s.paidPrem | 0 };
  } catch { /* fresh */ }
  return { season: PASS.season, xp: 0, premium: false, paid: 0, paidPrem: 0 };
}
export function savePass(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private window */ } }
export const tierOf = (p) => Math.min(PASS.tiers, Math.floor(p.xp / PASS.perTier));
export const tierProgress = (p) => (tierOf(p) >= PASS.tiers ? 1 : (p.xp % PASS.perTier) / PASS.perTier);

// hand over a reward (to the cosmetics state); returns a short label for it
export function grant(cos, r) {
  if (!r) return null;
  if (r.cr) { cos.credits += r.cr; return `+${r.cr.toLocaleString('en-GB')} CREDITS`; }
  if (r.item && ITEMS[r.item]) { if (!cos.owned.includes(r.item)) cos.owned.push(r.item); return ITEMS[r.item].name; }
  return null;
}
// pay out everything up to the current tier that hasn't been paid yet; returns [{ tier, labels }]
export function payOut(p, cos) {
  const top = tierOf(p), out = [];
  for (let t = 1; t <= top; t++) {
    const r = REWARDS[t - 1], labels = [];
    if (t > p.paid) { const l = grant(cos, r.free); if (l) labels.push(l); }
    if (p.premium && t > p.paidPrem) { const l = grant(cos, r.prem); if (l) labels.push(l); }
    if (labels.length) out.push({ tier: t, labels });
  }
  p.paid = Math.max(p.paid, top);
  if (p.premium) p.paidPrem = Math.max(p.paidPrem, top);
  savePass(p);
  return out;
}
