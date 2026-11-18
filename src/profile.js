// PROFILE (build 0.73): the fun stuff. Badges, titles and calling cards (your player card, shown on the home page, in
// the online lobby, over your head online and on the results screen), sprays (Y tags the wall in front of you), death
// effects (what people burst into when you finish them), weapon charms (a little keychain swinging off your gun) and
// lobby pets (they hang out next to you on the home screen). Bought in the shop and worn from CUSTOMIZATION like the
// rest of the cosmetics; profile items are the same on every class. DEV items only show up once the dev passcode has
// been entered (see main.js).
import { compose, mat4, mul } from './math.js';

export const PROFILE_SLOTS = [
  { id: 'badge', name: 'BADGE' }, { id: 'title', name: 'TITLE' }, { id: 'card', name: 'CALLING CARD' }, { id: 'spray', name: 'SPRAY' },
  { id: 'deathfx', name: 'DEATH EFFECT' }, { id: 'charm', name: 'WEAPON CHARM' }, { id: 'pet', name: 'LOBBY PET' },
];
export const isProfileSlot = (s) => PROFILE_SLOTS.some((x) => x.id === s);

const I = (slot, name, price, rarity, extra = {}) => ({ slot, name, price, rarity, global: true, ...extra });
export const PROFILE_ITEMS = {
  // ---- badges: next to your name everywhere
  bd_none: I('badge', 'NO BADGE', 0, 'common', { fx: 'Just your name.' }),
  bd_star: I('badge', 'STAR', 600, 'common', { fx: 'A bright little star.' }),
  bd_flame: I('badge', 'FLAME', 1200, 'rare', { fx: 'You are on fire.' }),
  bd_bolt: I('badge', 'LIGHTNING', 1200, 'rare', { fx: 'Fast hands.' }),
  bd_skull: I('badge', 'SKULL', 2000, 'epic', { fx: 'For the ruthless.' }),
  bd_crown: I('badge', 'CROWN', 3500, 'legendary', { fx: 'Royalty. It shimmers.', live: true }),
  bd_diamond: I('badge', 'DIAMOND', 4000, 'legendary', { fx: 'Faceted, and it sparkles.', live: true }),
  bd_zombie: I('badge', 'ZOMBIE SLAYER', 0, 'epic', { req: 'zbest10', fx: 'Earned: survive to round 10 in ZOMBIES.' }),
  bd_vet: I('badge', 'VETERAN', 0, 'legendary', { req: 'lv20', fx: 'Earned: reach level 20.', live: true }),
  bd_dev: I('badge', 'DEVELOPER', 0, 'dev', { dev: true, fx: 'The one who made the game. Animated, glitching, one of a kind.', live: true }),
  // ---- titles: under your name
  ti_none: I('title', 'NO TITLE', 0, 'common'),
  ti_spawn: I('title', 'FRESH SPAWN', 0, 'common'),
  ti_sweat: I('title', 'PROFESSIONAL SWEAT', 500, 'common'),
  ti_noscope: I('title', 'NO-SCOPE ROYALTY', 900, 'rare'),
  ti_menace: I('title', 'MENACE TO SOCIETY', 1500, 'epic'),
  ti_goat: I('title', 'CERTIFIED GOAT', 1500, 'epic'),
  ti_unstop: I('title', 'UNSTOPPABLE', 2500, 'legendary', { live: true, fx: 'Shines gold.' }),
  ti_zombie: I('title', 'ZOMBIE SLAYER', 0, 'epic', { req: 'zbest10', fx: 'Earned: survive to round 10 in ZOMBIES.' }),
  ti_dev: I('title', 'THE DEVELOPER', 0, 'dev', { dev: true, live: true, fx: 'Rainbow, glitching, only for the dev.' }),
  // ---- calling cards: the banner behind your player card
  cd_classic: I('card', 'CLASSIC', 0, 'common'),
  cd_sunset: I('card', 'SUNSET', 600, 'common'),
  cd_ocean: I('card', 'DEEP OCEAN', 600, 'common'),
  cd_tiger: I('card', 'TIGER STRIPE', 1200, 'rare'),
  cd_circuit: I('card', 'OVERCLOCKED', 2500, 'epic', { live: true, fx: 'Light races along circuit lines.' }),
  cd_galaxy: I('card', 'GALAXY', 3500, 'legendary', { live: true, fx: 'Drifting stars and nebula.' }),
  cd_inferno: I('card', 'INFERNO', 3500, 'legendary', { live: true, fx: 'Flames that flicker and rise.' }),
  cd_dev: I('card', 'SOURCE CODE', 0, 'dev', { dev: true, live: true, fx: 'Green code raining down, like you are inside the game.' }),
  // ---- sprays: press Y to tag a wall
  sp_gg: I('spray', 'GG', 0, 'common'),
  sp_heart: I('spray', 'HEART', 400, 'common'),
  sp_smile: I('spray', 'SMILEY', 400, 'common'),
  sp_skull: I('spray', 'SKULL', 900, 'rare'),
  sp_fire: I('spray', 'FIRE', 900, 'rare'),
  sp_crown: I('spray', 'CROWN', 2000, 'epic'),
  sp_dev: I('spray', 'DEV TAG', 0, 'dev', { dev: true, fx: '</> in glowing green.' }),
  // ---- death effects: what someone bursts into when you finish them
  dfx_coins: I('deathfx', 'COIN SHOWER', 0, 'common', { fx: 'The classic: a spray of gold coins.' }),
  dfx_smoke: I('deathfx', 'SMOKE BOMB', 600, 'common', { fx: 'Poof. Gone in a cloud of smoke.' }),
  dfx_confetti: I('deathfx', 'CONFETTI', 900, 'rare', { fx: 'A party popper of colour.' }),
  dfx_pixels: I('deathfx', 'PIXELATED', 1200, 'rare', { fx: 'They break into chunky coloured pixels.' }),
  dfx_balloons: I('deathfx', 'BALLOONS', 1500, 'epic', { fx: 'A bunch of balloons floats away.' }),
  dfx_lightning: I('deathfx', 'SMITE', 2500, 'epic', { fx: 'Lightning from above.' }),
  dfx_blackhole: I('deathfx', 'BLACK HOLE', 3500, 'legendary', { fx: 'Sucked into a tiny black hole.' }),
  dfx_dev: I('deathfx', 'DELETED', 0, 'dev', { dev: true, fx: 'Glitched out of existence: RGB pixels jitter and vanish.' }),
  // ---- weapon charms
  ch_none: I('charm', 'NO CHARM', 0, 'common'),
  ch_dice: I('charm', 'LUCKY DIE', 500, 'common'),
  ch_duck: I('charm', 'RUBBER DUCK', 900, 'rare'),
  ch_skull: I('charm', 'BONEHEAD', 1200, 'rare'),
  ch_crown: I('charm', 'TINY CROWN', 2500, 'epic'),
  ch_gem: I('charm', 'POWER GEM', 3000, 'legendary', { live: true, fx: 'It glows.' }),
  ch_dev: I('charm', 'DEV CHIP', 0, 'dev', { dev: true, live: true, fx: 'A glowing circuit chip.' }),
  // ---- lobby pets
  pet_none: I('pet', 'NO PET', 0, 'common'),
  pet_dog: I('pet', 'PUPPER', 1500, 'rare', { fx: 'A good dog. Wags its tail.' }),
  pet_cat: I('pet', 'MITTENS', 1500, 'rare', { fx: 'Sits. Judges you.' }),
  pet_robot: I('pet', 'BOLT-BOT', 2500, 'epic', { live: true, fx: 'A little hover robot.' }),
  pet_dragon: I('pet', 'EMBER', 4000, 'legendary', { live: true, fx: 'A tiny dragon that flaps and puffs fire.' }),
  pet_dev: I('pet', 'BYTE', 0, 'dev', { dev: true, live: true, fx: 'A floating glitch-cube. Only one exists.' }),
};
export const PROFILE_DEFAULTS = { badge: 'bd_none', title: 'ti_none', card: 'cd_classic', spray: 'sp_gg', deathfx: 'dfx_coins', charm: 'ch_none', pet: 'pet_none' };
export const ACH_TEXT = { zbest10: 'SURVIVE TO ROUND 10 IN ZOMBIES', lv20: 'REACH LEVEL 20' };

