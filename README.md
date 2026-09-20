# Night Walk — Prototype 01

A Phaser 3 + TypeScript side-scrolling movement prototype set in a pixel-art city.

## Run

```bash
npm install
npm run dev
```

Open the URL printed by Vite. `npm run build` checks TypeScript and creates a production bundle; `npm run preview` serves that bundle.

## Controls

| Action | Keys |
| --- | --- |
| Move | A / D or Left / Right |
| Jump | Space, W, or Up |
| Return to start | R |

Hold jump for a higher jump; release early for a shorter hop. Jumping requires ground contact, with 100 ms of coyote time and a 120 ms input buffer. Holding jump does not automatically jump again on landing.

## Scene

- A 3,840-pixel world, a 960 × 540 viewport, six parallax layers, and a following camera.
- Continuous ground and solid elevated platforms for testing jumps and collisions.
- A finish marker, position progress, and immediate restart.
- Movement speed: 270 px/s; jump speed: 600 px/s; gravity: 1,400 px/s².
- `src/main.ts` owns the scene, layout, physics, controls, and HUD.
- `src/assets.ts` contains verified asset lists and action-level animation registration.

## Assets

Existing static layers come from `public/assets/images/Backgrounds_{Sky,Moon,BuildingsFar,BuildingsBack,BuildingsMid,BuildingsClose}.png`.

The character uses complete groups from `public/assets/sprites/Avatar/`:

| Action directory | Frames | Playback |
| --- | --- | --- |
| Idle | Idle01–Idle07 (7) | 10 fps, loop |
| Run | Run01–Run08 (8) | 10 fps, loop |
| JumpRise | JumpRise01 (1) | Once, held during ascent |
| JumpMid | JumpMid01 (1) | Once, held near apex |
| JumpFall | JumpFall01 (1) | Once, held during descent |

10 fps is an adjustable prototype assumption, not source timing metadata. Jump states use the dedicated single-frame source actions. All selected frames are 96 × 84; the collision body excludes transparent padding. No terrain tiles were found, so ground, platforms, and markers use Phaser primitives.
