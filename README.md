# Driftr

A browser space-flight game. Pilot a ship through a solar system — mine the asteroid belt, sell cargo at Thalassa Station, and fight bandits along the way.

Built with React, Three.js, and React Three Fiber.

## Play online

**https://berrytechnics.github.io/driftr/**

Pushes to `main` deploy automatically via GitHub Pages.

## Play locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`), then click **Engage / Launch** to capture the pointer and fly.

```bash
npm run build    # production build → dist/ (base path /driftr/)
npm run preview  # serve the build locally
```

## Controls

| Input | Action |
| --- | --- |
| Mouse / arrows | Steer |
| `W` / `S` | Thrust / brake |
| `Shift` | Boost |
| `Q` / `E` | Roll |
| LMB / `F` | Fire cannons |
| Hold `M` | System map |
| `F` (near station) | Dock |
| `Esc` | Pause / resume |

## Features

- **Flight** — thrusters, boost, mouse aiming, weapon heat / overheat
- **Solar system** — star, planets, moons, dense asteroid belt
- **Mining** — destroy rocks for ore, ice, and rare alloys (plus short buff pickups)
- **Station** — dock at Thalassa to sell cargo and repair
- **Combat** — bandit encounters with hull HP, hit feedback, and off-screen chevrons
- **Progress** — credits, cargo, and hull state save to `localStorage`

Dev tuning (sun, belt density, flight feel, etc.) lives in the Leva panel during local development. The panel is hidden in production builds.

## Stack

- [React](https://react.dev) + [Vite](https://vite.dev)
- [Three.js](https://threejs.org) via [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) / [Drei](https://github.com/pmndrs/drei)
- [Leva](https://github.com/pmndrs/leva) for debug controls
