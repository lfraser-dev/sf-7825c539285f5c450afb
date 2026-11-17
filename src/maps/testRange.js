// "Test Range": a white grid sandbox for checking movement and gunplay.
// Maps are just data + a build() function, so new arenas can be dropped in later.
import { makeBox, boxAt } from '../world.js';
import { digitBoxes, blockText } from '../props.js';

const WALL = [0.8, 0.81, 0.83];
const ACCENT = [0.52, 0.57, 0.64];   // blue-grey steel
const CHAR = [0.27, 0.28, 0.31];      // charcoal structure
const RED = [0.95, 0.15, 0.1];
const LANE = [0.82, 0.83, 0.86];
const HAZ = [0.95, 0.2, 0.14];

// Parkour annex, through a doorway in the east wall
const GZ0 = -29.9, GZ1 = -5;             // doorway (z range) in the east wall
const AX1 = 73, AZ0 = -30, AZ1 = -5;      // annex extents (x from the arena wall at 32)
const HALF_PI = Math.PI / 2;
const DECK_Y = -16;                       // floor height of the underground combat arena
const CEIL_Y = DECK_Y + 13.5;              // underside of its ceiling (just below the range floor)
const HATCH = { x0: -30, x1: -27, z0: -4.5, z1: -1.5 };   // elevator shaft opening in the range floor
// the armoury: a roofed room behind the south wall, through a wide doorway
const AR = { x0: -12, x1: 12, z0: 33, z1: 45, top: 4.6, door: 3.5, doorH: 4.2 };
const CONC = [0.66, 0.665, 0.67];     // concrete blocks and barriers
const FLOOR = [0.6, 0.61, 0.63];      // sealed concrete
const YELLOW = [0.98, 0.76, 0.12];
const DARKP = [0.3, 0.31, 0.34];      // painted steel (armoury walls)

