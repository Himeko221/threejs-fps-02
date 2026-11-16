// Vector Protocol — transient visual effects: muzzle flashes, blood puffs, explosion spheres.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.active = []; // {mesh, light, life}
  }

  spawnMuzzle(pos) {
    const geo = new THREE.SphereGeometry(0.05, 6, 5);
    const mat = new THREE.MeshBasicMaterial({ color: PALETTE.lightWarm, transparent: true, opacity: 0.9 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.position.y += 1.1;
    const light = new THREE.PointLight(PALETTE.lightWarm, 2.5, 6);
    light.position.set(0, 0.2, 0);
    mesh.add(light);
    this.scene.add(mesh);
    this.active.push({ mesh, light, life: 0.06 });
  }

  spawnBlood(pos) {
    const geo = new THREE.SphereGeometry(0.12, 6, 5);
    const mat = new THREE.MeshBasicMaterial({ color: 0x8c1f1f, transparent: true, opacity: 0.85 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.position.y += 0.9;
    this.scene.add(mesh);
    this.active.push({ mesh, light: null, life: 0.4 });
  }

  spawnExplosion(pos) {
    // core flash
    const geo = new THREE.SphereGeometry(0.35, 10, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffc27a, transparent: true, opacity: 0.95 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    const light = new THREE.PointLight(0xffb060, 8, 18);
    light.position.copy(pos);
    light.position.y += 0.5;
    mesh.add(light);
    this.scene.add(mesh);
    this.active.push({ mesh, light, life: 0.55 });

    // shockwave ring
    const ringGeo = new THREE.RingGeometry(0.4, 0.55, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(pos);
    ring.position.y = 0.05;
    this.scene.add(ring);
    this.active.push({ mesh: ring, light: null, life: 0.5 });

    // smoke puffs
    for (let i = 0; i < 6; i++) {
      const sg = new THREE.SphereGeometry(0.14 + Math.random() * 0.1, 6, 5);
      const sm = new THREE.MeshLambertMaterial({ color: 0x3a4048, transparent: true, opacity: 0.55 });
      const puff = new THREE.Mesh(sg, sm);
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 1.6;
      puff.position.set(pos.x + Math.cos(a) * r, pos.y + 0.6 + Math.random() * 0.8, pos.z + Math.sin(a) * r);
      this.scene.add(puff);
      this.active.push({ mesh: puff, light: null, life: 0.8 + Math.random() * 0.6 });
    }
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      e.life -= dt;
      if (e.mesh.material.transparent) {
        e.mesh.material.opacity = Math.max(0, e.mesh.material.opacity - dt * 1.6);
      }
      if (e.light) e.light.intensity = Math.max(0, e.light.intensity - dt * 10);
      if (e.life <= 0) {
        this.scene.remove(e.mesh);
        e.mesh.geometry.dispose();
        e.mesh.material.dispose();
        this.active.splice(i, 1);
      }
    }
  }

  clear() {
    for (const e of this.active) {
      this.scene.remove(e.mesh);
      e.mesh.geometry.dispose();
      e.mesh.material.dispose();
    }
    this.active = [];
  }
}
