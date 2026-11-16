// Vector Protocol — entry module: scene, fixed-step sim loop, render, camera follow.
import * as THREE from 'three';
import { PALETTE, TEAM, ROUND } from './palette.js';
import { MOVE, WEAPONS } from './tuning.js';
import { Sim, SIM_DT } from './sim.js';
import { eyePosInto, dirFromYawPitch } from './weapon.js';
import { initAudio, resumeAudio } from './audio.js';
import { stageShot } from './shot.js';
import { aabbCollide } from './physics.js';

const host = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = false;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(PALETTE.fog, 30, 95);

const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 200);
scene.add(camera);

// lighting: cool ambient + warm key + cool fill, chosen palette
scene.add(new THREE.HemisphereLight(PALETTE.lightCool, PALETTE.ground, 2.1));
const key = new THREE.DirectionalLight(PALETTE.lightWarm, 2.7);
key.position.set(-18, 26, 14);
scene.add(key);
const fill = new THREE.DirectionalLight(PALETTE.lightCool, 0.9);
fill.position.set(16, 18, -12);
scene.add(fill);

const sim = new Sim(scene, camera, renderer.domElement);

// ===== menu / pointer lock flow =====
const hud = sim.hud;
hud.bindMenu(
  () => { // play
    initAudio(); resumeAudio();
    hud.showMenu(false);
    sim.input.lock();
    if (!sim.started) { sim.started = true; sim.startMatch(); }
  },
  () => closeBuy(),
  () => { // play again
    hud.showEnd(false);
    sim.resetMatch();
    sim.input.lock();
  },
  (itemId) => buyItem(itemId),
);

// screenshot staging (?shot=<mode>): stage a real game state for capture
const staged = stageShot(sim, hud);

function openBuy() {
  if (!sim.started || sim.matchOver) return;
  hud.showBuy(true);
  hud.renderBuy(sim.player);
  sim.input.unlock();
  sim.buyOpen = true;
}
function closeBuy() {
  hud.showBuy(false);
  sim.buyOpen = false;
  if (!sim.matchOver) sim.input.lock();
}
function buyItem(id) {
  const p = sim.player;
  const item = { smg: 1250, carbine: 2700, rifle: 4300, grenade: 500 }[id];
  if (item == null || p.money < item) return;
  if (id === 'grenade') {
    if (p.grenades >= 2) return;
    p.grenades++;
  } else {
    p.weapons[1] = id;
    const spec = WEAPONS[id];
    p.magState[1] = { mag: spec.mag, reserve: spec.reserve };
    p.activeSlot = 1;
  }
  p.money -= item;
  hud.renderBuy(p);
}

// global keydown for UI toggles
window.addEventListener('keydown', (e) => {
  if (!sim.started) return;
  if (e.code === 'KeyB') {
    if (sim.buyOpen) closeBuy();
    else if (sim.phase === 'buy') openBuy();
  }
  if (e.code === 'Escape' && sim.buyOpen) closeBuy();
});

// ===== fixed-step loop =====
let last = performance.now();
let acc = 0;
const CLOCK_MAX = 0.25;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > CLOCK_MAX) dt = CLOCK_MAX;
  acc += dt;

  if (!staged) {
    while (acc >= SIM_DT) {
      sim.update(SIM_DT);
      acc -= SIM_DT;
    }
  } else {
    acc = 0; // screenshot staging: freeze sim, render staged state only
  }

  updateCameraAndHud(dt);
  hud.tick(dt);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

function updateCameraAndHud(dt) {
  const p = sim.player;
  if (!p) return;

  // camera follows player actor state
  const eye = eyePosInto(p, new THREE.Vector3());
  camera.position.copy(eye);
  const recoil = sim.weapons.recoil;
  camera.rotation.order = 'YXZ';
  camera.rotation.y = p.yaw;
  camera.rotation.x = p.pitch + recoil;
  camera.rotation.z = 0;

  // HUD readouts
  const spec = sim.weapons.currentSpec(p);
  const st = sim.weapons.magOf(p);
  hud.setWeapon(spec.name);
  hud.setAmmo(st.mag, st.reserve);
  hud.setHp(Math.max(0, Math.round(p.hp)));
  hud.setMoney(p.money);

  // phase + timer
  if (sim.phase === 'buy') {
    hud.setTimer(sim.phaseT, false);
    hud.setObjective('BUY PHASE — press B', '');
  } else if (sim.spike.state === 'planted') {
    hud.setTimer(sim.spike.timer, sim.spike.timer < 10);
  } else if (sim.phase === 'live') {
    hud.setTimer(sim.phaseT, sim.phaseT < 20);
  }

  // sync bot meshes
  for (const a of sim.actors) {
    if (a.isPlayer) continue;
    a.mesh.position.set(a.pos.x, a.pos.y, a.pos.z);
    a.mesh.rotation.y = a.yaw;
    a.mesh.visible = a.alive;
  }
}

// debug handle (used by automated capture/debugging; harmless in production)
window.__vp_debug = { sim, camera, THREE };

// resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