export default {
  name: 'TEST RANGE',
  spawn: { pos: [0, 0, 26], yaw: Math.PI }, // facing the armoury doorway

  build(world) {
    const add = (b) => world.add(b);
    // decorative trim/floor markings don't collide unless asked to
    const deco = (min, max, o = {}) => add(makeBox(min, max, { grid: false, solid: false, ...o }));
    const S = 32; // half size of the arena
    const H = 9;

    // ---------------- floor + outer walls ----------------
    // floor, with a hatch for the elevator shaft
    add(makeBox([-S, -1, -S], [HATCH.x0, 0, S], { color: FLOOR }));
    add(makeBox([HATCH.x1, -1, -S], [S, 0, S], { color: FLOOR }));
    add(makeBox([HATCH.x0, -1, -S], [HATCH.x1, 0, HATCH.z0], { color: FLOOR }));
    add(makeBox([HATCH.x0, -1, HATCH.z1], [HATCH.x1, 0, S], { color: FLOOR }));
    add(makeBox([-S - 1, 0, -S - 1], [S + 1, H, -S], { color: WALL }));
    // south wall, with the armoury doorway in the middle
    add(makeBox([-S - 1, 0, S], [-AR.door, H, S + 1], { color: WALL }));
    add(makeBox([AR.door, 0, S], [S + 1, H, S + 1], { color: WALL }));
    add(makeBox([-AR.door, AR.doorH, S], [AR.door, H, S + 1], { color: WALL }));
    add(makeBox([-S - 1, 0, -S], [-S, H, S], { color: WALL }));
    add(makeBox([S, 0, -S], [S + 1, H, GZ0], { color: WALL }));     // east wall, split by the
    add(makeBox([S, 0, GZ1], [S + 1, H, S], { color: WALL }));      // parkour doorway

    // skirting, red light strip and top trim on every wall
    const walls = [
      { a: 0, fixed: -S, sign: 1 }, { a: 0, fixed: S, sign: -1 },
      { a: 2, fixed: -S, sign: 1 }, { a: 2, fixed: S, sign: -1 },
    ];
    for (const w of walls) {
      const east = w.a === 2 && w.fixed === S, south = w.a === 0 && w.fixed === S;
      const band = (y0, y1, depth, o) => {
        for (const [a0, a1] of east ? [[-S, GZ0], [GZ1, S]] : south ? [[-S, -AR.door], [AR.door, S]] : [[-S, S]]) {
          const min = [0, y0, 0], max = [0, y1, 0];
          const across = w.a === 0 ? 2 : 0;
          min[w.a] = a0; max[w.a] = a1;
          const inner = w.fixed;
          min[across] = Math.min(inner, inner + w.sign * depth);
          max[across] = Math.max(inner, inner + w.sign * depth);
          deco(min, max, o);
        }
      };
      band(0, 0.45, 0.12, { color: CHAR, solid: true });
      band(3.4, 3.5, 0.06, { color: RED, emissive: 0.9, solid: false, noShadow: true });
      band(H - 0.35, H, 0.25, { color: CHAR });
      // pilasters every 8m
      for (let t = -S + 4; t <= S - 4; t += 8) {
        if (w.a === 0 && w.fixed === S && Math.abs(t) < 6) continue; // keep the workbench wall clear
        if (east && t > GZ0 - 0.5 && t < GZ1 + 0.5) continue;           // keep the doorway clear
        const min = [0, 0, 0], max = [0, H, 0];
        const across = w.a === 0 ? 2 : 0;
        min[w.a] = t - 0.4; max[w.a] = t + 0.4;
        min[across] = Math.min(w.fixed, w.fixed + w.sign * 0.4);
        max[across] = Math.max(w.fixed, w.fixed + w.sign * 0.4);
        add(makeBox(min, max, { color: CHAR, grid: false }));
      }
    }

    // floodlight towers in the corners
    for (const [cx, cz] of [[-S + 1.5, -S + 1.5], [S - 1.5, -S + 1.5], [-S + 1.5, S - 1.5], [S - 1.5, S - 1.5]]) {
      add(boxAt(cx, 0, cz, 1.2, 14, 1.2, { color: CHAR, grid: false }));
      add(boxAt(cx, 14, cz, 3, 1.6, 3, { color: CHAR, grid: false }));
      add(boxAt(cx, 13.8, cz, 2.6, 0.2, 2.6, { color: [1, 1, 0.96], grid: false, emissive: 1, solid: false, noShadow: true }));
    }

    // ---------------- shooting lanes (north) ----------------
    add(boxAt(-10, 0, -14, 0.4, 1.2, 24, { color: ACCENT }));
    add(boxAt(10, 0, -14, 0.4, 1.2, 24, { color: ACCENT }));
    // the backstop: a dark rubber-faced berm with angled deflector plates and a sign over it
    add(boxAt(0, 0, -27, 20.4, 4, 1, { color: [0.2, 0.18, 0.16], grid: false }));
    for (let x = -9; x <= 9; x += 2) deco([x - 0.95, 0.2, -26.55], [x + 0.95, 3.8, -26.5], { color: x % 4 ? [0.24, 0.21, 0.18] : [0.27, 0.24, 0.2] });
    deco([-10.2, 3.9, -26.56], [10.2, 4.0, -26.5], { color: YELLOW, emissive: 0.4 });
    add(boxAt(0, 4, -27.2, 12, 1.6, 0.4, { color: [0.12, 0.12, 0.14], grid: false }));
    blockText('FIRING RANGE', 0, 4.8, -27.01, 0.85, 's', [1, 0.8, 0.2], 0.9).forEach(add);
    deco([-9.8, 0, -26.5], [9.8, 0.02, -1.2], { color: [0.36, 0.37, 0.4], grid: true, edges: false });   // lane floor: dark asphalt
    for (const z of [-6, -11, -16, -21]) deco([-9.8, 0, z - 0.04], [9.8, 0.026, z + 0.04], { color: [0.92, 0.92, 0.9], emissive: 0.1, edges: false });   // every 5 m
    deco([-9.8, 0, -1.2], [9.8, 0.03, -0.95], { color: RED, emissive: 0.7, edges: false }); // firing line
    for (const x of [-5, 0, 5]) deco([x - 0.04, 0, -26.5], [x + 0.04, 0.025, -1.2], { color: CHAR, edges: false });
    buildBooths(add, deco);

    // overhead trusses over the lanes (great for shadows)
    add(boxAt(-10.7, 0, -14, 0.5, 7, 0.5, { color: CHAR, grid: false }));
    add(boxAt(10.7, 0, -14, 0.5, 7, 0.5, { color: CHAR, grid: false }));
    for (const z of [-4, -14, -24]) add(makeBox([-11, 7, z - 0.25], [11, 7.5, z + 0.25], { color: CHAR, grid: false }));
    add(makeBox([-11, 7.5, -26], [-10.4, 7.8, -2], { color: CHAR, grid: false }));
    add(makeBox([10.4, 7.5, -26], [11, 7.8, -2], { color: CHAR, grid: false }));
    for (const x of [-11, 11]) add(boxAt(x, 0, -26, 0.5, 7.5, 0.5, { color: CHAR, grid: false }));
    for (const x of [-11, 11]) add(boxAt(x, 0, -2, 0.5, 7.5, 0.5, { color: CHAR, grid: false }));

    // distance signs (metres from the firing line)
    for (const [dist, z] of [[10, -11], [20, -21]]) {
      add(boxAt(-8.6, 0, z, 0.12, 2.2, 0.12, { color: CHAR, grid: false }));
      add(boxAt(-8.6, 2.2, z, 1.3, 0.85, 0.08, { color: CHAR, grid: false }));
      digitBoxes(String(dist), -8.6 - 0.45, 2.33, z + 0.06, 0.6, 1, [1, 1, 1], 0.9).forEach(add);
    }
    digitBoxes('25', -1.0, 1.4, -26.48, 1.6, 1, CHAR).forEach(add);

    // ---------------- step test near spawn (east): 0.25 / 0.5 / 0.75 / 1.0 ----------------
    [0.25, 0.5, 0.75, 1.0].forEach((h, i) => add(boxAt(6 + i * 2.2, 0, 18, 2, h, 2, { color: CONC })));

    // ---------------- stair platform (east) ----------------
    const px = 20, pz = 4;
    add(boxAt(px, 0, pz - 4, 8, 3, 8, { color: CONC }));
    for (let i = 0; i < 6; i++) add(boxAt(px, 0, pz + 0.3 + i * 0.6, 3, 3 - i * 0.5, 0.6, { color: ACCENT }));
    add(boxAt(px - 3.2, 3, pz - 7.5, 1.6, 1.1, 0.3, { color: CHAR, grid: false }));
    add(boxAt(px + 3.2, 3, pz - 7.5, 1.6, 1.1, 0.3, { color: CHAR, grid: false }));
    deco([px - 4, 2.98, pz - 8], [px + 4, 3.04, pz - 7.8], { color: RED, emissive: 0.7 });

    // ---------------- parkour tower (west) ----------------
    const tx = -22, tz = 6;
    [[0, 1.0], [2.4, 2.0], [4.8, 3.0], [7.2, 4.0], [9.6, 5.0]].forEach(([dz, h], i) =>
      add(boxAt(tx + 4, 0, tz + 10 - dz, 2, h, 2, { color: i % 2 ? ACCENT : WALL })));
    add(boxAt(tx, 0, tz - 2, 5, 6, 5, { color: CONC }));
    add(boxAt(tx - 2.2, 6, tz - 2, 0.6, 1.1, 5, { color: CHAR, grid: false }));
    deco([tx - 2.5, 5.98, tz + 0.45], [tx + 2.5, 6.04, tz + 0.55], { color: RED, emissive: 0.7 });
    // a tall mantle wall next to the tower (2m)
    add(boxAt(tx + 7, 0, tz - 6, 4, 2.0, 1.2, { color: ACCENT }));

    // ---------------- cover pieces ----------------
    add(boxAt(-5, 0, 10, 3, 1.2, 1, { color: CONC }));
    add(boxAt(5, 0, 8, 1, 2.6, 3, { color: CHAR, grid: false }));
    add(boxAt(0, 0, 4, 1.2, 3.2, 1.2, { color: WALL }));
    add(boxAt(-14, 0, 18, 4, 2.2, 0.6, { color: CONC }));
    add(boxAt(14, 0, 13, 0.6, 2.2, 4, { color: CONC }));
    add(boxAt(-24, 0, 24, 6, 0.6, 6, { color: ACCENT }));
    add(boxAt(24, 0, -20, 3, 7, 3, { color: CHAR, grid: false }));
    add(boxAt(-24, 0, -18, 2, 1.6, 6, { color: ACCENT }));    // mantle-height block
    add(boxAt(-24, 0, -10, 6, 1.0, 2, { color: WALL }));

    // a low tunnel to slide under
    add(boxAt(-16, 1.3, -4, 4, 0.5, 6, { color: CHAR, grid: false }));
    add(boxAt(-17.8, 0, -4, 0.4, 1.3, 6, { color: CONC }));
    add(boxAt(-14.2, 0, -4, 0.4, 1.3, 6, { color: CONC }));

    // ---------------- armoury (south, through the doorway) ----------------
    buildArmoury(add, deco, S);
    // spawn pad
    deco([-1.5, 0, 24.5], [1.5, 0.02, 27.5], { color: LANE, edges: true });

    // painted floor zones: each area gets a tinted pad with a yellow border, and a walkway from spawn to the armoury
    const zone = (x0, z0, x1, z1, col) => {
      deco([x0, 0, z0], [x1, 0.008, z1], { color: col, edges: false });
      for (const [a0, b0, a1, b1] of [[x0, z0, x1, z0 + 0.12], [x0, z1 - 0.12, x1, z1], [x0, z0, x0 + 0.12, z1], [x1 - 0.12, z0, x1, z1]]) deco([a0, 0, b0], [a1, 0.012, b1], { color: YELLOW, emissive: 0.2, edges: false });
    };
    zone(-28, -1, -12, 15, [0.45, 0.52, 0.62]);      // movement (tower, mantle wall, tunnel)
    zone(14, -6, 26, 9, [0.45, 0.52, 0.62]);         // stairs
    zone(4.6, 16.4, 13.6, 19.6, [0.55, 0.52, 0.42]); // step test
    deco([-2.2, 0, 27.6], [2.2, 0.008, S], { color: [0.36, 0.37, 0.4], edges: false });
    for (const sx of [-1, 1]) deco([sx * 2.2 - 0.06, 0, 27.6], [sx * 2.2 + 0.06, 0.012, S], { color: YELLOW, emissive: 0.2, edges: false });
    for (let z = 28; z < S - 0.5; z += 1.2) deco([-0.35, 0, z], [0.35, 0.012, z + 0.5], { color: [0.95, 0.95, 0.92], emissive: 0.1, edges: false });   // arrows in

    // zone signs high on the walls
    const sign = (text, x, y, z, face, w) => {
      const o = { n: [0, -0.15], s: [0, 0.15], e: [0.15, 0], w: [-0.15, 0] }[face];
      add(boxAt(x + o[0] * 0.5, y - 0.75, z + o[1] * 0.5, face === 'e' || face === 'w' ? 0.15 : w, 1.5, face === 'e' || face === 'w' ? w : 0.15, { color: [0.12, 0.12, 0.14], grid: false }));
      blockText(text, x + o[0] * 1.05, y, z + o[1] * 1.05, 0.7, face, [1, 1, 1], 0.85).forEach(add);
    };
    sign('PARKOUR', S - 0.02, 6.2, (GZ0 + GZ1) / 2, 'w', 6.4);
    sign('MOVEMENT', -S + 0.02, 6.2, 8, 'e', 7.2);
    sign('COMBAT DECK', -S + 0.02, 6.2, -10, 'e', 9.6);

    buildParkour(add, deco, H);
    this.deckRefs = buildDeck(add, deco);
    this.showroomRefs = buildShowroom(add);
  },

  // the armoury: every gun on a panel on the walls (the panels are built in props.js gunWalls). Each rack: centre of
  // the row, the way the wall faces, which guns, panel width, spacing, colour. `ammo` is the ammo station.
  armoury: {
    room: [AR.x0, AR.z0, AR.x1, AR.z1, AR.top],
    racks: [
      { name: 'RIFLES', o: [-6.8, 2.35, AR.z1], n: [0, -1], fam: 'ar', w: 1.32, gap: 1.55, col: [0.95, 0.3, 0.12] },
      { name: 'SMGS', o: [-6.8, 1.3, AR.z1], n: [0, -1], fam: 'smg', w: 0.8, gap: 1.8, col: [0.2, 0.75, 1] },
      { name: 'SHOTGUNS', o: [6.8, 2.35, AR.z1], n: [0, -1], fam: 'shotgun', w: 1.26, gap: 1.8, col: [1, 0.72, 0.1] },
      { name: 'SNIPERS', o: [6.8, 1.3, AR.z1], n: [0, -1], fam: 'sniper', w: 1.45, gap: 2.2, col: [0.4, 1, 0.45] },
      { name: 'MACHINE GUNS', o: [AR.x0, 1.75, 40], n: [1, 0], fam: 'lmg', w: 1.4, gap: 2.25, col: [0.9, 0.2, 0.25] },
      { name: 'SIDEARMS', o: [AR.x1, 1.6, 41.2], n: [-1, 0], fam: 'pistol', w: 0.55, gap: 0.85, col: [0.75, 0.45, 1] },
    ],
    ammo: [AR.x1 - 0.45, 1.15, 35.4],
  },
  bench: { pos: [0, 0, AR.z1 - 1.1] },     // gunsmith workbench (front edge), against the armoury's back wall

  dummies: [
    { pos: [-6, 0, -8] },
    { pos: [4, 0, -12] },
    { pos: [-2, 0, -18] },
    { pos: [7, 0, -23] },
    { pos: [-7, 0, -24] },
    { pos: [0, 0, -21], move: { axis: 0, range: 7, speed: 4 } },
    { pos: [3, 0, -6], move: { axis: 0, range: 3, speed: 2.5 } },
    { pos: [20, 3, -2] },
    { pos: [-22, 6, 3] },
    { pos: [24, 0, -17] },
  ],

  // combat deck up the elevator (geometry in buildDeck below)
  elevator: { x: -28.5, z: -3, w: 3, d: 3, top: 0, bottom: DECK_Y },
  deck: {
    y: DECK_Y,
    area: { min: [-83, DECK_Y - 2, -29], max: [-26, CEIL_Y, 23] },
    respawn: { pos: [-39, DECK_Y, -3], yaw: HALF_PI },
    console: [-39.5, DECK_Y, -7.2],          // button pedestal (centre, floor)
    bounds: { min: [-81.3, -27.3], max: [-38.5, 21.3] },
    pods: [-17, -3, 11],                      // z of each spawn pod / gate
    podX: -78,
    gateX: -74,
    cam: {                                    // cutscene camera shots
      wide: { from: [-39, DECK_Y + 11.5, 16], to: [-50, DECK_Y + 9.5, 10], look: [-76, DECK_Y + 1, -3] },
      pods: { from: [-69.5, DECK_Y + 12.2, 5], to: [-71, DECK_Y + 11.6, -2], look: [-78.2, DECK_Y + 0.2, -3.2] },   // high, looking down into the open pods
    },
  },

  // main-menu showroom, deep underground and far away (lit by its own ceiling lamp)
  showroom: { spot: [300, -40, 332], cam: { eye: [300.25, -38.6, 327.3], look: [301.15, -38.95, 332] } },

  // parkour time trial (geometry is in buildParkour below)
  course: {
    area: { min: [31, -5, AZ0], max: [AX1, 60, AZ1] },
    start: { pos: [34, 0, -24], yaw: -HALF_PI },
    startGate: { min: [36, -1, -30], max: [37, 8, -18] },
    finishGate: { min: [35, -1, -17], max: [36.4, 8, -5] },
    checkpoints: [
      { min: [50.6, -1, -30], max: [52.2, 8, -18], respawn: { pos: [51.2, 0, -24], yaw: -HALF_PI } },   // after the vaults
      { min: [64.6, -1, -30], max: [67, 8, -18], respawn: { pos: [65.8, 0, -27], yaw: -HALF_PI } },     // after the wall run
      { min: [67, 5.2, -24], max: [73, 9, -12], respawn: { pos: [70.5, 5.41, -14.5], yaw: HALF_PI } },  // top of the climb
      { min: [46, -1, -17], max: [50, 8, -5], respawn: { pos: [48, 0, -11], yaw: HALF_PI } },           // after the stones
    ],
    hazards: [
      { min: [55.5, -1, -30], max: [64.5, 1, -18] },
      { min: [50.4, -1, -17], max: [68, 1, -5] },
      { min: [37.5, -1, -17], max: [46, 1, -5] },
    ],
  },

  walls: [
    { origin: [-12, 0, 8], cols: 12, rows: 6, axis: 0 },
    { origin: [18, 0, 18], cols: 10, rows: 6, axis: 2 },
  ],
};