// ---------------------------------------------------------------- badges (SVG)
const BADGE = {
  bd_star: ['#ffd84a', '#ff9f1a', '<path d="M32 8l7 15 16 2-12 11 3 16-14-8-14 8 3-16L9 25l16-2z"/>'],
  bd_flame: ['#ffb02e', '#e8331b', '<path d="M33 6c2 10 14 14 14 28 0 10-7 18-15 18S17 44 17 34c0-7 4-11 7-14 0 6 3 9 6 9-3-8 0-16 3-23z"/>'],
  bd_bolt: ['#7fe7ff', '#2b74ff', '<path d="M36 6L16 36h13l-4 22 22-32H34z"/>'],
  bd_skull: ['#f2f2f2', '#9aa0aa', '<path d="M32 8C19 8 11 17 11 28c0 7 3 11 7 14v8c0 2 2 4 4 4h3v-5h4v5h6v-5h4v5h3c2 0 4-2 4-4v-8c4-3 7-7 7-14C53 17 45 8 32 8z"/><circle cx="24" cy="29" r="5.5" fill="#111"/><circle cx="40" cy="29" r="5.5" fill="#111"/>'],
  bd_crown: ['#ffe27a', '#d48a00', '<path d="M8 22l12 10 12-18 12 18 12-10-5 26H13z"/><rect x="13" y="50" width="38" height="6" rx="2"/>'],
  bd_diamond: ['#c9f6ff', '#3fa8ff', '<path d="M18 10h28l12 14-26 32L6 24z"/><path d="M6 24h52M18 10l6 14 8 32 8-32 6-14" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.5"/>'],
  bd_zombie: ['#9fe06a', '#3d7a20', '<path d="M32 8c-12 0-20 9-20 20 0 6 2 10 6 13v9h28v-9c4-3 6-7 6-13 0-11-8-20-20-20z"/><path d="M20 26l8 4-8 4zM44 26l-8 4 8 4z" fill="#1a2a10"/><path d="M24 44h16" stroke="#1a2a10" stroke-width="3"/>'],
  bd_vet: ['#ffd84a', '#8a5a00', '<path d="M32 4l24 10v18c0 14-11 24-24 28C19 56 8 46 8 32V14z"/><path d="M32 16l4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1z" fill="#5a3a00"/>'],
};
let uid = 0;
export function badgeSVG(id, size = 22) {
  if (!id || id === 'bd_none') return '';
  const u = `b${uid++}`;
  if (id === 'bd_dev') {
    // the DEV badge: a hexagon with a rainbow edge that spins, a dark core, a glowing </> and an orbiting spark
    return `<svg class="bdg bdg-dev" width="${size}" height="${size}" viewBox="0 0 64 64" aria-label="DEVELOPER"><defs><linearGradient id="${u}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff3cac"><animate attributeName="stop-color" values="#ff3cac;#2bd2ff;#2bff88;#ffe14a;#ff3cac" dur="3s" repeatCount="indefinite"/></stop><stop offset="1" stop-color="#2bd2ff"><animate attributeName="stop-color" values="#2bd2ff;#2bff88;#ffe14a;#ff3cac;#2bd2ff" dur="3s" repeatCount="indefinite"/></stop></linearGradient><radialGradient id="${u}c"><stop offset="0" stop-color="#14361f"/><stop offset="1" stop-color="#050a07"/></radialGradient></defs>`
      + `<g><animateTransform attributeName="transform" type="rotate" values="0 32 32;360 32 32" dur="8s" repeatCount="indefinite"/><path d="M32 3l25 14.5v29L32 61 7 46.5v-29z" fill="url(#${u}r)"/></g>`
      + `<path d="M32 9l20 11.5v23L32 55 12 43.5v-23z" fill="url(#${u}c)" stroke="#2bff88" stroke-opacity=".5"/>`
      + `<text x="32" y="38.5" text-anchor="middle" font-family="monospace" font-weight="900" font-size="17" fill="#5dffa6" style="filter:drop-shadow(0 0 3px #2bff88)">&lt;/&gt;<animate attributeName="opacity" values="1;1;.35;1;1;.6;1" dur="2.3s" repeatCount="indefinite"/></text>`
      + `<circle r="2.6" fill="#fff"><animateMotion dur="2.4s" repeatCount="indefinite" path="M32 3l25 14.5v29L32 61 7 46.5v-29z"/></circle></svg>`;
  }
  const b = BADGE[id];
  if (!b) return '';
  const shine = id === 'bd_crown' || id === 'bd_diamond' || id === 'bd_vet'
    ? `<rect x="-30" y="0" width="14" height="64" fill="#fff" opacity=".45" transform="skewX(-20)"><animate attributeName="x" values="-30;90;90" dur="2.6s" repeatCount="indefinite"/></rect>` : '';
  return `<svg class="bdg" width="${size}" height="${size}" viewBox="0 0 64 64"><defs><linearGradient id="${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b[0]}"/><stop offset="1" stop-color="${b[1]}"/></linearGradient><clipPath id="${u}k">${b[2].replace(/fill="[^"]*"/g, '')}</clipPath></defs><g fill="url(#${u})" stroke="rgba(0,0,0,.35)" stroke-width="1.5">${b[2]}</g>${shine ? `<g clip-path="url(#${u}k)">${shine}</g>` : ''}</svg>`;
}

