// Vector Protocol — HUD: DOM updates, killfeed, buy menu, banners, scoreboard.
import { SHOP, ROUND } from './palette.js';
import { WEAPONS } from './tuning.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = {
      timer: $('round-timer'),
      score: $('round-score'),
      alive1: $('alive-t1'),
      alive2: $('alive-t2'),
      hp: $('hp-fill'),
      money: $('money'),
      ammoMag: $('ammo-mag'),
      ammoReserve: $('ammo-reserve'),
      weaponName: $('weapon-name'),
      ammo: $('ammo'),
      killfeed: $('killfeed'),
      objective: $('objective'),
      vignette: $('dmg-vignette'),
      hitmarker: $('hitmarker'),
      banner: $('banner'),
      bannerText: $('banner-text'),
      scoreFinal: $('score-final'),
      menu: $('menu'),
      buy: $('buy'),
      buyMoney: $('buy-money'),
      shop: $('shop-items'),
      end: $('end'),
      endTitle: $('end-title'),
      endSub: $('end-sub'),
      play: $('play'),
      buyClose: $('buy-close'),
      endAgain: $('end-again'),
    };
    this.feedRows = [];
    this._hmT = 0;
    this._vgT = 0;
  }

  bindMenu(onPlay, onBuyClose, onAgain, onShopClick) {
    this.el.play.addEventListener('click', onPlay);
    this.el.buyClose.addEventListener('click', onBuyClose);
    this.el.endAgain.addEventListener('click', onAgain);
    this.el.shop.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-item]');
      if (btn) onShopClick(btn.dataset.item);
    });
  }

  showMenu(v) { this.el.menu.hidden = !v; }
  showBuy(v) { this.el.buy.hidden = !v; }
  showEnd(v) { this.el.end.hidden = !v; }

  setTimer(sec, hot) {
    const s = Math.max(0, Math.ceil(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    this.el.timer.textContent = `${m}:${String(r).padStart(2, '0')}`;
    this.el.timer.classList.toggle('hot', !!hot);
  }

  setScore(a, b) { this.el.score.textContent = `${a} : ${b}`; }
  setAlive(t1, t2) {
    this.el.alive1.textContent = `${t1} alive`;
    this.el.alive2.textContent = `${t2} alive`;
  }

  setHp(hp) {
    this.el.hp.style.width = `${Math.max(0, hp)}%`;
    this.el.hp.classList.toggle('low', hp <= 30);
  }

  setMoney(v) { this.el.money.textContent = String(v); }

  setWeapon(name) { this.el.weaponName.textContent = name; }

  setAmmo(mag, reserve) {
    this.el.ammoMag.textContent = String(mag);
    this.el.ammoReserve.textContent = `/ ${reserve}`;
    this.el.ammo.classList.toggle('empty', mag === 0);
  }

  setObjective(text, cls) {
    this.el.objective.textContent = text || '';
    this.el.objective.className = cls || '';
  }

  flashHitmarker(head) {
    this.el.hitmarker.classList.add('on');
    this.el.hitmarker.classList.toggle('head', !!head);
    this._hmT = 0.12;
  }

  flashDamage() {
    this.el.vignette.classList.add('on');
    this._vgT = 0.35;
  }

  killfeedRow(killer, victim, weapon, head) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<b>${killer}</b> ▸ ${weapon}${head ? ' <span class="hs">HS</span>' : ''} ▸ ${victim}`;
    this.el.killfeed.appendChild(row);
    this.feedRows.push({ row, life: 5 });
    if (this.feedRows.length > 5) {
      const old = this.feedRows.shift();
      old.row.remove();
    }
  }

  banner(text, cls, show) {
    this.el.banner.hidden = !show;
    this.el.bannerText.textContent = text;
    this.el.bannerText.className = cls;
  }

  finalNote(text, show) {
    this.el.scoreFinal.hidden = !show;
    this.el.scoreFinal.textContent = text;
  }

  renderBuy(actor) {
    this.el.buyMoney.textContent = String(actor.money);
    this.el.shop.innerHTML = '';
    for (const item of SHOP) {
      const btn = document.createElement('button');
      btn.dataset.item = item.id;
      const owned =
        (item.kind === 'primary' && actor.weapons[1] === item.id) ||
        (item.kind === 'grenade' && actor.grenades >= 2);
      const afford = actor.money >= item.price;
      btn.disabled = owned || !afford;
      btn.classList.toggle('owned', owned);
      btn.innerHTML = `<span>${item.name}<span class="tag">${item.tag}</span></span><span class="price">$${item.price}</span>`;
      this.el.shop.appendChild(btn);
    }
  }

  // per render frame decay of transient effects
  tick(dt) {
    if (this._hmT > 0) {
      this._hmT -= dt;
      if (this._hmT <= 0) this.el.hitmarker.classList.remove('on', 'head');
    }
    if (this._vgT > 0) {
      this._vgT -= dt;
      if (this._vgT <= 0) this.el.vignette.classList.remove('on');
    }
    for (let i = this.feedRows.length - 1; i >= 0; i--) {
      this.feedRows[i].life -= dt;
      if (this.feedRows[i].life <= 0) {
        this.feedRows[i].row.remove();
        this.feedRows.splice(i, 1);
      }
    }
  }
}
