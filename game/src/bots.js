// Bots: the other nine agents on the dock. Each bot is a small humanoid built from
// boxes — head (a headshot), torso, legs, a gun — with a team colour. A bot thinks
// in states: it walks a route on the map's waypoint graph, holds a position, engages
// an enemy it can see, plants the charge, defuses it, or falls back when hurt.
// It hears gunfire, reacts after a human-ish delay, and its aim worsens with
// distance and with a moving target, so a still, careful player wins duels.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const BOT_RADIUS = 0.34;
const BOT_HEIGHT = 1.74;
const BOT_SPEED = 3.7;
const EYE = 1.55;

const VANGUARD_NAMES = ['Rook', 'Haven', 'Sable'];
const EMBER_NAMES = ['Cinder', 'Ash', 'Flint', 'Onyx'];

function dijkstra(nodes, start, goal) {
  const dist = new Array(nodes.length).fill(Infinity);
  const prev = new Array(nodes.length).fill(-1);
  const done = new Array(nodes.length).fill(false);
  dist[start] = 0;
  for (let iter = 0; iter < nodes.length; iter += 1) {
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < nodes.length; i += 1) {
      if (!done[i] && dist[i] < bestDist) { bestDist = dist[i]; best = i; }
    }
    if (best === -1) break;
    done[best] = true;
    if (best === goal) break;
    for (const edge of nodes[best].edges) {
      const nd = dist[best] + edge.cost;
      if (nd < dist[edge.to]) { dist[edge.to] = nd; prev[edge.to] = best; }
    }
  }
  if (dist[goal] === Infinity) return [];
  const path = [];
  let cur = goal;
  while (cur !== -1) { path.unshift(cur); cur = prev[cur]; }
  return path;
}

function buildBody(scene, team, name) {
  const group = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({
    color: team === 'vanguard' ? 0x2c3a44 : 0x453029, roughness: 0.85, metalness: 0.1,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: team === 'vanguard' ? PALETTE.teal : PALETTE.ember, roughness: 0.5, metalness: 0.2,
    emissive: team === 'vanguard' ? PALETTE.teal : PALETTE.ember, emissiveIntensity: 0.5,
  });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9a184, roughness: 0.9 });
  function part(w, h, d, x, y, z, material, parent = group) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }
  const legL = part(0.16, 0.78, 0.2, -0.11, 0.39, 0, suit);
  const legR = part(0.16, 0.78, 0.2, 0.11, 0.39, 0, suit);
  const torso = part(0.52, 0.62, 0.3, 0, 1.08, 0, suit);
  part(0.54, 0.1, 0.32, 0, 1.32, 0, accent); // shoulder stripe
  const head = part(0.26, 0.26, 0.26, 0, 1.56, 0, skin);
  part(0.28, 0.08, 0.28, 0, 1.7, 0, accent); // helmet band
  const armL = part(0.12, 0.5, 0.14, -0.32, 1.12, 0.08, suit);
  const armR = part(0.12, 0.5, 0.14, 0.32, 1.12, 0.08, suit);
  const gun = part(0.07, 0.1, 0.62, 0.18, 1.18, -0.3, new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.4, metalness: 0.6 }));
  armL.rotation.x = -0.9;
  armR.rotation.x = -0.9;
  scene.add(group);
  return { group, head, torso, legL, legR, gun, name };
}