// ---------------------------------------------------------------- titles, calling cards, the player card
export function titleHTML(id) {
  const it = PROFILE_ITEMS[id];
  if (!it || id === 'ti_none') return '';
  return `<span class="ttl r-${it.rarity}${id === 'ti_dev' ? ' ttl-dev' : ''}${id === 'ti_unstop' ? ' ttl-gold' : ''}" data-t="${it.name}">${it.name}</span>`;
}
export const cardClass = (id) => `pcard pc-${(PROFILE_ITEMS[id] ? id : 'cd_classic').slice(3)}`;
// the player card: the calling card behind your badge, name, title and level
export function playerCardHTML({ name, card, badge, title, lv = 1, extra = '' }) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<div class="${cardClass(card)}">${card === 'cd_dev' ? '<i class="pc-rain"></i>' : ''}<div class="pc-in">${badgeSVG(badge, 40)}<div class="pc-txt"><b>${esc(name)}</b>${titleHTML(title)}</div><span class="pc-lv">LV ${lv}</span></div>${extra}</div>`;
}

// ---------------------------------------------------------------- sprays: pixel art, 12 x 12
const SPRAY = {
  sp_gg: { px: ['............', '.###....###.', '#...#..#...#', '#......#....', '#.###..#.###', '#...#..#...#', '.###....###.', '............', '..+..++..+..', '...++..++...', '............', '............'], pal: { '#': [0.15, 0.95, 0.4], '+': [1, 1, 1] } },
  sp_heart: { px: ['............', '..##....##..', '.####..####.', '############', '############', '############', '.##########.', '..########..', '...######...', '....####....', '.....##.....', '............'], pal: { '#': [1, 0.2, 0.35] } },
  sp_smile: { px: ['....####....', '..##++++##..', '.#++++++++#.', '#++#++++#++#', '#++#++++#++#', '#++++++++++#', '#+#++++++#+#', '#++#++++#++#', '.#++####++#.', '..##++++##..', '....####....', '............'], pal: { '#': [0.1, 0.1, 0.1], '+': [1, 0.85, 0.15] } },
  sp_skull: { px: ['...######...', '..########..', '.##########.', '.#..####..#.', '.#..####..#.', '.##########.', '..###..###..', '...######...', '...#.##.#...', '...######...', '............', '............'], pal: { '#': [0.95, 0.95, 0.92] } },
  sp_fire: { px: ['.....#......', '....##...#..', '....###..##.', '...####.###.', '..##+######.', '..#++#####..', '.##+++####..', '.#++o++###..', '.#+ooo++##..', '..#+oo++#...', '...####.....', '............'], pal: { '#': [1, 0.25, 0.05], '+': [1, 0.6, 0.1], o: [1, 0.95, 0.4] } },
  sp_crown: { px: ['............', '#....#....#.', '##..###..##.', '###.###.###.', '###########.', '###########.', '#+###+###+#.', '###########.', '###########.', '............', '............', '............'], pal: { '#': [1, 0.78, 0.15], '+': [0.9, 0.1, 0.3] } },
  sp_dev: { px: ['............', '...#....#...', '..#....#.#..', '.#....#...#.', '#.....#....#', '.#...#....#.', '..#..#...#..', '...#.#..#...', '....#.......', '............', '.DEV........', '............'], pal: { '#': [0.25, 1, 0.55], D: [0.25, 1, 0.55], E: [0.25, 1, 0.55], V: [0.25, 1, 0.55] } },
};
export const sprayDef = (id) => SPRAY[id] || SPRAY.sp_gg;
export function spraySVG(id, size = 48) {
  const s = sprayDef(id);
  let r = '';
  s.px.forEach((row, y) => [...row].forEach((ch, x) => { const c = s.pal[ch]; if (c) r += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="rgb(${c.map((v) => Math.round(v * 255)).join(',')})"/>`; }));
  return `<svg width="${size}" height="${size}" viewBox="0 0 12 12" shape-rendering="crispEdges">${r}</svg>`;
}

