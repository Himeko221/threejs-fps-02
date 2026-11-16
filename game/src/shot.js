// Vector Protocol — screenshot staging via ?shot=<mode> query param.
// Same pattern as the kit starter's shots.json: deterministic game states rendered
// by the game's own systems for capture. No editing of pixels anywhere.
import { TEAM, ROUND } from './palette.js';
import { SITES, SPAWNS } from './world.js';
import { WEAPONS } from './tuning.js';

export function shotMode() {
  const q = new URLSearchParams(location.search);
  return q.get('shot');
}

// Stages the requested state after the sim exists. Returns the mode or null.
export function stageShot(sim, hud) {
  const mode = shotMode();
  if (!mode) return null;

  // every staged mode starts a real match first
  sim.started = true;
  sim.startMatch();
  sim.input.locked = true; // headless: no user gesture; game listeners behave as locked
  hud.banner('', '', false); // clear any round banner

  if (mode === 'buy') {
    hud.showMenu(false);
    hud.showBuy(true);
    hud.renderBuy(sim.player);
    sim.buyOpen = true;
    return mode;
  }

  hud.showMenu(false);

  if (mode === 'combat') {
    // live round, mid fight: player at mid aiming at two HELIX bots, one friendly pushing
    sim.phase = 'live';
    sim.phaseT = 74;
    const p = sim.player;
    p.pos.set(-2, 0, 8);
    p.yaw = Math.PI * 0.08;
    p.pitch = -0.03;
    p.money = 3400;
    p.hp = 87;
    p.weapons[1] = 'carbine';
    p.activeSlot = 1;
    sim.weapons.equipLoadout(p);
    // enemies ahead, IN VIEW of the camera
    const e1 = sim.actors[1], e2 = sim.actors[2];
    e1.pos.set(-6, 0, -4); e1.yaw = Math.PI * 0.95;
    e2.pos.set(5, 0, -7); e2.yaw = Math.PI * 0.9;
    // friendlies flanking, also in view
    sim.actors[5].pos.set(-10, 0, 2);
    sim.actors[6].pos.set(9, 0, 1);
    // a bot mid-fire: force a tracer from e1 toward player
    sim.roundCtx.now = 1;
    sim.weapons.tryFire(e1, sim.actors, sim.colliders, 1, null);
    // score mid-match
    sim.score[TEAM.VOLT] = 2;
    sim.score[TEAM.HELIX] = 1;
    hud.setScore(2, 1);
    hud.setObjective('ELIMINATE HELIX SQUAD', '');
    return mode;
  }

  if (mode === 'planted') {
    sim.phase = 'live';
    sim.phaseT = 31;
    const p = sim.player;
    p.pos.set(-18.5, 0, -5.5);
    p.yaw = Math.PI * 0.27;
    p.pitch = 0.08;
    p.money = 5750;
    p.weapons[1] = 'rifle';
    p.activeSlot = 1;
    sim.weapons.equipLoadout(p);
    sim.spike.plant({ x: -22, y: 0, z: -9 }, 'A');
    sim.roundCtx.spikePlanted = true;
    sim.roundCtx.spikeSite = 'A';
    sim.roundCtx.spikePos = sim.spike.pos;
    sim.score[TEAM.VOLT] = 3;
    sim.score[TEAM.HELIX] = 3;
    hud.setScore(3, 3);
    hud.setObjective('SPIKE PLANTED — DEFEND', 'defuse');
    // defender bot rotating toward site, in view; teammate holding angle
    sim.actors[3].pos.set(-20, 0, -13);
    sim.actors[3].yaw = Math.PI * 0.3;
    sim.actors[5].pos.set(-25, 0, -7);
    sim.actors[5].yaw = -Math.PI * 0.4;
    return mode;
  }

  if (mode === 'menu') return 'menu';
  return mode;
}
