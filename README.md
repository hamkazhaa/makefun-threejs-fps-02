# Harbour Line — a three.js tactical FPS

A round-based tactical first-person shooter in the style Counter-Strike made
famous, built on three.js 0.187.0 from static files with no build step and no
network. Single-player against bots, on the docks of Port Meridian at dusk.

## The game

- **Two teams, short rounds.** You lead Vanguard (teal) against the Ember team
  (orange). First to 7 rounds takes the match.
- **Objective.** Vanguard carries a charge: plant it at Site A (under the
  gantry crane) or Site B (by the warehouse) and defend it until it blows, or
  eliminate the Ember team. Ember wins by elimination, by running the clock
  out, or by defusing a planted charge.
- **Money and a buy menu.** Kills pay $300, round wins $3,250, losses pay a
  streak bonus. Between rounds, press **B** to buy: the AR-77 Longshot rifle,
  VK-9 Repeater SMG, M12 Breacher shotgun, LR-90 Deadeye sniper, the P9
  Sidearm, frag grenades and a Kevlar vest.
- **Gunplay where accuracy counts.** Hitscan weapons with headshots (4×),
  recoil, spread that grows with movement and sustained fire and shrinks when
  you crouch or aim down sights, and damage falloff at range. Stopping to aim
  pays.
- **Bots that play the objective.** Nine bots navigate the map on a waypoint
  graph, hold positions, engage enemies they can see, react after a human-ish
  delay, plant the charge, defuse it, and fall back when hurt. They hear
  gunfire and remember where they last saw you.
- **The map.** Port Meridian: three lanes (west yard, mid containers, east
  yard) between two plant sites, with stacked shipping containers, a gantry
  crane, a warehouse, sodium lamps and a low dusk sun.
- **HUD.** Health and armour, ammunition, money, round timer and score, alive
  counts, killfeed, hitmarkers, a live minimap, plant/defuse progress, and
  damage direction feedback.
- **Sound.** Every effect is synthesised with WebAudio at runtime — gunshots,
  reloads, hit ticks, plant beeps, explosions, round stingers — so the game
  ships no audio files.

## Controls

| Key | Action |
| --- | ------ |
| WASD | Move |
| Mouse | Look (click the game to grab the mouse) |
| Click | Fire |
| Right-click | Aim down sights |
| R | Reload |
| G | Throw frag grenade |
| E | Plant / defuse the charge (hold) |
| B | Buy menu |
| 1–5 | Weapons, Q swap weapon |
| Ctrl | Crouch, Space jump, M mute |

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

## Build the entry

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and
writes `dossier.json` with the kit's `buildDossier`. Screenshots are real
renders of the game, taken in headless Chrome from the deterministic
`?shot=` scenes (`shots.json`): start, mid-round firefight, buy menu, round
won.

## Layout

- `game/index.html` — page, HUD and import map
- `game/src/main.js` — boot, fixed-step loop, shooting, shot scenes
- `game/src/map.js` — Port Meridian: geometry, colliders, waypoint graph
- `game/src/bots.js` — bot bodies and AI (route, hold, engage, plant, defuse)
- `game/src/match.js` — rounds, economy, plant/defuse, win conditions
- `game/src/weapons.js` — weapon data and first-person viewmodels
- `game/src/player.js` — movement and collision
- `game/src/effects.js` — tracers, sparks, explosions, grenades
- `game/src/hud.js` — HUD, buy menu, overlays, minimap
- `game/src/audio.js` — synthesised sound effects
- `game/src/input.js` — keyboard, mouse and pointer lock
- `game/src/palette.js` — the dusk palette
- `game/vendor/three/` — three.js 0.187.0, byte for byte from the kit

## License

MIT. three.js is (c) its authors, MIT licensed.
