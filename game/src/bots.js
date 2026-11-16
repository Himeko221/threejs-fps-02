// Vector Protocol — bot AI: waypoint navigation, vision, combat, objective play.
// Bots think on a slow tick (10 Hz) but move every fixed step.
import * as THREE from 'three';
import { SITES, SPAWNS } from './world.js';
import { TEAM, ROUND } from './palette.js';
import { BOT, MOVE, WEAPONS, HEAD } from './tuning.js';
import { raycastWorld } from './physics.js';
import { eyePos, eyeY } from './actors.js';

// Waypoint graph: hand-placed nodes covering lanes, sites, spawns.
const WAYPOINTS = [
  // attack spawn area
  { p: [-8, 20], n: [1, 2, 3] },
  { p: [0, 20.5], n: [0, 2, 4] },
  { p: [8, 20], n: [0, 1, 4] },
  { p: [-4, 17], n: [0, 1, 5] },
  { p: [4, 17], n: [1, 2, 5] },
  // mid approach
  { p: [0, 12], n: [3, 4, 6, 7] },
  { p: [-7, 8], n: [5, 8] },
  { p: [7, 8], n: [5, 9] },
  // left lane to A
  { p: [-14, 6], n: [6, 10, 12] },
  // right lane to B
  { p: [14, 6], n: [7, 11, 13] },
  { p: [-16, 0], n: [8, 12, 14] },
  { p: [16, 0], n: [9, 13, 15] },
  { p: [-14, -6], n: [10, 14] },
  { p: [14, -6], n: [11, 15] },
  // site A
  { p: [-20, -8], n: [12, 16, 17] },
  // site B
  { p: [20, 8], n: [13, 18, 19] },
  { p: [-24, -12], n: [14] },
  { p: [-18, -13], n: [14] },
  { p: [24, 12], n: [15] },
  { p: [18, 13], n: [15] },
  // defender backfield
  { p: [-8, -16], n: [12, 20] },
  { p: [8, -16], n: [13, 20] },
  { p: [0, -18], n: [20, 21] },
];

// nearest waypoint index to (x, z) — used at repath time, not per frame
export function nearestWaypoint(x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < WAYPOINTS.length; i++) {
    const w = WAYPOINTS[i].p;
    const d = (w[0] - x) ** 2 + (w[1] - z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// BFS over the small graph; returns array of waypoint indices from a to b (inclusive).
function findPath(a, b) {
  if (a === b) return [a];
  const prev = new Array(WAYPOINTS.length).fill(-1);
  const q = [a];
  prev[a] = a;
  while (q.length) {
    const cur = q.shift();
    for (const nb of WAYPOINTS[cur].n) {
      if (prev[nb] !== -1) continue;
      prev[nb] = cur;
      if (nb === b) {
        const path = [b];
        let c = b;
        while (c !== a) { c = prev[c]; if (c !== a) path.unshift(c); }
        path.unshift(a);
        return path;
      }
      q.push(nb);
    }
  }
  return [a];
}

// straight-line walkability: sample a few heights along the segment
function walkable(ax, az, bx, bz, colliders) {
  const steps = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / 1.5));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    // any collider blocking torso height at this point?
    for (const c of colliders) {
      if (c.max[1] < 0.6) continue; // low pad, walkable over
      if (x > c.min[0] - 0.45 && x < c.max[0] + 0.45 && z > c.min[2] - 0.45 && z < c.max[2] + 0.45 && c.min[1] < 1.4) {
        return false;
      }
    }
  }
  return true;
}

export class BotDirector {
  constructor(colliders) {
    this.colliders = colliders;
    this.thinkT = 0;
  }

