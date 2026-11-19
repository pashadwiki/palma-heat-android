// config.js — every shared constant for Palma Heat: world geometry, road grid,
// tuning values and the golden-hour palette. One place to tune the whole game.

export const CFG = {
  // World and road grid. Avenues run north-south, streets run east-west.
  worldW: 3520,
  worldH: 2440,
  avenueX: [240, 720, 1200, 1680, 2160, 2640, 3120],
  streetY: [200, 600, 1000, 1400, 1800, 2200],
  roadHalf: 48, // half the width of a road, centre line to kerb
  blockMargin: 14, // sidewalk band between a block's edge and the kerb
  laneOffset: 24, // keep-right lane centre, offset from the road centre line

  // The coast: promenade, then sand, then open water at the east edge.
  beachX: 3268,
  waterX: 3380,

  // Simulation.
  step: 1 / 60,

  // Player.
  walkSpeed: 178,
  playerRadius: 9,

  // Nitro.
  nitroDrain: 0.38, // meter per second while boosting
  nitroRefill: 0.13, // meter per second while not boosting
  nitroAccelMul: 1.85,
  nitroTopMul: 1.45,
  nitroHeatPerSecond: 9, // heat gained per second of boosting in police sight
  nitroSightRange: 330,

  // Wanted system.
  heatMax: 500,
  heatDecayPerSecond: 6, // heat shed per second once the police lose sight
  loseSightAfter: 5, // seconds out of sight before decay starts
  bustedSeconds: 2.4, // time pinned at low speed before the run ends
  bustedRange: 36,
  bustedSpeed: 28,
  witnessRange: 250, // a crime seen from this close counts as witnessed
  witnessMul: 1.6,

  // Crime heat values.
  crimeTheftWitnessedBase: 22,
  crimeTheftParkedBase: 14,
  crimeCarHit: 16,
  crimePedHit: 70,
  crimeRoadblockSmash: 55,

  // Camera.
  baseZoom: 1,
  nitroZoom: 1.07,
};

// Golden-hour palette: dusk plum roads, amber light, teal-dusk water.
export const COLORS = {
  grass: '#77913f',
  grassDark: '#6b8438',
  sidewalk: '#a3906f',
  parking: '#5d5560',
  road: '#453a47',
  roadEdge: '#cbb98a',
  laneDash: '#e6d492',
  crosswalk: '#ddd6c2',
  sand: '#e7c887',
  waterDeep: '#1d5d7d',
  waterShallow: '#2f7ea3',
  buildingShadow: 'rgba(46,18,44,0.35)',
  amberWashTop: 'rgba(255,150,52,0.10)',
  amberWashBottom: 'rgba(96,32,84,0.14)',
  sunGlow: 'rgba(255,183,84,0.20)',
  lampHalo: 'rgba(255,205,110,0.28)',
  beam: 'rgba(255,214,92,0.5)',
  hudPanel: 'rgba(16,10,22,0.72)',
  hudText: '#fdf6e3',
  hudDim: '#cbbfa5',
  gold: '#ffc93c',
  danger: '#ff5347',
  nitro: '#ffb347',
  carBar: '#7dd069',
};

// Building facade colours, picked per building from the city seed.
export const BUILDING_COLORS = [
  '#c96f4a', '#b8574f', '#d9a05b', '#8f6fb8', '#5b8fb8',
  '#67a06a', '#c2b280', '#a05b7d', '#71879e', '#cf8450',
];

// Car paint colours for civilian cars.
export const CAR_COLORS = [
  '#c94f42', '#3f6fb5', '#e0a83c', '#5da85f', '#e8e4da',
  '#7a4f9e', '#3fa8a0', '#d4722c', '#59606e', '#b03a5b',
];
