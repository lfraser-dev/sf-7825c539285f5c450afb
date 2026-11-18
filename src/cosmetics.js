// Cosmetics: outfit pieces + weapon skins, the shop catalogue, your wallet and what you own / wear.
// Everything is saved in this browser. Earning credits will come with the battle pass.
import { CLASSES, CLASS_ORDER } from './classes.js';

export const CURRENCY = 'CREDITS';
const START_CREDITS = 10000;

export const SLOTS = [
  { id: 'head', name: 'HEAD' },
  { id: 'hairstyle', name: 'HAIR' },
  { id: 'haircol', name: 'HAIR COLOUR' },
  { id: 'face', name: 'FACE' },
  { id: 'beard', name: 'BEARD' },
  { id: 'top', name: 'TOP' },
  { id: 'outer', name: 'OUTERWEAR' },
  { id: 'legs', name: 'LEGS' },
  { id: 'shoes', name: 'SHOES' },
  { id: 'gloves', name: 'GLOVES' },
  { id: 'neck', name: 'NECK' },
  { id: 'body', name: 'SKIN TONE' },
  { id: 'wskin', name: 'WEAPON SKIN' },
  { id: 'emote', name: 'VICTORY POSE' },
];

export const RARITY = {
  common: { name: 'COMMON', color: [0.62, 0.64, 0.68] },
  rare: { name: 'RARE', color: [0.2, 0.55, 1] },
  epic: { name: 'EPIC', color: [0.68, 0.3, 1] },
  legendary: { name: 'LEGENDARY', color: [1, 0.68, 0.08] },
};

const C = {
  red: [0.92, 0.1, 0.08], white: [0.95, 0.95, 0.96], black: [0.08, 0.08, 0.09], char: [0.2, 0.2, 0.22], grey: [0.5, 0.51, 0.54],
  blue: [0.15, 0.45, 0.95], navy: [0.1, 0.16, 0.36], sky: [0.55, 0.82, 1], gold: [1, 0.72, 0.1], orange: [1, 0.45, 0.08],
  pink: [0.95, 0.25, 0.6], purple: [0.5, 0.2, 0.85], mint: [0.3, 0.95, 0.75], olive: [0.33, 0.36, 0.2], tan: [0.62, 0.52, 0.36],
  camo: [0.28, 0.32, 0.22], lime: [0.6, 0.95, 0.15], cream: [0.92, 0.88, 0.78], brown: [0.4, 0.27, 0.17],
};