// ---------------------------------------------------------------- parkour annex
// Outbound lane (south, heading east): vault hurdles → slide beam → wall run over the hazard →
// mantle → ledge grab. Return lane (north, heading west): stepping stones → wall run → finish.
function buildParkour(add, deco, H) {
  const S = 32;
  const box = (min, max, o = {}) => add(makeBox(min, max, o));
  // floor + walls
  box([S, -1, AZ0], [AX1, 0, AZ1]);
  box([S, 0, AZ0 - 1], [AX1 + 1, H, AZ0], { color: WALL });
  box([S, 0, AZ1], [AX1 + 1, H, AZ1 + 1], { color: WALL });
  box([AX1, 0, AZ0], [AX1 + 1, H, AZ1], { color: WALL });
  // trim: skirting + red light strip on the inner faces
  for (const [y0, y1, d, o] of [[0, 0.45, 0.12, { color: CHAR, solid: true }], [3.4, 3.5, 0.06, { color: RED, emissive: 0.9, solid: false, noShadow: true }]]) {
    deco([S + 1, y0, AZ0], [AX1, y1, AZ0 + d], o);
    deco([S + 1, y0, AZ1 - d], [AX1, y1, AZ1], o);
    deco([AX1 - d, y0, AZ0], [AX1, y1, AZ1], o);
  }
  // floodlights over the course
  for (const x of [44, 60]) for (const z of [AZ0 + 1.5, AZ1 - 1.5]) {
    add(boxAt(x, 0, z, 1, 12, 1, { color: CHAR, grid: false }));
    add(boxAt(x, 12, z, 2.4, 1.2, 2.4, { color: CHAR, grid: false }));
    add(boxAt(x, 11.85, z, 2, 0.15, 2, { color: [1, 1, 0.96], grid: false, emissive: 1, solid: false, noShadow: true }));
  }

  // lane divider (tall so you can't walk along its top)
  box([37, 0, -18], [68, 8, -17], { color: ACCENT });
  deco([37, 4.4, -18.06], [68, 4.5, -17.94], { color: RED, emissive: 0.8, solid: false, noShadow: true });

  const gate = (x, z0, z1, col) => {
    add(boxAt(x, 0, z0 + 0.4, 0.4, 4.4, 0.4, { color: CHAR, grid: false }));
    add(boxAt(x, 0, z1 - 0.4, 0.4, 4.4, 0.4, { color: CHAR, grid: false }));
    box([x - 0.2, 4.4, z0], [x + 0.2, 4.8, z1], { color: col, emissive: 1, grid: false, noShadow: true });
    deco([x - 0.2, 0, z0], [x + 0.2, 0.03, z1], { color: col, emissive: 0.9, edges: false, solid: false });
  };
  gate(36.2, -30, -18, RED);                // start
  gate(36.2, -17, -5, [1, 1, 0.97]);        // finish
  // checkered finish strip
  for (let i = 0; i < 12; i++) deco([35.4, 0, -17 + i], [35.8, 0.035, -16.5 + i], { color: CHAR, edges: false, solid: false });

  const cpLine = (x0, x1, z0, z1) => deco([x0, 0, z0], [x1, 0.03, z1], { color: [1, 1, 0.97], emissive: 0.8, edges: false, solid: false });

  // 1) vault hurdles
  [[40, 0.9], [44.5, 1.05], [49, 1.25]].forEach(([x, h]) => add(boxAt(x, 0, -24, 0.4, h, 12, { color: WALL })));
  cpLine(51.2, 51.5, -30, -18);
  // 2) slide beam (1.2 m clearance — slide or crouch under it)
  box([52.6, 1.2, -30], [54, 4.6, -18], { color: CHAR, grid: false });
  deco([52.6, 1.17, -30], [54, 1.2, -18], { color: RED, emissive: 0.8, solid: false, noShadow: true });
  // 3) hazard floor — wall run along the divider (or the outer wall) to cross it
  deco([55.5, 0, -30], [64.5, 0.025, -18], { color: HAZ, emissive: 0.55, edges: false, solid: false });
  for (let x = 56; x < 64.5; x += 1.5) deco([x, 0, -30], [x + 0.5, 0.03, -18], { color: [0.7, 0.08, 0.06], edges: false, solid: false });
  cpLine(65.6, 65.9, -24, -18);
  // 4) climb: mantle onto A, ledge-grab up to B
  box([67, 0, -30], [73, 1.8, -24]);
  box([67, 0, -24], [73, 5.4, -12]);      // too tall to mantle from A: jump, catch the edge, pull up
  deco([67, 5.4, -24], [73, 5.43, -23.7], { color: RED, emissive: 0.8, edges: false, solid: false });

  // 5) stepping stones over the return hazard
  deco([50.4, 0, -17], [68, 0.025, -5], { color: HAZ, emissive: 0.55, edges: false, solid: false });
  [[64.2, -11.8, 3.3], [60, -9.8, 2.5], [55.8, -11.8, 1.7], [51.6, -9.8, 1.0]].forEach(([x, z, h], i) =>
    add(boxAt(x, 0, z, 2.4, h, 2.4, { color: i % 2 ? ACCENT : WALL })));
  cpLine(48, 48.3, -17, -5);
  // 6) final wall run over the last hazard, then through the finish gate
  deco([37.5, 0, -17], [46, 0.025, -5], { color: HAZ, emissive: 0.55, edges: false, solid: false });
  box([37, 0, -11.2], [46.5, 4.2, -10.8], { color: ACCENT });
}

