// Vector Protocol — fixed-step simulation: rounds, economy, combat resolution, win conditions.
// The sim owns authoritative game state; rendering reads from it.
import * as THREE from 'three';
import { TEAM, ROUND, MONEY, SHOP } from './palette.js';
import { MOVE, WEAPONS, GRENADE } from './tuning.js';
import { buildMap, SITES, SPAWNS } from './world.js';
import { makeActor, eyeY } from './actors.js';
import { WeaponSystem, eyePosInto, dirFromYawPitch } from './weapon.js';
import { BotDirector, nearestWaypoint } from './bots.js';
import { Spike } from './spike.js';
import { Grenades } from './grenades.js';
import { Effects } from './effects.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { initAudio, resumeAudio } from './audio.js';
import { stageShot } from './shot.js';

export const SIM_DT = 1 / 60;

export class Sim {
  constructor(scene, camera, canvas) {
    this.scene = scene;
    this.camera = camera;
    this.colliders = buildMap(scene);
    this.spike = new Spike(scene);
    this.grenades = new Grenades(scene, this.colliders);
    this.fx = new Effects(scene);
    this.weapons = new WeaponSystem(scene, camera);
    this.director = new BotDirector(this.colliders);
    this.input = new Input(canvas);
    this.hud = new HUD();
    this.actors = [];
    this.player = null;
    this.phase = 'buy'; // buy | live | end
    this.phaseT = ROUND.BUY_TIME;
    this.roundNo = 1;
    this.score = { [TEAM.VOLT]: 0, [TEAM.HELIX]: 0 };
    this.lossStreak = { [TEAM.VOLT]: 0, [TEAM.HELIX]: 0 };
    this.roundCtx = { now: 0, spikePlanted: false, spikeSite: null, spikePos: null };
    this.matchOver = false;
    this.winner = null;
    this.time = 0;
    this.started = false;
    this.buyOpen = false;
  }

  startMatch() {
    // spawn player + 4 enemy bots + 4 friendly bots
    this.player = makeActor(TEAM.VOLT, 0, 'You', true);
    resetActorLoadout(this.player, 'carbine');
    this.actors = [this.player];
    for (let i = 1; i <= 4; i++) {
      const bot = makeActor(TEAM.HELIX, i, 'Helix-' + i, false);
      resetActorLoadout(bot, 'carbine');
      this.actors.push(bot);
    }
    for (let i = 5; i <= 8; i++) {
      const bot = makeActor(TEAM.VOLT, i, 'Volt-' + i, false);
      resetActorLoadout(bot, 'smg');
      this.actors.push(bot);
    }
    for (const actor of this.actors) {
      if (!actor.isPlayer) this.scene.add(actor.mesh);
    }
    this.beginRound(true);
  }

  beginRound(first = false) {
    this.phase = 'buy';
    this.phaseT = ROUND.BUY_TIME;
    this.roundCtx.spikePlanted = false;
    this.spike.reset();
    this.grenades.clear();
    // reset actors to spawns
    let ai = 0;
    for (const actor of this.actors) {
      const spawn = actor.team === TEAM.VOLT ? SPAWNS.attack : SPAWNS.defend;
      const s = spawn[ai % spawn.length];
      actor.pos.set(s[0], 0, s[1]);
      actor.alive = true;
      resetActorLoadout(actor, actor.isPlayer ? 'carbine' : (actor.team === TEAM.VOLT ? 'smg' : 'carbine'));
      ai++;
    }
    this.weapons.reset();
    this.hud.setScore(this.score[TEAM.VOLT], this.score[TEAM.HELIX]);
    this.hud.setObjective(this.phase === 'buy' ? 'BUY PHASE — B to open shop' : '');
  }

