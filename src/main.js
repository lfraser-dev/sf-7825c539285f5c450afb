import { Renderer } from './renderer.js';
import { World, moveBoxTo } from './world.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { Weapon, setHandLook } from './weapon.js';
import { WEAPONS, CASE_ORDER, VARIANT_OF, GUN_DESC, MELEE, MELEE_DESC } from './weapons.js';
import { Effects } from './effects.js';
import { Sounds } from './audio.js';
import { Dummy, DestructibleWall, Workbench, gunWalls } from './props.js';
import { mat4, perspective, lookDir, mul, cross, norm, damp, dot, compose, anglesFor, clamp } from './math.js';
import { buildDef, ratings } from './attachments.js';
import { CLASSES, CLASS_ORDER, ABILITIES, HEAVIES, SIDEARMS, THROWABLES, THROW_ORDER, TAKEDOWNS, takedownsFor, loadLoadout, saveLoadout } from './classes.js';
import { Contestant } from './contestant.js';
import { Thumbs } from './thumbs.js';
import { SLOTS as CSLOTS, RARITY, ITEMS, FEATURED, CURRENCY, loadCosmetics, saveCosmetics, owns, itemsFor, buy, buildOutfit, gunSkinFor, skinDef, swatch, iconFor } from './cosmetics.js';
import { Bench } from './bench.js';
import { anchorsFor, optionsFor, SLOTS } from './attachments.js';
const benchPV = mat4();
import testRange from './maps/testRange.js';
import { ARENAS } from './maps/arenas.js';
import { Course, fmtTime } from './course.js';
import { Elevator } from './elevator.js';
import { BotManager, Bot, teamPalette, lookPalette } from './bots.js';
import { loadDaily, dailyList, dailyEvent, familyOf, msToReset } from './challenges.js';
import { ZombieMode, ZMAP, BOX_POOL, DROPS } from './zombies.js';
ARENAS.push(ZMAP);        // the zombies map: built with the arenas, but never in the team deathmatch rotation
import { divisionOf, divHTML, crewHTML, loadRanked, rankedResult, loadCrew, saveCrew, CREW_COLS, cleanTag } from './social.js';
import { PASS, REWARDS, loadPass, savePass, tierOf, tierProgress, payOut } from './pass.js';
import { loadProgress, levelInfo, rankOf, badgeHTML, addXp, XP, LEVEL_CREDITS, GUN_LV, TD_LV, SKIN_LV, gunLocked, tdLocked, skinLocked, unlocksAt, levelOf } from './progress.js';
import { takedownPose, takedownProps, REACH } from './takedown.js';
import { Matchmaking } from './matchmaking.js';
import { Deathmatch } from './tdm.js';
import { Lobby, settleBody } from './net.js';
import { StaticBatches } from './batch.js';
import { Gadgets, ropeParts, hookParts, BARRICADE, BLOCKADE, TETHER_COL } from './gadgets.js';
import { Heavy, HEAVY_STATS, TETHER } from './heavy.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');

let renderer;
try {
  renderer = new Renderer(canvas);
} catch (e) {
  $('menu').classList.add('hidden');
  $('error').textContent = `Couldn't start WebGL2: ${e.message}`;
  $('error').classList.remove('hidden');
  throw e;
}

// ---------- settings ----------
const settings = { sens: 1.0, fov: 95, volume: 0.5, aimKey: 'KeyV', fireKey: 'KeyF', aimMode: 'hold', trackpad: false, dashKey: 'KeyQ', grappleKey: 'KeyG', slamKey: 'KeyZ', abilityKey: 'KeyG', heavyKey: 'KeyQ', throwKey: 'KeyZ' };
try { Object.assign(settings, JSON.parse(localStorage.getItem('semifinals.settings') || '{}')); } catch { /* ignore */ }
if (!settings.keysV2) { settings.abilityKey = 'KeyG'; settings.heavyKey = 'KeyQ'; settings.keysV2 = true; }   // build 0.41: ability on G, heavy weapon on Q
const saveSettings = () => { try { localStorage.setItem('semifinals.settings', JSON.stringify(settings)); } catch { /* ignore */ } };

// ---------- game objects ----------
const world = new World();
const batches = new StaticBatches(renderer);      // static scenery batches, made on the first frame
// which arena a box is in (its index in ARENAS), or -1 for the practice range
const zoneOf = (b) => {
  const c = b.center;
  for (let i = 0; i < ARENAS.length; i++) {
    const SA = ARENAS[i].area;
    if (c[0] > SA.min[0] && c[0] < SA.max[0] && c[1] > SA.min[1] && c[1] < SA.max[1] && c[2] > SA.min[2] && c[2] < SA.max[2]) return i;
  }
  return -1;
};
const effects = new Effects(world);
const input = new Input(canvas);
const sounds = new Sounds();
const gadgets = new Gadgets(world, effects, sounds);     // barricades, pads, drone pods, turret bases
// heavy weapons: drones, grenades, fire pools, turret brains. Hooks tie them to whoever you can hurt.
const heavy = new Heavy(world, effects, sounds, gadgets, {
  targets: (side) => (side && side !== true ? agentTargets(side) : enemyTargets()),
  hit: (ref, dmg, point, dir, name, side) => {
    if (side && side !== true) botGearHit(side, ref, dmg, point, dir);
    else hitTarget(ref, dmg, false, point, dir, name);
  },
  ignite: (ref, burn, name, side) => {
    if (side && side !== true) { if (ref.isPlayer) playerBurn = { t: burn.dur, dps: burn.dps, by: side, acc: 0 }; else botGearHit(side, ref, Math.round(burn.dps * burn.dur * 0.5), [ref.pos[0], ref.pos[1] + 1.2, ref.pos[2]], [0, 0, 0]); }
    else ignite(ref, burn, name);
  },
  gadgetHit: (g, dmg) => gadgetHit(g, dmg),
  me: () => myGadgetOwner(),
  myTeam: () => (tdm.active ? tdm.myTeam?.idx ?? -1 : -1),
  send: (m) => { if (online.active) online.send({ ...m, id: online.myId }); },
  playerPos: () => player.pos,
  remotePos: (id) => online.byId?.(id)?.bot?.pos,
  // I tethered another player: their game holds them in place
  onTether: (ref, a, len, dur) => { if (ref.remote && online.active) online.send({ t: 'teth', id: online.myId, who: ref.remote.id, a: a.map((v) => +v.toFixed(2)), len, dur }); },
  // someone tethered me
  tetherMe: (a, len, dur) => {
    playerTether = { anchor: a, len, t: dur };
    if (player.grapple) player.releaseGrapple(false);
    banner('TETHERED', 'YOU ARE TIED DOWN', 'bad', 1.2);
  },
  flash: (pos) => flashAt(pos),
  blast: (pos, r, dmg) => blastWalls(pos, r, dmg),
  worldHit: (hit, dir, dmg) => { if (hit.box.tag === 'chunk' && hit.box.ref.hp) chunkHit(hit.box, dir, dmg, false); },
  shake: (pos, r) => {
    const d = Math.hypot(player.pos[0] - pos[0], player.pos[1] - pos[1], player.pos[2] - pos[2]);
    if (d < r * 5) { player.shake = Math.max(player.shake || 0, 0.6 * (1 - d / (r * 5))); player.camPitchV += 0.6 * (1 - d / (r * 5)); }
  },
});
// a bot's gear (turret, drone, grenade, mine, tether) can hurt the player and the other team's bots
const playerRef = { isPlayer: true, get pos() { return player.pos; }, get alive() { return !player.dead; } };
let playerBurn = null;          // set on fire by a bot's gear: { t, dps, by, acc }
function agentTargets(agent) {
  const out = [];
  if (!tdm.active || tdm === online || !inStadium()) return out;
  const add = (ref, pos) => out.push({ ref, pos, chest: [pos[0], pos[1] + 1.2, pos[2]] });
  if (!player.dead && tdm.myTeam !== agent.team && !(cloakT > 0)) add(playerRef, player.pos);
  for (const a of tdm.agents) if (a.team !== agent.team && a.bot && a.bot.alive) add(a.bot, a.bot.pos);
  return out;
}
function botGearHit(agent, ref, dmg, point, dir) {
  if (ref.isPlayer) { player.lastHitBy = online.active && tdm === online ? agent.id : agent; damagePlayer(dmg, agent.pos || point, agent.name); return; }
  // online: one of my (host) bots' gear hit another player: their game takes the damage
  const rm = ref.remote || (ref.isRemote ? ref : null);
  if (rm && online.active && tdm === online) { online.co?.netHit?.(rm, dmg, agent, agent.pos || point); return; }
  if (ref.agent) ref.agent.lastHitBy = agent;
  ref.damage(dmg, dir);
}
// everyone your heavy weapons can hurt right now: the other team in a match, the dummies in the range
function enemyTargets() {
  const out = [];
  const add = (ref) => { if (ref && ref.alive && ref.pos) out.push({ ref, pos: ref.pos, chest: [ref.pos[0], ref.pos[1] + 1.2, ref.pos[2]] }); };
  if (tdm.active) { if (inStadium()) for (const a of tdm.agents) if (a.bot && a.bot.team !== tdm.myTeam?.idx) add(a.bot); }
  else dummies.forEach(add);
  return out;
}
const applyBinds = () => { input.binds = { aim: settings.aimKey, fire: settings.fireKey }; input.aimMode = settings.aimMode; input.trackpad = !!settings.trackpad; };
applyBinds();
sounds.setVolume(settings.volume);
const player = new Player(world);
const map = testRange;
map.build(world);
for (const a of ARENAS) a.build(world);    // the semi-finals arenas, far away (PLAY on the home screen)
let stadium = ARENAS[0];                   // the arena the current match is in
const dummies = [...map.dummies].map((d) => new Dummy(world, effects, d.pos, d.move));
const walls = [...map.walls].map((w) => new DestructibleWall(world, effects, w.origin, w));
// the arenas' walls are destructible too (chunks with health); their index in `walls` is the same on every machine,
// so online we can say "wall 23, chunk 4,7 took 22"
for (const a of ARENAS) for (const w of a.dwalls || []) walls.push(new DestructibleWall(world, effects, w.origin, w));
walls.forEach((w, i) => { w.idx = i; });
let chunkOut = [], chunkSendT = 0;          // my chunk hits waiting to go out to everyone else
function chunkHit(box, dir, dmg, send = true) {
  const w = box.ref, [r, k] = box.cell;
  const n = w.hp ? w.hitCell(r, k, dmg, dir) : w.hit(box, dir);
  if (send && w.hp && online.active) chunkOut.push([w.idx, r, k, Math.round(dmg)]);
  if (n) navDirty.add(w);
  return n;
}
// walls that lost chunks: the bots' map gets the new gaps (a few times a second at most)
const navDirty = new Set();
let navT = 0;
function updateNavHoles(dt) {
  if ((navT -= dt) > 0 || !navDirty.size) return;
  navT = 0.4;
  const nav = stadium?.navObj;
  for (const w of navDirty) {
    if (!nav?.ready) break;
    const o = w.origin, ex = w.axis === 0 ? [w.cols * w.chunk, w.thick] : [w.thick, w.cols * w.chunk];
    nav.reopen([o[0], o[1], o[2]], [o[0] + ex[0], o[1] + w.rows * w.ch, o[2] + ex[1]]);
  }
  navDirty.clear();
}
function blastWalls(pos, r, dmg) {
  let n = 0;
  for (const w of walls) {
    if (!w.hp) continue;
    const o = w.origin, ex = w.axis === 0 ? [w.cols * w.chunk, w.thick] : [w.thick, w.cols * w.chunk];
    if (pos[0] < o[0] - r || pos[0] > o[0] + ex[0] + r || pos[2] < o[2] - r || pos[2] > o[2] + ex[1] + r) continue;
    const k = w.blast(pos, r, dmg);
    if (k) navDirty.add(w);
    n += k;
  }
  if (n) sounds.crumble();
  return n;
}
// attachments: one saved loadout per weapon
const classLo = loadLoadout();
let loadouts = {};
try { loadouts = JSON.parse(localStorage.getItem('semifinals.loadouts') || '{}') || {}; } catch { /* ignore */ }
const cosmetics = loadCosmetics();
const pass = loadPass();
const ranked = loadRanked();
let crew = loadCrew();
setHandLook(buildOutfit(cosmetics, classLo.cls));
let skinClass = null;    // class whose weapon skin to show (defaults to the active class)
const defFor = (id) => skinDef(buildDef(WEAPONS[id], loadouts[id] || {}), gunSkinFor(cosmetics, skinClass || classLo.cls));
// ---------- levels: XP from matches, ranks, unlocks ----------
const progress = loadProgress();
let matchXp = 0, matchUnlocks = [];
const unlockNames = { gun: (id) => WEAPONS[id]?.name || id, td: (id) => TAKEDOWNS[id]?.name || id, skin: (id) => ITEMS[id]?.name || id };
function gainXp(n, label) {
  if (!n) return;
  passXp(n);
  const ups = addXp(progress, n);
  matchXp += n;
  xpTick(`+${n} XP${label ? ' · ' + label : ''}`);
  for (const lv of ups) {
    const un = unlocksAt(lv, unlockNames);
    matchUnlocks.push(...un);
    cosmetics.credits += LEVEL_CREDITS; saveCosmetics(cosmetics);
    const r = rankOf(lv);
    setTimeout(() => banner(`LEVEL ${lv}`, `${r.name} · +${LEVEL_CREDITS} ${CURRENCY}${un.length ? ' · UNLOCKED ' + un.join(', ') : ''}`, 'good', 2.6), 400);
    sounds.checkpoint?.();
  }
}
// ---------- battle pass: the same XP fills it; each tier pays out as you reach it ----------
function passXp(n) {
  const before = tierOf(pass);
  pass.xp += n;
  if (tierOf(pass) === before) { savePass(pass); return; }
  const paid = payOut(pass, cosmetics);
  saveCosmetics(cosmetics);
  paid.forEach((p, i) => setTimeout(() => { banner(`PASS TIER ${p.tier}`, p.labels.join(' · '), 'good', 2.2); sounds.coins?.(); }, 900 + i * 2400));
}
function buyPremium() {
  if (pass.premium) return;
  if (cosmetics.credits < PASS.premiumCost) { sounds.denied?.(); return; }
  cosmetics.credits -= PASS.premiumCost;
  pass.premium = true;
  const paid = payOut(pass, cosmetics);
  saveCosmetics(cosmetics);
  sounds.finish?.();
  banner('PREMIUM PASS', paid.length ? `${paid.length} REWARDS UNLOCKED` : 'UNLOCKED', 'good', 2.2);
  renderMenu();
}
const PASS_TIER = {};    // item id -> [tier, 'free' | 'premium']
for (const r of REWARDS) { if (r.free?.item) PASS_TIER[r.free.item] = [r.tier, 'FREE']; if (r.prem?.item) PASS_TIER[r.prem.item] = [r.tier, 'PREMIUM']; }
function renderPass() {
  const t = tierOf(pass), k = tierProgress(pass);
  $('bp-head').innerHTML = `<div class="bp-season">${PASS.name}</div>
    <div class="bp-tier"><b>${t}</b><span>/ ${PASS.tiers}</span></div>
    <div class="bp-bar"><i style="width:${(k * 100).toFixed(1)}%"></i></div>
    <div class="bp-sub">${t >= PASS.tiers ? 'SEASON COMPLETE' : `${fmt(pass.xp % PASS.perTier)} / ${fmt(PASS.perTier)} XP TO TIER ${t + 1} · EVERY MATCH COUNTS`}</div>`;
  const buy = $('bp-buy');
  buy.className = pass.premium ? 'own' : cosmetics.credits < PASS.premiumCost ? 'no' : '';
  buy.textContent = pass.premium ? 'PREMIUM ✓' : `UNLOCK PREMIUM ◆ ${fmt(PASS.premiumCost)}`;
  buy.onclick = buyPremium;
  const reward = (r, prem) => {
    const d = el('div', `bp-r${prem ? ' prem' : ''}${!r ? ' none' : ''}`);
    if (!r) return d;
    if (r.cr) d.append(el('div', 'bp-cr', '◆'), el('b', null, fmt(r.cr)), el('small', null, 'CREDITS'));
    else {
      const it = ITEMS[r.item], rr = RARITY[it.rarity];
      d.style.setProperty('--r', rgb(rr.color));
      const sw = el('div', 'bp-sw', iconFor(it.slot)); sw.style.setProperty('--sw', rgb(swatch(it) || [0.5, 0.5, 0.5]));
      d.append(sw, el('b', null, it.name), el('small', null, rr.name));
      d.onclick = () => { custSlot = it.slot; showTab('custom'); tryOn = r.item; renderMenu(); };
    }
    return d;
  };
  $('bp-track').replaceChildren(...REWARDS.map((r) => {
    const col = el('div', `bp-col${r.tier <= t ? ' got' : ''}${r.tier === t + 1 ? ' next' : ''}`);
    col.append(el('div', 'bp-n', String(r.tier)), reward(r.free, false), reward(r.prem, true));
    if (!pass.premium) col.lastChild.classList.add('locked');
    return col;
  }));
  const cur = $('bp-track').children[Math.max(0, t - 2)];
  if (cur && !renderPass.scrolled) { renderPass.scrolled = true; requestAnimationFrame(() => { $('bp-track').scrollLeft = cur.offsetLeft - 20; }); }
}
// ---------- daily challenges ----------
const daily = loadDaily();
let matchChallenges = [];
function dailyHit(ev) {
  for (const c of dailyEvent(daily, ev)) {
    matchChallenges.push(c.text);
    earn(c.cr);
    gainXp(c.xp, 'CHALLENGE');
    setTimeout(() => banner('CHALLENGE COMPLETE', `${c.text.toUpperCase()} · +${c.xp} XP · +${c.cr} ${CURRENCY}`, 'good', 2.4), 900);
  }
}
const gunByName = (name) => { const e = Object.entries(WEAPONS).find(([, w]) => w.name === name); return e ? { style: e[1].style || e[0] } : null; };
function renderDaily() {
  const box = $('mm-daily');
  if (!box) return;
  const ms = msToReset(), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60;
  box.innerHTML = `<h5>DAILY CHALLENGES <span>NEW IN ${h}H ${m}M</span></h5>` + dailyList(daily).map((c) =>
    `<div class="dc${c.done ? ' done' : ''}"><b>${c.text}</b><small>+${c.xp} XP · +${c.cr} ${CURRENCY}</small><em>${c.done ? '✓ DONE' : `${c.have}/${c.n}`}</em><i style="--p:${(c.have / c.n).toFixed(3)}"></i></div>`).join('');
}
// the little "+100 XP" line under the crosshair
let xpEl = null, xpTimer = 0;
function xpTick(text) {
  if (!xpEl) { xpEl = document.createElement('div'); xpEl.id = 'xptick'; document.getElementById('hud')?.append(xpEl); }
  if (!xpEl) return;
  xpEl.textContent = text;
  xpEl.classList.remove('go'); void xpEl.offsetWidth; xpEl.classList.add('go');
  clearTimeout(xpTimer); xpTimer = setTimeout(() => xpEl.classList.remove('go'), 1600);
}
// what other players see of me online: outfit colours, my gun with its attachments and skin
function myLook() {
  const o = buildOutfit(cosmetics, classLo.cls), w = classWeapons()[0];
  const r = (c) => (Array.isArray(c) ? c.map((v) => Math.round(v * 100) / 100) : null);
  return { m: r(o.jacket || o.vest || o.top), h: r(o.head && o.head !== 'hair' ? o.headCol : o.hair), b: r(o.bottom), s: r(o.shoes), g: r(o.gloves), w, a: loadouts[w] || {}, sk: cosmetics.equip[classLo.cls].wskin || '', eq: { ...cosmetics.equip[classLo.cls] }, fx: o.fxJacket || (!o.jacket && !o.vest ? o.fxTop : 0) || 0 };
}
// the armoury: every gun on a wall panel, grouped by family; a gun with a variant has it on the back of its panel
const variantOf = (id) => Object.keys(VARIANT_OF).find((v) => VARIANT_OF[v] === id) || null;
const racks = map.armoury.racks.map((r) => ({ ...r, ids: r.ids || CASE_ORDER.filter((id) => (WEAPONS[id].style || id) === r.fam) }));
const cases = [...gunWalls(racks, defFor, variantOf), { ammo: true, aim: map.armoury.ammo, center: [map.armoury.ammo[0], 0, map.armoury.ammo[2]], parts: () => [] }];
renderer.setRoom(map.armoury.room);
const workbench = new Workbench(world, map.bench.pos);
player.spawn(map.spawn.pos, map.spawn.yaw);
const course = new Course(map.course, sounds);
const elevator = new Elevator(world, map.elevator);
const lifts = [];        // (no lifts in the arenas)
const ai = new Deathmatch(world);           // team deathmatch against the AI
let tdm = ai;                               // the match being played: the AI one, or an online one
const zombies = new ZombieMode(world);     // ZOMBIES, on its own map (zombies.js)
let where = 'range';       // 'range' or 'stadium'
const inStadium = () => where === 'stadium';
let padCd = 0, voidT = 0;
const botMgr = new BotManager(world, map.deck, map.deckRefs);
// player health (the player object only knows movement)
Object.assign(player, { hp: 150, maxHp: 150, dead: false, hurtT: 9, invuln: 0, press: null });

// two weapon slots: primary + sidearm
const slots = [new Weapon(defFor('ar')), new Weapon(defFor('pistol')), new Weapon(defFor('knife'))];
let current = 0;
let lastSlot = 1;
let launcherW = null, launcherKind = null, launcherT = 0;     // the grenade / tether launcher while it's out
let playerTether = null;          // an enemy's tether holding you: { anchor, len, t }
const weapon = () => launcherW || slots[current];

function switchTo(i) {
  if (launcherW) putAwayLauncher(false);
  if (i === current || !slots[i]) return;
  input.aimToggled = false;
  lastSlot = current;
  current = i;
  weapon().equip();
  sounds.swap();
  updateSlotHud();
}

// one primary and one sidearm: a sidearm always goes in slot 2, anything else replaces your primary.
// The test range has every gun, whatever your level.
function pickUp(caseDef) {
  if (launcherW) putAwayLauncher(false);
  const def = defFor(caseDef.id);
  const slot = def.melee ? 2 : SIDEARMS.includes(def.id) ? 1 : 0;
  if (slots[slot].def.id === def.id) { slots[slot].ammo = def.mag; if (current !== slot) switchTo(slot); else weapon().equip(); sounds.pickup(); return; }
  slots[slot] = new Weapon(def);
  if (current !== slot) { lastSlot = current; current = slot; }
  slots[slot].equip();
  sounds.pickup();
  updateSlotHud();
}

// ---------- classes (chosen in the Armoury) ----------
// (classLo is hoisted into a var-like holder so defFor can be used while the file loads)
let equippedAbility = classLo[classLo.cls].ability;
let equippedHeavy = classLo[classLo.cls].heavy;
let equippedThrow = classLo[classLo.cls].throwable || 'frag';
let throwCharges = 2, throwT = 0, flashT = 0;
const THROW_RECHARGE = 14;
let heavyCd = 0;
let classDirty = true;          // class changed since the current test-range session started
function classWeapons() {
  const sel = classLo[classLo.cls], c = CLASSES[classLo.cls];
  return [gunLocked(progress, sel.weapon) ? c.weapons[0] : sel.weapon, gunLocked(progress, sel.sidearm) ? c.sidearms[0] : sel.sidearm];
}
function applyClass() {
  const c = CLASSES[classLo.cls];
  Object.assign(player, { maxHp: c.hp, hp: c.hp, speedMul: c.speed });
  const [a, b] = classWeapons();
  slots[0] = new Weapon(defFor(a));
  slots[1] = new Weapon(defFor(b));
  slots[2] = new Weapon(defFor(MELEE.includes(classLo[classLo.cls].melee) ? classLo[classLo.cls].melee : 'knife'));
  current = 0; lastSlot = 1;
  equippedAbility = classLo[classLo.cls].ability;
  equippedHeavy = classLo[classLo.cls].heavy;
  equippedThrow = classLo[classLo.cls].throwable || 'frag';
  throwCharges = 2; throwT = 0;
  heavyCd = 0;
  launcherW = null;
  setHandLook(buildOutfit(cosmetics, classLo.cls));
  player.resetAbilities?.();
  updateSlotHud();
  classDirty = false;
}

// called by the workbench when a loadout changes
function applyLoadout(id, lo) {
  loadouts[id] = lo;
  try { localStorage.setItem('semifinals.loadouts', JSON.stringify(loadouts)); } catch { /* ignore */ }
  const def = defFor(id);
  slots.forEach((w) => { if (w.def.id === id) w.setDef(def); });
  cases.forEach((c) => c.refresh?.(defFor));
  updateSlotHud();
}

const stats = { shots: 0, hits: 0, kills: 0, chunks: 0 };
const damageNumbers = [];
const downMarks = [];

function resetRange() {
  course.reset();
  botMgr.stop();
  map.deckRefs.screen.color = [0.15, 0.4, 0.9];
  Object.assign(player, { hp: player.maxHp, dead: false, press: null });
  cutscene = null; pressSeq = null;
  dummies.forEach((d) => d.reset());
  walls.forEach((w) => w.reset());
  for (const a of ARENAS) a.navObj?.reset();
  navDirty.clear();
  effects.clear();
  Object.assign(stats, { shots: 0, hits: 0, kills: 0, chunks: 0 });
  player.respawn();
  slots.forEach((w) => { w.ammo = w.def.mag; w.reload = null; });
}

// ---------- camera basis (shared by shooting + viewmodel->world conversions) ----------
let camEye = [0, 0, 0], camFwd = [0, 0, -1], camRight = [1, 0, 0], camUp = [0, 1, 0];
function updateCamera() {
  const w = weapon();
  camEye = player.eye();
  camFwd = player.forward(w.kick, w.kickYaw);
  if (player.dead) {
    // slump to the floor and tip over
    const k = Math.min(1, (deathDur - deathT) / 0.6);
    camEye = [camEye[0], camEye[1] - k * (player.eyeH - 0.35), camEye[2]];
  }
  if (cutscene) { const c = cutsceneCam(); camEye = c.eye; camFwd = c.fwd; }
  else if ((td && !player.dead) || victimCam) { const c = takedownCam(); camEye = c.eye; camFwd = c.fwd; }
  else if (killcam) { const c = killcamCam(); camEye = c.eye; camFwd = c.fwd; }
  camRight = norm(cross(camFwd, [0, 1, 0]));
  camUp = cross(camRight, camFwd);
  // apply roll to the basis so tracers/casings line up with what you see
  const roll = cutscene || killcam ? 0 : td || victimCam ? cineRoll : player.dead ? player.roll + Math.min(1, (deathDur - deathT) / 0.6) * 0.9 : player.roll;
  const c = Math.cos(roll), s = Math.sin(roll);
  const r2 = [0, 1, 2].map((k) => camRight[k] * c + camUp[k] * s);
  camUp = [0, 1, 2].map((k) => camUp[k] * c - camRight[k] * s);
  camRight = r2;
}
// The gun is drawn by its own camera (58° FOV, half the roll), so a gun-space point must go
// through the screen to land in the world where you actually see it.
const vmProjM = mat4(), vmViewM = mat4();
let worldVfov = 1.4, worldAspect = 1.7;
function vmToWorld(p) {
  const v = [
    vmViewM[0] * p[0] + vmViewM[4] * p[1] + vmViewM[8] * p[2] + vmViewM[12],
    vmViewM[1] * p[0] + vmViewM[5] * p[1] + vmViewM[9] * p[2] + vmViewM[13],
    vmViewM[2] * p[0] + vmViewM[6] * p[1] + vmViewM[10] * p[2] + vmViewM[14],
  ];
  const depth = Math.max(-v[2], 0.02);
  const nx = (vmProjM[0] * v[0]) / depth, ny = (vmProjM[5] * v[1]) / depth;   // NDC
  const th = Math.tan(worldVfov / 2);
  return [0, 1, 2].map((k) => camEye[k] + (camFwd[k] + camRight[k] * nx * th * worldAspect + camUp[k] * ny * th) * depth);
}
const viewToWorld = (p) => [0, 1, 2].map((k) => camEye[k] + camRight[k] * p[0] + camUp[k] * p[1] - camFwd[k] * p[2]);
const viewDirToWorld = (v) => [0, 1, 2].map((k) => camRight[k] * v[0] + camUp[k] * v[1] - camFwd[k] * v[2]);

// ---------- shooting ----------
let quickMelee = false, meleeT = null, modeThing = null;
function fire(w) {
  const d = w.def;
  if (d.melee) { meleeSwing(w); return; }
  skinShot(d);
  updateCamera();
  const spread = w.spread(player);
  const hipT = 1 - w.adsT;
  const muzzle = vmToWorld(w.gunPoint(d.muzzle));
  if (d.launcher) {
    const bolt = launcherKind === 'tether';
    const ls = HEAVY_STATS[launcherKind];
    const v = camFwd.map((c, i) => c * (ls.speed || (bolt ? 42 : 30)) + (i === 1 ? ls.lift ?? (bolt ? 1 : 2.5) : 0) + player.vel[i] * 0.3);
    heavy.launch(launcherKind, muzzle, v, true, HEAVY_STATS[launcherKind].name);
    launcherT = 0.55;
    return;
  }
  stats.shots++;
  if (cloakT > 0) { cloakT = 0; sounds.cloak?.(); }

  const perDummy = new Map();
  let anyHit = false;
  if (tdm.active && inStadium()) tdm.heard(tdm.you, camEye);      // the enemy hears your shots
  for (let i = 0; i < d.pellets; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = spread * (d.pellets > 1 ? Math.sqrt(Math.random()) : Math.sqrt(Math.random()));
    const dir = norm([0, 1, 2].map((k) => camFwd[k] + camRight[k] * Math.cos(a) * r + camUp[k] * Math.sin(a) * r));
    // bullets smash glass and carry on through it
    let o = camEye, left = 300, hit = null;
    for (let k = 0; k < 4; k++) {
      hit = world.raycast(o, dir, left);
      if (hit && hit.box.tag === 'glass') { breakGlass(hit.box, dir); o = hit.point.map((c, j) => c + dir[j] * 0.02); left -= hit.t; hit = null; continue; }
      break;
    }
    const end = hit ? hit.point : [0, 1, 2].map((k) => o[k] + dir[k] * left);
    if (d.charge) railFx(muzzle, end, dir, hit, d);
    else if (i < 4 && !(d.flashScale === 0 && d.sound.gain < 0.3)) effects.tracer(muzzle, end);    // suppressed + subsonic: no tracer
    if (d.blast && !d.charge && hit) {
      // explosive rounds: a small blast where the round lands (it does the damage to whoever's near, the round itself too)
      heavy.boom(end.map((c, k) => c - dir[k] * 0.15), d.blast.r, d.blast.dmg, d.name, true, 'mini');
      if (hit.box.tag !== 'bot' && hit.box.tag !== 'dummy') blastWalls(end, d.blast.r * 0.45, 120);
    }
    if (i === 0 && online.active) online.myShot(muzzle, end, d.charge ? (d.blast ? 2 : 1) : 0);
    if (!hit) continue;
    const b = hit.box;
    if (b.tag === 'bot' && tdm.active && b.ref.team === tdm.myTeam.idx) continue;   // no friendly fire
    if (b.tag === 'dummy' || b.tag === 'bot') {
      // damage falls off past the weapon's range (down to 55% at 2.2x range)
      const fall = 1 - 0.45 * clamp((hit.t - d.range) / (d.range * 1.2), 0, 1);
      const dmg = Math.round(d.dmg * (b.head ? d.headMult : 1) * fall);
      const e = perDummy.get(b.ref) || { dmg: 0, head: false, point: hit.point, dir };
      e.dmg += dmg;
      e.head = e.head || b.head;
      perDummy.set(b.ref, e);
      anyHit = true;
    } else if (b.tag === 'barricade' || (b.ref && b.ref.k && b.ref.hp != null)) {
      // gadgets (barricades, turrets, pods, mines, stations): sparks, and a hit unless it's your own team's
      const g = b.ref;
      if (!(tdm.active && g.team === tdm.myTeam?.idx)) {
        const fall = 1 - 0.45 * clamp((hit.t - d.range) / (d.range * 1.2), 0, 1);
        gadgetHit(g, Math.round(d.dmg * fall));
      }
      effects.impact(hit.point, hit.normal, [1, 0.8, 0.45]);
      if (i === 0) sounds.barricadeHit();
    } else if (b.tag === 'chunk') {
      const fall = 1 - 0.45 * clamp((hit.t - d.range) / (d.range * 1.2), 0, 1);
      const n = chunkHit(b, dir, d.dmg * fall);
      stats.chunks += n;
      effects.impact(hit.point, hit.normal, b.color);
      if (i === 0 && n) sounds.crumble();
    } else {
      effects.impact(hit.point, hit.normal, b.color);
      effects.decal(hit.point, hit.normal);
      if (d.burn && i < 3) for (let k = 0; k < 3; k++) effects.flame(hit.point.map((c, j) => c + hit.normal[j] * 0.05));
    }
  }
  if (anyHit) stats.hits++;
  // dragon's breath: a jet of fire out of the muzzle
  if (d.flame) {
    for (let k = 0; k < 34; k++) {
      const sp = 8 + Math.random() * 14, j = () => (Math.random() - 0.5) * 2.6;
      effects.flame(muzzle.map((c, i) => c + camFwd[i] * Math.random() * 0.3), [camFwd[0] * sp + j(), camFwd[1] * sp + j() - 1.2, camFwd[2] * sp + j()], 1.6 + Math.random() * 1.4);
    }
  }
  for (const [dummy, e] of perDummy) {
    if (!dummy.alive) continue;
    hitTarget(dummy, e.dmg, e.head, e.point, e.dir, d.name);
    if (d.burn && dummy.alive) ignite(dummy, d.burn, d.name);
  }
}

