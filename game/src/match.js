// Match: the state machine of Harbour Line. Phases run menu → buy → play → round
// end → buy … until one team takes 7 rounds. Vanguard attacks: it carries the
// charge and wins a round by planting it and letting it blow, or by eliminating
// Ember. Ember defends and wins by elimination, by running the clock out, or by
// defusing a planted charge. Money is earned for kills, plants and round wins,
// and spent in the buy phase; losing rounds pay a streak bonus.
import * as THREE from 'three';
import { MAP } from './map.js';
import { WEAPONS, GRENADE, ARMOR } from './weapons.js';

const ROUND_TIME = 100;
const BUY_TIME = 15;
const PLANT_TIME = 3;
const DEFUSE_TIME = 5;
const CHARGE_TIME = 35;
const WIN_ROUNDS = 7;
const MAX_ROUNDS = 13;

export function createMatch(deps) {
  const { player, bots, hud, audio } = deps;
  const state = {
    phase: 'menu',
    round: 1,
    scoreV: 0,
    scoreE: 0,
    money: 800,
    timeLeft: ROUND_TIME,
    buyLeft: BUY_TIME,
    planted: null, // {site, x, z, timer}
    carrier: 'player', // 'player' or a bot id
    lossStreak: 0,
    roundOver: false,
  };
  let channel = null; // player channel {type, progress, site}
  let roundEndedAt = 0;

  function teamAlive(team) { return bots.aliveCount(team) + (team === 'vanguard' && player.state.alive ? 1 : 0); }

  function startRound() {
    state.phase = 'buy';
    state.buyLeft = BUY_TIME;
    state.timeLeft = ROUND_TIME;
    state.planted = null;
    state.roundOver = false;
    channel = null;
    const spawn = MAP.vanguardSpawn[0];
    player.respawn(spawn);
    // The charge goes to the player on odd rounds, to Rook on even ones.
    state.carrier = state.round % 2 === 1 ? 'player' : 'vanguard-0';
    bots.respawnAll(state.round, state.carrier);
    const carrierBot = bots.carrier();
    if (state.carrier === 'player') {
      hud.setCharge(true);
      hud.announce('You carry the charge — plant it at Site A or Site B');
    } else {
      hud.setCharge(false);
      if (carrierBot) hud.announce(`${carrierBot.name} carries the charge`);
    }
    hud.setScore(state.scoreV, state.scoreE, state.round);
    hud.setMoney(state.money);
    hud.setTimer(state.timeLeft);
    hud.setPlant(null);
    hud.showBuy(state.money, state.buyLeft);
    audio.tick();
  }

  function startMatch() {
    state.round = 1;
    state.scoreV = 0;
    state.scoreE = 0;
    state.money = 800;
    state.lossStreak = 0;
    startRound();
  }

  function endRound(winner, reason) {
    if (state.roundOver) return;
    state.roundOver = true;
    state.phase = 'roundEnd';
    roundEndedAt = 0;
    hud.hideBuy();
    hud.setPlant(null);
    if (winner === 'vanguard') {
      state.scoreV += 1;
      state.money += 3250;
      state.lossStreak = 0;
      audio.roundWin();
    } else {
      state.scoreE += 1;
      state.money += 1900 + Math.min(1500, state.lossStreak * 500);
      state.lossStreak += 1;
      audio.roundLose();
    }
    hud.setScore(state.scoreV, state.scoreE, state.round);
    hud.setMoney(state.money);
    const title = winner === 'vanguard' ? 'ROUND WON' : 'ROUND LOST';
    hud.showOverlay('round', { title, copy: `${reason} — Vanguard ${state.scoreV} : ${state.scoreE} Ember. $${state.money} in your pocket.` });
    if (state.scoreV >= WIN_ROUNDS || state.scoreE >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      state.phase = 'matchEnd';
      const won = state.scoreV > state.scoreE;
      hud.showOverlay('match', {
        title: won ? 'MATCH WON — THE DOCK IS YOURS' : 'MATCH LOST',
        copy: `Final score — Vanguard ${state.scoreV} : ${state.scoreE} Ember. ${won ? 'Harbour Line will remember this one.' : 'The Ember team holds the dock. Run it back.'}`,
      });
      if (won) audio.roundWin(); else audio.roundLose();
    }
  }

  function nextRound() {
    if (state.phase === 'matchEnd') { startMatch(); return; }
    state.round += 1;
    startRound();
  }

  function checkElimination() {
    if (state.roundOver || state.phase !== 'play') return;
    const vanguard = teamAlive('vanguard');
    const ember = teamAlive('ember');
    hud.setAlive(vanguard, ember);
    if (ember === 0) endRound('vanguard', state.planted ? 'Charge detonated' : 'Ember team eliminated');
    else if (vanguard === 0) endRound('ember', 'Vanguard team eliminated');
  }

  function onKill(killerTeam, killerName, victimTeam, victimName, headshot) {
    hud.killfeed(killerName, victimName, headshot, killerTeam);
    if (killerName === 'You') {
      state.money += 300;
      hud.setMoney(state.money);
      audio.kill();
    }
    checkElimination();
  }

  // The player holds E near a site to plant, or near a planted charge to defuse.
  function interact(dt, keys, playerPos) {
    if (state.phase !== 'play' || !player.state.alive) { channel = null; hud.setPlant(null); return; }
    const holding = keys.has('KeyE');
    let target = null;
    if (!state.planted) {
      for (const key of ['A', 'B']) {
        const site = MAP.sites[key];
        const d = Math.hypot(playerPos.x - site.x, playerPos.z - site.z);
        if (d < site.radius && state.carrier === 'player') target = { type: 'plant', site: key, need: PLANT_TIME };
      }
    } else {
      const d = Math.hypot(playerPos.x - state.planted.x, playerPos.z - state.planted.z);
      if (d < 2.2) target = { type: 'defuse', site: state.planted.site, need: DEFUSE_TIME };
    }
    if (!target || !holding) {
      if (channel) audio.denied();
      channel = null;
      hud.setPlant(null);
      return;
    }
    if (!channel || channel.type !== target.type) channel = { type: target.type, progress: 0, site: target.site };
    channel.progress += dt / target.need;
    hud.setPlant(channel.progress, target.type === 'plant' ? 'PLANTING CHARGE…' : 'DEFUSING CHARGE…');
    if (Math.random() < dt * 3) (target.type === 'plant' ? audio.plantBeep : audio.defuseBeep)();
    if (channel.progress >= 1) {
      if (target.type === 'plant') {
        const site = MAP.sites[target.site];
        state.planted = { site: target.site, x: site.x, z: site.z, timer: CHARGE_TIME };
        state.carrier = null;
        hud.setCharge(false);
        hud.announce('Charge planted — defend it!');
        audio.planted();
        state.money += 300;
        hud.setMoney(state.money);
      } else {
        const site = state.planted.site;
        state.planted = null;
        hud.announce('Charge defused!');
        endRound('ember', `Charge at Site ${site} defused`);
      }
      channel = null;
      hud.setPlant(null);
    }
  }

  function buy(itemId) {
    if (state.phase !== 'buy') return false;
    const item = itemId === 'grenade' ? GRENADE : itemId === 'armor' ? ARMOR : WEAPONS[itemId];
    if (!item || state.money < item.price) { audio.denied(); hud.buyFlash(false); return false; }
    if (itemId === 'grenade') {
      if (deps.weaponState.grenades >= 2) { audio.denied(); hud.buyFlash(false); return false; }
      deps.weaponState.grenades += 1;
    } else if (itemId === 'armor') {
      if (player.state.armor >= 50) { audio.denied(); hud.buyFlash(false); return false; }
      player.state.armor = 50;
    } else {
      deps.equipWeapon(itemId);
    }
    state.money -= item.price;
    hud.setMoney(state.money);
    hud.showBuy(state.money, state.buyLeft);
    hud.buyFlash(true);
    audio.buy();
    return true;
  }

  function update(dt, now) {
    if (state.phase === 'buy') {
      state.buyLeft -= dt;
      hud.showBuy(state.money, Math.max(0, state.buyLeft));
      if (state.buyLeft <= 0) {
        state.phase = 'play';
        state.timeLeft = ROUND_TIME;
        hud.hideBuy();
        hud.announce(`Round ${state.round} — plant the charge or eliminate Ember`);
      }
      return;
    }
    if (state.phase === 'roundEnd') {
      roundEndedAt += dt;
      if (roundEndedAt > 2.2) nextRound();
      return;
    }
    if (state.phase !== 'play') return;
    state.timeLeft -= dt;
    hud.setTimer(state.timeLeft, state.timeLeft <= 10);
    if (state.timeLeft <= 10.5 && state.timeLeft > 10.4) audio.tick();
    if (state.planted) {
      state.planted.timer -= dt;
      hud.setTimer(state.planted.timer, true);
      if (state.planted.timer <= 0) {
        deps.onChargeDetonated(state.planted);
        state.planted = null;
        endRound('vanguard', 'Charge detonated at the site');
        return;
      }
    }
    if (state.timeLeft <= 0) {
      endRound('ember', state.planted ? 'Time expired' : 'Time expired — charge never planted');
    }
  }

  // Context the bot AI reads every step.
  function botContext(playerEye, playerSpeed) {
    return {
      sites: MAP.sites,
      planted: !!state.planted,
      plantSite(bot) {
        // A carrier bot standing inside a site may plant there.
        for (const key of ['A', 'B']) {
          const site = MAP.sites[key];
          if (Math.hypot(bot.position.x - site.x, bot.position.z - site.z) < site.radius) return site;
        }
        return null;
      },
      nearSite(bot) {
        const a = MAP.sites.A;
        const b = MAP.sites.B;
        return Math.hypot(bot.position.x - a.x, bot.position.z - a.z) < Math.hypot(bot.position.x - b.x, bot.position.z - b.z) ? a : b;
      },
      enemyLastX: playerEye.x,
      enemyLastZ: playerEye.z,
      enemiesOf(bot) {
        const list = [];
        if (bot.team === 'ember') {
          list.push({ isPlayer: true, alive: player.state.alive, eyePos: playerEye, speed: playerSpeed });
          for (const ally of bots.bots) {
            if (ally.team === 'vanguard' && ally.alive) {
              list.push({ isPlayer: false, bot: ally, alive: true, eyePos: new THREE.Vector3(ally.position.x, ally.position.y + 1.5, ally.position.z), speed: 0 });
            }
          }
        } else {
          for (const enemy of bots.bots) {
            if (enemy.team === 'ember' && enemy.alive) {
              list.push({ isPlayer: false, bot: enemy, alive: true, eyePos: new THREE.Vector3(enemy.position.x, enemy.position.y + 1.5, enemy.position.z), speed: 0 });
            }
          }
        }
        return list;
      },
    };
  }

  return {
    state, startMatch, startRound, endRound, nextRound, onKill, interact, buy, update,
    botContext, teamAlive,
    onPlantedByBot(bot) {
      if (state.phase !== 'play' || state.planted) return;
      // Find which site the bot is standing in.
      for (const key of ['A', 'B']) {
        const s = MAP.sites[key];
        if (Math.hypot(bot.position.x - s.x, bot.position.z - s.z) < s.radius) {
          state.planted = { site: key, x: s.x, z: s.z, timer: CHARGE_TIME };
          state.carrier = null;
          hud.setCharge(false);
          hud.announce(`Charge planted at Site ${key} — defuse it!`);
          audio.planted();
          return;
        }
      }
    },
    onDefusedByBot() {
      if (!state.planted) return;
      const site = state.planted.site;
      state.planted = null;
      hud.announce('Charge defused by Ember!');
      endRound('ember', `Charge at Site ${site} defused`);
    },
  };
}
