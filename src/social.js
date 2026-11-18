// Ranked divisions and crews. Both are per browser and travel with you online (in the hello/lobby info).
//
// RANKED: online matches move your rank points (RP): a win is +25 (+2 a kill, up to +10), a loss is −15 (+1 a kill,
// so a good game softens it), never below 0. Divisions: BRONZE, SILVER, GOLD, PLATINUM, DIAMOND (each with III, II,
// I), then CHAMPION. Matches against only bots don't count.
//
// CREWS: a crew name, a 2–4 letter tag and a colour. The tag shows in front of your name online ([SF] LEWIS); make
// the same crew as your friends to rep it together.
const RKEY = 'semifinals.ranked', CKEY = 'semifinals.crew';

export const DIVS = [
  ['BRONZE', [0.8, 0.5, 0.25], 0], ['SILVER', [0.75, 0.78, 0.84], 300], ['GOLD', [1, 0.78, 0.2], 600],
  ['PLATINUM', [0.35, 0.9, 0.85], 1000], ['DIAMOND', [0.45, 0.65, 1], 1500], ['CHAMPION', [1, 0.25, 0.35], 2100],
];
export function divisionOf(rp) {
  let i = 0;
  while (i < DIVS.length - 1 && rp >= DIVS[i + 1][2]) i++;
  const [name, col, lo] = DIVS[i];
  if (i === DIVS.length - 1) return { name, col, tier: '', full: name, i, into: 1 };
  const hi = DIVS[i + 1][2], step = (hi - lo) / 3, t = Math.min(2, Math.floor((rp - lo) / step));
  return { name, col, tier: ['III', 'II', 'I'][t], full: `${name} ${['III', 'II', 'I'][t]}`, i, into: ((rp - lo) % step) / step };
}
const css = (c) => `rgb(${c.map((v) => Math.round(v * 255)).join(',')})`;
// a little shield badge
export function divHTML(rp) {
  const d = divisionOf(rp || 0);
  return `<span class="dv" style="--dv:${css(d.col)}" title="${d.full} · ${rp || 0} RP">${d.name[0]}${d.tier ? `<small>${d.tier}</small>` : ''}</span>`;
}
export function loadRanked() {
  try { const s = JSON.parse(localStorage.getItem(RKEY)); if (s && Number.isFinite(s.rp)) return { rp: Math.max(0, s.rp | 0), played: s.played | 0, won: s.won | 0, best: s.best | 0 }; } catch { /* fresh */ }
  return { rp: 0, played: 0, won: 0, best: 0 };
}
export function saveRanked(r) { try { localStorage.setItem(RKEY, JSON.stringify(r)); } catch { /* private window */ } }
// a finished online match: returns the change
export function rankedResult(r, won, kills) {
  const before = r.rp;
  const delta = won ? 25 + Math.min(10, kills * 2) : -15 + Math.min(10, kills);
  r.rp = Math.max(0, r.rp + delta);
  r.played++; if (won) r.won++;
  r.best = Math.max(r.best, r.rp);
  saveRanked(r);
  return { delta: r.rp - before, before: divisionOf(before), after: divisionOf(r.rp) };
}

export const CREW_COLS = ['#ff4a40', '#ff9a1a', '#ffd04a', '#3ad16b', '#2fd0c0', '#2f8cff', '#9a5cff', '#ff4fa0', '#f0f0f0', '#222428'];
export function cleanTag(t) { return String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); }
export function loadCrew() {
  try { const s = JSON.parse(localStorage.getItem(CKEY)); if (s && cleanTag(s.tag).length >= 2) return { name: String(s.name || '').slice(0, 18), tag: cleanTag(s.tag), col: CREW_COLS.includes(s.col) ? s.col : CREW_COLS[0] }; } catch { /* none */ }
  return null;
}
export function saveCrew(c) { try { if (c) localStorage.setItem(CKEY, JSON.stringify(c)); else localStorage.removeItem(CKEY); } catch { /* private window */ } }
export function crewHTML(cr) { return cr && cr.t ? `<span class="crew" style="--cw:${cr.c}">[${cr.t}]</span>` : ''; }