// ---- melee: lunge at whoever's in front of you, then the blow lands a third of the way through the swing
function meleeSwing(w) {
  const M = w.def.melee;
  updateCamera();
  sounds.swing?.(M.style);
  if (cloakT > 0) { cloakT = 0; sounds.cloak?.(); }
  if (tdm.active && inStadium()) tdm.heard(tdm.you, camEye);
  // lunge: anyone within reach of a lunge and roughly in front of you pulls you in
  const t = meleeTargets(M.range + M.lunge, 0.35, 1)[0];
  if (t && t.dist > M.range * 0.8 && player.grounded !== undefined) {
    const d = [t.pos[0] - player.pos[0], 0, t.pos[2] - player.pos[2]], l = Math.hypot(d[0], d[2]) || 1;
    const sp = Math.min(14, (t.dist - M.range * 0.6) / 0.16);
    player.vel[0] = d[0] / l * sp; player.vel[2] = d[2] / l * sp;
  }
  meleeT = { t: 0, at: M.swing * 0.32, M, w, done: false };
}
// people (and dummies) in front of you within reach and inside the swing's arc, nearest first
function meleeTargets(reach, arc, max) {
  const out = [], fwd = [camFwd[0], 0, camFwd[2]], fl = Math.hypot(fwd[0], fwd[2]) || 1;
  const add = (ref, pos, h = 1.1) => {
    const c = [pos[0], pos[1] + h, pos[2]], d = [c[0] - camEye[0], c[1] - camEye[1], c[2] - camEye[2]], dist = Math.hypot(d[0], d[2]);
    if (dist > reach || Math.abs(d[1]) > 2) return;
    const ang = Math.acos(Math.max(-1, Math.min(1, (d[0] * fwd[0] + d[2] * fwd[2]) / (dist * fl || 1))));
    if (ang > arc + Math.atan2(0.4, Math.max(dist, 0.3))) return;
    if (world.raycast(camEye, d.map((v) => v / Math.hypot(...d)), Math.hypot(...d) - 0.5, true, (b) => b.ref === ref || b.tag === 'bot' || b.tag === 'dummy')) return;   // a wall in the way
    out.push({ ref, pos, point: c, dist });
  };
  for (const dm of inStadium() ? [] : dummies) if (dm.alive) add(dm, dm.pos, 1.0);
  for (const b of botMgr.bots || []) if (b.alive) add(b, b.pos);
  if (tdm.active && inStadium()) for (const a of tdm.agents) if (a.bot?.alive && a.team !== tdm.myTeam) add(a.bot, a.bot.pos);
  out.sort((x, y) => x.dist - y.dist);
  return out.slice(0, max);
}
function updateMelee(dt) {
  if (!meleeT) return;
  meleeT.t += dt;
  if (meleeT.done || meleeT.t < meleeT.at) return;
  meleeT.done = true;
  const { M, w } = meleeT;
  updateCamera();
  const hits = meleeTargets(M.range, M.arc, M.hits);
  for (const h of hits) {
    const dir = norm([h.point[0] - camEye[0], h.point[1] - camEye[1], h.point[2] - camEye[2]]);
    const head = camFwd[1] > -0.05 && h.point[1] > camEye[1] - 0.25;            // a high swing at someone standing: a head hit
    hitTarget(h.ref, Math.round(M.dmg * (head ? w.def.headMult : 1)), head, h.point, dir, w.def.name);
  }
  if (hits.length) { sounds.meleeHit?.(M.style); player.shake = Math.max(player.shake || 0, M.style === 'smash' ? 0.5 : 0.2); stats.hits++; slowmo = Math.max(slowmo, M.style === 'smash' ? 0.1 : 0.06); player.camPitchV -= M.style === 'smash' ? 0.9 : 0.35; }
  else {
    // nothing living in reach: hit whatever's in front (walls crumble under the hammer, glass breaks)
    const hit = world.raycast(camEye, camFwd, M.range);
    if (hit) {
      if (hit.box.tag === 'glass') breakGlass(hit.box, camFwd);
      else if (hit.box.tag === 'chunk') { stats.chunks += chunkHit(hit.box, camFwd, M.walls || 30); sounds.crumble(); }
      else if (hit.box.ref?.hp != null && hit.box.ref.k) gadgetHit(hit.box.ref, M.dmg);
      if (M.walls) blastWalls(hit.point, 1.1, M.walls);
      effects.impact(hit.point, hit.normal, hit.box.color || [0.8, 0.8, 0.8]);
      sounds.meleeWall?.(M.style);
    }
  }
  if (quickMelee) { quickMelee = false; setTimeout(() => { if (current === 2 && !player.dead) switchTo(lastSlot === 2 ? 0 : lastSlot); }, M.swing * 600); }
}

// the railgun's shot: a beam that hangs in the air with rings of sparks down its length, a crack of thunder, and a
// blast of plasma where it lands
const RAIL_COL = [0.35, 0.85, 1];
function railFx(muzzle, end, dir, hit, d) {
  const L = Math.hypot(end[0] - muzzle[0], end[1] - muzzle[1], end[2] - muzzle[2]);
  effects.beam(muzzle, end, d.blast ? [0.75, 0.4, 1] : RAIL_COL, 1.1, 0.1);
  const col = d.blast ? [0.8, 0.5, 1] : [0.55, 0.95, 1];
  // rings spiralling out along the beam
  const up = Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0], r1 = norm(cross(dir, up)), r2 = cross(dir, r1);
  for (let s = 1.2, n = 0; s < Math.min(L, 60) && n < 150; s += 0.45, n++) {
    const a = s * 2.4, ca = Math.cos(a), sa = Math.sin(a), sp = 1.6;
    effects.spawnPiece([0, 1, 2].map((k) => muzzle[k] + dir[k] * s + (r1[k] * ca + r2[k] * sa) * 0.06), [0.03, 0.03, 0.03], [0, 1, 2].map((k) => (r1[k] * ca + r2[k] * sa) * sp), col, 0.45 + Math.random() * 0.4, 1);
    effects.debris[effects.debris.length - 1].noGravity = true;
  }
  effects.sparks(end, 34, col, 9, 0.7, 0.04, 2);
  effects.sparks(end, 10, [1, 1, 1], 4, 0.4, 0.07, 1);
  if (hit && hit.box.tag !== 'bot' && hit.box.tag !== 'dummy') blastWalls(end, 1.3, 200);
  if (d.blast) heavy.boom(end.map((c, k) => c - dir[k] * 0.15), d.blast.r, d.blast.dmg, d.name, true, 'mini');
  sounds.railShot?.();
  player.shake = Math.max(player.shake || 0, 0.7);
  fovKick = 9;
  railFlash = 1;
}
let railFlash = 0, railEl = null;
// while the railgun charges: sparks get sucked into the muzzle, the view tightens and shakes, and a ring fills round
// the crosshair
function updateRail(dt) {
  const w = weapon(), ch = w?.def.charge && !launcherW ? w.chargeT || 0 : 0;
  railFlash = Math.max(0, railFlash - dt * 3.5);
  if (!railEl) {
    railEl = document.createElement('div');
    railEl.style.cssText = 'position:fixed;left:50%;top:50%;width:74px;height:74px;margin:-37px 0 0 -37px;border-radius:50%;pointer-events:none;z-index:6;opacity:0;-webkit-mask:radial-gradient(circle,transparent 30px,#000 31px);mask:radial-gradient(circle,transparent 30px,#000 31px)';
    document.body.append(railEl);
    railEl.glow = document.createElement('div');
    railEl.glow.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;opacity:0';
    document.body.append(railEl.glow);
  }
  railEl.style.opacity = ch > 0.01 ? 1 : 0;
  if (ch > 0.01) railEl.style.background = `conic-gradient(${ch > 0.85 ? '#fff' : '#5fe0ff'} ${ch * 360}deg, rgba(255,255,255,.14) 0)`;
  const g = Math.max(ch * ch * 0.55, railFlash);
  railEl.glow.style.opacity = g > 0.01 ? g : 0;
  if (g > 0.01) railEl.glow.style.background = railFlash > ch * ch * 0.55 ? `rgba(200,240,255,${0.55 * railFlash})` : 'radial-gradient(circle, transparent 35%, rgba(60,190,255,.55) 100%)';
  if (ch <= 0) return;
  player.shake = Math.max(player.shake || 0, ch * ch * 0.22);
  fovKick = Math.min(fovKick, -9 * ch);
  const mz = vmToWorld(w.gunPoint(w.def.muzzle));
  for (let i = 0; i < 3; i++) {
    if (Math.random() > dt * 60 * (0.3 + ch)) continue;
    // a spark starts out in a shell round the muzzle and flies in
    const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2, r = 0.35 + Math.random() * 0.5, life = 0.22;
    const off = [Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r];
    effects.spawnPiece(mz.map((c, k) => c + off[k] + player.vel[k] * life), [0.014, 0.014, 0.014], off.map((v, k) => -v / life * 4.2 * 0.26 + player.vel[k]), [0.5, 0.95, 1], life, 1);
    effects.debris[effects.debris.length - 1].noGravity = true;
  }
}

// ---- live skins: every kill sets the gun off, and the more kills this life the bigger it gets
// each live skin's signature colour and the kind of burst it throws
const SKIN_KILL = {
  40: [[0.3, 0.6, 1], 'bits'], 41: [[1, 0.5, 0.08], 'slash'], 42: [[0.75, 0.8, 0.9], 'bits'], 43: [[0.8, 0.85, 0.9], 'slash'],
  44: [[1, 0.45, 0.05], 'fire'], 45: [[0.65, 0.2, 1], 'implode'], 46: [[1, 0.4, 0.9], 'rainbow'], 47: [[0.15, 1, 0.85], 'bits'],
  48: [[0.55, 0.85, 1], 'shards'], 49: [[0.8, 0.9, 1], 'bolt'], 50: [[0.95, 0.05, 0.05], 'slash'], 51: [[0.9, 0.97, 1], 'shards'], 52: [[1, 0.8, 0.25], 'coins'],
};
let skinKillT = 0, skinKillAmp = 0, lastHitPt = null;
function skinKill(at) {
  skinStreak++; skinHeat = Math.min(1, skinHeat + 0.45);
  const tex = weapon()?.def.liveSkin;
  if (!tex) return;
  const [col] = SKIN_KILL[tex] || [[1, 1, 1], 'bits'];
  const tier = Math.min(5, skinStreak), k = tier / 5;           // 1..5 kills: each one bigger
  skinKillT = 1; skinKillAmp = 0.45 + 0.55 * k;
  // off the gun itself: a burst of sparks from the muzzle
  if (!launcherW) effects.sparks(vmToWorld(weapon().gunPoint(weapon().def.muzzle)), 4 + tier * 3, col, 2.5, 0.35, 0.012, 0.5);
  if (!at) return;
  if (online.active) online.send({ t: 'skk', id: online.myId, x: tex, n: tier, p: at.map((v) => +v.toFixed(2)) });
  skinBurst(at, tex, tier, true, !!weapon().def.melee);
  if (skinStreak === 3 || skinStreak === 5 || (skinStreak > 5 && skinStreak % 5 === 0)) banner(skinStreak >= 5 ? 'UNSTOPPABLE' : 'ON FIRE', `${skinStreak} KILL STREAK`, 'good', 1.1);
}
// the burst where someone died to a live skin: yours, or another player's online (mine = shake your screen)
function skinBurst(at, tex, tier, mine, melee = false) {
  if (!SKIN_KILL[tex]) return;
  let [col, kind] = SKIN_KILL[tex]; const k = tier / 5;
  if (melee && kind === 'coins') kind = 'slash';     // a blade doesn't throw brass
  const p = [at[0], at[1], at[2]], n = 10 + tier * 9;
  const rainbow = () => { const h = Math.random() * 6.283; return [0.5 + 0.5 * Math.cos(h), 0.5 + 0.5 * Math.cos(h + 2.09), 0.5 + 0.5 * Math.cos(h + 4.19)]; };
  if (kind === 'fire') { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, sp = 2 + Math.random() * (3 + 4 * k); effects.flame(p, [Math.cos(a) * sp, 2 + Math.random() * 5, Math.sin(a) * sp], 1.4 + k * 1.6); } effects.sparks(p, n, [1, 0.8, 0.3], 6 + 4 * k, 0.8, 0.03, 3); }
  else if (kind === 'coins') { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, sp = 2 + Math.random() * (3 + 3 * k); effects.spawnPiece(p, [0.07, 0.012, 0.07], [Math.cos(a) * sp, 4 + Math.random() * 5, Math.sin(a) * sp], [1, 0.8, 0.25], 1.6 + Math.random(), 0.35); const d = effects.debris[effects.debris.length - 1]; d.shape = 'cylY'; d.mat = 'brass'; } sounds.coins?.(); }
  else if (kind === 'implode') { for (let i = 0; i < n * 1.5; i++) { const a = Math.random() * 6.283, e = Math.random() * 3.14 - 1.57, r = 1 + Math.random() * (1 + 2 * k), life = 0.35; const off = [Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r]; effects.spawnPiece(p.map((c, j) => c + off[j]), [0.04, 0.04, 0.04], off.map((v) => -v / life * 1.1), Math.random() < 0.3 ? [1, 1, 1] : col, life, 1); effects.debris[effects.debris.length - 1].noGravity = true; } }
  else if (kind === 'bolt') { let q = [p[0], p[1] + 9 + 6 * k, p[2]]; for (let i = 0; i < 7; i++) { const t = (i + 1) / 7, nx = [p[0] + (i < 6 ? (Math.random() - 0.5) * 1.6 : 0), p[1] + (9 + 6 * k) * (1 - t), p[2] + (i < 6 ? (Math.random() - 0.5) * 1.6 : 0)]; effects.beam(q, nx, col, 0.3 + 0.25 * k, 0.03 + 0.04 * k); q = nx; } effects.sparks(p, n, col, 8, 0.5, 0.03, 2); sounds.boom?.(0.35 + 0.3 * k); }
  else if (kind === 'shards') { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, sp = 3 + Math.random() * (4 + 4 * k); effects.spawnPiece(p, [0.02, 0.02, 0.09 + Math.random() * 0.12], [Math.cos(a) * sp, 1 + Math.random() * 6, Math.sin(a) * sp], col, 1 + Math.random(), 0.8); } }
  else if (kind === 'slash') { for (let j = 0; j < 1 + Math.floor(k * 2.5); j++) { const a = Math.random() * 6.283, u = [Math.cos(a), 0.5 + Math.random(), Math.sin(a)]; effects.beam(p.map((c, i) => c - u[i] * (0.9 + k)), p.map((c, i) => c + u[i] * (0.9 + k)), col, 0.3, 0.035); } effects.sparks(p, n, col, 7 + 3 * k, 0.6, 0.03, 2); }
  else for (let i = 0; i < n; i++) effects.sparks(p, 1, kind === 'rainbow' ? rainbow() : Math.random() < 0.25 ? [1, 1, 1] : col, 6 + 4 * k, 0.8, 0.04, 2.5);
  // a ring of light racing out along the ground: wider with every kill
  for (let i = 0; i < 16 + tier * 4; i++) { const a = i / (16 + tier * 4) * 6.283, sp = 5 + 5 * k; effects.spawnPiece([p[0], p[1] - 0.6, p[2]], [0.05, 0.05, 0.05], [Math.cos(a) * sp, 0.2, Math.sin(a) * sp], kind === 'rainbow' ? rainbow() : col, 0.45 + 0.25 * k, 1); effects.debris[effects.debris.length - 1].noGravity = true; }
  if (tier >= 3 && mine) player.shake = Math.max(player.shake || 0, 0.1 * tier);
}

// apply your damage to a target (a range dummy, a bot, or another player online)
function hitTarget(dummy, dmg, head, point, dir, wname, burn = false) {
  lastHitPt = point;
  dummy.lastHead = head;
  dummy.lastByMelee = !!weapon()?.def.melee;
  if (tdm.active && dummy.zombie) { dmg = tdm.onHit?.(dummy, head, dmg) ?? dmg; }
  if (buffOn('overdrive') && wname !== 'BULL CHARGE') dmg *= 1.25;
  const num = { pos: [...point], amount: dmg, head, burn, t: 0, el: null, drift: Math.random() - 0.5 };
  if (dummy.remote) {
    // another player online: tell them; they take the damage on their side
    online.myHit(dummy.remote, dmg, head, camEye);
    if (!burn) { showHitmarker(false, head); sounds.hit(head); hitSparks(point, dir, head, false); }
    damageNumbers.push(num);
    return;
  }
  if (dummy.agent) dummy.agent.lastHitBy = tdm.you;      // deathmatch kill credit
  const dead = dummy.damage(dmg, dir);
  if (dead) { stats.kills++; burning.delete(dummy); }
  if (dead && !dummy.name) { skinKill(point); showSkull(head); }   // range dummies count too, so you can see your skin go off
  if (dead && dummy.name) killFeed('YOU', burn ? `${wname} 🔥` : wname, dummy.name, head);
  if (!burn || dead) showHitmarker(dead, head);
  damageNumbers.push(num);
  if (dead) sounds.kill(head); else if (!burn) sounds.hit(head);
  if (!burn) hitSparks(point, dir, head, dead);
}
// a hit on someone: a spray of sparks off them (gold on a headshot), and a puff that bursts bigger on a kill
function hitSparks(p, dir, head, dead) {
  const back = dir ? dir.map((v) => -v) : [0, 0, 0];
  const at = p.map((c, i) => c + back[i] * 0.05);
  for (let i = 0; i < (head ? 10 : 6); i++) {
    const sp = 3 + Math.random() * 4, j = () => (Math.random() - 0.5) * 3;
    effects.spawnPiece(at, [0.025, 0.025, 0.025], [back[0] * sp + j(), back[1] * sp + j() + 1.5, back[2] * sp + j()], head ? [1, 0.82, 0.25] : [1, 0.95, 0.8], 0.25 + Math.random() * 0.2, 1);
  }
  effects.dust(at, dead ? 8 : 3);
}
// the kill skull: pops up over the crosshair (red with a gold rim for a headshot)
let skullEl = null;
function showSkull(head) {
  if (!skullEl) {
    skullEl = document.createElement('div'); skullEl.id = 'killskull';
    skullEl.innerHTML = '<svg viewBox="0 0 64 64"><path d="M32 4C17 4 8 14 8 27c0 8 4 13 8 16v9c0 3 2 5 5 5h3v-6h4v6h8v-6h4v6h3c3 0 5-2 5-5v-9c4-3 8-8 8-16C56 14 47 4 32 4z" fill="currentColor"/><circle cx="22" cy="28" r="7" fill="#000"/><circle cx="42" cy="28" r="7" fill="#000"/><path d="M32 36l-4 7h8z" fill="#000"/></svg>';
    document.getElementById('hud').append(skullEl);
  }
  skullEl.classList.remove('pop', 'head'); void skullEl.offsetWidth;
  skullEl.classList.add('pop'); if (head) skullEl.classList.add('head');
}

// ---------- fire: incendiary rounds and dragon's breath set what they hit alight ----------
const burning = new Map();   // target -> { t, dps, acc, tick, name }
function ignite(target, burn, name) {
  const b = burning.get(target);
  if (b) { b.t = Math.max(b.t, burn.dur); b.dps = Math.max(b.dps, burn.dps); return; }
  burning.set(target, { t: burn.dur, dps: burn.dps, acc: 0, tick: 0, name });
  sounds.ignite?.();
}
function updateBurns(dt) {
  for (const [tg, b] of burning) {
    if (!tg.alive || b.t <= 0) { burning.delete(tg); continue; }
    const step = Math.min(dt, b.t);
    b.t -= dt; b.acc += b.dps * step; b.tick += dt;
    // flames licking up the body
    const n = Math.min(4, Math.floor(dt * 45 + Math.random()));
    for (let k = 0; k < n; k++) effects.flame([tg.pos[0] + (Math.random() - 0.5) * 0.45, tg.pos[1] + 0.15 + Math.random() * 1.5, tg.pos[2] + (Math.random() - 0.5) * 0.45], [0, 0.4, 0], 1.6 + Math.random());
    if (b.tick >= 0.4 || b.t <= 0) {
      b.tick = 0;
      const dmg = Math.round(b.acc);
      b.acc -= dmg;
      if (dmg > 0) hitTarget(tg, dmg, false, [tg.pos[0], tg.pos[1] + 1.3, tg.pos[2]], [0, 0, 0], b.name, true);
    }
  }
}

function handleWeaponEvents(w) {
  for (const ev of w.events) {
    if (ev.type === 'eject') {
      const v = viewDirToWorld(ev.vel);
      const pv = player.vel;
      effects.casing(vmToWorld(ev.pos), [v[0] + pv[0], v[1] + pv[1] * 0.5, v[2] + pv[2]]);
    } else if (ev.type === 'magdrop' && ev.part) {
      // the old mag gets flung out with a spin
      const pv = player.vel, fv = viewDirToWorld([0.9 + Math.random() * 0.6, -0.8, 0.5]);
      effects.spawnPiece(vmToWorld(ev.pos), ev.part.s, [pv[0] * 0.8 + fv[0] * 2.2, fv[1] * 2 + 0.6, pv[2] * 0.8 + fv[2] * 2.2], ev.part.col, 6);
      const m = effects.debris[effects.debris.length - 1];
      if (m) m.spin = m.spin.map(() => (Math.random() - 0.5) * 26);
    } else if (ev.type === 'jolt') {
      player.camPitchV += ev.amt * 0.45;
      player.landV -= ev.amt * 0.12;
    }
  }
  w.events.length = 0;
}

function handlePlayerEvents() {
  for (const ev of player.events) {
    if (ev === 'jump') sounds.jump();
    else if (ev === 'land') { sounds.land(); effects.dust(player.pos, 4); }
    else if (ev === 'slide') { sounds.slide(); effects.dust(player.pos, 5, player.vel); }
    else if (ev === 'mantle') sounds.mantle();
    else if (ev === 'vault') { sounds.vault(); effects.dust(player.pos, 3, player.vel); }
    else if (ev === 'vaultland') { sounds.land(); effects.dust(player.pos, 3, player.vel); }
    else if (ev === 'step') sounds.step(player.crouching ? 0.22 : player.sprinting ? 1 : 0.6);
    else if (ev === 'wallstep') sounds.wallStep();
    else if (ev === 'wallrun') sounds.wallRun();
    else if (ev === 'walljump') { sounds.wallJump(); effects.dust(player.eye(), 3, player.vel); }
    else if (ev === 'grab') sounds.grab();
    else if (ev === 'chain') sounds.chain(player.chain);
    else if (ev === 'dash') { sounds.dash(); effects.dust(player.pos, 4, player.vel); }
    else if (ev === 'dashready') sounds.dashReady();
    else if (ev === 'grapplefire') sounds.grappleFire();
    else if (ev === 'grapplehit') { sounds.grappleHit(); if (player.grapple) effects.impact(player.grapple.point, player.grapple.normal, [0.6, 0.6, 0.62]); }
    else if (ev === 'grapplerelease') sounds.grappleRelease();
    else if (ev === 'grapplemiss') sounds.grappleMiss();
    else if (ev === 'slamleap') sounds.slamLeap();
    else if (ev === 'slamdive') sounds.slamDive();
    else if (ev === 'slam') slamShockwave(player.slamHit);
  }
  player.events.length = 0;
  if (player.sliding && player.grounded && Math.random() < 0.5) effects.dust(player.pos, 1, player.vel);
}

// ground slam: damage dummies and break wall chunks in a radius
function slamShockwave(h) {
  if (!h) return;
  player.slamHit = null;
  const R = 4.2 * Math.sqrt(h.power), p = h.pos;
  sounds.slam(h.power);
  // ring of dust + chunks thrown out
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2, r = 0.6 + Math.random() * 0.5;
    const dir = [Math.cos(a), 0, Math.sin(a)];
    effects.dust([p[0] + dir[0] * r, p[1], p[2] + dir[2] * r], 1, [dir[0] * 14, 0, dir[2] * 14]);
    if (i % 3 === 0) {
      const sz = 0.06 + Math.random() * 0.08;
      effects.spawnPiece([p[0] + dir[0] * r, p[1] + 0.1, p[2] + dir[2] * r], [sz, sz, sz],
        [dir[0] * (4 + Math.random() * 4), 3 + Math.random() * 4, dir[2] * (4 + Math.random() * 4)], [0.55, 0.55, 0.58], 1.2);
    }
  }
  const victims = tdm.active ? enemyTargets().map((t) => t.ref) : [...dummies, ...botMgr.bots.filter((b) => b.visible)];
  for (const d of victims) {
    if (!d.alive) continue;
    const dx = d.pos[0] - p[0], dy = d.pos[1] - p[1], dz = d.pos[2] - p[2];
    const dist = Math.hypot(dx, dz);
    if (dist > R || Math.abs(dy) > 2.5) continue;
    const dmg = Math.round((25 + 65 * (1 - dist / R)) * h.power);
    hitTarget(d, dmg, false, [d.pos[0], d.pos[1] + 1.6, d.pos[2]], norm([dx || 0.01, 0.6, dz || 0.01]), 'SLAM');
  }
  for (const w of walls) {
    for (const row of w.cells) for (const b of row) {
      if (!b) continue;
      const dx = b.center[0] - p[0], dy = b.center[1] - p[1], dz = b.center[2] - p[2];
      const dist = Math.hypot(dx, dy * 1.4, dz);
      if (dist < R * 0.75) stats.chunks += w.hp ? chunkHit(b, norm([dx, 0.4, dz]), 90 * h.power) : w.hit(b, norm([dx, 0.4, dz]));
    }
  }
  // the shockwave blows out nearby windows
  for (const g of stadium.glassBoxes) {
    if (!g.world) continue;
    const dx = g.center[0] - p[0], dy = g.center[1] - p[1], dz = g.center[2] - p[2];
    if (Math.hypot(dx, dz) < R + 2 && dy > -3 && dy < 5) breakGlass(g, norm([dx, 0.5, dz]));
  }
}

// ---------- breakable glass ----------
const GLASS_SHARD = [0.72, 0.86, 0.93];
function breakGlass(b, dir = [0, 0, 0]) {
  if (!b.world) return;
  world.remove(b);
  const n = Math.min(26, 8 + Math.round(b.scale[0] * b.scale[1] * b.scale[2] * 0 + (b.scale[0] + b.scale[2]) * b.scale[1] * 1.2));
  for (let i = 0; i < n; i++) {
    const p = [b.min[0] + Math.random() * b.scale[0], b.min[1] + Math.random() * b.scale[1], b.min[2] + Math.random() * b.scale[2]];
    const s = 0.06 + Math.random() * 0.26, s2 = 0.06 + Math.random() * 0.26;
    const thin = b.scale[0] < b.scale[2] ? [0.025, s, s2] : b.scale[1] < 0.2 ? [s, 0.025, s2] : [s, s2, 0.025];
    const v = [dir[0] * 5 + (Math.random() - 0.5) * 3, dir[1] * 3 + Math.random() * 2, dir[2] * 5 + (Math.random() - 0.5) * 3];
    effects.spawnPiece(p, thin, v, GLASS_SHARD, 1.4 + Math.random() * 1.2, 0.25);
  }
  sounds.glass?.();
}
function resetGlass() {
  for (const g of stadium.glassBoxes) if (g.world) world.remove(g);
  stadium.glassBoxes = stadium.spawnGlass(world);
}
// the lift button you're looking at (within reach)
function lookLiftButton() {
  const hit = world.raycast(player.eye(), player.forward(), 3.2, false);
  return hit && hit.box.tag === 'liftbtn' ? hit.box.ref : null;
}

// ---------- combat deck: health, bots, console, cutscene ----------
let deathT = 0, killer = '', slowmo = 0, cutscene = null, pressSeq = null;
const dmgDirs = [];
const kills = [];

// live gun skins react to play: heat builds as you fire and cools off; kills this life feed the streak
let skinHeat = 0, skinStreak = 0;
// credits for playing matches: 25 a kill, 50 a takedown, 300 for advancing (100 otherwise)
let matchEarned = 0;
function earn(n) { cosmetics.credits += n; matchEarned += n; saveCosmetics(cosmetics); }

// ---- secret codes: click your credits on the menu to type one in. Only the hash is stored here, so reading the
// code doesn't give the code away.
const CODES = { '929bcfd2deb79232881529b4be2b35043a07556e285c3a0c2586a92caa4b3804': 100000 };
async function redeemCode(txt) {
  const code = String(txt || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!code || !crypto.subtle) return 0;
  const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const n = CODES[h] || 0;
  if (n) { cosmetics.credits += n; saveCosmetics(cosmetics); renderMenu(); }
  return n;
}
function openRedeem() {
  if (document.getElementById('redeem')) return;
  const box = document.createElement('div');
  box.id = 'redeem';
  box.style.cssText = 'position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(5,8,14,.72);font-family:var(--font)';
  box.innerHTML = `<div style="background:#141a26;border:1px solid rgba(255,208,74,.4);padding:22px 24px;width:min(340px,90vw);color:#fff">
    <div style="font-weight:800;letter-spacing:.1em;color:#ffd04a;margin-bottom:10px">REDEEM A CODE</div>
    <input id="redeem-in" maxlength="40" autocomplete="off" spellcheck="false" placeholder="TYPE YOUR CODE" style="width:100%;box-sizing:border-box;padding:10px;font:700 16px var(--font);letter-spacing:.08em;text-transform:uppercase;background:#0b0f17;color:#fff;border:1px solid #39435a">
    <div id="redeem-msg" style="min-height:20px;margin:8px 0;font-size:13px;color:#aab"></div>
    <div style="display:flex;gap:8px"><button id="redeem-go" style="flex:1;padding:9px;font:800 14px var(--font);background:#ffd04a;color:#111;border:0;cursor:pointer">REDEEM</button>
    <button id="redeem-x" style="padding:9px 14px;font:800 14px var(--font);background:#2a3244;color:#fff;border:0;cursor:pointer">CLOSE</button></div></div>`;
  document.body.append(box);
  const inp = box.querySelector('#redeem-in'), msg = box.querySelector('#redeem-msg');
  const close = () => box.remove();
  const go = async () => {
    const n = await redeemCode(inp.value);
    msg.style.color = n ? '#7dff9a' : '#ff7a7a';
    msg.textContent = n ? `+${fmt(n)} ${CURRENCY} ADDED!` : 'That code doesn\'t work.';
    if (n) inp.value = '';
  };
  box.querySelector('#redeem-go').onclick = go;
  box.querySelector('#redeem-x').onclick = close;
  box.onclick = (e) => { if (e.target === box) close(); };
  inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') go(); if (e.key === 'Escape') close(); };
  inp.focus();
}
$('mm-credits').style.cursor = 'pointer';
$('mm-credits').title = 'Redeem a code';
$('mm-credits').addEventListener('click', openRedeem);
function skinShot(d) { skinHeat = Math.min(1, skinHeat + Math.min(0.35, 0.025 + 8 / (d.rpm || 600))); }
function updateSkinLive(dt) {
  skinHeat = Math.max(0, skinHeat - dt * (skinHeat > 0.6 ? 0.28 : 0.4));
  skinKillT = Math.max(0, skinKillT - dt * 0.9);
  const S = Math.min(1, skinStreak / 5);
  for (const w of slots) {
    if (!w?.def?.liveSkin) continue;
    // red carries two things: whole part = heat (0..100), fraction = the kill pulse (see the shader)
    for (const p of w.def.parts) if (p.tex >= 40) { p.col[0] = Math.floor(skinHeat * 100) + Math.min(0.99, skinKillT * skinKillAmp); p.col[2] = S; }
  }
}
function killFeed(a, weaponName, b, head) {
  if (a === 'YOU' && b !== 'YOU') { skinKill(lastHitPt); showSkull(head); if (tdm.active) {
      const tdk = Object.values(TAKEDOWNS).some((t) => t.name === weaponName);
      earn(tdk ? 50 : 25); gainXp(tdk ? XP.takedown : XP.kill, tdk ? 'TAKEDOWN' : 'KILL');
      const gun = gunByName(String(weaponName).replace(' 🔥', ''));
      dailyHit(tdk ? { type: 'takedown' } : { type: 'kill', fam: familyOf(gun), gear: !gun, head: !!head, cls: classLo.cls });
      dailyHit({ type: 'streak', at: skinStreak });
    }
  }
  kills.unshift({ a, w: weaponName, b, head, t: 0 });
  if (kills.length > 5) kills.pop();
  renderKillFeed();
}

