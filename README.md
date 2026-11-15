# Eko at Dusk

A walkable Lagos street at sunset, with a sandy path down to an Atlantic beach. Everything you see and hear is generated in code at load time: buildings, signs, danfos, people, the sea and the sound. There are no model, texture or audio files. The whole thing is one HTML file, `index.html` (about 260 KB, 82 KB gzipped). It runs in the browser with [three.js](https://threejs.org), loaded from a CDN.

## Run it

Open `index.html` in a browser with WebGL 2. You need an internet connection, because three.js and the fonts load from CDNs. You can also serve the folder and open http://localhost:8000:

```bash
python -m http.server 8000
```

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

## What's in the file

The page's markup and styles come first, then one script. The script is split into sections. Each section has its own scope and shares only the names in its closing `return { ... }`. The sections run in this order:

| Section | What it does |
| --- | --- |
| `util` | Seeded random numbers, colours, a mesh builder and sagging cables |
| `textures` | Every street texture, painted onto canvases at load time |
| `atmosphere` | Fixed sunset sun, height fog, sky, ground shading, camera grade |
| `facade` | Windows with fake rooms behind them, balusters, dishes, AC units, water tanks |
| `city` | The street: road, gutters, buildings, shops, signs, poles, wires, bridge, bus stop, stalls |
| `livery`, `vehicles` | Danfos, koropes, BRT buses and cars, with their paint, rust and decals |
| `traffic` | Go-slow traffic, horns, headlights and vehicle shadows |
| `audio` | Synthesised street, horn, music, generator, wind, gull and wave sounds |
| `ocean` | The sea (swell, breaking waves, run-up, foam) and the sand |
| `wind`, `beach`, `life` | Palms, beach bars, canoes, gulls, flags, grill smoke and the sea breeze |
| `humans` | Jointed people with sculpted faces, fingers, clothing and spring-driven cloth |
| `crowds` | Where people are, and how they avoid each other, props and you |
| `cloth` | Real cloth simulation for the nearest skirts, wrappers, dresses and kaftans |
| `main` | Renderer, camera, walking, viewpoints, post-processing, main loop |

Shop names and brands are invented.