// apply: fields merged into the contestant's outfit. price 0 = free / given to everyone.
export const ITEMS = {
  // ---- head
  h_default: { slot: 'head', name: 'CLASS DEFAULT', price: 0, rarity: 'common', apply: {} },
  h_hair: { slot: 'head', name: 'BARE HEAD', price: 0, rarity: 'common', apply: { head: 'hair', hair: [0.08, 0.06, 0.05] } },
  h_redcap: { slot: 'head', name: 'STUDIO CAP', price: 400, rarity: 'common', apply: { head: 'cap', headCol: C.red, hair: C.black } },
  h_blackcap: { slot: 'head', name: 'MIDNIGHT CAP', price: 400, rarity: 'common', apply: { head: 'cap', headCol: C.black, hair: C.black } },
  h_beanie: { slot: 'head', name: 'WARM-UP BEANIE', price: 500, rarity: 'common', apply: { head: 'beanie', headCol: C.orange, accent: C.black, hair: C.black } },
  h_bucket: { slot: 'head', name: 'BUCKET HAT', price: 900, rarity: 'rare', apply: { head: 'bucket', headCol: C.tan, hair: C.black } },
  h_pinkhair: { slot: 'head', name: 'NEON DYE JOB', price: 1200, rarity: 'rare', apply: { head: 'spiky', hair: C.pink, hairGlow: 0.12 } },
  h_helmet: { slot: 'head', name: 'RIOT HELMET', price: 1400, rarity: 'rare', apply: { head: 'helmet', headCol: C.char, visor: C.sky } },
  h_whitemask: { slot: 'head', name: 'SHOWMAN MASK', price: 2200, rarity: 'epic', apply: { head: 'facemask', headCol: C.white, visor: C.black, hair: C.black, maskStripe: C.red, visorGlow: 0 } },
  h_goldhelm: { slot: 'head', name: 'GOLD STANDARD', price: 3500, rarity: 'legendary', apply: { head: 'helmet', headCol: C.gold, visor: C.black, headMat: 'brass' } },
  h_neonvisor: { slot: 'head', name: 'NEON VISOR', price: 1800, rarity: 'epic', apply: { head: 'helmet', headCol: C.black, visor: [0.1, 0.95, 0.85], visorGlow: 0.95 } },
  h_frostbeanie: { slot: 'head', name: 'ICEBREAKER BEANIE', price: 600, rarity: 'common', apply: { head: 'beanie', headCol: C.sky, accent: C.white, hair: C.black } },
  h_inferno: { slot: 'head', name: 'INFERNO MASK', price: 3200, rarity: 'legendary', apply: { head: 'facemask', headCol: [0.08, 0.05, 0.04], visor: C.orange, visorGlow: 0.95, hair: C.black, maskStripe: [0.9, 0.2, 0.05] } },
  h_gilded: { slot: 'head', name: 'GILDED MASK', price: 4000, rarity: 'legendary', apply: { head: 'facemask', headCol: C.gold, visor: C.black, visorGlow: 0, hair: C.black, maskStripe: null, headMat: 'brass' } },
  h_redmask: { slot: 'head', name: 'FINALIST MASK', price: 3500, rarity: 'legendary', apply: { head: 'facemask', headCol: C.black, visor: C.red, visorGlow: 0.95, hair: C.red, maskStripe: null } },
  // ---- top
  t_default: { slot: 'top', name: 'CLASS DEFAULT', price: 0, rarity: 'common', apply: {} },
  t_white: { slot: 'top', name: 'PLAIN WHITE TEE', price: 0, rarity: 'common', apply: { top: C.white, topStyle: 'tee', logo: null, print: null } },
  t_black: { slot: 'top', name: 'BLACK TEE', price: 300, rarity: 'common', apply: { top: C.black, topStyle: 'tee', logo: null, print: C.white } },
  t_red: { slot: 'top', name: 'STUDIO RED TEE', price: 500, rarity: 'common', apply: { top: C.red, topStyle: 'tee', logo: null, print: C.white } },
  t_mint: { slot: 'top', name: 'MINT CONDITION', price: 900, rarity: 'rare', apply: { top: C.mint, topStyle: 'tee', logo: null, print: C.black } },
  t_tiger: { slot: 'top', name: 'TIGER TEE', price: 700, rarity: 'common', apply: { top: C.orange, topStyle: 'tee', logo: null, print: C.black } },
  t_circuit: { slot: 'top', name: 'OVERCLOCK HOODIE', price: 1900, rarity: 'epic', apply: { top: C.black, topStyle: 'hoodie', accent: [0.1, 0.95, 0.85], logo: [0.1, 0.95, 0.85] } },
  t_purple: { slot: 'top', name: 'ROYAL HOODIE', price: 1500, rarity: 'epic', apply: { top: C.purple, topStyle: 'hoodie', accent: C.gold, logo: C.gold } },
  // ---- outerwear
  o_default: { slot: 'outer', name: 'CLASS DEFAULT', price: 0, rarity: 'common', apply: {} },
  o_none: { slot: 'outer', name: 'NOTHING', price: 0, rarity: 'common', apply: { jacket: null, vest: null } },
  o_bomber: { slot: 'outer', name: 'BLACK BOMBER', price: 800, rarity: 'common', apply: { jacket: [0.1, 0.11, 0.12], jacketStyle: 'bomber', trim: [0.18, 0.18, 0.2], vest: null } },
  o_trackred: { slot: 'outer', name: 'TRACK JACKET', price: 1000, rarity: 'rare', apply: { jacket: C.red, jacketStyle: 'track', stripe: C.white, trim: [0.7, 0.07, 0.06], vest: null } },
  o_camovest: { slot: 'outer', name: 'FIELD VEST', price: 1000, rarity: 'rare', apply: { vest: C.camo, vestStyle: 'field', camo2: [0.16, 0.18, 0.12], camo3: [0.45, 0.42, 0.3], jacket: null } },
  o_digital: { slot: 'outer', name: 'URBAN DIGITAL VEST', price: 1200, rarity: 'rare', apply: { vest: [0.22, 0.32, 0.46], vestStyle: 'field', camo2: [0.08, 0.1, 0.14], camo3: [0.55, 0.62, 0.7], jacket: null } },
  o_molten: { slot: 'outer', name: 'MAGMA BOMBER', price: 2400, rarity: 'epic', apply: { jacket: [0.07, 0.06, 0.06], jacketStyle: 'bomber', trim: C.orange, vest: null } },
  o_frost: { slot: 'outer', name: 'WHITEOUT PUFFER', price: 2000, rarity: 'epic', apply: { jacket: C.white, jacketStyle: 'puffer', vest: null } },
  o_puffer: { slot: 'outer', name: 'ARCTIC PUFFER', price: 1800, rarity: 'epic', apply: { jacket: C.sky, jacketStyle: 'puffer', vest: null } },
  o_goldvest: { slot: 'outer', name: 'HIGH ROLLER VEST', price: 3000, rarity: 'legendary', apply: { vest: [0.95, 0.7, 0.15], vestStyle: 'waistcoat', jacket: null } },
  o_whitejacket: { slot: 'outer', name: 'CHAMPION JACKET', price: 3000, rarity: 'legendary', apply: { jacket: C.white, jacketStyle: 'champion', trim: C.red, vest: null } },
  // ---- legs
  l_default: { slot: 'legs', name: 'CLASS DEFAULT', price: 0, rarity: 'common', apply: {} },
  l_black: { slot: 'legs', name: 'BLACK CARGOS', price: 0, rarity: 'common', apply: { bottom: C.black, legStyle: 'cargo' } },
  l_camo: { slot: 'legs', name: 'WOODLAND PANTS', price: 600, rarity: 'common', apply: { bottom: C.camo, legStyle: 'camo', camo2: [0.16, 0.18, 0.12], camo3: [0.45, 0.42, 0.3] } },
  l_tan: { slot: 'legs', name: 'DESERT CHINOS', price: 600, rarity: 'common', apply: { bottom: C.tan, legStyle: 'chino' } },
  l_red: { slot: 'legs', name: 'RED TRACKIES', price: 1100, rarity: 'rare', apply: { bottom: C.red, legStyle: 'track', stripe: C.white } },
  l_digital: { slot: 'legs', name: 'URBAN DIGITAL PANTS', price: 800, rarity: 'rare', apply: { bottom: [0.22, 0.32, 0.46], legStyle: 'camo', camo2: [0.08, 0.1, 0.14], camo3: [0.55, 0.62, 0.7] } },
  l_neon: { slot: 'legs', name: 'NEON TRACKIES', price: 1300, rarity: 'rare', apply: { bottom: C.black, legStyle: 'track', stripe: [0.1, 0.95, 0.85] } },
  l_white: { slot: 'legs', name: 'SPOTLESS WHITES', price: 1600, rarity: 'epic', apply: { bottom: C.white, legStyle: 'chino' } },
  // ---- shoes
  s_default: { slot: 'shoes', name: 'CLASS DEFAULT', price: 0, rarity: 'common', apply: {} },
  s_black: { slot: 'shoes', name: 'COMBAT BOOTS', price: 0, rarity: 'common', apply: { shoes: C.black, shoeStyle: 'boot' } },
  s_white: { slot: 'shoes', name: 'CLEAN KICKS', price: 500, rarity: 'common', apply: { shoes: C.white, shoeStyle: 'kicks', accent: [0.1, 0.1, 0.12] } },
  s_lime: { slot: 'shoes', name: 'VOLT RUNNERS', price: 1000, rarity: 'rare', apply: { shoes: C.lime, shoeStyle: 'runner', soleCol: C.lime } },
  s_magma: { slot: 'shoes', name: 'MAGMA RUNNERS', price: 1200, rarity: 'rare', apply: { shoes: C.black, shoeStyle: 'runner', soleCol: C.orange } },
  s_ice: { slot: 'shoes', name: 'ICE KICKS', price: 900, rarity: 'rare', apply: { shoes: C.sky, shoeStyle: 'kicks', accent: C.white } },
  s_gold: { slot: 'shoes', name: 'GOLDEN SOLES', price: 2400, rarity: 'legendary', apply: { shoes: [1, 0.76, 0.22], shoeStyle: 'gold' } },
  // ---- gloves
  g_default: { slot: 'gloves', name: 'CLASS DEFAULT', price: 0, rarity: 'common', apply: {} },
  g_black: { slot: 'gloves', name: 'TACTICAL GLOVES', price: 0, rarity: 'common', apply: { gloves: [0.1, 0.1, 0.11], gloveStyle: 'tactical' } },
  g_red: { slot: 'gloves', name: 'BOXING TAPE', price: 500, rarity: 'common', apply: { gloves: C.red, gloveStyle: 'tape' } },
  g_neon: { slot: 'gloves', name: 'CIRCUIT GLOVES', price: 1100, rarity: 'rare', apply: { gloves: [0.1, 0.95, 0.85], gloveStyle: 'tactical' } },
  g_gold: { slot: 'gloves', name: 'GOLD GLOVES', price: 2600, rarity: 'legendary', apply: { gloves: C.gold, gloveStyle: 'host' } },
  g_white: { slot: 'gloves', name: 'HOST GLOVES', price: 900, rarity: 'rare', apply: { gloves: C.white, gloveStyle: 'host' } },
  // ---- neck
  n_default: { slot: 'neck', name: 'CLASS DEFAULT', price: 0, rarity: 'common', apply: {} },
  n_none: { slot: 'neck', name: 'NOTHING', price: 0, rarity: 'common', apply: { scarf: null, neckStyle: null } },
  n_red: { slot: 'neck', name: 'RED BANDANA', price: 400, rarity: 'common', apply: { scarf: C.red, neckStyle: 'bandana' } },
  n_mint: { slot: 'neck', name: 'MINT SCARF', price: 700, rarity: 'rare', apply: { scarf: C.mint, neckStyle: 'scarf', scarfStripe: C.white } },
  n_neon: { slot: 'neck', name: 'NEON SCARF', price: 800, rarity: 'rare', apply: { scarf: C.black, neckStyle: 'scarf', scarfStripe: [0.1, 0.95, 0.85] } },
  n_gold: { slot: 'neck', name: 'GOLD CHAIN', price: 2000, rarity: 'epic', apply: { scarf: C.gold, neckStyle: 'chain' } },
  // ---- skin tone (free)
  b_default: { slot: 'body', name: 'CLASS DEFAULT', price: 0, rarity: 'common', apply: {} },
  b_1: { slot: 'body', name: 'TONE 1', price: 0, rarity: 'common', apply: { skin: [0.95, 0.8, 0.68] } },
  b_2: { slot: 'body', name: 'TONE 2', price: 0, rarity: 'common', apply: { skin: [0.8, 0.6, 0.45] } },
  b_3: { slot: 'body', name: 'TONE 3', price: 0, rarity: 'common', apply: { skin: [0.56, 0.38, 0.26] } },
  b_4: { slot: 'body', name: 'TONE 4', price: 0, rarity: 'common', apply: { skin: [0.36, 0.24, 0.16] } },
  // ---- weapon skins (tint the gun's body; show on the gun in your hands too)
  w_default: { slot: 'wskin', name: 'FACTORY', price: 0, rarity: 'common', gun: null },
  w_crimson: { slot: 'wskin', name: 'CRIMSON', price: 800, rarity: 'common', gun: { main: C.red, dark: [0.35, 0.04, 0.03] } },
  w_arctic: { slot: 'wskin', name: 'ARCTIC', price: 800, rarity: 'common', gun: { main: [0.9, 0.92, 0.95], dark: [0.55, 0.6, 0.66] } },
  w_desert: { slot: 'wskin', name: 'DESERT OPS', price: 1000, rarity: 'rare', gun: { main: C.tan, dark: [0.3, 0.25, 0.17] } },
  w_toxic: { slot: 'wskin', name: 'TOXIC', price: 1600, rarity: 'epic', gun: { main: C.lime, dark: [0.08, 0.1, 0.06], glow: true } },
  w_gold: { slot: 'wskin', name: '24 KARAT', price: 4000, rarity: 'legendary', gun: { main: [1, 0.78, 0.2], dark: [0.55, 0.38, 0.06], glow: true } },
  // ---- hair (shows with BARE HEAD), hair colour, face shape and beards: mostly free, they're who you are
  hs_default: { slot: 'hairstyle', name: 'QUIFF', price: 0, rarity: 'common', apply: {}, sw: [0.3, 0.22, 0.16], fx: 'Hairstyles show when your headwear is BARE HEAD.' },
  hs_buzz: { slot: 'hairstyle', name: 'BUZZ CUT', price: 0, rarity: 'common', apply: { hairStyle: 'buzz' }, sw: [0.4, 0.33, 0.28] },
  hs_bald: { slot: 'hairstyle', name: 'BALD', price: 0, rarity: 'common', apply: { hairStyle: 'bald' }, sw: [0.86, 0.66, 0.54] },
  hs_flat: { slot: 'hairstyle', name: 'FLAT TOP', price: 0, rarity: 'common', apply: { hairStyle: 'flat' }, sw: [0.2, 0.15, 0.1] },
  hs_curtains: { slot: 'hairstyle', name: 'CURTAINS', price: 0, rarity: 'common', apply: { hairStyle: 'curtains' }, sw: [0.5, 0.38, 0.2] },
  hs_long: { slot: 'hairstyle', name: 'LONG', price: 0, rarity: 'common', apply: { hairStyle: 'long' }, sw: [0.35, 0.2, 0.1] },
  hs_pony: { slot: 'hairstyle', name: 'PONYTAIL', price: 0, rarity: 'common', apply: { hairStyle: 'ponytail' }, sw: [0.6, 0.45, 0.2] },
  hs_bun: { slot: 'hairstyle', name: 'TOP KNOT', price: 0, rarity: 'common', apply: { hairStyle: 'bun' }, sw: [0.15, 0.12, 0.1] },
  hs_afro: { slot: 'hairstyle', name: 'AFRO', price: 300, rarity: 'common', apply: { hairStyle: 'afro' }, sw: [0.1, 0.08, 0.07] },
  hs_dreads: { slot: 'hairstyle', name: 'DREADS', price: 300, rarity: 'common', apply: { hairStyle: 'dreads' }, sw: [0.25, 0.17, 0.1] },
  hs_spikes: { slot: 'hairstyle', name: 'SPIKES', price: 500, rarity: 'rare', apply: { hairStyle: 'spikes' }, sw: [0.9, 0.8, 0.3] },
  hs_mohawk: { slot: 'hairstyle', name: 'MOHAWK', price: 800, rarity: 'rare', apply: { hairStyle: 'mohawk' }, sw: [0.9, 0.2, 0.3] },
  hc_default: { slot: 'haircol', name: 'NATURAL', price: 0, rarity: 'common', apply: {}, sw: [0.2, 0.15, 0.1] },
  hc_black: { slot: 'haircol', name: 'BLACK', price: 0, rarity: 'common', apply: { hair: [0.05, 0.045, 0.045] } },
  hc_brown: { slot: 'haircol', name: 'BROWN', price: 0, rarity: 'common', apply: { hair: [0.3, 0.18, 0.09] } },
  hc_blonde: { slot: 'haircol', name: 'BLONDE', price: 0, rarity: 'common', apply: { hair: [0.85, 0.68, 0.32] } },
  hc_ginger: { slot: 'haircol', name: 'GINGER', price: 0, rarity: 'common', apply: { hair: [0.75, 0.33, 0.1] } },
  hc_grey: { slot: 'haircol', name: 'SILVER', price: 0, rarity: 'common', apply: { hair: [0.7, 0.71, 0.74] } },
  hc_white: { slot: 'haircol', name: 'BLEACHED', price: 200, rarity: 'common', apply: { hair: [0.95, 0.94, 0.9] } },
  hc_red: { slot: 'haircol', name: 'CHERRY RED', price: 400, rarity: 'rare', apply: { hair: [0.85, 0.08, 0.12] } },
  hc_blue: { slot: 'haircol', name: 'ELECTRIC BLUE', price: 400, rarity: 'rare', apply: { hair: [0.1, 0.4, 1] } },
  hc_pink: { slot: 'haircol', name: 'HOT PINK', price: 400, rarity: 'rare', apply: { hair: [1, 0.3, 0.65] } },
  hc_green: { slot: 'haircol', name: 'TOXIC GREEN', price: 400, rarity: 'rare', apply: { hair: [0.4, 0.95, 0.2] } },
  hc_neon: { slot: 'haircol', name: 'NEON GLOW', price: 1800, rarity: 'epic', apply: { hair: [0.2, 1, 0.9], hairGlow: 0.7 }, fx: 'Hair that glows in the dark.', live: true },
  hc_fire: { slot: 'haircol', name: 'EMBER GLOW', price: 1800, rarity: 'epic', apply: { hair: [1, 0.45, 0.08], hairGlow: 0.7 }, fx: 'Hair that glows like embers.', live: true },
  fc_default: { slot: 'face', name: 'OVAL', price: 0, rarity: 'common', apply: {}, sw: [0.86, 0.66, 0.54] },
  fc_square: { slot: 'face', name: 'SQUARE JAW', price: 0, rarity: 'common', apply: { faceShape: 'square' }, sw: [0.8, 0.6, 0.48] },
  fc_round: { slot: 'face', name: 'ROUND', price: 0, rarity: 'common', apply: { faceShape: 'round' }, sw: [0.9, 0.72, 0.6] },
  fc_slim: { slot: 'face', name: 'SLIM', price: 0, rarity: 'common', apply: { faceShape: 'slim' }, sw: [0.75, 0.55, 0.42] },
  bd_default: { slot: 'beard', name: 'CLEAN SHAVEN', price: 0, rarity: 'common', apply: {}, sw: [0.86, 0.66, 0.54] },
  bd_stubble: { slot: 'beard', name: 'STUBBLE', price: 0, rarity: 'common', apply: { beard: 'stubble' }, sw: [0.6, 0.48, 0.4] },
  bd_tache: { slot: 'beard', name: 'MOUSTACHE', price: 0, rarity: 'common', apply: { beard: 'moustache' }, sw: [0.3, 0.2, 0.14] },
  bd_goatee: { slot: 'beard', name: 'GOATEE', price: 0, rarity: 'common', apply: { beard: 'goatee' }, sw: [0.25, 0.17, 0.12] },
  bd_full: { slot: 'beard', name: 'FULL BEARD', price: 0, rarity: 'common', apply: { beard: 'full' }, sw: [0.2, 0.14, 0.1] },
  bd_long: { slot: 'beard', name: 'LONG BEARD', price: 400, rarity: 'rare', apply: { beard: 'long' }, sw: [0.5, 0.5, 0.52] },
  bd_handle: { slot: 'beard', name: 'HANDLEBAR', price: 600, rarity: 'rare', apply: { beard: 'handlebar' }, sw: [0.15, 0.1, 0.08] },
  // ---- victory poses: what you do on the results screen when you win
  e_pump: { slot: 'emote', name: 'FIST PUMP', price: 0, rarity: 'common', apply: { emote: 'victoryPump' }, sw: [0.9, 0.9, 0.9], fx: 'Punch the air.' },
  e_salute: { slot: 'emote', name: 'SALUTE', price: 600, rarity: 'common', apply: { emote: 'victorySalute' }, sw: [0.35, 0.45, 0.3], fx: 'A crisp salute to the crowd.' },
  e_flex: { slot: 'emote', name: 'FLEX', price: 900, rarity: 'rare', apply: { emote: 'victoryFlex' }, sw: [1, 0.5, 0.15], fx: 'Both arms up, show them off.' },
  e_guns: { slot: 'emote', name: 'FINGER GUNS', price: 1400, rarity: 'rare', apply: { emote: 'victoryGuns' }, sw: [0.3, 0.6, 1], fx: 'Pew pew at the camera.' },
  e_stare: { slot: 'emote', name: 'COLD STARE', price: 1800, rarity: 'epic', apply: { emote: 'victoryStare' }, sw: [0.5, 0.2, 0.8], fx: 'Arms crossed. Not impressed.' },
  e_dance: { slot: 'emote', name: 'SIDE STEP', price: 2500, rarity: 'epic', apply: { emote: 'victoryDance' }, sw: [1, 0.8, 0.2], fx: 'A little dance, side to side.' },
  // ---- live fabrics: clothes painted by the shader, like the live gun skins (they move)
  t_fx_holo: { slot: 'top', name: 'HOLO TEE', price: 2600, rarity: 'epic', apply: { top: [0.7, 0.5, 1.0], topStyle: 'tee', logo: null, print: null, fxTop: 46 }, fx: 'An oil-slick rainbow that slides as the camera moves.', live: true },
  t_fx_circuit: { slot: 'top', name: 'LIVE WIRE HOODIE', price: 3600, rarity: 'legendary', apply: { top: [0.1, 0.8, 0.72], topStyle: 'hoodie', logo: null, fxTop: 47 }, fx: 'Light pulses run along circuit traces all over it.', live: true },
  o_fx_storm: { slot: 'outer', name: 'STORMCELL PUFFER', price: 3200, rarity: 'epic', apply: { jacket: [0.3, 0.42, 0.8], jacketStyle: 'puffer', vest: null, fxJacket: 49 }, fx: 'Lightning crawls across the jacket.', live: true },
  o_fx_molten: { slot: 'outer', name: 'MAGMA CORE BOMBER', price: 4200, rarity: 'legendary', apply: { jacket: [0.9, 0.3, 0.06], jacketStyle: 'bomber', trim: [0.05, 0.04, 0.04], vest: null, fxJacket: 44 }, fx: 'Black rock with glowing cracks that drift and pulse.', live: true },
  o_fx_matter: { slot: 'outer', name: 'DARK MATTER BOMBER', price: 4800, rarity: 'legendary', apply: { jacket: [0.42, 0.1, 0.82], jacketStyle: 'bomber', trim: [0.1, 0.45, 1], vest: null, fxJacket: 45 }, fx: 'Swirling purple space with twinkling stars.', live: true },
  l_fx_frost: { slot: 'legs', name: 'FROSTBITE PANTS', price: 2400, rarity: 'epic', apply: { bottom: [0.72, 0.86, 1.0], legStyle: 'chino', fxBottom: 48 }, fx: 'Ice crystals that glitter as you move.', live: true },
  l_fx_molten: { slot: 'legs', name: 'LAVA TRACKIES', price: 3000, rarity: 'legendary', apply: { bottom: [0.85, 0.28, 0.05], legStyle: 'track', stripe: [1, 0.8, 0.3], fxBottom: 44 }, fx: 'Glowing cracks run down both legs.', live: true },
  // ---- live skins: patterns painted by the shader, and they react to how you play (see `fx` for what they do)
  w_digital: { slot: 'wskin', name: 'DIGITAL', price: 900, rarity: 'common', gun: { tex: 40, sw: [0.22, 0.32, 0.46] }, fx: 'Pixel camo in three blues.' },
  w_tiger: { slot: 'wskin', name: 'TIGER', price: 1200, rarity: 'rare', gun: { tex: 41, sw: [1, 0.45, 0.06] }, fx: 'Bold orange-and-black stripes.' },
  w_carbon: { slot: 'wskin', name: 'CARBON FIBRE', price: 1400, rarity: 'rare', gun: { tex: 42, sw: [0.12, 0.12, 0.14] }, fx: 'Woven carbon with a sheen that moves as you turn the gun.' },
  w_damascus: { slot: 'wskin', name: 'DAMASCUS', price: 2200, rarity: 'epic', gun: { tex: 43, sw: [0.6, 0.62, 0.66] }, fx: 'Folded steel, wavy layers of bright and dark.' },
  w_frost: { slot: 'wskin', name: 'FROSTBITE', price: 2400, rarity: 'epic', gun: { tex: 48, sw: [0.7, 0.85, 1] }, fx: 'Ice crystals that glitter. Keep firing and blue light cracks through from inside.', live: true },
  w_holo: { slot: 'wskin', name: 'HOLOGRAPHIC', price: 2600, rarity: 'epic', gun: { tex: 46, sw: [0.7, 0.4, 1] }, fx: 'An oil-slick rainbow that slides as you look around, and races while you shoot.', live: true },
  w_storm: { slot: 'wskin', name: 'STORMCELL', price: 2800, rarity: 'epic', gun: { tex: 49, sw: [0.5, 0.6, 1] }, fx: 'Lightning crawls over the gun and flashes harder when you fire.', live: true },
  w_circuit: { slot: 'wskin', name: 'OVERCLOCK', price: 3200, rarity: 'legendary', gun: { tex: 47, sw: [0.1, 0.95, 0.85] }, fx: 'Light pulses race along circuit traces, faster as you fire. Turns gold when you go on a streak.', live: true },
  w_molten: { slot: 'wskin', name: 'MOLTEN', price: 3600, rarity: 'legendary', gun: { tex: 44, sw: [1, 0.35, 0.05] }, fx: 'Black rock with glowing cracks that drift. Fire and it heats up until the whole gun is red-hot.', live: true },
  w_bloodline: { slot: 'wskin', name: 'BLOODLINE', price: 3800, rarity: 'legendary', gun: { tex: 50, sw: [0.85, 0.05, 0.04] }, fx: 'Red veins spread further with every kill this life and beat like a heart. Five kills and they turn gold.', live: true },
  w_darkmatter: { slot: 'wskin', name: 'DARK MATTER', price: 4500, rarity: 'legendary', gun: { tex: 45, sw: [0.45, 0.1, 0.85] }, fx: 'Swirling purple space with twinkling stars. It churns faster while you shoot.', live: true },
  w_diamond: { slot: 'wskin', name: 'DIAMOND', price: 5000, rarity: 'legendary', gun: { tex: 51, sw: [0.85, 0.93, 1] }, fx: 'Faceted crystal that throws sparkles as it moves.', live: true },
  w_aurum: { slot: 'wskin', name: 'AURUM', price: 5000, rarity: 'legendary', gun: { tex: 52, sw: [1, 0.8, 0.3] }, fx: 'Polished gold with light sweeping down it. Glows while you fire.', live: true },
};