// ---------------------------------------------------------------- a preview for an item card (instead of a 3D portrait)
const DFX_ICON = { dfx_coins: ['●●●', '#ffcc33'], dfx_smoke: ['☁', '#9aa0aa'], dfx_confetti: ['✦✧✦', '#ff5ec4'], dfx_pixels: ['▦', '#4cf'], dfx_balloons: ['◎', '#ff4d6d'], dfx_lightning: ['ϟ', '#bfe3ff'], dfx_blackhole: ['◉', '#a64dff'], dfx_dev: ['</>', '#2bff88'] };
const CHARM_ICON = { ch_none: '—', ch_dice: '⚀', ch_duck: '🦆', ch_skull: '☠', ch_crown: '♛', ch_gem: '◆', ch_dev: '▣' };
const PET_ICON = { pet_none: '—', pet_dog: '🐶', pet_cat: '🐱', pet_robot: '🤖', pet_dragon: '🐉', pet_dev: '▣' };
export function previewHTML(id) {
  const it = PROFILE_ITEMS[id];
  if (!it) return '';
  if (it.slot === 'badge') return `<div class="pv pv-badge">${badgeSVG(id, 64) || '<span class="pv-x">—</span>'}</div>`;
  if (it.slot === 'title') return `<div class="pv pv-title">${titleHTML(id) || '<span class="pv-x">—</span>'}</div>`;
  if (it.slot === 'card') return `<div class="pv pv-card"><div class="${cardClass(id)}">${id === 'cd_dev' ? '<i class="pc-rain"></i>' : ''}</div></div>`;
  if (it.slot === 'spray') return `<div class="pv pv-spray">${spraySVG(id, 64)}</div>`;
  if (it.slot === 'deathfx') { const [g, c] = DFX_ICON[id] || ['?', '#fff']; return `<div class="pv pv-icon${id === 'dfx_dev' ? ' pv-glitch' : ''}" style="--c:${c}">${g}</div>`; }
  if (it.slot === 'charm') return `<div class="pv pv-icon${id === 'ch_dev' ? ' pv-glitch' : ''}" style="--c:#fff">${CHARM_ICON[id] || '?'}</div>`;
  if (it.slot === 'pet') return `<div class="pv pv-icon${id === 'pet_dev' ? ' pv-glitch' : ''}" style="--c:#fff">${PET_ICON[id] || '?'}</div>`;
  return '';
}

