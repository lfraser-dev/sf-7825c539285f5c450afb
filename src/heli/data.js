// DEAD AIR (build 0.75): the helicopter's upgrades, paint jobs and the save file.
//
// Every upgrade has tiers. You buy them in order with SCRAP (earned on missions), and can fit any tier you own.
// Every tier changes how the helicopter looks (see chopper.js), not just its numbers.

export const SLOTS = [
  { id: 'gun', name: 'NOSE GUN', icon: '⁂', tiers: [
    { n: 'CHAIN GUN', cost: 0, d: 'One barrel under the nose. Reliable.' },
    { n: 'ROTARY MINIGUN', cost: 600, d: 'Six spinning barrels. Way faster fire.' },
    { n: 'TWIN MINIGUNS', cost: 1800, d: 'Two miniguns side by side. Shreds hordes.' },
    { n: 'PLASMA CANNON', cost: 4200, d: 'Glowing bolts that blow up on hit. Barely heats up.' },
  ] },
  { id: 'rockets', name: 'ROCKETS', icon: '➶', tiers: [
    { n: 'NONE', cost: 0, d: 'No rocket pods fitted.' },
    { n: 'ROCKET PODS', cost: 400, d: 'Two pods on the stub wings. 8 rockets.' },
    { n: 'QUAD PODS', cost: 1400, d: 'Four pods. 16 rockets, bigger blasts.' },
    { n: 'HELLFIRE RAILS', cost: 3200, d: 'Missiles that home in on the biggest zombie near your crosshair.' },
  ] },
  { id: 'bombs', name: 'BOMB BAY', icon: '●', tiers: [
    { n: 'NONE', cost: 0, d: 'No bombs.' },
    { n: 'FIRE BOMBS', cost: 700, d: 'Drop with SPACE. The street burns for a while.' },
    { n: 'CLUSTER BOMBS', cost: 2000, d: 'Each bomb splits into six. Clears whole streets.' },
  ] },
  { id: 'armor', name: 'ARMOUR', icon: '▣', tiers: [
    { n: 'STOCK HULL', cost: 0, d: 'Thin metal. Be careful.' },
    { n: 'BOLT-ON PLATES', cost: 500, d: 'Steel plates on the sides and nose. +60% health.' },
    { n: 'HEAVY ARMOUR', cost: 1500, d: 'Thick plates and a cage over the glass. +130% health.' },
    { n: 'FORTRESS', cost: 3600, d: 'Armour everywhere plus a nose ram. +220% health. Heavy!' },
  ] },
  { id: 'engine', name: 'ENGINE', icon: '✦', tiers: [
    { n: 'STOCK TURBINE', cost: 0, d: 'Gets you up there.' },
    { n: 'TURBO', cost: 500, d: 'Bigger exhausts. More lift and top speed.' },
    { n: 'TWIN TURBO', cost: 1500, d: 'Two turbines. A lot more of everything.' },
    { n: 'AFTERBURNER', cost: 3400, d: 'Hold SHIFT for a huge burst of speed.' },
  ] },
  { id: 'rotor', name: 'ROTOR', icon: '✳', tiers: [
    { n: '4 BLADES', cost: 0, d: 'The standard rotor.' },
    { n: '5 BLADES', cost: 800, d: 'Longer blades. Better lift and quicker turns.' },
    { n: 'COAXIAL', cost: 2600, d: 'Two rotors stacked up. Turns on the spot.' },
  ] },
  { id: 'door', name: 'DOOR GUNS', icon: '⌖', tiers: [
    { n: 'NONE', cost: 0, d: 'Empty doors.' },
    { n: 'DOOR GUNNER', cost: 900, d: 'A gunner in the right door shoots zombies by himself.' },
    { n: 'TWIN GUNNERS', cost: 2200, d: 'Gunners in both doors.' },
  ] },
  { id: 'cabin', name: 'CABIN', icon: '♟', tiers: [
    { n: '4 SEATS', cost: 0, d: 'Carry 4 survivors at a time.' },
    { n: '8 SEATS', cost: 400, d: 'Side benches. Carry 8.' },
    { n: '12 SEATS', cost: 1200, d: 'Side pods bolted on. Carry 12.' },
  ] },
];
export const SLOT = Object.fromEntries(SLOTS.map((s) => [s.id, s]));

