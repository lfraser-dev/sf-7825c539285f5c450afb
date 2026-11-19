// DEAD AIR (build 0.75): a third-person helicopter shooter against zombie hordes, inside The Semi-Finals.
//
// HANGAR: spend SCRAP on upgrades. Every one bolts onto the helicopter where you can see it (guns, pods, bombs,
// armour plates, bigger exhausts, a second rotor, door gunners, a bigger cabin) and the camera flies to the part.
// MISSION (10 minutes): survivors are stuck on rooftops all over the city, with a green flare going up. Land on the
// roof to load them, fly them back to the OUTPOST helipad. Zombies climb the buildings to get them, spit acid and
// throw rubble at you, and jump onto your skids if you fly low. Landing on the helipad also repairs and rearms you.
// At 8:00 the TITAN comes for the outpost. Hold out to 10:00 (or kill it) to win. Everything you earn is kept.
import { perspective, lookDir, mul, mat4, compose, clamp, damp, norm } from '../math.js';
import { StaticBatches } from '../batch.js';
import { Effects } from '../effects.js';
import { buildCity, BASE, HANGAR, HALF } from './city.js';
import { Horde, TYPES } from './horde.js';
import { Chopper, chopperParts, qrot, qmat, qaxis, ROTOR } from './chopper.js';
import { SLOTS, SLOT, PAINTS, PAINT, loadSave, saveSave, statsFor, bars } from './data.js';

const LEN = 600, PHASE2 = 480;
const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const FOG = [0.58, 0.5, 0.46], SKY = [0.26, 0.28, 0.4];
const CAMS = {
  all: [0.75, 0.22, 21, [0, 0.4, 1.5]], gun: [0.55, 0.02, 8.5, [0, -0.9, -3.6]], rockets: [1.15, 0.15, 10, [1.6, -0.5, 0.4]],
  bombs: [1.35, -0.12, 9, [0, -1.4, 0.4]], armor: [0.85, 0.15, 13, [0, -0.1, -0.6]], engine: [2.5, 0.38, 10, [0, 1.4, 1.6]],
  rotor: [0.8, 0.62, 19, [0, 2, 0.3]], door: [1.62, 0.08, 9, [1.1, 0, 0.6]], cabin: [-1.45, 0.12, 11, [-1, -0.2, 0.7]], paint: [0.75, 0.22, 21, [0, 0.4, 1.5]],
};

const CSS = `
#da-root { position: fixed; inset: 0; pointer-events: none; z-index: 30; font-family: var(--font); color: #fff; }
#da-root .hidden { display: none !important; }
#da-root button { font-family: var(--font); cursor: pointer; pointer-events: auto; }
.da-hangar { position: absolute; inset: 0; pointer-events: none; }
.da-hangar > * { pointer-events: auto; }
.da-title { position: absolute; left: 28px; top: 18px; pointer-events: none !important; }
.da-title b { display: block; font: 900 italic 54px/0.9 var(--font); letter-spacing: .02em; color: #ffcf3a; text-shadow: 0 3px 0 #000, 0 0 24px rgba(255,140,20,.35); }
.da-title span { font: 800 14px var(--font); letter-spacing: .3em; opacity: .85; }
.da-scrap { position: absolute; right: 28px; top: 22px; background: rgba(0,0,0,.6); padding: 8px 14px; font: 900 22px var(--font); letter-spacing: .06em; border-left: 4px solid #ffcf3a; }
.da-scrap small { display: block; font: 700 11px var(--font); letter-spacing: .2em; opacity: .7; }
.da-slots { position: absolute; left: 28px; top: 120px; width: 230px; display: flex; flex-direction: column; gap: 5px; }
.da-slot { display: flex; align-items: center; gap: 10px; text-align: left; background: rgba(10,12,14,.72); border: 0; border-left: 4px solid transparent; color: #fff; padding: 7px 10px; }
.da-slot i { font-style: normal; width: 22px; text-align: center; font-size: 18px; color: #ffcf3a; }
.da-slot b { display: block; font: 900 15px var(--font); letter-spacing: .08em; }
.da-slot small { font: 700 11px var(--font); letter-spacing: .08em; opacity: .7; }
.da-slot.on { background: rgba(255,207,58,.92); color: #111; border-left-color: #fff; }
.da-slot.on i { color: #111; }
.da-slot em { margin-left: auto; font: 900 11px var(--font); font-style: normal; color: #7dff9a; }
.da-tiers { position: absolute; left: 280px; right: 300px; bottom: 96px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
.da-tier { width: 200px; text-align: left; background: rgba(10,12,14,.8); border: 2px solid rgba(255,255,255,.12); color: #fff; padding: 10px 12px; }
.da-tier b { display: block; font: 900 17px var(--font); letter-spacing: .05em; }
.da-tier p { margin: 4px 0 8px; font: 600 13px/1.2 var(--font); opacity: .8; min-height: 32px; }
.da-tier span { font: 900 13px var(--font); letter-spacing: .1em; }
.da-tier.eq { border-color: #7dff9a; } .da-tier.eq span { color: #7dff9a; }
.da-tier.buy span { color: #ffcf3a; } .da-tier.lock { opacity: .45; cursor: default; } .da-tier.poor span { color: #ff6a4a; }
.da-tier .sw { display: inline-block; width: 14px; height: 14px; vertical-align: -2px; margin-right: 6px; border: 1px solid rgba(255,255,255,.5); }
.da-stats { position: absolute; right: 28px; top: 110px; width: 250px; background: rgba(10,12,14,.72); padding: 12px 14px; pointer-events: none !important; }
.da-stats h4 { margin: 0 0 8px; font: 900 13px var(--font); letter-spacing: .2em; opacity: .75; }
.da-bar { display: grid; grid-template-columns: 90px 1fr; align-items: center; gap: 8px; margin: 6px 0; font: 800 12px var(--font); letter-spacing: .1em; }
.da-bar i { height: 8px; background: rgba(255,255,255,.12); position: relative; }
.da-bar i::after { content: ''; position: absolute; inset: 0; width: calc(var(--p) * 100%); background: #ffcf3a; transition: width .3s; }
.da-best { margin-top: 10px; font: 700 12px/1.4 var(--font); letter-spacing: .06em; opacity: .75; }
.da-opts { position: absolute; right: 28px; top: 330px; width: 250px; display: flex; flex-direction: column; gap: 5px; }
.da-opt { background: rgba(10,12,14,.72); border: 0; color: #fff; padding: 7px 10px; text-align: left; font: 800 13px var(--font); letter-spacing: .08em; }
.da-opt b { float: right; color: #ffcf3a; }
.da-keys { position: absolute; right: 28px; top: 470px; width: 250px; background: rgba(10,12,14,.6); padding: 10px 12px; font: 700 12px/1.55 var(--font); letter-spacing: .05em; pointer-events: none !important; }
.da-keys kbd { display: inline-block; min-width: 18px; text-align: center; background: #fff; color: #111; font: 900 11px var(--font); padding: 0 4px; margin-right: 4px; }
.da-deploy { position: absolute; right: 28px; bottom: 26px; background: #ffcf3a; color: #111; border: 0; padding: 14px 34px; font: 900 italic 34px var(--font) !important; letter-spacing: .04em; box-shadow: 0 4px 0 #8a6a10; }
.da-deploy:hover { background: #fff; }
.da-back { position: absolute; left: 28px; bottom: 30px; background: rgba(10,12,14,.75); color: #fff; border: 0; padding: 10px 18px; font: 900 16px var(--font); letter-spacing: .1em; }
.da-msg { position: absolute; left: 50%; top: 92px; transform: translateX(-50%); font: 900 20px var(--font); letter-spacing: .12em; color: #7dff9a; text-shadow: 0 2px 0 #000; pointer-events: none !important; transition: opacity .4s; }
.da-hud { position: absolute; inset: 0; pointer-events: none; }
.da-top { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); text-align: center; text-shadow: 0 2px 0 rgba(0,0,0,.8); }
.da-top b { display: block; font: 900 34px var(--font); letter-spacing: .06em; }
.da-top span { font: 800 15px var(--font); letter-spacing: .12em; color: #ffcf3a; }
.da-boss { position: absolute; top: 88px; left: 50%; transform: translateX(-50%); width: 420px; text-align: center; font: 900 14px var(--font); letter-spacing: .3em; color: #ff5a3a; text-shadow: 0 2px 0 #000; }
.da-boss i { display: block; height: 10px; margin-top: 4px; background: rgba(0,0,0,.5); border: 1px solid rgba(255,90,58,.6); position: relative; }
.da-boss i::after { content: ''; position: absolute; inset: 0; width: calc(var(--p) * 100%); background: #ff5a3a; }
.da-left { position: absolute; left: 26px; bottom: 24px; width: 260px; }
.da-meter { margin-top: 7px; font: 900 12px var(--font); letter-spacing: .14em; text-shadow: 0 1px 0 #000; }
.da-meter i { display: block; height: 9px; margin-top: 3px; background: rgba(0,0,0,.55); position: relative; }
.da-meter i::after { content: ''; position: absolute; inset: 0; width: calc(var(--p) * 100%); background: var(--c, #7dff9a); }
.da-meter.hot i::after { background: #ff5a3a; animation: dablink .25s steps(2) infinite; }
.da-right { position: absolute; right: 26px; bottom: 24px; text-align: right; font: 900 18px/1.35 var(--font); letter-spacing: .06em; text-shadow: 0 2px 0 rgba(0,0,0,.8); }
.da-right small { font: 800 11px var(--font); letter-spacing: .18em; opacity: .75; margin-right: 6px; }
.da-flight { position: absolute; left: 50%; bottom: 22px; transform: translateX(-50%); font: 900 15px var(--font); letter-spacing: .14em; text-shadow: 0 2px 0 #000; white-space: nowrap; }
.da-flight span { margin: 0 12px; }
.da-cross { position: absolute; width: 30px; height: 30px; margin: -15px 0 0 -15px; border: 2px solid rgba(255,255,255,.85); border-radius: 50%; box-shadow: 0 0 0 1px rgba(0,0,0,.4); }
.da-cross::after { content: ''; position: absolute; left: 50%; top: 50%; width: 4px; height: 4px; margin: -2px; background: #fff; border-radius: 50%; }
.da-cross.hot { border-color: #ff5a3a; }
.da-hit { position: absolute; width: 22px; height: 22px; margin: -11px 0 0 -11px; opacity: 0; transition: opacity .12s; }
.da-hit::before, .da-hit::after { content: ''; position: absolute; left: 50%; top: -4px; bottom: -4px; width: 2px; margin-left: -1px; background: #fff; transform: rotate(45deg); }
.da-hit::after { transform: rotate(-45deg); }
.da-hit.kill::before, .da-hit.kill::after { background: #ff5a3a; }
.da-mark { position: absolute; transform: translate(-50%, -100%); text-align: center; font: 900 13px var(--font); letter-spacing: .08em; text-shadow: 0 2px 0 #000; white-space: nowrap; }
.da-mark b { display: block; margin: 0 auto 2px; width: 26px; height: 26px; line-height: 26px; font-size: 15px; color: #111; background: var(--c); clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); }
.da-mark small { display: block; color: #ff5a3a; font-size: 11px; }
.da-mark.off { opacity: .8; }
.da-banner { position: absolute; top: 26%; left: 0; right: 0; text-align: center; text-shadow: 0 3px 0 #000; transition: opacity .3s; }
.da-banner b { display: block; font: 900 italic 56px var(--font); letter-spacing: .03em; color: #fff; }
.da-banner span { font: 800 18px var(--font); letter-spacing: .2em; color: #ffcf3a; }
.da-banner.bad b { color: #ff5a3a; } .da-banner.good b { color: #7dff9a; }
.da-warn { position: absolute; top: 60%; left: 0; right: 0; text-align: center; font: 900 20px var(--font); letter-spacing: .16em; color: #ff5a3a; text-shadow: 0 2px 0 #000; animation: dablink .5s steps(2) infinite; }
.da-feed { position: absolute; right: 26px; top: 130px; text-align: right; font: 900 14px/1.5 var(--font); letter-spacing: .08em; text-shadow: 0 2px 0 #000; }
.da-feed div { animation: dafade 2.4s forwards; } .da-feed .g { color: #7dff9a; } .da-feed .y { color: #ffcf3a; } .da-feed .r { color: #ff5a3a; }
.da-help { position: absolute; left: 26px; top: 120px; background: rgba(0,0,0,.5); padding: 10px 12px; font: 700 13px/1.6 var(--font); letter-spacing: .05em; transition: opacity 1s; }
.da-help kbd { display: inline-block; min-width: 18px; text-align: center; background: #fff; color: #111; font: 900 11px var(--font); padding: 0 4px; margin-right: 4px; }
.da-dmg { position: absolute; inset: 0; box-shadow: inset 0 0 160px rgba(255,30,10,.9); opacity: 0; }
.da-card { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); background: rgba(10,12,14,.9); padding: 26px 34px; min-width: 380px; text-align: center; pointer-events: auto; border-top: 5px solid #ffcf3a; }
.da-card h2 { margin: 0; font: 900 italic 46px var(--font); letter-spacing: .03em; }
.da-card h2.win { color: #7dff9a; } .da-card h2.lose { color: #ff5a3a; }
.da-card p { font: 700 15px/1.5 var(--font); letter-spacing: .06em; opacity: .9; margin: 10px 0; }
.da-card table { margin: 12px auto; font: 800 15px var(--font); letter-spacing: .08em; border-collapse: collapse; }
.da-card td { padding: 3px 12px; text-align: left; } .da-card td:last-child { text-align: right; color: #ffcf3a; }
.da-card .row { display: flex; gap: 10px; justify-content: center; margin-top: 14px; }
.da-card button { background: #ffcf3a; color: #111; border: 0; padding: 11px 22px; font: 900 18px var(--font); letter-spacing: .08em; }
.da-card button.alt { background: rgba(255,255,255,.14); color: #fff; }
.da-click { position: absolute; left: 50%; top: 58%; transform: translateX(-50%); font: 900 22px var(--font); letter-spacing: .16em; background: rgba(0,0,0,.6); padding: 10px 20px; animation: dablink 1s steps(2) infinite; }
@keyframes dablink { 50% { opacity: .35; } }
@keyframes dafade { 0%, 70% { opacity: 1; } 100% { opacity: 0; } }
@media (max-height: 780px) { .da-slots { top: 96px; gap: 3px; } .da-slot { padding: 4px 10px; } .da-slot b { font-size: 13px; } .da-slot small { font-size: 10px; }
  .da-keys { display: none; } .da-stats { top: 90px; } .da-opts { top: 300px; } .da-tiers { bottom: 84px; } .da-tier p { min-height: 0; font-size: 12px; } .da-back { bottom: 20px; } .da-deploy { bottom: 18px; } }
@media (max-height: 640px) { .da-slots { left: 16px; width: 200px; } .da-slot small, .da-slot i { display: none; } .da-tiers { left: 230px; } }
@media (max-width: 900px) { .da-tiers { left: 20px; right: 20px; bottom: 90px; } .da-tier { width: 150px; } .da-stats, .da-opts, .da-keys { display: none; } .da-title b { font-size: 36px; } }
`;