function damagePlayer(amount, from, name) {
  if (player.dead || player.invuln > 0 || cutscene) return;
  if (buffOn('fortify')) amount *= 0.5;
  player.hp -= amount;
  player.hurtT = 0;
  sounds.hurt();
  player.camPitchV += (Math.random() - 0.3) * 0.5;
  player.shake = Math.max(player.shake, 0.22);
  const dx = from[0] - player.pos[0], dz = from[2] - player.pos[2];
  dmgDirs.push({ ang: Math.atan2(-dx, -dz), t: 0 });
  if (dmgDirs.length > 6) dmgDirs.shift();
  if (player.hp <= 0 && tdm === zombies && zombies.perks.has('revive') && !zombies.over) {
    // REVIVE RUSH: back up, but the drinks are gone
    zombies.perks.clear(); zApplyPerks();
    Object.assign(player, { hp: player.maxHp, invuln: 3 });
    banner('REVIVE RUSH', 'BACK ON YOUR FEET · YOUR DRINKS ARE GONE', 'good', 2);
    sounds.checkpoint?.(); zombies.collect('nuke', botHooks);
    return;
  }
  if (player.hp <= 0) die(name);
}

function die(name) {
  if (online.active && tdm === online) online.myDeath(typeof player.lastHitBy === 'string' ? player.lastHitBy : null);
  player.hp = 0;
  player.dead = true;
  player.settled = false; player.fallV = 0;
  skinStreak = 0;
  deathT = deathDur = tdm.active ? DOWNED_TIME : 3;    // in a match you're downed (and can be finished off) until you respawn
  player.downed = !!tdm.active;
  takenBy = null;
  if (td) { td = null; cine(false); }
  killer = name;
  sounds.death();
  killFeed(name, 'RIFLE', 'YOU', false);
  startKillcam(name);
  player.cancelAbilities();
  player.vel = [0, 0, 0];
}

function respawnPlayer() {
  fallTop = null;
  const A = map.deck.area, P = player.pos;
  const onDeck = botMgr.running || (P[0] > A.min[0] && P[0] < A.max[0] && P[1] > A.min[1] && P[1] < A.max[1] && P[2] > A.min[2] && P[2] < A.max[2]);
  const r = onDeck ? map.deck.respawn : { pos: player.spawnPoint, yaw: player.spawnYaw };
  player.teleport(r.pos, r.yaw);
  Object.assign(player, { hp: player.maxHp, dead: false, invuln: 1.5, downed: false, settled: false, fallV: 0 });
  takenBy = null;
  if (victimCam) { victimCam = null; cine(false); }
  slots.forEach((w) => { w.ammo = w.def.mag; w.reload = null; });
  weapon().equip();
}

// ---------- downed + takedowns ----------
// Killed in a match, you (and everyone else) go down for DOWNED_TIME seconds before respawning. While someone's down
// an enemy can walk up and press E for a takedown: a short third-person cutscene (three per class, picked in the
// Armoury) worth a bonus point and 50 HP. The same animations play on bots and on other players online.
const DOWNED_TIME = 10;
const BODY_TYPE = { light: 'rusher', medium: 'rifle', heavy: 'heavy' };
let deathDur = 3, takenBy = null, td = null, downedNear = null, tdShake = 0, victimCam = null, cineFov = 0, cineRoll = 0;
const bodyPt = (b) => b.toWorld([0, 0.3, (b.fallSign || 1) * 1.0]);
function myTakedownKind() {
  const list = takedownsFor(classLo.cls), k = classLo[classLo.cls].takedown;
  return list.includes(k) && !tdLocked(progress, k) ? k : list[0];
}
// a body for me, drawn only in cutscenes (no hitboxes)
function makeMyBody(pos, yaw) {
  const b = new Bot(world, BODY_TYPE[classLo.cls] || 'rifle', pos, yaw, 0);
  world.remove(b.body); world.remove(b.headBox);
  b.removed = true; b.state = 'wait'; b.landed = true; b.dropT = 1;
  const rgb = tdm.myTeam?.rgb;
  if (rgb) { try { const lk = myLook(); b.pal = lookPalette(lk, rgb); b.fxTex = lk.fx || 0; } catch { b.pal = teamPalette(rgb); } }   // in my outfit
  b.human = { ...buildOutfit(cosmetics, classLo.cls), teamBand: rgb || [1, 1, 1] };
  b.gunDef = slots[0]?.def || kitGun(classLo.cls);
  b.gunPartsOf = (def, m) => Weapon.worldParts(def, m);
  return b;
}
// ---------- killcam: when you're killed in a match, watch the last few seconds again over your killer's shoulder
// Every combat tick (30 times a second) remembers where everyone was, where they aimed, and the shots fired.
const KC_LEN = 3.2;
let kcClock = 0, kcLast = -1, kcRec = [], kcShots = [], killcam = null, kcEl = null;
function recordKillcam(dt) {
  kcClock += dt;
  if (kcClock - kcLast < 1 / 30) return;
  kcLast = kcClock;
  const a = [];
  for (const e of tdm.agents || []) {
    const b = e.bot;
    if (b && !b.removed) a.push([e, [...b.pos], b.yaw, b.aimPitch || 0, b.alive, b.walk || 0, b.moving || 0, [...(b.localVel || [0, 0])], b.dying ?? -1]);
  }
  kcRec.push({ t: kcClock, me: [[...player.pos], player.yaw, player.pitch, !player.dead], a });
  while (kcRec.length && kcRec[0].t < kcClock - KC_LEN - 0.6) kcRec.shift();
  while (kcShots.length && kcShots[0].t < kcClock - KC_LEN - 0.6) kcShots.shift();
}
function kcShot(f, e, k) { if (tdm.active) kcShots.push({ t: kcClock, f: [...f], e: [...e], k }); }
function startKillcam() {
  if (!tdm.active || !inStadium() || victimCam || kcRec.length < 20) return;
  const by = player.lastHitBy, agent = typeof by === 'string' ? online.byId?.(by) : by;
  if (!agent?.bot || agent === tdm.you) return;
  const me = makeMyBody(player.pos, player.yaw);
  killcam = { agent, t: 0, t0: kcClock - KC_LEN, tEnd: kcClock, frames: kcRec.slice(), shots: kcShots.slice(), next: 0, body: me };
  if (!kcEl) { kcEl = document.createElement('div'); kcEl.id = 'killcam'; document.getElementById('hud').append(kcEl); }
  kcEl.innerHTML = `<div class="kc-bar"></div><div class="kc-tag">KILLCAM</div><div class="kc-who">${agent.name || 'ENEMY'}</div><div class="kc-skip"><kbd>SPACE</kbd> SKIP</div><div class="kc-bar b"></div>`;
  kcEl.classList.add('on');
  document.body.classList.add('kc');
}
function endKillcam() { if (!killcam) return; killcam = null; kcEl?.classList.remove('on'); document.body.classList.remove('kc'); }
function updateKillcam(dt) {
  const K = killcam;
  K.t += dt;
  if (input.hit('Space') || K.t > KC_LEN + 0.9) { endKillcam(); return; }
  const pt = K.t0 + Math.min(K.t, KC_LEN + 0.9);
  // the shots, as they happened
  while (K.next < K.shots.length && K.shots[K.next].t <= pt) {
    const s = K.shots[K.next++];
    if (s.k) effects.beam(s.f, s.e, s.k === 2 ? [0.75, 0.4, 1] : RAIL_COL, 1.1, 0.1); else effects.tracer(s.f, s.e);
  }
  // my body: standing until the moment I died, then going down
  const me = K.body, f = kcFrame(pt);
  if (pt < K.tEnd) { me.alive = true; me.dying = -1; } else { if (me.alive) { me.alive = false; me.dying = 0; me.downed = true; me.flash = 0.12; me.fallSign = 1; } me.dying += dt; }
  if (f) { me.pos = f.me[0].slice(); me.yaw = f.me[1]; me.aimPitch = f.me[2]; }
  me.breath = (me.breath || 0) + dt;
}
// the recorded moment at time t, blended between the two snapshots either side
function kcFrame(t) {
  const F = killcam.frames;
  if (!F.length) return null;
  let i = 0;
  while (i < F.length - 2 && F[i + 1].t < t) i++;
  const a = F[i], b = F[i + 1] || a, k = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 0;
  const L = (x, y) => x + (y - x) * k, LA = (x, y) => { let d = y - x; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return x + d * k; };
  const out = { me: [a.me[0].map((v, j) => L(v, b.me[0][j])), LA(a.me[1], b.me[1]), L(a.me[2], b.me[2])], a: [] };
  for (const ra of a.a) {
    const rb = b.a.find((x) => x[0] === ra[0]) || ra;
    out.a.push([ra[0], ra[1].map((v, j) => L(v, rb[1][j])), LA(ra[2], rb[2]), L(ra[3], rb[3]), ra[4], L(ra[5], rb[5]), L(ra[6], rb[6]), ra[7], ra[8]]);
  }
  return out;
}
// everyone where they were (and puts them back afterwards)
function killcamPose() {
  const f = kcFrame(killcam.t0 + Math.min(killcam.t, KC_LEN + 0.9));
  if (!f) return () => {};
  const saved = [];
  for (const [e, pos, yaw, pitch, alive, walk, moving, lv, dying] of f.a) {
    const b = e.bot;
    if (!b) continue;
    saved.push([b, b.pos, b.yaw, b.aimPitch, b.alive, b.walk, b.moving, b.localVel, b.dying, b.flash]);
    b.pos = pos; b.yaw = yaw; b.aimPitch = pitch; b.alive = alive; b.walk = walk; b.moving = moving; b.localVel = lv; b.dying = alive ? -1 : Math.max(0, dying); b.flash = 0;
  }
  return () => { for (const [b, ...v] of saved) [b.pos, b.yaw, b.aimPitch, b.alive, b.walk, b.moving, b.localVel, b.dying, b.flash] = v; };
}
// over the killer's right shoulder, looking where they aimed
function killcamCam() {
  const f = kcFrame(killcam.t0 + Math.min(killcam.t, KC_LEN + 0.9));
  const r = f?.a.find((x) => x[0] === killcam.agent);
  if (!r) return { eye: camEye, fwd: camFwd };
  const [, pos, yaw, pitch] = r;
  const fwd = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
  const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const head = [pos[0], pos[1] + 1.62, pos[2]];
  return { eye: [0, 1, 2].map((k) => head[k] - fwd[k] * 1.2 + right[k] * 0.62 + (k === 1 ? 0.12 : 0)), fwd };
}
function findDowned() {
  if (!tdm.active || !inStadium() || player.dead || td) return null;
  let best = null, bd = 2.4;
  for (const e of tdm.entities()) {
    if (e === tdm.you || e.team === tdm.myTeam || !e.downed || !e.bot || (e.tdUntil || 0) > performance.now()) continue;
    const p = bodyPt(e.bot), d = Math.hypot(p[0] - player.pos[0], p[2] - player.pos[2]);
    if (d < bd && Math.abs(p[1] - player.pos[1]) < 1.6) { bd = d; best = e; }
  }
  return best;
}
// where an attacker stands for a takedown on a body, facing it
function takedownStand(body, from) {
  const dx = from[0] - body[0], dz = from[2] - body[2], l = Math.hypot(dx, dz) || 1;
  const stand = [body[0] + dx / l * REACH, from[1], body[2] + dz / l * REACH];
  const free = !world.firstOverlap([stand[0] - 0.25, stand[1] + 0.2, stand[2] - 0.25], [stand[0] + 0.25, stand[1] + 1.6, stand[2] + 0.25]);
  const p = free ? stand : [...from];
  return { pos: p, yaw: Math.atan2(-(body[0] - p[0]), -(body[2] - p[2])) };
}
function startTakedown(victim) {
  const kind = myTakedownKind(), def = TAKEDOWNS[kind];
  const body = bodyPt(victim.bot);
  const st = takedownStand(body, player.pos);
  victim.tdUntil = performance.now() + def.dur * 1000;
  td = { t: 0, kind, def, victim, bot: victim.bot, body, yaw: st.yaw, from: [...player.pos], to: st.pos, hit: false, swish: 0,
    eye0: player.eye(), fwd0: player.forward(), actor: makeMyBody(player.pos, st.yaw) };
  player.vel = [0, 0, 0];
  player.yaw = st.yaw;
  player.cancelAbilities?.();
  sounds.cloth?.();
  cine(true, def.name, victim.name);
  if (online.active && tdm === online) online.send({ t: 'tdb', id: online.myId, v: victim.id, k: kind });
}
// effects on the body, shared by my takedowns, bots' and other players' (seen online)
function takedownFx(bot, kind, mine, from) {
  const def = TAKEDOWNS[kind] || TAKEDOWNS.blade, p = bodyPt(bot);
  const src = from || (mine ? player.pos : null);
  const away = src ? norm([p[0] - src[0], 0, p[2] - src[2]]) : [0, 0, 0];
  // a white hit-flash on the body and a beat before it breaks apart
  bot.flash = 0.16;
  setTimeout(() => { bot.downed = false; }, 110);
  // shock ring along the floor and a burst of bright sparks
  const g0 = [p[0], bot.pos[1] + 0.04, p[2]];
  for (let i = 0; i < 20; i++) {
    const a = i / 20 * Math.PI * 2;
    effects.spawnPiece(g0, [0.07, 0.025, 0.07], [Math.cos(a) * 7, 0, Math.sin(a) * 7], [1, 0.95, 0.82], 0.22, 1);
    effects.debris[effects.debris.length - 1].noGravity = true;
  }
  for (let i = 0; i < 10; i++) effects.spawnPiece(p, [0.025, 0.025, 0.07], [(Math.random() - 0.5) * 6, 1.5 + Math.random() * 4, (Math.random() - 0.5) * 6], [1, 0.85, 0.5], 0.35 + Math.random() * 0.3, 1);
  effects.dust(g0, 5);
  // cracks in the floor: dark shards fanned out from the body that linger a moment
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2 + Math.random() * 0.4, len = 0.5 + Math.random() * 0.7;
    for (let k = 1; k <= 4; k++) {
      const d = 0.2 + (len * k) / 4, w = 0.1 - k * 0.016;
      effects.spawnPiece([g0[0] + Math.cos(a) * d, g0[1] - 0.02, g0[2] + Math.sin(a) * d], [w, 0.012, w], [0, 0, 0], [0.03, 0.03, 0.035], 2.2 + Math.random() * 0.6, 0);
      effects.debris[effects.debris.length - 1].noGravity = true;
    }
  }
  // chunks thrown up, and a slower second ring
  for (let i = 0; i < 12; i++) effects.spawnPiece(g0, [0.07 + Math.random() * 0.06, 0.06, 0.07 + Math.random() * 0.06], [(Math.random() - 0.5) * 5, 2.5 + Math.random() * 3.5, (Math.random() - 0.5) * 5], [0.45, 0.45, 0.48], 0.9 + Math.random() * 0.5, 0);
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2;
    effects.spawnPiece([g0[0], g0[1] + 0.05, g0[2]], [0.05, 0.02, 0.05], [Math.cos(a) * 3.2, 0, Math.sin(a) * 3.2], [1, 0.7, 0.3], 0.4, 1);
    effects.debris[effects.debris.length - 1].noGravity = true;
  }
  const near = Math.hypot(p[0] - player.pos[0], p[2] - player.pos[2]);
  const vol = Math.max(0.2, 1 - near / 30);
  switch (def.fx) {
    case 'launch':
      bot.killDir = [away[0] * 3.5, 2, away[2] * 3.5];
      effects.dust(p, 10, [away[0] * 2, 0, away[2] * 2]); sounds.whoosh?.(); sounds.hit?.();
      break;
    case 'zap':
      bot.killDir = [0, 1.8, 0];
      for (let i = 0; i < 26; i++) effects.spawnPiece(p, [0.03, 0.03, 0.1], [(Math.random() - 0.5) * 8, 1 + Math.random() * 6, (Math.random() - 0.5) * 8], [0.4, 0.8, 1], 0.4 + Math.random() * 0.5, 1);
      sounds.lock?.(); sounds.hit?.();
      break;
    case 'burst':
      bot.killDir = [0, 3, 0];
      for (let i = 0; i < 18; i++) effects.flame([p[0] + (Math.random() - 0.5) * 0.8, p[1] + Math.random() * 0.4, p[2] + (Math.random() - 0.5) * 0.8], [(Math.random() - 0.5) * 3.5, 1 + Math.random() * 2.5, (Math.random() - 0.5) * 3.5], 1.6);
      effects.dust(p, 12);
      sounds.boom?.(vol);
      break;
    case 'flatten':
      bot.killDir = [0, -1, 0];
      for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; effects.dust([p[0] + Math.cos(a) * 0.6, p[1], p[2] + Math.sin(a) * 0.6], 1, [Math.cos(a) * 3.5, 0.3, Math.sin(a) * 3.5]); }
      sounds.slam?.();
      break;
    default:
      bot.killDir = [away[0] * 1.5, 1, away[2] * 1.5];
      for (let i = 0; i < 8; i++) effects.spawnPiece(p, [0.04, 0.04, 0.04], [away[0] * 3 + (Math.random() - 0.5) * 3, 1 + Math.random() * 3, away[2] * 3 + (Math.random() - 0.5) * 3], [1, 1, 1], 0.3, 0.8);
      sounds.hit?.(); sounds.crumble?.();
  }
  if (near < 6 && !mine) player.shake = Math.max(player.shake || 0, 0.25 * (1 - near / 6));
}
function landTakedown() {
  const v = td.victim, kind = td.kind;
  takedownFx(td.bot, kind, true);
  tdShake = TAKEDOWNS[kind].fx === 'flatten' || TAKEDOWNS[kind].fx === 'burst' ? 0.75 : 0.45;
  slowmo = 0.5;
  td.freeze = 0.05;            // a beat of hit-stop
  cineFlash();
  cineStamp(v.name);
  sounds.boom?.(0.3);
  player.hp = Math.min(player.maxHp, player.hp + 50);
  sounds.checkpoint?.();
  if (online.active && tdm === online) online.myTakedown(v.id, kind);
  else { killFeed('YOU', TAKEDOWNS[kind].name, v.name, false); tdm.takedown?.(tdm.you, v); }
}
function endTakedown() {
  td = null;
  cine(false);
  banner('TAKEDOWN', '+1 POINT · +50 HP', 'good', 1.1);
  player.invuln = Math.max(player.invuln || 0, 0.5);
  weapon().equip();
}
function updateTakedown(dt) {
  const T = td, d = T.def;
  if (T.freeze > 0) { T.freeze -= dt; return; }
  T.t += dt;
  if (!T.pre && T.t > d.hitAt - 0.14) { T.pre = true; slowmo = Math.max(slowmo, 0.5); }      // the wind-up slows right down
  if (T.bot) T.bot.struggle = struggleAt(T.t, d.hitAt);
  const k = Math.min(1, T.t / 0.25);
  for (const i of [0, 2]) player.pos[i] = T.from[i] + (T.to[i] - T.from[i]) * k;
  // swishes on the way in
  const swings = T.kind === 'blade' || T.kind === 'buttstroke' ? [d.hitAt * 0.5, d.hitAt] : [d.hitAt];
  while (T.swish < swings.length && T.t > swings[T.swish] - 0.14) { T.swish++; sounds.whoosh?.(); }
  if (!T.hit && T.t >= d.hitAt) { T.hit = true; landTakedown(); }
  if (T.t >= d.dur) endTakedown();
}
// The cutscene camera, cut like a film in three shots (clipped by walls):
//   1. the approach: over the attacker's shoulder, swinging round to side-on
//   2. the hit: a hard cut to a low angle beside the body, looking up at the attacker, in slow motion
//   3. the aftermath: a cut to a wide shot from the front as they stand over it, then back into your eyes
function cineCam(S, A, yaw, B, t, def, lift, eye0, fwd0, out) {
  const ease = (x) => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
  const dur = def.dur, h = def.hitAt;
  const f = [-Math.sin(yaw), 0, -Math.cos(yaw)], r = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const mid = [A[0] * 0.45 + B[0] * 0.55, A[1] + 0.7 + lift * 0.5, A[2] * 0.45 + B[2] * 0.55];
  if (!S.side) {
    // film from whichever side has more room
    const room = (k) => world.raycast(mid, [r[0] * k, 0, r[2] * k], 6, false)?.t ?? 6;
    S.side = room(1) >= room(-1) ? 1 : -1;
  }
  const sd = S.side;
  const clip = (from, to, min = 0.7) => {
    const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]], l = Math.hypot(...d) || 1, n = d.map((v) => v / l);
    const hit = world.raycast(from, n, l + 0.3, false);
    const dd = hit ? Math.max(min, hit.t - 0.3) : l;
    return from.map((c, i) => c + n[i] * dd);
  };
  let eye, tgt;
  const t2 = h - 0.45, t3 = h + 0.42;
  if (t < t2) {
    const th = (0.75 + ease(t / t2) * 0.75) * sd;
    const dist = 3.6 - 0.5 * ease(t / t2);
    eye = clip(mid, [mid[0] - f[0] * Math.cos(th) * dist + r[0] * Math.sin(th) * dist, mid[1] + 0.75, mid[2] - f[2] * Math.cos(th) * dist + r[2] * Math.sin(th) * dist]);
    tgt = mid;
    cineFov = -20; cineRoll = 0;
  } else if (t < t3) {
    const k = ease((t - t2) / (t3 - t2));
    tgt = [A[0] * 0.55 + B[0] * 0.45, A[1] + 0.95 + lift * 0.6, A[2] * 0.55 + B[2] * 0.45];
    const d = 1.9 - 0.35 * k;
    eye = clip(tgt, [B[0] + r[0] * sd * d + f[0] * 0.55, A[1] + 0.32, B[2] + r[2] * sd * d + f[2] * 0.55]);
    cineFov = -8 - 10 * k; cineRoll = 0.13 * sd;
  } else {
    const k = ease((t - t3) / Math.max(0.2, dur - t3));
    tgt = [A[0], A[1] + 1.05, A[2]];
    const d = 3.4 + 0.9 * k;
    const dir = norm([f[0] * 0.85 + r[0] * sd * 0.55, 0, f[2] * 0.85 + r[2] * sd * 0.55]);
    eye = clip(tgt, [A[0] + dir[0] * d, A[1] + 1.0 + 0.25 * k, A[2] + dir[2] * d]);
    cineFov = -18 + 4 * k; cineRoll = 0;
  }
  let fwd = norm(tgt.map((c, i) => c - eye[i]));
  // ease in from where you were looking, and back out to your own eyes
  const bi = ease(t / 0.35), bo = out ? ease((t - (dur - 0.3)) / 0.3) : 0;
  const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  if (bi < 1) { eye = mix(eye0, eye, bi); fwd = norm(mix(fwd0, fwd, bi)); }
  if (bo > 0) { eye = mix(eye, out.eye, bo); fwd = norm(mix(fwd, out.fwd, bo)); cineRoll *= 1 - bo; }
  if (tdShake > 0) for (let i = 0; i < 3; i++) eye[i] += (Math.random() - 0.5) * tdShake * 0.3;
  return { eye, fwd };
}
function takedownCam() {
  tdShake = Math.max(0, tdShake - 1 / 45);
  if (victimCam) {
    const V = victimCam, a = V.attacker;
    const lift = (takedownPose(V.kind, V.t)?.off[1]) || 0;
    return cineCam(V, a.pos, a.yaw, [player.pos[0], player.pos[1] + 0.3, player.pos[2]], V.t, V.def, lift, V.eye0, V.fwd0, null);
  }
  const T = td, lift = takedownPose(T.kind, T.t)?.off[1] || 0;
  return cineCam(T, player.pos, T.yaw, T.body, T.t, T.def, lift, T.eye0, T.fwd0, { eye: player.eye(), fwd: player.forward() });
}
// the downed body isn't quite out: it strains to get up as the attacker closes in (0..1), until the hit
const struggleAt = (t, h) => (t < h ? Math.min(1, t / 0.45) * (0.75 + 0.25 * Math.sin(t * 17)) : 0);
// my body (and its props) in the cutscene
function takedownParts(out) {
  if (td) {
    const a = td.actor;
    a.pos = [...player.pos]; a.yaw = td.yaw;
    a.tdAnim = { kind: td.kind, t: td.t };
    out.push(...a.parts());
    takedownProps(out, a, td.kind, td.t, td.def, td.body, tdm.myTeam?.rgb);
  }
  if (victimCam) { victimCam.me.struggle = struggleAt(victimCam.t, victimCam.def.hitAt); out.push(...victimCam.me.parts()); }
}
// props in bots' and other players' hands while they do a takedown
function agentTakedownParts(out) {
  if (!tdm.active || !inStadium()) return;
  for (const a of tdm.agents) {
    const b = a.bot;
    if (!(b?.tdAnim && b.alive)) continue;
    takedownProps(out, b, b.tdAnim.kind, b.tdAnim.t, TAKEDOWNS[b.tdAnim.kind], b.tdAnim.body, a.team?.rgb);
    const vb = b.tdAnim.victim?.bot;
    if (vb && !vb.alive) vb.struggle = struggleAt(b.tdAnim.t, TAKEDOWNS[b.tdAnim.kind].hitAt);
  }
}
// letterbox bars + a title card while a takedown cutscene plays
let cineEl = null;
function cine(on, title = '', sub = '') {
  if (!cineEl) {
    cineEl = document.createElement('div');
    cineEl.id = 'cine';
    cineEl.innerHTML = '<i></i><i></i><div class="cine-t"><small>TAKEDOWN</small><b></b><span></span></div><div class="cine-f"></div><div class="cine-k"><b>ELIMINATED</b><span></span></div>';
    document.body.append(cineEl);
    const st = document.createElement('style');
    st.textContent = `#cine{position:fixed;inset:0;pointer-events:none;z-index:40}
#cine>i{position:absolute;left:0;right:0;height:13vh;background:#000;transition:transform .35s cubic-bezier(.2,.8,.2,1)}
#cine>i:first-child{top:0;transform:translateY(-100%)}#cine>i:nth-child(2){bottom:0;transform:translateY(100%)}
#cine.on>i{transform:none}
#cine .cine-f{position:absolute;inset:0;background:radial-gradient(circle,rgba(255,255,255,.85),rgba(255,240,210,.35) 60%,rgba(255,255,255,0));opacity:0;transition:opacity .35s}
#cine .cine-f.go{opacity:1;transition:none}
#cine .cine-k{position:absolute;left:0;right:0;top:19vh;text-align:center;color:#fff;opacity:0;pointer-events:none;text-shadow:0 3px 18px rgba(0,0,0,.7)}
#cine .cine-k b{display:block;font-size:min(9vw,84px);font-style:italic;font-weight:900;letter-spacing:.03em;line-height:.95;color:#ff3a2a;-webkit-text-stroke:1px rgba(0,0,0,.35)}
#cine .cine-k span{display:block;font-weight:800;letter-spacing:.3em;font-size:15px;margin-top:6px}
#cine .cine-k.go{animation:cinek 1.25s cubic-bezier(.2,.9,.2,1) forwards}
@keyframes cinek{0%{opacity:0;transform:scale(2.6) rotate(-4deg)}10%{opacity:1;transform:scale(.96) rotate(-2deg)}16%{transform:scale(1) rotate(-2deg)}78%{opacity:1;transform:scale(1.02) rotate(-2deg)}100%{opacity:0;transform:scale(1.05) rotate(-2deg)}}
#cine::after{content:'';position:absolute;inset:0;box-shadow:inset 0 0 18vh rgba(0,0,0,.55);opacity:0;transition:opacity .4s}
#cine.on::after{opacity:1}
#cine .cine-t{position:absolute;left:5vw;bottom:2.2vh;color:#fff;font-family:inherit;opacity:0;transform:translateX(-30px);transition:opacity .3s .15s,transform .4s .15s cubic-bezier(.2,.8,.2,1);text-shadow:0 2px 12px rgba(0,0,0,.6)}
#cine.on .cine-t{opacity:1;transform:none}
#cine .cine-t small{display:block;font-weight:800;letter-spacing:.35em;font-size:13px;color:#ffb21a}
#cine .cine-t b{display:block;font-size:min(5vw,46px);font-style:italic;font-weight:900;letter-spacing:.02em;line-height:1}
#cine .cine-t span{display:block;font-weight:700;letter-spacing:.2em;font-size:13px;opacity:.8;margin-top:4px}
body.cine-on #hud,body.cine-on #banner,body.cine-on #killfeed{opacity:0!important;transition:opacity .25s}`;
    document.head.append(st);
  }
  if (on) { cineEl.querySelector('small').textContent = sub === 'YOU' ? 'TAKEN DOWN' : 'TAKEDOWN'; cineEl.querySelector('b').textContent = title; cineEl.querySelector('span').textContent = sub === 'YOU' ? '' : sub; }
  cineEl.classList.toggle('on', on);
  document.body.classList.toggle('cine-on', on);
}
// the big stamp across the screen as the hit lands
function cineStamp(name) {
  const k = cineEl?.querySelector('.cine-k');
  if (!k) return;
  k.querySelector('b').textContent = name === 'YOU' ? 'FINISHED' : 'ELIMINATED';
  k.querySelector('span').textContent = name === 'YOU' ? '' : name;
  k.classList.remove('go'); void k.offsetWidth; k.classList.add('go');
}
function cineFlash() {
  const f = cineEl?.querySelector('.cine-f');
  if (!f) return;
  f.classList.add('go');
  requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('go')));
}
// someone has started a takedown on me: watch it from outside
function watchMyTakedown(attackerBot, kind) {
  if (!player.dead || !attackerBot || victimCam) return;
  const def = TAKEDOWNS[kind];
  const me = makeMyBody(player.pos, player.yaw);
  me.alive = false; me.dying = 1; me.downed = true; me.fallSign = 1;
  endKillcam();
  victimCam = { attacker: attackerBot, kind, def, t: 0, me, eye0: camEye.slice(), fwd0: camFwd.slice() };
  cine(true, def.name, 'YOU');
}
function updateVictimCam(dt) {
  const V = victimCam;
  V.t += dt;
  if (!V.pre && V.t > V.def.hitAt - 0.14) { V.pre = true; slowmo = Math.max(slowmo, 0.5); }
  if (V.t > V.def.hitAt && !V.hit) { V.hit = true; V.me.flash = 0.16; setTimeout(() => { V.me.downed = false; }, 110); tdShake = 0.6; slowmo = 0.5; cineFlash(); cineStamp('YOU'); sounds.boom?.(0.3); }
  if (V.me.dying >= 0) V.me.dying += V.hit ? dt : 0;
  if (V.t >= V.def.dur || !V.attacker.alive) { victimCam = null; cine(false); }
}
// a bot starts a takedown on someone downed: it steps up to the body and plays the animation
function botTakedownStart(agent, victim) {
  const list = takedownsFor(agent.cls || 'medium'), kind = list[Math.floor(Math.random() * list.length)];
  const b = agent.bot, def = TAKEDOWNS[kind];
  const body = victim.isPlayer ? [player.pos[0], player.pos[1] + 0.3, player.pos[2]] : bodyPt(victim.bot);
  const st = takedownStand(body, b.pos);
  b.pos[0] = st.pos[0]; b.pos[2] = st.pos[2]; b.yaw = st.yaw;
  b.tdAnim = { kind, t: 0, def, body, victim, hit: false };
  victim.tdUntil = performance.now() + def.dur * 1000;
  if (victim.isPlayer) watchMyTakedown(b, kind);
  return kind;
}
// someone finished me off: the respawn timer jumps on
function takenDown(name, kind) {
  if (!player.dead) return;
  player.downed = false;
  takenBy = { name, k: TAKEDOWNS[kind]?.name || 'TAKEDOWN' };
  killer = name;
  deathT = Math.min(deathT, 3.2);
  tdShake = Math.max(tdShake, 0.4); player.shake = Math.max(player.shake || 0, 0.4);
  sounds.hit?.(); sounds.crumble?.();
}