  // one bot's slow think: pick goals, paths, targets
  think(bot, actor, actors, roundCtx) {
    const b = actor.bot;
    const enemies = actors.filter((a) => a.alive && a.team !== actor.team);
    const mates = actors.filter((a) => a.alive && a.team === actor.team && a !== actor);

    // vision check against current target
    if (b.target && (!b.target.alive || b.target.team === actor.team)) b.target = null;

    let seen = null;
    for (const e of enemies) {
      if (this.canSee(actor, e)) { seen = e; break; }
    }
    if (seen) {
      if (b.target !== seen) {
        b.target = seen;
        b.reactT = BOT.reactionMin + Math.random() * (BOT.reactionMax - BOT.reactionMin);
      }
      b.lastSeen = { x: seen.pos.x, z: seen.pos.z };
    } else if (b.target) {
      // keep chasing last seen briefly
      b.holdT += 1;
      if (b.holdT > 12) { b.target = null; b.holdT = 0; }
    }

    // objective goals
    const attacking = actor.team === TEAM.VOLT; // VOLT attacks (spike side)
    if (!b.target) {
      b.state = 'move';
      if (attacking) {
        if (actor.hasSpike) {
          // carry toward chosen site
          if (!b.goal) b.goal = this.pickSite(actor, roundCtx);
          const site = SITES[b.goal];
          if (Math.hypot(actor.pos.x - site.x, actor.pos.z - site.z) < site.r * 0.7) {
            b.state = 'plant';
          } else this.ensurePath(actor, site.x, site.z);
        } else {
          // escort spike carrier or push a site
          const carrier = actors.find((a) => a.alive && a.team === actor.team && a.hasSpike);
          if (carrier && carrier !== actor) {
            this.ensurePath(actor, carrier.pos.x, carrier.pos.z);
          } else {
            const site = SITES[this.pickSite(actor, roundCtx)];
            this.ensurePath(actor, site.x, site.z);
          }
        }
      } else {
        // defenders: hold near sites, rotate on spike plant info
        if (roundCtx.spikePlanted && roundCtx.spikeSite) {
          const site = SITES[roundCtx.spikeSite];
          if (Math.hypot(actor.pos.x - site.x, actor.pos.z - site.z) > site.r) {
            this.ensurePath(actor, site.x, site.z);
          } else {
            b.state = 'defend';
            if (roundCtx.spikeBeingDefused) {
              // contest defuse: walk to spike
              this.ensurePath(actor, roundCtx.spikePos.x, roundCtx.spikePos.z);
            }
          }
        } else {
          // split between sites
          if (!b.goal) b.goal = Math.random() < 0.5 ? 'A' : 'B';
          const site = SITES[b.goal];
          const d = Math.hypot(actor.pos.x - site.x, actor.pos.z - site.z);
          if (d > site.r + 2) this.ensurePath(actor, site.x, site.z);
          else {
            b.state = 'hold';
            if (b.path.length === 0 && Math.random() < 0.02) {
              // small idle shuffle
              this.ensurePath(actor, site.x + (Math.random() - 0.5) * 4, site.z + (Math.random() - 0.5) * 4);
            }
          }
        }
      }
    } else {
      b.state = 'combat';
    }
  }

  pickSite(actor, roundCtx) {
    // prefer the site with fewer enemies seen recently; random otherwise
    return Math.random() < 0.5 ? 'A' : 'B';
  }

  ensurePath(actor, x, z) {
    const b = actor.bot;
    b.repathT -= 1;
    if (b.path.length && b.goalX === x && b.goalZ === z && b.repathT > 0) return;
    b.goalX = x; b.goalZ = z;
    b.repathT = 20;
    const from = nearestWaypoint(actor.pos.x, actor.pos.z);
    const to = nearestWaypoint(x, z);
    let path = findPath(from, to);
    // prune: skip waypoints we can walk straight to
    const pruned = [];
    let cx = actor.pos.x, cz = actor.pos.z;
    for (let i = 0; i < path.length; i++) {
      const wp = WAYPOINTS[path[i]].p;
      if (pruned.length > 0 && walkable(cx, cz, wp[0], wp[1], this.colliders)) continue;
      pruned.push(path[i]);
      cx = wp[0]; cz = wp[1];
    }
    if (pruned.length === 0) pruned.push(from);
    b.path = pruned;
    b.pathIdx = 0;
  }

