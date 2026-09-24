import Phaser from 'phaser'
import { allyArrowTexture, avatarActions, backgrounds, bulletAction, busTexture, enemyProjectileAction, loadAssets, registerAnimations } from './assets'
import { AllyUnit, AmmoSlots, ballisticVelocity, Boss, combatConfig, createCombatAdvances, Enemy, HealthBar, type Bounds, type EnemyKind, type EnemyTarget, type HostileTarget, type UnitDeath } from './combat'
import type { KillCredit, UnitProgressionState } from './unit-progression'
import './style.css'

const BASE_WORLD_WIDTH = 3840
const WORLD_WIDTH = BASE_WORLD_WIDTH * 6
const BOSS_X = BASE_WORLD_WIDTH
const GROUND_Y = 470
const START_X = 330
const SPEED = 270
const JUMP_SPEED = 600
const COYOTE_MS = 100
const JUMP_BUFFER_MS = 120
const DROP_THROUGH_MS = 300
const DROP_THROUGH_SPEED = 120
// Six ground steps (roughly 32px each) is close enough for a soul to seek the player.
const SOUL_ATTRACTION_RANGE = 192
const SOUL_ABSORB_DURATION = 1000
const BULLET_SPEED = 760
const BULLET_LIFETIME_MS = 1400
const HEAL_RANGE = 360
const HEAL_AMOUNT_PER_SECOND = 35
const HEALER_MANA_MAX = 100
const HEALER_MANA_COST_PER_SECOND = 20
const HEALER_MANA_RECOVERY_PER_SECOND = 15
// A fully enraged boss volley fires 30 arrows for 10 damage each. Keep one
// arrow of buffer so that the last blocked arrow does not cause a guard break.
const TANK_GUARD_MAX = combatConfig.boss.volleySize * 3 * combatConfig.enemyDamage + combatConfig.enemyDamage
const TANK_GUARD_RECOVERY_PER_SECOND = 64
const PROFESSION_MENU_TIME_SCALE = 0.1
const CAMERA_FORWARD_FOCUS = 170
const CAMERA_FOCUS_TRANSITION_DURATION = 700
const CAMERA_TRACKING_SMOOTHING = 2.4
const fontFamily = '"Segoe UI", "Microsoft JhengHei", sans-serif'

type Soul = {
  marker: Phaser.GameObjects.Rectangle
  caption: Phaser.GameObjects.Text
  faction: 'ally' | 'enemy'
  kind: EnemyKind
  combatAdvance: number
  progression?: UnitProgressionState
  collected: boolean
  groundX: number
  groundY: number
  absorbStartedAt?: number
  absorbDuration?: number
}

type TouchControl = 'left' | 'right' | 'up' | 'down' | 'jump' | 'fire' | 'banner' | 'profession'
type Profession = 'gunner' | 'healer' | 'tank'
const professionNames: Record<Profession, string> = {
  gunner: '槍手', healer: '補師', tank: '坦克',
}
const professionColors: Record<Profession, number> = {
  gunner: 0xf47b86, healer: 0x72e7c6, tank: 0x7cb7ff,
}
const professions: Profession[] = ['gunner', 'healer', 'tank']
type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element
  webkitExitFullscreen?: () => Promise<void> | void
}
type FullscreenTarget = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
}

class PrototypeScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite
  private soulRangeIndicator!: Phaser.GameObjects.Arc
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private keys!: Record<'A' | 'D' | 'W' | 'S' | 'R' | 'E' | 'Q' | 'X', Phaser.Input.Keyboard.Key>
  private enterKey!: Phaser.Input.Keyboard.Key
  private layers: { sprite: Phaser.GameObjects.TileSprite; speed: number }[] = []
  private healthText!: Phaser.GameObjects.Text
  private stateText!: Phaser.GameObjects.Text
  private ammoText!: Phaser.GameObjects.Text
  private professionText!: Phaser.GameObjects.Text
  private minimap!: Phaser.GameObjects.Graphics
  private minimapHud!: Phaser.GameObjects.Container
  private bossHud!: Phaser.GameObjects.Container
  private bossHudFill!: Phaser.GameObjects.Rectangle
  private bossHudValue!: Phaser.GameObjects.Text
  private bossHudVisible = false
  private bossHudCommitted = false
  private lastGrounded = -Infinity
  private jumpQueued = -Infinity
  private jumpReleased = false
  private dropThroughUntil = 0
  private bus!: Phaser.GameObjects.Image
  private allies: AllyUnit[] = []
  private enemies: Enemy[] = []
  private boss!: Boss
  private allyGroup!: Phaser.Physics.Arcade.Group
  private enemyGroup!: Phaser.Physics.Arcade.Group
  private oneWayPlatforms!: Phaser.Physics.Arcade.StaticGroup
  private wave = 0
  private nextWaveAt: number | null = null
  private pendingEnemyReinforcements: EnemyKind[] = []
  private enemySpawnCenter = combatConfig.waveCluster.enemyCenter
  private allyBanner!: Phaser.GameObjects.Container
  private bannerPrompt!: Phaser.GameObjects.Text
  private souls: Soul[] = []
  private soulsBeingAbsorbed = new Set<Soul>()
  private soulAbsorbFlashStartedAt = 0
  private soulAbsorbFlashUntil = 0
  private allySpawnSerial = 0
  private playerHp = combatConfig.playerHealth
  private busHp = combatConfig.busHealth
  private playerBar!: HealthBar
  private tankGuardBar!: HealthBar
  private ammoSlots!: AmmoSlots
  private healerManaBar!: HealthBar
  private healerMana = HEALER_MANA_MAX
  private channelingHeal = false
  private healTarget: AllyUnit | null = null
  private healAccumulator = 0
  private nextHealTextAt = 0
  private healBeam!: Phaser.GameObjects.Graphics
  private busBar!: HealthBar
  private invulnerableUntil = 0
  private hurt = false
  private hitStartedAt = 0
  private gameEnded = false
  private bullets!: Phaser.Physics.Arcade.Group
  private healingProjectiles!: Phaser.Physics.Arcade.Group
  private allyProjectiles!: Phaser.Physics.Arcade.Group
  private enemyProjectiles!: Phaser.Physics.Arcade.Group
  private bossArrows!: Phaser.Physics.Arcade.Group
  private bossBasicArrows!: Phaser.Physics.Arcade.Group
  private bossRainArrows!: Phaser.Physics.Arcade.Group
  private bossRainWarning!: Phaser.GameObjects.Rectangle
  private bossRainText!: Phaser.GameObjects.Text
  private bossRainActive = false
  private bossRainWarningUntil = 0
  private bossRainEndsAt = 0
  private bossRainFinishAt = 0
  private nextBossRainBurstAt = 0
  private firing = false
  private reloading = false
  private playerAmmo = 3
  private profession: Profession = 'gunner'
  private blocking = false
  private tankGuard = TANK_GUARD_MAX
  private deployingBanner = false
  private playerUsingStrugglePose = false
  private primaryActionPointerId: number | null = null
  private uiContainer!: Phaser.GameObjects.Container
  private bottomHintText!: Phaser.GameObjects.Text
  private rouletteContainer?: Phaser.GameObjects.Container
  private rouletteWheelDisc?: Phaser.GameObjects.Container
  private roulettePointer?: Phaser.GameObjects.Triangle
  private rouletteBadges: {
    container: Phaser.GameObjects.Container
    bg: Phaser.GameObjects.Rectangle
    text: Phaser.GameObjects.Text
    indicator: Phaser.GameObjects.Arc
    profession: Profession
  }[] = []
  private rouletteSelection = 0
  private wheelTargetAngle = 0
  private isRouletteOpen = false
  private isTransforming = false
  private cameraTargetZoom = 1.0
  private cameraTargetScrollY = 0
  private lastProfessionButtonPressTime = -1
  private touchControlPointers = new Map<number, TouchControl>()
  private bannerActionQueued = false
  private fullscreenLabel!: Phaser.GameObjects.Text
  private cameraFocusDirection = 1
  private cameraFocus = { offset: CAMERA_FORWARD_FOCUS }

  constructor() { super('prototype') }

  preload(): void {
    const label = this.add.text(480, 260, '正在載入城市…', {
      fontFamily, fontSize: '18px', color: '#d6f4f4',
    }).setOrigin(0.5)
    this.load.once('complete', () => label.destroy())
    this.load.on('loaderror', (file: Phaser.Loader.File) => console.error(`Asset failed to load: ${file.src}`))
    loadAssets(this)
  }

  create(): void {
    this.layers = []
    this.lastGrounded = -Infinity
    this.jumpQueued = -Infinity
    this.playerHp = combatConfig.playerHealth
    this.busHp = combatConfig.busHealth
    this.invulnerableUntil = 0
    this.hurt = false
    this.hitStartedAt = 0
    this.jumpReleased = false
    this.dropThroughUntil = 0
    this.gameEnded = false
    this.allies = []
    this.enemies = []
    this.wave = 0
    this.nextWaveAt = null
    this.pendingEnemyReinforcements = []
    this.enemySpawnCenter = combatConfig.waveCluster.enemyCenter
    this.souls = []
    this.soulsBeingAbsorbed.clear()
    this.soulAbsorbFlashStartedAt = 0
    this.soulAbsorbFlashUntil = 0
    this.allySpawnSerial = 0
    this.physics.resume()
    this.firing = false
    this.reloading = false
    this.playerAmmo = 3
    this.profession = 'gunner'
    this.blocking = false
    this.tankGuard = TANK_GUARD_MAX
    this.healerMana = HEALER_MANA_MAX
    this.channelingHeal = false
    this.healTarget = null
    this.healAccumulator = 0
    this.nextHealTextAt = 0
    this.healBeam?.clear()
    this.deployingBanner = false
    this.playerUsingStrugglePose = false
    this.primaryActionPointerId = null
    this.isRouletteOpen = false
    this.isTransforming = false
    this.rouletteContainer?.destroy()
    this.rouletteContainer = undefined
    this.rouletteBadges = []
    this.rouletteWheelDisc = undefined
    this.roulettePointer = undefined
    this.cameraTargetZoom = 1.0
    this.cameraTargetScrollY = 0
    this.lastProfessionButtonPressTime = -1
    this.setCombatTimeScale(1)
    this.bossRainActive = false
    this.bossHudVisible = false
    this.bossHudCommitted = false
    this.touchControlPointers.clear()
    this.bannerActionQueued = false
    this.cameraFocusDirection = 1
    this.cameraFocus.offset = CAMERA_FORWARD_FOCUS
    registerAnimations(this)
    for (const [index, background] of backgrounds.entries()) {
      const sprite = this.add.tileSprite(0, 0, 960, 548, background.key)
        .setOrigin(0).setScrollFactor(0).setDepth(-20 + index)
      this.layers.push({ sprite, speed: background.speed })
    }
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, 620)
    const groundSolids = this.physics.add.staticGroup()
    this.oneWayPlatforms = this.physics.add.staticGroup()
    const addPlatform = (group: Phaser.Physics.Arcade.StaticGroup,
      x: number, top: number, width: number, height: number) => {
      const surface = this.add.rectangle(x, top + height / 2, width, height, 0x151f31)
      group.add(surface)
      this.add.rectangle(x, top + 2, width, 4, 0x88d6ce)
      this.add.rectangle(x, top + 8, width, 8, 0x35455d)
      // No terrain tiles are present; the platform structure is drawn in code.
      for (let left = x - width / 2 + 12; left < x + width / 2 - 12; left += 32) {
        this.add.rectangle(left, top + 20, 16, 3, 0x27364c)
      }
      if (height < 60) {
        for (const supportX of [x - width / 2 + 12, x + width / 2 - 12]) {
          this.add.rectangle(supportX, top + height + (GROUND_Y - top - height) / 2,
            6, GROUND_Y - top - height, 0x1e2b41).setDepth(-1)
        }
      }
      return surface
    }
    const ground = addPlatform(groundSolids, WORLD_WIDTH / 2, GROUND_Y, WORLD_WIDTH, 150)
    const platformPattern = [
      [590, 394, 180], [855, 314, 150], [1110, 394, 180],
      [1640, 390, 200], [1900, 310, 150], [2160, 250, 180],
      [2450, 330, 200], [2900, 394, 180], [3180, 314, 180],
    ]
    for (let segment = 0; segment < WORLD_WIDTH / BASE_WORLD_WIDTH; segment += 1) {
      for (const [x, y, width] of platformPattern) {
        addPlatform(this.oneWayPlatforms, x + segment * BASE_WORLD_WIDTH, y - 30, width, 28)
      }
    }
    for (const [x, y, width] of [
      [BOSS_X - 430, 394, 220], [BOSS_X, 330, 240], [BOSS_X + 430, 394, 220],
    ]) addPlatform(this.oneWayPlatforms, x, y - 30, width, 28)
    this.createLandmarks()
    this.player = this.physics.add.sprite(START_X, GROUND_Y, avatarActions.Idle.frames[0])
      .setOrigin(0.5, 1).setScale(1.6).setDepth(5).setCollideWorldBounds(true)
    // Inspected frames are 96 x 84 with transparent padding above the character.
    this.player.setSize(16, 38).setOffset(40, 46)
    this.player.setMaxVelocity(SPEED, 900)
    this.soulRangeIndicator = this.add.circle(this.player.x, this.player.y - 10, SOUL_ATTRACTION_RANGE, 0x8fe4dc, 0.06)
      .setStrokeStyle(1, 0x8fe4dc, 0.18).setDepth(1)
    this.physics.add.collider(this.player, groundSolids)
    this.physics.add.collider(this.player, this.oneWayPlatforms, undefined, (_player, platform) => {
      if (this.time.now < this.dropThroughUntil) return false
      const playerBody = this.player.body as Phaser.Physics.Arcade.Body
      const platformBody = (platform as Phaser.GameObjects.Rectangle).body as Phaser.Physics.Arcade.StaticBody
      const previousBottom = playerBody.prev.y + playerBody.height
      return playerBody.velocity.y >= 0 && previousBottom <= platformBody.top + 4
    })
    this.bus = this.add.image(180, GROUND_Y, busTexture, 'vehicle').setOrigin(0.5, 1).setScale(2).setDepth(2)
    this.physics.add.existing(this.bus, true)
    this.createAllyBanner()
    this.playerBar = new HealthBar(this, 54, combatConfig.playerHealth, professionNames[this.profession], 0xa0e6da, '#ff4d6d')
    this.tankGuardBar = new HealthBar(this, 54, TANK_GUARD_MAX, '', 0x7cb7ff, undefined, false)
    this.tankGuardBar.setVisible(false)
    this.ammoSlots = new AmmoSlots(this, 54, 3)
    this.ammoSlots.setVisible(this.profession === 'gunner')
    this.healerManaBar = new HealthBar(this, 54, HEALER_MANA_MAX, '', 0x72e7c6, undefined, false)
    this.healerManaBar.setVisible(false)
    this.healBeam = this.add.graphics().setDepth(15)
    this.busBar = new HealthBar(this, 180, combatConfig.busHealth, '守護巴士', 0x7cb7ff)
    this.allyGroup = this.physics.add.group()
    this.enemyGroup = this.physics.add.group()
    // Both armies use the ground lane. Raised platforms remain player-only.
    this.physics.add.collider(this.allyGroup, ground)
    this.physics.add.collider(this.enemyGroup, ground)
    this.boss = new Boss(this, BOSS_X, GROUND_Y)
    this.enemyGroup.add(this.boss.sprite)
    // Body contact uses the same damage gate as melee, including contact from
    // behind. This does not change the enemy's forward-only attack targeting.
    this.physics.add.overlap(this.player, this.enemyGroup, (_player, target) => {
      const hostile = (target as Phaser.Physics.Arcade.Sprite).getData('enemy') as HostileTarget
      if (hostile.hp > 0) this.takeDamage('player', hostile.sprite.x,
        hostile instanceof Enemy ? hostile.attackDamage : undefined,
        hostile instanceof Enemy ? hostile.progression : undefined)
    })
    this.bullets = this.physics.add.group({ allowGravity: false, maxSize: 24 })
    const recyclePlayerBullet: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = projectile => {
      this.recycleBullet(projectile as Phaser.Physics.Arcade.Sprite)
    }
    this.physics.add.overlap(this.bullets, groundSolids, recyclePlayerBullet)
    this.physics.add.overlap(this.bullets, this.oneWayPlatforms, recyclePlayerBullet)
    this.physics.add.overlap(this.bullets, this.enemyGroup, (projectile, target) => {
      const bullet = projectile as Phaser.Physics.Arcade.Sprite
      const enemy = (target as Phaser.Physics.Arcade.Sprite).getData('enemy') as HostileTarget
      if (!bullet.active || enemy.hp <= 0 || this.gameEnded) return
      this.recycleBullet(bullet)
      enemy.takeDamage(combatConfig.bulletDamage)
    })
    this.allyProjectiles = this.physics.add.group({ allowGravity: true, maxSize: 64 })
    this.physics.add.overlap(ground, this.allyProjectiles, (_ground, projectile) => {
      this.recycleBullet(projectile as Phaser.Physics.Arcade.Sprite)
    })
    this.physics.add.overlap(this.enemyGroup, this.allyProjectiles, (target, projectile) => {
      const shot = projectile as Phaser.Physics.Arcade.Sprite
      const enemy = (target as Phaser.Physics.Arcade.Sprite).getData('enemy') as HostileTarget
      if (!shot.active || enemy.hp <= 0 || this.gameEnded) return
      const credit = shot.getData('killCredit') as KillCredit | undefined
      const damage = shot.getData('damage') as number
      this.recycleBullet(shot)
      enemy.takeDamage(damage, credit)
    })
    this.enemyProjectiles = this.physics.add.group({ allowGravity: true, maxSize: 32 })
    // Sprite-vs-group callbacks return the single actor first. Put it first
    // explicitly, and recycle only the projectile in the second argument.
    // Elevated platforms are intentionally excluded from enemy-shot collision.
    this.physics.add.overlap(ground, this.enemyProjectiles, (_ground, projectile) => {
      this.recycleBullet(projectile as Phaser.Physics.Arcade.Sprite)
    })
    this.physics.add.overlap(this.player, this.enemyProjectiles, (_player, projectile) => {
      const shot = projectile as Phaser.Physics.Arcade.Sprite
      if (!shot.active || this.gameEnded) return
      const sourceX = shot.getData('sourceX') as number
      const credit = shot.getData('killCredit') as KillCredit | undefined
      const damage = shot.getData('damage') as number
      this.recycleBullet(shot)
      this.takeDamage('player', sourceX, damage, credit)
    })
    this.physics.add.overlap(this.bus, this.enemyProjectiles, (_bus, projectile) => {
      const shot = projectile as Phaser.Physics.Arcade.Sprite
      if (!shot.active || this.gameEnded) return
      const damage = shot.getData('busDamage') as number
      this.recycleBullet(shot)
      this.takeDamage('bus', shot.getData('sourceX') as number, damage)
    })
    this.physics.add.overlap(this.allyGroup, this.enemyProjectiles, (target, projectile) => {
      const shot = projectile as Phaser.Physics.Arcade.Sprite
      const ally = (target as Phaser.Physics.Arcade.Sprite).getData('ally') as AllyUnit
      if (!shot.active || ally.hp <= 0 || this.gameEnded) return
      const credit = shot.getData('killCredit') as KillCredit | undefined
      const damage = shot.getData('damage') as number
      this.recycleBullet(shot)
      ally.takeDamage(damage, credit)
    })
    this.bossArrows = this.physics.add.group({ allowGravity: false, maxSize: combatConfig.boss.volleySize * 3 })
    this.physics.add.overlap(ground, this.bossArrows, (_ground, projectile) => {
      const arrow = projectile as Phaser.Physics.Arcade.Sprite
      if (arrow.getData('armed')) this.recycleBullet(arrow)
    })
    this.physics.add.overlap(this.player, this.bossArrows, (_player, projectile) => {
      const arrow = projectile as Phaser.Physics.Arcade.Sprite
      if (!arrow.active || !arrow.getData('armed') || this.gameEnded) return
      this.recycleBullet(arrow)
      this.takeDamage('player', arrow.getData('sourceX') as number)
    })
    this.physics.add.overlap(this.bus, this.bossArrows, (_bus, projectile) => {
      const arrow = projectile as Phaser.Physics.Arcade.Sprite
      if (!arrow.active || !arrow.getData('armed') || this.gameEnded) return
      this.recycleBullet(arrow)
      this.takeDamage('bus', arrow.getData('sourceX') as number)
    })
    this.physics.add.overlap(this.allyGroup, this.bossArrows, (target, projectile) => {
      const arrow = projectile as Phaser.Physics.Arcade.Sprite
      const ally = (target as Phaser.Physics.Arcade.Sprite).getData('ally') as AllyUnit
      if (!arrow.active || !arrow.getData('armed') || ally.hp <= 0 || this.gameEnded) return
      this.recycleBullet(arrow)
      ally.takeDamage(combatConfig.enemyDamage)
    })
    this.bossBasicArrows = this.physics.add.group({ allowGravity: false, maxSize: 16 })
    this.physics.add.overlap(ground, this.bossBasicArrows, (_ground, projectile) => {
      this.stickBossBasicArrow(projectile as Phaser.Physics.Arcade.Sprite)
    })
    this.physics.add.overlap(this.player, this.bossBasicArrows, (_player, projectile) => {
      const arrow = projectile as Phaser.Physics.Arcade.Sprite
      if (!arrow.active || this.gameEnded) return
      this.takeDamage('player', arrow.getData('sourceX') as number, combatConfig.boss.basicDamage)
      this.stickBossBasicArrow(arrow)
    })
    this.physics.add.overlap(this.bus, this.bossBasicArrows, (_bus, projectile) => {
      const arrow = projectile as Phaser.Physics.Arcade.Sprite
      if (!arrow.active || this.gameEnded) return
      this.takeDamage('bus', arrow.getData('sourceX') as number, combatConfig.boss.basicDamage)
      this.stickBossBasicArrow(arrow)
    })
    this.physics.add.overlap(this.allyGroup, this.bossBasicArrows, (target, projectile) => {
      const arrow = projectile as Phaser.Physics.Arcade.Sprite
      const ally = (target as Phaser.Physics.Arcade.Sprite).getData('ally') as AllyUnit
      if (!arrow.active || ally.hp <= 0 || this.gameEnded) return
      ally.takeDamage(combatConfig.boss.basicDamage)
      this.stickBossBasicArrow(arrow)
    })
    this.createBossRain(groundSolids)
    this.player.on(Phaser.Animations.Events.ANIMATION_COMPLETE, (animation: Phaser.Animations.Animation) => {
      if (animation.key === avatarActions.GunFire.key || animation.key === avatarActions.GunRunFire.key
        || animation.key === avatarActions.ThrowUnderarm.key) {
        this.firing = false
        if (this.profession === 'gunner' && this.playerAmmo === 0 && !this.hurt) this.startReload()
      }
      if (animation.key === avatarActions.GunReload.key) {
        this.reloading = false
        this.playerAmmo = 3
      }
      if (animation.key === avatarActions.Knockback.key) {
        this.hurt = false
        if (this.profession === 'gunner' && this.playerAmmo === 0) this.startReload()
      }
      if (animation.key === avatarActions.GroundSlam.key) this.deployingBanner = false
    })
    const onKeyDown = (event: KeyboardEvent) => {
      if (this.gameEnded || this.isTransforming || event.repeat) return
      if (!this.isRouletteOpen) {
        if (event.key === 'q' || event.key === 'Q') {
          this.openProfessionRoulette()
        }
      } else {
        if (event.key === 'q' || event.key === 'Q') {
          this.cycleProfessionRoulette()
        } else {
          this.confirmProfessionRoulette()
        }
      }
    }
    this.input.keyboard?.on('keydown', onKeyDown)
    this.input.on('pointerdown', this.onPointerDown, this)
    this.input.on('pointerup', this.onPointerUp, this)
    this.input.on('pointerupoutside', this.onPointerUp, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointerdown', this.onPointerDown, this)
      this.input.off('pointerup', this.onPointerUp, this)
      this.input.off('pointerupoutside', this.onPointerUp, this)
      this.input.keyboard?.off('keydown', onKeyDown)
    })
    this.playAction('Idle')
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.keys = this.input.keyboard!.addKeys('A,D,W,S,R,E,Q,X') as typeof this.keys
    this.enterKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER)
    this.input.keyboard!.addCapture(['SPACE', 'UP', 'DOWN', 'LEFT', 'RIGHT'])
    const camera = this.cameras.main
    camera.setBounds(-600, -300, WORLD_WIDTH + 1200, 1100)
    camera.setScroll(0, 0)
    camera.setZoom(1.0)
    this.uiContainer = this.add.container(0, 0).setScrollFactor(0).setDepth(150)
    this.createHud()
    this.createTouchControls()
    this.createFullscreenButton()
    this.spawnInitialForces()
  }


  private createBossRain(groundSolids: Phaser.Physics.Arcade.StaticGroup): void {
    this.bossRainArrows = this.physics.add.group({ allowGravity: false, maxSize: 160 })
    const stopRainArrow: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = projectile => {
      const arrow = projectile as Phaser.Physics.Arcade.Sprite
      if (arrow.active) this.recycleBullet(arrow)
    }
    // Terrain collisions are registered before actor overlaps. Falling arrows
    // therefore stop at the first platform surface, keeping its underside safe.
    this.physics.add.collider(this.bossRainArrows, groundSolids, stopRainArrow)
    this.physics.add.collider(this.bossRainArrows, this.oneWayPlatforms, stopRainArrow)
    this.physics.add.overlap(this.player, this.bossRainArrows, (_player, projectile) => {
      const arrow = projectile as Phaser.Physics.Arcade.Sprite
      if (!arrow.active || this.gameEnded) return
      const before = this.playerHp
      this.recycleBullet(arrow)
      this.takeDamage('player', arrow.x)
      this.boss.absorbHealth(before - this.playerHp)
    })
    this.physics.add.overlap(this.bus, this.bossRainArrows, (_bus, projectile) => {
      const arrow = projectile as Phaser.Physics.Arcade.Sprite
      if (!arrow.active || this.gameEnded) return
      const before = this.busHp
      this.recycleBullet(arrow)
      this.takeDamage('bus', arrow.x)
      this.boss.absorbHealth(before - this.busHp)
    })
    this.physics.add.overlap(this.allyGroup, this.bossRainArrows, (target, projectile) => {
      const arrow = projectile as Phaser.Physics.Arcade.Sprite
      const ally = (target as Phaser.Physics.Arcade.Sprite).getData('ally') as AllyUnit
      if (!arrow.active || ally.hp <= 0 || this.gameEnded) return
      const before = ally.hp
      this.recycleBullet(arrow)
      ally.takeDamage(combatConfig.boss.finalRainDamage)
      this.boss.absorbHealth(before - ally.hp)
    })
    this.physics.add.overlap(this.enemyGroup, this.bossRainArrows, (target, projectile) => {
      const arrow = projectile as Phaser.Physics.Arcade.Sprite
      const enemy = (target as Phaser.Physics.Arcade.Sprite).getData('enemy') as HostileTarget
      if (!arrow.active || enemy.kind === 'boss' || enemy.hp <= 0 || this.gameEnded) return
      const before = enemy.hp
      this.recycleBullet(arrow)
      enemy.takeDamage(combatConfig.boss.finalRainDamage)
      this.boss.absorbHealth(before - enemy.hp)
    })
    this.bossRainWarning = this.add.rectangle(480, GROUND_Y - 9, 960, 46, 0xff1f3d, 0.28)
      .setScrollFactor(0).setDepth(90).setVisible(false)
    this.bossRainText = this.add.text(480, 112, '箭雨將至 · 躲到跳台下方', {
      fontFamily, fontSize: '22px', color: '#fff1f3',
      backgroundColor: '#7d1028', padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(110).setVisible(false)
  }

  private createLandmarks(): void {
    const label = (x: number, text: string, color = '#91a5be') => {
      this.add.text(x, 483, text, { fontFamily, fontSize: '12px', color, letterSpacing: 2 })
    }
    label(64, '01 / 巴士據點', '#a0e6da')
    label(1330, '02 / 高台區')
    label(2690, '03 / 最後一段')
    label(BOSS_X - 210, 'BOSS / 第一區段終點', '#f47b86')
    this.add.text(395, 425, '跳躍閃避  ↗', { fontFamily, fontSize: '13px', color: '#afc2d7' })
    this.add.text(1420, 430, '試試連續跳躍  →', { fontFamily, fontSize: '13px', color: '#afc2d7' })
    for (let x = 240; x < WORLD_WIDTH; x += 160) this.add.rectangle(x, 489, 34, 2, 0x435167)
    this.add.text(WORLD_WIDTH - 260, 430, '← 敵人進攻方向', { fontFamily, fontSize: '13px', color: '#f47b86' })
  }

  private createHud(): void {
    const hud = this.add.container(0, 0)
    this.uiContainer.add(hud)
    const text = (x: number, y: number, value: string, size: number, color: string) =>
      this.add.text(x, y, value, { fontFamily, fontSize: `${size}px`, color })
    hud.add(this.add.rectangle(480, 42, 960, 84, 0x090f20, 0.93))
    hud.add(this.add.text(26, 42, '阻止敵人摧毀巴士', {
      fontFamily, fontSize: '18px', color: '#eef6ff', fontStyle: 'bold',
    }).setOrigin(0, 0.5))


    this.minimapHud = this.add.container(0, 0)
    this.minimapHud.add(text(350, 18, '● 我軍', 9, '#a0e6da'))
    this.minimapHud.add(text(480, 18, '戰線地圖', 9, '#8ca3bc').setOrigin(0.5, 0))
    this.minimapHud.add(text(610, 18, '敵軍 ●', 9, '#f47b86').setOrigin(1, 0))
    this.minimap = this.add.graphics()
    this.minimapHud.add(this.minimap)
    hud.add(this.minimapHud)
    this.bossHud = this.add.container(480, -44).setVisible(false)
    this.bossHud.add(this.add.rectangle(0, 0, 354, 48, 0x150914, 0.97)
      .setStrokeStyle(2, 0xff405f, 0.95))
    this.bossHud.add(this.add.text(-164, -15, 'BOSS', {
      fontFamily, fontSize: '14px', color: '#ff9aac', fontStyle: 'bold',
    }))
    this.bossHud.add(this.add.rectangle(-164, 9, 328, 12, 0x3b1723).setOrigin(0, 0.5))
    this.bossHudFill = this.add.rectangle(-164, 9, 328, 8, 0xff405f).setOrigin(0, 0.5)
    this.bossHud.add(this.bossHudFill)
    this.bossHudValue = this.add.text(164, -15, '', {
      fontFamily, fontSize: '12px', color: '#fff1f3',
    }).setOrigin(1, 0)
    this.bossHud.add(this.bossHudValue)
    hud.add(this.bossHud)
    this.healthText = text(925, 21, '', 15, '#a0e6da').setOrigin(1, 0).setVisible(false)
    hud.add(this.healthText)

    hud.add(this.add.rectangle(480, 521, 960, 38, 0x090f20, 0.95))
    this.bottomHintText = text(24, 511, 'A D / ← → 移動    SPACE / W / ↑ 跳躍    E 旗幟    X 吸魂    Q / 職 選擇    攻 / 滑鼠左鍵 行動    R 重來', 12, '#b0c2d6')
    hud.add(this.bottomHintText)
    this.professionText = text(560, 511, '', 12, '#a0e6da').setOrigin(1, 0).setVisible(false)
    hud.add(this.professionText)
    this.ammoText = text(705, 511, '', 12, '#a0e6da').setOrigin(1, 0)
    hud.add(this.ammoText)
    this.stateText = text(935, 511, '守住巴士', 12, '#a0e6da').setOrigin(1, 0)
    hud.add(this.stateText)
  }

  private createTouchControls(): void {
    const addButton = (x: number, y: number, label: string, control: TouchControl, color: number) => {
      const button = this.add.circle(x, y, 32, 0x09111e, 0.78)
        .setStrokeStyle(2, color, 0.95).setInteractive()
      const labelText = this.add.text(x, y, label, {
        fontFamily, fontSize: label.length > 1 ? '13px' : '18px', color: '#f4fbff', fontStyle: 'bold',
      }).setOrigin(0.5)
      this.uiContainer.add([button, labelText])
      button.on('pointerdown', (pointer: Phaser.Input.Pointer, _x: number, _y: number,
        event: Phaser.Types.Input.EventData) => {
        event.stopPropagation()
        this.createTouchRipple(x, y, color)
        this.pressTouchControl(control, pointer)
      })
    }
    addButton(125, 380, '▲', 'up', 0x7cb7ff)
    addButton(60, 435, '◀', 'left', 0x7cb7ff)
    addButton(190, 435, '▶', 'right', 0x7cb7ff)
    addButton(125, 490, '▼', 'down', 0x7cb7ff)
    addButton(835, 380, '職', 'profession', 0x72e7c6)
    addButton(770, 435, '旗', 'banner', 0x71d9cf)
    addButton(900, 435, '攻', 'fire', 0xf47b86)
    addButton(835, 490, '跳', 'jump', 0xf9df84)
  }

  private createFullscreenButton(): void {
    const button = this.add.rectangle(846, 42, 176, 48, 0x132238, 0.92)
      .setStrokeStyle(2, 0x71d9cf, 0.9).setInteractive()
    this.fullscreenLabel = this.add.text(846, 42, '全螢幕', {
      fontFamily, fontSize: '22px', color: '#d8fffa', fontStyle: 'bold',
    }).setOrigin(0.5)
    this.uiContainer.add([button, this.fullscreenLabel])
    button.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number,
      event: Phaser.Types.Input.EventData) => {
      event.stopPropagation()
      void this.toggleFullscreen()
    })
    document.addEventListener('fullscreenchange', this.updateFullscreenButton)
    document.addEventListener('webkitfullscreenchange', this.updateFullscreenButton)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.removeEventListener('fullscreenchange', this.updateFullscreenButton)
      document.removeEventListener('webkitfullscreenchange', this.updateFullscreenButton)
    })
  }

  private updateFullscreenButton = (): void => {
    const documentWithFallback = document as FullscreenDocument
    const isFullscreen = Boolean(document.fullscreenElement || documentWithFallback.webkitFullscreenElement)
    this.fullscreenLabel?.setText(isFullscreen ? '離開全螢幕' : '全螢幕')
  }

  private async toggleFullscreen(): Promise<void> {
    const documentWithFallback = document as FullscreenDocument
    const isFullscreen = Boolean(document.fullscreenElement || documentWithFallback.webkitFullscreenElement)
    const target = (this.game.canvas.parentElement ?? this.game.canvas) as FullscreenTarget
    const requestFullscreen = target.requestFullscreen ?? target.webkitRequestFullscreen
    const exitFullscreen = document.exitFullscreen ?? documentWithFallback.webkitExitFullscreen
    try {
      if (isFullscreen) {
        if (exitFullscreen) await exitFullscreen.call(document)
      } else if (requestFullscreen) {
        await requestFullscreen.call(target)
      }
    } catch {
      // Some mobile browsers do not permit browser-element fullscreen mode.
    }
  }

  private createTouchRipple(x: number, y: number, color: number): void {
    const ripple = this.add.circle(x, y, 17, color, 0.14)
      .setStrokeStyle(2, color, 0.9)
    this.uiContainer.add(ripple)
    this.tweens.add({
      targets: ripple, scale: 1.9, alpha: 0, duration: 260, ease: 'Quad.Out',
      onComplete: () => ripple.destroy(),
    })
  }

  private pressTouchControl(control: TouchControl, pointer: Phaser.Input.Pointer): void {
    this.touchControlPointers.set(pointer.id, control)
    if (this.isRouletteOpen) {
      if (control === 'profession') {
        this.lastProfessionButtonPressTime = this.time.now
        this.cycleProfessionRoulette()
      } else {
        this.confirmProfessionRoulette()
      }
      return
    }
    if (this.isTransforming) return

    if (control === 'jump' || control === 'up') this.jumpQueued = this.time.now
    if (control === 'fire') this.fire()
    if (control === 'banner') this.bannerActionQueued = true
    if (control === 'profession') {
      this.lastProfessionButtonPressTime = this.time.now
      this.openProfessionRoulette()
    }
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    this.touchControlPointers.delete(pointer.id)
    if (this.primaryActionPointerId === pointer.id) this.primaryActionPointerId = null
  }

  private touchControlIsDown(control: TouchControl): boolean {
    return [...this.touchControlPointers.values()].includes(control)
  }

  private updateBlocking(delta: number): void {
    const guardInputHeld = this.tankGuardInputHeld()
    this.blocking = this.profession === 'tank' && !this.professionMenuOpen && !this.hurt
      && guardInputHeld
    if (!this.blocking) {
      if (this.profession === 'tank' && !guardInputHeld) {
        this.tankGuard = Math.min(TANK_GUARD_MAX,
          this.tankGuard + TANK_GUARD_RECOVERY_PER_SECOND * delta / 1000)
      }
      return
    }
    this.player.setVelocityX(0)
    this.playAction('PushIdle')
  }

  private attackInputHeld(): boolean {
    return this.touchControlIsDown('fire') || this.primaryActionPointerId !== null
  }

  private tankGuardInputHeld(): boolean {
    return this.attackInputHeld()
  }

  private updateHealingChannel(delta: number, time: number): void {
    const attackHeld = this.attackInputHeld()
    const canHeal = this.profession === 'healer' && !this.professionMenuOpen
      && !this.hurt && !this.gameEnded && attackHeld && this.healerMana > 0

    if (!canHeal) {
      this.channelingHeal = false
      this.healTarget = null
      this.healBeam?.clear()
      if (this.profession === 'healer') {
        this.healerMana = Math.min(HEALER_MANA_MAX,
          this.healerMana + HEALER_MANA_RECOVERY_PER_SECOND * delta / 1000)
      }
      return
    }

    if (this.healTarget) {
      const distance = Phaser.Math.Distance.Between(
        this.player.x, this.player.y,
        this.healTarget.sprite.x, this.healTarget.sprite.y,
      )
      if (this.healTarget.hp <= 0 || !this.healTarget.sprite.active
        || this.healTarget.hp >= this.healTarget.maxHealth || distance > HEAL_RANGE) {
        this.healTarget = null
      }
    }

    if (!this.healTarget) {
      const candidates = this.allies
        .filter(ally => ally.hp > 0 && ally.sprite.active && ally.hp < ally.maxHealth)
        .map(ally => ({
          ally,
          distance: Phaser.Math.Distance.Between(this.player.x, this.player.y, ally.sprite.x, ally.sprite.y),
        }))
        .filter(c => c.distance <= HEAL_RANGE)
        .sort((a, b) => (a.ally.hp / a.ally.maxHealth) - (b.ally.hp / b.ally.maxHealth) || a.distance - b.distance)

      this.healTarget = candidates[0]?.ally ?? null
    }

    if (!this.healTarget) {
      this.channelingHeal = false
      this.healBeam?.clear()
      this.healerMana = Math.min(HEALER_MANA_MAX,
        this.healerMana + HEALER_MANA_RECOVERY_PER_SECOND * delta / 1000)
      return
    }

    this.channelingHeal = true
    this.player.setVelocityX(0)
    if (this.healTarget.sprite.x !== this.player.x) {
      this.player.setFlipX(this.healTarget.sprite.x < this.player.x)
    }
    this.playAction('Struggle')

    this.healerMana = Math.max(0, this.healerMana - HEALER_MANA_COST_PER_SECOND * delta / 1000)

    const healAmount = HEAL_AMOUNT_PER_SECOND * delta / 1000
    this.healAccumulator += healAmount
    if (this.healAccumulator >= 1) {
      const toHeal = Math.floor(this.healAccumulator)
      this.healAccumulator -= toHeal
      this.healTarget.heal(toHeal)
    }

    if (time >= this.nextHealTextAt) {
      this.nextHealTextAt = time + 320
      const textVal = Math.round(HEAL_AMOUNT_PER_SECOND * 0.32)
      this.showFloatingHealText(this.healTarget.sprite.x, this.healTarget.sprite.y - 74, `+${textVal}`)
    }

    this.drawHealingBeam(time)

    if (this.healTarget.hp >= this.healTarget.maxHealth) {
      this.showFloatingHealText(this.healTarget.sprite.x, this.healTarget.sprite.y - 74, '已補滿', '#72e7c6')
      this.healTarget = null
    }
  }

  private drawHealingBeam(time: number): void {
    if (!this.healBeam || !this.healTarget) return
    this.healBeam.clear()
    const fromX = this.player.x + (this.player.flipX ? -20 : 20)
    const fromY = this.player.y - 42
    const toX = this.healTarget.sprite.x
    const toY = this.healTarget.sprite.y - 35

    const alphaPulse = 0.5 + 0.3 * Math.sin(time / 80)
    this.healBeam.lineStyle(6, 0x72e7c6, alphaPulse * 0.5)
    this.healBeam.lineBetween(fromX, fromY, toX, toY)
    this.healBeam.lineStyle(2, 0xffffff, alphaPulse)
    this.healBeam.lineBetween(fromX, fromY, toX, toY)

    const ringRadius = 14 + 3 * Math.sin(time / 100)
    this.healBeam.lineStyle(2, 0x72e7c6, alphaPulse * 0.8)
    this.healBeam.strokeCircle(toX, toY, ringRadius)
  }

  private showFloatingHealText(x: number, y: number, text: string, color = '#baffee'): void {
    const value = this.add.text(x, y, text, {
      fontFamily, fontSize: '14px', color, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(25)
    this.tweens.add({
      targets: value, y: value.y - 18, alpha: 0, duration: 320, ease: 'Quad.Out',
      onComplete: () => value.destroy(),
    })
  }

  private get professionMenuOpen(): boolean {
    return this.isRouletteOpen || this.isTransforming
  }

  private setCombatTimeScale(scale: number): void {
    // Arcade World timeScale is the inverse of regular game time: 2 is half
    // speed and 0.5 is double speed. Keep it aligned with the Clock scale.
    this.physics.world.timeScale = 1 / scale
    this.time.timeScale = scale
    this.anims.globalTimeScale = scale
    this.tweens.timeScale = 1
  }

  private openProfessionRoulette(): void {
    if (this.gameEnded || this.isTransforming || this.isRouletteOpen) return
    this.firing = false
    this.reloading = false
    this.blocking = false
    this.channelingHeal = false
    this.healTarget = null
    this.healBeam?.clear()
    this.player.setVelocityX(0)
    this.isRouletteOpen = true
    this.rouletteSelection = professions.indexOf(this.profession)
    this.wheelTargetAngle = -this.rouletteSelection * (2 * Math.PI / 3)

    // Camera target zoom & center
    this.cameraTargetZoom = 2.4
    this.cameraTargetScrollY = this.player.y - 45 - 270

    // Slow down time during selection
    this.setCombatTimeScale(PROFESSION_MENU_TIME_SCALE)

    // Update bottom HUD hint
    this.bottomHintText?.setText('Q / 職：切換職業　　任意其他鍵 / 點擊：確認切換')

    // Create the roulette above the player's head
    this.createRouletteContainer()
  }

  private createRouletteContainer(): void {
    this.rouletteContainer?.destroy()
    this.rouletteBadges = []

    const container = this.add.container(this.player.x, this.player.y - 84).setDepth(200)

    // 1. Rotating Wheel Disc
    const wheelDisc = this.add.container(0, 0)
    container.add(wheelDisc)
    this.rouletteWheelDisc = wheelDisc

    // Outer circular dial backdrop
    const discBg = this.add.circle(0, 0, 52, 0x09111e, 0.94)
      .setStrokeStyle(2, 0x324b68, 0.9)
    wheelDisc.add(discBg)

    // Futuristic tech decorative rings
    const innerRing = this.add.graphics()
    innerRing.lineStyle(1.5, 0x1f344d, 0.8)
    innerRing.strokeCircle(0, 0, 36)
    innerRing.lineStyle(1, 0x152538, 0.6)
    innerRing.strokeCircle(0, 0, 20)
    wheelDisc.add(innerRing)

    // Center core hub
    const centerCore = this.add.circle(0, 0, 12, 0x070d17, 1)
      .setStrokeStyle(1.5, professionColors[this.profession], 0.9)
    wheelDisc.add(centerCore)
    const coreDot = this.add.circle(0, 0, 4, professionColors[this.profession], 1)
    wheelDisc.add(coreDot)

    // Profession slots/badges at 120-degree intervals
    const radius = 38
    professions.forEach((prof, index) => {
      // Slot 0 at -90 deg (top), slot 1 at 30 deg, slot 2 at 150 deg
      const baseAngle = -Math.PI / 2 + index * (2 * Math.PI / 3)
      const bx = Math.cos(baseAngle) * radius
      const by = Math.sin(baseAngle) * radius

      const badgeContainer = this.add.container(bx, by)
      const bg = this.add.rectangle(0, 0, 52, 22, 0x101b2b, 0.95)
        .setStrokeStyle(1.5, professionColors[prof], 0.7)
      const indicator = this.add.circle(-16, 0, 3, professionColors[prof], 0.9)
      const label = this.add.text(4, 0, professionNames[prof], {
        fontFamily, fontSize: '11px', color: '#f4fbff', fontStyle: 'bold',
      }).setOrigin(0.5)

      badgeContainer.add([bg, indicator, label])
      wheelDisc.add(badgeContainer)

      this.rouletteBadges.push({
        container: badgeContainer,
        bg,
        text: label,
        indicator,
        profession: prof,
      })
    })

    // Align rotation to currently selected profession
    wheelDisc.rotation = this.wheelTargetAngle
    for (const b of this.rouletteBadges) {
      b.container.setRotation(-wheelDisc.rotation)
    }

    // 2. Fixed Pointer at the top
    const pointerColor = professionColors[professions[this.rouletteSelection]]
    const pointer = this.add.triangle(0, -60, 0, 5, -6, -5, 6, -5, pointerColor)
      .setDepth(201)
    container.add(pointer)
    this.roulettePointer = pointer

    this.tweens.add({
      targets: pointer,
      y: -57,
      duration: 350,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    // 3. Instruction Tag below wheel
    const promptContainer = this.add.container(0, 64)
    const promptBg = this.add.rectangle(0, 0, 164, 20, 0x09111e, 0.92)
      .setStrokeStyle(1, 0x71d9cf, 0.8)
    const promptText = this.add.text(0, 0, 'Q / 職：切換　任意鍵：確認', {
      fontFamily, fontSize: '10px', color: '#a0e6da',
    }).setOrigin(0.5)
    promptContainer.add([promptBg, promptText])
    container.add(promptContainer)

    // Entrance animation
    container.setScale(0.3)
    container.setAlpha(0)
    this.tweens.add({
      targets: container,
      scale: 1,
      alpha: 1,
      duration: 220,
      ease: 'Back.easeOut',
    })

    this.rouletteContainer = container
    this.refreshRouletteVisuals()
  }


  private cycleProfessionRoulette(): void {
    if (!this.isRouletteOpen || this.isTransforming) return
    this.rouletteSelection = (this.rouletteSelection + 1) % professions.length
    this.wheelTargetAngle -= (2 * Math.PI / 3)

    if (this.rouletteWheelDisc) {
      this.tweens.killTweensOf(this.rouletteWheelDisc)
      this.tweens.add({
        targets: this.rouletteWheelDisc,
        rotation: this.wheelTargetAngle,
        duration: 220,
        ease: 'Back.easeOut',
        onUpdate: () => {
          for (const badge of this.rouletteBadges) {
            badge.container.setRotation(-this.rouletteWheelDisc!.rotation)
          }
        },
        onComplete: () => {
          if (this.rouletteSelection === 0 && this.rouletteWheelDisc) {
            this.wheelTargetAngle = 0
            this.rouletteWheelDisc.rotation = 0
            for (const badge of this.rouletteBadges) {
              badge.container.setRotation(0)
            }
          }
        },
      })
    }

    this.refreshRouletteVisuals()
  }

  private refreshRouletteVisuals(): void {
    const activeProf = professions[this.rouletteSelection]
    const activeColor = professionColors[activeProf]

    if (this.roulettePointer) {
      this.roulettePointer.setFillStyle(activeColor)
    }

    for (const [index, badge] of this.rouletteBadges.entries()) {
      const selected = index === this.rouletteSelection
      badge.bg.setFillStyle(selected ? 0x17314a : 0x101b2b, 0.95)
      badge.bg.setStrokeStyle(selected ? 2.5 : 1, professionColors[badge.profession], selected ? 1 : 0.4)
      badge.container.setScale(selected ? 1.16 : 0.88)
      badge.text.setColor(selected ? '#ffffff' : '#738ca3')
      badge.indicator.setAlpha(selected ? 1 : 0.4)
    }
  }

  private confirmProfessionRoulette(): void {
    if (!this.isRouletteOpen || this.isTransforming) return

    const chosenProfession = professions[this.rouletteSelection]
    this.isRouletteOpen = false
    this.isTransforming = true

    // Restore bottom hint
    this.bottomHintText?.setText('A D / ← → 移動    SPACE / W / ↑ 跳躍    E 旗幟    X 吸魂    Q / 職 選擇    攻 / 滑鼠左鍵 行動    R 重來')

    // Fade out and dismiss roulette container
    if (this.rouletteContainer) {
      this.tweens.add({
        targets: this.rouletteContainer,
        scale: 1.25,
        alpha: 0,
        duration: 160,
        ease: 'Quad.easeIn',
        onComplete: () => {
          this.rouletteContainer?.destroy()
          this.rouletteContainer = undefined
          this.rouletteBadges = []
          this.rouletteWheelDisc = undefined
          this.roulettePointer = undefined
        },
      })
    }

    // Restore full game speed for the spin animation and shockwave
    this.setCombatTimeScale(1)

    // Stop player and freeze physics temporarily
    this.player.setVelocityX(0)
    this.player.setVelocityY(0)
    const body = this.player.body as Phaser.Physics.Arcade.Body
    body.allowGravity = false

    // Apply the newly chosen profession
    this.selectProfession(chosenProfession)

    // Invulnerability during transformation
    this.invulnerableUntil = Math.max(this.invulnerableUntil, this.time.now + 1200)

    // Play Spin animation!
    this.playAction('Spin')

    // Create radiant light wave shockwave effect!
    this.createLightWaveEffect(this.player.x, this.player.y - 10, professionColors[this.profession])

    // Delay camera zoom-out until the spin finishes
    this.time.delayedCall(450, () => {
      this.cameraTargetZoom = 1.0
      this.cameraTargetScrollY = 0
    })

    // Return control to player when spin animation completes
    this.time.delayedCall(650, () => {
      body.allowGravity = true
      this.isTransforming = false
      if (!this.hurt && this.playerHp > 0) {
        this.playAction('Idle')
      }
    })
  }

  private createLightWaveEffect(x: number, y: number, color: number): void {
    const shockwave = this.add.graphics().setDepth(80)
    const duration = 650
    const maxRadius = 140

    const waveData = { radius: 10, alpha: 1, thickness: 6 }
    this.tweens.add({
      targets: waveData,
      radius: maxRadius,
      alpha: 0,
      thickness: 1,
      duration,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        shockwave.clear()
        // Outer colored glow ring
        shockwave.lineStyle(waveData.thickness * 2, color, waveData.alpha * 0.5)
        shockwave.strokeCircle(x, y, waveData.radius)
        // Inner bright core ring
        shockwave.lineStyle(waveData.thickness, 0xffffff, waveData.alpha * 0.9)
        shockwave.strokeCircle(x, y, waveData.radius * 0.85)
        // Ground plane shockwave ellipse
        shockwave.lineStyle(waveData.thickness * 1.5, color, waveData.alpha * 0.6)
        shockwave.strokeEllipse(x, y + 20, waveData.radius * 2.2, waveData.radius * 0.6)
      },
      onComplete: () => shockwave.destroy(),
    })

    // Second delayed outer ripple
    const ripple = this.add.graphics().setDepth(79)
    const rippleData = { radius: 5, alpha: 0.8 }
    this.tweens.add({
      targets: rippleData,
      radius: maxRadius * 1.4,
      alpha: 0,
      delay: 100,
      duration,
      ease: 'Quad.easeOut',
      onUpdate: () => {
        ripple.clear()
        ripple.lineStyle(2, color, rippleData.alpha * 0.7)
        ripple.strokeCircle(x, y, rippleData.radius)
        ripple.lineStyle(1.5, 0xffffff, rippleData.alpha * 0.4)
        ripple.strokeEllipse(x, y + 20, rippleData.radius * 2.4, rippleData.radius * 0.5)
      },
      onComplete: () => ripple.destroy(),
    })

    // Central radiant flash
    const flash = this.add.circle(x, y, 16, 0xffffff, 0.95).setDepth(81).setBlendMode(Phaser.BlendModes.ADD)
    this.tweens.add({
      targets: flash,
      scale: 3.5,
      alpha: 0,
      duration: 350,
      ease: 'Quad.easeOut',
      onComplete: () => flash.destroy(),
    })

    // Spark particles bursting outward
    const particleCount = 18
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3
      const speed = Phaser.Math.Between(100, 240)
      const sparkColor = Math.random() > 0.3 ? color : 0xffffff
      const size = Phaser.Math.Between(2, 4)
      const spark = this.add.circle(x, y, size, sparkColor, 1).setDepth(82).setBlendMode(Phaser.BlendModes.ADD)
      const vx = Math.cos(angle) * speed
      const vy = Math.sin(angle) * speed * 0.75 - 30
      this.tweens.add({
        targets: spark,
        x: x + vx * 0.45,
        y: y + vy * 0.45,
        scale: 0.2,
        alpha: 0,
        duration: Phaser.Math.Between(400, 650),
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      })
    }

    // Floating announcement tag
    const jobName = professionNames[this.profession]
    const tagContainer = this.add.container(x, y - 45).setDepth(90)
    const tagBg = this.add.rectangle(0, 0, 110, 26, 0x09111e, 0.92)
      .setStrokeStyle(1.5, color, 0.95)
    const tagText = this.add.text(0, 0, `轉職：${jobName}`, {
      fontFamily, fontSize: '13px', color: '#f4fbff', fontStyle: 'bold',
    }).setOrigin(0.5)
    tagContainer.add([tagBg, tagText])
    tagContainer.setScale(0.7)
    this.tweens.add({
      targets: tagContainer,
      y: y - 80,
      scale: 1.05,
      alpha: 0,
      delay: 300,
      duration: 550,
      ease: 'Cubic.easeOut',
      onComplete: () => tagContainer.destroy(),
    })
  }

  private selectProfession(profession: Profession): void {
    this.profession = profession
    this.blocking = false
    if (profession !== 'gunner') this.reloading = false
    if (profession !== 'healer') {
      this.channelingHeal = false
      this.healTarget = null
      this.healBeam?.clear()
    }
  }

  private updateCameraFocus(delta: number, movementDirection: number): void {
    if (movementDirection !== 0 && movementDirection !== this.cameraFocusDirection) {
      this.cameraFocusDirection = movementDirection
      this.tweens.killTweensOf(this.cameraFocus)
      this.tweens.add({
        targets: this.cameraFocus,
        offset: CAMERA_FORWARD_FOCUS * movementDirection,
        duration: CAMERA_FOCUS_TRANSITION_DURATION,
        ease: 'Cubic.easeOut',
      })
    }
    const camera = this.cameras.main
    const isZoomed = this.isRouletteOpen || this.isTransforming

    // Smooth zoom interpolation
    const zoomBlend = 1 - Math.exp(-12.0 * delta / 1000)
    camera.zoom = Phaser.Math.Linear(camera.zoom, this.cameraTargetZoom, zoomBlend)

    let desiredScrollX: number
    let desiredScrollY: number

    if (isZoomed) {
      desiredScrollX = this.player.x - camera.width / 2
      desiredScrollY = this.player.y - 45 - camera.height / 2
    } else {
      desiredScrollX = Phaser.Math.Clamp(
        this.player.x + this.cameraFocus.offset - camera.width / 2,
        0, WORLD_WIDTH - camera.width,
      )
      desiredScrollY = 0
    }

    const blend = 1 - Math.exp(-8.0 * delta / 1000)
    camera.scrollX = Phaser.Math.Linear(camera.scrollX, desiredScrollX, blend)
    camera.scrollY = Phaser.Math.Linear(camera.scrollY, desiredScrollY, blend)

    // Counteract zoom on uiContainer so HUD and touch buttons remain 1:1 on screen
    if (this.uiContainer) {
      const z = camera.zoom
      this.uiContainer.setScale(1 / z)
      this.uiContainer.setPosition(480 * (1 - 1 / z), 270 * (1 - 1 / z))
    }
  }

  private playAction(action: keyof typeof avatarActions): void {
    const usingStrugglePose = action === 'Struggle'
    if (this.playerUsingStrugglePose !== usingStrugglePose) {
      // Struggle frames are 143 x 104, whereas the normal avatar frames are
      // 96 x 84. Keep the shared 16 x 38 physics body planted at the feet.
      this.player.setOffset(usingStrugglePose ? 64 : 40, usingStrugglePose ? 66 : 46)
      this.playerUsingStrugglePose = usingStrugglePose
    }
    this.player.play(avatarActions[action].key, true)
  }

  private spawnInitialForces(): void {
    this.spawnWave()
    for (const { kind, x, combatAdvance } of this.createWaveCluster(this.allyBanner.x)) {
      this.spawnAlly(kind, x, combatAdvance)
    }
  }

  // Only the enemy receives scheduled waves. Allies now come from the opening
  // formation, recovered ally souls, or enemy souls claimed by the player.
  private spawnWave(): void {
    this.enemies = this.enemies.filter(enemy => enemy.sprite.active)
    this.allies = this.allies.filter(ally => ally.sprite.active)
    this.wave += 1
    this.nextWaveAt = this.time.now + combatConfig.waveInterval
    const allyFront = this.allies
      .filter(ally => ally.hp > 0)
      .reduce((front, ally) => Math.max(front, ally.sprite.x), this.allyBanner.x)
    this.enemySpawnCenter = Phaser.Math.Clamp(
      Math.max(this.enemySpawnCenter, allyFront + combatConfig.waveCluster.enemyLead),
      combatConfig.waveCluster.enemyCenter,
      WORLD_WIDTH - combatConfig.waveCluster.edgePadding,
    )
    const reinforcements = this.pendingEnemyReinforcements.splice(0)
    for (const { kind, x, combatAdvance } of this.createWaveCluster(this.enemySpawnCenter, reinforcements)) {
      this.spawnEnemy(kind, x, combatAdvance)
    }
  }

  private createWaveCluster(centerX: number, reinforcements: EnemyKind[] = []): { kind: EnemyKind; x: number; combatAdvance: number }[] {
    const kinds: EnemyKind[] = [
      'melee', 'melee', 'melee', 'melee', 'melee', 'ranged', 'ranged', 'ranged', ...reinforcements,
    ]
    const advances = {
      melee: createCombatAdvances(kinds.filter(kind => kind === 'melee').length),
      ranged: createCombatAdvances(kinds.filter(kind => kind === 'ranged').length),
    }
    Phaser.Utils.Array.Shuffle(kinds)
    const middle = (kinds.length - 1) / 2
    return kinds.map((kind, index) => ({
      kind,
      combatAdvance: advances[kind].pop()!,
      x: centerX + (index - middle) * combatConfig.waveCluster.spacing
        + Phaser.Math.Between(-combatConfig.waveCluster.jitter, combatConfig.waveCluster.jitter),
    }))
  }

  private spawnEnemy(kind: EnemyKind, x: number, combatAdvance: number): void {
    const enemy = new Enemy(this, x, GROUND_Y, kind, combatAdvance, death => this.createSoul(death))
    this.enemies.push(enemy)
    this.enemyGroup.add(enemy.sprite)
  }

  private spawnAlly(kind: EnemyKind, x: number, combatAdvance: number,
    progression?: UnitProgressionState): void {
    const ally = new AllyUnit(this, x, GROUND_Y, kind, combatAdvance, progression,
      death => this.createSoul(death))
    this.allies.push(ally)
    this.allyGroup.add(ally.sprite)
  }

  private spawnAllyFromBanner(kind: EnemyKind, combatAdvance: number,
    progression?: UnitProgressionState): void {
    const offset = ((this.allySpawnSerial++ % 5) - 2) * 30
    const x = Phaser.Math.Clamp(this.allyBanner.x + offset, 40, WORLD_WIDTH - 40)
    this.spawnAlly(kind, x, combatAdvance, progression)
  }

  private createAllyBanner(): void {
    const aura = this.add.circle(0, -5, 29, 0x71d9cf, 0.12).setStrokeStyle(2, 0xa0e6da, 0.55)
    const pole = this.add.rectangle(0, -47, 4, 86, 0xc7d7e7).setStrokeStyle(1, 0x24334b)
    const finial = this.add.circle(0, -91, 5, 0xf9df84).setStrokeStyle(1, 0x533f18)
    const cloth = this.add.polygon(3, -82, [0, 0, 38, 11, 0, 30], 0x4e8da5)
      .setStrokeStyle(2, 0xa0e6da)
    const emblem = this.add.star(15, -67, 4, 3, 7, 0xf9df84).setStrokeStyle(1, 0x624e1d)
    this.allyBanner = this.add.container(combatConfig.waveCluster.allyCenter, GROUND_Y, [aura, pole, finial, cloth, emblem])
      .setDepth(4)
    this.bannerPrompt = this.add.text(this.allyBanner.x, this.allyBanner.y - 110, '', {
      fontFamily, fontSize: '12px', color: '#d8fffa', backgroundColor: '#09111e',
      padding: { x: 6, y: 3 },
    }).setOrigin(0.5).setDepth(30)
  }

  private updateAllyBanner(): void {
    const activateBanner = Phaser.Input.Keyboard.JustDown(this.keys.E) || this.bannerActionQueued
    this.bannerActionQueued = false
    if (activateBanner && !this.deployingBanner && !this.hurt && !this.firing && !this.reloading && !this.blocking) {
      // The banner is redeployed directly at the player, including their
      // current platform height; no proximity pickup is required.
      this.allyBanner.setPosition(Phaser.Math.Clamp(this.player.x, 40, WORLD_WIDTH - 40), this.player.y)
      this.deployingBanner = true
      this.player.setVelocityX(0)
      this.playAction('GroundSlam')
    }
    this.bannerPrompt.setText('E: deploy ally banner').setPosition(this.allyBanner.x, this.allyBanner.y - 110)
  }

  private createSoul(death: UnitDeath): void {
    if (this.gameEnded) return
    const color = death.faction === 'ally' ? 0x8fe4dc : 0xf47b86
    const marker = this.add.rectangle(death.x, GROUND_Y - 10, 22, 22, color)
      .setStrokeStyle(2, 0xf4fbff).setDepth(4)
    const caption = this.add.text(death.x, GROUND_Y - 39, death.faction === 'ally' ? 'ALLY SOUL' : 'ENEMY SOUL', {
      fontFamily, fontSize: '10px', color: death.faction === 'ally' ? '#c8fff7' : '#ffc7cf',
    }).setOrigin(0.5).setDepth(30)
    this.physics.add.existing(marker)
    const body = marker.body as Phaser.Physics.Arcade.Body
    body.setAllowGravity(false).setImmovable(true).setSize(22, 22)
    const soul: Soul = {
      marker, caption, ...death, collected: false,
      groundX: death.x, groundY: GROUND_Y - 10,
    }
    this.souls.push(soul)
    // Enemies may only claim fallen allies. Their reward is delayed until the
    // next scheduled wave, so no combatant is created at the pickup point.
    if (death.faction === 'ally') {
      this.physics.add.overlap(this.enemyGroup, marker, () => this.collectSoul(soul, 'enemy'))
    }
    this.tweens.add({ targets: marker, angle: 360, duration: 900, repeat: -1 })
  }

  private collectSoul(soul: Soul, collector: 'player' | 'enemy'): void {
    if (soul.collected || !soul.marker.active || this.gameEnded) return
    this.soulsBeingAbsorbed.delete(soul)
    soul.collected = true
    this.tweens.killTweensOf([soul.marker, soul.caption])
    soul.marker.destroy()
    soul.caption.destroy()
    this.souls = this.souls.filter(candidate => candidate !== soul)
    if (collector === 'player') {
      this.flashPlayerAfterSoulAbsorb()
      if (soul.faction === 'ally' && soul.progression) {
        this.spawnAllyFromBanner(soul.kind, soul.combatAdvance, soul.progression)
      } else if (soul.faction === 'enemy') {
        this.spawnAllyFromBanner(soul.kind, soul.combatAdvance)
      }
      return
    }
    this.pendingEnemyReinforcements.push(soul.kind)
  }

  private updateSoulAbsorption(time: number): void {
    const targetX = this.player.x
    const targetY = this.player.y - 58
    const holdingAbsorb = this.keys.X.isDown && !this.firing && !this.reloading
      && !this.deployingBanner && !this.blocking && !this.hurt
    if (!holdingAbsorb) {
      this.cancelSoulAbsorption()
      return
    }
    // The player still performs the channel animation when no soul is within
    // range, making the X input's feedback consistent.
    this.player.setVelocityX(0)
    this.playAction('Struggle')

    const candidates = this.souls
      .filter(soul => !soul.collected && soul.marker.active
        && Phaser.Math.Distance.Between(soul.groundX, soul.groundY, targetX, targetY) <= SOUL_ATTRACTION_RANGE)
    for (const soul of candidates) {
      if (this.soulsBeingAbsorbed.has(soul)) continue
      const distance = Phaser.Math.Distance.Between(soul.groundX, soul.groundY, targetX, targetY)
      soul.absorbStartedAt = time
      soul.absorbDuration = Phaser.Math.Linear(250, SOUL_ABSORB_DURATION, distance / SOUL_ATTRACTION_RANGE)
      soul.caption.setText('吸取 0%')
      this.soulsBeingAbsorbed.add(soul)
    }

    for (const soul of [...this.soulsBeingAbsorbed]) {
      const distance = Phaser.Math.Distance.Between(soul.groundX, soul.groundY, targetX, targetY)
      if (soul.collected || !soul.marker.active || distance > SOUL_ATTRACTION_RANGE) {
        this.cancelSoulAbsorption(false, soul)
        continue
      }
      const progress = Phaser.Math.Clamp((time - soul.absorbStartedAt!) / soul.absorbDuration!, 0, 1)
      soul.marker.setPosition(
        Phaser.Math.Linear(soul.groundX, targetX, progress),
        Phaser.Math.Linear(soul.groundY, targetY, progress),
      ).setScale(1 + progress * 0.15)
      soul.caption.setPosition(soul.marker.x, soul.marker.y - 29)
        .setText(`吸取 ${Math.ceil(progress * 100)}%`)
      ;(soul.marker.body as Phaser.Physics.Arcade.Body).updateFromGameObject()
      if (progress >= 1) this.collectSoul(soul, 'player')
    }
  }

  private flashPlayerAfterSoulAbsorb(): void {
    this.soulAbsorbFlashStartedAt = this.time.now
    this.soulAbsorbFlashUntil = this.time.now + 360
  }

  private cancelSoulAbsorption(bounce = false, onlySoul?: Soul): void {
    const souls = onlySoul ? [onlySoul] : [...this.soulsBeingAbsorbed]
    for (const soul of souls) {
      this.soulsBeingAbsorbed.delete(soul)
      soul.absorbStartedAt = undefined
      soul.absorbDuration = undefined
      if (soul.collected || !soul.marker.active) continue

      soul.marker.setPosition(soul.groundX, soul.groundY).setScale(1)
      soul.caption.setPosition(soul.groundX, soul.groundY - 29)
        .setText(soul.faction === 'ally' ? 'ALLY SOUL' : 'ENEMY SOUL')
      ;(soul.marker.body as Phaser.Physics.Arcade.Body).updateFromGameObject()
      if (bounce) {
        this.tweens.add({ targets: soul.marker, y: soul.groundY - 18, duration: 120, yoyo: true, ease: 'Quad.Out' })
        this.tweens.add({ targets: soul.caption, y: soul.groundY - 47, duration: 120, yoyo: true, ease: 'Quad.Out' })
      }
    }
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.professionMenuOpen && !this.touchControlPointers.has(pointer.id) && pointer.button === 0) {
      this.primaryActionPointerId = pointer.id
      this.fire()
    }
  }

  private fire(): void {
    // Let the complete shot animation finish before accepting the next click.
    if (this.firing || this.hurt || this.gameEnded || this.professionMenuOpen) return
    if (this.profession === 'healer' || this.profession === 'tank') return
    if (this.reloading) return
    if (this.playerAmmo <= 0) {
      this.startReload()
      return
    }
    const direction = this.player.flipX ? -1 : 1
    const x = this.player.x + direction * 32
    const y = this.player.y - 40
    if (!this.launchPlayerBullet(x, y, direction)) return
    this.playerAmmo -= 1
    const body = this.player.body as Phaser.Physics.Arcade.Body
    const running = (body.blocked.down || body.touching.down) && Math.abs(body.velocity.x) > 0
    this.firing = true
    this.playAction(running ? 'GunRunFire' : 'GunFire')
  }


  private startReload(): void {
    if (this.reloading || this.hurt || this.gameEnded || this.playerAmmo > 0) return
    this.firing = false
    this.reloading = true
    this.playAction('GunReload')
  }

  private launchPlayerBullet(x: number, y: number, direction: number): boolean {
    const bullet = this.bullets.get(x, y, bulletAction.frames[0], 'projectile') as
      Phaser.Physics.Arcade.Sprite | null
    if (!bullet) return false
    bullet.setTexture(bulletAction.frames[0], 'projectile')
      .setOrigin(0.5).setScale(2).setDepth(6).setFlipX(direction < 0)
    bullet.enableBody(true, x, y, true, true)
    bullet.setSize(9, 2).setOffset(0, 0)
    const bulletBody = bullet.body as Phaser.Physics.Arcade.Body
    bulletBody.setAllowGravity(false)
    bullet.setVelocity(direction * BULLET_SPEED, 0)
    bullet.setData('expiresAt', this.time.now + BULLET_LIFETIME_MS)
    bullet.play(bulletAction.key)
    return true
  }

  private recycleBullet(bullet: Phaser.Physics.Arcade.Sprite): void {
    bullet.setData('killCredit', undefined)
    bullet.setData('damage', undefined)
    bullet.setData('busDamage', undefined)
    bullet.stop().disableBody(true, true)
  }

  private launchEnemyProjectile(enemy: Enemy, target: Bounds): void {
    if (this.gameEnded || enemy.hp <= 0) return
    const x = enemy.sprite.x - 42 * enemy.progression.sizeMultiplier
    const y = enemy.sprite.y - 42 * enemy.progression.sizeMultiplier
    const shot = this.enemyProjectiles.get(x, y, enemyProjectileAction.frames[0], 'projectile') as
      Phaser.Physics.Arcade.Sprite | null
    if (!shot) return
    shot.setTexture(enemyProjectileAction.frames[0], 'projectile').setOrigin(0.5)
      .setScale(1.4).setDepth(7).setFlipX(false).setAlpha(1)
    shot.enableBody(true, x, y, true, true)
    shot.setSize(12, 8).setOffset(13.5, -0.5)
    const body = shot.body as Phaser.Physics.Arcade.Body
    body.setAllowGravity(true).setGravityY(combatConfig.projectileGravity - this.physics.world.gravity.y)
    const velocity = ballisticVelocity(x, y, (target.left + target.right) / 2, (target.top + target.bottom) / 2)
    shot.setVelocity(velocity.x, velocity.y).setRotation(Math.atan2(velocity.y, velocity.x))
    shot.setData('sourceX', enemy.sprite.x)
    shot.setData('killCredit', enemy.progression)
    // Capture damage at release so later level-ups cannot alter an in-flight shot.
    shot.setData('damage', enemy.attackDamage)
    shot.setData('busDamage', enemy.progression.scaleDamage(combatConfig.busDamage))
    shot.setData('expiresAt', this.time.now + combatConfig.projectileLifetime)
    shot.play(enemyProjectileAction.key)
  }

  private launchBossBasicArrow(boss: Boss, target: Bounds): void {
    if (this.gameEnded || !boss.combatActive) return
    const x = boss.sprite.x - 78
    const y = boss.sprite.y - 170
    const arrow = this.bossBasicArrows.get(x, y, allyArrowTexture, 'projectile') as
      Phaser.Physics.Arcade.Sprite | null
    if (!arrow) return
    arrow.setTexture(allyArrowTexture, 'projectile').setOrigin(0.5)
      .setScale(combatConfig.boss.arrowScale).setDepth(9)
      .setFlipX(false).setAlpha(0.95).setTint(0xff405f)
    arrow.enableBody(true, x, y, true, true)
    arrow.setSize(23, 5).setOffset(0, 0)
    const body = arrow.body as Phaser.Physics.Arcade.Body
    body.setAllowGravity(false).setGravityY(0)
    const targetX = (target.left + target.right) / 2
    const targetY = (target.top + target.bottom) / 2
    const angle = Phaser.Math.Angle.Between(x, y, targetX, targetY)
    const speed = combatConfig.projectileSpeed * combatConfig.boss.basicArrowSpeedMultiplier
    arrow.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed).setRotation(angle)
    arrow.setData('stuck', false)
    arrow.setData('sourceX', boss.sprite.x)
    arrow.setData('expiresAt', this.time.now + combatConfig.projectileLifetime)
  }

  private stickBossBasicArrow(arrow: Phaser.Physics.Arcade.Sprite): void {
    if (!arrow.active || arrow.getData('stuck')) return
    arrow.setVelocity(0).setY(GROUND_Y - 5)
    const body = arrow.body as Phaser.Physics.Arcade.Body
    body.enable = false
    arrow.setData('stuck', true)
    arrow.setData('expiresAt', this.time.now + 1000)
  }

  private prepareBossArrowVolley(boss: Boss): void {
    if (this.gameEnded || !boss.combatActive) return
    for (const child of this.bossArrows.getChildren()) {
      const arrow = child as Phaser.Physics.Arcade.Sprite
      if (arrow.active) this.recycleBullet(arrow)
    }
    const centerX = boss.sprite.x
    const centerY = boss.sprite.y - 180
    for (let index = 0; index < boss.volleySize; index += 1) {
      const angle = Math.PI * 2 * index / boss.volleySize
      const x = centerX + Math.cos(angle) * 34
      const y = centerY + Math.sin(angle) * 46
      const arrow = this.bossArrows.get(x, y, allyArrowTexture, 'projectile') as
        Phaser.Physics.Arcade.Sprite | null
      if (!arrow) continue
      arrow.setTexture(allyArrowTexture, 'projectile').setOrigin(0.5)
        .setScale(combatConfig.boss.arrowScale).setDepth(9)
        .setFlipX(false).setAlpha(0.95).setTint(0xff405f)
      arrow.enableBody(true, x, y, true, true)
      arrow.setSize(23, 5).setOffset(0, 0).setRotation(angle)
      const body = arrow.body as Phaser.Physics.Arcade.Body
      body.setAllowGravity(false).setGravityY(0)
      arrow.setVelocity(
        Math.cos(angle) * 58 * boss.arrowFloatDistanceMultiplier,
        Math.sin(angle) * 42 * boss.arrowFloatDistanceMultiplier,
      )
      arrow.setData('armed', false)
      arrow.setData('sourceX', boss.sprite.x)
    }
  }

  private releaseBossArrowVolley(boss: Boss, target: Bounds): void {
    if (this.gameEnded || !boss.combatActive) return
    const targetX = (target.left + target.right) / 2
    const targetY = (target.top + target.bottom) / 2
    for (const child of this.bossArrows.getChildren()) {
      const arrow = child as Phaser.Physics.Arcade.Sprite
      if (!arrow.active || arrow.getData('armed')) continue
      const body = arrow.body as Phaser.Physics.Arcade.Body
      body.setAllowGravity(true).setGravityY(combatConfig.projectileGravity - this.physics.world.gravity.y)
      const velocity = ballisticVelocity(
        arrow.x, arrow.y, targetX, targetY, boss.arrowSpeedMultiplier,
      )
      arrow.setVelocity(velocity.x, velocity.y).setRotation(Math.atan2(velocity.y, velocity.x))
      arrow.setData('armed', true)
      arrow.setData('sourceX', boss.sprite.x)
      arrow.setData('expiresAt', this.time.now + combatConfig.projectileLifetime)
    }
  }

  private startBossFinalRain(_boss: Boss): void {
    if (this.gameEnded || this.bossRainActive) return
    for (const child of this.bossArrows.getChildren()) {
      const arrow = child as Phaser.Physics.Arcade.Sprite
      if (arrow.active) this.recycleBullet(arrow)
    }
    for (const child of this.bossBasicArrows.getChildren()) {
      const arrow = child as Phaser.Physics.Arcade.Sprite
      if (arrow.active) this.recycleBullet(arrow)
    }
    const now = this.time.now
    this.bossRainActive = true
    this.bossRainWarningUntil = now + combatConfig.boss.finalRainWarningDuration
    this.bossRainEndsAt = this.bossRainWarningUntil + combatConfig.boss.finalRainDuration
    this.bossRainFinishAt = this.bossRainEndsAt + combatConfig.boss.finalRainSettleDuration
    this.nextBossRainBurstAt = this.bossRainWarningUntil
    this.bossRainWarning.setVisible(true)
    this.bossRainText.setVisible(true)
  }

  private updateBossFinalRain(time: number): void {
    if (!this.bossRainActive) return
    const pulse = 0.22 + (Math.sin(time * 0.018) + 1) * 0.12
    this.bossRainWarning.setAlpha(pulse)
    if (time >= this.bossRainWarningUntil && time < this.bossRainEndsAt) {
      this.bossRainText.setText('箭雨中 · 跳台下方安全')
      let catchUpBursts = 0
      while (time >= this.nextBossRainBurstAt && catchUpBursts < 3) {
        this.spawnBossRainBurst()
        this.nextBossRainBurstAt += combatConfig.boss.finalRainInterval
        catchUpBursts += 1
      }
    }
    if (time < this.bossRainFinishAt) return
    this.bossRainActive = false
    this.bossRainWarning.setVisible(false)
    this.bossRainText.setVisible(false).setText('箭雨將至 · 躲到跳台下方')
    for (const child of this.bossRainArrows.getChildren()) {
      const arrow = child as Phaser.Physics.Arcade.Sprite
      if (arrow.active) this.recycleBullet(arrow)
    }
    this.boss.finishFinalRain()
  }

  private spawnBossRainBurst(): void {
    const view = this.cameras.main.worldView
    const count = combatConfig.boss.finalRainPerBurst
    const laneWidth = (view.width - 24) / count
    for (let index = 0; index < count; index += 1) {
      const x = view.left + 12 + (index + Phaser.Math.FloatBetween(0.08, 0.92)) * laneWidth
      const y = view.top - Phaser.Math.Between(20, 170)
      const arrow = this.bossRainArrows.get(x, y, allyArrowTexture, 'projectile') as
        Phaser.Physics.Arcade.Sprite | null
      if (!arrow) continue
      arrow.setTexture(allyArrowTexture, 'projectile').setOrigin(0.5)
        .setScale(combatConfig.boss.arrowScale).setDepth(89)
        .setFlipX(false).setAlpha(0.92).setTint(0xff405f)
      arrow.enableBody(true, x, y, true, true)
      arrow.setSize(5, 23).setOffset(9, -9).setRotation(Math.PI / 2)
      const body = arrow.body as Phaser.Physics.Arcade.Body
      body.setAllowGravity(false).setGravityY(0)
      arrow.setVelocity(Phaser.Math.Between(-35, 35),
        combatConfig.boss.finalRainSpeed + Phaser.Math.Between(-100, 140))
    }
  }

  private launchAllyProjectile(ally: AllyUnit, target: Bounds): void {
    if (this.gameEnded || ally.hp <= 0) return
    const x = ally.sprite.x + 42 * ally.progression.sizeMultiplier
    const y = ally.sprite.y - 42 * ally.progression.sizeMultiplier
    const shot = this.allyProjectiles.get(x, y, allyArrowTexture, 'projectile') as
      Phaser.Physics.Arcade.Sprite | null
    if (!shot) return
    shot.setTexture(allyArrowTexture, 'projectile').setOrigin(0.5)
      .setScale(1.4).setDepth(7).setFlipX(false).setAlpha(1)
    shot.enableBody(true, x, y, true, true)
    shot.setSize(23, 5).setOffset(0, 0)
    const body = shot.body as Phaser.Physics.Arcade.Body
    body.setAllowGravity(true).setGravityY(combatConfig.projectileGravity - this.physics.world.gravity.y)
    const velocity = ballisticVelocity(x, y, (target.left + target.right) / 2, (target.top + target.bottom) / 2)
    shot.setVelocity(velocity.x, velocity.y).setRotation(Math.atan2(velocity.y, velocity.x))
    shot.setData('killCredit', ally.progression)
    shot.setData('damage', ally.attackDamage)
    shot.setData('expiresAt', this.time.now + combatConfig.projectileLifetime)
  }

  private damageEnemyTarget(target: EnemyTarget, enemy: Enemy): void {
    if (typeof target === 'string') {
      const damage = target === 'bus' ? enemy.progression.scaleDamage(combatConfig.busDamage) : enemy.attackDamage
      this.takeDamage(target, enemy.sprite.x, damage, enemy.progression)
    } else target.takeDamage(enemy.attackDamage, enemy.progression)
  }

  private takeDamage(target: 'player' | 'bus', sourceX: number,
    amount = target === 'player' ? combatConfig.enemyDamage : combatConfig.busDamage,
    credit?: KillCredit): void {
    if (this.gameEnded) return
    if (target === 'player') {
      this.cancelSoulAbsorption(true)
      if (this.blocking && this.absorbTankGuard(amount)) {
        return
      }
      if (this.time.now < this.invulnerableUntil) return
      this.playerHp = Math.max(0, this.playerHp - amount)
      if (this.playerHp === 0) credit?.recordKill()
      this.hitStartedAt = this.time.now
      this.invulnerableUntil = this.time.now + combatConfig.playerInvulnerability
      this.hurt = true
      this.firing = false
      this.reloading = false
      this.deployingBanner = false
      this.lastGrounded = -Infinity
      this.jumpQueued = -Infinity
      this.jumpReleased = true
      const direction = this.player.x <= sourceX ? -1 : 1
      this.player.setFlipX(direction > 0).setAlpha(1)
        .setVelocity(direction * combatConfig.playerKnockbackSpeed, -combatConfig.playerKnockbackLift)
      this.player.setTintFill(0xf47b86)
      this.playAction('Knockback')
      // No dedicated OnHit asset exists. A short procedural flash complements
      // the complete source Knockback animation without replacing any frames.
      const flash = this.add.circle(this.player.x, this.player.y - 36, 8, 0xffeee0, 0.8)
        .setStrokeStyle(2, 0xffa4a6).setDepth(10)
      this.tweens.add({ targets: flash, scale: 2.2, alpha: 0, duration: 160,
        onComplete: () => flash.destroy() })
    } else {
      this.busHp = Math.max(0, this.busHp - amount)
      this.bus.setTintFill(0xf47b86)
      this.time.delayedCall(120, () => { if (!this.gameEnded) this.bus.clearTint() })
    }
    if (this.playerHp === 0 || this.busHp === 0) {
      this.endEncounter(this.busHp === 0 ? '巴士已被摧毀' : '玩家已倒下')
    }
  }

  private absorbTankGuard(amount: number): boolean {
    // A guard that reaches zero breaks on this hit: the attack goes through
    // in full and the player must release the block before recovering guard.
    if (this.tankGuard <= amount) {
      this.tankGuard = 0
      return false
    }
    this.tankGuard -= amount
    return true
  }

  private endEncounter(message: string): void {
    if (this.gameEnded) return
    this.gameEnded = true
    this.hurt = false
    this.invulnerableUntil = 0
    this.player.setAlpha(1).clearTint()
    this.physics.pause()
    this.player.setVelocity(0).stop()
    for (const ally of this.allies) ally.stop()
    for (const enemy of this.enemies) if (enemy.hp > 0) enemy.sprite.setVelocity(0).stop()
    this.boss.stop()
    for (const bullet of this.bullets.getChildren()) this.recycleBullet(bullet as Phaser.Physics.Arcade.Sprite)
    this.channelingHeal = false
    this.healTarget = null
    this.healBeam?.clear()
    for (const arrow of this.allyProjectiles.getChildren()) this.recycleBullet(arrow as Phaser.Physics.Arcade.Sprite)
    for (const shot of this.enemyProjectiles.getChildren()) this.recycleBullet(shot as Phaser.Physics.Arcade.Sprite)
    for (const arrow of this.bossArrows.getChildren()) this.recycleBullet(arrow as Phaser.Physics.Arcade.Sprite)
    for (const arrow of this.bossBasicArrows.getChildren()) this.recycleBullet(arrow as Phaser.Physics.Arcade.Sprite)
    for (const arrow of this.bossRainArrows.getChildren()) this.recycleBullet(arrow as Phaser.Physics.Arcade.Sprite)
    this.bossRainActive = false
    this.bossRainWarning.setVisible(false)
    this.bossRainText.setVisible(false)
    if (this.playerHp === 0) this.player.setTint(0x8d5865)
    if (this.busHp === 0) this.bus.setTint(0x665466)
    const panel = this.add.container(480, 245).setScrollFactor(0).setDepth(200)
    panel.add(this.add.rectangle(0, 0, 420, 140, 0x09111e, 0.96).setStrokeStyle(1, 0x7cb7ff))
    panel.add(this.add.text(0, -30, message, { fontFamily, fontSize: '28px', color: '#eff6ff' }).setOrigin(0.5))
    panel.add(this.add.text(0, 25, '按 R 重新開始守護巴士', { fontFamily, fontSize: '16px', color: '#a0e6da' }).setOrigin(0.5))
    this.stateText.setText('R 重新開始')
  }

  private updateHealthDisplay(): void {
    this.playerBar.setName(professionNames[this.profession])
    this.playerBar.update(this.player.x, this.player.y - 79, this.playerHp)
    this.playerBar.setVisible(!this.isRouletteOpen)
    this.tankGuardBar.update(this.player.x, this.player.y - 70, Math.ceil(this.tankGuard))
    this.tankGuardBar.setVisible(this.profession === 'tank' && !this.isRouletteOpen)
    this.ammoSlots.update(this.player.x, this.player.y - 70, this.playerAmmo, this.reloading)
    this.ammoSlots.setVisible(this.profession === 'gunner' && !this.isRouletteOpen)
    this.healerManaBar.update(this.player.x, this.player.y - 70, Math.ceil(this.healerMana))
    this.healerManaBar.setVisible(this.profession === 'healer' && !this.isRouletteOpen)
    this.busBar.update(this.bus.x, this.bus.y - this.bus.displayHeight - 17, this.busHp)
    const melee = this.enemies.filter(enemy => enemy.hp > 0 && enemy.kind === 'melee').length
    const ranged = this.enemies.filter(enemy => enemy.hp > 0 && enemy.kind === 'ranged').length
    this.healthText.setText(`玩家 ${this.playerHp} / ${combatConfig.playerHealth}    巴士 ${this.busHp} / ${combatConfig.busHealth}    近戰 ${melee} · 遠攻 ${ranged}`)
    const healing = this.profession === 'healer'
    const tank = this.profession === 'tank'
    this.professionText.setColor(tank ? '#7cb7ff' : healing ? '#72e7c6' : '#f47b86')
      .setText(professionNames[this.profession])
    this.ammoText.setColor(tank ? '#7cb7ff' : healing ? '#72e7c6' : this.reloading ? '#ffc477' : '#a0e6da')
      .setText(tank ? this.blocking
        ? `格擋中 · 體幹 ${Math.ceil(this.tankGuard)} / ${TANK_GUARD_MAX}`
        : this.tankGuardInputHeld()
          ? `體幹破裂 · 體幹 ${Math.ceil(this.tankGuard)} / ${TANK_GUARD_MAX}`
          : `鬆開回復 · 體幹 ${Math.ceil(this.tankGuard)} / ${TANK_GUARD_MAX}` : healing
        ? (this.channelingHeal && this.healTarget
          ? `治療中 · 魔力 ${Math.ceil(this.healerMana)} / ${HEALER_MANA_MAX}`
          : this.healerMana < 5
            ? `魔力枯竭 · 魔力 ${Math.ceil(this.healerMana)} / ${HEALER_MANA_MAX}`
            : `按住治療 · 魔力 ${Math.ceil(this.healerMana)} / ${HEALER_MANA_MAX}`)
        : this.reloading ? '換彈中…' : `彈藥 ${this.playerAmmo} / 3`)
  }

  private updateBossHud(): void {
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body
    const distance = Phaser.Math.Distance.Between(
      playerBody.center.x, playerBody.center.y,
      this.boss.sprite.x, this.boss.sprite.y - this.boss.sprite.displayHeight / 2,
    )
    if (distance <= combatConfig.boss.attackRange) this.bossHudCommitted = true
    const shouldShow = !this.boss.defeated
      && (this.bossHudCommitted || distance <= combatConfig.boss.hudRevealRange)
    const ratio = Phaser.Math.Clamp(this.boss.hp / combatConfig.boss.health, 0, 1)
    this.bossHudFill.setDisplaySize(328 * ratio, 8)
    this.bossHudValue.setText(`${this.boss.hp} / ${combatConfig.boss.health}`)
    if (shouldShow === this.bossHudVisible) return
    this.bossHudVisible = shouldShow
    this.tweens.killTweensOf([this.bossHud, this.minimapHud])
    if (shouldShow) {
      this.bossHud.setVisible(true)
      this.tweens.add({
        targets: this.bossHud, y: 39, duration: 620, ease: 'Bounce.Out',
      })
      this.tweens.add({
        targets: this.minimapHud, y: 58, duration: 460, ease: 'Cubic.Out',
      })
    } else {
      this.tweens.add({
        targets: this.bossHud, y: -44, duration: 330, ease: 'Back.In',
        onComplete: () => { if (!this.bossHudVisible) this.bossHud.setVisible(false) },
      })
      this.tweens.add({
        targets: this.minimapHud, y: 0, duration: 380, ease: 'Cubic.Out',
      })
    }
  }

  private updateMinimap(): void {
    const x = 340
    const y = 31
    const width = 280
    const height = 40
    const innerLeft = x + 8
    const innerWidth = width - 16
    const laneY = y + 25
    const mapX = (worldX: number) => innerLeft
      + Phaser.Math.Clamp(worldX / WORLD_WIDTH, 0, 1) * innerWidth
    const graphics = this.minimap
    graphics.clear()
    graphics.fillStyle(0x050a14, 0.94).fillRoundedRect(x, y, width, height, 5)
    graphics.lineStyle(1, 0x38506b, 0.9).strokeRoundedRect(x, y, width, height, 5)
    graphics.lineStyle(1, 0x435167, 0.8).lineBetween(innerLeft, laneY, innerLeft + innerWidth, laneY)
    for (let segment = 0; segment <= 6; segment += 1) {
      const markerX = innerLeft + innerWidth * segment / 6
      graphics.lineStyle(1, segment === 0 ? 0x7cb7ff : segment === 6 ? 0xf47b86 : 0x33435b, 0.8)
        .lineBetween(markerX, laneY - 5, markerX, laneY + 5)
    }
    const viewLeft = mapX(this.cameras.main.scrollX)
    const viewRight = mapX(this.cameras.main.scrollX + this.cameras.main.width)
    graphics.fillStyle(0xa0e6da, 0.12).fillRect(viewLeft, y + 4, Math.max(2, viewRight - viewLeft), height - 8)
    graphics.lineStyle(1, 0xa0e6da, 0.55)
      .strokeRect(viewLeft, y + 4, Math.max(2, viewRight - viewLeft), height - 8)
    graphics.fillStyle(0x7cb7ff, 1).fillRect(mapX(this.bus.x) - 2, laneY - 7, 4, 14)
    graphics.fillStyle(0xa0e6da, 1).fillCircle(mapX(this.allyBanner.x), laneY + 4, 3)
    for (const ally of this.allies) {
      if (ally.hp > 0) graphics.fillStyle(0xaab2bd, 1).fillCircle(mapX(ally.sprite.x), laneY + 4, 2)
    }
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0) continue
      graphics.fillStyle(enemy.kind === 'melee' ? 0xf47b86 : 0xffc477, 1)
        .fillCircle(mapX(enemy.sprite.x), laneY - 4, 2)
    }
    if (this.boss.visibleOnMap) {
      graphics.fillStyle(0xff405f, 1).fillCircle(mapX(this.boss.sprite.x), laneY - 4, 4)
      graphics.lineStyle(1, 0xffc477, 0.9).strokeCircle(mapX(this.boss.sprite.x), laneY - 4, 6)
    }
    graphics.fillStyle(0xf4fbff, 1).fillCircle(mapX(this.player.x), laneY, 3)
    graphics.lineStyle(1, 0xf47b86, 0.7)
      .lineBetween(mapX(this.enemySpawnCenter), y + 5, mapX(this.enemySpawnCenter), y + height - 5)
  }

  update(time: number, delta: number): void {
    if (!this.player) return
    // Scene.update receives the raw browser timestamp. The scene Clock is the
    // shared gameplay clock and honors the profession-menu slow-motion scale.
    time = this.time.now
    const gameplayDelta = delta * this.time.timeScale
    if (Phaser.Input.Keyboard.JustDown(this.keys.R)) {
      this.scene.restart()
      return
    }
    const controlsLocked = this.isRouletteOpen || this.isTransforming
    if (this.isRouletteOpen && this.rouletteContainer) {
      this.rouletteContainer.setPosition(this.player.x, this.player.y - 75)
    }
    this.updateBlocking(gameplayDelta)
    this.updateHealingChannel(gameplayDelta, time)
    if (!this.gameEnded && !controlsLocked) this.updateAllyBanner()
    this.updateHealthDisplay()
    this.updateBossHud()
    this.updateMinimap()
    if (this.gameEnded) return
    this.soulRangeIndicator.setPosition(this.player.x, this.player.y - 10)
    const invulnerable = time < this.invulnerableUntil
    const absorbFlashing = time < this.soulAbsorbFlashUntil
      && Math.floor((time - this.soulAbsorbFlashStartedAt) / 60) % 2 === 0
    this.player.setAlpha(
      (invulnerable && Math.floor((time - this.hitStartedAt) / combatConfig.playerBlinkInterval) % 2 === 1) || absorbFlashing
        ? 0.25 : 1,
    )
    if (!invulnerable || time - this.hitStartedAt >= 100) this.player.clearTint()
    if (this.player.y > 590) {
      this.playerHp = 0
      this.endEncounter('玩家已倒下')
      return
    }
    const body = this.player.body as Phaser.Physics.Arcade.Body
    let grounded = body.blocked.down || body.touching.down
    if (grounded && !this.hurt) this.lastGrounded = time
    const channelLocked = this.blocking || this.channelingHeal || this.deployingBanner || this.soulsBeingAbsorbed.size > 0
    const left = !controlsLocked && !channelLocked
      && (this.cursors.left.isDown || this.keys.A.isDown || this.touchControlIsDown('left'))
    const right = !controlsLocked && !channelLocked
      && (this.cursors.right.isDown || this.keys.D.isDown || this.touchControlIsDown('right'))
    const direction = Number(right) - Number(left)
    if (!this.hurt && !controlsLocked) {
      this.player.setVelocityX(direction * SPEED)
      if (direction) this.player.setFlipX(direction < 0)
    } else if (controlsLocked) {
      this.player.setVelocityX(0)
    }
    this.updateSoulAbsorption(time)
    this.updateCameraFocus(delta, direction)
    if (!controlsLocked && !channelLocked && !this.hurt && grounded && this.player.y < GROUND_Y - 8
      && Phaser.Input.Keyboard.JustDown(this.cursors.down)) {
      this.dropThroughUntil = time + DROP_THROUGH_MS
      this.player.y += 4
      this.player.setVelocityY(DROP_THROUGH_SPEED)
      this.lastGrounded = -Infinity
      grounded = false
    }
    // Read every edge, including simultaneous keys, to avoid stale jump requests.
    const jumpEdges = [this.cursors.space, this.cursors.up, this.keys.W]
      .map(key => Phaser.Input.Keyboard.JustDown(key))
    if (!controlsLocked && !channelLocked && !this.hurt && jumpEdges.some(Boolean)) this.jumpQueued = time
    const jumpHeld = !controlsLocked && !channelLocked && (this.cursors.space.isDown || this.cursors.up.isDown || this.keys.W.isDown
      || this.touchControlIsDown('jump')
    )
    if (!channelLocked && !this.hurt && time - this.jumpQueued <= JUMP_BUFFER_MS && time - this.lastGrounded <= COYOTE_MS) {
      this.player.setVelocityY(-JUMP_SPEED)
      this.lastGrounded = -Infinity
      this.jumpQueued = -Infinity
      this.jumpReleased = false
    }
    // Releasing early produces a shorter jump.
    if (!channelLocked && !this.hurt && !jumpHeld && !this.jumpReleased && body.velocity.y < -240) {
      this.player.setVelocityY(-240)
      this.jumpReleased = true
    }
    // Shooting owns the animation temporarily, while movement physics continue.
    if (!this.firing && !this.reloading && !this.hurt && !channelLocked && !this.isTransforming) {
      if (body.velocity.y < -80) this.playAction('JumpRise')
      else if (!grounded && body.velocity.y > 80) this.playAction('JumpFall')
      else if (!grounded) this.playAction('JumpMid')
      else this.playAction(direction ? 'Run' : 'Idle')
    }
    for (const child of this.bullets.getChildren()) {
      const bullet = child as Phaser.Physics.Arcade.Sprite
      if (bullet.active && (time >= bullet.getData('expiresAt') || bullet.x < -32 || bullet.x > WORLD_WIDTH + 32)) {
        this.recycleBullet(bullet)
      }
    }
    for (const layer of this.layers) layer.sprite.tilePositionX = this.cameras.main.scrollX * layer.speed
    for (const projectileGroup of [this.enemyProjectiles, this.allyProjectiles, this.bossBasicArrows]) {
      for (const child of projectileGroup.getChildren()) {
        const shot = child as Phaser.Physics.Arcade.Sprite
        if (!shot.active) continue
        if (shot.getData('stuck')) {
          if (time >= shot.getData('expiresAt')) this.recycleBullet(shot)
          continue
        }
        if (time >= shot.getData('expiresAt') || shot.x < -60 || shot.x > WORLD_WIDTH + 60 || shot.y > 620 || shot.y < -600) {
          this.recycleBullet(shot)
        } else {
          const velocity = (shot.body as Phaser.Physics.Arcade.Body).velocity
          shot.setRotation(Math.atan2(velocity.y, velocity.x))
        }
      }
    }
    for (const child of this.bossArrows.getChildren()) {
      const arrow = child as Phaser.Physics.Arcade.Sprite
      if (!arrow.active) continue
      if (!arrow.getData('armed')) {
        if (!this.boss.combatActive) this.recycleBullet(arrow)
        else arrow.rotation += 0.012
        continue
      }
      if (time >= arrow.getData('expiresAt') || arrow.x < -60 || arrow.x > WORLD_WIDTH + 60
        || arrow.y > 620 || arrow.y < -600) {
        this.recycleBullet(arrow)
      } else {
        const velocity = (arrow.body as Phaser.Physics.Arcade.Body).velocity
        arrow.setRotation(Math.atan2(velocity.y, velocity.x))
      }
    }
    for (const child of this.bossRainArrows.getChildren()) {
      const arrow = child as Phaser.Physics.Arcade.Sprite
      if (arrow.active && (arrow.y > 640 || arrow.x < -80 || arrow.x > WORLD_WIDTH + 80)) {
        this.recycleBullet(arrow)
      }
    }
    for (const enemy of this.enemies) {
      enemy.update(time, body, this.bus.getBounds(), this.allies,
        target => this.damageEnemyTarget(target, enemy),
        (attacker, target) => this.launchEnemyProjectile(attacker, target))
      if (this.gameEnded) break
    }
    if (!this.gameEnded) {
      this.boss.update(time, body, this.bus.getBounds(), this.allies,
        attacker => this.prepareBossArrowVolley(attacker),
        (attacker, target) => this.releaseBossArrowVolley(attacker, target),
        (attacker, target) => this.launchBossBasicArrow(attacker, target),
        attacker => this.startBossFinalRain(attacker))
      this.updateBossFinalRain(time)
    }
    if (!this.gameEnded) {
      const hostiles: HostileTarget[] = this.boss.combatActive
        ? [...this.enemies, this.boss]
        : this.enemies
      for (const ally of this.allies) {
        ally.update(time, hostiles, (attacker, target) => this.launchAllyProjectile(attacker, target))
      }
    }
    this.enemies = this.enemies.filter(enemy => enemy.hp > 0 || enemy.sprite.active)
    this.allies = this.allies.filter(ally => ally.hp > 0 || ally.sprite.active)
    if (this.nextWaveAt !== null) {
      const allyMelee = this.allies.filter(ally => ally.hp > 0 && ally.kind === 'melee').length
      const allyRanged = this.allies.filter(ally => ally.hp > 0 && ally.kind === 'ranged').length
      if (time >= this.nextWaveAt) this.spawnWave()
      const seconds = Math.max(0, Math.ceil((this.nextWaveAt - time) / 1000))
      const queued = this.pendingEnemyReinforcements.length
      this.stateText.setText(`第 ${this.wave} 波 · 友軍 ${allyMelee}/${allyRanged} · 下一波 ${seconds} 秒${queued ? ` · 敵援 +${queued}` : ''}`)
    }
    this.updateHealthDisplay()
  }
}

new Phaser.Game({
  type: Phaser.AUTO, parent: 'game-container', width: 960, height: 540,
  backgroundColor: '#070b19', pixelArt: true, roundPixels: true,
  // CSS Grid centers the canvas. Letting Phaser add centering margins as well
  // shifts the visible game area to the right.
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.NO_CENTER },
  input: { activePointers: 3 },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 1400 }, debug: false } },
  scene: PrototypeScene,
})
