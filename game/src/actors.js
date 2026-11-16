// Vector Protocol — actors: player + bots share this state shape; mesh factory here.
import * as THREE from 'three';
import { PALETTE, TEAM } from './palette.js';
import { MOVE } from './tuning.js';

export function makeActorMesh(team, isPlayer) {
  const group = new THREE.Group();
  const color = team === TEAM.VOLT ? PALETTE.accentAmber : PALETTE.accentCyan;
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x76828d, emissive: 0x1a1f24 });
  const teamMat = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.55 });

  // torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.34), bodyMat);
  torso.position.y = 1.06;
  group.add(torso);
  // vest stripe
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.2, 0.36), teamMat);
  vest.position.y = 1.12;
  group.add(vest);
  // head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), teamMat);
  head.position.y = 1.55;
  group.add(head);
  // visor
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.05), new THREE.MeshLambertMaterial({ color: 0x14181c }));
  visor.position.set(0, 1.56, -0.16);
  group.add(visor);
  // legs
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.72, 0.2), bodyMat);
  legL.position.set(-0.13, 0.36, 0);
  const legR = legL.clone();
  legR.position.x = 0.13;
  group.add(legL, legR);

  // weapon box in hands
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.62), new THREE.MeshLambertMaterial({ color: 0x22262b }));
  gun.position.set(0.18, 1.18, -0.34);
  group.add(gun);

  if (isPlayer) group.visible = false; // first person: hide own body
  return { group, head, torso, legL, legR, gun };
}

export function makeActor(team, id, name, isPlayer) {
  const mesh = makeActorMesh(team, isPlayer);
  return {
    id,
    name,
    team,
    isPlayer,
    alive: true,
    hp: 100,
    armor: 0,
    helmet: false,
    pos: new THREE.Vector3(0, 0, 0),   // feet
    vel: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    crouch: false,
    onGround: true,
    money: 0,
    kills: 0,
    deaths: 0,
    hasSpike: false,
    grenades: 0,
    weapons: { 1: null, 2: 'pistol' },
    activeSlot: 2,
    mesh: mesh.group,
    parts: mesh,
    // bot-only fields
    bot: !isPlayer ? {
      state: 'idle',
      target: null,
      reactT: 0,
      burst: 0,
      burstCd: 0,
      path: [],
      pathIdx: 0,
      repathT: 0,
      goal: null,
      holdT: 0,
      lastSeen: null,
      strafe: 1,
      strafeT: 0,
    } : null,
  };
}

export function eyeY(actor) {
  return actor.crouch ? MOVE.crouchEye : MOVE.eyeHeight;
}

export function eyePos(actor, out) {
  return out.set(actor.pos.x, actor.pos.y + eyeY(actor), actor.pos.z);
}

export function resetActorRound(actor, spawn, loadout) {
  actor.alive = true;
  actor.hp = 100;
  actor.pos.set(spawn[0], 0, spawn[1]);
  actor.vel.set(0, 0, 0);
  actor.crouch = false;
  actor.onGround = true;
  actor.hasSpike = false;
  actor.grenades = loadout.grenades;
  actor.weapons = { 1: loadout.primary, 2: 'pistol' };
  actor.activeSlot = loadout.primary ? 1 : 2;
  if (actor.bot) {
    actor.bot.state = 'idle';
    actor.bot.target = null;
    actor.bot.path = [];
    actor.bot.goal = null;
    actor.bot.lastSeen = null;
  }
  actor.mesh.visible = !actor.isPlayer;
  actor.mesh.position.copy(actor.pos);
  actor.mesh.rotation.y = actor.yaw;
}