export class HeliGame {
  constructor({ renderer, sounds, canvas, earn, onExit, isDev }) {
    this.r = renderer; this.snd = sounds; this.canvas = canvas; this.earn = earn; this.onExit = onExit; this.isDev = isDev || (() => false);
    this.active = false; this.mode = 'off';
    this.save = loadSave();
    this.keys = new Set(); this.hitKeys = new Set(); this.btn = new Set(); this.clk = new Set();
    this.mx = 0; this.my = 0; this.locked = false;
    this.sel = 'all'; this.install = {};
    this.cam = { yaw: 0.75, pitch: 0.22, dist: 21, tgt: [0, 0.4, 1.5], dyaw: 0, eye: [0, 0, 0], fwd: [0, 0, -1] };
    this.proj = mat4(); this.view = mat4(); this.vp = mat4();
    this.t = 0;
    this.ui();
    this.listen();
  }

  // ---------------------------------------------------------------- set up
  load() {
    if (this.city) return;
    this.city = buildCity();
    this.world = this.city.world;
    this.fx = new Effects(this.world); this.fx.max = 1400;
    this.horde = new Horde(this.world, this.fx);
    this.batches = new StaticBatches(this.r);
    this.batches.build(this.world, () => 0);
    this.live = this.world.boxes.filter((b) => !b.batched && !b.hidden);
    this.zBatch = this.r.makeBatch(this.r.cube);
    this.heli = new Chopper();
  }

  open() {
    this.load();
    this.active = true;
    this.save = loadSave();
    this.setSky(true);
    this.toHangar();
    this.root.classList.remove('hidden');
  }

  close() {
    this.stopAudio();
    if (document.pointerLockElement) document.exitPointerLock();
    this.active = false; this.mode = 'off';
    this.root.classList.add('hidden');
    this.setSky(false);
    this.onExit?.();
  }

  setSky(on) {
    const gl = this.r.gl; gl.useProgram(this.r.prog);
    this.r.fogColor = on ? [...FOG] : [0.86, 0.89, 0.93];
    gl.uniform3fv(this.r.u.uFogColor, this.r.fogColor);
    gl.uniform3fv(this.r.u.uSkyTop, on ? SKY : [0.48, 0.64, 0.86]);
  }

  // ---------------------------------------------------------------- input (its own, so the FPS game never sees it)
  listen() {
    const game = (e) => this.active && (this.mode === 'fly' || this.mode === 'end' || this.mode === 'pause' || this.mode === 'hangar');
    addEventListener('keydown', (e) => {
      if (!game(e)) return;
      e.stopImmediatePropagation();
      if (this.mode === 'fly' && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.hitKeys.add(e.code);
      this.keys.add(e.code);
      if (this.mode === 'hangar' && e.code === 'Escape') this.close();
      if (this.mode === 'hangar' && e.code === 'Enter') this.deploy();
    }, true);
    addEventListener('keyup', (e) => { this.keys.delete(e.code); if (this.active) e.stopImmediatePropagation(); }, true);
    addEventListener('blur', () => { this.keys.clear(); this.btn.clear(); });
    addEventListener('mousedown', (e) => {
      if (!this.active || e.target !== this.canvas) return;
      e.stopImmediatePropagation();
      if (this.mode === 'fly' && !this.locked) { this.lock(); return; }
      this.btn.add(e.button); this.clk.add(e.button);
      if (this.mode === 'hangar') this.drag = e.clientX;
    }, true);
    addEventListener('mouseup', (e) => { this.btn.delete(e.button); this.drag = null; if (this.active) e.stopImmediatePropagation(); }, true);
    addEventListener('mousemove', (e) => {
      if (!this.active) return;
      if (this.locked) {
        if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
        this.mx += e.movementX; this.my += e.movementY;
      } else if (this.drag != null) { this.cam.dyaw -= (e.clientX - this.drag) * 0.008; this.drag = e.clientX; }
      e.stopImmediatePropagation();
    }, true);
    addEventListener('wheel', (e) => { if (this.active) { e.stopImmediatePropagation(); if (this.mode === 'hangar') this.cam.zoom = clamp((this.cam.zoom || 1) * (e.deltaY > 0 ? 1.1 : 0.9), 0.6, 1.6); } }, { capture: true, passive: true });
    addEventListener('contextmenu', (e) => { if (this.active && e.target === this.canvas) e.preventDefault(); }, true);
    document.addEventListener('pointerlockchange', (e) => {
      if (!this.active) return;
      e.stopImmediatePropagation();
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked && this.mode === 'fly' && this.started) this.pause(true);
      this.$('click').classList.toggle('hidden', this.locked || this.mode !== 'fly');
    }, true);
  }
  lock() { try { const p = this.canvas.requestPointerLock?.(); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ } }
  key(c) { return this.keys.has(c); }
  hit(c) { return this.hitKeys.has(c); }