// ---------------------------------------------------------------- combat deck
// An arena 12 m up, west of the main range, reached by the elevator + bridge.
// East end: player base + console. Middle: wall-run walls, platform, grapple tower, cover.
// West end: the bot bay — three open-top spawn pods with doors, laid out like a firing range.
function buildDeck(add, deco) {
  const Y = DECK_Y;
  const box = (min, max, o = {}) => add(makeBox(min, max, o));
  const STEEL = [0.34, 0.35, 0.38];
  const CONC = [0.62, 0.62, 0.64];
  // floor slab and ceiling (this whole arena is underground, below the range)
  box([-83, Y - 1, -29], [-35, Y, 23]);
  box([-83, CEIL_Y, -29], [-35, CEIL_Y + 0.9, 23], { color: CONC, grid: false });
  // ceiling lamps: their light pools are done in the shader (one every 8 m)
  for (const x of [-76, -68, -60, -52, -44]) for (const z of [-20, -12, -4, 4, 12, 20]) {
    box([x - 1.7, CEIL_Y - 0.18, z - 0.4], [x + 1.7, CEIL_Y, z + 0.4], { color: [0.2, 0.21, 0.23], grid: false, solid: false });
    box([x - 1.5, CEIL_Y - 0.2, z - 0.25], [x + 1.5, CEIL_Y - 0.18, z + 0.25], { color: [1, 0.95, 0.85], emissive: 1, grid: false, solid: false, noShadow: true });
  }
  // ceiling beams
  for (const x of [-72, -56, -40]) box([x - 0.4, CEIL_Y - 0.7, -28], [x + 0.4, CEIL_Y, 22], { color: CHAR, grid: false, solid: false });
  // perimeter walls up to the ceiling (good for wall running), with a gap in the east wall for the tunnel
  const wallH = CEIL_Y - Y;
  box([-83, Y, -29], [-35, Y + wallH, -28], { color: WALL });
  box([-83, Y, 22], [-35, Y + wallH, 23], { color: WALL });
  box([-83, Y, -28], [-82, Y + wallH, 22], { color: WALL });
  box([-37, Y, -28], [-36, Y + wallH, -4.5], { color: WALL });
  box([-37, Y, -1.5], [-36, Y + wallH, 22], { color: WALL });
  box([-37, Y + 4, -4.5], [-36, Y + wallH, -1.5], { color: WALL });   // header over the entrance
  for (const [y0, y1, o] of [[0, 0.4, { color: CHAR, solid: true }], [3.4, 3.5, { color: RED, emissive: 0.9, noShadow: true }], [wallH - 0.3, wallH, { color: CHAR }]]) {
    deco([-82, Y + y0, -28], [-37, Y + y1, -27.88], o);
    deco([-82, Y + y0, 21.88], [-37, Y + y1, 22], o);
    deco([-82, Y + y0, -28], [-81.88, Y + y1, 22], o);
  }
  // access tunnel from the bottom of the elevator shaft into the arena
  box([-37, Y - 0.4, -4.5], [-30.4, Y, -1.5], { color: STEEL, grid: false });
  box([-37, Y, -5], [-30.4, Y + 4.4, -4.5], { color: CONC });
  box([-37, Y, -1.5], [-30.4, Y + 4.4, -1]);
  box([-37, Y + 4, -5], [-30.4, Y + 4.4, -1], { color: CONC });
  deco([-37, Y + 3.9, -3.2], [-30.4, Y + 3.98, -2.8], { color: [1, 0.95, 0.85], emissive: 1, noShadow: true });
  for (const z of [-4.5, -1.62]) deco([-37, Y + 0.02, z], [-30.4, Y + 0.05, z + 0.12], { color: [0.95, 0.75, 0.1], emissive: 0.4, edges: false });
  // the shaft itself, from the arena up to the underside of the range floor
  const SH = { x0: -30.4, x1: -26.6, z0: -4.9, z1: -1.1 };
  box([SH.x0, Y, SH.z0], [SH.x1, -1, SH.z0 + 0.3], { color: CONC });
  box([SH.x0, Y, SH.z1 - 0.3], [SH.x1, -1, SH.z1], { color: CONC });
  box([SH.x1 - 0.3, Y, SH.z0], [SH.x1, -1, SH.z1], { color: CONC });
  box([SH.x0, Y + 4.4, SH.z0], [SH.x0 + 0.1, -1, SH.z1], { color: CONC });
  box([SH.x0, Y - 1, SH.z0], [SH.x1, Y - 0.2, SH.z1], { color: CHAR, grid: false });   // pit floor
  for (let y = Y + 2; y < -2; y += 3) deco([SH.x1 - 0.32, y, -3.2], [SH.x1 - 0.3, y + 0.15, -2.8], { color: [1, 0.6, 0.15], emissive: 1, noShadow: true });

  // ---- player base: entry pad, console, low cover
  deco([-44, Y, -10], [-37, Y + 0.02, 4], { color: [0.3, 0.31, 0.34], edges: false });
  deco([-44.2, Y, -10], [-44, Y + 0.03, 4], { color: RED, emissive: 0.7, edges: false });
  const cx = -39.5, cz = -7.2;
  add(boxAt(cx, Y, cz, 0.9, 1.0, 0.7, { color: CHAR, grid: false }));                // pedestal
  add(boxAt(cx, Y + 1.0, cz, 1.1, 0.06, 0.85, { color: STEEL, grid: false }));         // top plate
  const buttonRing = add(boxAt(cx, Y + 1.06, cz, 0.42, 0.04, 0.42, { color: [0.12, 0.12, 0.13], grid: false, solid: false }));
  const button = add(boxAt(cx, Y + 1.1, cz, 0.3, 0.08, 0.3, { color: RED, emissive: 0.8, grid: false, solid: false }));
  // screen above the console
  add(boxAt(cx, Y + 1.5, cz - 0.9, 2.4, 1.5, 0.12, { color: [0.08, 0.09, 0.11], grid: false }));
  const screen = add(boxAt(cx, Y + 1.6, cz - 0.83, 2.1, 1.25, 0.02, { color: [0.15, 0.4, 0.9], grid: false, emissive: 0.35, solid: false, noShadow: true }));
  add(boxAt(cx - 1.05, Y, cz - 0.9, 0.12, 1.5, 0.12, { color: CHAR, grid: false }));
  add(boxAt(cx + 1.05, Y, cz - 0.9, 0.12, 1.5, 0.12, { color: CHAR, grid: false }));
  add(boxAt(-46, Y, -12, 0.5, 1.1, 6, { color: ACCENT }));
  add(boxAt(-46, Y, 6, 0.5, 1.1, 6, { color: ACCENT }));

  // ---- the field
  add(boxAt(-57, Y, -16, 18, 5, 0.5, { color: WALL }));     // wall-run walls
  add(boxAt(-57, Y, 10, 18, 5, 0.5, { color: WALL }));
  for (const z of [-16, 10]) deco([-66, Y + 2.4, z - 0.3], [-48, Y + 2.5, z + 0.3], { color: RED, emissive: 0.8, noShadow: true });
  add(boxAt(-58, Y, -3, 6, 3, 6));                          // central platform
  add(boxAt(-54.25, Y, -3, 1.5, 1.5, 2.5, { color: ACCENT }));   // step up to it
  add(boxAt(-61.75, Y, -3, 1.5, 1.5, 2.5, { color: ACCENT }));
  add(boxAt(-66, Y, -3, 2.4, 9, 2.4, { color: CHAR, grid: false }));    // grapple tower
  add(boxAt(-66, Y + 9, -3, 4, 0.4, 4, { color: STEEL, grid: false }));
  deco([-68, Y + 9.4, -5], [-64, Y + 9.43, -4.85], { color: RED, emissive: 0.8, noShadow: true });
  // cover: vaultable, mantle height, ledge-grab height, pillars
  add(boxAt(-50, Y, -22, 3, 1.2, 1, { color: ACCENT }));
  add(boxAt(-52, Y, 17, 1, 1.9, 3));
  add(boxAt(-62, Y, -22, 2, 2.6, 2, { color: WALL }));
  add(boxAt(-63, Y, 16, 4, 1.0, 1, { color: ACCENT }));
  add(boxAt(-70, Y, -10, 1, 2, 4));
  add(boxAt(-70, Y, 5, 1, 2, 4));
  add(boxAt(-49, Y, -8, 1.2, 2.2, 1.2, { color: CHAR, grid: false }));
  add(boxAt(-49, Y, 3, 1.2, 2.2, 1.2, { color: CHAR, grid: false }));
  add(boxAt(-56, Y, -24.5, 1.2, 1.4, 4, { color: ACCENT }));
  add(boxAt(-56, Y, 18.5, 1.2, 1.4, 4, { color: ACCENT }));

  // ---- bot bay: lane floor + firing-line strip, pods with doors
  deco([-82, Y, -28], [-72, Y + 0.02, 22], { color: LANE, grid: true, edges: false });
  deco([-72.2, Y, -28], [-72, Y + 0.03, 22], { color: RED, emissive: 0.75, edges: false });
  const doors = [], alarms = [], beams = [];
  for (const z of [-17, -3, 11]) {
    box([-81.5, Y, z - 2.6], [-74, Y + 4.2, z - 2.2], { color: CHAR, grid: false });   // pod side walls
    box([-81.5, Y, z + 2.2], [-74, Y + 4.2, z + 2.6], { color: CHAR, grid: false });
    deco([-81.5, Y + 4.2, z - 2.6], [-74, Y + 4.3, z - 2.2], { color: RED, emissive: 0.8, noShadow: true });
    deco([-81.5, Y + 4.2, z + 2.2], [-74, Y + 4.3, z + 2.6], { color: RED, emissive: 0.8, noShadow: true });
    deco([-81.5, Y, z - 2.2], [-74, Y + 0.025, z + 2.2], { color: [0.25, 0.26, 0.3], edges: false });  // pod floor
    add(boxAt(-73.8, Y + 4.2, z, 0.5, 0.5, 5.2, { color: CHAR, grid: false }));         // gate beam
    const door = box([-74, Y, z - 2.2], [-73.6, Y + 4.2, z + 2.2], { color: [0.55, 0.57, 0.6], grid: false });
    door.closedY = Y;
    doors.push(door);
    const alarm = add(boxAt(-73.8, Y + 4.7, z, 0.4, 0.25, 0.8, { color: [0.4, 0.06, 0.05], emissive: 0.3, grid: false, solid: false, noShadow: true }));
    alarms.push(alarm);
    beams.push(z);
  }
  // bay back wall lights
  for (let z = -26; z <= 20; z += 4) deco([-81.88, Y + 1, z], [-81.8, Y + 4.5, z + 0.25], { color: [1, 0.96, 0.9], emissive: 1, noShadow: true });
  return { doors, alarms, button, buttonRing, screen };
}

