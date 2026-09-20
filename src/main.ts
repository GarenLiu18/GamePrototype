import Phaser from 'phaser'
import { avatarActions, backgrounds, bulletAction, loadAssets, registerAnimations } from './assets'
import './style.css'

const WORLD_WIDTH = 3840
const GROUND_Y = 470
const START_X = 120
const SPEED = 270
const JUMP_SPEED = 600
const COYOTE_MS = 100
const JUMP_BUFFER_MS = 120
const BULLET_SPEED = 760
const BULLET_LIFETIME_MS = 1400
const fontFamily = '"Segoe UI", "Microsoft JhengHei", sans-serif'

class PrototypeScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private keys!: Record<'A' | 'D' | 'W' | 'R', Phaser.Input.Keyboard.Key>
  private layers: { sprite: Phaser.GameObjects.TileSprite; speed: number }[] = []
  private progressFill!: Phaser.GameObjects.Rectangle
  private progressText!: Phaser.GameObjects.Text
  private stateText!: Phaser.GameObjects.Text
  private lastGrounded = -Infinity
  private jumpQueued = -Infinity
  private jumpReleased = false
  private reachedEnd = false
  private bullets!: Phaser.Physics.Arcade.Group
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
    this.reachedEnd = false
    this.firing = false
    registerAnimations(this)
    for (const [index, background] of backgrounds.entries()) {
      const sprite = this.add.tileSprite(0, 0, 960, 548, background.key)
        .setOrigin(0).setScrollFactor(0).setDepth(-20 + index)
      this.layers.push({ sprite, speed: background.speed })
    }
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, 620)
    const solids = this.physics.add.staticGroup()
    const addPlatform = (x: number, top: number, width: number, height: number) => {
      const surface = this.add.rectangle(x, top + height / 2, width, height, 0x151f31)
      solids.add(surface)
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
    }
    addPlatform(WORLD_WIDTH / 2, GROUND_Y, WORLD_WIDTH, 150)
    for (const [x, y, width] of [
      [590, 394, 180], [855, 314, 150], [1110, 394, 180],
      [1640, 390, 200], [1900, 310, 150], [2160, 250, 180],
      [2450, 330, 200], [2900, 394, 180], [3180, 314, 180],
    ]) addPlatform(x, y, width, 28)
    this.createLandmarks()
    this.player = this.physics.add.sprite(START_X, GROUND_Y, avatarActions.Idle.frames[0])
      .setOrigin(0.5, 1).setScale(1.6).setDepth(5).setCollideWorldBounds(true)
    // Inspected frames are 96 x 84 with transparent padding above the character.
    this.player.setSize(16, 38).setOffset(40, 46)
    this.player.setMaxVelocity(SPEED, 900)
    this.physics.add.collider(this.player, solids)
    this.bullets = this.physics.add.group({ allowGravity: false, maxSize: 24 })
    this.physics.add.overlap(this.bullets, solids, projectile => {
      this.recycleBullet(projectile as Phaser.Physics.Arcade.Sprite)
    })
    this.player.on(Phaser.Animations.Events.ANIMATION_COMPLETE, (animation: Phaser.Animations.Animation) => {
      if (animation.key === avatarActions.GunFire.key || animation.key === avatarActions.GunRunFire.key) {
        this.firing = false
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
  }

  private createLandmarks(): void {
    const label = (x: number, text: string, color = '#91a5be') => {
      this.add.text(x, 483, text, { fontFamily, fontSize: '12px', color, letterSpacing: 2 })
    }
    label(64, '01 / 起點', '#a0e6da')
    label(1330, '02 / 高台區')
    label(2690, '03 / 最後一段')
    this.add.text(330, 430, '跳上平台  ↗', { fontFamily, fontSize: '13px', color: '#afc2d7' })
    this.add.text(1420, 430, '試試連續跳躍  →', { fontFamily, fontSize: '13px', color: '#afc2d7' })
    for (let x = 240; x < WORLD_WIDTH; x += 160) this.add.rectangle(x, 489, 34, 2, 0x435167)
    const finishX = WORLD_WIDTH - 170
    this.add.rectangle(finishX, 420, 3, 100, 0xa0e6da)
    this.add.rectangle(finishX + 27, 381, 50, 24, 0xa0e6da)
    this.add.text(finishX + 9, 373, '終點', {
      fontFamily, fontSize: '13px', color: '#152536', fontStyle: 'bold',
    })
  }

  private createHud(): void {
    const hud = this.add.container(0, 0).setScrollFactor(0).setDepth(100)
    const text = (x: number, y: number, value: string, size: number, color: string) =>
      this.add.text(x, y, value, { fontFamily, fontSize: `${size}px`, color })
    hud.add(this.add.rectangle(480, 42, 960, 84, 0x090f20, 0.93))
    hud.add(this.add.rectangle(26, 29, 5, 25, 0xa0e6da))
    hud.add(text(42, 15, '夜行 / 城市漫遊', 22, '#eef6ff'))
    hud.add(text(42, 47, 'PROTOTYPE 01     ·     移動 / 跳躍 / 射擊', 11, '#8ca3bc'))
    hud.add(text(709, 19, '探索進度', 11, '#8ca3bc'))
    this.progressText = text(925, 16, '0%', 16, '#a0e6da').setOrigin(1, 0)
    hud.add(this.progressText)
    hud.add(this.add.rectangle(709, 46, 216, 3, 0x304057).setOrigin(0))
    this.progressFill = this.add.rectangle(709, 46, 0, 3, 0xa0e6da).setOrigin(0)
    hud.add(this.progressFill)
    hud.add(this.add.rectangle(480, 521, 960, 38, 0x090f20, 0.95))
    hud.add(text(24, 511, 'A D / ← → 移動    SPACE / W / ↑ 跳躍    滑鼠左鍵 射擊    R 重來', 12, '#b0c2d6'))
    this.stateText = text(935, 511, '向右探索 →', 12, '#a0e6da').setOrigin(1, 0)
    hud.add(this.stateText)
  }

  private playAction(action: keyof typeof avatarActions): void {
    this.player.play(avatarActions[action].key, true)
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (pointer.button === 0) this.fire()
  }

  private fire(): void {
    // Let the complete shot animation finish before accepting the next click.
    if (this.firing) return
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

  private resetPlayer(): void {
    this.firing = false
    for (const child of this.bullets.getChildren()) {
      this.recycleBullet(child as Phaser.Physics.Arcade.Sprite)
    }
    this.player.setPosition(START_X, GROUND_Y - 2).setVelocity(0, 0).setFlipX(false)
    this.lastGrounded = -Infinity
    this.jumpQueued = -Infinity
    this.reachedEnd = false
    this.cameras.main.scrollX = 0
    this.playAction('Idle')
  }

  update(time: number): void {
    if (!this.player) return
    if (Phaser.Input.Keyboard.JustDown(this.keys.R) || this.player.y > 590) this.resetPlayer()
    const body = this.player.body as Phaser.Physics.Arcade.Body
    const grounded = body.blocked.down || body.touching.down
    if (grounded) this.lastGrounded = time
    const left = this.cursors.left.isDown || this.keys.A.isDown
    const right = this.cursors.right.isDown || this.keys.D.isDown
    const direction = Number(right) - Number(left)
    this.player.setVelocityX(direction * SPEED)
    if (direction) this.player.setFlipX(direction < 0)
    // Read every edge, including simultaneous keys, to avoid stale jump requests.
    const jumpEdges = [this.cursors.space, this.cursors.up, this.keys.W]
      .map(key => Phaser.Input.Keyboard.JustDown(key))
    if (jumpEdges.some(Boolean)) this.jumpQueued = time
    const jumpHeld = this.cursors.space.isDown || this.cursors.up.isDown || this.keys.W.isDown
    if (time - this.jumpQueued <= JUMP_BUFFER_MS && time - this.lastGrounded <= COYOTE_MS) {
      this.player.setVelocityY(-JUMP_SPEED)
      this.lastGrounded = -Infinity
      this.jumpQueued = -Infinity
      this.jumpReleased = false
    }
    // Releasing early produces a shorter jump.
    if (!jumpHeld && !this.jumpReleased && body.velocity.y < -240) {
      this.player.setVelocityY(-240)
      this.jumpReleased = true
    }
    // Shooting owns the animation temporarily, while movement physics continue.
    if (!this.firing) {
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
    if (this.player.x >= WORLD_WIDTH - 180) this.reachedEnd = true
    const progress = Phaser.Math.Clamp((this.player.x - START_X) / (WORLD_WIDTH - 180 - START_X), 0, 1)
    this.progressFill.width = 216 * progress
    this.progressText.setText(`${Math.round(progress * 100)}%`)
    this.stateText.setText(this.reachedEnd ? '已抵達終點！ R 再試一次' : '向右探索 →')
  }
}

new Phaser.Game({
  type: Phaser.AUTO, parent: 'game-container', width: 960, height: 540,
  backgroundColor: '#070b19', pixelArt: true, roundPixels: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 1400 }, debug: false } },
  scene: PrototypeScene,
})