  canSee(actor, target) {
    const dx = target.pos.x - actor.pos.x;
    const dz = target.pos.z - actor.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > BOT.viewDist) return false;
    // FOV cone
    const fx = -Math.sin(actor.yaw), fz = -Math.cos(actor.yaw);
    const dot = (dx * fx + dz * fz) / (dist || 1);
    if (dist > 3 && dot < BOT.fovDot) return false;
    // ray to head and chest
    const o = { x: actor.pos.x, y: actor.pos.y + eyeY(actor), z: actor.pos.z };
    const tryTargets = [
      { x: target.pos.x, y: target.pos.y + (target.crouch ? 1.0 : HEAD.y), z: target.pos.z },
      { x: target.pos.x, y: target.pos.y + 0.9, z: target.pos.z },
    ];
    for (const t of tryTargets) {
      const dir = { x: (t.x - o.x) / dist, y: (t.y - o.y) / Math.max(0.001, Math.hypot(dist, t.y - o.y)), z: (t.z - o.z) / dist };
      const len = Math.hypot(t.x - o.x, t.y - o.y, t.z - o.z);
      const tt = raycastWorld(o, dir, len, this.colliders);
      if (tt >= len - 0.25) return true;
    }
    return false;
  }

  // per fixed step: steer movement, aim, fire decisions
  drive(bot, actor, actors, dt, roundCtx, weaponSys, fx) {
    const b = actor.bot;
    if (!actor.alive) return;

    // aim toward target with smoothing + jitter
    let desiredYaw = actor.yaw;
    let desiredPitch = 0;
    if (b.target && b.target.alive) {
      const tx = b.target.pos.x - actor.pos.x;
      const tz = b.target.pos.z - actor.pos.z;
      desiredYaw = Math.atan2(-tx, -tz);
      // face the target fully in combat (no slow turn): bots snap aim like players
      actor.yaw = desiredYaw;
      const dy = (b.target.pos.y + (b.target.crouch ? 1.0 : HEAD.y)) - (actor.pos.y + eyeY(actor));
      const dist = Math.hypot(tx, tz);
      desiredPitch = Math.atan2(dy, dist);
      b.reactT -= dt;
    } else if (b.path.length) {
      // face along path
      const wp = WAYPOINTS[b.path[Math.min(b.pathIdx, b.path.length - 1)]].p;
      const tx = wp[0] - actor.pos.x;
      const tz = wp[1] - actor.pos.z;
      if (Math.hypot(tx, tz) > 0.5) desiredYaw = Math.atan2(-tx, -tz);
    }
    // smooth yaw/pitch (wrap-aware)
    let dyaw = desiredYaw - actor.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const smoothing = b.target ? BOT.aimSmooth : 6;
    actor.yaw += dyaw * Math.min(1, smoothing * dt);
    actor.pitch += (desiredPitch - actor.pitch) * Math.min(1, smoothing * dt);

    // movement: follow path or strafe in combat
    let wishX = 0, wishZ = 0;
    const speed = b.target ? MOVE.walkSpeed : MOVE.runSpeed;
    if (b.target && b.target.alive) {
      // strafe + maintain range
      b.strafeT -= dt;
      if (b.strafeT <= 0) { b.strafe = Math.random() < 0.5 ? -1 : 1; b.strafeT = 0.7 + Math.random(); }
      const fx = -Math.sin(actor.yaw), fz = -Math.cos(actor.yaw);
      const rx = -fz, rz = fx;
      const dist = Math.hypot(b.target.pos.x - actor.pos.x, b.target.pos.z - actor.pos.z);
      const want = actor.weapons[1] ? 14 : 9;
      const fwd = dist > want + 3 ? 1 : dist < want - 4 ? -0.6 : 0;
      wishX = (fx * fwd + rx * b.strafe * 0.7) * speed;
      wishZ = (fz * fwd + rz * b.strafe * 0.7) * speed;
      // crouch sometimes at range
      actor.crouch = dist > 20 && Math.random() < 0.005 ? true : (dist < 8 ? false : actor.crouch);
    } else if (b.path.length) {
      const wp = WAYPOINTS[b.path[Math.min(b.pathIdx, b.path.length - 1)]].p;
      const tx = wp[0] - actor.pos.x;
      const tz = wp[1] - actor.pos.z;
      const d = Math.hypot(tx, tz);
      if (d < 1.2) {
        b.pathIdx++;
        if (b.pathIdx >= b.path.length) {
          b.path = [];
          if (b.state === 'plant' && actor.hasSpike) roundCtx.requestPlant(actor);
        }
      } else {
        wishX = (tx / d) * speed;
        wishZ = (tz / d) * speed;
      }
    }

    // apply as velocity target (shared accel model applied by caller)
    actor.botWishX = wishX;
    actor.botWishZ = wishZ;

    // firing
    b.burstCd -= dt;
    if (b.target && b.target.alive && b.reactT <= 0) {
      const spec = WEAPONS[actor.weapons[actor.activeSlot] || 'pistol'];
      const canSeeNow = this.canSee(actor, b.target);
      if (canSeeNow && b.burstCd <= 0) {
        if (b.burst <= 0) b.burst = BOT.fireBurstMin + Math.floor(Math.random() * (BOT.fireBurstMax - BOT.fireBurstMin + 1));
        const fired = weaponSys.tryFire(actor, actors, this.colliders, roundCtx.now, fx);
        if (fired) {
          b.burst--;
          if (b.burst <= 0) b.burstCd = 0.25 + Math.random() * 0.5;
        }
      }
    }
  }
}

