// Vector Protocol — grenades: ballistic arc, bounce, fuse, radial damage.
import * as THREE from 'three';
import { GRENADE } from './tuning.js';
import { raycastWorld } from './physics.js';
import { explosion } from './audio.js';
import { dirFromYawPitch, eyePosInto } from './weapon.js';

export class Grenades {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.live = []; // {mesh, pos, vel, fuse, owner}
    this._o = new THREE.Vector3();
    this._d = new THREE.Vector3();
  }

  clear() {
    for (const g of this.live) this.dispose(g);
    this.live = [];
  }

  dispose(g) {
    this.scene.remove(g.mesh);
    g.mesh.geometry.dispose();
    g.mesh.material.dispose();
  }

  throw(actor) {
    const geo = new THREE.SphereGeometry(0.09, 8, 6);
    const mat = new THREE.MeshLambertMaterial({ color: 0x5a6b4a });
    const mesh = new THREE.Mesh(geo, mat);
    const o = this._o;
    eyePosInto(actor, o);
    const d = this._d;
    dirFromYawPitch(actor, d);
    const pos = o.clone().addScaledVector(d, 0.5);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.live.push({
      mesh,
      pos,
      vel: d.clone().multiplyScalar(GRENADE.speed).add(new THREE.Vector3(0, 2.2, 0)),
      fuse: GRENADE.fuse,
      owner: actor,
    });
  }

  update(dt, actors, roundCtx, fx) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const g = this.live[i];
      g.fuse -= dt;
      if (g.fuse <= 0) {
        this.detonate(g, actors, fx);
        this.dispose(g);
        this.live.splice(i, 1);
        continue;
      }
      // integrate with simple bounce responses
      g.vel.y -= GRENADE.gravity * dt;
      const step = g.vel.clone().multiplyScalar(dt);
      const next = g.pos.clone().add(step);
      if (next.y < 0.09) { // ground bounce
        next.y = 0.09;
        g.vel.y = Math.abs(g.vel.y) * 0.42;
        g.vel.x *= 0.72;
        g.vel.z *= 0.72;
      }
      const dirLen = step.length();
      if (dirLen > 1e-6) {
        const dir = step.clone().normalize();
        const t = raycastWorld(g.pos, dir, dirLen + 0.09, this.colliders);
        if (t < dirLen + 0.09) {
          // reflect: reverse horizontal component, damp
          g.vel.x *= -0.4;
          g.vel.z *= -0.4;
          g.vel.y *= 0.6;
          next.copy(g.pos);
        }
      }
      g.pos.copy(next);
      g.mesh.position.copy(g.pos);
      g.mesh.rotation.x += dt * 9;
      g.mesh.rotation.z += dt * 7;
    }
  }

  detonate(g, actors, fx) {
    fx.spawnExplosion(g.pos);
    const player = actors.find((a) => a.isPlayer);
    const distToPlayer = player ? g.pos.distanceTo(player.pos) : 0;
    explosion(distToPlayer);
    for (const actor of actors) {
      if (!actor.alive) continue;
      const d = Math.hypot(actor.pos.x - g.pos.x, (actor.pos.y + 0.9) - g.pos.y, actor.pos.z - g.pos.z);
      if (d > GRENADE.radius) continue;
      const falloff = 1 - d / GRENADE.radius;
      let dmg = Math.round(GRENADE.damage * falloff ** 1.4);
      if (actor === g.owner) dmg = Math.round(dmg * GRENADE.selfMin);
      if (dmg <= 0) continue;
      actor.hp -= dmg;
      if (actor.hp <= 0) {
        actor.alive = false;
        actor.deaths++;
        if (fx.spawnBlood) fx.spawnBlood(actor.pos);
      }
    }
  }
}
