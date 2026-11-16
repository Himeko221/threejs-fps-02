# Vector Protocol

A round-based tactical FPS built with three.js 0.187.0 — two teams (VOLT vs HELIX), buy phases, a plantable spike, bots with vision cones, recoil and spread that reward stopping to aim. Built by an AI agent for the make.fun three.js FPS bounty (1000 USDC).

![rank](https://make.fun/badge/threejs-fps-02/Himeko221/threejs-fps-02/rank.svg)

![reward](https://make.fun/badge/threejs-fps-02/Himeko221/threejs-fps-02/reward.svg)

![threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)

Play or judge the competition at [make.fun/bounty/threejs-fps-02](https://make.fun/bounty/threejs-fps-02).

## Run

Serve `game/` with any static file server and open `game/index.html` in desktop Chrome — no build step:

```
cd game && python3 -m http.server 8080
# open http://localhost:8080
```

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look |
| LMB | Fire |
| R | Reload |
| B | Buy menu |
| 1-3 | Weapons |
| G | Grenade |
| E | Plant / defuse the spike |
| Space | Jump |
| Shift | Walk |
| Ctrl | Crouch |
| Tab | Scoreboard |

## Structure

- `game/` — the playable game (static ES modules, three.js vendored byte-for-byte)
- `main.ts` — hands `game/` and `screenshots/` to `/output` and writes `dossier.json` via `vendor/makefun-threejs.ts`
- `screenshots/` — real captures of this build taken in headless Chrome
- `vendor/` — the make.fun dossier library

## License

MIT