// ---------------------------------------------------------------- weapon charms: parts hanging below the clip (0, 0, 0)
// (gun-style parts: c centre, s size, col, em, shape, m material; y goes down from the ring)
export function charmParts(id, t = 0) {
  const P = (c, s, col, o = {}) => ({ c, s, col, ...o });
  const ring = [P([0, -0.004, 0], [0.012, 0.012, 0.004], [0.75, 0.76, 0.8], { shape: 'cyl', m: 'steel', ry: Math.PI / 2 }), P([0, -0.016, 0], [0.003, 0.018, 0.003], [0.6, 0.6, 0.64], { m: 'steel' })];
  const y = -0.04;
  switch (id) {
    case 'ch_dice': return [...ring, P([0, y, 0], [0.026, 0.026, 0.026], [0.95, 0.95, 0.94], { shape: 0.005 }), P([0.0135, y + 0.006, 0.006], [0.002, 0.006, 0.006], [0.1, 0.1, 0.1]), P([0.0135, y - 0.006, -0.006], [0.002, 0.006, 0.006], [0.1, 0.1, 0.1]), P([-0.0135, y, 0], [0.002, 0.006, 0.006], [0.85, 0.1, 0.1])];
    case 'ch_duck': return [...ring, P([0, y - 0.004, 0.002], [0.03, 0.022, 0.034], [1, 0.85, 0.1], { shape: 'sphere' }), P([0, y + 0.012, -0.01], [0.018, 0.018, 0.018], [1, 0.85, 0.1], { shape: 'sphere' }), P([0, y + 0.01, -0.022], [0.008, 0.004, 0.01], [1, 0.45, 0.05]), P([0.008, y + 0.016, -0.016], [0.003, 0.003, 0.003], [0.05, 0.05, 0.05], { shape: 'sphere' }), P([-0.008, y + 0.016, -0.016], [0.003, 0.003, 0.003], [0.05, 0.05, 0.05], { shape: 'sphere' })];
    case 'ch_skull': return [...ring, P([0, y, 0], [0.028, 0.026, 0.028], [0.93, 0.92, 0.88], { shape: 'sphere' }), P([0, y - 0.014, -0.002], [0.018, 0.01, 0.018], [0.93, 0.92, 0.88], { shape: 0.003 }), P([0.0145, y + 0.002, -0.006], [0.002, 0.007, 0.007], [0.05, 0.05, 0.05]), P([0.0145, y + 0.002, 0.006], [0.002, 0.007, 0.007], [0.05, 0.05, 0.05]), P([-0.0145, y + 0.002, -0.006], [0.002, 0.007, 0.007], [0.05, 0.05, 0.05]), P([-0.0145, y + 0.002, 0.006], [0.002, 0.007, 0.007], [0.05, 0.05, 0.05])];
    case 'ch_crown': return [...ring, P([0, y, 0], [0.03, 0.014, 0.03], [1, 0.78, 0.15], { shape: 'cyl', rx: Math.PI / 2, m: 'brass' }), ...[0, 1.57, 3.14, 4.71].map((a) => P([Math.cos(a) * 0.013, y + 0.012, Math.sin(a) * 0.013], [0.006, 0.012, 0.006], [1, 0.78, 0.15], { m: 'brass' })), P([0.0155, y, 0], [0.002, 0.005, 0.005], [0.9, 0.1, 0.3], { em: 0.5 })];
    case 'ch_gem': return [...ring, P([0, y, 0], [0.022, 0.032, 0.022], [0.2, 0.9, 1], { rx: 0.785, rz: 0.785, em: 0.55 + 0.25 * Math.sin(t * 4), m: 'glass' })];
    case 'ch_dev': return [...ring, P([0, y, 0], [0.006, 0.032, 0.03], [0.04, 0.2, 0.08]), ...[-0.01, 0, 0.01].flatMap((z) => [P([0.004, y + 0.017, z], [0.002, 0.006, 0.003], [0.8, 0.8, 0.82], { m: 'steel' }), P([0.004, y - 0.017, z], [0.002, 0.006, 0.003], [0.8, 0.8, 0.82], { m: 'steel' })]), P([0.0035, y, 0], [0.002, 0.014, 0.014], [0.2, 1, 0.5], { em: 0.7 + 0.3 * Math.sin(t * 9) }), P([-0.0035, y, 0], [0.002, 0.014, 0.014], [0.2, 1, 0.5], { em: 0.7 + 0.3 * Math.sin(t * 9) })];
    default: return [];
  }
}