export const FEATURED = ['w_molten', 'w_darkmatter', 'h_redmask'];

const ICON = { head: '◓', top: '▀', outer: '▣', legs: '▥', shoes: '▂', gloves: '✋', neck: '◡', body: '●', wskin: '⌐' };
export const iconFor = (slot) => ICON[slot] || '■';

// swatch colour for an item card
export function swatch(item) {
  if (item.sw) return item.sw;
  if (item.gun) return item.gun.sw || item.gun.main;
  const a = item.apply || {};
  return a.headCol || a.top || a.jacket || a.vest || a.bottom || a.shoes || a.gloves || a.scarf || a.skin || a.hair || null;
}

// ---------------------------------------------------------------- saved state
const KEY = 'semifinals.cosmetics';
export function loadCosmetics() {
  const st = { credits: START_CREDITS, owned: [], equip: {} };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s) {
      if (Number.isFinite(s.credits)) st.credits = s.credits;
      if (Array.isArray(s.owned)) st.owned = s.owned.filter((id) => ITEMS[id]);
      if (s.equip) st.equip = s.equip;
    }
  } catch { /* ignore */ }
  for (const c of CLASS_ORDER) {
    st.equip[c] = st.equip[c] || {};
    for (const sl of SLOTS) {
      const id = st.equip[c][sl.id];
      if (!id || !ITEMS[id] || ITEMS[id].slot !== sl.id || !owns(st, id)) st.equip[c][sl.id] = defaultFor(sl.id);
    }
  }
  return st;
}
export function saveCosmetics(st) { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* ignore */ } }
export const owns = (st, id) => ITEMS[id]?.price === 0 || st.owned.includes(id);
export function defaultFor(slot) { return Object.keys(ITEMS).find((id) => ITEMS[id].slot === slot); }
export function itemsFor(slot) { return Object.entries(ITEMS).filter(([, it]) => it.slot === slot).map(([id, it]) => ({ id, ...it })); }

