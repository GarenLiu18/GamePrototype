import Phaser from 'phaser'
import { allyArrowTexture, avatarActions, backgrounds, bulletAction, busTexture, enemyProjectileAction, loadAssets, registerAnimations } from './assets'
import { AllyUnit, ballisticVelocity, Boss, combatConfig, Enemy, HealthBar, type Bounds, type EnemyKind, type EnemyTarget, type HostileTarget } from './combat'
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
const BULLET_SPEED = 760
const BULLET_LIFETIME_MS = 1400
const fontFamily = '"Segoe UI", "Microsoft JhengHei", sans-serif'

class PrototypeScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private keys!: Record<'A' | 'D' | 'W' | 'R', Phaser.Input.Keyboard.Key>
  private layers: { sprite: Phaser.GameObjects.TileSprite; speed: number }[] = []
  private healthText!: Phaser.GameObjects.Text
  private stateText!: Phaser.GameObjects.Text
  private ammoText!: Phaser.GameObjects.Text
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
  private enemySpawnCenter = combatConfig.waveCluster.enemyCenter
  private playerHp = combatConfig.playerHealth
  private busHp = combatConfig.busHealth
  private playerBar!: HealthBar
  private busBar!: HealthBar
  private invulnerableUntil = 0
  private hurt = false
  private hitStartedAt = 0
  private gameEnded = false
  private bullets!: Phaser.Physics.Arcade.Group
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
    this.enemySpawnCenter = combatConfig.waveCluster.enemyCenter
    this.physics.resume()
    this.firing = false
    this.reloading = false
    this.playerAmmo = 3
    this.bossRainActive = false
    this.bossHudVisible = false
    this.bossHudCommitted = false
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
    this.playerBar = new HealthBar(this, 54, combatConfig.playerHealth, '玩家', 0xa0e6da)
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
      if (hostile.hp > 0) this.takeDamage('player', hostile.sprite.x)
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
      this.recycleBullet(shot)
      enemy.takeDamage(combatConfig.enemyDamage)
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
      this.recycleBullet(shot)
      this.takeDamage('player', sourceX)
    })
    this.physics.add.overlap(this.bus, this.enemyProjectiles, (_bus, projectile) => {
      const shot = projectile as Phaser.Physics.Arcade.Sprite
      if (!shot.active || this.gameEnded) return
      this.recycleBullet(shot)
      this.takeDamage('bus', shot.getData('sourceX') as number)
    })
    this.physics.add.overlap(this.allyGroup, this.enemyProjectiles, (target, projectile) => {
      const shot = projectile as Phaser.Physics.Arcade.Sprite
      const ally = (target as Phaser.Physics.Arcade.Sprite).getData('ally') as AllyUnit
      if (!shot.active || ally.hp <= 0 || this.gameEnded) return
      this.recycleBullet(shot)
      ally.takeDamage(combatConfig.enemyDamage)
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
      if (animation.key === avatarActions.GunFire.key || animation.key === avatarActions.GunRunFire.key) {
        this.firing = false
        if (this.playerAmmo === 0 && !this.hurt) this.startReload()
      }
      if (animation.key === avatarActions.GunReload.key) {
        this.reloading = false
        this.playerAmmo = 3
      }
      if (animation.key === avatarActions.Knockback.key) {
        this.hurt = false
        if (this.playerAmmo === 0) this.startReload()
      }
    })
    this.input.on('pointerdown', this.onPointerDown, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointerdown', this.onPointerDown, this)
    })
    this.playAction('Idle')
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.keys = this.input.keyboard!.addKeys('A,D,W,R') as typeof this.keys
    this.input.keyboard!.addCapture(['SPACE', 'UP', 'DOWN', 'LEFT', 'RIGHT'])
    const camera = this.cameras.main
    camera.setBounds(0, 0, WORLD_WIDTH, 540)
    camera.startFollow(this.player, true, 0.09, 1)
    camera.setDeadzone(140, 540)
    this.createHud()
    this.spawnWave()
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
    const hud = this.add.container(0, 0).setScrollFactor(0).setDepth(100)
    const text = (x: number, y: number, value: string, size: number, color: string) =>
      this.add.text(x, y, value, { fontFamily, fontSize: `${size}px`, color })
    hud.add(this.add.rectangle(480, 42, 960, 84, 0x090f20, 0.93))
    hud.add(this.add.rectangle(26, 29, 5, 25, 0xa0e6da))
    hud.add(text(42, 15, '夜行 / 守護巴士', 22, '#eef6ff'))
    hud.add(text(42, 47, 'PROTOTYPE 01     ·     阻止敵人摧毀巴士', 11, '#8ca3bc'))
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
    this.healthText = text(925, 21, '', 15, '#a0e6da').setOrigin(1, 0)
    hud.add(this.healthText)
    hud.add(text(925, 48, '敵軍紅／金 · 友軍灰 · 雙方近戰與遠攻', 11, '#8ca3bc').setOrigin(1, 0))
    hud.add(this.add.rectangle(480, 521, 960, 38, 0x090f20, 0.95))
    hud.add(text(24, 511, 'A D / ← → 移動    SPACE / W / ↑ 跳躍    ↓ 下落    滑鼠左鍵 射擊    R 重來', 12, '#b0c2d6'))
    this.ammoText = text(705, 511, '', 12, '#a0e6da').setOrigin(1, 0)
    hud.add(this.ammoText)
    this.stateText = text(935, 511, '守住巴士', 12, '#a0e6da').setOrigin(1, 0)
    hud.add(this.stateText)
  }

  private playAction(action: keyof typeof avatarActions): void {
    this.player.play(avatarActions[action].key, true)
  }

  private spawnWave(): void {
    this.enemies = this.enemies.filter(enemy => enemy.sprite.active)
    this.allies = this.allies.filter(ally => ally.sprite.active)
    this.wave += 1
    this.nextWaveAt = this.time.now + combatConfig.waveInterval
    const allyFront = this.allies
      .filter(ally => ally.hp > 0)
      .reduce((front, ally) => Math.max(front, ally.sprite.x), combatConfig.waveCluster.allyCenter)
    this.enemySpawnCenter = Phaser.Math.Clamp(
      Math.max(this.enemySpawnCenter, allyFront + combatConfig.waveCluster.enemyLead),
      combatConfig.waveCluster.enemyCenter,
      WORLD_WIDTH - combatConfig.waveCluster.edgePadding,
    )
    for (const { kind, x } of this.createWaveCluster(this.enemySpawnCenter)) {
      const enemy = new Enemy(this, x, GROUND_Y, kind)
      this.enemies.push(enemy)
      this.enemyGroup.add(enemy.sprite)
    }
    for (const { kind, x } of this.createWaveCluster(combatConfig.waveCluster.allyCenter)) {
      const ally = new AllyUnit(this, x, GROUND_Y, kind)
      this.allies.push(ally)
      this.allyGroup.add(ally.sprite)
    }
    this.stateText.setText(`第 ${this.wave} 波來襲 · 下一波 ${combatConfig.waveInterval / 1000} 秒`)
  }

  private createWaveCluster(centerX: number): { kind: EnemyKind; x: number }[] {
    const kinds: EnemyKind[] = ['melee', 'melee', 'melee', 'melee', 'melee', 'ranged', 'ranged', 'ranged']
    Phaser.Utils.Array.Shuffle(kinds)
    const middle = (kinds.length - 1) / 2
    return kinds.map((kind, index) => ({
      kind,
      x: centerX + (index - middle) * combatConfig.waveCluster.spacing
        + Phaser.Math.Between(-combatConfig.waveCluster.jitter, combatConfig.waveCluster.jitter),
    }))
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (pointer.button === 0) this.fire()
  }

  private fire(): void {
    // Let the complete shot animation finish before accepting the next click.
    if (this.firing || this.reloading || this.hurt || this.gameEnded) return
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
    bullet.stop().disableBody(true, true)
  }

  private launchEnemyProjectile(enemy: Enemy, target: Bounds): void {
    if (this.gameEnded || enemy.hp <= 0) return
    const x = enemy.sprite.x - 42
    const y = enemy.sprite.y - 42
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
    const x = ally.sprite.x + 42
    const y = ally.sprite.y - 42
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
    shot.setData('expiresAt', this.time.now + combatConfig.projectileLifetime)
  }

  private damageEnemyTarget(target: EnemyTarget, sourceX: number): void {
    if (typeof target === 'string') this.takeDamage(target, sourceX)
    else target.takeDamage(combatConfig.enemyDamage)
  }

  private takeDamage(target: 'player' | 'bus', sourceX: number,
    amount = target === 'player' ? combatConfig.enemyDamage : combatConfig.busDamage): void {
    if (this.gameEnded) return
    if (target === 'player') {
      if (this.time.now < this.invulnerableUntil) return
      this.playerHp = Math.max(0, this.playerHp - amount)
      this.hitStartedAt = this.time.now
      this.invulnerableUntil = this.time.now + combatConfig.playerInvulnerability
      this.hurt = true
      this.firing = false
      this.reloading = false
      this.lastGrounded = -Infinity
      this.jumpQueued = -Infinity
      this.jumpReleased = true
      const direction = this.player.x <= sourceX ? -1 : 1
      this.player.setFlipX(direction > 0).setAlpha(1)
        .setVelocity(direction * combatConfig.playerKnockbackSpeed, -combatConfig.playerKnockbackLift)
      this.player.setTintFill(0xf47b86)
      this.player.play(avatarActions.Knockback.key)
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
    this.playerBar.update(this.player.x, this.player.y - 79, this.playerHp)
    this.busBar.update(this.bus.x, this.bus.y - this.bus.displayHeight - 17, this.busHp)
    const melee = this.enemies.filter(enemy => enemy.hp > 0 && enemy.kind === 'melee').length
    const ranged = this.enemies.filter(enemy => enemy.hp > 0 && enemy.kind === 'ranged').length
    this.healthText.setText(`玩家 ${this.playerHp} / ${combatConfig.playerHealth}    巴士 ${this.busHp} / ${combatConfig.busHealth}    近戰 ${melee} · 遠攻 ${ranged}`)
    this.ammoText.setColor(this.reloading ? '#ffc477' : '#a0e6da')
      .setText(this.reloading ? '換彈中…' : `彈藥 ${this.playerAmmo} / 3`)
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

  update(time: number): void {
    if (!this.player) return
    if (Phaser.Input.Keyboard.JustDown(this.keys.R)) {
      this.scene.restart()
      return
    }
    this.updateHealthDisplay()
    this.updateBossHud()
    this.updateMinimap()
    if (this.gameEnded) return
    const invulnerable = time < this.invulnerableUntil
    this.player.setAlpha(invulnerable && Math.floor((time - this.hitStartedAt) / combatConfig.playerBlinkInterval) % 2 === 1 ? 0.25 : 1)
    if (!invulnerable || time - this.hitStartedAt >= 100) this.player.clearTint()
    if (this.player.y > 590) {
      this.playerHp = 0
      this.endEncounter('玩家已倒下')
      return
    }
    const body = this.player.body as Phaser.Physics.Arcade.Body
    let grounded = body.blocked.down || body.touching.down
    if (grounded && !this.hurt) this.lastGrounded = time
    const left = this.cursors.left.isDown || this.keys.A.isDown
    const right = this.cursors.right.isDown || this.keys.D.isDown
    const direction = Number(right) - Number(left)
    if (!this.hurt) {
      this.player.setVelocityX(direction * SPEED)
      if (direction) this.player.setFlipX(direction < 0)
    }
    if (!this.hurt && grounded && this.player.y < GROUND_Y - 8
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
    if (!this.hurt && jumpEdges.some(Boolean)) this.jumpQueued = time
    const jumpHeld = this.cursors.space.isDown || this.cursors.up.isDown || this.keys.W.isDown
    if (!this.hurt && time - this.jumpQueued <= JUMP_BUFFER_MS && time - this.lastGrounded <= COYOTE_MS) {
      this.player.setVelocityY(-JUMP_SPEED)
      this.lastGrounded = -Infinity
      this.jumpQueued = -Infinity
      this.jumpReleased = false
    }
    // Releasing early produces a shorter jump.
    if (!this.hurt && !jumpHeld && !this.jumpReleased && body.velocity.y < -240) {
      this.player.setVelocityY(-240)
      this.jumpReleased = true
    }
    // Shooting owns the animation temporarily, while movement physics continue.
    if (!this.firing && !this.reloading && !this.hurt) {
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
        target => this.damageEnemyTarget(target, enemy.sprite.x),
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
      if (time >= this.nextWaveAt) this.spawnWave()
      const seconds = Math.max(0, Math.ceil((this.nextWaveAt - time) / 1000))
      const allyMelee = this.allies.filter(ally => ally.hp > 0 && ally.kind === 'melee').length
      const allyRanged = this.allies.filter(ally => ally.hp > 0 && ally.kind === 'ranged').length
      this.stateText.setText(`第 ${this.wave} 波 · 友軍 ${allyMelee}/${allyRanged} · 下一波 ${seconds} 秒`)
    }
    this.updateHealthDisplay()
  }
}

new Phaser.Game({
  type: Phaser.AUTO, parent: 'game-container', width: 960, height: 540,
  backgroundColor: '#070b19', pixelArt: true, roundPixels: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 1400 }, debug: false } },
  scene: PrototypeScene,
})
