import Phaser from 'phaser'
import { avatarActions, backgrounds, bulletAction, busTexture, enemyProjectileAction, loadAssets, registerAnimations } from './assets'
import { ballisticVelocity, combatConfig, Enemy, HealthBar, type Bounds } from './combat'
import './style.css'

const WORLD_WIDTH = 3840
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
  private lastGrounded = -Infinity
  private jumpQueued = -Infinity
  private jumpReleased = false
  private dropThroughUntil = 0
  private bus!: Phaser.GameObjects.Image
  private enemies: Enemy[] = []
  private enemyGroup!: Phaser.Physics.Arcade.Group
  private wave = 0
  private nextWaveAt: number | null = null
  private playerHp = combatConfig.playerHealth
  private busHp = combatConfig.busHealth
  private playerBar!: HealthBar
  private busBar!: HealthBar
  private invulnerableUntil = 0
  private hurt = false
  private hitStartedAt = 0
  private gameEnded = false
  private bullets!: Phaser.Physics.Arcade.Group
  private enemyProjectiles!: Phaser.Physics.Arcade.Group
  private firing = false

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
    this.enemies = []
    this.wave = 0
    this.nextWaveAt = null
    this.physics.resume()
    this.firing = false
    registerAnimations(this)
    for (const [index, background] of backgrounds.entries()) {
      const sprite = this.add.tileSprite(0, 0, 960, 548, background.key)
        .setOrigin(0).setScrollFactor(0).setDepth(-20 + index)
      this.layers.push({ sprite, speed: background.speed })
    }
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, 620)
    const groundSolids = this.physics.add.staticGroup()
    const oneWayPlatforms = this.physics.add.staticGroup()
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
    for (const [x, y, width] of [
      [590, 394, 180], [855, 314, 150], [1110, 394, 180],
      [1640, 390, 200], [1900, 310, 150], [2160, 250, 180],
      [2450, 330, 200], [2900, 394, 180], [3180, 314, 180],
    ]) addPlatform(oneWayPlatforms, x, y - 30, width, 28)
    this.createLandmarks()
    this.player = this.physics.add.sprite(START_X, GROUND_Y, avatarActions.Idle.frames[0])
      .setOrigin(0.5, 1).setScale(1.6).setDepth(5).setCollideWorldBounds(true)
    // Inspected frames are 96 x 84 with transparent padding above the character.
    this.player.setSize(16, 38).setOffset(40, 46)
    this.player.setMaxVelocity(SPEED, 900)
    this.physics.add.collider(this.player, groundSolids)
    this.physics.add.collider(this.player, oneWayPlatforms, undefined, (_player, platform) => {
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
    this.enemyGroup = this.physics.add.group()
    // Enemies use the ground lane. Raised platforms leave headroom and are only
    // used by the player; enemies never jump, turn around, or pursue upward.
    this.physics.add.collider(this.enemyGroup, ground)
    // Body contact uses the same damage gate as melee, including contact from
    // behind. This does not change the enemy's forward-only attack targeting.
    this.physics.add.overlap(this.player, this.enemyGroup, (_player, target) => {
      const enemy = (target as Phaser.Physics.Arcade.Sprite).getData('enemy') as Enemy
      if (enemy.hp > 0) this.takeDamage('player', enemy.sprite.x)
    })
    this.bullets = this.physics.add.group({ allowGravity: false, maxSize: 24 })
    const recyclePlayerBullet: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = projectile => {
      this.recycleBullet(projectile as Phaser.Physics.Arcade.Sprite)
    }
    this.physics.add.overlap(this.bullets, groundSolids, recyclePlayerBullet)
    this.physics.add.overlap(this.bullets, oneWayPlatforms, recyclePlayerBullet)
    this.physics.add.overlap(this.bullets, this.enemyGroup, (projectile, target) => {
      const bullet = projectile as Phaser.Physics.Arcade.Sprite
      const enemy = (target as Phaser.Physics.Arcade.Sprite).getData('enemy') as Enemy
      if (!bullet.active || enemy.hp <= 0 || this.gameEnded) return
      this.recycleBullet(bullet)
      enemy.takeDamage(combatConfig.bulletDamage)
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
    this.player.on(Phaser.Animations.Events.ANIMATION_COMPLETE, (animation: Phaser.Animations.Animation) => {
      if (animation.key === avatarActions.GunFire.key || animation.key === avatarActions.GunRunFire.key) {
        this.firing = false
      }
      if (animation.key === avatarActions.Knockback.key) this.hurt = false
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

  private createLandmarks(): void {
    const label = (x: number, text: string, color = '#91a5be') => {
      this.add.text(x, 483, text, { fontFamily, fontSize: '12px', color, letterSpacing: 2 })
    }
    label(64, '01 / 巴士據點', '#a0e6da')
    label(1330, '02 / 高台區')
    label(2690, '03 / 最後一段')
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
    this.healthText = text(925, 21, '', 15, '#a0e6da').setOrigin(1, 0)
    hud.add(this.healthText)
    hud.add(text(925, 48, '紅色近戰 · 金色遠攻 · 留意蓄力與拋物線', 11, '#8ca3bc').setOrigin(1, 0))
    hud.add(this.add.rectangle(480, 521, 960, 38, 0x090f20, 0.95))
    hud.add(text(24, 511, 'A D / ← → 移動    SPACE / W / ↑ 跳躍    ↓ 下落    滑鼠左鍵 射擊    R 重來', 12, '#b0c2d6'))
    this.stateText = text(935, 511, '守住巴士', 12, '#a0e6da').setOrigin(1, 0)
    hud.add(this.stateText)
  }

  private playAction(action: keyof typeof avatarActions): void {
    this.player.play(avatarActions[action].key, true)
  }

  private spawnWave(): void {
    this.enemies = this.enemies.filter(enemy => enemy.sprite.active)
    this.wave += 1
    this.nextWaveAt = this.time.now + combatConfig.waveInterval
    for (const [kind, spawnXs] of [
      ['melee', combatConfig.waveSpawns.melee],
      ['ranged', combatConfig.waveSpawns.ranged],
    ] as const) {
      for (const x of spawnXs) {
        const enemy = new Enemy(this, x, GROUND_Y, kind)
        this.enemies.push(enemy)
        this.enemyGroup.add(enemy.sprite)
      }
    }
    this.stateText.setText(`第 ${this.wave} 波來襲 · 下一波 ${combatConfig.waveInterval / 1000} 秒`)
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (pointer.button === 0) this.fire()
  }

  private fire(): void {
    // Let the complete shot animation finish before accepting the next click.
    if (this.firing || this.hurt || this.gameEnded) return
    const direction = this.player.flipX ? -1 : 1
    const x = this.player.x + direction * 32
    const y = this.player.y - 40
    const bullet = this.bullets.get(x, y, bulletAction.frames[0], 'projectile') as
      Phaser.Physics.Arcade.Sprite | null
    if (!bullet) return
    bullet.setTexture(bulletAction.frames[0], 'projectile')
      .setOrigin(0.5).setScale(2).setDepth(6).setFlipX(direction < 0)
    bullet.enableBody(true, x, y, true, true)
    bullet.setSize(9, 2).setOffset(0, 0)
    const bulletBody = bullet.body as Phaser.Physics.Arcade.Body
    bulletBody.setAllowGravity(false)
    bullet.setVelocity(direction * BULLET_SPEED, 0)
    bullet.setData('expiresAt', this.time.now + BULLET_LIFETIME_MS)
    bullet.play(bulletAction.key)
    const body = this.player.body as Phaser.Physics.Arcade.Body
    const running = (body.blocked.down || body.touching.down) && Math.abs(body.velocity.x) > 0
    this.firing = true
    this.playAction(running ? 'GunRunFire' : 'GunFire')
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

  private takeDamage(target: 'player' | 'bus', sourceX: number): void {
    if (this.gameEnded) return
    if (target === 'player') {
      if (this.time.now < this.invulnerableUntil) return
      this.playerHp = Math.max(0, this.playerHp - combatConfig.enemyDamage)
      this.hitStartedAt = this.time.now
      this.invulnerableUntil = this.time.now + combatConfig.playerInvulnerability
      this.hurt = true
      this.firing = false
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
      this.busHp = Math.max(0, this.busHp - combatConfig.busDamage)
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
    for (const enemy of this.enemies) if (enemy.hp > 0) enemy.sprite.setVelocity(0).stop()
    for (const bullet of this.bullets.getChildren()) this.recycleBullet(bullet as Phaser.Physics.Arcade.Sprite)
    for (const shot of this.enemyProjectiles.getChildren()) this.recycleBullet(shot as Phaser.Physics.Arcade.Sprite)
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
  }

  update(time: number): void {
    if (!this.player) return
    if (Phaser.Input.Keyboard.JustDown(this.keys.R)) {
      this.scene.restart()
      return
    }
    this.updateHealthDisplay()
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
    if (!this.firing && !this.hurt) {
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
    for (const child of this.enemyProjectiles.getChildren()) {
      const shot = child as Phaser.Physics.Arcade.Sprite
      if (!shot.active) continue
      if (time >= shot.getData('expiresAt') || shot.x < -60 || shot.x > WORLD_WIDTH + 60 || shot.y > 620 || shot.y < -600) {
        this.recycleBullet(shot)
      } else {
        const velocity = (shot.body as Phaser.Physics.Arcade.Body).velocity
        shot.setRotation(Math.atan2(velocity.y, velocity.x))
      }
    }
    for (const enemy of this.enemies) {
      enemy.update(time, body, this.bus.getBounds(), target => this.takeDamage(target, enemy.sprite.x),
        (attacker, target) => this.launchEnemyProjectile(attacker, target))
      if (this.gameEnded) break
    }
    this.enemies = this.enemies.filter(enemy => enemy.hp > 0 || enemy.sprite.active)
    if (this.nextWaveAt !== null) {
      if (time >= this.nextWaveAt) this.spawnWave()
      const seconds = Math.max(0, Math.ceil((this.nextWaveAt - time) / 1000))
      this.stateText.setText(`第 ${this.wave} 波 · 下一波 ${seconds} 秒`)
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