// ---------------------------------------------------------------- main menu showroom
function buildShowroom(add) {
  const box = (min, max, o = {}) => add(makeBox(min, max, { grid: false, ...o }));
  const Y = -40, X = 300, Z = 332;
  const BLK = [0.06, 0.06, 0.07];
  box([X - 14, Y - 1, Z - 12], [X + 14, Y, Z + 8], { color: [0.09, 0.09, 0.1] });                   // floor
  box([X - 14, Y, Z + 5.5], [X + 14, Y + 9, Z + 6], { color: BLK });                                 // back wall
  box([X - 14, Y + 8, Z - 12], [X + 14, Y + 9, Z + 6], { color: BLK });                              // ceiling
  for (const sx of [-1, 1]) box([X + sx * 9 - 0.5, Y, Z - 12], [X + sx * 9 + 0.5, Y + 9, Z + 6], { color: BLK });   // side walls
  // turntable the character stands on
  box([X - 1.3, Y, Z - 1.3], [X + 1.3, Y + 0.12, Z + 1.3], { color: [0.14, 0.14, 0.16] });
  box([X - 1.1, Y + 0.12, Z - 1.1], [X + 1.1, Y + 0.14, Z + 1.1], { color: [0.2, 0.2, 0.22], solid: false });
  const ring = [];
  for (const [a, b, c, d] of [[-1.32, -1.3, -1.32, 1.32], [1.3, 1.32, -1.32, 1.32], [-1.32, 1.32, -1.32, -1.3], [-1.32, 1.32, 1.3, 1.32]]) {
    ring.push(box([X + a, Y + 0.02, Z + c], [X + b, Y + 0.1, Z + d], { color: [0.92, 0.1, 0.08], emissive: 1, solid: false, noShadow: true }));
  }
  // light panels on the back wall (class colour), bars on the side walls
  const panels = [];
  for (let i = -4; i <= 4; i++) {
    const x0 = X + i * 1.6 - 0.6;
    panels.push(box([x0, Y + 0.6, Z + 5.4], [x0 + 1.2, Y + 7.2, Z + 5.5], { color: [0.92, 0.1, 0.08], emissive: i % 2 ? 0.45 : 0.85, solid: false, noShadow: true }));
  }
  const bars = [];
  for (const sx of [-1, 1]) for (let y = 0.8; y < 7.5; y += 1.1) {
    bars.push(box([X + sx * 8.48 - 0.02, Y + y, Z - 6], [X + sx * 8.5, Y + y + 0.08, Z + 5], { color: [0.92, 0.1, 0.08], emissive: 1, solid: false, noShadow: true }));
  }
  // floor strips leading to the turntable
  for (const sx of [-1, 1]) ring.push(box([X + sx * 2.4 - 0.05, Y, Z - 10], [X + sx * 2.4 + 0.05, Y + 0.012, Z + 5], { color: [0.92, 0.1, 0.08], emissive: 0.8, solid: false, noShadow: true }));
  return { panels, bars, ring };
}

