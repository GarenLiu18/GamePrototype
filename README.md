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

Click inside the game to fire once. Each shot finishes its animation before accepting another click (250 ms standing/airborne, 400 ms running). The player has a three-round magazine; after the third shot it automatically plays all nine `Combat/GunReload` frames at 10 fps and cannot fire again until the 0.9-second reload completes. A hit reaction interrupts reloading and automatically resumes it after Knockback when the magazine is empty. Movement and jumping remain available during firing and reloading. Bullets travel horizontally at 760 px/s without gravity and are recycled on terrain contact, enemy contact, at the world edges, or after 1.4 seconds. Each bullet damages at most one enemy. R also clears bullets.

## Defense encounter

- The white bus is the spawn landmark. The player starts beside its front door.
- Player: 100 HP; bus: 300 HP. Every 15 seconds, clustered waves spawn on both sides: five melee and three ranged enemies on the right, plus five melee and three ranged allies on the left. Melee and ranged roles are shuffled together inside the same compact formation. Adjacent slots are 28 pixels apart with up to 6 pixels of random jitter, keeping the complete group within roughly 210 pixels. The enemy spawn center only advances right: once allied units push beyond the original battle area, later enemy waves appear at least 900 pixels beyond the leading living ally instead of spawning inside the allied formation. Living units from earlier waves remain. Every combat unit has 60 HP and deals 10 damage to another unit. Red health labels identify enemy melee units, amber labels identify enemy ranged units, and gray labels identify allies.
- Enemies walk left at 65 px/s, never jump or turn around, and use the ground lane beneath the raised platforms.
- A left-facing melee enemy can strike a target within 58 px of its body, overlapping its horizontal strike band (16–50 px above its feet). Players behind it are ignored.
- Target priority is ally, then player, then bus. If any allied unit is inside an enemy's forward attack area, the enemy chooses an ally even when the player is closer. Distance only decides which ally to select. If the current target leaves the valid area or moves behind the enemy, it immediately resumes walking left or selects another valid target.
- Attacks have a 200 ms windup, 600 ms animation, and 1,000 ms cooldown. Range and height are checked again before damage. Each attack deals 10 player damage or 20 bus damage.
- Touching a living enemy from either side also deals 10 player damage. Contact damage and melee share the same 1,200 ms invulnerability window; additional hits during it do not deal damage, extend immunity, spawn effects, or cause more knockback. Enemies still never turn around to attack a player behind them.
- An accepted hit pushes the player away from the enemy at 260 px/s with a small 180 px/s upward impulse. Movement, jumping, and firing are locked during the complete 300 ms Knockback animation, then resume while immunity remains active. Shooting animations are interrupted cleanly by damage.
- OnHit feedback uses a brief impact flash, a red initial flash, and opacity blinking every 100 ms during immunity. No source asset named OnHit exists. Death, victory, and R restore full opacity and clear the temporary damage state.
- Player/bus health appears in the fixed HUD and above each actor; enemies have individual health bars. Enemies play their death animation and stop colliding at zero HP.
- Allies are gray-tinted copies of the player sprite and advance right at 65 px/s. Melee allies play the complete six-frame SwordComboA action when an enemy is in their forward strike band. Ranged allies stay behind the melee line, play all four BowAim frames, and then fire the Avatar arrow as a ballistic projectile. Enemies can target and damage allies; allies show individual health bars, play the complete nine-frame Die action at zero HP, and stop colliding after death.
- Player death or bus destruction ends the encounter. Waves arrive on the fixed timer even when enemies from earlier waves are still alive, and continue without a final victory state. The HUD shows the current wave and the next-wave countdown. Press R to fully reset health and return to wave one after defeat or during play.
- Balance values and directional melee logic are in `src/combat.ts`.
- Each wave assigns regular enemies and allies persistent, shuffled combat approach offsets per unit type. Positions are spaced about 8 px apart with up to 2 px of random variation, capped at 32 px of extra advance. Units walk slightly farther into their existing melee or ranged reach before stopping, so five melee units attacking a stationary target spread out horizontally. Offsets stay fixed across attacks and target changes; actual hit/release checks retain the original reach and facing rules. Tune `combatConfig.combatStagger` to adjust the spread.

## Ranged enemies

- Ranged units stop when a target is 48–520 px ahead and within 300 px vertically. Their priority is ally, then player, then bus, so any reachable ally is selected ahead of a closer player. They never turn to shoot a target behind them.
- Each shot plays all six BlastCharge frames (600 ms at 10 fps), then all five BlastAttack frames (500 ms at 10 fps). After release, they wait 2,200 ms before starting another charge. Leaving range or moving behind them during charging cancels that charge. Death also prevents release.
- A projectile aims at the target's position at release and follows a fixed ballistic arc under 650 px/s² gravity. Flight time is distance-dependent (0.65–1.15 s). It does not track the target in flight, so moving after release can dodge it.
- Enemy projectiles use all four `Enemy/Effects/Projectile` frames at 12 fps, loop, with a shared visible crop at (30, 54), 39 × 7 pixels. The sprite rotates along its velocity. They pass through elevated platforms; ground, player, or bus contact consumes them. A 3.5 s lifetime and world bounds also recycle them. Player bullets still collide with platforms.
- Projectile damage uses the existing 10 player / 20 bus damage rules, including player knockback, OnHit feedback, blinking, and shared invulnerability. Projectiles cannot damage other enemies. Defeat/victory and R clear every enemy projectile.

## Boss