// ---------- people in matches ----------
// Everyone in a match has a human body (fighter.js). The AI wears its team's kit: jersey and helmet in the team
// colour over dark trousers. Players wear their real outfit (sent online as the items they have on) plus a glowing
// team armband. Each holds a real gun model.
const kitGuns = {};
function kitGun(cls) {
  const id = CLASSES[cls]?.weapons[0] || 'ar';
  return (kitGuns[id] ||= buildDef(WEAPONS[id], {}));
}
function humanFor(who) {
  const cls = CLASSES[who.cls] ? who.cls : 'medium', team = who.team?.rgb || [0.8, 0.2, 0.15];
  const dark = (k) => team.map((v) => v * k);
  let skin;
  if (who.zombie) {
    // the horde: grey-green skin, torn and filthy clothes, no hat, wild hair
    let hsh = 7; for (const ch of String(who.name || '')) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
    const rag = [[0.32, 0.28, 0.24], [0.25, 0.3, 0.33], [0.4, 0.22, 0.2], [0.3, 0.32, 0.22]][hsh % 4];
    const tone = [[0.52, 0.62, 0.44], [0.46, 0.55, 0.42], [0.58, 0.6, 0.5]][hsh % 3];
    skin = { ...CLASSES.light.skin, build: CLASSES.light.build, skin: tone, top: rag, topStyle: 'tee', jacket: null, vest: null,
      bottom: rag.map((v) => v * 0.6), legStyle: 'cargo', shoes: [0.12, 0.1, 0.09], shoeStyle: 'boot', gloves: tone, gloveStyle: 'bare', head: 'hair', hairStyle: ['flat', 'long', 'curtains', 'buzz', 'bald'][(hsh >> 3) % 5],
      hair: [0.15, 0.13, 0.1], faceShape: ['oval', 'slim', 'square'][(hsh >> 5) % 3], beard: (hsh >> 7) % 3 ? 'stubble' : null, eyeGlow: [0.9, 1, 0.3] };
    return { skin, gunDef: null, gunPartsOf: null };
  }
  if (who.look?.eq) {
    // another player: rebuild their outfit from the items they're wearing
    const eq = {};
    for (const sl of CSLOTS) { const id = who.look.eq[sl.id]; eq[sl.id] = ITEMS[id]?.slot === sl.id ? id : null; }
    for (const sl of CSLOTS) if (!eq[sl.id]) eq[sl.id] = Object.keys(ITEMS).find((id) => ITEMS[id].slot === sl.id);
    skin = { ...buildOutfit({ equip: { [cls]: eq } }, cls), teamBand: team };
  } else {
    skin = { ...CLASSES[cls].skin, build: CLASSES[cls].build, top: team, topStyle: 'zip', zip: true, jacket: null, vest: [0.1, 0.1, 0.12], vestStyle: 'field',
      bottom: [0.1, 0.1, 0.12], legStyle: 'cargo', shoes: [0.08, 0.08, 0.09], shoeStyle: 'boot', gloves: [0.1, 0.1, 0.11], gloveStyle: 'tactical',
      head: 'helmet', headCol: dark(0.9), visor: [0.04, 0.04, 0.05], accent: dark(1.1) };
    // no two alike: skin tone, face and beard picked from the bot's name
    let hsh = 7; for (const ch of String(who.name || '')) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
    skin.skin = [[0.95, 0.8, 0.68], [0.86, 0.66, 0.54], [0.78, 0.57, 0.42], [0.62, 0.43, 0.3], [0.45, 0.3, 0.2], [0.33, 0.22, 0.15]][hsh % 6];
    skin.faceShape = ['oval', 'square', 'round', 'slim'][(hsh >> 3) % 4];
    skin.beard = [null, null, 'stubble', 'full', 'goatee', 'moustache'][(hsh >> 5) % 6];
    skin.hair = [[0.05, 0.045, 0.045], [0.3, 0.18, 0.09], [0.85, 0.68, 0.32], [0.7, 0.71, 0.74]][(hsh >> 8) % 4];
  }
  return { skin, gunDef: kitGun(cls), gunPartsOf: (def, m) => Weapon.worldParts(def, m) };
}
const modeDraw = { gunDef: (id) => defFor(id), gunPartsOf: (def, m) => Weapon.worldParts(def, m) };
const botHooks = {
  zombieHit: (b) => sounds.zombieHit?.(Math.hypot(player.pos[0] - b.pos[0], player.pos[2] - b.pos[2])),
  groan: (p) => { const d = Math.hypot(player.pos[0] - p[0], player.pos[2] - p[2]); if (d < 22) sounds.groan?.(d, panOf(p)); },
  boxPick: () => BOX_POOL[Math.floor(Math.random() * BOX_POOL.length)],
  boardTorn: (w) => { const d = Math.hypot(player.pos[0] - w.inside[0], player.pos[2] - w.inside[2]); sounds.boardBreak?.(d, panOf(w.inside)); },
  maxAmmo: () => zFillAmmo(),
  humanFor: (who) => humanFor(who),
  settleBody: (b, dt) => settleBody(world, b, dt),
  player,
  hitPlayer: (dmg, bot, from) => { player.lastHitBy = bot.agent || null; damagePlayer(dmg, from, bot.name); },
  shot: (bot, from, end, dist) => { effects.tracer(from, end); sounds.botShot(dist, panOf(from)); kcShot(from, end, 0); },
  impact: (hit, u) => {
    if (hit.box.tag === 'glass') { breakGlass(hit.box, u || [0, 0, 0]); return; }
    if (hit.box.tag === 'barricade') { gadgets.damage(hit.box.ref, 16); effects.impact(hit.point, hit.normal, [1, 0.8, 0.45]); return; }
    if (hit.box.tag === 'chunk' && hit.box.ref.hp) { chunkHit(hit.box, u || [0, 0, 0], 14, false); effects.impact(hit.point, hit.normal, hit.box.color); return; }
    effects.impact(hit.point, hit.normal, hit.box.color); if (hit.box.tag !== 'chunk') effects.decal(hit.point, hit.normal);
  },
  onBotKill: (killer, victim) => { killFeed(killer.name, 'RIFLE', victim.name, false); },
  // a bot finishes off someone who's downed
  botTakedown: (agent, victim) => { botTakedownStart(agent, victim); },
  botTakedownLand: (agent, victim, kind) => {
    if (!victim.downed) return;          // they got up (respawned) first
    if (victim.isPlayer) takenDown(agent.name, kind);
    else if (victim.bot) takedownFx(victim.bot, kind, false, agent.pos);
    killFeed(agent.name, TAKEDOWNS[kind].name, victim.name, false);
    tdm.takedown?.(agent, victim);
  },
  smokeBlocks: (a, b) => heavy.smokeBlocks(a, b),
  // a bot uses its gear: returns how long until it thinks about it again
  botGear: (agent, tgt, dist, hurting) => {
    const c = CLASSES[agent.cls] || CLASSES.medium;
    agent.gear ??= c.heavies[Math.floor(Math.random() * c.heavies.length)];
    const b = agent.bot, p = agent.pos, chest = [tgt.pos[0], tgt.pos[1] + 1.2, tgt.pos[2]];
    const yaw = Math.atan2(-(tgt.pos[0] - p[0]), -(tgt.pos[2] - p[2]));
    const spec = (o) => ({ gid: gadgets.newId(agent.name), owner: agent.name, team: agent.team.idx, teamCol: agent.team.rgb, side: agent, ...o });
    const lob = (kind, speed) => {
      // a lobbed shot that lands on them (a little off, like a person)
      const from = b.muzzle(), dx = chest[0] - from[0], dz = chest[2] - from[2], dy = chest[1] - from[1], h = Math.hypot(dx, dz);
      const T = h / speed, gk = (HEAVY_STATS[kind].grav ?? 1) * 14, err = 1 + (Math.random() - 0.5) * 0.18;
      heavy.launch(kind, from, [dx / T * err, (dy + 0.5 * gk * T * T) / T, dz / T * err], agent, HEAVY_STATS[kind].name);
    };
    if (agent.cls === 'medium' && hurting && agent.hpFrac < 0.5 && !(agent.healCd > time)) {
      const sp = gadgets.padSpot([p[0], p[1] + 1.5, p[2]], [0, -1, 0], p, 0.35);
      if (sp) { gadgets.place(spec({ k: 'heal', ax: 0, ...sp })); agent.healCd = time + 22; return 3; }
    }
    if (agent.cls === 'light' && dist > 5 && dist < 22 && !(agent.tetherCd > time) && Math.random() < 0.5) {
      lob('tether', 36); agent.tetherCd = time + 12; return 3;
    }
    const id = agent.gear;
    if (id.startsWith('gl_')) {
      if (dist < 6 || dist > 34) return 1;
      lob(id, 24);
      return HEAVY_STATS[id].cd + Math.random() * 6;
    }
    if (POD_V[id] !== undefined) {
      if (dist > 30) return 1;
      const sp = gadgets.padSpot([p[0], p[1] + 1.5, p[2]], [0, -1, 0], p, 0.35);
      if (!sp) return 2;
      gadgets.place(spec({ k: 'pod', v: POD_V[id] || undefined, ax: 0, ...sp }));
      return HEAVY_STATS[id].cd + Math.random() * 8;
    }
    if (id === 'mines') {
      if (dist > 20 || !hurting) return 2;          // drop them when falling back
      let n = 0;
      for (const k of [-1, 0, 1]) {
        const a = yaw + k * 0.9, x = p[0] - Math.sin(a) * 1.6, z = p[2] - Math.cos(a) * 1.6;
        const hit = world.raycast([x, p[1] + 1, z], [0, -1, 0], 2.5, false);
        if (hit && hit.normal[1] > 0.7) { gadgets.place(spec({ k: 'mine', ax: 0, p: [x, hit.point[1], z] })); n++; }
      }
      return n ? HEAVY_STATS.mines.cd + Math.random() * 8 : 2;
    }
    // turrets
    if (dist > 40) return 1;
    const sp = gadgets.turretSpot(p, yaw);
    if (!sp) return 2;
    gadgets.place(spec({ k: 'tur', v: id === 'turret_heavy' ? 'heavy' : id === 'turret_flame' ? 'flame' : undefined, ...sp }));
    return HEAVY_STATS[id].cd + Math.random() * 8;
  },
  barricade: (agent, tgt) => {
    const p = agent.pos, yaw = Math.atan2(-(tgt.pos[0] - p[0]), -(tgt.pos[2] - p[2]));
    const spot = gadgets.barricadeSpot(p, yaw);
    if (!spot) return false;
    gadgets.place({ gid: gadgets.newId(agent.name), k: 'bar', ...spot, owner: agent.name, team: agent.team.idx, teamCol: agent.team.rgb });
    return true;
  },
  whiz: (from, end) => {
    // did the round pass close to your head?
    const e = player.eye(), d = [end[0] - from[0], end[1] - from[1], end[2] - from[2]];
    const L = Math.hypot(...d), u = d.map((v) => v / L);
    const t = clamp((e[0] - from[0]) * u[0] + (e[1] - from[1]) * u[1] + (e[2] - from[2]) * u[2], 0, L);
    const q = from.map((c, i) => c + u[i] * t);
    if (Math.hypot(e[0] - q[0], e[1] - q[1], e[2] - q[2]) < 1.6) sounds.whiz();
  },
  onLand: (bot) => { effects.dust(bot.pos, 6); sounds.botLand(); },
  onKill: (bot) => {
    sounds.botDie();
    if (botMgr.state === 'fight' && botMgr.alive === 0) { slowmo = 0.9; }
  },
  // after the death fall: the body breaks apart
  onShatter: (bot) => {
    if (bot.lastByMelee && !bot.zombie) {
      // cut down: no brass, just a slash of light through the body, sparks and a puff of dust
      const c = bodyPt(bot), col = weapon()?.def.trail || [0.85, 0.92, 1], tc = bot.pal ? [...bot.pal.values()][0] : [0.9, 0.3, 0.2];
      for (let j = 0; j < 2; j++) { const a = Math.random() * 6.283, u = [Math.cos(a), 0.4 + Math.random() * 0.6, Math.sin(a)]; effects.beam(c.map((v, i) => v - u[i] * 0.8), c.map((v, i) => v + u[i] * 0.8), col, 0.3, 0.03); }
      effects.sparks(c, 18, col, 6, 0.5, 0.03, 2);
      for (let i = 0; i < 14; i++) effects.spawnPiece(c, [0.04, 0.04, 0.04], [(Math.random() - 0.5) * 5, 1 + Math.random() * 4, (Math.random() - 0.5) * 5], tc, 0.5 + Math.random() * 0.4, 1);
      effects.dust(bot.pos, 6);
      return;
    }
    if (bot.zombie) {
      // the dead go back to dust: a puff of ash and rot, no coins
      const c = bodyPt(bot);
      for (let i = 0; i < 26; i++) { const a = Math.random() * 6.283, sp = 0.6 + Math.random() * 2.2; effects.spawnPiece([c[0], c[1] + Math.random() * 0.4, c[2]], [0.06, 0.06, 0.06], [Math.cos(a) * sp, 0.8 + Math.random() * 2.4, Math.sin(a) * sp], Math.random() < 0.4 ? [0.3, 0.42, 0.18] : [0.08, 0.08, 0.07], 0.7 + Math.random() * 0.6, 0.5); }
      effects.dust(bot.pos, 8);
      return;
    }
    if (bot.human) {
      // people don't break into blocks: the body bursts into a spray of coins and sparks in their team's colour
      const c = bodyPt(bot), kd = bot.killDir || [0, 1, 0], tc = bot.pal ? [...bot.pal.values()][0] : [1, 0.8, 0.3];
      for (let i = 0; i < 30; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 0.5;
        effects.spawnPiece([c[0] + Math.cos(a) * r * 0.6, c[1] + Math.random() * 0.3, c[2] + Math.sin(a) * r * 0.6], [0.075, 0.014, 0.075],
          [Math.cos(a) * (1.5 + Math.random() * 2.5) + kd[0] * 1.2, 2.5 + Math.random() * 3.5 + kd[1] * 0.6, Math.sin(a) * (1.5 + Math.random() * 2.5) + kd[2] * 1.2], [1, 0.78, 0.22], 1.1 + Math.random() * 0.7, 0.35);
        const d = effects.debris[effects.debris.length - 1]; d.shape = 'cylY'; d.mat = 'brass';
      }
      for (let i = 0; i < 16; i++) effects.spawnPiece(c, [0.03, 0.03, 0.08], [(Math.random() - 0.5) * 6, 1 + Math.random() * 5, (Math.random() - 0.5) * 6], tc, 0.4 + Math.random() * 0.4, 1);
      effects.dust(bot.pos, 4);
      sounds.coins?.() ?? sounds.checkpoint?.();
      return;
    }
    const s = bot.sc, f = bot.fallSign;
    const lay = (c) => bot.toWorld([c[0], 0.25, c[2] + f * c[1] * 0.9]);
    const tc = bot.pal ? [...bot.pal.values()] : null;     // team colours: [body, head, dark]
    for (const [c, sz, col0, ti] of [[[0, 0.45, 0], [0.4, 0.3, 0.9], [0.55, 0.06, 0.05], 2], [[0, 1.25, 0], [0.55, 0.32, 0.55], [0.92, 0.1, 0.08], 0], [[0, 1.64, 0], [0.3, 0.3, 0.3], [1, 0.22, 0.16], 1]]) {
      const col = tc ? tc[ti] : col0;
      const w = lay(c), sc = sz.map((v) => v * s);
      effects.shatter({ min: w.map((v, i) => v - sc[i] / 2), max: w.map((v, i) => v + sc[i] / 2), scale: sc, center: w, color: col }, bot.killDir || [0, 0, 0], 3, 2.5, 0.12);
    }
    effects.dust(bot.pos, 6);
    sounds.crumble();
  },
  onCleared: (n) => { banner('WAVE CLEARED', `WAVE ${n} DONE · NEXT WAVE IN 5`, 'good', 3); },
  onNextWave: (n) => { banner(`WAVE ${n}`, `${botMgr.bots.length} HOSTILES INBOUND`, 'bad', 2.2); },
};

// big centre banner (wave titles, countdown)
let bannerT = 0;
function banner(text, sub = '', kind = '', dur = 1.6) {
  hud.banner.className = kind;
  hud.banner.firstChild.textContent = text;
  hud.banner.lastChild.textContent = sub;
  bannerT = dur;
}

// --- console button
function nearConsole() {
  const c = map.deck.console;
  return Math.abs(player.pos[1] - c[1]) < 0.5 && Math.hypot(player.pos[0] - c[0], player.pos[2] - c[2]) < 2.3;
}
function pressConsole() {
  if (botMgr.running) {
    botMgr.stop();
    map.deckRefs.screen.color = [0.15, 0.4, 0.9];
    banner('SESSION ENDED', `BEST WAVE ${botMgr.best}`, '', 2);
    sounds.button();
    return;
  }
  const c = map.deck.console, e = player.eye();
  const to = [c[0] - e[0], c[1] + 1.1 - e[1], c[2] - e[2]];
  pressSeq = { t: 0, yaw0: player.yaw, pitch0: player.pitch, yaw1: Math.atan2(-to[0], -to[2]), pitch1: Math.atan2(to[1], Math.hypot(to[0], to[2])) };
  let dy = pressSeq.yaw1 - pressSeq.yaw0;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  pressSeq.yaw1 = pressSeq.yaw0 + dy;
  player.vel = [0, 0, 0];
  player.cancelAbilities();
}
const idleInput = { aiming: false, fireDown: false, fireHit: false, hit: () => false, down: () => false, mouse: () => false, mouseHit: () => false, dx: 0, dy: 0 };
function updatePress(dt) {
  const ps = pressSeq;
  ps.t += dt;
  const k = Math.min(ps.t / 0.35, 1), e = k * k * (3 - 2 * k);
  player.yaw = ps.yaw0 + (ps.yaw1 - ps.yaw0) * e;
  player.pitch = ps.pitch0 + (ps.pitch1 - ps.pitch0) * e;
  player.press = Math.min(ps.t / 0.9, 1);
  const btn = map.deckRefs.button;
  const down = ps.t > 0.38 && ps.t < 0.62;
  if (ps.t > 0.38 && !ps.clicked) { ps.clicked = true; sounds.button(); btn.color = [1, 0.85, 0.7]; btn.emissive = 1; map.deckRefs.screen.color = [0.9, 0.15, 0.1]; }
  const c = [...btn.center]; c[1] = map.deck.y + 1.14 - (down ? 0.05 : 0); moveBoxTo(btn, c);
  if (ps.t >= 0.9) {
    pressSeq = null;
    player.press = null;
    btn.color = [0.95, 0.15, 0.1]; btn.emissive = 0.8;
    startCutscene();
  }
}

// --- cutscene: sweep over the deck, watch the bots drop in, swoop back to you
const lerp3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
function startCutscene() {
  botMgr.start(true);
  cutscene = { t: 0, eye0: player.eye(), fwd0: player.forward(), shown: false, doors: false };
  document.body.classList.add('cine');
}
function cutsceneCam() {
  const c = cutscene, cam = map.deck.cam;
  const look = (eye, at) => norm(at.map((v, i) => v - eye[i]));
  if (c.t < 1.9) {
    const k = sm(c.t / 1.9), eye = lerp3(cam.wide.from, cam.wide.to, k);
    return { eye, fwd: look(eye, cam.wide.look) };
  }
  if (c.t < 3.9) {
    const k = sm((c.t - 1.9) / 2), eye = lerp3(cam.pods.from, cam.pods.to, k);
    return { eye, fwd: look(eye, cam.pods.look) };
  }
  const k = sm((c.t - 3.9) / 0.9);
  const eye = lerp3(cam.pods.to, player.eye(), k);
  const f0 = look(cam.pods.to, cam.pods.look), f1 = player.forward();
  return { eye, fwd: norm(lerp3(f0, f1, k)) };
}
function updateCutscene(dt) {
  const c = cutscene;
  c.t += dt;
  if (c.t > 2.2 && !c.shown) { c.shown = true; banner(`WAVE ${botMgr.wave}`, `${botMgr.bots.length} HOSTILES INBOUND`, 'bad', 2.4); }
  if (c.t > 3.2 && !c.doors) { c.doors = true; botMgr.doorTarget = 1; sounds.doors(); }
  if (c.t >= 4.8) {
    cutscene = null;
    document.body.classList.remove('cine');
    botMgr.state = 'countdown';
    botMgr.timer = 3;
  }
}

let lastCount = 0;
function updateCombat(dt) {
  botMgr.update(dt, botHooks);
  if (tdm.active) {
    tdm.update(dt, tdm === online ? netHooks : botHooks);
    matchEvents();
    if (inStadium()) recordKillcam(dt);
  }
  if (botMgr.state === 'countdown') {
    const n = Math.ceil(botMgr.timer);
    if (n !== lastCount && n > 0) { lastCount = n; banner(String(n), 'GET READY', '', 0.9); sounds.beep(false); }
  } else if (lastCount && botMgr.state === 'fight') { lastCount = 0; banner('FIGHT', '', 'bad', 1); sounds.beep(true); }
  // regen after 4s without damage
  player.hurtT += dt;
  player.invuln = Math.max(0, player.invuln - dt);
  if (!player.dead && player.hurtT > 4 && player.hp < player.maxHp) player.hp = Math.min(player.maxHp, player.hp + 40 * dt);
}

// ---------- class gadgets: Medium's bounce pad, Heavy's barricade ----------
const myGadgetOwner = () => (online.active ? online.myId : 'me');
const ABIL_CD = { barricade: 10, lowwall: 12, pad: 14, launchpad: 14, heal: 20 };
// which cooldown each ability runs on
const ABIL_SLOT = { blink: 'buff', stim: 'buff', scan: 'buff', overdrive: 'buff', fortify: 'buff', charge: 'buff', grapple: 'grapple', tether: 'grapple', dash: 'dash', cloak: 'cloak', pad: 'pad', launchpad: 'pad', heal: 'heal', barricade: 'barricade', lowwall: 'barricade', slam: 'slam' };
let cloakT = 0;          // CLOAK: seconds of invisibility left
const CLOAK_TIME = 6;
function placeGadget(spec) {
  const owner = myGadgetOwner();
  const full = { gid: gadgets.newId(owner), ...spec, owner, team: tdm.active ? tdm.myTeam?.idx : -1, teamCol: tdm.active ? tdm.myTeam?.rgb : null };
  gadgets.place(full);
  if (online.active) online.send({ t: 'gad', id: online.myId, g: full });
}
const noRoom = () => { sounds.denied(); banner('NO ROOM', 'NEEDS FLAT, OPEN FLOOR', 'bad', 0.9); };
function useGadget(kind) {
  const wall = kind === 'barricade' || kind === 'lowwall';
  const a = player.abil[ABIL_SLOT[kind]];
  if (!a || a.cd > 0 || player.dead) { if (a?.cd > 0) sounds.denied(); return; }
  const spot = wall ? gadgets.barricadeSpot(player.pos, player.yaw, kind === 'lowwall' ? BLOCKADE : BARRICADE)
    : gadgets.padSpot(player.eye(), player.forward(), player.pos, kind === 'heal' ? 0.35 : undefined);
  if (!spot) { noRoom(); return; }
  placeGadget({ k: wall ? 'bar' : kind === 'heal' ? 'heal' : 'pad', v: kind === 'lowwall' ? 'low' : kind === 'launchpad' ? 'launch' : undefined, yaw: +player.yaw.toFixed(3), ...spot });
  a.max = ABIL_CD[kind];
  a.cd = a.max;
  if (wall) { player.camPitchV -= 0.5; player.shake = Math.max(player.shake || 0, 0.2); }
}
// ---- the "buff" abilities: instant effects and short self-boosts that share one cooldown slot
const BUFF = { blink: { cd: 8 }, stim: { cd: 18, dur: 5 }, scan: { cd: 20, dur: 6 }, overdrive: { cd: 22, dur: 6 }, fortify: { cd: 20, dur: 6 }, charge: { cd: 12, dur: 0.55 } };
let buffKind = '', buffT = 0, chargeHit = null, chargeDir = null;
function useBuff(kind) {
  const a = player.abil.buff, B = BUFF[kind];
  if (!B || player.dead) return;
  if (a.cd > 0) { sounds.denied(); return; }
  a.max = B.cd; a.cd = B.cd;
  buffKind = kind; buffT = B.dur || 0;
  if (kind === 'blink') {
    // the way you're moving (or looking), flat; stop short of anything solid
    const v = player.vel, sp = Math.hypot(v[0], v[2]), f = player.forward();
    const dir = sp > 1.5 ? [v[0] / sp, 0, v[2] / sp] : norm([f[0], 0, f[2]]);
    const from = [player.pos[0], player.pos[1] + 0.9, player.pos[2]];
    const hit = world.raycast(from, dir, 10.4, false);
    let d = Math.max(0, (hit ? hit.t : 10.4) - 0.5);
    // don't land inside something: back off until there's room
    for (; d > 0.5; d -= 0.5) { const p = [player.pos[0] + dir[0] * d, player.pos[1], player.pos[2] + dir[2] * d]; if (!world.firstOverlap([p[0] - 0.3, p[1] + 0.15, p[2] - 0.3], [p[0] + 0.3, p[1] + 1.7, p[2] + 0.3])) break; }
    for (let i = 0; i < 14; i++) { const k = i / 14 * d; effects.spawnPiece([from[0] + dir[0] * k, from[1] + (Math.random() - 0.5) * 0.8, from[2] + dir[2] * k], [0.05, 0.05, 0.05], [0, 0.6, 0], [0.5, 0.9, 1], 0.35 + Math.random() * 0.2, 1); effects.debris[effects.debris.length - 1].noGravity = true; }
    player.pos[0] += dir[0] * d; player.pos[2] += dir[2] * d;
    player.invuln = Math.max(player.invuln || 0, 0.25);
    fovKick = 14; sounds.whoosh?.(); sounds.cloak?.();
  } else if (kind === 'stim') { sounds.checkpoint?.(); banner('STIM', 'FASTER · HEALING', 'good', 0.8); }
  else if (kind === 'scan') { sounds.lock?.(); banner('RECON PULSE', 'ENEMIES MARKED', 'good', 0.8); }
  else if (kind === 'overdrive') { sounds.turretHeavy?.(); banner('OVERDRIVE', '+25% DAMAGE', 'good', 0.8); skinHeat = 1; }
  else if (kind === 'fortify') { sounds.barricade?.(); banner('FORTIFIED', 'HALF DAMAGE', 'good', 0.8); }
  else if (kind === 'charge') {
    const f = player.forward();
    chargeDir = norm([f[0], 0, f[2]]); chargeHit = new Set();
    sounds.whoosh?.(); player.shake = Math.max(player.shake || 0, 0.25);
  }
}
const buffOn = (k) => buffT > 0 && buffKind === k;
function updateBuffs(dt) {
  if (buffT <= 0) return;
  buffT -= dt;
  if (player.dead) { buffT = 0; return; }
  if (buffKind === 'stim') player.hp = Math.min(player.maxHp, player.hp + 20 * dt);
  if (buffKind === 'overdrive') skinHeat = Math.max(skinHeat, 0.8);
  if (buffKind === 'charge') {
    // run them down
    player.vel[0] = chargeDir[0] * 19; player.vel[2] = chargeDir[2] * 19;
    fovKick = Math.max(fovKick, 10);
    for (const t of enemyTargets()) {
      const p = t.pos || t.ref?.pos;
      if (!p || chargeHit.has(t.ref) || Math.hypot(p[0] - player.pos[0], p[2] - player.pos[2]) > 1.7 || Math.abs(p[1] - player.pos[1]) > 1.6) continue;
      chargeHit.add(t.ref);
      hitTarget(t.ref, 90, false, [p[0], p[1] + 1, p[2]], chargeDir, 'BULL CHARGE');
      player.shake = Math.max(player.shake || 0, 0.4); sounds.slam?.();
    }
    blastWalls([player.pos[0] + chargeDir[0] * 0.9, player.pos[1] + 0.9, player.pos[2] + chargeDir[2] * 0.9], 1.1, 90);
    if (Math.random() < dt * 30) effects.dust([player.pos[0], player.pos[1] + 0.1, player.pos[2]], 1);
  }
  if (buffT <= 0 && (buffKind === 'stim' || buffKind === 'fortify' || buffKind === 'overdrive')) sounds.cloak?.();
}
// CLOAK: invisible for a few seconds; enemies can't pick you out unless they're right on top of you
function useCloak() {
  const a = player.abil.cloak;
  if (player.dead) return;
  if (cloakT > 0) { cloakT = 0; return; }
  if (a.cd > 0) { sounds.denied(); return; }
  cloakT = CLOAK_TIME;
  a.cd = a.max;
  sounds.cloak?.();
}
// healing stations heal whoever's on the owner's side nearby
function updateHealing(dt) {
  const myTeam = tdm.active ? tdm.myTeam?.idx ?? -1 : -1;
  for (const g of gadgets.list) {
    if (g.k !== 'heal' || g.t < 0.3) continue;
    const friendly = g.owner === myGadgetOwner() || (myTeam >= 0 && g.team === myTeam);
    const near = (p) => Math.hypot(p[0] - g.p[0], p[2] - g.p[2]) < 4.5 && Math.abs(p[1] - g.p[1]) < 2.5;
    if (friendly && !player.dead && player.hp < player.maxHp && near(player.pos)) {
      player.hp = Math.min(player.maxHp, player.hp + 20 * dt);
      if (Math.random() < dt * 8) effects.spawnPiece([player.pos[0] + (Math.random() - 0.5) * 0.8, player.pos[1] + 0.4 + Math.random(), player.pos[2] + (Math.random() - 0.5) * 0.8], [0.05, 0.05, 0.05], [0, 1.4, 0], [0.3, 1, 0.5], 0.6, 1);
    }
    if (tdm.active && tdm !== online) for (const a of tdm.agents) {
      const b = a.bot;
      if (b && b.alive && b.team === g.team && b.hp < b.maxHp && near(b.pos)) b.hp = Math.min(b.maxHp, b.hp + 20 * dt);
    }
    if (Math.random() < dt * 6) {
      effects.spawnPiece([g.p[0] + (Math.random() - 0.5) * 0.4, g.p[1] + 0.8, g.p[2] + (Math.random() - 0.5) * 0.4], [0.05, 0.05, 0.05], [(Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2], [0.3, 1, 0.5], 0.8, 1);
      effects.debris[effects.debris.length - 1].noGravity = true;
    }
  }
}

// ---------- throwables (Z) ----------
const THROW_KIND = { frag: 'frag_t', smoke: 'smoke', flash: 'flash', molotov: 'molotov', cluster: 'cluster_t' };
function useThrowable() {
  if (player.dead || launcherW) return;
  if (throwCharges <= 0) { sounds.denied(); return; }
  const kind = THROW_KIND[equippedThrow];
  const e = player.eye(), from = [0, 1, 2].map((i) => e[i] + camFwd[i] * 0.45 + camRight[i] * 0.18 - camUp[i] * 0.12);
  const v = [0, 1, 2].map((i) => camFwd[i] * 17 + (i === 1 ? 4 : 0) + player.vel[i] * 0.5);
  heavy.launch(kind, from, v, true, HEAVY_STATS[kind].name);
  throwCharges--;
  weapon().equip();              // the gun dips while your hand's busy
  player.camPitchV += 0.3;
  sounds.cloth?.();
}
// a flashbang went off: white you out if you were looking, and blind bots that could see it
function flashAt(pos) {
  const e = player.eye(), d = [pos[0] - e[0], pos[1] - e[1], pos[2] - e[2]], L = Math.hypot(...d) || 1;
  if (!player.dead && L < 24) {
    const hit = world.raycast(e, d.map((v) => v / L), L, false);
    if (!hit || hit.t > L - 0.4) {
      const facing = (d[0] * camFwd[0] + d[1] * camFwd[1] + d[2] * camFwd[2]) / L;
      const k = Math.max(0, 1 - L / 24) * (0.3 + 0.7 * Math.max(0, facing));
      flashT = Math.max(flashT, Math.min(4, k * 5.5));
    }
  }
  if (tdm.active) for (const a of tdm.agents) {
    if (!a.isAI && tdm === online) continue;
    if (!a.bot?.alive) continue;
    const be = a.bot.eye(), bd = Math.hypot(be[0] - pos[0], be[1] - pos[1], be[2] - pos[2]);
    if (bd > 18) continue;
    const dir = [pos[0] - be[0], pos[1] - be[1], pos[2] - be[2]].map((v) => v / (bd || 1));
    const hit = world.raycast(be, dir, bd, false, (b) => b.ref === a.bot);
    if (!hit || hit.t > bd - 0.4) { a.blindT = Math.max(a.blindT || 0, 1.5 + 3 * (1 - bd / 18)); a.target = null; }
  }
}

// ---------- heavy weapons (Q) ----------
const POD_V = { dronepod: '', swarmpod: 'swarm', hunterpod: 'hunter', hivepod: 'hive' };      // pod id -> the gadget's variant
function useHeavy() {
  if (player.dead) return;
  if (launcherW) { putAwayLauncher(false); return; }
  if (heavyCd > 0) { sounds.denied(); return; }
  const id = equippedHeavy, st = HEAVY_STATS[id];
  if (id.startsWith('gl_')) {
    // pull the launcher out; one click fires it, then it goes away
    const def = defFor('gl');
    def.parts = def.parts.map((p) => (p.name === 'band' ? { ...p, col: st.col } : p));
    def.name = st.name.replace(' LAUNCHER', '');
    launcherW = new Weapon(def);
    launcherW.ammo = 1;
    launcherW.equip();
    launcherKind = id; launcherT = 0;
    sounds.swap();
    updateSlotHud();
    return;
  }
  if (id === 'mines') {
    // three mines in a spread across where you're aiming
    const c = gadgets.padSpot(player.eye(), player.forward(), player.pos, 0.2);
    if (!c) { noRoom(); return; }
    const f = player.forward(), hl = Math.hypot(f[0], f[2]) || 1, side = [-f[2] / hl, f[0] / hl];
    let n = 0;
    for (const k of [-1, 0, 1]) {
      const x = c.p[0] + side[0] * k * 1.5, z = c.p[2] + side[1] * k * 1.5;
      const hit = world.raycast([x, c.p[1] + 1, z], [0, -1, 0], 2.5, false);
      if (!hit || hit.normal[1] < 0.7) continue;
      placeGadget({ k: 'mine', ax: 0, p: [+x.toFixed(3), +hit.point[1].toFixed(3), +z.toFixed(3)] });
      n++;
    }
    if (!n) { noRoom(); return; }
  } else if (POD_V[id] !== undefined) {
    const spot = gadgets.padSpot(player.eye(), player.forward(), player.pos, 0.35);
    if (!spot) { noRoom(); return; }
    placeGadget({ k: 'pod', v: POD_V[id] || undefined, ax: 0, ...spot });
  } else {
    const spot = gadgets.turretSpot(player.pos, player.yaw);
    if (!spot) { noRoom(); return; }
    placeGadget({ k: 'tur', v: id === 'turret_heavy' ? 'heavy' : id === 'turret_flame' ? 'flame' : undefined, ...spot });
    player.camPitchV -= 0.4;
  }
  heavyCd = st.cd;
}
// the Light's TETHER LAUNCHER (ability): same idea as the grenade launcher, it fires a tether bolt
function useTether() {
  if (player.dead) return;
  if (launcherW) { const was = launcherKind; putAwayLauncher(false); if (was === 'tether') return; }
  const a = player.abil.grapple;
  if (a.cd > 0) { sounds.denied(); return; }
  const def = defFor('tg');
  launcherW = new Weapon(def);
  launcherW.ammo = 1;
  launcherW.equip();
  launcherKind = 'tether'; launcherT = 0;
  sounds.swap();
  updateSlotHud();
}
function putAwayLauncher(fired) {
  if (!launcherW) return;
  launcherW = null;
  if (fired && launcherKind === 'tether') { player.abil.grapple.max = TETHER.cd; player.abil.grapple.cd = TETHER.cd; }
  else if (fired) heavyCd = HEAVY_STATS[launcherKind].cd;
  weapon().equip();
  updateSlotHud();
}
function gadgetHit(g, dmg) {
  gadgets.damage(g, dmg);
  if (online.active) online.send({ t: 'gdm', gid: g.gid, dmg });
}
// the player as something a bounce pad can throw
const padRider = {
  get pos() { return player.pos; }, get vel() { return player.vel; }, get dead() { return player.dead || !playing; }, padCd: 0,
  onBounce(vy, push) {
    player.cancelAbilities?.();
    Object.assign(player, { sliding: false, grounded: false, trav: null, wallRun: null, coyote: 0 });
    player.pos[1] += 0.05;
    player.vel[1] = vy;
    const hs = Math.hypot(player.vel[0], player.vel[2]);
    if (push) { player.vel[0] = push[0]; player.vel[2] = push[1]; }     // launch pad: thrown the way it faces
    else if (hs > 1.5) { const k = Math.min(1.3, 16 / hs); player.vel[0] *= k; player.vel[2] *= k; }
    player.shake = Math.max(player.shake || 0, 0.25);
    player.camPitchV -= 0.9;
    player.landV -= 0.4;
  },
};

// ---------- HUD ----------
const hud = {
  ammo: $('ammo'), reserve: $('reserve'), reload: $('reload'), speed: $('speed'), fps: $('fps'),
  kills: $('kills'), acc: $('acc'), chunks: $('chunks'), cross: $('crosshair'), hitmarker: $('hitmarker'),
  dmgLayer: $('damage'), state: $('state'), wname: $('weaponname'), wtype: $('weapontype'), prompt: $('prompt'),
  scope: $('scope'), slots: [$('slot1'), $('slot2'), $('slot3')],
  ab: { main: $('ab-main'), heavy: $('ab-heavy'), thr: $('ab-throw') },
  hp: $('health'), hpBar: $('hpbar'), hpNum: $('hpnum'), dmg: $('dmgdirs'), lowhp: $('lowhp'), killfeed: $('killfeed'),
  wave: $('wavepanel'), waveTitle: $('wavetitle'), waveInfo: $('waveinfo'), banner: $('banner'), death: $('death'), deathSub: $('deathsub'), deathTitle: $('death').querySelector('b'),
  speedo: $('speedo'), speedBar: $('speedbar'), speedNum: $('speednum'), chain: $('chain'),
  course: $('course'), courseTime: $('coursetime'), courseInfo: $('courseinfo'), flash: $('flash'), fade: $('fade'),
};
let hitTimer = 0;
// how far left (-1) or right (+1) of where you're looking a sound is
function panOf(p) {
  const dx = p[0] - player.pos[0], dz = p[2] - player.pos[2], l = Math.hypot(dx, dz) || 1;
  return (dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw)) / l;
}
function showHitmarker(kill, head) {
  hud.hitmarker.className = kill ? 'kill' : head ? 'head' : '';
  hud.hitmarker.style.opacity = 1;
  hitTimer = kill ? 0.28 : 0.14;
}