  // ===== main fixed-step update =====
  update(dt) {
    if (this.matchOver) return;
    this.time += dt;
    this.roundCtx.now = this.time;

    if (this.phase === 'buy') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        this.phase = 'live';
        this.hud.setObjective('');
      }
    } else if (this.phase === 'end') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) this.afterRoundPause();
    }

    // player input-driven actions
    this.updatePlayer(dt);

    // bots
    for (const actor of this.actors) {
      if (actor.isPlayer || !actor.alive) continue;
      this.director.think(actor, this.actors, this.roundCtx);
      this.director.drive(actor, this.actors, dt, this.roundCtx, this.weapons, this.fxCallbacks());
    }

    // live-phase round timer
    if (this.phase === 'live' && this.spike.state !== 'planted') {
      this.phaseT -= dt;
    }

    // spike
    if (this.spike.state === 'planted') {
      const boom = this.spike.tick(dt);
      if (boom) this.explodeSpike();
    }

    // grenades
    this.grenades.update(dt, this.actors, this.roundCtx, this.fxCallbacks());

    // round win conditions
    this.checkRoundEnd();

    // fx decay
    this.fx.update(dt);
  }

  fxCallbacks() {
    return {
      onHit: (from, victim, zone, dmg, dist) => {
        if (!victim.isPlayer) {
          victim.hp -= dmg;
          if (victim.hp <= 0) {
            victim.alive = false;
            victim.deaths++;
            from.kills++;
            from.money = Math.min(MONEY.MAX, from.money + MONEY.KILL);
            this.fx.spawnBlood(victim.pos);
            this.hud.killfeedRow(from.name, victim.name, from.isPlayer ? 'rifle' : 'rifle', zone === 'head');
          }
        } else {
          this.hud.flashDamage();
          victim.hp -= dmg;
          if (victim.hp <= 0) {
            victim.alive = false;
            victim.deaths++;
            from.kills++;
            this.fx.spawnBlood(victim.pos);
            this.hud.killfeedRow(from.name, victim.name, 'rifle', zone === 'head');
          }
        }
      },
      onFire: (actor) => {
        this.fx.spawnMuzzle(actor.pos);
      },
    };
  }

  updatePlayer(dt) {
    const p = this.player;
    if (!p.alive) return;
    const input = this.input;

    // look
    const m = input.takeMouse();
    p.yaw -= m.dx * input.sens;
    p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch + m.dy * input.sens));

    // movement intent
    let wx = 0, wz = 0;
    if (input.down('KeyW')) wz -= 1;
    if (input.down('KeyS')) wz += 1;
    if (input.down('KeyA')) wx -= 1;
    if (input.down('KeyD')) wx += 1;
    const speed = p.crouch ? MOVE.crouchSpeed : MOVE.runSpeed;
    if (wx || wz) {
      const len = Math.hypot(wx, wz);
      wx = (wx / len) * speed * dt;
      wz = (wz / len) * speed * dt;
    }
    this.moveActor(p, wx, wz);

    // fire
    if (input.fireQueued) {
      input.fireQueued = false;
      this.weapons.tryFire(p, this.actors, this.colliders, this.time, this.fxCallbacks());
    }

    // reload
    if (input.down('KeyR')) this.weapons.startReload(p);

    // weapon switch
    for (let i = 1; i <= 3; i++) {
      if (input.down('Digit' + i)) this.switchWeapon(p, i);
    }

    // grenade throw
    if (input.down('KeyG') && p.grenades > 0) {
      p.grenades--;
      this.grenades.throw(p);
    }

    // plant / defuse
    if (input.down('KeyE')) this.tryObjective(p, dt);
  }

  moveActor(actor, wx, wz) {
    // collide-and-slide against map colliders
    const r = MOVE.radius;
    let nx = actor.pos.x + wx;
    let nz = actor.pos.z + wz;
    for (const c of this.colliders) {
      // push out of expanded boxes
      const cx = Math.max(c.min[0] - r, Math.min(nx, c.max[0] + r));
      const cz = Math.max(c.min[2] - r, Math.min(nz, c.max[2] + r));
      const dx = nx - cx, dz = nz - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r && c.max[1] > actor.pos.y && c.min[1] < actor.pos.y + MOVE.height) {
        const d = Math.sqrt(d2) || 0.001;
        nx = cx + (dx / d) * r;
        nz = cz + (dz / d) * r;
      }
    }
    actor.pos.x = nx;
    actor.pos.z = nz;
  }

  switchWeapon(actor, slot) {
    if (actor.weapons[slot]) {
      actor.activeSlot = slot;
    }
  }

  tryObjective(actor, dt) {
    if (this.phase !== 'live') return;
    if (actor.team === TEAM.VOLT && actor.hasSpike) {
      const site = this.spike.inSite(actor.pos.x, actor.pos.z);
      if (site) {
        this.objT = (this.objT || 0) + dt;
        this.hud.setObjective(`PLANTING SPIKE — SITE ${site} ${Math.round((this.objT / ROUND.PLANT_TIME) * 100)}%`, '');
        if (this.objT >= ROUND.PLANT_TIME) {
          this.objT = 0;
          this.spike.plant(actor.pos, site);
          actor.hasSpike = false;
          this.roundCtx.spikePlanted = true;
          this.spikePlantedThisRound = true;
          this.roundCtx.spikeSite = site;
          this.roundCtx.spikePos = this.spike.pos;
          this.hud.setObjective('SPIKE PLANTED — DEFEND IT', 'defuse');
        }
      } else {
        this.objT = 0;
        this.hud.setObjective('CARRYING SPIKE — GO TO SITE A / B', '');
      }
    } else if (actor.team === TEAM.HELIX && this.spike.state === 'planted') {
      const d = Math.hypot(actor.pos.x - this.spike.pos.x, actor.pos.z - this.spike.pos.z);
      if (d < 1.6) {
        this.objT = (this.objT || 0) + dt;
        this.hud.setObjective(`HELIX IS DEFUSING ${Math.round((this.objT / ROUND.DEFUSE_TIME) * 100)}%`, 'defuse');
        if (this.objT >= ROUND.DEFUSE_TIME) {
          this.objT = 0;
          this.spike.state = 'defused';
          this.spike.clear();
          this.roundCtx.spikePlanted = false;
        }
      } else {
        this.objT = 0;
      }
    }
  }

  checkRoundEnd() {
    const alive1 = this.actors.filter((a) => a.team === TEAM.VOLT && a.alive).length;
    const alive2 = this.actors.filter((a) => a.team === TEAM.HELIX && a.alive).length;
    this.hud.setAlive(alive1, alive2);

    if (this.phase !== 'live') return;
    if (this.spike.state === 'exploded') { this.endRound(TEAM.VOLT, 'spike'); return; }
    if (this.spike.state === 'defused') { this.endRound(TEAM.VOLT, 'defuse'); return; }
    if (alive2 === 0) {
      // attackers win by elimination unless spike planted (must still defend/detonate is CS-style: elimination ends it)
      this.endRound(TEAM.VOLT, 'elimination');
    } else if (alive1 === 0) {
      // defenders win if spike not planted; if planted and attackers dead, defenders still must defuse — simplify: round to defenders
      this.endRound(TEAM.HELIX, 'elimination');
    } else if (this.phaseT <= 0) {
      // time out: defenders hold
      this.endRound(TEAM.HELIX, 'time');
    }
  }

  endRound(winner, how) {
    if (this.phase === 'end') return;
    this.phase = 'end';
    this.phaseT = ROUND.END_PAUSE;
    this.score[winner]++;
    // economy: round rewards
    for (const a of this.actors) {
      if (!a.alive) continue;
      let inc = winner === a.team ? MONEY.WIN : MONEY.LOSS;
      if (a.team === TEAM.VOLT && (this.spike.state === 'exploded' || this.spikePlantedThisRound)) inc += MONEY.PLANT_BONUS;
      a.money = Math.min(MONEY.MAX, a.money + inc);
    }
    this.spikePlantedThisRound = false;
    this.hud.setScore(this.score[TEAM.VOLT], this.score[TEAM.HELIX]);
    const playerWon = winner === TEAM.VOLT;
    const label = how === 'spike' ? (playerWon ? 'SPIKE DEFUSED' : 'SPIKE DETONATED')
      : (playerWon ? 'ROUND WON' : 'ROUND LOST');
    if (playerWon) this.hud.banner(label, 'win', true);
    else this.hud.banner(label, 'lose', true);
    const done = this.score[TEAM.VOLT] >= ROUND.WIN_ROUNDS || this.score[TEAM.HELIX] >= ROUND.WIN_ROUNDS;
    this.pendingNext = done ? 'match' : 'round';
  }

  afterRoundPause() {
    this.hud.banner('', '', false);
    if (this.pendingNext === 'match') {
      this.matchOver = true;
      this.winner = this.score[TEAM.VOLT] > this.score[TEAM.HELIX] ? TEAM.VOLT : TEAM.HELIX;
      this.hud.showEnd(true);
      this.hud.el.endTitle.textContent = this.winner === TEAM.VOLT ? 'VICTORY' : 'DEFEAT';
      this.hud.el.endSub.textContent = `Final score ${this.score[TEAM.VOLT]} : ${this.score[TEAM.HELIX]}.`;
      this.input.unlock();
    } else {
      this.beginRound();
    }
  }

  resetMatch() {
    this.score = { [TEAM.VOLT]: 0, [TEAM.HELIX]: 0 };
    this.roundNo = 1;
    this.matchOver = false;
    this.winner = null;
    this.spike.reset();
    this.beginRound(true);
  }

  explodeSpike() {
    // spike detonation: heavy damage in radius
    this.fx.spawnExplosion(this.spike.pos);
    for (const actor of this.actors) {
      if (!actor.alive) continue;
      const d = Math.hypot(actor.pos.x - this.spike.pos.x, actor.pos.z - this.spike.pos.z);
      if (d < GRENADE.radius) {
        const dmg = Math.round(GRENADE.damage * (1 - d / GRENADE.radius));
        actor.hp -= dmg;
        if (actor.hp <= 0) actor.alive = false;
      }
    }
    this.spike.clear();
    this.roundCtx.spikePlanted = false;
  }
}

function resetActorLoadout(actor, primaryId) {
  const spec = WEAPONS[primaryId];
  actor.weapons = { 1: primaryId, 2: 'pistol' };
  actor.magState = { 1: { mag: spec.mag, reserve: spec.reserve }, 2: { mag: 12, reserve: 36 } };
  actor.activeSlot = 1;
}
