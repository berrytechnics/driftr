<p align="center">
  <img src="public/driftr.png" alt="Driftr" width="420" />
</p>

<p align="center">
  Pilot a ship through a compressed Sol system — mine the belt, sell cargo at Thalassa Station, and fight bandits in the dark.
</p>

<p align="center">
  <a href="https://berrytechnics.github.io/driftr/"><strong>Play online →</strong></a>
</p>

Browser space-flight game built with React, Three.js, and React Three Fiber. Installable as a PWA. Pushes to `main` deploy to GitHub Pages.

## Play locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). After the boot splash, click **Engage / Launch** to capture the pointer and fly.

```bash
npm run build    # production build → dist/ (base path /driftr/)
npm run preview  # serve the build locally (use this to test the PWA)
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

Music and SFX volume live in the start / pause menu and persist across sessions.

## The system

Named bodies orbit Sol: Hermes, Ares, Boreas, Thalassa, Kronos, and Ouranos, plus moons. The dense asteroid belt sits outside Thalassa. Hold `M` for a live system map with your ship, the station, and contacts.

## Loop

1. **Mine** — blast asteroids for rock ore, volatile ice, and rare alloys. Occasional speed and fire-rate buff pickups drop too.
2. **Fight** — bandits patrol the belt. Hull HP, weapon heat / overheat, hit feedback, and off-screen chevrons keep combat readable. Die and you dump cargo (credits stay).
3. **Dock** — approach Thalassa Station and press `F`. Sell cargo, repair, then undock back into flight.
4. **Save** — credits, cargo, hull, heat, buffs, and dock state autosave to `localStorage`.

## Features

- Boot splash that tracks asset load before the start menu
- Flight model with thrusters, boost, mouse aiming, and roll
- Procedural asteroid belt with mining and loot
- Bandit AI and combat HUD
- Station economy and repair at Thalassa
- Theme music in flight, station ambience when docked, separate volume sliders
- Installable PWA with offline-ready assets (service worker on production builds)
- Leva debug panel in local `dev` only (stubbed out of production)

## Stack

- [React](https://react.dev) + [Vite](https://vite.dev)
- [Three.js](https://threejs.org) via [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) / [Drei](https://github.com/pmndrs/drei)
- [Leva](https://github.com/pmndrs/leva) for debug controls
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) for install / offline support