function renderKillFeed() {
  hud.killfeed.replaceChildren(...kills.map((k) => {
    const row = document.createElement('div');
    row.className = k.a === 'YOU' ? 'mine' : k.b === 'YOU' ? 'me' : '';
    const a = document.createElement('b'); a.textContent = k.a;
    const w = document.createElement('span'); w.textContent = ` ${k.w}${k.head ? ' ◎' : ''} `;
    const b = document.createElement('b'); b.textContent = k.b;
    row.append(a, w, b);
    return row;
  }));
}
function keyLabel(code) { return code.replace(/^Key/, '').replace(/^Digit/, '').toUpperCase(); }
let grappleOk = false;
function updateAbilityHud() {
  const a = player.abil;
  const set = (el, frac, ready, extra = '') => {
    el.style.setProperty('--p', frac.toFixed(3));
    el.classList.toggle('ready', ready);
    el.querySelector('.cd').textContent = extra;
    el.classList.toggle('cooling', !!extra);
  };
  const ab = hud.ab.main, isG = equippedAbility === 'grapple' || equippedAbility === 'tether';
  const tetherOut = !!launcherW && launcherKind === 'tether';
  const name = ABILITIES[equippedAbility]?.short || '';
  if (ab.dataset.name !== name) { ab.dataset.name = name; ab.querySelector('b').textContent = name; }
  if (isG) {
    const gActive = (player.grapple && player.grapple.phase !== 'miss') || tetherOut;
    set(ab, gActive ? 0 : a.grapple.cd / a.grapple.max, a.grapple.cd <= 0 || gActive, a.grapple.cd > 0 && !gActive ? a.grapple.cd.toFixed(1) : '');
    ab.classList.toggle('active', !!gActive);
  } else if (equippedAbility === 'dash') {
    const d = a.dash, rem = d.charges < d.max ? 1 - d.t / d.recharge : 0;
    set(ab, d.charges > 0 ? 0 : rem, d.charges > 0);
    ab.classList.remove('active');
  } else {
    const k = ABIL_SLOT[equippedAbility], bOn = buffT > 0 && buffKind === equippedAbility && BUFF[buffKind]?.dur > 1, on = (equippedAbility === 'cloak' && cloakT > 0) || bOn;
    set(ab, on ? 0 : a[k].cd / a[k].max, a[k].cd <= 0 || on, on ? (bOn ? buffT : cloakT).toFixed(1) : a[k].cd > 0 ? a[k].cd.toFixed(1) : '');
    ab.classList.toggle('active', on);
  }
  const pips = equippedAbility === 'barricade' || equippedAbility === 'dash';
  ab.querySelector('.pips').classList.toggle('hidden', !pips);
  if (equippedAbility === 'barricade') {
    const mine = gadgets.list.filter((g) => g.owner === myGadgetOwner() && g.k === 'bar' && g.v !== 'low').length;
    ab.querySelectorAll('.pip').forEach((p, i) => p.classList.toggle('on', i < 2 - mine));
  } else if (equippedAbility === 'dash') ab.querySelectorAll('.pip').forEach((p, i) => p.classList.toggle('on', i < a.dash.charges));
  // heavy weapon
  const hv = hud.ab.heavy, hn = HEAVIES[equippedHeavy]?.short || '', hmax = HEAVY_STATS[equippedHeavy]?.cd || 1;
  if (hv.dataset.name !== hn) { hv.dataset.name = hn; hv.querySelector('b').textContent = hn; }
  set(hv, heavyCd / hmax, heavyCd <= 0, heavyCd > 0 ? heavyCd.toFixed(1) : '');
  hv.classList.toggle('active', !!launcherW && !tetherOut);
  // throwable: two charges
  const th = hud.ab.thr, tn = THROWABLES[equippedThrow]?.short || '';
  if (th.dataset.name !== tn) { th.dataset.name = tn; th.querySelector('b').textContent = tn; }
  set(th, throwCharges > 0 ? 0 : 1 - throwT / THROW_RECHARGE, throwCharges > 0);
  th.querySelectorAll('.pip').forEach((p, i) => p.classList.toggle('on', i < throwCharges));
  // grapple range hint on the crosshair
  grappleOk = equippedAbility === 'grapple' && a.grapple.cd <= 0 && !player.grapple && !!player.grappleTarget();
  hud.cross.classList.toggle('grapple', grappleOk);
}
function refreshAbilityKeys() {
  hud.ab.main.querySelector('kbd').textContent = keyLabel(settings.abilityKey);
  hud.ab.heavy.querySelector('kbd').textContent = keyLabel(settings.heavyKey);
  hud.ab.thr.querySelector('kbd').textContent = keyLabel(settings.throwKey);
}

function updateSlotHud() {
  slots.forEach((w, i) => {
    hud.slots[i].textContent = `${i + 1}  ${w.def.name}`;
    hud.slots[i].classList.toggle('active', i === current);
  });
  hud.wname.textContent = weapon().def.name;
  hud.wtype.textContent = weapon().def.type;
}
updateSlotHud();
refreshAbilityKeys();
applyClass();

const vp = mat4();
function project(p) {
  const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12];
  const y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13];
  const w = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
  if (w <= 0.01) return null;
  return [(x / w * 0.5 + 0.5) * innerWidth, (1 - (y / w * 0.5 + 0.5)) * innerHeight];
}

let nearCase = null, nearBench = false;
function findBench() {
  const eye = player.eye(), fwd = player.forward(), c = workbench.center;
  const to = [c[0] - eye[0], 1.0 - eye[1] + c[1], c[2] + 0.4 - eye[2]];
  return Math.hypot(...to) < 3.0 && dot(norm(to), fwd) > 0.4;
}
// ---- armoury panels: E takes the gun; E on the gun you're already holding spins the panel round to its variant
// (and hands it over as it comes round)
function useRack(c) {
  const slot = c.def.melee ? 2 : SIDEARMS.includes(c.def.id) ? 1 : 0;
  if (slots[slot]?.def.id === c.def.id && c.vid) {
    if (c.flip()) { c.give = 0.42; sounds.rackSpin?.(); }
  } else pickUp(c.def);
}
function updateRacks(dt) {
  for (const c of cases) {
    c.update?.(dt);
    if (c.give > 0 && (c.give -= dt) <= 0) { c.give = 0; pickUp(c.def); }
  }
}
// the info card that pops up beside the crosshair when you look at a gun on the wall
let tipEl = null, tipKey = '';
const STAT_ROWS = ['DAMAGE', 'FIRE RATE', 'RANGE', 'ACCURACY', 'HANDLING', 'MAGAZINE'];
function gunTip(c) {
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.id = 'gun-tip'; document.getElementById('hud').append(tipEl); }
  if (!c) { tipEl.classList.remove('on'); tipKey = ''; return; }
  const d = c.def, slot = d.melee ? 2 : SIDEARMS.includes(d.id) ? 1 : 0, holding = slots[slot]?.def.id === d.id, other = c.other;
  const key = `${d.id}|${holding}|${c.flipT < 1}`;
  tipEl.classList.add('on');
  if (key === tipKey) return;
  tipKey = key;
  const col = `rgb(${c.col.map((v) => Math.round(v * 255)).join(',')})`;
  const rt = ratings(d), row = (n) => { const r = rt.find((x) => x.name === n); return `<div class="gt-row"><span>${n}</span><i><b style="width:${Math.round(r.v * 100)}%"></b></i><em>${r.text || ''}</em></div>`; };
  const isVar = !!VARIANT_OF[d.id], desc = isVar ? d.vdesc : d.melee ? MELEE_DESC[d.id] : GUN_DESC[d.id] || '';
  const act = c.flipT < 1 ? '<div class="gt-act spin">SWITCHING…</div>'
    : holding && other ? `<div class="gt-act"><kbd>E</kbd> SWITCH TO <b>${other.name}</b></div>`
    : holding ? '<div class="gt-act"><kbd>E</kbd> REFILL</div>'
    : `<div class="gt-act"><kbd>E</kbd> TAKE</div>${other ? `<div class="gt-alt">PRESS <kbd>E</kbd> AGAIN TO SWITCH TO <b>${other.name}</b></div>` : ''}`;
  tipEl.style.setProperty('--gt', col);
  tipEl.innerHTML = `<div class="gt-cat">${c.rack}${isVar ? ' · <span class="gt-var">VARIANT</span>' : ''}</div>
    <div class="gt-name">${d.name}</div><div class="gt-type">${d.type}</div>
    <div class="gt-desc">${desc}</div>${(d.melee ? ['DAMAGE', 'FIRE RATE', 'HANDLING'] : STAT_ROWS).map(row).join('')}${act}`;
}
function findCase() {
  const eye = player.eye(), fwd = player.forward();
  let best = null, bestDot = 0.93;
  for (const c of cases) {
    const to = [c.aim[0] - eye[0], c.aim[1] - eye[1], c.aim[2] - eye[2]];
    const dist = Math.hypot(...to);
    if (dist > 3.4) continue;
    const dd = dot(norm(to), fwd);
    if (dd > bestDot) { bestDot = dd; best = c; }
  }
  return best;
}

let fpsAcc = 0, fpsFrames = 0;
function updateHud(dt, fovRad) {
  const w = weapon();
  updateMatchHud(dt);
  hud.ammo.textContent = w.def.melee ? '∞' : w.reloading && !w.reload.shell ? '--' : w.ammo;
  hud.ammo.classList.toggle('low', w.ammo <= Math.ceil(w.def.mag * 0.2));
  hud.reserve.textContent = w.def.melee ? '' : w.reserve != null ? `/ ${w.reserve}` : `/ ${w.def.mag}`;
  let rp = 0;
  if (w.reload && !w.reload.shell) rp = w.reload.t / w.reload.total;
  if (w.reload && w.reload.shell) rp = w.ammo / w.def.mag;
  hud.reload.style.opacity = w.reload ? 1 : 0;
  hud.reload.style.setProperty('--p', rp);
  hud.speed.textContent = player.hSpeed.toFixed(1);
  hud.kills.textContent = stats.kills;
  hud.chunks.textContent = stats.chunks;
  hud.acc.textContent = stats.shots ? `${Math.round((stats.hits / stats.shots) * 100)}%` : '--';
  updateAbilityHud();
  hud.state.textContent = player.grapple?.phase === 'pull' ? 'GRAPPLE' : player.dash ? 'DASH' : player.slam ? 'SLAM' : player.hanging ? 'HANG' : player.wallRunning ? 'WALL RUN' : player.mantle ? 'MANTLE' : player.vaulting ? 'VAULT' : player.sliding ? 'SLIDE' : player.crouching ? 'CROUCH' : player.sprinting ? 'SPRINT' : !player.grounded ? 'AIR' : '';

  // speed meter + slide-hop chain
  hud.speedBar.style.setProperty('--p', Math.min(player.hSpeed / 16, 1).toFixed(3));
  hud.speedNum.textContent = player.hSpeed.toFixed(1);
  hud.chain.textContent = player.chain > 0 ? `CHAIN ×${player.chain}` : '';
  hud.speedo.classList.toggle('hot', player.chain > 0 || player.hSpeed > 11);

  // parkour course
  hud.course.classList.toggle('hidden', !course.visible);
  if (course.visible) {
    const cps = map.course.checkpoints.length;
    hud.courseTime.textContent = course.state === 'idle' ? '0:00.00' : fmtTime(course.t);
    hud.courseInfo.textContent = `CP ${Math.min(course.next, cps)}/${cps} · BEST ${course.best != null ? fmtTime(course.best) : '--'} · X RESTART`;
  }
  const f = course.flash;
  if (f) {
    hud.flash.style.opacity = f.t < 1.2 ? 1 : 1 - (f.t - 1.2) / 0.4;
    hud.flash.style.transform = `translate(-50%, -50%) scale(${1 + Math.max(0, 0.15 - f.t) * 1.2})`;
    if (hud.flash.dataset.text !== f.text + f.sub) {
      hud.flash.dataset.text = f.text + f.sub;
      hud.flash.className = f.kind;
      hud.flash.innerHTML = `<b></b><span></span>`;
      hud.flash.firstChild.textContent = f.text;
      hud.flash.lastChild.textContent = f.sub;
    }
  } else hud.flash.style.opacity = 0;
  hud.fade.style.opacity = course.failT > 0 ? course.failT / 0.35 : voidT > 0 ? 1 - voidT / 0.35 : 0;

  // health
  const hpk = player.hp / player.maxHp;
  hud.hpBar.style.setProperty('--p', hpk.toFixed(3));
  hud.hpNum.textContent = Math.ceil(player.hp);
  hud.hp.classList.toggle('low', hpk < 0.35);
  hud.lowhp.style.opacity = player.dead ? 0 : Math.max(0, (0.5 - hpk) * 1.6) + Math.max(0, 0.35 - player.hurtT) * 1.2;
  // damage direction arrows around the crosshair
  for (let i = dmgDirs.length - 1; i >= 0; i--) { dmgDirs[i].t += dt; if (dmgDirs[i].t > 1.2) dmgDirs.splice(i, 1); }
  while (hud.dmg.children.length < dmgDirs.length) hud.dmg.appendChild(document.createElement('i'));
  [...hud.dmg.children].forEach((el, i) => {
    const d = dmgDirs[i];
    if (!d) { el.style.opacity = 0; return; }
    const rel = d.ang - player.yaw;
    el.style.transform = `rotate(${(-rel * 180 / Math.PI).toFixed(1)}deg)`;
    el.style.opacity = d.t < 0.6 ? 1 : 1 - (d.t - 0.6) / 0.6;
  });
  // kill feed ageing
  let feedChanged = false;
  for (let i = kills.length - 1; i >= 0; i--) { kills[i].t += dt; if (kills[i].t > 6) { kills.splice(i, 1); feedChanged = true; } }
  if (feedChanged) renderKillFeed();
  // wave panel
  hud.wave.classList.toggle('hidden', !botMgr.running);
  if (botMgr.running) {
    hud.waveTitle.textContent = `WAVE ${botMgr.wave}`;
    hud.waveInfo.textContent = botMgr.state === 'cleared' ? `NEXT WAVE ${Math.ceil(botMgr.timer)}` : `${botMgr.alive} HOSTILES · BEST ${botMgr.best}`;
  }
  // banner
  bannerT -= dt;
  hud.banner.style.opacity = bannerT > 0 ? Math.min(1, bannerT * 3) : 0;
  hud.banner.style.transform = `translate(-50%, -50%) scale(${1 + Math.max(0, bannerT - (bannerT > 1.5 ? 1.5 : 99)) * 0.3})`;
  // death screen
  hud.death.classList.toggle('hidden', !player.dead);
  if (player.dead) {
    hud.deathTitle.textContent = player.downed ? 'DOWNED' : takenBy ? 'TAKEN DOWN' : 'ELIMINATED';
    hud.deathSub.textContent = takenBy ? `${takenBy.k} BY ${takenBy.name} · RESPAWN IN ${Math.ceil(deathT)}`
      : `BY ${killer} · ${player.downed ? 'THEY CAN FINISH YOU · ' : ''}RESPAWN IN ${Math.ceil(deathT)}`;
  }

  const spreadPx = Math.tan(w.spread(player)) / Math.tan(fovRad / 2) * (innerHeight / 2);
  hud.cross.style.setProperty('--gap', `${Math.max(4, spreadPx).toFixed(1)}px`);
  hud.cross.style.opacity = w.scoped ? 0 : 1 - w.adsT * 0.85;
  hud.cross.classList.toggle('shotgun', w.def.pellets > 1);
  hud.scope.style.opacity = w.scoped ? 1 : 0;

  const lb = playing && !player.dead && inStadium() ? lookLiftButton() : null;
  const hk = settings.abilityKey.replace(/^Key/, '');
  if (downedNear && playing && !player.dead && !td) {
    hud.prompt.innerHTML = `<kbd>E</kbd> TAKEDOWN <b>${downedNear.name}</b> <span>${TAKEDOWNS[myTakedownKind()].name}</span>`;
    hud.prompt.style.opacity = 1;
  } else if (inStadium() && stadium.hook && playing && !player.dead && player.grapple?.anchor) {
    hud.prompt.innerHTML = `<kbd>${hk}</kbd> CUT THE LINE <span>OR JUMP</span>`;
    hud.prompt.style.opacity = 1;
  } else if (inStadium() && stadium.hook && playing && !player.dead && !player.grounded && player.vel[1] < -5 && fallTop != null && fallTop - player.pos[1] > 5) {
    hud.prompt.innerHTML = `<kbd>${hk}</kbd> <b>HOOK A CONTAINER</b> <span>BREAK YOUR FALL</span>`;
    hud.prompt.style.opacity = 1;
  } else if (lb) {
    hud.prompt.innerHTML = `<kbd>E</kbd> ${lb.car ? (lb.dir > 0 ? 'GO UP' : 'GO DOWN') : 'CALL LIFT'} <b>${lb.dir > 0 ? '▲' : '▼'}</b>`;
    hud.prompt.style.opacity = 1;
  } else if (nearConsole() && !pressSeq && !cutscene && !player.dead) {
    hud.prompt.innerHTML = botMgr.running ? '<kbd>E</kbd> END SESSION' : `<kbd>E</kbd> START <b>COMBAT</b> <span>BEST WAVE ${botMgr.best}</span>`;
    hud.prompt.style.opacity = 1;
  } else if (nearBench && !nearCase) {
    hud.prompt.innerHTML = '<kbd>E</kbd> WORKBENCH <span>ATTACHMENTS</span>';
    hud.prompt.style.opacity = 1;
  } else if (nearCase?.ammo) {
    hud.prompt.innerHTML = '<kbd>E</kbd> TAKE <b>AMMO</b> <span>FILL BOTH GUNS</span>';
    hud.prompt.style.opacity = 1;
  } else if (modeThing) {
    hud.prompt.innerHTML = `<kbd>E</kbd> ${modeThing.text}${modeThing.cost ? ` <span${modeThing.ok ? '' : ' class="no"'}>${fmt(modeThing.cost)} POINTS</span>` : ''}`;
    hud.prompt.style.opacity = 1;
  } else if (nearCase) {
    hud.prompt.style.opacity = 0;          // the gun panel's info card does the talking (see gunTip)
  } else hud.prompt.style.opacity = 0;
  gunTip(nearCase && !nearCase.ammo && playing ? nearCase : null);

  hitTimer -= dt;
  if (hitTimer <= 0) hud.hitmarker.style.opacity = 0;

  for (let i = damageNumbers.length - 1; i >= 0; i--) {
    const d = damageNumbers[i];
    d.t += dt;
    if (!d.el) {
      d.el = document.createElement('div');
      d.el.className = `dmg${d.head ? ' head' : ''}${d.burn ? ' burn' : ''}`;
      d.el.textContent = d.amount;
      hud.dmgLayer.appendChild(d.el);
    }
    if (d.t > 0.8) { d.el.remove(); damageNumbers.splice(i, 1); continue; }
    const s = project([d.pos[0], d.pos[1] + d.t * 0.8, d.pos[2]]);
    if (!s) { d.el.style.opacity = 0; continue; }
    d.el.style.transform = `translate(${s[0] + d.drift * 30 * d.t}px, ${s[1]}px) translate(-50%, -50%)`;
    d.el.style.opacity = d.t < 0.5 ? 1 : 1 - (d.t - 0.5) / 0.3;
  }

  // markers over downed bodies, so they're easy to find (enemies: go finish them; team: they're down)
  const dms = [];
  if (tdm.active && inStadium() && playing && !td && !victimCam) for (const e of tdm.entities()) {
    if (e === tdm.you || !e.downed || !e.bot) continue;
    const p = bodyPt(e.bot), d = Math.hypot(p[0] - camEye[0], p[1] - camEye[1], p[2] - camEye[2]);
    if (d > 45) continue;
    const sp = project([p[0], p[1] + 0.9, p[2]]);
    if (sp) dms.push([sp, e, d]);
  }
  // RECON PULSE: every enemy within 45 m is marked through walls while it lasts
  if (buffOn('scan') && tdm.active && inStadium() && playing && !td) for (const e of tdm.entities()) {
    if (e === tdm.you || e.team === tdm.myTeam || !e.alive || !e.pos) continue;
    const d = Math.hypot(e.pos[0] - camEye[0], e.pos[1] + 1 - camEye[1], e.pos[2] - camEye[2]);
    if (d > 45) continue;
    const sp = project([e.pos[0], e.pos[1] + 2.0, e.pos[2]]);
    if (sp) dms.push([sp, e, d, true]);
  }
  downMarks.forEach((el, i) => { if (i >= dms.length) el.style.display = 'none'; });
  dms.forEach(([sp, e, d, scan], i) => {
    let el = downMarks[i];
    if (!el) { el = downMarks[i] = document.createElement('div'); el.className = 'downmark'; hud.dmgLayer.appendChild(el); }
    const foe = e.team !== tdm.myTeam;
    el.style.display = '';
    el.className = `downmark${foe ? ' foe' : ''}`;
    el.innerHTML = scan ? `<b>◆</b><small>${Math.round(d)} M</small>` : `<b>${foe ? '✕' : '✚'}</b><span>${foe ? (d < 2.6 ? 'E · TAKEDOWN' : 'DOWNED') : 'TEAMMATE DOWN'}</span><small>${Math.round(d)} M</small>`;
    el.style.transform = `translate(${sp[0]}px, ${sp[1]}px) translate(-50%, -100%)`;
  });

  fpsAcc += dt; fpsFrames++;
  if (fpsAcc > 0.5) { hud.fps.textContent = Math.round(fpsFrames / fpsAcc); fpsAcc = 0; fpsFrames = 0; }
}

// ---------- menu / pointer lock ----------
let playing = false, locked = false;
const menu = $('menu');

function setPlaying(on) {
  playing = on;
  if (!on) { renderMenu(); showTab('home'); }
  input.enabled = on;
  input.reset();
  menu.classList.toggle('hidden', on);
  document.body.classList.toggle('playing', on);
}

function start() {
  sounds.unlock();
  setPlaying(true);
  try {
    const p = canvas.requestPointerLock?.();
    if (p && p.catch) p.catch(() => $('locknote').classList.remove('hidden'));
    if (!canvas.requestPointerLock) $('locknote').classList.remove('hidden');
  } catch {
    $('locknote').classList.remove('hidden');
  }
}