export function createBots(scene, map, callbacks) {
  const bots = [];
  const colliders = map.colliders;
  const probe = new THREE.Box3();
  const tmp = new THREE.Vector3();

  function overlaps(x, y, z) {
    probe.min.set(x - BOT_RADIUS, y + 0.05, z - BOT_RADIUS);
    probe.max.set(x + BOT_RADIUS, y + BOT_HEIGHT - 0.05, z + BOT_RADIUS);
    for (const c of colliders) if (probe.intersectsBox(c)) return true;
    return false;
  }

  function nearestNode(x, z) {
    let best = 0;
    let bestD = Infinity;
    map.nodes.forEach((n, i) => {
      if (n.edges.length === 0) return; // never route from an isolated node
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  function syncBot(bot) {
    bot.body.group.position.set(bot.position.x, bot.body.group.position.y, bot.position.z);
    bot.body.group.rotation.y = bot.yaw;
  }

  function spawnBot(team, name, spawn, index) {
    const body = buildBody(scene, team, name);
    const bot = {
      id: `${team}-${index}`,
      team, name, body,
      position: new THREE.Vector3(spawn.x, 0, spawn.z),
      yaw: spawn.yaw,
      health: 100,
      alive: true,
      state: 'route',
      path: [],
      pathIndex: 0,
      targetNode: -1,
      holdUntil: 0,
      lastSeen: null, // {x, y, z, at}
      reactAt: 0,
      burstLeft: 0,
      nextShotAt: 0,
      aimError: 0.02,
      walkPhase: Math.random() * 6,
      thinkAt: Math.random() * 0.2,
      channel: null, // {type: 'plant'|'defuse', until, at}
      carrying: false,
      speed: BOT_SPEED * (0.92 + Math.random() * 0.16),
      damageFlash: 0,
    };
    body.group.position.copy(bot.position);
    body.group.rotation.y = bot.yaw;
    body.head.userData = { bot, part: 'head' };
    body.torso.userData = { bot, part: 'body' };
    body.legL.userData = { bot, part: 'legs' };
    body.legR.userData = { bot, part: 'legs' };
    bots.push(bot);
    return bot;
  }

  function routeTo(bot, x, z) {
    const from = nearestNode(bot.position.x, bot.position.z);
    const to = nearestNode(x, z);
    const path = dijkstra(map.nodes, from, to);
    bot.path = path;
    bot.pathIndex = 0;
    bot.targetNode = to;
  }

  function moveAlongPath(bot, dt) {
    if (bot.pathIndex >= bot.path.length) return true;
    const node = map.nodes[bot.path[bot.pathIndex]];
    const dx = node.x - bot.position.x;
    const dz = node.z - bot.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.6) {
      bot.pathIndex += 1;
      bot.stuckTime = 0;
      bot.lastDist = undefined;
      return bot.pathIndex >= bot.path.length;
    }
    // Stuck detection: if we stop closing on the node, skip it — a waypoint
    // can sit just behind a container corner the bot cannot round.
    if (bot.lastDist !== undefined && dist > bot.lastDist - 0.05) {
      bot.stuckTime = (bot.stuckTime || 0) + dt;
      if (bot.stuckTime > 1.2) {
        bot.pathIndex += 1;
        bot.stuckTime = 0;
        bot.lastDist = undefined;
        return bot.pathIndex >= bot.path.length;
      }
    } else {
      bot.stuckTime = 0;
    }
    bot.lastDist = dist;
    const vx = (dx / dist) * bot.speed;
    const vz = (dz / dist) * bot.speed;
    const nx = bot.position.x + vx * dt;
    if (!overlaps(nx, bot.position.y, bot.position.z)) bot.position.x = nx;
    const nz = bot.position.z + vz * dt;
    if (!overlaps(bot.position.x, bot.position.y, nz)) bot.position.z = nz;
    bot.position.x = Math.max(-25.4, Math.min(25.4, bot.position.x));
    bot.position.z = Math.max(-17.4, Math.min(17.4, bot.position.z));
    const targetYaw = Math.atan2(-dx, -dz);
    let dyaw = targetYaw - bot.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    bot.yaw += dyaw * Math.min(1, dt * 6);
    return false;
  }

  function eyeOf(bot) {
    return tmp.set(bot.position.x, bot.position.y + EYE, bot.position.z);
  }

  // Can this bot see a point? Range, rough field of view, and a clear line.
  function canSee(bot, x, y, z) {
    const dx = x - bot.position.x;
    const dy = y - (bot.position.y + EYE);
    const dz = z - bot.position.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > 55) return false;
    const forward = new THREE.Vector3(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
    const toTarget = new THREE.Vector3(dx, 0, dz).normalize();
    if (forward.dot(toTarget) < 0.1 && dist > 4) return false;
    return map.losClear(bot.position.x, bot.position.y + EYE, bot.position.z, x, y, z);
  }

  function pickObjective(bot, ctx) {
    // Vanguard pushes a site; Ember holds one. The carrier goes to the nearer site.
    if (bot.team === 'vanguard') {
      const site = ctx.planted ? null : (bot.carrying ? ctx.nearSite(bot) : (Math.random() < 0.5 ? ctx.sites.A : ctx.sites.B));
      if (site) { routeTo(bot, site.x, site.z); bot.state = 'route'; return; }
      // No site to push: hunt the last known enemy position.
      routeTo(bot, ctx.enemyLastX ?? 0, ctx.enemyLastZ ?? 0);
      bot.state = 'route';
      return;
    }
    // Ember: hold near a site, spread across both.
    const site = bot.id.endsWith('0') || bot.id.endsWith('2') ? ctx.sites.A : ctx.sites.B;
    const holdX = site.x + (Math.random() * 6 - 3);
    const holdZ = site.z + 3 + Math.random() * 4;
    routeTo(bot, holdX, holdZ);
    bot.state = 'route';
    bot.holdSite = site;
  }

  function shootAt(bot, enemy, dt, now) {
    // Fire in bursts with a reaction delay and distance-based error.
    if (now < bot.reactAt) return;
    if (bot.burstLeft <= 0) {
      if (now < bot.nextShotAt) return;
      bot.burstLeft = 3 + Math.floor(Math.random() * 3);
      bot.nextShotAt = now + 0.7 + Math.random() * 0.6;
    }
    if (now < bot.nextShotAt - 0.6) return;
    bot.nextShotAt = now + 0.13;
    bot.burstLeft -= 1;
    const target = enemy.eyePos.clone();
    target.y -= 0.25; // aim at the chest
    const from = new THREE.Vector3(bot.position.x, bot.position.y + 1.35, bot.position.z);
    const dist = from.distanceTo(target);
    const error = 0.012 + dist * 0.0016 + (enemy.speed || 0) * 0.003;
    const hitChance = Math.max(0.1, Math.min(0.62, 0.55 - dist * 0.007));
    const hit = Math.random() < hitChance;
    const head = hit && Math.random() < 0.14;
    let end;
    if (hit) {
      end = target.clone();
      const damageAmount = Math.round((head ? 44 : 22) * (dist > 30 ? 0.75 : 1));
      if (enemy.isPlayer) callbacks.onPlayerHit(damageAmount, bot, head);
      else callbacks.onBotHit(bot, enemy.bot, damageAmount, head);
    } else {
      end = target.clone();
      end.x += (Math.random() - 0.5) * dist * error * 4;
      end.y += (Math.random() - 0.5) * dist * error * 4 + 0.3;
      end.z += (Math.random() - 0.5) * dist * error * 4;
    }
    callbacks.onTracer(from, end);
    callbacks.onShotSound(bot, dist);
    bot.body.gun.position.z = -0.24;
    setTimeout(() => { bot.body.gun.position.z = -0.3; }, 60);
  }

  function damage(bot, amount, part) {
    if (!bot.alive) return false;
    bot.health -= amount;
    bot.damageFlash = 1;
    if (bot.health <= 0) {
      bot.alive = false;
      bot.health = 0;
      bot.body.group.rotation.x = -Math.PI / 2;
      bot.body.group.position.y = 0.25;
      return true;
    }
    // Being shot makes a bot turn toward the shooter and fall back if badly hurt.
    if (bot.health < 35 && bot.state !== 'engage') {
      bot.state = 'fallback';
      bot.holdUntil = 0;
    }
    return false;
  }

  function step(dt, now, ctx) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      // Walk-cycle animation.
      bot.walkPhase += dt * 9;
      const swing = Math.sin(bot.walkPhase) * 0.45;
      bot.body.legL.rotation.x = swing;
      bot.body.legR.rotation.x = -swing;
      if (bot.damageFlash > 0) {
        bot.damageFlash -= dt * 4;
        bot.body.torso.material.emissive.setHex(0x881111);
        bot.body.torso.material.emissiveIntensity = Math.max(0, bot.damageFlash);
      }

      // Perception: scan for enemies on a staggered timer.
      if (now >= bot.thinkAt) {
        bot.thinkAt = now + 0.15 + Math.random() * 0.1;
        let nearest = null;
        let nearestDist = Infinity;
        for (const enemy of ctx.enemiesOf(bot)) {
          if (!enemy.alive) continue;
          const p = enemy.eyePos;
          const d = Math.hypot(p.x - bot.position.x, p.y - (bot.position.y + EYE), p.z - bot.position.z);
          if (d < nearestDist && canSee(bot, p.x, p.y, p.z)) {
            nearest = enemy;
            nearestDist = d;
          }
        }
        if (nearest) {
          if (!bot.lastSeen) bot.reactAt = now + 0.35 + Math.random() * 0.35;
          bot.lastSeen = { enemy: nearest, at: now };
          bot.state = 'engage';
        } else if (bot.state === 'engage') {
          // Lost sight: remember the spot briefly, then go back to the route.
          if (bot.lastSeen && now - bot.lastSeen.at > 2.5) {
            bot.lastSeen = null;
            bot.state = 'route';
            pickObjective(bot, ctx);
          }
        }
      }

      // Plant / defuse channels.
      if (bot.channel) {
        if (now >= bot.channel.until) {
          const type = bot.channel.type;
          bot.channel = null;
          if (type === 'plant') callbacks.onPlanted(bot);
          else callbacks.onDefused(bot);
        } else {
          // Stay still while channelling.
          continue;
        }
      }

      if (bot.state === 'engage' && bot.lastSeen) {
        const enemy = bot.lastSeen.enemy;
        if (!enemy.alive) { bot.lastSeen = null; bot.state = 'route'; pickObjective(bot, ctx); syncBot(bot); continue; }
        const p = enemy.eyePos;
        const dx = p.x - bot.position.x;
        const dz = p.z - bot.position.z;
        const targetYaw = Math.atan2(-dx, -dz);
        let dyaw = targetYaw - bot.yaw;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        bot.yaw += dyaw * Math.min(1, dt * 8);
        const dist = Math.hypot(dx, dz);
        // Keep a fighting distance: close in if far, back off if point blank.
        if (dist > 16) moveAlongPath(bot, dt) || routeTo(bot, p.x, p.z);
        else if (dist < 3) {
          const nx = bot.position.x + Math.sin(bot.yaw) * bot.speed * dt;
          const nz = bot.position.z + Math.cos(bot.yaw) * bot.speed * dt;
          if (!overlaps(nx, bot.position.y, bot.position.z)) bot.position.x = nx;
          if (!overlaps(bot.position.x, bot.position.y, nz)) bot.position.z = nz;
        }
        shootAt(bot, enemy, dt, now);
        syncBot(bot);
        continue;
      }

      if (bot.state === 'fallback') {
        // Run toward the team's spawn, then rejoin.
        routeTo(bot, bot.team === 'vanguard' ? 0 : 0, bot.team === 'vanguard' ? 15 : -15);
        if (moveAlongPath(bot, dt)) { bot.state = 'route'; pickObjective(bot, ctx); }
        syncBot(bot);
        continue;
      }

      // Route / hold behaviour.
      if (bot.state === 'route') {
        if (bot.path.length === 0) pickObjective(bot, ctx);
        const arrived = moveAlongPath(bot, dt);
        if (arrived) {
          // At a site with the charge: start planting.
          if (bot.carrying && ctx.plantSite) {
            const site = ctx.plantSite(bot);
            if (site) {
              bot.channel = { type: 'plant', until: now + 3, at: now };
              bot.state = 'planting';
              continue;
            }
          }
          if (ctx.planted && bot.team === 'ember') {
            bot.channel = { type: 'defuse', until: now + 5, at: now };
            bot.state = 'defusing';
            continue;
          }
          bot.state = 'hold';
          bot.holdUntil = now + 3 + Math.random() * 4;
          // Scan the lane while holding.
          bot.yaw += (Math.random() - 0.5) * 1.2;
        }
      } else if (bot.state === 'hold') {
        if (now >= bot.holdUntil) { bot.state = 'route'; pickObjective(bot, ctx); }
        else bot.yaw += Math.sin(now * 0.5 + bot.walkPhase) * dt * 0.4;
      } else if (bot.state === 'planting' || bot.state === 'defusing') {
        // Channel handled above; nothing to do.
      } else {
        pickObjective(bot, ctx);
      }

      syncBot(bot);
    }
  }

  function respawnAll(round, carrier) {
    for (const bot of bots) scene.remove(bot.body.group);
    bots.length = 0;
    MAP_SPAWNS.vanguard.forEach((spawn, i) => {
      const bot = spawnBot('vanguard', VANGUARD_NAMES[i], spawn, i);
      bot.body.group.userData.isBotBody = true;
      if (carrier === 'vanguard-0' && i === 0) bot.carrying = true;
    });
    MAP_SPAWNS.ember.forEach((spawn, i) => {
      const bot = spawnBot('ember', EMBER_NAMES[i], spawn, i);
      bot.body.group.userData.isBotBody = true;
    });
  }

  function aliveCount(team) {
    return bots.filter((b) => b.team === team && b.alive).length;
  }

  return {
    bots, step, damage, respawnAll, aliveCount,
    hitMeshes() {
      const meshes = [];
      for (const bot of bots) {
        if (!bot.alive) continue;
        meshes.push(bot.body.head, bot.body.torso, bot.body.legL, bot.body.legR);
      }
      return meshes;
    },
    carrier() { return bots.find((b) => b.carrying && b.alive) || null; },
  };
}

// Spawn tables live here so match.js and bots.js agree on them.
import { MAP } from './map.js';
const MAP_SPAWNS = { vanguard: MAP.vanguardSpawn, ember: MAP.emberSpawn };
