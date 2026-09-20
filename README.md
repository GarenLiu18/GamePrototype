# Night Walk — Prototype 01

A Phaser 3 + TypeScript side-scrolling bus-defense prototype set in a pixel-art city.

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
| Drop through a raised platform | Down |
| Fire | Left mouse click; shoots in the facing direction |
| Restart encounter (restore all health and enemies) | R |

Hold jump for a higher jump; release early for a shorter hop. Jumping requires ground contact, with 100 ms of coyote time and a 120 ms input buffer. Holding jump does not automatically jump again on landing. Raised platforms are one-way: jump upward through them, land from above, and press Down while standing on one to drop through it.

Click inside the game to fire once. Each shot finishes its animation before accepting another click (250 ms standing/airborne, 400 ms running). Movement and jumping remain available during firing. Bullets travel horizontally at 760 px/s without gravity and are recycled on terrain contact, enemy contact, at the world edges, or after 1.4 seconds. Each bullet damages at most one enemy. R also clears bullets.

## Defense encounter

- The white bus is the spawn landmark. The player starts beside its front door.
- Player: 100 HP; bus: 300 HP. Every 15 seconds, clustered waves spawn on both sides: five melee and three ranged enemies on the right, plus five melee and three ranged allies on the left. Each group occupies a 490-pixel-wide area, and living units from earlier waves remain. Every combat unit has 60 HP and deals 10 damage to another unit. Red health labels identify enemy melee units, amber labels identify enemy ranged units, and gray labels identify allies.
- Enemies walk left at 65 px/s, never jump or turn around, and use the ground lane beneath the raised platforms.
- A left-facing melee enemy can strike a target within 58 px of its body, overlapping its horizontal strike band (16–50 px above its feet). Players behind it are ignored.
- A reachable player has priority over the bus. If the player jumps out of reach or moves behind the enemy, it immediately resumes walking left, or attacks the bus if already in reach.
- Attacks have a 200 ms windup, 600 ms animation, and 1,000 ms cooldown. Range and height are checked again before damage. Each attack deals 10 player damage or 20 bus damage.
- Touching a living enemy from either side also deals 10 player damage. Contact damage and melee share the same 1,200 ms invulnerability window; additional hits during it do not deal damage, extend immunity, spawn effects, or cause more knockback. Enemies still never turn around to attack a player behind them.
- An accepted hit pushes the player away from the enemy at 260 px/s with a small 180 px/s upward impulse. Movement, jumping, and firing are locked during the complete 300 ms Knockback animation, then resume while immunity remains active. Shooting animations are interrupted cleanly by damage.
- OnHit feedback uses a brief impact flash, a red initial flash, and opacity blinking every 100 ms during immunity. No source asset named OnHit exists. Death, victory, and R restore full opacity and clear the temporary damage state.
- Player/bus health appears in the fixed HUD and above each actor; enemies have individual health bars. Enemies play their death animation and stop colliding at zero HP.
- Allies are gray-tinted copies of the player sprite and advance right at 65 px/s. Melee allies play the complete six-frame SwordComboA action when an enemy is in their forward strike band. Ranged allies stay behind the melee line, play all four BowAim frames, and then fire the Avatar arrow as a ballistic projectile. Enemies can target and damage allies; allies show individual health bars, play the complete nine-frame Die action at zero HP, and stop colliding after death.
- Player death or bus destruction ends the encounter. Waves arrive on the fixed timer even when enemies from earlier waves are still alive, and continue without a final victory state. The HUD shows the current wave and the next-wave countdown. Press R to fully reset health and return to wave one after defeat or during play.
- Balance values and directional melee logic are in `src/combat.ts`.

## Ranged enemies

- Ranged units stop when a target is 48–520 px ahead and within 300 px vertically. A player in range has priority; otherwise they target the bus or continue walking left. They never turn to shoot a player behind them.
- Each shot plays all six BlastCharge frames (600 ms at 10 fps), then all five BlastAttack frames (500 ms at 10 fps). After release, they wait 2,200 ms before starting another charge. Leaving range or moving behind them during charging cancels that charge. Death also prevents release.
- A projectile aims at the target's position at release and follows a fixed ballistic arc under 650 px/s² gravity. Flight time is distance-dependent (0.65–1.15 s). It does not track the target in flight, so moving after release can dodge it.
- Enemy projectiles use all four `Enemy/Effects/Projectile` frames at 12 fps, loop, with a shared visible crop at (30, 54), 39 × 7 pixels. The sprite rotates along its velocity. They pass through elevated platforms; ground, player, or bus contact consumes them. A 3.5 s lifetime and world bounds also recycle them. Player bullets still collide with platforms.
- Projectile damage uses the existing 10 player / 20 bus damage rules, including player knockback, OnHit feedback, blinking, and shared invulnerability. Projectiles cannot damage other enemies. Defeat/victory and R clear every enemy projectile.

## Scene

- A 3,840-pixel world, a 960 × 540 viewport, six parallax layers, and a following camera.
- Continuous solid ground and one-way elevated platforms that can be crossed upward or dropped through with Down.
- A defend-the-bus objective, health displays, result overlay, and immediate restart.
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
| Knockback | Knockback01–Knockback06 (6) | 20 fps, once on accepted damage |
| Die | Die01–Die09 (9) | 10 fps, once on allied death |
| Combat/SwordComboA | SwordCombo0101–SwordCombo0106 (6) | 10 fps, once per allied melee attack |
| Combat/BowAim | BowAim01–BowAim04 (4) | 10 fps, once per allied ranged attack |
| Combat/GunFire | GunFire01–GunFire05 (5) | 20 fps, once per stationary/airborne shot |
| Combat/GunRunFire | GunRunFire01–GunRunFire08 (8) | 20 fps, once per moving grounded shot |
| Weapons/Bullet | Bullet01–Bullet02 (2) | 20 fps, loop while active |
| Weapons/Arrow | Arrow01 (1) | Static ballistic allied projectile |

Playback speeds are adjustable prototype assumptions, not source timing metadata. Jump states use the dedicated single-frame source actions. All selected source frames are 96 × 84; collision bodies exclude transparent padding. Bullet texture frames use the shared visible bounds (x=43, y=44, width=9, height=2) of both source images. No terrain tiles were found, so ground, platforms, and markers use Phaser primitives.

The bus uses `public/assets/images/Vehicles_BusWhite_Idle.png` (176 × 80), cropped to its visible 132 × 46 region at (22, 18) and displayed at 2× scale.

Enemy groups come from `public/assets/sprites/Enemy/`, all 96 × 84:

| Action directory | Frames | Playback |
| --- | --- | --- |
| Walk | Walk01–Walk08 (8) | 10 fps, loop |
| Idle | Idle01–Idle07 (7) | 10 fps, loop while waiting for cooldown |
| Attack | Attack01–Attack06 (6) | 10 fps, once; may cancel when the target leaves reach |
| BlastCharge | BlastCharge01–BlastCharge06 (6) | 10 fps, once before a ranged shot |
| BlastAttack | BlastAttack01–BlastAttack05 (5) | 10 fps, once on release |
| Effects/Projectile | Projectile01–Projectile04 (4) | 12 fps, loop during flight |
| Die | Die01–Die07 (7) | 10 fps, once; final source frame is fully transparent |

Source enemies face right; their sprites are flipped horizontally to face left. The full groups are loaded and registered with separate Enemy namespaces.