// ---------- main menu ----------
let sessionStarted = false;
function enterRange() {
  if (where !== 'range') {
    if (tdm.active) endMatch(false);
    where = 'range';
    gadgets.clear(); burning.clear(); heavy.clear(); heavyCd = 0; putAwayLauncher(false); playerTether = null; cloakT = 0; buffT = 0; playerBurn = null; throwCharges = 2; throwT = 0; flashT = 0;
    player.spawn(map.spawn.pos, map.spawn.yaw);
    $('mapname').lastChild.textContent = map.name;
    document.body.classList.remove('stadium');
    effects.clear();
  }
  if (!sessionStarted || classDirty) {
    applyClass();
    resetRange();
    player.respawn();
    Object.assign(player, { hp: player.maxHp });
    sessionStarted = true;
  }
  start();
}
// PLAY: the semi-finals arena
function enterStadium() {
  kcRec = []; kcShots = []; endKillcam();          // a fresh match: forget the last one's killcam
  const arriving = where !== 'stadium';
  if (classDirty || !sessionStarted) { applyClass(); sessionStarted = true; }
  if (arriving) {
    where = 'stadium';
    gadgets.clear(); burning.clear(); heavy.clear(); heavyCd = 0; putAwayLauncher(false); playerTether = null; cloakT = 0; buffT = 0; playerBurn = null; throwCharges = 2; throwT = 0; flashT = 0;
    botMgr.stop();
    course.reset();
    cutscene = null; pressSeq = null;
    effects.clear();
    player.spawn(stadium.spawn.pos, stadium.spawn.yaw);
    Object.assign(player, { hp: player.maxHp, dead: false, press: null });
    slots.forEach((w) => { w.ammo = w.def.mag; w.reload = null; });
    banner(stadium.name, 'SEMI-FINALS', '', 2.4);
    document.body.classList.add('stadium');
    $('mapname').lastChild.textContent = stadium.name;
  }
  start();
}
const resume = () => (inStadium() ? enterStadium() : enterRange());
$('play').addEventListener('click', enterRange);
let menuTab = 'home';
function showTab(tab) {
  menuTab = tab;
  document.querySelectorAll('.mm-nav button, .mm-gear').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  document.querySelectorAll('.mm-page').forEach((p) => p.classList.toggle('hidden', p.dataset.page !== tab));
  $('menu').dataset.screen = tab;
  tryOn = null;
  if (tab === 'custom' || tab === 'shop') custCls = custCls || classLo.cls;
  renderMenu();
  sounds.click?.(2400, 0.12);
}
document.querySelectorAll('.mm-nav button, .mm-gear, .mm-logo').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
document.querySelectorAll('.mm-back').forEach((b) => b.addEventListener('click', () => showTab('home')));
addEventListener('keydown', (e) => {
  if (!playing && !bench.open && e.code === 'Escape' && menuTab !== 'home' && !rebinding) showTab('home');
});
let custCls = null, custSlot = 'head', tryOn = null, shopFilter = 'all';
const fmt = (n) => n.toLocaleString('en-GB');
const thumbs = new Thumbs();
const thumbKey = (id, cls) => `${id}|${cls}|${classLo[cls].weapon}|${JSON.stringify(cosmetics.equip[cls])}`;
function thumbSpec(id, cls) {
  const it = ITEMS[id], w = classLo[cls].weapon;
  const skin = it.slot === 'wskin' ? it.gun : gunSkinFor(cosmetics, cls);
  skinClass = cls;
  const gunDef = skinDef(buildDef(WEAPONS[w], loadouts[w] || {}), skin);
  skinClass = null;
  const outfit = { ...buildOutfit(cosmetics, cls, it.slot === 'wskin' ? null : id) };
  return { slot: it.slot, outfit, gunDef, color: RARITY[it.rarity].color.map((v) => v * 0.8) };
}
function itemCard(id, { onClick, on = false, priceTag = true }) {
  const it = ITEMS[id], r = RARITY[it.rarity];
  const b = el('button', `it${on ? ' on' : ''}${!owns(cosmetics, id) ? ' locked' : ''}`);
  b.type = 'button';
  b.style.setProperty('--r', rgb(r.color));
  // a live 3D portrait of the item (falls back to a colour swatch if the thumbnail renderer isn't available)
  const cls = custCls || classLo.cls;
  const img = el('img', 'sw3');
  img.alt = '';
  img.style.background = `radial-gradient(circle at 50% 40%, ${rgb(r.color.map((v) => v * 0.8))}, ${rgb(r.color.map((v) => v * 0.25))})`;
  const url = thumbs.get(thumbKey(id, cls), () => thumbSpec(id, cls), (u) => { img.src = u; });
  if (url) img.src = url;
  if (!thumbs.ok) {
    const sw = swatch(it);
    const s0 = el('div', 'sw', iconFor(it.slot));
    s0.style.setProperty('--sw', sw ? rgb(sw) : 'rgba(255,255,255,.15)');
    b.append(s0);
  } else b.append(img);
  b.append(el('b', null, it.name), el('small', null, r.name));
  if (it.gun?.tex) b.append(el('span', `livetag${it.live ? ' react' : ''}`, it.live ? 'REACTIVE' : 'PATTERN'));
  else if (it.live) b.append(el('span', 'livetag react', 'ANIMATED'));
  if (SKIN_LV[id] && !owns(cosmetics, id) && skinLocked(progress, id)) b.append(el('span', 'lvtag', `LV ${SKIN_LV[id]}`));
  if (priceTag) {
    if (owns(cosmetics, id)) b.append(el('span', 'price own', it.price ? 'OWNED' : 'FREE'));
    else if (it.pass) b.append(el('span', 'price pass', `PASS ${PASS_TIER[id]?.[0] ?? ''}`));
    else b.append(el('span', 'price', `◆ ${fmt(it.price)}`));
  }
  b.onclick = onClick;
  return b;
}
function renderCustom() {
  const cls = custCls || classLo.cls;
  $('cu-classes').replaceChildren(...CLASS_ORDER.map((id) => {
    const k = CLASSES[id];
    const b = el('button', `mm-class${id === cls ? ' on' : ''}`);
    b.type = 'button';
    b.style.setProperty('--c', rgb(k.color));
    b.append(el('b', null, k.name));
    b.onclick = () => { custCls = id; tryOn = null; sounds.swap?.(); renderMenu(); };
    return b;
  }));
  $('cu-slots').replaceChildren(...CSLOTS.map((sl) => {
    const b = el('button', sl.id === custSlot ? 'on' : '', sl.name);
    b.type = 'button';
    b.onclick = () => { custSlot = sl.id; tryOn = null; renderMenu(); };
    return b;
  }));
  const eq = cosmetics.equip[cls];
  $('cu-items').replaceChildren(...itemsFor(custSlot).map((it) => itemCard(it.id, {
    on: eq[custSlot] === it.id || tryOn === it.id,
    onClick: () => {
      if (owns(cosmetics, it.id)) {
        eq[custSlot] = it.id; tryOn = null; saveCosmetics(cosmetics);
        if (custSlot === 'wskin') refreshGuns();
        sounds.cloth?.();
      } else { tryOn = it.id; sounds.click?.(2000, 0.15); }
      renderMenu();
    },
  })));
  const foot = $('cu-foot');
  if (tryOn) {
    const it = ITEMS[tryOn];
    const pt = PASS_TIER[tryOn];
    const go = el('button', null, it.pass ? 'SEE THE BATTLE PASS ›' : 'GET IT IN THE SHOP ›');
    go.type = 'button';
    go.onclick = () => { const t = tryOn; showTab(it.pass ? 'pass' : 'shop'); tryOn = it.pass ? null : t; renderMenu(); };
    foot.replaceChildren(it.pass ? `Previewing ${it.name}: battle pass tier ${pt?.[0]}${pt?.[1] === 'PREMIUM' ? ' (premium)' : ''}.` : `Previewing ${it.name} (not owned).`, go);
  } else foot.replaceChildren(`Equipped on ${CLASSES[cls].name}. Click an owned item to wear it, or a locked one to preview it.`);
}
function renderShop() {
  const sell = Object.keys(ITEMS).filter((id) => ITEMS[id].price > 0);
  const pick = (id) => () => { tryOn = id; sounds.click?.(2000, 0.15); renderMenu(); };
  $('sh-featured').replaceChildren(...FEATURED.map((id) => itemCard(id, { on: tryOn === id, onClick: pick(id) })));
  const filters = [['all', 'ALL'], ...CSLOTS.filter((s0) => sell.some((id) => ITEMS[id].slot === s0.id)).map((s0) => [s0.id, s0.name])];
  $('sh-filter').replaceChildren(...filters.map(([id, name]) => {
    const b = el('button', id === shopFilter ? 'on' : '', name);
    b.type = 'button';
    b.onclick = () => { shopFilter = id; renderMenu(); };
    return b;
  }));
  const order = { legendary: 0, epic: 1, rare: 2, common: 3 };
  const list = sell.filter((id) => !FEATURED.includes(id) && (shopFilter === 'all' || ITEMS[id].slot === shopFilter))
    .sort((a, b) => order[ITEMS[a].rarity] - order[ITEMS[b].rarity] || ITEMS[b].price - ITEMS[a].price);
  $('sh-grid').replaceChildren(...list.map((id) => itemCard(id, { on: tryOn === id, onClick: pick(id) })));
  // buy panel for the selected item
  const box = $('sh-buy');
  if (!tryOn) { box.classList.remove('on'); return; }
  const it = ITEMS[tryOn], r = RARITY[it.rarity], own = owns(cosmetics, tryOn);
  box.classList.add('on');
  box.style.setProperty('--r', rgb(r.color));
  const slotName = CSLOTS.find((x) => x.id === it.slot).name;
  const worn = own && cosmetics.equip[custCls || classLo.cls][it.slot] === tryOn;
  const lockedLv = !own && skinLocked(progress, tryOn) ? SKIN_LV[tryOn] : 0;
  const btn = el('button', own ? 'own' : lockedLv || cosmetics.credits < it.price ? 'no' : '', worn ? 'EQUIPPED ✓' : own ? 'EQUIP' : lockedLv ? `🔒 LEVEL ${lockedLv}` : `BUY ◆ ${fmt(it.price)}`);
  btn.type = 'button';
  btn.onclick = () => {
    const cls = custCls || classLo.cls;
    if (lockedLv) { sounds.denied?.(); return; }
    if (!own && !buy(cosmetics, tryOn)) { sounds.dry?.(); return; }
    if (!own) sounds.pickup?.();
    cosmetics.equip[cls][it.slot] = tryOn;
    if (cls === classLo.cls) setHandLook(buildOutfit(cosmetics, cls));
    saveCosmetics(cosmetics);
    if (it.slot === 'wskin') refreshGuns();
    renderMenu();
  };
  const note = lockedLv ? `Reach level ${lockedLv} to buy this.` : worn ? `Wearing it on ${CLASSES[custCls || classLo.cls].name}.` : own ? `Owned. Equip it on ${CLASSES[custCls || classLo.cls].name}.` : cosmetics.credits < it.price ? 'Not enough credits.' : `Buys and equips on ${CLASSES[custCls || classLo.cls].name}.`;
  box.replaceChildren(el('small', null, `${r.name} · ${slotName}${it.live ? ' · REACTIVE' : ''}`), el('b', null, it.name), ...(it.fx ? [el('p', 'fx', it.fx)] : []), btn, el('p', null, note));
}
// rebuild guns after a weapon-skin change (in your hands, the cases and the showroom)
function refreshGuns() {
  setHandLook(buildOutfit(cosmetics, classLo.cls));
  slots.forEach((w) => { const a = w.ammo; w.setDef(defFor(w.def.id)); w.ammo = Math.min(a, w.def.mag); });
  cases.forEach((c) => c.refresh?.(defFor));
  showroomKey = '';
}
// PLAY: matchmaking → loadout (30 s) → team intro → the arena. Once you're in a match, PLAY resumes it.
let match = null;
const mmk = new Matchmaking({
  root: $('mmk'), classLo, sounds, maps: ARENAS.filter((a) => !a.hidden).map((a) => a.name),
  onChange: () => { classDirty = true; renderMenu(); },
  onCancel: () => { menu.classList.remove('hidden'); renderMenu(); },
  onDone: (m) => {
    match = m;
    stadium = ARENAS[m.map] || ARENAS[0];
    setTeamsHud(m);
    where = 'none';            // arrive fresh
    classDirty = true;
    enterStadium();
    startMatch(m);
  },
});
// ONLINE: host or join a room for 1v1 / 2v2 with friends
const lobby = new Lobby(world, {
  root: $('net'), arenas: ARENAS.filter((a) => !a.hidden).map((a) => a.name), getClass: () => classLo.cls, getMe: () => ({ lv: levelOf(progress), look: myLook(), rk: ranked.rp, cr: crew ? { t: crew.tag, c: crew.col } : null }),
  onClose: () => { menu.classList.remove('hidden'); renderMenu(); },
  onStart: (info) => startOnline(info),
  onHostLeft: () => { banner('HOST LEFT', 'MATCH OVER', 'bad', 2); setTimeout(() => endMatch(true), 1600); },
});
const online = lobby.online;
setInterval(() => { try { online.refreshMe(); } catch { /* not in a room */ } }, 1500);
const netHooks = {
  player,
  onShatter: (b) => botHooks.onShatter(b),
  remoteSkin: (p, tex, tier) => skinBurst(p, tex, tier, false),
  buff: () => (buffT > 0 ? buffKind : ''),
  charge: () => { const w = weapon(); return w?.def.charge && !launcherW ? +(w.chargeT || 0).toFixed(2) : 0; },
  remoteShot: (f, e, r, k) => {
    if (k) {
      // another player's railgun: the hanging beam, sparks where it landed, and the crack (quieter further off)
      effects.beam(f, e, k === 2 ? [0.75, 0.4, 1] : RAIL_COL, 1.1, 0.1);
      effects.sparks(e, 30, k === 2 ? [0.8, 0.5, 1] : [0.55, 0.95, 1], 9, 0.7, 0.04, 2);
      sounds.railShot?.(); if (r) botHooks.whiz(f, e);
      kcShot(f, e, k);
      return;
    }
    kcShot(f, e, 0);
    effects.tracer(f, e); sounds.botShot(Math.hypot(player.pos[0] - f[0], player.pos[2] - f[2]), panOf(f)); if (r) botHooks.whiz(f, e); },
  remoteHit: (dmg, from, name, byId) => { player.lastHitBy = byId; damagePlayer(dmg, from, name); },
  feed: (a, b, wid) => killFeed(a, WEAPONS[wid]?.name || 'GUN', b, false),
  banner: (...a) => banner(...a),
  weaponId: () => weapon().def.id,
  cloaked: () => cloakT > 0,
  grapplePoint: () => (player.grapple && player.grapple.phase !== 'miss' ? player.grapple.point.map((v) => +v.toFixed(2)) : null),
  remoteGadget: (spec) => gadgets.place(spec),
  // other players' guns, built from what they sent: weapon, attachments and skin
  gunDefFor: (look) => {
    if (!WEAPONS[look.w]) return null;
    try { return skinDef(buildDef(WEAPONS[look.w], look.a || {}), ITEMS[look.sk]?.slot === 'wskin' ? ITEMS[look.sk].gun : null); } catch { return null; }
  },
  gunPartsOf: (def, m) => Weapon.worldParts(def, m),
  humanFor: (who) => humanFor(who),
  takenDown: (name, kind) => takenDown(name, kind),
  // another player (or the host's bot) started a takedown: play the animation on their body
  remoteTakedownStart: (att, victim, kind) => {
    const b = att?.bot, def = TAKEDOWNS[kind];
    if (!b || !def) return;
    const body = victim === 'me' ? [player.pos[0], player.pos[1] + 0.3, player.pos[2]] : victim?.bot ? bodyPt(victim.bot) : null;
    b.tdAnim = { kind, t: 0, def, body, victim, hit: true };
    if (victim && victim !== 'me') victim.tdUntil = performance.now() + def.dur * 1000;
    if (victim === 'me') watchMyTakedown(b, kind);
  },
  takedownFx: (bot, kind, mine) => { if (!mine) takedownFx(bot, kind, false); },
  feedTakedown: (a, kind, b) => killFeed(a, TAKEDOWNS[kind]?.name || 'TAKEDOWN', b, false),
  remoteHeavy: (m) => heavy.remote(m),
  remoteChunks: (h) => { for (const [w, r, k, d] of h) { const wall = walls[w]; if (wall?.hp) wall.hitCell(r, k, d); } },
  remoteGadgetHit: (gid, dmg) => gadgets.damage(gadgets.byId(gid), dmg),
  get stadium() { return stadium; },
  // hooks for the bots I run when I'm hosting: the usual bot hooks, but their shots are seen by everyone, kills are
  // reported by the online match, and they leave their gear at home
  bot: {
    ...botHooks,
    shot: (b, from, end, pd) => { botHooks.shot(b, from, end, pd); online.send({ t: 'shot', id: b.agent.id, f: from.map((v) => +v.toFixed(2)), e: end.map((v) => +v.toFixed(2)) }); },
    hitPlayer: (dmg, bot, from) => { player.lastHitBy = bot.agent.id; damagePlayer(dmg, from, bot.name); },
    onBotKill: () => {},
    botTakedown: (agent, victim) => {
      const kind = botTakedownStart(agent, victim);
      online.send({ t: 'tdb', id: agent.id, v: victim.isPlayer ? online.myId : victim.id, k: kind });
    },
    botTakedownLand: (agent, victim, kind) => { if (victim.downed) online.myTakedown(victim.isPlayer ? online.myId : victim.id, kind, agent.id); },
    // host bots use their gear online too: whatever they place or fire is copied to everyone
    botGear: (agent, tgt, dist, hurting) => netCopy(agent, () => botHooks.botGear(agent, tgt, dist, hurting)),
    barricade: (agent, tgt) => netCopy(agent, () => botHooks.barricade(agent, tgt)),
  },
};
// run some bot gear code with placing and launching copied to everyone online
function netCopy(agent, fn) {
      const place = gadgets.place, launch = heavy.launch;
      gadgets.place = function (spec) {
        const g = place.call(gadgets, spec);
        const { side, ...copy } = spec;
        online.send({ t: 'gad', id: agent.id, g: copy });
        return g;
      };
      heavy.launch = function (kind, pos, vel, mine, name) {
        const r = launch.call(heavy, kind, pos, vel, mine, name);
        online.send({ t: 'gl', id: agent.id, k: kind, p: pos.map((v) => +v.toFixed(2)), v: vel.map((v) => +v.toFixed(2)) });
        return r;
      };
      try { return fn(); } finally { gadgets.place = place; heavy.launch = launch; }
}
function startOnline(info) {
  if (tdm.mode) { tdm.stop(); $('teams').classList.remove('hidden'); }
  matchEarned = 0;
  matchXp = 0; matchUnlocks = []; matchChallenges = []; resultPose = '';
  if (ai.active) ai.stop();
  tdm = online;
  online.g = netHooks;
  stadium = ARENAS[info.arena] || ARENAS[0];
  match = { online: true, teams: info.teams.map((t) => ({ name: t.name, col: t.col, mine: t.mine })) };
  setTeamsHud(match);
  where = 'none';
  classDirty = true;
  menu.classList.add('hidden');
  enterStadium();
  batches.world = null;
  gadgets.clear(); burning.clear(); heavy.clear(); heavyCd = 0; putAwayLauncher(false); playerTether = null; cloakT = 0; buffT = 0; playerBurn = null; throwCharges = 2; throwT = 0; flashT = 0;
  resetGlass();
  walls.forEach((w) => w.reset());
  for (const a of ARENAS) a.navObj?.reset();
  navDirty.clear();
  chunkOut = [];
  const sp = stadium.spawns[info.team];
  player.spawn(sp.pos, sp.yaw);
  Object.assign(player, { hp: player.maxHp, dead: false, invuln: 1.5, lastHitBy: null });
  $('matchend').classList.add('hidden');
  if (!playing) banner('CLICK TO PLAY', `${stadium.name} · THE MATCH IS ON`, 'good', 3);
}
// in a match but not holding the mouse (the match started from the lobby, or a rematch): a click jumps back in
addEventListener('mousedown', () => {
  if (playing || bench.open || lobby.open || !tdm.active || !inStadium()) return;
  if (!menu.classList.contains('hidden') || !$('matchend').classList.contains('hidden')) return;
  start();
});
$('mm-online').addEventListener('click', () => { sounds.unlock(); menu.classList.add('hidden'); lobby.show(); });
// ZOMBIES: straight in, no matchmaking, on its own map (THE BUNKER)
function startMode() {
  sounds.unlock();
  const m = { mode: 'zombies', map: ARENAS.indexOf(ZMAP), teams: [] };
  match = m;
  stadium = ZMAP;
  where = 'none';
  classDirty = true;
  enterStadium();
  startMatch(m);
  menu.classList.add('hidden');
  start();
}
$('mm-zombies').addEventListener('click', () => startMode('zombies'));
addEventListener('keydown', (e) => {
  if (!lobby.open || e.target?.tagName === 'INPUT') return;
  if (e.code === 'Escape') { lobby.hide(); menu.classList.remove('hidden'); renderMenu(); }
  e.stopImmediatePropagation();
}, true);
function setTeamsHud(m) {
  $('teams').replaceChildren(...m.teams.map((t) => {
    const d = document.createElement('div');
    d.className = `tm${t.mine ? ' mine' : ''}`;
    d.style.setProperty('--t', t.col);
    const b = document.createElement('b'); b.textContent = t.name;
    const c = document.createElement('span'); c.textContent = '0';
    d.append(b, c);
    return d;
  }));
}
// ---------- tdm match: start / end, events, HUD ----------
let lastMatch = null;
function startMatch(m) {
  matchEarned = 0;
  matchXp = 0; matchUnlocks = []; matchChallenges = []; resultPose = '';
  lastMatch = m;
  if (tdm === online || online.inRoom) { online.leave(); tdm = ai; }
  if (tdm !== ai) tdm.stop();
  tdm = m.mode === 'zombies' ? zombies : ai;
  if (m.mode) { stadium = ZMAP; applyClass(); zStartKit(); }   // zombies: a pistol and your melee weapon
  else if (slots.some((w) => w.reserve != null || w.baseDef)) applyClass();     // back from zombies: your own kit again
  batches.world = null;     // re-batch once the match props are set up
  gadgets.clear(); burning.clear(); heavy.clear(); heavyCd = 0; putAwayLauncher(false); playerTether = null; cloakT = 0; buffT = 0; playerBurn = null; throwCharges = 2; throwT = 0; flashT = 0;
  resetGlass();
  walls.forEach((w) => w.reset());
  for (const a of ARENAS) a.navObj?.reset();
  navDirty.clear();
  tdm.start(m, stadium, player, classLo.cls);
  if (!tdm.mode) setTeamsHud(m);
  $('teams').classList.toggle('hidden', !!tdm.mode);
  const sp = tdm.myTeam.spawn || stadium.spawns[tdm.myTeam.idx];
  player.spawn(sp.pos, sp.yaw);
  Object.assign(player, { hp: player.maxHp, dead: false, invuln: 1 });
  $('matchend').classList.add('hidden');
  zBoardT = 0;
}
function endMatch(toMenu) {
  if (tdm === online) { online.leave(); tdm = ai; } else { tdm.stop(); tdm = ai; }
  if (slots.some((w) => w.reserve != null || w.baseDef)) applyClass();     // leaving zombies: your own kit again
  $('teams').classList.remove('hidden');
  gadgets.clear(); burning.clear(); heavy.clear(); heavyCd = 0; putAwayLauncher(false); playerTether = null; cloakT = 0; buffT = 0; playerBurn = null; throwCharges = 2; throwT = 0; flashT = 0;
  match = null; resultPose = '';
  $('matchend').classList.add('hidden');
  if (toMenu && playing) setPlaying(false);
  renderMenu();
}
function matchEvents() {
  for (const ev of tdm.events) {
    if (ev.type === 'start') {
      if (tdm.mode === 'zombies') banner('ZOMBIES', `${stadium.name} · HOLD THE WINDOWS · SURVIVE`, '', 2.6);
      else banner('TEAM DEATHMATCH', `${stadium.name} · FIRST TO 10 KILLS`, '', 2.6);
      sounds.startRun?.();
    }
    else if (ev.type === 'round') { banner(`ROUND ${ev.n}`, ev.n === 1 ? 'HERE THEY COME' : 'THEY KEEP COMING', 'bad', 2.2); sounds.roundStart?.(); }
    else if (ev.type === 'cleared') { if (ev.n) { banner(`ROUND ${ev.n} CLEARED`, 'FIX THE WINDOWS · SPEND YOUR POINTS', 'good', 2); sounds.finish?.(); } }
    else if (ev.type === 'door') { batches.world = null; sounds.boom?.(0.25); effects.dust(ev.d.pos, 14); }
    else if (ev.type === 'drop') { banner(DROPS[ev.kind].name, { maxammo: 'EVERY GUN FILLED UP', insta: 'ONE HIT KILLS · 30 SECONDS', double: 'DOUBLE POINTS · 30 SECONDS', nuke: 'BOOM · +400', carpenter: 'EVERY WINDOW REBUILT · +200' }[ev.kind], 'good', 1.8); sounds.checkpoint?.(); if (ev.kind === 'nuke') { flashT = 0.6; sounds.boom?.(1); player.shake = 0.6; } }
    else if (ev.type === 'dropSpawn') sounds.pickup?.();
    else if (ev.type === 'boxReady' || ev.type === 'ampReady') sounds.coins?.();
    else if (ev.type === 'kill') {
      const mine = ev.team === tdm.myTeam, left = 10 - ev.team.kills;
      if (ev.killer === tdm.you) { sounds.checkpoint?.(); banner('ELIMINATED', ev.victim.name, 'good', 1); }
      if (left > 0 && left <= 3 && !tdm.over && !ev.remoteScore) banner(`${left} TO GO`, `${ev.team.name} ${mine ? '— YOUR TEAM' : ''}`.trim(), mine ? 'good' : 'bad', 1.4);
    } else if (ev.type === 'end' && tdm.mode) {
      const o = tdm.over;
      banner('GAME OVER', `YOU LASTED ${o.rounds} ROUND${o.rounds === 1 ? '' : 'S'}`, 'bad', 2.6);
      sounds.finish?.(); setTimeout(showMatchEnd, 2600);
    } else if (ev.type === 'end') { banner(`${ev.winner.name} WIN`, ev.winner === tdm.myTeam ? 'YOU ADVANCE' : 'ELIMINATED', ev.winner === tdm.myTeam ? 'good' : 'bad', 2.6); sounds.finish?.(); setTimeout(showMatchEnd, 2600); }
  }
  tdm.events.length = 0;
}
function showMatchEnd() {
  if (!tdm.over) return;
  if (tdm.mode) { showModeEnd(); return; }
  const st = tdm.over.standings, place = st.indexOf(tdm.myTeam);
  const el = $('matchend');
  const card = document.createElement('div');
  card.className = 'me-card';
  const h = document.createElement('small'); h.textContent = `THE SEMI-FINALS · ${stadium.name}`;
  const t = document.createElement('b'); t.textContent = place < 1 ? 'YOU ADVANCE TO THE FINAL' : 'ELIMINATED';
  t.className = place < 1 ? 'win' : 'lose';
  card.append(h, t);
  if (!tdm.over.paid) { tdm.over.paid = true; earn(place < 1 ? 300 : 100); gainXp(place < 1 ? XP.win : XP.loss, place < 1 ? 'WIN' : 'MATCH'); dailyHit({ type: 'match' }); if (place < 1) dailyHit({ type: 'win' }); }
  const cr = document.createElement('p'); cr.className = 'me-cred'; cr.textContent = `+${fmt(matchEarned)} ${CURRENCY} EARNED · ${fmt(cosmetics.credits)} TOTAL`;
  card.append(cr);
  // XP and level
  const li = levelInfo(progress.xp), rk = rankOf(li.level);
  const xp = document.createElement('div'); xp.className = 'me-xp';
  xp.innerHTML = `<div class="me-xp-top">${badgeHTML(li.level)} <b>LEVEL ${li.level} · ${rk.name}</b><span>+${fmt(matchXp)} XP</span></div><i style="--p:${li.max ? 1 : (li.into / li.need).toFixed(3)}"></i><small>${li.max ? 'MAX LEVEL' : `${fmt(li.into)} / ${fmt(li.need)} XP TO LEVEL ${li.level + 1}`}</small>${matchUnlocks.length ? `<p class="me-unl">UNLOCKED: ${matchUnlocks.join(' · ')}</p>` : ''}`;
  card.append(xp);
  resultPose = place < 1 ? 'win' : 'lose'; setShowroomClass();
  if (tdm === online && !tdm.over.rkPaid) {
    tdm.over.rkPaid = true;
    const humans = online.agents.filter((a) => a.isRemote).length;
    if (humans > 0) tdm.over.rk = rankedResult(ranked, place < 1, tdm.you.kills || 0);
  }
  if (tdm === online && tdm.over.rk) {
    const r = tdm.over.rk, up = r.after.i > r.before.i || (r.after.i === r.before.i && r.after.tier !== r.before.tier && r.delta > 0);
    const rp = document.createElement('div'); rp.className = 'me-rk';
    rp.innerHTML = `${divHTML(ranked.rp)} <b>RANKED · ${r.after.full}</b><span class="${r.delta >= 0 ? 'up' : 'down'}">${r.delta >= 0 ? '+' : ''}${r.delta} RP</span>${up ? '<em>PROMOTED!</em>' : ''}`;
    card.append(rp);
  }
  if (matchChallenges.length) { const dc = document.createElement('p'); dc.className = 'me-dc'; dc.textContent = `✓ CHALLENGE${matchChallenges.length > 1 ? 'S' : ''} COMPLETE: ${matchChallenges.join(' · ')}`; card.append(dc); }
  st.forEach((tm, i) => {
    const r = document.createElement('div');
    r.className = `me-row${tm === tdm.myTeam ? ' mine' : ''}${i < 1 ? ' adv' : ''}`;
    r.style.setProperty('--t', tm.col);
    r.innerHTML = `<i>${i + 1}</i><b></b><span>${tm.kills} KILLS</span>`;
    r.querySelector('b').textContent = tm.name;
    card.append(r);
  });
  const btn = (text, fn, cls = '') => { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.className = cls; b.onclick = fn; card.append(b); return b; };
  const again = () => { $('matchend').classList.add('hidden'); start(); };
  if (tdm === online) {
    if (online.isHost) btn('REMATCH', () => { online.rematch(); again(); });
    else { const w = document.createElement('p'); w.className = 'me-wait'; w.textContent = 'WAITING FOR THE HOST TO START A REMATCH…'; card.append(w); }
  } else if (lastMatch) btn('PLAY AGAIN', () => { startMatch(lastMatch); again(); });
  btn(tdm === online ? 'LEAVE' : 'BACK TO LOBBY', () => endMatch(true), 'alt');
  el.replaceChildren(card);
  el.classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
}
// the end of a zombies game
function showModeEnd() {
  const o = tdm.over;
  const card = el('div', 'me-card');
  const win = o.rounds >= 10;
  card.append(el('small', null, `ZOMBIES · ${stadium.name}`), el('b', win ? 'win' : 'lose', `YOU LASTED ${o.rounds} ROUND${o.rounds === 1 ? '' : 'S'}`));
  if (!o.paid) {
    o.paid = true;
    earn(40 * o.rounds + 4 * o.kills); gainXp(120 * o.rounds + 15 * o.kills, 'ZOMBIES');
    dailyHit({ type: 'match' });
    try { const best = +(localStorage.getItem('sf-zbest') || 0); o.best = Math.max(best, o.rounds); o.newBest = o.rounds > best; localStorage.setItem('sf-zbest', String(o.best)); } catch { o.best = o.rounds; }
  }
  card.append(el('p', 'me-cred', `+${fmt(matchEarned)} ${CURRENCY} EARNED · ${fmt(cosmetics.credits)} TOTAL`));
  const li = levelInfo(progress.xp), rk = rankOf(li.level);
  const xp = el('div', 'me-xp');
  xp.innerHTML = `<div class="me-xp-top">${badgeHTML(li.level)} <b>LEVEL ${li.level} · ${rk.name}</b><span>+${fmt(matchXp)} XP</span></div><i style="--p:${li.max ? 1 : (li.into / li.need).toFixed(3)}"></i>`;
  card.append(xp);
  const row = (i, name, val, mine) => { const r = el('div', `me-row${mine ? ' mine' : ''}`); r.style.setProperty('--t', mine ? '#ff7a1a' : '#888'); r.innerHTML = `<i>${i}</i><b></b><span></span>`; r.querySelector('b').textContent = name; r.querySelector('span').textContent = val; card.append(r); };
  row('★', o.newBest ? 'ROUNDS SURVIVED · NEW BEST!' : 'ROUNDS SURVIVED', String(o.rounds), true);
  row('◎', 'BEST EVER', String(o.best ?? o.rounds), false);
  row('☠', 'ZOMBIES KILLED', String(o.kills), false);
  row('✚', 'HEADSHOTS', String(tdm.heads), false);
  row('◆', 'POINTS LEFT', fmt(tdm.points), false);
  const btn = (text, fn, cls = '') => { const b = el('button', cls, text); b.type = 'button'; b.onclick = fn; card.append(b); };
  btn('PLAY AGAIN', () => { $('matchend').classList.add('hidden'); startMatch(lastMatch); start(); });
  btn('BACK TO LOBBY', () => endMatch(true), 'alt');
  $('matchend').replaceChildren(card);
  $('matchend').classList.remove('hidden');
  resultPose = win ? 'win' : 'lose'; setShowroomClass();
  if (document.pointerLockElement) document.exitPointerLock();
}
// ---- crews: name, tag, colour (shown in front of your name online)
function openCrew() {
  if ($('crew-box')) return;
  const box = el('div'); box.id = 'crew-box';
  let col = crew?.col || CREW_COLS[0];
  box.innerHTML = `<div class="cw-card"><h3>YOUR CREW</h3><p>Your tag shows in front of your name online. Make the same crew as your friends to rep it together.</p>
    <label>CREW NAME<input id="cw-name" maxlength="18" placeholder="e.g. SEMI SQUAD"></label>
    <label>TAG (2–4 LETTERS)<input id="cw-tag" maxlength="4" placeholder="SF"></label>
    <div class="cw-cols"></div><div class="cw-prev"></div>
    <div class="cw-btns"><button type="button" id="cw-save">SAVE</button>${crew ? '<button type="button" id="cw-leave" class="alt">LEAVE CREW</button>' : ''}<button type="button" id="cw-x" class="alt">CLOSE</button></div></div>`;
  document.body.append(box);
  const nm = box.querySelector('#cw-name'), tg = box.querySelector('#cw-tag'), prev = box.querySelector('.cw-prev');
  nm.value = crew?.name || ''; tg.value = crew?.tag || '';
  const show = () => { const t = cleanTag(tg.value); prev.innerHTML = t.length >= 2 ? `ONLINE YOU'LL SHOW AS ${crewHTML({ t, c: col })} <b>YOUR NAME</b>` : 'TYPE A TAG OF 2–4 LETTERS'; };
  box.querySelector('.cw-cols').replaceChildren(...CREW_COLS.map((c) => { const b = el('button'); b.type = 'button'; b.style.background = c; b.className = c === col ? 'on' : ''; b.onclick = () => { col = c; box.querySelectorAll('.cw-cols button').forEach((x) => x.classList.toggle('on', x === b)); show(); }; return b; }));
  [nm, tg].forEach((i) => i.addEventListener('keydown', (e) => e.stopPropagation()));
  tg.addEventListener('input', () => { tg.value = cleanTag(tg.value); show(); });
  show();
  const close = () => { box.remove(); renderMenu(); };
  box.querySelector('#cw-save').onclick = () => { const t = cleanTag(tg.value); if (t.length < 2) { tg.focus(); return; } crew = { name: nm.value.trim().toUpperCase().slice(0, 18) || t, tag: t, col }; saveCrew(crew); sounds.pickup?.(); close(); };
  box.querySelector('#cw-leave')?.addEventListener('click', () => { crew = null; saveCrew(null); close(); });
  box.querySelector('#cw-x').onclick = close;
  box.onclick = (e) => { if (e.target === box) close(); };
  nm.focus();
}
// ---- zombies: your guns (limited spare ammo), the drinks, and the things you can use round the bunker
let zBoardT = 0;
const reserveFor = (def) => (def.melee ? null : Math.max(24, Math.round(def.mag * (def.mag <= 2 ? 14 : 5))));
const ampDef = (base) => {
  const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  return { ...base, name: `${base.name} MK II`, dmg: base.dmg * 2.2, mag: Math.round(base.mag * 1.5), amped: true, liveSkin: 45,
    parts: base.parts.map((p) => (p.em || p.m === 'glass' ? p : { ...p, tex: 45, col: [0, lum(p.col), 0] })) };
};
// a gun as the drinks make it: faster reloads (SPEED SPLASH), faster fire (DOUBLE BREW)
function zArm(w, fill = true) {
  if (!w || w.def.melee) return;
  const base = w.baseDef || w.def;
  w.baseDef = base;
  const P = zombies.perks, r = P.has('speed') ? 0.5 : 1, f = P.has('brew') ? 1.33 : 1;
  w.def = { ...base, reload: base.reload * r, reloadEmpty: (base.reloadEmpty ?? base.reload) * r, shellTime: base.shellTime ? base.shellTime * r : base.shellTime, rpm: base.rpm * f };
  if (fill) { w.ammo = base.mag; w.reserve = reserveFor(base); }
}
function zApplyPerks() {
  for (const w of slots) zArm(w, false);
  const hp0 = player.maxHp, max = 150 * (zombies.perks.has('tank') ? 2.5 : 1);
  player.maxHp = max;
  player.hp = Math.min(max, player.hp + Math.max(0, max - hp0));
}
function zStartKit() {
  slots[0] = new Weapon(defFor('pistol'));
  slots[1] = slots[0];       // one gun to start with: both gun slots point at it until you buy a second
  current = 0; lastSlot = 2;
  player.maxHp = player.hp = 150;
  zArm(slots[0]);
  weapon().equip(); updateSlotHud();
}
function zFillAmmo() { for (const w of new Set(slots)) if (!w.def.melee) { w.ammo = w.def.mag; w.reserve = reserveFor(w.baseDef || w.def); } sounds.magIn?.(); }
// a gun bought, from the box or the amplifier: into your hands (the primary slot unless you've got two guns already)
function zGive(def) {
  if (launcherW) putAwayLauncher(false);
  const w = new Weapon(def);
  // two guns at most: if both gun slots hold the same gun (the start), fill the empty one; otherwise swap out the one in your hands
  let slot = slots[0] === slots[1] ? (current === 2 ? 1 : 1) : current === 2 ? 0 : current;
  slots[slot] = w;
  zArm(w);
  if (current !== slot) { lastSlot = current; current = slot; }
  w.equip();
  sounds.pickup();
  updateSlotHud();
}
function modeUse() {
  if (tdm !== zombies || !tdm.active || !inStadium() || player.dead) return null;
  const Z = zombies, u = Z.useAt(player, [-Math.sin(player.yaw), 0, -Math.cos(player.yaw)]);
  if (!u) return null;
  const pay = (c) => { if (Z.points < c) { sounds.denied?.(); banner('NOT ENOUGH POINTS', `${fmt(c)} NEEDED`, 'bad', 1.2); return false; } Z.points -= c; sounds.coins?.(); return true; };
  const held = (id) => slots.find((w) => !w.def.melee && (w.baseDef || w.def).id === id && !(w.baseDef || w.def).amped);
  if (u.kind === 'info') return { ...u, use: () => sounds.denied?.() };
  if (u.kind === 'door') return { ...u, use: () => { if (pay(u.cost)) Z.openDoor(u.d); } };
  if (u.kind === 'power') return { ...u, use: () => { Z.power = true; banner('POWER ON', 'THE DRINKS AND THE AMPLIFIER ARE WORKING', 'good', 2.2); sounds.boom?.(0.5); sounds.roundStart?.(); } };
  if (u.kind === 'wall') {
    const def = defFor(u.wb.id), h = held(u.wb.id), cost = h ? Math.round(u.cost / 2) : u.cost;
    return { ...u, cost, ok: Z.points >= cost, text: h ? `AMMO FOR <b>${def.name}</b>` : `BUY <b>${def.name}</b>`,
      use: () => { if (h && h.ammo >= h.def.mag && h.reserve >= reserveFor(h.baseDef || h.def)) { sounds.denied?.(); return; } if (!pay(cost)) return; if (h) { h.ammo = h.def.mag; h.reserve = reserveFor(h.baseDef || h.def); sounds.magIn?.(); } else zGive(def); } };
  }
  if (u.kind === 'box') return { ...u, use: () => {
    if (!pay(u.cost)) return;
    const have = new Set(slots.map((w) => (w.baseDef || w.def).id)), pool = BOX_POOL.filter((id) => !have.has(id) && defFor(id));
    const B = Z.box;
    B.gun = pool[Math.floor(Math.random() * pool.length)] || 'smg'; B.gunName = defFor(B.gun).name;
    Object.assign(B, { state: 'spin', t: 0, flip: 0 });
    sounds.rackSpin?.();
  } };
  if (u.kind === 'boxtake') return { ...u, text: `TAKE <b>${Z.box.gunName}</b>`, use: () => { const B = Z.box; zGive(defFor(B.gun)); Object.assign(B, { state: 'closed', gun: null, shown: null }); } };
  if (u.kind === 'perk') return { ...u, use: () => {
    if (!pay(u.cost)) return;
    Z.perks.add(u.m.id); zApplyPerks();
    banner(u.m.name, u.m.desc.toUpperCase(), 'good', 1.8); sounds.pickup?.();
  } };
  if (u.kind === 'amp') {
    const w = weapon(), base = w.baseDef || w.def;
    if (w.def.melee || base.amped) return { ...u, text: base.amped ? '<b>AMPLIFIER</b> · THAT GUN IS ALREADY AMPLIFIED' : '<b>AMPLIFIER</b> · HOLD A GUN', cost: 0, use: () => sounds.denied?.() };
    return { ...u, text: `AMPLIFY <b>${base.name}</b> · DOUBLE DAMAGE, BIGGER MAG`, use: () => {
      if (!pay(u.cost)) return;
      const A = Z.amp;
      A.gun = ampDef(base); A.gunName = A.gun.name; A.slot = current;
      Object.assign(A, { state: 'work', t: 0 });
      // the machine takes your gun while it works
      const other = [0, 1].find((i) => i !== current && !slots[i].def.melee && slots[i] !== w);
      if (slots[0] === slots[1]) { slots[0] = slots[1] = new Weapon(defFor('knife')); }
      else slots[current] = slots[other ?? 2];
      switchTo(other ?? 2); updateSlotHud();
      sounds.rackSpin?.();
    } };
  }
  if (u.kind === 'amptake') return { ...u, text: `TAKE <b>${Z.amp.gunName}</b>`, use: () => {
    const A = Z.amp, w = new Weapon(A.gun);
    w.baseDef = A.gun;
    const slot = slots[0].def.melee ? 0 : slots[1].def.melee || slots[1] === slots[0] ? 1 : current === 2 ? 0 : current;
    if (slots[0] === slots[1]) { if (slots[0].def.melee) slots[0] = slots[1] = w; else slots[A.slot ?? 0] = w; } else slots[slot] = w;
    zArm(w);
    const at = slots.indexOf(w);
    if (current !== at) { lastSlot = current; current = at; }
    w.equip(); updateSlotHud(); sounds.pickup(); sounds.checkpoint?.();
    Object.assign(A, { state: 'idle', gun: null });
  } };
  if (u.kind === 'board') return { ...u, use: (dt) => {
    zBoardT += dt;
    if (zBoardT < 0.55) return;
    zBoardT = 0;
    const w = u.w;
    if (w.boards >= 5) return;
    w.boards++;
    if (Z.boardPts < 500) { Z.boardPts += 10; Z.add(10); }
    sounds.meleeWall?.(); effects.dust(w.inside, 3);
  } };
  return null;
}
const markerEls = [], tagEls = [];
let tagT = 0;
function poolEl(pool, parent, cls, i) {
  if (!pool[i]) { const d = document.createElement('div'); d.className = cls; d.innerHTML = '<i></i><b></b><small></small>'; parent.append(d); pool[i] = d; }
  return pool[i];
}
// ---------- scoreboard: hold Tab in a match ----------
let boardT = 0;
function updateBoard(dt) {
  const show = tdm.active && inStadium() && playing && input.down('Tab');
  $('board').classList.toggle('hidden', !show);
  if (!show || (boardT -= dt) > 0) return;
  boardT = 0.25;
  const kd = (e) => (tdm === online ? online.kd?.[e.isPlayer ? online.myId : e.id] || { k: 0, d: 0 } : { k: e.kills || 0, d: e.deaths || 0 });
  const rows = tdm.entities().map((e) => ({ e, ...kd(e) }));
  const cols = tdm.teams.map((t) => {
    const col = document.createElement('div');
    col.className = `bd-team${t === tdm.myTeam ? ' mine' : ''}`;
    col.style.setProperty('--t', t.col);
    col.innerHTML = '<div class="bd-head"><b></b><span></span></div><div class="bd-row bd-labels"><span>PLAYER</span><span>CLASS</span><span>K</span><span>D</span></div>';
    col.querySelector('.bd-head b').textContent = t.name;
    col.querySelector('.bd-head span').textContent = `${t.kills} KILLS`;
    for (const r of rows.filter((x) => x.e.team === t).sort((a, b) => b.k - a.k || a.d - b.d)) {
      const row = document.createElement('div');
      row.className = `bd-row${r.e.isPlayer ? ' me' : ''}${r.e.alive ? '' : ' dead'}`;
      const name = r.e.isPlayer ? `${lobby.name || 'YOU'} (YOU)` : r.e.name;
      const cls = r.e.isPlayer ? classLo.cls : r.e.cls;
      for (const v of [name, CLASSES[cls]?.name || '', r.k, r.d]) { const c = document.createElement('span'); c.textContent = v; row.append(c); }
      const lv = r.e.isPlayer ? levelOf(progress) : r.e.lv;
      if (lv) row.firstChild.insertAdjacentHTML('afterbegin', badgeHTML(lv) + ' ');
      col.append(row);
    }
    return col;
  });
  const head = document.createElement('div');
  head.className = 'bd-title';
  head.textContent = `${stadium.name} · FIRST TO ${tdm === online ? 10 : 10}`;
  $('board').replaceChildren(head, ...cols);
}
function updateMatchHud(dt) {
  updateBoard(dt);
  const on = tdm.active && inStadium() && (playing || !!tdm.over);
  $('objective').classList.toggle('hidden', !on);
  $('markers').classList.toggle('hidden', !on);
  $('tags').classList.toggle('hidden', !on);
  if (!on) return;
  const o = tdm.objective();
  const obj = $('objective');
  obj.children[0].textContent = o?.text || '';
  obj.children[0].style.color = o?.col || '#fff';
  obj.children[1].textContent = o?.sub || '';
  obj.children[2].style.setProperty('--p', (o?.steal || 0).toFixed(3));
  obj.children[2].style.opacity = o?.steal ? 1 : 0;
  [...$('teams').children].forEach((d, i) => { const c = String(tdm.teams[i].kills); if (d.lastChild.textContent !== c) d.lastChild.textContent = c; });
  // objective markers, pinned to the screen edge when off screen
  const ms = tdm.markers(), eye = player.eye();
  ms.forEach((m, i) => {
    const el = poolEl(markerEls, $('markers'), 'mkr', i);
    let sp = project(m.pos);
    const W = innerWidth, H = innerHeight, pad = 46;
    let edge = false;
    if (!sp) { const f = player.forward(); const side = (m.pos[0] - eye[0]) * -f[2] + (m.pos[2] - eye[2]) * f[0]; sp = [side > 0 ? W - pad : pad, H * 0.55]; edge = true; }
    if (sp[0] < pad || sp[0] > W - pad || sp[1] < pad + 80 || sp[1] > H - 190) edge = true;
    sp = [clamp(sp[0], pad + 120, W - pad - 120), clamp(sp[1], pad + 80, H - 190)];
    el.style.transform = `translate(${sp[0].toFixed(1)}px, ${sp[1].toFixed(1)}px)`;
    el.style.setProperty('--c', m.col);
    el.className = `mkr ${m.kind}${edge ? ' edge' : ''}`;
    el.children[0].textContent = m.kind === 'station' ? '⬢' : m.kind === 'box' ? '◆' : '▼';
    el.children[1].textContent = m.label;
    el.children[2].textContent = `${Math.round(Math.hypot(m.pos[0] - eye[0], m.pos[1] - eye[1], m.pos[2] - eye[2]))} M`;
    el.style.display = '';
  });
  for (let i = ms.length; i < markerEls.length; i++) markerEls[i].style.display = 'none';
  // name tags: teammates always, enemies when you can see them
  tagT -= dt;
  const agents = tdm.agents;
  if (tagT <= 0) {
    tagT = 0.2;
    for (const a of agents) {
      if (!a.alive || a.team === tdm.myTeam) continue;
      const h = [a.pos[0], a.pos[1] + 1.6, a.pos[2]], d = [h[0] - eye[0], h[1] - eye[1], h[2] - eye[2]], L = Math.hypot(...d);
      a.seen = L < 45 && !world.raycast(eye, d.map((v) => v / L), L - 0.5, true, (b) => b.tag === 'glass' || b.tag === 'bot');
    }
  }
  let n = 0;
  for (const a of agents) {
    const ally = a.team === tdm.myTeam;
    if (!a.alive || a.zombie || (!ally && !a.seen)) continue;
    const sp = project([a.pos[0], a.pos[1] + 2.2 * a.bot.sc, a.pos[2]]);
    if (!sp || sp[0] < 0 || sp[0] > innerWidth || sp[1] < 0 || sp[1] > innerHeight) continue;
    const el = poolEl(tagEls, $('tags'), 'tag', n++);
    el.className = `tag${ally ? ' ally' : ''}`;
    el.style.setProperty('--c', a.team.col);
    el.style.transform = `translate(${sp[0].toFixed(1)}px, ${sp[1].toFixed(1)}px)`;
    el.children[0].textContent = ally ? '▼' : '';
    el.children[1].textContent = a.cr ? `[${a.cr.t}] ${a.name}` : a.name;
    el.children[2].style.width = `${Math.round(clamp(a.hpFrac, 0, 1) * 100)}%`;
    el.style.display = '';
  }
  for (let i = n; i < tagEls.length; i++) tagEls[i].style.display = 'none';
}
$('mm-play').addEventListener('click', () => {
  if (match && inStadium() && !classDirty) { enterStadium(); return; }
  sounds.unlock();
  menu.classList.add('hidden');
  mmk.start();
  renderMenu();
});
addEventListener('keydown', (e) => {
  if (mmk.active && mmk.key(e)) { e.preventDefault(); e.stopImmediatePropagation(); }
}, true);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const rgb = (c) => `rgb(${c.map((v) => Math.round(v * 255)).join(',')})`;
// a menu button for something you haven't unlocked yet: greyed out with the level it opens at
function lockBtn(b, lv) {
  b.classList.add('locked'); b.classList.remove('on');
  b.append(el('span', 'lockpill', `🔒 LEVEL ${lv}`));
  b.onclick = () => { sounds.denied?.(); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); };
  return b;
}
function renderMenu() {
  const c = CLASSES[classLo.cls], sel = classLo[classLo.cls];
  document.documentElement.style.setProperty('--cls', rgb(c.color));
  $('mm-chip').innerHTML = '';
  $('mm-chip').append('CLASS ', el('b', null, c.name));
  $('mm-credits').textContent = `${fmt(cosmetics.credits)} ${CURRENCY}`;
  renderDaily();
  { // rank chip: badge, rank, level and an XP bar
    const li = levelInfo(progress.xp), rk = rankOf(li.level);
    let rc = $('mm-rank');
    if (!rc) { rc = el('div', 'mm-rank'); rc.id = 'mm-rank'; $('mm-chip').before(rc); }
    rc.title = li.max ? 'MAX LEVEL' : `${fmt(li.into)} / ${fmt(li.need)} XP TO LEVEL ${li.level + 1}`;
    rc.innerHTML = `${badgeHTML(li.level)}<div><b>${rk.name}</b><i style="--p:${li.max ? 1 : (li.into / li.need).toFixed(3)}"></i></div>`;
    // ranked division and crew
    let rd = $('mm-ranked');
    if (!rd) { rd = el('button', 'mm-ranked'); rd.id = 'mm-ranked'; rd.type = 'button'; rc.after(rd); rd.onclick = openCrew; }
    const dv = divisionOf(ranked.rp);
    rd.title = `RANKED: ${dv.full} · ${ranked.rp} RP · ${ranked.won}/${ranked.played} ONLINE WINS. Click to set up your crew.`;
    rd.innerHTML = `${divHTML(ranked.rp)}<div><b>${dv.full}</b><small>${ranked.rp} RP${crew ? ` · ${crewHTML({ t: crew.tag, c: crew.col })}` : ' · NO CREW'}</small></div>`;
  }
  if (menuTab === 'custom') renderCustom();
  if (menuTab === 'shop') renderShop();
  if (menuTab === 'pass') renderPass();
  $('mm-name').replaceChildren(el('b', null, c.name), el('span', null, `${WEAPONS[sel.weapon].name} · ${ABILITIES[sel.ability].short} · ${HEAVIES[sel.heavy].short}`));
  $('mm-range-sub').textContent = sessionStarted && !classDirty && !inStadium() ? 'RESUME YOUR SESSION' : 'GUNS · MOVEMENT · PARKOUR · BOTS';
  $('mm-play-sub').textContent = match && inStadium() && !classDirty ? `RESUME · ${stadium.name}` : 'SEMI-FINALS · FIND A MATCH';
  // play page summary
  const sum = $('mm-sum');
  const cell = (k, v) => { const d = el('div'); d.append(el('small', null, k), el('b', null, v)); return d; };
  const edit = el('button', 'edit', 'EDIT LOADOUT IN THE ARMOURY ›');
  edit.type = 'button';
  edit.onclick = () => showTab('armoury');
  sum.replaceChildren(cell('CLASS', c.name), cell('WEAPON', `${WEAPONS[sel.weapon].name} + ${WEAPONS[sel.sidearm].name}`), cell('ABILITY', ABILITIES[sel.ability].short), cell('HEAVY', HEAVIES[sel.heavy].short), edit);
  // armoury: class tabs
  $('mm-classes').replaceChildren(...CLASS_ORDER.map((id) => {
    const k = CLASSES[id];
    const b = el('button', `mm-class${id === classLo.cls ? ' on' : ''}`);
    b.type = 'button';
    b.style.setProperty('--c', rgb(k.color));
    b.append(el('b', null, k.name), el('span', null, `${k.hp} HP`));
    b.onclick = () => { classLo.cls = id; classDirty = true; saveLoadout(classLo); sounds.swap?.(); renderMenu(); };
    return b;
  }));
  const info = $('mm-classinfo');
  info.style.setProperty('--c', rgb(c.color));
  const stat = (name, p, txt) => { const d = el('div', 'mm-stat'); const i = el('i'); i.style.setProperty('--p', p); d.append(el('span', null, name), i, el('em', null, txt)); return d; };
  info.replaceChildren(el('p', null, c.desc), stat('HEALTH', c.hp / 350, String(c.hp)), stat('SPEED', (c.speed - 0.7) / 0.5, `${Math.round(c.speed * 100)}%`),
    stat('SIZE', c.build / 1.3, c.build < 1 ? 'SMALL' : c.build > 1 ? 'LARGE' : 'MEDIUM'));
  // weapons
  $('mm-weapons').replaceChildren(...c.weapons.map((id) => {
    const d = defFor(id), r = ratings(d);
    const pick = (n) => r.find((x) => x.name === n);
    const b = el('button', `mm-wpn${id === sel.weapon ? ' on' : ''}`);
    b.type = 'button';
    b.style.setProperty('--c', rgb(c.color));
    const bars = el('div', 'bars');
    for (const n of ['DAMAGE', 'FIRE RATE', 'RANGE']) {
      const sp = el('span', null, n); const i = el('i'); i.style.setProperty('--p', pick(n).v.toFixed(3)); sp.append(i); bars.append(sp);
    }
    b.append(el('b', null, WEAPONS[id].name), el('small', null, WEAPONS[id].type), bars);
    if (gunLocked(progress, id)) return lockBtn(b, GUN_LV[id]);
    b.onclick = () => { sel.weapon = id; classDirty = true; saveLoadout(classLo); sounds.magIn?.(); renderMenu(); };
    return b;
  }));
  // sidearms
  $('mm-sidearms').replaceChildren(...c.sidearms.map((id) => {
    const b = el('button', `mm-wpn mm-side${id === sel.sidearm ? ' on' : ''}`);
    b.type = 'button';
    b.style.setProperty('--c', rgb(c.color));
    b.append(el('b', null, WEAPONS[id].name), el('small', null, WEAPONS[id].type));
    if (gunLocked(progress, id)) return lockBtn(b, GUN_LV[id]);
    b.onclick = () => { sel.sidearm = id; classDirty = true; saveLoadout(classLo); sounds.magIn?.(); renderMenu(); };
    return b;
  }));
  // melee
  $('mm-melee').replaceChildren(...MELEE.map((id) => {
    const b = el('button', `mm-wpn mm-side${id === (sel.melee || 'knife') ? ' on' : ''}`);
    b.type = 'button';
    b.style.setProperty('--c', rgb(c.color));
    b.title = MELEE_DESC[id];
    b.append(el('b', null, WEAPONS[id].name), el('small', null, MELEE_DESC[id]));
    b.onclick = () => { sel.melee = id; classDirty = true; saveLoadout(classLo); sounds.swing?.(WEAPONS[id].melee.style); renderMenu(); };
    return b;
  }));
  // heavy weapons
  $('mm-heavies').replaceChildren(...c.heavies.map((id) => {
    const a = HEAVIES[id];
    const b = el('button', `mm-abl${id === sel.heavy ? ' on' : ''}`);
    b.type = 'button';
    b.style.setProperty('--c', rgb(c.color));
    b.append(el('b', null, a.name), el('small', null, `COOLDOWN ${a.cd}`), el('p', null, a.desc));
    b.onclick = () => { sel.heavy = id; classDirty = true; saveLoadout(classLo); sounds.click?.(2600, 0.3, 4); renderMenu(); };
    return b;
  }));
  // throwables
  $('mm-throws').replaceChildren(...THROW_ORDER.map((id) => {
    const a = THROWABLES[id];
    const b = el('button', `mm-abl${id === (sel.throwable || 'frag') ? ' on' : ''}`);
    b.type = 'button';
    b.style.setProperty('--c', rgb(c.color));
    b.append(el('b', null, a.name), el('small', null, a.cd), el('p', null, a.desc));
    b.onclick = () => { sel.throwable = id; classDirty = true; saveLoadout(classLo); sounds.click?.(2600, 0.3, 4); renderMenu(); };
    return b;
  }));
  // takedowns
  $('mm-takedowns').replaceChildren(...takedownsFor(classLo.cls).map((id) => {
    const a = TAKEDOWNS[id];
    const b = el('button', `mm-abl${id === myTakedownKind() ? ' on' : ''}`);
    b.type = 'button';
    b.style.setProperty('--c', rgb(c.color));
    b.append(el('b', null, a.name), el('small', null, `E ON A DOWNED ENEMY · ${a.dur.toFixed(1)} S`), el('p', null, a.desc));
    if (tdLocked(progress, id)) return lockBtn(b, TD_LV[id]);
    b.onclick = () => { sel.takedown = id; saveLoadout(classLo); sounds.click?.(2600, 0.3, 4); renderMenu(); };
    return b;
  }));
  // abilities
  $('mm-abilities').replaceChildren(...c.abilities.map((id) => {
    const a = ABILITIES[id];
    const b = el('button', `mm-abl${id === sel.ability ? ' on' : ''}`);
    b.type = 'button';
    b.style.setProperty('--c', rgb(c.color));
    b.append(el('b', null, a.name), el('small', null, `COOLDOWN ${a.cd}`), el('p', null, a.desc));
    b.onclick = () => { sel.ability = id; classDirty = true; saveLoadout(classLo); sounds.click?.(2600, 0.3, 4); renderMenu(); };
    return b;
  }));
  // showroom character
  setShowroomClass();
}

