# Eko at Dusk

A walkable Lagos street at sunset, with a sandy path down to an Atlantic beach. Everything you see and hear is generated in code at load time: buildings, signs, danfos, people, the sea and the sound. There are no model, texture or audio files. It runs in the browser with [three.js](https://threejs.org) (loaded from a CDN).

## Run it

The page uses JavaScript modules, so it has to be served over HTTP rather than opened as a file:

```bash
python -m http.server 8000
```

Then open http://localhost:8000.

## Single-file version

`dist/eko-at-dusk.html` is the whole scene in one HTML file (about 230 KB, 72 KB gzipped). You can open it straight from disk, email it or host it anywhere. It still needs an internet connection, because three.js and the fonts load from CDNs.

To rebuild it after changing anything in `src/` or `index.html`:

```bash
python tools/build_single.py
```

The script needs only Python 3. Each module is wrapped in its own scope, in the order the browser would load it, and comments and indentation are stripped. If Node.js is installed, the result is syntax-checked before it is written.

## Controls

| Key | Action |
| --- | --- |
| W A S D, mouse | Walk and look (click to capture the mouse) |
| Shift | Run |
| 1 – 7 | Viewpoints: kerb, bridge (both ways), bus stop, median, beach path, shoreline |
| M | Sound on or off |
| H | Frame stats |
| Esc | Pause |

On a phone: left thumb walks, right thumb looks.

## What's in it

| File | What it does |
| --- | --- |
| `src/main.js` | Renderer, camera, walking, viewpoints, post-processing, main loop |
| `src/atmosphere.js` | Fixed sunset sun, height fog, sky, ground shading, camera grade |
| `src/city.js` | The street: road, gutters, buildings, shops, signs, poles, wires, bridge, bus stop, stalls |
| `src/facade.js` | Windows with fake rooms behind them, balusters, dishes, AC units, water tanks |
| `src/textures.js` | Every street texture, painted onto canvases at load time |
| `src/vehicles.js`, `src/livery.js` | Danfos, koropes, BRT buses and cars, with their paint, rust and decals |
| `src/traffic.js` | Go-slow traffic, horns, headlights and vehicle shadows |
| `src/ocean.js` | The sea (swell, breaking waves, run-up, foam) and the sand |
| `src/beach.js`, `src/life.js`, `src/wind.js` | Palms, beach bars, canoes, gulls, flags, grill smoke and the sea breeze |
| `src/humans.js` | Jointed people with sculpted faces, fingers, clothing and spring-driven cloth |
| `src/cloth.js` | Real cloth simulation for the nearest skirts, wrappers, dresses and kaftans |
| `src/crowds.js` | Where people are, and how they avoid each other, props and you |
| `src/audio.js` | Synthesised street, horn, music, generator, wind, gull and wave sounds |
| `tools/build_single.py` | Bundles everything into `dist/eko-at-dusk.html` |

Shop names and brands are invented.