// ---------------------------------------------------------------- lobby pets (drawn beside you on the home screen)
// base: where it stands (world), yaw: which way it faces, t: time. Returns render parts with model matrices.
const pm = [];
export function petParts(id, base, yaw, t) {
  const out = [], B = mat4(), L = mat4();
  let n = 0;
  compose(B, base, [0, yaw, 0], [1.6, 1.6, 1.6]);     // pets are drawn a bit bigger than life so they read next to you
  const box = (c, s, col, o = {}) => {
    const m = pm[n] || (pm[n] = mat4()); n++;
    compose(L, c, [o.rx || 0, o.ry || 0, o.rz || 0], s);
    mul(m, B, L);
    out.push({ model: m, scale: s, color: col, emissive: o.em || 0, shape: o.shape ?? 0.02, mat: o.mat, alpha: o.alpha, edges: 0 });
  };
  const s = Math.sin(t * 2), wag = Math.sin(t * 12) * 0.6, breathe = Math.sin(t * 2.2) * 0.006;
  if (id === 'pet_dog') {
    const F = [0.82, 0.6, 0.32], D = [0.45, 0.3, 0.15];
    box([0, 0.24 + breathe, 0], [0.18, 0.16, 0.34], F);
    box([0, 0.36, -0.2], [0.16, 0.15, 0.15], F);
    box([0, 0.33, -0.3], [0.09, 0.07, 0.08], [0.9, 0.75, 0.5]);
    box([0, 0.35, -0.345], [0.035, 0.03, 0.02], [0.05, 0.05, 0.05], { shape: 'sphere' });
    for (const x of [-0.05, 0.05]) { box([x, 0.4, -0.275], [0.02, 0.022, 0.01], [0.05, 0.05, 0.05], { shape: 'sphere' }); box([x * 1.6, 0.42, -0.18], [0.04, 0.1, 0.06], D, { rz: x > 0 ? -0.3 : 0.3 }); }
    for (const [x, z] of [[-0.06, -0.12], [0.06, -0.12], [-0.06, 0.12], [0.06, 0.12]]) box([x, 0.08, z], [0.05, 0.16, 0.05], F);
    box([0, 0.32, 0.2], [0.03, 0.03, 0.14], F, { rx: -0.7, ry: wag });
    box([0, 0.3, -0.14], [0.17, 0.03, 0.04], [0.9, 0.1, 0.1]);
  } else if (id === 'pet_cat') {
    const F = [0.25, 0.25, 0.27], W = [0.95, 0.95, 0.95];
    box([0, 0.16, 0.02], [0.16, 0.24, 0.2], F, { rx: -0.25 });
    box([0, 0.33 + breathe, -0.06], [0.14, 0.12, 0.12], F);
    box([0, 0.3, -0.12], [0.07, 0.05, 0.03], W);
    for (const x of [-0.04, 0.04]) { box([x, 0.4, -0.06], [0.035, 0.05, 0.02], F, { rz: x > 0 ? -0.3 : 0.3 }); box([x * 0.9, 0.345, -0.122], [0.022, 0.016, 0.005], [0.4, 1, 0.3], { em: 0.6 * (Math.sin(t * 0.7) > -0.95 ? 1 : 0) }); }
    for (const x of [-0.04, 0.04]) box([x, 0.03, -0.08], [0.04, 0.06, 0.06], W);
    box([0.09, 0.06, 0.12], [0.025, 0.025, 0.2], F, { ry: 0.6 + s * 0.4 });
  } else if (id === 'pet_robot') {
    const h = 0.42 + Math.sin(t * 2.5) * 0.04, M = [0.8, 0.82, 0.86];
    box([0, h, 0], [0.2, 0.18, 0.18], M, { mat: 'metal' });
    box([0, h + 0.01, -0.092], [0.15, 0.08, 0.005], [0.05, 0.08, 0.1]);
    for (const x of [-0.035, 0.035]) box([x, h + 0.01, -0.096], [0.025, 0.03, 0.004], [0.2, 0.9, 1], { em: Math.sin(t * 1.1) > -0.9 ? 1 : 0 });
    box([0, h + 0.13, 0], [0.006, 0.08, 0.006], [0.3, 0.3, 0.3]);
    box([0, h + 0.18, 0], [0.025, 0.025, 0.025], [1, 0.3, 0.2], { em: 0.6 + 0.4 * Math.sin(t * 6), shape: 'sphere' });
    box([0, h - 0.14, 0], [0.09, 0.03, 0.09], [0.4, 0.8, 1], { em: 0.8, shape: 'cyl', alpha: 0.7 });
    box([0, 0.005, 0], [0.12, 0.004, 0.12], [0, 0, 0], { shape: 'sphere', alpha: 0.3 });
  } else if (id === 'pet_dragon') {
    const R = [0.75, 0.15, 0.1], Y = [1, 0.7, 0.2], h = 0.5 + Math.sin(t * 3) * 0.05, flap = Math.sin(t * 9) * 0.7;
    box([0, h, 0], [0.13, 0.13, 0.26], R);
    box([0, h + 0.09, -0.16], [0.11, 0.1, 0.13], R);
    box([0, h + 0.07, -0.24], [0.07, 0.05, 0.07], R);
    for (const x of [-0.035, 0.035]) { box([x, h + 0.12, -0.215], [0.02, 0.02, 0.01], Y, { em: 0.9, shape: 'sphere' }); box([x, h + 0.16, -0.13], [0.015, 0.06, 0.015], [0.95, 0.9, 0.8], { rx: 0.5 }); }
    for (const sd of [-1, 1]) box([sd * 0.15, h + 0.06, 0.02], [0.2, 0.01, 0.14], [0.55, 0.08, 0.06], { rz: sd * flap });
    box([0, h - 0.02, 0.22], [0.04, 0.04, 0.18], R, { rx: 0.4 + s * 0.2 });
    box([0, h - 0.04, -0.01], [0.09, 0.05, 0.18], Y);
    const puff = (t % 4) < 0.6;
    if (puff) for (let i = 0; i < 4; i++) { const k = ((t % 4) / 0.6 + i * 0.25) % 1; box([Math.sin(i * 7) * 0.02 * k, h + 0.06 + k * 0.03, -0.3 - k * 0.25], [0.03 + k * 0.06, 0.03 + k * 0.06, 0.03 + k * 0.06], [1, 0.5 + 0.4 * (1 - k), 0.1], { em: 1, shape: 'sphere', alpha: 1 - k }); }
  } else if (id === 'pet_dev') {
    // BYTE: a floating cube that glitches between colours, with orbiting bits and a </> face
    const h = 0.55 + Math.sin(t * 2) * 0.05, g = Math.floor(t * 7) % 9 === 0;
    const col = g ? [1, 0.2, 0.6] : [0.1, 0.95, 0.5];
    box([g ? 0.02 : 0, h, 0], [0.18, 0.18, 0.18], [0.03, 0.06, 0.04], { ry: t * 0.6, rx: t * 0.4 });
    box([0, h, 0], [0.2, 0.2, 0.2], col, { ry: t * 0.6, rx: t * 0.4, em: 0.9, alpha: 0.25 });
    for (let i = 0; i < 6; i++) { const a = t * 1.8 + i * 1.047; box([Math.cos(a) * 0.2, h + Math.sin(a * 1.3) * 0.08, Math.sin(a) * 0.2], [0.025, 0.025, 0.025], i % 2 ? col : [0.3, 0.6, 1], { em: 1, shape: 0 }); }
    box([0, 0.005, 0], [0.16, 0.004, 0.16], col, { shape: 'sphere', em: 0.6, alpha: 0.35 });
  }
  return out;
}
