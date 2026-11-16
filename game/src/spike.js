// Vector Protocol — spike (bomb) logic: plant, defuse, detonation, site zones.
import * as THREE from 'three';
import { SITES, SPAWNS } from './world.js';
import { ROUND } from './palette.js';
import { spikeBeep } from './audio.js';

export class Spike {
  constructor(scene) {
    this.scene = scene;
    this.state = 'carried'; // carried | planted | defused | exploded | dropped
    this.site = null;
    this.timer = 0;
    this.pos = new THREE.Vector3();
    this.beepT = 0;
    this.mesh = null;
    this.light = null;
  }

  reset() {
    this.state = 'carried';
    this.site = null;
    this.timer = 0;
    this.beepT = 0;
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh = null;
    }
  }

  plant(pos, site) {
    this.state = 'planted';
    this.site = site;
    this.timer = ROUND.BOMB_TIME;
    this.pos.copy(pos);
    this.pos.y = 0.12;
    const geo = new THREE.CylinderGeometry(0.16, 0.2, 0.24, 8);
    const mat = new THREE.MeshLambertMaterial({ color: 0xff5d5d, emissive: 0x661414 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(this.pos);
    this.light = new THREE.PointLight(0xff5d5d, 3, 7);
    this.light.position.set(0, 0.4, 0);
    this.mesh.add(this.light);
    this.scene.add(this.mesh);
    spikeBeep(false);
  }

  clear() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh = null;
      this.light = null;
    }
  }

  // returns 'boom' when detonation fires this tick
  tick(dt) {
    if (this.state !== 'planted') return null;
    this.timer -= dt;
    this.beepT -= dt;
    const frac = this.timer / ROUND.BOMB_TIME;
    const interval = 0.25 + frac * 0.85;
    if (this.beepT <= 0) {
      this.beepT = interval;
      spikeBeep(this.timer < 10);
      if (this.mesh) {
        this.mesh.material.emissive.setHex(this.timer < 10 ? 0xff3020 : 0x661414);
      }
    }
    if (this.mesh) {
      this.mesh.rotation.y += dt * (this.timer < 10 ? 6 : 2);
    }
    if (this.timer <= 0) {
      this.state = 'exploded';
      return 'boom';
    }
    return null;
  }

  inSite(x, z) {
    for (const [name, s] of Object.entries(SITES)) {
      const dx = x - s.x, dz = z - s.z;
      if (dx * dx + dz * dz <= s.r * s.r) return name;
    }
    return null;
  }

  // Detonation damage: falls off with distance from spike.
  damageAt(x, z) {
    const d = Math.hypot(x - this.pos.x, z - this.pos.z);
    if (d > 26) return 0;
    return Math.round(220 * (1 - d / 26) ** 1.6);
  }
}