// paint jobs: body colour, trim colour, a pattern, and the cost
export const PAINTS = [
  { id: 'olive', n: 'OLIVE', body: [0.3, 0.34, 0.22], trim: [0.16, 0.17, 0.13], cost: 0 },
  { id: 'night', n: 'NIGHT OPS', body: [0.12, 0.13, 0.15], trim: [0.05, 0.05, 0.06], cost: 0 },
  { id: 'arctic', n: 'ARCTIC', body: [0.82, 0.84, 0.86], trim: [0.3, 0.33, 0.36], cost: 150 },
  { id: 'desert', n: 'DESERT', body: [0.66, 0.55, 0.38], trim: [0.4, 0.31, 0.2], cost: 150 },
  { id: 'rescue', n: 'RESCUE', body: [0.85, 0.2, 0.12], trim: [0.92, 0.92, 0.9], cost: 300, stripe: [0.92, 0.92, 0.9] },
  { id: 'hazard', n: 'HAZARD', body: [0.95, 0.72, 0.08], trim: [0.08, 0.08, 0.08], cost: 500, stripe: [0.08, 0.08, 0.08] },
  { id: 'shark', n: 'SHARK MOUTH', body: [0.42, 0.46, 0.5], trim: [0.2, 0.22, 0.25], cost: 800, shark: true },
  { id: 'toxic', n: 'TOXIC', body: [0.2, 0.22, 0.2], trim: [0.35, 1, 0.2], cost: 1200, glow: [0.35, 1, 0.2], stripe: [0.35, 1, 0.2] },
  { id: 'gold', n: 'SOLID GOLD', body: [0.85, 0.64, 0.2], trim: [0.5, 0.36, 0.1], cost: 5000, mat: 'brass' },
  { id: 'dev', n: 'DEV: ROOT', body: [0.04, 0.05, 0.06], trim: [0.1, 1, 0.45], cost: 0, glow: [0.1, 1, 0.45], stripe: [0.1, 1, 0.45], dev: true },
];
export const PAINT = Object.fromEntries(PAINTS.map((p) => [p.id, p]));

const KEY = 'semifinals.deadair';
export function loadSave() {
  const s = { scrap: 0, own: {}, eq: {}, paints: ['olive', 'night'], paint: 'olive', assist: true, invert: false, sens: 1, best: 0, runs: 0, titans: 0, rescued: 0 };
  try { Object.assign(s, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* ignore */ }
  for (const sl of SLOTS) { if (s.own[sl.id] == null) s.own[sl.id] = 0; if (s.eq[sl.id] == null) s.eq[sl.id] = 0; }
  return s;
}
export function saveSave(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } }

// what the fitted upgrades add up to
export function statsFor(eq) {
  const g = eq.gun, ar = eq.armor, en = eq.engine, ro = eq.rotor;
  return {
    hp: Math.round(500 * [1, 1.6, 2.3, 3.2][ar]),
    mass: [1, 1.06, 1.14, 1.26][ar] + eq.rockets * 0.02 + eq.bombs * 0.02 + eq.cabin * 0.03,
    lift: [1, 1.14, 1.28, 1.36][en] * [1, 1.07, 1.12][ro],
    speed: [1, 1.1, 1.2, 1.26][en],
    agility: [1, 1.15, 1.35][ro],
    boost: en === 3,
    gun: [
      { rate: 9, dmg: 22, spread: 0.010, heat: 0.035, cool: 0.45, barrels: 1 },
      { rate: 24, dmg: 16, spread: 0.016, heat: 0.016, cool: 0.4, barrels: 1, spin: true },
      { rate: 44, dmg: 16, spread: 0.018, heat: 0.011, cool: 0.4, barrels: 2, spin: true },
      { rate: 7, dmg: 70, spread: 0.004, heat: 0.03, cool: 0.6, barrels: 1, plasma: true, splash: 3.2 },
    ][g],
    rockets: [0, 8, 16, 12][eq.rockets],
    rocketDmg: [0, 260, 340, 420][eq.rockets],
    rocketR: [0, 6.5, 8, 8.5][eq.rockets],
    homing: eq.rockets === 3,
    bombs: [0, 4, 4][eq.bombs],
    cluster: eq.bombs === 2,
    gunners: eq.door,
    seats: [4, 8, 12][eq.cabin],
  };
}
// 0..1 bars for the hangar
export function bars(eq) {
  const s = statsFor(eq), gun = s.gun.rate * s.gun.dmg * (s.gun.splash ? 2.2 : 1);
  return [
    ['ARMOUR', s.hp / 1600],
    ['FIREPOWER', Math.min(1, (gun + s.rockets * s.rocketDmg / 12 + s.gunners * 150 + s.bombs * 60) / 1900)],
    ['SPEED', (s.speed * s.lift / s.mass - 0.7) / 0.9],
    ['HANDLING', (s.agility * s.lift / s.mass - 0.7) / 1.2],
    ['SEATS', s.seats / 12],
  ];
}