- One Boss waits at the end of the first 3,840-pixel section (x = 3,840). It is displayed at 4.8× scale, exactly three times the regular enemy scale, has 1,200 HP (20× a 60 HP minion), and loops all seven `Enemy/PowerUp` frames at 10 fps.
- Before activation it patrols 180 pixels to either side of its starting point at 45 px/s. Once the player comes within 1,000 pixels, it permanently advances left at 52 px/s.
- Within 1,200 pixels, the Boss continuously locks the closest living allied unit or player. A pulsing red ground circle follows the current closest target for three seconds, so the player can move closer than an ally to steal the lock. Once the player becomes the closest target and steals that lock, it is committed to the player for the rest of that warning and cannot switch back to an ally, even if the player moves farther away.
- The Boss stops moving as soon as red-circle locking begins and remains stationary through the floating-arrow phase. It resumes movement only after the special volley is released or the lock is cancelled.
- When locking completes, the warning position freezes and ten red-tinted Avatar arrows spread outward from the Boss in a floating ring for 750 ms. Boss arrows use a 5.4× display scale (three times their previous 1.8× size) while retaining the original narrow hitbox. They then launch simultaneously toward the warning circle using half the normal ballistic flight time (2× speed). After the volley it waits four seconds before starting another lock.
- During that special-attack cooldown, the Boss also has a normal ranged attack. It follows the regular ranged enemy's complete six-frame `BlastCharge` and five-frame `BlastAttack` sequence, stops briefly to attack, uses the same 520-pixel horizontal and 300-pixel vertical firing window, and prioritizes allied units before the player and bus. It fires one red Avatar arrow directly at the target without gravity at 950 px/s, 2.5× the regular ranged projectile's 380 px/s basis. A hit deals 20 damage, twice the regular ranged unit's 10 damage. After hitting an actor or the ground, the arrow keeps its impact angle, embeds in the ground for one second, and then disappears. It passes through elevated platforms like regular enemy shots.
- At 50% HP or lower, volley count, arrow speed, and attack frequency are 2× their base values (20 arrows, 4× normal ballistic speed, half cooldown), while the arrows' outward floating distance becomes 1.5×. At 25% HP or lower, attack values become 3× (30 arrows, 6× normal ballistic speed, one-third cooldown) and floating distance becomes 2×. The three-second target warning remains unchanged for readability.
- The first time its HP reaches zero, the Boss plays all seven `Enemy/Vanish` frames at 10 fps and disappears. A full-width red ground warning appears for 1.2 seconds, followed by five seconds of dense red arrow rain. Rain arrows damage the player, bus, allies, and normal enemies without faction checks; every point of actual damage dealt heals the Boss, capped at 1,200 HP. Elevated platforms stop the arrows, so actors directly beneath them are safe.
- After the rain settles, an unhealed Boss stays defeated. If any health was absorbed, it returns with all ten `Enemy/Appear` frames at 10 fps and resumes combat. This last-stand rain triggers only once; a later zero-HP state uses `Vanish` and removes the Boss permanently.
- Player bullets and allied attacks can damage the Boss. A camera-fixed Boss health bar begins to bounce down from above the screen 250 pixels before the player reaches its 1,200-pixel attack range, pushing the minimap down by 58 pixels. If the player retreats before entering attack range, the bar retracts and the minimap returns; after entering attack range once, the bar stays for the fight. Its minimap marker, hit flash, collision, and staged disappearance use the existing combat systems. Three extra platforms around the Boss arena provide rain shelters.

## Scene

- A 23,040-pixel world (six original-length sections), a 960 × 540 viewport, six parallax layers, and a following camera.
- A fixed minimap sits in the lower portion of the top HUD and shows the complete world, six section markers, the current camera window, the bus, player, allied positions, enemy positions, the Boss, and the current enemy spawn line.
- Continuous solid ground and repeating one-way elevated platform patterns across all six sections through the endpoint. Platforms can be crossed upward or dropped through with Down.
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
| Combat/GunReload | GunReload01–GunReload09 (9) | 10 fps, once after every three shots |
| Weapons/Bullet | Bullet01–Bullet02 (2) | 20 fps, loop while active |
| Weapons/Arrow | Arrow01 (1) | Static ballistic projectile for allies and the Boss volley |

Playback speeds are adjustable prototype assumptions, not source timing metadata. Jump states use the dedicated single-frame source actions. All selected source frames are 96 × 84; collision bodies exclude transparent padding. Bullet texture frames use the shared visible bounds (x=43, y=44, width=9, height=2) of both source images. No terrain tiles were found, so ground, platforms, and markers use Phaser primitives.

The bus uses `public/assets/images/Vehicles_BusWhite_Idle.png` (176 × 80), cropped to its visible 132 × 46 region at (22, 18) and displayed at 2× scale.

Enemy groups come from `public/assets/sprites/Enemy/`, all 96 × 84:

| Action directory | Frames | Playback |
| --- | --- | --- |
| Walk | Walk01–Walk08 (8) | 10 fps, loop |
| Idle | Idle01–Idle07 (7) | 10 fps, loop while waiting for cooldown |
| PowerUp | PowerUp01–PowerUp07 (7) | 10 fps, loop while the Boss is alive |
| Vanish | Vanish01–Vanish07 (7) | 10 fps, once when the Boss reaches zero HP |
| Appear | Appear01–Appear10 (10) | 10 fps, once when absorbed health revives the Boss |
| Attack | Attack01–Attack06 (6) | 10 fps, once; may cancel when the target leaves reach |
| BlastCharge | BlastCharge01–BlastCharge06 (6) | 10 fps, once before a ranged shot |
| BlastAttack | BlastAttack01–BlastAttack05 (5) | 10 fps, once on release |
| Effects/Projectile | Projectile01–Projectile04 (4) | 12 fps, loop during flight |
| Die | Die01–Die07 (7) | 10 fps, once; final source frame is fully transparent |

Source enemies face right; their sprites are flipped horizontally to face left. The full groups are loaded and registered with separate Enemy namespaces.
