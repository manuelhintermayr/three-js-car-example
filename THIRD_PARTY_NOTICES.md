# Third-Party Notices

This document lists third-party code and assets used by
**threejs-car-example**, and separates them from the project's own source code.

## 1. Own source code

The project's own source code is licensed under the **MIT License**
(see [LICENSE](LICENSE)), Copyright (c) 2025 Manuel Hintermayr.

It is a port of [babylon-js-car-example](https://github.com/manuelhintermayr/babylon-js-car-example)
(MIT License, same author) from Babylon.js + Havok to Three.js + Rapier. The Vue.js
components and stylesheets were taken over from that project unchanged.

## 2. Third-party example code the project builds on

The car physics and the camera controls of the original project are based on public
Babylon.js Playground demos. This port re-implements the same mechanics on top of Rapier
and Three.js, so the demos remain the conceptual origin of those parts. Babylon.js
Playground snippets are community-provided examples; no separate per-snippet license is
stated on the Playground, so refer to the Babylon.js project for its terms.

| Part of the project | Source | License |
|---|---|---|
| Car physics setup (frame, axles, wheels, joint motors) | Babylon.js Playground demo `#ANV5OM#139` (<https://www.babylonjs-playground.com/#ANV5OM#139>) | Babylon.js Playground example — no separate license stated; Babylon.js itself is Apache-2.0 |
| Mouse / camera controls | Babylon.js Playground demo `#FMQX86#1` (<https://playground.babylonjs.com/#FMQX86#1>) | Babylon.js Playground example — no separate license stated; Babylon.js itself is Apache-2.0 |
| Selective bloom compositing (`game/rendering.js`) | Three.js example `webgl_postprocessing_unreal_bloom_selective` (<https://threejs.org/examples/#webgl_postprocessing_unreal_bloom_selective>) | MIT (Three.js) |

## 3. Third-party libraries

All libraries are loaded at runtime from public CDNs (see the import map in
`index.html`). Each remains under its own license; refer to the respective project for
the authoritative terms:

- **[Three.js](https://threejs.org/)** — MIT
- **[Rapier](https://rapier.rs/)** (`@dimforge/rapier3d-compat`) — Apache License 2.0
- **[Vue.js](https://vuejs.org/)** — MIT

## 4. 3D model

The 3D car model is **hand-made** and is not covered by the code license above.
It was modelled by Manuel Hintermayr for his personal **manuelhintermayr-portfolio**
project and is reused here with attribution. If the model is used elsewhere, please
credit that project as the source.

| Asset | Origin |
|---|---|
| Car 3D model (`game/models/car.glb`) | Hand-made low-poly Ford Anglia by Manuel Hintermayr, created for the manuelhintermayr-portfolio project; Draco-compressed for the web |

## 5. Trademarks

Product and project names referenced above are the property of their respective
owners and are used for identification only.
