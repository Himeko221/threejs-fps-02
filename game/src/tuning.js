// Vector Protocol — combat tuning tables. Weapons, damage, movement constants.
export const WEAPONS = {
  pistol: {
    name: 'P9 Sidearm', slot: 2, price: 0,
    auto: false, rpm: 300, mag: 12, reserve: 36, reload: 1.6,
    damage: 26, falloff: 0.85, hsMult: 3.0, legMult: 0.75,
    spreadBase: 0.010, spreadMove: 0.045, spreadJump: 0.11, recoilKick: 0.011,
    range: 60, pellets: 1, tracer: 0xffd9a0,
  },
  smg: {
    name: 'Viper SMG', slot: 1, price: 1250,
    auto: true, rpm: 830, mag: 26, reserve: 78, reload: 2.1,
    damage: 22, falloff: 0.7, hsMult: 2.6, legMult: 0.8,
    spreadBase: 0.014, spreadMove: 0.05, spreadJump: 0.12, recoilKick: 0.008,
    range: 42, pellets: 1, tracer: 0xc7f0ff,
  },
  carbine: {
    name: 'MK-4 Carbine', slot: 1, price: 2700,
    auto: true, rpm: 620, mag: 30, reserve: 90, reload: 2.4,
    damage: 33, falloff: 0.85, hsMult: 3.2, legMult: 0.75,
    spreadBase: 0.007, spreadMove: 0.06, spreadJump: 0.14, recoilKick: 0.012,
    range: 80, pellets: 1, tracer: 0xffe2b0,
  },
  rifle: {
    name: 'LR-84 DMR', slot: 1, price: 4300,
    auto: false, rpm: 240, mag: 10, reserve: 40, reload: 2.6,
    damage: 70, falloff: 0.95, hsMult: 2.6, legMult: 0.8,
    spreadBase: 0.0025, spreadMove: 0.075, spreadJump: 0.16, recoilKick: 0.02,
    range: 120, pellets: 1, tracer: 0xfff0c8,
  },
};

// Movement (units: meters). Acceleration model: friction + accel toward wish dir.
export const MOVE = {
  eyeHeight: 1.62,
  crouchEye: 1.08,
  radius: 0.42,
  height: 1.8,
  crouchHeight: 1.2,
  walkSpeed: 2.6,
  runSpeed: 5.4,
  crouchSpeed: 2.0,
  accel: 46,
  airAccel: 9,
  friction: 9.5,
  gravity: 18,
  jumpVel: 6.4,
};

// Bot shared tuning.
export const BOT = {
  reactionMin: 0.22,
  reactionMax: 0.55,
  fireBurstMin: 2,
  fireBurstMax: 6,
  aimJitter: 0.035,
  aimSmooth: 7.5,
  fovDot: 0.55,        // cos threshold for vision cone
  viewDist: 55,
  hearingDist: 26,
};

export const HEAD = { y: 1.52, r: 0.17 };   // head sphere center offset from feet
export const BODY = { y: 0.9, rx: 0.26, rz: 0.34 }; // body capsule approx

export const DMG = {
  leg: 0.75,
  armorHead: 0.65, // helmet reduces head dmg
  armorBody: 0.75, // vest reduces body dmg
};

export const GRENADE = {
  speed: 17,
  radius: 6.5,
  damage: 96,
  fuse: 1.7,
  gravity: 14,
  selfMin: 0.35,
};