// ---------- showroom (the 3D scene behind the main menu) ----------
let showroomChar = null, showroomKey = '', showroomCls = 'medium', resultPose = '';
const skinClassShown = () => showroomCls;
function setShowroomClass() {
  const dressing = menuTab === 'custom' || menuTab === 'shop';
  const cls = dressing ? (custCls || classLo.cls) : classLo.cls;
  const c = CLASSES[cls], sel = classLo[cls];
  const key = `${cls}|${sel.weapon}|${JSON.stringify(cosmetics.equip[cls])}|${tryOn}|${resultPose}|${dressing && custSlot}`;
  if (key === showroomKey) return;
  showroomKey = key;
  showroomCls = cls;
  const sp = map.showroom.spot;
  const keepT = showroomChar ? showroomChar.t : 0;
  showroomChar = new Contestant({ ...buildOutfit(cosmetics, cls, tryOn), name: c.name }, sp, 0.18);   // nearly square to the camera
  showroomChar.t = keepT;
  // a victory pose on the results screen (or the slump if you lost), and when browsing poses in Customization
  const emote = showroomChar.skin.emote || 'victoryPump';
  showroomChar.pose = resultPose ? (resultPose === 'win' ? emote : 'defeat') : dressing && (custSlot === 'emote' || ITEMS[tryOn]?.slot === 'emote') ? emote : 'lobby';
  showroomChar.realGun = true;
  skinClass = cls;
  showroomChar.gunDef = skinDef(buildDef(WEAPONS[sel.weapon], loadouts[sel.weapon] || {}), gunSkinFor(cosmetics, cls, tryOn));
  skinClass = null;
  const R = map.showroomRefs;
  R.panels.forEach((p, i) => { p.color = [...c.color]; p.emissive = i % 2 ? 0.45 : 0.85; });
  R.bars.forEach((p) => { p.color = [...c.color]; });
  R.ring.forEach((p) => { p.color = [...c.color]; });
}
const projS = mat4(), viewS = mat4();
let camBlend = 1;
function drawShowroom(aspect) {
  const cam = map.showroom.cam;
  // home: character centred; other screens: character on the right of the panel
  const home = menuTab === 'home' && !mmk.active;
  const k = home ? 1 : 0;
  camBlend += (k - camBlend) * Math.min(1, 0.12);
  const look = [cam.look[0] - 0.88 * camBlend, cam.look[1] + 0.05 * camBlend, cam.look[2]];
  const eye = [cam.eye[0] - 0.25 * camBlend + Math.sin(time * 0.2) * 0.12, cam.eye[1] + Math.sin(time * 0.31) * 0.03 + 0.05 * camBlend, cam.eye[2] - 0.5 * camBlend];
  const fwd = norm([look[0] - eye[0], look[1] - eye[1], look[2] - eye[2]]);
  perspective(projS, (aspect < 1 ? 62 : 40) * Math.PI / 180, aspect, 0.05, 1000);
  lookDir(viewS, eye, fwd, [0, 1, 0], 0);
  renderer.begin();
  // seamless photo-studio backdrop in the class colour, one soft key light from the upper left
  const rc = CLASSES[skinClassShown()].color;
  renderer.setStudio(rc, fwd, [0.55, 0.78, -0.5]);
  renderer.setCamera(projS, viewS, 0.075, eye, false);
  renderer.setBlend(false);
  renderer.drawSky(eye);
  const sp = map.showroom.spot;
  compose(studioFloorM, [sp[0], sp[1] - 0.05, sp[2]], [0, 0, 0], [80, 0.1, 80]);
  renderer.draw(studioFloorM, [80, 0.1, 80], rc.map((v) => v * 0.62), 0, 0, 0, 1, undefined, 'poly');
  if (showroomChar) {
    showroomChar.t = time;
    // soft contact shadow under the feet
    renderer.setBlend(true);
    compose(studioShadowM, [sp[0], sp[1] + 0.004, sp[2]], [0, 0, 0], [0.95, 0.01, 0.7]);
    renderer.draw(studioShadowM, [0.95, 0.01, 0.7], [0, 0, 0], 0, 0, 0, 0.38, 'sphere');
    compose(studioShadowM2, [sp[0], sp[1] + 0.006, sp[2]], [0, 0, 0], [0.55, 0.01, 0.42]);
    renderer.draw(studioShadowM2, [0.55, 0.01, 0.42], [0, 0, 0], 0, 0, 0, 0.35, 'sphere');
    renderer.setBlend(false);
    renderer.setRim(rc.map((v) => v * 0.55));
    for (const p of showroomChar.parts()) renderer.drawPart(p);
    if (showroomChar.hasGun !== false) for (const p of Weapon.worldParts(showroomChar.gunDef, showroomChar.gunMatrix)) renderer.drawPart(p);
    renderer.setRim(null);
  }
  renderer.setStudio(null);
}
const studioFloorM = mat4(), studioShadowM = mat4(), studioShadowM2 = mat4();
showTab('home');
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) {
    locked = true;
    $('locknote').classList.add('hidden');
  } else if (locked) {
    locked = false;
    if (!bench.open) setPlaying(false);    // leaving lock to use the workbench isn't pausing
  }
});
addEventListener('keydown', (e) => {
  if (bench.open) {
    if (e.code === 'Escape' || e.code === 'KeyE') { e.preventDefault(); closeBench(); }
    return;
  }
  if (playing && !locked && (e.code === 'Escape' || e.code === 'KeyP')) setPlaying(false);
  else if (!playing && e.code === 'Enter') resume();
});

// ---------- plus menu: hold B to swap attachments mid-fight (like Battlefield 2042) ----------
// Four arms: optic (up), underbarrel (left), muzzle (right), ammo (down). The mouse moves a cursor; click a part to fit it.
const PLUS_ARMS = [['optic', 'top'], ['underbarrel', 'left'], ['muzzle', 'right'], ['ammo', 'bottom']];
const plus = { open: false, cur: [0, 0], opts: [], hot: null, swapT: 0 };
function plusOptions(id, slot) {
  const all = optionsFor(id, slot), cur = (loadouts[id] || {})[slot];
  const pick = all.slice(0, 4);
  if (cur && !pick.some((o) => o.id === cur)) pick[3] = all.find((o) => o.id === cur);
  return [null, ...pick];
}
function renderPlus() {
  const root = $('plus'), w = weapon(), id = w.def.id, lo = loadouts[id] || {};
  root.replaceChildren();
  const head = document.createElement('div');
  head.className = 'pl-head';
  head.innerHTML = `<b></b><span>CLICK A PART · RELEASE B TO CLOSE</span>`;
  head.firstChild.textContent = w.def.name;
  root.append(head);
  for (const [slot, side] of PLUS_ARMS) {
    const opts = optionsFor(id, slot).length ? plusOptions(id, slot) : [];
    const arm = document.createElement('div');
    arm.className = `pl-arm ${side}${opts.length ? '' : ' empty'}`;
    const t = document.createElement('small');
    t.textContent = SLOTS.find((x) => x.id === slot).name;
    arm.append(t);
    for (const o of opts) {
      const b = document.createElement('div');
      const aid = o ? o.id : null;
      b.className = `pl-opt${(lo[slot] || null) === aid ? ' on' : ''}`;
      b.textContent = o ? o.name : 'FACTORY';
      b.dataset.slot = slot; b.dataset.aid = aid || '';
      arm.append(b);
    }
    if (!opts.length) { const n = document.createElement('div'); n.className = 'pl-opt none'; n.textContent = 'N/A'; arm.append(n); }
    root.append(arm);
  }
  const c = document.createElement('i');
  c.className = 'pl-cursor';
  root.append(c);
  root.classList.remove('hidden');
  plus.opts = [...root.querySelectorAll('.pl-opt:not(.none)')].map((e) => ({ e, r: e.getBoundingClientRect() }));
}
function updatePlus() {
  const want = input.down('KeyB') && !player.dead && !cutscene && !pressSeq;
  if (want && !plus.open) { plus.open = true; plus.cur = [innerWidth / 2, innerHeight / 2]; renderPlus(); sounds.click?.(1800, 0.12); }
  if (!want && plus.open) { plus.open = false; $('plus').classList.add('hidden'); }
  if (!plus.open) return;
  plus.cur[0] = clamp(plus.cur[0] + input.dx * 1.1, 0, innerWidth);
  plus.cur[1] = clamp(plus.cur[1] + input.dy * 1.1, 0, innerHeight);
  const c = $('plus').querySelector('.pl-cursor');
  if (c) c.style.transform = `translate(${plus.cur[0]}px, ${plus.cur[1]}px)`;
  let hot = null;
  for (const o of plus.opts) {
    const { r } = o;
    if (plus.cur[0] >= r.left - 6 && plus.cur[0] <= r.right + 6 && plus.cur[1] >= r.top - 3 && plus.cur[1] <= r.bottom + 3) { hot = o; break; }
  }
  if (hot !== plus.hot) { plus.hot?.e.classList.remove('hot'); hot?.e.classList.add('hot'); plus.hot = hot; }
  if (input.fireHit && hot) {
    const w = weapon(), id = w.def.id, slot = hot.e.dataset.slot, aid = hot.e.dataset.aid || null;
    const next = { ...(loadouts[id] || {}) };
    if (aid) next[slot] = aid; else delete next[slot];
    const ammo = w.ammo;
    applyLoadout(id, next);
    w.ammo = Math.min(ammo, w.def.mag);           // swapping parts doesn't refill the gun
    w.equipT = Math.min(w.equipT, 0.55);          // a quick fiddle with the gun
    sounds.magIn?.();
    player.camPitchV += 0.15;
    renderPlus();
  }
  // the menu has the mouse: no looking around or shooting while it's open
  input.dx = 0; input.dy = 0;
  input.clicked.delete(0); input.buttons.delete(0);
}

// ---------- workbench ----------
const bench = new Bench({
  root: $('bench'),
  getLoadout: (id) => loadouts[id] || {},
  setLoadout: (id, lo) => applyLoadout(id, lo),
  sounds,
  onClose: () => closeBench(),
});
function openBench() {
  bench.show(weapon().def.id);
  document.body.classList.add('benching');
  input.enabled = false;
  input.reset();
  document.body.classList.remove('playing');
  sounds.cloth();
  if (document.pointerLockElement) document.exitPointerLock();
}
function closeBench() {
  bench.hide();
  document.body.classList.remove('benching');
  sounds.cloth();
  start();       // re-locks the mouse (this runs from a click/keypress, so the browser allows it)
}
let lastWheel = 0;
addEventListener('wheel', () => {
  if (!playing || performance.now() - lastWheel < 250) return;
  lastWheel = performance.now();
  switchTo(current === 0 ? 1 : 0);
}, { passive: true });

