// Vector Protocol — weapons: fire control, spread, recoil, reload, tracers, viewmodel.
import * as THREE from 'three';
import { WEAPONS, MOVE, HEAD, BODY } from './tuning.js';
import { raycastWorld, raySphere, rayCylinderY } from './physics.js';
import { shot, hit as hitSound, reloadClick } from './audio.js';
import { PALETTE } from './palette.js';

export class WeaponSystem {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.tracers = []; // {line, life}
    this.impacts = []; // {sprite, life}
    this.recoil = 0;       // accumulated recoil pitch (radians)
    this.recoilVel = 0;
    this.viewKick = 0;     // camera kick decay
    this.heat = 0;         // spread growth from firing
    this.lastFireT = -10;
    this.reloadT = 0;
    this.switchT = 0;

    // viewmodel: simple gun block attached to camera
    const vm = new THREE.Group();
    // two-tone gun: dark receiver + light top rail, reads as a weapon silhouette
    const dark = new THREE.MeshLambertMaterial({ color: 0x4e5860, emissive: 0x2a3238 });
    const light = new THREE.MeshLambertMaterial({ color: 0xdde4e9, emissive: 0x6a747c });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.085, 0.42), dark);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.028, 0.24), light);
    rail.position.set(0, 0.055, -0.04);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.036, 0.3), dark);
    barrel.position.set(0, 0.005, -0.35);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 0.065), dark);
    mag.position.set(0, -0.1, -0.07);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.12, 0.075), dark);
    grip.position.set(0, -0.09, 0.11);
    grip.rotation.x = 0.35;
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.08, 0.13), dark);
    stock.position.set(0, -0.005, 0.26);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.038, 0.05), new THREE.MeshBasicMaterial({ color: PALETTE.accentAmber }));
    sight.position.set(0, 0.082, -0.14);
    vm.add(body, rail, barrel, mag, grip, stock, sight);
    vm.position.set(0.26, -0.21, -0.46);
    vm.rotation.y = -0.06;
    vm.scale.setScalar(1.05);
    this.viewmodel = vm;
    this.vmBase = vm.position.clone();
    camera.add(vm);

    // shared temp vectors (no per-frame allocation)
    this._o = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
  }

  currentSpec(actor) {
    const wid = actor.weapons[actor.activeSlot] || 'pistol';
    return WEAPONS[wid];
  }

  magOf(actor) {
    const m = actor.magState?.[actor.activeSlot];
    return m || { mag: 0, reserve: 0 };
  }

  equipLoadout(actor) {
    // full mags on round start / buy
    actor.magState = {};
    for (const slot of [1, 2]) {
      const wid = actor.weapons[slot];
      if (!wid) continue;
      const spec = WEAPONS[wid];
      actor.magState[slot] = { mag: spec.mag, reserve: spec.reserve };
    }
  }

  tryFire(actor, actors, colliders, now, fxCallbacks) {
    const spec = this.currentSpec(actor);
    const st = this.magOf(actor);
    if (this.reloadT > 0 || this.switchT > 0) return false;
    if (st.mag <= 0) {
      this.startReload(actor);
      return false;
    }
    const interval = 60 / spec.rpm;
    if (now - this.lastFireT < interval) return false;
    this.lastFireT = now;
    st.mag--;

    // spread: base + movement + jump + heat
    const speed = Math.hypot(actor.vel.x, actor.vel.z);
    let spread = spec.spreadBase;
    if (!actor.onGround) spread += spec.spreadJump;
    else spread += spec.spreadMove * Math.min(1, speed / MOVE.runSpeed);
    if (actor.crouch) spread *= 0.65;
    spread += this.heat * 0.5 * spec.spreadBase * 10;

    eyePosInto(actor, this._o);
    dirFromYawPitch(actor, this._d);
    // apply spread as random cone
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * spread;
    // right vector from yaw: (cos yaw, 0, -sin yaw); up approx (0,1,0)
    const rx = Math.cos(actor.yaw), rz = -Math.sin(actor.yaw);
    this._d.x += (Math.cos(a) * rx) * r;
    this._d.z += (Math.cos(a) * rz) * r;
    this._d.y += Math.sin(a) * r;
    this._d.normalize();

    const result = this.traceShot(actor, this._o, this._d, spec, actors, colliders, fxCallbacks);

    // recoil + heat
    this.recoilVel += spec.recoilKick * (actor.crouch ? 0.7 : 1);
    this.heat = Math.min(1, this.heat + 0.16);
    this.viewKick = Math.min(0.05, this.viewKick + 0.012);

    shot(0, spec.damage >= 50);
    if (fxCallbacks?.onFire) fxCallbacks.onFire(actor, spec);
    return result;
  }

  traceShot(actor, o, d, spec, actors, colliders, fxCallbacks) {
    const wallT = raycastWorld(o, d, spec.range, colliders);
    let bestT = wallT;
    let victim = null;
    let zone = 'body';

    for (const other of actors) {
      if (other === actor || !other.alive || other.team === actor.team) continue;
      const hx = other.pos.x, hz = other.pos.z;
      // head sphere
      const headC = { x: hx, y: other.pos.y + (other.crouch ? HEAD.y - 0.5 : HEAD.y), z: hz };
      const tHead = raySphere(o, d, headC, HEAD.r);
      // body cylinder
      const bodyH = other.crouch ? BODY.y : BODY.y + 0.25;
      const tBody = rayCylinderY(o, d, hx, hz, other.pos.y + 0.1, bodyH, BODY.rx + 0.06);
      // legs
      const tLeg = rayCylinderY(o, d, hx, hz, other.pos.y, other.pos.y + 0.72, BODY.rx);
      let t = Infinity, z = 'body';
      if (tHead < tBody && tHead < tLeg) { t = tHead; z = 'head'; }
      else if (tBody < tLeg) { t = tBody; z = 'body'; }
      else { t = tLeg; z = 'legs'; }
      if (t < bestT) { bestT = t; victim = other; zone = z; }
    }

    // tracer to hit point
    const endT = Math.min(bestT, spec.range);
    this.spawnTracer(
      o.x + d.x * 0.4, o.y - 0.06 + d.y * 0.4, o.z + d.z * 0.4,
      o.x + d.x * endT, o.y + d.y * endT, o.z + d.z * endT,
      spec.tracer,
    );

    if (victim) {
      let dmg = spec.damage;
      if (zone === 'head') dmg *= spec.hsMult;
      else if (zone === 'legs') dmg *= spec.legMult;
      // distance falloff
      dmg *= 1 - (1 - spec.falloff) * Math.min(1, endT / spec.range);
      // armor
      if (zone === 'head' && victim.helmet) dmg *= 0.65;
      else if (zone !== 'head' && victim.armor > 0) {
        const absorbed = dmg * (1 - 0.75);
        dmg *= 0.75;
        victim.armor = Math.max(0, victim.armor - absorbed * 0.5);
      }
      dmg = Math.round(dmg);
      this.spawnImpact(o.x + d.x * endT, o.y + d.y * endT, o.z + d.z * endT, 0xff5050);
      if (fxCallbacks?.onHit) fxCallbacks.onHit(actor, victim, zone, dmg, endT);
      hitSound(zone === 'head');
      return true;
    }
    if (wallT < spec.range) {
      this.spawnImpact(o.x + d.x * wallT, o.y + d.y * wallT, o.z + d.z * wallT, 0xd8c9a8);
    }
    return false;
  }

  startReload(actor) {
    const st = this.magOf(actor);
    const spec = this.currentSpec(actor);
    if (this.reloadT > 0 || st.mag >= spec.mag || st.reserve <= 0) return;
    this.reloadT = spec.reload;
    reloadClick();
  }

  tickReload(dt, actor) {
    if (this.reloadT <= 0) return;
    this.reloadT -= dt;
    if (this.reloadT <= 0) {
      this.reloadT = 0;
      const st = this.magOf(actor);
      const spec = this.currentSpec(actor);
      const need = spec.mag - st.mag;
      const take = Math.min(need, st.reserve);
      st.mag += take;
      st.reserve -= take;
      reloadClick();
    }
  }

  spawnTracer(x1, y1, z1, x2, y2, z2, color) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([x1, y1, z1, x2, y2, z2], 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.07 });
  }

  spawnImpact(x, y, z, color) {
    const sprite = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 6, 5),
      new THREE.MeshBasicMaterial({ color }),
    );
    sprite.position.set(x, y, z);
    this.scene.add(sprite);
    this.impacts.push({ sprite, life: 0.5 });
  }

  // dt: fixed step. Returns recoil pitch offset to add to camera.
  update(dt, actor, moving) {
    // recoil spring
    this.recoilVel -= this.recoil * 60 * dt;
    this.recoilVel *= Math.max(0, 1 - 8 * dt);
    this.recoil += this.recoilVel * dt * 30;
    if (this.recoil < 0) { this.recoil = 0; this.recoilVel = 0; }

    // heat decay
    this.heat = Math.max(0, this.heat - dt * 1.4);
    this.viewKick = Math.max(0, this.viewKick - dt * 0.25);

    this.tickReload(dt, actor);

    // fx lifetimes
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        this.tracers.splice(i, 1);
      } else {
        t.line.material.opacity = t.life / 0.07 * 0.85;
      }
    }
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const im = this.impacts[i];
      im.life -= dt;
      if (im.life <= 0) {
        this.scene.remove(im.sprite);
        im.sprite.geometry.dispose();
        im.sprite.material.dispose();
        this.impacts.splice(i, 1);
      }
    }

    // viewmodel sway/bob
    const t = performance.now() / 1000;
    const bobAmp = moving ? 0.008 : 0.002;
    this.viewmodel.position.set(
      this.vmBase.x + Math.sin(t * 8.5) * bobAmp,
      this.vmBase.y + Math.abs(Math.cos(t * 17)) * bobAmp - this.viewKick * 0.6,
      this.vmBase.z + this.viewKick * 1.6,
    );
    this.viewmodel.rotation.x = this.viewKick * 2.2;

    return this.recoil;
  }

  reset() {
    this.recoil = 0;
    this.recoilVel = 0;
    this.heat = 0;
    this.reloadT = 0;
    this.lastFireT = -10;
  }
}

export function eyePosInto(actor, out) {
  const h = actor.crouch ? MOVE.crouchEye : MOVE.eyeHeight;
  return out.set(actor.pos.x, actor.pos.y + h, actor.pos.z);
}

export function dirFromYawPitch(actor, out) {
  const cp = Math.cos(actor.pitch);
  return out.set(-Math.sin(actor.yaw) * cp, Math.sin(actor.pitch), -Math.cos(actor.yaw) * cp).normalize();
}
