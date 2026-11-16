// Vector Protocol — palette, teams, round and economy constants. Shared single source.
export const PALETTE = {
  sky: 0x24374c,
  fog: 0x24374c,
  ground: 0x39434d,
  wallA: 0x55616d,
  wallB: 0x47535f,
  crate: 0x6b7d6e,
  crateEdge: 0x2c3a31,
  accentAmber: 0xffb347, // VOLT (player team)
  accentCyan: 0x4fd8eb,  // HELIX (enemy team)
  spike: 0xff5d5d,
  site: 0x8fd8a0,
  lightWarm: 0xffe8c8,
  lightCool: 0xbfd9e8,
};

export const TEAM = { VOLT: 1, HELIX: 2 };

export const ROUND = {
  WIN_ROUNDS: 5,
  BUY_TIME: 10,        // seconds of buy phase
  ROUND_TIME: 115,     // seconds of live phase
  BOMB_TIME: 40,       // spike detonation timer
  DEFUSE_TIME: 5,
  PLANT_TIME: 3.2,
  END_PAUSE: 4,        // banner time before next round
};

export const MONEY = {
  START: 800,
  MAX: 9000,
  KILL: 300,
  WIN: 3250,
  LOSS: 1900,
  LOSS_BONUS_STEP: 500,
  PLANT_BONUS: 800,
};

// Shop catalog. kind: primary = takes slot 1; grenade = consumable, max 2.
export const SHOP = [
  { id: 'smg',     name: 'Viper SMG',    price: 1250, kind: 'primary', tag: 'fast, low damage' },
  { id: 'carbine', name: 'MK-4 Carbine', price: 2700, kind: 'primary', tag: 'balanced auto' },
  { id: 'rifle',   name: 'LR-84 DMR',    price: 4300, kind: 'primary', tag: 'semi-auto, high damage' },
  { id: 'grenade', name: 'Frag Grenade', price: 500,  kind: 'grenade', tag: ' thrown with G' },
];