// ---------------------------------------------------------------- armoury
// A roofed room behind the south wall: dark painted walls with racks of guns, a polished floor with a walkway,
// lamp strips in the ceiling, the gunsmith's bench on the back wall, an ammo station by the door, signs over it all.
function buildArmoury(add, deco, S) {
  const box = (min, max, o = {}) => add(makeBox(min, max, { grid: false, ...o }));
  const { x0, x1, z0, z1, top, door, doorH } = AR;
  // floor, walls, roof
  box([x0 - 1, -1, S], [x1 + 1, 0, z1 + 1], { color: [0.24, 0.25, 0.27] });
  box([x0 - 1, 0, z1], [x1 + 1, top + 0.6, z1 + 1], { color: DARKP });
  box([x0 - 1, 0, S + 1], [x0, top + 0.6, z1], { color: DARKP });
  box([x1, 0, S + 1], [x1 + 1, top + 0.6, z1], { color: DARKP });
  box([x0 - 1, top, S], [x1 + 1, top + 0.6, z1 + 1], { color: [0.12, 0.12, 0.14], noShadow: true });
  // the doorway: a steel frame, yellow-and-black hazard stripes down both sides, and a sign over it on the range side
  for (const sx of [-1, 1]) {
    box([sx * door - 0.15, 0, S - 0.12], [sx * door + 0.15, doorH, S + 1.02], { color: [0.2, 0.2, 0.22], mat: 'metal' });
    for (let k = 0; k < 8; k++) deco([sx * door - 0.16, k * 0.5, S - 0.13], [sx * door + 0.16, k * 0.5 + 0.25, S - 0.12], { color: YELLOW, emissive: 0.15 });
  }
  box([-door - 0.15, doorH - 0.2, S - 0.12], [door + 0.15, doorH, S + 1.02], { color: [0.2, 0.2, 0.22], mat: 'metal' });
  box([-3.2, doorH + 0.25, S - 0.08], [3.2, doorH + 1.45, S], { color: [0.1, 0.1, 0.12] });
  blockText('ARMOURY', 0, doorH + 0.85, S - 0.09, 0.62, 'n', [1, 0.8, 0.2], 0.9).forEach(add);
  deco([-3.2, doorH + 0.22, S - 0.1], [3.2, doorH + 0.27, S - 0.08], { color: [1, 0.8, 0.2], emissive: 0.9 });
  // floor: a lighter walkway down the middle, a yellow line round the racks, the bench mat
  deco([-2.4, 0, S], [2.4, 0.012, z1 - 1.3], { color: [0.33, 0.34, 0.37], edges: false });
  for (const sx of [-1, 1]) deco([sx * 2.4 - 0.04, 0, S], [sx * 2.4 + 0.04, 0.016, z1 - 1.3], { color: YELLOW, emissive: 0.25, edges: false });
  deco([x0 + 1.2, 0, z1 - 1.25], [x1 - 1.2, 0.016, z1 - 1.17], { color: YELLOW, emissive: 0.25, edges: false });
  // walls: a dado rail and a lighter upper band, skirting
  for (const [a, b, c, d] of [[x0, z1 - 0.06, x1, z1], [x0, S + 1, x0 + 0.06, z1], [x1 - 0.06, S + 1, x1, z1]]) {
    deco([a, 0, b], [c, 0.3, d], { color: [0.1, 0.1, 0.11] });
    deco([a, 3.05, b], [c, 3.12, d], { color: [0.35, 0.36, 0.4], mat: 'metal' });
    deco([a, 3.12, b], [c, top, d], { color: [0.4, 0.41, 0.44] });
  }
  // the roof: steel beams across and three lamp strips (they light the room: see uRoom in the renderer)
  for (let z = S + 2; z < z1; z += 3) box([x0, top - 0.3, z - 0.12], [x1, top, z + 0.12], { color: [0.2, 0.2, 0.22], solid: false, mat: 'metal' });
  for (const x of [-7, 0, 7]) {
    deco([x - 0.35, top - 0.36, S + 1.5], [x + 0.35, top - 0.3, z1 - 0.5], { color: [0.15, 0.15, 0.16], mat: 'metal' });
    deco([x - 0.25, top - 0.38, S + 1.6], [x + 0.25, top - 0.36, z1 - 0.6], { color: [1, 0.97, 0.9], emissive: 1, noShadow: true });
  }
  // rack backboards (the panels hang in front of these) and a sign over each group
  const back = (min, max) => deco(min, max, { color: [0.2, 0.21, 0.23], mat: 'paint' });
  back([-11.7, 0.85, z1 - 0.05], [-1.9, 2.8, z1]);
  back([1.9, 0.85, z1 - 0.05], [11.7, 2.8, z1]);
  back([x0, 0.95, 35.4], [x0 + 0.05, 2.55, 44.6]);
  back([x1 - 0.05, 1.15, 38.9], [x1, 2.05, 43.5]);
  blockText('RIFLES + SMGS', -6.8, 3.55, z1 - 0.07, 0.36, 'n', [1, 1, 1], 0.7).forEach(add);
  blockText('SHOTGUNS + SNIPERS', 6.8, 3.55, z1 - 0.07, 0.36, 'n', [1, 1, 1], 0.7).forEach(add);
  blockText('MACHINE GUNS', x0 + 0.07, 3.55, 40, 0.36, 'e', [1, 1, 1], 0.7).forEach(add);
  blockText('SIDEARMS', x1 - 0.07, 2.55, 41.2, 0.26, 'w', [1, 1, 1], 0.7).forEach(add);
  blockText('GUNSMITH', 0, 3.55, z1 - 0.07, 0.3, 'n', [1, 0.8, 0.2], 0.8).forEach(add);
  // ammo station by the door: shelves of cans and a lit sign
  const ax = x1 - 0.45, az = 35.4;
  box([ax - 0.4, 0, az - 1.1], [ax + 0.4, 0.95, az + 1.1], { color: [0.29, 0.33, 0.2], mat: 'paint' });
  for (let k = 0; k < 4; k++) {
    box([ax - 0.3, 0.95, az - 0.95 + k * 0.5], [ax + 0.15, 1.15, az - 0.65 + k * 0.5], { color: [0.24, 0.27, 0.16], mat: 'paint', solid: false });
    deco([ax - 0.31, 1.03, az - 0.95 + k * 0.5], [ax + 0.16, 1.06, az - 0.65 + k * 0.5], { color: YELLOW, emissive: 0.1 });
  }
  box([ax + 0.3, 1.5, az - 0.8], [ax + 0.45, 2.1, az + 0.8], { color: [0.1, 0.1, 0.12] });
  blockText('AMMO', ax + 0.29, 1.8, az, 0.36, 'w', [0.4, 1, 0.45], 0.9).forEach(add);
  // crates stacked in the corners
  for (const [cx, cz, h] of [[x0 + 0.7, S + 1.8, 0.8], [x0 + 0.7, S + 2.8, 0.8], [x0 + 0.7, S + 2.3, 1.6]]) box([cx - 0.5, h - 0.8, cz - 0.45], [cx + 0.5, h, cz + 0.45], { color: [0.29, 0.33, 0.2], mat: 'paint', tex: 12 });
}