function bindSlider(id, key, fmt, onChange) {
  const el = $(id), out = $(`${id}-val`);
  el.value = settings[key];
  out.textContent = fmt(settings[key]);
  el.addEventListener('input', () => {
    settings[key] = parseFloat(el.value);
    out.textContent = fmt(settings[key]);
    onChange?.(settings[key]);
    saveSettings();
  });
}
bindSlider('sens', 'sens', (v) => v.toFixed(2));
bindSlider('fov', 'fov', (v) => `${v}°`);
bindSlider('vol', 'volume', (v) => `${Math.round(v * 100)}%`, (v) => sounds.setVolume(v));

// ---------- keyboard aim / shoot, rebindable ----------
const RESERVED = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ControlLeft', 'KeyC', 'KeyR', 'KeyE',
  'KeyT', 'KeyX', 'Digit1', 'Digit2', 'Escape', 'KeyP', 'Enter'];
const BINDS = { aimKey: 'bind-aim', fireKey: 'bind-fire', abilityKey: 'bind-ability', heavyKey: 'bind-heavy', throwKey: 'bind-throw' };
const keyName = (code) => code.replace(/^Key/, '').replace(/^Digit/, '').replace(/Left$|Right$/, (m) => ` ${m.toUpperCase()}`).toUpperCase();
let rebinding = null;
function refreshBindButtons() {
  for (const [k, id] of Object.entries(BINDS)) $(id).textContent = keyName(settings[k]);
  $('aim-mode').textContent = settings.aimMode === 'toggle' ? 'TOGGLE' : 'HOLD';
  $('trackpad-mode').textContent = settings.trackpad ? 'ON' : 'OFF';
  document.querySelectorAll('.keyhint-aim').forEach((el) => { el.textContent = keyName(settings.aimKey); });
  document.querySelectorAll('.keyhint-fire').forEach((el) => { el.textContent = keyName(settings.fireKey); });
  document.querySelectorAll('.keyhint-ability').forEach((el) => { el.textContent = keyName(settings.abilityKey); });
  document.querySelectorAll('.keyhint-heavy').forEach((el) => { el.textContent = keyName(settings.heavyKey); });
  document.querySelectorAll('.keyhint-throw').forEach((el) => { el.textContent = keyName(settings.throwKey); });
}
function startRebind(which, btn) {
  rebinding = { which, btn };
  btn.textContent = 'PRESS A KEY…';
  btn.classList.add('waiting');
  $('bindnote').textContent = 'Esc to cancel';
}
for (const [k, id] of Object.entries(BINDS)) $(id).addEventListener('click', (e) => startRebind(k, e.currentTarget));
$('trackpad-mode').addEventListener('click', () => {
  settings.trackpad = !settings.trackpad;
  applyBinds(); saveSettings(); refreshBindButtons();
});
$('aim-mode').addEventListener('click', () => {
  settings.aimMode = settings.aimMode === 'toggle' ? 'hold' : 'toggle';
  applyBinds(); saveSettings(); refreshBindButtons();
});
addEventListener('keydown', (e) => {
  if (!rebinding) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  const { which, btn } = rebinding;
  btn.classList.remove('waiting');
  rebinding = null;
  if (e.code !== 'Escape') {
    const taken = Object.keys(BINDS).some((k) => k !== which && settings[k] === e.code);
    if (RESERVED.includes(e.code) || taken) {
      $('bindnote').textContent = `${keyName(e.code)} is already used — pick another key`;
    } else {
      settings[which] = e.code;
      $('bindnote').textContent = '';
      applyBinds(); saveSettings(); refreshAbilityKeys();
    }
  } else $('bindnote').textContent = '';
  refreshBindButtons();
}, true);
refreshBindButtons();

// ---------- grapple rope + laser sight ----------
const previewM = mat4();
const beamPool = Array.from({ length: 4 }, () => mat4());
function beam(i, a, b, thick, color, emissive, alpha) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d);
  if (l < 0.01) return null;
  const s = [thick, thick, l];
  compose(beamPool[i], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], anglesFor(d), s);
  return { model: beamPool[i], scale: s, color, emissive, alpha };
}
let reel = null;           // the grapple line reeling back in after you let go
function worldBeams(w) {
  const out = [];
  const g = player.grapple;
  if (!bench.open && (g || reel)) {
    const hm = w.handModels[0];
    const hand = vmToWorld([hm[12], hm[13], hm[14]]);
    let tip, sag = 0, wave = 0, open = 0, spin = time * 26;
    if (g && g.phase === 'fire') {
      // the hook flies out spinning, the line snaking after it
      const k = Math.min(g.t / g.travel, 1);
      tip = hand.map((c, i) => c + (g.point[i] - c) * k);
      wave = 0.12 + 0.3 * (1 - k); sag = 0.15;
    } else if (g && g.phase === 'pull') {
      // it bites: claws open, the line twangs and pulls taut
      const ten = Math.min(1, g.t / 0.3);
      tip = g.point; open = 1; spin = g.spin ??= time * 26;
      wave = 0.2 * (1 - ten) * Math.cos(g.t * 30); sag = 0.35 * (1 - ten) * (1 - ten);
    } else if (g) {
      const k = g.t < 0.16 ? g.t / 0.16 : Math.max(0, 1 - (g.t - 0.16) / 0.16);
      tip = g.from.map((c, i) => c + g.dir[i] * 45 * k);
      wave = 0.3; sag = 0.5 * k;
    } else {
      // let go: the line reels back into the launcher
      const k = Math.min(1, (time - reel.t0) / 0.2);
      tip = reel.tip.map((c, i) => c + (hand[i] - c) * k * k);
      if (k >= 1) reel = null;
      wave = 0.25 * (1 - k); sag = 0.6 * (1 - k); open = 1 - k;
    }
    if (g && g.phase !== 'miss') reel = { tip: [...tip], t0: time };
    const dir = tip.map((c, i) => c - hand[i]);
    const accent = player.grappleMode === 'tether' ? TETHER_COL : undefined;
    out.push(...ropeParts(hand, tip, { sag, wave, t: time, thick: 0.017, accent }));
    if (Math.hypot(...dir) > 0.3) out.push(...hookParts(tip, dir, spin, open, accent));
  }
  heavy.parts(out, time);
  const lp = !bench.open && !w.scoped ? w.laserPoint() : null;
  if (lp) {
    // the laser follows the barrel, not the crosshair
    const start = vmToWorld(lp);
    const far = vmToWorld(w.gunPoint([w.def.laser[0], w.def.laser[1], w.def.laser[2] - 30]));
    const ldir = norm(far.map((c, i) => c - start[i]));
    const hit = world.raycast(start, ldir, 120);
    const end = hit ? hit.point : start.map((c, i) => c + ldir[i] * 120);
    const lc = w.def.laserCol || [1, 0.12, 0.08];
    const r = w.adsT < 0.6 ? beam(2, start, end, 0.006, lc, 1, 0.35 * (1 - w.adsT / 0.6)) : null;
    if (r) out.push(r);
    if (hit) {
      const sz = 0.025 + hit.t * 0.0012;
      const dm = beamPool[3];
      compose(dm, hit.point.map((c, i) => c + hit.normal[i] * 0.01), [0, 0, 0], [sz, sz, sz]);
      out.push({ model: dm, scale: [sz, sz, sz], color: lc, emissive: 1, alpha: 0.9 });
    }
  }
  return out;
}

// ---------- stadium: launch pads and the void ----------
function launch(pad) {
  // aim the arc so it lands on the pad's target: pick the upward speed, solve for the flight time
  const g = 21, from = player.pos, to = pad.to;
  const dy = to[1] - from[1], vy = Math.max(pad.vy, Math.sqrt(Math.max(0, 2 * g * dy)) + 1);
  const T = (vy + Math.sqrt(vy * vy - 2 * g * dy)) / g;
  player.cancelAbilities?.();
  Object.assign(player, { sliding: false, grounded: false, trav: null, wallRun: null });
  player.vel = [(to[0] - from[0]) / T, vy, (to[2] - from[2]) / T];
  player.shake = Math.max(player.shake || 0, 0.15);
  player.camPitchV -= 0.6;
  sounds.launch?.();
  effects.dust(player.pos, 6, [0, 6, 0]);
  padCd = 0.6;
}
// ---------- Sky Docks: the container hook and fall damage ----------
let fallTop = null;
// the container to hook: the nearest one in front of you within 45 m, else the nearest one at all
function hookTarget() {
  const eye = player.eye(), f = player.forward();
  let best = null, bs = Infinity;
  for (const b of world.boxes) {
    if (b.tag !== 'cargo') continue;
    // nearest point on the container's top
    const p = [clamp(eye[0], b.min[0] + 0.8, b.max[0] - 0.8), b.max[1] + 0.2, clamp(eye[2], b.min[2] + 0.8, b.max[2] - 0.8)];
    const d = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]], L = Math.hypot(...d);
    if (L > 45 || L < 1.5) continue;
    const facing = (d[0] * f[0] + d[1] * f[1] + d[2] * f[2]) / L;
    const sc = L * (facing > 0.5 ? 1 : facing > 0 ? 1.8 : 3);
    if (sc < bs) { bs = sc; best = { box: b, point: p }; }
  }
  return best;
}
function updateFall() {
  if (!stadium.fallLethal || player.dead) { fallTop = null; return; }
  const y = player.pos[1];
  if (player.grapple && player.grapple.phase === 'pull') { fallTop = y; return; }   // hanging on a line resets the fall
  if (player.grounded) {
    if (fallTop != null) {
      const drop = fallTop - y;
      if (drop > stadium.fallLethal) { damagePlayer(9999, player.pos, 'THE DROP'); banner('TOO FAR', `A ${Math.round(drop)} M DROP`, 'bad', 1.4); }
      else if (drop > stadium.fallHurt) { damagePlayer(Math.round((drop - stadium.fallHurt) * 18), [player.pos[0], player.pos[1] - 1, player.pos[2]], 'THE DROP'); }
    }
    fallTop = null;
  } else fallTop = Math.max(fallTop ?? y, y);
}

function updateStadium(dt) {
  updateFall();
  const shoe = stadium.refs?.shoe;
  if (shoe) {
    if (!shoe.base) shoe.base = shoe.map((b) => [...b.center]);
    const bob = Math.sin(time * 0.7) * 1.2;
    shoe.forEach((b, i) => moveBoxTo(b, [shoe.base[i][0], shoe.base[i][1] + bob, shoe.base[i][2]]));
  }
  padCd -= dt;
  if (padCd <= 0 && player.grounded) {
    for (const p of stadium.pads) {
      if (Math.abs(player.pos[0] - p.at[0]) < 1.1 && Math.abs(player.pos[2] - p.at[2]) < 1.1 && Math.abs(player.pos[1] - (p.at[1] + 0.25)) < 0.3) { launch(p); break; }
    }
  }
  // fell into the void: out, back to the spawn
  if (player.pos[1] < stadium.voidY && voidT <= 0) {
    voidT = 0.35;
    sounds.fail?.();
    banner(...(stadium.voidText || ['OUT', 'FELL INTO THE VOID']), 'bad', 1.3);
  }
  if (voidT > 0) {
    voidT -= dt;
    if (voidT <= 0) {
      player.respawn();
      Object.assign(player, { hp: player.maxHp, invuln: 1 });
    }
  }
}

// ---------- main loop ----------
const proj = mat4(), view = mat4(), vmProj = mat4(), identity = mat4();
let last = performance.now(), time = 0, fovKick = 0, timeScale = 1;
const weaponCtx = { fire, sounds };

let perfT = 0, perfN = 0, perfLast = 0;
// a bug in one frame must never stop the game loop (that freezes the game with the mouse still locked)
let frameErr = 0;
function frame(now) {
  try { frameBody(now); } catch (e) {
    if (frameErr++ < 3) console.error(e);
    requestAnimationFrame(frame);
  }
}
function frameBody(now) {
  const rdt = Math.min((now - last) / 1000, 0.05);
  if (slowmo > 0) slowmo -= rdt;
  const dt = rdt * timeScale * (slowmo > 0 ? 0.3 : 1);
  last = now;
  time += dt;
  // dynamic resolution: drop the render scale when frames take too long, raise it again when there's headroom
  if (playing && document.visibilityState === 'visible') {
    perfT += Math.min((now - perfLast) / 1000, 0.25); perfN++;
    if (perfT > 1.5) {
      const avg = perfT / perfN;
      if (avg > 1 / 50) renderer.resScale = Math.max(0.55, (renderer.resScale || 1) - 0.1);
      else if (avg < 1 / 58) renderer.resScale = Math.min(1, (renderer.resScale || 1) + 0.05);
      perfT = 0; perfN = 0;
    }
  }
  perfLast = now;

  if (playing && !bench.open && (cutscene || pressSeq || player.dead || td)) {
    // the player isn't in control right now
    downedNear = null;
    if (input.hit('KeyT') && !tdm.active) resetRange();
    if (cutscene) updateCutscene(dt);
    else if (td && !player.dead) updateTakedown(dt);
    else if (pressSeq) {
      updatePress(dt);
      weapon().update(dt, idleInput, player, weaponCtx);
    } else {
      deathT -= dt;
      settleBody(world, player, dt);      // killed in the air: fall to the floor (so your body and camera end up on it)
      if (victimCam) updateVictimCam(dt);
      else if (killcam) updateKillcam(dt);
      if (deathT <= 0) { endKillcam(); if (!(tdm.noRespawn && tdm.active && inStadium())) respawnPlayer(); }
    }
    if (inStadium()) for (const c of stadium.cargo || []) c.update(dt, player);
    updateCombat(dt);
    updateCamera();
  } else if (playing && !bench.open) {
    let w = weapon();
    const sens = settings.sens * 0.0022 * (1 - w.adsT * (1 - w.def.adsZoom) * 0.9);
    updatePlus();             // hold B: swap attachments on the fly (eats the mouse while it's open)
    player.look(input.dx, input.dy, sens);
    if (input.hit('KeyT') && !tdm.active) resetRange();
    if (input.hit('Digit1')) switchTo(0);
    if (input.hit('Digit2')) switchTo(1);
    if (input.hit('Digit3')) switchTo(2);
    // quick melee: X swaps to your melee weapon and swings it straight away
    if (input.hit('KeyX') && !course.active && !player.dead && slots[2] && !(meleeT && !meleeT.done)) { if (current !== 2) switchTo(2); const w = weapon(); w.equipT = 1; w.sinceShot = 0; quickMelee = true; fire(w); }
    nearCase = findCase();
    updateRacks(dt);
    nearBench = findBench();
    const liftBtn = lookLiftButton();
    downedNear = findDowned();
    modeThing = downedNear ? null : modeUse();
    if (downedNear && input.hit('KeyE')) startTakedown(downedNear);
    else if (liftBtn && input.hit('KeyE')) liftBtn.lift.press(liftBtn, sounds);
    else if (nearConsole() && input.hit('KeyE')) pressConsole();
    else if (nearCase?.ammo && input.hit('KeyE')) { slots.forEach((w) => { w.ammo = w.def.mag; }); sounds.magIn?.(); sounds.pickup(); }
    else if (nearCase && input.hit('KeyE')) useRack(nearCase);
    else if (nearBench && input.hit('KeyE')) openBench();
    else if (modeThing?.hold) { if (input.down('KeyE')) modeThing.use(dt); else zBoardT = 0; }
    else if (modeThing && input.hit('KeyE')) modeThing.use();
    w = weapon();
    // only your class's equipped specialisation works
    let hooked = false;
    if (inStadium() && stadium.hook && input.hit(settings.abilityKey)) {
      if (player.grapple && player.grapple.phase !== 'miss') { player.releaseGrapple(false); sounds.grappleRelease(); hooked = true; }
      else {
        const t = hookTarget();
        if (t) { player.hookTo(t.box, t.point); hooked = true; fallTop = null; }
      }
    }
    const abilityHit = !hooked && input.hit(settings.abilityKey);
    const eq = equippedAbility;
    const act = { grapple: eq === 'grapple' && abilityHit, dash: eq === 'dash' && abilityHit, slam: eq === 'slam' && abilityHit };
    if (abilityHit) {
      if (eq === 'tether') useTether();
      else if (eq === 'cloak') useCloak();
      else if (BUFF[eq]) useBuff(eq);
      else if (ABIL_CD[eq]) useGadget(eq);
    }
    if (input.hit(settings.heavyKey)) useHeavy();
    if (input.hit(settings.throwKey)) useThrowable();
    if (launcherW && launcherT > 0 && (launcherT -= dt) <= 0) putAwayLauncher(true);
    elevator.update(dt, player, sounds);
    for (const l of lifts) l.update(dt, player, sounds);
    if (inStadium()) for (const c of stadium.cargo || []) c.update(dt, player);
    // heavier guns slow you down; a spinning minigun slows you a lot more
    player.speedMul = CLASSES[classLo.cls].speed * (w.def.moveMul ?? 1) * (w.def.spin && (w.spinT || 0) > 0.05 ? 0.72 : 1) * (buffOn('stim') ? 1.3 : buffOn('fortify') ? 0.8 : 1);
    player.killY = inStadium() ? stadium.voidY - 20 : -30;     // (the zombies bunker is deep underground)
    player.update(dt, input, { ads: w.ads, firing: input.fireDown && w.ammo > 0 && !w.reloading && !player.trav, act });
    if (playerTether) {
      // tied down: you can't get further than the line's length from the spike
      const T = playerTether, a = T.anchor, p = player.pos;
      T.t -= dt;
      const dx = p[0] - a[0], dz = p[2] - a[2], d = Math.hypot(dx, dz);
      if (d > T.len) {
        p[0] = a[0] + (dx / d) * T.len; p[2] = a[2] + (dz / d) * T.len;
        const out = (player.vel[0] * dx + player.vel[2] * dz) / d;
        if (out > 0) { player.vel[0] -= (dx / d) * out; player.vel[2] -= (dz / d) * out; }
      }
      if (p[1] > a[1] + T.len + 1.2) { p[1] = a[1] + T.len + 1.2; player.vel[1] = Math.min(0, player.vel[1]); }
      if (player.grapple) player.releaseGrapple(false);
      if (T.t <= 0 || player.dead) playerTether = null;
    }
    if (inStadium()) updateStadium(dt);
    updateCombat(dt);
    course.update(dt, player, input);
    handlePlayerEvents();
    updateCamera();
    w.update(dt, input, player, weaponCtx);
    handleWeaponEvents(w);
  }
  dummies.forEach((d) => d.update(dt, time));
  if (playing && !bench.open) {
    gadgets.update(dt, [padRider]);
    heavy.update(dt);
    updateBurns(dt);
    updateNavHoles(dt);
    updateSkinLive(dt);
    updateBuffs(dt);
    updateMelee(dt);
    updateRail(dt);
    updateHealing(dt);
    if (playerBurn) {
      playerBurn.t -= dt; playerBurn.acc += playerBurn.dps * dt;
      if (Math.random() < dt * 20) effects.flame([player.pos[0] + (Math.random() - 0.5) * 0.5, player.pos[1] + 0.3 + Math.random() * 1.2, player.pos[2] + (Math.random() - 0.5) * 0.5], [0, 0.5, 0], 1.3);
      if (playerBurn.acc >= 4) { const d = Math.floor(playerBurn.acc); playerBurn.acc -= d; player.lastHitBy = playerBurn.by; damagePlayer(d, playerBurn.by.pos || player.pos, playerBurn.by.name); }
      if (playerBurn.t <= 0 || player.dead) playerBurn = null;
    }
    if (cloakT > 0 && ((cloakT -= dt) <= 0 || player.dead)) { cloakT = 0; sounds.cloak?.(); }
    document.body.classList.toggle('cloaked', cloakT > 0);
    if (tdm.you) tdm.you.cloaked = cloakT > 0;
    heavyCd = Math.max(0, heavyCd - dt);
    if (chunkOut.length && (chunkSendT -= dt) <= 0) { chunkSendT = 0.1; if (online.active) online.send({ t: 'chk', id: online.myId, h: chunkOut }); chunkOut = []; }
    if (throwCharges < 2 && (throwT += dt) >= THROW_RECHARGE) { throwCharges++; throwT = 0; }
    flashT = Math.max(0, flashT - dt);
    $('flashfx').style.opacity = Math.min(1, flashT * 0.9).toFixed(3);
    if (player.dead && launcherW) putAwayLauncher(false);
  }
  effects.update(dt);

  // ---- render ----
  const w = weapon();
  const aspect = renderer.resize();
  if (!playing && !bench.open) {
    drawShowroom(aspect);
    input.endFrame();
    requestAnimationFrame(frame);
    return;
  }
  const targetKick = td || victimCam ? cineFov : player.dash ? 16 : player.grapple?.phase === 'pull' ? 10 : player.slam?.phase === 'fall' ? 7 : player.wallRunning ? 8 : player.vaulting ? 8 : player.sliding ? 9 : player.sprinting ? 5 : player.mantle ? 3 : 0;
  fovKick += (targetKick - fovKick) * damp(player.dash ? 18 : 6, dt);
  const hfov = (settings.fov + fovKick) * (1 - w.adsT * (1 - w.def.adsZoom)) * Math.PI / 180;
  const vfov = 2 * Math.atan(Math.tan(Math.min(hfov, 2.9) / 2) / aspect);
  perspective(proj, vfov, aspect, 0.05, 500);
  updateCamera();
  lookDir(view, camEye, camFwd, [0, 1, 0], player.roll);
  mul(vp, proj, view);

  const caseParts = inStadium() ? [] : cases.flatMap((c) => c.parts(time, c === nearCase));
  // viewmodel first: the grapple rope and laser start from the hands / gun
  perspective(vmProjM, 58 * Math.PI / 180, aspect, 0.01, 10);
  lookDir(vmViewM, [0, 0, 0], [0, 0, -1], [0, 1, 0], player.roll * 0.5);
  worldVfov = vfov; worldAspect = aspect;
  const vmParts = bench.open || cutscene || player.dead || td ? [] : w.viewmodel(player, time);
  const kcUndo = killcam ? killcamPose() : null;
  const botParts = tdm.active && inStadium() ? [...botMgr.drawParts(), ...tdm.drawParts(modeDraw)] : botMgr.drawParts();
  if (kcUndo) { botParts.push(...killcam.body.parts()); kcUndo(); }
  if ((td && !player.dead) || victimCam) takedownParts(botParts);
  agentTakedownParts(botParts);
  const beams = worldBeams(w);

  // shadow pass
  // keep the sun's shadow map centred on the player so the annex gets shadows too
  // only draw the place you're in (the range or the stadium), and only what the camera can see
  const st = inStadium(), SA = stadium.area;
  const curZone = st ? ARENAS.indexOf(stadium) : -1;
  const zoneOk = (b) => zoneOf(b) === curZone;
  const shadowHalf = st ? stadium.shadowHalf : 50;
  const sc = [Math.round(player.pos[0] / 8) * 8, Math.round(player.pos[1] / 8) * 8, Math.round(player.pos[2] / 8) * 8];
  renderer.setShadowArea(sc, shadowHalf);
  const fogD = st ? stadium.fog : 0.0095;
  const farCull = 2.4 / fogD;           // past this the fog has swallowed everything
  const radius = (b) => 0.5 * Math.hypot(b.scale[0], b.scale[1], b.scale[2]);
  const nearShadow = (b) => {
    const dx = b.center[0] - sc[0], dy = b.center[1] - sc[1], dz = b.center[2] - sc[2], lim = shadowHalf * 1.5 + radius(b);
    return dx * dx + dy * dy + dz * dz < lim * lim;
  };
  const tv = Math.tan(vfov / 2), kf = Math.hypot(tv, tv * aspect), kr = Math.sqrt(1 + kf * kf);
  const inView = (b) => {
    const r = radius(b);
    const dx = b.center[0] - camEye[0], dy = b.center[1] - camEye[1], dz = b.center[2] - camEye[2];
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > (farCull + r) * (farCull + r)) return false;
    const al = dx * camFwd[0] + dy * camFwd[1] + dz * camFwd[2];
    if (al < -r) return false;
    if (Math.sqrt(Math.max(0, d2 - al * al)) > al * kf + r * kr) return false;
    return !!b.tag || r > 0.0022 * Math.sqrt(d2);     // skip tiny props far away (never targets)
  };
  // static scenery is drawn in instanced batches; only boxes that move or change are drawn one by one
  if (!batches.world) batches.build(world, zoneOf);
  batches.sync();
  const live = world.boxes.filter((b) => !b.hidden && !b.batched && zoneOk(b));
  const sphereShadow = (c, r) => {
    const dx = c[0] - sc[0], dy = c[1] - sc[1], dz = c[2] - sc[2], lim = shadowHalf * 1.5 + r;
    return dx * dx + dy * dy + dz * dz < lim * lim;
  };
  const sphereView = (c, r) => {
    const dx = c[0] - camEye[0], dy = c[1] - camEye[1], dz = c[2] - camEye[2];
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > (farCull + r) * (farCull + r)) return false;
    const al = dx * camFwd[0] + dy * camFwd[1] + dz * camFwd[2];
    if (al < -r) return false;
    return Math.sqrt(Math.max(0, d2 - al * al)) <= al * kf + r * kr;
  };
  // character / prop parts: cull each against the view, and only nearby ones cast shadows
  const pc = [0, 0, 0];
  const partR = (p) => 0.5 * Math.hypot(p.scale[0], p.scale[1], p.scale[2]);
  const partAt = (p) => { pc[0] = p.model[12]; pc[1] = p.model[13]; pc[2] = p.model[14]; return pc; };
  const partView = (p) => sphereView(partAt(p), partR(p));
  const shadowNear = Math.min(shadowHalf, 32);
  const partShadow = (p) => {
    const c = partAt(p), dx = c[0] - player.pos[0], dy = c[1] - player.pos[1], dz = c[2] - player.pos[2];
    return dx * dx + dy * dy + dz * dz < shadowNear * shadowNear;
  };
  const caseVis = caseParts.filter(partView), botVis = botParts.filter(partView);
  renderer.beginShadow();
  batches.drawShadows(curZone, sphereShadow);
  for (const b of live) if (!b.noShadow && nearShadow(b)) renderer.shadowDraw(b.model, b.shape, b.scale);
  for (const p of caseParts) if (partShadow(p)) renderer.shadowDraw(p.model, p.shape, p.scale);
  effects.drawShadows(renderer);
  for (const p of botParts) if (partShadow(p)) renderer.shadowDraw(p.model, p.shape, p.scale);
  renderer.endShadow();

  // world
  renderer.begin();
  renderer.setCamera(proj, view, fogD, camEye, true);
  renderer.drawSky(camEye);
  renderer.setBlend(false);
  batches.draw(curZone, sphereView);
  const vis = live.filter(inView);
  for (const b of vis) if (b.alpha >= 1) renderer.drawBox(b);
  for (const p of caseVis) renderer.drawPart(p);
  effects.drawOpaque(renderer);
  for (const p of botVis) if ((p.alpha ?? 1) >= 1) renderer.drawPart(p);
  for (const b of beams) if ((b.alpha ?? 1) >= 1) renderer.drawPart(b, 0);
  renderer.setBlend(true);
  for (const b of vis) if (b.alpha < 1) renderer.drawBox(b);
  effects.drawTransparent(renderer);
  for (const b of beams) if ((b.alpha ?? 1) < 1) renderer.drawPart(b, 0);
  for (const p of botVis) if ((p.alpha ?? 1) < 1) renderer.drawPart(p);     // see-through bits on people (a railgun charge's glow)
  for (const b of botMgr.beams()) renderer.draw(b.model, b.scale, b.color, 0, 0, b.emissive, b.alpha);
  renderer.setBlend(false);

  // viewmodel
  renderer.clearDepth();
  renderer.setCamera(vmProjM, vmViewM, 0, [0, 0, 0], false);
  renderer.setUnder(camEye[1] < -1.2);
  // what the gunshots sound like: a room in the armoury, a hall underground, open air elsewhere
  { const R = map.armoury.room, inRoom = !inStadium() && camEye[0] > R[0] && camEye[0] < R[2] && camEye[2] > R[1] && camEye[2] < R[3] && camEye[1] < R[4];
    sounds.setEnv?.(inRoom ? 'in' : camEye[1] < -1.2 ? 'under' : 'out'); }
  if (bench.open) {
    // the gunsmith: the gun side-on in the middle of a dark studio, with its slot labels pinned to it
    renderer.clearTo([0.075, 0.08, 0.09]);
    const bd = defFor(bench.weaponId);
    const span = Math.max(0.5, Math.max(...bd.parts.filter((p) => !p.hidden).map((p) => p.c[2] + p.s[2] / 2)) - Math.min(...bd.parts.filter((p) => !p.hidden).map((p) => p.c[2] - p.s[2] / 2)));
    const dist = clamp(span * 1.25, 0.75, 1.7) * Math.max(1, 1.5 / aspect);
    compose(previewM, [-0.03 * dist, 0.02 * dist, -dist], [0.04, -Math.PI / 2 + bench.rotY, 0], [1, 1, 1]);
    for (const p of Weapon.worldParts(bd, previewM)) renderer.drawPart(p);
    mul(benchPV, vmProjM, vmViewM);
    const a = anchorsFor(bd), pts = {};
    for (const [k, v] of Object.entries(a)) {
      const w = [0, 1, 2].map((i) => previewM[i] * v[0] + previewM[4 + i] * v[1] + previewM[8 + i] * v[2] + previewM[12 + i]);
      const x = benchPV[0] * w[0] + benchPV[4] * w[1] + benchPV[8] * w[2] + benchPV[12];
      const y = benchPV[1] * w[0] + benchPV[5] * w[1] + benchPV[9] * w[2] + benchPV[13];
      const ww = benchPV[3] * w[0] + benchPV[7] * w[1] + benchPV[11] * w[2] + benchPV[15];
      if (ww > 0.01) pts[k] = [(x / ww * 0.5 + 0.5) * innerWidth, (1 - (y / ww * 0.5 + 0.5)) * innerHeight];
    }
    bench.layout(pts);
  } else {
    if (cloakT > 0) for (const p of vmParts) renderer.drawPart({ ...p, color: p.color.map((c, i) => c * 0.35 + [0.35, 0.6, 1][i] * 0.4), emissive: Math.max(p.emissive || 0, 0.35) });
    else {
      // solid parts first, then the see-through ones (the railgun's plasma halo) blended over the top
      let glow = false;
      for (const p of vmParts) { if (p.alpha != null && p.alpha < 1) glow = true; else renderer.drawPart(p); }
      if (glow) { renderer.setBlend(true); for (const p of vmParts) if (p.alpha != null && p.alpha < 1) renderer.drawPart(p); renderer.setBlend(false); }
    }
  }

  updateHud(dt, vfov);
  input.endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// handy for debugging from the console / automated tests
 window.game = { kf: (...a) => killFeed(...a), daily, gainXp: (n, l) => gainXp(n, l), progress, skinLive: (h, s) => { skinHeat = h; skinStreak = s; }, startTakedown, updateTakedown, findDowned, takedownParts, get td() { return td; }, get deathT() { return deathT; }, useRack, skinKill, ranked, get crew() { return crew; }, openCrew, startMode, zombies, ZMAP, zFillAmmo, modeUse: () => modeThing, modeUseNow: () => modeUse(), fireNow: () => { updateCamera(); fire(weapon()); }, pass, passXp, buyPremium, meleeTargets: (r, a, m) => { updateCamera(); return meleeTargets(r, a, m).map((t) => ({ dist: t.dist })); }, camFwd: () => camFwd, redeemCode, useBuff, get buff() { return { kind: buffKind, t: buffT }; }, setThrow: (k) => { equippedThrow = k; throwCharges = 2; }, useThrowable, get throwCharges() { return throwCharges; }, get flashT() { return flashT; }, heavy, useHeavy, applyClass, useGadget, useTether, useCloak, get cloakT() { return cloakT; }, get launcherW() { return launcherW; }, gadgets, get burning() { return burning; }, lobby, online, get tdm() { return tdm; }, batches, renderer, map, ARENAS, get stadium() { return stadium; }, setArena: (i) => { stadium = ARENAS[i]; }, lifts, hooks: botHooks, updateFall, hookTarget, fallTop: () => fallTop, breakGlass, updateCombat, startMatch: (m) => startMatch(m), enterStadium, where: () => where, sr: () => showroomChar, cosmetics, refreshGuns, classLo, renderMenu, showTab, enterRange, cs: () => cutscene, botMgr, elevator, damagePlayer, pressConsole, setTimeScale: (v) => { timeScale = v; }, bench, openBench, closeBench, loadouts, applyLoadout, course, player, slots, weapon, world, stats, effects, dummies, walls, cases, input, start, setPlaying, resetRange, switchTo, pickUp, WEAPONS };