  // ---------------------------------------------------------------- the DOM
  $(id) { return this.root.querySelector(`[data-da="${id}"]`); }
  ui() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.append(st);
    const root = document.createElement('div');
    root.id = 'da-root'; root.className = 'hidden';
    root.innerHTML = `
      <div class="da-hangar" data-da="hangar">
        <div class="da-title"><b>DEAD AIR</b><span>HANGAR · UPGRADE YOUR CHOPPER</span></div>
        <div class="da-scrap" data-da="scrap"></div>
        <div class="da-slots" data-da="slots"></div>
        <div class="da-tiers" data-da="tiers"></div>
        <div class="da-stats" data-da="stats"></div>
        <div class="da-opts" data-da="opts"></div>
        <div class="da-keys"><b>FLYING</b><br><kbd>W</kbd><kbd>S</kbd> UP / DOWN · <kbd>A</kbd><kbd>D</kbd> TURN<br><kbd>MOUSE</kbd> TILT (PITCH + ROLL) · <kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> TOO<br><kbd>CLICK</kbd> GUN · <kbd>RIGHT CLICK</kbd> ROCKETS<br><kbd>SPACE</kbd> BOMB · <kbd>SHIFT</kbd> AFTERBURNER · <kbd>C</kbd> CAMERA</div>
        <div class="da-msg" data-da="msg"></div>
        <button class="da-back" data-da="back" type="button">◀ BACK</button>
        <button class="da-deploy" data-da="deploy" type="button">DEPLOY ▶</button>
      </div>
      <div class="da-hud hidden" data-da="hud">
        <div class="da-dmg" data-da="dmg"></div>
        <div data-da="marks"></div>
        <div class="da-cross" data-da="cross"></div><div class="da-hit" data-da="hit"></div>
        <div class="da-top"><b data-da="time">10:00</b><span data-da="obj"></span></div>
        <div class="da-boss hidden" data-da="boss">THE TITAN<i></i></div>
        <div class="da-banner" data-da="banner"><b></b><span></span></div>
        <div class="da-warn hidden" data-da="warn"></div>
        <div class="da-feed" data-da="feed"></div>
        <div class="da-help" data-da="help"><kbd>W</kbd><kbd>S</kbd> UP / DOWN · <kbd>A</kbd><kbd>D</kbd> TURN · <kbd>MOUSE</kbd> TILT TO FLY<br><kbd>CLICK</kbd> GUN · <kbd>RIGHT CLICK</kbd> ROCKETS · <kbd>SPACE</kbd> BOMB · <kbd>C</kbd> CAMERA<br>LAND ON A <b style="color:#7dff9a">GREEN FLARE</b> ROOF TO PICK UP SURVIVORS · BRING THEM TO THE <b style="color:#5ab4ff">OUTPOST</b></div>
        <div class="da-left">
          <div class="da-meter" data-da="hpm" style="--c:#7dff9a">CHOPPER<i></i></div>
          <div class="da-meter" data-da="basem" style="--c:#5ab4ff">OUTPOST<i></i></div>
          <div class="da-meter" data-da="heatm" style="--c:#ffcf3a">GUN HEAT<i></i></div>
          <div class="da-meter hidden" data-da="boostm" style="--c:#8fd0ff">AFTERBURNER<i></i></div>
        </div>
        <div class="da-flight"><span data-da="alt"></span><span data-da="spd"></span></div>
        <div class="da-right" data-da="right"></div>
        <div class="da-click hidden" data-da="click">CLICK TO FLY</div>
      </div>
      <div class="da-card hidden" data-da="pause"><h2>PAUSED</h2><p>Your chopper is hovering. Zombies are waiting.</p><div class="row"><button data-da="resume" type="button">RESUME</button><button class="alt" data-da="abort" type="button">ABORT MISSION</button></div></div>
      <div class="da-card hidden" data-da="end"></div>`;
    document.body.append(root);
    this.root = root;
    this.$('back').onclick = () => { this.snd.button?.(); this.close(); };
    this.$('deploy').onclick = () => this.deploy();
    this.$('resume').onclick = () => { this.pause(false); this.lock(); };
    this.$('abort').onclick = () => { this.pause(false); this.finish(false, 'MISSION ABORTED'); };
  }

  // ---------------------------------------------------------------- hangar
  toHangar() {
    this.mode = 'hangar'; this.started = false;
    this.stopAudio();
    if (document.pointerLockElement) document.exitPointerLock();
    for (const k of ['hud', 'pause', 'end']) this.$(k).classList.add('hidden');
    this.$('hangar').classList.remove('hidden');
    this.fx.clear(); this.horde.clear();
    const H = this.heli;
    H.reset([HANGAR[0], 2.04, HANGAR[2]], 0, statsFor(this.save.eq));
    this.hst = { rotorA: 0.3, tailA: 0, rpm: 0, spin: 0, t: 0, install: this.install, riders: 0, doorAim: null };
    this.renderHangar();
  }

  renderHangar() {
    const s = this.save, el = (h) => { const d = document.createElement('div'); d.innerHTML = h; return d.firstElementChild; };
    this.$('scrap').innerHTML = `<small>SCRAP</small>⚙ ${s.scrap.toLocaleString('en-GB')}`;
    const slots = this.$('slots'); slots.replaceChildren();
    for (const sl of [...SLOTS, { id: 'paint', name: 'PAINT JOB', icon: '◆' }]) {
      const cur = sl.id === 'paint' ? PAINT[s.paint].n : sl.tiers[s.eq[sl.id]].n;
      const canBuy = sl.id !== 'paint' && s.own[sl.id] < sl.tiers.length - 1 && s.scrap >= sl.tiers[s.own[sl.id] + 1].cost;
      const b = el(`<button class="da-slot${this.sel === sl.id ? ' on' : ''}" type="button"><i>${sl.icon}</i><span><b>${sl.name}</b><small>${cur}</small></span>${canBuy ? '<em>NEW</em>' : ''}</button>`);
      b.onclick = () => { this.snd.click?.(2400, 0.2); this.sel = this.sel === sl.id ? 'all' : sl.id; this.renderHangar(); };
      slots.append(b);
    }
    const tiers = this.$('tiers'); tiers.replaceChildren();
    if (this.sel === 'paint') {
      for (const p of PAINTS) {
        if (p.dev && !this.isDev()) continue;
        const own = s.paints.includes(p.id) || p.dev, eq = s.paint === p.id;
        const sw = `<i class="sw" style="background:rgb(${p.body.map((v) => Math.round(v * 255))})"></i><i class="sw" style="background:rgb(${p.trim.map((v) => Math.round(v * 255))})"></i>`;
        const b = el(`<button class="da-tier${eq ? ' eq' : own ? '' : s.scrap >= p.cost ? ' buy' : ' poor'}" type="button"><b>${sw}${p.n}</b><p>${p.dev ? 'Dev only. Glows like root access.' : p.shark ? 'Teeth on the nose. Scary.' : p.glow ? 'Glowing stripes.' : 'A paint job.'}</p><span>${eq ? 'EQUIPPED' : own ? 'EQUIP' : `BUY ⚙ ${p.cost}`}</span></button>`);
        b.onclick = () => {
          if (!own) { if (s.scrap < p.cost) { this.snd.fail?.(); return; } s.scrap -= p.cost; s.paints.push(p.id); this.snd.coins?.(); this.flash(`${p.n} BOUGHT`); }
          s.paint = p.id; saveSave(s); this.snd.click?.(2000, 0.25); this.renderHangar();
        };
        tiers.append(b);
      }
    } else if (this.sel !== 'all') {
      const sl = SLOT[this.sel];
      sl.tiers.forEach((t, i) => {
        const own = i <= s.own[sl.id], eq = s.eq[sl.id] === i, next = i === s.own[sl.id] + 1;
        const cls = eq ? ' eq' : own ? '' : next ? s.scrap >= t.cost ? ' buy' : ' poor' : ' lock';
        const b = el(`<button class="da-tier${cls}" type="button"><b>${t.n}</b><p>${t.d}</p><span>${eq ? 'FITTED' : own ? 'FIT' : next ? `BUY ⚙ ${t.cost.toLocaleString('en-GB')}` : 'LOCKED'}</span></button>`);
        b.onclick = () => {
          if (!own) {
            if (!next) return;
            if (s.scrap < t.cost) { this.snd.fail?.(); this.flash('NOT ENOUGH SCRAP · GO ON A MISSION'); return; }
            s.scrap -= t.cost; s.own[sl.id] = i; this.snd.coins?.(); this.flash(`${t.n} INSTALLED`);
          }
          if (s.eq[sl.id] !== i) { s.eq[sl.id] = i; this.install[sl.id] = 0; this.snd.magIn?.(); setTimeout(() => this.snd.bolt?.(), 260); }
          saveSave(s); this.heli.stats = statsFor(s.eq); this.renderHangar();
        };
        tiers.append(b);
      });
    }
    const st = this.$('stats');
    st.innerHTML = `<h4>YOUR CHOPPER</h4>${bars(s.eq).map(([n, p]) => `<div class="da-bar">${n}<i style="--p:${clamp(p, 0.04, 1).toFixed(2)}"></i></div>`).join('')}<div class="da-best">BEST: ${s.best ? `${s.best.toLocaleString('en-GB')} SCRAP` : 'NO MISSIONS YET'} · MISSIONS: ${s.runs}<br>SURVIVORS SAVED: ${s.rescued} · TITANS KILLED: ${s.titans}</div>`;
    const opts = this.$('opts'); opts.replaceChildren();
    const opt = (label, val, fn) => { const b = el(`<button class="da-opt" type="button">${label}<b>${val}</b></button>`); b.onclick = () => { fn(); saveSave(s); this.snd.click?.(2000, 0.2); this.renderHangar(); }; opts.append(b); };
    opt('FLIGHT ASSIST', s.assist ? 'ON' : 'OFF', () => { s.assist = !s.assist; });
    opt('INVERT MOUSE', s.invert ? 'ON' : 'OFF', () => { s.invert = !s.invert; });
    opt('MOUSE SPEED', `${s.sens.toFixed(1)}×`, () => { s.sens = s.sens >= 2 ? 0.5 : Math.round((s.sens + 0.25) * 100) / 100; });
    const c = CAMS[this.sel] || CAMS.all;
    Object.assign(this.cam, { yawT: c[0], pitchT: c[1], distT: c[2], tgtT: c[3] });
  }
  flash(t) { const m = this.$('msg'); m.textContent = t; m.style.opacity = 1; clearTimeout(this.msgT); this.msgT = setTimeout(() => { m.style.opacity = 0; }, 1800); }

  hangarFrame(dt) {
    const c = this.cam, k = damp(4, dt);
    c.yaw += ((c.yawT ?? 0.75) + c.dyaw - c.yaw) * k;
    c.pitch += ((c.pitchT ?? 0.2) - c.pitch) * k;
    c.dist += ((c.distT ?? 20) * (c.zoom || 1) - c.dist) * k;
    for (let i = 0; i < 3; i++) c.tgt[i] += ((c.tgtT || [0, 0, 0])[i] - c.tgt[i]) * k;
    if (this.drag == null && this.sel === 'all') c.dyaw += dt * 0.12;
    for (const s of Object.keys(this.install)) { this.install[s] = Math.min(1, this.install[s] + dt * 1.6); if (this.install[s] >= 1) delete this.install[s]; }
    const H = this.heli;
    this.hst.t += dt; this.hst.rotorA += dt * 0.25; this.hst.tailA += dt * 0.6; this.hst.spin += dt * (this.sel === 'gun' ? 2 : 0.2);
    const T = H.toWorld(c.tgt);
    const cp = Math.cos(c.pitch), eye = [T[0] - Math.sin(c.yaw) * cp * c.dist, T[1] + Math.sin(c.pitch) * c.dist, T[2] - Math.cos(c.yaw) * cp * c.dist];
    eye[1] = Math.max(0.6, eye[1]);
    const fwd = norm([T[0] - eye[0], T[1] - eye[1], T[2] - eye[2]]);
    const s = this.save, st = statsFor(s.eq);
    const parts = chopperParts(s.eq, PAINT[s.paint], { ...this.hst, rockets: st.rockets, rocketMax: st.rockets, bombs: st.bombs, bombMax: st.bombs }, H.H);
    this.draw(eye, fwd, 0, parts, [], HANGAR, 0.002);
  }

  // ---------------------------------------------------------------- missions
  deploy() {
    if (this.mode !== 'hangar') return;
    this.snd.unlock?.(); this.snd.startRun?.();
    const s = this.save, S = statsFor(s.eq);
    S.rotorTier = s.eq.rotor;
    this.S = S;
    this.$('hangar').classList.add('hidden');
    this.$('hud').classList.remove('hidden');
    this.$('help').style.opacity = 1;
    this.mode = 'fly'; this.started = true;
    const pad = this.city.padAt;
    this.heli.reset([pad[0], pad[1] + 1.93, pad[2]], 0, S);
    this.fx.clear(); this.horde.clear();
    this.run = { t: 0, scrap: 0, kills: 0, rescued: 0, lost: 0, titan: false, titanDead: false, over: false, endT: 0 };
    this.hp = S.hp; this.baseHp = 1500; this.baseMax = 1500;
    this.heat = 0; this.overT = 0; this.gunT = 0; this.spinV = 0; this.flashT = 0;
    this.rockets = S.rockets; this.rocketT = 0; this.rocketRegen = 0; this.rocketSide = 0;
    this.bombs = S.bombs; this.bombT = 0;
    this.riders = 0; this.boardT = 0; this.unloadT = 0;
    this.proj = mat4();
    this.shots = []; this.tracers = []; this.blasts = []; this.fires = []; this.runners = [];
    this.doorAim = [[-Math.PI / 2, -0.3], [Math.PI / 2, -0.3]]; this.doorT = [0, 0]; this.doorTgt = [null, null]; this.doorFlash = [0, 0];
    this.spawnT = 0; this.hordeT = 90; this.roofT = 0; this.shake = 0; this.dmgT = 0; this.camMode = 0;
    this.camEye = null; this.titan = null;
    this.roofs = [];
    this.usedRoofs = new Set();
    this.newRoof(); this.newRoof();
    this.horde.baseField();
    for (let i = 0; i < 40; i++) this.spawnZombie('walker');
    this.banner('DEAD AIR', 'SAVE WHO YOU CAN · 10 MINUTES', '', 3);
    this.startAudio();
    this.lock();
  }

  newRoof() {
    const cands = this.city.roofs.filter((r) => !this.usedRoofs.has(r.box.id) && Math.hypot(r.x - BASE[0], r.z - BASE[2]) > 120 && !this.roofs.some((o) => o.active && Math.hypot(o.x - r.x, o.z - r.z) < 90));
    if (!cands.length) return;
    const r = cands[Math.floor(Math.random() * cands.length)];
    this.usedRoofs.add(r.box.id);
    const roof = { ...r, active: true, count: 3 + Math.floor(Math.random() * 4), climbers: 0, id: r.box.id, wave: Math.random() * 6 };
    roof.start = roof.count;
    this.roofs.push(roof);
    this.horde.roofField(roof);
    // a few zombies already on their way
    for (let i = 0; i < 4; i++) this.spawnZombie('walker', roof, 160);
    this.feed(`SURVIVORS SPOTTED · ${roof.count} PEOPLE`, 'g');
    this.snd.checkpoint?.();
  }

  spawnZombie(type, tgt, near) {
    const H = this.heli.pos;
    let p = null;
    for (let tries = 0; tries < 12; tries++) {
      const c = this.city.spawns[Math.floor(Math.random() * this.city.spawns.length)];
      const d = Math.hypot(c[0] - H[0], c[1] - H[2]);
      if (d < 90 && tries < 11) continue;
      if (near && tgt && Math.hypot(c[0] - tgt.x, c[1] - tgt.z) > near + 120 && tries < 11) continue;
      p = c; break;
    }
    if (!p) return null;
    return this.horde.spawn(type, p[0] + (Math.random() - 0.5) * 8, p[1] + (Math.random() - 0.5) * 8, { tgt: tgt || null });
  }

  // the spawner: more and nastier the longer it goes
  director(dt) {
    const t = this.run.t, hz = this.horde;
    const want = Math.min(300, 60 + t * 0.42);
    this.spawnT -= dt;
    if (this.spawnT <= 0 && hz.list.length < want) {
      this.spawnT = 0.12;
      const r = Math.random();
      let type = 'walker';
      if (t > 60 && r < 0.12 + t / 3000) type = 'runner';
      else if (t > 40 && r > 0.9 && hz.count('spitter') < 6 + t / 60) type = 'spitter';
      else if (t > 150 && r > 0.86 && r < 0.9 && hz.count('brute') < 2 + t / 120) type = 'brute';
      const z = this.spawnZombie(type, this.run.titan ? 'base' : null);
      if (z && this.run.titan) z.tgt = 'base';
    }
    // a big rush every so often
    this.hordeT -= dt;
    if (this.hordeT <= 0 && !this.run.titan) {
      this.hordeT = 95;
      const act = this.roofs.filter((r) => r.active && r.count > 0);
      const tgt = act.length ? act[Math.floor(Math.random() * act.length)] : 'base';
      for (let i = 0; i < 45; i++) { const z = this.spawnZombie(i % 3 ? 'runner' : 'walker', tgt === 'base' ? null : tgt, 60); if (z) z.tgt = tgt; }
      this.banner('HORDE INCOMING', tgt === 'base' ? 'THEY\'RE GOING FOR THE OUTPOST' : 'THEY\'RE GOING FOR THE SURVIVORS', 'bad', 2.4);
      this.snd.roundStart?.();
    }
    // keep survivors coming until the titan shows up
    const active = this.roofs.filter((r) => r.active).length;
    if (!this.run.titan && active < (t > 200 ? 3 : 2)) { this.roofT -= dt; if (this.roofT <= 0) { this.roofT = 12; this.newRoof(); } }
    if (!this.run.titan && t >= PHASE2) {
      this.run.titan = true;
      this.titan = this.horde.spawn('titan', 0, -HALF + 4, { tgt: 'base' });
      for (const r of this.roofs) if (r.active && r.count > 0) r.last = true;
      this.banner('THE TITAN IS COMING', 'IT\'S HEADING FOR THE OUTPOST · STOP IT', 'bad', 3.4);
      this.snd.alarm?.();
      for (const z of hz.list) if (Math.random() < 0.6) z.tgt = 'base';
    }
  }

  // ---------------------------------------------------------------- the frame
  frame(dt) {
    this.t += dt;
    if (this.mode === 'hangar') this.hangarFrame(dt);
    else if (this.mode === 'fly' || this.mode === 'end' || this.mode === 'pause') this.flyFrame(this.mode === 'pause' ? 0 : dt);
    this.hitKeys.clear(); this.clk.clear(); this.mx = 0; this.my = 0;
  }

  flyFrame(dt) {
    const H = this.heli, S = this.S, run = this.run;
    const live = this.mode === 'fly' && !run.over;
    if (dt > 0) {
      if (live) run.t += dt;
      // controls
      const k = (c) => this.key(c) ? 1 : 0;
      const ctl = {
        coll: live && !H.dead ? k('KeyW') - k('KeyS') : 0, yaw: live ? k('KeyA') - k('KeyD') : 0,
        mx: live && this.locked ? this.mx : 0, my: live && this.locked ? this.my : 0,
        pk: live ? k('ArrowUp') - k('ArrowDown') : 0, rk: live ? k('ArrowRight') - k('ArrowLeft') : 0,
        boost: live && (this.key('ShiftLeft') || this.key('ShiftRight')), assist: this.save.assist, sens: this.save.sens, invert: this.save.invert,
        engineOn: !run.over || this.hp > 0,
      };
      const grabbers = this.horde.list.filter((z) => z.alive && z.st === 'grab').length;
      H.extraMass = grabbers * 0.07;
      H.step(dt, ctl, this.world);
      // the edge of the map: a soft wall that pushes you back, and a height limit
      const lim = [[-HALF - 110, HALF + 110], [-HALF - 110, BASE[2] + 110]];
      this.outT = 0;
      for (const [ax, [lo, hi]] of [[0, lim[0]], [2, lim[1]]]) {
        const p = H.pos[ax];
        if (p < lo) { H.vel[ax] += (lo - p) * 4 * dt; this.outT = 1; }
        if (p > hi) { H.vel[ax] -= (p - hi) * 4 * dt; this.outT = 1; }
      }
      if (H.pos[1] > 180) { H.vel[1] -= (H.pos[1] - 180) * 3 * dt; this.outT = 1; }
      for (const ev of H.events) {
        if (ev.type === 'impact') { this.hurt(ev.speed * (ev.hard ? 14 : 9), ev.point); this.fx.sparks(ev.point, 12, [1, 0.8, 0.4], 7, 0.5, 0.05, 2); this.snd.meleeWall?.('smash'); this.shake = Math.max(this.shake, 0.5); }
        else if (ev.type === 'rotor') { this.rotorHitT = (this.rotorHitT || 0) - dt; if (this.rotorHitT <= 0) { this.rotorHitT = 0.15; this.hurt(14, ev.point); this.fx.sparks(ev.point, 10, [1, 0.85, 0.5], 9, 0.4, 0.04, 1); this.snd.click?.(3600, 0.4, 3); this.shake = Math.max(this.shake, 0.4); } }
      }
      H.events.length = 0;
      if (H.dead && !run.over && (H.contacts || H.pos[1] < 1)) this.crash();
      if (live && !H.dead) this.weapons(dt);
      this.doorGuns(dt);
      this.turrets(dt);
      this.updateShots(dt);
      if (live) { this.director(dt); this.landing(dt); }
      const aglHit = this.world.raycast([H.pos[0], H.pos[1] - 2, H.pos[2]], [0, -1, 0], 300);
      this.agl = aglHit ? aglHit.t : 300;
      this.horde.update(dt, { heli: H, heliAlt: this.agl, roofs: this.roofs, phase2: run.titan });
      this.hordeEvents();
      this.ambient(dt);
      this.fx.update(dt);
      if (live && run.t >= LEN) this.finish(true, 'EVAC COMPLETE');
      if (live && run.winAt && run.t >= run.winAt) this.finish(true, 'THE TITAN IS DEAD');
      if (run.over) { run.endT += dt; if (run.endT > 3 && !this.endShown) this.showEnd(); }
    }
    this.camera(dt);
    this.hud(dt);
    this.audio();
  }

  hurt(dmg, at) {
    if (this.heli.dead || this.run.over && this.hp <= 0) return;
    this.hp -= dmg; this.dmgT = Math.min(1, this.dmgT + dmg / 60);
    this.shake = Math.max(this.shake, Math.min(0.8, dmg / 60));
    this.snd.hurt?.();
    if (this.hp <= 0) {
      this.hp = 0; this.heli.dead = true;
      this.banner('YOU\'RE GOING DOWN', 'MAYDAY · MAYDAY', 'bad', 3);
      this.snd.alarm?.();
    }
  }

  crash() {
    const p = this.heli.pos;
    this.boom(p, 3);
    for (let i = 0; i < 30; i++) this.fx.flame([p[0] + (Math.random() - 0.5) * 6, p[1], p[2] + (Math.random() - 0.5) * 6], [0, 2, 0], 4);
    this.heli.vel = [0, 0, 0]; this.heli.rpm = 0;
    this.finish(false, 'SHOT DOWN');
  }

  // where the gun points (and the crosshair): a little down from straight ahead
  bore() {
    const H = this.heli, a = 0.13;
    const d = qrot(H.q, [0, -Math.sin(a), -Math.cos(a)]);
    const o = H.toWorld([0, -1.05, -5.0]);
    return { o, d };
  }
  aimPoint() {
    const { o, d } = this.bore();
    const w = this.world.raycast(o, d, 400);
    const tw = w ? w.t : 400;
    const z = this.horde.hitRay(o, d, tw);
    const t = z ? z.t : tw;
    return { p: [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t], t, z: z && z.z };
  }

  weapons(dt) {
    const H = this.heli, S = this.S, G = S.gun;
    const firing = (this.btn.has(0) || this.clk.has(0) || this.key('KeyF')) && this.locked;
    this.overT = Math.max(0, this.overT - dt);
    if (firing && this.overT <= 0) {
      this.spinV = Math.min(1, this.spinV + dt * 4);
      this.gunT += dt * G.rate * (G.spin ? 0.35 + this.spinV * 0.65 : 1);
      while (this.gunT >= 1) {
        this.gunT -= 1;
        this.fireGun();
        this.heat += G.heat;
        if (this.heat >= 1) { this.heat = 1; this.overT = 2.2; this.feed('GUN OVERHEATED', 'r'); this.snd.fail?.(); break; }
      }
    } else { this.gunT = Math.min(this.gunT, 0.99); this.spinV = Math.max(0, this.spinV - dt * 1.5); this.heat = Math.max(0, this.heat - G.cool * dt * (this.overT > 0 ? 0.8 : 1)); }
    this.flashT = Math.max(0, this.flashT - dt);
    // rockets
    this.rocketT -= dt;
    if (S.rockets) {
      this.rocketRegen += dt;
      if (this.rocketRegen > 8 && this.rockets < S.rockets) { this.rocketRegen = 0; this.rockets++; }
      if ((this.btn.has(2) || this.clk.has(2) || this.key('KeyR')) && this.locked && this.rocketT <= 0 && this.rockets > 0) {
        this.rocketT = S.homing ? 0.42 : 0.24; this.rockets--; this.rocketRegen = 0;
        this.fireRocket();
      }
    } else if (this.clk.has(2)) this.feed('NO ROCKETS FITTED · BUY THEM IN THE HANGAR', 'y');
    // bombs
    this.bombT -= dt;
    if (this.hit('Space')) {
      if (!S.bombs) this.feed('NO BOMBS FITTED · BUY THEM IN THE HANGAR', 'y');
      else if (this.bombs > 0 && this.bombT <= 0) {
        this.bombT = 0.5; this.bombs--;
        const p = H.toWorld([0, -1.9, 0.4]);
        this.shots.push({ kind: 'bomb', pos: p, vel: [H.vel[0], H.vel[1] - 2, H.vel[2]], life: 12, t: 0, cluster: S.cluster, rot: qrot(H.q, [0, 0, -1]) });
        this.snd.grappleRelease?.();
      } else if (this.bombs <= 0) this.feed('OUT OF BOMBS · LAND AT THE OUTPOST', 'y');
    }
    if (this.hit('KeyC')) this.camMode = (this.camMode + 1) % 3;
  }

  fireGun() {
    const H = this.heli, G = this.S.gun;
    const { d } = this.bore();
    const xs = G.barrels === 2 ? [this.gunSide = -(this.gunSide || 1)] : [0];
    const o = H.toWorld([xs[0] * 0.42, -1.05, -5.1]);
    const sp = G.spread;
    const dir = norm([d[0] + (Math.random() - 0.5) * sp * 2, d[1] + (Math.random() - 0.5) * sp * 2, d[2] + (Math.random() - 0.5) * sp * 2]);
    this.flashT = 0.04;
    if (G.plasma) {
      this.shots.push({ kind: 'plasma', pos: o, vel: [H.vel[0] + dir[0] * 260, H.vel[1] + dir[1] * 260, H.vel[2] + dir[2] * 260], life: 2 });
      this.snd.tone?.(900, 200, 0.18, 0.12, 'sawtooth');
      return;
    }
    const w = this.world.raycast(o, dir, 420);
    const tw = w ? w.t : 420;
    const zh = this.horde.hitRay(o, dir, tw);
    const t = zh ? zh.t : tw, p = [o[0] + dir[0] * t, o[1] + dir[1] * t, o[2] + dir[2] * t];
    if (Math.random() < 0.6) this.tracers.push({ from: o, dir, len: t, d: 0 });
    if (zh) this.hitZombie(zh.z, G.dmg, [dir[0] * 6, 2, dir[2] * 6], p, 'gun');
    else if (w) {
      this.fx.impact(p, w.normal, w.box.color);
      if (Math.random() < 0.3) this.fx.dust(p, 2);
    }
    this.sndN = (this.sndN || 0) + 1;
    if (G.rate < 20 || this.sndN % 2 === 0) { this.snd.burst?.(0.06, 1500, 0.22); this.snd.burst?.(0.03, 5000, 0.08, 'highpass'); }
  }

  hitZombie(z, dmg, push, at, cause) {
    const killed = this.horde.damage(z, dmg, push, cause);
    this.fx.spawnPiece(at, [0.08, 0.08, 0.08], [push[0] * 0.2 + (Math.random() - 0.5) * 3, 2 + Math.random() * 2, push[2] * 0.2 + (Math.random() - 0.5) * 3], [0.35, 0.05, 0.04], 0.7);
    this.hitMark(killed);
    return killed;
  }
  hitMark(kill) { const h = this.$('hit'); h.classList.toggle('kill', !!kill); h.style.opacity = 1; this.hitT = kill ? 0.25 : 0.1; }

  fireRocket() {
    const H = this.heli, S = this.S;
    this.rocketSide = 1 - this.rocketSide;
    const x = (this.rocketSide ? 1 : -1) * (this.save.eq.rockets === 2 ? (this.rockets % 4 < 2 ? 1.35 : 2.15) : this.save.eq.rockets === 3 ? 1.8 : 1.75);
    const o = H.toWorld([x, -0.66, -0.7]);
    const aim = this.aimPoint();
    const dir = norm([aim.p[0] - o[0], aim.p[1] - o[1], aim.p[2] - o[2]]);
    let target = null;
    if (S.homing) {
      // the biggest zombie close to where you're aiming
      const { d } = this.bore();
      let best = 0;
      for (const z of this.horde.list) {
        if (!z.alive) continue;
        const v = [z.x - o[0], z.y + z.s - o[1], z.z - o[2]], l = Math.hypot(v[0], v[1], v[2]);
        if (l > 320) continue;
        const cs = (v[0] * d[0] + v[1] * d[1] + v[2] * d[2]) / l;
        if (cs < 0.96) continue;
        const sc = cs * 10 + z.s * 3 + (z.type === 'titan' ? 50 : 0) - l * 0.01;
        if (sc > best) { best = sc; target = z; }
      }
    }
    const sp = 120;
    this.shots.push({ kind: 'rocket', pos: o, vel: [H.vel[0] + dir[0] * sp, H.vel[1] + dir[1] * sp, H.vel[2] + dir[2] * sp], life: 4, target, homing: S.homing });
    this.snd.launch?.();
  }

  boom(p, size = 1) {
    this.blasts.push({ pos: [...p], t: 0, size });
    this.fx.sparks(p, 18 * size, [1, 0.6, 0.15], 14 * Math.sqrt(size), 0.7, 0.12, 3);
    for (let i = 0; i < 10 * size; i++) this.fx.flame([p[0] + (Math.random() - 0.5) * 2 * size, p[1] + Math.random(), p[2] + (Math.random() - 0.5) * 2 * size], [(Math.random() - 0.5) * 6, 3, (Math.random() - 0.5) * 6], 3 * size);
    for (let i = 0; i < 8 * size; i++) {
      const s = 0.4 + Math.random() * 0.8 * size;
      this.fx.spawnPiece([p[0] + (Math.random() - 0.5) * 2, p[1] + 0.5, p[2] + (Math.random() - 0.5) * 2], [s, s, s], [(Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4], [0.22, 0.2, 0.19], 2 + Math.random() * 2);
      const d = this.fx.debris[this.fx.debris.length - 1]; d.grav = -0.08; d.noShadow = true;
    }
    const dc = Math.hypot(p[0] - this.camEye?.[0], p[1] - this.camEye?.[1], p[2] - this.camEye?.[2]);
    this.snd.boom?.(Math.min(1.2, size * 0.8 * (dc < 80 ? 1 : 80 / dc)));
    this.shake = Math.max(this.shake, clamp(size * 18 / (dc || 1), 0, 0.9));
  }

  updateShots(dt) {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.life -= dt;
      const prev = [...s.pos];
      if (s.kind === 'rocket') {
        if (s.homing && s.target && s.target.alive) {
          const tz = s.target, v = norm([tz.x - s.pos[0], tz.y + tz.s - s.pos[1], tz.z - s.pos[2]]), sp = Math.hypot(...s.vel);
          const cur = norm(s.vel), k = Math.min(1, dt * 3.2);
          s.vel = norm(cur.map((c, j) => c + (v[j] - c) * k)).map((c) => c * Math.min(160, sp + dt * 40));
        }
        s.vel[1] -= 2 * dt;
        if (Math.random() < 0.8) { this.fx.spawnPiece(s.pos, [0.35, 0.35, 0.35], [0, 0.4, 0], [0.55, 0.55, 0.55], 1.1); const d = this.fx.debris[this.fx.debris.length - 1]; d.noGravity = true; }
        this.fx.flame(s.pos, [0, 0, 0], 1.6);
      } else if (s.kind === 'bomb') {
        s.vel[1] -= 9.8 * dt; s.t += dt;
        if (s.cluster && s.t > 0.6) {
          for (let j = 0; j < 6; j++) { const a = (j / 6) * Math.PI * 2; this.shots.push({ kind: 'bomblet', pos: [...s.pos], vel: [s.vel[0] + Math.cos(a) * 7, s.vel[1], s.vel[2] + Math.sin(a) * 7], life: 10 }); }
          this.fx.sparks(s.pos, 10, [1, 0.8, 0.3], 5, 0.4, 0.06, 0);
          this.snd.click?.(1800, 0.4, 2);
          this.shots.splice(i, 1); continue;
        }
      } else if (s.kind === 'bomblet') s.vel[1] -= 9.8 * dt;
      else if (s.kind === 'plasma') { if (Math.random() < 0.7) { this.fx.spawnPiece(s.pos, [0.25, 0.25, 0.25], [0, 0, 0], [0.4, 0.9, 1], 0.25, 1); this.fx.debris[this.fx.debris.length - 1].noGravity = true; } }
      for (let k = 0; k < 3; k++) s.pos[k] += s.vel[k] * dt;
      // what did it hit (sweep from last frame)
      const d = [s.pos[0] - prev[0], s.pos[1] - prev[1], s.pos[2] - prev[2]], dl = Math.hypot(d[0], d[1], d[2]) || 1e-6;
      const dir = d.map((v) => v / dl);
      const w = this.world.raycast(prev, dir, dl);
      const zh = this.horde.hitRay(prev, dir, w ? w.t : dl);
      if (!w && !zh && s.life > 0) continue;
      const t = zh ? zh.t : w ? w.t : 0, p = w || zh ? [prev[0] + dir[0] * t, prev[1] + dir[1] * t, prev[2] + dir[2] * t] : s.pos;
      this.explode(s, p, zh && zh.z);
      this.shots.splice(i, 1);
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) { const t = this.tracers[i]; t.d += dt * 700; if (t.d > t.len) this.tracers.splice(i, 1); }
    for (let i = this.blasts.length - 1; i >= 0; i--) { const b = this.blasts[i]; b.t += dt; if (b.t > 0.5) this.blasts.splice(i, 1); }
    // fires left by fire bombs
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t -= dt; f.tick -= dt;
      if (f.t <= 0) { this.fires.splice(i, 1); continue; }
      for (let j = 0; j < 3; j++) { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * f.r; this.fx.flame([f.pos[0] + Math.cos(a) * r, f.pos[1] + 0.2, f.pos[2] + Math.sin(a) * r], [0, 1.5, 0], 3.2); }
      if (f.tick <= 0) {
        f.tick = 0.25;
        for (const z of this.horde.list) if (z.alive && z.st !== 'grab' && Math.hypot(z.x - f.pos[0], z.z - f.pos[2]) < f.r && Math.abs(z.y - f.pos[1]) < 4) { if (this.horde.damage(z, z.type === 'titan' ? 60 : 22, [0, 3, 0], 'fire')) this.hitMark(true); }
      }
    }
  }

  explode(s, p, z) {
    const S = this.S;
    if (s.kind === 'plasma') {
      const n = this.horde.blast(p, S.gun.splash, S.gun.dmg, 8, 'gun');
      if (z) this.hitZombie(z, S.gun.dmg, [s.vel[0] * 0.03, 3, s.vel[2] * 0.03], p, 'gun');
      this.fx.sparks(p, 12, [0.5, 0.95, 1], 7, 0.4, 0.07, 1);
      this.blasts.push({ pos: p, t: 0.25, size: 0.5, col: [0.5, 0.95, 1] });
      if (n) this.hitMark(true);
      return;
    }
    if (s.kind === 'rocket') { const n = this.horde.blast(p, S.rocketR, S.rocketDmg, 16, 'rocket'); this.boom(p, 1.2); if (n) this.hitMark(true); return; }
    if (s.kind === 'bomb') {
      const n = this.horde.blast(p, 10, 420, 18, 'bomb'); this.boom(p, 2.2);
      this.fires.push({ pos: p, r: 9, t: 8, tick: 0 });
      if (n) this.hitMark(true); return;
    }
    if (s.kind === 'bomblet') { const n = this.horde.blast(p, 7, 320, 15, 'bomb'); this.boom(p, 1.3); this.fires.push({ pos: p, r: 5, t: 5, tick: 0 }); if (n) this.hitMark(true); }
  }

  // door gunners: grab-ers first, then whatever's close on their side
  doorGuns(dt) {
    const H = this.heli, n = this.S.gunners;
    for (let sd = 0; sd < n; sd++) {
      const side = sd === 0 ? 1 : -1;
      this.doorFlash[sd] = Math.max(0, this.doorFlash[sd] - dt);
      this.doorT[sd] -= dt;
      let tg = this.doorTgt[sd];
      if (!tg || !tg.alive || this.doorT[sd] < -0.6) {
        tg = null; let best = 75;
        for (const z of this.horde.list) {
          if (!z.alive) continue;
          const v = [z.x - H.pos[0], z.y + z.s - H.pos[1], z.z - H.pos[2]];
          const l = Math.hypot(v[0], v[1], v[2]);
          const lx = qrot([-H.q[0], -H.q[1], -H.q[2], H.q[3]], v)[0];
          if (lx * side < 0.5 && z.st !== 'grab') continue;
          const sc = z.st === 'grab' ? 0 : l - (z.st === 'climb' ? 25 : 0) - (z.type === 'spitter' ? 15 : 0);
          if (sc < best) { best = sc; tg = z; }
        }
        this.doorTgt[sd] = tg; this.doorT[sd] = 0;
      }
      if (!tg || H.dead || this.run.over) continue;
      // aim in the helicopter's frame
      const mp = H.toWorld([side * 1.25, 0.1, 0.6]);
      const v = [tg.x - mp[0], tg.y + tg.s * 1.1 - mp[1], tg.z - mp[2]];
      const lv = qrot([-H.q[0], -H.q[1], -H.q[2], H.q[3]], v), ll = Math.hypot(...lv);
      const yaw = Math.atan2(-lv[0], -lv[2]), pitch = Math.asin(clamp(lv[1] / ll, -1, 1));
      const a = this.doorAim[sd];
      a[0] += Math.atan2(Math.sin(yaw - a[0]), Math.cos(yaw - a[0])) * Math.min(1, dt * 8); a[1] += (clamp(pitch, -1.3, 0.5) - a[1]) * Math.min(1, dt * 8);
      if (this.doorT[sd] <= -0.11) {
        this.doorT[sd] = 0;
        const dl = qrot(H.q, [-Math.sin(a[0]) * Math.cos(a[1]), Math.sin(a[1]), -Math.cos(a[0]) * Math.cos(a[1])]);
        const o = H.toWorld([side * 1.25, 0.1, 0.6]).map((c, i) => c + dl[i] * 1.5);
        const dir = norm([dl[0] + (Math.random() - 0.5) * 0.05, dl[1] + (Math.random() - 0.5) * 0.05, dl[2] + (Math.random() - 0.5) * 0.05]);
        const w = this.world.raycast(o, dir, 160), tw = w ? w.t : 160;
        const zh = this.horde.hitRay(o, dir, tw);
        const t = zh ? zh.t : tw;
        this.tracers.push({ from: o, dir, len: t, d: 0 });
        this.doorFlash[sd] = 0.05;
        if (zh) { const k = this.horde.damage(zh.z, 24, [dir[0] * 5, 2, dir[2] * 5], 'door'); if (k) this.feedKill(zh.z, 'DOOR GUNNER'); }
        else if (w) this.fx.impact(o.map((c, i) => c + dir[i] * t), w.normal, w.box.color);
        this.snd.burst?.(0.05, 1200, 0.12);
      }
    }
  }

  turrets(dt) {
    for (const tu of this.city.turrets) {
      tu.flash = Math.max(0, tu.flash - dt);
      tu.cd -= dt;
      if (this.run.over) continue;
      let tg = null, best = 80;
      for (const z of this.horde.list) { if (!z.alive || z.st === 'grab') continue; const d = Math.hypot(z.x - tu.pos[0], z.z - tu.pos[2]); if (d < best) { best = d; tg = z; } }
      if (!tg) continue;
      const want = Math.atan2(-(tg.x - tu.pos[0]), -(tg.z - tu.pos[2]));
      tu.yaw += Math.atan2(Math.sin(want - tu.yaw), Math.cos(want - tu.yaw)) * Math.min(1, dt * 5);
      if (tu.cd <= 0) {
        tu.cd = 0.16;
        const o = [tu.pos[0] - Math.sin(tu.yaw) * 1.4, tu.pos[1], tu.pos[2] - Math.cos(tu.yaw) * 1.4];
        const dir = norm([tg.x - o[0] + (Math.random() - 0.5), tg.y + tg.s - o[1], tg.z - o[2] + (Math.random() - 0.5)]);
        const zh = this.horde.hitRay(o, dir, 100);
        this.tracers.push({ from: o, dir, len: zh ? zh.t : best, d: 0 });
        tu.flash = 0.05;
        if (zh) this.horde.damage(zh.z, 15, [dir[0] * 4, 2, dir[2] * 4], 'turret');
      }
    }
  }

  // landing on a survivor roof loads them; on the helipad unloads, repairs and rearms
  landing(dt) {
    const H = this.heli, S = this.S, P = this.city.pad;
    const settled = H.contacts >= 3 && Math.hypot(...H.vel) < 3 && !H.dead;
    const over = (b) => H.pos[0] > b.min[0] - 0.5 && H.pos[0] < b.max[0] + 0.5 && H.pos[2] > b.min[2] - 0.5 && H.pos[2] < b.max[2] + 0.5 && Math.abs(H.pos[1] - 1.92 - b.max[1]) < 1.3;
    this.onPad = settled && over(P);
    this.onRoof = null;
    for (const r of this.roofs) if (r.active && settled && over(r.box)) this.onRoof = r;
    // boarding
    if (this.onRoof && this.onRoof.count > 0) {
      this.boardT -= dt;
      if (this.riders >= S.seats) { if (!this.fullT || this.run.t - this.fullT > 4) { this.fullT = this.run.t; this.feed('CABIN FULL · FLY TO THE OUTPOST', 'y'); } }
      else if (this.boardT <= 0) {
        this.boardT = 0.45;
        const r = this.onRoof; r.count--; this.riders++;
        const ang = (r.start - r.count) * 2.1 + r.wave, from = [r.x + Math.cos(ang) * 2.4, r.top, r.z + Math.sin(ang) * 2.4];
        this.runners.push({ from, to: H.toWorld([1.3, -1.5, 0.7]), t: 0 });
        this.snd.step?.(1);
        if (r.count <= 0) { r.active = false; this.feed('ROOF CLEARED · EVERYONE\'S ON BOARD', 'g'); this.snd.checkpoint?.(); }
      }
    }
    // unloading, repairs and rearming
    if (this.onPad) {
      this.unloadT -= dt;
      if (this.riders > 0 && this.unloadT <= 0) {
        this.unloadT = 0.3; this.riders--; this.run.rescued++; this.addScrap(25);
        this.runners.push({ from: H.toWorld([1.3, -1.5, 0.7]), to: [BASE[0] + 30, 0.5, BASE[2] + 28], t: 0 });
        this.snd.coins?.();
        if (this.riders === 0) this.feed(`SURVIVORS SAFE · ${this.run.rescued} SAVED`, 'g');
      }
      const before = this.hp;
      this.hp = Math.min(S.hp, this.hp + 90 * dt);
      if (this.hp > before && !this.repT) { this.repT = true; this.feed('REPAIRING · REARMING', 'g'); }
      this.rocketRegen += dt * 6; if (this.rocketRegen > 8 && this.rockets < S.rockets) { this.rocketRegen = 0; this.rockets++; }
      this.bombT2 = (this.bombT2 || 0) + dt; if (this.bombT2 > 1 && this.bombs < S.bombs) { this.bombT2 = 0; this.bombs++; }
      this.heat = Math.max(0, this.heat - dt);
    } else this.repT = false;
    for (let i = this.runners.length - 1; i >= 0; i--) { const r = this.runners[i]; r.t += dt * 1.6; if (r.t >= 1) this.runners.splice(i, 1); }
  }

  addScrap(n) { this.run.scrap += n; }
  feed(t, c = '') {
    const f = this.$('feed'), d = document.createElement('div');
    d.textContent = t; d.className = c; f.prepend(d);
    while (f.children.length > 6) f.lastChild.remove();
    setTimeout(() => d.remove(), 2500);
  }
  feedKill(z, by) {
    if (z.type === 'brute') this.feed(`BRUTE DOWN${by ? ` · ${by}` : ''} · +${TYPES.brute.scrap}`, 'y');
  }

  hordeEvents() {
    const H = this.heli, run = this.run;
    for (const ev of this.horde.events) {
      if (ev.type === 'kill') {
        run.kills++;
        const T = TYPES[ev.z.type];
        this.addScrap(T.scrap);
        if (ev.z.type === 'brute') this.feed(`BRUTE DOWN · +${T.scrap}`, 'y');
        if (ev.z.type === 'spitter') this.feed(`SPITTER DOWN · +${T.scrap}`, 'y');
        if (ev.z.type === 'titan') {
          run.titanDead = true;
          const p = [ev.z.x, 8, ev.z.z];
          for (let i = 0; i < 6; i++) setTimeout(() => this.boom([p[0] + (Math.random() - 0.5) * 16, 2 + Math.random() * 14, p[2] + (Math.random() - 0.5) * 16], 2.5), i * 220);
          this.banner('TITAN DOWN', `+${T.scrap} SCRAP · THE CITY HOLDS`, 'good', 3.5);
          this.snd.finish?.();
          run.winAt = run.t + 5;
        }
        if (Math.random() < 0.08) this.snd.groan?.(30);
      } else if (ev.type === 'eaten') {
        run.lost++;
        this.feed('A SURVIVOR WAS GRABBED', 'r');
        if (ev.roof.count <= 0) { ev.roof.active = false; this.banner('SURVIVORS LOST', 'THE ZOMBIES GOT TO THEM FIRST', 'bad', 2); this.snd.fail?.(); }
      } else if (ev.type === 'hitHeli') {
        this.hurt(ev.shot.dmg, ev.shot.pos);
        if (ev.shot.kind === 'glob') this.fx.sparks(ev.shot.pos, 14, [0.4, 1, 0.2], 5, 0.6, 0.08, 1);
        else this.fx.sparks(ev.shot.pos, 14, [0.6, 0.55, 0.5], 6, 0.8, 0.2, 2), this.snd.meleeWall?.('smash');
        this.feed(ev.shot.kind === 'glob' ? 'ACID HIT' : ev.shot.kind === 'car' ? 'THE TITAN THREW A CAR AT YOU' : 'HIT BY RUBBLE', 'r');
      } else if (ev.type === 'claw') this.hurt(ev.dmg, H.pos);
      else if (ev.type === 'grab') { this.feed('ZOMBIE ON THE SKIDS · ROLL AND TURN TO SHAKE IT OFF', 'r'); this.snd.grab?.(); }
      else if (ev.type === 'shook') this.snd.grappleRelease?.();
      else if (ev.type === 'baseHit') {
        this.baseHp -= ev.dmg;
        if (!this.baseWarnT || run.t - this.baseWarnT > 8) { this.baseWarnT = run.t; this.feed('THE OUTPOST IS UNDER ATTACK', 'r'); this.snd.alarm?.(); }
        if (this.baseHp <= 0 && !run.over) { this.baseHp = 0; this.finish(false, 'THE OUTPOST FELL'); }
      } else if (ev.type === 'spit') { if (Math.hypot(ev.z.x - H.pos[0], ev.z.z - H.pos[2]) < 60) this.snd.tone?.(500, 180, 0.2, 0.06, 'sawtooth'); }
      else if (ev.type === 'throw' && ev.big) this.snd.slam?.(0.6);
      else if (ev.type === 'stomp') { const d = Math.hypot(ev.z.x - H.pos[0], ev.z.z - H.pos[2]); if (d < 120) { this.shake = Math.max(this.shake, 0.4 * (1 - d / 120)); this.snd.boom?.(0.4 * (1 - d / 120)); this.fx.dust([ev.z.x, 0.3, ev.z.z], 10); } }
    }
    this.horde.events.length = 0;
  }

  // fire on burning cars, flares on the roofs, smoke when you're hurt
  ambient(dt) {
    const H = this.heli, ce = this.camEye || H.pos;
    this.ambT = (this.ambT || 0) + dt;
    if (this.ambT > 0.06) {
      this.ambT = 0;
      for (const b of this.city.burning) {
        if (Math.abs(b[0] - ce[0]) > 220 || Math.abs(b[2] - ce[2]) > 220) continue;
        this.fx.flame([b[0] + (Math.random() - 0.5) * 1.5, b[1], b[2] + (Math.random() - 0.5) * 3], [0, 1, 0], 3);
        if (Math.random() < 0.3) { this.fx.spawnPiece([b[0], b[1] + 1.5, b[2]], [1.1, 1.1, 1.1], [(Math.random() - 0.5), 1.5, (Math.random() - 0.5)], [0.12, 0.11, 0.1], 3.5); const d = this.fx.debris[this.fx.debris.length - 1]; d.grav = -0.04; }
      }
      const hpk = this.hp / this.S.hp;
      if (hpk < 0.5 && !this.run.over) {
        const p = H.toWorld([0, 1.5, 1.8]);
        this.fx.spawnPiece(p, [0.6, 0.6, 0.6], [H.vel[0] * 0.3, 1.5, H.vel[2] * 0.3], hpk < 0.25 ? [0.08, 0.08, 0.08] : [0.3, 0.3, 0.3], 1.6);
        this.fx.debris[this.fx.debris.length - 1].grav = -0.05;
        if (hpk < 0.25) this.fx.flame(p, [0, 1, 0], 2.4);
      }
      for (const r of this.roofs) if (r.active && r.count > 0) this.fx.sparks([r.x + 3, r.top + 0.6, r.z + 3], 1, [0.3, 1, 0.3], 1.5, 0.8, 0.12, 4);
    }
    // the afterburner
    if (H.boost > 0.2) for (const x of [-1, 1]) { const p = H.toWorld([x, 1.32, 3]); this.fx.spawnPiece(p, [0.3, 0.3, 0.3], [0, 0, 0], [0.5, 0.75, 1], 0.2, 1); this.fx.debris[this.fx.debris.length - 1].noGravity = true; }
    this.shake = Math.max(0, this.shake - dt * 1.6);
    this.dmgT = Math.max(0, this.dmgT - dt * 1.2);
  }

  finish(win, why) {
    const run = this.run;
    if (run.over) return;
    run.over = true; run.win = win; run.why = why; run.endT = 0;
    this.endShown = false;
    if (win) { run.bonus = 400 + Math.round((this.baseHp / this.baseMax) * 300); this.addScrap(run.bonus); }
    this.banner(win ? 'MISSION COMPLETE' : 'MISSION FAILED', why, win ? 'good' : 'bad', 3);
    if (win) this.snd.finish?.(); else this.snd.death?.();
    const s = this.save;
    s.scrap += run.scrap; s.runs++; s.best = Math.max(s.best, run.scrap); s.rescued += run.rescued; if (run.titanDead) s.titans++;
    saveSave(s);
    run.credits = Math.round(run.scrap / 4);
    this.earn?.(run.credits);
  }

  showEnd() {
    this.endShown = true; this.mode = 'end';
    if (document.pointerLockElement) document.exitPointerLock();
    const run = this.run, e = this.$('end');
    e.innerHTML = `<h2 class="${run.win ? 'win' : 'lose'}">${run.win ? 'MISSION COMPLETE' : 'MISSION FAILED'}</h2><p>${run.why}</p>
      <table><tr><td>ZOMBIES KILLED</td><td>${run.kills}</td></tr><tr><td>SURVIVORS SAVED</td><td>${run.rescued}</td></tr><tr><td>SURVIVORS LOST</td><td>${run.lost}</td></tr>
      <tr><td>TIME</td><td>${fmtT(run.t)}</td></tr>${run.titanDead ? '<tr><td>TITAN</td><td>KILLED</td></tr>' : ''}${run.bonus ? `<tr><td>MISSION BONUS</td><td>⚙ ${run.bonus}</td></tr>` : ''}
      <tr><td><b>SCRAP EARNED</b></td><td><b>⚙ ${run.scrap.toLocaleString('en-GB')}</b></td></tr><tr><td>SEMI-FINALS CREDITS</td><td>+${run.credits}</td></tr></table>
      <p>You've got ⚙ ${this.save.scrap.toLocaleString('en-GB')} scrap to spend.</p>
      <div class="row"><button data-x="hangar" type="button">TO THE HANGAR</button><button class="alt" data-x="again" type="button">FLY AGAIN</button></div>`;
    e.querySelector('[data-x=hangar]').onclick = () => { this.snd.button?.(); this.toHangar(); };
    e.querySelector('[data-x=again]').onclick = () => { this.toHangar(); this.deploy(); };
    e.classList.remove('hidden');
    this.$('hud').classList.add('hidden');
  }

  pause(on) {
    if (on) { if (this.mode !== 'fly' || this.run.over) return; this.mode = 'pause'; this.$('pause').classList.remove('hidden'); this.stopAudio(); }
    else if (this.mode === 'pause') { this.mode = 'fly'; this.$('pause').classList.add('hidden'); this.startAudio(); }
  }

  banner(t, s, cls = '', dur = 2) {
    const b = this.$('banner'); b.className = `da-banner ${cls}`; b.querySelector('b').textContent = t; b.querySelector('span').textContent = s; b.style.opacity = 1;
    clearTimeout(this.banT); this.banT = setTimeout(() => { b.style.opacity = 0; }, dur * 1000);
  }

  // ---------------------------------------------------------------- camera, HUD, sound
  camera(dt) {
    const H = this.heli;
    const f = H.fwd, fl = Math.hypot(f[0], f[2]) || 1, ff = [f[0] / fl, 0, f[2] / fl];
    const sp = Math.hypot(...H.vel);
    let eye, look;
    if (this.camMode === 2) {
      const { o, d } = this.bore();
      eye = H.toWorld([0, -0.2, -3.9]); look = d; void o;
    } else {
      const far = this.camMode === 1;
      // behind and above; higher when you dive so you can still see what you're shooting
      const dive = Math.max(0, -H.pitch);
      const dist = (far ? 30 : 18) + sp * 0.06, hgt = (far ? 14 : 9) + dive * (far ? 16 : 12);
      const want = [H.pos[0] - ff[0] * dist, H.pos[1] + hgt, H.pos[2] - ff[2] * dist];
      if (!this.camEye || this.camSnap) { this.camEye = want; this.camSnap = false; this.camLook = null; }
      const k = damp(9, dt);
      for (let i = 0; i < 3; i++) this.camEye[i] += (want[i] - this.camEye[i]) * k;
      // don't go through walls
      const v = [this.camEye[0] - H.pos[0], this.camEye[1] - H.pos[1], this.camEye[2] - H.pos[2]], vl = Math.hypot(...v);
      const hit = this.world.raycast(H.pos, v.map((c) => c / vl), vl);
      eye = hit ? H.pos.map((c, i) => c + (v[i] / vl) * Math.max(3, hit.t - 0.6)) : [...this.camEye];
      eye[1] = Math.max(eye[1], 0.8);
      // look at where the gun's pointing (a fixed distance out, so it doesn't jump about), a little above the helicopter
      const { o, d } = this.bore();
      const tgt = [o[0] + d[0] * 70, Math.max(o[1] + d[1] * 70, H.pos[1] - 25) - 1, o[2] + d[2] * 70];
      const want2 = norm([tgt[0] - eye[0], tgt[1] - eye[1], tgt[2] - eye[2]]);
      if (!this.camLook) this.camLook = want2;
      const kl = damp(10, dt);
      this.camLook = norm(this.camLook.map((c, i) => c + (want2[i] - c) * kl));
      look = this.camLook;
    }
    if (this.shake > 0) { const s = this.shake * 0.5; eye = eye.map((c) => c + (Math.random() - 0.5) * s); }
    this.eye = eye; this.look = look;
    const roll = this.camMode === 2 ? -H.rollL : -H.rollL * 0.3;
    // build the scene
    const S = this.S, s = this.save;
    const st = {
      rotorA: H.rotorA, tailA: H.tailA, rpm: H.rpm, spin: (this.spin = (this.spin || 0) + this.spinV * dt * 40), t: this.t, install: null, riders: this.riders,
      rockets: this.rockets, rocketMax: S.rockets, bombs: this.bombs, bombMax: S.bombs, boost: H.boost, doorAim: this.doorAim, doorFlash: this.doorFlash, flash: this.flashT,
    };
    const parts = this.run.over && this.hp <= 0 && this.run.endT > 0.1 ? [] : chopperParts(s.eq, PAINT[s.paint], st, H.H);
    this.draw(eye, look, roll, parts, this.extraParts(), H.pos, 0.0045);
  }

  // survivors, turrets, flares, projectiles, blasts
  extraParts() {
    const out = [], m = () => new Float32Array(16);
    const P = (p, r, s, col, o = {}) => { const mm = m(); compose(mm, p, r, s); out.push({ model: mm, scale: s, color: col, emissive: o.em || 0, shape: o.shape, alpha: o.alpha, mat: o.mat }); };
    const person = (x, y, z, yaw, wave, i) => {
      const sh = [[0.8, 0.2, 0.2], [0.2, 0.4, 0.8], [0.9, 0.8, 0.3], [0.9, 0.9, 0.9], [0.3, 0.7, 0.4]][i % 5];
      P([x, y + 0.45, z], [0, yaw, 0], [0.22, 0.9, 0.22], [0.15, 0.17, 0.22], { shape: 0.05 });
      P([x, y + 1.2, z], [0, yaw, 0], [0.44, 0.6, 0.26], sh, { shape: 0.06 });
      P([x, y + 1.68, z], [0, yaw, 0], [0.26, 0.28, 0.26], [0.86, 0.68, 0.55], { shape: 'sphere' });
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      for (const sd of [-1, 1]) {
        const a = wave ? 2.5 + Math.sin(this.t * 9 + i * 1.7 + sd) * 0.45 : 0.25;
        const ox = sd * 0.3 + sd * Math.sin(a) * 0.3;
        P([x + ox * c, y + 1.45 - Math.cos(a) * 0.3, z - ox * sn], [0, yaw, sd * a], [0.12, 0.6, 0.12], sh, { shape: 0.04 });
      }
    };
    for (const r of this.roofs || []) {
      if (!r.active) continue;
      for (let i = 0; i < r.count; i++) { const a = (r.start - r.count + i) * 2.1 + r.wave; person(r.x + Math.cos(a) * 2.4, r.top, r.z + Math.sin(a) * 2.4, -a, true, i); }
      // the flare: a green glow and a tall beam you can see across the city
      P([r.x + 3, r.top + 0.3, r.z + 3], [0, 0, 0], [0.5, 0.5, 0.5], [0.4, 1, 0.4], { em: 1, shape: 'sphere' });
      P([r.x + 3, r.top + 40, r.z + 3], [0, 0, 0], [1.6, 80, 1.6], [0.3, 1, 0.35], { em: 1, shape: 'cylY', alpha: 0.18 });
    }
    for (const rn of this.runners || []) {
      const k = rn.t, p = rn.from.map((c, i) => c + (rn.to[i] - c) * k);
      p[1] = rn.from[1] + (rn.to[1] - rn.from[1]) * k + Math.sin(k * Math.PI) * 0.4;
      person(p[0], p[1], p[2], Math.atan2(-(rn.to[0] - rn.from[0]), -(rn.to[2] - rn.from[2])), false, Math.floor(rn.from[0]));
    }
    for (const tu of this.city.turrets) {
      P(tu.pos, [0, tu.yaw, 0], [1.1, 0.8, 1.4], [0.25, 0.28, 0.22], { shape: 0.08, mat: 'metal' });
      P([tu.pos[0] - Math.sin(tu.yaw) * 1.2, tu.pos[1] + 0.1, tu.pos[2] - Math.cos(tu.yaw) * 1.2], [0, tu.yaw, 0], [0.16, 0.16, 1.6], [0.12, 0.12, 0.13], { shape: 'cyl', mat: 'metal' });
      if (tu.flash > 0) P([tu.pos[0] - Math.sin(tu.yaw) * 2.1, tu.pos[1] + 0.1, tu.pos[2] - Math.cos(tu.yaw) * 2.1], [0, 0, 0], [0.4, 0.4, 0.4], [1, 0.8, 0.4], { em: 1, shape: 'sphere', alpha: 0.8 });
    }
    for (const s of this.shots || []) {
      const ang = [Math.asin(clamp(norm(s.vel)[1], -1, 1)), Math.atan2(-s.vel[0], -s.vel[2]), 0];
      if (s.kind === 'rocket') { P(s.pos, ang, [0.2, 0.2, 1.1], [0.85, 0.85, 0.8], { shape: 'cyl' }); P(s.pos.map((c, i) => c - norm(s.vel)[i] * 0.7), [0, 0, 0], [0.5, 0.5, 0.5], [1, 0.75, 0.3], { em: 1, shape: 'sphere', alpha: 0.9 }); }
      else if (s.kind === 'bomb' || s.kind === 'bomblet') P(s.pos, ang, s.kind === 'bomb' ? [0.4, 0.4, 0.95] : [0.25, 0.25, 0.4], [0.3, 0.32, 0.25], { shape: 'sphere' });
      else if (s.kind === 'plasma') P(s.pos, ang, [0.35, 0.35, 1.6], [0.5, 0.95, 1], { em: 1, shape: 'sphere', alpha: 0.9 });
    }
    for (const b of this.blasts || []) {
      const k = b.t / 0.5, s = (2 + k * 6) * b.size;
      P(b.pos, [0, 0, 0], [s, s, s], b.col || [1, 0.65, 0.25], { em: 1, shape: 'sphere', alpha: (1 - k) * 0.6 });
    }
    for (const t of this.tracers || []) {
      const l = Math.min(14, t.len - t.d), c = t.from.map((v, i) => v + t.dir[i] * (t.d + l / 2));
      if (l <= 0) continue;
      P(c, [Math.asin(clamp(t.dir[1], -1, 1)), Math.atan2(-t.dir[0], -t.dir[2]), 0], [0.09, 0.09, l], [1, 0.8, 0.45], { em: 1, alpha: 0.85 });
    }
    return out;
  }

  project(p) {
    const m = this.vp, x = p[0], y = p[1], z = p[2];
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13], cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    return { x: (cx / cw * 0.5 + 0.5) * innerWidth, y: (1 - (cy / cw * 0.5 + 0.5)) * innerHeight, behind: cw < 0.1 };
  }

  hud(dt) {
    if (!this.run || this.mode === 'hangar') return;
    const H = this.heli, S = this.S, run = this.run;
    const left = Math.max(0, LEN - run.t);
    this.$('time').textContent = fmtT(left);
    const act = this.roofs.filter((r) => r.active && r.count > 0);
    this.$('obj').textContent = run.titan ? (run.titanDead ? 'TITAN DOWN · HOLD ON' : 'STOP THE TITAN · PROTECT THE OUTPOST') : this.riders >= S.seats ? 'CABIN FULL · FLY TO THE OUTPOST' : act.length ? `RESCUE SURVIVORS · ${act.reduce((n, r) => n + r.count, 0)} WAITING` : 'HOLD THE CITY';
    this.$('help').style.opacity = run.t > 25 ? 0 : 1;
    // aim
    const aim = this.aimPoint();
    const c = this.project(aim.p), cr = this.$('cross');
    cr.style.left = `${c.x}px`; cr.style.top = `${c.y}px`; cr.style.display = c.behind || H.dead ? 'none' : '';
    cr.classList.toggle('hot', !!aim.z || this.overT > 0);
    const hm = this.$('hit'); hm.style.left = `${c.x}px`; hm.style.top = `${c.y}px`;
    this.hitT = Math.max(0, (this.hitT || 0) - dt); if (this.hitT <= 0) hm.style.opacity = 0;
    // markers
    const marks = [];
    const mark = (p, col, icon, text, sub = '') => {
      const q = this.project(p), W = innerWidth, Hh = innerHeight;
      let x = q.x, y = q.y, off = false;
      if (q.behind) { x = W - x; y = Hh - 40; off = true; }
      if (x < 40 || x > W - 40 || y < 70 || y > Hh - 40) off = true;
      x = clamp(x, 40, W - 40); y = clamp(y, 70, Hh - 40);
      marks.push(`<div class="da-mark${off ? ' off' : ''}" style="left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;--c:${col}"><b>${icon}</b>${text}${sub ? `<small>${sub}</small>` : ''}</div>`);
    };
    const dist = (x, z) => `${Math.round(Math.hypot(x - H.pos[0], z - H.pos[2]))}M`;
    for (const r of act) {
      const climbing = this.horde.list.filter((z) => z.alive && (z.st === 'climb' || z.st === 'roof') && z.roof === r).length;
      mark([r.x, r.top + 4, r.z], '#7dff9a', r.count, `SOS · ${dist(r.x, r.z)}`, climbing ? `⚠ ${climbing} CLIMBING` : '');
    }
    mark([BASE[0], 6, BASE[2] + 6], '#5ab4ff', 'H', `OUTPOST · ${dist(BASE[0], BASE[2])}`, this.riders ? `DROP OFF ${this.riders}` : '');
    if (this.titan && this.titan.alive) mark([this.titan.x, this.titan.s * 2.1, this.titan.z], '#ff5a3a', '☠', `TITAN · ${dist(this.titan.x, this.titan.z)}`);
    this.$('marks').innerHTML = marks.join('');
    const boss = this.$('boss');
    boss.classList.toggle('hidden', !(this.titan && this.titan.alive));
    if (this.titan) boss.style.setProperty('--p', (this.titan.hp / this.titan.max).toFixed(3));
    // meters
    const setM = (id, p, hot) => { const m = this.$(id); m.style.setProperty('--p', clamp(p, 0, 1).toFixed(3)); m.classList.toggle('hot', !!hot); };
    setM('hpm', this.hp / S.hp, this.hp / S.hp < 0.3);
    setM('basem', this.baseHp / this.baseMax, this.baseHp / this.baseMax < 0.3);
    setM('heatm', this.heat, this.overT > 0);
    this.$('boostm').classList.toggle('hidden', !S.boost);
    if (S.boost) setM('boostm', H.boostT, false);
    this.$('alt').textContent = `ALT ${Math.round(this.agl ?? 0)}M`;
    this.$('spd').textContent = `${Math.round(Math.hypot(...H.vel) * 3.6)} KM/H`;
    this.$('right').innerHTML = `${S.rockets ? `<div><small>ROCKETS</small>${this.rockets} / ${S.rockets}</div>` : ''}${S.bombs ? `<div><small>BOMBS</small>${this.bombs} / ${S.bombs}</div>` : ''}<div><small>ON BOARD</small>${this.riders} / ${S.seats}</div><div><small>SAVED</small>${run.rescued}</div><div><small>KILLS</small>${run.kills}</div><div><small>SCRAP</small>⚙ ${run.scrap}</div>`;
    // warnings
    const grab = this.horde.list.filter((z) => z.alive && z.st === 'grab').length;
    const w = this.$('warn');
    const msg = H.dead ? '' : this.outT ? 'TURN BACK · YOU\'RE LEAVING THE CITY' : this.hp / S.hp < 0.25 ? 'HULL CRITICAL · LAND ON THE HELIPAD TO REPAIR' : grab ? `${grab} ZOMBIE${grab > 1 ? 'S' : ''} ON THE SKIDS · ROLL HARD TO SHAKE THEM OFF` : this.agl < 9 && Math.hypot(...H.vel) > 18 && H.vel[1] < -6 ? 'PULL UP' : '';
    w.textContent = msg; w.classList.toggle('hidden', !msg);
    this.$('dmg').style.opacity = Math.min(0.9, this.dmgT + (this.hp / S.hp < 0.25 ? 0.25 + 0.15 * Math.sin(this.t * 6) : 0)).toFixed(3);
    this.$('click').classList.toggle('hidden', this.locked || this.mode !== 'fly');
  }

  startAudio() {
    const c = this.snd.ctx;
    if (!c || this.au) return;
    const src = c.createBufferSource(); src.buffer = this.snd.noise; src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    const g = c.createGain(); g.gain.value = 0;
    const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0;
    const lg = c.createGain(); lg.gain.value = 0;
    lfo.connect(lg).connect(g.gain);
    src.connect(lp).connect(g).connect(this.snd.master);
    const whine = c.createOscillator(); whine.type = 'sawtooth'; whine.frequency.value = 300;
    const wl = c.createBiquadFilter(); wl.type = 'lowpass'; wl.frequency.value = 1400;
    const wg = c.createGain(); wg.gain.value = 0;
    whine.connect(wl).connect(wg).connect(this.snd.master);
    src.start(); lfo.start(); whine.start();
    this.au = { src, g, lfo, lg, whine, wg };
  }
  stopAudio() {
    if (!this.au) return;
    try { this.au.src.stop(); this.au.lfo.stop(); this.au.whine.stop(); } catch { /* ignore */ }
    this.au.g.disconnect(); this.au.wg.disconnect();
    this.au = null;
  }
  audio() {
    if (!this.au) { if (this.mode === 'fly' && this.snd.ctx) this.startAudio(); return; }
    const c = this.snd.ctx, H = this.heli, t = c.currentTime;
    const coll = this.key('KeyW') ? 1 : this.key('KeyS') ? -0.5 : 0;
    this.au.lfo.frequency.setTargetAtTime(H.rpm * 18, t, 0.1);
    this.au.g.gain.setTargetAtTime(H.rpm * (0.55 + coll * 0.15), t, 0.1);
    this.au.lg.gain.setTargetAtTime(H.rpm * 0.45, t, 0.1);
    this.au.whine.frequency.setTargetAtTime(240 + H.rpm * 380 + H.boost * 300, t, 0.2);
    this.au.wg.gain.setTargetAtTime(H.rpm * 0.018 + H.boost * 0.03, t, 0.2);
  }

  // ---------------------------------------------------------------- drawing
  draw(eye, fwd, roll, heliParts, extra, focus, fog) {
    const r = this.r;
    const aspect = r.resize();
    const vfov = (64 * Math.PI) / 180;
    perspective(this.proj, vfov, aspect, 0.4, 1100);
    lookDir(this.view, eye, fwd, [0, 1, 0], roll);
    mul(this.vp, this.proj, this.view);
    r.setStudio(null); r.setRoom(null); r.setUnder(false); r.setRim(null);
    const sc = [Math.round(focus[0] / 4) * 4, 0, Math.round(focus[2] / 4) * 4];
    r.setShadowArea(sc, 80);
    const farCull = 2.4 / fog;
    const tv = Math.tan(vfov / 2), kf = Math.hypot(tv, tv * aspect), kr = Math.sqrt(1 + kf * kf);
    const view = (c, rad) => {
      const dx = c[0] - eye[0], dy = c[1] - eye[1], dz = c[2] - eye[2], d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > (farCull + rad) * (farCull + rad)) return false;
      const al = dx * fwd[0] + dy * fwd[1] + dz * fwd[2];
      if (al < -rad) return false;
      return Math.sqrt(Math.max(0, d2 - al * al)) <= al * kf + rad * kr;
    };
    const near = (c, rad) => Math.abs(c[0] - sc[0]) < 130 + rad && Math.abs(c[2] - sc[2]) < 130 + rad;
    const zn = this.horde.fill(r, this.zBatch, eye, fwd, kf);
    const solid = heliParts.filter((p) => (p.alpha ?? 1) >= 1), clear = heliParts.filter((p) => (p.alpha ?? 1) < 1);
    const exS = extra.filter((p) => (p.alpha ?? 1) >= 1), exC = extra.filter((p) => (p.alpha ?? 1) < 1);
    r.beginShadow();
    this.batches.drawShadows(0, near);
    for (const b of this.live) if (!b.noShadow && near(b.center, 10)) r.shadowDraw(b.model, b.shape, b.scale);
    for (const p of solid) r.shadowDraw(p.model, p.shape, p.scale);
    for (const p of exS) r.shadowDraw(p.model, p.shape, p.scale);
    if (zn) r.shadowBatch(this.zBatch);
    r.gl.bindVertexArray(null); r.boundMesh = null;
    this.fx.drawShadows(r);
    r.endShadow();
    r.begin();
    r.setCamera(this.proj, this.view, fog, eye, true);
    r.drawSky(eye);
    r.setBlend(false);
    this.batches.draw(0, view);
    for (const b of this.live) if ((b.alpha ?? 1) >= 1 && view(b.center, 0.5 * Math.hypot(...b.scale))) r.drawBox(b);
    if (zn) { r.drawBatch(this.zBatch); r.endBatches(); }
    for (const p of solid) r.drawPart(p, 0);
    for (const p of exS) r.drawPart(p, 0);
    this.fx.drawOpaque(r);
    r.setBlend(true);
    for (const p of clear) r.drawPart(p, 0);
    for (const p of exC) r.drawPart(p, 0);
    this.fx.drawTransparent(r);
    r.setBlend(false);
  }
}