// ---------------------------------------------------------------- shooting booths
// Four lanes, each with a booth at the firing line: sound-baffle partitions between them (with the lane number on
// top), a counter to lean on, a lamp hood overhead and a box of mags on the counter.
function buildBooths(add, deco) {
  const box = (min, max, o = {}) => add(makeBox(min, max, { grid: false, ...o }));
  const P1 = [0.3, 0.32, 0.36], PAD = [0.42, 0.44, 0.5];
  for (const x of [-10, -5, 0, 5, 10]) {
    box([x - 0.06, 0, -1.4], [x + 0.06, 2.3, 1.2], { color: P1, mat: 'metal' });
    for (const sx of [-1, 1]) deco([x + sx * 0.06, 0.4, -1.25], [x + sx * 0.075, 2.1, 1.05], { color: PAD, mat: 'cloth' });   // acoustic pads
    deco([x - 0.065, 2.3, -1.42], [x + 0.065, 2.36, 1.22], { color: YELLOW, emissive: 0.3 });
  }
  [-7.5, -2.5, 2.5, 7.5].forEach((x, i) => {
    // the counter: a steel frame and a worn wooden top, a mag box on it
    box([x - 1.6, 0, -1.25], [x + 1.6, 1.0, -0.9], { color: [0.26, 0.27, 0.3], mat: 'metal' });
    box([x - 1.65, 1.0, -1.3], [x + 1.65, 1.06, -0.75], { color: [0.45, 0.35, 0.24], mat: 'wood' });
    box([x + 1.2, 1.06, -1.15], [x + 1.6, 1.16, -0.9], { color: [0.29, 0.33, 0.2], mat: 'paint', solid: false });
    // lamp hood and the lane number on a plate above it
    box([x - 1.6, 2.6, -1.4], [x + 1.6, 2.75, 0.4], { color: [0.18, 0.18, 0.2], mat: 'metal', solid: false });
    deco([x - 1.4, 2.58, -1.2], [x + 1.4, 2.6, 0.2], { color: [1, 0.97, 0.9], emissive: 1, noShadow: true });
    box([x - 0.5, 2.75, -1.42], [x + 0.5, 3.45, -1.36], { color: [0.12, 0.12, 0.14] });
    digitBoxes(String(i + 1), x - 0.15, 2.85, -1.335, 0.5, 1, [1, 0.8, 0.2], 0.9).forEach(add);
    // lane number painted big on the floor just past the line
    deco([x - 0.6, 0, -3.2], [x + 0.6, 0.024, -2.0], { color: [0.3, 0.31, 0.34], edges: false });
  });
  // the walkway behind the booths: yellow edge lines
  deco([-10, 0, 1.2], [10, 0.02, 1.3], { color: YELLOW, emissive: 0.25, edges: false });
}
