// Daily challenges: three a day, the same three for everyone (picked from the date), reset at midnight UTC.
// Progress comes from match events (kills, headshots, takedowns, wins...). Finishing one pays XP and credits.
// Saved per browser.

const KEY = 'semifinals.daily';

// weapon families, by the gun's base style
const FAMILY = { ar: 'RIFLE', smg: 'SMG', shotgun: 'SHOTGUN', sniper: 'SNIPER', lmg: 'LMG', pistol: 'SIDEARM' };
export const familyOf = (def) => (def ? FAMILY[def.style] || null : null);

// the pool. `on` = which event counts; `match` narrows it. Rewards scale with how much work it is.
const POOL = [
  { id: 'kills10', text: 'Get 10 kills', on: 'kill', n: 10, xp: 500, cr: 250 },
  { id: 'kills20', text: 'Get 20 kills', on: 'kill', n: 20, xp: 900, cr: 450 },
  { id: 'smg', text: 'Get 8 kills with an SMG', on: 'kill', match: { fam: 'SMG' }, n: 8, xp: 600, cr: 300 },
  { id: 'rifle', text: 'Get 8 kills with a rifle', on: 'kill', match: { fam: 'RIFLE' }, n: 8, xp: 600, cr: 300 },
  { id: 'shotgun', text: 'Get 6 kills with a shotgun', on: 'kill', match: { fam: 'SHOTGUN' }, n: 6, xp: 600, cr: 300 },
  { id: 'sniper', text: 'Get 5 kills with a sniper', on: 'kill', match: { fam: 'SNIPER' }, n: 5, xp: 700, cr: 350 },
  { id: 'lmg', text: 'Get 8 kills with a machine gun', on: 'kill', match: { fam: 'LMG' }, n: 8, xp: 600, cr: 300 },
  { id: 'sidearm', text: 'Get 4 kills with your sidearm', on: 'kill', match: { fam: 'SIDEARM' }, n: 4, xp: 700, cr: 350 },
  { id: 'heads', text: 'Get 5 headshot kills', on: 'kill', match: { head: true }, n: 5, xp: 700, cr: 350 },
  { id: 'light', text: 'Get 8 kills as Light', on: 'kill', match: { cls: 'light' }, n: 8, xp: 600, cr: 300 },
  { id: 'medium', text: 'Get 8 kills as Medium', on: 'kill', match: { cls: 'medium' }, n: 8, xp: 600, cr: 300 },
  { id: 'heavy', text: 'Get 8 kills as Heavy', on: 'kill', match: { cls: 'heavy' }, n: 8, xp: 600, cr: 300 },
  { id: 'td3', text: 'Do 3 takedowns', on: 'takedown', n: 3, xp: 600, cr: 300 },
  { id: 'td6', text: 'Do 6 takedowns', on: 'takedown', n: 6, xp: 1000, cr: 500 },
  { id: 'streak3', text: 'Get 3 kills without dying', on: 'streak', match: { at: 3 }, n: 1, xp: 600, cr: 300 },
  { id: 'streak5', text: 'Get 5 kills without dying', on: 'streak', match: { at: 5 }, n: 1, xp: 1000, cr: 500 },
  { id: 'win1', text: 'Win a match', on: 'win', n: 1, xp: 500, cr: 250 },
  { id: 'win3', text: 'Win 3 matches', on: 'win', n: 3, xp: 1100, cr: 550 },
  { id: 'play3', text: 'Play 3 matches', on: 'match', n: 3, xp: 500, cr: 250 },
  { id: 'gear', text: 'Get 3 kills with gadgets or explosives', on: 'kill', match: { gear: true }, n: 3, xp: 800, cr: 400 },
];
const BY_ID = Object.fromEntries(POOL.map((c) => [c.id, c]));

export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
export function msToReset(d = new Date()) {
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return next - d.getTime();
}
// a small seeded random (mulberry32) from the date, so everyone gets the same three
function seeded(str) {
  let h = 2166136261;
  for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// three for the day: no two about the same thing (e.g. not two "N kills" ones)
function pick(day) {
  const rnd = seeded('semifinals-' + day), out = [], kinds = new Set();
  const kindOf = (c) => (c.match?.fam ? 'fam' : c.match?.cls ? 'cls' : c.on + (c.match?.head ? 'h' : c.match?.gear ? 'g' : ''));
  const pool = [...POOL];
  while (out.length < 3 && pool.length) {
    const c = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    if (kinds.has(kindOf(c))) continue;
    kinds.add(kindOf(c)); out.push(c.id);
  }
  return out;
}

export function loadDaily() {
  const day = dayKey();
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.day === day && Array.isArray(s.ids) && s.ids.every((id) => BY_ID[id])) return s;
  } catch { /* fresh */ }
  const s = { day, ids: pick(day), prog: {}, done: {} };
  saveDaily(s);
  return s;
}
export function saveDaily(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private window */ } }

// the day's challenges with progress, for the menu
export function dailyList(s) {
  return s.ids.map((id) => { const c = BY_ID[id]; return { ...c, have: Math.min(c.n, s.prog[id] || 0), done: !!s.done[id] }; });
}

// something happened in a match. Returns the challenges this just completed (to pay out and announce).
// ev: { type: 'kill' | 'takedown' | 'streak' | 'win' | 'match', fam, head, cls, gear, at }
export function dailyEvent(s, ev) {
  if (s.day !== dayKey()) { Object.assign(s, { day: dayKey(), ids: pick(dayKey()), prog: {}, done: {} }); }
  const finished = [];
  for (const id of s.ids) {
    const c = BY_ID[id];
    if (s.done[id] || c.on !== ev.type) continue;
    const m = c.match;
    if (m) {
      if (m.fam && ev.fam !== m.fam) continue;
      if (m.head && !ev.head) continue;
      if (m.cls && ev.cls !== m.cls) continue;
      if (m.gear && !ev.gear) continue;
      if (m.at && ev.at !== m.at) continue;
    }
    s.prog[id] = (s.prog[id] || 0) + 1;
    if (s.prog[id] >= c.n) { s.done[id] = true; finished.push(c); }
  }
  saveDaily(s);
  return finished;
}