export function buy(st, id) {
  const it = ITEMS[id];
  if (!it || owns(st, id) || st.credits < it.price) return false;
  st.credits -= it.price;
  st.owned.push(id);
  saveCosmetics(st);
  return true;
}

// the outfit a class wears, optionally with one item swapped in (for try-on previews)
export function buildOutfit(st, cls, tryOn = null) {
  const base = { ...CLASSES[cls].skin, build: CLASSES[cls].build };
  const eq = { ...st.equip[cls] };
  if (tryOn && ITEMS[tryOn]) eq[ITEMS[tryOn].slot] = tryOn;
  for (const sl of SLOTS) {
    const it = ITEMS[eq[sl.id]];
    if (it?.apply) Object.assign(base, it.apply);
  }
  return base;
}

export function gunSkinFor(st, cls, tryOn = null) {
  let id = st.equip[cls].wskin;
  if (tryOn && ITEMS[tryOn]?.slot === 'wskin') id = tryOn;
  return ITEMS[id]?.gun || null;
}

// recolour a weapon definition's parts with a skin (keeps mags, lenses, lights and accents)
export function skinDef(def, skin) {
  if (!skin) return def;
  const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  if (def.melee) {
    // melee: the skin goes on the blade (or hammer head) and the fittings; the grip keeps its wrap, and the edge stays
    // bright, glowing in the skin's colour for a live skin. The swing's streak takes the skin's colour too.
    const sw = skin.sw || skin.main || [0.8, 0.9, 1], bright = sw.map((v) => Math.min(1, v * 0.6 + 0.45));
    const parts = def.parts.map((p) => {
      if (/^(grip|gripRing|lanyard|tape)$/.test(p.name)) return p;
      if (p.name === 'edge' || p.name === 'hamon') return { ...p, col: skin.tex ? bright : p.col.map((v, i) => v * 0.7 + bright[i] * 0.3), em: skin.tex ? (p.name === 'edge' ? 0.6 : 0.3) : p.em };
      if (p.name === 'wrap') return { ...p, col: skin.tex ? sw.map((v) => v * 0.7) : skin.main };
      if (skin.tex) return { ...p, tex: skin.tex, col: [0, lum(p.col), 0] };
      const l = lum(p.col);
      return { ...p, col: l < 0.14 ? skin.dark : skin.main.map((v) => v * (0.55 + l * 1.1)), em: skin.glow && l >= 0.14 ? 0.12 : p.em };
    });
    return { ...def, parts, trail: bright, liveSkin: skin.tex || undefined };
  }
  if (skin.tex) {
    // a live skin: the shader paints the pattern; each part's colour carries [energy, its brightness, streak]
    const parts = def.parts.map((p) => (p.em || p.m === 'glass' ? p : { ...p, tex: skin.tex, col: [0, lum(p.col), 0] }));
    return { ...def, parts, liveSkin: skin.tex };
  }
  const parts = def.parts.map((p) => {
    if (p.em || p.mag) return p;
    const l = lum(p.col);
    const sat = Math.max(...p.col) - Math.min(...p.col);
    if (sat > 0.25) return p;                                    // coloured accents stay
    const col = l < 0.14 ? skin.dark : skin.main.map((v) => v * (0.55 + l * 1.1));
    return { ...p, col, em: skin.glow && l >= 0.14 ? 0.12 : p.em };
  });
  return { ...def, parts };
}
